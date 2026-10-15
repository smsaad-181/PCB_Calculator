import { describe, expect, it } from 'vitest';
import vmSrc from './voltage-drop.vm.ts?raw';
import pageSrc from './VoltageDrop.tsx?raw';
import { CALCULATOR_STATE_KEYS, MAX_HASH_LENGTH, MAX_STATE_KEYS, parseHash, serializeHash } from '../../state/hash';
import {
  CALCULATOR_ID,
  CAP_MESSAGE,
  DEFAULT_STATE,
  LABEL_MAX_CHARS,
  NOTE_MAX_CHARS,
  MAX_RETURN_ELEMENTS,
  MAX_FORWARD_ELEMENTS,
  RETURN_PATH_OPTIONS,
  WRITTEN_KEYS,
  addElement,
  computeView,
  liveSummary,
  fromHashState,
  newElement,
  removeElement,
  shareLengthNote,
  toHashState,
  type ElementForm,
  type VoltageDropState,
} from './voltage-drop.vm';

const st = (p: Partial<VoltageDropState>): VoltageDropState => ({ ...DEFAULT_STATE, ...p });
const ROUTE = { name: 'calc', id: CALCULATOR_ID } as const;
const res = (label: string, resistance: string, note = 'datasheet'): ElementForm => ({
  ...newElement('resistance', label),
  label,
  resistance,
  note,
});
const trace = (label: string, over: Partial<ElementForm> = {}): ElementForm => ({
  ...newElement('trace', label),
  layer: 'outer',
  length: '100 mm',
  width: '1 mm',
  copperBy: 'thickness',
  copperThickness: '35 um',
  ...over,
});

const EXAMPLE: VoltageDropState = st({
  vsource: '12 V',
  loadKind: 'resistance',
  loadValue: '10 ohm',
  returnPath: 'not-counted',
  elements: [res('cable', '0.5 ohm'), res('connector', '0.25 ohm')],
});

function ok(s: VoltageDropState) {
  const v = computeView(s);
  if (v.status !== 'ok') throw new Error(`expected ok, got ${v.status}: ${JSON.stringify(v)}`);
  return v;
}
const rowsOf = (v: ReturnType<typeof ok>) => Object.fromEntries(v.result.rows.map((r) => [r.label, r.text]));

