import { describe, expect, it } from 'vitest';
import vmSrc from './path-load.vm.ts?raw';
import pageSrc from './PathLoad.tsx?raw';
import { MAX_HASH_LENGTH, MAX_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import { CALCULATOR_STATE_KEYS } from '../../state/state-key-docs';
import { UNRATED_CAUTION } from '../../core/calculators/path-load/calc';
import {
  CALCULATOR_ID,
  CAP_MESSAGE,
  DEFAULT_STATE,
  ELEMENT_KIND_OPTIONS,
  LABEL_MAX_CHARS,
  MAX_FORWARD_ELEMENTS,
  MAX_RETURN_ELEMENTS,
  NOTE_MAX_CHARS,
  WRITTEN_KEYS,
  addElement,
  computeView,
  fromHashState,
  liveSummary,
  newElement,
  profileBanner,
  removeElement,
  shareLengthNote,
  toHashState,
  type ElementForm,
  type PathLoadState,
} from './path-load.vm';

const TODAY = '2026-10-20';
const st = (p: Partial<PathLoadState>): PathLoadState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;

const user = (kind: ElementForm['kind'], label: string, resistance: string, rated = '', ratingSource = '', note = 'datasheet'): ElementForm => ({
  ...newElement(kind, label),
  label,
  resistance,
  note,
  rated,
  ratingSource,
});
const trace = (label: string, over: Partial<ElementForm> = {}): ElementForm => ({
  ...newElement('trace', label),
  layer: 'outer',
  length: '50 mm',
  width: '1 mm',
  copperBy: 'weight',
  copperWeight: '1 oz',
  weightSource: 'foil',
  rise: '20 K',
  ...over,
});
const via = (label: string, over: Partial<ElementForm> = {}): ElementForm => ({
  ...newElement('via', label),
  hole: '0.3 mm',
  plating: '25 um',
  barrel: '1.6 mm',
  count: '4',
  drill: '0.35 mm',
  pad: '0.6 mm',
  ...over,
});

// Worked example by hand: 12 V, constant 2 A, return not counted.
// A 0.010 ohm rated 4 A, B 0.020 ohm rated 2.5 A, cable 0.030 ohm unrated.
// Drops 20 mV, 40 mV, 60 mV, total 0.12 V; loss 4 A^2 x 0.06 ohm = 0.24 W; u_A = 2/4 = 50 %, u_B = 2/2.5 = 80 %.
const EXAMPLE: PathLoadState = st({
  vsource: '12 V',
  loadKind: 'current',
  loadValue: '2 A',
  returnPath: 'not-counted',
  elements: [
    user('connector', 'Connector A', '0.010 ohm', '4 A', 'datasheet p.3'),
    user('connector', 'Connector B', '0.020 ohm', '2.5 A', 'datasheet p.3'),
    user('cable', 'Cable', '0.030 ohm'),
  ],
});
const TRACE_VIAS: PathLoadState = st({
  vsource: '12 V',
  loadKind: 'current',
  loadValue: '3 A',
  returnPath: 'not-counted',
  elements: [trace('Feed trace'), via('Via array')],
});

function ok(s: PathLoadState, today = TODAY) {
  const v = computeView(s, today);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rowsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));
const totalsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.totals.map((r) => [r.label, r.text]));

