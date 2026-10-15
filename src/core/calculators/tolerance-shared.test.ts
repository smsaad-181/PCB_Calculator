import { describe, expect, it } from 'vitest';
import { DIM, fromUnit, q } from '../units';
import type { Quantity } from '../units';
import type { CalcResult } from '../result';
import { parseFabProfile } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import type { Analysis, EnvelopeEntry, SensitivityEntry } from '../sensitivity';
import {
  MAX_REL_MINUS,
  applyEnvelope,
  checkProfileInputs,
  envelopeResult,
  fabProfileRecord,
  fabProfileWarnings,
  finishResult,
  hasTolerances,
  isThicknessChoice,
  parseTol,
  perturbSpecs,
  planTolerances,
  stripEnvelopeInputs,
} from './tolerance-shared';
import type { FieldSpec, OutputPlan, Plan } from './tolerance-shared';
import { okOf } from './circuit-test-utils';
import { compute as computeTraceWidth } from './trace-width/calc';

// Direct tests of the shared tolerance plumbing (task 9): parsing, planning, applying an analysis to a result.

const frac = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const kel = (n: number): Quantity => q(n, DIM.TEMPERATURE_DIFFERENCE);

describe('parseTol', () => {
  it('accepts symmetric and asymmetric relative tolerances, zero included', () => {
    expect(parseTol('x', frac(0.1), 'relative')).toEqual({ ok: true, value: { minus: 0.1, plus: 0.1 } });
    expect(parseTol('x', { minus: frac(0.1), plus: frac(0.3) }, 'relative')).toEqual({ ok: true, value: { minus: 0.1, plus: 0.3 } });
    expect(parseTol('x', frac(0), 'relative')).toEqual({ ok: true, value: { minus: 0, plus: 0 } });
    expect(parseTol('x', kel(5), 'temperature')).toEqual({ ok: true, value: { minus: 5, plus: 5 } });
  });
  it('names the field and side in every rejection', () => {
    const bad = (v: unknown, kind: 'relative' | 'temperature' = 'relative'): string => {
      const r = parseTol('tolerances.x', v, kind);
      expect(r.ok).toBe(false);
      return r.ok ? '' : `${r.error.code}|${r.error.field ?? ''}|${r.error.message}`;
    };
    expect(bad({ minus: frac(0.1), plus: 'x' })).toMatch(/INVALID_INPUT\|tolerances.x\|.*plus side/);
    expect(bad({ minus: { si: -1, dim: DIM.DIMENSIONLESS }, plus: frac(0.1) })).toMatch(/negative.*minus side|minus side.*negative/);
    expect(bad({ minus: frac(0.1), plus: kel(1) })).toMatch(/^DIMENSION\|/);
    expect(bad({ si: Number.POSITIVE_INFINITY, dim: DIM.DIMENSIONLESS })).toMatch(/infinite/);
    expect(bad({ si: Number.NaN, dim: DIM.DIMENSIONLESS })).toMatch(/NaN/);
    expect(bad(frac(MAX_REL_MINUS + 0.01))).toMatch(/^OUT_OF_DOMAIN\|.*minus tolerance/);
    expect(bad({ minus: frac(0.1), plus: frac(6) })).toMatch(/^OUT_OF_DOMAIN\|.*plus tolerance/);
    expect(bad(kel(201), 'temperature')).toMatch(/^OUT_OF_DOMAIN\|.*200 K/);
    expect(bad({ si: 1, dim: null }, 'relative')).toMatch(/INVALID_INPUT/);
    expect(bad(7)).toMatch(/must be a quantity/);
  });
  it('a malformed dimension object is a DIMENSION error value, not a throw', () => {
    const r = parseTol('x', { si: 0.1, dim: { exp: 'bad', kind: 'plain' } }, 'relative');
    expect(r.ok).toBe(false);
  });
});

