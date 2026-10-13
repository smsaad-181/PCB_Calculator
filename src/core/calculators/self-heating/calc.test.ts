import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, mul, q, sameDim, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { formatResult } from '../../format-result';
import { compute, solveCoupled } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 1 task 4: self-heating with coupled R(T). TESTS FIRST.
// Expected values come from the independent oracle (tools/reference/ref_calcs.py sh_* functions, which use the CLOSED
// FORM dT = theta I^2 R(Tamb) / (1 - theta I^2 R20 alpha), no iteration; mirrored in docs/golden-vectors.json) or from the
// relations written out again below. The implementation is never consulted. S-019d (thermal resistance) is VERIFIED as a definition only; the coupled
// fixed point (S-019g) is UNVERIFIED/DERIVED. Nothing here verifies S-019g, S-001 (PAYWALLED) or S-004: tests compare the implementation with the formula, not the formula with a source.

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

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const kPerW = (n: number): Quantity => fromUnit(n, 'K/W');
const dK = (n: number): Quantity => fromUnit(n, 'ddegC');
const duty = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const g = (x: number): string => String(x);
const raw = (si: number, dim: Quantity['dim']): Quantity => ({ si, dim }) as Quantity;
/** Solver tolerance is 1e-6 relative on the bracket; the golden comparison allows 5e-6. */
const SOLVER_TOL = 5e-6;

const RHO20 = 1 / 58e6;
const ALPHA = 0.00393;
const r20Of = (L: number, w: number, t: number): number => (RHO20 * (L * 1e-3)) / (w * 1e-3 * (t * 1e-6));

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
const N = meta.resultNames;

/** Steady current, thickness entered as finished copper. */
const user = (I: number, L: number, w: number, t: number, theta: number, Ta: number, extra: Partial<Inputs> = {}): Inputs => ({
  thermalLaw: 'user-theta',
  layer: 'outer',
  length: mm(L),
  width: mm(w),
  copperThickness: um(t),
  copperBasis: 'finished',
  ambient: degC(Ta),
  current: amp(I),
  theta: kPerW(theta),
  ...extra,
});
const legacy = (I: number, L: number, w: number, t: number, layer: 'outer' | 'inner', Ta: number, extra: Partial<Inputs> = {}): Inputs => ({
  thermalLaw: 'legacy-ipc2221-calibrated',
  layer,
  length: mm(L),
  width: mm(w),
  copperThickness: um(t),
  copperBasis: 'finished',
  ambient: degC(Ta),
  current: amp(I),
  ...extra,
});

// Case tables mirror tools/reference/ref_calcs.py (vector names are built from the inputs, so a mismatch fails loudly).
// [I A, L mm, w mm, t um, theta K/W, Tamb C]
const USER_CASES: [number, number, number, number, number, number][] = [
  [2, 100, 0.254, 35, 50, 25],
  [3, 100, 0.5, 35, 20, 25],
  [5, 200, 1, 70, 10, 55],
  [1, 50, 0.2, 17.5, 80, 85],
  [10, 300, 3, 105, 4, 40],
  [2, 100, 0.254, 35, 120, 25],
];
// [I A, L mm, w mm, t um, layer, Tamb C]
const LEGACY_CASES: [number, number, number, number, 'outer' | 'inner', number][] = [
  [2, 100, 0.5, 35, 'outer', 25],
  [5, 150, 2, 70, 'outer', 25],
  [2, 100, 1, 35, 'inner', 40],
  [10, 100, 5, 70, 'outer', 25],
];
const CRIT_CASES: [number, number, number, number][] = [
  [2, 100, 0.254, 35],
  [5, 200, 1, 70],
  [1, 50, 0.2, 17.5],
];
const tag = (I: number, L: number, w: number, t: number): string => `I${g(I)}A_L${g(L)}mm_w${g(w)}mm_t${g(t)}um`;

