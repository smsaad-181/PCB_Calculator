import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { validate } from './guards';
import { meta } from './meta';

// Phase 4 core: thermal via (1-D conduction estimate). TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, thermalvia_* vectors, mirrored in
// docs/golden-vectors.json). Geometry, plating and fill values here are TEST values, never defaults. Nothing here verifies
// S-041, S-041a, S-041b, S-041c or S-007: tests compare the implementation with the formulas.

interface GoldenVector {
  name: string;
  pinned_expected: number;
  rel_tol: number;
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

/** Raw quantity that bypasses q() so tests can feed NaN, Infinity and underflow to the guards. */
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim });
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const watt = (n: number): Quantity => raw(n, DIM.POWER);
const kcond = (n: number): Quantity => raw(n, DIM.THERMAL_CONDUCTIVITY);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;

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
const has = (r: CalcResult, name: string): boolean => r.results.some((o) => o.name === name);

const AREA = 'barrel copper area (one via)';
const TH_BARREL = 'barrel thermal resistance (one via)';
const TH_CORE = 'fill core thermal resistance (one via)';
const TH_VIA = 'thermal resistance of one via';
const TH_ARRAY = 'thermal resistance of the via array (1-D conduction estimate, ideal parallel)';
const DT = 'temperature difference across the array for the given power';

const base = (d: number, t: number, L: number, N: number, extra: Partial<Inputs> = {}): Inputs => ({
  finishedHoleDiameter: mm(d),
  platingThickness: um(t),
  barrelLength: mm(L),
  count: N,
  kMaterial: 'pure-401',
  fill: 'none',
  ...extra,
});

// Mirrors _TV_CASES in tools/reference/ref_calcs.py: [tag, d mm, t um, L mm, N, material, k_fill, P W].
const CASES: [string, number, number, number, number, 'pure-401' | 'c11000-391', number | undefined, number | undefined][] = [
  ['A_d0.3_t25_L1.6_N1_k401', 0.3, 25, 1.6, 1, 'pure-401', undefined, undefined],
  ['B_d0.3_t25_L1.6_N16_k391_P2W', 0.3, 25, 1.6, 16, 'c11000-391', undefined, 2],
  ['C_d0.25_t20_L1.0_N9_k401_fill1.0_P1.5W', 0.25, 20, 1.0, 9, 'pure-401', 1.0, 1.5],
  ['D_d0.3_t25_L1.6_N4_k401_fillCu', 0.3, 25, 1.6, 4, 'pure-401', 401, 0.5],
];

describe('golden vectors (oracle): area, barrel, core, one via, array, rise', () => {
  for (const [tag, d, t, L, N, mat, kf, P] of CASES) {
    it(tag, () => {
      const extra: Partial<Inputs> = {
        kMaterial: mat,
        ...(kf !== undefined ? { fill: 'filled' as const, fillConductivity: kcond(kf) } : {}),
        ...(P !== undefined ? { power: watt(P) } : {}),
      };
      const r = ok(base(d, t, L, N, extra));
      const a = res(r, AREA).value.si * 1e6;
      expect(relErr(a, vec(`thermalvia_${tag}_barrel_area_mm2`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, TH_BARREL).value.si, vec(`thermalvia_${tag}_theta_barrel_KperW`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, TH_VIA).value.si, vec(`thermalvia_${tag}_theta_via_KperW`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, TH_ARRAY).value.si, vec(`thermalvia_${tag}_theta_array_KperW`).pinned_expected)).toBeLessThanOrEqual(TOL);
      if (kf !== undefined) {
        expect(relErr(res(r, TH_CORE).value.si, vec(`thermalvia_${tag}_theta_core_KperW`).pinned_expected)).toBeLessThanOrEqual(TOL);
      } else {
        expect(has(r, TH_CORE)).toBe(false);
      }
      if (P !== undefined) {
        expect(relErr(res(r, DT).value.si, vec(`thermalvia_${tag}_dT_K`).pinned_expected)).toBeLessThanOrEqual(TOL);
      } else {
        expect(has(r, DT)).toBe(false);
      }
    });
  }
  it('oracle vector for d 0.3 / t 25 / L 1.6 / k 401 matches the pre-existing via golden (156.3 K/W)', () => {
    expect(relErr(vec('thermalvia_A_d0.3_t25_L1.6_N1_k401_theta_array_KperW').pinned_expected, vec('via_theta_KperW_1.6mm').pinned_expected)).toBeLessThanOrEqual(TOL);
  });
  it('hand check: d 0.3 mm, t 25 um, L 1.6 mm, k 401: A = 2.5525e-8 m2, theta = 156.32 K/W', () => {
    const r = ok(base(0.3, 25, 1.6, 1));
    expect(Math.abs(res(r, AREA).value.si - 2.5525e-8)).toBeLessThan(5e-13);
    expect(Math.abs(res(r, TH_BARREL).value.si - 156.316)).toBeLessThan(5e-3);
  });
  it('a copper-filled via (fill k equal to the barrel k) equals a solid cylinder of outer radius d/2 + t', () => {
    const r = ok(base(0.3, 25, 1.6, 1, { fill: 'filled', fillConductivity: kcond(401) }));
    const solid = 1.6e-3 / (401 * Math.PI * (0.15e-3 + 25e-6) ** 2);
    expect(relErr(res(r, TH_VIA).value.si, solid)).toBeLessThanOrEqual(1e-12);
  });
});

