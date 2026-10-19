import { describe, expect, it } from 'vitest';
import tolSrc from './tolerance-view.ts?raw';
import bannerSrc from './fab-profile-banner.ts?raw';
import inputsSrc from '../components/ToleranceInputs.tsx?raw';
import resultsSrc from '../components/ToleranceResults.tsx?raw';
import twPage from './TraceWidth.tsx?raw';
import trPage from './TraceResistance.tsx?raw';
import viaPage from './Via.tsx?raw';
import twVmSrc from './trace-width.vm.ts?raw';
import trVmSrc from './trace-resistance.vm.ts?raw';
import viaVmSrc from './via.vm.ts?raw';
import { compute as computeWidth } from '../../core/calculators/trace-width/calc';
import { formatResult } from '../../core/format-result';
import { DIM, q } from '../../core/units';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import * as tw from './trace-width.vm';
import * as tr from './trace-resistance.vm';
import * as via from './via.vm';
import {
  EMPTY_TOL,
  THICKNESS_OPTIONS,
  decodeTol,
  encodeTol,
  isTolEmpty,
  parseTolInput,
  sensitivityStatement,
  type TolInput,
} from './tolerance-view';
import { profileBanner } from './fab-profile-banner';
import { bundledProfile } from './fab-profile-choice';

const TODAY = '2026-10-15';
const both = (t: string): TolInput => ({ ...EMPTY_TOL, both: t });
const asym = (minus: string, plus: string): TolInput => ({ asym: true, both: '', minus, plus });
const BANNED = new RegExp(String.raw`pass(es|ed)?|${'compl'}iant|production[- ]${'saf'}e|worst[- ]case|guarantee`, 'i');

// ---------------------------------------------------------------------------
describe('tolerance text: parse, encode, decode', () => {
  it('empty input is empty, a symmetric percent becomes a dimensionless fraction', () => {
    expect(parseTolInput(EMPTY_TOL, 'relative').status).toBe('empty');
    const r = parseTolInput(both('5%'), 'relative');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect('si' in r.value ? r.value.si : Number.NaN).toBeCloseTo(0.05, 12);
      expect(r.echo).toMatch(/5/);
    }
  });
  it('an asymmetric pair carries a minus and a plus side', () => {
    const r = parseTolInput(asym('3%', '10%'), 'relative');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect('plus' in r.value && r.value.plus.si).toBeCloseTo(0.1, 12);
      expect('minus' in r.value && r.value.minus.si).toBeCloseTo(0.03, 12);
    }
  });
  it('a bare 5 is refused with the write-5% hint (never read as 500 %)', () => {
    const r = parseTolInput(both('5'), 'relative');
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/5%/);
  });
  it('an asymmetric pair with one side empty asks for both sides (zero must be typed)', () => {
    const r = parseTolInput(asym('3%', ''), 'relative');
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/both/i);
  });
  it('a temperature tolerance is a temperature DIFFERENCE and an absolute temperature is refused', () => {
    const okR = parseTolInput(both('5 K'), 'temperature');
    expect(okR.status).toBe('ok');
    if (okR.status === 'ok' && 'dim' in okR.value) expect(okR.value.dim).toEqual(DIM.TEMPERATURE_DIFFERENCE);
    expect(parseTolInput(both('5 %'), 'temperature').status).toBe('error');
  });
  it('encode and decode round-trip both forms and drop empties', () => {
    expect(encodeTol(EMPTY_TOL)).toBeUndefined();
    expect(encodeTol(both('5%'))).toBe('5%');
    expect(encodeTol(asym('3%', '10%'))).toBe('3%|10%');
    const notices: string[] = [];
    expect(decodeTol('5%', notices, 'x')).toEqual(both('5%'));
    expect(decodeTol('3%|10%', notices, 'x')).toEqual(asym('3%', '10%'));
    expect(decodeTol(undefined, notices, 'x')).toEqual(EMPTY_TOL);
    expect(notices).toEqual([]);
    expect(decodeTol('y'.repeat(100), notices, 'Current tolerance')).toEqual(EMPTY_TOL);
    expect(notices.join(' ')).toMatch(/Current tolerance/);
    expect(isTolEmpty(asym('', ' '))).toBe(true);
  });
});

