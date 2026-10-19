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
const RATIO = 'your I²t as a fraction of the I²t to reach the melting point';
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
    expect(c?.detail).toMatch(/PAYWALLED/);
    expect(r.reference.ledgerIds).toContain('S-042f');
  });
  it('time over 1 s warns, over 10 s warns strongly, both labelled product choices not sourced limits; 1 s and below do not', () => {
    const short = ok(trace(0.254, 35, 20, { current: amp(10) })); // 0.066 s
    expect(codes(short)).not.toContain('OVER_1S');
    expect(codes(short)).not.toContain('OVER_10S');
    expect(short.validityChecks.every((c) => c.ok || /IPC/.test(c.name))).toBe(true);
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
    expect(fine.validityChecks.filter((c) => !/IPC/.test(c.name)).every((c) => c.ok)).toBe(true);
  });
  it('no compliance wording; no result or recommendation presents a rating or safe current', () => {
    const r = ok(trace(0.254, 35, 20));
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/complian|production[ ]safe|guarantee|certif/i);
    for (const w of r.warnings) if (/fuse rating|safe (overload|current)/i.test(w.message)) expect(w.message, w.code).toMatch(/not a/i);
  });
});

describe('confidence and data status (rule based)', () => {
  it('CONFLICT data status (S-042d), never high, low with the estimate class, reasons present', () => {
    for (const r of [ok(trace(0.254, 35, 20)), ok({ wireDiameter: mm(0.5), initialTemperature: degC(20), pulseTime: sec(0.2), specificHeat: 'pppl-300k' })]) {
      expect(r.dataStatus).toBe('CONFLICT');
      expect(r.confidence.level).toBe('low');
      expect(r.confidence.reasons.length).toBeGreaterThan(0);
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
