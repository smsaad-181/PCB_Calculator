// View-model for the trace width / current / temperature rise page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/trace-width compute().
import { compute, type Inputs, type Tolerances } from '../../core/calculators/trace-width/calc';
import type { Layer } from '../../core/calculators/trace-width/guards';
import { meta } from '../../core/calculators/trace-width/meta';
import { DEFAULT_FOIL_CONVENTION, foilSpreadPercent } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult, CopperBasisKind } from '../../core/result';
import { DEFAULT_DISPLAY_PREFS, DIM, FOIL_CONVENTIONS, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { LAYER_COUNT_INPUTS, type LayerCountInput } from '../../core/calculators/annular-ring/guards';
import type { NearNote, NearResultView } from '../components/NearResultNotes';
import { buildResultView, factorText, MAX_FIELD_CHARS, orderWarnings, parseField, parseFractionField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';
import { PEAK_HIGHER_HEADING, PERIOD_LABEL, PERIOD_NEEDS, type PeriodChoice } from './pulse-labels';
import { bundledProfile, choiceFromHash, choiceToHash, type ProfileChoice } from './fab-profile-choice';
import {
  buildToleranceView,
  collectTolerances,
  effectiveThickMode,
  thickModeFromHash,
  thickModeToHash,
  thicknessOptionsFor,
  tolFromHash,
  tolKeyOfCoreField,
  isTolEmpty,
  tolProblems,
  tolToHash,
  type ThicknessMode,
  type ThicknessOption,
  type TolFieldDef,
  type TolState,
  type ToleranceView,
} from './tolerance-view';

import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';
export const CALCULATOR_ID = 'trace-width';

export type SolveFor = 'width' | 'current' | 'deltaT';
export type CopperBy = 'weight' | 'thickness';
export type Units = 'metric' | 'imperial';
export type CurrentMode = 'steady' | 'pulse';
export type LayerCountChoice = LayerCountInput | '';

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
  /** Optional input tolerances as typed, by core tolerance key. Empty means none: no tolerance is ever assumed. */
  readonly tol: TolState;
  /** '' means not chosen: there is no default thickness tolerance. */
  readonly thickMode: ThicknessMode;
  /** '' means not chosen: the fab profile is never pre-selected. */
  readonly profile: ProfileChoice;
  /** Use the chosen profile's track-width tolerance. Only meaningful with a chosen profile. */
  readonly widthProfile: boolean;
  /** Optional pulsed current. 'pulse' replaces the steady current (core rule); steady is the default. */
  readonly currentMode: CurrentMode;
  readonly peakCurrent: string;
  readonly duty: string;
  /** '' means not chosen: the pulse path requires an explicit statement. */
  readonly periodVsTau: PeriodChoice;
  /** '' means not chosen: there is no default layer count. Only meaningful with a chosen fab profile. */
  readonly layerCount: LayerCountChoice;
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
  tol: {},
  thickMode: '',
  profile: '',
  widthProfile: false,
  currentMode: 'steady',
  peakCurrent: '',
  duty: '',
  periodVsTau: '',
  layerCount: '',
});

export const SOLVE_OPTIONS: readonly { readonly value: SolveFor; readonly label: string }[] = [
  { value: 'width', label: 'Width (minimum trace width for a current)' },
  { value: 'current', label: 'Current capacity (for a width)' },
  { value: 'deltaT', label: 'Temperature rise (for a width and a current)' },
];
export interface SolveOption {
  readonly value: SolveFor;
  readonly label: string;
  readonly disabled?: boolean;
  readonly hint?: string;
}

/** The solve-for choices. With a pulse the current is never solved (the core rejects width + rise + pulse), so it is shown but disabled. */
export function solveOptions(s: Pick<TraceWidthState, 'currentMode'>): readonly SolveOption[] {
  return SOLVE_OPTIONS.map((o) =>
    o.value === 'current' && s.currentMode === 'pulse' ? { ...o, disabled: true, hint: 'not available with a pulsed current (the pulse replaces the current)' } : o,
  );
}

/** The core message for width + temperature rise + pulse together (a test keeps this identical to the core text). */
export const PULSE_SOLVE_CURRENT_TEXT =
  'Give exactly two of width, current (or a peakCurrent pulse, which takes the place of the current) and deltaT; the third is solved. Not none, one or all three.';

