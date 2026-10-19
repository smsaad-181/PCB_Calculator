// View-model for the trace self-heating page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/self-heating compute().
import { compute, type Inputs } from '../../core/calculators/self-heating/calc';
import { meta } from '../../core/calculators/self-heating/meta';
import { DEFAULT_FOIL_CONVENTION } from '../../core/data/constants';
import type { CalcResult, CopperBasisKind } from '../../core/result';
import { DIM, FOIL_CONVENTIONS, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { echoPrefs, headlinePrefs, conventionSpreadText, type CopperLayer, type Units } from '../components/prefs';
import {
  buildResultView,
  MAX_FIELD_CHARS,
  orderWarnings,
  parseField,
  parseFractionField,
  type FieldView,
  type ProvenanceRow,
  type ResultView,
  type WarningView,
} from '../components/view';
import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';
import { PEAK_HIGHER_HEADING, PERIOD_LABEL, type PeriodChoice } from './pulse-labels';

export const CALCULATOR_ID = 'self-heating';

export type CopperBy = 'weight' | 'thickness';
export type ThermalLawChoice = '' | 'user-theta' | 'legacy-ipc2221-calibrated';
export type ThetaBy = 'theta' | 'per-length';
export type CurrentMode = 'steady' | 'pulse';
export type { PeriodChoice } from './pulse-labels';
export type { Units };

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" (or "use the default"). */
export interface SelfHeatingState {
  /** '' means not chosen yet. The thermal law is never defaulted. */
  readonly thermalLaw: ThermalLawChoice;
  readonly length: string;
  readonly width: string;
  /** '' means not chosen yet. The layer is never defaulted. */
  readonly layer: CopperLayer | '';
  readonly copperBy: CopperBy;
  readonly copperWeight: string;
  readonly copperThickness: string;
  readonly basis: CopperBasisKind;
  readonly weightSource: WeightSource;
  readonly convention: FoilConvention | '';
  readonly ambient: string;
  readonly currentMode: CurrentMode;
  readonly current: string;
  readonly peakCurrent: string;
  readonly duty: string;
  /** '' means not chosen: the pulse path requires an explicit statement. */
  readonly periodVsTau: PeriodChoice;
  readonly thetaBy: ThetaBy;
  readonly theta: string;
  readonly thetaPerLength: string;
  readonly units: Units;
}

export const DEFAULT_STATE: SelfHeatingState = Object.freeze({
  thermalLaw: '',
  length: '',
  width: '',
  layer: '',
  copperBy: 'weight',
  copperWeight: '',
  copperThickness: '',
  basis: 'nominal',
  weightSource: '',
  convention: '',
  ambient: '',
  currentMode: 'steady',
  current: '',
  peakCurrent: '',
  duty: '',
  periodVsTau: '',
  thetaBy: 'theta',
  theta: '',
  thetaPerLength: '',
  units: 'metric',
});

export const METHOD_TEXT = 'Method: steady-state self-heating with temperature-dependent copper resistance (coupled fixed point)';

export const LAW_LABEL: Readonly<Record<'user-theta' | 'legacy-ipc2221-calibrated', string>> = {
  'user-theta': 'User-supplied thermal resistance (user-theta)',
  'legacy-ipc2221-calibrated': 'Legacy IPC-2221 calibrated (legacy)',
};
export const LAW_HELP: Readonly<Record<'user-theta' | 'legacy-ipc2221-calibrated', string>> = {
  'user-theta': 'You supply the thermal resistance. It is treated as a constant and is not checked against any source.',
  'legacy-ipc2221-calibrated':
    'Legacy: the thermal resistance is derived from the legacy IPC-2221 curve fit (a fit to a chart, not a heat-flow model), so coupling it with the temperature-dependent resistance is an extrapolation.',
};
export { PERIOD_LABEL, PEAK_HIGHER_HEADING } from './pulse-labels';

export const DEFAULT_TEXT = {
  ambient: `${String(meta.defaults.ambientC)} °C (engineering default, not from a standard)`,
} as const;

export const RANGE_HINT =
  'Outside the stated plausibility range (an engineering range, not a standard), or no steady state was found, so the result is less reliable. See the confidence reasons.';

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = stateKeyNames(CALCULATOR_ID);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

type TextKey = 'length' | 'width' | 'copperWeight' | 'copperThickness' | 'ambient' | 'current' | 'peakCurrent' | 'duty' | 'theta' | 'thetaPerLength';

const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = {
  length: 'l',
  width: 'w',
  copperWeight: 'cw',
  copperThickness: 'ct',
  ambient: 'am',
  current: 'i',
  peakCurrent: 'ip',
  duty: 'du',
  theta: 'th',
  thetaPerLength: 'tl',
};
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];

