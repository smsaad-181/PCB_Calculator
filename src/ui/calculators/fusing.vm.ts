// View-model for the fusing page (adiabatic time or current to REACH the copper melting point). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/fusing compute(). This is not steady-state heating.
import { compute, type Inputs } from '../../core/calculators/fusing/calc';
import { meta } from '../../core/calculators/fusing/meta';
import { DEFAULT_COPPER_SPECIFIC_HEAT, DEFAULT_FOIL_CONVENTION, copperSpecificHeat, type CopperSpecificHeatSource } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult } from '../../core/result';
import { DIM, FOIL_CONVENTIONS, foilThickness, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import {
  buildResultView,
  MAX_FIELD_CHARS,
  orderWarnings,
  parseField,
  type FieldView,
  type LedgerEntryView,
  type ProvenanceRow,
  type ResultRowView,
  type ResultView,
  type WarningView,
} from '../components/view';

export const CALCULATOR_ID = 'fusing';
export type { Units };

export type Geometry = '' | 'area' | 'wire' | 'trace' | 'via';
export type Mode = '' | 'current' | 'time' | 'i2t';
export type Basis = '' | 'finished' | 'measured' | 'nominal';
export type CpChoice = '' | CopperSpecificHeatSource;

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" or "not chosen". Nothing is pre-filled. */
export interface FusingState {
  readonly geometry: Geometry;
  readonly area: string;
  readonly wire: string;
  readonly width: string;
  /** A finished copper thickness (a length), or a foil weight (oz/ft2) that the page converts to a nominal length. */
  readonly thickness: string;
  readonly basis: Basis;
  /** Only used when the thickness is a foil weight. '' means the foil default, shown as a default. */
  readonly convention: FoilConvention | '';
  /** Via barrel: the FINISHED hole diameter (inside the plating, not the drill). */
  readonly viaHole: string;
  /** Via barrel plating thickness: required, never pre-filled. */
  readonly viaPlating: string;
  readonly initialTemp: string;
  /** Optional end temperature from the user's laminate datasheet. Blank means none: there is no default. */
  readonly endTemp: string;
  readonly mode: Mode;
  readonly current: string;
  readonly time: string;
  readonly i2t: string;
  /** '' means the product default specific heat, shown as a default. */
  readonly specificHeat: CpChoice;
  readonly units: Units;
}

export const DEFAULT_STATE: FusingState = Object.freeze({
  geometry: '',
  area: '',
  wire: '',
  width: '',
  thickness: '',
  basis: '',
  convention: '',
  viaHole: '',
  viaPlating: '',
  initialTemp: '',
  endTemp: '',
  mode: '',
  current: '',
  time: '',
  i2t: '',
  specificHeat: '',
  units: 'metric',
});

export const PAGE_INTRO =
  'Adiabatic estimate of the time (or the current) at which a copper conductor reaches its melting point in a short current pulse. It is never a fuse rating and never a safe current.';
export const METHOD_TEXT = 'Method: adiabatic heating from the initial temperature to the copper melting point (heat of fusion excluded); Onderdonk as a secondary check';

/** Always visible, with or without a result. */
export const STATUS_LINES: readonly string[] = [
  'Estimate, low confidence.',
  'Not a fuse rating and not a safe overload limit. Where protection is required, use a rated protection device.',
  'Adiabatic: no heat loss to the board, air or connected copper. On a PCB the real behaviour differs and the failure is destructive.',
];

export const SEPARATION_NOTE =
  'Fusing and steady-state heating answer different questions. This page asks how fast a short, large current pulse brings a conductor to its melting point. For the temperature a trace settles at under a continuous current, use the trace self-heating page. Neither page substitutes for the other.';
export const SELF_HEATING_HREF = '#/calc/self-heating';
export const SELF_HEATING_LINK_TEXT = 'Open trace self-heating (steady-state, a different question)';

export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard): less reliable. See the confidence reasons.';

