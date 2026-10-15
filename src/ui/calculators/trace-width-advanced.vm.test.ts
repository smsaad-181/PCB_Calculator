import { describe, expect, it } from 'vitest';
import pageSrc from './TraceWidth.tsx?raw';
import validitySrc from '../components/ValidityChecksList.tsx?raw';
import nearSrc from '../components/NearResultNotes.tsx?raw';
import { compute } from '../../core/calculators/trace-width/calc';
import { PEAK_HIGHER_WARNING } from '../../core/calculators/pulse-shared';
import { DIM, fromUnit, q } from '../../core/units';
import { CALCULATOR_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  PULSE_SECTION_LEGEND,
  PULSE_SOLVE_CURRENT_TEXT,
  STATED_MAX_CHECK_NAME,
  activeFields,
  computeView,
  fromHashState,
  solveOptions,
  toHashState,
  withProfile,
  type TraceWidthState,
} from './trace-width.vm';

const st = (p: Partial<TraceWidthState>): TraceWidthState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const OUTER_W: Partial<TraceWidthState> = { solveFor: 'width', current: '1 A', deltaT: '10 °C', copperWeight: '1 oz', layer: 'outer' };
const TODAY = '2026-10-15';

function ok(s: TraceWidthState, today?: string) {
  const v = computeView(s, today);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}

describe('stated maximum conductor temperature is informational, never a pass', () => {
  const w = ok(st({ ...OUTER_W, maxTemp: '30 °C' }));
  const n = ok(st({ ...OUTER_W, maxTemp: '105 °C' }));
  it('uses the renamed core check, flagged informational in both the at-or-below and exceeds cases', () => {
    expect(STATED_MAX_CHECK_NAME).toBe('Estimated conductor temperature vs your stated maximum (informational)');
    for (const v of [w, n]) {
      const c = v.result.details.validity.find((x) => x.name === STATED_MAX_CHECK_NAME);
      expect(c?.informational).toBe(true);
      expect(c?.detail).toMatch(/does not model ambient/);
      expect(c?.detail).toMatch(/not a design check/);
    }
    expect(w.result.details.validity.filter((c) => c.informational !== true).every((c) => c.ok)).toBe(true);
  });
  it('the list marks it informational with no pass mark and does not count it as failed', () => {
    const code = validitySrc.replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/c\.informational === true/);
    expect(validitySrc).toMatch(/Informational/);
    expect(pageSrc).toMatch(/informational/);
  });
  it('the page field is labelled informational and no longer claims a check', () => {
    expect(pageSrc).toMatch(/Maximum allowed conductor temperature \(optional, informational\)/);
    expect(pageSrc).not.toMatch(/is checked against it/);
  });
});