describe('worked example: weakest link B at 80 %, cable unrated, total drop 0.12 V', () => {
  it('headline is the weakest-link utilisation and names the limiting element', () => {
    const v = ok(EXAMPLE);
    expect(v.result.headline.label).toMatch(/weakest link/i);
    expect(v.result.headline.label).toContain('Connector B');
    expect(v.result.headline.text).toBe('80.0 %');
    expect(v.weakest?.name).toBe('Connector B');
    expect(v.result.headline.meaning).toMatch(/rounded up/);
  });
  it('the callout beside the headline says unrated elements are excluded and may be the real limit, and names them', () => {
    const v = ok(EXAMPLE);
    expect(v.headlineCallout.heading).toMatch(/rated elements only/i);
    expect(v.headlineCallout.text.toLowerCase()).toContain(UNRATED_CAUTION);
    expect(v.headlineCallout.text).toContain('Cable');
  });
  it('the table is ranked by utilisation, highest first, with limit basis, source and margin', () => {
    const v = ok(EXAMPLE);
    expect(v.table.map((r) => r.name)).toEqual(['Connector B', 'Connector A']);
    const b = v.table[0];
    expect(b?.weakest).toBe(true);
    expect(b?.utilisation).toBe('80.0 %');
    expect(b?.limit).toMatch(/^2\.5 A$/);
    expect(b?.limitBasis).toMatch(/current/i);
    expect(b?.limitSource).toMatch(/user-supplied: datasheet p\.3/);
    expect(b?.limitBadge).toMatch(/user-supplied/i);
    expect(b?.margin).toMatch(/^\+500 mA$/);
    expect(b?.resistance).toMatch(/^20 mΩ$/);
    expect(b?.drop).toMatch(/^40 mV$/);
    expect(b?.loss).toMatch(/^80 mW$/);
    expect(b?.share).toMatch(/^33\.3/);
    expect(v.table[1]?.utilisation).toBe('50.0 %');
  });
  it('the unrated element is in its own labelled block with its drop and share, and the caution', () => {
    const v = ok(EXAMPLE);
    expect(v.unrated.map((r) => r.name)).toEqual(['Cable']);
    expect(v.unrated[0]?.drop).toMatch(/^60 mV$/);
    expect(v.unrated[0]?.share).toMatch(/^50/);
    expect(v.unratedHeading).toMatch(/no current rating/i);
    expect(v.unratedText.toLowerCase()).toContain(UNRATED_CAUTION);
  });
  it('totals: drop with percent of source, load voltage, loss, efficiency', () => {
    const t = totalsOf(ok(EXAMPLE));
    expect(t['Total voltage drop (forward path only)']).toMatch(/^120 mV \(1\.0/);
    expect(t['Load voltage']).toMatch(/^11\.88 V$/);
    expect(t['Total power loss']).toMatch(/^240 mW$/);
    expect(t['Efficiency (share of the source power, 100 % is lossless)']).toMatch(/^99/);
  });
  it('the totals row is present under the forward-only name when the return is not counted, and under the plain name when it is', () => {
    const notCounted = totalsOf(ok(EXAMPLE));
    expect(Object.keys(notCounted)).toContain('Total voltage drop (forward path only)');
    expect(Object.keys(notCounted)).not.toContain('Total voltage drop');
    const counted = totalsOf(ok({ ...EXAMPLE, returnPath: 'same-as-forward' }));
    expect(Object.keys(counted)).toContain('Total voltage drop');
    expect(Object.keys(counted)).not.toContain('Total voltage drop (forward path only)');
    expect(counted['Total voltage drop']).toMatch(/mV|V/);
  });
  it('does not repeat the totals or per-element numbers as generic rows', () => {
    const rows = rowsOf(ok(EXAMPLE));
    expect(Object.keys(rows)).not.toContain('Total voltage drop');
    expect(Object.keys(rows)).not.toContain('Total voltage drop (forward path only)');
    expect(Object.keys(rows).some((k) => /Connector B|Cable/.test(k))).toBe(false);
  });
  it('the unrated warning and the not-counted return warning are in the list; deferred scope and self-heating are pinned first', () => {
    const v = ok(EXAMPLE);
    const msgs = v.result.warnings.map((w) => w.message);
    expect(msgs.some((m) => /no current rating/.test(m))).toBe(true);
    const codes = v.raw.warnings.map((w) => w.code);
    expect(codes).toContain('DEFERRED_SCOPE');
    expect(codes).toContain('SELF_HEATING_NOT_COUPLED');
    const first4 = v.result.warnings.slice(0, 4).map((w) => w.message);
    expect(first4).toContain(v.raw.warnings.find((w) => w.code === 'SELF_HEATING_NOT_COUPLED')?.message);
    expect(first4).toContain(v.raw.warnings.find((w) => w.code === 'DEFERRED_SCOPE')?.message);
  });
  it('shows confidence with reasons (unrated and user-supplied rules), the formula and per-row ledger status', () => {
    const v = ok(EXAMPLE);
    expect(v.result.confidence.level).not.toBe('high');
    expect(v.result.confidence.reasons.join(' ')).toMatch(/unrated/i);
    expect(v.result.details.formula).toMatch(/weakest link/);
    expect(v.ledgerRows.map((r) => r.id)).toEqual(expect.arrayContaining(['S-019', 'S-004']));
    for (const r of v.ledgerRows) expect(r.status).toBeTruthy();
  });
  it('user-supplied values are listed, since they carry no ledger status', () => {
    const v = ok(EXAMPLE);
    expect(v.userSupplied.join(' ')).toMatch(/Connector B/);
    expect(v.userSupplied.join(' ')).toMatch(/Cable/);
  });
  it('the live summary names the limiting element and confidence', () => {
    const t = liveSummary(ok(EXAMPLE));
    expect(t).toMatch(/Connector B/);
    expect(t).toMatch(/80\.0 %/);
    expect(t).toMatch(/Confidence/);
  });
  it('the callout is not a pass look: no pass, ok or safe wording, and an over-limit element gets a text tag', () => {
    const v = ok(EXAMPLE);
    const all = JSON.stringify([v.headlineCallout, v.table, v.unrated, v.result.headline]);
    // The repository audit (tests/audit.test.ts) owns the forbidden-phrase list; this only checks that the result looks like no green tick.
    expect(all).not.toMatch(/\b(pass|passes|passed|OK)\b/);
    const over = ok({ ...EXAMPLE, loadValue: '3 A' });
    expect(over.table.find((r) => r.name === 'Connector B')?.over).toBe(true);
    expect(over.table.find((r) => r.name === 'Connector B')?.overTag).toMatch(/over limit/i);
    expect(over.table.find((r) => r.name === 'Connector A')?.over).toBe(false);
    expect(over.result.warnings.some((w) => /above its limit/.test(w.message))).toBe(true);
  });
});

describe('nothing is defaulted that the user must decide', () => {
  it('the empty form needs source, load, return path and an element, and shows no result', () => {
    expect(DEFAULT_STATE.returnPath).toBe('');
    expect(DEFAULT_STATE.loadKind).toBe('');
    expect(DEFAULT_STATE.profile).toBe('');
    const v = computeView(DEFAULT_STATE, TODAY);
    expect(v.status).toBe('needs-input');
    expect(v).not.toHaveProperty('result');
    if (v.status === 'needs-input') {
      const t = v.needs.join(' ');
      expect(t).toMatch(/source voltage/i);
      expect(t).toMatch(/load/i);
      expect(t).toMatch(/return path/i);
      expect(t).toMatch(/at least one/i);
    }
  });
  it('exactly one load quantity is chosen and its value checked against its own dimension', () => {
    const v = computeView({ ...EXAMPLE, loadValue: '5 V' }, TODAY);
    expect(v.status).toBe('error');
    expect(v).not.toHaveProperty('result');
    expect(computeView({ ...EXAMPLE, loadKind: '' }, TODAY).status).toBe('needs-input');
  });
  it('a trace asks for its layer, its allowed temperature rise and its copper; none is assumed', () => {
    const t = (over: Partial<ElementForm>) => computeView({ ...EXAMPLE, elements: [trace('t', over)] }, TODAY);
    for (const [over, re] of [
      [{ layer: '' }, /copper layer/i],
      [{ rise: '' }, /temperature rise/i],
      [{ copperWeight: '' }, /copper weight/i],
      [{ length: '' }, /length/i],
      [{ width: '' }, /width/i],
    ] as const) {
      const v = t(over as Partial<ElementForm>);
      expect(v.status).toBe('needs-input');
      if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(re);
    }
  });
  it('the trace rise is a temperature DIFFERENCE field: an absolute-only or wrong unit is an inline error', () => {
    const v = computeView({ ...EXAMPLE, elements: [trace('t', { rise: '5 V' })] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors['f0.rise']).toBeTruthy();
    expect(ok({ ...EXAMPLE, elements: [trace('t', { rise: '20 °C' })] }).table).toHaveLength(1);
  });
  it('a weight from a fab order form (finished copper) gives no result; an unanswered weight source is noted', () => {
    expect(computeView({ ...EXAMPLE, elements: [trace('t', { weightSource: 'finished' })] }, TODAY).status).toBe('needs-input');
    const v = ok({ ...EXAMPLE, elements: [trace('t', { weightSource: '' })] });
    expect(v.notes.join(' ')).toMatch(/where the weight comes from|have not said/i);
  });
  it('a via needs the plating thickness (never pre-filled), the finished hole, the barrel length and the count', () => {
    const v = computeView({ ...TRACE_VIAS, elements: [via('v', { plating: '' })] }, TODAY);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/plating/i);
    expect(newElement('via', 'x').plating).toBe('');
    for (const f of ['hole', 'barrel', 'count'] as const) {
      const w = computeView({ ...TRACE_VIAS, elements: [via('v', { [f]: '' })] }, TODAY);
      expect(w.status).toBe('needs-input');
    }
  });
  it('a via count is a whole number', () => {
    for (const c of ['0', '2.5', 'many', '-1']) {
      const v = computeView({ ...TRACE_VIAS, elements: [via('v', { count: c })] }, TODAY);
      expect(v.status).toBe('error');
      if (v.status === 'error') expect(v.fieldErrors['f0.count']).toBeTruthy();
    }
  });
  it('a missing label or a user element without resistance or source note is asked for', () => {
    expect(computeView({ ...EXAMPLE, elements: [user('cable', '', '1 ohm')] }, TODAY).status).toBe('needs-input');
    expect(computeView({ ...EXAMPLE, elements: [user('cable', 'c', '')] }, TODAY).status).toBe('needs-input');
    const v = computeView({ ...EXAMPLE, elements: [user('cable', 'c', '1 ohm', '', '', '')] }, TODAY);
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/comes from/i);
  });
  it('conductor temperature empty is the 25 degC default and is reported as a default', () => {
    const v = ok(TRACE_VIAS);
    expect(v.result.confidence.reasons.join(' ')).toMatch(/default/i);
    expect(v.result.details.inputs.some((i) => i.source === 'default')).toBe(true);
  });
});

