import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { parseFabProfile } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { formatResult } from '../../format-result';
import { allText, err, expectError, expectNoClaimWording, has, okOf, res, si, vec, warningText } from '../circuit-test-utils';
import { compute } from './calc';
import type { Inputs, Tolerances } from './calc';
import { meta } from './meta';

// Phase 1 task 9: min/typ/max envelope and sensitivity readout for the legacy trace-width calculator. TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, env_tw_* and sens_tw_* vectors in
// docs/golden-vectors.json) or from the S-001 closed form restated here. Every tolerance is a TEST value. Nothing here verifies
// S-001 (PAYWALLED-USER-MUST-VERIFY); tests compare the implementation with the formula.

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const kelvinDiff = (n: number): Quantity => q(n, DIM.TEMPERATURE_DIFFERENCE);
const asym = (minus: number, plus: number): { minus: Quantity; plus: Quantity } => ({ minus: frac(minus), plus: frac(plus) });
const TOL = 1e-9;

const files = import.meta.glob('../../data/fab-profiles/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
function shippedJson(name: string): Record<string, unknown> {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`profile ${name} not found`);
  return JSON.parse(files[key] as string) as Record<string, unknown>;
}
function parsed(json: unknown): ParsedFabProfile {
  const r = parseFabProfile(json);
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
}
const JLC = parsed(shippedJson('jlcpcb-2026-10-13.json'));
const TODAY = '2026-10-20';

const run = (i: Inputs): CalcResult => okOf(compute, i);
const env = (r: CalcResult, name: string): NonNullable<CalcResult['envelope']>[number] => {
  const e = r.envelope?.find((x) => x.name === name);
  if (!e) throw new Error(`envelope "${name}" missing; have ${(r.envelope ?? []).map((x) => x.name).join(', ')}`);
  return e;
};
const expectEnv = (r: CalcResult, name: string, unit: string, prefix: string, tag: string): void => {
  const e = env(r, name);
  for (const [k, v] of [['min', e.min], ['typ', e.typ], ['max', e.max]] as const) {
    const want = vec(`${prefix}_${tag}_${k}`).pinned_expected;
    expect(err(toUnit(v, unit), want), `${name} ${k}`).toBeLessThan(TOL);
  }
};

const A: Inputs = { mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperWeight: oz(1) };
const B: Inputs = { mode: 'B', layer: 'inner', width: mm(0.5), deltaT: dT(30), copperWeight: oz(2) };
const C: Inputs = { mode: 'B', layer: 'outer', current: amp(2), width: mm(1), copperWeight: oz(1), ambient: degC(25) };