export const GEOMETRY_OPTIONS: readonly { value: 'area' | 'wire' | 'trace' | 'via'; label: string }[] = [
  { value: 'trace', label: 'A PCB trace (width and copper thickness)' },
  { value: 'wire', label: 'A round wire (diameter)' },
  { value: 'via', label: 'A via barrel (finished hole and plating thickness)' },
  { value: 'area', label: 'A cross-section area I give directly' },
];
export const MODE_OPTIONS: readonly { value: 'current' | 'time' | 'i2t'; label: string }[] = [
  { value: 'current', label: 'I know the current: find the time to reach melting' },
  { value: 'time', label: 'I know the pulse time: find the current that reaches melting' },
  { value: 'i2t', label: 'I know the action integral I²t of a non-rectangular pulse: find the fraction of the melting I²t' },
];
export const BASIS_OPTIONS: readonly { value: 'finished' | 'measured' | 'nominal'; label: string }[] = [
  { value: 'finished', label: 'Finished copper (from your fabricator)' },
  { value: 'measured', label: 'Measured (for example a micro-section)' },
  { value: 'nominal', label: 'Nominal (an assumed foil weight, not finished copper)' },
];

export const AREA_HELP =
  'The conductor cross-section in a square length unit (mm2 or mil2). A circular mil is not a square mil, and cmil is not accepted: convert it first. Example: 0.07 mm2.';
export const VIA_HOLE_HELP = 'The FINISHED hole (inside the plating), not the drill. Write the unit (mm or mil).';
export const VIA_PLATING_HELP =
  'Required, never filled in for you. A fabricator figure is an average, not a minimum, and the thinnest spot of the barrel fuses first. Write the unit (um or mil).';
export const WIRE_HELP = 'Diameter of a solid round conductor. Example: 0.5 mm.';
export const WIDTH_HELP = 'Trace width. Example: 2 mm or 80 mil.';
export const THICKNESS_HELP =
  'The FINISHED copper thickness (a length such as 35 um or 1.4 mil), then choose its basis. Or write a foil weight such as 1 oz/ft2: it is converted to a nominal length with the foil convention below and treated as nominal. Finished copper can be thinner than nominal (inner layers, where the trace fuses sooner and the time shown is too long) or thicker (outer plated layers are usually thicker than nominal, where the time shown is too short).';
export const TEMP_HELP = 'The conductor temperature at the START of the pulse (not room ambient if the trace already carries load). Required, no default. Example: 25 °C.';
export const CURRENT_HELP = 'Constant current of a rectangular pulse. Example: 10 A.';
export const TIME_HELP = 'Duration of a rectangular pulse. Example: 0.5 s or 20 ms.';
export const I2T_HELP =
  'The integral of i squared over time for your pulse (not I rms times an arbitrary time). For a protective fuse use its total clearing I2t at your fault current (from its datasheet), not its melting I2t. Example: 40 A2s. With no duration, the 1 s and 10 s warnings cannot be checked.';
export const TE_HELP =
  'Optional. From your laminate datasheet (e.g. glass transition/decomposition), no default. Board damage occurs far below the copper melting point. It must be above the initial temperature and below the melting point.';
export const NOT_MEANINGFUL_TEXT = 'Not meaningful for this model: the conductor would not fuse in a short pulse; use the self-heating calculator';
export const CONVENTION_HELP = 'How a foil weight becomes a thickness. Conventions differ by a few percent (ledger S-003, CONFLICT).';
export const CP_HELP = 'The sourced values disagree by under 1 percent and time scales linearly with it. They are not averaged. The default is a product choice that needs your confirmation.';

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
const CP_IDS: readonly CopperSpecificHeatSource[] = ['pppl-293k', 'pppl-300k', 'hyperphysics-20c'];
const cpLine = (id: CopperSpecificHeatSource): string => {
  const c = copperSpecificHeat(id);
  return `${String(c.valueJPerKgK)} J/(kg·K) (${c.label})`;
};