describe('worked example (12 V, 10 ohm load, cable 0.5 ohm, connector 0.25 ohm, return not counted)', () => {
  it('headline is the plain total drop when the return path is counted', () => {
    const v = ok({ ...EXAMPLE, returnPath: 'same-as-forward' });
    expect(v.result.headline.label).toBe('Total voltage drop');
    expect(v.result.headline.text).toMatch(/mV|V/);
  });
  it('the live summary says Largest-drop element, never Limiting', () => {
    const v = ok(EXAMPLE);
    expect(liveSummary(v)).toMatch(/Largest-drop element cable/);
    expect(liveSummary(v)).not.toMatch(/Limiting/);
  });
  it('headline is the total drop with its percent of the source', () => {
    const v = ok(EXAMPLE);
    expect(v.result.headline.label).toBe('Total voltage drop (forward path only)');
    expect(v.result.headline.text).toMatch(/^837\.3 mV \(6\.977 %\)$/);
    expect(v.result.headline.meaning).toMatch(/rounded up/);
  });
  it('rows: load voltage, current, loss, power delivered, efficiency, path resistance, source power', () => {
    const rows = rowsOf(ok(EXAMPLE));
    expect(rows['Load voltage']).toMatch(/^11\.16 V$/);
    expect(rows['Load current']).toMatch(/^1\.117 A$/);
    expect(rows['Total power loss']).toMatch(/^934\.6 mW$/);
    expect(rows['Power delivered to the load']).toMatch(/W$/);
    expect(rows['Efficiency (share of the source power, 100 % is lossless)']).toBe('93.02 %');
    expect(rows['Total path resistance']).toMatch(/^750 mΩ$|^0\.75 Ω$/);
    expect(rows['Source power']).toMatch(/W$/);
  });
  it('element table lists both elements; the cable is the limiting element', () => {
    const v = ok(EXAMPLE);
    expect(v.table.map((r) => r.name)).toEqual(['cable', 'connector']);
    expect(v.limiting.name).toBe('cable');
    expect(v.table.find((r) => r.name === 'cable')?.limiting).toBe(true);
    expect(v.table.find((r) => r.name === 'connector')?.limiting).toBe(false);
    expect(v.table[0]?.provenance).toMatch(/user-supplied/);
    expect(v.table[0]?.share).toMatch(/^66\.67 %$/);
    expect(v.table[0]?.resistance).toMatch(/Ω$/);
    expect(v.table[0]?.drop).toMatch(/V$/);
    expect(v.table[0]?.loss).toMatch(/W$/);
  });
  it('user-supplied resistances are marked as such in the inputs echo, with their source note', () => {
    const v = ok(EXAMPLE);
    const row = v.result.details.inputs.find((i) => i.label.toLowerCase().includes('cable'));
    expect(row?.source).toBe('user');
    expect(row?.detail).toMatch(/user-supplied/);
    expect(row?.detail).toMatch(/datasheet/);
  });
  it('the path scope caution is the callout beside the headline and is not repeated in the warning list', () => {
    const v = ok(EXAMPLE);
    expect(v.callout.heading).toMatch(/covers/i);
    expect(v.callout.text).toBe(v.raw.warnings.find((w) => w.code === 'PATH_SCOPE')?.message);
    expect(v.result.warnings.some((w) => w.message === v.callout.text)).toBe(false);
  });
  it('a constant-power load shows the CONSTANT_POWER_STABILITY caution in the warning list', () => {
    const v = ok(st({ ...EXAMPLE, loadKind: 'power', loadValue: '10 W' }));
    const w = v.raw.warnings.find((x) => x.code === 'CONSTANT_POWER_STABILITY');
    expect(w?.severity).toBe('caution');
    expect(v.result.warnings.some((x) => x.message === w?.message)).toBe(true);
    expect(v.result.warnings.some((x) => /stab/i.test(x.message))).toBe(true);
  });
  it('the not-counted return path caution is the first warning', () => {
    const v = ok(EXAMPLE);
    expect(v.result.warnings[0]?.message).toBe(v.raw.warnings.find((w) => w.code === 'RETURN_NOT_COUNTED')?.message);
  });
  it('shows confidence with reasons and the formula, steps and assumptions', () => {
    const v = ok(EXAMPLE);
    expect(['high', 'medium', 'low', 'HIGH', 'MEDIUM', 'LOW'].map((s) => s.toLowerCase())).toContain(String(v.result.confidence.level).toLowerCase());
    expect(Array.isArray(v.result.confidence.reasons)).toBe(true);
    expect(v.result.details.formula).toMatch(/R_path/);
    expect(v.result.details.steps.length).toBeGreaterThan(3);
  });
});