describe('golden vectors (oracle): envelope corners', () => {
  it('A: solved width, tolerances on current, rise and thickness; drawn width covers a 20 % width tolerance', () => {
    const r = run({ ...A, tolerances: { current: frac(0.05), deltaT: frac(0.1), copperThickness: asym(0.1, 0.05), width: frac(0.2) } });
    expectEnv(r, 'width', 'mil', 'env_tw_A_outer_width_I3_dT20_1oz_width_mil', 'mil');
    expectEnv(r, 'drawn width covering the width tolerance', 'mil', 'env_tw_A', 'drawn_width_mil');
    expect(env(r, 'width').bound).toBe('min-requirement');
    expect(env(r, 'drawn width covering the width tolerance').bound).toBe('min-requirement');
    expect(env(r, 'width').toleranceInputs).toEqual(['current', 'temperature rise', 'copper thickness']);
    expect(env(r, 'drawn width covering the width tolerance').toleranceInputs).toContain('width');
    expect(r.results.find((x) => x.name === 'width')?.role).toBe('primary');
  });
  it('B: solved current capacity, tolerances on width, rise and thickness (thin side only)', () => {
    const r = run({ ...B, tolerances: { width: frac(0.2), deltaT: frac(0.05), copperThickness: asym(0.1, 0) } });
    expectEnv(r, 'current capacity', 'A', 'env_tw_B_inner_current_w0.5mm_dT30_2oz_current_A', 'A');
    expect(env(r, 'current capacity').bound).toBe('max-capacity');
  });
  it('C: solved rise and maximum conductor temperature, ambient 25 degC +-5 K', () => {
    const r = run({ ...C, tolerances: { current: frac(0.1), width: frac(0.2), copperThickness: frac(0.1), ambient: kelvinDiff(5) } });
    expectEnv(r, 'temperature rise', 'ddegC', 'env_tw_C_outer_rise_I2_w1mm_1oz_rise_K', 'K');
    expectEnv(r, 'maximum conductor temperature', 'degC', 'env_tw_C_outer_rise_I2_w1mm_1oz_tmax_degC', 'degC');
    expect(env(r, 'temperature rise').bound).toBe('prediction');
    expect(env(r, 'maximum conductor temperature').bound).toBe('prediction');
  });
  it('D: thickness tolerance chosen as the foil-convention spread (explicit choice, S-003 labelled)', () => {
    const r = run({ ...A, tolerances: { copperThickness: { source: 'foil-convention-spread' } } });
    expectEnv(r, 'width', 'mil', 'env_tw_D_outer_width_I3_dT20_1oz_foilspread_width_mil', 'mil');
    const minus = r.inputs.find((i) => i.name === 'copper thickness tolerance (-)');
    const plus = r.inputs.find((i) => i.name === 'copper thickness tolerance (+)');
    expect(err(minus?.value.si ?? 0, vec('env_tw_D_thickness_minus_fraction').pinned_expected)).toBeLessThan(TOL);
    expect(plus?.value.si).toBe(0);
    expect(minus?.sourceDetail).toMatch(/S-003/);
    expect(minus?.sourceDetail).toMatch(/CONFLICT/);
    expect(r.assumptions.join(' ')).toMatch(/foil conventions/);
  });
  it('E: thickness tolerance chosen as the S-009 finished-copper minimum (thin side only, inner 1 oz)', () => {
    const r = run({ ...A, layer: 'inner', tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expectEnv(r, 'width', 'mil', 'env_tw_E_inner_width_I3_dT20_1oz_s009_width_mil', 'mil');
    const minus = r.inputs.find((i) => i.name === 'copper thickness tolerance (-)');
    expect(err(minus?.value.si ?? 0, vec('env_tw_E_thickness_minus_fraction').pinned_expected)).toBeLessThan(TOL);
    expect(r.reference.ledgerIds).toContain('S-009');
    expect(minus?.sourceDetail).toMatch(/S-009/);
    expect(minus?.sourceDetail).toMatch(/minimum, not a typical value/);
    expect(r.dataStatus).not.toBe('VERIFIED');
  });
});

describe('sensitivities equal the closed-form exponents of the legacy equation', () => {
  const sens = (r: CalcResult, out: string, inp: string): number => si(r, `sensitivity of ${out} to ${inp}`);
  it('solved width: 1/0.725 for current, -0.44/0.725 for rise, -1 for thickness (golden and restated)', () => {
    const r = run({ ...A, tolerances: { current: frac(0.05), deltaT: frac(0.1), copperThickness: frac(0.05) } });
    expect(sens(r, 'width', 'current')).toBeCloseTo(1 / 0.725, 9);
    expect(sens(r, 'width', 'temperature rise')).toBeCloseTo(-0.44 / 0.725, 9);
    expect(sens(r, 'width', 'copper thickness')).toBeCloseTo(-1, 9);
    expect(err(sens(r, 'width', 'current'), vec('sens_tw_A_width_width_to_current').pinned_expected)).toBeLessThan(1e-8);
    expect(err(sens(r, 'width', 'temperature rise'), vec('sens_tw_A_width_width_to_deltaT').pinned_expected)).toBeLessThan(1e-8);
    expect(err(sens(r, 'width', 'copper thickness'), vec('sens_tw_A_width_width_to_thickness').pinned_expected)).toBeLessThan(1e-8);
  });
  it('solved current: 0.725 for width, 0.44 for rise, 0.725 for thickness', () => {
    const r = run({ ...B, tolerances: { width: frac(0.2), deltaT: frac(0.05), copperThickness: frac(0.1) } });
    expect(sens(r, 'current capacity', 'width')).toBeCloseTo(0.725, 9);
    expect(sens(r, 'current capacity', 'temperature rise')).toBeCloseTo(0.44, 9);
    expect(sens(r, 'current capacity', 'copper thickness')).toBeCloseTo(0.725, 9);
  });
  it('solved rise: 1/0.44 for current, -0.725/0.44 for width and thickness', () => {
    const r = run({ ...C, tolerances: { current: frac(0.1), width: frac(0.2), copperThickness: frac(0.1) } });
    expect(sens(r, 'temperature rise', 'current')).toBeCloseTo(1 / 0.44, 9);
    expect(sens(r, 'temperature rise', 'width')).toBeCloseTo(-0.725 / 0.44, 9);
    expect(sens(r, 'temperature rise', 'copper thickness')).toBeCloseTo(-0.725 / 0.44, 9);
  });
  it('is the same on an inner layer (k does not enter a log sensitivity) and independent of the tolerance size', () => {
    const small = run({ ...A, layer: 'inner', tolerances: { current: frac(0.001) } });
    const big = run({ ...A, layer: 'inner', tolerances: { current: frac(0.9) } });
    expect(sens(small, 'width', 'current')).toBeCloseTo(sens(big, 'width', 'current'), 9);
    expect(sens(big, 'width', 'current')).toBeCloseTo(1 / 0.725, 9);
  });
  it('sensitivity results are dimensionless, secondary, nominal-bound', () => {
    const r = run({ ...A, tolerances: { current: frac(0.05) } });
    const x = res(r, 'sensitivity of width to current');
    expect(x.value.dim).toBe(DIM.DIMENSIONLESS);
    expect(x.role).toBe('secondary');
    expect(x.bound).toBe('nominal');
  });
});

describe('envelope structure and invariants', () => {
  it('no tolerances: no envelope, no sensitivity results, and the result equals the plain compute', () => {
    const r = run(A);
    expect(r.envelope).toBeUndefined();
    expect(r.results.some((x) => x.name.startsWith('sensitivity of'))).toBe(false);
    const empty = run({ ...A, tolerances: {} });
    expect(empty).toEqual(r);
  });
  it('the envelope does not change the nominal numbers, level, score or the existing results', () => {
    const plain = run(A);
    const withEnv = run({ ...A, tolerances: { current: frac(0.1) } });
    for (const x of plain.results) expect(si(withEnv, x.name)).toBe(x.value.si);
    expect(withEnv.confidence.level).toBe(plain.confidence.level);
    expect(withEnv.confidence.score).toBe(plain.confidence.score);
    expect(withEnv.confidence.reasons.join(' ')).toMatch(/user-supplied/);
    expect(withEnv.dataStatus).toBe(plain.dataStatus);
    expect(env(withEnv, 'width').typ.si).toBe(si(plain, 'width'));
  });
  it('zero tolerance gives a point envelope equal to the nominal result, plus an info warning', () => {
    const r = run({ ...A, tolerances: { current: frac(0), copperThickness: frac(0) } });
    const e = env(r, 'width');
    expect(e.min.si).toBe(e.typ.si);
    expect(e.max.si).toBe(e.typ.si);
    expect(e.typ.si).toBe(si(r, 'width'));
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_ZERO_TOLERANCE')).toBe(true);
  });
  it('requirement bounds round up, capacity bounds round down (the printed min/typ/max keep their order)', () => {
    const r = run({ ...B, tolerances: { width: frac(0.2) } });
    const e = env(r, 'current capacity');
    const p = (x: Quantity): string => formatResult({ value: x, bound: e.bound ?? 'nominal' }, { accuracyClass: meta.accuracyClass });
    expect(parseFloat(p(e.min))).toBeLessThanOrEqual(parseFloat(p(e.typ)));
    expect(parseFloat(p(e.typ))).toBeLessThanOrEqual(parseFloat(p(e.max)));
    expect(parseFloat(p(e.min))).toBeLessThanOrEqual(toUnit(e.min, 'A') * (1 + 1e-12));
    const w = run({ ...A, tolerances: { current: frac(0.05) } });
    const we = env(w, 'width');
    // the printed requirement (display unit mm) is never below the exact value
    const printed = formatResult({ value: we.max, bound: we.bound ?? 'nominal' }, { accuracyClass: meta.accuracyClass });
    expect(printed).toMatch(/mm/);
    expect(parseFloat(printed)).toBeGreaterThanOrEqual(toUnit(we.max, 'mm') * (1 - 1e-12));
  });
  it('lists every tolerance as an input, an assumption and the scope warning', () => {
    const r = run({ ...A, tolerances: { current: asym(0.05, 0.1) } });
    expect(r.inputs.find((i) => i.name === 'current tolerance (-)')?.value.si).toBe(0.05);
    expect(r.inputs.find((i) => i.name === 'current tolerance (+)')?.value.si).toBe(0.1);
    expect(r.inputs.find((i) => i.name === 'current tolerance (+)')?.source).toBe('user');
    expect(r.assumptions.join('\n')).toMatch(/current: -5 % \/ \+10 %/);
    expect(warningText(r)).toMatch(/worst-case corner range/);
    expect(allText(r)).toMatch(/not a statistical distribution/);
  });
  it('property: min <= typ <= max, all positive and finite, for random tolerances and solves', () => {
    const t = fc.double({ min: 0, max: 0.4, noNaN: true });
    fc.assert(
      fc.property(fc.constantFrom('outer', 'inner'), fc.double({ min: 0.5, max: 10, noNaN: true }), fc.double({ min: 5, max: 60, noNaN: true }), t, t, t, t, (layer, i, d, tc, td, tt, tm) => {
        const base: Inputs = { mode: 'B', layer, current: amp(i), deltaT: dT(d), copperWeight: oz(1) };
        const r = run({ ...base, tolerances: { current: asym(tm, tc), deltaT: asym(td, td), copperThickness: asym(tt, tc) } });
        const e = env(r, 'width');
        expect(e.min.si).toBeLessThanOrEqual(e.typ.si * (1 + 1e-12));
        expect(e.typ.si).toBeLessThanOrEqual(e.max.si * (1 + 1e-12));
        expect(e.min.si).toBeGreaterThan(0);
        expect(assertCalcResult(r).ok).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
  it('property: required width falls with thickness and rises with current (envelope ends and sensitivity signs)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 10, noNaN: true }), fc.double({ min: 5, max: 60, noNaN: true }), fc.double({ min: 0.01, max: 0.4, noNaN: true }), (i, d, t) => {
        const r = run({ mode: 'B', layer: 'outer', current: amp(i), deltaT: dT(d), copperWeight: oz(1), tolerances: { current: frac(t), copperThickness: frac(t) } });
        expect(si(r, 'sensitivity of width to copper thickness')).toBeLessThan(0);
        expect(si(r, 'sensitivity of width to current')).toBeGreaterThan(0);
        // thin copper and high current set the maximum width, thick copper and low current the minimum
        const e = env(r, 'width');
        const w0 = e.typ.si;
        expect(e.max.si).toBeGreaterThan(w0);
        expect(e.min.si).toBeLessThan(w0);
        const thick = run({ mode: 'B', layer: 'outer', current: amp(i), deltaT: dT(d), copperWeight: oz(1 + t) });
        expect(si(thick, 'width')).toBeLessThan(w0);
      }),
      { numRuns: 40 },
    );
  });
  it('capacity rises with width and with the rise; the max-capacity envelope min is the thin, narrow corner', () => {
    const r = run({ ...B, tolerances: { width: frac(0.2), deltaT: frac(0.05), copperThickness: asym(0.1, 0) } });
    expect(si(r, 'sensitivity of current capacity to width')).toBeGreaterThan(0);
    expect(si(r, 'sensitivity of current capacity to temperature rise')).toBeGreaterThan(0);
    const e = env(r, 'current capacity');
    expect(e.min.si).toBeLessThan(e.typ.si);
    expect(e.max.si).toBeGreaterThan(e.typ.si);
  });
  it('rise falls with width and thickness and rises with current', () => {
    const r = run({ ...C, tolerances: { current: frac(0.1), width: frac(0.1), copperThickness: frac(0.1) } });
    expect(si(r, 'sensitivity of temperature rise to current')).toBeGreaterThan(0);
    expect(si(r, 'sensitivity of temperature rise to width')).toBeLessThan(0);
    expect(si(r, 'sensitivity of temperature rise to copper thickness')).toBeLessThan(0);
  });
  it('the maximum conductor temperature envelope appears only when it varies (ambient or rise tolerance)', () => {
    const only = run({ ...A, tolerances: { copperThickness: frac(0.1) } });
    expect(only.envelope?.some((e) => e.name === 'maximum conductor temperature')).toBe(false);
    const withRise = run({ ...A, tolerances: { deltaT: frac(0.1) } });
    expect(env(withRise, 'maximum conductor temperature').max.si).toBeGreaterThan(env(withRise, 'maximum conductor temperature').min.si);
    const amb = run({ ...A, ambient: degC(40), tolerances: { ambient: kelvinDiff(5) } });
    const e = env(amb, 'maximum conductor temperature');
    expect(toUnit(e.typ, 'degC') - toUnit(e.min, 'degC')).toBeCloseTo(5, 9);
    expect(toUnit(e.max, 'degC') - toUnit(e.typ, 'degC')).toBeCloseTo(5, 9);
    // ambient does not move the width requirement, so that envelope is a point
    const w = env(amb, 'width');
    expect(w.min.si).toBe(w.max.si);
  });
  it('a corner outside the S-010 chart range is flagged as an extrapolation, not hidden', () => {
    // 34 A is inside the 35 A chart limit; +10 % takes the corner to 37.4 A.
    const r = run({ mode: 'B', layer: 'outer', current: amp(34), deltaT: dT(100), copperWeight: oz(3), tolerances: { current: frac(0.1) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_EXTRAPOLATION')).toBe(true);
    expect(r.validityChecks.every((c) => c.ok)).toBe(true);
  });
  it('is deterministic', () => {
    const i: Inputs = { ...A, tolerances: { current: frac(0.05), copperThickness: { source: 'foil-convention-spread' } } };
    expect(run(i)).toEqual(run(i));
  });
  it('wording audit: the envelope text carries no claim wording', () => {
    const r = run({ ...A, tolerances: { current: frac(0.05), width: frac(0.2) } });
    expectNoClaimWording(r);
  });
});

describe('choices that cannot be applied are reported, never guessed', () => {
  it('a foil-weight choice with an entered thickness applies nothing and says so (no envelope)', () => {
    const r = run({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperThickness: fromUnit(35, 'um'), tolerances: { copperThickness: { source: 'foil-convention-spread' } } });
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_CHOICE_NOT_APPLICABLE')).toBe(true);
  });
  it('S-009 has no figure for 3 oz: not available, no envelope', () => {
    const r = run({ ...A, copperWeight: oz(3), tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_CHOICE_NOT_AVAILABLE')).toBe(true);
  });
  it('S-009 outer 1 oz minimum is above nominal: no thin side, no thickness tolerance from it, S-009 not counted as used', () => {
    const r = run({ ...A, tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_CHOICE_NO_THIN_SIDE')).toBe(true);
    expect(r.reference.ledgerIds).not.toContain('S-009');
  });
  it('a user thickness with a user percentage still works', () => {
    const r = run({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperThickness: fromUnit(35, 'um'), tolerances: { copperThickness: frac(0.1) } });
    expect(env(r, 'width').max.si).toBeGreaterThan(env(r, 'width').min.si);
    expect(res(r, 'sensitivity of width to copper thickness').value.si).toBeCloseTo(-1, 9);
  });
  it('the foil spread follows the chosen convention (mass-density is not the 35 um nominal)', () => {
    const r = run({ ...A, convention: 'mass-density', tolerances: { copperThickness: { source: 'foil-convention-spread' } } });
    const plus = r.inputs.find((i) => i.name === 'copper thickness tolerance (+)');
    expect(plus?.value.si ?? 0).toBeGreaterThan(0);
  });
});

describe('fab-profile track-width tolerance (S-019l, UNVERIFIED)', () => {
  it('capacity case: the published +-20 % is used when the profile is selected, with ledger id, status and age', () => {
    const r = run({ ...B, tolerances: { width: 'profile' }, fabProfile: JLC, today: TODAY });
    const e = env(r, 'current capacity');
    const wExp = (f: number): number => res(run({ ...B, width: mm(0.5 * f) }), 'current capacity').value.si;
    expect(err(e.min.si, wExp(0.8))).toBeLessThan(TOL);
    expect(err(e.max.si, wExp(1.2))).toBeLessThan(TOL);
    const inp = r.inputs.find((i) => i.name === 'width tolerance (+/-)');
    expect(inp?.source).toBe('fab-profile');
    expect(inp?.value.si).toBeCloseTo(0.2, 12);
    expect(inp?.sourceDetail).toMatch(/S-019l/);
    expect(inp?.sourceDetail).toMatch(/UNVERIFIED/);
    expect(r.reference.ledgerIds).toContain('S-019l');
    // the worst row sets dataStatus: S-001 is already PAYWALLED, the profile row S-019l is UNVERIFIED and never improves it
    expect(r.dataStatus).toBe(run(B).dataStatus);
    expect(r.fabProfile).toEqual({ id: 'jlcpcb-2026-10-13', fabricator: 'JLCPCB', profileDate: '2026-10-13', status: 'UNVERIFIED', ageDays: 7, stale: false });
    expect(r.warnings.some((w) => w.code === 'FAB_PROFILE_UNVERIFIED')).toBe(true);
    expect(r.confidence.level).not.toBe('high');
  });
  it('solved width: the profile tolerance gives the drawn width 1 / (1 - 0.2) times the required width', () => {
    const r = run({ ...A, tolerances: { width: 'profile' }, fabProfile: JLC, today: TODAY });
    expect(err(si(r, 'drawn width covering the width tolerance'), si(r, 'width') / 0.8)).toBeLessThan(TOL);
    expect(res(r, 'drawn width covering the width tolerance').bound).toBe('min-requirement');
  });
  it('a stale profile is flagged and cannot rate high', () => {
    const r = run({ ...B, tolerances: { width: 'profile' }, fabProfile: JLC, today: '2028-01-01' });
    expect(r.fabProfile?.stale).toBe(true);
    expect(r.warnings.some((w) => w.code === 'FAB_PROFILE_STALE')).toBe(true);
    expect(r.confidence.level).not.toBe('high');
  });
  it('a profile without the entry: nothing is assumed, the result says so, no envelope', () => {
    const json = shippedJson('jlcpcb-2026-10-13.json');
    const limits = { ...(json['limits'] as Record<string, unknown>) };
    delete limits['traceWidthTolerancePct'];
    const noTol = parsed({ ...json, limits });
    const r = run({ ...B, tolerances: { width: 'profile' }, fabProfile: noTol, today: TODAY });
    expect(r.envelope).toBeUndefined();
    const w = r.warnings.find((x) => x.code === 'TOLERANCE_NOT_PUBLISHED');
    expect(w?.message).toMatch(/does not publish a track-width tolerance/);
    expect(r.fabProfile).toBeUndefined();
    expect(r.reference.ledgerIds).not.toContain('S-019l');
  });
  it('an entry that does not cite S-019l is not used', () => {
    const json = shippedJson('jlcpcb-2026-10-13.json');
    const noRow = parsed({
      ...json,
      ledgerIds: (json['ledgerIds'] as string[]).filter((x) => x !== 'S-019l'),
      scopedLimits: (json['scopedLimits'] as { ledgerId: string }[]).filter((e) => e.ledgerId !== 'S-019l'),
    });
    const r = run({ ...B, tolerances: { width: 'profile' }, fabProfile: noRow, today: TODAY });
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.some((w) => w.code === 'TOLERANCE_NOT_PUBLISHED')).toBe(true);
  });
  it('the template profile publishes nothing: no tolerance', () => {
    const r = run({ ...B, tolerances: { width: 'profile' }, fabProfile: parsed(shippedJson('template.json')), today: TODAY });
    expect(r.envelope).toBeUndefined();
  });
  it('a profile alone (without selecting it) changes nothing', () => {
    const plain = run(B);
    const withProfile = run({ ...B, tolerances: { width: frac(0.1) }, fabProfile: JLC, today: TODAY });
    expect(withProfile.fabProfile).toBeUndefined();
    expect(withProfile.reference.ledgerIds).not.toContain('S-019l');
    expect(si(withProfile, 'current capacity')).toBe(si(plain, 'current capacity'));
  });
  it('selecting the profile needs the profile and the date; a bad date is an error value', () => {
    expectError(compute, { ...B, tolerances: { width: 'profile' } }, 'INVALID_INPUT', 'fabProfile');
    expectError(compute, { ...B, tolerances: { width: 'profile' }, fabProfile: JLC }, 'INVALID_INPUT', 'today');
    expectError(compute, { ...B, tolerances: { width: 'profile' }, fabProfile: JLC, today: '2026-13-40' }, 'INVALID_INPUT', 'today');
    expectError(compute, { ...B, tolerances: { width: 'profile' }, fabProfile: { id: 1 } as unknown as ParsedFabProfile, today: TODAY }, 'INVALID_INPUT', 'fabProfile');
  });
  it('the profile value is only accepted for the width tolerance', () => {
    expectError(compute, { ...A, tolerances: { current: 'profile' as unknown as Quantity } }, 'INVALID_INPUT', 'tolerances.current');
  });
});

describe('guards: errors are values and no number is emitted from a bad tolerance', () => {
  const tol = (t: unknown, base: Inputs = A): Inputs => ({ ...base, tolerances: t as Tolerances });
  it('rejects NaN, infinity, negative, wrong dimension and unit slips', () => {
    expectError(compute, tol({ current: { si: Number.NaN, dim: DIM.DIMENSIONLESS } }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ current: { si: Number.POSITIVE_INFINITY, dim: DIM.DIMENSIONLESS } }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ current: frac(-0.1) }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ current: amp(1) }), 'DIMENSION', 'tolerances.current');
    expectError(compute, tol({ current: 0.1 }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ current: frac(0.96) }), 'OUT_OF_DOMAIN', 'tolerances.current');
    expectError(compute, tol({ current: frac(6) }), 'OUT_OF_DOMAIN', 'tolerances.current');
    expectError(compute, tol({ current: { minus: frac(0.1), plus: frac(-1) } }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ current: { minus: frac(0.1) } }), 'INVALID_INPUT', 'tolerances.current');
    expectError(compute, tol({ ambient: frac(5) }, C), 'DIMENSION', 'tolerances.ambient');
    expectError(compute, tol({ ambient: kelvinDiff(500) }, C), 'OUT_OF_DOMAIN', 'tolerances.ambient');
    expectError(compute, tol('ten percent'), 'INVALID_INPUT', 'tolerances');
    expectError(compute, tol({ colour: frac(0.1) }), 'INVALID_INPUT', 'tolerances.colour');
  });
  it('rejects a tolerance on the solved quantity, or on a defaulted ambient, naming the field', () => {
    expect(expectError(compute, tol({ width: frac(0.1), copperThickness: { source: 'nope' } as never }, A), 'INVALID_INPUT', 'tolerances.copperThickness')).toMatch(/"copperThickness" cannot take|Tolerance/i);
    expect(expectError(compute, tol({ current: frac(0.1) }, B), 'INVALID_INPUT', 'tolerances.current')).toMatch(/solved quantity/);
    expect(expectError(compute, tol({ deltaT: frac(0.1) }, C), 'INVALID_INPUT', 'tolerances.deltaT')).toMatch(/solved quantity/);
    expect(expectError(compute, tol({ ambient: kelvinDiff(5) }, A), 'INVALID_INPUT', 'tolerances.ambient')).toMatch(/user-supplied ambient/);
  });
  it('a bad nominal input still wins over tolerances', () => {
    expectError(compute, { ...A, current: amp(-1), tolerances: { deltaT: frac(0.1) } }, 'INVALID_INPUT', 'current');
    expectError(compute, { ...A, mode: 'A' as never, tolerances: { deltaT: frac(0.1) } }, 'OUT_OF_DOMAIN', 'mode');
  });
  it('a choice object cannot be used where only numbers are allowed', () => {
    expectError(compute, tol({ current: { source: 'foil-convention-spread' } }), 'INVALID_INPUT', 'tolerances.current');
  });
  it('a corner that the calculator rejects is a visible warning and the envelope is omitted, not clamped', () => {
    // Find a current that is representable but whose +500 % corner overflows (found by scanning, not hard-coded).
    let found: Inputs | undefined;
    for (let e = 200; e <= 240 && found === undefined; e += 0.25) {
      const base: Inputs = { ...A, current: amp(10 ** e) };
      const n = compute(base);
      const c = compute({ ...base, current: amp(6 * 10 ** e) });
      if (n.ok && !c.ok) found = base;
    }
    expect(found).toBeDefined();
    const r = run({ ...(found as Inputs), tolerances: { current: asym(0.5, 5) } });
    expect(r.warnings.some((w) => w.code === 'ENVELOPE_INCOMPLETE' && /envelope incomplete at corner current\+/.test(w.message))).toBe(true);
    const omitted = r.warnings.find((w) => w.code === 'ENVELOPE_BOUND_OMITTED');
    expect(omitted?.message).toMatch(/its maximum could not be determined/);
    expect(r.envelope?.some((e) => e.name === 'width') ?? false).toBe(false);
    // the nominal result and the sensitivity are still there
    expect(has(r, 'sensitivity of width to current')).toBe(true);
  });
});

describe('range failures with tolerances', () => {
  it('a nominal point the calculator rejects stays an error value even with tolerances', () => {
    expectError(compute, { ...A, current: amp(1e300), tolerances: { deltaT: frac(0.1) } }, 'OUT_OF_DOMAIN');
  });
});

describe('meta documents the envelope', () => {
  it('lists the tolerance inputs and the envelope method', () => {
    expect([...meta.toleranceInputs].sort()).toEqual(['ambient', 'copperThickness', 'current', 'deltaT', 'width']);
    expect(meta.envelope.method).toMatch(/corner/i);
    expect(meta.envelope.maxToleratedInputs).toBe(6);
    expect(meta.envelope.profileTolerance.ledgerId).toBe('S-019l');
    expect(has(run({ ...A, tolerances: { current: frac(0.1) } }), 'sensitivity of width to current')).toBe(true);
  });
});
