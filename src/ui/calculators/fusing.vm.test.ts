import { describe, expect, it } from 'vitest';
import vmSrc from './fusing.vm.ts?raw';
import pageSrc from './Fusing.tsx?raw';
import { parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import {
  CALCULATOR_ID,
  DEFAULT_STATE,
  SELF_HEATING_HREF,
  SEPARATION_NOTE,
  STATUS_LINES,
  WRITTEN_KEYS,
  computeView,
  fromHashState,
  liveSummary,
  specificHeatConflictNote,
  specificHeatOptions,
  toHashState,
  type FusingState,
} from './fusing.vm';

const st = (p: Partial<FusingState>): FusingState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const AREA: Partial<FusingState> = { geometry: 'area', area: '1 mm2', initialTemp: '25 °C', mode: 'current', current: '10 A' };

function ok(s: FusingState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const codes = (v: ReturnType<typeof ok>) => v.raw.warnings.map((w) => w.code);

describe('mandatory inputs start blank and nothing is assumed', () => {
  it('the default state is empty and needs geometry, initial temperature and a mode', () => {
    const v = computeView(DEFAULT_STATE);
    expect(v.status).toBe('needs-input');
    if (v.status !== 'needs-input') return;
    const t = v.needs.join(' | ');
    expect(t).toMatch(/geometry/i);
    expect(t).toMatch(/initial.*temperature/i);
    expect(t).toMatch(/what you know/i);
    expect(Object.values(DEFAULT_STATE).filter((x) => x !== '' && x !== 'metric')).toEqual([]);
  });
  it('no choice is pre-selected in source', () => {
    expect(vmSrc).not.toMatch(/geometry:\s*'(area|trace|wire)'/);
    expect(vmSrc).not.toMatch(/mode:\s*'(current|time|i2t)'/);
    expect(vmSrc).not.toMatch(/basis:\s*'(finished|measured|nominal)'/);
  });
  it('a trace needs width, thickness and an explicit thickness basis', () => {
    const v = computeView(st({ geometry: 'trace', width: '2 mm', thickness: '35 um', initialTemp: '25 °C', mode: 'current', current: '10 A' }));
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/thickness basis/i);
  });
  it('the initial temperature has no default', () => {
    const v = computeView(st({ ...AREA, initialTemp: '' }));
    expect(v.status).toBe('needs-input');
  });
});

describe('inputs are mutually exclusive in the UI', () => {
  it('only the chosen pulse input is read: a leftover time is ignored', () => {
    const v = ok(st({ ...AREA, time: '1 s', i2t: '5 A2s' }));
    const names = v.raw.inputs.map((i) => i.name);
    expect(names).toContain('current');
    expect(names).not.toContain('pulse time');
    expect(names).not.toContain('action integral I²t');
  });
  it('only the chosen geometry is read: a leftover wire diameter and trace width are ignored', () => {
    const v = ok(st({ ...AREA, wire: '1 mm', width: '2 mm', thickness: '35 um', basis: 'finished' }));
    expect(v.raw.inputs.map((i) => i.name)).toEqual(['conductor cross-section (given)', 'initial conductor temperature', 'current']);
  });
  it('an invalid value in a hidden field does not block the result', () => {
    expect(computeView(st({ ...AREA, time: 'garbage', wire: '-1 mm' })).status).toBe('ok');
  });
  it('each mode gives its own headline', () => {
    expect(ok(st(AREA)).result.headline.label).toMatch(/time/i);
    const t = ok(st({ ...AREA, mode: 'time', time: '0.5 s', current: '' }));
    expect(t.result.headline.label).toMatch(/current/i);
    expect(t.result.headline.text).toMatch(/A$/);
    const f = ok(st({ ...AREA, mode: 'i2t', i2t: '40 A2s', current: '' }));
    expect(f.result.headline.label).toMatch(/fraction/i);
    expect(codes(f)).toContain('NO_DURATION');
  });
  it('wire diameter geometry works', () => {
    expect(ok(st({ ...AREA, geometry: 'wire', wire: '0.5 mm', area: '' })).raw.inputs.map((i) => i.name)).toContain('wire diameter');
  });
});

describe('trace thickness and the foil weight conversion', () => {
  const TR: Partial<FusingState> = { geometry: 'trace', width: '2 mm', initialTemp: '25 °C', mode: 'current', current: '20 A' };
  it('a length thickness uses the basis you chose', () => {
    const v = ok(st({ ...TR, thickness: '35 um', basis: 'measured' }));
    expect(v.raw.inputs.find((i) => i.name === 'trace copper thickness')?.sourceDetail).toMatch(/measured/);
    expect(codes(v)).not.toContain('THICKNESS_NOMINAL');
  });
  it('a foil weight is converted to a length by the core converter and passed as a nominal length', () => {
    const v = ok(st({ ...TR, thickness: '1 oz/ft2', basis: '' }));
    const t = v.raw.inputs.find((i) => i.name === 'trace copper thickness');
    expect(t?.value.dim).toEqual(v.raw.inputs.find((i) => i.name === 'trace width')?.value.dim);
    expect(t?.value.si).toBeCloseTo(35e-6, 9);
    expect(t?.sourceDetail).toMatch(/nominal/);
    expect(codes(v)).toContain('THICKNESS_NOMINAL');
    expect(v.thicknessNote).toMatch(/1 oz\/ft2|foil/i);
    expect(v.thicknessNote).toMatch(/nominal/i);
    expect(v.thicknessNote).toMatch(/35 um per oz/i);
  });
  it('a foil weight with the mass-density convention changes the length and says so', () => {
    const v = ok(st({ ...TR, thickness: '1 oz/ft2', convention: 'mass-density' }));
    expect(v.thicknessNote).toMatch(/8890/);
  });
  it('thickness text that is neither a length nor a foil weight is an error on the thickness field', () => {
    const v = computeView(st({ ...TR, thickness: '5 A', basis: 'finished' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.thickness).toMatch(/length|foil|oz/i);
  });
  it('the plausibility range failure is a validity check, with a confidence reason', () => {
    const v = ok(st({ ...TR, thickness: '1 mm', basis: 'measured' }));
    expect(v.result.details.validity.some((c) => !c.ok && /thickness/.test(c.name))).toBe(true);
  });
});

describe('specific heat: a default with all three sourced values and the conflict', () => {
  it('lists the three sourced values and a default that says it is a product choice', () => {
    const o = specificHeatOptions();
    expect(o.map((x) => x.value)).toEqual(['', 'pppl-293k', 'pppl-300k', 'hyperphysics-20c']);
    expect(o[0]?.label).toMatch(/default.*product choice/i);
    expect(o[0]?.label).toMatch(/385/);
    const all = o.map((x) => x.label).join(' ');
    for (const n of ['383.48', '385', '386']) expect(all).toContain(n);
    expect(specificHeatConflictNote()).toMatch(/CONFLICT/);
    for (const n of ['383.48', '385', '386']) expect(specificHeatConflictNote()).toContain(n);
  });
  it('an unchosen value is a visible DEFAULT in the provenance and lowers confidence', () => {
    const d = ok(st(AREA));
    const row = d.result.details.inputs.find((i) => /specific heat/i.test(i.label));
    expect(row?.source).toBe('default');
    const c = ok(st({ ...AREA, specificHeat: 'pppl-293k' }));
    expect(c.result.details.inputs.find((i) => /specific heat/i.test(i.label))?.source).toBe('user');
    expect(d.result.confidence.reasons.join(' ')).toMatch(/default/i);
  });
});

describe('always-visible statements and warnings', () => {
  it('status lines say estimate, low confidence, not a fuse rating and the PCB caveat', () => {
    const s = STATUS_LINES.join(' ');
    expect(s).toMatch(/estimate/i);
    expect(s).toMatch(/low confidence/i);
    expect(s).toMatch(/not a fuse rating/i);
    expect(s).toMatch(/adiabatic/i);
  });
  it('fusing is separated from steady-state heating with a link to the self-heating page', () => {
    expect(SEPARATION_NOTE).toMatch(/different questions?/i);
    expect(SEPARATION_NOTE).toMatch(/steady-state/i);
    expect(SELF_HEATING_HREF).toBe('#/calc/self-heating');
    expect(pageSrc).toContain('SELF_HEATING_HREF');
  });
  it('the result carries the adiabatic PCB caveat and the not-a-rating notice as callouts, and the answer is the time to REACH melting', () => {
    const v = ok(st(AREA));
    const t = v.callouts.map((c) => c.text).join(' ');
    expect(t).toMatch(/not a fuse rating/i);
    expect(t).toMatch(/adiabatic/i);
    expect(v.result.headline.label).toMatch(/reach/i);
    expect(v.result.confidence.level).toBe('low');
    expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
  });
  it('1 s and 10 s warnings are worded as product choices, not sourced limits', () => {
    const under = ok(st({ ...AREA, current: '300 A' }));
    expect(codes(under)).not.toContain('OVER_1S');
    const over1 = ok(st({ ...AREA, current: '200 A' }));
    expect(codes(over1)).toContain('OVER_1S');
    expect(codes(over1)).not.toContain('OVER_10S');
    const over10 = ok(st({ ...AREA, current: '50 A' }));
    expect(codes(over10)).toEqual(expect.arrayContaining(['OVER_1S', 'OVER_10S']));
    const texts = over10.result.warnings.filter((w) => /beyond (1|10) s/.test(w.message));
    expect(texts.length).toBe(2);
    for (const w of texts) expect(w.message).toMatch(/product choices, not sourced limits/);
    expect(over10.result.warnings[0]?.severity).toBe('critical');
  });
  it('the IPC scope check is shown as not checked, not as a failure', () => {
    const v = ok(st({ ...AREA, current: '300 A' }));
    const ipc = v.result.details.validity.find((c) => /IPC scope/.test(c.name));
    expect(ipc?.notChecked).toBe(true);
    expect(ipc?.ok).toBe(false);
    expect(v.notCheckedCount).toBe(1);
    expect(v.failedChecks).toBe(0);
  });
  it('shows UNVERIFIED and a ledger role per row', () => {
    const v = ok(st(AREA));
    expect(v.result.ledger.unverifiedIds).toEqual(expect.arrayContaining(['S-042', 'S-042a']));
    expect(v.ledgerRows.map((r) => r.id)).toEqual(expect.arrayContaining(['S-042', 'S-042d', 'S-042f']));
    for (const r of v.ledgerRows) expect(r.role.length).toBeGreaterThan(5);
  });
  it('Preece is separate from the main rows and labelled historical, not a PCB model', () => {
    const v = ok(st(AREA));
    expect(v.result.rows.some((r) => /preece/i.test(r.label))).toBe(false);
    expect(v.preece?.label).toMatch(/historical/i);
    expect(v.preece?.text).toMatch(/A$/);
    expect(v.preece?.note).toMatch(/not a PCB model/i);
  });
  it('the Onderdonk check is a secondary row with the ratio', () => {
    const labels = ok(st(AREA)).result.rows.map((r) => r.label).join('|');
    expect(labels).toMatch(/Onderdonk time/);
    expect(labels).toMatch(/ratio/i);
  });
  it('the K step has a readable value with its local unit (P4-7)', () => {
    const v = ok(st(AREA));
    const step = v.result.details.steps.find((s) => /^K = /.test(s.label));
    expect(step).toBeDefined();
    expect(step?.text).toMatch(/^\d[\d.]*e?\+?\d* A²·s\/m⁴$/);
    expect(step?.text).not.toMatch(/NaN|undefined|Infinity/);
    expect(v.result.details.steps.length).toBe(v.raw.steps.length);
  });
  it('the formula comes from the core result', () => {
    const v = ok(st(AREA));
    expect(v.result.details.formula).toBe(v.raw.formula);
  });
  it('the live summary is an estimate statement and never invents a number', () => {
    expect(liveSummary(ok(st(AREA)))).toMatch(/not a fuse rating/i);
    expect(liveSummary(computeView(DEFAULT_STATE))).toMatch(/^No result yet/);
    expect(liveSummary(computeView(st({ ...AREA, current: '-1 A' })))).toMatch(/^No result\./);
  });
});

describe('invalid input never gives a number', () => {
  it.each([
    [{ current: '-5 A' }],
    [{ current: '0 A' }],
    [{ current: 'NaN' }],
    [{ current: '5 V' }],
    [{ area: '-1 mm2' }],
    [{ area: '1 mm' }],
    [{ initialTemp: '1100 °C' }],
    [{ initialTemp: '-400 °C' }],
    [{ initialTemp: '25 K' }],
    [{ area: '1e400 mm2' }],
  ])('%j is an error or has no result', (p) => {
    const v = computeView(st({ ...AREA, ...p }));
    if (v.status === 'ok') {
      // 25 K is an absolute 25 K = -248 degC: below the model range, so it must not be ok with a number silently
      expect(JSON.stringify(p)).toBe(JSON.stringify({ initialTemp: '25 K' }));
      expect(v.result.details.validity.some((c) => !c.ok && !c.notChecked)).toBe(true);
    } else {
      expect(v.status).toBe('error');
    }
  });
  it('an initial temperature at or above melting is refused with the field named', () => {
    const v = computeView(st({ ...AREA, initialTemp: '1100 °C' }));
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors.initialTemp).toBeDefined();
  });
});

describe('hash state', () => {
  const full = st({
    geometry: 'trace',
    width: '2 mm',
    thickness: '1 oz/ft2',
    basis: 'nominal',
    convention: 'mass-density',
    initialTemp: '25 °C',
    mode: 'time',
    time: '0.5 s',
    specificHeat: 'pppl-293k',
    units: 'imperial',
  });
  it('round-trips through the URL hash', () => {
    const p = parseHash(serializeHash(ROUTE, toHashState(full)));
    expect(fromHashState(p.state).state).toEqual(full);
  });
  it('the default state writes nothing, and no choice is ever invented', () => {
    expect(serializeHash(ROUTE, toHashState(DEFAULT_STATE))).toBe('#/calc/fusing');
    const h = fromHashState({ a: '1 mm2' }).state;
    expect(h.geometry).toBe('');
    expect(h.mode).toBe('');
    expect(h.basis).toBe('');
    expect(h.specificHeat).toBe('');
  });
  it('writes only documented keys', () => {
    const documented = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
    for (const k of Object.keys(toHashState(full))) expect([...documented, 'u']).toContain(k);
    for (const k of WRITTEN_KEYS) expect([...documented, 'u']).toContain(k);
  });
  it('unknown values fall back to blank with notices; corrupt hashes give the defaults', () => {
    const { state, notices } = fromHashState({ gm: 'x', tb: 'y', pm: 'z', cp: 'w', cv: 'q', u: 'furlongs' });
    expect(state).toEqual(DEFAULT_STATE);
    expect(notices.length).toBeGreaterThanOrEqual(5);
    expect(fromHashState({ ta: 'x'.repeat(500) }).notices.join(' ')).toMatch(/Initial temperature/);
    expect(() => fromHashState({ __proto__: 'x', constructor: 'y' } as never)).not.toThrow();
    for (const h of ['#/calc/fusing?v=1&a=%E0%A4%A', '#/calc/fusing?v=99&a=1%20mm2', '#/calc/fusing?v=1&=&&&']) {
      expect(fromHashState(parseHash(h).state).state).toEqual(DEFAULT_STATE);
    }
  });
  it('hostile text is just text', () => {
    const { state } = fromHashState({ gm: 'area', a: '<img src=x onerror=alert(1)>', ta: '25 C', pm: 'current', i: '1 A' });
    expect(computeView(state).status).toBe('error');
  });
});

describe('page source', () => {
  it('has labelled inputs, a live region, the shared debounced state and no raw HTML', () => {
    expect(pageSrc).toMatch(/role="status" aria-live="polite" aria-atomic="true"/);
    expect(pageSrc).toMatch(/aria-label="Fusing inputs"/);
    expect(pageSrc).toMatch(/aria-labelledby="result-h"/);
    expect(pageSrc).toMatch(/useCalcState/);
    expect(pageSrc).not.toMatch(/style=|dangerouslySetInnerHTML|innerHTML|<script/);
    expect(pageSrc.match(/unitHint="/g)?.length).toBeGreaterThanOrEqual(6);
  });
  it('contains no engineering math, no fuse rating claim (the repository phrase audit covers compliance wording)', () => {
    for (const src of [vmSrc, pageSrc]) {
      expect(src).not.toMatch(/Math\.(PI|pow|sqrt|log|log10|exp)\b/);
    }
  });
});
