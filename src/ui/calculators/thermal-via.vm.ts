// View-model for the thermal via page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/thermal-via compute().
import { compute, type Inputs } from '../../core/calculators/thermal-via/calc';
import { meta } from '../../core/calculators/thermal-via/meta';
import { copperThermalConductivity, type CopperKMaterial } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult } from '../../core/result';
import { DIM, q, type Dim, type DisplayPrefs, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import { buildResultView, MAX_FIELD_CHARS, parseField, type FieldView, type LedgerEntryView, type ProvenanceRow, type ResultView } from '../components/view';

export const CALCULATOR_ID = 'thermal-via';
export type { Units };

export type KChoice = '' | CopperKMaterial;
export type FillChoice = '' | 'none' | 'filled';
export type DiameterBasis = '' | 'finished' | 'drill';
export type PlatingSource = 'user' | 'fab-profile-average';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" or "not chosen". Nothing is pre-filled. */
export interface ThermalViaState {
  /** The hole diameter exactly as typed. What it means is set by `diameterBasis` (finished or drill): there is no default. */
  readonly diameter: string;
  readonly diameterBasis: DiameterBasis;
  readonly plating: string;
  readonly length: string;
  readonly count: string;
  readonly kMaterial: KChoice;
  readonly fill: FillChoice;
  readonly fillK: string;
  readonly power: string;
  readonly platingSource: PlatingSource;
  readonly units: Units;
}

export const DEFAULT_STATE: ThermalViaState = Object.freeze({
  diameter: '',
  diameterBasis: '',
  plating: '',
  length: '',
  count: '',
  kMaterial: '',
  fill: '',
  fillK: '',
  power: '',
  platingSource: 'user',
  units: 'metric',
});

export const PAGE_INTRO =
  'A one-dimensional conduction estimate of the thermal resistance of a plated via barrel, with an optional fill and N vias in parallel. It is usually a lower bound for the real heat path, not assured. It is not a package metric.';
export const METHOD_TEXT = 'Method: plated barrel as a copper annulus, optional fill core in parallel, N identical vias in ideal parallel; spreading is ignored';

/** Always visible, with or without a result. */
export const STATUS_LINES: readonly string[] = [
  'Estimate, low confidence.',
  '1-D conduction along the barrels (and fill) only: usually a lower bound on the thermal resistance, not assured. Spreading, package, solder and airflow are not modelled, and a solid connection to the plane is assumed.',
  'Not theta-JA and not a design constant.',
];

export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard): less reliable. See the confidence reasons.';
export const DIAMETER_HELP =
  'Choose the basis first. Finished: the inside diameter after plating. Drill: the drill size, from which the finished hole is D - 2t. Write the unit (mm or mil). A drill size typed as a finished hole makes the resistance too low. Many fabs read the hole size in your data as the FINISHED hole, while some drill plated holes a stated amount larger (for example, Eurocircuits states in its guidelines that it drills plated holes finished + 0.1 mm; that is one fab practice, not a standard, and no allowance is built in here). Confirm with your fab. Picking drill when the size is really finished errs conservative (theta too high).';
export const DIAMETER_BASIS_HELP = 'Required, no default. It is not guessed because the same number means different holes on the two bases.';
export const DIAMETER_BASIS_OPTIONS: readonly { value: 'finished' | 'drill'; label: string }[] = [
  { value: 'finished', label: 'Finished hole (inside the plating)' },
  { value: 'drill', label: 'Drill diameter (finished hole = drill - 2 x plating)' },
];
/** A placeholder that is neutral: a finished-size example only on the finished basis, never a typical drill size. */
export function diameterPlaceholder(basis: DiameterBasis): string {
  return basis === 'finished' ? '0.25 mm' : 'with unit: mm or mil';
}
export const VIA_COUNT_HINT_FROM = 100;
export const VIA_COUNT_HINT =
  'A large via count is accepted without a fit check. Check that N vias fit under the pad at your fabricator hole-to-hole limit, and note that open vias in an exposed pad can wick solder (fill, plug or tent them as your assembly guidance says). The threshold for this hint is a product choice, not a sourced limit.';
export const PLATING_HELP =
  'Required, never filled in for you. Published values differ and a fab profile figure is an average, not a minimum. Always write the unit (um or mil).';
export const LENGTH_HELP = 'Board thickness for a through via, or the span for a blind or buried via. Example: 1.6 mm.';
export const COUNT_HELP = 'Identical vias between the same two copper areas. Use 1 for a single via. theta/N is the ideal, not the expected value.';
export const K_HELP =
  'No default: the sources disagree by a few percent (ledger S-007, CONFLICT). The higher value gives a lower theta, which is the non-conservative side. The conductivity of plated barrel copper was not found (S-041d).';
