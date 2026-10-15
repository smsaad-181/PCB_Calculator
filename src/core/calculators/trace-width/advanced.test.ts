import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import type { CalcResult } from '../../result';
import { parseFabProfile } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { finishedVsNominal } from '../../data/finished-copper';
import { err, expectError, expectNoClaimWording, okOf, res, si, vec } from '../circuit-test-utils';
import { compute } from './calc';
import type { Inputs } from './calc';

// Phase 1 cleanup, trace-width: PV-3 (RMS pulse input), PCB-8 (stated-maximum check wording), PCB-10 (fab minimum width note),
// PCB-6 (inner finished-copper shortfall), F-3 (S-009 in the reference ids), PV-8 (no mutable module cache). TESTS FIRST.
// Pulse numbers come from the independent oracle (trace_width_rms_* in docs/golden-vectors.json, tools/reference/ref_calcs.py).
// Nothing here verifies S-001 (PAYWALLED), S-009 (PAYWALLED), S-019f (UNVERIFIED) or the JLCPCB profile (UNVERIFIED).

const oz = (n: number): Quantity => fromUnit(n, 'oz/ft2');
const mil = (n: number): Quantity => fromUnit(n, 'mil');
const mm = (n: number): Quantity => fromUnit(n, 'mm');
const um = (n: number): Quantity => fromUnit(n, 'um');
const amp = (n: number): Quantity => fromUnit(n, 'A');
const dT = (n: number): Quantity => fromUnit(n, 'ddegC');
const degC = (n: number): Quantity => fromUnit(n, 'degC');
const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const g = (x: number): string => String(x);
const TOL = 1e-9;

const run = (i: Inputs): CalcResult => okOf(compute, i);
/** A copy without the named keys (exactOptionalPropertyTypes forbids setting them to undefined). */
const omit = (i: Inputs, ...keys: (keyof Inputs)[]): Inputs => {
  const o: Record<string, unknown> = { ...i };
  for (const k of keys) delete o[k];
  return o as unknown as Inputs;
};
const codes = (r: CalcResult): string[] => r.warnings.map((w) => w.code ?? '');
const warn = (r: CalcResult, code: string): string => {
  const w = r.warnings.find((x) => x.code === code);
  if (!w) throw new Error(`warning ${code} missing; have ${codes(r).join(', ')}`);
  return w.message;
};

const files = import.meta.glob('../../data/fab-profiles/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
function parsedProfile(name: string): ParsedFabProfile {
  const key = Object.keys(files).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`profile ${name} not found`);
  const r = parseFabProfile(JSON.parse(files[key] as string) as unknown);
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
}
const JLC = parsedProfile('jlcpcb-2026-10-13.json');
const TODAY = '2026-10-20';

type Layer = 'outer' | 'inner';