describe('isThicknessChoice, hasTolerances, stripEnvelopeInputs', () => {
  it('recognises only the two named choices', () => {
    expect(isThicknessChoice({ source: 'foil-convention-spread' })).toBe(true);
    expect(isThicknessChoice({ source: 'finished-copper-s009' })).toBe(true);
    expect(isThicknessChoice({ source: 'other' })).toBe(false);
    expect(isThicknessChoice(frac(0.1))).toBe(false);
    expect(isThicknessChoice(null)).toBe(false);
  });
  it('hasTolerances is false for non-objects, undefined and an empty object', () => {
    expect(hasTolerances(null)).toBe(false);
    expect(hasTolerances(42)).toBe(false);
    expect(hasTolerances({})).toBe(false);
    expect(hasTolerances({ tolerances: {} })).toBe(false);
    expect(hasTolerances({ tolerances: { a: 1 } })).toBe(true);
    expect(hasTolerances({ tolerances: 'x' })).toBe(true);
  });
  it('strips the envelope-only properties and leaves the rest', () => {
    const out = stripEnvelopeInputs({ a: 1, tolerances: { x: 1 }, fabProfile: {}, today: '2026-01-01' });
    expect(out).toEqual({ a: 1 });
  });
});

describe('planTolerances', () => {
  const fields: FieldSpec[] = [
    { key: 'w', input: 'width', label: 'width', kind: 'relative', present: true, absentMessage: '', allow: 'profile-width' },
    { key: 't', input: 'copperWeight', label: 'copper thickness', kind: 'relative', present: true, absentMessage: '', allow: 'thickness' },
    { key: 'c', input: 'current', label: 'current', kind: 'relative', present: false, absentMessage: 'no current given' },
    { key: 's', input: 'width', label: 'width', kind: 'relative', present: true, absentMessage: '', scaleOnly: true },
    { key: 'a', input: 'ambient', label: 'ambient', kind: 'temperature', present: true, absentMessage: '' },
  ];
  const oneOz = fromUnit(1, 'oz/ft2');
  it('empty object gives an empty plan; non-object and unknown keys are errors', () => {
    const e = planTolerances({}, fields, {});
    expect(e.ok && e.value.planned).toEqual([]);
    expect(planTolerances('x', fields, {}).ok).toBe(false);
    const u = planTolerances({ zzz: frac(0.1) }, fields, {});
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.error.field).toBe('tolerances.zzz');
  });
  it('a tolerance on a quantity that is not an input is rejected with the field message', () => {
    const r = planTolerances({ c: frac(0.1) }, fields, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('no current given');
  });
  it('scale-only tolerances carry no input and are not perturbed', () => {
    const r = planTolerances({ s: frac(0.2), a: kel(3) }, fields, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.planned[0]?.input).toBeUndefined();
      expect(perturbSpecs(r.value.planned)).toEqual([{ input: 'ambient', kind: 'absolute', minus: 3, plus: 3 }]);
    }
  });
  it('the foil spread and S-009 choices need the weight, the layer and a known weight', () => {
    const noWeight = planTolerances({ t: { source: 'foil-convention-spread' } }, fields, { layer: 'outer' });
    expect(noWeight.ok && noWeight.value.planned).toEqual([]);
    expect(noWeight.ok && noWeight.value.warnings[0]?.code).toBe('TOLERANCE_CHOICE_NOT_APPLICABLE');
    const noLayer = planTolerances({ t: { source: 'finished-copper-s009' } }, fields, { copperWeight: oneOz });
    expect(noLayer.ok && noLayer.value.warnings[0]?.code).toBe('TOLERANCE_CHOICE_NOT_APPLICABLE');
    const unknownWeight = planTolerances({ t: { source: 'finished-copper-s009' } }, fields, { layer: 'inner', copperWeight: fromUnit(3, 'oz/ft2') });
    expect(unknownWeight.ok && unknownWeight.value.warnings[0]?.code).toBe('TOLERANCE_CHOICE_NOT_AVAILABLE');
    const inner = planTolerances({ t: { source: 'finished-copper-s009' } }, fields, { layer: 'inner', copperWeight: oneOz });
    expect(inner.ok && inner.value.ledgerIds).toEqual(['S-009']);
    expect(inner.ok && inner.value.planned[0]?.detail).toMatch(/secondhand minimum/);
    const spread = planTolerances({ t: { source: 'foil-convention-spread' } }, fields, { layer: 'outer', copperWeight: oneOz, convention: 'nominal-1.35mil' });
    expect(spread.ok && spread.value.ledgerIds).toEqual(['S-003']);
    // against the 1.35 mil (34.29 um) nominal the 35 um convention is above it: a plus side exists
    expect(spread.ok && (spread.value.planned[0]?.plus ?? 0)).toBeGreaterThan(0);
  });
  it('choices and the profile are refused on fields that do not allow them', () => {
    expect(planTolerances({ a: 'profile' }, fields, {}).ok).toBe(false);
    expect(planTolerances({ a: { source: 'foil-convention-spread' } }, fields, {}).ok).toBe(false);
  });
  it('the profile width without a profile or a date says nothing is applied', () => {
    const r = planTolerances({ w: 'profile' }, fields, {});
    expect(r.ok && r.value.planned).toEqual([]);
    expect(r.ok && r.value.warnings[0]?.message).toMatch(/no fab profile/);
  });
});