export const FILL_HELP = 'No default. A filled via adds the fill core in parallel with the barrel (void-free, full contact assumed).';
export const FILL_K_HELP = 'Required for a filled via. No fill material value is built in: take it from the fill datasheet and write the unit (for example 1.5 W/mK).';
export const POWER_HELP = 'Optional. Gives a temperature difference theta x P across the array, assuming all of that power flows through the vias. Usually a lower bound, not assured, and not a junction temperature.';
export const PLATING_SOURCE_HELP = 'A fabricator profile gives an AVERAGE plating, not a minimum: thin spots are thinner, so the real theta is higher.';

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
const K_IDS: readonly CopperKMaterial[] = ['pure-401', 'c11000-391'];
const K_NAME: Readonly<Record<CopperKMaterial, string>> = { 'pure-401': 'Pure copper', 'c11000-391': 'C11000 copper' };

function kValueText(m: CopperKMaterial): string {
  const k = copperThermalConductivity(m);
  return formatResult({ value: k.value, bound: 'nominal' }, { accuracyClass: meta.accuracyClass });
}

/** Material choices from core data. There is no empty "default" option: the page adds a placeholder that is not a value. */
export function kOptions(): readonly { value: CopperKMaterial; label: string }[] {
  return K_IDS.map((m) => ({ value: m, label: `${K_NAME[m]}, ${kValueText(m)} (ledger S-007 CONFLICT)` }));
}

export const FILL_OPTIONS: readonly { value: 'none' | 'filled'; label: string }[] = [
  { value: 'none', label: 'Not filled (barrel wall only, air in the hole ignored)' },
  { value: 'filled', label: 'Filled (you give the fill conductivity)' },
];

export const PLATING_SOURCE_OPTIONS: readonly { value: PlatingSource; label: string }[] = [
  { value: 'user', label: 'My own value (specified or measured)' },
  { value: 'fab-profile-average', label: 'A fabricator AVERAGE (not a minimum)' },
];

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
type TextKey = 'diameter' | 'plating' | 'length' | 'count' | 'fillK' | 'power';

const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = { diameter: 'd', plating: 't', length: 'l', count: 'n', fillK: 'kf', power: 'p' };
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];
const LOCAL_KEYS = stateKeyNames(CALCULATOR_ID);
/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

const FIELD_LABEL: Readonly<Record<TextKey, string>> = {
  diameter: 'Hole diameter',
  plating: 'Plating thickness',
  length: 'Barrel length',
  count: 'Number of vias',
  fillK: 'Fill thermal conductivity',
  power: 'Power through the vias',
};

const FIELD_DIM: Readonly<Record<Exclude<TextKey, 'count'>, Dim>> = {
  diameter: DIM.LENGTH,
  plating: DIM.LENGTH,
  length: DIM.LENGTH,
  fillK: DIM.THERMAL_CONDUCTIVITY,
  power: DIM.POWER,
};
export function fieldDim(k: Exclude<TextKey, 'count'>): Dim {
  return FIELD_DIM[k];
}

export function toHashState(s: ThermalViaState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.diameterBasis !== '') out['db'] = s.diameterBasis;
  if (s.kMaterial !== '') out['km'] = s.kMaterial;
  if (s.fill !== '') out['fl'] = s.fill;
  if (s.platingSource !== DEFAULT_STATE.platingSource) out['ps'] = s.platingSource;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: ThermalViaState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes blank (or the default) plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: ThermalViaState = DEFAULT_STATE;
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
  const db = get('db');
  if (db !== undefined) {
    if (db === 'finished' || db === 'drill') s = { ...s, diameterBasis: db };
    else notices.push('The diameter basis (finished or drill) was not recognised: none is chosen. Choose one.');
  }
  const km = get('km');
  if (km !== undefined) {
    const m = K_IDS.find((id) => id === km);
    if (m !== undefined) s = { ...s, kMaterial: m };
    else notices.push('The copper thermal conductivity choice was not recognised: none is chosen. Choose one.');
  }
  const fl = get('fl');
  if (fl !== undefined) {
    if (fl === 'none' || fl === 'filled') s = { ...s, fill: fl };
    else notices.push('The fill choice was not recognised: none is chosen. Choose one.');
  }
  const ps = get('ps');
  if (ps !== undefined) {
    if (ps === 'user' || ps === 'fab-profile-average') s = { ...s, platingSource: ps };
    else notices.push('Where the plating value came from was not recognised: your own value is assumed.');
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  s = { ...s, diameter: text('diameter'), plating: text('plating'), length: text('length'), count: text('count'), fillK: text('fillK'), power: text('power') };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'diameterBasis' | 'kMaterial' | 'fill';
export type FieldErrors = Partial<Record<FieldKey, string>>;

export function echoFor(s: ThermalViaState, k: Exclude<TextKey, 'count'>): DisplayPrefs {
  return echoPrefs(s.units, k === 'plating' ? 'thickness' : k === 'diameter' || k === 'length' ? 'width' : 'other');
}

const COUNT_MESSAGE = 'Enter a whole number of vias, 1 or more (for example 1 for a single via).';
/** Count is a plain whole number: input validation, not engineering math. */
export function parseCountField(text: string): FieldView {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!/^\d+$/.test(t)) return { status: 'error', message: COUNT_MESSAGE };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < 1) return { status: 'error', message: COUNT_MESSAGE };
  return { status: 'ok', value: q(n, DIM.DIMENSIONLESS), echo: `${String(n)} (whole number)`, warnings: [] };
}

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  finishedHoleDiameter: 'diameter',
  diameterBasis: 'diameterBasis',
  platingThickness: 'plating',
  barrelLength: 'length',
  count: 'count',
  fillConductivity: 'fillK',
  power: 'power',
  kMaterial: 'kMaterial',
  fill: 'fill',
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
export const CALLOUT_CODES = ['ONE_D_ESTIMATE', 'NOT_THETA_JA'] as const;
const CALLOUT_HEADING: Readonly<Record<(typeof CALLOUT_CODES)[number], string>> = {
  ONE_D_ESTIMATE: 'One-dimensional estimate: usually a lower bound on the thermal resistance (not assured), not a design constant',
  NOT_THETA_JA: 'Not theta-JA, not theta-JC',
};