/** State to put in the hash. Defaults are omitted; `law`, `ly` and `pt` are only ever written from a user choice. */
export function toHashState(s: SelfHeatingState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.thermalLaw !== '') out['law'] = s.thermalLaw;
  if (s.layer !== '') out['ly'] = s.layer;
  if (s.copperBy !== DEFAULT_STATE.copperBy) out['cs'] = s.copperBy;
  if (s.basis !== DEFAULT_STATE.basis) out['cb'] = s.basis;
  if (s.weightSource !== '') out['wsrc'] = s.weightSource;
  if (s.convention !== '') out['conv'] = s.convention;
  if (s.thetaBy !== DEFAULT_STATE.thetaBy) out['thby'] = s.thetaBy;
  if (s.currentMode !== DEFAULT_STATE.currentMode) out['cm'] = s.currentMode;
  if (s.periodVsTau !== '') out['pt'] = s.periodVsTau;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: SelfHeatingState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: SelfHeatingState = DEFAULT_STATE;
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

  const law = get('law');
  if (law !== undefined) {
    if (law === 'user-theta' || law === 'legacy-ipc2221-calibrated') s = { ...s, thermalLaw: law };
    else notices.push('The thermal law was not recognised: none is chosen. Choose user-supplied thermal resistance or legacy IPC-2221 calibrated.');
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
  const thby = get('thby');
  if (thby !== undefined) {
    if (thby === 'theta' || thby === 'per-length') s = { ...s, thetaBy: thby };
    else notices.push('How the thermal resistance is given was not recognised: K/W is used instead.');
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
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  if (get('mode') !== undefined) notices.push('A method mode in the link does not apply to this calculator and was not used.');
  if (get('fc') !== undefined) notices.push('A foil thickness per oz/ft² in the link is not used by this page. The foil convention is chosen in the form.');
  s = {
    ...s,
    length: text('length'),
    width: text('width'),
    copperWeight: text('copperWeight'),
    copperThickness: text('copperThickness'),
    ambient: text('ambient'),
    current: text('current'),
    peakCurrent: text('peakCurrent'),
    duty: text('duty'),
    theta: text('theta'),
    thetaPerLength: text('thetaPerLength'),
  };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'layer' | 'convention' | 'thermalLaw' | 'periodVsTau';
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Which quantity fields the page shows and reads. Hidden fields are never read. */
export function activeFields(s: Pick<SelfHeatingState, 'copperBy' | 'thermalLaw' | 'thetaBy' | 'currentMode'>): readonly TextKey[] {
  const out: TextKey[] = ['length', 'width', s.copperBy === 'weight' ? 'copperWeight' : 'copperThickness', 'ambient'];
  if (s.currentMode === 'pulse') out.push('peakCurrent', 'duty');
  else out.push('current');
  if (s.thermalLaw === 'user-theta') out.push(s.thetaBy === 'per-length' ? 'thetaPerLength' : 'theta');
  return out;
}

const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  length: 'Trace length',
  width: 'Trace width',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  current: 'Current',
  peakCurrent: 'Peak current',
  duty: 'Duty cycle',
  theta: 'Thermal resistance',
  thetaPerLength: 'Thermal resistance per length',
  layer: 'Copper layer',
  convention: 'Foil convention',
  thermalLaw: 'Thermal law',
  periodVsTau: 'Period versus thermal time constant',
};

const FIELD_DIM: Readonly<Record<TextKey, Dim>> = {
  length: DIM.LENGTH,
  width: DIM.LENGTH,
  copperWeight: DIM.AREAL_MASS,
  copperThickness: DIM.LENGTH,
  ambient: DIM.ABS_TEMPERATURE,
  current: DIM.CURRENT,
  peakCurrent: DIM.CURRENT,
  duty: DIM.DIMENSIONLESS,
  theta: DIM.THERMAL_RESISTANCE,
  thetaPerLength: DIM.THERMAL_RESISTANCE_PER_LENGTH,
};

/** Expected dimension of a field (what the parser must check the typed unit against). */
export function fieldDim(k: TextKey): Dim {
  return FIELD_DIM[k];
}

function echoFor(s: SelfHeatingState, k: TextKey): DisplayPrefs {
  return echoPrefs(s.units, k === 'copperThickness' ? 'thickness' : k === 'length' || k === 'width' ? 'width' : 'other');
}

export function parseFieldOf(s: SelfHeatingState, k: TextKey): FieldView {
  return k === 'duty' ? parseFractionField(s[k]) : parseField(s[k], fieldDim(k), echoFor(s, k));
}

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  length: 'length',
  width: 'width',
  copperWeight: 'copperWeight',
  copperThickness: 'copperThickness',
  ambient: 'ambient',
  current: 'current',
  peakCurrent: 'peakCurrent',
  duty: 'duty',
  theta: 'theta',
  thetaPerLength: 'thetaPerLength',
  layer: 'layer',
  convention: 'convention',
  thermalLaw: 'thermalLaw',
  periodVsTau: 'periodVsTau',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type SelfHeatingView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      /** Thermal runaway or no convergence: the core gave no temperature. No number is carried here. */
      readonly status: 'no-steady-state';
      readonly critical: readonly WarningView[];
      readonly other: readonly WarningView[];
      readonly checks: readonly { name: string; ok: boolean; detail: string }[];
      readonly recommendation: string;
      readonly notes: readonly string[];
    }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** Present for an rms pulse: the result is a mean rise and the peak is higher. */
      readonly callout?: { readonly heading: string; readonly text: string };
    };

