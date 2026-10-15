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

// Phase 1 task 9: min/typ/max envelope and sensitivity readout for the via calculator. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, env_via_* and sens_via_* vectors in
// docs/golden-vectors.json) or from A = pi t (d + t) restated here. Plating thicknesses and tolerances are TEST values.

const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const kelvinDiff = (n: number): Quantity => q(n, DIM.TEMPERATURE_DIFFERENCE);
const asym = (minus: number, plus: number): { minus: Quantity; plus: Quantity } => ({ minus: frac(minus), plus: frac(plus) });
const TOL = 1e-9;
const R = 'resistance at conductor temperature';
const TH = 'axial thermal resistance (all barrels, ideal parallel)';

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

const A: Inputs = { finishedHoleDiameter: mm(0.3), platingThickness: um(25), barrelLength: mm(1.6), count: 4, conductorTemperature: degC(85), current: amp(2) };
const A_TOL: Tolerances = { finishedHoleDiameter: frac(0.1), platingThickness: asym(0.2, 0.1), barrelLength: frac(0.05), conductorTemperature: kelvinDiff(10), current: frac(0.05) };
const B: Inputs = { finishedHoleDiameter: mm(0.2), platingThickness: um(18), barrelLength: mm(0.8), count: 1, conductorTemperature: degC(105), resistivity: q(2e-8, DIM.RESISTIVITY) };
const B_TOL: Tolerances = { finishedHoleDiameter: frac(0.05), platingThickness: asym(0.15, 0), barrelLength: frac(0.1), resistivity: frac(0.1), conductorTemperature: kelvinDiff(5) };

describe('golden vectors (oracle): envelope corners', () => {
  it('A: R, theta, drop and power with five tolerances (N = 4, pure-copper k)', () => {
    const r = run({ ...A, tolerances: A_TOL });
    const tag = 'via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A';
    expectEnv(r, R, 'mohm', `env_${tag}_R_mohm_mohm`);
    expectEnv(r, TH, 'K/W', `env_${tag}_theta_KperW_KperW`);
    expectEnv(r, 'voltage drop', 'mV', `env_${tag}_vdrop_mV_mV`);
    expectEnv(r, 'power loss', 'mW', `env_${tag}_power_mW_mW`);
    for (const n of [R, TH, 'voltage drop', 'power loss']) expect(env(r, n).bound).toBe('prediction');
    expect(env(r, R).toleranceInputs).toEqual(['finished hole diameter', 'plating thickness', 'barrel length', 'conductor temperature', 'current']);
  });
  it('B: single via with a plated-resistivity override tolerance (six tolerated inputs would be 64 corners; five here)', () => {
    const r = run({ ...B, tolerances: B_TOL });
    const tag = 'via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm';
    expectEnv(r, R, 'mohm', `env_${tag}_R_mohm_mohm`);
    expectEnv(r, TH, 'K/W', `env_${tag}_theta_KperW_KperW`);
    expect(r.envelope?.map((e) => e.name)).toEqual([R, TH]);
  });
  it('all six tolerances at once (64 corners) still gives min <= typ <= max', () => {
    const r = run({ ...B, current: amp(1), tolerances: { ...B_TOL, current: frac(0.1) } });
    for (const e of r.envelope ?? []) {
      expect(e.min.si).toBeLessThanOrEqual(e.typ.si);
      expect(e.typ.si).toBeLessThanOrEqual(e.max.si);
    }
    expect(env(r, R).toleranceInputs).toHaveLength(6);
  });
});