const RELIEF_CODE = 'THERMAL_RELIEF_NOT_MODELLED';
const RELIEF_HEADING = 'Thermal-relief connections are not modelled: relief or spoke connections add thermal resistance (size not sourced); a solid connection is advised';

const LEDGER_ROLE:Readonly<Record<string, string>> = {
  'S-007': 'Copper thermal conductivity k; sources disagree, so it is a choice you make.',
  'S-019d': 'Temperature difference theta x P for the power you enter.',
  'S-040': 'Package thermal metrics are not design constants; nothing here derives one.',
  'S-041': 'Barrel resistance formula (one-dimensional conduction along the annulus).',
  'S-041a': 'Filled via as a core cylinder in parallel with the barrel (derived; fill conductivity is yours).',
  'S-041b': 'N identical vias in ideal parallel, theta/N.',
  'S-041c': 'Sources disagree on how useful thermal vias are and on 1-D accuracy; the 1-D model underestimates theta in published FEA.',
  'S-045': 'Relief or spoke connections add thermal resistance; the magnitude is not sourced and sources advise a solid connection.',
  'S-041d': 'Conductivity of plated barrel copper was not found; bulk copper is used.',
};

const HEADLINE = { name: 'thermal resistance of the via array (1-D conduction estimate, ideal parallel)', label: 'Thermal resistance of the via array (1-D conduction, usually a lower bound)' } as const;
const RESULT_LABELS: Readonly<Record<string, string>> = {
  [HEADLINE.name]: HEADLINE.label,
  'thermal resistance of one via': 'Thermal resistance of one via (barrel, and fill if any)',
  'barrel thermal resistance (one via)': 'Barrel thermal resistance (one via)',
  'barrel copper area (one via)': 'Barrel copper area (one via)',
  'finished hole diameter used in the calculation': 'Finished hole diameter used in the calculation',
  'fill core thermal resistance (one via)': 'Fill core thermal resistance (one via)',
  'temperature difference across the array for the given power': 'Temperature difference across the array for the power you gave (usually a lower bound)',
};
const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = { 'plating thickness': 'thickness', 'Plating thickness': 'thickness' };

const NEEDS: Readonly<Record<'diameter' | 'diameterBasis' | 'plating' | 'length' | 'count' | 'kMaterial' | 'fill' | 'fillK', string>> = {
  diameter: 'Enter the hole diameter with its unit (mm or mil), then choose whether it is the finished hole or the drill.',
  diameterBasis: 'Choose the diameter basis: finished hole (inside the plating) or drill diameter. There is no default.',
  plating: 'Enter the plating thickness (required, never filled in for you; take it from your fabricator).',
  length: 'Enter the barrel length (board thickness for a through via), for example 1.6 mm.',
  count: 'Enter the number of vias in parallel (1 for a single via).',
  kMaterial: 'Choose the copper thermal conductivity. There is no default because the sources disagree.',
  fill: 'Choose whether the via is filled. There is no default.',
  fillK: 'Enter the fill thermal conductivity from the fill material datasheet (for example 1.5 W/mK). No fill value is built in.',
};