const RESULT_LABELS: Readonly<Record<string, string>> = {
  [meta.resultNames.deltaT]: 'Temperature rise',
  [meta.resultNames.deltaTPeak]: 'Temperature rise at peak current held continuously (not an rms result)',
  [meta.resultNames.conductorTemperature]: 'Conductor temperature',
  [meta.resultNames.resistance]: 'Resistance at conductor temperature',
  [meta.resultNames.power]: 'Power dissipated',
  [meta.resultNames.voltageDrop]: 'Voltage drop',
  [meta.resultNames.deltaTUncoupled]: 'Temperature rise without resistance coupling (alpha = 0)',
  [meta.resultNames.couplingEffect]: 'Coupling effect vs alpha = 0 (percent)',
  [meta.resultNames.theta]: 'Thermal resistance used',
  [meta.resultNames.effectiveCurrent]: 'Effective current used for heating',
  length: 'Trace length',
  width: 'Trace width',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  current: 'Current',
  peakCurrent: 'Peak current',
  duty: 'Duty cycle',
  theta: 'Thermal resistance (user-supplied)',
  thetaPerLength: 'Thermal resistance per length (user-supplied)',
};

const MEAN_RISE_LABEL = 'Mean temperature rise (pulse, from the rms current)';

const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = {
  'copper thickness': 'thickness',
  'Copper thickness': 'thickness',
  copperThickness: 'thickness',
};

function needsFor(s: SelfHeatingState, k: TextKey): string | undefined {
  switch (k) {
    case 'length':
      return 'Enter the trace length (for example 100 mm or 4 in).';
    case 'width':
      return 'Enter the trace width (for example 0.254 mm or 10 mil).';
    case 'copperWeight':
      return 'Enter the copper weight (for example 1 oz).';
    case 'copperThickness':
      return 'Enter the copper thickness (for example 35 um).';
    case 'current':
      return 'Enter the current (for example 2 A).';
    case 'peakCurrent':
      return 'Enter the peak current (for example 4 A).';
    case 'duty':
      return 'Enter the duty cycle (for example 25% or 0.25).';
    case 'theta':
      return 'Enter the thermal resistance (for example 50 K/W).';
    case 'thetaPerLength':
      return s.thermalLaw === 'user-theta' ? 'Enter the thermal resistance per length (for example 5 K·m/W).' : undefined;
    default:
      return undefined;
  }
}

