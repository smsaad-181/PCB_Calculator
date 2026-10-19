import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, sameDim } from '../../units';
import type { Quantity } from '../../units';
import { assertCalcResult } from '../../result';
import type { CalcResult } from '../../result';
import { compute } from './calc';
import type { Inputs } from './calc';
import { meta } from './meta';

// Phase 4 core: fusing (adiabatic time to reach the copper melting point). TESTS FIRST.
// Expected numbers come from the independent oracle (tools/reference/ref_calcs.py, fusing_* vectors, mirrored in
// docs/golden-vectors.json). Geometries and initial temperatures are TEST values, never defaults. Nothing here verifies
// S-042, S-042a, S-042b or S-042d: tests compare the implementation with the formulas.

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
const amp = (n: number): Quantity => fromUnit(n, 'A');
const sec = (n: number): Quantity => fromUnit(n, 's');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const a2s = (n: number): Quantity => q(n, DIM.ACTION_INTEGRAL);
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
const codes = (r: CalcResult): string[] => r.warnings.map((w) => w.code ?? '');

const AREA = 'conductor cross-section';
const TIME = 'adiabatic time to reach the melting point';
const CUR = 'adiabatic current to reach the melting point in the pulse time';
const I2T = 'adiabatic action integral I²t to reach the melting point';
const RATIO = 'your I²t as a fraction of the I²t to reach the melting point (not a safety margin)';
const E_TIME = 'adiabatic time to reach your end temperature';
const E_CUR = 'adiabatic current to reach your end temperature in the pulse time';
const E_I2T = 'adiabatic action integral I²t to reach your end temperature';
const E_RATIO = 'your I²t as a fraction of the I²t to reach your end temperature';
const O_TIME = 'Onderdonk time to reach the melting point (secondary check)';
const O_CUR = 'Onderdonk current to reach the melting point in the pulse time (secondary check)';
const O_I2T = 'Onderdonk action integral I²t (secondary check)';
const O_RATIO = 'Onderdonk to adiabatic ratio';
const PREECE = 'Preece current, equivalent round wire, historical reference (no time term)';

type CP = 'pppl-293k' | 'pppl-300k' | 'hyperphysics-20c';
const trace = (wMm: number, tUm: number, taC: number, extra: Partial<Inputs> = {}): Inputs => ({
  traceWidth: mm(wMm),
  traceThickness: um(tUm),
  thicknessBasis: 'finished',
  initialTemperature: degC(taC),
  current: amp(10),
  specificHeat: 'pppl-300k',
  ...extra,
});