describe('sensitivities: closed form', () => {
  const sens = (r: CalcResult, out: string, inp: string): Quantity => res(r, `sensitivity of ${out} to ${inp}`).value;
  const d = 0.3e-3;
  const t = 25e-6;
  it('geometry: -d/(d + t) for the hole, -(d + 2t)/(d + t) for plating, +1 for length, on R and theta alike', () => {
    const r = run({ ...A, tolerances: A_TOL });
    const sd = -d / (d + t);
    const st = -(d + 2 * t) / (d + t);
    for (const out of [R, TH]) {
      expect(sens(r, out, 'finished hole diameter').si).toBeCloseTo(sd, 8);
      expect(sens(r, out, 'plating thickness').si).toBeCloseTo(st, 8);
      expect(sens(r, out, 'barrel length').si).toBeCloseTo(1, 9);
    }
    expect(err(sens(r, R, 'finished hole diameter').si, vec('sens_via_A_R_to_finishedHole').pinned_expected)).toBeLessThan(1e-7);
    expect(err(sens(r, R, 'plating thickness').si, vec('sens_via_A_R_to_plating').pinned_expected)).toBeLessThan(1e-7);
  });
  it('current 1 and 2; temperature semi-log on R and zero on theta; resistivity 1 on R and 0 on theta', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(sens(r, 'voltage drop', 'current').si).toBeCloseTo(1, 9);
    expect(sens(r, 'power loss', 'current').si).toBeCloseTo(2, 9);
    const st = sens(r, R, 'conductor temperature');
    expect(st.dim).toBe(DIM.PER_KELVIN);
    expect(st.si).toBeCloseTo(0.00393 / (1 + 0.00393 * 65), 7);
    expect(sens(r, TH, 'conductor temperature').si).toBe(0);
    const rb = run({ ...B, tolerances: B_TOL });
    expect(sens(rb, R, 'plated copper resistivity').si).toBeCloseTo(1, 9);
    expect(sens(rb, TH, 'plated copper resistivity').si).toBe(0);
  });
  it('signs and the count: R and theta fall with hole size and plating and rise with length (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 1, noNaN: true }), fc.double({ min: 10, max: 50, noNaN: true }), fc.double({ min: 0.4, max: 3, noNaN: true }), fc.integer({ min: 1, max: 20 }), fc.double({ min: 0.01, max: 0.3, noNaN: true }), (dm, tm, l, n, tol) => {
        const r = run({ finishedHoleDiameter: mm(dm), platingThickness: um(tm), barrelLength: mm(l), count: n, tolerances: { finishedHoleDiameter: frac(tol), platingThickness: frac(tol), barrelLength: frac(tol) } });
        for (const out of [R, TH]) {
          expect(si(r, `sensitivity of ${out} to finished hole diameter`)).toBeLessThan(0);
          expect(si(r, `sensitivity of ${out} to plating thickness`)).toBeLessThan(0);
          expect(si(r, `sensitivity of ${out} to barrel length`)).toBeGreaterThan(0);
          const e = env(r, out);
          expect(e.min.si).toBeLessThanOrEqual(e.typ.si * (1 + 1e-12));
          expect(e.typ.si).toBeLessThanOrEqual(e.max.si * (1 + 1e-12));
        }
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
  it('does not change nominal numbers or confidence; the default-resistivity warning and counted defaults stay', () => {
    const noCur = { ...A } as Partial<Inputs>;
    delete noCur.current;
    const plain2 = run(noCur as Inputs);
    const r = run({ ...(noCur as Inputs), tolerances: { barrelLength: frac(0.05) } });
    for (const x of plain2.results) expect(si(r, x.name)).toBe(x.value.si);
    expect(r.confidence.level).toBe(plain2.confidence.level);
    expect(r.confidence.score).toBe(plain2.confidence.score);
    expect(r.confidence.reasons.join(' ')).toMatch(/user-supplied/);
    expect(r.warnings.some((w) => w.code === 'PLATED_RESISTIVITY')).toBe(true);
    expect(r.dataStatus).toBe(plain2.dataStatus);
    expect(r.envelope?.map((e) => e.name)).toEqual([R, TH]);
  });
  it('zero tolerance gives a point envelope equal to the base result', () => {
    const r = run({ ...A, tolerances: { finishedHoleDiameter: frac(0), conductorTemperature: kelvinDiff(0) } });
    for (const n of [R, TH, 'voltage drop', 'power loss']) {
      const e = env(r, n);
      expect(e.min.si).toBe(e.typ.si);
      expect(e.max.si).toBe(e.typ.si);
      expect(e.typ.si).toBe(si(r, n));
    }
  });
  it('lists tolerances as inputs and assumptions, with the scope warning, and no fab-profile source', () => {
    const r = run({ ...A, tolerances: A_TOL });
    expect(r.inputs.find((i) => i.name === 'plating thickness tolerance (-)')?.value.si).toBe(0.2);
    expect(r.inputs.find((i) => i.name === 'plating thickness tolerance (+)')?.value.si).toBe(0.1);
    expect(r.inputs.some((i) => i.source === 'fab-profile')).toBe(false);
    expect(r.assumptions.join('\n')).toMatch(/plating thickness: -20 % \/ \+10 %/);
    expect(warningText(r)).toMatch(/worst-case corner range/);
    expect(r.fabProfile).toBeUndefined();
  });
  it('a plating minus tolerance past the hole size is not special-cased; the corner is computed and a thick-plating corner can exceed d (warning kept)', () => {
    const r = run({ finishedHoleDiameter: mm(0.1), platingThickness: um(60), barrelLength: mm(1), count: 1, tolerances: { platingThickness: frac(0.2) } });
    expect(r.warnings.some((w) => w.code === 'PLATING_EXCEEDS_HOLE')).toBe(false);
  });
  it('a corner past the conductor temperature validity range is flagged as an extrapolation', () => {
    const r = run({ ...A, conductorTemperature: degC(148), tolerances: { conductorTemperature: kelvinDiff(5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_EXTRAPOLATION')).toBe(true);
  });
  it('a rejected corner is reported and its envelope omitted, not clamped', () => {
    const r = run({ ...A, conductorTemperature: fromUnit(50, 'K'), tolerances: { conductorTemperature: kelvinDiff(20) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_INCOMPLETE')).toBe(true);
    expect(r.envelope?.some((e) => e.name === R) ?? false).toBe(false);
    expect(assertCalcResult(r).ok).toBe(true);
  });
  it('deterministic, no claim wording', () => {
    const i: Inputs = { ...A, tolerances: A_TOL };
    expect(run(i)).toEqual(run(i));
    expectNoClaimWording(run(i));
  });
});

describe('guards', () => {
  const tol = (t: unknown, base: Inputs = A): Inputs => ({ ...base, tolerances: t as Tolerances });
  it('rejects malformed tolerances as error values', () => {
    expectError(compute, tol({ barrelLength: { si: Number.NaN, dim: DIM.DIMENSIONLESS } }), 'INVALID_INPUT', 'tolerances.barrelLength');
    expectError(compute, tol({ barrelLength: frac(-0.1) }), 'INVALID_INPUT', 'tolerances.barrelLength');
    expectError(compute, tol({ barrelLength: mm(1) }), 'DIMENSION', 'tolerances.barrelLength');
    expectError(compute, tol({ platingThickness: frac(1) }), 'OUT_OF_DOMAIN', 'tolerances.platingThickness');
    expectError(compute, tol({ conductorTemperature: frac(5) }), 'DIMENSION', 'tolerances.conductorTemperature');
    expectError(compute, tol({ count: frac(0.1) }), 'INVALID_INPUT', 'tolerances.count');
    expectError(compute, tol({ barrelLength: 'profile' }), 'INVALID_INPUT', 'tolerances.barrelLength');
  });
  it('rejects a tolerance on an input the user did not give', () => {
    const noCur = { ...A } as Partial<Inputs>;
    delete noCur.current;
    delete noCur.conductorTemperature;
    expect(expectError(compute, tol({ current: frac(0.1) }, noCur as Inputs), 'INVALID_INPUT', 'tolerances.current')).toMatch(/needs a current/);
    expect(expectError(compute, tol({ conductorTemperature: kelvinDiff(5) }, noCur as Inputs), 'INVALID_INPUT', 'tolerances.conductorTemperature')).toMatch(/user-supplied conductor temperature/);
    expect(expectError(compute, tol({ resistivity: frac(0.1) }, A), 'INVALID_INPUT', 'tolerances.resistivity')).toMatch(/override/);
  });
  it('a bad nominal input wins over tolerances; the plating thickness stays required', () => {
    const bad = { ...A } as Partial<Inputs>;
    delete bad.platingThickness;
    expectError(compute, tol({ barrelLength: frac(0.1) }, bad as Inputs), 'INVALID_INPUT', 'platingThickness');
  });
});

describe('range failures with tolerances', () => {
  it('a nominal point the calculator rejects stays an error value even with tolerances', () => {
    expectError(compute, { ...A, conductorTemperature: fromUnit(10, 'K'), tolerances: { barrelLength: frac(0.1) } }, 'OUT_OF_DOMAIN');
  });
  it('an overflowing tolerated value leaves the nominal result and a visible warning', () => {
    const r = run({ finishedHoleDiameter: q(1000, DIM.LENGTH), platingThickness: q(1, DIM.LENGTH), barrelLength: q(1e308, DIM.LENGTH), count: 1, tolerances: { barrelLength: asym(0.1, 5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_UNAVAILABLE')).toBe(true);
    expect(r.envelope).toBeUndefined();
  });
});

describe('meta', () => {
  it('lists the tolerance inputs and documents the method', () => {
    expect([...meta.toleranceInputs].sort()).toEqual(['barrelLength', 'conductorTemperature', 'current', 'finishedHoleDiameter', 'platingThickness', 'resistivity']);
    expect(meta.envelope.method).toMatch(/corner/i);
    expect(meta.envelope.maxToleratedInputs).toBe(6);
    expect(has(run({ ...A, tolerances: { barrelLength: frac(0.1) } }), `sensitivity of ${R} to barrel length`)).toBe(true);
  });
});