export const PULSE_SECTION_LEGEND = 'Pulsed current (RMS-equivalent), optional: the current is';
export const PULSE_STEADY_HELP = 'A pulse replaces the steady current. It gives a mean-heating (RMS-equivalent) estimate, not a peak temperature.';
export { PERIOD_LABEL };

/** The check the core adds for a stated maximum: an estimate against your own number, never a pass or fail. */
export const STATED_MAX_CHECK_NAME = 'Estimated conductor temperature vs your stated maximum (informational)';

export const LAYER_COUNT_OPTIONS: readonly { readonly value: LayerCountInput; readonly label: string }[] = [
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: 'multilayer', label: 'Multilayer (4 or more)' },
];
export const LAYER_COUNT_QUESTION = 'Board layer count (scopes the profile minimum trace width note; no default)';
export const LAYER_COUNT_HELP =
  'Optional. With a layer count the width result is compared with the profile minimum trace width for that exact scope (layer count, copper weight, layer side) as a manufacturing note. Leave it unanswered for no note.';
export function isLayerCount(v: string): v is LayerCountInput {
  return (LAYER_COUNT_INPUTS as readonly string[]).includes(v);
}

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
const LOCAL_KEYS = stateKeyNames(CALCULATOR_ID);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `fp` and `u`, which are reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'fp', 'u'];

// ---------------------------------------------------------------------------
// Optional tolerances
// ---------------------------------------------------------------------------
/** The fab profile can be chosen and its width tolerance used only when a profile is selected and its data parses. */
export function profileWidthOffered(s: Pick<TraceWidthState, 'profile'>): boolean {
  return s.profile === 'bundled' && bundledProfile() !== null;
}

const widthFromProfile = (s: Pick<TraceWidthState, 'profile' | 'widthProfile'>): boolean => s.widthProfile && profileWidthOffered(s);

export const PROFILE_QUESTION = 'Which fab profile do you want to use (width tolerance and minimum trace width note)?';
export const PROFILE_HELP = 'No default: choose one. A profile is used only for the width tolerance (if you tick the box that appears) and for the minimum trace width note (if you answer the layer count that appears). None means only your own values are used.';
export const PROFILE_WIDTH_LABEL = 'Use the fab profile width tolerance (JLCPCB example, UNVERIFIED)';
export const PROFILE_WIDTH_LOCKED = 'Taken from the fab profile you chose (untick the box to type your own).';

/** The tolerance fields for the current choices. A field is offered only for an input the user actually supplied. */
export function toleranceFields(s: TraceWidthState): readonly TolFieldDef[] {
  const solve = s.solveFor;
  const fromProfile = widthFromProfile(s);
  return [
    {
      key: 'current', hash: 'tcur', id: 'tol-current', label: 'Current', kind: 'relative',
      // With a pulse the rms current is derived, so there is nothing to tolerance. A value typed earlier is still sent so the core message shows here.
      offered: solve !== 'current' && (s.currentMode !== 'pulse' || (s.tol['current'] !== undefined && !isTolEmpty(s.tol['current']))),
      whyNot: s.currentMode === 'pulse' ? 'a pulse derives the rms current from the peak and duty, so it has no input tolerance. Tolerance the width, rise, copper or ambient instead.' : 'the current is the solved quantity here, not an input.',
      help: 'Tolerance on the current you entered, for example 5%.',
    },
    { key: 'deltaT', hash: 'trise', id: 'tol-rise', label: 'Temperature rise', kind: 'relative', offered: solve !== 'deltaT', whyNot: 'the temperature rise is the solved quantity here, not an input.', help: 'Tolerance on the temperature rise you entered, as a percent of that rise.' },
    {
      key: 'width', hash: 'twid', id: 'tol-width', label: 'Trace width', kind: 'relative', offered: true,
      help: solve === 'width' ? 'The width is solved here, so this is the fabricator width tolerance: the result adds the drawn width that covers the minus side.' : 'Tolerance on the finished width you entered, for example from your fabricator.',
      fromProfile,
    },
    { key: 'copperThickness', hash: 'tthk', id: 'tol-copper', label: 'Copper thickness', kind: 'relative', offered: true, thickness: true, help: 'Tolerance on the copper thickness, for example 10%.' },
    { key: 'ambient', hash: 'tamb', id: 'tol-ambient', label: 'Ambient', kind: 'temperature', offered: s.ambient.trim() !== '', whyNot: 'enter an ambient temperature above first; the 25 °C default is an assumption and is not toleranced.', help: 'Tolerance on the ambient you entered, as a temperature difference, for example 5 K.' },
  ];
}