describe('sensitivity statement (pure, small changes only)', () => {
  it('+1 % current with exponent 1.379 reads about +1.38 %', () => {
    const s = sensitivityStatement(1.379, 'relative', 'current', 'required width');
    expect(s).toMatch(/^\+1 % current gives about \+1\.38 % required width/);
    expect(s).toMatch(/local estimate for small changes/);
  });
  it('a negative exponent flips the sign and a zero exponent says no local effect', () => {
    expect(sensitivityStatement(-0.5, 'relative', 'width', 'resistance')).toMatch(/\+1 % width gives about -0\.500 % resistance/);
    expect(sensitivityStatement(0, 'relative', 'width', 'resistance')).toMatch(/no local effect/i);
  });
  it('a very steep exponent shrinks the step so the stated change stays small', () => {
    const s = sensitivityStatement(40, 'relative', 'x', 'y');
    expect(s).toMatch(/^\+0\.1 % x gives about \+4\.00 % y/);
  });
  it('a per-kelvin sensitivity is stated for +1 K', () => {
    const s = sensitivityStatement(0.0031, 'absolute', 'ambient', 'resistance');
    expect(s).toMatch(/^\+1 K ambient gives about \+0\.310 % resistance/);
  });
});

// ---------------------------------------------------------------------------
describe('thickness choice is an explicit radio with honest labels', () => {
  it('lists S-003, S-009 (secondhand, paywalled), own percent and none, with no default', () => {
    const v = THICKNESS_OPTIONS.map((o) => o.value);
    expect(v).toEqual(['foil', 'finished', 'pct', 'none']);
    const labels = THICKNESS_OPTIONS.map((o) => `${o.label} ${o.hint ?? ''}`).join(' | ');
    expect(labels).toMatch(/S-003/);
    expect(labels).toMatch(/S-009/);
    expect(labels).toMatch(/secondhand/i);
    expect(labels).toMatch(/PAYWALLED/);
    expect(labels).toMatch(/thin side/i);
    expect(tw.DEFAULT_STATE.thickMode).toBe('');
    expect(tr.DEFAULT_STATE.thickMode).toBe('');
  });
});

