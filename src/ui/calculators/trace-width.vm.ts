// View-model for the trace width / current / temperature rise page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/trace-width compute().
import { compute, type Inputs } from '../../core/calculators/trace-width/calc';
import type { Layer } from '../../core/calculators/trace-width/guards';
import { meta } from '../../core/calculators/trace-width/meta';
import { DEFAULT_FOIL_CONVENTION, foilSpreadPercent } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult, CopperBasisKind } from '../../core/result';
import { DEFAULT_DISPLAY_PREFS, DIM, FOIL_CONVENTIONS, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { buildResultView, factorText, MAX_FIELD_CHARS, parseField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';

import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';
export const CALCULATOR_ID = 'trace-width';

export type SolveFor = 'width' | 'current' | 'deltaT';
export type CopperBy = 'weight' | 'thickness';
export type Units = 'metric' | 'imperial';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" (or "use the default"). */
export interface TraceWidthState {
  readonly solveFor: SolveFor;
  readonly width: string;
  readonly current: string;
  readonly deltaT: string;
  /** '' means not chosen yet. The layer is never defaulted and never written to the URL as a default. */
  readonly layer: Layer | '';
  readonly copperBy: CopperBy;
  readonly copperWeight: string;
  readonly copperThickness: string;
  readonly basis: CopperBasisKind;
  /** '' means not answered. Only meaningful when a copper weight is entered. */
  readonly weightSource: WeightSource;
  /** '' means the default convention (an assumption). */
  readonly convention: FoilConvention | '';
  readonly ambient: string;
  readonly designMargin: string;
  readonly derating: string;
  readonly maxTemp: string;
  readonly units: Units;
}

export const DEFAULT_STATE: TraceWidthState = Object.freeze({
  solveFor: 'width',
  width: '',
  current: '',
  deltaT: '',
  layer: '',
  copperBy: 'weight',
  copperWeight: '',
  copperThickness: '',
  basis: 'nominal',
  weightSource: '',
  convention: '',
  ambient: '',
  designMargin: '',
  derating: '',
  maxTemp: '',
  units: 'metric',
});

export const SOLVE_OPTIONS: readonly { readonly value: SolveFor; readonly label: string }[] = [
  { value: 'width', label: 'Width (minimum trace width for a current)' },
  { value: 'current', label: 'Current capacity (for a width)' },
  { value: 'deltaT', label: 'Temperature rise (for a width and a current)' },
];
export const CONVENTION_IDS = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
export const BASES: readonly CopperBasisKind[] = ['nominal', 'finished', 'measured'];
export const LAYERS: readonly Layer[] = ['outer', 'inner'];

// ---------------------------------------------------------------------------
// Fixed method text. Mode B is the only method; Mode A is shown but unavailable and is never selectable.
// ---------------------------------------------------------------------------
export const METHOD_TEXT = 'Method: IPC-2221 legacy (Mode B)';
export const MODE_A_LABEL = 'IPC-2152-informed estimate';
export const MODE_A_HINT = 'not available yet: waiting on a source decision';
export const MODE_A_NOTICE =
  'The link asked for the IPC-2152-informed estimate (Mode A). It is not available yet (waiting on a source decision), so it was not used. This page only offers the legacy IPC-2221 method (Mode B), labelled legacy.';

/** Defaults the calculator applies when a field is left empty. Text only; the numbers are core metadata. */
export const DEFAULT_TEXT = {
  ambient: `${String(meta.defaults.ambientC)} °C (engineering default, not from a standard)`,
  designMargin: `${String(meta.defaults.designMargin)} (engineering default, not from a standard)`,
  derating: `${String(meta.defaults.currentDerating)} (engineering default, not from a standard)`,
} as const;

export const FAILED_CHECK_HINT = 'Outside the chart range: extrapolation. The legacy curve fit is extended past the range it was fitted to, so treat the result as indicative only.';

export function conventionSpreadText(): string {
  return `${foilSpreadPercent().toFixed(2)} %`;
}

export function conventionOptionLabel(id: FoilConvention | ''): string {
  if (id === '') return `Default: ${FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION].label} (default assumption)`;
  return FOIL_CONVENTIONS[id].label;
}

// ---------------------------------------------------------------------------
// Display preferences
// ---------------------------------------------------------------------------
/** Headline preferences: geometry and thickness are always dual; this chooses the temperature unit only. */
export function headlinePrefs(units: Units): DisplayPrefs {
  return units === 'imperial' ? { ...DEFAULT_DISPLAY_PREFS, length: 'mil', area: 'mil2', temperature: 'F' } : { ...DEFAULT_DISPLAY_PREFS };
}

/** Echo units for what the user typed. Width echoes in mm or mil; copper thickness in um or mil. */
export function echoPrefs(units: Units, kind: 'width' | 'thickness' | 'other' = 'other'): DisplayPrefs {
  const imperial = units === 'imperial';
  const length = imperial ? 'mil' : kind === 'thickness' ? 'um' : 'mm';
  return { ...DEFAULT_DISPLAY_PREFS, length, area: imperial ? 'mil2' : 'mm2', temperature: imperial ? 'F' : 'C' };
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

const SF_TO_HASH: Readonly<Record<SolveFor, string>> = { width: 'width', current: 'current', deltaT: 'rise' };

/** State to put in the hash. Defaults are omitted (so the default page has a clean URL); `ly` is only ever a user choice. */
export function toHashState(s: TraceWidthState): Record<string, string> {
  const out: Record<string, string> = {};
  const text = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v.slice(0, MAX_FIELD_CHARS);
  };
  if (s.solveFor !== DEFAULT_STATE.solveFor) out['sf'] = SF_TO_HASH[s.solveFor];
  text('w', s.width);
  text('i', s.current);
  text('dt', s.deltaT);
  if (s.layer !== '') out['ly'] = s.layer;
  if (s.copperBy !== DEFAULT_STATE.copperBy) out['cs'] = s.copperBy;
  text('cw', s.copperWeight);
  text('ct', s.copperThickness);
  if (s.basis !== DEFAULT_STATE.basis) out['cb'] = s.basis;
  if (s.weightSource !== '') out['wsrc'] = s.weightSource;
  if (s.convention !== '') out['conv'] = s.convention;
  text('am', s.ambient);
  text('dm', s.designMargin);
  text('cd', s.derating);
  text('mt', s.maxTemp);
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: TraceWidthState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: TraceWidthState = DEFAULT_STATE;
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

  const sf = get('sf');
  if (sf !== undefined) {
    if (sf === 'width') s = { ...s, solveFor: 'width' };
    else if (sf === 'current') s = { ...s, solveFor: 'current' };
    else if (sf === 'rise') s = { ...s, solveFor: 'deltaT' };
    else notices.push('What to solve for was not recognised: width is used instead.');
  }
  const ly = get('ly');
  if (ly !== undefined) {
    if (ly === 'outer' || ly === 'inner') s = { ...s, layer: ly };
    else notices.push('Copper layer was not recognised: no layer is chosen. Choose outer or inner.');
  }
  const cs = get('cs');
  if (cs !== undefined) {
    if (cs === 'weight' || cs === 'thickness') s = { ...s, copperBy: cs };
    else notices.push('How copper is specified (weight or thickness) was not recognised: weight is used instead.');
  }
  const cb = get('cb');
  if (cb !== undefined) {
    if (cb === 'nominal' || cb === 'finished' || cb === 'measured') s = { ...s, basis: cb };
    else notices.push('Thickness basis was not recognised: nominal is used instead.');
  }
  s = { ...s, weightSource: weightSourceFromHash(get('wsrc'), notices) };
  const conv = get('conv');
  if (conv !== undefined) {
    if (has(FOIL_CONVENTIONS, conv)) s = { ...s, convention: conv as FoilConvention };
    else notices.push(`Foil convention was not recognised: the default (${DEFAULT_FOIL_CONVENTION}) is used instead.`);
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  // Mode A is never selectable from a link. Mode B ("B") needs no notice; anything else is said out loud.
  const mode = get('mode');
  if (mode !== undefined && mode !== 'B') notices.push(MODE_A_NOTICE);
  if (get('fc') !== undefined) {
    notices.push('A foil thickness per oz/ft² in the link is not used by this page. The foil convention is chosen in the form.');
  }
  s = {
    ...s,
    width: text('w', 'Trace width'),
    current: text('i', 'Current'),
    deltaT: text('dt', 'Temperature rise'),
    copperWeight: text('cw', 'Copper weight'),
    copperThickness: text('ct', 'Copper thickness'),
    ambient: text('am', 'Ambient temperature'),
    designMargin: text('dm', 'Design margin'),
    derating: text('cd', 'Current derating'),
    maxTemp: text('mt', 'Maximum allowed conductor temperature'),
  };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export interface FieldErrors {
  width?: string;
  current?: string;
  deltaT?: string;
  copperWeight?: string;
  copperThickness?: string;
  ambient?: string;
  designMargin?: string;
  derating?: string;
  maxTemp?: string;
  layer?: string;
  convention?: string;
}

type FieldKey = keyof FieldErrors;

/** Which fields the page shows and reads for a given choice. The unsolved two are number fields. */
export function activeFields(s: Pick<TraceWidthState, 'solveFor' | 'copperBy'>): readonly FieldKey[] {
  const known: FieldKey[] = s.solveFor === 'width' ? ['current', 'deltaT'] : s.solveFor === 'current' ? ['width', 'deltaT'] : ['width', 'current'];
  const copper: FieldKey = s.copperBy === 'weight' ? 'copperWeight' : 'copperThickness';
  const factor: FieldKey[] = s.solveFor === 'width' ? ['designMargin'] : s.solveFor === 'current' ? ['derating'] : [];
  return [...known, copper, 'ambient', ...factor, 'maxTemp'];
}

const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  width: 'Trace width',
  current: 'Current',
  deltaT: 'Temperature rise',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  designMargin: 'Design margin',
  derating: 'Current derating',
  maxTemp: 'Maximum allowed conductor temperature',
  layer: 'Copper layer',
  convention: 'Foil convention',
};

const FIELD_DIM: Readonly<Partial<Record<FieldKey, Dim>>> = {
  width: DIM.LENGTH,
  current: DIM.CURRENT,
  deltaT: DIM.TEMPERATURE_DIFFERENCE,
  copperWeight: DIM.AREAL_MASS,
  copperThickness: DIM.LENGTH,
  ambient: DIM.ABS_TEMPERATURE,
  designMargin: DIM.DIMENSIONLESS,
  derating: DIM.DIMENSIONLESS,
  maxTemp: DIM.ABS_TEMPERATURE,
};

const STATE_KEY: Readonly<Record<string, keyof TraceWidthState>> = {
  width: 'width',
  current: 'current',
  deltaT: 'deltaT',
  copperWeight: 'copperWeight',
  copperThickness: 'copperThickness',
  ambient: 'ambient',
  designMargin: 'designMargin',
  derating: 'derating',
  maxTemp: 'maxTemp',
};

/** Expected dimension of a field (what the parser must check the typed unit against). */
export function fieldDim(k: FieldKey): Dim {
  const d = FIELD_DIM[k];
  if (d === undefined) throw new Error(`Field ${k} has no quantity dimension.`);
  return d;
}

export function parseFieldOf(s: TraceWidthState, k: FieldKey): FieldView {
  const text = s[STATE_KEY[k] as keyof TraceWidthState] as string;
  const kind = k === 'width' ? 'width' : k === 'copperThickness' ? 'thickness' : 'other';
  return parseField(text, fieldDim(k), echoPrefs(s.units, kind));
}

// Core error field names to page field names.
const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  width: 'width',
  current: 'current',
  deltaT: 'deltaT',
  copperWeight: 'copperWeight',
  copperThickness: 'copperThickness',
  ambient: 'ambient',
  designMargin: 'designMargin',
  currentDerating: 'derating',
  maxAllowedTemp: 'maxTemp',
  layer: 'layer',
  convention: 'convention',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type TraceWidthView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | { readonly status: 'ok'; readonly result: ResultView; readonly raw: CalcResult; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] };

const HEADLINE: Readonly<Record<SolveFor, { name: string; label: string }>> = {
  width: { name: 'width', label: 'Minimum trace width' },
  current: { name: 'current capacity', label: 'Maximum current capacity' },
  deltaT: { name: 'temperature rise', label: 'Predicted temperature rise' },
};

const NEEDS_TEXT: Readonly<Partial<Record<FieldKey, string>>> = {
  width: 'Enter the trace width (for example 0.3 mm or 12 mil).',
  current: 'Enter the current (for example 1 A or 500 mA).',
  deltaT: 'Enter the temperature rise (for example 10 °C): a rise, not an absolute temperature.',
  copperWeight: 'Enter the copper weight (for example 1 oz).',
  copperThickness: 'Enter the copper thickness (for example 35 um).',
};

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'cross-section area': 'Cross-section area',
  'copper thickness': 'Copper thickness',
  'maximum conductor temperature': 'Maximum conductor temperature (ambient + rise)',
  'current density': 'Current density',
  current: 'Current',
  deltaT: 'Temperature rise',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  designMargin: 'Design margin',
  currentDerating: 'Current derating',
  maxAllowedTemp: 'Maximum allowed conductor temperature',
};

const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = {
  'copper thickness': 'thickness',
  copperThickness: 'thickness',
  'Copper thickness': 'thickness',
};

function provenance(s: TraceWidthState): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [{ label: 'Copper layer', value: s.layer, source: 'user' }];
  rows.push(
    s.convention === ''
      ? { label: 'Foil convention', value: DEFAULT_FOIL_CONVENTION, source: 'default', detail: `conventions differ by up to ${conventionSpreadText()}` }
      : { label: 'Foil convention', value: s.convention, source: 'user' },
  );
  if (s.copperBy === 'weight') {
    rows.push(
      s.weightSource === 'foil'
        ? { label: 'Weight source', value: 'foil spec (base foil)', source: 'user' }
        : { label: 'Weight source', value: 'not answered, treated as base foil', source: 'default' },
    );
  }
  if (s.copperBy === 'thickness') rows.push({ label: 'Thickness basis', value: s.basis, source: s.basis === 'nominal' ? 'default' : 'user' });
  rows.push({ label: 'Method', value: 'IPC-2221 legacy (Mode B)', source: 'user', detail: 'the only method available; chosen by the page, never switched' });
  return rows;
}

