import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { validate } from './guards';
import { meta } from './meta';

// Phase 1 task 7a: via barrel electrical and axial thermal calculator. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, via_task7a_* vectors, mirrored in
// docs/golden-vectors.json) or from the S-004 formulas restated below. Plating thicknesses here are TEST values, never
// defaults. Nothing here verifies S-004, S-007, S-012 or S-015: tests compare implementation with formula.

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

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const TOL = 1e-9;
const g = (x: number): string => String(x);

const RHO20 = 1 / 58e6;
const ALPHA = 0.00393;
const refArea = (d: number, t: number): number => Math.PI * t * (d + t); // SI metres
const refR = (d: number, t: number, L: number, N: number, T: number): number => (RHO20 * (1 + ALPHA * (T - 20)) * L) / (N * refArea(d, t));

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

const R_T = 'resistance at conductor temperature';
const R_20 = 'resistance at 20 °C';
const A_BARREL = 'barrel copper area (one via)';
const THETA_1 = 'axial thermal resistance (one barrel)';
const THETA_N = 'axial thermal resistance (all barrels, ideal parallel)';

/** d mm finished, t um plating (TEST value), L mm, N vias. */
const via = (d: number, t: number, L: number, N: number, extra: Partial<Inputs> = {}): Inputs => ({
  finishedHoleDiameter: mm(d),
  platingThickness: um(t),
  barrelLength: mm(L),
  count: N,
  ...extra,
});

// Mirrors VIA_CASES in tools/reference/ref_calcs.py: [d mm, t um, L mm, N, T degC, I A | undefined, k material].
const CASES: [number, number, number, number, number, number | undefined, 'pure-401' | 'c11000-391'][] = [
  [0.3, 25, 1.6, 1, 20, undefined, 'pure-401'],
  [0.3, 25, 1.6, 4, 85, 2.0, 'c11000-391'],
  [0.2, 18, 0.8, 1, 105, 0.5, 'pure-401'],
  [0.5, 35, 2.4, 6, 55, 3.0, 'pure-401'],
  [0.25, 20, 1.0, 2, 25, 1.0, 'c11000-391'],
];
const K_OF = { 'pure-401': 401, 'c11000-391': 391 } as const;
const tagOf = (d: number, t: number, L: number, N: number, T: number, k: number): string => `d${g(d)}mm_t${g(t)}um_L${g(L)}mm_N${g(N)}_T${g(T)}C_k${g(k)}`;