/** Specific heat choices. The empty value is the product default and says so; all three sourced values are listed. */
export function specificHeatOptions(): readonly { value: CpChoice; label: string }[] {
  return [
    { value: '', label: `Default: ${cpLine(DEFAULT_COPPER_SPECIFIC_HEAT)}. A product choice, needs your confirmation (ledger S-042d CONFLICT)` },
    ...CP_IDS.map((id) => ({ value: id as CpChoice, label: `${cpLine(id)} (ledger S-042d CONFLICT)` })),
  ];
}

/** The conflict, with every sourced value. */
export function specificHeatConflictNote(): string {
  return `Ledger S-042d is a CONFLICT: ${CP_IDS.map(cpLine).join('; ')}. They are not averaged. The default (${cpLine(DEFAULT_COPPER_SPECIFIC_HEAT)}) is a product choice, not a sourced pick.`;
}

export function conventionOptions(): readonly { value: FoilConvention | ''; label: string }[] {
  return [
    { value: '', label: `Default: ${FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION].label} (default assumption)` },
    ...(Object.keys(FOIL_CONVENTIONS) as FoilConvention[]).map((id) => ({ value: id as FoilConvention | '', label: FOIL_CONVENTIONS[id].label })),
  ];
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
type TextKey = 'area' | 'wire' | 'width' | 'thickness' | 'viaHole' | 'viaPlating' | 'initialTemp' | 'endTemp' | 'current' | 'time' | 'i2t';

const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = { area: 'a', wire: 'dw', width: 'w', thickness: 'th', viaHole: 'vd', viaPlating: 'vp', initialTemp: 'ta', endTemp: 'te', current: 'i', time: 'tp', i2t: 'it' };
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];
const LOCAL_KEYS = stateKeyNames(CALCULATOR_ID);
/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

const FIELD_LABEL: Readonly<Record<TextKey, string>> = {
  area: 'Cross-section area',
  wire: 'Wire diameter',
  width: 'Trace width',
  thickness: 'Copper thickness',
  viaHole: 'Via finished hole diameter',
  viaPlating: 'Via plating thickness',
  initialTemp: 'Initial temperature',
  endTemp: 'End temperature',
  current: 'Current',
  time: 'Pulse time',
  i2t: 'Action integral I²t',
};

const FIELD_DIM: Readonly<Record<Exclude<TextKey, 'thickness'>, Dim>> = {
  area: DIM.AREA,
  wire: DIM.LENGTH,
  width: DIM.LENGTH,
  viaHole: DIM.LENGTH,
  viaPlating: DIM.LENGTH,
  initialTemp: DIM.ABS_TEMPERATURE,
  endTemp: DIM.ABS_TEMPERATURE,
  current: DIM.CURRENT,
  time: DIM.TIME,
  i2t: DIM.ACTION_INTEGRAL,
};
export function fieldDim(k: Exclude<TextKey, 'thickness'>): Dim {
  return FIELD_DIM[k];
}

