// View-model for the path and load (weakest link) page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/path-load analysePathLoad(). The date is handed in.
import { findTotalDrop, isTotalDropName, totalDropLabel } from './total-drop';
import { LAYER_COUNT_INPUTS } from '../../core/calculators/annular-ring/guards';
import { UNRATED_CAUTION, analysePathLoad, type Inputs, type LoadElement } from '../../core/calculators/path-load/calc';
import type { LayerCountInput } from '../../core/calculators/path-load/guards';
import { meta } from '../../core/calculators/path-load/meta';
import { DEFAULT_FOIL_CONVENTION } from '../../core/data/constants';
import { formatMargin, formatPercent, formatResult, formatUtilisation, type HeadlineOpts } from '../../core/format-result';
import { NET_CLASS_KEYS, type Bound, type CalcExport, type CalcResult, type CopperBasisKind, type ElementResult } from '../../core/result';
import { DIM, FOIL_CONVENTIONS, q, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { MAX_HASH_LENGTH, MAX_STATE_KEYS, RESERVED_STATE_KEYS, decodeList, encodeList, serializeHash, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { conventionSpreadText, echoPrefs, headlinePrefs, type CopperLayer, type Units } from '../components/prefs';
import { buildResultView, ledgerView, MAX_FIELD_CHARS, parseField, type FieldView, type LedgerEntryView, type ProvenanceRow, type ResultView } from '../components/view';
import { BUNDLED_LABEL, bundledProfile, choiceFromHash, choiceToHash, type ProfileChoice } from './fab-profile-choice';
import { profileBanner as sharedProfileBanner, type ProfileBanner } from './fab-profile-banner';
import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';
import { parseCount } from './via.vm';
import {
  LAYER_OPTIONS,
  RETURN_PATH_OPTIONS,
  RETURN_PATH_QUESTION,
  TEMPERATURE_DIM,
  VSOURCE_DIM,
  isLoadKind,
  isReturnPath,
  loadDim,
  LOAD_OPTIONS,
  parseBudget,
  type LoadKind,
} from './voltage-drop.vm';
import type { ReturnPath } from '../../core/calculators/voltage-drop/guards';

export const CALCULATOR_ID = 'path-load';
export type { Units, LoadKind };
export { LAYER_OPTIONS, LOAD_OPTIONS, RETURN_PATH_OPTIONS, RETURN_PATH_QUESTION, TEMPERATURE_DIM, VSOURCE_DIM, isLoadKind, isReturnPath, loadDim, parseBudget };

export type ElementKind = 'trace' | 'via' | 'connector' | 'pad' | 'spoke' | 'pour-neck' | 'cable' | 'resistance';
export type CopperBy = 'weight' | 'thickness';
export type Side = 'forward' | 'return';

/** Most elements per list (the core allows the same). 12 + 12 elements fit the hash (64 keys, 8192 characters) when labels and notes are of ordinary length. */
export const MAX_FORWARD_ELEMENTS = meta.validity.maxForwardElements;
export const MAX_RETURN_ELEMENTS = meta.validity.maxReturnElements;
export const LABEL_MAX_CHARS = 60;
export const NOTE_MAX_CHARS = 120;

export const CAP_MESSAGE = (side: Side, max: number): string =>
  `At most ${String(max)} ${side} elements are supported on this page. Combine elements or remove one.`;

export const ELEMENT_KIND_OPTIONS: readonly { readonly value: ElementKind; readonly label: string; readonly base: string }[] = [
  { value: 'trace', label: 'Copper trace', base: 'trace' },
  { value: 'via', label: 'Via (or array of vias in parallel)', base: 'via' },
  { value: 'connector', label: 'Connector (your resistance)', base: 'connector' },
  { value: 'pad', label: 'Pad (your resistance)', base: 'pad' },
  { value: 'spoke', label: 'Thermal spoke (your resistance)', base: 'spoke' },
  { value: 'pour-neck', label: 'Pour neck (your resistance)', base: 'pour neck' },
  { value: 'cable', label: 'Cable (your resistance)', base: 'cable' },
  { value: 'resistance', label: 'Other resistance (your value)', base: 'resistance' },
];
const KIND_LABEL: Readonly<Record<ElementKind, string>> = Object.fromEntries(ELEMENT_KIND_OPTIONS.map((o) => [o.value, o.label])) as Record<ElementKind, string>;
const KIND_SHORT: Readonly<Record<ElementKind, string>> = {
  trace: 'copper trace',
  via: 'via',
  connector: 'connector',
  pad: 'pad',
  spoke: 'thermal spoke',
  'pour-neck': 'pour neck',
  cable: 'cable',
  resistance: 'resistance',
};
export const kindShort = (k: ElementKind): string => KIND_SHORT[k];
export const isUserKind = (k: ElementKind): boolean => k !== 'trace' && k !== 'via';

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
  /** Trace only: the temperature RISE allowed (a difference, never an absolute temperature). Required, never defaulted. */
  readonly rise: string;
  /** Via only. */
  readonly hole: string;
  readonly plating: string;
  readonly barrel: string;
  readonly count: string;
  readonly drill: string;
  readonly pad: string;
  /** User elements only (connector, pad, spoke, pour neck, cable, resistance). */
  readonly resistance: string;
  readonly note: string;
  /** Via and user elements: the optional rating pair. Both or neither. */
  readonly rated: string;
  readonly ratingSource: string;
}

export interface PathLoadState {
  readonly vsource: string;
  /** '' means not chosen. */
  readonly loadKind: LoadKind | '';
  readonly loadValue: string;
  /** '' means not chosen: the return path is never defaulted. */
  readonly returnPath: ReturnPath | '';
  readonly elements: readonly ElementForm[];
  /** Only used with returnPath 'included-in-list'. */
  readonly returnElements: readonly ElementForm[];
  readonly budget: string;
  /** Conductor temperature of every trace and via. Empty means the 25 °C engineering default. */
  readonly temperature: string;
  /** '' means the default convention (an assumption). */
  readonly convention: FoilConvention | '';
  /** '' means not chosen: the profile is never pre-selected. Optional: the page works without one. */
  readonly profile: ProfileChoice;
  readonly layerCount: LayerCountInput | '';
  readonly units: Units;
}

export const DEFAULT_STATE: PathLoadState = Object.freeze({
  vsource: '',
  loadKind: '',
  loadValue: '',
  returnPath: '',
  elements: [],
  returnElements: [],
  budget: '',
  temperature: '',
  convention: '',
  profile: '',
  layerCount: '',
  units: 'metric',
});

export const METHOD_TEXT =
  'Method: DC series path of traces, vias and user-rated elements feeding one load; utilisation = applied current / allowed current of each rated element';
export const DEFAULT_TEXT = { temperature: `${String(meta.defaults.conductorTemperatureC)} °C (engineering default, not from a standard)` } as const;
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';
export const PROFILE_QUESTION = 'Fab profile for the clearance in the net-class export (optional)';
export const PROFILE_HELP =
  'No default: choose one, or leave it. Without a profile no clearance is exported. A profile supplies a clearance only for the exact layer count, layer side and copper weight you give.';
export const NO_PROFILE_NOTE = 'No fab profile is in use: no clearance is exported, and none is assumed.';
export const RATING_HELP =
  'Optional pair: the rated current of this whole element and where it comes from. Give both or neither. Without a rating the element is not ranked and may be the real limit.';
export const NET_CLASS_HEADING = 'Net-class values (mm and mil)';

export const LAYER_COUNT_OPTIONS: readonly { value: LayerCountInput | ''; label: string }[] = [
  { value: '', label: 'Not given' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: 'multilayer', label: 'Multilayer (4 or more)' },
];
export function isLayerCount(v: string): v is LayerCountInput {
  return (LAYER_COUNT_INPUTS as readonly string[]).includes(v);
}

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
    rise: '',
    hole: '',
    plating: '',
    barrel: '',
    count: '',
    drill: '',
    pad: '',
    resistance: '',
    note: '',
    rated: '',
    ratingSource: '',
  };
}