export type ThermalViaView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly callouts: readonly CautionView[];
      /** The thermal-relief caution, shown directly under the headline and kept out of the warning list (PCB m-N6). */
      readonly reliefCallout?: CautionView;
      readonly ledgerRows: readonly LedgerRowView[];
    };

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: ThermalViaState): ThermalViaView {
  const notes: string[] = [];
  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  const filled = s.fill === 'filled';

  const parsed = new Map<Exclude<TextKey, 'count'>, FieldView>();
  const read = (k: Exclude<TextKey, 'count'>): void => {
    const v = parseField(s[k], fieldDim(k), echoFor(s, k));
    parsed.set(k, v);
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  };
  for (const k of ['diameter', 'plating', 'length', 'power'] as const) read(k);
  if (filled) read('fillK');
  else if (s.fillK.trim() !== '') notes.push('The fill conductivity is ignored because the via is not filled.');
  const count = parseCountField(s.count);
  if (count.status === 'error') {
    problems.push(`${FIELD_LABEL.count}: ${count.message}`);
    fieldErrors.count = count.message;
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  const needs: string[] = [];
  for (const k of ['diameter', 'plating', 'length'] as const) if (parsed.get(k)?.status === 'empty') needs.push(NEEDS[k]);
  if (s.diameterBasis === '') needs.push(NEEDS.diameterBasis);
  if (count.status === 'empty') needs.push(NEEDS.count);
  if (s.kMaterial === '') needs.push(NEEDS.kMaterial);
  if (s.fill === '') needs.push(NEEDS.fill);
  if (filled && parsed.get('fillK')?.status === 'empty') needs.push(NEEDS.fillK);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const qty = (k: Exclude<TextKey, 'count'>): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const fillK = filled ? qty('fillK') : undefined;
  const power = qty('power');
  const inputs = {
    finishedHoleDiameter: qty('diameter') as Quantity,
    diameterBasis: s.diameterBasis as 'finished' | 'drill',
    platingThickness: qty('plating') as Quantity,
    barrelLength: qty('length') as Quantity,
    count: count.status === 'ok' ? count.value.si : 0,
    kMaterial: s.kMaterial as CopperKMaterial,
    fill: s.fill as 'none' | 'filled',
    ...(fillK !== undefined ? { fillConductivity: fillK } : {}),
    ...(power !== undefined ? { power } : {}),
    ...(s.platingSource === 'fab-profile-average' ? { platingSource: s.platingSource } : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key === undefined ? 'Inputs' : key === 'kMaterial' ? 'Thermal conductivity choice' : key === 'fill' ? 'Fill' : key === 'diameterBasis' ? 'Diameter basis' : FIELD_LABEL[key];
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  if (count.status === 'ok' && count.value.si >= VIA_COUNT_HINT_FROM) notes.push(VIA_COUNT_HINT);
  const callouts: CautionView[] = CALLOUT_CODES.flatMap((code) => {
    const w = raw.warnings.find((x) => x.code === code);
    return w === undefined ? [] : [{ code, heading: CALLOUT_HEADING[code], text: w.message }];
  });
  const relief = raw.warnings.find((x) => x.code === RELIEF_CODE);
  const reliefCallout: CautionView | undefined = relief === undefined ? undefined : { code: RELIEF_CODE, heading: RELIEF_HEADING, text: relief.message };
  const forView: CalcResult = {
    ...raw,
    warnings: raw.warnings.filter((w) => w.code === undefined || (!(CALLOUT_CODES as readonly string[]).includes(w.code) && w.code !== RELIEF_CODE)),
  };
  const extra: ProvenanceRow[] = [
    { label: 'Copper thermal conductivity choice', value: s.kMaterial, source: 'user', detail: 'ledger S-007, CONFLICT' },
    { label: 'Diameter basis', value: s.diameterBasis, source: 'user' },
    { label: 'Fill', value: s.fill, source: 'user' },
  ];
  const result = buildResultView(forView, {
    headline: HEADLINE.name,
    accuracyClass: meta.accuracyClass,
    prefs: headlinePrefs(s.units),
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: RESULT_LABELS,
    extraProvenance: extra,
    pinWarningCodes: ['PLATING_EXCEEDS_HOLE'],
  });
  const ledgerRows: LedgerRowView[] = result.ledger.entries.map((e) => ({ ...e, role: LEDGER_ROLE[e.id] ?? e.item }));
  return { status: 'ok', result, raw, fieldErrors, notes, callouts, ...(reliefCallout !== undefined ? { reliefCallout } : {}), ledgerRows };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: ThermalViaView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. This is an estimate and usually a lower bound, not theta-JA. Confidence ${v.result.confidence.level}.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
