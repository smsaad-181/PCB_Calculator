// View-model for the voltage drop and power loss (feed path) page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/voltage-drop analyse().
import { findTotalDrop } from './total-drop';
import { analyse, type Inputs, type PathElement } from '../../core/calculators/voltage-drop/calc';
import { meta } from '../../core/calculators/voltage-drop/meta';
import type { LoadField, ReturnPath } from '../../core/calculators/voltage-drop/guards';
import { DEFAULT_FOIL_CONVENTION } from '../../core/data/constants';
import { formatPercent, formatResult, type HeadlineOpts } from '../../core/format-result';
import type { Bound, CalcResult, CopperBasisKind } from '../../core/result';
import { DIM, FOIL_CONVENTIONS, q, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { MAX_HASH_LENGTH, RESERVED_STATE_KEYS, decodeList, encodeList, serializeHash, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { conventionSpreadText, echoPrefs, headlinePrefs, type CopperLayer, type Units } from '../components/prefs';
import { buildResultView, MAX_FIELD_CHARS, parseField, parseFractionField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';
import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';

export const CALCULATOR_ID = 'voltage-drop';
export type { Units };

export type LoadKind = 'current' | 'power' | 'resistance' | 'voltage';
export type CopperBy = 'weight' | 'thickness';
export type ElementKind = 'trace' | 'resistance';
export type Side = 'forward' | 'return';

/** Most elements per list the page accepts (the hash has 64 keys and 8192 characters; the core allows more). */
export const MAX_FORWARD_ELEMENTS = 6;
export const MAX_RETURN_ELEMENTS = 6;
export const LABEL_MAX_CHARS = 60;
export const NOTE_MAX_CHARS = 120;

export const CAP_MESSAGE = (side: Side, max: number): string =>
  `At most ${String(max)} ${side} elements are supported on this page. Combine elements or remove one.`;

/** One path element as typed. Strings are exactly what the user typed; empty means not entered. */
export interface ElementForm {
  readonly kind: ElementKind;
  readonly label: string;
  /** Trace only. '' means not chosen: the layer is never defaulted. */
  readonly layer: CopperLayer | '';
  readonly length: string;
  readonly width: string;
  readonly copperBy: CopperBy;
  readonly copperWeight: string;
  readonly copperThickness: string;
  readonly basis: CopperBasisKind;
  /** '' means not answered. Only meaningful when a copper weight is entered. */
  readonly weightSource: WeightSource;
  /** Resistance element only. */
  readonly resistance: string;
  /** Resistance element only: where the value comes from. Required. */
  readonly note: string;
}

export interface VoltageDropState {
  readonly vsource: string;
  /** '' means not chosen. */
  readonly loadKind: LoadKind | '';
  readonly loadValue: string;
  /** '' means not chosen: the return path is never defaulted. */
  readonly returnPath: ReturnPath | '';
  readonly elements: readonly ElementForm[];
  /** Only used with returnPath 'included-in-list'. */
  readonly returnElements: readonly ElementForm[];
  /** Optional, no default. */
  readonly budget: string;
  /** Conductor temperature of every trace. Empty means the 25 °C engineering default. */
  readonly temperature: string;
  /** '' means the default convention (an assumption). */
  readonly convention: FoilConvention | '';
  readonly units: Units;
}

export const DEFAULT_STATE: VoltageDropState = Object.freeze({
  vsource: '',
  loadKind: '',
  loadValue: '',
  returnPath: '',
  elements: [],
  returnElements: [],
  budget: '',
  temperature: '',
  convention: '',
  units: 'metric',
});

export const METHOD_TEXT = 'Method: DC series path of copper traces (resistance at the conductor temperature) and user-given resistances feeding one load';

export const DEFAULT_TEXT = {
  temperature: `${String(meta.defaults.conductorTemperatureC)} °C (engineering default, not from a standard)`,
} as const;

export const RANGE_HINT =
  'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

export const SCOPE_HEADING = 'What this path covers';

export function newElement(kind: ElementKind, label: string): ElementForm {
  return {
    kind,
    label,
    layer: '',
    length: '',
    width: '',
    copperBy: 'weight',
    copperWeight: '',
    copperThickness: '',
    basis: 'nominal',
    weightSource: '',
    resistance: '',
    note: '',
  };
}

const LIST_MAX: Readonly<Record<Side, number>> = { forward: MAX_FORWARD_ELEMENTS, return: MAX_RETURN_ELEMENTS };

/** Adds a blank element with a unique default label, or refuses (with the message) at the cap. */
export function addElement(list: readonly ElementForm[], kind: ElementKind, side: Side): { elements: readonly ElementForm[]; message?: string } {
  const max = LIST_MAX[side];
  if (list.length >= max) return { elements: list, message: CAP_MESSAGE(side, max) };
  const base = `${side === 'return' ? 'Return ' : ''}${kind === 'trace' ? 'trace' : 'resistance'}`;
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  const used = new Set(list.map((e) => e.label.trim().toLowerCase()));
  let n = 1;
  while (used.has(`${cap} ${String(n)}`.toLowerCase())) n++;
  return { elements: [...list, newElement(kind, `${cap} ${String(n)}`)] };
}

export function removeElement(list: readonly ElementForm[], index: number): readonly ElementForm[] {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
export interface LoadOption {
  readonly value: LoadKind;
  readonly label: string;
  readonly fieldLabel: string;
  readonly unitHint: string;
  readonly help: string;
  readonly placeholder: string;
  readonly coreField: LoadField;
  readonly dim: Dim;
}

export const LOAD_OPTIONS: readonly LoadOption[] = [
  { value: 'current', label: 'Current (constant current)', fieldLabel: 'Load current', unitHint: 'A or mA', help: 'The load draws this current whatever its voltage. Examples: 2 A, 500 mA.', placeholder: '2 A', coreField: 'loadCurrent', dim: DIM.CURRENT },
  { value: 'power', label: 'Power (constant power)', fieldLabel: 'Load power', unitHint: 'W or mW', help: 'The load draws this power whatever its voltage (a regulator input). Examples: 10 W, 500 mW.', placeholder: '10 W', coreField: 'loadPower', dim: DIM.POWER },
  { value: 'resistance', label: 'Resistance (constant resistance)', fieldLabel: 'Load resistance', unitHint: 'Ω, mΩ, kΩ or a code such as 4k7', help: 'A resistor-like load. Examples: 10 ohm, 4k7.', placeholder: '10 ohm', coreField: 'loadResistance', dim: DIM.RESISTANCE },
  { value: 'voltage', label: 'Voltage (required at the load)', fieldLabel: 'Voltage at the load', unitHint: 'V or mV', help: 'The voltage the load sits at; the current follows from the drop. Must be below the source voltage. Examples: 11.5 V.', placeholder: '11.5 V', coreField: 'loadVoltage', dim: DIM.VOLTAGE },
];

export function isLoadKind(v: string): v is LoadKind {
  return LOAD_OPTIONS.some((o) => o.value === v);
}
const loadOption = (k: LoadKind): LoadOption => LOAD_OPTIONS.find((o) => o.value === k) ?? (LOAD_OPTIONS[0] as LoadOption);

export const RETURN_PATH_QUESTION = 'Is the return path counted?';
export const RETURN_PATH_OPTIONS: readonly { value: ReturnPath; label: string; explain: string; caution?: string }[] = [
  { value: 'included-in-list', label: 'Included in the list', explain: 'The return conductors are already among the elements, or you list them separately below; nothing is added.' },
  { value: 'same-as-forward', label: 'Same as the forward path', explain: 'Every forward element is counted a second time as the return, so the loop resistance is doubled.' },
  {
    value: 'not-counted',
    label: 'Not counted',
    explain: 'Only the forward path is counted and the return is left out.',
    caution: 'Caution: the drop and the loss then cover the forward path only. A real loop has a return drop as well, so the load sees less than shown.',
  },
];
export function isReturnPath(v: string): v is ReturnPath {
  return RETURN_PATH_OPTIONS.some((o) => o.value === v);
}

export const LAYER_OPTIONS: readonly { value: CopperLayer; label: string }[] = [
  { value: 'outer', label: 'Outer layer' },
  { value: 'inner', label: 'Inner layer' },
];

// ---------------------------------------------------------------------------
// Hash state. Keys are documented in CALCULATOR_STATE_KEYS['voltage-drop'] (src/state/hash.ts).
// Elements: fe1..fe6 (forward) and re1..re6 (return), numbered from 1 without gaps, one list-encoded value each:
//   trace      t ~ label ~ layer ~ length ~ width ~ copperBy(w|t) ~ weight ~ thickness ~ basis ~ weightSource
//   resistance r ~ label ~ resistance ~ source note
// ---------------------------------------------------------------------------
const slotKey = (side: Side, n: number): string => `${side === 'forward' ? 'fe' : 're'}${String(n)}`;
export const WRITTEN_KEYS: readonly string[] = [...stateKeyNames(CALCULATOR_ID), 'u'];

function encodeElement(e: ElementForm): string {
  const label = e.label.slice(0, LABEL_MAX_CHARS);
  if (e.kind === 'resistance') return encodeList(['r', label, e.resistance.slice(0, MAX_FIELD_CHARS), e.note.slice(0, NOTE_MAX_CHARS)]);
  return encodeList([
    't',
    label,
    e.layer,
    e.length.slice(0, MAX_FIELD_CHARS),
    e.width.slice(0, MAX_FIELD_CHARS),
    e.copperBy === 'weight' ? 'w' : 't',
    e.copperWeight.slice(0, MAX_FIELD_CHARS),
    e.copperThickness.slice(0, MAX_FIELD_CHARS),
    e.basis,
    e.weightSource,
  ]);
}

/** State to put in the hash. Defaults are omitted; the return path, load kind and layers are only written from a user choice. */
export function toHashState(s: VoltageDropState): Record<string, string> {
  const out: Record<string, string> = {};
  const text = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v.slice(0, MAX_FIELD_CHARS);
  };
  text('vs', s.vsource);
  text('lv', s.loadValue);
  text('db', s.budget);
  text('tc', s.temperature);
  if (s.loadKind !== '') out['lk'] = s.loadKind;
  if (s.returnPath !== '') out['rp'] = s.returnPath;
  if (s.convention !== '') out['conv'] = s.convention;
  s.elements.slice(0, MAX_FORWARD_ELEMENTS).forEach((e, i) => {
    out[slotKey('forward', i + 1)] = encodeElement(e);
  });
  s.returnElements.slice(0, MAX_RETURN_ELEMENTS).forEach((e, i) => {
    out[slotKey('return', i + 1)] = encodeElement(e);
  });
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

const SAFETY_MARGIN_CHARS = 192;
/** A sentence when the link for this state would be too long to be loaded again (it would be discarded), else undefined. */
export function shareLengthNote(s: VoltageDropState): string | undefined {
  const hash = serializeHash({ name: 'calc', id: CALCULATOR_ID }, toHashState(s));
  if (hash.length <= MAX_HASH_LENGTH - SAFETY_MARGIN_CHARS) return undefined;
  return 'The link for this state is too long to be loaded again (the limit is 8192 characters). Shorten the labels and source notes, or remove elements, before sharing the link.';
}

export interface LoadedState {
  readonly state: VoltageDropState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function decodeElement(raw: string, where: string, notices: string[]): ElementForm | undefined {
  const p = decodeList(raw);
  const kind = p[0];
  if (kind !== 't' && kind !== 'r') {
    notices.push(`${where} was not recognised and is left out.`);
    return undefined;
  }
  let label = p[1] ?? '';
  if (label.length > LABEL_MAX_CHARS) {
    notices.push(`${where}: the label was too long and was shortened.`);
    label = label.slice(0, LABEL_MAX_CHARS);
  }
  const field = (i: number, what: string, max = MAX_FIELD_CHARS): string => {
    const v = p[i] ?? '';
    if (v.length > max) {
      notices.push(`${where}: ${what} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  if (kind === 'r') return { ...newElement('resistance', label), resistance: field(2, 'the resistance'), note: field(3, 'the source note', NOTE_MAX_CHARS) };
  let e: ElementForm = { ...newElement('trace', label), length: field(3, 'the length'), width: field(4, 'the width'), copperWeight: field(6, 'the copper weight'), copperThickness: field(7, 'the copper thickness') };
  const layer = p[2] ?? '';
  if (layer === 'outer' || layer === 'inner') e = { ...e, layer };
  else if (layer !== '') notices.push(`${where}: the copper layer was not recognised: no layer is chosen. Choose outer or inner.`);
  const cb = p[5] ?? 'w';
  if (cb === 't') e = { ...e, copperBy: 'thickness' };
  else if (cb !== 'w') notices.push(`${where}: how copper is specified was not recognised: weight is used instead.`);
  const basis = p[8] ?? 'nominal';
  if (basis === 'nominal' || basis === 'finished' || basis === 'measured') e = { ...e, basis };
  else notices.push(`${where}: the thickness basis was not recognised: nominal is used instead.`);
  e = { ...e, weightSource: weightSourceFromHash(p[9] === '' ? undefined : p[9], notices) };
  return e;
}

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: VoltageDropState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const text = (k: string, label: string): string => {
    const v = get(k);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${label} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  const lk = get('lk');
  if (lk !== undefined) {
    if (isLoadKind(lk)) s = { ...s, loadKind: lk };
    else notices.push('The kind of load was not recognised: none is chosen. Choose current, power, resistance or voltage.');
  }
  const rp = get('rp');
  if (rp !== undefined) {
    if (isReturnPath(rp)) s = { ...s, returnPath: rp };
    else notices.push('The return path choice was not recognised: none is chosen. It is never assumed.');
  }
  const conv = get('conv');
  if (conv !== undefined) {
    if (has(FOIL_CONVENTIONS, conv)) s = { ...s, convention: conv as FoilConvention };
    else notices.push(`Foil convention was not recognised: the default (${DEFAULT_FOIL_CONVENTION}) is used instead.`);
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  if (get('mode') !== undefined) notices.push('A method mode in the link does not apply to this calculator and was not used.');
  if (get('fc') !== undefined) notices.push('A foil thickness per oz/ft² in the link is not used by this page. The foil convention is chosen in the form.');

  const readList = (side: Side): ElementForm[] => {
    const out: ElementForm[] = [];
    const max = LIST_MAX[side];
    for (let n = 1; n <= max; n++) {
      const raw = get(slotKey(side, n));
      if (raw === undefined) continue;
      const e = decodeElement(raw, `${side === 'forward' ? 'Forward' : 'Return'} element ${String(n)}`, notices);
      if (e !== undefined) out.push(e);
    }
    const prefix = side === 'forward' ? 'fe' : 're';
    if (Object.keys(h).some((k) => new RegExp(`^${prefix}(\\d+)$`).test(k) && Number(k.slice(2)) > max)) {
      notices.push(`${CAP_MESSAGE(side, max)} The extra elements in the link were ignored.`);
    }
    return out;
  };
  s = {
    ...s,
    vsource: text('vs', 'Source voltage'),
    loadValue: text('lv', 'The load value'),
    budget: text('db', 'The drop budget'),
    temperature: text('tc', 'Conductor temperature'),
    elements: readList('forward'),
    returnElements: readList('return'),
  };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
/** Keys of the fixed fields; element fields are `f<index>.<field>` (forward) and `r<index>.<field>` (return). */
export type FieldErrors = Readonly<Record<string, string>>;

export type ElementField = 'label' | 'layer' | 'length' | 'width' | 'copperWeight' | 'copperThickness' | 'resistance' | 'note';
export const elementFieldKey = (side: Side, index: number, field: ElementField): string => `${side === 'forward' ? 'f' : 'r'}${String(index)}.${field}`;

const ELEMENT_DIM: Readonly<Record<'length' | 'width' | 'copperWeight' | 'copperThickness' | 'resistance', Dim>> = {
  length: DIM.LENGTH,
  width: DIM.LENGTH,
  copperWeight: DIM.AREAL_MASS,
  copperThickness: DIM.LENGTH,
  resistance: DIM.RESISTANCE,
};
export function elementFieldDim(f: keyof typeof ELEMENT_DIM): Dim {
  return ELEMENT_DIM[f];
}
export const VSOURCE_DIM: Dim = DIM.VOLTAGE;
export const TEMPERATURE_DIM: Dim = DIM.ABS_TEMPERATURE;
export function loadDim(kind: LoadKind): Dim {
  return loadOption(kind).dim;
}
/** Parser for the optional drop budget (a percent or fraction). */
export const parseBudget = parseFractionField;

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface TableRow {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly kind: ElementKind;
  readonly resistance: string;
  readonly drop: string;
  readonly loss: string;
  readonly share: string;
  readonly provenance: string;
  readonly limiting: boolean;
}

export type VoltageDropView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | { readonly status: 'cannot-supply'; readonly message: string; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** The path scope: shown prominently under the headline. */
      readonly callout: { readonly heading: string; readonly text: string };
      readonly table: readonly TableRow[];
      readonly limiting: { readonly name: string; readonly text: string };
    };

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'total voltage drop': 'Total voltage drop',
  'total voltage drop (forward path only)': 'Total voltage drop (forward path only)',
  'load voltage': 'Load voltage',
  'load current': 'Load current',
  'total path resistance': 'Total path resistance',
  'total power loss': 'Total power loss',
  'power delivered to load': 'Power delivered to the load',
  efficiency: 'Efficiency (share of the source power, 100 % is lossless)',
  'source power': 'Source power',
  'load resistance': 'Load resistance',
  'maximum deliverable power': 'Maximum deliverable power',
  vsource: 'Source voltage',
  loadCurrent: 'Load current (given)',
  loadPower: 'Load power (given)',
  loadResistance: 'Load resistance (given)',
  loadVoltage: 'Voltage at the load (given)',
  dropBudgetPercent: 'Drop budget',
};
const PCT_NAME = 'voltage drop percent of source';
const PIN_WARNINGS = ['RETURN_NOT_COUNTED', 'DROP_BUDGET_EXCEEDED', 'NEAR_MAX_POWER'] as const;
const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = {};

const NEEDS = {
  vsource: 'Enter the source voltage (for example 12 V).',
  loadKind: 'Choose what describes the load: current, power, resistance or voltage.',
  returnPath: 'Choose how the return path is counted. It is not assumed.',
  elements: 'Add at least one path element (a trace or a resistance) to the forward path.',
} as const;

const SIDE_NAME: Readonly<Record<Side, string>> = { forward: 'Forward', return: 'Return' };

interface Collected {
  readonly needs: string[];
  readonly problems: string[];
  readonly fieldErrors: Record<string, string>;
  readonly notes: string[];
}

/** Parses one element. Returns the core element when everything needed is present and valid. */
function readElement(e: ElementForm, side: Side, index: number, s: VoltageDropState, c: Collected, temperature: Quantity | undefined): PathElement | undefined {
  const where = `${SIDE_NAME[side]} element ${String(index + 1)}${e.label.trim() !== '' ? ` (${e.label.trim()})` : ''}`;
  const key = (f: ElementField): string => elementFieldKey(side, index, f);
  const prefs = (k: 'width' | 'thickness' | 'other'): DisplayPrefs => echoPrefs(s.units, k);
  let missing = false;
  let bad = false;
  const need = (text: string): void => {
    c.needs.push(`${where}: ${text}`);
    missing = true;
  };
  const read = (f: 'length' | 'width' | 'copperWeight' | 'copperThickness' | 'resistance', text: string, kind: 'width' | 'thickness' | 'other', label: string): Quantity | undefined => {
    const v: FieldView = parseField(text, ELEMENT_DIM[f], prefs(kind));
    if (v.status === 'error') {
      c.problems.push(`${where}: ${label}: ${v.message}`);
      c.fieldErrors[key(f)] = v.message;
      bad = true;
      return undefined;
    }
    if (v.status === 'empty') return undefined;
    return v.value;
  };
  if (e.label.trim() === '') need('give it a label (it names the element in the results).');
  if (e.label.length > 80) {
    c.problems.push(`${where}: the label is too long (at most 80 characters).`);
    bad = true;
  }
  if (e.kind === 'resistance') {
    const r = read('resistance', e.resistance, 'other', 'Resistance');
    if (r === undefined && !bad) need('enter the resistance (for example 0.5 ohm or 25 mΩ).');
    if (e.note.trim() === '') need('say where this resistance comes from (datasheet, measurement, estimate). It is shown as user-supplied.');
    if (missing || bad || r === undefined) return undefined;
    return { kind: 'resistance', label: e.label.trim(), resistance: r, sourceNote: e.note.trim() };
  }
  const length = read('length', e.length, 'width', 'Length');
  if (length === undefined && !bad) need('enter the trace length (for example 100 mm or 4 in).');
  const width = read('width', e.width, 'width', 'Width');
  if (width === undefined && !bad && e.width.trim() === '') need('enter the trace width (for example 1 mm or 40 mil).');
  if (e.layer === '') need('choose a copper layer: outer or inner. It is not assumed.');
  let weight: Quantity | undefined;
  let thickness: Quantity | undefined;
  if (e.copperBy === 'weight') {
    if (e.weightSource === 'finished') need(FINISHED_NEEDS);
    weight = read('copperWeight', e.copperWeight, 'other', 'Copper weight');
    if (weight === undefined && !bad && e.weightSource !== 'finished') need('enter the copper weight (for example 1 oz).');
    if (weight !== undefined && e.weightSource === '' && !c.notes.includes(NOT_ANSWERED_NOTE)) c.notes.push(NOT_ANSWERED_NOTE);
  } else {
    thickness = read('copperThickness', e.copperThickness, 'thickness', 'Copper thickness');
    if (thickness === undefined && !bad) need('enter the copper thickness (for example 35 um).');
  }
  if (missing || bad || length === undefined || width === undefined || e.layer === '') return undefined;
  return {
    kind: 'trace',
    label: e.label.trim(),
    layer: e.layer,
    length,
    width,
    ...(e.copperBy === 'weight' ? (weight !== undefined ? { copperWeight: weight } : {}) : { ...(thickness !== undefined ? { copperThickness: thickness } : {}), copperBasis: e.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...(temperature !== undefined ? { conductorTemperature: temperature } : {}),
  };
}

function loadFields(kind: LoadKind, v: Quantity): Pick<Inputs, 'loadCurrent' | 'loadPower' | 'loadResistance' | 'loadVoltage'> {
  switch (kind) {
    case 'current':
      return { loadCurrent: v };
    case 'power':
      return { loadPower: v };
    case 'resistance':
      return { loadResistance: v };
    case 'voltage':
      return { loadVoltage: v };
  }
}

const ELEMENT_ERR = /^(elements|returnElements)\[(\d+)\]\.(.*)$/;
const LOAD_ERR_FIELDS = ['loadCurrent', 'loadPower', 'loadResistance', 'loadVoltage'];

/** Core error field name to the page's field key. */
function pageFieldOf(field: string | undefined): string | undefined {
  if (field === undefined) return undefined;
  const m = ELEMENT_ERR.exec(field);
  if (m !== null) {
    const f = m[3] ?? '';
    if (f === 'conductorTemperature') return 'temperature';
    return `${m[1] === 'elements' ? 'f' : 'r'}${m[2] ?? '0'}.${f}`;
  }
  if (field === 'vsource') return 'vsource';
  if (LOAD_ERR_FIELDS.includes(field)) return 'loadValue';
  if (field === 'dropBudgetPercent') return 'budget';
  return undefined;
}

function limitingName(e: { name: string }): string {
  return e.name;
}

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: VoltageDropState): VoltageDropView {
  const c: Collected = { needs: [], problems: [], fieldErrors: {}, notes: [] };
  const prefsOther = echoPrefs(s.units, 'other');

  // Fixed fields.
  const vs = parseField(s.vsource, VSOURCE_DIM, prefsOther);
  if (vs.status === 'error') {
    c.problems.push(`Source voltage: ${vs.message}`);
    c.fieldErrors['vsource'] = vs.message;
  } else if (vs.status === 'empty') c.needs.push(NEEDS.vsource);

  let loadQ: Quantity | undefined;
  if (s.loadKind === '') c.needs.push(NEEDS.loadKind);
  else {
    const o = loadOption(s.loadKind);
    const v = parseField(s.loadValue, o.dim, prefsOther);
    if (v.status === 'error') {
      c.problems.push(`${o.fieldLabel}: ${v.message}`);
      c.fieldErrors['loadValue'] = v.message;
    } else if (v.status === 'empty') c.needs.push(`Enter the ${o.fieldLabel.toLowerCase()} (for example ${o.placeholder}).`);
    else loadQ = v.value;
  }
  if (s.returnPath === '') c.needs.push(NEEDS.returnPath);

  const bud = parseBudget(s.budget);
  let budget: Quantity | undefined;
  if (bud.status === 'error') {
    c.problems.push(`Drop budget: ${bud.message}`);
    c.fieldErrors['budget'] = bud.message;
  } else if (bud.status === 'ok') budget = bud.value;

  const temp = parseField(s.temperature, TEMPERATURE_DIM, prefsOther);
  let temperature: Quantity | undefined;
  if (temp.status === 'error') {
    c.problems.push(`Conductor temperature: ${temp.message}`);
    c.fieldErrors['temperature'] = temp.message;
  } else if (temp.status === 'ok') temperature = temp.value;

  // Elements.
  const returnListed = s.returnPath === 'included-in-list';
  if (s.elements.length === 0) c.needs.push(NEEDS.elements);
  if (s.elements.length > MAX_FORWARD_ELEMENTS) c.problems.push(CAP_MESSAGE('forward', MAX_FORWARD_ELEMENTS));
  if (returnListed && s.returnElements.length > MAX_RETURN_ELEMENTS) c.problems.push(CAP_MESSAGE('return', MAX_RETURN_ELEMENTS));
  const fwd: PathElement[] = [];
  const ret: PathElement[] = [];
  let allRead = true;
  if (s.elements.length <= MAX_FORWARD_ELEMENTS) {
    s.elements.forEach((e, i) => {
      const x = readElement(e, 'forward', i, s, c, temperature);
      if (x === undefined) allRead = false;
      else fwd.push(x);
    });
  }
  if (returnListed && s.returnElements.length <= MAX_RETURN_ELEMENTS) {
    s.returnElements.forEach((e, i) => {
      const x = readElement(e, 'return', i, s, c, temperature);
      if (x === undefined) allRead = false;
      else ret.push(x);
    });
  }

  const notes = c.notes;
  if (c.problems.length > 0) return { status: 'error', problems: c.problems, fieldErrors: c.fieldErrors, notes };
  if (c.needs.length > 0) return { status: 'needs-input', needs: c.needs, notes };
  if (!allRead || vs.status !== 'ok' || loadQ === undefined || s.loadKind === '' || s.returnPath === '') {
    return { status: 'needs-input', needs: ['Fill in the highlighted fields.'], notes };
  }

  const inputs: Inputs = {
    vsource: vs.value,
    ...loadFields(s.loadKind, loadQ),
    returnPath: s.returnPath,
    elements: fwd,
    ...(returnListed && ret.length > 0 ? { returnElements: ret } : {}),
    ...(budget !== undefined ? { dropBudgetPercent: budget } : {}),
  };
  const out = analyse(inputs);
  if (!out.ok) {
    const key = pageFieldOf(out.error.field);
    const fieldErrors: Record<string, string> = { ...c.fieldErrors };
    if (key !== undefined) fieldErrors[key] = out.error.message;
    if (out.error.code === 'OUT_OF_DOMAIN' && /cannot be supplied/.test(out.error.message)) {
      return { status: 'cannot-supply', message: out.error.message, fieldErrors, notes };
    }
    return { status: 'error', problems: [out.error.message], fieldErrors, notes };
  }

  const { result: raw, analysis } = out.value;
  const prefs = headlinePrefs(s.units);
  const opts: HeadlineOpts = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'geometry' };
  const print = (n: number, dim: Dim, bound: 'prediction' | 'max-capacity' | 'nominal'): string => formatResult({ value: q(n, dim), bound }, opts);

  const pct = (x: Quantity | number, bound: Bound): string => formatPercent(x, bound, { accuracyClass: meta.accuracyClass });
  const scope = raw.warnings.find((w) => w.code === 'PATH_SCOPE');
  const callout = { heading: SCOPE_HEADING, text: scope?.message ?? '' };
  const forView: CalcResult = { ...raw, warnings: raw.warnings.filter((w) => w.code !== 'PATH_SCOPE') };

  const perElement = new Set<string>();
  for (const e of analysis.elements) for (const p of ['resistance', 'voltage drop', 'power loss', 'share of total drop']) perElement.add(`${p}: ${e.name}`);

  const effItem = raw.results.find((r) => r.name === 'efficiency');
  const effRow = effItem === undefined ? [] : [{ label: RESULT_LABELS['efficiency'] ?? 'Efficiency', text: pct(effItem.value, effItem.bound) }];
  const budgetRow = budget !== undefined && !raw.warnings.some((w) => w.code === 'DROP_BUDGET_EXCEEDED')
    ? [{ label: 'Drop budget', text: `${pct(budget.si, 'prediction')} of the source, not exceeded` }]
    : [];

  const traceRows: ProvenanceRow[] = [{ label: 'Return path', value: RETURN_PATH_OPTIONS.find((o) => o.value === s.returnPath)?.label ?? s.returnPath, source: 'user' }];
  const traceForms = [...s.elements, ...(returnListed ? s.returnElements : [])].filter((e) => e.kind === 'trace');
  if (traceForms.length > 0) {
    traceRows.push(
      s.convention === ''
        ? { label: 'Foil convention', value: DEFAULT_FOIL_CONVENTION, source: 'default', detail: `conventions differ by up to ${conventionSpreadText()}` }
        : { label: 'Foil convention', value: s.convention, source: 'user' },
    );
    for (const e of traceForms) {
      traceRows.push({ label: `${e.label.trim()}: copper layer`, value: e.layer, source: 'user' });
      if (e.copperBy === 'weight') {
        traceRows.push(
          e.weightSource === 'foil'
            ? { label: `${e.label.trim()}: weight source`, value: 'foil spec (base foil)', source: 'user' }
            : { label: `${e.label.trim()}: weight source`, value: 'not answered, treated as base foil', source: 'default' },
        );
      } else traceRows.push({ label: `${e.label.trim()}: thickness basis`, value: e.basis, source: e.basis === 'nominal' ? 'default' : 'user' });
    }
  }

  const rv = buildResultView(forView, {
    headline: findTotalDrop(raw.results)?.name ?? 'total voltage drop',
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: RESULT_LABELS,
    skip: [PCT_NAME, 'efficiency', ...perElement],
    skipInputs: ['returnPath'],
    extraRows: [...effRow, ...budgetRow],
    pinWarningCodes: PIN_WARNINGS,
    extraProvenance: traceRows,
  });
  const pctItem = raw.results.find((r) => r.name === PCT_NAME);
  const pctText = pctItem === undefined ? '' : pct(pctItem.value, 'prediction');
  const dotted = (label: string): string => label.replace(/^([^.:]+)\.(\w+)$/, '$1: $2');
  const result: ResultView = {
    ...rv,
    headline: { ...rv.headline, text: pctText === '' ? rv.headline.text : `${rv.headline.text} (${pctText})` },
    details: { ...rv.details, inputs: rv.details.inputs.map((i) => ({ ...i, label: dotted(i.label) })) },
  };

  const table: TableRow[] = analysis.elements.map((e) => ({
    id: e.id,
    name: e.name,
    side: e.side,
    kind: e.kind,
    resistance: print(e.resistance, DIM.RESISTANCE, 'prediction'),
    drop: print(e.drop, DIM.VOLTAGE, 'prediction'),
    loss: print(e.loss, DIM.POWER, 'prediction'),
    share: pct(e.dropShare, 'prediction'),
    provenance: e.provenance,
    limiting: e.id === analysis.limiting.id,
  }));
  const lim = analysis.limiting;
  const limiting = {
    name: limitingName(lim),
    text: `${limitingName(lim)} has the largest voltage drop: ${print(lim.drop, DIM.VOLTAGE, 'prediction')}, ${pct(lim.dropShare, 'prediction')} of the total drop.`,
  };
  return { status: 'ok', result, raw, fieldErrors: c.fieldErrors, notes, callout, table, limiting };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: VoltageDropView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Largest-drop element ${v.limiting.name}. Confidence ${v.result.confidence.level}.`;
    case 'cannot-supply':
      return `No result. ${v.message}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