describe('profile helpers', () => {
  const tpl = parseFabProfile({
    schemaVersion: 1,
    id: 'p',
    fabricator: 'F',
    profileDate: '2026-01-01',
    source: 's',
    status: 'VERIFIED',
    ledgerIds: ['S-019l'],
    verifiedBy: 'me',
    bannerRequired: false,
    limits: { traceWidthTolerancePct: 10 },
    scopedLimits: [],
  });
  const profile = (tpl.ok ? tpl.value : undefined) as ParsedFabProfile;
  it('a VERIFIED profile adds no unverified warning; age and staleness come from the injected date', () => {
    const rec = fabProfileRecord(profile, '2026-01-11');
    expect(rec).toMatchObject({ id: 'p', ageDays: 10, stale: false, status: 'VERIFIED' });
    expect(fabProfileWarnings(profile, rec)).toEqual([]);
    const old = fabProfileRecord(profile, '2028-01-01');
    expect(fabProfileWarnings(profile, old).map((w) => w.code)).toEqual(['FAB_PROFILE_STALE']);
  });
  it('checkProfileInputs reports a missing profile, a malformed one, a missing and a bad date; passes when not needed', () => {
    expect(checkProfileInputs({}, false)).toBeUndefined();
    expect(checkProfileInputs({}, true)?.field).toBe('fabProfile');
    expect(checkProfileInputs({ fabProfile: 'x' }, true)?.field).toBe('fabProfile');
    expect(checkProfileInputs({ fabProfile: profile }, true)?.field).toBe('today');
    expect(checkProfileInputs({ fabProfile: profile, today: 'tomorrow' }, true)?.field).toBe('today');
    expect(checkProfileInputs({ fabProfile: profile, today: '2026-02-01' }, true)).toBeUndefined();
  });
});