export function thicknessModesOffered(s: Pick<TraceWidthState, 'copperBy'>): readonly ThicknessOption[] {
  return thicknessOptionsFor(s.copperBy);
}

/** Picks a profile; a width-from-profile tick without a chosen profile cannot survive. */
export function withProfile(s: TraceWidthState, profile: ProfileChoice): TraceWidthState {
  return { ...s, profile, widthProfile: profile === 'bundled' ? s.widthProfile : false, layerCount: profile === 'bundled' ? s.layerCount : '' };
}

/** True when any optional tolerance state is set (the section then starts open so it is never hidden from the reader). */
export function hasToleranceState(s: TraceWidthState): boolean {
  return Object.keys(s.tol).length > 0 || s.thickMode !== '' || s.profile !== '' || s.widthProfile || s.layerCount !== '';
}

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
  tolToHash(out, toleranceFields(DEFAULT_STATE), s.tol);
  const km = thickModeToHash(s.thickMode);
  if (km !== undefined) out['tkch'] = km;
  const fp = choiceToHash(s.profile);
  if (fp !== undefined) out['fp'] = fp;
  if (s.profile === 'bundled' && s.widthProfile) out['twpf'] = '1';
  if (s.currentMode !== DEFAULT_STATE.currentMode) out['cm'] = s.currentMode;
  text('ip', s.peakCurrent);
  text('du', s.duty);
  if (s.periodVsTau !== '') out['pt'] = s.periodVsTau;
  if (s.layerCount !== '') out['lc'] = s.layerCount;
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
  const fp = get('fp');
  if (fp !== undefined) {
    const c = choiceFromHash(fp);
    if (c !== undefined) s = { ...s, profile: c };
    else notices.push('The fab profile in the link is not one this version knows: no profile is chosen. Choose one, or none.');
  }
  const twpf = get('twpf');
  if (twpf !== undefined) {
    if (twpf === '1' && s.profile === 'bundled') s = { ...s, widthProfile: true };
    else if (twpf === '1') notices.push('The link asks for the fab profile width tolerance, but no profile is chosen: the profile tolerance is not used.');
    else notices.push('The width-from-profile setting was not recognised: it is off.');
  }
  const cm = get('cm');
  if (cm !== undefined) {
    if (cm === 'steady' || cm === 'pulse') s = { ...s, currentMode: cm };
    else notices.push('The current type (steady or pulse) was not recognised: steady is used instead.');
  }
  const pt = get('pt');
  if (pt !== undefined) {
    if (pt === 'much-shorter' || pt === 'comparable-or-longer') s = { ...s, periodVsTau: pt };
    else notices.push('The period versus thermal time constant statement was not recognised: none is chosen. Choose one.');
  }
  const lc = get('lc');
  if (lc !== undefined) {
    if (!isLayerCount(lc)) notices.push('The board layer count was not recognised: none is chosen. Choose 1, 2 or multilayer, or leave it.');
    else if (s.profile !== 'bundled') notices.push('The link gives a board layer count, but no fab profile is chosen: the layer count is not used (it only scopes the profile minimum trace width note).');
    else s = { ...s, layerCount: lc };
  }
  s = { ...s, tol: tolFromHash(get, toleranceFields(DEFAULT_STATE), notices), thickMode: thickModeFromHash(get('tkch'), notices) };
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
    peakCurrent: text('ip', 'Peak current'),
    duty: text('du', 'Duty cycle'),
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
  peakCurrent?: string;
  duty?: string;
  periodVsTau?: string;
  layerCount?: string;
}

type FieldKey = keyof FieldErrors;

