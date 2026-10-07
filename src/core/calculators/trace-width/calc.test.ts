import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 2: legacy IPC-2221 trace width / current / temperature rise (Mode B). TESTS FIRST.
// Every expected number comes from the independent oracle (tools/reference/ref_calcs.py: ipc2221_width_mil,
// ipc2221_current_A, ipc2221_dT_C, mirrored in docs/golden-vectors.json) or from the ledger formula S-001 written out
// again below. The implementation is never consulted. Nothing here verifies S-001 (PAYWALLED-USER-MUST-VERIFY),
// S-010 or S-003: tests compare the implementation with the formula, not the formula with the standard.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
}
const goldenFiles = import.meta.glob('../../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const goldenText = Object.values(goldenFiles)[0];
const vectors: GoldenVector[] = goldenText === undefined ? [] : (JSON.parse(goldenText) as { vectors: GoldenVector[] }).vectors;
const vec = (name: string): GoldenVector => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found (${String(vectors.length)} vectors loaded)`);
  return v;
};

type Layer = 'outer' | 'inner';
const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mil = (n: number): Quantity => fromUnit(n, 'mil');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

// Ledger S-001 constants and S-006 (1 mil = 25.4 um), restated here for the property tests.
const K: Record<Layer, number> = { outer: 0.048, inner: 0.024 };
const B_DT = 0.44;
const C_AREA = 0.725;
const UM_PER_OZ = 35; // S-003 chosen convention (default nominal-35um)
const refWidthMil = (I: number, d: number, layer: Layer, tUm: number): number => (I / (K[layer] * d ** B_DT)) ** (1 / C_AREA) / (tUm / 25.4);
const refCurrentA = (wMil: number, d: number, layer: Layer, tUm: number): number => K[layer] * d ** B_DT * (wMil * (tUm / 25.4)) ** C_AREA;

const g = (x: number): string => String(x); // matches Python's format(x, 'g') for the clean values used here
const widthName = (l: Layer, I: number, d: number, o: number): string => `ipc2221_width_mil_${l}_${g(I)}A_dT${g(d)}C_${g(o)}oz`;
const currentName = (l: Layer, w: number, d: number, o: number): string => `ipc2221_current_A_${l}_w${g(w)}mil_dT${g(d)}C_${g(o)}oz`;
const dTName = (l: Layer, I: number, w: number, o: number): string => `ipc2221_dT_C_${l}_${g(I)}A_w${g(w)}mil_${g(o)}oz`;

function ok(inputs: Inputs): CalcResult {
  const out = compute(inputs);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code} ${out.error.field ?? ''}: ${out.error.message}`);
  const chk = assertCalcResult(out.value);
  expect(chk.ok, chk.ok ? '' : chk.error.join('; ')).toBe(true);
  return out.value;
}
const res = (r: CalcResult, name: string) => {
  const x = r.results.find((o) => o.name === name);
  if (!x) throw new Error(`result "${name}" missing; have ${r.results.map((o) => o.name).join(', ')}`);
  return x;
};

// Input builders for the three solve directions (exactly two of width/current/deltaT, plus copper by weight).
const solveWidth = (l: Layer, I: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), deltaT: dT(d), copperWeight: oz(o) });
const solveCurrent = (l: Layer, w: number, d: number, o: number): Inputs => ({ mode: 'B', layer: l, width: mil(w), deltaT: dT(d), copperWeight: oz(o) });
const solveDT = (l: Layer, I: number, w: number, o: number): Inputs => ({ mode: 'B', layer: l, current: amp(I), width: mil(w), copperWeight: oz(o) });