describe('applyEnvelope on synthetic analyses', () => {
  const nominal = (): CalcResult => {
    const out = okOf(computeTraceWidth, { mode: 'B', layer: 'outer', current: fromUnit(3, 'A'), deltaT: fromUnit(20, 'ddegC'), copperWeight: fromUnit(1, 'oz/ft2') });
    return out;
  };
  const plan: Plan = {
    planned: [{ key: 'current', input: 'current', label: 'current', kind: 'relative', minus: 0.1, plus: 0.1, source: 'user', ledgerIds: [] }],
    warnings: [],
    ledgerIds: [],
    profileUsed: false,
  };
  const entry = (over: Partial<EnvelopeEntry>): EnvelopeEntry => ({
    output: 'width',
    typ: 0.001,
    min: 0.0009,
    max: 0.0011,
    minAt: 'current-',
    maxAt: 'current+',
    monotone: true,
    nonMonotoneInputs: [],
    label: 'corners-exact-for-monotone',
    ...over,
  });
  const analysis = (e: EnvelopeEntry, sens: SensitivityEntry[] = [], over: Partial<Analysis> = {}): Analysis => ({
    sensitivities: { width: sens },
    envelopes: [e],
    activeInputs: ['current'],
    cornerCount: 2,
    evaluations: 5,
    incomplete: [],
    extrapolatedCorners: [],
    ...over,
  });
  const outputs: OutputPlan[] = [{ name: 'width', sensitivity: true }];
  const apply = (a: Analysis, o: OutputPlan[] = outputs): CalcResult => {
    const r = applyEnvelope({ nominal: nominal(), analysis: a, plan, outputs: o });
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  };
  it('an omitted minimum drops the whole envelope and says which bound is missing', () => {
    const r = apply(analysis(entry({ min: null })));
    expect(r.envelope).toBeUndefined();
    expect(r.warnings.find((w) => w.code === 'ENVELOPE_BOUND_OMITTED')?.message).toMatch(/its minimum could not be determined/);
    const both = apply(analysis(entry({ min: null, max: null })));
    expect(both.warnings.find((w) => w.code === 'ENVELOPE_BOUND_OMITTED')?.message).toMatch(/minimum and maximum/);
  });
  it('a non-monotone output carries the corners-only warning', () => {
    const r = apply(analysis(entry({ monotone: false, nonMonotoneInputs: ['current'], label: 'corners-only' })));
    expect(r.warnings.find((w) => w.code === 'ENVELOPE_CORNERS_ONLY')?.message).toMatch(/not guaranteed extremes/);
    expect(r.envelope).toHaveLength(1);
  });
  it('unavailable and one-sided sensitivities become info warnings, a central one becomes a result', () => {
    const r = apply(
      analysis(entry({}), [
        { input: 'current', kind: 'relative', value: null, scheme: 'unavailable', note: 'at a boundary' },
        { input: 'current', kind: 'relative', value: 1.5, scheme: 'forward', note: 'one-sided (forward)' },
        { input: 'unlisted', kind: 'relative', value: 2, scheme: 'central' },
      ]),
    );
    expect(r.warnings.some((w) => w.code === 'SENSITIVITY_UNAVAILABLE' && /at a boundary/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.code === 'SENSITIVITY_ONE_SIDED')).toBe(true);
    expect(r.results.some((x) => x.name === 'sensitivity of width to current')).toBe(true);
    expect(r.results.some((x) => x.name === 'sensitivity of width to unlisted')).toBe(true);
    const noNote = apply(analysis(entry({}), [{ input: 'current', kind: 'relative', value: null, scheme: 'unavailable' }]));
    expect(noNote.warnings.find((w) => w.code === 'SENSITIVITY_UNAVAILABLE')?.message).toMatch(/is unavailable\.$/);
  });
  it('lists at most six extrapolated corners and says there are more', () => {
    const many = ['a+', 'b+', 'c+', 'd+', 'e+', 'f+', 'g+'];
    const r = apply(analysis(entry({}), [], { extrapolatedCorners: many }));
    expect(r.warnings.find((w) => w.code === 'ENVELOPE_EXTRAPOLATION')?.message).toMatch(/f\+; \.\.\./);
    const few = apply(analysis(entry({}), [], { extrapolatedCorners: ['a+'] }));
    expect(few.warnings.find((w) => w.code === 'ENVELOPE_EXTRAPOLATION')?.message).not.toMatch(/\.\.\./);
  });
  it('skips outputs missing from the result or the analysis, and a point envelope when onlyIfVaries is set', () => {
    const missingOut = apply(analysis(entry({})), [{ name: 'no such output', sensitivity: true }]);
    expect(missingOut.envelope).toBeUndefined();
    const point = apply(analysis(entry({ min: 0.001, max: 0.001 })), [{ name: 'width', sensitivity: false, onlyIfVaries: true }]);
    expect(point.envelope).toBeUndefined();
    const kept = apply(analysis(entry({ min: 0.001, max: 0.001 })), [{ name: 'width', sensitivity: false }]);
    expect(kept.envelope).toHaveLength(1);
  });
  it('derived outputs scale the envelope and are skipped when the base result lacks them', () => {
    const base = nominal();
    const withDerived = applyEnvelope({
      nominal: { ...base, results: [...base.results, { name: 'wide', value: q(0.0015, DIM.LENGTH), role: 'secondary', bound: 'min-requirement' }] },
      analysis: analysis(entry({})),
      plan,
      outputs,
      derived: [
        { name: 'wide', from: 'width', factor: 1.25, bound: 'min-requirement', note: '' },
        { name: 'absent', from: 'width', factor: 2, bound: 'min-requirement', note: '' },
        { name: 'other', from: 'not width', factor: 2, bound: 'min-requirement', note: '' },
      ],
    });
    expect(withDerived.ok).toBe(true);
    if (withDerived.ok) {
      const w = withDerived.value.envelope?.find((e) => e.name === 'wide');
      expect(w?.max.si).toBeCloseTo(0.0011 * 1.25, 12);
      expect(withDerived.value.envelope?.some((e) => e.name === 'absent')).toBe(false);
    }
  });
  it('a user tolerance with a detail, a profile tolerance and an asymmetric one echo as inputs', () => {
    const p2: Plan = {
      planned: [
        { key: 'current', input: 'current', label: 'current', kind: 'relative', minus: 0.1, plus: 0.2, source: 'user', ledgerIds: [] },
        { key: 'width', label: 'width', kind: 'relative', minus: 0.2, plus: 0.2, source: 'fab-profile', detail: 'from a profile', ledgerIds: ['S-019l'] },
        { key: 'ambient', input: 'ambient', label: 'ambient', kind: 'temperature', minus: 3, plus: 3, source: 'user-choice', detail: 'chosen', ledgerIds: [] },
      ],
      warnings: [],
      ledgerIds: ['S-019l'],
      profileUsed: true,
    };
    const r = applyEnvelope({ nominal: nominal(), analysis: analysis(entry({})), plan: p2, outputs });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.inputs.find((i) => i.name === 'width tolerance (+/-)')?.source).toBe('fab-profile');
      expect(r.value.inputs.find((i) => i.name === 'ambient tolerance (+/-)')?.source).toBe('user');
      expect(r.value.inputs.find((i) => i.name === 'current tolerance (-)')?.sourceDetail).toBe('Tolerance entered by the user.');
      expect(r.value.confidence.reasons.join(' ')).toMatch(/current, ambient/);
    }
  });
  it('finishResult turns a malformed result into an INTERNAL error value', () => {
    const bad = { ...nominal(), results: [] } as CalcResult;
    const out = finishResult(bad);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('INTERNAL');
    expect(finishResult(nominal()).ok).toBe(true);
  });
});

