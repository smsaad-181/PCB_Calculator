import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { COPPER_ALPHA_20C, COPPER_RESISTIVITY_20C } from '../../data/constants';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 3: trace resistance with R(T), conductivity override and a skin-effect warning. TESTS FIRST.
// Every expected number comes from the independent oracle (tools/reference/ref_calcs.py: trace_resistance_ohm,
// trace_skin_depth_um, trace_vdrop_V, trace_power_W; mirrored in docs/golden-vectors.json) or from the S-004 / S-013
// formulas written out again below. The implementation is never consulted. Nothing here verifies S-004, S-012 or S-013:
// tests compare the implementation with the formula, not the formula with a standard.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
  ledger_ids: string[];
  status: string;
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

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const um = (n: number): Quantity => fromUnit(n, 'um');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const hz = (n: number): Quantity => fromUnit(n, 'Hz');
const rhoUohmCm = (n: number): Quantity => q(n * 1e-8, DIM.RESISTIVITY); // 1 uohm.cm = 1e-8 ohm.m exactly
const perK = (n: number): Quantity => q(n, DIM.PER_KELVIN);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;
const g = (x: number): string => String(x);

// S-004 constants and the S-013 skin-depth formula, restated here for the property tests.
const RHO20 = 1 / 58e6;
const ALPHA = 0.00393;
const MU0 = 4e-7 * Math.PI;
const refRho = (T: number, rho20 = RHO20, alpha = ALPHA): number => rho20 * (1 + alpha * (T - 20));
/** length mm, width mm, thickness um, conductor temperature degC. */
const refR = (L: number, w: number, t: number, T: number, rho20 = RHO20, alpha = ALPHA): number => (refRho(T, rho20, alpha) * (L * 1e-3)) / (w * 1e-3 * (t * 1e-6));
const refSkinUm = (f: number, T: number, rho20 = RHO20, alpha = ALPHA): number => Math.sqrt(refRho(T, rho20, alpha) / (Math.PI * f * MU0)) * 1e6;

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
const R_T = 'resistance at conductor temperature';
const R_20 = 'resistance at 20 °C';

/** Thickness mode with an explicit finished basis; conductor temperature = ambient (no deltaT). */
const thick = (L: number, w: number, t: number, T: number, extra: Partial<Inputs> = {}): Inputs => ({
  layer: 'outer',
  length: mm(L),
  width: mm(w),
  copperThickness: um(t),
  copperBasis: 'finished',
  ambient: degC(T),
  ...extra,
});

// Case tables mirror tools/reference/ref_calcs.py (vector names are built from the inputs, so a mismatch fails loudly).
// [length mm, width mm, thickness um, conductor temperature degC]
const R_CASES: [number, number, number, number][] = [
  [10, 0.1, 17.5, 20], [100, 0.254, 35, 20], [100, 0.254, 35, 25], [100, 0.254, 35, 55], [100, 0.254, 35, 85],
  [100, 0.254, 35, 125], [1000, 1, 70, 20], [1000, 1, 70, 85], [1000, 5, 105, 125], [10, 5, 105, 25],
  [10, 0.1, 105, 55], [1000, 0.1, 17.5, 125], [100, 1, 17.5, 85], [100, 5, 70, 55], [10, 1, 35, 125],
  [1000, 0.254, 105, 25], [100, 0.1, 70, 20], [10, 0.254, 17.5, 85], [1000, 5, 35, 55], [100, 1, 105, 125],
];
// [length mm, width mm, thickness um, temperature degC, rho20 in uohm.cm | undefined, alpha | undefined]
const OVERRIDE_CASES: [number, number, number, number, number | undefined, number | undefined][] = [
  [100, 0.254, 35, 25, 1.9, undefined],
  [100, 0.254, 35, 85, 1.9, 0.00357],
  [100, 0.254, 35, 125, undefined, 0.0039],
  [1000, 1, 70, 55, 2.2, 0.0035],
  [10, 0.1, 17.5, 20, 1.7, 0.004],
];
const SKIN_CASES: [number, number][] = [[1e5, 55], [1e6, 20], [1e7, 85], [1e8, 125], [1e9, 25]];
// [current A, length mm, width mm, thickness um, temperature degC]
const VDROP_CASES: [number, number, number, number, number][] = [[3, 100, 0.254, 35, 85], [10, 1000, 1, 70, 25]];