// ---------------------------------------------------------------------------
const stw = (p: Partial<tw.TraceWidthState>): tw.TraceWidthState => ({ ...tw.DEFAULT_STATE, ...p });
const W_BASE: Partial<tw.TraceWidthState> = { solveFor: 'width', current: '3 A', deltaT: '20 K', copperWeight: '1 oz', layer: 'outer' };
function okw(s: tw.TraceWidthState, today = TODAY) {
  const v = tw.computeView(s, today);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('trace width: tolerances and sensitivity', () => {
  it('no tolerances: no envelope, no sensitivity block, no empty table, identical to before', () => {
    const v = okw(stw(W_BASE));
    expect(v.tolerance).toBeUndefined();
    expect(v.result.rows.map((r) => r.label).join('|')).not.toMatch(/ensitivity/);
    expect(v.raw.envelope).toBeUndefined();
  });
  it('current +/-5 %: nominal 35.34 mil, corners 32.93 and 37.8 mil, sensitivity of width to current 1.38', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    expect(v.result.headline.text).toMatch(/35\.34 mil/);
    const t = v.tolerance;
    expect(t).toBeDefined();
    const env = t?.envelopes[0];
    expect(env?.row.typ).toMatch(/35\.34 mil/);
    expect(env?.row.min).toMatch(/32\.93 mil/);
    expect(env?.row.max).toMatch(/37\.8 mil/);
    const s = t?.sensitivities.find((x) => x.output === 'width' && x.input === 'current');
    expect(s?.value).toBe('+1.38');
    expect(s?.statement).toMatch(/\+1 % current gives about \+1\.38 % required width/);
    expect(s?.statement).toMatch(/local estimate for small changes/);
  });
  it('every envelope value is printed through format-result in the direction of the core Envelope.bound, and typ is the headline', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    const env = v.raw.envelope?.find((e) => e.name === 'width');
    expect(env).toBeDefined();
    if (env === undefined) return;
    const row = v.tolerance?.envelopes.find((e) => e.name === 'width')?.row;
    expect(env.bound).toBe('min-requirement');
    expect(row?.min).toBe(formatResult({ value: env.min, bound: env.bound ?? 'nominal' }, { accuracyClass: 'empirical', prefs: tw.headlinePrefs('metric') }));
    expect(row?.max).toBe(formatResult({ value: env.max, bound: env.bound ?? 'nominal' }, { accuracyClass: 'empirical', prefs: tw.headlinePrefs('metric') }));
    expect(row?.typ).toBe(v.result.headline.text);
  });
  it('the sensitivity results are not listed again as plain result rows', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    expect(v.result.rows.some((r) => /^sensitivity/i.test(r.label))).toBe(false);
  });
  it('the table names the bound semantic: a width is a minimum requirement, a current limit is a capacity', () => {
    const a = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    expect(a.tolerance?.envelopes[0]?.boundName).toBe('minimum requirement');
    const b = okw(stw({ solveFor: 'current', width: '12 mil', deltaT: '20 K', copperWeight: '1 oz', layer: 'outer', tol: { width: both('5%') } }));
    expect(b.tolerance?.envelopes[0]?.boundName).toBe('capacity');
  });
  it('labels are tolerance corners, never worst case or guarantee wording', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    const env = v.tolerance?.envelopes[0];
    expect(env?.row.label).toMatch(/tolerance corners/i);
    expect(`${env?.row.label} ${env?.row.note}`).not.toMatch(BANNED);
    expect(env?.row.note).toMatch(/initial tolerances/i);
  });
  it('a tolerance on a quantity that is the solved one is not offered and not sent', () => {
    const offered = (s: tw.TraceWidthState, k: string) => tw.toleranceFields(s).find((f) => f.key === k)?.offered;
    const s = stw({ ...W_BASE });
    expect(offered(s, 'current')).toBe(true);
    expect(offered(s, 'deltaT')).toBe(true);
    expect(offered(stw({ ...W_BASE, solveFor: 'current', width: '12 mil' }), 'current')).toBe(false);
    expect(offered(stw({ ...W_BASE, solveFor: 'deltaT', width: '12 mil' }), 'deltaT')).toBe(false);
    // stale text for a field that is no longer offered is ignored: same result as no tolerance
    const stale = okw(stw({ solveFor: 'current', width: '12 mil', deltaT: '20 K', copperWeight: '1 oz', layer: 'outer', tol: { current: both('5%') } }));
    expect(stale.tolerance).toBeUndefined();
  });
  it('an ambient tolerance is offered only when an ambient is entered', () => {
    const offered = (s: tw.TraceWidthState) => tw.toleranceFields(s).find((f) => f.key === 'ambient')?.offered;
    expect(offered(stw({ ...W_BASE }))).toBe(false);
    expect(offered(stw({ ...W_BASE, ambient: '40 °C' }))).toBe(true);
    const v = okw(stw({ ...W_BASE, ambient: '40 °C', tol: { ambient: both('5 K') } }));
    expect(v.raw.envelope?.some((e) => e.name === 'maximum conductor temperature')).toBe(true);
  });
  it('the temperature tolerance field is a difference field', () => {
    expect(tw.toleranceFields(stw({ ...W_BASE, ambient: '40 °C' })).find((f) => f.key === 'ambient')?.kind).toBe('temperature');
  });
  it('the copper-thickness choices: foil spread and S-009 appear only for a weight; S-003/S-009 add ledger status', () => {
    const w = okw(stw({ ...W_BASE, thickMode: 'foil' }));
    expect(w.tolerance).toBeDefined();
    expect(w.raw.reference.ledgerIds).toContain('S-003');
    expect(tw.thicknessModesOffered(stw({ ...W_BASE })).map((o) => o.value)).toEqual(['foil', 'finished', 'pct', 'none']);
    expect(tw.thicknessModesOffered(stw({ ...W_BASE, copperBy: 'thickness' })).map((o) => o.value)).toEqual(['pct', 'none']);
    // a choice that is no longer offered is ignored rather than sent to the core
    const ignored = okw(stw({ ...W_BASE, copperBy: 'thickness', copperThickness: '35 um', thickMode: 'foil' }));
    expect(ignored.tolerance).toBeUndefined();
  });
  it('S-009 thin side (inner layer): the ledger row is shown and the data is UNVERIFIED', () => {
    const v = okw(stw({ ...W_BASE, layer: 'inner', thickMode: 'finished' }));
    expect(v.raw.reference.ledgerIds).toContain('S-009');
    expect(v.result.ledger.unverifiedIds).toContain('S-009');
    expect(v.tolerance?.envelopes.length).toBeGreaterThan(0);
  });
  it('S-009 with no thin side (outer 1 oz): no envelope, the core note is shown in the block', () => {
    const v = okw(stw({ ...W_BASE, thickMode: 'finished' }));
    expect(v.tolerance?.envelopes).toEqual([]);
    expect(v.tolerance?.notices.map((n) => n.code)).toContain('TOLERANCE_CHOICE_NO_THIN_SIDE');
  });
  it('my own percent for the copper thickness', () => {
    const v = okw(stw({ ...W_BASE, thickMode: 'pct', tol: { copperThickness: both('10%') } }));
    expect(v.tolerance?.envelopes.length).toBeGreaterThan(0);
  });
  it('thickness own percent with an empty field: an inline error that names the field, no number', () => {
    const v = tw.computeView(stw({ ...W_BASE, thickMode: 'pct' }), TODAY);
    expect(v.status).toBe('needs-input');
  });
  it('the core error text is shown inline against the tolerance field and no number is produced', () => {
    const v = tw.computeView(stw({ ...W_BASE, tol: { current: both('99%') } }), TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.tolErrors?.current).toMatch(/95 %/);
      expect(v.problems.join(' ')).toMatch(/95 %/);
    }
  });
  it('a bad tolerance text is an error with the parser hint', () => {
    const v = tw.computeView(stw({ ...W_BASE, tol: { current: both('5') } }), TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.tolErrors?.current).toMatch(/5%/);
  });
  it('an asymmetric current tolerance changes the corners', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: asym('2%', '10%') } }));
    const env = v.raw.envelope?.find((e) => e.name === 'width');
    expect(env).toBeDefined();
    if (env) expect(env.max.si - env.typ.si).toBeGreaterThan(env.typ.si - env.min.si);
  });
  it('all-zero tolerances: no table (a point is not an envelope) but the sensitivity is still read', () => {
    const v = okw(stw({ ...W_BASE, tol: { current: both('0%') } }));
    expect(v.tolerance?.envelopes).toEqual([]);
    expect(v.tolerance?.sensitivities.length).toBeGreaterThan(0);
    expect(v.tolerance?.notices.some((n) => n.code === 'ENVELOPE_ZERO_TOLERANCE')).toBe(true);
  });
  it('a width tolerance when solving width adds the drawn width as a result row (a point, not a table)', () => {
    const v = okw(stw({ ...W_BASE, tol: { width: both('20%') } }));
    expect(v.result.rows.some((r) => /^Drawn width covering/.test(r.label))).toBe(true);
    expect(v.tolerance?.envelopes).toEqual([]);
  });
});