describe('envelopeResult', () => {
  const inputs = { mode: 'B', layer: 'outer', current: fromUnit(3, 'A'), deltaT: fromUnit(20, 'ddegC'), copperWeight: fromUnit(1, 'oz/ft2') } as const;
  const nominal = okOf(computeTraceWidth, inputs);
  const outs: OutputPlan[] = [{ name: 'width', sensitivity: true }];
  const planFor = (minus: number, plus: number, warnings: Plan['warnings'] = []): Plan => ({
    planned: minus === 0 && plus === 0 && warnings.length > 0 ? [] : [{ key: 'current', input: 'current', label: 'current', kind: 'relative', minus, plus, source: 'user', ledgerIds: [] }],
    warnings,
    ledgerIds: [],
    profileUsed: false,
  });
  it('an empty plan returns the nominal result with the plan warnings and no envelope', () => {
    const w = [{ severity: 'caution', code: 'X', message: 'not applicable' }] as const;
    const out = envelopeResult({ compute: computeTraceWidth, base: inputs, nominal, plan: planFor(0, 0, [...w]), outputs: outs });
    expect(out.ok && out.value.envelope).toBeUndefined();
    expect(out.ok && out.value.warnings.some((x) => x.code === 'X')).toBe(true);
    expect(out.ok && out.value.results).toEqual(nominal.results);
  });
  it('an analysis that cannot run leaves the nominal result and adds a visible warning', () => {
    // a tolerance whose plus side overflows the quantity: the helper reports an error value, not a throw
    const big = { ...inputs, current: q(1e308, DIM.CURRENT) };
    const out = envelopeResult({ compute: computeTraceWidth, base: big, nominal, plan: planFor(0.1, 5), outputs: outs });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.warnings.find((x) => x.code === 'ENVELOPE_UNAVAILABLE')?.message).toMatch(/could not be computed/);
      expect(out.value.envelope).toBeUndefined();
      expect(out.value.results).toEqual(nominal.results);
    }
  });
  it('a normal plan returns an envelope', () => {
    const out = envelopeResult({ compute: computeTraceWidth, base: inputs, nominal, plan: planFor(0.1, 0.1), outputs: outs });
    expect(out.ok && out.value.envelope?.[0]?.name).toBe('width');
  });
});