export function toHashState(s: FusingState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.geometry !== '') out['gm'] = s.geometry;
  if (s.basis !== '') out['tb'] = s.basis;
  if (s.convention !== '') out['cv'] = s.convention;
  if (s.mode !== '') out['pm'] = s.mode;
  if (s.specificHeat !== '') out['cp'] = s.specificHeat;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: FusingState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes blank plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: FusingState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const text = (k: TextKey): string => {
    const v = get(TEXT_HASH_KEY[k]);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  const gm = get('gm');
  if (gm !== undefined) {
    if (gm === 'area' || gm === 'wire' || gm === 'trace' || gm === 'via') s = { ...s, geometry: gm };
    else notices.push('The conductor geometry was not recognised: none is chosen. Choose one.');
  }
  const tb = get('tb');
  if (tb !== undefined) {
    if (tb === 'finished' || tb === 'measured' || tb === 'nominal') s = { ...s, basis: tb };
    else notices.push('The thickness basis was not recognised: none is chosen. Choose one.');
  }
  const cv = get('cv');
  if (cv !== undefined) {
    if (has(FOIL_CONVENTIONS, cv)) s = { ...s, convention: cv as FoilConvention };
    else notices.push(`The foil convention was not recognised: the default (${DEFAULT_FOIL_CONVENTION}) is used instead.`);
  }
  const pm = get('pm');
  if (pm !== undefined) {
    if (pm === 'current' || pm === 'time' || pm === 'i2t') s = { ...s, mode: pm };
    else notices.push('What you know (current, time or I²t) was not recognised: none is chosen. Choose one.');
  }
  const cp = get('cp');
  if (cp !== undefined) {
    const id = CP_IDS.find((x) => x === cp);
    if (id !== undefined) s = { ...s, specificHeat: id };
    else notices.push('The specific heat choice was not recognised: the default is used instead.');
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  s = { ...s, area: text('area'), wire: text('wire'), width: text('width'), thickness: text('thickness'), viaHole: text('viaHole'), viaPlating: text('viaPlating'), initialTemp: text('initialTemp'), endTemp: text('endTemp'), current: text('current'), time: text('time'), i2t: text('i2t') };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'geometry' | 'basis' | 'mode' | 'specificHeat';
export type FieldErrors = Partial<Record<FieldKey, string>>;

export function echoFor(s: FusingState, k: Exclude<TextKey, 'thickness'>): DisplayPrefs {
  return echoPrefs(s.units, k === 'wire' || k === 'width' || k === 'viaHole' ? 'width' : k === 'viaPlating' ? 'thickness' : 'other');
}

/** Which quantity fields the page shows and reads. Hidden fields are never read, so they cannot conflict. */
export function activeFields(s: Pick<FusingState, 'geometry' | 'mode'>): readonly TextKey[] {
  const out: TextKey[] = [];
  if (s.geometry === 'area') out.push('area');
  if (s.geometry === 'wire') out.push('wire');
  if (s.geometry === 'trace') out.push('width', 'thickness');
  if (s.geometry === 'via') out.push('viaHole', 'viaPlating');
  out.push('initialTemp');
  if (s.mode === 'current') out.push('current');
  if (s.mode === 'time') out.push('time');
  if (s.mode === 'i2t') out.push('i2t');
  return out;
}

type Thickness =
  | { readonly kind: 'empty' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'length'; readonly value: Quantity }
  | { readonly kind: 'weight'; readonly value: Quantity; readonly note: string; readonly convention: FoilConvention };

const WEIGHT_HINT = 'Write a length such as 35 um or 1.4 mil, or a foil weight such as 1 oz/ft2.';

/** Reads the thickness text as a length first, then as a foil weight converted by the core foil converter. */
export function parseThickness(s: FusingState): Thickness {
  const t = s.thickness;
  const L = parseField(t, DIM.LENGTH, echoPrefs(s.units, 'thickness'));
  if (L.status === 'empty') return { kind: 'empty' };
  if (L.status === 'ok') return { kind: 'length', value: L.value };
  const W = parseField(t, DIM.AREAL_MASS, echoPrefs(s.units, 'thickness'));
  if (W.status !== 'ok') return { kind: 'error', message: `${L.status === 'error' ? L.message : ''} ${WEIGHT_HINT}`.trim() };
  const convention: FoilConvention = s.convention === '' ? DEFAULT_FOIL_CONVENTION : s.convention;
  try {
    const f = foilThickness(W.value, convention);
    const len = formatResult({ value: f.thickness, bound: 'nominal' }, { accuracyClass: meta.accuracyClass, lengthRole: 'thickness' });
    const note = `Foil weight ${t.trim()} converted to ${len} using the ${f.statement}. It is passed to the calculation as a NOMINAL thickness, not finished copper.`;
    return { kind: 'weight', value: f.thickness, note, convention };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'The foil weight could not be converted.' };
  }
}

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  area: 'area',
  wireDiameter: 'wire',
  traceWidth: 'width',
  traceThickness: 'thickness',
  viaHoleDiameter: 'viaHole',
  viaPlatingThickness: 'viaPlating',
  endTemperature: 'endTemp',
  thicknessBasis: 'basis',
  initialTemperature: 'initialTemp',
  current: 'current',
  pulseTime: 'time',
  actionIntegral: 'i2t',
  specificHeat: 'specificHeat',
  geometry: 'geometry',
  pulse: 'mode',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface CautionView {
  readonly code: string;
  readonly heading: string;
  readonly text: string;
}

export interface LedgerRowView extends LedgerEntryView {
  /** What this row backs on this page, in one sentence. */
  readonly role: string;
}

/** Core warning codes shown as prominent notices next to the headline instead of in the list. */
export const CALLOUT_CODES = ['NOT_A_RATING', 'PCB_ADIABATIC_CAVEAT'] as const;
const CALLOUT_HEADING: Readonly<Record<(typeof CALLOUT_CODES)[number], string>> = {
  NOT_A_RATING: 'Not a fuse rating and not a safe overload limit',
  PCB_ADIABATIC_CAVEAT: 'Adiabatic estimate: a PCB trace is cooled by the board and the real behaviour differs',
};

const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-003d': 'Copper density used in the energy balance.',
  'S-004': 'Copper resistivity and temperature coefficient used in the energy balance.',
  'S-006': 'Unit factors (circular mil) used for the Onderdonk check.',
  'S-042': 'Onderdonk equation, the secondary check (attributed, origin unknown).',
  'S-042a': 'The adiabatic energy balance itself (derived, not independently verified).',
  'S-042b': 'Preece equation, shown as a historical reference only.',
  'S-042c': 'Copper melting point, fixed (no override).',
  'S-042d': 'Copper specific heat: sourced values disagree; you choose or accept a stated default.',
  'S-042e': 'Time of validity on boards and simulated fusing currents (one author group).',
  'S-042f': 'Whether the IPC documents say anything on fusing: not read (paywalled). Needs your copy of the standard.',
};

