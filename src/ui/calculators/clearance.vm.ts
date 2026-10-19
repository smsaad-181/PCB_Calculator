// View-model for the clearance page (IEC 60664-1 method, gated). Pure: no DOM, no engineering math, no table value.
// Text in, display strings out. The calculation is src/core/calculators/clearance compute(); this file only parses fields,
// hands the user's tables to the core and shapes the outcome (needs-input, INSUFFICIENT DATA, OUT OF TABLE RANGE, error, result).
import { compute, type Inputs } from '../../core/calculators/clearance/calc';
import { FIELD_CONDITIONS, OVERVOLTAGE_CATEGORIES, type FieldCondition, type OvervoltageCategory } from '../../core/calculators/clearance/guards';
import { meta } from '../../core/calculators/clearance/meta';
import type { CoatingCredit, InsulationType, PollutionDegree } from '../../core/spacing/gating';
import type { SpacingTableSet } from '../../core/spacing/tables';
import { type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { readChoice, readText } from './circuit-view';
import {
  FREQUENCY,
  LENGTH,
  VOLTAGE,
  VOLTAGE_DEFAULTS,
  isInsulation,
  isPollution,
  type PollutionText,
  bannerView,
  classifyFailure,
  liveSummaryOf,
  okParts,
  parseQuantities,
  type BannerView,
  type CoreVoltage,
  type FailureView,
  type OkParts,
  type VoltageState,
} from './spacing-common.vm';
import { coatingFromHash, editionFromHash, editionToHash, flagFromHash, flagToHash, voltageFromHash, voltageToHash } from './spacing-state';

export const CALCULATOR_ID = 'clearance';
export const WRITTEN_KEYS: readonly string[] = stateKeyNames(CALCULATOR_ID);

export type Route = 'category' | 'impulse';

export interface ClearanceState extends VoltageState {
  readonly edition: string;
  readonly insulation: '' | InsulationType;
  readonly route: Route;
  readonly impulse: string;
  readonly category: '' | OvervoltageCategory;
  readonly supply: string;
  readonly pollution: PollutionText;
  readonly field: '' | FieldCondition;
  readonly altitude: string;
  readonly frequency: string;
  readonly coating: CoatingCredit;
  readonly soldermask: boolean;
}

/** Nothing mandatory is pre-filled. "none" coating and the route choice are not data defaults. */
export const DEFAULT_STATE: ClearanceState = Object.freeze({
  ...VOLTAGE_DEFAULTS,
  edition: '',
  insulation: '',
  route: 'category',
  impulse: '',
  category: '',
  supply: '',
  pollution: '',
  field: '',
  altitude: '',
  frequency: '',
  coating: 'none',
  soldermask: false,
});

export const PAGE_INTRO =
  'Minimum clearance (shortest distance through air) by the IEC 60664-1 method: the impulse withstand requirement, the pollution degree and the field condition select a value from tables that you enter from your licensed copy, corrected for altitude. The app ships no standard values, so every input below is required and nothing is pre-filled.';
export const METHOD_TEXT = 'Method: clearance = lookup in your table T2 (and T3 if entered) x altitude factor from your table T4. Altitude changes clearance only, never creepage.';

export const FIELD_LABEL = {
  edition: 'Data set edition',
  insulation: 'Insulation type',
  impulse: 'Rated impulse withstand voltage',
  category: 'Overvoltage category',
  supply: 'Nominal supply voltage (T1 row key)',
  pollution: 'Pollution degree',
  field: 'Field condition',
  altitude: 'Altitude above sea level',
  frequency: 'Frequency',
  peak: 'Peak working voltage',
  rms: 'RMS working voltage',
  waveValue: 'Waveform value',
} as const;

export const SUPPLY_HELP =
  'The row key of your table T1: the nominal system voltage as your edition keys it (often line-to-neutral, not the line-to-line value). It is NOT the voltage across this gap. For a DC bus or a circuit behind an isolating transformer or converter, use the impulse route with the level your product standard assigns to that circuit.';
export const PEAK_HELP = 'The actual highest steady or recurring peak voltage across this insulation (DC counts as peak). Not the supply voltage.';
export const CATEGORY_OPTIONS = OVERVOLTAGE_CATEGORIES.map((v) => ({ value: v, label: `Category ${v}` }));
export const FIELD_OPTIONS: readonly { value: FieldCondition; label: string }[] = [
  { value: 'inhomogeneous', label: 'Inhomogeneous field' },
  { value: 'homogeneous', label: 'Homogeneous field' },
];
export const ROUTE_OPTIONS: readonly { value: Route; label: string }[] = [
  { value: 'category', label: 'From an overvoltage category and the supply voltage (table T1)' },
  { value: 'impulse', label: 'I know the rated impulse withstand voltage (for example from my product standard)' },
];

/** What the core calls each missing input, in the page's words. */
export const NEED_LABELS: Readonly<Record<string, string>> = {
  edition: 'data set edition',
  insulationType: 'insulation type',
  'ratedImpulseVoltage OR (overvoltageCategory + supplyVoltage)': 'impulse requirement (a rated impulse voltage, or an overvoltage category with the supply voltage)',
  overvoltageCategory: 'overvoltage category',
  supplyVoltage: 'supply voltage',
  pollutionDegree: 'pollution degree',
  fieldCondition: 'field condition',
  altitude: 'altitude',
  workingVoltagePeak: 'peak working voltage (or a declared waveform: shape, basis and value)',
  frequency: 'frequency (0 Hz for DC)',
};
const CORE_FIELD: Readonly<Record<string, string>> = {
  edition: 'edition',
  ratedImpulseVoltage: 'impulse',
  supplyVoltage: 'supply',
  altitude: 'altitude',
  frequency: 'frequency',
  workingVoltagePeak: 'peak',
  workingVoltageRms: 'rms',
  'waveform.value': 'waveValue',
};

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'minimum clearance': 'Minimum clearance',
  'rated impulse withstand voltage used': 'Rated impulse withstand voltage used',
  'altitude correction factor': 'Altitude correction factor (clearance only)',
};
const PIN = ['T3_NOT_ENTERED', 'HF_NOT_CHECKED', 'COATING_CREDIT_NOT_APPLIED', 'SCOPE_NOT_CHECKED', 'OVERVOLTAGE_CATEGORY_CONFLICT'];

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const isCategory = (v: string): v is OvervoltageCategory => (OVERVOLTAGE_CATEGORIES as readonly string[]).includes(v);
const isField = (v: string): v is FieldCondition => (FIELD_CONDITIONS as readonly string[]).includes(v);
const isRoute = (v: string): v is Route => v === 'category' || v === 'impulse';