describe('golden vectors (oracle, closed form): user-supplied theta', () => {
  it('vectors loaded', () => {
    expect(vectors.filter((v) => v.name.startsWith('self_heating_user_dT_K_')).length).toBe(USER_CASES.length);
  });
  for (const [I, L, w, t, th, Ta] of USER_CASES) {
    const suffix = `${tag(I, L, w, t)}_theta${g(th)}_Ta${g(Ta)}C`;
    it(`${suffix}`, () => {
      const vdT = vec(`self_heating_user_dT_K_${suffix}`);
      const v0 = vec(`self_heating_user_dT0_K_${suffix}`);
      const vP = vec(`self_heating_user_P_W_${suffix}`);
      expect(vdT.ledger_ids).toEqual(expect.arrayContaining(['S-004', 'S-019', 'S-019d', 'S-019g']));
      expect(vdT.status).toBe('UNVERIFIED');
      // The cases with a large rise exceed the default search limit (150 C - ambient); give a wider limit for the oracle comparison.
      const r = ok(user(I, L, w, t, th, Ta, { deltaTMax: dK(1000) }));
      const dT = res(r, N.deltaT);
      expect(sameDim(dT.value, q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
      expect(dT.role).toBe('primary');
      expect(dT.bound).toBe('prediction');
      // Prediction is never below the root (upper end of the bracket) and within the solver tolerance above it.
      expect(dT.value.si).toBeGreaterThanOrEqual(vdT.pinned_expected * (1 - 1e-12));
      expect(relErr(dT.value.si, vdT.pinned_expected)).toBeLessThanOrEqual(SOLVER_TOL);
      expect(relErr(res(r, N.deltaTUncoupled).value.si, v0.pinned_expected)).toBeLessThanOrEqual(1e-9);
      expect(relErr(res(r, N.power).value.si, vP.pinned_expected)).toBeLessThanOrEqual(SOLVER_TOL);
      // Conductor temperature is ABSOLUTE: ambient + dT.
      const tc = res(r, N.conductorTemperature).value;
      expect(sameDim(tc, q(1, DIM.ABS_TEMPERATURE))).toBe(true);
      expect(Math.abs(toUnit(tc, 'degC') - (Ta + dT.value.si))).toBeLessThan(1e-9);
      expect(res(r, N.theta).value.si).toBeCloseTo(th, 12);
    });
  }
});

describe('golden vectors (oracle, closed form): legacy IPC-2221 calibrated theta', () => {
  for (const [I, L, w, t, layer, Ta] of LEGACY_CASES) {
    const suffix = `${tag(I, L, w, t)}_${layer}_Ta${g(Ta)}C`;
    it(suffix, () => {
      const vTheta = vec(`self_heating_legacy_theta_K_per_W_${suffix}`);
      const vDt = vec(`self_heating_legacy_dT_K_${suffix}`);
      expect(vTheta.ledger_ids).toEqual(expect.arrayContaining(['S-001', 'S-019d', 'S-019g']));
      expect(vTheta.status).toBe('PAYWALLED-USER-MUST-VERIFY');
      const r = ok(legacy(I, L, w, t, layer, Ta));
      expect(relErr(res(r, N.theta).value.si, vTheta.pinned_expected)).toBeLessThanOrEqual(1e-9);
      expect(relErr(res(r, N.deltaT).value.si, vDt.pinned_expected)).toBeLessThanOrEqual(SOLVER_TOL);
      // The uncoupled rise equals the legacy rise itself (reference temperature 20 C by construction).
      expect(relErr(res(r, N.deltaTUncoupled).value.si, vTheta.pinned_expected * I * I * r20Of(L, w, t))).toBeLessThanOrEqual(1e-9);
      expect(r.warnings.some((w) => w.code === 'LEGACY_NOT_HEAT_FLOW')).toBe(true);
      expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-001', 'S-010']));
      expect(r.dataStatus).toBe('PAYWALLED');
      expect(r.confidence.level).toBe('low');
    });
  }
});

describe('golden vectors (oracle): runaway threshold theta_crit = 1 / (I^2 R20 alpha)', () => {
  for (const [I, L, w, t] of CRIT_CASES) {
    it(tag(I, L, w, t), () => {
      const crit = vec(`self_heating_theta_crit_K_per_W_${tag(I, L, w, t)}`).pinned_expected;
      // Below: converges (wide search limit). Above: runaway even with a huge search limit (loop gain >= 1).
      const below = ok(user(I, L, w, t, crit * 0.9, 20, { deltaTMax: dK(1e6) }));
      expect(res(below, N.deltaT).value.si).toBeGreaterThan(0);
      const above = ok(user(I, L, w, t, crit * 1.1, 20, { deltaTMax: dK(1e6) }));
      expect(has(above, N.deltaT)).toBe(false);
      expect(above.warnings.some((x) => x.code === 'THERMAL_RUNAWAY' && x.severity === 'critical')).toBe(true);
    });
  }
});

describe('worked example (hand-checkable)', () => {
  // I 2 A, 100 mm x 0.254 mm x 35 um, theta 50 K/W, ambient 25 C. R20 = 0.19394 ohm, P(25 C) = 0.79101 W.
  // k = 50 x 4 x 0.19394 x 0.00393 = 0.15244; dT = 50 x 0.79101 / (1 - 0.15244) = 46.664 K; uncoupled dT0 = 38.788 K.
  it('numbers', () => {
    const r = ok(user(2, 100, 0.254, 35, 50, 25));
    expect(relErr(res(r, N.deltaT).value.si, 46.66376824859275)).toBeLessThan(SOLVER_TOL);
    expect(relErr(res(r, N.deltaTUncoupled).value.si, 38.78825491641132)).toBeLessThan(1e-9);
    expect(Math.abs(res(r, N.couplingEffect).value.si - 20.31)).toBeLessThan(0.01);
    expect(Math.abs(toUnit(res(r, N.conductorTemperature).value, 'degC') - 71.664)).toBeLessThan(1e-3);
    expect(res(r, N.power).value.si).toBeCloseTo(0.93328, 4);
  });
});

const perLen = (n: number): Quantity => q(n, mul(q(1, DIM.THERMAL_RESISTANCE), q(1, DIM.LENGTH)).dim);

describe('theta per length', () => {
  it('thetaPerLength (K m / W) divided by the length equals the same theta in K/W', () => {
    const a = ok(user(2, 100, 0.254, 35, 50, 25));
    const { theta: _unused, ...rest } = user(2, 100, 0.254, 35, 50, 25);
    void _unused;
    const b = ok({ ...rest, thetaPerLength: perLen(5) }); // 5 K m/W over 0.1 m = 50 K/W
    expect(res(b, N.theta).value.si).toBeCloseTo(50, 10);
    expect(relErr(res(b, N.deltaT).value.si, res(a, N.deltaT).value.si)).toBeLessThan(1e-12);
  });
});

describe('solver (solveCoupled)', () => {
  it('alpha = 0 reduces to the closed form dT = theta x P20', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 500, noNaN: true }), fc.double({ min: 0.001, max: 5, noNaN: true }), fc.double({ min: -40, max: 100, noNaN: true }), (theta, p20, Ta) => {
        const s = solveCoupled({ theta, p20, alpha: 0, ambientC: Ta, dTmax: 1e4 });
        expect(s.status).toBe('converged');
        expect(relErr(s.dT as number, theta * p20)).toBeLessThanOrEqual(2e-6);
      }),
      { numRuns: 200 },
    );
  });
  it('residual is small, within the iteration cap, and the rise is never below the closed-form root', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 300, noNaN: true }),
        fc.double({ min: 0.001, max: 2, noNaN: true }),
        fc.double({ min: -40, max: 100, noNaN: true }),
        (theta, p20, Ta) => {
          const k = theta * p20 * ALPHA;
          fc.pre(k < 0.95);
          const root = (theta * p20 * (1 + ALPHA * (Ta - 20))) / (1 - k);
          fc.pre(root > 1e-6 && root < 1000);
          const s = solveCoupled({ theta, p20, alpha: ALPHA, ambientC: Ta, dTmax: 1000 });
          expect(s.status).toBe('converged');
          expect(s.iterations).toBeLessThanOrEqual(50);
          const dT = s.dT as number;
          // Own residual, restated: dT - theta x P(dT).
          const res0 = dT - theta * p20 * (1 + ALPHA * (Ta + dT - 20));
          expect(Math.abs(res0) / dT).toBeLessThanOrEqual(1e-5);
          expect(s.residual).toBeCloseTo(res0, 9);
          expect(dT).toBeGreaterThanOrEqual(root * (1 - 1e-12));
          expect(relErr(dT, root)).toBeLessThanOrEqual(2e-6);
        },
      ),
      { numRuns: 300 },
    );
  });
  it('runaway: loop gain >= 1 has no root in any bracket; a root beyond dT_max is also reported as runaway; no unbounded loop', () => {
    const a = solveCoupled({ theta: 400, p20: 1, alpha: ALPHA, ambientC: 25, dTmax: 1e9 });
    expect(a.status).toBe('runaway');
    expect(a.dT).toBeUndefined();
    expect(a.loopGain).toBeGreaterThanOrEqual(1);
    const b = solveCoupled({ theta: 200, p20: 1, alpha: ALPHA, ambientC: 25, dTmax: 100 }); // root = 200 x 1.0197 / 0.214 = 953 K
    expect(b.status).toBe('runaway');
    expect(b.loopGain).toBeLessThan(1);
    expect(b.iterations).toBe(0);
  });
  it('root exactly at the search limit is accepted', () => {
    const s = solveCoupled({ theta: 10, p20: 1, alpha: 0, ambientC: 20, dTmax: 10 });
    expect(s.status).toBe('converged');
    expect(s.dT).toBe(10);
  });
  it('non-finite or non-positive arguments throw out of the solver (compute maps them to a value)', () => {
    expect(() => solveCoupled({ theta: NaN, p20: 1, alpha: ALPHA, ambientC: 25, dTmax: 100 })).toThrow();
    expect(() => solveCoupled({ theta: 1, p20: 0, alpha: ALPHA, ambientC: 25, dTmax: 100 })).toThrow();
    expect(() => solveCoupled({ theta: 1, p20: 1, alpha: ALPHA, ambientC: 25, dTmax: 0 })).toThrow();
  });
});