const HEADLINE_BY_MODE: Readonly<Record<'current' | 'time' | 'i2t', string>> = {
  current: 'adiabatic time to reach the melting point',
  time: 'adiabatic current to reach the melting point in the pulse time',
  i2t: 'your I²t as a fraction of the I²t to reach the melting point (not a safety margin)',
};
const RESULT_LABELS: Readonly<Record<string, string>> = {
  'adiabatic time to reach the melting point': 'Adiabatic time to reach the copper melting point (estimate, not a fuse rating)',
  'adiabatic current to reach the melting point in the pulse time': 'Adiabatic current that reaches the copper melting point in your pulse time (estimate, not a fuse rating)',
  'your I²t as a fraction of the I²t to reach the melting point (not a safety margin)': 'Your I²t as a fraction of the I²t that reaches the melting point (estimate, not a safety margin)',
  'adiabatic time to reach your end temperature': 'Adiabatic time to reach your end temperature (your value, not checked)',
  'adiabatic current to reach your end temperature in the pulse time': 'Adiabatic current that reaches your end temperature in your pulse time (your value, not checked)',
  'adiabatic action integral I²t to reach your end temperature': 'Adiabatic I²t to reach your end temperature (your value, not checked)',
  'your I²t as a fraction of the I²t to reach your end temperature': 'Your I²t as a fraction of the I²t that reaches your end temperature (your value, not checked)',
  'adiabatic action integral I²t to reach the melting point': 'Adiabatic I²t to reach the melting point',
  'Onderdonk time to reach the melting point (secondary check)': 'Onderdonk time to reach the melting point (secondary check)',
  'Onderdonk current to reach the melting point in the pulse time (secondary check)': 'Onderdonk current to reach the melting point (secondary check)',
  'Onderdonk action integral I²t (secondary check)': 'Onderdonk I²t (secondary check)',
  'conductor cross-section': 'Conductor cross-section used',
};
const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = {
  'trace copper thickness': 'thickness',
  'Trace copper thickness': 'thickness',
  'via barrel plating thickness': 'thickness',
  'Via barrel plating thickness': 'thickness',
};
const RATIO_NAME = 'Onderdonk to adiabatic ratio';
const RATIO_LABEL = 'Onderdonk to adiabatic ratio (same physics, not an independent confirmation)';