describe('pulsed current (RMS-equivalent)', () => {
  const PULSE: Partial<TraceWidthState> = {
    solveFor: 'width', currentMode: 'pulse', peakCurrent: '10 A', duty: '25%', periodVsTau: 'much-shorter', deltaT: '20 K', copperWeight: '1 oz', layer: 'outer',
  };
  it('has no default: steady mode, no period statement, nothing pulsed in the default state', () => {
    expect(DEFAULT_STATE.currentMode).toBe('steady');
    expect(DEFAULT_STATE.periodVsTau).toBe('');
    expect(DEFAULT_STATE.peakCurrent).toBe('');
    expect(DEFAULT_STATE.duty).toBe('');
  });
  it('10 A peak, 25 %, much shorter, outer 1 oz, rise 20 K: width about 71.49 mil, labelled as RMS-equivalent mean heating', () => {
    const v = ok(st(PULSE));
    expect(v.result.headline.text).toMatch(/\(71\.[45]\d* mil\)$/);
    expect(v.result.headline.label).toMatch(/RMS-equivalent/);
    expect(v.result.headline.label).toMatch(/mean heating/);
    expect(v.result.rows.map((r) => r.label)).toContain('RMS-equivalent current (mean heating)');
    expect(v.result.details.steps.map((x) => x.label).join(' ')).toMatch(/RMS-equivalent \(mean heating\)/);
  });
  it('shows the "peak is higher" callout from the core text, and the rms assumption warning pinned first', () => {
    const v = ok(st(PULSE));
    const core = v.raw.warnings.find((x) => x.code === 'PULSE_PEAK_HIGHER');
    expect(core?.message).toBe(PEAK_HIGHER_WARNING);
    expect(v.callout?.heading).toMatch(/peak is higher/);
    expect(v.callout?.text).toBe(PEAK_HIGHER_WARNING);
    expect(v.result.warnings[0]?.message).toMatch(/^Legacy IPC-2221 method|^Pulse: I_rms = I_pk x sqrt\(D\)/);
    expect(v.result.warnings.some((x) => /^Pulse: I_rms = I_pk x sqrt\(D\)/.test(x.message))).toBe(true);
  });
  it('comparable-or-longer holds the peak continuously: no rms row, no mean wording, a warning, and a larger width', () => {
    const a = ok(st(PULSE));
    const b = ok(st({ ...PULSE, periodVsTau: 'comparable-or-longer' }));
    expect(b.result.headline.label).toMatch(/peak current held continuously/);
    expect(b.result.headline.label).not.toMatch(/mean/);
    expect(b.result.rows.map((r) => r.label).join('|')).not.toMatch(/RMS-equivalent current/);
    expect(b.callout).toBeUndefined();
    expect(b.raw.warnings.some((x) => x.code === 'PULSE_PERIOD_NOT_SHORT')).toBe(true);
    expect(b.result.warnings.some((x) => x.severity === 'warning' && /comparable to or longer/.test(x.message))).toBe(true);
    const wa = a.raw.results.find((r) => r.name === 'width')?.value.si ?? 0;
    const wb = b.raw.results.find((r) => r.name === 'width')?.value.si ?? 0;
    expect(wb).toBeGreaterThan(wa);
  });
  it('the period-versus-time-constant statement is required: without it no number is given', () => {
    const v = computeView(st({ ...PULSE, periodVsTau: '' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/much shorter than the thermal time constant/);
    expect(v).not.toHaveProperty('result');
  });
  it('a pulse hides the steady current: the field is not active and its text is never read or sent', () => {
    expect(activeFields({ solveFor: 'width', copperBy: 'weight', currentMode: 'pulse' })).not.toContain('current');
    expect(activeFields({ solveFor: 'width', copperBy: 'weight', currentMode: 'pulse' })).toEqual(expect.arrayContaining(['peakCurrent', 'duty', 'deltaT']));
    expect(activeFields({ solveFor: 'deltaT', copperBy: 'weight', currentMode: 'pulse' }).slice(0, 3)).toEqual(['width', 'peakCurrent', 'duty']);
    const v = ok(st({ ...PULSE, current: 'garbage' }));
    expect(v.raw.inputs.map((i) => i.name)).not.toContain('current');
    expect(v.raw.inputs.map((i) => i.name)).toEqual(expect.arrayContaining(['peakCurrent', 'duty']));
  });
  it('steady mode ignores pulse text, so a stale peak or duty cannot block', () => {
    expect(computeView(st({ ...OUTER_W, peakCurrent: 'nonsense', duty: '300%' })).status).toBe('ok');
  });
  it('solving the temperature rise with a pulse gives a mean rise, labelled as such', () => {
    const v = ok(st({ ...PULSE, solveFor: 'deltaT', width: '1.8 mm', deltaT: '' }));
    expect(v.result.headline.label).toMatch(/Mean temperature rise/);
    const p = ok(st({ ...PULSE, solveFor: 'deltaT', width: '1.8 mm', deltaT: '', periodVsTau: 'comparable-or-longer' }));
    expect(p.result.headline.label).toMatch(/peak current held continuously/);
  });
  it('solve for current is not offered with a pulse, and a link that asks for it shows the core error text, never a number', () => {
    expect(solveOptions(st({})).find((o) => o.value === 'current')?.disabled).toBeUndefined();
    const pulse = solveOptions(st({ currentMode: 'pulse' }));
    expect(pulse.find((o) => o.value === 'current')?.disabled).toBe(true);
    expect(pulse.find((o) => o.value === 'current')?.hint).toMatch(/pulse/i);
    const v = computeView(st({ ...PULSE, solveFor: 'current', width: '1 mm' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toContain(PULSE_SOLVE_CURRENT_TEXT);
    expect(v).not.toHaveProperty('result');
    // The text is the core's own message for width + rise + pulse together (drift guard).
    const core = compute({
      mode: 'B', layer: 'outer', width: fromUnit(1, 'mm'), deltaT: fromUnit(20, 'ddegC'), peakCurrent: fromUnit(10, 'A'),
      duty: q(0.25, DIM.DIMENSIONLESS), periodVsTau: 'much-shorter', copperWeight: fromUnit(1, 'oz/ft2'),
    });
    expect(core.ok).toBe(false);
    if (!core.ok) expect(core.error.message).toBe(PULSE_SOLVE_CURRENT_TEXT);
  });
  it('a current tolerance with a pulse shows the core message at the tolerance field', () => {
    const v = computeView(st({ ...PULSE, tol: { current: { asym: false, both: '5%', minus: '', plus: '' } } }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.tolErrors?.['current']).toMatch(/not available with a pulse/);
  });
  it('a duty above 100 % or a zero peak current is an inline error, never a number', () => {
    for (const p of [{ duty: '150%' }, { duty: '0%' }, { peakCurrent: '0 A' }, { peakCurrent: '-1 A' }]) {
      const v = computeView(st({ ...PULSE, ...p }));
      expect(v.status, JSON.stringify(p)).toBe('error');
      expect(v).not.toHaveProperty('result');
    }
  });
  it('hash keys round-trip, are documented in hash.ts, and a bad value falls back with a notice', () => {
    const s = st(PULSE);
    const h = toHashState(s);
    expect(h).toMatchObject({ cm: 'pulse', ip: '10 A', du: '25%', pt: 'much-shorter' });
    const back = fromHashState(parseHash(serializeHash(ROUTE, h)).state);
    expect(back.notices).toEqual([]);
    expect(back.state).toEqual(s);
    for (const k of ['cm', 'ip', 'du', 'pt', 'lc']) expect(Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID])).toContain(k);
    const bad = fromHashState({ cm: 'burst', pt: 'whenever' });
    expect(bad.state.currentMode).toBe('steady');
    expect(bad.state.periodVsTau).toBe('');
    expect(bad.notices).toHaveLength(2);
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('cm');
  });
  it('a shared pulse link reproduces the example', () => {
    const state = fromHashState(parseHash('#/calc/trace-width?v=1&cm=pulse&ip=10%20A&du=25%25&pt=much-shorter&cw=1%20oz&dt=20%20K&ly=outer').state).state;
    expect(ok(state).result.headline.text).toMatch(/\(71\.[45]\d* mil\)$/);
  });
  it('the page has the section, hides the steady current in pulse mode, and takes its solve options from the view-model', () => {
    expect(PULSE_SECTION_LEGEND).toMatch(/^Pulsed current \(RMS-equivalent\)/);
    expect(pageSrc).toMatch(/legend=\{PULSE_SECTION_LEGEND\}/);
    expect(pageSrc).toMatch(/!pulse && solve !== 'current'/);
    expect(pageSrc).toMatch(/periodVsTau/);
    expect(pageSrc).toMatch(/solveOptions\(/);
  });
});

describe('fab profile layer count and the minimum trace width note', () => {
  const withProf = (p: Partial<TraceWidthState>) => st({ ...OUTER_W, profile: 'bundled', ...p });
  it('has no default layer count; it is hash-keyed lc and cleared when no profile is chosen', () => {
    expect(DEFAULT_STATE.layerCount).toBe('');
    expect(toHashState(DEFAULT_STATE)).not.toHaveProperty('lc');
    const s = withProf({ layerCount: '2' });
    expect(toHashState(s)['lc']).toBe('2');
    expect(fromHashState(parseHash(serializeHash(ROUTE, toHashState(s))).state).state).toEqual(s);
    expect(withProfile(s, 'none').layerCount).toBe('');
    expect(withProfile(s, 'bundled').layerCount).toBe('2');
    const orphan = fromHashState({ lc: '2' });
    expect(orphan.state.layerCount).toBe('');
    expect(orphan.notices.join(' ')).toMatch(/layer count/i);
    expect(fromHashState({ lc: '7', fp: 'none' }).notices.join(' ')).toMatch(/layer count/i);
  });
  it('without a layer count the profile adds no minimum-width note; with one it is shown near the result, not in the warning list', () => {
    expect(ok(withProf({}), TODAY).nearResult.notes).toHaveLength(0);
    const v = ok(withProf({ layerCount: '2' }), TODAY);
    expect(v.nearResult.notes).toHaveLength(1);
    const note = v.nearResult.notes[0];
    expect(note?.code).toBe('MEETS_PROFILE_MIN_TRACE_WIDTH');
    expect(note?.message).toMatch(/UNVERIFIED/);
    expect(note?.message).toMatch(/days old/);
    expect(note?.severity).toBe('info');
    expect(v.nearResult.unverified).toBe(true);
    expect(v.result.warnings.some((x) => /Width check against profile/.test(x.message))).toBe(false);
  });
  it('a width below the profile minimum is a warning-severity note, never pass-styled', () => {
    const v = ok(withProf({ current: '0.05 A', deltaT: '5 °C', layerCount: '2' }), TODAY);
    const note = v.nearResult.notes[0];
    expect(note?.code).toBe('BELOW_PROFILE_MIN_TRACE_WIDTH');
    expect(note?.severity).toBe('warning');
    expect(note?.message).toMatch(/below the profile minimum/);
    expect(note?.message).toMatch(/not a statement about current capacity/);
  });
  it('an unlisted scope says not published and substitutes nothing', () => {
    const v = ok(withProf({ copperWeight: '3 oz', layerCount: 'multilayer' }), TODAY);
    expect(v.nearResult.notes[0]?.code).toBe('PROFILE_MIN_TRACE_WIDTH_NOT_PUBLISHED');
    expect(v.nearResult.notes[0]?.severity).toBe('caution');
  });
  it('layer count without a chosen profile is never sent to the core', () => {
    expect(ok(st({ ...OUTER_W, layerCount: '2' }), TODAY).nearResult.notes).toHaveLength(0);
  });
  it('the page shows the layer-count radio only with a chosen profile, and the near-result block never uses a pass mark', () => {
    expect(pageSrc).toMatch(/profileWidthOffered\(state\) && \(/);
    expect(pageSrc).toMatch(/name="layercount"/);
    expect(pageSrc).toMatch(/NearResultNotes/);
    const near = nearSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(near).not.toMatch(/✔|Within range|\bPASS\b|\bpass\b/);
    expect(near).toMatch(/UNVERIFIED/);
  });
});

describe('inner-layer finished copper caution sits next to the width result', () => {
  it('INNER_FINISHED_COPPER_THINNER is shown as a caution near the headline, not in the long list', () => {
    const v = ok(st({ ...OUTER_W, layer: 'inner', weightSource: 'foil' }));
    const c = v.nearResult.notes.find((x) => x.code === 'INNER_FINISHED_COPPER_THINNER');
    expect(c?.severity).toBe('caution');
    expect(c?.label).toBe('Caution');
    expect(v.result.warnings.some((x) => /Inner-layer finished copper/.test(x.message))).toBe(false);
    expect(v.raw.warnings.some((x) => x.code === 'INNER_FINISHED_COPPER_THINNER')).toBe(true);
  });
  it('an outer layer has none', () => {
    expect(ok(st(OUTER_W)).nearResult.notes.some((x) => x.code === 'INNER_FINISHED_COPPER_THINNER')).toBe(false);
  });
});
