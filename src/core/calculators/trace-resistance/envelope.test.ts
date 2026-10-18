import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { err, expectError, expectNoClaimWording, has, okOf, res, si, vec, warningText } from '../circuit-test-utils';
import { compute } from './calc';
import type { Inputs, Tolerances } from './calc';
import { meta } from './meta';

// Phase 1 task 9: min/typ/max envelope and sensitivity readout for the trace-resistance calculator. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, env_tr_* and sens_tr_* vectors in
// docs/golden-vectors.json) or from R = rho(T) L / (w t) restated here. Every tolerance is a TEST value.

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const kelvinDiff = (n: number): Quantity => q(n, DIM.TEMPERATURE_DIFFERENCE);
const asym = (minus: number, plus: number): { minus: Quantity; plus: Quantity } => ({ minus: frac(minus), plus: frac(plus) });
const TOL = 1e-9;
const RHO20 = 1 / 58e6;
const ALPHA = 0.00393;

const run = (i: Inputs): CalcResult => okOf(compute, i);
const env = (r: CalcResult, name: string): NonNullable<CalcResult['envelope']>[number] => {
  const e = r.envelope?.find((x) => x.name === name);
  if (!e) throw new Error(`envelope "${name}" missing; have ${(r.envelope ?? []).map((x) => x.name).join(', ')}`);
  return e;
};
const expectEnv = (r: CalcResult, name: string, unit: string, tag: string): void => {
  const e = env(r, name);
  for (const [k, v] of [['min', e.min], ['typ', e.typ], ['max', e.max]] as const) {
    expect(err(toUnit(v, unit), vec(`${tag}_${k}`).pinned_expected), `${name} ${k}`).toBeLessThan(TOL);
  }
};
const R = 'resistance at conductor temperature';

const A: Inputs = { layer: 'outer', length: mm(100), width: mm(0.254), copperThickness: um(35), ambient: degC(85), current: amp(3) };
const A_TOL: Tolerances = { length: frac(0.01), width: frac(0.2), copperThickness: frac(0.1), ambient: kelvinDiff(5), current: frac(0.02) };
const B: Inputs = { layer: 'outer', length: mm(1000), width: mm(1), copperWeight: fromUnit(2, 'oz/ft2'), ambient: degC(25), resistivity: q(1.9e-8, DIM.RESISTIVITY) };
const B_TOL: Tolerances = { length: frac(0.005), width: frac(0.1), copperThickness: asym(0.1, 0), ambient: kelvinDiff(10), resistivity: asym(0.05, 0.1) };

describe('golden vectors (oracle): envelope corners', () => {
  it('A: resistance, drop and power with five tolerances', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expectEnv(r, R, 'ohm', 'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_R_ohm_ohm');
    expectEnv(r, 'voltage drop', 'V', 'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_vdrop_V_V');
    expectEnv(r, 'power loss', 'W', 'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_power_W_W');
    for (const n of [R, 'voltage drop', 'power loss']) expect(env(r, n).bound).toBe('prediction');
    expect(env(r, R).toleranceInputs).toEqual(['length', 'width', 'copper thickness', 'ambient', 'current']);
  });
  it('B: resistivity override with asymmetric tolerances and an absolute temperature tolerance', () => {
    const r = run({ ...B, tolerances: B_TOL });
    expectEnv(r, R, 'ohm', 'env_tr_B_L1000mm_w1mm_t70um_T25C_rho1.9uohmcm_R_ohm_ohm');
    expect(r.envelope?.map((e) => e.name)).toEqual([R]);
    expect(r.reference.ledgerIds).toContain('S-012');
  });
});

