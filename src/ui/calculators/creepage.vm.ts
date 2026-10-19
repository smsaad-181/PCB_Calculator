// View-model for the creepage page (IEC 60664-1 method, gated). Pure: no DOM, no engineering math, no table value.
// Creepage is driven by the RMS working voltage, pollution degree and material group (or CTI), never by voltage alone,
// and is never scaled by altitude. The calculation is src/core/calculators/creepage compute().
import { compute, type Inputs } from '../../core/calculators/creepage/calc';
import { GROOVE_STATES, SURFACES, type GrooveState, type Surface } from '../../core/calculators/creepage/guards';
import { meta } from '../../core/calculators/creepage/meta';
import type { CoatingCredit, InsulationType, PollutionDegree } from '../../core/spacing/gating';
import { MATERIAL_GROUPS, type MaterialGroup, type SpacingTableSet } from '../../core/spacing/tables';
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

export const CALCULATOR_ID = 'creepage';
export const WRITTEN_KEYS: readonly string[] = stateKeyNames(CALCULATOR_ID);

export type MaterialRoute = 'group' | 'cti';

export interface CreepageState extends VoltageState {
  readonly edition: string;
  readonly insulation: '' | InsulationType;
  readonly pollution: PollutionText;
  readonly materialRoute: MaterialRoute;
  readonly group: '' | MaterialGroup;
  readonly cti: string;
  readonly surface: '' | Surface;
  readonly frequency: string;
  readonly associated: string;
  readonly coating: CoatingCredit;
  readonly grooves: GrooveState;
  readonly altitude: string;
  readonly soldermask: boolean;
}

export const DEFAULT_STATE: CreepageState = Object.freeze({
  ...VOLTAGE_DEFAULTS,
  edition: '',
  insulation: '',
  pollution: '',
  materialRoute: 'group',
  group: '',
  cti: '',
  surface: '',
  frequency: '',
  associated: '',
  coating: 'none',
  grooves: 'none',
  altitude: '',
  soldermask: false,
});

export const PAGE_INTRO =
  'Minimum creepage (shortest distance along a surface) by the IEC 60664-1 method: the RMS working voltage, the pollution degree and the material group (or CTI) select a value from tables that you enter from your licensed copy. Creepage is never below the associated clearance and is never scaled by altitude. The app ships no standard values, so every input below is required and nothing is pre-filled.';
export const METHOD_TEXT = 'Method: creepage = lookup in your table T5 (reinforced rule from T7), never less than the associated clearance. No altitude term.';

export const FIELD_LABEL = {
  edition: 'Data set edition',
  insulation: 'Insulation type',
  pollution: 'Pollution degree',
  group: 'Material group',
  cti: 'Comparative tracking index (CTI)',
  surface: 'Surface',
  frequency: 'Frequency',
  associated: 'Associated clearance',
  altitude: 'Altitude above sea level',
  peak: 'Peak working voltage',
  rms: 'RMS working voltage',
  waveValue: 'Waveform value',
} as const;

export const GROUP_OPTIONS = MATERIAL_GROUPS.map((v) => ({ value: v, label: `Material group ${v}` }));
export const MATERIAL_ROUTE_OPTIONS: readonly { value: MaterialRoute; label: string }[] = [
  { value: 'group', label: 'I know the material group' },
  { value: 'cti', label: 'I know the CTI (the group comes from your table T6)' },
];
export const SURFACE_OPTIONS: readonly { value: Surface; label: string }[] = [
  { value: 'printed-wiring', label: 'Printed wiring material surface' },
  { value: 'other', label: 'Other surface' },
];
export const GROOVE_OPTIONS: readonly { value: GrooveState; label: string }[] = [
  { value: 'none', label: 'No grooves, slots or ribs on the path' },
  { value: 'present', label: 'Grooves, slots or ribs present (warning only, no credit)' },
];

export const NEED_LABELS: Readonly<Record<string, string>> = {
  edition: 'data set edition',
  insulationType: 'insulation type',
  workingVoltageRms: 'RMS working voltage (or a declared waveform: shape, basis and value)',
  pollutionDegree: 'pollution degree',
  'materialGroup OR cti': 'material group or CTI',
  surface: 'surface',
  frequency: 'frequency (0 Hz for DC)',
  associatedClearance: 'associated clearance',
};
const CORE_FIELD: Readonly<Record<string, string>> = {
  edition: 'edition',
  cti: 'cti',
  frequency: 'frequency',
  associatedClearance: 'associated',
  altitude: 'altitude',
  workingVoltagePeak: 'peak',
  workingVoltageRms: 'rms',
  'waveform.value': 'waveValue',
};
const RESULT_LABELS: Readonly<Record<string, string>> = { 'minimum creepage distance': 'Minimum creepage distance' };
const PIN = ['CREEPAGE_RAISED_TO_CLEARANCE', 'HF_NOT_CHECKED', 'COATING_CREDIT_NOT_APPLIED', 'SCOPE_NOT_CHECKED', 'GROOVES_NOT_CREDITED'];

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const isGroup = (v: string): v is MaterialGroup => (MATERIAL_GROUPS as readonly string[]).includes(v);
const isSurface = (v: string): v is Surface => (SURFACES as readonly string[]).includes(v);
const isGrooves = (v: string): v is GrooveState => (GROOVE_STATES as readonly string[]).includes(v);
const isMaterialRoute = (v: string): v is MaterialRoute => v === 'group' || v === 'cti';