function provenance(s: SelfHeatingState): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [];
  if (s.thermalLaw !== '') rows.push({ label: 'Thermal law', value: LAW_LABEL[s.thermalLaw], source: 'user' });
  rows.push({ label: 'Copper layer', value: s.layer, source: 'user' });
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
  return rows;
}

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator found a steady state.
 * Invalid or missing input yields a message naming the field; runaway or no convergence yields a warning and no number.
 */
export function computeView(s: SelfHeatingState): SelfHeatingView {
  const notes: string[] = [];
  const active = activeFields(s);
  const parsed = new Map<TextKey, FieldView>();
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
  if (s.thermalLaw === '') needs.push('Choose a thermal law: user-supplied thermal resistance or legacy IPC-2221 calibrated. It is not assumed.');
  for (const k of active) {
    if (parsed.get(k)?.status === 'empty' && k !== 'ambient') {
      const n = needsFor(s, k);
      if (n !== undefined) needs.push(n);
    }
  }
  if (s.layer === '') needs.push('Choose a copper layer: outer or inner. It is not assumed.');
  if (s.currentMode === 'pulse' && s.periodVsTau === '') {
    needs.push('Say whether the pulse period is much shorter than the thermal time constant, or comparable to or longer. It is not assumed.');
  }
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const q = (k: TextKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  const pulse = s.currentMode === 'pulse';
  const inputs = {
    thermalLaw: s.thermalLaw as 'user-theta' | 'legacy-ipc2221-calibrated',
    layer: s.layer as CopperLayer,
    length: q('length') as Quantity,
    width: q('width') as Quantity,
    ...(s.copperBy === 'weight' ? optional('copperWeight', q('copperWeight')) : { ...optional('copperThickness', q('copperThickness')), copperBasis: s.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...optional('ambient', q('ambient')),
    ...(pulse
      ? { ...optional('peakCurrent', q('peakCurrent')), ...optional('duty', q('duty')), ...(s.periodVsTau !== '' ? { periodVsTau: s.periodVsTau } : {}) }
      : optional('current', q('current'))),
    ...(s.thermalLaw === 'user-theta' ? (s.thetaBy === 'per-length' ? optional('thetaPerLength', q('thetaPerLength')) : optional('theta', q('theta'))) : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined ? FIELD_LABEL[key] : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const stalled = raw.warnings.some((w) => w.code === 'THERMAL_RUNAWAY' || w.code === 'MAX_ITER') || !raw.results.some((r) => r.name === meta.resultNames.conductorTemperature);
  if (stalled) {
    const ordered = orderWarnings(raw.warnings);
    return {
      status: 'no-steady-state',
      critical: ordered.filter((w) => w.severity === 'critical'),
      other: ordered.filter((w) => w.severity !== 'critical'),
      checks: raw.validityChecks.map((c) => ({ ...c })),
      recommendation: raw.recommendation,
      notes,
    };
  }

  const peakBased = pulse && s.periodVsTau === 'comparable-or-longer';
  const rmsUsed = pulse && s.periodVsTau === 'much-shorter';
  const headlineName = peakBased ? meta.resultNames.deltaTPeak : meta.resultNames.deltaT;
  const labels: Record<string, string> = { ...RESULT_LABELS, [headlineName]: rmsUsed ? MEAN_RISE_LABEL : (RESULT_LABELS[headlineName] ?? 'Temperature rise') };
  const result = buildResultView(raw, {
    headline: headlineName,
    accuracyClass: meta.accuracyClass,
    prefs: headlinePrefs(s.units),
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels,
    skip: [meta.resultNames.iterations, meta.resultNames.residual, meta.resultNames.searchLimit],
    pinWarningCodes: ['PULSE_RMS_ASSUMPTION', 'PULSE_PERIOD_NOT_SHORT'],
    rowWarnings: { [meta.resultNames.voltageDrop]: 'VOLTAGE_DROP_SCOPE' },
    extraProvenance: provenance(s),
  });
  const peakWarning = raw.warnings.find((w) => w.code === 'PULSE_RMS_ASSUMPTION');
  const callout = rmsUsed && peakWarning !== undefined ? { heading: PEAK_HIGHER_HEADING, text: peakWarning.message } : undefined;
  return callout === undefined ? { status: 'ok', result, raw, fieldErrors, notes } : { status: 'ok', result, raw, fieldErrors, notes, callout };
}