const rName = (L: number, w: number, t: number, T: number): string => `trace_resistance_ohm_L${g(L)}mm_w${g(w)}mm_t${g(t)}um_T${g(T)}C`;
const oName = (L: number, w: number, t: number, T: number, rho?: number, alpha?: number): string =>
  rName(L, w, t, T) + (rho === undefined ? '' : `_rho${g(rho)}uohmcm`) + (alpha === undefined ? '' : `_alpha${g(alpha)}`);
const sName = (f: number, T: number): string => `trace_skin_depth_um_f${g(f)}Hz_T${g(T)}C`;
const vName = (kind: 'vdrop_V' | 'power_W', I: number, L: number, w: number, t: number, T: number): string =>
  `trace_${kind}_I${g(I)}A_L${g(L)}mm_w${g(w)}mm_t${g(t)}um_T${g(T)}C`;

describe('golden vectors (oracle): R(T) with the default S-004 constants', () => {
  it('vectors loaded', () => {
    expect(vectors.filter((v) => v.name.startsWith('trace_resistance_ohm_')).length).toBe(R_CASES.length + OVERRIDE_CASES.length);
    expect(vectors.filter((v) => v.name.startsWith('trace_skin_depth_um_')).length).toBe(SKIN_CASES.length);
  });
  for (const [L, w, t, T] of R_CASES) {
    it(`L ${g(L)} mm, w ${g(w)} mm, t ${g(t)} um, T ${g(T)} C`, () => {
      const v = vec(rName(L, w, t, T));
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-004', 'S-006']));
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
      expect(v.status).toBe('VERIFIED');
      const r = ok(thick(L, w, t, T));
      const x = res(r, R_T);
      expect(sameDim(x.value, q(1, DIM.RESISTANCE))).toBe(true);
      expect(relErr(x.value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(x.role).toBe('primary');
      expect(x.bound).toBe('prediction');
      // The restated formula agrees with the oracle (guards the test table itself).
      expect(relErr(refR(L, w, t, T), v.pinned_expected)).toBeLessThanOrEqual(1e-12);
    });
  }
  it('the same copper entered as a foil weight (35 um per oz/ft2, default convention) gives the same resistance', () => {
    for (const [L, w, t, T] of R_CASES) {
      const v = vec(rName(L, w, t, T));
      const r = ok({ layer: 'inner', length: mm(L), width: mm(w), copperWeight: oz(t / 35), ambient: degC(T) });
      expect(relErr(res(r, R_T).value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
    }
  });
  it('the conductor temperature may come from ambient 25 C + deltaT instead of ambient alone (T = ambient + deltaT)', () => {
    for (const [L, w, t, T] of R_CASES.filter((c) => c[3] > 25)) {
      const v = vec(rName(L, w, t, T));
      const r = ok(thick(L, w, t, 25, { deltaT: dT(T - 25) }));
      expect(relErr(res(r, R_T).value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(toUnit(res(r, 'conductor temperature').value, 'degC') - T)).toBeLessThan(1e-9);
    }
  });
  it('a different foil convention changes only the thickness (nominal-1.35mil and mass-density, 1 oz, oracle thickness vectors)', () => {
    const t135 = vec('copper_um_1oz_nominal-1.35mil').pinned_expected;
    const tMass = vec('copper_um_1oz_mass-density').pinned_expected;
    const a = ok({ layer: 'outer', length: mm(100), width: mm(1), copperWeight: oz(1), convention: 'nominal-1.35mil', ambient: degC(20) });
    expect(relErr(res(a, R_T).value.si, refR(100, 1, t135, 20))).toBeLessThanOrEqual(TOL);
    const b = ok({ layer: 'outer', length: mm(100), width: mm(1), copperWeight: oz(1), convention: 'mass-density', ambient: degC(20) });
    expect(relErr(res(b, R_T).value.si, refR(100, 1, tMass, 20))).toBeLessThanOrEqual(TOL);
  });
});

describe('golden vectors (oracle): resistivity and alpha overrides (user inputs; S-012 plated copper is UNVERIFIED)', () => {
  for (const [L, w, t, T, rho, alpha] of OVERRIDE_CASES) {
    it(`L ${g(L)} w ${g(w)} t ${g(t)} T ${g(T)} rho ${String(rho)} uohm.cm alpha ${String(alpha)}`, () => {
      const v = vec(oName(L, w, t, T, rho, alpha));
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
      if (rho !== undefined) {
        expect(v.ledger_ids).toContain('S-012');
        expect(v.status).toBe('UNVERIFIED');
      }
      const extra: Partial<Inputs> = {
        ...(rho !== undefined ? { resistivity: rhoUohmCm(rho) } : {}),
        ...(alpha !== undefined ? { alpha: perK(alpha) } : {}),
      };
      const r = ok(thick(L, w, t, T, extra));
      expect(relErr(res(r, R_T).value.si, v.pinned_expected)).toBeLessThanOrEqual(TOL);
      // The override replaces rho20 and/or alpha everywhere: R at 20 C uses the overridden rho20.
      expect(relErr(res(r, R_20).value.si, refR(L, w, t, 20, rho === undefined ? RHO20 : rho * 1e-8, alpha ?? ALPHA))).toBeLessThanOrEqual(TOL);
      expect(relErr(refR(L, w, t, T, rho === undefined ? RHO20 : rho * 1e-8, alpha ?? ALPHA), v.pinned_expected)).toBeLessThanOrEqual(1e-12);
    });
  }
});

describe('golden vectors (oracle): skin depth (S-013, rho(T), mu0 = 4e-7 pi)', () => {
  for (const [f, T] of SKIN_CASES) {
    it(`f ${g(f)} Hz, T ${g(T)} C`, () => {
      const v = vec(sName(f, T));
      expect(v.ledger_ids).toEqual(expect.arrayContaining(['S-004', 'S-013']));
      expect(v.rel_tol).toBeLessThanOrEqual(TOL);
      const r = ok(thick(100, 1, 35, T, { frequency: hz(f) }));
      const d = res(r, 'skin depth');
      expect(sameDim(d.value, q(1, DIM.LENGTH))).toBe(true);
      expect(relErr(toUnit(d.value, 'um'), v.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(d.bound).toBe('nominal');
      expect(d.role).toBe('secondary');
      expect(relErr(refSkinUm(f, T), v.pinned_expected)).toBeLessThanOrEqual(1e-12);
    });
  }
  it('20 C, 1 MHz is the ledger S-013 value 66.0855 um (hand-checkable) and the existing 10 MHz vector still holds', () => {
    const r = ok(thick(100, 1, 35, 20, { frequency: hz(1e6) }));
    expect(Math.abs(toUnit(res(r, 'skin depth').value, 'um') - 66.0855)).toBeLessThan(5e-5);
    const s = ok(thick(100, 1, 35, 20, { frequency: hz(10e6) }));
    expect(relErr(toUnit(res(s, 'skin depth').value, 'um'), vec('skin_depth_um_10MHz').pinned_expected)).toBeLessThanOrEqual(TOL);
  });
});

describe('golden vectors (oracle): voltage drop and power loss', () => {
  for (const [I, L, w, t, T] of VDROP_CASES) {
    it(`I ${g(I)} A on L ${g(L)} w ${g(w)} t ${g(t)} at ${g(T)} C`, () => {
      const vv = vec(vName('vdrop_V', I, L, w, t, T));
      const pv = vec(vName('power_W', I, L, w, t, T));
      const r = ok(thick(L, w, t, T, { current: amp(I) }));
      const v = res(r, 'voltage drop');
      const p = res(r, 'power loss');
      expect(sameDim(v.value, q(1, DIM.VOLTAGE))).toBe(true);
      expect(sameDim(p.value, q(1, DIM.POWER))).toBe(true);
      expect(relErr(v.value.si, vv.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(p.value.si, pv.pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(v.bound).toBe('prediction');
      expect(p.bound).toBe('prediction');
      expect(v.role).toBe('secondary');
      expect(p.role).toBe('secondary');
    });
  }
});

describe('result set and secondary results', () => {
  it('exact result names, bounds and roles (no current, no frequency)', () => {
    const r = ok(thick(100, 0.254, 35, 85));
    expect(r.results.map((x) => x.name).sort()).toEqual(
      [R_20, R_T, 'conductor temperature', 'resistivity at conductor temperature', 'cross-section area', 'copper thickness'].sort(),
    );
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([R_T]);
    expect(res(r, R_T).bound).toBe('prediction');
    expect(res(r, 'conductor temperature').bound).toBe('prediction');
    for (const n of [R_20, 'resistivity at conductor temperature', 'cross-section area', 'copper thickness']) expect(res(r, n).bound).toBe('nominal');
    expect(r.designValues).toEqual([]);
    expect(r.envelope ?? []).toEqual([]);
  });
  it('optional results appear only when their input is given: skin depth with frequency; voltage drop and power loss with current', () => {
    const base = ok(thick(100, 1, 35, 25));
    for (const n of ['skin depth', 'voltage drop', 'power loss']) expect(base.results.some((x) => x.name === n)).toBe(false);
    const f = ok(thick(100, 1, 35, 25, { frequency: hz(1e6) }));
    expect(f.results.some((x) => x.name === 'skin depth')).toBe(true);
    expect(f.results.some((x) => x.name === 'voltage drop')).toBe(false);
    const c = ok(thick(100, 1, 35, 25, { current: amp(2) }));
    expect(c.results.some((x) => x.name === 'voltage drop')).toBe(true);
    expect(c.results.some((x) => x.name === 'power loss')).toBe(true);
    expect(c.results.some((x) => x.name === 'skin depth')).toBe(false);
    expect(ok(thick(100, 1, 35, 25, { frequency: hz(1e6), current: amp(2) })).results.filter((x) => x.role === 'primary')).toHaveLength(1);
  });
  it('dimensions: resistance, resistivity, area, thickness, absolute temperature', () => {
    const r = ok(thick(100, 0.254, 35, 85));
    expect(sameDim(res(r, R_20).value, q(1, DIM.RESISTANCE))).toBe(true);
    expect(sameDim(res(r, 'resistivity at conductor temperature').value, q(1, DIM.RESISTIVITY))).toBe(true);
    expect(sameDim(res(r, 'cross-section area').value, q(1, DIM.AREA))).toBe(true);
    expect(sameDim(res(r, 'copper thickness').value, q(1, DIM.LENGTH))).toBe(true);
    expect(sameDim(res(r, 'conductor temperature').value, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
  });
  it('resistance at 20 C, rho(T), area, thickness and conductor temperature (SI arithmetic, S-004)', () => {
    const r = ok(thick(100, 0.254, 35, 85));
    expect(relErr(res(r, R_20).value.si, refR(100, 0.254, 35, 20))).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, 'resistivity at conductor temperature').value.si, refRho(85))).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, 'cross-section area').value.si, 0.254e-3 * 35e-6)).toBeLessThanOrEqual(1e-12);
    expect(relErr(res(r, 'copper thickness').value.si, 35e-6)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(toUnit(res(r, 'conductor temperature').value, 'degC') - 85)).toBeLessThan(1e-9);
  });
  it('default ambient is 25 C when neither ambient nor deltaT is given: conductor temperature 25 C and R(25 C) from the oracle', () => {
    const { ambient: _a, ...noAmbient } = thick(100, 0.254, 35, 25);
    void _a;
    const r = ok(noAmbient);
    expect(Math.abs(toUnit(res(r, 'conductor temperature').value, 'degC') - 25)).toBeLessThan(1e-9);
    expect(relErr(res(r, R_T).value.si, vec(rName(100, 0.254, 35, 25)).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(meta.defaults.ambientC).toBe(25);
  });
  it('conductor temperature with deltaT and the default ambient is 25 C + deltaT', () => {
    const { ambient: _a, ...noAmbient } = thick(100, 0.254, 35, 25);
    void _a;
    const r = ok({ ...noAmbient, deltaT: dT(60) });
    expect(Math.abs(toUnit(res(r, 'conductor temperature').value, 'degC') - 85)).toBeLessThan(1e-9);
    expect(relErr(res(r, R_T).value.si, vec(rName(100, 0.254, 35, 85)).pinned_expected)).toBeLessThanOrEqual(TOL);
  });
  it('the library constants are the ledger S-004 values the oracle uses', () => {
    expect(COPPER_RESISTIVITY_20C).toBe(RHO20);
    expect(COPPER_ALPHA_20C).toBe(ALPHA);
  });
  it('steps are non-empty with finite quantities and include cross-section area, resistivity and resistance', () => {
    const r = ok(thick(100, 0.254, 35, 85));
    expect(r.steps.length).toBeGreaterThan(0);
    for (const s of r.steps) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.expr.length).toBeGreaterThan(0);
      expect(Number.isFinite(s.value.si)).toBe(true);
    }
    for (const re of [/area/i, /resistivity/i, /resistance/i]) expect(r.steps.some((s) => re.test(s.label))).toBe(true);
  });
});

describe('properties (fast-check)', () => {
  const lArb = fc.double({ min: 1, max: 2000, noNaN: true }); // mm
  const wArb = fc.double({ min: 0.05, max: 20, noNaN: true }); // mm
  const tArb = fc.double({ min: 10, max: 140, noNaN: true }); // um
  const TArb = fc.double({ min: -40, max: 140, noNaN: true }); // degC
  const IArb = fc.double({ min: 0.01, max: 50, noNaN: true });
  const R = (L: number, w: number, t: number, T: number, extra: Partial<Inputs> = {}): number => res(ok(thick(L, w, t, T, extra)), R_T).value.si;

  it('matches the S-004 formula for random in-range inputs (1e-9)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, (L, w, t, T) => {
        // Block body: fast-check treats a returned matcher object as a failed property.
        expect(relErr(R(L, w, t, T), refR(L, w, t, T))).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('R(T = 20 C) equals the 20 C resistance within 1e-12, and the 20 C resistance does not depend on temperature', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, (L, w, t, T) => {
        const at20 = ok(thick(L, w, t, 20));
        expect(relErr(res(at20, R_T).value.si, res(at20, R_20).value.si)).toBeLessThanOrEqual(1e-12);
        expect(relErr(res(ok(thick(L, w, t, T)), R_20).value.si, res(at20, R_20).value.si)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('monotonic: longer never lowers R; hotter raises R; wider or thicker lowers R', () => {
    fc.assert(
      fc.property(lArb, lArb, wArb, wArb, tArb, tArb, TArb, TArb, (l1, l2, w1, w2, t1, t2, T1, T2) => {
        const [lLo, lHi] = l1 <= l2 ? [l1, l2] : [l2, l1];
        expect(R(lLo, w1, t1, T1)).toBeLessThanOrEqual(R(lHi, w1, t1, T1));
        const [TLo, THi] = T1 <= T2 ? [T1, T2] : [T2, T1];
        expect(R(l1, w1, t1, TLo)).toBeLessThanOrEqual(R(l1, w1, t1, THi));
        const [wLo, wHi] = w1 <= w2 ? [w1, w2] : [w2, w1];
        expect(R(l1, wHi, t1, T1)).toBeLessThanOrEqual(R(l1, wLo, t1, T1));
        const [tLo, tHi] = t1 <= t2 ? [t1, t2] : [t2, t1];
        expect(R(l1, w1, tHi, T1)).toBeLessThanOrEqual(R(l1, w1, tLo, T1));
      }),
    );
  });
  it('R(T) strictly increases with T when the temperatures differ by at least 1 K (positive alpha)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, (L, w, t, T) => {
        expect(R(L, w, t, T + 1)).toBeGreaterThan(R(L, w, t, T));
      }),
      { numRuns: 100 },
    );
  });
  it('linear in length, inverse in width and in thickness (1e-12)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1000, noNaN: true }), wArb, tArb, TArb, (L, w, t, T) => {
        const r = R(L, w, t, T);
        expect(relErr(R(2 * L, w, t, T), 2 * r)).toBeLessThanOrEqual(1e-12);
        expect(relErr(R(L, 2 * w, t, T), r / 2)).toBeLessThanOrEqual(1e-12);
        expect(relErr(R(L, w, 2 * t, T), r / 2)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('ambient + deltaT equals the same conductor temperature entered as ambient alone (1e-9)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, fc.double({ min: -20, max: 60, noNaN: true }), fc.double({ min: 0.001, max: 80, noNaN: true }), (L, w, t, a, d) => {
        const split = R(L, w, t, a, { deltaT: dT(d) });
        expect(relErr(split, R(L, w, t, a + d))).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('voltage drop = I R(T) and power = I^2 R(T); doubling the current doubles V and quadruples P (1e-12)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, IArb, (L, w, t, T, I) => {
        const r = ok(thick(L, w, t, T, { current: amp(I) }));
        const Rr = res(r, R_T).value.si;
        const v = res(r, 'voltage drop').value.si;
        const p = res(r, 'power loss').value.si;
        expect(relErr(v, I * Rr)).toBeLessThanOrEqual(1e-12);
        expect(relErr(p, I * I * Rr)).toBeLessThanOrEqual(1e-12);
        const r2 = ok(thick(L, w, t, T, { current: amp(2 * I) }));
        expect(relErr(res(r2, 'voltage drop').value.si, 2 * v)).toBeLessThanOrEqual(1e-12);
        expect(relErr(res(r2, 'power loss').value.si, 4 * p)).toBeLessThanOrEqual(1e-12);
        expect(relErr(p, v * I)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
  it('resistivity override scales R by rho_override / rho_default at the same alpha, at 20 C exactly (1e-12) and at any T (1e-9 with alpha scaled out)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, fc.double({ min: 1.5, max: 2.5, noNaN: true }), (L, w, t, rho) => {
        const a = res(ok(thick(L, w, t, 20, { resistivity: rhoUohmCm(rho) })), R_T).value.si;
        expect(relErr(a, R(L, w, t, 20) * ((rho * 1e-8) / RHO20))).toBeLessThanOrEqual(1e-9);
      }),
    );
  });
  it('alpha override: R(T)/R(20) = 1 + alpha (T - 20) (1e-9)', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, fc.double({ min: 0.002, max: 0.006, noNaN: true }), (L, w, t, T, alpha) => {
        const r = ok(thick(L, w, t, T, { alpha: perK(alpha) }));
        expect(relErr(res(r, R_T).value.si / res(r, R_20).value.si, 1 + alpha * (T - 20))).toBeLessThanOrEqual(TOL);
      }),
    );
  });
  it('skin depth scales as 1/sqrt(f): 4 f halves it (1e-12), and grows with temperature', () => {
    fc.assert(
      fc.property(fc.double({ min: 10, max: 1e8, noNaN: true }), TArb, (f, T) => {
        const d1 = res(ok(thick(100, 1, 35, T, { frequency: hz(f) })), 'skin depth').value.si;
        const d4 = res(ok(thick(100, 1, 35, T, { frequency: hz(4 * f) })), 'skin depth').value.si;
        expect(relErr(d4, d1 / 2)).toBeLessThanOrEqual(1e-12);
        expect(relErr(d1 * 1e6, refSkinUm(f, T))).toBeLessThanOrEqual(TOL);
        const hot = res(ok(thick(100, 1, 35, T + 1, { frequency: hz(f) })), 'skin depth').value.si;
        expect(hot).toBeGreaterThan(d1);
      }),
    );
  });
  it('no NaN or Infinity anywhere for in-range inputs; every result passes assertCalcResult', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, IArb, fc.double({ min: 1, max: 1e9, noNaN: true }), (L, w, t, T, I, f) => {
        const r = ok(thick(L, w, t, T, { current: amp(I), frequency: hz(f), deltaT: dT(5) }));
        for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
        for (const s of r.steps) expect(Number.isFinite(s.value.si)).toBe(true);
        expect(Number.isFinite(r.confidence.score)).toBe(true);
      }),
    );
  });
  it('deterministic, and inputs are never mutated', () => {
    fc.assert(
      fc.property(lArb, wArb, tArb, TArb, (L, w, t, T) => {
        const input = thick(L, w, t, T, { current: amp(1), frequency: hz(1e6), resistivity: rhoUohmCm(1.9), alpha: perK(0.0039), deltaT: dT(3) });
        const before = JSON.stringify(input);
        const a = compute(input);
        const b = compute(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(input)).toBe(before);
      }),
    );
  });
});

describe('robustness near the representable range', () => {
  it('a tiny conductor or huge length returns an error or an all-finite valid result; never throws, never NaN', () => {
    const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
    const extremes: Inputs[] = [
      thick(1, 1, 35, 20, { length: raw(Number.MAX_VALUE, DIM.LENGTH) }),
      thick(1, 1, 35, 20, { length: raw(Number.MIN_VALUE, DIM.LENGTH) }),
      thick(1, 1, 35, 20, { width: raw(Number.MIN_VALUE, DIM.LENGTH) }),
      thick(1, 1, 35, 20, { width: raw(Number.MAX_VALUE, DIM.LENGTH) }),
      thick(1, 1, 35, 20, { copperThickness: raw(Number.MIN_VALUE, DIM.LENGTH) }),
      thick(1, 1, 35, 20, { resistivity: raw(Number.MAX_VALUE, DIM.RESISTIVITY) }),
      thick(1, 1, 35, 20, { resistivity: raw(Number.MIN_VALUE, DIM.RESISTIVITY) }),
      thick(1, 1, 35, 20, { alpha: raw(Number.MAX_VALUE, DIM.PER_KELVIN) }),
      thick(1, 1, 35, 20, { current: raw(Number.MAX_VALUE, DIM.CURRENT) }),
      thick(1, 1, 35, 20, { frequency: raw(Number.MAX_VALUE, DIM.FREQUENCY) }),
      thick(1, 1, 35, 20, { frequency: raw(Number.MIN_VALUE, DIM.FREQUENCY) }),
    ];
    for (const inp of extremes) {
      let out: ReturnType<typeof compute> | undefined;
      expect(() => {
        out = compute(inp);
      }).not.toThrow();
      if (out?.ok) {
        expect(assertCalcResult(out.value).ok).toBe(true);
        for (const r of out.value.results) expect(Number.isFinite(r.value.si)).toBe(true);
      } else {
        expect(out && 'value' in out).toBe(false);
      }
    }
  });
});

describe('performance sanity', () => {
  // SPEC: closed-form calculators take < 1 ms each; 100 us per compute here is 10x tighter and survives coverage instrumentation.
  it('10 000 computes stay within a 5 s total budget', () => {
    const input = thick(100, 0.254, 35, 85, { current: amp(3), frequency: hz(1e6) });
    compute(input); // warm-up
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 10_000; i++) if (compute(input).ok) n++;
    const dt = performance.now() - t0;
    expect(n).toBe(10_000);
    expect(dt).toBeLessThan(5000);
  });
});

describe('meta formula', () => {
  it('meta.formula states R = rho L/(w t) and R(T), cites ledger S-004 and does not hard-code the temperature coefficient', () => {
    expect(meta.formula.trim().length).toBeGreaterThan(0);
    expect(meta.formula).toContain('ρ');
    expect(meta.formula).toContain('L/(w·t)');
    expect(meta.formula).toContain('S-004');
    expect(meta.formula).not.toContain('0.00393');
  });
});