describe('nothing is defaulted that the user must decide', () => {
  it('the empty form asks for source, load, return path and an element, and shows no result', () => {
    expect(DEFAULT_STATE.returnPath).toBe('');
    expect(DEFAULT_STATE.loadKind).toBe('');
    const v = computeView(DEFAULT_STATE);
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
  it('no return path choice, no result', () => {
    expect(computeView({ ...EXAMPLE, returnPath: '' }).status).toBe('needs-input');
  });
  it('a trace without a layer asks for it; the layer is never assumed', () => {
    const v = computeView({ ...EXAMPLE, elements: [trace('t1', { layer: '' })] });
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/copper layer/i);
  });
  it('a resistance without a source note asks for it', () => {
    const v = computeView({ ...EXAMPLE, elements: [res('x', '1 ohm', '')] });
    expect(v.status).toBe('needs-input');
    if (v.status === 'needs-input') expect(v.needs.join(' ')).toMatch(/where .*comes from|source/i);
  });
  it('a missing label is asked for', () => {
    const v = computeView({ ...EXAMPLE, elements: [res('', '1 ohm')] });
    expect(v.status).toBe('needs-input');
  });
  it('a weight from a fab order form (finished copper) gives no result', () => {
    const v = computeView({
      ...EXAMPLE,
      elements: [trace('t1', { copperBy: 'weight', copperWeight: '1 oz', weightSource: 'finished' })],
    });
    expect(v.status).toBe('needs-input');
  });
  it('conductor temperature empty is the 25 degC default and is marked as a default', () => {
    const v = ok({ ...EXAMPLE, elements: [trace('t1')] });
    expect(v.result.details.assumptions.join(' ')).toMatch(/25 °C is an engineering default/);
    expect(v.result.confidence.reasons.join(' ')).toMatch(/default/i);
  });
});

describe('traces', () => {
  const S = st({ ...EXAMPLE, elements: [trace('feed'), res('connector', '0.25 ohm')] });
  it('give a result with the self-heating caution and a limiting element by name', () => {
    const v = ok(S);
    expect(v.result.warnings.some((w) => /self-heating/i.test(w.message))).toBe(true);
    expect(['feed', 'connector']).toContain(v.limiting.name);
    expect(v.table).toHaveLength(2);
  });
  it('a hotter conductor raises the drop of a trace-only path', () => {
    const base = st({ ...EXAMPLE, elements: [trace('feed')] });
    const cold = ok(base).raw.results.find((r) => r.name.startsWith('total voltage drop'))?.value.si ?? 0;
    const hot = ok({ ...base, temperature: '100 °C' }).raw.results.find((r) => r.name.startsWith('total voltage drop'))?.value.si ?? 0;
    expect(hot).toBeGreaterThan(cold);
  });
  it('a wrong-dimension temperature is an inline error, not a number', () => {
    const v = computeView({ ...S, temperature: '5 V' });
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.fieldErrors['temperature']).toBeTruthy();
  });
  it('shows the ledger status of the data used', () => {
    const v = ok(S);
    expect(v.result.ledger.entries.length).toBeGreaterThan(0);
    expect(v.result.ledger.entries.map((e) => e.id)).toEqual(expect.arrayContaining(['S-019', 'S-004']));
  });
});

describe('return path', () => {
  it('same-as-forward counts every element twice and labels the return copies', () => {
    const v = ok({ ...EXAMPLE, returnPath: 'same-as-forward' });
    expect(v.table).toHaveLength(4);
    expect(v.table.filter((r) => r.side === 'return')).toHaveLength(2);
    const withOut = ok(EXAMPLE).raw.results.find((r) => r.name === 'total path resistance')?.value.si ?? 0;
    const twice = v.raw.results.find((r) => r.name === 'total path resistance')?.value.si ?? 0;
    expect(twice).toBeCloseTo(2 * withOut, 12);
  });
  it('included-in-list accepts separately listed return elements', () => {
    const v = ok({ ...EXAMPLE, returnPath: 'included-in-list', returnElements: [res('gnd lead', '0.1 ohm')] });
    expect(v.table.map((r) => r.name)).toEqual(['cable', 'connector', 'gnd lead']);
    expect(v.table[2]?.side).toBe('return');
  });
  it('return elements are ignored (not sent) when the return is not listed', () => {
    const v = ok({ ...EXAMPLE, returnPath: 'not-counted', returnElements: [res('gnd lead', '0.1 ohm')] });
    expect(v.table).toHaveLength(2);
  });
  it('every option has a one-line explanation, and not-counted carries a caution', () => {
    expect(RETURN_PATH_OPTIONS.map((o) => o.value)).toEqual(['included-in-list', 'same-as-forward', 'not-counted']);
    for (const o of RETURN_PATH_OPTIONS) {
      expect(o.explain.length).toBeGreaterThan(20);
      expect(o.explain).not.toMatch(/\n/);
    }
    expect(RETURN_PATH_OPTIONS.find((o) => o.value === 'not-counted')?.caution).toMatch(/return/i);
    expect(RETURN_PATH_OPTIONS.find((o) => o.value === 'same-as-forward')?.caution).toBeUndefined();
  });
});