/** Which fields the page shows and reads for a given choice. The unsolved two are number fields. */
export function activeFields(s: Pick<TraceWidthState, 'solveFor' | 'copperBy'> & Partial<Pick<TraceWidthState, 'currentMode'>>): readonly FieldKey[] {
  // A pulse (peak current and duty) takes the place of the steady current, which is then neither shown nor read.
  const pulse = s.currentMode === 'pulse';
  const cur: FieldKey[] = pulse ? ['peakCurrent', 'duty'] : ['current'];
  const known: FieldKey[] = s.solveFor === 'width' ? [...cur, 'deltaT'] : s.solveFor === 'current' ? ['width', 'deltaT', ...(pulse ? cur : [])] : ['width', ...cur];
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
  peakCurrent: 'Peak current',
  duty: 'Duty cycle',
  periodVsTau: 'Period versus thermal time constant',
  layerCount: 'Board layer count',
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
  peakCurrent: DIM.CURRENT,
  duty: DIM.DIMENSIONLESS,
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
  peakCurrent: 'peakCurrent',
  duty: 'duty',
};

/** Expected dimension of a field (what the parser must check the typed unit against). */
export function fieldDim(k: FieldKey): Dim {
  const d = FIELD_DIM[k];
  if (d === undefined) throw new Error(`Field ${k} has no quantity dimension.`);
  return d;
}