export function toHashState(s: CreepageState): Record<string, string> {
  const out: Record<string, string> = {};
  editionToHash(s.edition, out);
  if (s.insulation !== '') out['it'] = s.insulation;
  if (s.pollution !== '') out['pd'] = s.pollution;
  if (s.materialRoute !== DEFAULT_STATE.materialRoute) out['mt'] = s.materialRoute;
  if (s.group !== '') out['mg'] = s.group;
  if (s.surface !== '') out['sf'] = s.surface;
  if (s.grooves !== DEFAULT_STATE.grooves) out['gr'] = s.grooves;
  if (s.coating !== 'none') out['cc'] = s.coating;
  const put = (k: string, v: string): void => {
    if (v.trim() !== '') out[k] = v.slice(0, 40);
  };
  put('cti', s.cti);
  put('fq', s.frequency);
  put('ac', s.associated);
  put('alt', s.altitude);
  flagToHash(s.soldermask, 'sm', out);
  voltageToHash(s, out);
  return out;
}

export interface LoadedState {
  readonly state: CreepageState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const route = readChoice(h, 'mt', isMaterialRoute, 'The material route was not recognised: the material group route is used instead.', notices);
  const grooves = readChoice(h, 'gr', isGrooves, 'The grooves choice was not recognised: none is used instead.', notices);
  const state: CreepageState = {
    ...voltageFromHash(h, notices),
    edition: editionFromHash(h, notices),
    insulation: readChoice(h, 'it', isInsulation, 'The insulation type was not recognised and is not chosen.', notices),
    pollution: readChoice(h, 'pd', isPollution, 'The pollution degree was not recognised and is not chosen.', notices),
    materialRoute: route === '' ? DEFAULT_STATE.materialRoute : route,
    group: readChoice(h, 'mg', isGroup, 'The material group was not recognised and is not chosen.', notices),
    cti: readText(h, 'cti', FIELD_LABEL.cti, notices),
    surface: readChoice(h, 'sf', isSurface, 'The surface was not recognised and is not chosen.', notices),
    frequency: readText(h, 'fq', FIELD_LABEL.frequency, notices),
    associated: readText(h, 'ac', FIELD_LABEL.associated, notices),
    coating: coatingFromHash(h, notices),
    grooves: grooves === '' ? DEFAULT_STATE.grooves : grooves,
    altitude: readText(h, 'alt', FIELD_LABEL.altitude, notices),
    soldermask: flagFromHash(h, 'sm'),
  };
  return { state, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type CreepageView = (FailureView | ({ readonly status: 'ok' } & OkParts)) & {
  readonly banners: BannerView;
  readonly fieldErrors: Readonly<Record<string, string>>;
};

export function computeView(s: CreepageState, tables: SpacingTableSet): CreepageView {
  const banners = bannerView(tables, 'creepage');
  const byCti = s.materialRoute === 'cti';
  const direct = s.voltageMode === 'direct';
  const parsed = parseQuantities([
    { key: 'cti', label: FIELD_LABEL.cti, dim: VOLTAGE, text: byCti ? s.cti : '' },
    { key: 'frequency', label: FIELD_LABEL.frequency, dim: FREQUENCY, text: s.frequency },
    { key: 'associated', label: FIELD_LABEL.associated, dim: LENGTH, text: s.associated },
    { key: 'altitude', label: FIELD_LABEL.altitude, dim: LENGTH, text: s.altitude },
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
    ...(volts.peak !== undefined ? { workingVoltagePeak: volts.peak } : {}),
    ...(volts.rms !== undefined ? { workingVoltageRms: volts.rms } : {}),
    ...(volts.waveform !== undefined ? { waveform: volts.waveform } : {}),
    ...(s.pollution !== '' ? { pollutionDegree: Number(s.pollution) as PollutionDegree } : {}),
    ...(!byCti && s.group !== '' ? { materialGroup: s.group } : {}),
    ...(v['cti'] !== undefined ? { cti: v['cti'] } : {}),
    ...(s.surface !== '' ? { surface: s.surface } : {}),
    ...(v['frequency'] !== undefined ? { frequency: v['frequency'] } : {}),
    ...(v['associated'] !== undefined ? { associatedClearance: v['associated'] } : {}),
    ...(v['altitude'] !== undefined ? { altitude: v['altitude'] } : {}),
    coatingCredit: s.coating,
    grooves: s.grooves,
    soldermask: s.soldermask,
  };
  const out = compute(inputs);
  if (!out.ok) {
    const f = classifyFailure(out.error, NEED_LABELS, CORE_FIELD);
    return { ...f, fieldErrors: f.status === 'error' ? f.fieldErrors : {}, banners };
  }
  return { status: 'ok', ...okParts(out.value, meta.accuracyClass, RESULT_LABELS, PIN), fieldErrors: {}, banners };
}

export function liveSummary(v: CreepageView): string {
  return liveSummaryOf(v);
}