describe('sensitivities: closed form', () => {
  const sens = (r: CalcResult, out: string, inp: string): Quantity => res(r, `sensitivity of ${out} to ${inp}`).value;
  it('R: +1 for length, -1 for width and thickness, as in the oracle', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(sens(r, R, 'length').si).toBeCloseTo(vec('sens_tr_A_R_to_length').pinned_expected, 9);
    expect(sens(r, R, 'width').si).toBeCloseTo(-1, 9);
    expect(sens(r, R, 'copper thickness').si).toBeCloseTo(-1, 9);
    expect(sens(r, R, 'length').dim).toBe(DIM.DIMENSIONLESS);
  });
  it('drop and power: current 1 and 2; length and width pass through', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(sens(r, 'voltage drop', 'current').si).toBeCloseTo(1, 9);
    expect(sens(r, 'power loss', 'current').si).toBeCloseTo(2, 9);
    expect(sens(r, 'voltage drop', 'length').si).toBeCloseTo(1, 9);
    expect(sens(r, 'power loss', 'width').si).toBeCloseTo(-1, 9);
  });
  it('temperature: the semi-log alpha / (1 + alpha (T - 20)) per kelvin (golden and restated)', () => {
    const r = run({ ...A, tolerances: A_TOL });
    const s = sens(r, R, 'ambient');
    expect(s.dim).toBe(DIM.PER_KELVIN);
    expect(err(s.si, vec('sens_tr_A_R_to_temperatureK').pinned_expected)).toBeLessThan(1e-6);
    expect(s.si).toBeCloseTo(ALPHA / (1 + ALPHA * 65), 7);
    const rb = run({ ...B, tolerances: B_TOL });
    expect(err(sens(rb, R, 'ambient').si, vec('sens_tr_B_R_to_temperatureK').pinned_expected)).toBeLessThan(1e-6);
    expect(err(sens(rb, R, 'resistivity').si, vec('sens_tr_B_R_to_resistivity').pinned_expected)).toBeLessThan(1e-8);
  });
  it('signs: R rises with length and falls with width and thickness (property, also at random geometry)', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 1000, noNaN: true }), fc.double({ min: 0.1, max: 5, noNaN: true }), fc.double({ min: 10, max: 100, noNaN: true }), fc.double({ min: 0.01, max: 0.3, noNaN: true }), (l, w, t, tol) => {
        const r = run({ layer: 'inner', length: mm(l), width: mm(w), copperThickness: um(t), tolerances: { length: frac(tol), width: frac(tol), copperThickness: frac(tol) } });
        expect(si(r, 'sensitivity of resistance at conductor temperature to length')).toBeGreaterThan(0);
        expect(si(r, 'sensitivity of resistance at conductor temperature to width')).toBeLessThan(0);
        expect(si(r, 'sensitivity of resistance at conductor temperature to copper thickness')).toBeLessThan(0);
        const e = env(r, R);
        expect(e.min.si).toBeLessThanOrEqual(e.typ.si * (1 + 1e-12));
        expect(e.typ.si).toBeLessThanOrEqual(e.max.si * (1 + 1e-12));
        // the maximum is the long, narrow, thin corner, the minimum the short, wide, thick one
        const hi = run({ layer: 'inner', length: mm(l * (1 + tol)), width: mm(w * (1 - tol)), copperThickness: um(t * (1 - tol)) });
        expect(err(e.max.si, si(hi, R))).toBeLessThan(1e-9);
      }),
      { numRuns: 40 },
    );
  });
});