export function toHashState(s: ClearanceState): Record<string, string> {
  const out: Record<string, string> = {};
  editionToHash(s.edition, out);
  if (s.insulation !== '') out['it'] = s.insulation;
  if (s.route !== DEFAULT_STATE.route) out['rt'] = s.route;
  const put = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v.slice(0, 40);
  };
  put('iv', s.impulse);
  put('sv', s.supply);
  put('alt', s.altitude);
  put('fq', s.frequency);
  if (s.category !== '') out['oc'] = s.category;
  if (s.pollution !== '') out['pd'] = s.pollution;
  if (s.field !== '') out['fld'] = s.field;
  if (s.coating !== 'none') out['cc'] = s.coating;
  flagToHash(s.soldermask, 'sm', out);
  voltageToHash(s, out);
  return out;
}

export interface LoadedState {
  readonly state: ClearanceState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const route = readChoice(h, 'rt', isRoute, 'The impulse requirement route was not recognised: the overvoltage category route is used instead.', notices);
  const state: ClearanceState = {
    ...voltageFromHash(h, notices),
    edition: editionFromHash(h, notices),
    insulation: readChoice(h, 'it', isInsulation, 'The insulation type was not recognised and is not chosen.', notices),
    route: route === '' ? DEFAULT_STATE.route : route,
    impulse: readText(h, 'iv', FIELD_LABEL.impulse, notices),
    category: readChoice(h, 'oc', isCategory, 'The overvoltage category was not recognised and is not chosen.', notices),
    supply: readText(h, 'sv', FIELD_LABEL.supply, notices),
    pollution: readChoice(h, 'pd', isPollution, 'The pollution degree was not recognised and is not chosen.', notices),
    field: readChoice(h, 'fld', isField, 'The field condition was not recognised and is not chosen.', notices),
    altitude: readText(h, 'alt', FIELD_LABEL.altitude, notices),
    frequency: readText(h, 'fq', FIELD_LABEL.frequency, notices),
    coating: coatingFromHash(h, notices),
    soldermask: flagFromHash(h, 'sm'),
  };
  return { state, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type ClearanceView = (FailureView | ({ readonly status: 'ok' } & OkParts)) & {
  readonly banners: BannerView;
  readonly fieldErrors: Readonly<Record<string, string>>;
};

export function computeView(s: ClearanceState, tables: SpacingTableSet): ClearanceView {
  const banners = bannerView(tables, 'clearance');
  const byImpulse = s.route === 'impulse';
  const direct = s.voltageMode === 'direct';
  const parsed = parseQuantities([
    { key: 'impulse', label: FIELD_LABEL.impulse, dim: VOLTAGE, text: byImpulse ? s.impulse : '' },
    { key: 'supply', label: FIELD_LABEL.supply, dim: VOLTAGE, text: byImpulse ? '' : s.supply },
    { key: 'altitude', label: FIELD_LABEL.altitude, dim: LENGTH, text: s.altitude },
    { key: 'frequency', label: FIELD_LABEL.frequency, dim: FREQUENCY, text: s.frequency },
    { key: 'peak', label: FIELD_LABEL.peak, dim: VOLTAGE, text: direct ? s.peak : '' },
    { key: 'rms', label: FIELD_LABEL.rms, dim: VOLTAGE, text: direct ? s.rms : '' },
    { key: 'waveValue', label: FIELD_LABEL.waveValue, dim: VOLTAGE, text: direct ? '' : s.waveValue },
  ]);
  if (parsed.problems.length > 0) return { status: 'error', problems: parsed.problems, fieldErrors: parsed.fieldErrors, banners };
  const v = parsed.values;
  const volts: CoreVoltage = direct
    ? { ...(v['peak'] !== undefined ? { peak: v['peak'] } : {}), ...(v['rms'] !== undefined ? { rms: v['rms'] } : {}) }
    : s.shape !== '' && s.basis !== '' && v['waveValue'] !== undefined
      ? { waveform: { shape: s.shape, basis: s.basis, value: v['waveValue'] } }
      : {};
  const inputs: Inputs = {
    tables,
    ...(s.edition.trim() !== '' ? { edition: s.edition } : {}),
    ...(s.insulation !== '' ? { insulationType: s.insulation } : {}),
    ...(v['impulse'] !== undefined ? { ratedImpulseVoltage: v['impulse'] } : {}),
    ...(!byImpulse && s.category !== '' ? { overvoltageCategory: s.category } : {}),
    ...(v['supply'] !== undefined ? { supplyVoltage: v['supply'] } : {}),
    ...(s.pollution !== '' ? { pollutionDegree: Number(s.pollution) as PollutionDegree } : {}),
    ...(s.field !== '' ? { fieldCondition: s.field } : {}),
    ...(v['altitude'] !== undefined ? { altitude: v['altitude'] } : {}),
    ...(v['frequency'] !== undefined ? { frequency: v['frequency'] } : {}),
    ...(volts.peak !== undefined ? { workingVoltagePeak: volts.peak } : {}),
    ...(volts.rms !== undefined ? { workingVoltageRms: volts.rms } : {}),
    ...(volts.waveform !== undefined ? { waveform: volts.waveform } : {}),
    coatingCredit: s.coating,
    soldermask: s.soldermask,
  };
  const out = compute(inputs);
  if (!out.ok) {
    const f = classifyFailure(out.error, NEED_LABELS, CORE_FIELD);
    return { ...f, fieldErrors: f.status === 'error' ? f.fieldErrors : {}, banners };
  }
  return { status: 'ok', ...okParts(out.value, meta.accuracyClass, RESULT_LABELS, PIN), fieldErrors: {}, banners };
}

export function liveSummary(v: ClearanceView): string {
  return liveSummaryOf(v);
}