describe('result set, roles, bounds, dimensions', () => {
  it('names without fill and power, one primary (the array)', () => {
    const r = ok(base(0.3, 25, 1.6, 2));
    expect(r.results.map((x) => x.name).sort()).toEqual([AREA, TH_BARREL, TH_VIA, TH_ARRAY].sort());
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([TH_ARRAY]);
    expect(r.designValues).toEqual([]);
  });
  it('rounding bounds: resistances and rise are prediction, area is nominal', () => {
    const r = ok(base(0.3, 25, 1.6, 2, { fill: 'filled', fillConductivity: kcond(2), power: watt(1) }));
    for (const n of [TH_BARREL, TH_CORE, TH_VIA, TH_ARRAY, DT]) expect(res(r, n).bound, n).toBe('prediction');
    expect(res(r, AREA).bound).toBe('nominal');
  });
  it('dimensions: K/W for resistances, temperature DIFFERENCE for the rise, never an absolute temperature', () => {
    const r = ok(base(0.3, 25, 1.6, 2, { power: watt(1) }));
    expect(sameDim(res(r, TH_ARRAY).value, q(1, DIM.THERMAL_RESISTANCE))).toBe(true);
    expect(sameDim(res(r, DT).value, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(sameDim(res(r, AREA).value, q(1, DIM.AREA))).toBe(true);
    expect(r.results.some((x) => x.value.dim === DIM.ABS_TEMPERATURE)).toBe(false);
  });
  it('N = 1: array equals one via; filled with a poor fill is close to the barrel alone', () => {
    const r = ok(base(0.3, 25, 1.6, 1));
    expect(res(r, TH_ARRAY).value.si).toBe(res(r, TH_VIA).value.si);
    const f = ok(base(0.3, 25, 1.6, 1, { fill: 'filled', fillConductivity: kcond(0.01) }));
    expect(relErr(res(f, TH_VIA).value.si, res(f, TH_BARREL).value.si)).toBeLessThan(1e-3);
  });
  it('steps carry the geometry and equations', () => {
    const r = ok(base(0.3, 25, 1.6, 4, { fill: 'filled', fillConductivity: kcond(2), power: watt(1) }));
    const labels = r.steps.map((s) => s.label).join(' | ');
    expect(labels).toMatch(/Barrel copper area/);
    expect(labels).toMatch(/Core area/);
    expect(labels).toMatch(/array/i);
    expect(labels).toMatch(/temperature difference/i);
  });
});

describe('labels, warnings and the S-041c conflict (a 1-D estimate, never a design constant)', () => {
  it('always shows the 1-D estimate, receiving-copper, bulk-k, sharing-ideal and not-theta-JA statements', () => {
    const r = ok(base(0.3, 25, 1.6, 1));
    const codes = r.warnings.map((w) => w.code);
    for (const c of ['ONE_D_ESTIMATE', 'RECEIVING_COPPER_CONFLICT', 'BULK_COPPER_K', 'IDEAL_PARALLEL', 'NOT_THETA_JA']) expect(codes, c).toContain(c);
    const one = r.warnings.find((w) => w.code === 'ONE_D_ESTIMATE');
    expect(one?.severity).toBe('warning');
    expect(one?.message).toMatch(/lower bound/i);
    expect(one?.message).toMatch(/spreading/i);
    expect(one?.message).toMatch(/UNDERESTIMATES/);
    const conf = r.warnings.find((w) => w.code === 'RECEIVING_COPPER_CONFLICT');
    expect(conf?.message).toMatch(/S-041c/);
    expect(conf?.message).toMatch(/disagree/i);
    expect(r.warnings.find((w) => w.code === 'NOT_THETA_JA')?.message).toMatch(/not a design constant/i);
  });
  it('the method, primary label and recommendation say estimate / not a design constant', () => {
    const r = ok(base(0.3, 25, 1.6, 1));
    expect(r.method).toMatch(/estimate/i);
    expect(r.recommendation).toMatch(/estimate/i);
    expect(r.recommendation).toMatch(/not a design constant/i);
    expect(r.assumptions.join(' ')).toMatch(/ignores spreading/i);
    expect(r.formula).toBe(meta.formula);
    expect(meta.formula).toMatch(/π·t·\(d \+ t\)/);
  });
  it('k material is a required choice, stated with S-007 CONFLICT and the non-conservative direction', () => {
    const a = ok(base(0.3, 25, 1.6, 1, { kMaterial: 'pure-401' }));
    const b = ok(base(0.3, 25, 1.6, 1, { kMaterial: 'c11000-391' }));
    expect(a.assumptions.join(' ')).toMatch(/S-007/);
    expect(a.assumptions.join(' ')).toMatch(/non-conservative/);
    expect(res(b, TH_BARREL).value.si).toBeGreaterThan(res(a, TH_BARREL).value.si);
    expect(a.inputs.some((i) => i.source === 'default')).toBe(false);
  });
  it('N > 1 shows the diminishing-returns / equal-sharing caution; N = 1 does not', () => {
    const many = ok(base(0.3, 25, 1.6, 4));
    expect(many.warnings.find((w) => w.code === 'EQUAL_SHARING')?.message).toMatch(/diminishing/i);
    expect(ok(base(0.3, 25, 1.6, 1)).warnings.some((w) => w.code === 'EQUAL_SHARING')).toBe(false);
  });
  it('filled: void-free full-contact caution and the user fill conductivity echoed (no default)', () => {
    const r = ok(base(0.3, 25, 1.6, 1, { fill: 'filled', fillConductivity: kcond(3) }));
    expect(r.warnings.find((w) => w.code === 'FILL_ASSUMED_VOID_FREE')?.message).toMatch(/void-free/i);
    expect(r.inputs.find((i) => i.name === 'fill thermal conductivity')?.source).toBe('user');
    expect(r.reference.ledgerIds).toContain('S-041a');
    expect(ok(base(0.3, 25, 1.6, 1)).reference.ledgerIds).not.toContain('S-041a');
  });
  it('fab-profile plating: the input source is fab-profile and the AVERAGE (thin spots are thinner) caution shows', () => {
    const r = ok(base(0.3, 18, 1.6, 1, { platingSource: 'fab-profile-average' }));
    const p = r.inputs.find((i) => i.name === 'plating thickness');
    expect(p?.source).toBe('fab-profile');
    expect(p?.sourceDetail).toMatch(/average/i);
    expect(r.warnings.find((w) => w.code === 'FAB_AVERAGE_PLATING')?.message).toMatch(/thin spots/i);
    const u = ok(base(0.3, 18, 1.6, 1));
    expect(u.inputs.find((i) => i.name === 'plating thickness')?.source).toBe('user');
    expect(u.warnings.some((w) => w.code === 'FAB_AVERAGE_PLATING')).toBe(false);
  });
  it('plating at or above the finished hole diameter warns and fails the plausibility check', () => {
    const r = ok(base(0.1, 120, 1.6, 1));
    expect(r.warnings.some((w) => w.code === 'PLATING_EXCEEDS_HOLE')).toBe(true);
    expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
    expect(r.confidence.level).toBe('low');
    const g = ok(base(0.3, 25, 1.6, 1));
    expect(g.warnings.some((w) => w.code === 'PLATING_EXCEEDS_HOLE')).toBe(false);
    expect(g.validityChecks.every((c) => c.ok)).toBe(true);
  });
  it('power: the rise is theta x P and the statement says it assumes all P flows through the vias', () => {
    const r = ok(base(0.3, 25, 1.6, 4, { power: watt(3) }));
    expect(relErr(res(r, DT).value.si, res(r, TH_ARRAY).value.si * 3)).toBeLessThanOrEqual(1e-12);
    expect(r.assumptions.join(' ')).toMatch(/all of the power|all the power/i);
    expect(r.warnings.some((w) => w.code === 'RISE_IS_LOWER_BOUND')).toBe(true);
  });
  it('no compliance wording and no rating wording anywhere', () => {
    const r = ok(base(0.3, 25, 1.6, 4, { fill: 'filled', fillConductivity: kcond(3), power: watt(1) }));
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/complian|production[ ]safe|guarantee|certif/i);
    expect(r.results.some((x) => /rating|safe/i.test(x.name))).toBe(false);
  });
});

describe('confidence and data status (rule based)', () => {
  it('CONFLICT data status, never high, with reasons, for every case', () => {
    for (const [, d, t, L, N, mat, kf, P] of CASES) {
      const r = ok(base(d, t, L, N, { kMaterial: mat, ...(kf !== undefined ? { fill: 'filled' as const, fillConductivity: kcond(kf) } : {}), ...(P !== undefined ? { power: watt(P) } : {}) }));
      expect(r.dataStatus).toBe('CONFLICT');
      expect(r.confidence.level).not.toBe('high');
      expect(r.confidence.reasons.length).toBeGreaterThan(0);
      expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-041', 'S-041b', 'S-041c', 'S-007', 'S-040']));
    }
  });
});

describe('guards (errors are values, never numbers)', () => {
  const bads: [string, unknown][] = [
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative', -1e-3],
  ];
  const fields = ['finishedHoleDiameter', 'platingThickness', 'barrelLength'] as const;
  for (const f of fields) {
    for (const [name, v] of bads) {
      it(`${f} = ${name} is rejected`, () => {
        const inp = { ...base(0.3, 25, 1.6, 1), [f]: raw(v as number, DIM.LENGTH) } as Inputs;
        const out = compute(inp);
        expect(out.ok).toBe(false);
        if (!out.ok) {
          expect(out.error.code).toBe('INVALID_INPUT');
          expect(out.error.field).toBe(f);
        }
      });
    }
    it(`${f} with the wrong dimension is rejected as DIMENSION`, () => {
      const out = compute({ ...base(0.3, 25, 1.6, 1), [f]: watt(1) } as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe('DIMENSION');
    });
    it(`${f} missing is rejected`, () => {
      const inp = { ...base(0.3, 25, 1.6, 1) } as Record<string, unknown>;
      delete inp[f];
      const out = compute(inp as unknown as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe(f);
    });
  }
  it('plating missing says it is required and never pre-filled', () => {
    const inp = { ...base(0.3, 25, 1.6, 1) } as Record<string, unknown>;
    delete inp['platingThickness'];
    const v = validate(inp);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.message).toMatch(/never pre-filled/);
  });
  for (const n of [0, -1, 1.5, NaN, Infinity, 2 ** 60]) {
    it(`count = ${String(n)} is rejected`, () => {
      const out = compute({ ...base(0.3, 25, 1.6, 1), count: n });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe('count');
    });
  }
  it('kMaterial is required and must be a known choice (no default)', () => {
    const noK = { ...base(0.3, 25, 1.6, 1) } as Record<string, unknown>;
    delete noK['kMaterial'];
    for (const inp of [noK, { ...noK, kMaterial: 'brass' }, { ...noK, kMaterial: 401 }]) {
      const out = compute(inp as unknown as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe('kMaterial');
    }
  });
  it('fill must be chosen: missing or unknown is rejected', () => {
    const noFill = { ...base(0.3, 25, 1.6, 1) } as Record<string, unknown>;
    delete noFill['fill'];
    for (const inp of [noFill, { ...noFill, fill: 'epoxy' }]) {
      const out = compute(inp as unknown as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe('fill');
    }
  });
  it('filled needs a fill conductivity, none forbids one, and the value is guarded', () => {
    const a = compute(base(0.3, 25, 1.6, 1, { fill: 'filled' }));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error.field).toBe('fillConductivity');
    const b = compute(base(0.3, 25, 1.6, 1, { fill: 'none', fillConductivity: kcond(1) }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.field).toBe('fillConductivity');
    for (const v of [NaN, Infinity, 0, -3]) {
      const c = compute(base(0.3, 25, 1.6, 1, { fill: 'filled', fillConductivity: kcond(v) }));
      expect(c.ok).toBe(false);
    }
    const d = compute(base(0.3, 25, 1.6, 1, { fill: 'filled', fillConductivity: watt(1) }));
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error.code).toBe('DIMENSION');
  });
  it('power is guarded and must be a power', () => {
    for (const v of [NaN, Infinity, 0, -1]) expect(compute(base(0.3, 25, 1.6, 1, { power: watt(v) })).ok).toBe(false);
    const w = compute(base(0.3, 25, 1.6, 1, { power: mm(1) }));
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.error.code).toBe('DIMENSION');
  });
  it('platingSource must be a known choice', () => {
    const out = compute({ ...base(0.3, 25, 1.6, 1), platingSource: 'guess' } as unknown as Inputs);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.field).toBe('platingSource');
  });
  it('non-object and non-quantity inputs return errors, never throw', () => {
    for (const bad of [null, undefined, 3, 'x', []]) expect(() => compute(bad as unknown as Inputs)).not.toThrow();
    expect(compute(null as unknown as Inputs).ok).toBe(false);
    expect(compute({ ...base(0.3, 25, 1.6, 1), finishedHoleDiameter: 3 } as unknown as Inputs).ok).toBe(false);
  });
  it('a representable-range overflow is an OUT_OF_DOMAIN error value, not Infinity', () => {
    const out = compute(base(1e200, 1e200, 1e200, 1));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('OUT_OF_DOMAIN');
  });
});

describe('properties', () => {
  const geo = fc.record({
    d: fc.double({ min: 0.05, max: 1.0, noNaN: true }),
    t: fc.double({ min: 5, max: 60, noNaN: true }),
    L: fc.double({ min: 0.2, max: 3.2, noNaN: true }),
    N: fc.integer({ min: 1, max: 200 }),
  });
  it('array x N equals one via; one via is never worse than the barrel alone; assertCalcResult holds', () => {
    fc.assert(
      fc.property(geo, fc.double({ min: 0.1, max: 400, noNaN: true }), ({ d, t, L, N }, kf) => {
        const r = ok(base(d, t, L, N, { fill: 'filled', fillConductivity: kcond(kf) }));
        const one = res(r, TH_VIA).value.si;
        expect(relErr(res(r, TH_ARRAY).value.si * N, one)).toBeLessThan(1e-12);
        expect(one).toBeLessThanOrEqual(res(r, TH_BARREL).value.si * (1 + 1e-12));
        expect(Number.isFinite(one) && one > 0).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
  it('monotone: more vias, thicker plating, larger hole or shorter barrel never raise theta', () => {
    fc.assert(
      fc.property(geo, ({ d, t, L, N }) => {
        const a = res(ok(base(d, t, L, N)), TH_ARRAY).value.si;
        expect(res(ok(base(d, t, L, N + 1)), TH_ARRAY).value.si).toBeLessThan(a);
        expect(res(ok(base(d, t * 1.1, L, N)), TH_ARRAY).value.si).toBeLessThan(a);
        expect(res(ok(base(d * 1.1, t, L, N)), TH_ARRAY).value.si).toBeLessThan(a);
        expect(res(ok(base(d, t, L * 0.9, N)), TH_ARRAY).value.si).toBeLessThan(a);
      }),
      { numRuns: 100 },
    );
  });
  it('linear in L, and the rise is linear in power', () => {
    fc.assert(
      fc.property(geo, fc.double({ min: 0.01, max: 50, noNaN: true }), ({ d, t, L, N }, P) => {
        const a = ok(base(d, t, L, N, { power: watt(P) }));
        const b = ok(base(d, t, L * 2, N, { power: watt(P * 3) }));
        expect(relErr(res(b, TH_ARRAY).value.si, res(a, TH_ARRAY).value.si * 2)).toBeLessThan(1e-12);
        expect(relErr(res(b, DT).value.si, res(a, DT).value.si * 6)).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('a higher fill conductivity lowers theta; the 391 material is never lower than 401', () => {
    fc.assert(
      fc.property(geo, fc.double({ min: 0.1, max: 100, noNaN: true }), ({ d, t, L, N }, kf) => {
        const lo = res(ok(base(d, t, L, N, { fill: 'filled', fillConductivity: kcond(kf) })), TH_ARRAY).value.si;
        const hi = res(ok(base(d, t, L, N, { fill: 'filled', fillConductivity: kcond(kf * 2) })), TH_ARRAY).value.si;
        expect(hi).toBeLessThan(lo);
        const a = res(ok(base(d, t, L, N, { kMaterial: 'pure-401' })), TH_ARRAY).value.si;
        const b = res(ok(base(d, t, L, N, { kMaterial: 'c11000-391' })), TH_ARRAY).value.si;
        expect(b).toBeGreaterThan(a);
      }),
      { numRuns: 100 },
    );
  });
});

describe('metadata and performance', () => {
  it('meta lists the ledger rows, an estimate accuracy class, and no hard-coded fab limit', () => {
    expect(meta.accuracyClass).toBe('estimate');
    expect(meta.id).toBe('thermal-via');
    expect(meta.ledgerIds).toEqual(expect.arrayContaining(['S-007', 'S-040', 'S-041', 'S-041a', 'S-041b', 'S-041c', 'S-041d', 'S-019d']));
  });
  it('10 000 computes within a 5 s total budget', () => {
    const inp = base(0.3, 25, 1.6, 4, { power: watt(1), fill: 'filled', fillConductivity: kcond(3) });
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) compute(inp);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