const NEEDS = {
  geometry: 'Choose the conductor geometry (trace, round wire or a cross-section area). It is not assumed.',
  area: 'Enter the cross-section area in mm2 or mil2, for example 0.07 mm2.',
  viaHole: 'Enter the FINISHED via hole diameter (inside the plating, not the drill), with its unit.',
  viaPlating: 'Enter the via barrel plating thickness (required, never filled in for you; a fabricator figure is an average, not a minimum).',
  wire: 'Enter the wire diameter, for example 0.5 mm.',
  width: 'Enter the trace width, for example 2 mm.',
  thickness: 'Enter the copper thickness (a finished length such as 35 um, or a foil weight such as 1 oz/ft2). It is never filled in for you.',
  basis: 'Choose the thickness basis (finished, measured or nominal). There is no default: thinner finished copper fuses sooner.',
  endTemp: 'Enter the end temperature from your laminate datasheet, or leave it blank (optional).',
  initialTemp: 'Enter the initial conductor temperature at the start of the pulse, for example 25 °C. There is no default.',
  mode: 'Choose what you know: the current, the pulse time, or the action integral I²t.',
  current: 'Enter the pulse current, for example 10 A.',
  time: 'Enter the pulse time, for example 0.5 s.',
  i2t: 'Enter the action integral I²t of your pulse, for example 40 A2s.',
} as const;

export interface PreeceView {
  readonly label: string;
  readonly text: string;
  readonly note: string;
}

export type FusingView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly callouts: readonly CautionView[];
      readonly ledgerRows: readonly LedgerRowView[];
      /** The historical Preece figure, shown in its own collapsed panel and not among the results. */
      readonly preece?: PreeceView;
      /** How a foil weight was converted (only when the thickness was typed as a weight). */
      readonly thicknessNote?: string;
      /** Set when the time to melt is over the 10 s threshold: the headline is replaced and the number is kept here, labelled. */
      readonly suppressedHeadline?: { readonly label: string; readonly text: string };
      /** Warnings shown directly under the headline (the 1 s warning, between 1 s and 10 s), removed from the list. */
      readonly headlineWarnings: readonly WarningView[];
      /** Validity checks that failed, and checks that could not be made (a paywalled standard): never the same count. */
      readonly failedChecks: number;
      readonly notCheckedCount: number;
    };