/** One line on the copper actually used: layer, basis and thickness (through the thickness headline). */
export function copperBasisLine(raw: CalcResult, prefs: DisplayPrefs): string {
  const b = raw.copperBasis;
  if (b === undefined) return 'not stated';
  const t = formatResult({ value: b.thickness, bound: 'nominal' }, { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'thickness' });
  return `${b.layer} layer, ${b.basis} basis, ${t}`;
}

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
/** "width ×1.36 (margin ×1.25 on current)": the width factor and the current margin both come from the core result. */
function widthBasis(raw: CalcResult): string {
  const dv = raw.designValues.find((d) => d.name === 'width');
  const m = raw.inputs.find((i) => i.name === 'designMargin');
  const g = (n: number): string => factorText(n, { accuracyClass: meta.accuracyClass });
  if (dv === undefined || m === undefined) return 'calculated width × margin';
  return `width ×${g(dv.derating.factor)} (margin ×${g(m.value.si)} on current)`;
}

export function computeView(s: TraceWidthState): TraceWidthView {
  const notes: string[] = [];
  const active = activeFields(s);
  const parsed = new Map<FieldKey, FieldView>();
  for (const k of active) parsed.set(k, parseFieldOf(s, k));

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const k of active) {
    const v = parsed.get(k);
    if (v?.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  if (s.copperBy === 'weight' && s.weightSource === 'finished') return { status: 'needs-input', needs: [FINISHED_NEEDS], notes };
  if (s.copperBy === 'weight' && s.weightSource === '' && parsed.get('copperWeight')?.status === 'ok') notes.push(NOT_ANSWERED_NOTE);

  const needs: string[] = [];
  for (const k of active) {
    if (parsed.get(k)?.status === 'empty' && NEEDS_TEXT[k] !== undefined) needs.push(NEEDS_TEXT[k] as string);
  }
  if (s.layer === '') needs.push('Choose a copper layer: outer or inner. It is not assumed.');
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const q = (k: FieldKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  const inputs: Inputs = {
    mode: 'B',
    layer: s.layer as Layer,
    ...(s.solveFor !== 'width' ? optional('width', q('width')) : {}),
    ...(s.solveFor !== 'current' ? optional('current', q('current')) : {}),
    ...(s.solveFor !== 'deltaT' ? optional('deltaT', q('deltaT')) : {}),
    ...(s.copperBy === 'weight' ? optional('copperWeight', q('copperWeight')) : { ...optional('copperThickness', q('copperThickness')), copperBasis: s.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...optional('ambient', q('ambient')),
    ...optional('designMargin', q('designMargin')),
    ...optional('currentDerating', q('derating')),
    ...optional('maxAllowedTemp', q('maxTemp')),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined ? FIELD_LABEL[key] : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const head = HEADLINE[s.solveFor];
  const prefs = headlinePrefs(s.units);
  const skip = (['width', 'current capacity', 'temperature rise'] as const).filter((n) => n !== head.name);
  if (s.solveFor === 'deltaT') {
    notes.push('A predicted temperature rise has no recommended design value. Compare the maximum conductor temperature with what your materials and the board allow.');
  }
  const result = buildResultView(raw, {
    headline: head.name,
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: { ...RESULT_LABELS, [head.name]: head.label, ...(s.solveFor === 'width' ? {} : { width: 'Trace width' }) },
    skip,
    designNotes: {
      width: { noun: 'margin', defaulted: s.designMargin.trim() === '', basis: widthBasis(raw) },
      'current capacity': { noun: 'derating', defaulted: s.derating.trim() === '' },
    },
    extraRows: [{ label: 'Copper used', text: copperBasisLine(raw, prefs) }],
    skipInputs: [...(s.solveFor === 'width' ? [] : ['designMargin']), ...(s.solveFor === 'current' ? [] : ['currentDerating'])],
    pinWarningCodes: ['LEGACY_METHOD'],
    extraProvenance: provenance(s),
  });
  return { status: 'ok', result, raw, fieldErrors, notes };
}