describe('invariants', () => {
  it('no tolerances: no envelope or sensitivity and identical to the plain result', () => {
    const r = run(A);
    expect(r.envelope).toBeUndefined();
    expect(r.results.some((x) => x.name.startsWith('sensitivity of'))).toBe(false);
    expect(run({ ...A, tolerances: {} })).toEqual(r);
  });
  it('does not change the nominal numbers or the confidence level; user tolerances leave a visible reason', () => {
    const plain = run(A);
    const r = run({ ...A, tolerances: A_TOL });
    for (const x of plain.results) expect(si(r, x.name)).toBe(x.value.si);
    expect(r.confidence.level).toBe(plain.confidence.level);
    expect(r.confidence.score).toBe(plain.confidence.score);
    expect(r.confidence.reasons.join(' ')).toMatch(/user-supplied/);
    expect(r.dataStatus).toBe(plain.dataStatus);
    expect(env(r, R).typ.si).toBe(si(plain, R));
  });
  it('zero tolerance gives a point envelope equal to the base result', () => {
    const r = run({ ...A, tolerances: { length: frac(0), width: frac(0), ambient: kelvinDiff(0) } });
    for (const n of [R, 'voltage drop', 'power loss']) {
      const e = env(r, n);
      expect(e.min.si).toBe(e.typ.si);
      expect(e.max.si).toBe(e.typ.si);
      expect(e.typ.si).toBe(si(r, n));
    }
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_ZERO_TOLERANCE')).toBe(true);
  });
  it('envelope values are predictions: the printed bound rounds up, and the carried bound says so', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(env(r, R).bound).toBe('prediction');
  });
  it('without a current only the resistance is analysed', () => {
    const noCurrent = { ...A } as Partial<Inputs>;
    delete noCurrent.current;
    const r = run({ ...(noCurrent as Inputs), tolerances: { length: frac(0.01) } });
    expect(r.envelope?.map((e) => e.name)).toEqual([R]);
    expect(has(r, 'sensitivity of voltage drop to current')).toBe(false);
  });
  it('lists tolerances as inputs, assumptions, scope warning; the voltage-drop scope warning is kept', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(r.inputs.find((i) => i.name === 'ambient tolerance (+/-)')?.value.dim).toBe(DIM.TEMPERATURE_DIFFERENCE);
    expect(r.inputs.find((i) => i.name === 'length tolerance (+/-)')?.value.si).toBe(0.01);
    expect(r.assumptions.join('\n')).toMatch(/ambient: \+\/-5 K/);
    expect(warningText(r)).toMatch(/tolerance-corner range/);
    expect(r.warnings.some((w) => w.code === 'VOLTAGE_DROP_SCOPE')).toBe(true);
  });
  it('a corner past the conductor temperature validity range is flagged as an extrapolation', () => {
    const r = run({ ...A, ambient: degC(148), tolerances: { ambient: kelvinDiff(5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_EXTRAPOLATION')).toBe(true);
  });
  it('an ambient tolerance that would reach absolute zero is an error corner and is reported, not clamped', () => {
    // ambient 50 K is inside the linear model (factor 0.045) but 50 K - 20 K = 30 K gives a non-positive resistivity: the calculator rejects that corner.
    const r = run({ layer: 'outer', length: mm(10), width: mm(1), copperThickness: um(35), ambient: fromUnit(50, 'K'), tolerances: { ambient: kelvinDiff(20) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_INCOMPLETE' && /envelope incomplete at corner ambient-/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_BOUND_OMITTED')).toBe(true);
    expect(r.envelope?.some((e) => e.name === R) ?? false).toBe(false);
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it('thickness choices: S-009 inner thin side, foil spread, and outer (no thin side) reported', () => {
    const base: Inputs = { layer: 'inner', length: mm(100), width: mm(0.5), copperWeight: fromUnit(1, 'oz/ft2') };
    const s9 = run({ ...base, tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    const minus = s9.inputs.find((i) => i.name === 'copper thickness tolerance (-)');
    expect(minus?.value.si).toBeCloseTo(1 - 24.9 / 35, 12);
    expect(env(s9, R).max.si).toBeGreaterThan(env(s9, R).typ.si);
    expect(env(s9, R).min.si).toBe(env(s9, R).typ.si);
    expect(s9.reference.ledgerIds).toContain('S-009');
    const spread = run({ ...base, tolerances: { copperThickness: { source: 'foil-convention-spread' } } });
    expect(env(spread, R).toleranceInputs).toEqual(['copper thickness']);
    const outer = run({ ...base, layer: 'outer', tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(outer.envelope).toBeUndefined();
    expect(outer.warnings.some((w) => w.code === 'TOLERANCE_CHOICE_NO_THIN_SIDE')).toBe(true);
  });
  it('is deterministic and carries no claim wording', () => {
    const i: Inputs = { ...A, tolerances: A_TOL };
    expect(run(i)).toEqual(run(i));
    expectNoClaimWording(run(i));
  });
});

describe('guards', () => {
  const tol = (t: unknown, base: Inputs = A): Inputs => ({ ...base, tolerances: t as Tolerances });
  it('rejects malformed tolerances as error values', () => {
    expectError(compute, tol({ length: { si: Number.NaN, dim: DIM.DIMENSIONLESS } }), 'INVALID_INPUT', 'tolerances.length');
    expectError(compute, tol({ length: frac(-0.1) }), 'INVALID_INPUT', 'tolerances.length');
    expectError(compute, tol({ length: mm(1) }), 'DIMENSION', 'tolerances.length');
    expectError(compute, tol({ width: frac(1.5) }), 'OUT_OF_DOMAIN', 'tolerances.width');
    expectError(compute, tol({ ambient: frac(1) }), 'DIMENSION', 'tolerances.ambient');
    expectError(compute, tol({ nope: frac(0.1) }), 'INVALID_INPUT', 'tolerances.nope');
    expectError(compute, tol({ length: 'profile' }), 'INVALID_INPUT', 'tolerances.length');
    expectError(compute, tol({ width: { source: 'foil-convention-spread' } }), 'INVALID_INPUT', 'tolerances.width');
  });
  it('rejects a tolerance on an input the user did not give (defaulted ambient, no override, no current)', () => {
    const bareP = { ...A } as Partial<Inputs>;
    delete bareP.ambient;
    delete bareP.current;
    const bare = bareP as Inputs;
    expect(expectError(compute, tol({ ambient: kelvinDiff(5) }, bare), 'INVALID_INPUT', 'tolerances.ambient')).toMatch(/user-supplied ambient/);
    expect(expectError(compute, tol({ resistivity: frac(0.1) }, A), 'INVALID_INPUT', 'tolerances.resistivity')).toMatch(/override/);
    expect(expectError(compute, tol({ current: frac(0.1) }, bare), 'INVALID_INPUT', 'tolerances.current')).toMatch(/needs a current/);
  });
  it('a bad nominal input wins over tolerances', () => {
    expectError(compute, tol({ length: frac(0.1) }, { ...A, length: mm(-1) }), 'INVALID_INPUT', 'length');
  });
});

describe('range failures with tolerances', () => {
  it('a nominal point the calculator rejects stays an error value even with tolerances', () => {
    expectError(compute, { ...A, ambient: fromUnit(10, 'K'), tolerances: { length: frac(0.1) } }, 'OUT_OF_DOMAIN');
  });
  it('an overflowing tolerated value leaves the nominal result and a visible warning', () => {
    const r = run({ layer: 'outer', length: q(1e308, DIM.LENGTH), width: q(1e3, DIM.LENGTH), copperThickness: q(1e3, DIM.LENGTH), tolerances: { length: asym(0.1, 5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_UNAVAILABLE')).toBe(true);
    expect(r.envelope).toBeUndefined();
  });
  it('a thickness choice that cannot be applied returns the nominal result with its warning', () => {
    const r = run({ layer: 'outer', length: mm(10), width: mm(1), copperWeight: fromUnit(3, 'oz/ft2'), tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_CHOICE_NOT_AVAILABLE')).toBe(true);
  });
});

describe('meta', () => {
  it('lists the tolerance inputs and documents the method', () => {
    expect([...meta.toleranceInputs].sort()).toEqual(['ambient', 'copperThickness', 'current', 'length', 'resistivity', 'width']);
    expect(meta.envelope.method).toMatch(/corner/i);
    expect(meta.envelope.maxToleratedInputs).toBe(6);
  });
  it('R(T) closed form check at the typ point', () => {
    const r = run({ ...A, tolerances: { length: frac(0.01) } });
    const want = (RHO20 * (1 + ALPHA * 65) * 0.1) / (0.254e-3 * 35e-6);
    expect(err(env(r, R).typ.si, want)).toBeLessThan(1e-12);
  });
});