describe('golden vectors (oracle)', () => {
  it('case 1: trace 0.254 mm x 35 um (finished), Ta 20 C, c 385, I 10 A', () => {
    const tag = 'trace0.254mmx35um_Ta20_c385';
    const r = ok(trace(0.254, 35, 20, { current: amp(10), specificHeat: 'pppl-300k' }));
    expect(relErr(res(r, AREA).value.si * 1e6, vec(`fusing_${tag}_area_mm2`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, I2T).value.si, vec(`fusing_${tag}_i2t_melt_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, TIME).value.si, vec(`fusing_${tag}_I10A_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, O_I2T).value.si, vec(`fusing_${tag}_i2t_onderdonk_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, O_TIME).value.si, vec(`fusing_${tag}_I10A_onderdonk_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, PREECE).value.si, vec(`fusing_${tag}_preece_current_A`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, O_RATIO).value.si, vec(`fusing_${tag}_i2t_onderdonk_A2s`).pinned_expected / vec(`fusing_${tag}_i2t_melt_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
  });
  it('research-note sanity arithmetic: 0.254 mm x 35 um, 10 A, 20 C: about 0.0657 s adiabatic and 0.0667 s Onderdonk', () => {
    const r = ok(trace(0.254, 35, 20));
    expect(Math.abs(res(r, TIME).value.si - 0.0657)).toBeLessThan(5e-4);
    expect(Math.abs(res(r, O_TIME).value.si - 0.0667)).toBeLessThan(5e-4);
    expect(Math.abs(res(r, PREECE).value.si - 2.78)).toBeLessThan(5e-3);
  });
  it('case 2: trace 1 mm x 35 um, Ta 25 C, c 383.48, pulse 0.5 s -> current', () => {
    const tag = 'trace1mmx35um_Ta25_c383.48';
    const r = ok({ ...trace(1, 35, 25, { specificHeat: 'pppl-293k' }), current: undefined, pulseTime: sec(0.5) });
    expect(relErr(res(r, CUR).value.si, vec(`fusing_${tag}_t0.5s_current_A`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, O_CUR).value.si, vec(`fusing_${tag}_t0.5s_onderdonk_current_A`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, I2T).value.si, vec(`fusing_${tag}_i2t_melt_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, PREECE).value.si, vec(`fusing_${tag}_preece_current_A`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(has(r, TIME)).toBe(false);
  });
  it('case 3: round wire 0.5 mm, Ta 20 C, c 386, I 30 A -> 3.57 s (over 1 s, under 10 s)', () => {
    const tag = 'wire0.5mm_Ta20_c386';
    const r = ok({ wireDiameter: mm(0.5), initialTemperature: degC(20), current: amp(30), specificHeat: 'hyperphysics-20c' });
    expect(relErr(res(r, AREA).value.si * 1e6, vec(`fusing_${tag}_area_mm2`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, TIME).value.si, vec(`fusing_${tag}_I30A_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, PREECE).value.si, vec(`fusing_${tag}_preece_current_A`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(codes(r)).toContain('OVER_1S');
    expect(codes(r)).not.toContain('OVER_10S');
  });
  it('case 4: trace 0.5 mm x 70 um, Ta 40 C, c 385, user I²t 50 A²s -> fraction of the melting I²t', () => {
    const tag = 'trace0.5mmx70um_Ta40_c385';
    const r = ok({ ...trace(0.5, 70, 40), current: undefined, actionIntegral: a2s(50) });
    expect(relErr(res(r, RATIO).value.si, vec(`fusing_${tag}_i2t50_ratio`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, I2T).value.si, vec(`fusing_${tag}_i2t_melt_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, O_I2T).value.si, vec(`fusing_${tag}_i2t_onderdonk_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(has(r, TIME)).toBe(false);
    expect(has(r, CUR)).toBe(false);
  });
  it('an area input is the same as width x thickness', () => {
    const a = ok(trace(0.254, 35, 20));
    const b = ok({ area: q(0.254e-3 * 35e-6, DIM.AREA), initialTemperature: degC(20), current: amp(10), specificHeat: 'pppl-300k' });
    expect(relErr(res(b, TIME).value.si, res(a, TIME).value.si)).toBeLessThan(1e-12);
  });
  it('the K constant and beta20 behind S-042a match the oracle (c 385)', () => {
    const r = ok(trace(0.254, 35, 20));
    const beta = r.steps.find((s) => s.label === 'beta20 = 1/alpha20 - 20 °C');
    expect(relErr((beta as { value: Quantity }).value.si, vec('fusing_beta20_degC').pinned_expected)).toBeLessThanOrEqual(1e-12);
    expect(r.steps.find((s) => /D x c/.test(s.expr))).toBeDefined();
  });
});

describe('result set, roles, bounds, dimensions, labels', () => {
  it('current mode: primary is the time; Onderdonk and Preece are secondary; no rating wording in names', () => {
    const r = ok(trace(0.254, 35, 20));
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([TIME]);
    expect(res(r, O_TIME).role).toBe('secondary');
    expect(res(r, PREECE).role).toBe('secondary');
    expect(r.results.map((x) => x.name).join(' ')).not.toMatch(/rating|safe|fuse/i);
    expect(r.designValues).toEqual([]);
  });
  it('time mode: primary is the current; I²t mode: primary is the I²t with the fraction as secondary', () => {
    const t = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(0.1) });
    expect(t.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([CUR]);
    const i = ok({ ...trace(0.254, 35, 20), current: undefined, actionIntegral: a2s(1) });
    expect(i.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([I2T]);
    expect(res(i, RATIO).role).toBe('secondary');
  });
  it('dimensions and rounding bounds (no safety direction is claimed: nominal, estimates print to 2 figures)', () => {
    const r = ok(trace(0.254, 35, 20));
    expect(sameDim(res(r, TIME).value, q(1, DIM.TIME))).toBe(true);
    expect(sameDim(res(r, I2T).value, q(1, DIM.ACTION_INTEGRAL))).toBe(true);
    expect(sameDim(res(r, AREA).value, q(1, DIM.AREA))).toBe(true);
    expect(sameDim(res(r, O_RATIO).value, q(1, DIM.DIMENSIONLESS))).toBe(true);
    expect(sameDim(res(r, PREECE).value, q(1, DIM.CURRENT))).toBe(true);
    for (const n of [TIME, I2T, O_TIME, O_I2T, PREECE, O_RATIO]) expect(res(r, n).bound, n).toBe('nominal');
    expect(res(r, AREA).bound).toBe('nominal');
  });
  it('steps use the units engine with the right dimensions (temperatures absolute, beta20 a difference)', () => {
    const r = ok(trace(0.254, 35, 20));
    const get = (l: string): Quantity => (r.steps.find((s) => s.label === l) as { value: Quantity }).value;
    expect(sameDim(get('Initial conductor temperature Ta'), q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(sameDim(get('Melting point Tm'), q(1, DIM.ABS_TEMPERATURE))).toBe(true);
    expect(sameDim(get('beta20 = 1/alpha20 - 20 °C'), q(1, DIM.TEMPERATURE_DIFFERENCE))).toBe(true);
    expect(Math.abs(get('Melting point Tm').si - 1357.77)).toBeLessThan(1e-9);
  });
  it('method and recommendation: adiabatic estimate of time to reach the melting point; not a fuse rating', () => {
    const r = ok(trace(0.254, 35, 20));
    expect(r.method).toMatch(/adiabatic/i);
    expect(r.recommendation).toMatch(/not a fuse rating/i);
    expect(r.recommendation).toMatch(/not a safe/i);
    expect(r.formula).toBe(meta.formula);
    expect(meta.formula).toMatch(/ln/);
    expect(meta.formula).toMatch(/log10/);
  });
});

describe('warnings and statements (always shown versus conditional)', () => {
  it('always: not a rating, PCB adiabatic caveat (1.5 to 6 times), reach-not-open, specific heat CONFLICT, IPC scope PAYWALLED, uniform current, Preece historical', () => {
    const r = ok(trace(0.254, 35, 20));
    for (const c of ['NOT_A_RATING', 'PCB_ADIABATIC_CAVEAT', 'REACH_NOT_OPEN', 'SPECIFIC_HEAT_CONFLICT', 'SPECIFIC_HEAT_ERRS_SHORT', 'IPC_SCOPE_PAYWALLED', 'UNIFORM_CURRENT', 'PREECE_HISTORICAL', 'INITIAL_TEMPERATURE']) {
      expect(codes(r), c).toContain(c);
    }
    const w = (c: string): string => r.warnings.find((x) => x.code === c)?.message ?? '';
    expect(w('NOT_A_RATING')).toMatch(/not a fuse rating/i);
    expect(w('NOT_A_RATING')).toMatch(/not a safe/i);
    expect(r.warnings.find((x) => x.code === 'NOT_A_RATING')?.severity).toBe('warning');
    expect(w('PCB_ADIABATIC_CAVEAT')).toMatch(/1\.5 to 6/);
    expect(w('PCB_ADIABATIC_CAVEAT')).toMatch(/S-042e/);
    expect(w('REACH_NOT_OPEN')).toMatch(/heat of fusion/i);
    expect(w('SPECIFIC_HEAT_CONFLICT')).toMatch(/383\.48/);
    expect(w('SPECIFIC_HEAT_CONFLICT')).toMatch(/386/);
    expect(w('SPECIFIC_HEAT_CONFLICT')).toMatch(/S-042d/);
    expect(w('IPC_SCOPE_PAYWALLED')).toMatch(/steady-state/i);
    expect(w('IPC_SCOPE_PAYWALLED')).toMatch(/S-042f/);
    expect(w('PREECE_HISTORICAL')).toMatch(/not a PCB model/i);
    expect(w('PREECE_HISTORICAL')).toMatch(/historical/i);
  });
  it('the IPC scope check is shown as a PAYWALLED condition (a validity check that is not passed)', () => {
    const r = ok(trace(0.254, 35, 20));
    const c = r.validityChecks.find((x) => /IPC/.test(x.name));
    expect(c).toBeDefined();
    expect(c?.ok).toBe(false);
    expect(c?.notChecked).toBe(true);
    expect(c?.detail).toMatch(/PAYWALLED/);
    expect(r.validityChecks.filter((x) => x.notChecked === true)).toHaveLength(1);
    expect(r.reference.ledgerIds).toContain('S-042f');
  });
  it('time over 1 s warns, over 10 s warns strongly, both labelled product choices not sourced limits; 1 s and below do not', () => {
    const short = ok(trace(0.254, 35, 20, { current: amp(10) })); // 0.066 s
    expect(codes(short)).not.toContain('OVER_1S');
    expect(codes(short)).not.toContain('OVER_10S');
    expect(short.validityChecks.every((c) => c.ok || c.notChecked === true)).toBe(true);
    const mid = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(3) });
    expect(codes(mid)).toContain('OVER_1S');
    expect(codes(mid)).not.toContain('OVER_10S');
    const m = mid.warnings.find((x) => x.code === 'OVER_1S');
    expect(m?.message).toMatch(/product choices, not sourced limits/);
    expect(m?.severity).toBe('warning');
    const long = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(30) });
    expect(codes(long)).toContain('OVER_1S');
    expect(codes(long)).toContain('OVER_10S');
    const l = long.warnings.find((x) => x.code === 'OVER_10S');
    expect(l?.message).toMatch(/product choices, not sourced limits/);
    expect(l?.severity).toBe('critical');
    expect(long.confidence.level).toBe('low');
    const edge = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(1) });
    expect(codes(edge)).not.toContain('OVER_1S');
    const edge10 = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(10) });
    expect(codes(edge10)).not.toContain('OVER_10S');
  });
  it('the threshold also applies to the computed time in current mode', () => {
    const r = ok({ wireDiameter: mm(1), initialTemperature: degC(20), current: amp(10), specificHeat: 'pppl-300k' });
    expect(res(r, TIME).value.si).toBeGreaterThan(10);
    expect(codes(r)).toContain('OVER_10S');
  });
  it('I²t mode: no duration, so the time thresholds cannot be checked and say so', () => {
    const r = ok({ ...trace(0.254, 35, 20), current: undefined, actionIntegral: a2s(5) });
    expect(codes(r)).toContain('NO_DURATION');
    expect(codes(r)).not.toContain('OVER_1S');
    expect(r.warnings.find((x) => x.code === 'NO_DURATION')?.message).toMatch(/duration/i);
  });
  it('nominal (from foil weight) thickness basis adds the S-003 / S-009 caution; finished and measured do not', () => {
    const n = ok(trace(0.254, 35, 20, { thicknessBasis: 'nominal' }));
    const w = n.warnings.find((x) => x.code === 'THICKNESS_NOMINAL');
    expect(w?.message).toMatch(/S-009/);
    expect(w?.message).toMatch(/S-003/);
    expect(w?.message).toMatch(/thinner/i);
    expect(n.confidence.score).toBeGreaterThan(ok(trace(0.254, 35, 20, { thicknessBasis: 'finished' })).confidence.score);
    for (const b of ['finished', 'measured'] as const) expect(codes(ok(trace(0.254, 35, 20, { thicknessBasis: b })))).not.toContain('THICKNESS_NOMINAL');
  });
  it('the specific heat default is stated as a default with the conflict; an explicit choice is not a default', () => {
    const d = ok({ ...trace(0.254, 35, 20), specificHeat: undefined });
    const e = ok(trace(0.254, 35, 20));
    expect(d.assumptions.join(' ')).toMatch(/default/i);
    expect(d.assumptions.join(' ')).toMatch(/385/);
    expect(d.assumptions.join(' ')).toMatch(/CONFLICT/);
    expect(res(d, TIME).value.si).toBe(res(e, TIME).value.si);
    expect(d.confidence.score).toBeGreaterThan(e.confidence.score);
  });
  it('specific heat choices scale the time linearly (0.7 % effect) and are all sourced values', () => {
    const t = (cp: CP): number => res(ok(trace(0.254, 35, 20, { specificHeat: cp })), TIME).value.si;
    expect(relErr(t('pppl-293k') / t('pppl-300k'), 383.48 / 385)).toBeLessThan(1e-12);
    expect(relErr(t('hyperphysics-20c') / t('pppl-300k'), 386 / 385)).toBeLessThan(1e-12);
  });
  it('plausibility: thickness outside 5 to 500 um (trace) and an initial temperature outside -55 to 150 C fail a validity check, not a standard', () => {
    const thin = ok(trace(0.254, 2, 20));
    const bad = thin.validityChecks.find((c) => /thickness/.test(c.name));
    expect(bad?.ok).toBe(false);
    expect(bad?.detail).toMatch(/not a standard/i);
    expect(thin.confidence.level).toBe('low');
    const hot = ok(trace(0.254, 35, 300));
    expect(hot.validityChecks.find((c) => /initial temperature/.test(c.name))?.ok).toBe(false);
    const fine = ok(trace(0.254, 35, 20));
    expect(fine.validityChecks.filter((c) => c.notChecked !== true).every((c) => c.ok)).toBe(true);
  });
  it('no compliance wording; no result or recommendation presents a rating or safe current', () => {
    const r = ok(trace(0.254, 35, 20));
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/complian|production[ ]safe|guarantee|certif/i);
    for (const w of r.warnings) if (/fuse rating|safe (overload|current)/i.test(w.message)) expect(w.message, w.code).toMatch(/not a/i);
  });
});

describe('optional user end temperature (PCB M-1): never defaulted, never a safety margin', () => {
  const T = 'trace0.254mmx35um_Ta20_c385';
  it('golden: Te 300 C, current mode: I2t and time to Te match the oracle (S-042a with Te for Tm); melting results unchanged', () => {
    const r = ok(trace(0.254, 35, 20, { current: amp(10), specificHeat: 'pppl-300k', endTemperature: degC(300) }));
    expect(relErr(res(r, E_I2T).value.si, vec(`fusing_${T}_Te300_i2t_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, E_TIME).value.si, vec(`fusing_${T}_Te300_I10A_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, TIME).value.si, vec(`fusing_${T}_I10A_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(res(r, E_TIME).role).toBe('secondary');
    expect(res(r, TIME).role).toBe('primary');
    expect(res(r, E_TIME).bound).toBe('nominal');
    expect(sameDim(res(r, E_I2T).value, q(1, DIM.ACTION_INTEGRAL))).toBe(true);
    expect(r.inputs.some((i) => /end temperature/.test(i.name))).toBe(true);
  });
  it('golden: Te 260 C, time mode: current to Te matches the oracle', () => {
    const r = ok({ ...trace(1, 35, 25, { specificHeat: 'pppl-293k', endTemperature: degC(260) }), current: undefined, pulseTime: sec(0.5) });
    expect(relErr(res(r, E_CUR).value.si, vec('fusing_trace1mmx35um_Ta25_c383.48_Te260_t0.5s_current_A').pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(has(r, E_TIME)).toBe(false);
    expect(res(r, E_CUR).value.si).toBeLessThan(res(r, CUR).value.si);
  });
  it('golden: Te 300 C, I2t mode: the fraction of the I2t to Te matches the oracle; the melting fraction is labelled not a safety margin', () => {
    const r = ok({ ...trace(0.5, 70, 40, { endTemperature: degC(300) }), current: undefined, actionIntegral: a2s(50) });
    expect(relErr(res(r, E_RATIO).value.si, vec('fusing_trace0.5mmx70um_Ta40_c385_Te300_i2t50_ratio').pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(res(r, E_RATIO).value.si).toBeGreaterThan(1);
    expect(res(r, RATIO).value.si).toBeLessThan(1);
    expect(res(r, RATIO).note).toMatch(/not a safety margin/i);
    expect(res(r, RATIO).name).toMatch(/not a safety margin/i);
  });
  it('the melting fraction is labelled not a safety margin even without an end temperature, and no end results appear', () => {
    const r = ok({ ...trace(0.5, 70, 40), current: undefined, actionIntegral: a2s(50) });
    expect(res(r, RATIO).note).toMatch(/not a safety margin/i);
    for (const n of [E_TIME, E_CUR, E_I2T, E_RATIO]) expect(has(r, n), n).toBe(false);
  });
  it('there is no default: absent means no end results and the board-damage warning asks the user to enter one', () => {
    const r = ok(trace(0.254, 35, 20));
    for (const n of [E_TIME, E_CUR, E_I2T, E_RATIO]) expect(has(r, n), n).toBe(false);
    expect(r.inputs.some((i) => /end temperature/.test(i.name))).toBe(false);
    const w = r.warnings.find((x) => x.code === 'BOARD_DAMAGE_BELOW_MELTING');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/far below/i);
    expect(w?.message).toMatch(/laminate datasheet/i);
    expect(w?.message).toMatch(/enter/i);
  });
  it("with an end temperature the board-damage warning is still shown and says the value is the user's and not checked", () => {
    const w = ok(trace(0.254, 35, 20, { endTemperature: degC(300) })).warnings.find((x) => x.code === 'BOARD_DAMAGE_BELOW_MELTING');
    expect(w?.message).toMatch(/your end temperature/i);
    expect(w?.message).toMatch(/not (checked|verified)/i);
  });
  it('Te equal to the melting point reproduces the melting results; Te must exceed Ta and not exceed the melting point', () => {
    const tm = fromUnit(1084.62, 'degC');
    const r = ok(trace(0.254, 35, 20, { endTemperature: tm }));
    expect(relErr(res(r, E_I2T).value.si, res(r, I2T).value.si)).toBeLessThan(1e-9);
    for (const te of [1084.63, 2000, 20, 19, -10]) {
      const out = compute(trace(0.254, 35, 20, { endTemperature: degC(te) }));
      expect(out.ok, `Te ${String(te)}`).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe('OUT_OF_DOMAIN');
        expect(out.error.field).toBe('endTemperature');
      }
    }
  });
  it('the end temperature is guarded: absolute temperature only, finite', () => {
    for (const v of [raw(NaN, DIM.ABS_TEMPERATURE), raw(Infinity, DIM.ABS_TEMPERATURE), raw(-Infinity, DIM.ABS_TEMPERATURE)]) {
      const out = compute(trace(0.254, 35, 20, { endTemperature: v }));
      expect(out.ok).toBe(false);
    }
    const dt = compute(trace(0.254, 35, 20, { endTemperature: q(200, DIM.TEMPERATURE_DIFFERENCE) }));
    expect(dt.ok).toBe(false);
    if (!dt.ok) expect(dt.error.code).toBe('DIMENSION');
    expect(compute(trace(0.254, 35, 20, { endTemperature: 300 as unknown as Quantity })).ok).toBe(false);
  });
  it('a lower end temperature is always a shorter time and a smaller I2t (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 25, max: 1000, noNaN: true }), fc.double({ min: 25, max: 1000, noNaN: true }), (a, b) => {
        fc.pre(Math.abs(a - b) > 1);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const f = (te: number): number => res(ok(trace(0.3, 35, 20, { endTemperature: degC(te) })), E_I2T).value.si;
        expect(f(lo)).toBeLessThan(f(hi));
      }),
      { numRuns: 60 },
    );
  });
});

describe('weakest link, via barrel geometry and sanity limits (PCB M-2, calc C4-2)', () => {
  const via = (dMm: number, tUm: number, extra: Partial<Inputs> = {}): Inputs => ({
    viaHoleDiameter: mm(dMm),
    viaPlatingThickness: um(tUm),
    initialTemperature: degC(25),
    current: amp(20),
    specificHeat: 'pppl-300k',
    ...extra,
  });
  it('always cautions that the smallest cross-section in series usually fuses first', () => {
    const wire: Inputs = { wireDiameter: mm(0.5), initialTemperature: degC(20), current: amp(30), specificHeat: 'pppl-300k' };
    for (const inp of [trace(0.254, 35, 20), via(0.3, 25), wire]) {
      const w = ok(inp).warnings.find((x) => x.code === 'WEAKEST_LINK');
      expect(w?.severity).toBe('caution');
      expect(w?.message).toMatch(/smallest cross-section/i);
      expect(w?.message).toMatch(/usually fuses first/i);
      expect(w?.message).toMatch(/via barrels/i);
    }
  });
  it('golden: via barrel d 0.3 mm finished, t 25 um: area pi t (d + t), I2t and time match the oracle', () => {
    const tag = 'via0.3mmx25um_Ta25_c385';
    const r = ok(via(0.3, 25));
    expect(relErr(res(r, AREA).value.si * 1e6, vec(`fusing_${tag}_area_mm2`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, I2T).value.si, vec(`fusing_${tag}_i2t_melt_A2s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(relErr(res(r, TIME).value.si, vec(`fusing_${tag}_I20A_time_s`).pinned_expected)).toBeLessThanOrEqual(TOL);
    expect(r.assumptions.join(' ')).toMatch(/finished hole/i);
    expect(r.assumptions.join(' ')).toMatch(/AVERAGE|average/);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-015', 'S-019m']));
    expect(r.inputs.some((i) => i.name === 'via finished hole diameter')).toBe(true);
    expect(r.inputs.some((i) => i.name === 'via barrel plating thickness')).toBe(true);
  });
  it('the via area equals the same area entered directly; the other geometries do not cite the via rows', () => {
    const a = ok(via(0.3, 25));
    const direct = ok({ area: q(res(a, AREA).value.si, DIM.AREA), initialTemperature: degC(25), current: amp(20), specificHeat: 'pppl-300k' });
    expect(relErr(res(direct, TIME).value.si, res(a, TIME).value.si)).toBeLessThan(1e-12);
    expect(direct.reference.ledgerIds).not.toContain('S-015');
    expect(direct.reference.ledgerIds).not.toContain('S-019m');
  });
  it('plating at or above the finished hole diameter fails a plausibility check (low confidence)', () => {
    const r = ok(via(0.1, 120));
    expect(r.validityChecks.some((c) => !c.ok && c.notChecked !== true && /plating/.test(c.name))).toBe(true);
    expect(r.confidence.level).toBe('low');
    expect(ok(via(0.3, 25)).validityChecks.filter((c) => c.notChecked !== true).every((c) => c.ok)).toBe(true);
  });
  it('geometry families stay exclusive and a via needs both fields', () => {
    expect(compute({ ...via(0.3, 25), area: q(1e-8, DIM.AREA) }).ok).toBe(false);
    expect(compute({ ...via(0.3, 25), wireDiameter: mm(0.5) }).ok).toBe(false);
    expect(compute({ ...via(0.3, 25), traceWidth: mm(1) }).ok).toBe(false);
    const a = compute({ ...via(0.3, 25), viaPlatingThickness: undefined });
    const b = compute({ ...via(0.3, 25), viaHoleDiameter: undefined });
    for (const [o, f] of [
      [a, 'viaPlatingThickness'],
      [b, 'viaHoleDiameter'],
    ] as const) {
      expect(o.ok).toBe(false);
      if (!o.ok) {
        expect(o.error.code).toBe('INVALID_INPUT');
        expect(o.error.field).toBe(f);
      }
    }
    for (const v of [0, -1e-5, NaN, Infinity]) {
      expect(compute(via(0.3, 25, { viaPlatingThickness: raw(v, DIM.LENGTH) })).ok).toBe(false);
      expect(compute(via(0.3, 25, { viaHoleDiameter: raw(v, DIM.LENGTH) })).ok).toBe(false);
    }
    const wrong = compute(via(0.3, 25, { viaHoleDiameter: q(1e-8, DIM.AREA) }));
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe('DIMENSION');
  });
  it('input sanity limits (not sourced): an area above 1 m2 or a diameter or width above 1 m is rejected with a clear message', () => {
    const cases: [string, Inputs][] = [
      ['area', { area: q(1.0001, DIM.AREA), initialTemperature: degC(25), current: amp(1), specificHeat: 'pppl-300k' }],
      ['wireDiameter', { wireDiameter: mm(1001), initialTemperature: degC(25), current: amp(1), specificHeat: 'pppl-300k' }],
      ['traceWidth', trace(1001, 35, 25)],
      ['viaHoleDiameter', via(1001, 25)],
    ];
    for (const [f, inp] of cases) {
      const out = compute(inp);
      expect(out.ok, f).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe('OUT_OF_DOMAIN');
        expect(out.error.message).toMatch(/sanity limit/i);
        expect(out.error.message).toMatch(/not a sourced limit/i);
      }
    }
    expect(compute({ area: q(1e10, DIM.AREA), initialTemperature: degC(25), current: amp(1e-10), specificHeat: 'pppl-300k' }).ok).toBe(false);
    expect(ok({ area: q(1, DIM.AREA), initialTemperature: degC(25), current: amp(1e6), specificHeat: 'pppl-300k' }).results.length).toBeGreaterThan(0);
    expect(ok({ wireDiameter: mm(1000), initialTemperature: degC(25), current: amp(1e6), specificHeat: 'pppl-300k' }).results.length).toBeGreaterThan(0);
  });
});

describe('texts: Preece date, density basis, sub-millisecond, ledger ids (calc C4-3, m-4, m-8; phase m-3)', () => {
  it('the Preece date is stated as in conflict and the reference points at S-042b', () => {
    expect(meta.reference.standard).toContain('Preece (1884 or 1888, sources conflict, see S-042b)');
    expect(meta.reference.standard).not.toContain('Preece equation (1888)');
  });
  it('the assumptions state the density value used (IACS wire-table convention) and that a pure-copper reference differs by about 0.5 %', () => {
    const t = ok(trace(0.254, 35, 20)).assumptions.join(' ');
    expect(t).toMatch(/8890/);
    expect(t).toMatch(/IACS/);
    expect(t).toMatch(/0\.5 %/);
  });
  it('a computed or entered pulse under 1 ms adds a warning that the model is unreliable, labelled a product choice', () => {
    const cur = ok(trace(0.254, 35, 20, { current: amp(1000) })); // about 6.6 us
    const w = cur.warnings.find((x) => x.code === 'SUB_MS_PULSE');
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/adiabatic/i);
    expect(w?.message).toMatch(/skin effect/i);
    expect(w?.message).toMatch(/inductance/i);
    expect(w?.message).toMatch(/product choice/i);
    const tm = ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(0.0005) });
    expect(codes(tm)).toContain('SUB_MS_PULSE');
    expect(codes(ok({ ...trace(0.254, 35, 20), current: undefined, pulseTime: sec(0.001) }))).not.toContain('SUB_MS_PULSE');
    expect(codes(ok(trace(0.254, 35, 20)))).not.toContain('SUB_MS_PULSE'); // 66 ms
    expect(codes(ok({ ...trace(0.254, 35, 20), current: undefined, actionIntegral: a2s(1e-6) }))).not.toContain('SUB_MS_PULSE');
  });
  it('S-009 is listed for a nominal thickness basis only; the meta carries all cited rows', () => {
    expect(ok(trace(0.254, 35, 20, { thicknessBasis: 'nominal' })).reference.ledgerIds).toContain('S-009');
    expect(ok(trace(0.254, 35, 20)).reference.ledgerIds).not.toContain('S-009');
    expect(meta.ledgerIds).toEqual(expect.arrayContaining(['S-009', 'S-015', 'S-019m']));
    expect(meta.reference.ledgerIds).toEqual(expect.arrayContaining(['S-009', 'S-015', 'S-019m']));
  });
  it('the nominal-basis warning names both directions (outer layers are often thicker than nominal)', () => {
    const m = ok(trace(0.254, 35, 20, { thicknessBasis: 'nominal' })).warnings.find((x) => x.code === 'THICKNESS_NOMINAL')?.message ?? '';
    expect(m).toMatch(/thinner/i);
    expect(m).toMatch(/thicker/i);
  });
});

describe('confidence and data status (rule based)', () => {
  it('CONFLICT data status (S-042d), never high, low with the estimate class, reasons present', () => {
    for (const r of [ok(trace(0.254, 35, 20)), ok({ wireDiameter: mm(0.5), initialTemperature: degC(20), pulseTime: sec(0.2), specificHeat: 'pppl-300k' })]) {
      expect(r.dataStatus).toBe('CONFLICT');
      expect(r.confidence.level).toBe('low');
      expect(r.confidence.reasons.length).toBeGreaterThan(0);
      // The not-checked IPC item is not a failure: the low level comes from the rule score alone (estimate 2 + CONFLICT 2).
      expect(r.validityChecks.filter((c) => !c.ok && c.notChecked !== true)).toHaveLength(0);
      expect(r.confidence.score).toBeGreaterThanOrEqual(3);
      expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-042', 'S-042a', 'S-042b', 'S-042c', 'S-042d', 'S-042e', 'S-042f', 'S-003d', 'S-004']));
    }
  });
});

describe('guards (errors are values, never numbers)', () => {
  const bads: [string, number][] = [
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['zero', 0],
    ['negative', -1e-3],
  ];
  const cases: [string, keyof Inputs, Quantity['dim'], Partial<Inputs>][] = [
    ['traceWidth', 'traceWidth', DIM.LENGTH, {}],
    ['traceThickness', 'traceThickness', DIM.LENGTH, {}],
    ['current', 'current', DIM.CURRENT, {}],
    ['pulseTime', 'pulseTime', DIM.TIME, { current: undefined, pulseTime: sec(1) }],
    ['actionIntegral', 'actionIntegral', DIM.ACTION_INTEGRAL, { current: undefined, actionIntegral: a2s(1) }],
  ];
  for (const [label, f, dim, extra] of cases) {
    for (const [name, v] of bads) {
      it(`${label} = ${name} is rejected as INVALID_INPUT on that field`, () => {
        const out = compute({ ...trace(0.254, 35, 20), ...extra, [f]: raw(v, dim) } as Inputs);
        expect(out.ok).toBe(false);
        if (!out.ok) {
          expect(out.error.code).toBe('INVALID_INPUT');
          expect(out.error.field).toBe(f);
        }
      });
    }
    it(`${label} with the wrong dimension is DIMENSION`, () => {
      const out = compute({ ...trace(0.254, 35, 20), ...extra, [f]: raw(1, DIM.VOLTAGE) } as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe('DIMENSION');
    });
  }
  for (const [name, v] of bads) {
    it(`area / wireDiameter = ${name} is rejected`, () => {
      expect(compute({ area: raw(v, DIM.AREA), initialTemperature: degC(20), current: amp(1) }).ok).toBe(false);
      expect(compute({ wireDiameter: raw(v, DIM.LENGTH), initialTemperature: degC(20), current: amp(1) }).ok).toBe(false);
    });
  }
  it('the initial temperature is required, absolute (not a difference), finite', () => {
    const noTa = { ...trace(0.254, 35, 20) } as Record<string, unknown>;
    delete noTa['initialTemperature'];
    const a = compute(noTa as unknown as Inputs);
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.error.field).toBe('initialTemperature');
      expect(a.error.message).toMatch(/required/);
    }
    const b = compute(trace(0.254, 35, 20, { initialTemperature: raw(20, DIM.TEMPERATURE_DIFFERENCE) }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toBe('DIMENSION');
    for (const v of [NaN, Infinity]) expect(compute(trace(0.254, 35, 20, { initialTemperature: raw(v, DIM.ABS_TEMPERATURE) })).ok).toBe(false);
    expect(compute(trace(0.254, 35, 20, { initialTemperature: raw(0, DIM.ABS_TEMPERATURE) })).ok).toBe(false);
  });
  it('an initial temperature at or above the melting point is rejected as OUT_OF_DOMAIN; so is one where the linear model breaks', () => {
    for (const ta of [1084.62, 1200]) {
      const out = compute(trace(0.254, 35, 20, { initialTemperature: degC(ta) }));
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe('OUT_OF_DOMAIN');
        expect(out.error.field).toBe('initialTemperature');
      }
    }
    const cold = compute(trace(0.254, 35, 20, { initialTemperature: fromUnit(20, 'K') }));
    expect(cold.ok).toBe(false);
    if (!cold.ok) expect(cold.error.code).toBe('OUT_OF_DOMAIN');
  });
  it('exactly one geometry family: none, or several, is rejected', () => {
    const none = compute({ initialTemperature: degC(20), current: amp(1) } as unknown as Inputs);
    expect(none.ok).toBe(false);
    const two = compute({ ...trace(0.254, 35, 20), area: q(1e-8, DIM.AREA) });
    expect(two.ok).toBe(false);
    const three = compute({ ...trace(0.254, 35, 20), wireDiameter: mm(0.5) });
    expect(three.ok).toBe(false);
    if (!three.ok) expect(three.error.field).toBe('geometry');
  });
  it('a trace needs both width and thickness and a thickness basis (no default)', () => {
    const w = compute({ traceWidth: mm(0.254), initialTemperature: degC(20), current: amp(1), thicknessBasis: 'finished' } as unknown as Inputs);
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.error.field).toBe('traceThickness');
    const t = compute({ traceThickness: um(35), initialTemperature: degC(20), current: amp(1), thicknessBasis: 'finished' } as unknown as Inputs);
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error.field).toBe('traceWidth');
    const noBasis = { ...trace(0.254, 35, 20) } as Record<string, unknown>;
    delete noBasis['thicknessBasis'];
    for (const inp of [noBasis, { ...noBasis, thicknessBasis: 'typical' }]) {
      const out = compute(inp as unknown as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe('thicknessBasis');
    }
  });
  it('exactly one of current, pulseTime, actionIntegral', () => {
    const none = { ...trace(0.254, 35, 20) } as Record<string, unknown>;
    delete none['current'];
    const a = compute(none as unknown as Inputs);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error.field).toBe('pulse');
    const b = compute({ ...trace(0.254, 35, 20), pulseTime: sec(1) });
    expect(b.ok).toBe(false);
    const c = compute({ ...trace(0.254, 35, 20), actionIntegral: a2s(1) });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error.field).toBe('pulse');
  });
  it('specific heat choice must be a known sourced value; there is no free-form override', () => {
    for (const v of ['copper', 385, null]) {
      const out = compute({ ...trace(0.254, 35, 20), specificHeat: v } as unknown as Inputs);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.field).toBe('specificHeat');
    }
  });
  it('there is no melting point override input: an extra field is ignored and cannot change the result', () => {
    const a = ok(trace(0.254, 35, 20));
    const b = ok({ ...trace(0.254, 35, 20), meltingPoint: degC(500) } as unknown as Inputs);
    expect(res(b, TIME).value.si).toBe(res(a, TIME).value.si);
  });
  it('non-object and non-quantity inputs return errors, never throw', () => {
    for (const bad of [null, undefined, 3, 'x', []]) expect(() => compute(bad as unknown as Inputs)).not.toThrow();
    expect(compute(null as unknown as Inputs).ok).toBe(false);
    expect(compute({ ...trace(0.254, 35, 20), current: 3 } as unknown as Inputs).ok).toBe(false);
  });
  it('overflow of the representable range is an OUT_OF_DOMAIN error value, not Infinity', () => {
    const out = compute({ area: q(1e100, DIM.AREA), initialTemperature: degC(20), current: amp(1e-100), specificHeat: 'pppl-300k' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('OUT_OF_DOMAIN');
  });
});

describe('properties', () => {
  const geo = fc.record({
    w: fc.double({ min: 0.05, max: 10, noNaN: true }),
    t: fc.double({ min: 10, max: 140, noNaN: true }),
    ta: fc.double({ min: -40, max: 140, noNaN: true }),
    i: fc.double({ min: 0.5, max: 500, noNaN: true }),
    cp: fc.constantFrom<CP>('pppl-293k', 'pppl-300k', 'hyperphysics-20c'),
  });
  it('I²t = I² x t; assertCalcResult holds; everything finite and positive', () => {
    fc.assert(
      fc.property(geo, ({ w, t, ta, i, cp }) => {
        const r = ok(trace(w, t, ta, { current: amp(i), specificHeat: cp }));
        const time = res(r, TIME).value.si;
        expect(relErr(time * i * i, res(r, I2T).value.si)).toBeLessThan(1e-12);
        expect(time).toBeGreaterThan(0);
        expect(Number.isFinite(time)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
  it('I²t scales with the area squared; time falls with current squared; a hotter start is shorter', () => {
    fc.assert(
      fc.property(geo, ({ w, t, ta, i, cp }) => {
        const a = ok(trace(w, t, ta, { current: amp(i), specificHeat: cp }));
        const b = ok(trace(w * 2, t, ta, { current: amp(i), specificHeat: cp }));
        expect(relErr(res(b, I2T).value.si, res(a, I2T).value.si * 4)).toBeLessThan(1e-12);
        const c = ok(trace(w, t, ta, { current: amp(i * 2), specificHeat: cp }));
        expect(relErr(res(c, TIME).value.si * 4, res(a, TIME).value.si)).toBeLessThan(1e-12);
        const h = ok(trace(w, t, ta + 10, { current: amp(i), specificHeat: cp }));
        expect(res(h, TIME).value.si).toBeLessThan(res(a, TIME).value.si);
      }),
      { numRuns: 100 },
    );
  });
  it('time mode and current mode are inverse: the current for the computed time is the input current', () => {
    fc.assert(
      fc.property(geo, ({ w, t, ta, i, cp }) => {
        const a = ok(trace(w, t, ta, { current: amp(i), specificHeat: cp }));
        const back = ok({ ...trace(w, t, ta, { specificHeat: cp }), current: undefined, pulseTime: sec(res(a, TIME).value.si) });
        expect(relErr(res(back, CUR).value.si, i)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });
  it('the user I²t equal to the melting I²t gives a fraction of 1; Onderdonk stays within a few percent of the adiabatic physics', () => {
    fc.assert(
      fc.property(geo, ({ w, t, ta, i, cp }) => {
        const a = ok(trace(w, t, ta, { current: amp(i), specificHeat: cp }));
        const same = ok({ ...trace(w, t, ta, { specificHeat: cp }), current: undefined, actionIntegral: a2s(res(a, I2T).value.si) });
        expect(Math.abs(res(same, RATIO).value.si - 1)).toBeLessThan(1e-9);
        const ratio = res(a, O_RATIO).value.si;
        expect(ratio).toBeGreaterThan(0.98);
        expect(ratio).toBeLessThan(1.06);
      }),
      { numRuns: 100 },
    );
  });
  it('Preece depends on the area only (equivalent round wire), not on Ta, current or c', () => {
    fc.assert(
      fc.property(geo, ({ w, t, ta, i, cp }) => {
        const a = ok(trace(w, t, ta, { current: amp(i), specificHeat: cp }));
        const b = ok(trace(w, t, 20, { current: amp(1), specificHeat: 'pppl-300k' }));
        expect(res(a, PREECE).value.si).toBe(res(b, PREECE).value.si);
      }),
      { numRuns: 60 },
    );
  });
});

describe('metadata and performance', () => {
  it('meta lists the ledger rows and an estimate class; no fab limit and no melting point override', () => {
    expect(meta.id).toBe('fusing');
    expect(meta.accuracyClass).toBe('estimate');
    expect(meta.ledgerIds).toEqual(expect.arrayContaining(['S-003d', 'S-004', 'S-042', 'S-042a', 'S-042b', 'S-042c', 'S-042d', 'S-042e', 'S-042f']));
  });
  it('fusing does not import from self-heating (separate calculators)', () => {
    const files = import.meta.glob(['./*.ts', '!./*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    for (const [name, text] of Object.entries(files)) expect(text, name).not.toMatch(/self-heating/);
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });
  it('10 000 computes within a 5 s total budget', () => {
    const inp = trace(0.254, 35, 20);
    const t0 = performance.now();
    for (let i = 0; i < 10000; i++) compute(inp);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