const LIST_MAX: Readonly<Record<Side, number>> = { forward: MAX_FORWARD_ELEMENTS, return: MAX_RETURN_ELEMENTS };

/** Adds a blank element with a unique default label, or refuses (with the message) at the cap. */
export function addElement(list: readonly ElementForm[], kind: ElementKind, side: Side): { elements: readonly ElementForm[]; message?: string } {
  const max = LIST_MAX[side];
  if (list.length >= max) return { elements: list, message: CAP_MESSAGE(side, max) };
  const base = `${side === 'return' ? 'return ' : ''}${ELEMENT_KIND_OPTIONS.find((o) => o.value === kind)?.base ?? kind}`;
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
// Hash state. Keys are documented in CALCULATOR_STATE_KEYS['path-load'] (src/state/hash.ts).
// Elements: fe1..fe12 (forward) and re1..re12 (return), numbered from 1 without gaps, one list-encoded value each:
//   trace t ~ label ~ layer ~ length ~ width ~ copperBy(w|t) ~ weight ~ thickness ~ basis ~ weightSource ~ rise
//   via   v ~ label ~ hole ~ plating ~ barrel ~ count ~ drill ~ pad ~ rated ~ ratingSource
//   user  c|p|s|n|k|r ~ label ~ resistance ~ note ~ rated ~ ratingSource
// The page writes each element value percent-encoded twice (once by encodeList, once by the hash serializer); a link with a
// single encoding reads to the same state. shareHash() is the one place a link is made, for the page and the length check.
// ---------------------------------------------------------------------------
const slotKey = (side: Side, n: number): string => `${side === 'forward' ? 'fe' : 're'}${String(n)}`;
export const WRITTEN_KEYS: readonly string[] = [...stateKeyNames(CALCULATOR_ID), 'fp', 'u'];

const KIND_CODE: Readonly<Record<ElementKind, string>> = { trace: 't', via: 'v', connector: 'c', pad: 'p', spoke: 's', 'pour-neck': 'n', cable: 'k', resistance: 'r' };
const CODE_KIND: Readonly<Record<string, ElementKind>> = Object.fromEntries(Object.entries(KIND_CODE).map(([k, c]) => [c, k as ElementKind]));

function encodeElement(e: ElementForm): string {
  const f = (s: string): string => s.slice(0, MAX_FIELD_CHARS);
  const label = e.label.slice(0, LABEL_MAX_CHARS);
  const code = KIND_CODE[e.kind];
  if (e.kind === 'trace') {
    return encodeList([code, label, e.layer, f(e.length), f(e.width), e.copperBy === 'weight' ? 'w' : 't', f(e.copperWeight), f(e.copperThickness), e.basis, e.weightSource, f(e.rise)]);
  }
  const rating = [f(e.rated), e.ratingSource.slice(0, NOTE_MAX_CHARS)];
  if (e.kind === 'via') return encodeList([code, label, f(e.hole), f(e.plating), f(e.barrel), f(e.count), f(e.drill), f(e.pad), ...rating]);
  return encodeList([code, label, f(e.resistance), e.note.slice(0, NOTE_MAX_CHARS), ...rating]);
}

/** State to put in the hash. Defaults are omitted; the return path, load kind, layers and profile are only written from a user choice. */
export function toHashState(s: PathLoadState): Record<string, string> {
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
  if (s.layerCount !== '') out['lc'] = s.layerCount;
  const fp = choiceToHash(s.profile);
  if (fp !== undefined) out['fp'] = fp;
  s.elements.slice(0, MAX_FORWARD_ELEMENTS).forEach((e, i) => {
    out[slotKey('forward', i + 1)] = encodeElement(e);
  });
  s.returnElements.slice(0, MAX_RETURN_ELEMENTS).forEach((e, i) => {
    out[slotKey('return', i + 1)] = encodeElement(e);
  });
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

/** The link hash for a state: exactly what the page writes to the address bar. */
export function shareHash(s: PathLoadState): string {
  return serializeHash({ name: 'calc', id: CALCULATOR_ID }, toHashState(s));
}

const SAFETY_MARGIN_CHARS = 192;
/** A sentence when the link for this state would be too long (or have too many keys) to be loaded again, else undefined. */
export function shareLengthNote(s: PathLoadState): string | undefined {
  const h = toHashState(s);
  const hash = shareHash(s);
  if (hash.length > MAX_HASH_LENGTH - SAFETY_MARGIN_CHARS) {
    return `The link for this state is too long to be loaded again (${String(hash.length)} characters; the limit is ${String(MAX_HASH_LENGTH)}, and a longer link is discarded). Shorten the labels, source notes and rating sources, or remove elements, before sharing the link.`;
  }
  if (Object.keys(h).length + 1 > MAX_STATE_KEYS - 4) {
    return `The link for this state has too many settings to be loaded again (the limit is ${String(MAX_STATE_KEYS)}). Remove elements before sharing the link.`;
  }
  return undefined;
}

export interface LoadedState {
  readonly state: PathLoadState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function decodeElement(raw: string, where: string, notices: string[]): ElementForm | undefined {
  const p = decodeList(raw);
  const kind = CODE_KIND[p[0] ?? ''];
  if (kind === undefined) {
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
  const base = newElement(kind, label);
  if (kind === 'trace') {
    let e: ElementForm = { ...base, length: field(3, 'the length'), width: field(4, 'the width'), copperWeight: field(6, 'the copper weight'), copperThickness: field(7, 'the copper thickness'), rise: field(10, 'the temperature rise') };
    const layer = p[2] ?? '';
    if (layer === 'outer' || layer === 'inner') e = { ...e, layer };
    else if (layer !== '') notices.push(`${where}: the copper layer was not recognised: no layer is chosen. Choose outer or inner.`);
    const cb = p[5] ?? 'w';
    if (cb === 't') e = { ...e, copperBy: 'thickness' };
    else if (cb !== 'w') notices.push(`${where}: how copper is specified was not recognised: weight is used instead.`);
    const basis = p[8] ?? 'nominal';
    if (basis === 'nominal' || basis === 'finished' || basis === 'measured') e = { ...e, basis };
    else notices.push(`${where}: the thickness basis was not recognised: nominal is used instead.`);
    return { ...e, weightSource: weightSourceFromHash(p[9] === '' ? undefined : p[9], notices) };
  }
  if (kind === 'via') {
    return {
      ...base,
      hole: field(2, 'the finished hole'),
      plating: field(3, 'the plating thickness'),
      barrel: field(4, 'the barrel length'),
      count: field(5, 'the via count'),
      drill: field(6, 'the drill diameter'),
      pad: field(7, 'the pad diameter'),
      rated: field(8, 'the rated current'),
      ratingSource: field(9, 'the rating source', NOTE_MAX_CHARS),
    };
  }
  return { ...base, resistance: field(2, 'the resistance'), note: field(3, 'the source note', NOTE_MAX_CHARS), rated: field(4, 'the rated current'), ratingSource: field(5, 'the rating source', NOTE_MAX_CHARS) };
}

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: PathLoadState = DEFAULT_STATE;
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
  const lc = get('lc');
  if (lc !== undefined) {
    if (isLayerCount(lc)) s = { ...s, layerCount: lc };
    else notices.push('The layer count was not recognised: none is given.');
  }
  const fp = get('fp');
  if (fp !== undefined) {
    const c = choiceFromHash(fp);
    if (c !== undefined) s = { ...s, profile: c };
    else notices.push('The fab profile in the link is not one this version knows: no profile is chosen. Choose one, or none.');
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
// Fab profile banner (same content as the annular ring page)
// ---------------------------------------------------------------------------
export type { ProfileBanner };

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? '' : 's'}`;

/** The banner for an active profile (shown in every state of the page). Undefined when no profile is in use. */
export function profileBanner(s: Pick<PathLoadState, 'profile'>, today: string): ProfileBanner | undefined {
  return sharedProfileBanner(s.profile, today);
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldErrors = Readonly<Record<string, string>>;

export type ElementField =
  | 'label'
  | 'layer'
  | 'length'
  | 'width'
  | 'copperWeight'
  | 'copperThickness'
  | 'rise'
  | 'hole'
  | 'plating'
  | 'barrel'
  | 'count'
  | 'drill'
  | 'pad'
  | 'resistance'
  | 'note'
  | 'rated'
  | 'ratingSource';
export const elementFieldKey = (side: Side, index: number, field: ElementField): string => `${side === 'forward' ? 'f' : 'r'}${String(index)}.${field}`;

type QuantityField = 'length' | 'width' | 'copperWeight' | 'copperThickness' | 'rise' | 'hole' | 'plating' | 'barrel' | 'drill' | 'pad' | 'resistance' | 'rated';
const FIELD_DIM: Readonly<Record<QuantityField, Dim>> = {
  length: DIM.LENGTH,
  width: DIM.LENGTH,
  copperWeight: DIM.AREAL_MASS,
  copperThickness: DIM.LENGTH,
  rise: DIM.TEMPERATURE_DIFFERENCE,
  hole: DIM.LENGTH,
  plating: DIM.LENGTH,
  barrel: DIM.LENGTH,
  drill: DIM.LENGTH,
  pad: DIM.LENGTH,
  resistance: DIM.RESISTANCE,
  rated: DIM.CURRENT,
};
export function elementFieldDim(f: QuantityField): Dim {
  return FIELD_DIM[f];
}
const ECHO_KIND: Readonly<Record<QuantityField, 'width' | 'thickness' | 'other'>> = {
  length: 'width',
  width: 'width',
  copperWeight: 'other',
  copperThickness: 'thickness',
  rise: 'other',
  hole: 'width',
  plating: 'thickness',
  barrel: 'width',
  drill: 'width',
  pad: 'width',
  resistance: 'other',
  rated: 'other',
};
export function elementEchoPrefs(units: Units, f: QuantityField): DisplayPrefs {
  return echoPrefs(units, ECHO_KIND[f]);
}
/** The via count as a field view (a plain whole number). */
export { parseCountField } from './via.vm';

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface TableRow {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly kind: ElementKind;
  readonly kindLabel: string;
  readonly rank: number;
  readonly weakest: boolean;
  readonly resistance: string;
  readonly drop: string;
  readonly loss: string;
  readonly share: string;
  readonly limit: string;
  readonly limitBasis: string;
  readonly limitSource: string;
  /** Text tag for where the limit comes from: legacy IPC-2221 with its ledger status, or user-supplied. */
  readonly limitBadge: string;
  readonly limitUnverified: boolean;
  readonly utilisation: string;
  readonly margin: string;
  readonly over: boolean;
  readonly overTag: string;
}

export interface UnratedRow {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly kind: ElementKind;
  readonly kindLabel: string;
  readonly resistance: string;
  readonly drop: string;
  readonly loss: string;
  readonly share: string;
}

export interface NetClassValue {
  readonly key: string;
  readonly label: string;
  /** Printed through format-result: mm and mil together. */
  readonly text: string;
  /** Status tags: where the value comes from, ledger or profile status, age, stale. Text, never colour alone. */
  readonly tags: readonly string[];
  readonly unverified: boolean;
}

export interface NetClassGroup {
  readonly id: string;
  readonly title: string;
  readonly values: readonly NetClassValue[];
  /** The core's reason a trace net class has no clearance. */
  readonly clearanceReason: string | undefined;
  /** The core's full note for this export. */
  readonly note: string;
}

export interface NetClassBlock {
  readonly heading: string;
  readonly startingPoint: string;
  readonly groups: readonly NetClassGroup[];
  readonly empty: string | undefined;
  readonly plainText: string;
}

export interface TotalRow {
  readonly label: string;
  readonly text: string;
}

export type PathLoadView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | { readonly status: 'cannot-supply'; readonly message: string; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly weakest: { readonly name: string; readonly kindLabel: string; readonly utilisation: string } | undefined;
      readonly headlineCallout: { readonly heading: string; readonly text: string };
      readonly scope: { readonly heading: string; readonly text: string } | undefined;
      readonly table: readonly TableRow[];
      readonly unratedHeading: string;
      readonly unratedText: string;
      readonly unrated: readonly UnratedRow[];
      readonly totals: readonly TotalRow[];
      readonly netClass: NetClassBlock;
      readonly ledgerRows: readonly (LedgerEntryView & { readonly role: string })[];
      readonly userSupplied: readonly string[];
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
const TOTAL_NAMES = ['load voltage', 'total power loss', 'efficiency', PCT_NAME] as const;
const PIN_WARNINGS = ['OVER_LIMIT', 'RETURN_NOT_COUNTED', 'DROP_BUDGET_EXCEEDED', 'SELF_HEATING_NOT_COUPLED', 'DEFERRED_SCOPE'] as const;
export const SCOPE_HEADING = 'What this path covers';

const NEEDS = {
  vsource: 'Enter the source voltage (for example 12 V).',
  loadKind: 'Choose what describes the load: current, power, resistance or voltage.',
  returnPath: 'Choose how the return path is counted. It is not assumed.',
  elements: 'Add at least one path element (a trace, a via or a resistance) to the forward path.',
} as const;
const SIDE_NAME: Readonly<Record<Side, string>> = { forward: 'Forward', return: 'Return' };
const RATING_PAIR_MESSAGE = 'Give both the rated current and where it comes from, or leave both empty.';

const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-001': 'Legacy trace current limit (curve fit, secondary sources only; paywalled standard not read).',
  'S-010': 'Chart range of the legacy method (paywalled, secondary source).',
  'S-004': 'Copper resistivity for trace and via resistance.',
  'S-012': 'Plated copper resistivity: not researched; the pure-copper default is non-conservative.',
  'S-019': 'Series resistance, drop and loss.',
  'S-019h': 'Constant-power load model.',
  'S-018': 'Inner-layer remark used to word a caution only.',
};
const LEDGER_LEAD = /^(S-019[i-m])$/;
const profileRole = (id: string): string => (LEDGER_LEAD.test(id) ? 'Fab profile data (example): holes, ring, clearance, trace and plating limits.' : '');

interface Collected {
  readonly needs: string[];
  readonly problems: string[];
  readonly fieldErrors: Record<string, string>;
  readonly notes: string[];
}

/** Parses one element. Returns the core element when everything needed is present and valid. */
function readElement(e: ElementForm, side: Side, index: number, s: PathLoadState, c: Collected, temperature: Quantity | undefined): LoadElement | undefined {
  const where = `${SIDE_NAME[side]} element ${String(index + 1)}${e.label.trim() !== '' ? ` (${e.label.trim()})` : ''}`;
  const key = (f: ElementField): string => elementFieldKey(side, index, f);
  let missing = false;
  let bad = false;
  const need = (text: string): void => {
    c.needs.push(`${where}: ${text}`);
    missing = true;
  };
  const read = (f: QuantityField, text: string, label: string): Quantity | undefined => {
    const v: FieldView = parseField(text, FIELD_DIM[f], elementEchoPrefs(s.units, f));
    if (v.status === 'error') {
      c.problems.push(`${where}: ${label}: ${v.message}`);
      c.fieldErrors[key(f)] = v.message;
      bad = true;
      return undefined;
    }
    return v.status === 'empty' ? undefined : v.value;
  };
  if (e.label.trim() === '') need('give it a label (it names the element in the results).');
  if (e.label.length > meta.validity.labelMaxLength) {
    c.problems.push(`${where}: the label is too long (at most ${String(meta.validity.labelMaxLength)} characters).`);
    bad = true;
  }
  // The rating pair (via and user elements).
  const pair = (): { ratedCurrent?: Quantity; ratingSource?: string } => {
    const rated = read('rated', e.rated, 'Rated current');
    const src = e.ratingSource.trim();
    if (rated !== undefined && src === '') {
      c.problems.push(`${where}: ${RATING_PAIR_MESSAGE}`);
      c.fieldErrors[key('ratingSource')] = RATING_PAIR_MESSAGE;
      bad = true;
    } else if (rated === undefined && src !== '' && !bad && e.rated.trim() === '') {
      c.problems.push(`${where}: ${RATING_PAIR_MESSAGE}`);
      c.fieldErrors[key('rated')] = RATING_PAIR_MESSAGE;
      bad = true;
    }
    return rated !== undefined && src !== '' ? { ratedCurrent: rated, ratingSource: src } : {};
  };

  if (e.kind === 'via') {
    const hole = read('hole', e.hole, 'Finished hole diameter');
    if (hole === undefined && !bad && e.hole.trim() === '') need('enter the finished hole diameter (after plating, not the drill, for example 0.3 mm).');
    const plating = read('plating', e.plating, 'Plating thickness');
    if (plating === undefined && !bad && e.plating.trim() === '') need('enter the plating thickness (required, never filled in for you; take it from your fabricator).');
    const barrel = read('barrel', e.barrel, 'Barrel length');
    if (barrel === undefined && !bad && e.barrel.trim() === '') need('enter the barrel length (board thickness for a through via, for example 1.6 mm).');
    const n = parseCount(e.count);
    let count: number | undefined;
    if (n.status === 'error') {
      c.problems.push(`${where}: Number of vias: ${n.message}`);
      c.fieldErrors[key('count')] = n.message;
      bad = true;
    } else if (n.status === 'empty') need('enter the number of vias in parallel (1 for a single via).');
    else count = n.value;
    const drill = read('drill', e.drill, 'Drill diameter');
    const pad = read('pad', e.pad, 'Pad diameter');
    const rating = pair();
    if (missing || bad || hole === undefined || plating === undefined || barrel === undefined || count === undefined) return undefined;
    return {
      kind: 'via',
      label: e.label.trim(),
      finishedHoleDiameter: hole,
      platingThickness: plating,
      barrelLength: barrel,
      count,
      ...(temperature !== undefined ? { conductorTemperature: temperature } : {}),
      ...(drill !== undefined ? { drillDiameter: drill } : {}),
      ...(pad !== undefined ? { padDiameter: pad } : {}),
      ...rating,
    };
  }

  if (e.kind !== 'trace') {
    const r = read('resistance', e.resistance, 'Resistance');
    if (r === undefined && !bad && e.resistance.trim() === '') need('enter the resistance (for example 10 mΩ).');
    if (e.note.trim() === '') need('say where this resistance comes from (datasheet, measurement, estimate). It is shown as user-supplied.');
    const rating = pair();
    if (missing || bad || r === undefined) return undefined;
    return { kind: e.kind, label: e.label.trim(), resistance: r, sourceNote: e.note.trim(), ...rating };
  }

  const length = read('length', e.length, 'Length');
  if (length === undefined && !bad && e.length.trim() === '') need('enter the trace length (for example 100 mm or 4 in).');
  const width = read('width', e.width, 'Width');
  if (width === undefined && !bad && e.width.trim() === '') need('enter the trace width (for example 1 mm or 40 mil).');
  if (e.layer === '') need('choose a copper layer: outer or inner. It is not assumed.');
  let weight: Quantity | undefined;
  let thickness: Quantity | undefined;
  if (e.copperBy === 'weight') {
    if (e.weightSource === 'finished') need(FINISHED_NEEDS);
    weight = read('copperWeight', e.copperWeight, 'Copper weight');
    if (weight === undefined && !bad && e.weightSource !== 'finished') need('enter the copper weight (for example 1 oz).');
    if (weight !== undefined && e.weightSource === '' && !c.notes.includes(NOT_ANSWERED_NOTE)) c.notes.push(NOT_ANSWERED_NOTE);
  } else {
    thickness = read('copperThickness', e.copperThickness, 'Copper thickness');
    if (thickness === undefined && !bad && e.copperThickness.trim() === '') need('enter the copper thickness (for example 35 um).');
  }
  const rise = read('rise', e.rise, 'Allowed temperature rise');
  if (rise === undefined && !bad && e.rise.trim() === '') need('enter the temperature RISE you allow for this trace (a difference such as 20 K, not an absolute temperature). It sets the legacy current limit and is never assumed.');
  if (missing || bad || length === undefined || width === undefined || rise === undefined || e.layer === '') return undefined;
  return {
    kind: 'trace',
    label: e.label.trim(),
    layer: e.layer,
    length,
    width,
    ...(e.copperBy === 'weight' ? (weight !== undefined ? { copperWeight: weight } : {}) : { ...(thickness !== undefined ? { copperThickness: thickness } : {}), copperBasis: e.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...(temperature !== undefined ? { conductorTemperature: temperature } : {}),
    allowedTempRise: rise,
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
const CORE_FIELD: Readonly<Record<string, ElementField | 'temperature'>> = {
  allowedTempRise: 'rise',
  finishedHoleDiameter: 'hole',
  platingThickness: 'plating',
  barrelLength: 'barrel',
  drillDiameter: 'drill',
  padDiameter: 'pad',
  ratedCurrent: 'rated',
  ratingSource: 'ratingSource',
  sourceNote: 'note',
  conductorTemperature: 'temperature',
  barrelLen: 'barrel',
};
const PAGE_FIELDS: readonly string[] = ['label', 'layer', 'length', 'width', 'copperWeight', 'copperThickness', 'count', 'resistance'];

/** Core error field name to the page's field key. */
function pageFieldOf(field: string | undefined): string | undefined {
  if (field === undefined) return undefined;
  const m = ELEMENT_ERR.exec(field);
  if (m !== null) {
    const raw = m[3] ?? '';
    const f = CORE_FIELD[raw] ?? (PAGE_FIELDS.includes(raw) ? raw : undefined);
    if (f === undefined) return undefined;
    if (f === 'temperature') return 'temperature';
    return `${m[1] === 'elements' ? 'f' : 'r'}${m[2] ?? '0'}.${f}`;
  }
  if (field === 'vsource') return 'vsource';
  if (LOAD_ERR_FIELDS.includes(field)) return 'loadValue';
  if (field === 'dropBudgetPercent') return 'budget';
  if (field === 'layerCount') return 'layerCount';
  return undefined;
}

const capFirst = (t: string): string => (t === '' ? t : t.charAt(0).toUpperCase() + t.slice(1));
const dotted = (label: string): string => label.replace(/^([^.:]+)\.(\w+)$/, '$1: $2');
const namesOf = (names: readonly string[]): string => names.map((n) => `"${n}"`).join(', ');

/**
 * Parses the form and runs the calculator. `today` (YYYY-MM-DD) is handed in by the page: the core never reads a clock.
 * Returns 'ok' only when the calculator returned a result. Invalid or missing input yields a message naming the field,
 * never a number.
 */
export function computeView(s: PathLoadState, today: string): PathLoadView {
  const c: Collected = { needs: [], problems: [], fieldErrors: {}, notes: [] };
  const prefsOther = echoPrefs(s.units, 'other');

  const vs = parseField(s.vsource, VSOURCE_DIM, prefsOther);
  if (vs.status === 'error') {
    c.problems.push(`Source voltage: ${vs.message}`);
    c.fieldErrors['vsource'] = vs.message;
  } else if (vs.status === 'empty') c.needs.push(NEEDS.vsource);

  let loadQ: Quantity | undefined;
  if (s.loadKind === '') c.needs.push(NEEDS.loadKind);
  else {
    const o = LOAD_OPTIONS.find((x) => x.value === s.loadKind);
    const v = parseField(s.loadValue, loadDim(s.loadKind), prefsOther);
    const name = o?.fieldLabel ?? 'Load';
    if (v.status === 'error') {
      c.problems.push(`${name}: ${v.message}`);
      c.fieldErrors['loadValue'] = v.message;
    } else if (v.status === 'empty') c.needs.push(`Enter the ${name.toLowerCase()} (for example ${o?.placeholder ?? '2 A'}).`);
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

  const useProfile = s.profile === 'bundled';
  const profile = bundledProfile();
  if (useProfile && profile === null) {
    c.problems.push('The bundled fab profile could not be read, so no profile values are available. Choose none and enter your own values.');
  }

  const returnListed = s.returnPath === 'included-in-list';
  if (s.elements.length === 0) c.needs.push(NEEDS.elements);
  if (s.elements.length > MAX_FORWARD_ELEMENTS) c.problems.push(CAP_MESSAGE('forward', MAX_FORWARD_ELEMENTS));
  if (returnListed && s.returnElements.length > MAX_RETURN_ELEMENTS) c.problems.push(CAP_MESSAGE('return', MAX_RETURN_ELEMENTS));
  const fwd: LoadElement[] = [];
  const ret: LoadElement[] = [];
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
    ...(useProfile && profile !== null ? { fabProfile: profile, today, ...(s.layerCount !== '' ? { layerCount: s.layerCount } : {}) } : {}),
  };
  const out = analysePathLoad(inputs);
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
  const used = [...s.elements, ...(returnListed ? s.returnElements : [])];
  const hasTrace = used.some((e) => e.kind === 'trace');
  const accuracyClass = hasTrace ? meta.accuracyClass : meta.accuracyClassNoTraceLimit;
  const prefs = headlinePrefs(s.units);
  const opts: HeadlineOpts = { accuracyClass, prefs, lengthRole: 'geometry' };
  const print = (n: number, dim: Dim, bound: Bound): string => formatResult({ value: q(n, dim), bound }, opts);
  const pct = (x: Quantity | number, bound: Bound): string => formatPercent(x, bound, { accuracyClass });
  const elementOf = (id: string): ElementResult | undefined => raw.elements?.find((x) => x.id === id);
  const legacyStatus = ledgerView(['S-001']).worst;
  const kindOf = (k: ElementKind): string => KIND_LABEL[k];

  // Ranked table (rated elements) and the unrated block.
  const table: TableRow[] = analysis.ranked.map((e, i): TableRow => {
    const el = elementOf(e.id);
    const lim = e.limit;
    const userSupplied = lim?.userSupplied === true;
    const over = el !== undefined && el.margin.si < 0;
    return {
      id: e.id,
      name: e.name,
      side: e.side,
      kind: e.kind,
      kindLabel: kindOf(e.kind),
      rank: i + 1,
      weakest: i === 0,
      resistance: print(e.resistance, DIM.RESISTANCE, 'prediction'),
      drop: print(e.drop, DIM.VOLTAGE, 'prediction'),
      loss: print(e.loss, DIM.POWER, 'prediction'),
      share: pct(e.dropShare, 'prediction'),
      limit: el === undefined ? '' : formatResult({ value: el.limit, bound: 'max-capacity' }, opts),
      limitBasis: 'Current: utilisation = applied current / allowed current',
      limitSource: lim?.source ?? '',
      limitBadge: userSupplied ? 'user-supplied (no ledger status, not checked)' : `legacy IPC-2221, ledger S-001, ${legacyStatus}`,
      limitUnverified: !userSupplied && legacyStatus !== 'VERIFIED',
      utilisation: formatUtilisation(e.utilisation ?? 0),
      margin: el === undefined ? '' : formatMargin(el, opts),
      over,
      overTag: over ? 'Over limit' : '',
    };
  });
  const unrated: UnratedRow[] = analysis.unrated.map((e) => ({
    id: e.id,
    name: e.name,
    side: e.side,
    kind: e.kind,
    kindLabel: kindOf(e.kind),
    resistance: print(e.resistance, DIM.RESISTANCE, 'prediction'),
    drop: print(e.drop, DIM.VOLTAGE, 'prediction'),
    loss: print(e.loss, DIM.POWER, 'prediction'),
    share: pct(e.dropShare, 'prediction'),
  }));
  const unratedNames = unrated.map((u) => u.name);
  const weakestState = analysis.weakest;
  const weakest = weakestState === undefined ? undefined : { name: weakestState.name, kindLabel: kindOf(weakestState.kind), utilisation: formatUtilisation(weakestState.utilisation ?? 0) };

  const headlineCallout =
    weakest !== undefined
      ? {
          heading: 'Weakest link among rated elements only',
          text: `${capFirst(UNRATED_CAUTION)}. ${unrated.length > 0 ? `Not ranked: ${namesOf(unratedNames)}.` : 'Every listed element has a limit, but any element you did not list is not in the path at all.'} A utilisation below 100 % is not a statement that the path is adequate.`,
        }
      : {
          heading: 'No weakest link: no element has a current limit',
          text: `No element has a rating, so there is no weakest link to name and the headline is the total voltage drop. ${capFirst(UNRATED_CAUTION)}. Not ranked: ${namesOf(unratedNames)}.`,
        };
  const unratedHeading = 'Elements with no current rating (not ranked)';
  const unratedText = `${capFirst(UNRATED_CAUTION)}. Enter a rating from the datasheet or drawing, with its source, to rank an element.`;

  // Totals.
  const item = (n: string) => raw.results.find((r) => r.name === n);
  const totals: TotalRow[] = [];
  const dropItem = findTotalDrop(raw.results);
  const pctItem = item(PCT_NAME);
  if (dropItem !== undefined) totals.push({ label: totalDropLabel(dropItem.name), text: `${formatResult(dropItem, opts)}${pctItem === undefined ? '' : ` (${pct(pctItem.value, 'prediction')} of the source)`}` });
  const lv = item('load voltage');
  if (lv !== undefined) totals.push({ label: 'Load voltage', text: formatResult(lv, opts) });
  const lossItem = item('total power loss');
  if (lossItem !== undefined) totals.push({ label: 'Total power loss', text: formatResult(lossItem, opts) });
  const effItem = item('efficiency');
  if (effItem !== undefined) totals.push({ label: RESULT_LABELS['efficiency'] ?? 'Efficiency', text: pct(effItem.value, effItem.bound) });
  if (budget !== undefined && !raw.warnings.some((w) => w.code === 'DROP_BUDGET_EXCEEDED')) {
    totals.push({ label: 'Drop budget', text: `${pct(budget.si, 'prediction')} of the source, not exceeded` });
  }

  // Net-class export.
  const netClass = buildNetClass(raw.exports ?? [], opts, legacyStatus, hasTrace || used.some((e) => e.kind === 'via'));

  // Result view (the generic part).
  const perElement = new Set<string>();
  for (const e of analysis.elements) for (const p of ['resistance', 'voltage drop', 'power loss', 'share of total drop']) perElement.add(`${p}: ${e.name}`);
  for (const e of analysis.ranked) for (const p of ['current limit', 'utilisation', 'margin']) perElement.add(`${p}: ${e.name}`);
  const scopeWarning = raw.warnings.find((w) => w.code === 'PATH_SCOPE');
  const scope = scopeWarning === undefined ? undefined : { heading: SCOPE_HEADING, text: scopeWarning.message };
  const forView: CalcResult = { ...raw, warnings: raw.warnings.filter((w) => w.code !== 'PATH_SCOPE') };

  const extra: ProvenanceRow[] = [{ label: 'Return path', value: RETURN_PATH_OPTIONS.find((o) => o.value === s.returnPath)?.label ?? s.returnPath, source: 'user' }];
  const traceForms = used.filter((e) => e.kind === 'trace');
  if (traceForms.length > 0) {
    extra.push(
      s.convention === ''
        ? { label: 'Foil convention', value: DEFAULT_FOIL_CONVENTION, source: 'default', detail: `conventions differ by up to ${conventionSpreadText()}` }
        : { label: 'Foil convention', value: s.convention, source: 'user' },
    );
    for (const e of traceForms) {
      extra.push({ label: `${e.label.trim()}: copper layer`, value: e.layer, source: 'user' });
      if (e.copperBy === 'weight') {
        extra.push(
          e.weightSource === 'foil'
            ? { label: `${e.label.trim()}: weight source`, value: 'foil spec (base foil)', source: 'user' }
            : { label: `${e.label.trim()}: weight source`, value: 'not answered, treated as base foil', source: 'default' },
        );
      } else extra.push({ label: `${e.label.trim()}: thickness basis`, value: e.basis, source: e.basis === 'nominal' ? 'default' : 'user' });
    }
  }
  extra.push({ label: 'Fab profile', value: useProfile ? BUNDLED_LABEL : 'none / not chosen', source: 'user' });

  const rv = buildResultView(forView, {
    headline: weakest !== undefined ? 'weakest-link utilisation' : (dropItem?.name ?? 'total voltage drop'),
    accuracyClass,
    prefs,
    lengthRole: 'geometry',
    labels: RESULT_LABELS,
    skip: [...TOTAL_NAMES, ...raw.results.filter((r) => isTotalDropName(r.name)).map((r) => r.name), ...perElement],
    skipInputs: ['returnPath'],
    pinWarningCodes: PIN_WARNINGS,
    extraProvenance: extra,
  });
  const profileIds = useProfile && profile !== null && raw.fabProfile !== undefined ? profile.ledgerIds : [];
  const ledger = ledgerView([...raw.reference.ledgerIds, ...profileIds]);
  const headline =
    weakest !== undefined
      ? {
          label: `Weakest link: ${weakest.name} (${kindShort(weakestState?.kind ?? 'resistance')}), utilisation`,
          text: weakest.utilisation,
          meaning: 'Applied current / allowed current of the rated element with the highest utilisation (rounded up)',
        }
      : { ...rv.headline, text: `${rv.headline.text}${pctItem === undefined ? '' : ` (${pct(pctItem.value, 'prediction')})`}` };
  const result: ResultView = { ...rv, headline, ledger, details: { ...rv.details, inputs: rv.details.inputs.map((i) => ({ ...i, label: dotted(i.label) })) } };
  if (!useProfile) notes.push(NO_PROFILE_NOTE);

  const ledgerRows = ledger.entries.map((e) => ({ ...e, role: LEDGER_ROLE[e.id] ?? (profileRole(e.id) || e.item) }));
  const userSupplied = raw.inputs.filter((i) => /user-supplied/.test(i.sourceDetail ?? '')).map((i) => dotted(i.name));
  return { status: 'ok', result, raw, fieldErrors: c.fieldErrors, notes, weakest, headlineCallout, scope, table, unratedHeading, unratedText, unrated, totals, netClass, ledgerRows, userSupplied };
}

// ---------------------------------------------------------------------------
// Net-class block
// ---------------------------------------------------------------------------
const STARTING_POINT =
  'These values are a starting point, not a design rule: check width, via and clearance against your fabricator\'s current capabilities, your own design rules and the standard you work to.';
const KEY_LABEL: Readonly<Record<string, string>> = {
  width: 'Trace width (minimum)',
  clearance: 'Clearance (fabricator minimum)',
  viaDrill: 'Via drill (your value)',
  viaPad: 'Via pad diameter (your value)',
};
const KEY_ORDER = ['width', 'clearance', 'viaDrill', 'viaPad'] as const;

function groupTitle(x: CalcExport): string {
  const n = /(\d+)$/.exec(x.id)?.[1] ?? '';
  if (x.id.startsWith('net-class-trace')) {
    const m = /^Net class for (.*?) \((outer|inner) layer\)/.exec(x.note);
    return `Trace net class ${n}${m !== null ? `: ${m[1] ?? ''}, ${m[2] ?? ''} layer` : ''}`;
  }
  const m = /^Via "(.*?)":/.exec(x.note);
  return `Via ${n}${m !== null ? `: "${m[1] ?? ''}"` : ''}`;
}

function buildNetClass(exports: readonly CalcExport[], opts: HeadlineOpts, legacyStatus: string, hasTraceOrVia: boolean): NetClassBlock {
  const groups: NetClassGroup[] = exports.map((x): NetClassGroup => {
    const values: NetClassValue[] = [];
    for (const key of KEY_ORDER) {
      const v = x.values[key];
      if (v === undefined) continue;
      const bound = NET_CLASS_KEYS[key].bound;
      const text = formatResult({ value: v, bound }, opts);
      const src = x.sources?.[key];
      let tags: string[];
      let unverified = false;
      if (src === 'fab-profile') {
        const p = x.profile;
        tags = p === undefined ? ['fab profile'] : [`fab profile ${p.id}`, p.status, p.ageDays < 0 ? 'dated in the future' : `${plural(p.ageDays, 'day')} old`, ...(p.stale ? ['STALE'] : [])];
        unverified = p === undefined || p.status !== 'VERIFIED';
      } else if (src === 'user-entered') tags = ['your values'];
      else {
        tags = ['calculated', 'legacy IPC-2221', `ledger S-001 ${legacyStatus}`];
        unverified = legacyStatus !== 'VERIFIED';
      }
      values.push({ key, label: KEY_LABEL[key] ?? key, text, tags, unverified });
    }
    const isTrace = x.id.startsWith('net-class-trace');
    const at = x.note.indexOf('Clearance is omitted');
    const clearanceReason = isTrace && x.values['clearance'] === undefined ? (at >= 0 ? x.note.slice(at) : 'Clearance is not exported for this net class (see the note).') : undefined;
    return { id: x.id, title: groupTitle(x), values, clearanceReason, note: x.note };
  });
  const empty =
    groups.length > 0
      ? undefined
      : hasTraceOrVia
        ? 'No net-class values were exported for this path. A width is only exported when its solve is inside the plausible range of a PCB trace, and a via is only exported when you entered its drill or pad diameter. See the warnings.'
        : 'The path has no trace and no via, so there is nothing to export as a net class. Add a trace, or a via with its drill and pad diameter.';
  const lines: string[] = ['Net-class values from the path and load calculator', STARTING_POINT, ''];
  for (const g of groups) {
    lines.push(g.title);
    for (const v of g.values) lines.push(`  ${v.label}: ${v.text} [${v.tags.join('; ')}]`);
    if (g.clearanceReason !== undefined) lines.push(`  Clearance: not exported. ${g.clearanceReason}`);
    lines.push('');
  }
  if (groups.length === 0 && empty !== undefined) lines.push(empty);
  return { heading: NET_CLASS_HEADING, startingPoint: STARTING_POINT, groups, empty, plainText: lines.join('\n').trimEnd() };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: PathLoadView): string {
  switch (v.status) {
    case 'ok':
      return v.weakest === undefined
        ? `Result: ${v.result.headline.label} ${v.result.headline.text}. No element has a current limit, so no weakest link is named. Confidence ${v.result.confidence.level}.`
        : `Result: weakest link ${v.weakest.name}, utilisation ${v.weakest.utilisation}. Unrated elements are not ranked: ${String(v.unrated.length)}. Confidence ${v.result.confidence.level}.`;
    case 'cannot-supply':
      return `No result. ${v.message}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