// Case tables mirror tools/reference/ref_calcs.py (names are built from the inputs, so a mismatch fails loudly).
// [layer, current A, deltaT C, oz]
const WIDTH_CASES: [Layer, number, number, number][] = [
  ['outer', 1, 10, 0.5],
  ['outer', 1, 10, 2],
  ['outer', 1, 10, 3],
  ['inner', 3, 10, 1],
  ['outer', 10, 30, 2],
  ['outer', 20, 50, 3],
  ['inner', 5, 20, 0.5],
  ['inner', 2, 20, 2],
  ['outer', 35, 100, 3],
  ['outer', 0.5, 10, 1],
];
// [layer, width mil, deltaT C, oz]
const CURRENT_CASES: [Layer, number, number, number][] = [
  ['outer', 20, 10, 1],
  ['outer', 50, 30, 2],
  ['outer', 100, 50, 3],
  ['inner', 30, 20, 0.5],
  ['inner', 200, 40, 2],
  ['outer', 10, 10, 0.5],
  ['outer', 400, 100, 3],
  ['inner', 12, 10, 1],
];
// [layer, current A, width mil, oz]
const DT_CASES: [Layer, number, number, number][] = [
  ['outer', 1, 12, 1],
  ['outer', 3, 40, 1],
  ['outer', 10, 150, 2],
  ['inner', 5, 60, 1],
  ['outer', 2, 20, 0.5],
  ['inner', 8, 100, 2],
];
// The three older vectors (35 um, 1 oz) keep their original names.
const LEGACY_NAMES: [string, Layer, number, number][] = [
  ['ipc2221_ext_1A_dT10_width_mil', 'outer', 1, 10],
  ['ipc2221_ext_3A_dT10_width_mil', 'outer', 3, 10],
  ['ipc2221_int_1A_dT10_width_mil', 'inner', 1, 10],
];
const TOL = 1e-9;

