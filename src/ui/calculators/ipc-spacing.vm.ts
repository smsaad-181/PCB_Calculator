// View-model for the IPC-2221 conductor spacing page. A separate, labelled DESIGN GUIDELINE (not a safety insulation assessment): it has no
// pollution degree, material group or overvoltage category input and never replaces the IEC 60664-1 pages. Pure: no DOM, no engineering
// math, no table value. The calculation is src/core/calculators/ipc-spacing compute().
import { compute, IPC_LABEL, type Inputs } from '../../core/calculators/ipc-spacing/calc';
import { COATINGS, CONDUCTOR_KINDS, LOCATIONS, type Coating, type ConductorKind, type Location } from '../../core/calculators/ipc-spacing/guards';
import { meta } from '../../core/calculators/ipc-spacing/meta';
import type { SpacingTableSet } from '../../core/spacing/tables';
import { type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { readChoice, readText } from './circuit-view';
import {
  LENGTH,
  VOLTAGE,
  VOLTAGE_DEFAULTS,
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
import { editionFromHash, editionToHash, voltageFromHash, voltageToHash } from './spacing-state';

export const CALCULATOR_ID = 'ipc-spacing';
export const WRITTEN_KEYS: readonly string[] = stateKeyNames(CALCULATOR_ID);

export type ElevationMode = 'height' | 'vacuum';

export interface IpcSpacingState extends VoltageState {
  readonly edition: string;
  readonly location: '' | Location;
  readonly kind: '' | ConductorKind;
  readonly coating: '' | Coating;
  readonly elevationMode: ElevationMode;
  readonly elevation: string;
}

export const DEFAULT_STATE: IpcSpacingState = Object.freeze({
  ...VOLTAGE_DEFAULTS,
  edition: '',
  location: '',
  kind: '',
  coating: '',
  elevationMode: 'height',
  elevation: '',
});

export const GUIDELINE_LABEL = IPC_LABEL;
export const PAGE_INTRO =
  'Conductor spacing from the IPC-2221 electrical spacing table that you enter from your licensed copy. This is a design guideline, not a safety insulation assessment: it has no pollution degree, material group or overvoltage category, and it never replaces the IEC 60664-1 clearance and creepage pages or your product standard. The app ships no standard values, so every input below is required and nothing is pre-filled.';
export const METHOD_TEXT = 'Method: spacing = lookup in your table T8 by voltage between conductors, location, conductor kind, coating and elevation; above the top band the per-volt rule from the same column.';

export const FIELD_LABEL = {
  edition: 'Data set edition',
  location: 'Conductor location',
  kind: 'Conductor kind',
  coating: 'Coating',
  elevation: 'Elevation above sea level',
  peak: 'Voltage between conductors (DC or AC peak)',
  rms: 'RMS voltage between conductors',
  waveValue: 'Waveform value',
} as const;

export const LOCATION_OPTIONS: readonly { value: Location; label: string }[] = [
  { value: 'internal', label: 'Internal conductors' },
  { value: 'external', label: 'External conductors' },
];
export const KIND_OPTIONS: readonly { value: ConductorKind; label: string }[] = [
  { value: 'bare-board', label: 'Bare board' },
  { value: 'component-lead', label: 'Component lead or termination' },
];
export const COATING_OPTIONS: readonly { value: Coating; label: string }[] = [
  { value: 'uncoated', label: 'Uncoated' },
  { value: 'permanent-polymer-or-solder-mask', label: 'Permanent polymer coating or solder mask (a table column, not a credit)' },
  { value: 'conformal-coating', label: 'Conformal coating' },
];
export const ELEVATION_OPTIONS: readonly { value: ElevationMode; label: string }[] = [
  { value: 'height', label: 'A height above sea level' },
  { value: 'vacuum', label: 'Vacuum' },
];

export const NEED_LABELS: Readonly<Record<string, string>> = {
  edition: 'data set edition',
  voltagePeak: 'voltage between conductors, peak (or a declared waveform: shape, basis and value)',
  location: 'conductor location',
  'conductorKind': 'conductor kind',
  coating: 'coating',
  elevation: 'elevation (a height above sea level, or vacuum)',
};
const CORE_FIELD: Readonly<Record<string, string>> = {
  edition: 'edition',
  voltagePeak: 'peak',
  voltageRms: 'rms',
  elevation: 'elevation',
  'waveform.value': 'waveValue',
};
const RESULT_LABELS: Readonly<Record<string, string>> = { 'minimum conductor spacing (IPC-2221 design guideline)': 'Minimum conductor spacing (IPC-2221 design guideline)' };
const PIN = ['IPC_NOT_SAFETY'];

const isLocation = (v: string): v is Location => (LOCATIONS as readonly string[]).includes(v);
const isKind = (v: string): v is ConductorKind => (CONDUCTOR_KINDS as readonly string[]).includes(v);
const isCoating = (v: string): v is Coating => (COATINGS as readonly string[]).includes(v);
const isElevationMode = (v: string): v is ElevationMode => v === 'height' || v === 'vacuum';

export function toHashState(s: IpcSpacingState): Record<string, string> {
  const out: Record<string, string> = {};
  editionToHash(s.edition, out);
  if (s.location !== '') out['lc'] = s.location;
  if (s.kind !== '') out['ck'] = s.kind;
  if (s.coating !== '') out['co'] = s.coating;
  if (s.elevationMode !== DEFAULT_STATE.elevationMode) out['el'] = s.elevationMode;
  if (s.elevation.trim() !== '') out['eh'] = s.elevation.slice(0, 40);
  voltageToHash(s, out);
  return out;
}

export interface LoadedState {
  readonly state: IpcSpacingState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const mode = readChoice(h, 'el', isElevationMode, 'The elevation entry was not recognised: a height is used instead.', notices);
  const state: IpcSpacingState = {
    ...voltageFromHash(h, notices),
    edition: editionFromHash(h, notices),
    location: readChoice(h, 'lc', isLocation, 'The conductor location was not recognised and is not chosen.', notices),
    kind: readChoice(h, 'ck', isKind, 'The conductor kind was not recognised and is not chosen.', notices),
    coating: readChoice(h, 'co', isCoating, 'The coating was not recognised and is not chosen.', notices),
    elevationMode: mode === '' ? DEFAULT_STATE.elevationMode : mode,
    elevation: readText(h, 'eh', FIELD_LABEL.elevation, notices),
  };
  return { state, notices };
}

export type IpcSpacingView = (FailureView | ({ readonly status: 'ok' } & OkParts)) & {
  readonly banners: BannerView;
  readonly fieldErrors: Readonly<Record<string, string>>;
};

/** The elevation inputs apply to external, uncoated conductors only; the page hides them otherwise. */
export function usesElevation(s: IpcSpacingState): boolean {
  return s.location === 'external' && (s.coating === '' || s.coating === 'uncoated');
}

export function computeView(s: IpcSpacingState, tables: SpacingTableSet): IpcSpacingView {
  const banners = bannerView(tables, 'ipc-spacing');
  const direct = s.voltageMode === 'direct';
  const wantHeight = usesElevation(s) && s.elevationMode === 'height';
  const parsed = parseQuantities([
    { key: 'peak', label: FIELD_LABEL.peak, dim: VOLTAGE, text: direct ? s.peak : '' },
    { key: 'rms', label: FIELD_LABEL.rms, dim: VOLTAGE, text: direct ? s.rms : '' },
    { key: 'waveValue', label: FIELD_LABEL.waveValue, dim: VOLTAGE, text: direct ? '' : s.waveValue },
    { key: 'elevation', label: FIELD_LABEL.elevation, dim: LENGTH, text: wantHeight ? s.elevation : '' },
  ]);
  if (parsed.problems.length > 0) return { status: 'error', problems: parsed.problems, fieldErrors: parsed.fieldErrors, banners };
  const v = parsed.values;
  const volts: CoreVoltage = direct
    ? { ...(v['peak'] !== undefined ? { peak: v['peak'] } : {}), ...(v['rms'] !== undefined ? { rms: v['rms'] } : {}) }
    : s.shape !== '' && s.basis !== '' && v['waveValue'] !== undefined
      ? { waveform: { shape: s.shape, basis: s.basis, value: v['waveValue'] } }
      : {};
  const external = s.location === 'external';
  const inputs: Inputs = {
    tables,
    ...(s.edition.trim() !== '' ? { edition: s.edition } : {}),
    ...(volts.peak !== undefined ? { voltagePeak: volts.peak } : {}),
    ...(volts.rms !== undefined ? { voltageRms: volts.rms } : {}),
    ...(volts.waveform !== undefined ? { waveform: volts.waveform } : {}),
    ...(s.location !== '' ? { location: s.location } : {}),
    ...(external && s.kind !== '' ? { conductorKind: s.kind } : {}),
    ...(external && s.coating !== '' ? { coating: s.coating } : {}),
    ...(usesElevation(s) ? (s.elevationMode === 'vacuum' ? { elevation: 'vacuum' as const } : v['elevation'] !== undefined ? { elevation: v['elevation'] } : {}) : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const f = classifyFailure(out.error, NEED_LABELS, CORE_FIELD);
    return { ...f, fieldErrors: f.status === 'error' ? f.fieldErrors : {}, banners };
  }
  return { status: 'ok', ...okParts(out.value, meta.accuracyClass, RESULT_LABELS, PIN), fieldErrors: {}, banners };
}

export function liveSummary(v: IpcSpacingView): string {
  return liveSummaryOf(v);
}