const K_STEP = /^K = /;
const PREECE = /^Preece/;

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: FusingState): FusingView {
  const notes: string[] = [];
  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  const active = activeFields(s);

  const parsed = new Map<TextKey, FieldView>();
  for (const k of active) {
    if (k === 'thickness') continue;
    const v = parseField(s[k], fieldDim(k), echoFor(s, k));
    parsed.set(k, v);
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  const endText = s.endTemp.trim() === '' ? undefined : parseField(s.endTemp, fieldDim('endTemp'), echoFor(s, 'endTemp'));
  if (endText?.status === 'error') {
    problems.push(`${FIELD_LABEL.endTemp}: ${endText.message}`);
    fieldErrors.endTemp = endText.message;
  }
  const thk: Thickness = s.geometry === 'trace' ? parseThickness(s) : { kind: 'empty' };
  if (thk.kind === 'error') {
    problems.push(`${FIELD_LABEL.thickness}: ${thk.message}`);
    fieldErrors.thickness = thk.message;
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  const needs: string[] = [];
  if (s.geometry === '') needs.push(NEEDS.geometry);
  for (const k of active) {
    if (k === 'thickness') continue;
    if (parsed.get(k)?.status === 'empty') needs.push(NEEDS[k]);
  }
  if (s.geometry === 'trace') {
    if (thk.kind === 'empty') needs.push(NEEDS.thickness);
    if (thk.kind === 'length' && s.basis === '') needs.push(NEEDS.basis);
  }
  if (s.mode === '') needs.push(NEEDS.mode);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const qty = (k: Exclude<TextKey, 'thickness'>): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const traceThickness = thk.kind === 'length' || thk.kind === 'weight' ? thk.value : undefined;
  const basis = thk.kind === 'weight' ? 'nominal' : s.basis === '' ? undefined : s.basis;
  const inputs: Inputs = {
    initialTemperature: qty('initialTemp') as Quantity,
    ...(s.geometry === 'area' ? { area: qty('area') } : {}),
    ...(s.geometry === 'wire' ? { wireDiameter: qty('wire') } : {}),
    ...(s.geometry === 'trace' ? { traceWidth: qty('width'), traceThickness, thicknessBasis: basis } : {}),
    ...(s.geometry === 'via' ? { viaHoleDiameter: qty('viaHole'), viaPlatingThickness: qty('viaPlating') } : {}),
    ...(endText?.status === 'ok' ? { endTemperature: endText.value } : {}),
    ...(s.mode === 'current' ? { current: qty('current') } : {}),
    ...(s.mode === 'time' ? { pulseTime: qty('time') } : {}),
    ...(s.mode === 'i2t' ? { actionIntegral: qty('i2t') } : {}),
    ...(s.specificHeat !== '' ? { specificHeat: s.specificHeat } : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key === undefined ? 'Inputs' : key in FIELD_LABEL ? FIELD_LABEL[key as TextKey] : key === 'basis' ? 'Thickness basis' : key === 'specificHeat' ? 'Specific heat' : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const callouts: CautionView[] = CALLOUT_CODES.flatMap((code) => {
    const w = raw.warnings.find((x) => x.code === code);
    return w === undefined ? [] : [{ code, heading: CALLOUT_HEADING[code], text: w.message }];
  });

  // The K step has a local dimension (A²·s/m⁴) with no display unit: it is printed from its SI value and the local unit (P4-7).
  const kIdx = raw.steps.findIndex((x) => K_STEP.test(x.label));
  const kStep = kIdx >= 0 ? raw.steps[kIdx] : undefined;
  // Over 10 s the headline means nothing (PCB M-5); between 1 s and 10 s the 1 s warning goes directly under the headline.
  const over10 = raw.warnings.some((w) => w.code === 'OVER_10S');
  const over1Only = !over10 && raw.warnings.some((w) => w.code === 'OVER_1S');
  const headlineWarnings: WarningView[] = over1Only ? orderWarnings(raw.warnings.filter((w) => w.code === 'OVER_1S')) : [];
  const forView: CalcResult = {
    ...raw,
    steps: raw.steps.filter((x) => !K_STEP.test(x.label)),
    // The pinned warnings keep the order given here: the critical 10 s warning comes before the 1 s one.
    warnings: [...raw.warnings.filter((w) => w.code === 'OVER_10S'), ...raw.warnings.filter((w) => w.code !== 'OVER_10S')].filter(
      (w) => (w.code === undefined || !(CALLOUT_CODES as readonly string[]).includes(w.code)) && !(over1Only && w.code === 'OVER_1S'),
    ),
    results: raw.results.filter((r) => !PREECE.test(r.name) && r.name !== RATIO_NAME),
  };
  // The ratio compares two formulas (it is not a prediction), so it prints with the analytical class (4 figures) to show 1.016, not 1.
  const ratio = raw.results.find((r) => r.name === RATIO_NAME);
  const ratioRows: ResultRowView[] = ratio === undefined ? [] : [{ label: RATIO_LABEL, text: formatResult(ratio, { accuracyClass: 'analytical' }) }];
  const prefs = headlinePrefs(s.units);
  const cp = copperSpecificHeat(s.specificHeat === '' ? DEFAULT_COPPER_SPECIFIC_HEAT : s.specificHeat);
  const extra: ProvenanceRow[] = [
    {
      label: 'Copper specific heat',
      value: `${String(cp.valueJPerKgK)} J/(kg·K) (${cp.label})`,
      source: s.specificHeat === '' ? 'default' : 'user',
      detail: s.specificHeat === '' ? 'product default, ledger S-042d CONFLICT; not chosen by you' : 'ledger S-042d, CONFLICT',
    },
  ];
  if (thk.kind === 'weight') {
    extra.push({
      label: 'Foil convention',
      value: thk.convention,
      source: s.convention === '' ? 'default' : 'user',
      detail: 'ledger S-003, CONFLICT; thickness basis is nominal',
    });
  }
  const result = buildResultView(forView, {
    headline: HEADLINE_BY_MODE[s.mode as 'current' | 'time' | 'i2t'],
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: RESULT_LABELS,
    extraProvenance: extra,
    pinWarningCodes: ['OVER_10S', 'OVER_1S', 'THICKNESS_NOMINAL', 'SUB_MS_PULSE', 'BOARD_DAMAGE_BELOW_MELTING', 'NO_DURATION'],
    extraRows: ratioRows,
    notCheckedChecks: raw.validityChecks.filter((c) => c.notChecked === true).map((c) => c.name),
  });
  const steps = [...result.details.steps];
  if (kStep !== undefined) {
    steps.splice(kIdx, 0, { label: kStep.label, expr: kStep.expr, text: `${kStep.value.si.toExponential(4)} A²·s/m⁴` });
  }
  const withSteps: ResultView = { ...result, details: { ...result.details, steps } };
  const suppressed = over10 ? { label: 'Numeric detail, not meaningful for this model (the time or pulse is over 10 s)', text: `${result.headline.label}: ${result.headline.text}` } : undefined;
  const withK: ResultView = over10
    ? { ...withSteps, headline: { label: 'Result', text: NOT_MEANINGFUL_TEXT, meaning: 'No number is offered as the answer. The numeric detail is kept below, labelled.' } }
    : withSteps;

  const preeceRes = raw.results.find((r) => PREECE.test(r.name));
  const preeceWarn = raw.warnings.find((w) => w.code === 'PREECE_HISTORICAL');
  const preece: PreeceView | undefined =
    preeceRes === undefined
      ? undefined
      : {
          label: 'Preece current for the equivalent round wire, historical reference (no time term)',
          text: formatResult(preeceRes, { accuracyClass: meta.accuracyClass, lengthRole: 'geometry', prefs }),
          note: preeceWarn?.message ?? 'Not a PCB model.',
        };
  const ledgerRows: LedgerRowView[] = withK.ledger.entries.map((e) => ({ ...e, role: LEDGER_ROLE[e.id] ?? e.item }));
  const notChecked = withK.details.validity.filter((c) => c.notChecked === true).length;
  const failed = withK.details.validity.filter((c) => c.notChecked !== true && !c.ok).length;
  return {
    status: 'ok',
    result: withK,
    raw,
    fieldErrors,
    notes,
    callouts,
    ledgerRows,
    failedChecks: failed,
    notCheckedCount: notChecked,
    headlineWarnings,
    ...(suppressed !== undefined ? { suppressedHeadline: suppressed } : {}),
    ...(preece !== undefined ? { preece } : {}),
    ...(thk.kind === 'weight' ? { thicknessNote: thk.note } : {}),
  };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: FusingView): string {
  switch (v.status) {
    case 'ok':
      if (v.suppressedHeadline !== undefined) return `No meaningful result. ${NOT_MEANINGFUL_TEXT}. This is an estimate, not a fuse rating.`;
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. This is an estimate, not a fuse rating. Confidence ${v.result.confidence.level}.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