describe('golden vectors (oracle): solve width', () => {
  it('vectors loaded', () => {
    expect(vectors.filter((v) => v.name.startsWith('ipc2221_')).length).toBe(3 + WIDTH_CASES.length + CURRENT_CASES.length + DT_CASES.length);
  });
  for (const [name, l, I, d] of LEGACY_NAMES) {
    it(`${name}`, () => {
      const v = vec(name);
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-001', 'S-003']));
      const r = ok(solveWidth(l, I, d, 1));
      expect(relErr(toUnit(res(r, 'width').value, 'mil'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
  for (const [l, I, d, o] of WIDTH_CASES) {
    it(`${l} ${g(I)} A, dT ${g(d)} C, ${g(o)} oz`, () => {
      const v = vec(widthName(l, I, d, o));
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-001', 'S-003', 'S-006']));
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
      const r = ok(solveWidth(l, I, d, o));
      const w = res(r, 'width');
      expect(sameDim(w.value, q(1, DIM.LENGTH))).toBe(true);
      expect(relErr(toUnit(w.value, 'mil'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(w.role).toBe('primary');
      expect(w.bound).toBe('min-requirement');
      // The same copper entered as a thickness (35 um per oz) gives the same width.
      const t = ok({ mode: 'B', layer: l, current: amp(I), deltaT: dT(d), copperThickness: um(UM_PER_OZ * o), copperBasis: 'finished' });
      expect(relErr(toUnit(res(t, 'width').value, 'mil'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
    });
  }
});

describe('golden vectors (oracle): solve current capacity', () => {
  for (const [l, w, d, o] of CURRENT_CASES) {
    it(`${l} ${g(w)} mil, dT ${g(d)} C, ${g(o)} oz`, () => {
      const v = vec(currentName(l, w, d, o));
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-001', 'S-003', 'S-006']));
      const r = ok(solveCurrent(l, w, d, o));
      const c = res(r, 'current capacity');
      expect(sameDim(c.value, q(1, DIM.CURRENT))).toBe(true);
      expect(relErr(toUnit(c.value, 'A'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(c.role).toBe('primary');
      expect(c.bound).toBe('max-capacity');
    });
  }
});

describe('golden vectors (oracle): solve temperature rise', () => {
  for (const [l, I, w, o] of DT_CASES) {
    it(`${l} ${g(I)} A, ${g(w)} mil, ${g(o)} oz`, () => {
      const v = vec(dTName(l, I, w, o));
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-001', 'S-003', 'S-006']));
      const r = ok(solveDT(l, I, w, o));
      const t = res(r, 'temperature rise');
      expect(sameDim(t.value, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
      expect(relErr(toUnit(t.value, 'ddegC'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(t.role).toBe('primary');
      expect(t.bound).toBe('prediction');
    });
  }
});

describe('KiCad-default sanity (1 A, dT 10 C, 35 um); compared with the oracle, not with KiCad', () => {
  const inputs = (l: Layer): Inputs => ({ mode: 'B', layer: l, current: amp(1), deltaT: dT(10), copperThickness: um(35), copperBasis: 'nominal' });
  it('outer: 0.3004 mm, equal to the oracle vector at 1e-9', () => {
    const w = res(ok(inputs('outer')), 'width').value;
    expect(relErr(toUnit(w, 'mm'), vec('ipc2221_ext_1A_dT10_width_mil').pinned_expected * 0.0254)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(toUnit(w, 'mm') - 0.3004)).toBeLessThan(5e-4);
  });
  it('inner: 0.7815 mm, equal to the oracle vector at 1e-9', () => {
    const w = res(ok(inputs('inner')), 'width').value;
    expect(relErr(toUnit(w, 'mm'), vec('ipc2221_int_1A_dT10_width_mil').pinned_expected * 0.0254)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(toUnit(w, 'mm') - 0.7815)).toBeLessThan(5e-4);
  });
});

describe('secondary results (SI arithmetic, S-001 and S-006)', () => {
  it('width solved: area, thickness, current density and conductor temperature follow from the oracle width', () => {
    const v = vec(widthName('outer', 10, 30, 2));
    const r = ok(solveWidth('outer', 10, 30, 2));
    const t = 70e-6; // 2 oz at 35 um/oz
    expect(relErr(res(r, 'copper thickness').value.si, t)).toBeLessThanOrEqual(1e-12);
    expect(res(r, 'copper thickness').bound).toBe('nominal');
    expect(sameDim(res(r, 'copper thickness').value, q(1, DIM.LENGTH))).toBe(true);
    const wM = v.pinned_expected * 25.4e-6;
    const a = res(r, 'cross-section area');
    expect(sameDim(a.value, q(1, DIM.AREA))).toBe(true);
    expect(relErr(a.value.si, wM * t)).toBeLessThanOrEqual(TOL);
    expect(a.bound).toBe('min-requirement');
    const j = res(r, 'current density');
    expect(sameDim(j.value, q(1, DIM.CURRENT_DENSITY))).toBe(true);
    expect(relErr(j.value.si, 10 / (wM * t))).toBeLessThanOrEqual(TOL);
    expect(j.bound).toBe('prediction');
    expect(j.role).toBe('secondary');
  });
  it('maximum conductor temperature = default ambient 25 C + dT, absolute, bound prediction', () => {
    const r = ok(solveWidth('outer', 1, 10, 1));
    const m = res(r, 'maximum conductor temperature');
    expect(sameDim(m.value, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(Math.abs(toUnit(m.value, 'degC') - 35)).toBeLessThan(1e-9);
    expect(m.bound).toBe('prediction');
    expect(m.role).toBe('secondary');
  });
  it('maximum conductor temperature uses a user ambient', () => {
    const r = ok({ ...solveWidth('outer', 1, 30, 1), ambient: fromUnit(40, 'degC') });
    expect(Math.abs(toUnit(res(r, 'maximum conductor temperature').value, 'degC') - 70)).toBeLessThan(1e-9);
  });
  it('current solved: the echoed width, deltaT and the solved current give the same density', () => {
    const v = vec(currentName('outer', 50, 30, 2));
    const r = ok(solveCurrent('outer', 50, 30, 2));
    const wM = 50 * 25.4e-6;
    expect(relErr(res(r, 'current density').value.si, v.pinned_expected / (wM * 70e-6))).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, 'cross-section area').value.si, wM * 70e-6)).toBeLessThanOrEqual(1e-12);
  });
  it('the given quantities are echoed with bound nominal, the solved one is primary', () => {
    const r = ok(solveWidth('outer', 3, 10, 1));
    expect(res(r, 'current capacity').bound).toBe('nominal');
    expect(relErr(res(r, 'current capacity').value.si, 3)).toBeLessThanOrEqual(1e-12);
    expect(res(r, 'temperature rise').bound).toBe('nominal');
    expect(relErr(res(r, 'temperature rise').value.si, 10)).toBeLessThanOrEqual(1e-12);
    expect(r.results.filter((o) => o.role === 'primary').map((o) => o.name)).toEqual(['width']);
    const c = ok(solveCurrent('outer', 20, 10, 1));
    expect(res(c, 'width').bound).toBe('nominal');
    expect(relErr(toUnit(res(c, 'width').value, 'mil'), 20)).toBeLessThanOrEqual(1e-12);
    expect(c.results.filter((o) => o.role === 'primary').map((o) => o.name)).toEqual(['current capacity']);
    const d = ok(solveDT('outer', 1, 12, 1));
    expect(res(d, 'width').bound).toBe('nominal');
    expect(res(d, 'current capacity').bound).toBe('nominal');
    expect(d.results.filter((o) => o.role === 'primary').map((o) => o.name)).toEqual(['temperature rise']);
  });
  it('steps are non-empty with finite quantities and include the area computation', () => {
    const r = ok(solveWidth('outer', 1, 10, 1));
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.expr.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
    expect(r.steps.some((s) => /area/i.test(s.label))).toBe(true);
  });
});

describe('properties (fast-check)', () => {
  const layerArb = fc.constantFrom<Layer>('outer', 'inner');
  const iArb = fc.double({ min: 0.1, max: 35, noNaN: true });
  const dArb = fc.double({ min: 10, max: 100, noNaN: true });
  const ozArb = fc.double({ min: 0.5, max: 3, noNaN: true });
  const wArb = fc.double({ min: 5, max: 400, noNaN: true });

  it('matches the S-001 formula for random in-range inputs (1e-9), width solve', () => {
    fc.assert(
      fc.property(layerArb, iArb, dArb, ozArb, (l, I, d, o) => {
        const w = toUnit(res(ok(solveWidth(l, I, d, o)), 'width').value, 'mil');
        expect(relErr(w, refWidthMil(I, d, l, UM_PER_OZ * o))).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('width -> current round trip (1e-9)', () => {
    fc.assert(
      fc.property(layerArb, iArb, dArb, ozArb, (l, I, d, o) => {
        const w = res(ok(solveWidth(l, I, d, o)), 'width').value;
        const back = res(ok({ mode: 'B', layer: l, width: w, deltaT: dT(d), copperWeight: oz(o) }), 'current capacity').value;
        expect(relErr(toUnit(back, 'A'), I)).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('width -> temperature rise round trip (1e-9)', () => {
    fc.assert(
      fc.property(layerArb, iArb, dArb, ozArb, (l, I, d, o) => {
        const w = res(ok(solveWidth(l, I, d, o)), 'width').value;
        const back = res(ok({ mode: 'B', layer: l, width: w, current: amp(I), copperWeight: oz(o) }), 'temperature rise').value;
        expect(relErr(toUnit(back, 'ddegC'), d)).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('current and temperature rise match the S-001 formula for random widths (1e-9)', () => {
    fc.assert(
      fc.property(layerArb, wArb, dArb, ozArb, (l, w, d, o) => {
        const I = toUnit(res(ok(solveCurrent(l, w, d, o)), 'current capacity').value, 'A');
        expect(relErr(I, refCurrentA(w, d, l, UM_PER_OZ * o))).toBeLessThanOrEqual(TOL);
        const back = toUnit(res(ok(solveDT(l, I, w, o)), 'temperature rise').value, 'ddegC');
        expect(relErr(back, d)).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('monotonic: width grows with current, shrinks with more dT and with thicker copper', () => {
    fc.assert(
      fc.property(layerArb, iArb, iArb, dArb, dArb, ozArb, ozArb, (l, i1, i2, d1, d2, o1, o2) => {
        const wid = (I: number, d: number, o: number): number => res(ok(solveWidth(l, I, d, o)), 'width').value.si;
        const [iLo, iHi] = i1 <= i2 ? [i1, i2] : [i2, i1];
        expect(wid(iLo, d1, o1)).toBeLessThanOrEqual(wid(iHi, d1, o1));
        const [dLo, dHi] = d1 <= d2 ? [d1, d2] : [d2, d1];
        expect(wid(i1, dHi, o1)).toBeLessThanOrEqual(wid(i1, dLo, o1));
        const [oLo, oHi] = o1 <= o2 ? [o1, o2] : [o2, o1];
        expect(wid(i1, d1, oHi)).toBeLessThanOrEqual(wid(i1, d1, oLo));
      }),
    );
  });
  it('monotonic: more width or more dT never reduces current capacity; more current raises the temperature rise', () => {
    fc.assert(
      fc.property(layerArb, wArb, wArb, dArb, dArb, ozArb, (l, w1, w2, d1, d2, o) => {
        const cap = (w: number, d: number): number => res(ok(solveCurrent(l, w, d, o)), 'current capacity').value.si;
        const [wLo, wHi] = w1 <= w2 ? [w1, w2] : [w2, w1];
        expect(cap(wLo, d1)).toBeLessThanOrEqual(cap(wHi, d1));
        const [dLo, dHi] = d1 <= d2 ? [d1, d2] : [d2, d1];
        expect(cap(w1, dLo)).toBeLessThanOrEqual(cap(w1, dHi));
        const rise = (I: number): number => res(ok(solveDT(l, I, w1, o)), 'temperature rise').value.si;
        expect(rise(0.5)).toBeLessThanOrEqual(rise(2));
      }),
    );
  });
  it('internal width / external width = 2^(1/0.725) for the same current, dT and copper (1e-9)', () => {
    fc.assert(
      fc.property(iArb, dArb, ozArb, (I, d, o) => {
        const wi = res(ok(solveWidth('inner', I, d, o)), 'width').value.si;
        const wo = res(ok(solveWidth('outer', I, d, o)), 'width').value.si;
        expect(wi).toBeGreaterThan(wo);
        expect(relErr(wi / wo, 2 ** (1 / 0.725))).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; every result passes assertCalcResult', () => {
    fc.assert(
      fc.property(layerArb, iArb, dArb, ozArb, wArb, (l, I, d, o, w) => {
        for (const inp of [solveWidth(l, I, d, o), solveCurrent(l, w, d, o), solveDT(l, I, w, o)]) {
          const r = ok(inp);
          for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
          expect(Number.isFinite(r.confidence.score)).toBe(true);
        }
      }),
    );
  });
  it('deterministic, and inputs are never mutated', () => {
    fc.assert(
      fc.property(layerArb, iArb, dArb, ozArb, (l, I, d, o) => {
        const input = solveWidth(l, I, d, o);
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
      }),
    );
  });
});

describe('performance sanity', () => {
  // SPEC: closed-form calculators take < 1 ms each; 100 us per compute here is 10x tighter and survives coverage instrumentation.
  it('10 000 computes take under 1 s in total', () => {
    const input = solveWidth('outer', 3, 10, 1);
    compute(input); // warm-up
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(1000);
  });
});

describe('meta formula', () => {
  it('meta.formula is non-empty and states the S-001 relation and constants (displayed formula = implemented formula)', () => {
    expect(meta.formula.trim().length).toBeGreaterThan(0);
    for (const s of ['0.44', '0.725', '0.048', '0.024', 'mil']) expect(meta.formula).toContain(s);
  });
});