export function parseFieldOf(s: TraceWidthState, k: FieldKey): FieldView {
  const text = s[STATE_KEY[k] as keyof TraceWidthState] as string;
  if (k === 'duty') return parseFractionField(text);
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
  peakCurrent: 'peakCurrent',
  duty: 'duty',
  periodVsTau: 'periodVsTau',
  layerCount: 'layerCount',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type TraceWidthView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | {
      readonly status: 'error';
      readonly problems: readonly string[];
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** Error text per tolerance key (present only when a tolerance is the problem). */
      readonly tolErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** Present only when tolerances were entered and the core returned something to show. */
      readonly tolerance?: ToleranceView;
      /** Notes shown next to the width result (fab profile minimum trace width note, inner finished copper caution). */
      readonly nearResult: NearResultView;
      /** Present for an rms pulse: the result is a mean rise and the peak is higher. */
      readonly callout?: { readonly heading: string; readonly text: string };
    };

const DRAWN_WIDTH_NAME = 'drawn width covering the width tolerance';

/** The profile and the evaluation date for a width tolerance taken from the profile (the core reads no clock). */
function profileInputs(today: string | undefined): Pick<Inputs, 'fabProfile' | 'today'> {
  const p = bundledProfile();
  return { ...(p !== null ? { fabProfile: p } : {}), ...(today !== undefined ? { today } : {}) };
}

const HEADLINE: Readonly<Record<SolveFor, { name: string; label: string }>> = {
  width: { name: 'width', label: 'Minimum trace width' },
  current: { name: 'current capacity', label: 'Maximum current capacity' },
  deltaT: { name: 'temperature rise', label: 'Predicted temperature rise' },
};

/** Headline label for a pulse: the core's mean-heating wording for rms, and an explicit non-rms wording for the peak held continuously. */
const PULSE_HEADLINE: Readonly<Record<'much-shorter' | 'comparable-or-longer', Readonly<Record<'width' | 'deltaT', string>>>> = {
  'much-shorter': {
    width: 'Minimum trace width for the RMS-equivalent current (mean heating)',
    deltaT: 'Mean temperature rise (pulse, from the rms current)',
  },
  'comparable-or-longer': {
    width: 'Minimum trace width for the peak current held continuously (not an rms result)',
    deltaT: 'Temperature rise at peak current held continuously (not an rms result)',
  },
};

/** Core warning codes shown next to the result instead of in the long list. */
const NEAR_CODES: readonly string[] = [
  'BELOW_PROFILE_MIN_TRACE_WIDTH',
  'MEETS_PROFILE_MIN_TRACE_WIDTH',
  'PROFILE_MIN_TRACE_WIDTH_NOT_PUBLISHED',
  'INNER_FINISHED_COPPER_THINNER',
];
const PROFILE_NOTE_CODES: readonly string[] = ['BELOW_PROFILE_MIN_TRACE_WIDTH', 'MEETS_PROFILE_MIN_TRACE_WIDTH', 'PROFILE_MIN_TRACE_WIDTH_NOT_PUBLISHED'];
const PEAK_HIGHER_CODE = 'PULSE_PEAK_HIGHER';

const NEEDS_TEXT: Readonly<Partial<Record<FieldKey, string>>> = {
  width: 'Enter the trace width (for example 0.3 mm or 12 mil).',
  current: 'Enter the current (for example 1 A or 500 mA).',
  deltaT: 'Enter the temperature rise (for example 10 °C): a rise, not an absolute temperature.',
  peakCurrent: 'Enter the peak current (for example 10 A).',
  duty: 'Enter the duty cycle (for example 25% or 0.25).',
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
  peakCurrent: 'Peak current',
  duty: 'Duty cycle',
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
  if (s.currentMode === 'pulse' && s.periodVsTau !== '') rows.push({ label: 'Period versus thermal time constant', value: PERIOD_LABEL[s.periodVsTau], source: 'user' });
  if (s.profile === 'bundled' && s.layerCount !== '') rows.push({ label: 'Board layer count (profile note scope)', value: s.layerCount, source: 'user' });
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

export function computeView(s: TraceWidthState, today?: string): TraceWidthView {
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
  const tolFields = toleranceFields(s);
  const col = collectTolerances(tolFields, s.tol, effectiveThickMode(s.thickMode, s.copperBy), echoPrefs(s.units, 'other'));
  problems.push(...tolProblems(col.errors, tolFields));
  if (problems.length > 0) {
    return { status: 'error', problems, fieldErrors, notes, ...(Object.keys(col.errors).length > 0 ? { tolErrors: col.errors } : {}) };
  }

  const pulse = s.currentMode === 'pulse';
  // A pulse replaces the current, so width + rise + pulse is three givens: the core refuses it and so does this page (never a number).
  if (pulse && s.solveFor === 'current') {
    return { status: 'error', problems: [`Pulsed current cannot be combined with solving for current. ${PULSE_SOLVE_CURRENT_TEXT}`], fieldErrors, notes };
  }
  if (s.copperBy === 'weight' && s.weightSource === 'finished') return { status: 'needs-input', needs: [FINISHED_NEEDS], notes };
  if (s.copperBy === 'weight' && s.weightSource === '' && parsed.get('copperWeight')?.status === 'ok') notes.push(NOT_ANSWERED_NOTE);

  const needs: string[] = [];
  for (const k of active) {
    if (parsed.get(k)?.status === 'empty' && NEEDS_TEXT[k] !== undefined) needs.push(NEEDS_TEXT[k] as string);
  }
  if (s.layer === '') needs.push('Choose a copper layer: outer or inner. It is not assumed.');
  if (pulse && s.periodVsTau === '') needs.push(PERIOD_NEEDS);
  needs.push(...col.needs);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const q = (k: FieldKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  // The minimum trace width note needs a chosen profile and a layer count; without a profile the layer count is never sent.
  const noteWanted = s.profile === 'bundled' && s.layerCount !== '';
  const inputs: Inputs = {
    mode: 'B',
    layer: s.layer as Layer,
    ...(s.solveFor !== 'width' ? optional('width', q('width')) : {}),
    ...(s.solveFor !== 'current' && !pulse ? optional('current', q('current')) : {}),
    ...(pulse ? { ...optional('peakCurrent', q('peakCurrent')), ...optional('duty', q('duty')), ...(s.periodVsTau !== '' ? { periodVsTau: s.periodVsTau } : {}) } : {}),
    ...(s.solveFor !== 'deltaT' ? optional('deltaT', q('deltaT')) : {}),
    ...(s.copperBy === 'weight' ? optional('copperWeight', q('copperWeight')) : { ...optional('copperThickness', q('copperThickness')), copperBasis: s.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...optional('ambient', q('ambient')),
    ...optional('designMargin', q('designMargin')),
    ...optional('currentDerating', q('derating')),
    ...optional('maxAllowedTemp', q('maxTemp')),
    ...(col.tolerances !== undefined ? { tolerances: col.tolerances as Tolerances } : {}),
    ...(col.tolerances?.['width'] === 'profile' || noteWanted ? profileInputs(today) : {}),
    ...(noteWanted ? { layerCount: s.layerCount as LayerCountInput } : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const tk = tolKeyOfCoreField(out.error.field, tolFields);
    if (tk !== undefined) {
      const errors = { [tk]: out.error.message };
      return { status: 'error', problems: tolProblems(errors, tolFields), fieldErrors, notes, tolErrors: errors };
    }
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined ? FIELD_LABEL[key] : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const baseHead = HEADLINE[s.solveFor];
  const rmsUsed = pulse && s.periodVsTau === 'much-shorter';
  const pulseLabel = pulse && s.periodVsTau !== '' && s.solveFor !== 'current' ? PULSE_HEADLINE[s.periodVsTau][s.solveFor] : undefined;
  const head = pulseLabel === undefined ? baseHead : { ...baseHead, label: pulseLabel };
  const prefs = headlinePrefs(s.units);
  const skip = (['width', 'current capacity', 'temperature rise'] as const).filter((n) => n !== head.name);
  if (s.solveFor === 'deltaT') {
    notes.push('A predicted temperature rise has no recommended design value. Compare the maximum conductor temperature with what your materials and the board allow.');
  }
  const tolBuild =
    col.tolerances === undefined
      ? undefined
      : buildToleranceView(
          raw,
          {
            accuracyClass: meta.accuracyClass,
            prefs,
            labels: { [head.name]: head.label, 'maximum conductor temperature': RESULT_LABELS['maximum conductor temperature'] ?? '', [DRAWN_WIDTH_NAME]: 'Drawn width covering the width tolerance' },
            phrases: { width: 'required width' },
          },
          [head.name, 'maximum conductor temperature'],
        );
  const peakHigher = raw.warnings.find((w) => w.code === PEAK_HIGHER_CODE);
  const callout = rmsUsed && peakHigher !== undefined ? { heading: PEAK_HIGHER_HEADING, text: peakHigher.message } : undefined;
  const moved = (w: { code?: string }): boolean => w.code !== undefined && (NEAR_CODES.includes(w.code) || (callout !== undefined && w.code === PEAK_HIGHER_CODE));
  const baseWarnings = tolBuild === undefined ? raw.warnings : tolBuild.warnings;
  const forView: CalcResult = { ...raw, warnings: baseWarnings.filter((w) => !moved(w)) };
  const nearRaw = raw.warnings.filter((w) => w.code !== undefined && NEAR_CODES.includes(w.code));
  const codeOf = new Map(nearRaw.map((w) => [w.message, w.code as string]));
  const nearNotes: NearNote[] = orderWarnings(nearRaw).map((w) => ({ ...w, code: codeOf.get(w.message) ?? '' }));
  const profileNote = nearRaw.some((w) => PROFILE_NOTE_CODES.includes(w.code ?? ''));
  const nearResult: NearResultView = { notes: nearNotes, unverified: profileNote && raw.fabProfile !== undefined && raw.fabProfile.status !== 'VERIFIED' };
  const result = buildResultView(forView, {
    headline: head.name,
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: { ...RESULT_LABELS, [head.name]: head.label, ...(s.solveFor === 'width' ? {} : { width: 'Trace width' }) },
    skip: [...skip, ...(tolBuild?.skipNames ?? [])],
    designNotes: {
      width: { noun: 'margin', defaulted: s.designMargin.trim() === '', basis: widthBasis(raw) },
      'current capacity': { noun: 'derating', defaulted: s.derating.trim() === '' },
    },
    extraRows: [{ label: 'Copper used', text: copperBasisLine(raw, prefs) }],
    skipInputs: [...(s.solveFor === 'width' ? [] : ['designMargin']), ...(s.solveFor === 'current' ? [] : ['currentDerating'])],
    pinWarningCodes: ['LEGACY_METHOD', 'PULSE_RMS_ASSUMPTION', 'PULSE_PERIOD_NOT_SHORT'],
    informationalChecks: [STATED_MAX_CHECK_NAME],
    extraProvenance: provenance(s),
  });
  const okView = { status: 'ok' as const, result, raw, fieldErrors, notes, nearResult };
  return { ...okView, ...(tolBuild === undefined ? {} : { tolerance: tolBuild.view }), ...(callout === undefined ? {} : { callout }) };
}