describe('load kinds', () => {
  const base = { vsource: '12 V', returnPath: 'not-counted', elements: [res('cable', '0.5 ohm'), res('connector', '0.25 ohm')] } as const;
  it('current', () => {
    const v = ok(st({ ...base, loadKind: 'current', loadValue: '1 A' }));
    expect(v.result.headline.text).toMatch(/^750 mV \(/);
  });
  it('power', () => {
    const v = ok(st({ ...base, loadKind: 'power', loadValue: '10 W' }));
    expect(v.result.headline.text).toMatch(/ m?V \(/);
  });
  it('voltage', () => {
    const v = ok(st({ ...base, loadKind: 'voltage', loadValue: '11 V' }));
    expect(v.result.headline.text).toMatch(/ m?V \(/);
  });
  it('a value of the wrong dimension for the load kind is an inline error', () => {
    const v = computeView(st({ ...base, loadKind: 'current', loadValue: '5 V' }));
    expect(v.status).toBe('error');
    expect(v).not.toHaveProperty('result');
  });
  it('constant power too large: the core message with the maximum deliverable power and no operating point', () => {
    const v = computeView(st({ ...base, loadKind: 'power', loadValue: '100 W' }));
    expect(v.status).toBe('cannot-supply');
    if (v.status === 'cannot-supply') {
      expect(v.message).toMatch(/cannot be supplied/);
      expect(v.message).toMatch(/Maximum deliverable power: 48 W/);
    }
    expect(v).not.toHaveProperty('result');
    expect(v).not.toHaveProperty('table');
  });
  it('near maximum power shows the caution', () => {
    const v = ok(st({ ...base, loadKind: 'power', loadValue: '47.9 W' }));
    expect(v.result.warnings.some((w) => /within 1 %/.test(w.message))).toBe(true);
  });
});

describe('invalid input never gives a number', () => {
  const bad: [string, Partial<VoltageDropState>][] = [
    ['text for the source', { vsource: 'abc' }],
    ['negative source', { vsource: '-5 V' }],
    ['zero source', { vsource: '0 V' }],
    ['wrong unit for the source', { vsource: '12 A' }],
    ['negative load', { loadValue: '-10 ohm' }],
    ['infinite load', { loadValue: 'Infinity ohm' }],
    ['too long text', { loadValue: '1'.repeat(60) + ' ohm' }],
    ['bad budget', { budget: 'lots' }],
    ['budget above 100 %', { budget: '150%' }],
  ];
  for (const [name, patch] of bad) {
    it(name, () => {
      const v = computeView({ ...EXAMPLE, ...patch });
      expect(v.status).toBe('error');
      expect(v).not.toHaveProperty('result');
      expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity(?! ohm)/);
    });
  }
  it('an element with a bad value names the element and the field', () => {
    const v = computeView({ ...EXAMPLE, elements: [res('cable', 'lots'), res('connector', '0.25 ohm')] });
    expect(v.status).toBe('error');
    if (v.status === 'error') {
      expect(v.fieldErrors['f0.resistance']).toBeTruthy();
      expect(v.problems.join(' ')).toMatch(/cable/);
    }
  });
  it('duplicate labels are an error from the core, shown inline', () => {
    const v = computeView({ ...EXAMPLE, elements: [res('cable', '0.5 ohm'), res('Cable', '0.25 ohm')] });
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toMatch(/unique/i);
  });
  it('more elements than the cap is a clear error', () => {
    const many = Array.from({ length: MAX_FORWARD_ELEMENTS + 1 }, (_, i) => res(`r${String(i)}`, '1 ohm'));
    const v = computeView({ ...EXAMPLE, elements: many });
    expect(v.status).toBe('error');
    if (v.status === 'error') expect(v.problems.join(' ')).toBe(CAP_MESSAGE('forward', MAX_FORWARD_ELEMENTS));
  });
});

describe('drop budget', () => {
  it('is optional and has no default', () => {
    expect(DEFAULT_STATE.budget).toBe('');
    const v = ok(EXAMPLE);
    expect(v.result.warnings.some((w) => /budget/.test(w.message))).toBe(false);
  });
  it('exceeded: a warning that names the biggest contributor', () => {
    const v = ok({ ...EXAMPLE, budget: '5%' });
    const w = v.result.warnings.find((x) => /budget/.test(x.message));
    expect(w?.severity).toBe('warning');
    expect(w?.message).toMatch(/cable/);
  });
  it('met: no warning, a row says so', () => {
    const v = ok({ ...EXAMPLE, budget: '10%' });
    expect(v.result.warnings.some((w) => /exceeds the budget/.test(w.message))).toBe(false);
    expect(rowsOf(v)['Drop budget']).toMatch(/not exceeded/);
  });
});

describe('element list helpers', () => {
  it('adds with unique default labels up to the cap, then refuses with the message', () => {
    let s: { elements: readonly ElementForm[]; message?: string } = { elements: [] };
    for (let i = 0; i < MAX_FORWARD_ELEMENTS; i++) s = addElement(s.elements, i % 2 === 0 ? 'trace' : 'resistance', 'forward');
    expect(s.elements).toHaveLength(MAX_FORWARD_ELEMENTS);
    expect(new Set(s.elements.map((e) => e.label.toLowerCase())).size).toBe(MAX_FORWARD_ELEMENTS);
    expect(s.message).toBeUndefined();
    const over = addElement(s.elements, 'trace', 'forward');
    expect(over.elements).toHaveLength(MAX_FORWARD_ELEMENTS);
    expect(over.message).toBe(CAP_MESSAGE('forward', MAX_FORWARD_ELEMENTS));
    expect(addElement([], 'trace', 'return').elements[0]?.label).toMatch(/return/i);
  });
  it('removes by index and ignores a bad index', () => {
    const l = [res('a', '1 ohm'), res('b', '1 ohm')];
    expect(removeElement(l, 0).map((e) => e.label)).toEqual(['b']);
    expect(removeElement(l, 5)).toEqual(l);
    expect(removeElement(l, -1)).toEqual(l);
  });
  it('the return cap is stated', () => {
    expect(MAX_RETURN_ELEMENTS).toBe(6);
    expect(CAP_MESSAGE('return', 6)).toMatch(/At most 6 return elements/);
  });
});

describe('hash state', () => {
  const FULL: VoltageDropState = st({
    vsource: '12 V',
    loadKind: 'power',
    loadValue: '10 W',
    returnPath: 'included-in-list',
    budget: '5%',
    temperature: '60 °C',
    convention: 'nominal-1.35mil',
    units: 'imperial',
    elements: [trace('feed 1', { copperBy: 'weight', copperWeight: '1 oz', weightSource: 'foil' }), res('conn & "x"', '25 mΩ', 'datasheet p.4 ~ typ')],
    returnElements: [trace('gnd', { layer: 'inner', copperBy: 'thickness', copperThickness: '1.4 mil' })],
  });
  const roundTrip = (s: VoltageDropState) => {
    const hash = serializeHash(ROUTE, toHashState(s));
    const p = parseHash(hash);
    expect(p.stateDiscarded).toBe(false);
    return { hash, loaded: fromHashState(p.state) };
  };
  it('round-trips the full state, including awkward labels and notes', () => {
    const { loaded } = roundTrip(FULL);
    expect(loaded.notices).toEqual([]);
    expect(loaded.state).toEqual(FULL);
  });
  it('the default state writes nothing', () => {
    expect(toHashState(DEFAULT_STATE)).toEqual({});
    expect(fromHashState({}).state).toEqual(DEFAULT_STATE);
  });
  it('never writes a default the user did not choose (no return path, no layer)', () => {
    const h = toHashState(st({ vsource: '12 V' }));
    expect(h['rp']).toBeUndefined();
    expect(h['lk']).toBeUndefined();
  });
  it('writes only documented keys', () => {
    const documented = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
    const keys = Object.keys(toHashState(FULL));
    for (const k of keys) expect([...documented, 'u']).toContain(k);
    for (const k of WRITTEN_KEYS) expect([...documented, 'u']).toContain(k);
  });
  it('the key budget holds with every slot used', () => {
    const f = Array.from({ length: MAX_FORWARD_ELEMENTS }, (_, i) => trace(`forward element ${String(i + 1)}`, { copperBy: 'weight', copperWeight: '1 oz', weightSource: 'foil' }));
    const r = Array.from({ length: MAX_RETURN_ELEMENTS }, (_, i) => res(`return element ${String(i + 1)}`, '10 mΩ', 'datasheet value at 25 degC'));
    const full = st({ ...FULL, elements: f, returnElements: r });
    const { hash, loaded } = roundTrip(full);
    expect(Object.keys(toHashState(full)).length).toBeLessThan(MAX_STATE_KEYS);
    expect(hash.length).toBeLessThan(MAX_HASH_LENGTH);
    expect(loaded.state).toEqual(full);
    expect(shareLengthNote(full)).toBeUndefined();
  });
  it('warns when the link would be too long to load', () => {
    const long = 'é'.repeat(40);
    const f = Array.from({ length: MAX_FORWARD_ELEMENTS }, (_, i) => res(`${long.slice(0, 20)}${String(i)}`, '10 mΩ', 'ü'.repeat(38) + String(i)));
    const r = Array.from({ length: MAX_RETURN_ELEMENTS }, (_, i) => res(`${long.slice(0, 20)}r${String(i)}`, '10 mΩ', 'ü'.repeat(38) + String(i)));
    const note = shareLengthNote(st({ ...FULL, elements: f, returnElements: r }));
    expect(note === undefined || /too long/i.test(note)).toBe(true);
    const label = 'ü'.repeat(LABEL_MAX_CHARS);
    const note2 = 'ü'.repeat(NOTE_MAX_CHARS);
    const all = (n: number) => Array.from({ length: n }, (_, i) => res(`${label.slice(1)}${String(i)}`, '10 mΩ', note2));
    expect(shareLengthNote(st({ ...FULL, elements: all(MAX_FORWARD_ELEMENTS), returnElements: all(MAX_RETURN_ELEMENTS) }))).toMatch(/too long/i);
  });
  it('corrupt element values fall back to defaults with a notice and never throw', () => {
    const { state, notices } = fromHashState({ fe1: '%E0%A4%A', fe2: 'x~y~', rp: 'banana', lk: 'nope', conv: 'zzz', fe9: 'r~a~1~n~' });
    expect(state.elements).toEqual([]);
    expect(state.returnPath).toBe('');
    expect(state.loadKind).toBe('');
    expect(state.convention).toBe('');
    expect(notices.length).toBeGreaterThanOrEqual(4);
  });
  it('an element with an unrecognised layer keeps the element but drops the layer, with a notice', () => {
    const { state, notices } = fromHashState({ fe1: 't~feed~middle~100%20mm~1%20mm~t~~35%20um~nominal~~' });
    expect(state.elements[0]?.label).toBe('feed');
    expect(state.elements[0]?.layer).toBe('');
    expect(notices.join(' ')).toMatch(/layer/i);
  });
  it('an over-long field in the link is emptied with a notice', () => {
    const { state, notices } = fromHashState({ vs: 'x'.repeat(60) });
    expect(state.vsource).toBe('');
    expect(notices.join(' ')).toMatch(/too long/i);
  });
  it('elements beyond the cap in a link are ignored with a notice', () => {
    const { notices } = fromHashState({ fe7: 'r~a~1%20ohm~n~' });
    expect(notices.join(' ')).toMatch(/At most 6/);
  });
  it('a stray method mode is ignored with a notice', () => {
    expect(fromHashState({ mode: 'A' }).notices.join(' ')).toMatch(/does not apply/);
  });
});

describe('source scans', () => {
  const strip = (t: string): string => t.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [name, src] of [['voltage-drop.vm', vmSrc], ['VoltageDrop', pageSrc]] as const) {
    it(`${name}: no hand rounding, no engineering math`, () => {
      const s = strip(src);
      expect(s).not.toMatch(/\.toFixed\(|\.toPrecision\(|Math\.(round|ceil|floor|pow|sqrt|exp|log)/);
      expect(s).not.toMatch(/Date\.now|Math\.random/);
    });
  }
  it('the vm does not import anything from the DOM or network', () => {
    expect(strip(vmSrc)).not.toMatch(/\bfetch\(|document\.|window\./);
  });
});