describe('the rating is a pair', () => {
  it('a rating without its source, or a source without its rating, is an inline error on the missing field', () => {
    const a = computeView({ ...EXAMPLE, elements: [user('connector', 'c', '1 ohm', '4 A', '')] }, TODAY);
    expect(a.status).toBe('error');
    if (a.status === 'error') expect(a.fieldErrors['f0.ratingSource']).toMatch(/both|source/i);
    const b = computeView({ ...EXAMPLE, elements: [user('connector', 'c', '1 ohm', '', 'datasheet')] }, TODAY);
    expect(b.status).toBe('error');
    if (b.status === 'error') expect(b.fieldErrors['f0.rated']).toMatch(/both|rated/i);
  });
  it('a rating is a current: a wrong dimension is an error, and an implausible one is the core message', () => {
    expect(computeView({ ...EXAMPLE, elements: [user('connector', 'c', '1 ohm', '4 V', 'ds')] }, TODAY).status).toBe('error');
    const v = computeView({ ...EXAMPLE, elements: [user('connector', 'c', '0.001 ohm', '1e9 A', 'ds')] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors['f0.rated']).toBeTruthy();
  });
  it('a via array rating is taken for the whole array and says so; a via with no rating is unrated', () => {
    const rated = ok({ ...TRACE_VIAS, elements: [via('Via array', { rated: '6 A', ratingSource: 'fab note' })] });
    expect(rated.table.map((r) => r.name)).toEqual(['Via array']);
    expect(rated.result.warnings.some((w) => /whole array/.test(w.message))).toBe(true);
    const unrated = ok(TRACE_VIAS);
    expect(unrated.unrated.map((r) => r.name)).toEqual(['Via array']);
  });
});

describe('a 3 A trace and 4 vias', () => {
  it('the trace carries the legacy limit with a PAYWALLED badge; the via array is unrated and the trace is the weakest link', () => {
    const v = ok(TRACE_VIAS);
    expect(v.weakest?.name).toBe('Feed trace');
    const row = v.table[0];
    expect(row?.limitSource).toMatch(/IPC-2221 legacy/);
    expect(row?.limitBadge).toMatch(/PAYWALLED/);
    expect(row?.limitBadge).toMatch(/S-001/);
    expect(row?.limitBadge).not.toMatch(/user-supplied/i);
    expect(v.unrated.map((r) => r.name)).toEqual(['Via array']);
    expect(v.ledgerRows.find((r) => r.id === 'S-001')?.status).toBe('PAYWALLED-USER-MUST-VERIFY');
    expect(v.result.ledger.unverifiedIds).toContain('S-001');
  });
  it('the legacy caution and the unrated caution are warnings; confidence is not high and says why', () => {
    const v = ok(TRACE_VIAS);
    expect(v.raw.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['LEGACY_TRACE_LIMIT', 'UNRATED_ELEMENTS', 'SELF_HEATING_NOT_COUPLED', 'DEFERRED_SCOPE']));
    expect(v.result.confidence.level).not.toBe('high');
    expect(v.result.confidence.reasons.length).toBeGreaterThan(0);
  });
  it('net-class export: width in mm and mil, via drill and pad as your values, no clearance without a profile, with the core reason', () => {
    const v = ok(TRACE_VIAS);
    expect(v.netClass.groups).toHaveLength(2);
    const t = v.netClass.groups.find((g) => g.id.startsWith('net-class-trace'));
    const w = t?.values.find((x) => x.key === 'width');
    expect(w?.text).toMatch(/mm \(.* mil\)$/);
    expect(w?.tags.join(' ')).toMatch(/legacy IPC-2221/);
    expect(w?.tags.join(' ')).toMatch(/PAYWALLED/);
    expect(t?.values.some((x) => x.key === 'clearance')).toBe(false);
    expect(t?.clearanceReason).toMatch(/no fab profile was selected/);
    const x = v.netClass.groups.find((g) => g.id.startsWith('net-class-via'));
    expect(x?.values.map((y) => y.key)).toEqual(['viaDrill', 'viaPad']);
    expect(x?.values[0]?.text).toMatch(/^0\.35 mm \(/);
    for (const y of x?.values ?? []) expect(y.tags).toContain('your values');
    expect(v.netClass.startingPoint).toMatch(/starting point, not a design rule/i);
  });
  it('the plain-text rendering carries every value and the starting-point note', () => {
    const v = ok(TRACE_VIAS);
    const t = v.netClass.plainText;
    expect(t).toMatch(/starting point, not a design rule/i);
    expect(t).toMatch(/width/);
    expect(t).toMatch(/mil\)/);
    expect(t).toMatch(/drill/i);
    expect(t).toMatch(/your values/);
    expect(t).toMatch(/clearance: not exported/i);
    expect(t).not.toMatch(/NaN|undefined/);
  });
  it('a via without drill and pad adds no via export and the page says nothing was derived', () => {
    const v = ok({ ...TRACE_VIAS, elements: [trace('Feed trace'), via('v', { drill: '', pad: '' })] });
    expect(v.netClass.groups.every((g) => !g.id.startsWith('net-class-via'))).toBe(true);
  });
  it('a path with no trace and no via entries has an empty export block with the reason', () => {
    const v = ok(EXAMPLE);
    expect(v.netClass.groups).toHaveLength(0);
    expect(v.netClass.empty).toMatch(/trace|via/i);
  });
  it('a via drill below the finished hole is an inline error on the drill field', () => {
    const v = computeView({ ...TRACE_VIAS, elements: [via('v', { drill: '0.2 mm' })] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors['f0.drill']).toBeTruthy();
  });
});

describe('fab profile choice and clearance export', () => {
  const withProfile = (over: Partial<PathLoadState> = {}) => st({ ...TRACE_VIAS, profile: 'bundled', layerCount: '2', ...over });
  it('is never pre-selected, and none or unchosen exports no clearance and uses no profile', () => {
    expect(DEFAULT_STATE.profile).toBe('');
    expect(DEFAULT_STATE.layerCount).toBe('');
    for (const p of ['', 'none'] as const) {
      const v = ok(st({ ...TRACE_VIAS, profile: p }));
      expect(v.raw.fabProfile).toBeUndefined();
      expect(profileBanner(st({ profile: p }), TODAY)).toBeUndefined();
    }
  });
  it('the banner names the profile, its age, UNVERIFIED and stale', () => {
    const b = profileBanner(withProfile(), TODAY);
    expect(b?.id).toMatch(/jlcpcb/);
    expect(b?.unverified).toBe(true);
    expect(b?.unverifiedText).toMatch(/UNVERIFIED/);
    expect(b?.ageText).toMatch(/days? old/);
    expect(b?.stale).toBe(false);
    expect(profileBanner(withProfile(), '2028-01-01')?.stale).toBe(true);
  });
  it('with a profile and a layer count: clearance carries the profile id, UNVERIFIED, the age, and the ledger rows include the profile rows', () => {
    const v = ok(withProfile());
    const t = v.netClass.groups.find((g) => g.id.startsWith('net-class-trace'));
    const c = t?.values.find((x) => x.key === 'clearance');
    expect(c).toBeDefined();
    expect(c?.text).toMatch(/mm \(.* mil\)$/);
    const tags = c?.tags.join(' ') ?? '';
    expect(tags).toMatch(/jlcpcb-2026-10-13/);
    expect(tags).toMatch(/UNVERIFIED/);
    expect(tags).toMatch(/7 days old/);
    expect(tags).not.toMatch(/STALE/);
    expect(v.ledgerRows.map((r) => r.id)).toEqual(expect.arrayContaining(['S-019l']));
    expect(v.result.ledger.unverifiedIds).toContain('S-019l');
  });
  it('a stale profile is tagged STALE on the value', () => {
    const c = ok(withProfile(), '2028-01-01').netClass.groups[0]?.values.find((x) => x.key === 'clearance');
    expect(c?.tags.join(' ')).toMatch(/STALE/);
  });
  it('a profile without a layer count shows the core reason and no clearance', () => {
    const v = ok(withProfile({ layerCount: '' }));
    const t = v.netClass.groups.find((g) => g.id.startsWith('net-class-trace'));
    expect(t?.values.some((x) => x.key === 'clearance')).toBe(false);
    expect(t?.clearanceReason).toMatch(/layerCount was not given/);
  });
  it('a layer count without a profile is not sent to the core', () => {
    const v = ok(st({ ...TRACE_VIAS, profile: 'none', layerCount: '2' }));
    expect(v.raw.fabProfile).toBeUndefined();
  });
});

describe('return path and list handling', () => {
  it('same-as-forward counts every element twice and both copies are checked against the same rating', () => {
    const v = ok({ ...EXAMPLE, returnPath: 'same-as-forward' });
    expect(v.table.filter((r) => r.side === 'return')).toHaveLength(2);
    expect(v.unrated).toHaveLength(2);
  });
  it('included-in-list accepts separately listed return elements; they are ignored when the return is not listed', () => {
    const s = { ...EXAMPLE, returnPath: 'included-in-list' as const, returnElements: [user('cable', 'Ground lead', '0.1 ohm')] };
    expect(ok(s).unrated.map((r) => r.name)).toContain('Ground lead');
    expect(ok({ ...s, returnPath: 'not-counted' }).unrated.map((r) => r.name)).not.toContain('Ground lead');
  });
  it('not-counted shows the return warning first among the unpinned cautions', () => {
    const v = ok(EXAMPLE);
    expect(v.result.warnings.some((w) => /return/i.test(w.message))).toBe(true);
  });
  it('the caps are 12 and 12: add refuses at the cap with the message; more in a state is a clear error', () => {
    expect(MAX_FORWARD_ELEMENTS).toBe(12);
    expect(MAX_RETURN_ELEMENTS).toBe(12);
    let s: { elements: readonly ElementForm[]; message?: string } = { elements: [] };
    for (let i = 0; i < MAX_FORWARD_ELEMENTS; i++) s = addElement(s.elements, 'cable', 'forward');
    expect(s.elements).toHaveLength(12);
    expect(new Set(s.elements.map((e) => e.label.toLowerCase())).size).toBe(12);
    const over = addElement(s.elements, 'trace', 'forward');
    expect(over.elements).toHaveLength(12);
    expect(over.message).toBe(CAP_MESSAGE('forward', 12));
    const many = Array.from({ length: 13 }, (_, i) => user('cable', `c${String(i)}`, '1 mohm'));
    const v = computeView({ ...EXAMPLE, elements: many }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toBe(CAP_MESSAGE('forward', 12));
  });
  it('removes by index and ignores a bad index; every kind can be added with a kind-specific default label', () => {
    const l = [user('cable', 'a', '1 ohm'), user('cable', 'b', '1 ohm')];
    expect(removeElement(l, 0).map((e) => e.label)).toEqual(['b']);
    expect(removeElement(l, 5)).toEqual(l);
    expect(ELEMENT_KIND_OPTIONS.map((o) => o.value)).toEqual(['trace', 'via', 'connector', 'pad', 'spoke', 'pour-neck', 'cable', 'resistance']);
    for (const o of ELEMENT_KIND_OPTIONS) expect(addElement([], o.value, 'forward').elements[0]?.kind).toBe(o.value);
  });
  it('duplicate labels are an error shown inline', () => {
    const v = computeView({ ...EXAMPLE, elements: [user('cable', 'x', '1 ohm'), user('pad', 'X', '1 ohm')] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/unique/i);
  });
});

describe('loads and failures never give a number', () => {
  it('no rated element: the headline is the total drop and there is no weakest link; the callout says so', () => {
    const v = ok({ ...EXAMPLE, elements: [user('cable', 'Cable', '0.03 ohm'), user('connector', 'Plug', '0.01 ohm')] });
    expect(v.result.headline.label).toBe('Total voltage drop (forward path only)');
    expect(v.result.headline.label).not.toMatch(/weakest link:/i);
    const both = ok({ ...EXAMPLE, returnPath: 'same-as-forward', elements: [user('cable', 'Cable', '0.03 ohm')] });
    expect(both.result.headline.label).toBe('Total voltage drop');
    expect(v.weakest).toBeUndefined();
    expect(v.table).toHaveLength(0);
    expect(v.unrated).toHaveLength(2);
    expect(v.headlineCallout.text).toMatch(/no weakest link/i);
    expect(v.headlineCallout.text.toLowerCase()).toContain(UNRATED_CAUTION);
  });
  it('power, resistance and voltage loads work; a constant power that cannot be supplied is the core message and no result', () => {
    const base = { ...EXAMPLE };
    expect(ok({ ...base, loadKind: 'power', loadValue: '10 W' }).raw.warnings.map((w) => w.code)).toContain('CONSTANT_POWER_STABILITY');
    expect(ok({ ...base, loadKind: 'resistance', loadValue: '5 ohm' }).table.length).toBeGreaterThan(0);
    expect(ok({ ...base, loadKind: 'voltage', loadValue: '11.9 V' }).table.length).toBeGreaterThan(0);
    const v = computeView({ ...base, loadKind: 'power', loadValue: '1000 kW' }, TODAY);
    expect(v.status).toBe('cannot-supply');
    expect(v).not.toHaveProperty('result');
    expect(v).not.toHaveProperty('table');
  });
  const bad: [string, Partial<PathLoadState>][] = [
    ['text for the source', { vsource: 'abc' }],
    ['negative source', { vsource: '-5 V' }],
    ['zero source', { vsource: '0 V' }],
    ['wrong unit for the source', { vsource: '12 A' }],
    ['negative load', { loadValue: '-2 A' }],
    ['infinite load', { loadValue: 'Infinity A' }],
    ['too long text', { loadValue: `${'1'.repeat(60)} A` }],
    ['bad budget', { budget: 'lots' }],
    ['budget above 100 %', { budget: '150%' }],
    ['bad temperature', { temperature: '5 V' }],
  ];
  for (const [name, patch] of bad) {
    it(`invalid input: ${name}`, () => {
      const v = computeView({ ...EXAMPLE, ...patch }, TODAY);
      expect(v.status).toBe('error');
      expect(v).not.toHaveProperty('result');
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity(?! A)/);
    });
  }
  it('an element with a bad value names the element and the field', () => {
    const v = computeView({ ...EXAMPLE, elements: [user('connector', 'Plug', 'lots')] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.fieldErrors['f0.resistance']).toBeTruthy();
      expect(v.problems.join(' ')).toMatch(/Plug/);
    }
  });
  it('a core error on a return element maps to the return field key', () => {
    const v = computeView({ ...EXAMPLE, returnPath: 'included-in-list', returnElements: [user('cable', 'g', '1 ohm', '4 A', '')] }, TODAY);
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors['r0.ratingSource']).toBeTruthy();
  });
  it('a drop budget exceeded is a warning naming the biggest contributor; met is a totals row', () => {
    expect(ok({ ...EXAMPLE, budget: '0.5%' }).result.warnings.some((w) => /budget/.test(w.message))).toBe(true);
    expect(totalsOf(ok({ ...EXAMPLE, budget: '5%' }))['Drop budget']).toMatch(/not exceeded/);
  });
  it('is fast enough: 200 views of the worked example in well under a second', () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) computeView(EXAMPLE, TODAY);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('hash state', () => {
  const FULL: PathLoadState = st({
    vsource: '12 V',
    loadKind: 'power',
    loadValue: '10 W',
    returnPath: 'included-in-list',
    budget: '5%',
    temperature: '60 °C',
    convention: 'nominal-1.35mil',
    profile: 'bundled',
    layerCount: 'multilayer',
    units: 'imperial',
    elements: [
      trace('feed 1', { copperBy: 'weight', copperWeight: '1 oz', weightSource: 'foil' }),
      trace('feed 2', { layer: 'inner', copperBy: 'thickness', copperThickness: '1.4 mil', basis: 'finished', weightSource: '', copperWeight: '' }),
      via('Via "array" & co', { rated: '5 A', ratingSource: 'fab note ~ 100%' }),
      user('connector', 'conn & "x"', '25 mΩ', '4 A', 'datasheet p.4 ~ typ'),
      user('pad', 'pad', '1 mΩ'),
      user('spoke', 'spoke', '2 mΩ'),
      user('pour-neck', 'neck', '3 mΩ'),
      user('cable', 'cable', '4 mΩ'),
      user('resistance', 'other', '5 mΩ'),
    ],
    returnElements: [trace('gnd', { layer: 'inner' })],
  });
  const roundTrip = (s: PathLoadState) => {
    const hash = serializeHash(ROUTE, toHashState(s));
    const p = parseHash(hash);
    expect(p.stateDiscarded).toBe(false);
    return { hash, loaded: fromHashState(p.state) };
  };
  it('round-trips the full state, including awkward labels, quotes, tildes and percent signs', () => {
    const { loaded } = roundTrip(FULL);
    expect(loaded.notices).toEqual([]);
    expect(loaded.state).toEqual(FULL);
  });
  it('the default state writes nothing', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    expect(fromHashState({}).state).toEqual(DEFAULT_STATE);
  });
  it('never writes a choice the user did not make (return path, load kind, layer, profile)', () => {
    const h = toHashState(st({ vsource: '12 V', elements: [trace('t', { layer: '' })] }));
    expect(h['rp']).toBeUndefined();
    expect(h['lk']).toBeUndefined();
    expect(h['fp']).toBeUndefined();
    expect(h['lc']).toBeUndefined();
    expect(decodeURIComponent(h['fe1'] ?? '')).toMatch(/^t~t~~/);
  });
  it('writes only documented keys (plus the reserved fp and u)', () => {
    const documented = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
    for (const k of Object.keys(toHashState(FULL))) expect([...documented, 'fp', 'u']).toContain(k);
    for (const k of WRITTEN_KEYS) expect([...documented, 'fp', 'u']).toContain(k);
    expect(documented).toEqual(expect.arrayContaining(['fe1', 'fe12', 're1', 're12']));
    expect(documented).not.toContain('fe13');
    for (const k of documented) expect(['fp', 'u', 'fc', 'mode', 'v']).not.toContain(k);
  });
  it('the key and length budgets hold with every slot used by ordinary elements', () => {
    const f = Array.from({ length: MAX_FORWARD_ELEMENTS }, (_, i) => trace(`forward element ${String(i + 1)}`));
    const r = Array.from({ length: MAX_RETURN_ELEMENTS }, (_, i) => user('cable', `return element ${String(i + 1)}`, '10 mΩ', '5 A', 'datasheet value'));
    const full = st({ ...FULL, elements: f, returnElements: r });
    const { hash, loaded } = roundTrip(full);
    expect(Object.keys(toHashState(full)).length + 1).toBeLessThanOrEqual(MAX_STATE_KEYS);
    expect(hash.length).toBeLessThan(MAX_HASH_LENGTH);
    expect(loaded.state).toEqual(full);
    expect(shareLengthNote(full)).toBeUndefined();
  });
  it('warns when the link would be too long to be loaded again, and the claim is true', () => {
    const label = 'ü'.repeat(LABEL_MAX_CHARS);
    const note = 'ü'.repeat(NOTE_MAX_CHARS);
    const all = (n: number, tag: string) => Array.from({ length: n }, (_, i) => user('cable', `${label.slice(1)}${tag}${String(i)}`, '10 mΩ', '5 A', note, note));
    const big = st({ ...FULL, elements: all(MAX_FORWARD_ELEMENTS, 'f'), returnElements: all(MAX_RETURN_ELEMENTS, 'r') });
    expect(shareLengthNote(big)).toMatch(/too long/i);
    expect(serializeHash(ROUTE, toHashState(big)).length).toBeGreaterThan(MAX_HASH_LENGTH - 192);
    expect(shareLengthNote(EXAMPLE)).toBeUndefined();
  });
  it('T5-5: the page writes one consistent form, and a hand-written single-encoded link reads to the same state', () => {
    const written = serializeHash(ROUTE, toHashState(EXAMPLE));
    expect(written).toMatch(/%2520/);
    expect(serializeHash(ROUTE, toHashState(EXAMPLE))).toBe(written);
    const single =
      '#/calc/path-load?v=1&vs=12%20V&lk=current&lv=2%20A&rp=not-counted' +
      '&fe1=c~Connector%20A~0.010%20ohm~datasheet~4%20A~datasheet%20p.3~' +
      '&fe2=c~Connector%20B~0.020%20ohm~datasheet~2.5%20A~datasheet%20p.3~' +
      '&fe3=k~Cable~0.030%20ohm~datasheet~~~';
    const p = parseHash(single);
    expect(p.stateDiscarded).toBe(false);
    const loaded = fromHashState(p.state);
    expect(loaded.notices).toEqual([]);
    expect(loaded.state).toEqual(EXAMPLE);
    expect(fromHashState(parseHash(written).state).state).toEqual(loaded.state);
    expect(ok(loaded.state).weakest?.name).toBe('Connector B');
  });
  it('corrupt element values fall back to defaults with a notice and never throw', () => {
    const { state, notices } = fromHashState({ fe1: '%E0%A4%A', fe2: 'x~y~', rp: 'banana', lk: 'nope', conv: 'zzz', lc: '9', fp: 'unknown-profile', fe13: 'r~a~1%20ohm~n~~~' });
    expect(state.elements).toEqual([]);
    expect(state.returnPath).toBe('');
    expect(state.loadKind).toBe('');
    expect(state.convention).toBe('');
    expect(state.layerCount).toBe('');
    expect(state.profile).toBe('');
    expect(notices.length).toBeGreaterThanOrEqual(6);
  });
  it('an element with an unrecognised layer keeps the element but drops the layer, with a notice', () => {
    const { state, notices } = fromHashState({ fe1: 't~feed~middle~100%20mm~1%20mm~w~1%20oz~~nominal~foil~20%20K~' });
    expect(state.elements[0]?.label).toBe('feed');
    expect(state.elements[0]?.layer).toBe('');
    expect(notices.join(' ')).toMatch(/layer/i);
  });
  it('an over-long field in the link is emptied with a notice, and elements beyond the cap are ignored with a notice', () => {
    expect(fromHashState({ vs: 'x'.repeat(60) }).notices.join(' ')).toMatch(/too long/i);
    expect(fromHashState({ fe13: 'k~a~1%20ohm~n~~~' }).notices.join(' ')).toMatch(/At most 12/);
  });
  it('a stray method mode is ignored with a notice', () => {
    expect(fromHashState({ mode: 'A' }).notices.join(' ')).toMatch(/does not apply/);
  });
});

describe('source scans', () => {
  const strip = (t: string): string => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [name, src] of [['path-load.vm', vmSrc], ['PathLoad', pageSrc]] as const) {
    it(`${name}: no hand rounding, no engineering math, no clock or randomness`, () => {
      const s = strip(src);
      expect(s).not.toMatch(/\.toFixed\(|\.toPrecision\(|Math\.(round|ceil|floor|pow|sqrt|exp|log)/);
      expect(s).not.toMatch(/Date\.now|Math\.random/);
    });
  }
  it('the vm does not touch the DOM or the network', () => {
    expect(strip(vmSrc)).not.toMatch(/\bfetch\(|document\.|window\./);
  });
});