// ---------------------------------------------------------------------------------------------------------------
describe('PV-3: RMS pulse input (legacy relation evaluated at I_rms = I_pk sqrt(D); mean heating, not the peak)', () => {
  const WIDTH_CASES: [Layer, number, number, number, number][] = [
    ['outer', 10, 0.25, 20, 1],
    ['inner', 5, 0.64, 15, 2],
    ['outer', 8, 0.36, 30, 0.5],
  ];
  const DT_CASES: [Layer, number, number, number, number][] = [
    ['outer', 8, 0.25, 40, 1],
    ['inner', 10, 0.36, 60, 1],
    ['outer', 6, 1, 30, 2],
  ];
  for (const [l, ipk, d, rise, o] of WIDTH_CASES) {
    it(`oracle: ${l} I_pk ${g(ipk)} A, D ${g(d)}, rise ${g(rise)} C, ${g(o)} oz -> I_rms and width`, () => {
      const r = run({ mode: 'B', layer: l, peakCurrent: amp(ipk), duty: frac(d), periodVsTau: 'much-shorter', deltaT: dT(rise), copperWeight: oz(o) });
      const iName = `trace_width_rms_current_A_Ipk${g(ipk)}A_D${g(d)}`;
      const wName = `trace_width_rms_width_mil_${l}_Ipk${g(ipk)}A_D${g(d)}_dT${g(rise)}C_${g(o)}oz`;
      expect(err(si(r, 'RMS-equivalent current (mean heating)'), vec(iName).pinned_expected)).toBeLessThan(1e-12);
      expect(err(toUnit(res(r, 'width').value, 'mil'), vec(wName).pinned_expected)).toBeLessThan(TOL);
    });
  }
  for (const [l, ipk, d, w, o] of DT_CASES) {
    it(`oracle: ${l} I_pk ${g(ipk)} A, D ${g(d)}, width ${g(w)} mil, ${g(o)} oz -> mean temperature rise`, () => {
      const r = run({ mode: 'B', layer: l, peakCurrent: amp(ipk), duty: frac(d), periodVsTau: 'much-shorter', width: mil(w), copperWeight: oz(o) });
      const name = `trace_width_rms_dT_C_${l}_Ipk${g(ipk)}A_D${g(d)}_w${g(w)}mil_${g(o)}oz`;
      expect(err(toUnit(res(r, 'temperature rise').value, 'ddegC'), vec(name).pinned_expected)).toBeLessThan(TOL);
    });
  }

  it('hand-check: 10 A peak at D = 0.25 is 5 A rms, so the width equals the steady 5 A, 20 C, outer 1 oz width (71.49 mil)', () => {
    const p = run({ mode: 'B', layer: 'outer', peakCurrent: amp(10), duty: frac(0.25), periodVsTau: 'much-shorter', deltaT: dT(20), copperWeight: oz(1) });
    const s = run({ mode: 'B', layer: 'outer', current: amp(5), deltaT: dT(20), copperWeight: oz(1) });
    expect(res(p, 'width').value.si).toBeCloseTo(res(s, 'width').value.si, 15);
    expect(toUnit(res(p, 'width').value, 'mil')).toBeCloseTo(71.49064502936493, 9);
  });

  it('labelled RMS-equivalent (mean heating) in the steps, results, assumptions and warnings; peak-is-higher warning; S-019e/f cited', () => {
    const r = run({ mode: 'B', layer: 'outer', peakCurrent: amp(10), duty: frac(0.25), periodVsTau: 'much-shorter', deltaT: dT(20), copperWeight: oz(1) });
    expect(r.steps.some((s) => /RMS-equivalent \(mean heating\)/.test(s.label))).toBe(true);
    expect(r.steps.some((s) => /I_rms = I_pk x sqrt\(D\)/.test(s.expr))).toBe(true);
    expect(r.assumptions.join('\n')).toMatch(/RMS-equivalent \(mean heating\)/);
    expect(codes(r)).toContain('PULSE_RMS_ASSUMPTION');
    expect(warn(r, 'PULSE_PEAK_HIGHER')).toMatch(/peak rise is higher/);
    expect(warn(r, 'PULSE_PEAK_HIGHER')).toMatch(/mean \(duty-averaged\) temperature rise, not the peak/);
    expect(warn(r, 'PULSE_RMS_ASSUMPTION')).toMatch(/S-019e/);
    expect(warn(r, 'PULSE_RMS_ASSUMPTION')).toMatch(/S-019f/);
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-019e', 'S-019f']));
    expect(r.inputs.map((i) => i.name)).toEqual(expect.arrayContaining(['peakCurrent', 'duty']));
    expect(r.inputs.some((i) => i.name === 'current')).toBe(false);
    expectNoClaimWording(r);
  });

  it('comparable-or-longer: no RMS result; the peak current is held continuously, with the warning', () => {
    const r = run({ mode: 'B', layer: 'outer', peakCurrent: amp(10), duty: frac(0.25), periodVsTau: 'comparable-or-longer', deltaT: dT(20), copperWeight: oz(1) });
    const steady = run({ mode: 'B', layer: 'outer', current: amp(10), deltaT: dT(20), copperWeight: oz(1) });
    expect(res(r, 'width').value.si).toBeCloseTo(res(steady, 'width').value.si, 15);
    expect(r.results.some((x) => /RMS/.test(x.name))).toBe(false);
    expect(r.steps.some((s) => /RMS-equivalent/.test(s.label))).toBe(false);
    expect(codes(r)).toContain('PULSE_PERIOD_NOT_SHORT');
    expect(codes(r)).not.toContain('PULSE_RMS_ASSUMPTION');
    expect(codes(r)).not.toContain('PULSE_PEAK_HIGHER');
    expect(warn(r, 'PULSE_PERIOD_NOT_SHORT')).toMatch(/none is given/);
  });

  it('a steady current gives no pulse warning, label or ledger id', () => {
    const r = run({ mode: 'B', layer: 'outer', current: amp(5), deltaT: dT(20), copperWeight: oz(1) });
    expect(codes(r).filter((c) => c.startsWith('PULSE_'))).toEqual([]);
    expect(r.reference.ledgerIds).not.toContain('S-019e');
    expect(r.results.some((x) => /RMS/.test(x.name))).toBe(false);
  });

  it('adjacent plane and cooling are stated as not modelled (with and without a pulse)', () => {
    for (const r of [
      run({ mode: 'B', layer: 'outer', current: amp(5), deltaT: dT(20), copperWeight: oz(1) }),
      run({ mode: 'B', layer: 'inner', peakCurrent: amp(10), duty: frac(0.5), periodVsTau: 'much-shorter', width: mil(40), copperWeight: oz(1) }),
    ]) {
      expect(r.assumptions.join('\n')).toMatch(/adjacent plane and cooling.*not modelled/i);
    }
  });

  it('the rms current is the one checked against the chart range, and the pulse combines with the other solves', () => {
    // 40 A peak at D = 0.5625 is 30 A rms (inside 35 A); 60 A peak at D = 0.5625 is 45 A rms (outside).
    const inside = run({ mode: 'B', layer: 'outer', peakCurrent: amp(40), duty: frac(0.5625), periodVsTau: 'much-shorter', deltaT: dT(50), copperWeight: oz(3) });
    expect(inside.validityChecks.find((c) => /^current within chart range/.test(c.name))?.ok).toBe(true);
    const outside = run({ mode: 'B', layer: 'outer', peakCurrent: amp(60), duty: frac(0.5625), periodVsTau: 'much-shorter', deltaT: dT(50), copperWeight: oz(3) });
    expect(outside.validityChecks.find((c) => /^current within chart range/.test(c.name))?.ok).toBe(false);
  });

  it('invalid pulse inputs are rejected with the field named', () => {
    const base = { mode: 'B', layer: 'outer', deltaT: dT(20), copperWeight: oz(1) } as const;
    expectError(compute, { ...base, peakCurrent: amp(10), periodVsTau: 'much-shorter' } as Inputs, 'INVALID_INPUT', 'duty');
    expectError(compute, { ...base, peakCurrent: amp(10), duty: frac(0.5) } as Inputs, 'INVALID_INPUT', 'periodVsTau');
    expectError(compute, { ...base, peakCurrent: amp(10), duty: frac(0.5), periodVsTau: 'sometimes' } as unknown as Inputs, 'INVALID_INPUT', 'periodVsTau');
    for (const d of [0, -0.1, 1.0000001]) {
      const out = compute({ ...base, peakCurrent: amp(10), duty: frac(d), periodVsTau: 'much-shorter' });
      expect(out.ok, `duty ${String(d)}`).toBe(false);
    }
    for (const d of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const out = compute({ ...base, peakCurrent: amp(10), duty: { si: d, dim: DIM.DIMENSIONLESS } as Quantity, periodVsTau: 'much-shorter' });
      expect(out.ok, `duty ${String(d)}`).toBe(false);
    }
    expectError(compute, { ...base, current: amp(5), peakCurrent: amp(10), duty: frac(0.5), periodVsTau: 'much-shorter' }, 'INVALID_INPUT');
    expectError(compute, { ...base, duty: frac(0.5), width: mil(30) } as Inputs, 'INVALID_INPUT');
    // A pulse takes the place of the current: width and deltaT as well would over-determine the problem.
    expectError(compute, { mode: 'B', layer: 'outer', width: mil(40), deltaT: dT(20), peakCurrent: amp(10), duty: frac(0.5), periodVsTau: 'much-shorter', copperWeight: oz(1) }, 'INVALID_INPUT');
    expect(compute({ ...base, peakCurrent: amp(0), duty: frac(0.5), periodVsTau: 'much-shorter' }).ok).toBe(false);
  });

  it('a current tolerance is not available with a pulse (rms is derived); a width tolerance still works', () => {
    const base: Inputs = { mode: 'B', layer: 'outer', peakCurrent: amp(10), duty: frac(0.25), periodVsTau: 'much-shorter', width: mil(60), copperWeight: oz(1) };
    expectError(compute, { ...base, tolerances: { current: frac(0.05) } }, 'INVALID_INPUT', 'tolerances.current');
    const r = run({ ...base, tolerances: { width: frac(0.1) } });
    expect(r.envelope?.length ?? 0).toBeGreaterThan(0);
    expect(res(r, 'temperature rise').role).toBe('primary');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('PCB-8: stated-maximum check is informational and says what the legacy fit leaves out', () => {
  const alpha = 0.00393; // S-004, restated
  const base: Inputs = { mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(30), copperWeight: oz(1), ambient: degC(25) };
  const check = (r: CalcResult): CalcResult['validityChecks'][number] => {
    const c = r.validityChecks.find((x) => /stated maximum/.test(x.name));
    if (!c) throw new Error(`no stated-maximum check; have ${r.validityChecks.map((x) => x.name).join(' | ')}`);
    return c;
  };

  it('renamed, never a pass-style label, and the old label is gone', () => {
    const r = run({ ...base, maxAllowedTemp: degC(125) });
    const c = check(r);
    expect(c.name).toMatch(/^Estimated conductor temperature vs your stated maximum \(informational\)/);
    expect(c.name + ' ' + c.detail).not.toMatch(/within allowed|\bpass|\bOK\b|\bsafe\b|\bapproved?\b/i);
    expect(r.validityChecks.some((x) => /within allowed/.test(x.name))).toBe(false);
    expect(c.ok).toBe(true);
  });

  it('states that ambient is not modelled and that copper is more resistive when hot, with the % computed from alpha (hand-check: 25 C ambient + 30 K = 55 C is +11.6 %)', () => {
    const c = check(run({ ...base, maxAllowedTemp: degC(125) }));
    expect(c.detail).toMatch(/does not model ambient/);
    expect(c.detail).toMatch(/resistance is higher when hot/);
    const want = ((1 + alpha * (55 - 20)) / (1 + alpha * (25 - 20)) - 1) * 100;
    expect(want).toBeCloseTo(11.563, 2);
    const m = /([\d.]+) % higher/.exec(c.detail);
    expect(m, c.detail).not.toBeNull();
    expect(Math.abs(Number(m?.[1]) - want)).toBeLessThan(0.051);
  });

  it('the percentage follows the stated ambient and the solved rise (not hard-coded)', () => {
    const c = check(run({ ...base, ambient: degC(85), deltaT: dT(10), maxAllowedTemp: degC(125) }));
    const want = ((1 + alpha * (95 - 20)) / (1 + alpha * (25 - 20)) - 1) * 100;
    const m = /([\d.]+) % higher/.exec(c.detail);
    expect(Math.abs(Number(m?.[1]) - want)).toBeLessThan(0.051);
  });

  it('keeps the failure semantic: a stated maximum below the estimate is not ok, with the existing warning and an out-of-range confidence reason', () => {
    const r = run({ ...base, maxAllowedTemp: degC(50) });
    expect(check(r).ok).toBe(false);
    expect(check(r).detail).toMatch(/exceeds/);
    expect(codes(r)).toContain('MAX_TEMP_EXCEEDED');
    expect(r.confidence.level).toBe('low');
  });

  it('exactly equal to the stated maximum is not a failure', () => {
    expect(check(run({ ...base, maxAllowedTemp: degC(55) })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('PCB-10: fab profile minimum trace width note (S-019l, UNVERIFIED)', () => {
  const smallWidth: Inputs = { mode: 'B', layer: 'outer', current: amp(0.05), deltaT: dT(30), copperWeight: oz(1), layerCount: '2' };
  const bigWidth: Inputs = { mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperWeight: oz(1), layerCount: '2' };
  const withProfile = (i: Inputs): Inputs => ({ ...i, fabProfile: JLC, today: TODAY });

  it('solved width below the published minimum (0.10 mm, 2-layer 1 oz): both the minimum and the recommended width are flagged, with id, status, ledger id and age', () => {
    const r = run(withProfile(smallWidth));
    const m = warn(r, 'BELOW_PROFILE_MIN_TRACE_WIDTH');
    expect(m).toMatch(/below the profile minimum trace width for this scope/);
    expect(m).toMatch(/minimum width/);
    expect(m).toMatch(/recommended width/);
    expect(m).toMatch(/0\.1 mm/);
    expect(m).toMatch(/jlcpcb-2026-10-13/);
    expect(m).toMatch(/UNVERIFIED/);
    expect(m).toMatch(/S-019l/);
    expect(m).toMatch(/layer count 2/);
    expect(m).toMatch(/1 oz\/ft2/);
    expect(r.reference.ledgerIds).toContain('S-019l');
    expect(r.fabProfile).toEqual({ id: 'jlcpcb-2026-10-13', fabricator: 'JLCPCB', profileDate: '2026-10-13', status: 'UNVERIFIED', ageDays: 7, stale: false });
    expect(r.warnings.find((w) => w.code === 'BELOW_PROFILE_MIN_TRACE_WIDTH')?.severity).toBe('warning');
    expect(codes(r)).toContain('FAB_PROFILE_UNVERIFIED');
    expectNoClaimWording(r);
  });

  it('solved width above the published minimum: "meets" wording only, as an info note', () => {
    const r = run(withProfile(bigWidth));
    const m = warn(r, 'MEETS_PROFILE_MIN_TRACE_WIDTH');
    expect(m).toMatch(/meets the profile minimum trace width for this scope/);
    expect(m).toMatch(/not a statement about current capacity or reliability/);
    expect(r.warnings.find((w) => w.code === 'MEETS_PROFILE_MIN_TRACE_WIDTH')?.severity).toBe('info');
    expect(codes(r)).not.toContain('BELOW_PROFILE_MIN_TRACE_WIDTH');
    expectNoClaimWording(r);
  });

  it('a given width (capacity or rise solved) is compared with the minimum', () => {
    const below = run(withProfile({ mode: 'B', layer: 'outer', width: mm(0.05), deltaT: dT(20), copperWeight: oz(1), layerCount: '2' }));
    expect(warn(below, 'BELOW_PROFILE_MIN_TRACE_WIDTH')).toMatch(/width you entered/);
    const above = run(withProfile({ mode: 'B', layer: 'outer', width: mm(0.5), current: amp(1), copperWeight: oz(1), layerCount: '2' }));
    expect(warn(above, 'MEETS_PROFILE_MIN_TRACE_WIDTH')).toMatch(/width you entered/);
  });

  it('the comparison is exact at the published value: 0.10 mm meets, just below does not', () => {
    const at = run(withProfile({ mode: 'B', layer: 'outer', width: mm(0.1), deltaT: dT(20), copperWeight: oz(1), layerCount: '2' }));
    expect(codes(at)).toContain('MEETS_PROFILE_MIN_TRACE_WIDTH');
    const under = run(withProfile({ mode: 'B', layer: 'outer', width: mm(0.0999), deltaT: dT(20), copperWeight: oz(1), layerCount: '2' }));
    expect(codes(under)).toContain('BELOW_PROFILE_MIN_TRACE_WIDTH');
  });

  it('the scope is exact: layer count 1 and multilayer use their own entries (0.09 mm for multilayer)', () => {
    const ml = run(withProfile({ mode: 'B', layer: 'inner', width: mm(0.095), deltaT: dT(20), copperWeight: oz(1), layerCount: 'multilayer' }));
    expect(warn(ml, 'MEETS_PROFILE_MIN_TRACE_WIDTH')).toMatch(/0\.09 mm/);
    const two = run(withProfile({ mode: 'B', layer: 'outer', width: mm(0.095), deltaT: dT(20), copperWeight: oz(1), layerCount: '2' }));
    expect(codes(two)).toContain('BELOW_PROFILE_MIN_TRACE_WIDTH');
  });

  it('not published or not available for the scope: says so, no fallback to another scope, no below/meets wording', () => {
    for (const i of [
      { ...smallWidth, copperWeight: oz(0.5) }, // the profile has no 0.5 oz trace-width entry
      { ...omit(smallWidth, 'copperWeight'), copperThickness: um(35) }, // a thickness has no ordered weight
    ]) {
      const r = run(withProfile(i));
      const m = warn(r, 'PROFILE_MIN_TRACE_WIDTH_NOT_PUBLISHED');
      expect(m).toMatch(/no published minimum trace width for this scope/i);
      expect(m).toMatch(/not substituted|no other/i);
      expect(codes(r)).not.toContain('BELOW_PROFILE_MIN_TRACE_WIDTH');
      expect(codes(r)).not.toContain('MEETS_PROFILE_MIN_TRACE_WIDTH');
      expect(r.fabProfile?.id).toBe('jlcpcb-2026-10-13');
    }
  });

  it('a profile without layerCount changes nothing (the note is requested by giving the layer count; a profile alone is also used for the width tolerance)', () => {
    const plain = run(omit(bigWidth, 'layerCount'));
    const prof = run({ ...omit(bigWidth, 'layerCount'), fabProfile: JLC, today: TODAY });
    expect(JSON.stringify(prof)).toBe(JSON.stringify(plain));
  });

  it('absent profile: no change at all to the result', () => {
    const plain = run(omit(bigWidth, 'layerCount'));
    expect(plain.fabProfile).toBeUndefined();
    expect(codes(plain).some((c) => /PROFILE/.test(c))).toBe(false);
    expect(plain.reference.ledgerIds).not.toContain('S-019l');
    const explicitUndefined = compute({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperWeight: oz(1), fabProfile: undefined, today: undefined, layerCount: undefined } as unknown as Inputs);
    expect(explicitUndefined.ok).toBe(true);
    expect(JSON.stringify(explicitUndefined.ok ? explicitUndefined.value : null)).toBe(JSON.stringify(plain));
  });

  it('the headline numbers do not change when a profile is supplied', () => {
    const a = run(omit(bigWidth, 'layerCount'));
    const b = run(withProfile(bigWidth));
    expect(res(b, 'width').value.si).toBe(res(a, 'width').value.si);
    expect(b.confidence.level).toBe(a.confidence.level);
  });

  it('stale profile adds the staleness warning once; with the width-tolerance profile option the record is not duplicated', () => {
    const stale = run({ ...bigWidth, fabProfile: JLC, today: '2028-01-01' });
    expect(stale.fabProfile?.stale).toBe(true);
    expect(codes(stale).filter((c) => c === 'FAB_PROFILE_STALE').length).toBe(1);
    const both = run({ ...withProfile(bigWidth), tolerances: { width: 'profile' } });
    expect(codes(both).filter((c) => c === 'FAB_PROFILE_UNVERIFIED').length).toBe(1);
    expect(codes(both)).toContain('MEETS_PROFILE_MIN_TRACE_WIDTH');
    expect(both.reference.ledgerIds.filter((x) => x === 'S-019l').length).toBe(1);
  });

  it('input errors: a profile needs the date; layerCount needs a profile; layerCount must be a published scope', () => {
    expectError(compute, { ...bigWidth, fabProfile: JLC } as Inputs, 'INVALID_INPUT', 'today');
    expectError(compute, { ...bigWidth } as Inputs, 'INVALID_INPUT', 'layerCount');
    expectError(compute, { ...withProfile(bigWidth), layerCount: '4' } as unknown as Inputs, 'INVALID_INPUT', 'layerCount');
    expectError(compute, { ...bigWidth, fabProfile: { id: 'x' }, today: TODAY } as unknown as Inputs, 'INVALID_INPUT', 'fabProfile');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('PCB-6: inner finished-copper shortfall as a numeric caution (S-009, secondhand, PAYWALLED)', () => {
  const inner = (o: number): Inputs => ({ mode: 'B', layer: 'inner', current: amp(3), deltaT: dT(10), copperWeight: oz(o) });

  it('1 oz inner: the number comes from the S-009 table through finished-copper.ts, about -29 % against 35 um, and the width factor 1/thickness', () => {
    const r = run(inner(1));
    const m = warn(r, 'INNER_FINISHED_COPPER_THINNER');
    const f = finishedVsNominal('inner', 1, 35);
    if (f === undefined) throw new Error('S-009 table has no 1 oz inner figure');
    expect(f.percentVsNominal).toBeCloseTo(-28.857, 2);
    expect(m).toMatch(/-29 %/);
    expect(m).toMatch(/24\.9 um/);
    expect(m).toMatch(/35\.0 um/);
    expect(m).toMatch(/S-009/);
    expect(m).toMatch(/secondhand/);
    expect(m).toMatch(/PAYWALLED/);
    expect(m).toMatch(/a thinner finished copper than nominal would need a wider trace: required width scales as 1\/thickness/);
    expect(m).toMatch(/x1\.41/); // 35 / 24.9 = 1.406
    expect(r.warnings.find((w) => w.code === 'INNER_FINISHED_COPPER_THINNER')?.severity).toBe('caution');
    expectNoClaimWording(r);
  });

  it('0.5 oz and 2 oz use their own table figures (-35 %, -20 %)', () => {
    expect(warn(run(inner(0.5)), 'INNER_FINISHED_COPPER_THINNER')).toMatch(/-35 %/);
    expect(warn(run(inner(2)), 'INNER_FINISHED_COPPER_THINNER')).toMatch(/-20 %/);
  });

  it('the headline numbers do not change', () => {
    const r = run(inner(1));
    const steady = run({ ...omit(inner(1), 'copperWeight'), copperThickness: um(35), copperBasis: 'nominal' });
    expect(res(r, 'width').value.si).toBe(res(steady, 'width').value.si);
  });

  it('absent for an outer layer, for a thickness entry, and where the table has no figure (3 oz)', () => {
    expect(codes(run({ ...inner(1), layer: 'outer' }))).not.toContain('INNER_FINISHED_COPPER_THINNER');
    expect(codes(run({ ...omit(inner(1), 'copperWeight'), copperThickness: um(35) }))).not.toContain('INNER_FINISHED_COPPER_THINNER');
    expect(codes(run(inner(3)))).not.toContain('INNER_FINISHED_COPPER_THINNER');
  });

  it('also present when current or rise is the solved quantity (the shortfall changes capacity and rise too)', () => {
    const r = run({ mode: 'B', layer: 'inner', width: mil(30), deltaT: dT(20), copperWeight: oz(1) });
    expect(codes(r)).toContain('INNER_FINISHED_COPPER_THINNER');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('F-3: any result with an S-009-based statement cites S-009 and its data status reflects it', () => {
  const w = (o: number, layer: Layer): Inputs => ({ mode: 'B', layer, current: amp(3), deltaT: dT(10), copperWeight: oz(o) });
  it('weights with an S-009 figure (0.5, 1, 2 oz) cite S-009, outer and inner', () => {
    for (const o of [0.5, 1, 2]) {
      for (const l of ['outer', 'inner'] as const) {
        const r = run(w(o, l));
        expect(r.reference.ledgerIds, `${l} ${g(o)} oz`).toContain('S-009');
        expect(r.dataStatus).toBe('PAYWALLED');
      }
    }
  });
  it('no S-009 statement (3 oz weight, or a thickness entry) means no S-009 id, and the foil-convention row S-003 stays excluded from the rating', () => {
    for (const r of [run(w(3, 'outer')), run({ ...omit(w(1, 'outer'), 'copperWeight'), copperThickness: um(35) }), run({ ...omit(w(1, 'inner'), 'copperWeight'), copperThickness: um(35), copperBasis: 'finished' })]) {
      expect(r.reference.ledgerIds).not.toContain('S-009');
    }
  });
  it('the thickness-tolerance choice finished-copper-s009 cites S-009 (existing behaviour kept)', () => {
    const r = run({ ...w(1, 'outer'), tolerances: { copperThickness: { source: 'finished-copper-s009' } } });
    expect(r.reference.ledgerIds.filter((x) => x === 'S-009').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('PV-8: the calculator module keeps no mutable module-level state', () => {
  const src = import.meta.glob('./calc.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const text = Object.values(src)[0] ?? '';
  it('source has no module-level let, Map or Set cache', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).not.toMatch(/^let\s/m);
    expect(text).not.toMatch(/new Map\s*[<(]/);
    expect(text).not.toMatch(/new Set\s*[<(][^)]*\)\s*;?\s*$/m);
    expect(text).not.toMatch(/BASIS_CACHE/);
  });
  it('repeated and interleaved evaluations are identical (no state carried between calls)', () => {
    const a = JSON.stringify(compute({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperWeight: oz(1) }));
    for (let i = 0; i < 300; i++) compute({ mode: 'B', layer: 'inner', current: amp(1 + i * 0.01), deltaT: dT(10), copperWeight: oz(0.5 + (i % 5) * 0.25) });
    expect(JSON.stringify(compute({ mode: 'B', layer: 'outer', current: amp(3), deltaT: dT(20), copperWeight: oz(1) }))).toBe(a);
  });
});