describe('golden vectors (oracle): barrel area, R(T), R20, axial theta, drop, power', () => {
  for (const [d, t, L, N, T, I, mat] of CASES) {
    const tag = tagOf(d, t, L, N, T, K_OF[mat]);
    it(`d ${g(d)} t ${g(t)} L ${g(L)} N ${g(N)} T ${g(T)} C ${mat}${I === undefined ? '' : ` I ${g(I)} A`}`, () => {
      const r = ok(via(d, t, L, N, { conductorTemperature: degC(T), kMaterial: mat, ...(I !== undefined ? { current: amp(I) } : {}) }));
      expect(relErr(toUnit(res(r, A_BARREL).value, 'mm2'), vec(`via_task7a_area_mm2_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, R_T).value.si * 1e3, vec(`via_task7a_R_T_mohm_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, R_20).value.si * 1e3, vec(`via_task7a_R20_mohm_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, THETA_N).value.si, vec(`via_task7a_theta_KperW_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      expect(relErr(res(r, THETA_1).value.si * 1, vec(`via_task7a_theta_KperW_${tag}`).pinned_expected * N)).toBeLessThanOrEqual(TOL);
      if (I !== undefined) {
        expect(relErr(res(r, 'voltage drop').value.si * 1e3, vec(`via_task7a_vdrop_mV_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
        expect(relErr(res(r, 'power loss').value.si * 1e3, vec(`via_task7a_power_mW_${tag}`).pinned_expected)).toBeLessThanOrEqual(TOL);
      } else {
        expect(has(r, 'voltage drop')).toBe(false);
        expect(has(r, 'power loss')).toBe(false);
      }
    });
  }
  it('the pre-existing skill vectors (A, R, theta for d 0.3 / t 25 um test value / L 1.6) still hold through the calculator', () => {
    const r = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(20) }));
    expect(relErr(toUnit(res(r, A_BARREL).value, 'mm2'), vec('via_area_mm2_0.3fin_25um').pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, R_T).value.si * 1e3, vec('via_R_mohm_1.6mm').pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, THETA_1).value.si, vec('via_theta_KperW_1.6mm').pinned_expected)).toBeLessThanOrEqual(TOL);
  });
  it('hand check: d 0.3 mm, t 25 um: A = pi x 25e-6 x 325e-6 = 2.5525e-8 m2; R20 = 1.6e-3/(58e6 x A) = 1.0807 mOhm', () => {
    const r = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(20) }));
    expect(Math.abs(res(r, A_BARREL).value.si - 2.5525e-8)).toBeLessThan(5e-13);
    expect(Math.abs(res(r, R_20).value.si - 1.0807e-3)).toBeLessThan(5e-8);
  });
});

describe('result set, bounds, roles, dimensions', () => {
  it('exact result names without current', () => {
    const r = ok(via(0.3, 25, 1.6, 2, { conductorTemperature: degC(25) }));
    expect(r.results.map((x) => x.name).sort()).toEqual(
      [A_BARREL, 'barrel copper area (all vias)', R_T, R_20, 'resistance of one via at conductor temperature', 'resistivity at conductor temperature', 'conductor temperature', THETA_1, THETA_N].sort(),
    );
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([R_T]);
    expect(r.designValues).toEqual([]);
  });
  it('directional rounding: R, drop, power, theta are prediction; barrel area is nominal', () => {
    const r = ok(via(0.3, 25, 1.6, 2, { conductorTemperature: degC(85), current: amp(1) }));
    for (const n of [R_T, R_20, 'resistance of one via at conductor temperature', THETA_1, THETA_N, 'voltage drop', 'power loss', 'conductor temperature']) {
      expect(res(r, n).bound, n).toBe('prediction');
    }
    expect(res(r, A_BARREL).bound).toBe('nominal');
    expect(res(r, 'barrel copper area (all vias)').bound).toBe('nominal');
  });
  it('dimensions', () => {
    const r = ok(via(0.3, 25, 1.6, 2, { conductorTemperature: degC(85), current: amp(1) }));
    expect(sameDim(res(r, A_BARREL).value, q(1, DIM.AREA))).toBe(true);
    expect(sameDim(res(r, R_T).value, q(1, DIM.RESISTANCE))).toBe(true);
    expect(sameDim(res(r, THETA_N).value, q(1, DIM.THERMAL_RESISTANCE))).toBe(true);
    expect(sameDim(res(r, 'voltage drop').value, q(1, DIM.VOLTAGE))).toBe(true);
    expect(sameDim(res(r, 'power loss').value, q(1, DIM.POWER))).toBe(true);
    expect(sameDim(res(r, 'conductor temperature').value, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
  });
  it('N = 1: array results equal the single-via results', () => {
    const r = ok(via(0.3, 25, 1.6, 1));
    expect(res(r, R_T).value.si).toBe(res(r, 'resistance of one via at conductor temperature').value.si);
    expect(res(r, THETA_N).value.si).toBe(res(r, THETA_1).value.si);
  });
});

describe('provenance, assumptions, warnings, scope (no rating, no temperature rise)', () => {
  it('conductor temperature defaults to 25 C and is marked default; plating and geometry are user inputs', () => {
    const r = ok(via(0.3, 25, 1.6, 1));
    const t = r.inputs.find((i) => i.name === 'conductor temperature');
    expect(t?.source).toBe('default');
    expect(toUnit(t?.value as Quantity, 'degC')).toBeCloseTo(25, 9);
    for (const n of ['finished hole diameter', 'plating thickness', 'barrel length', 'via count']) {
      expect(r.inputs.find((i) => i.name === n)?.source, n).toBe('user');
    }
    const k = r.inputs.find((i) => i.name === 'thermal conductivity material');
    expect(k).toBeUndefined();
    expect(r.assumptions.join(' ')).toContain('pure-401');
  });
  it('k material default is stated with the status and the non-conservative direction; selecting 391 changes theta only', () => {
    const a = ok(via(0.3, 25, 1.6, 1));
    const b = ok(via(0.3, 25, 1.6, 1, { kMaterial: 'c11000-391' }));
    const text = a.assumptions.join(' ');
    expect(text).toMatch(/S-007/);
    expect(text).toMatch(/CONFLICT/);
    expect(text).toMatch(/non-conservative/);
    expect(res(b, THETA_1).value.si).toBeGreaterThan(res(a, THETA_1).value.si);
    expect(res(b, R_T).value.si).toBe(res(a, R_T).value.si);
    expect(b.assumptions.join(' ')).toContain('c11000-391');
  });
  it('states that theta is axial conduction only, is not a trace-to-ambient resistance, and that no rating or temperature rise is claimed', () => {
    const r = ok(via(0.3, 25, 1.6, 1, { current: amp(1) }));
    const all = [...r.assumptions, ...r.warnings.map((w) => w.message), r.recommendation].join(' ');
    expect(all).toMatch(/axial/i);
    expect(all).toMatch(/not a trace-to-ambient/i);
    expect(all).toMatch(/no current rating/i);
    expect(r.results.some((x) => /temperature rise|rating/i.test(x.name))).toBe(false);
    expect(r.designValues).toHaveLength(0);
  });
  it('default resistivity warns that plated copper is usually higher (non-conservative for R); S-012 is cited', () => {
    const r = ok(via(0.3, 25, 1.6, 1));
    const w = r.warnings.find((x) => x.code === 'PLATED_RESISTIVITY');
    expect(w?.severity).toBe('caution');
    expect(w?.message).toMatch(/non-conservative/);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-004', 'S-007', 'S-012', 'S-015']));
  });
  it('a resistivity override is used, echoed as a user input, and the caution still applies', () => {
    const rho = q(2.0e-8, DIM.RESISTIVITY);
    const a = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(20) }));
    const b = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(20), resistivity: rho }));
    expect(relErr(res(b, R_20).value.si, res(a, R_20).value.si * (2.0e-8 / RHO20))).toBeLessThanOrEqual(1e-12);
    expect(b.inputs.find((i) => i.name === 'plated copper resistivity')?.source).toBe('user');
    expect(b.warnings.some((x) => x.code === 'RESISTIVITY_OVERRIDE')).toBe(true);
    expect(b.assumptions.join(' ')).toMatch(/S-012/);
  });
  it('N > 1 warns about current crowding and unequal sharing and labels R/N ideal; N = 1 does not', () => {
    const many = ok(via(0.3, 25, 1.6, 4, { current: amp(2) }));
    const w = many.warnings.find((x) => x.code === 'PARALLEL_SHARING');
    expect(w?.severity).toBe('caution');
    expect(w?.message).toMatch(/crowding/i);
    expect(w?.message).toMatch(/unequal/i);
    expect(many.assumptions.join(' ')).toMatch(/ideal/i);
    expect(ok(via(0.3, 25, 1.6, 1)).warnings.some((x) => x.code === 'PARALLEL_SHARING')).toBe(false);
  });
  it('plating thicker than the finished hole diameter warns; aspect ratio L/d is an info step with no limit', () => {
    const thick = ok(via(0.1, 120, 1.6, 1));
    expect(thick.warnings.some((x) => x.code === 'PLATING_EXCEEDS_HOLE')).toBe(true);
    const r = ok(via(0.3, 25, 1.6, 1));
    expect(r.warnings.some((x) => x.code === 'PLATING_EXCEEDS_HOLE')).toBe(false);
    const ar = r.warnings.find((x) => x.code === 'ASPECT_RATIO');
    expect(ar?.severity).toBe('info');
    expect(ar?.message).toMatch(/fabricator/i);
    const step = r.steps.find((s) => s.label === 'Aspect ratio L/d');
    expect(step).toBeDefined();
    expect(Math.abs((step as { value: Quantity }).value.si - 1.6 / 0.3)).toBeLessThan(1e-12);
  });
  it('states that no self-heating coupling is done and drop is not a rail budget', () => {
    const r = ok(via(0.3, 25, 1.6, 1, { current: amp(1) }));
    expect(r.assumptions.join(' ')).toMatch(/no self-heating/i);
    expect(r.warnings.some((x) => x.code === 'VIA_ONLY_SCOPE')).toBe(true);
  });
  it('no compliance wording', () => {
    const r = ok(via(0.3, 25, 1.6, 4, { current: amp(1) }));
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/complian|production[ ]safe/i);
  });
});

describe('confidence and data status (rule based)', () => {
  it('data status is CONFLICT (S-007) and confidence is never high; defaulted temperature counts', () => {
    const r = ok(via(0.3, 25, 1.6, 1));
    expect(r.dataStatus).toBe('CONFLICT');
    expect(r.confidence.level).not.toBe('high');
    expect(r.confidence.reasons.length).toBeGreaterThan(0);
    const u = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(25), kMaterial: 'pure-401' }));
    expect(u.confidence.score).toBeLessThan(r.confidence.score);
  });
  it('conductor temperature outside the plausibility range fails a validity check and forces low', () => {
    const r = ok(via(0.3, 25, 1.6, 1, { conductorTemperature: degC(300) }));
    expect(r.validityChecks.some((c) => !c.ok)).toBe(true);
    expect(r.confidence.level).toBe('low');
  });
});

describe('property tests', () => {
  const dArb = fc.double({ min: 0.05, max: 2, noNaN: true });
  const tArb = fc.double({ min: 5, max: 100, noNaN: true });
  const LArb = fc.double({ min: 0.1, max: 6, noNaN: true });
  const NArb = fc.integer({ min: 1, max: 64 });
  const TArb = fc.double({ min: -40, max: 140, noNaN: true });
  const rOf = (d: number, t: number, L: number, N: number, T: number): number => res(ok(via(d, t, L, N, { conductorTemperature: degC(T) })), R_T).value.si;

  it('R matches the formula for any valid input', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, NArb, TArb, (d, t, L, N, T) => {
        expect(relErr(rOf(d, t, L, N, T), refR(d * 1e-3, t * 1e-6, L * 1e-3, N, T))).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('R is strictly decreasing in t and d, increasing in L and T', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, TArb, (d, t, L, T) => {
        const base = rOf(d, t, L, 1, T);
        expect(rOf(d, t * 1.1, L, 1, T)).toBeLessThan(base);
        expect(rOf(d * 1.1, t, L, 1, T)).toBeLessThan(base);
        expect(rOf(d, t, L * 1.1, 1, T)).toBeGreaterThan(base);
        expect(rOf(d, t, L, 1, T + 10)).toBeGreaterThan(base);
      }),
      { numRuns: 100 },
    );
  });
  it('parallel: R(N) = R(1)/N and theta(N) = theta(1)/N, per-barrel quantities unchanged', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, NArb, (d, t, L, N) => {
        const a = ok(via(d, t, L, 1));
        const b = ok(via(d, t, L, N));
        expect(relErr(res(b, R_T).value.si * N, res(a, R_T).value.si)).toBeLessThan(1e-12);
        expect(relErr(res(b, THETA_N).value.si * N, res(a, THETA_1).value.si)).toBeLessThan(1e-12);
        expect(res(b, THETA_1).value.si).toBe(res(a, THETA_1).value.si);
        expect(res(b, A_BARREL).value.si).toBe(res(a, A_BARREL).value.si);
      }),
      { numRuns: 100 },
    );
  });
  it('theta = L/(k A) with k 401 and 391, and R x theta ratio is independent of geometry', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, (d, t, L) => {
        const A = refArea(d * 1e-3, t * 1e-6);
        const r1 = ok(via(d, t, L, 1));
        const r2 = ok(via(d, t, L, 1, { kMaterial: 'c11000-391' }));
        expect(relErr(res(r1, THETA_1).value.si, (L * 1e-3) / (401 * A))).toBeLessThan(1e-12);
        expect(relErr(res(r2, THETA_1).value.si, (L * 1e-3) / (391 * A))).toBeLessThan(1e-12);
        // R20 / theta = rho20 k, a constant of the material only.
        expect(relErr(res(r1, R_20).value.si / res(r1, THETA_1).value.si, RHO20 * 401)).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('energy: P = I^2 R = I x V for any current; V = I R', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, NArb, fc.double({ min: 0.001, max: 50, noNaN: true }), (d, t, L, N, I) => {
        const r = ok(via(d, t, L, N, { current: amp(I) }));
        const R = res(r, R_T).value.si;
        const V = res(r, 'voltage drop').value.si;
        const P = res(r, 'power loss').value.si;
        expect(relErr(V, I * R)).toBeLessThan(1e-12);
        expect(relErr(P, I * I * R)).toBeLessThan(1e-12);
        expect(relErr(P, I * V)).toBeLessThan(1e-12);
      }),
      { numRuns: 100 },
    );
  });
  it('no NaN or non-finite value in any output (assertCalcResult passes on every generated case)', () => {
    fc.assert(
      fc.property(dArb, tArb, LArb, NArb, TArb, (d, t, L, N, T) => {
        const r = ok(via(d, t, L, N, { conductorTemperature: degC(T), current: amp(1) }));
        for (const x of r.results) expect(Number.isFinite(x.value.si)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

describe('guards: errors are values, never throws, never a number from invalid input', () => {
  const bad = (inputs: unknown, code: string, field?: string): void => {
    const out = compute(inputs as Inputs);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe(code);
      if (field !== undefined) expect(out.error.field).toBe(field);
    }
    expect(() => compute(inputs as Inputs)).not.toThrow();
  };
  const base = (): Inputs => via(0.3, 25, 1.6, 1);
  const rawQ = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;

  for (const field of ['finishedHoleDiameter', 'platingThickness', 'barrelLength'] as const) {
    for (const [label, v] of [['zero', 0], ['negative', -1e-3], ['NaN', Number.NaN], ['Infinity', Infinity], ['-Infinity', -Infinity]] as const) {
      it(`${field} ${label}`, () => bad({ ...base(), [field]: rawQ(v, DIM.LENGTH) }, 'INVALID_INPUT', field));
    }
    it(`${field} wrong dimension`, () => bad({ ...base(), [field]: amp(1) }, 'DIMENSION', field));
    it(`${field} missing`, () => bad({ ...base(), [field]: undefined }, 'INVALID_INPUT', field));
  }
  it('plating thickness is required: no default is ever applied', () => {
    const { platingThickness: _omit, ...rest } = base();
    void _omit;
    bad(rest, 'INVALID_INPUT', 'platingThickness');
  });
  for (const [label, n] of [['zero', 0], ['negative', -2], ['fraction', 2.5], ['NaN', Number.NaN], ['Infinity', Infinity], ['string', '4'], ['undefined', undefined], ['huge', 1e300]] as const) {
    it(`count ${label}`, () => bad({ ...base(), count: n }, 'INVALID_INPUT', 'count'));
  }
  it('current: zero, negative, wrong dimension', () => {
    bad({ ...base(), current: rawQ(0, DIM.CURRENT) }, 'INVALID_INPUT', 'current');
    bad({ ...base(), current: rawQ(-1, DIM.CURRENT) }, 'INVALID_INPUT', 'current');
    bad({ ...base(), current: mm(1) }, 'DIMENSION', 'current');
  });
  it('conductor temperature: a temperature difference or a length is a dimension error; zero kelvin or below is rejected', () => {
    bad({ ...base(), conductorTemperature: fromUnit(10, 'ddegC') }, 'DIMENSION', 'conductorTemperature');
    bad({ ...base(), conductorTemperature: mm(1) }, 'DIMENSION', 'conductorTemperature');
    bad({ ...base(), conductorTemperature: rawQ(0, DIM.ABS_TEMPERATURE) }, 'INVALID_INPUT', 'conductorTemperature');
  });
  it('resistivity override: zero, wrong dimension', () => {
    bad({ ...base(), resistivity: rawQ(0, DIM.RESISTIVITY) }, 'INVALID_INPUT', 'resistivity');
    bad({ ...base(), resistivity: mm(1) }, 'DIMENSION', 'resistivity');
  });
  it('unknown k material and non-object inputs', () => {
    bad({ ...base(), kMaterial: 'aluminium' }, 'INVALID_INPUT', 'kMaterial');
    bad({ ...base(), kMaterial: 401 }, 'INVALID_INPUT', 'kMaterial');
    bad(null, 'INVALID_INPUT');
    bad(undefined, 'INVALID_INPUT');
    bad(42, 'INVALID_INPUT');
  });
  it('mixed dimensions never combine: a plating thickness given as an area is a dimension error', () => {
    bad({ ...base(), platingThickness: q(1e-8, DIM.AREA) }, 'DIMENSION', 'platingThickness');
  });
  it('underflow and overflow-scale inputs return an error value, not NaN', () => {
    const out = compute({ ...base(), platingThickness: rawQ(1e-200, DIM.LENGTH), finishedHoleDiameter: rawQ(1e-200, DIM.LENGTH) });
    expect(out.ok).toBe(false);
    const big = compute({ ...base(), barrelLength: rawQ(1e300, DIM.LENGTH), platingThickness: rawQ(1e-100, DIM.LENGTH), finishedHoleDiameter: rawQ(1e-100, DIM.LENGTH) });
    expect(big.ok).toBe(false);
  });
  it('validate returns the checked quantities on success', () => {
    const v = validate(base());
    expect(v.ok).toBe(true);
  });
});

describe('metadata and performance', () => {
  it('meta lists the ledger rows and an analytical accuracy class; the displayed formula is the one in meta', () => {
    expect(meta.accuracyClass).toBe('analytical');
    expect(meta.ledgerIds).toEqual(expect.arrayContaining(['S-004', 'S-007', 'S-012', 'S-015']));
    expect(ok(via(0.3, 25, 1.6, 1)).formula).toBe(meta.formula);
    expect(meta.formula).toMatch(/π·t·\(d \+ t\)/);
  });
  it('10 000 computes within a 5 s total budget', () => {
    const inp = via(0.3, 25, 1.6, 4, { current: amp(1), conductorTemperature: degC(60) });
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) compute(inp);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