describe('trace width: fab profile width tolerance', () => {
  it('is never pre-selected, and the choice is offered only after a profile is selected', () => {
    expect(tw.DEFAULT_STATE.profile).toBe('');
    expect(tw.DEFAULT_STATE.widthProfile).toBe(false);
    expect(tw.profileWidthOffered(stw({}))).toBe(false);
    expect(tw.profileWidthOffered(stw({ profile: 'none' }))).toBe(false);
    expect(tw.profileWidthOffered(stw({ profile: 'bundled' }))).toBe(true);
  });
  it('uses the example profile value 20 % with S-019l UNVERIFIED, age shown, and is flagged as the fab profile', () => {
    const v = okw(stw({ ...W_BASE, solveFor: 'current', current: '', width: '12 mil', profile: 'bundled', widthProfile: true }));
    expect(v.raw.reference.ledgerIds).toContain('S-019l');
    expect(v.raw.fabProfile?.ageDays).toBeGreaterThanOrEqual(0);
    expect(v.result.ledger.unverifiedIds).toContain('S-019l');
    expect(v.result.details.assumptions.join(' ')).toMatch(/20 %/);
    expect(v.tolerance?.envelopes.length).toBeGreaterThan(0);
  });
  it('the flag without a selected profile is ignored by the view (never sent as profile)', () => {
    const v = okw(stw({ ...W_BASE, profile: '', widthProfile: true }));
    expect(v.tolerance).toBeUndefined();
    expect(v.raw.reference.ledgerIds).not.toContain('S-019l');
  });
  it('the banner shows id, date, age and stale state through today, only for a chosen profile', () => {
    expect(profileBanner('', TODAY)).toBeUndefined();
    expect(profileBanner('none', TODAY)).toBeUndefined();
    const b = profileBanner('bundled', TODAY);
    expect(b?.unverified).toBe(true);
    expect(b?.ageText).toMatch(/day/);
    expect(b?.stale).toBe(false);
    expect(profileBanner('bundled', '2030-01-01')?.stale).toBe(true);
  });
  it('the core TOLERANCE_NOT_PUBLISHED text surfaces when the profile publishes nothing', () => {
    const base = computeWidth({
      mode: 'B', layer: 'outer', current: q(3, DIM.CURRENT), deltaT: q(20, DIM.TEMPERATURE_DIFFERENCE), copperWeight: q(0.0305, DIM.AREAL_MASS),
      tolerances: { width: 'profile' }, today: TODAY,
      fabProfile: { ...(bundledProfile() as object), limits: {}, ledgerIds: [] } as never,
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const w = base.value.warnings.find((x) => x.code === 'TOLERANCE_NOT_PUBLISHED');
    expect(w).toBeDefined();
  });
});

describe('trace width: hash keys', () => {
  const full = stw({
    ...W_BASE, ambient: '40 °C', profile: 'bundled', widthProfile: true, thickMode: 'pct',
    tol: { current: both('5%'), deltaT: asym('1%', '2%'), width: both('10%'), copperThickness: both('7%'), ambient: both('3 K') },
  });
  it('round-trips every tolerance field, the choice, the profile and the width-from-profile flag', () => {
    const link = serializeHash({ name: 'calc', id: 'trace-width' }, tw.toHashState(full));
    const back = tw.fromHashState(parseHash(link).state);
    expect(back.notices).toEqual([]);
    expect(back.state.tol).toEqual(full.tol);
    expect(back.state.thickMode).toBe('pct');
    expect(back.state.profile).toBe('bundled');
    expect(back.state.widthProfile).toBe(true);
  });
  it('defaults write no tolerance keys and every written key is documented', () => {
    expect(Object.keys(tw.toHashState(stw(W_BASE))).sort()).toEqual(['ct', 'cw', 'dt', 'i', 'ly'].filter((k) => k in tw.toHashState(stw(W_BASE))).sort());
    const documented = new Set([...Object.keys(CALCULATOR_STATE_KEYS['trace-width']), 'u', 'fp']);
    for (const k of Object.keys(tw.toHashState(full))) expect(documented.has(k)).toBe(true);
    for (const k of tw.WRITTEN_KEYS) expect(documented.has(k)).toBe(true);
  });
  it('corrupt tolerance values fall back to empty with a notice, and a profile flag without a profile is dropped', () => {
    const l = tw.fromHashState({ tcur: 'x'.repeat(200), tkch: 'banana', twpf: '1' });
    expect(l.state.tol['current'] ?? EMPTY_TOL).toEqual(EMPTY_TOL);
    expect(l.state.thickMode).toBe('');
    expect(l.state.widthProfile).toBe(false);
    expect(l.notices.length).toBeGreaterThanOrEqual(3);
    expect(tw.fromHashState({}).state).toEqual(tw.DEFAULT_STATE);
  });
  it('an unknown fab profile id is ignored with a notice', () => {
    const l = tw.fromHashState({ fp: 'nobody-2020-01-01' });
    expect(l.state.profile).toBe('');
    expect(l.notices.join(' ')).toMatch(/profile/i);
  });
});

// ---------------------------------------------------------------------------
const str = (p: Partial<tr.TraceResistanceState>): tr.TraceResistanceState => ({ ...tr.DEFAULT_STATE, ...p });
const R_BASE: Partial<tr.TraceResistanceState> = { length: '100 mm', width: '0.254 mm', copperThickness: '35 um', copperBy: 'thickness', layer: 'outer', ambient: '85 °C' };
function okr(s: tr.TraceResistanceState) {
  const v = tr.computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('trace resistance: tolerances and sensitivity', () => {
  it('no tolerances: nothing extra', () => {
    expect(okr(str(R_BASE)).tolerance).toBeUndefined();
  });
  it('width +/-20 % alone: nominal and the high corner 0.304 ohm', () => {
    const v = okr(str({ ...R_BASE, tol: { width: both('20%') } }));
    const env = v.tolerance?.envelopes.find((e) => e.name === 'resistance at conductor temperature');
    expect(env?.row.max).toMatch(/^304\.4 mΩ/);
    expect(env?.row.min).toMatch(/^203 mΩ/);
    const s = v.tolerance?.sensitivities.find((x) => x.input === 'width');
    expect(s?.value).toBe('-1');
    expect(s?.statement).toMatch(/\+1 % width gives about -1\.00 %/);
  });
  it('offers resistivity only with an override, current only with a current, ambient only with an ambient', () => {
    const f = (s: tr.TraceResistanceState, k: string) => tr.toleranceFields(s).find((x) => x.key === k)?.offered;
    expect(f(str(R_BASE), 'resistivity')).toBe(false);
    expect(f(str({ ...R_BASE, resistivity: '1.72 µΩ·cm' }), 'resistivity')).toBe(true);
    expect(f(str(R_BASE), 'current')).toBe(false);
    expect(f(str({ ...R_BASE, current: '2 A' }), 'current')).toBe(true);
    expect(f(str(R_BASE), 'ambient')).toBe(true);
    expect(f(str({ ...R_BASE, ambient: '' }), 'ambient')).toBe(false);
  });
  it('has no fab-profile width choice (the core takes none here)', () => {
    expect(tr.toleranceFields(str(R_BASE)).every((f) => f.key !== 'profile')).toBe(true);
    expect(trPage).not.toMatch(/fab profile/i);
  });
  it('hash round trip and documentation', () => {
    const s = str({ ...R_BASE, thickMode: 'pct', tol: { width: both('20%'), length: asym('1%', '2%'), copperThickness: both('10%') } });
    const back = tr.fromHashState(parseHash(serializeHash({ name: 'calc', id: 'trace-resistance' }, tr.toHashState(s))).state);
    expect(back.state.tol).toEqual(s.tol);
    expect(back.state.thickMode).toBe('pct');
    const documented = new Set([...Object.keys(CALCULATOR_STATE_KEYS['trace-resistance']), 'u']);
    for (const k of Object.keys(tr.toHashState(s))) expect(documented.has(k)).toBe(true);
  });
  it('the S-003 choice works with a weight', () => {
    const v = okr(str({ length: '100 mm', width: '0.254 mm', copperWeight: '1 oz', layer: 'outer', weightSource: 'foil', thickMode: 'foil' }));
    expect(v.tolerance).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
const stv = (p: Partial<via.ViaState>): via.ViaState => ({ ...via.DEFAULT_STATE, ...p });
const V_BASE: Partial<via.ViaState> = { diameter: '0.3 mm', plating: '25 um', length: '1.6 mm', count: '4' };
function okv(s: via.ViaState) {
  const v = via.computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('via: tolerances and sensitivity', () => {
  it('no tolerances: nothing extra', () => {
    expect(okv(stv(V_BASE)).tolerance).toBeUndefined();
  });
  it('hole +/-10 % (d 0.3 mm, t 25 um, L 1.6 mm, N 4): R corners 252.3 and 303.6 uOhm around 275.5 uOhm', () => {
    const v = okv(stv({ ...V_BASE, tol: { finishedHoleDiameter: both('10%') } }));
    const env = v.tolerance?.envelopes.find((e) => e.name === 'resistance at conductor temperature');
    expect(env?.row.min).toMatch(/^252\.3 µΩ/);
    expect(env?.row.max).toMatch(/^303\.6 µΩ/);
    expect(env?.row.typ).toMatch(/^275\.5 µΩ/);
  });
  it('never offers a count tolerance and has no profile choice', () => {
    expect(via.toleranceFields(stv(V_BASE)).map((f) => f.key)).not.toContain('count');
    expect(viaPage).not.toMatch(/fab profile/i);
  });
  it('offers conductor temperature, resistivity and current only when supplied', () => {
    const f = (s: via.ViaState, k: string) => via.toleranceFields(s).find((x) => x.key === k)?.offered;
    expect(f(stv(V_BASE), 'conductorTemperature')).toBe(false);
    expect(f(stv({ ...V_BASE, temperature: '60 °C' }), 'conductorTemperature')).toBe(true);
    expect(f(stv(V_BASE), 'resistivity')).toBe(false);
    expect(f(stv(V_BASE), 'current')).toBe(false);
    expect(f(stv({ ...V_BASE, current: '1 A' }), 'current')).toBe(true);
  });
  it('the core error appears inline against the tolerance field', () => {
    const v = via.computeView(stv({ ...V_BASE, tol: { barrelLength: both('99%') } }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.tolErrors?.barrelLength).toMatch(/95 %/);
  });
  it('hash round trip and documentation', () => {
    const s = stv({ ...V_BASE, temperature: '60 °C', tol: { finishedHoleDiameter: both('10%'), conductorTemperature: both('5 K'), platingThickness: asym('20%', '5%') } });
    const back = via.fromHashState(parseHash(serializeHash({ name: 'calc', id: 'via' }, via.toHashState(s))).state);
    expect(back.state.tol).toEqual(s.tol);
    const documented = new Set([...Object.keys(CALCULATOR_STATE_KEYS['via']), 'u']);
    for (const k of Object.keys(via.toHashState(s))) expect(documented.has(k)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('source rules for the new UI', () => {
  const strip = (t: string): string => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const files: Record<string, string> = { tolSrc, bannerSrc, inputsSrc, resultsSrc, twPage, trPage, viaPage, twVmSrc, trVmSrc, viaVmSrc };
  it('no hand rounding, no direct formatFor/formatDual, no nearest rounding', () => {
    for (const [f, text] of Object.entries(files)) {
      const code = strip(text);
      expect(code, f).not.toMatch(/\bformatFor\b|\bformatDual\b|\bformatDualThickness\b/);
      expect(code, f).not.toMatch(/toPrecision|Math\.round|Math\.ceil|Math\.floor/);
      if (f !== 'twVmSrc') expect(code, f).not.toMatch(/toFixed/);
      expect(code, f).not.toMatch(/round\s*:\s*['"]nearest['"]|'nearest'/);
    }
  });
  it('no engineering math in the pages or the page view-models', () => {
    for (const f of ['twPage', 'trPage', 'viaPage', 'trVmSrc', 'viaVmSrc', 'inputsSrc', 'resultsSrc']) {
      const code = strip(files[f] ?? '');
      expect(code, f).not.toMatch(/Math\.|\.si\b|\w\s\*\*\s\w/);
    }
  });
  it('no compliance or guarantee wording in any new text', () => {
    for (const f of ['tolSrc', 'bannerSrc', 'inputsSrc', 'resultsSrc']) expect(strip(files[f] ?? ''), f).not.toMatch(BANNED);
    for (const f of ['twPage', 'trPage', 'viaPage', 'twVmSrc', 'trVmSrc', 'viaVmSrc']) expect(strip(files[f] ?? ''), f).not.toMatch(new RegExp(String.raw`pass(es|ed)?|${'compl'}iant|production[- ]${'saf'}e`, 'i'));
  });
  it('the tolerance section is collapsed by default and the thickness choice is a radio group', () => {
    expect(inputsSrc).toMatch(/<details/);
    expect(inputsSrc).toMatch(/RadioGroup/);
    expect(resultsSrc).toMatch(/EnvelopeTable/);
  });
  it('the three pages mount the section and the results block', () => {
    for (const p of [twPage, trPage, viaPage]) {
      expect(p).toMatch(/ToleranceSection/);
      expect(p).toMatch(/ToleranceResults/);
    }
  });
});

// ---------------------------------------------------------------------------
// Component structure (no DOM is available in the test environment, so the function components are expanded as vnodes).
// ---------------------------------------------------------------------------
interface VNodeLike {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
}
const isV = (x: unknown): x is VNodeLike => typeof x === 'object' && x !== null && 'type' in x && 'props' in x;
function flat(node: unknown, out: VNodeLike[] = []): VNodeLike[] {
  if (Array.isArray(node)) {
    for (const n of node) flat(n, out);
    return out;
  }
  if (!isV(node)) return out;
  if (typeof node.type === 'function') return flat((node.type as (p: unknown) => unknown)(node.props), out);
  out.push(node);
  flat(node.props['children'], out);
  return out;
}
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isV(node)) return typeof node.type === 'function' ? textOf((node.type as (p: unknown) => unknown)(node.props)) : textOf(node.props['children']);
  return '';
};

describe('tolerance components (structure)', () => {
  const fields = tw.toleranceFields(stw({ ...W_BASE, ambient: '40 °C' }));
  const props = {
    fields,
    tol: {},
    onTol: () => undefined,
    errors: {},
    thickness: { mode: '' as const, options: tw.thicknessModesOffered(stw({})), onMode: () => undefined, weight: true },
    open: false,
    onToggle: () => undefined,
  };
  it('the section is a collapsed details element, every input has a label, and no thickness radio is pre-selected', async () => {
    const { ToleranceSection } = await import('../components/ToleranceInputs');
    const nodes = flat(ToleranceSection(props));
    const details = nodes.find((n) => n.type === 'details');
    expect(details?.props['open']).toBe(false);
    const inputs = nodes.filter((n) => n.type === 'input' && n.props['type'] === 'text');
    const labels = nodes.filter((n) => n.type === 'label').map((n) => n.props['for']);
    expect(inputs.length).toBeGreaterThanOrEqual(4);
    for (const i of inputs) expect(labels).toContain(i.props['id']);
    const radios = nodes.filter((n) => n.type === 'input' && n.props['type'] === 'radio' && n.props['name'] === 'tol-thickness');
    expect(radios.length).toBe(4);
    expect(radios.every((r) => r.props['checked'] === false)).toBe(true);
    const text = textOf(ToleranceSection(props));
    expect(text).toMatch(/S-003/);
    expect(text).toMatch(/PAYWALLED/);
  });
  it('a field that is not offered shows a reason instead of an input', async () => {
    const { ToleranceSection } = await import('../components/ToleranceInputs');
    const f = tw.toleranceFields(stw({ ...W_BASE, solveFor: 'current', width: '12 mil' }));
    const nodes = flat(ToleranceSection({ ...props, fields: f }));
    const ids = nodes.filter((n) => n.type === 'input').map((n) => n.props['id']);
    expect(ids).not.toContain('tol-current');
    expect(textOf(ToleranceSection({ ...props, fields: f }))).toMatch(/the current is the solved quantity/);
  });
  it('the results block shows the corners-only warning as an Important callout with the core text, and a text tag on notes', async () => {
    const { ToleranceResults } = await import('../components/ToleranceResults');
    const view = {
      envelopes: [],
      notices: [
        { code: 'ENVELOPE_CORNERS_ONLY', tag: 'Caution', heading: 'This range comes from corners and axis points only; its extremes are not proven', message: 'core text about corners' },
        { code: 'ENVELOPE_ZERO_TOLERANCE', tag: 'Note', message: 'core zero note' },
      ],
      sensitivities: [],
    };
    const t = textOf(ToleranceResults({ view }));
    expect(t).toMatch(/Important: This range comes from corners and axis points only/);
    expect(t).toMatch(/core text about corners/);
    expect(t).toMatch(/Note\. core zero note/);
  });
  it('nothing is rendered without tolerances or without content', async () => {
    const { ToleranceResults } = await import('../components/ToleranceResults');
    expect(ToleranceResults({ view: undefined })).toBeNull();
    expect(ToleranceResults({ view: { envelopes: [], notices: [], sensitivities: [] } })).toBeNull();
  });
  it('the envelope table and sensitivity table carry column and row headers', async () => {
    const { ToleranceResults } = await import('../components/ToleranceResults');
    const v = okw(stw({ ...W_BASE, tol: { current: both('5%') } }));
    const nodes = flat(ToleranceResults({ view: v.tolerance }));
    const ths = nodes.filter((n) => n.type === 'th').map((n) => textOf(n.props['children']));
    expect(ths).toEqual(expect.arrayContaining(['Minimum', 'Typical', 'Maximum', 'Sensitivity of output to input', 'Exponent', 'Reading']));
    expect(textOf(ToleranceResults({ view: v.tolerance }))).toMatch(/Sensitivity of minimum trace width to current/);
  });
});