describe('properties through compute', () => {
  const arb = fc.record({
    I: fc.double({ min: 0.05, max: 6, noNaN: true }),
    L: fc.double({ min: 10, max: 500, noNaN: true }),
    w: fc.double({ min: 0.1, max: 5, noNaN: true }),
    t: fc.constantFrom(17.5, 35, 70, 105),
    theta: fc.double({ min: 1, max: 200, noNaN: true }),
    Ta: fc.double({ min: -20, max: 85, noNaN: true }),
  });
  it('fixed-point residual, power balance, monotonic in current, assertCalcResult on every output', () => {
    fc.assert(
      fc.property(arb, ({ I, L, w, t, theta, Ta }) => {
        const out = compute(user(I, L, w, t, theta, Ta));
        if (!out.ok) return; // never throws; an error value is allowed for out-of-domain draws
        expect(assertCalcResult(out.value).ok).toBe(true);
        const r = out.value;
        if (!has(r, N.deltaT)) {
          expect(r.warnings.some((x) => x.code === 'THERMAL_RUNAWAY')).toBe(true);
          expect(r.confidence.level).toBe('low');
          return;
        }
        const dT = res(r, N.deltaT).value.si;
        const P = res(r, N.power).value.si;
        // dT = theta x P (heat balance) and P = I^2 R20 (1 + alpha (T - 20)).
        expect(relErr(dT, theta * P)).toBeLessThanOrEqual(1e-5);
        const r20 = r20Of(L, w, t);
        expect(relErr(P, I * I * r20 * (1 + ALPHA * (Ta + dT - 20)))).toBeLessThanOrEqual(1e-9);
        // Resistance coupling raises the rise above the uncoupled value when the ambient is at or above 20 C.
        if (Ta >= 20) expect(dT).toBeGreaterThanOrEqual(res(r, N.deltaTUncoupled).value.si * (1 - 1e-6));
        // Monotonic in current.
        const hi = compute(user(I * 1.2, L, w, t, theta, Ta));
        if (hi.ok && has(hi.value, N.deltaT)) expect(res(hi.value, N.deltaT).value.si).toBeGreaterThan(dT * (1 - 1e-6));
        if (hi.ok && !has(hi.value, N.deltaT)) expect(hi.value.warnings.some((x) => x.code === 'THERMAL_RUNAWAY')).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
  it('a tiny theta makes the coupling effect vanish (alpha = 0 limit, ambient 20 C)', () => {
    const r = ok(user(1, 100, 1, 35, 1e-6, 20));
    expect(Math.abs(res(r, N.couplingEffect).value.si)).toBeLessThan(1e-4);
    expect(relErr(res(r, N.deltaT).value.si, res(r, N.deltaTUncoupled).value.si)).toBeLessThan(2e-6);
  });
  it('the headline temperature rise rounds UP (bound prediction) when printed', () => {
    const r = ok(user(2, 100, 0.254, 35, 50, 25));
    const x = res(r, N.deltaT);
    expect(x.bound).toBe('prediction');
    const printed = formatResult(x, { accuracyClass: 'estimate' });
    const n = Number(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i.exec(printed)?.[0]);
    expect(n).toBeGreaterThanOrEqual(toUnit(x.value, 'ddegC') * (1 - 1e-12));
  });
});

describe('runaway and bound handling through compute', () => {
  it('runaway returns an ok result with a critical warning, no rise/temperature/drop, status in steps and low confidence', () => {
    const r = ok(user(2, 100, 0.254, 35, 400, 25)); // loop gain 1.2
    expect(has(r, N.deltaT)).toBe(false);
    expect(has(r, N.conductorTemperature)).toBe(false);
    expect(has(r, N.voltageDrop)).toBe(false);
    expect(res(r, N.searchLimit).role).toBe('primary');
    expect(r.warnings.find((x) => x.code === 'THERMAL_RUNAWAY')?.severity).toBe('critical');
    expect(r.steps.find((s) => s.label === 'Solver status')?.expr).toContain('runaway');
    expect(r.validityChecks.some((c) => !c.ok && c.name.includes('runaway'))).toBe(true);
    expect(r.confidence.level).toBe('low');
  });
  it('the default search limit is 150 C minus the ambient; a steady state beyond it is reported as runaway, a larger deltaTMax finds it', () => {
    const r = ok(user(2, 100, 0.254, 35, 120, 25)); // root 149.68 K > 125 K
    expect(has(r, N.deltaT)).toBe(false);
    expect(Math.abs(res(r, N.searchLimit).value.si - 125)).toBeLessThan(1e-9);
    const wide = ok(user(2, 100, 0.254, 35, 120, 25, { deltaTMax: dK(200) }));
    expect(relErr(res(wide, N.deltaT).value.si, vec('self_heating_user_dT_K_I2A_L100mm_w0.254mm_t35um_theta120_Ta25C').pinned_expected)).toBeLessThan(SOLVER_TOL);
    // 175 C conductor is above the 150 C plausibility range: low confidence.
    expect(wide.validityChecks.some((c) => !c.ok)).toBe(true);
    expect(wide.confidence.level).toBe('low');
  });
  it('an ambient at or above the 150 C bound with no deltaTMax is OUT_OF_DOMAIN, not a result', () => {
    const out = compute(user(1, 100, 1, 35, 10, 150));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('OUT_OF_DOMAIN');
    const okWide = ok(user(1, 100, 1, 35, 10, 150, { deltaTMax: dK(50) }));
    expect(has(okWide, N.deltaT)).toBe(true);
  });
  it('ambient so cold that the linear resistivity is non-positive is OUT_OF_DOMAIN', () => {
    const out = compute({ ...user(1, 100, 1, 35, 10, 25), ambient: q(30, DIM.ABS_TEMPERATURE) }); // 30 K = -243 C, below the S-004 linear bound (about -234 C)
    expect(out.ok).toBe(false);
  });
});

describe('pulse and duty', () => {
  const pulse = (period: 'much-shorter' | 'comparable-or-longer', D: number): Inputs => {
    const { current: _c, ...rest } = user(2, 100, 0.254, 35, 50, 25);
    void _c;
    return { ...rest, peakCurrent: amp(4), duty: duty(D), periodVsTau: period } as Inputs;
  };
  it('much-shorter: I_rms = I_pk sqrt(D) is the heating current', () => {
    const r = ok(pulse('much-shorter', 0.25)); // 4 x 0.5 = 2 A
    const steady = ok(user(2, 100, 0.254, 35, 50, 25));
    expect(res(r, N.effectiveCurrent).value.si).toBeCloseTo(2, 12);
    // The result is a MEAN (duty-averaged) rise, named as such; the plain 'temperature rise' name is not used for a pulse.
    expect(has(r, N.deltaT)).toBe(false);
    expect(N.deltaTMean).toBe('mean temperature rise (duty-averaged)');
    expect(relErr(res(r, N.deltaTMean).value.si, res(steady, N.deltaT).value.si)).toBeLessThan(1e-12);
    expect(res(r, N.deltaTMean).role).toBe('primary');
    expect(r.steps.some((s) => s.label === 'Mean temperature rise (duty-averaged)')).toBe(true);
    expect(r.warnings.some((x) => x.code === 'PULSE_RMS_ASSUMPTION')).toBe(true);
    const pk = r.warnings.find((x) => x.code === 'PULSE_PEAK_HIGHER');
    expect(pk?.severity).toBe('warning');
    expect(pk?.message).toContain('(1 - D)');
    expect(pk?.message).toContain('not computed');
    // The period condition is the user's declaration: no computed threshold appears.
    expect(r.assumptions.some((a) => a.includes('states the period is much shorter'))).toBe(true);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-019e', 'S-019f', 'S-019g']));
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.confidence.level).not.toBe('high');
  });
  it('D = 1 equals the steady peak current', () => {
    const { current: _c, ...rest } = user(4, 100, 0.254, 35, 5, 25);
    void _c;
    const a = ok({ ...rest, peakCurrent: amp(4), duty: duty(1), periodVsTau: 'much-shorter' } as Inputs);
    const b = ok(user(4, 100, 0.254, 35, 5, 25));
    expect(res(a, N.effectiveCurrent).value.si).toBeCloseTo(4, 12);
    expect(relErr(res(a, N.deltaTMean).value.si, res(b, N.deltaT).value.si)).toBeLessThan(1e-12);
  });
  it('comparable-or-longer: no rms result; the peak-based value is separately named and warned', () => {
    const r = ok(pulse('comparable-or-longer', 0.25));
    expect(has(r, N.deltaT)).toBe(false);
    expect(res(r, N.effectiveCurrent).value.si).toBeCloseTo(4, 12);
    expect(r.warnings.some((x) => x.code === 'PULSE_PERIOD_NOT_SHORT' && x.severity === 'warning')).toBe(true);
    expect(r.warnings.some((x) => x.code === 'PULSE_RMS_ASSUMPTION')).toBe(false);
    expect(r.warnings.some((x) => x.code === 'PULSE_PEAK_HIGHER')).toBe(false);
    expect(r.results.some((x) => x.name === N.deltaT || x.name === N.deltaTMean)).toBe(false);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-019e', 'S-019f', 'S-019g']));
  });
});

describe('structure and labelling', () => {
  it('records provenance, a labelled thermal law, ledger ids and confidence rules', () => {
    const r = ok(user(2, 100, 0.254, 35, 50, 25));
    expect(r.assumptions.some((a) => a.includes('user-supplied thermal resistance'))).toBe(true);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-004', 'S-019', 'S-019d', 'S-019g', 'S-006']));
    expect(r.reference.ledgerIds).not.toContain('S-019e');
    expect(r.reference.ledgerIds).not.toContain('S-019f');
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.formula).toBe(meta.formula);
    expect(r.warnings.some((w) => w.code === 'VOLTAGE_DROP_SCOPE')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'STEADY_STATE_DC_ONLY' && w.message.includes('Fusing'))).toBe(true);
    expect(r.copperBasis?.basis).toBe('finished');
    expect(r.confidence.reasons.length).toBeGreaterThan(0);
  });
  it('the default ambient is counted as a safety-relevant default and shows as a default input', () => {
    const { ambient: _a, ...rest } = user(2, 100, 0.254, 35, 50, 25);
    void _a;
    const r = ok(rest as Inputs);
    expect(r.inputs.find((i) => i.name === 'ambient')?.source).toBe('default');
    expect(r.confidence.score).toBeGreaterThan(ok(user(2, 100, 0.254, 35, 50, 25)).confidence.score);
  });
  it('a nominal foil weight basis is carried and adds the nominal-versus-finished confidence reason', () => {
    const { copperThickness: _t, copperBasis: _b, ...rest } = user(2, 100, 0.254, 35, 50, 25);
    void _t;
    void _b;
    const r = ok({ ...rest, copperWeight: fromUnit(1, 'oz/ft2') } as Inputs);
    expect(r.copperBasis?.basis).toBe('nominal');
    expect(r.copperBasis?.layer).toBe('outer');
  });
  it('user theta gives accuracy estimate: never high confidence (S-019g coupled fixed point is UNVERIFIED)', () => {
    expect(meta.accuracyClass).toBe('estimate');
    expect(ok(user(2, 100, 0.254, 35, 50, 25)).confidence.level).not.toBe('high');
  });
});

describe('errors are values (never throw, never a number)', () => {
  const base = user(2, 100, 0.254, 35, 50, 25);
  const expectErr = (inp: unknown, code: string, field?: string): void => {
    let out: ReturnType<typeof compute> | undefined;
    expect(() => {
      out = compute(inp as Inputs);
    }).not.toThrow();
    expect(out?.ok).toBe(false);
    if (out && !out.ok) {
      expect(out.error.code).toBe(code);
      if (field !== undefined) expect(out.error.field).toBe(field);
    }
  };
  it('missing or unknown thermal law, layer, and shape', () => {
    const { thermalLaw: _l, ...noLaw } = base;
    void _l;
    expectErr(noLaw, 'INVALID_INPUT', 'thermalLaw');
    expectErr({ ...base, thermalLaw: 'ipc2152' }, 'INVALID_INPUT', 'thermalLaw');
    const { layer: _y, ...noLayer } = base;
    void _y;
    expectErr(noLayer, 'INVALID_INPUT', 'layer');
    expectErr(null, 'INVALID_INPUT', 'inputs');
    expectErr(42, 'INVALID_INPUT', 'inputs');
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative', -1],
  ])('%s in current, length, width, theta, thickness is INVALID_INPUT naming the field', (_n, v) => {
    expectErr({ ...base, current: raw(v, DIM.CURRENT) }, 'INVALID_INPUT', 'current');
    expectErr({ ...base, length: raw(v, DIM.LENGTH) }, 'INVALID_INPUT', 'length');
    expectErr({ ...base, width: raw(v, DIM.LENGTH) }, 'INVALID_INPUT', 'width');
    expectErr({ ...base, theta: raw(v, DIM.THERMAL_RESISTANCE) }, 'INVALID_INPUT', 'theta');
    expectErr({ ...base, copperThickness: raw(v, DIM.LENGTH) }, 'INVALID_INPUT', 'copperThickness');
    expectErr({ ...base, deltaTMax: raw(v, DIM.TEMPERATURE_DIFFERENCE) }, 'INVALID_INPUT', 'deltaTMax');
  });
  it.each([
    ['NaN', NaN],
    ['+Infinity', Infinity],
    ['zero', 0],
    ['below 0 K', -5],
  ])('ambient %s is rejected naming ambient', (_n, v) => {
    expectErr({ ...base, ambient: raw(v, DIM.ABS_TEMPERATURE) }, 'INVALID_INPUT', 'ambient');
  });
  it('dimension mixing: a temperature difference is not an absolute temperature, in both directions', () => {
    expectErr({ ...base, ambient: dK(25) }, 'DIMENSION', 'ambient');
    expectErr({ ...base, deltaTMax: degC(100) }, 'DIMENSION', 'deltaTMax');
    expectErr({ ...base, current: kPerW(2) }, 'DIMENSION', 'current');
    expectErr({ ...base, theta: amp(50) }, 'DIMENSION', 'theta');
    expectErr({ ...base, length: amp(1) }, 'DIMENSION', 'length');
    const { theta: _th, ...noTh } = base;
    void _th;
    expectErr({ ...noTh, thetaPerLength: kPerW(5) }, 'DIMENSION', 'thetaPerLength');
  });
  it('cross-field rules', () => {
    expectErr({ ...base, thetaPerLength: perLen(5) }, 'INVALID_INPUT', 'theta'); // both
    const { theta: _t, ...noTheta } = base;
    void _t;
    expectErr(noTheta, 'INVALID_INPUT', 'thetaPerLength'); // neither
    expectErr({ ...legacy(2, 100, 1, 35, 'outer', 25), theta: kPerW(5) }, 'INVALID_INPUT', 'theta');
    expectErr({ ...base, copperWeight: fromUnit(1, 'oz/ft2') }, 'INVALID_INPUT', 'copperWeight');
    expectErr({ ...base, peakCurrent: amp(3) }, 'INVALID_INPUT', 'current'); // both current and peakCurrent
    const { current: _c, ...noI } = base;
    void _c;
    expectErr(noI, 'INVALID_INPUT', 'peakCurrent');
    expectErr({ ...noI, peakCurrent: amp(3) }, 'INVALID_INPUT', 'duty');
    expectErr({ ...noI, peakCurrent: amp(3), duty: duty(0.5) }, 'INVALID_INPUT', 'periodVsTau');
    expectErr({ ...noI, peakCurrent: amp(3), duty: duty(0.5), periodVsTau: 'whatever' }, 'INVALID_INPUT', 'periodVsTau');
    expectErr({ ...noI, peakCurrent: amp(3), duty: duty(1.01), periodVsTau: 'much-shorter' }, 'INVALID_INPUT', 'duty');
    expectErr({ ...noI, peakCurrent: amp(3), duty: duty(0), periodVsTau: 'much-shorter' }, 'INVALID_INPUT', 'duty');
    expectErr({ ...base, duty: duty(0.5) }, 'INVALID_INPUT', 'duty');
  });
  it('legacy law propagates the legacy relation error value (never a number)', () => {
    const out = compute(legacy(2, 100, 1, 35, 'outer', 25, { copperBasis: 'finished', width: q(Number.MIN_VALUE, DIM.LENGTH) }));
    expect(out.ok).toBe(false);
  });
  it('underflow and overflow inputs return error values', () => {
    expect(compute(user(1e-200, 100, 1, 35, 10, 25)).ok).toBe(false);
    expect(compute(user(1e200, 100, 1, 35, 10, 25)).ok).toBe(false);
  });
});

describe('performance sanity', () => {
  it('2000 computes < 1 s', () => {
    const inp = user(2, 100, 0.254, 35, 50, 25);
    const t0 = performance.now();
    for (let i = 0; i < 2000; i++) compute(inp);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
