// View-model for the resistor divider page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/resistor-divider compute().
import { compute, type Inputs } from '../../core/calculators/resistor-divider/calc';
import type { SeriesChoice, SolveFor } from '../../core/calculators/resistor-divider/guards';
import { meta } from '../../core/calculators/resistor-divider/meta';
import { formatResult, formatSignedPercent } from '../../core/format-result';
import type { CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, type HashState } from '../../state/hash';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultView } from '../components/view';
import { resistorDividerCallouts, type DividerCallout } from './divider-emphasis';
import { DEFAULT_SNAP, SNAP_CHOICES, isDividerSeries, isSnapChoice, ERROR_ACCURACY, parseToleranceField, type SnapChoice } from './circuit-choices';

export const CALCULATOR_ID = 'resistor-divider';

export interface DividerState {
  readonly solveFor: SolveFor;
  readonly vin: string;
  readonly r1: string;
  readonly r2: string;
  readonly target: string;
  readonly load: string;
  readonly tolerance: string;
  readonly vinTolerance: string;
  readonly loadTolerance: string;
  readonly ratedVoltage: string;
  readonly series: SeriesChoice;
  readonly snap: SnapChoice;
}

export const DEFAULT_STATE: DividerState = Object.freeze({
  solveFor: 'vout',
  vin: '',
  r1: '',
  r2: '',
  target: '',
  load: '',
  tolerance: '',
  vinTolerance: '',
  loadTolerance: '',
  ratedVoltage: '',
  series: 'none',
  snap: DEFAULT_SNAP,
});

export const METHOD_TEXT = 'Method: two-resistor divider with an optional load, initial-tolerance corners and E-series snapping (ideal resistors, DC)';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

/** The resistor names carry their position, because textbooks and datasheets name them differently. */
export const R1_NAME = 'R1 (top: Vin to Vout)';
export const R2_NAME = 'R2 (bottom: Vout to ground)';
export const RL_NAME = 'RL (load, from Vout to ground, in parallel with R2)';

export const SOLVE_OPTIONS: readonly { readonly value: SolveFor; readonly label: string }[] = [
  { value: 'vout', label: 'Output voltage (Vout)' },
  { value: 'r1', label: `R1, the top resistor` },
  { value: 'r2', label: `R2, the bottom resistor` },
];

export function isSolveFor(v: string): v is SolveFor {
  return SOLVE_OPTIONS.some((o) => o.value === v);
}

/** Series and snap choices only exist when a resistor is the unknown. */
export function snapApplies(solveFor: SolveFor): boolean {
  return solveFor !== 'vout';
}

// ---------------------------------------------------------------------------
// Schematic text
// ---------------------------------------------------------------------------
/** Text alternative of the schematic: where every resistor sits, in words. */
export function schematicDescription(withLoad: boolean, solveFor: SolveFor): string {
  const base = `Vin connects to the top of ${R1_NAME}. The bottom of R1 joins the Vout node. ${R2_NAME} runs from the Vout node to ground.`;
  const load = withLoad ? ` ${RL_NAME}: a load resistor RL is connected from the Vout node to ground, in parallel with R2.` : '';
  const unknown = solveFor === 'vout' ? ' Vout is the unknown.' : ` ${solveFor === 'r1' ? 'R1' : 'R2'} is the unknown.`;
  return `${base}${load}${unknown}`;
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS. */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS];

type TextKey = 'vin' | 'r1' | 'r2' | 'target' | 'load' | 'tolerance' | 'vinTolerance' | 'loadTolerance' | 'ratedVoltage';
const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = { vin: 'vi', r1: 'r1', r2: 'r2', target: 'tg', load: 'rl', tolerance: 'tol', vinTolerance: 'vtol', loadTolerance: 'ltol', ratedVoltage: 'vr' };
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];

export const FIELD_LABEL: Readonly<Record<TextKey, string>> = {
  vin: 'Input voltage (Vin)',
  r1: R1_NAME,
  r2: R2_NAME,
  target: 'Target output voltage (Vout)',
  load: 'Load resistance (RL)',
  tolerance: 'Resistor tolerance',
  vinTolerance: 'Input voltage tolerance',
  loadTolerance: 'Load tolerance',
  ratedVoltage: 'Rated working voltage',
};

export function toHashState(s: DividerState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.solveFor !== DEFAULT_STATE.solveFor) out['sf'] = s.solveFor;
  if (s.series !== DEFAULT_STATE.series) out['se'] = s.series;
  if (s.snap !== DEFAULT_STATE.snap) out['sn'] = s.snap;
  return out;
}

export interface LoadedState {
  readonly state: DividerState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: DividerState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const sf = get('sf');
  if (sf !== undefined) {
    if (isSolveFor(sf)) s = { ...s, solveFor: sf };
    else notices.push('What to solve for was not recognised: the output voltage is used instead.');
  }
  const se = get('se');
  if (se !== undefined) {
    if (isDividerSeries(se)) s = { ...s, series: se };
    else notices.push('The E-series choice was not recognised: no series (exact value) is used instead.');
  }
  const sn = get('sn');
  if (sn !== undefined) {
    if (isSnapChoice(sn)) s = { ...s, snap: sn };
    else notices.push('The snap direction was not recognised: nearest value is used instead.');
  }
  const text = (k: TextKey): string => {
    const v = get(TEXT_HASH_KEY[k]);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  s = { ...s, vin: text('vin'), r1: text('r1'), r2: text('r2'), target: text('target'), load: text('load'), tolerance: text('tolerance'), vinTolerance: text('vinTolerance'), loadTolerance: text('loadTolerance'), ratedVoltage: text('ratedVoltage') };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey;
export type FieldErrors = Partial<Record<FieldKey, string>>;

const FIELD_DIM: Readonly<Record<'vin' | 'r1' | 'r2' | 'target' | 'load' | 'ratedVoltage', Dim>> = {
  vin: DIM.VOLTAGE,
  r1: DIM.RESISTANCE,
  r2: DIM.RESISTANCE,
  target: DIM.VOLTAGE,
  load: DIM.RESISTANCE,
  ratedVoltage: DIM.VOLTAGE,
};

export function fieldDim(k: 'vin' | 'r1' | 'r2' | 'target' | 'load' | 'ratedVoltage'): Dim {
  return FIELD_DIM[k];
}

/** The fields the page shows and reads for this choice. The others are not read. */
/** The load tolerance is only read when a load is given (the calculator refuses it otherwise). */
export function activeFields(solveFor: SolveFor, withLoad = true): readonly FieldKey[] {
  const main: FieldKey[] = solveFor === 'vout' ? ['vin', 'r1', 'r2'] : solveFor === 'r1' ? ['vin', 'target', 'r2'] : ['vin', 'target', 'r1'];
  return [...main, 'load', 'tolerance', ...(withLoad ? (['loadTolerance'] as const) : []), 'vinTolerance', 'ratedVoltage'];
}

export function parseFieldOf(s: DividerState, k: FieldKey): FieldView {
  if (k === 'tolerance' || k === 'vinTolerance' || k === 'loadTolerance') return parseToleranceField(s[k]);
  return parseField(s[k], FIELD_DIM[k]);
}

const NEEDS_TEXT: Readonly<Partial<Record<FieldKey, string>>> = {
  vin: 'Enter the input voltage Vin (for example 12 V).',
  r1: `Enter ${R1_NAME} (for example 10k or 10 kΩ).`,
  r2: `Enter ${R2_NAME} (for example 4.7k or 4.7 kΩ).`,
  target: 'Enter the target output voltage (for example 3.3 V).',
};

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  vin: 'vin',
  r1: 'r1',
  r2: 'r2',
  target: 'target',
  load: 'load',
  tolerance: 'tolerance',
  vinTolerance: 'vinTolerance',
  loadTolerance: 'loadTolerance',
  ratedVoltage: 'ratedVoltage',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface EnvelopeView {
  readonly label: string;
  readonly min: string;
  readonly typ: string;
  readonly max: string;
  readonly note: string;
}

export type DividerView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly envelope?: EnvelopeView;
      /** Important blocks shown under the headline: over the entered rating, or high voltage with no rating (presentation only). */
      readonly importantCallouts: readonly DividerCallout[];
    };

const RESULT_LABELS: Readonly<Record<string, string>> = {
  vout: 'Output voltage (Vout)',
  r1: R1_NAME,
  r2: R2_NAME,
  'divider current': 'Divider current (through R1)',
  'power in r1': 'Power in R1',
  'power in r2': 'Power in R2',
  'total power': 'Total power (from the source)',
  'output impedance': 'Output impedance (R1 ‖ R2)',
  'vout unloaded': 'Output voltage without the load',
  'power in load': 'Power in the load',
  'ideal r1': 'Ideal R1 before snapping',
  'ideal r2': 'Ideal R2 before snapping',
  vin: 'Input voltage (Vin)',
  target: 'Target output voltage',
  load: 'Load resistance (RL)',
  tolerance: 'Resistor tolerance (a fraction: 0.01 is 1 %)',
  vinTolerance: 'Input voltage tolerance (a fraction: 0.01 is 1 %)',
  loadTolerance: 'Load tolerance (a fraction: 0.05 is 5 %)',
  ratedVoltage: 'Rated working voltage',
  'voltage across r1': 'Voltage across R1 (nominal)',
  'voltage across r2': 'Voltage across R2 (nominal)',
};

const ERROR_NAME = 'vout error vs target';
const TOLERANCE_NAME: Readonly<Record<string, string>> = { r1: 'R1', r2: 'R2', load: 'RL', vin: 'Vin' };

export function computeView(s: DividerState): DividerView {
  const active = activeFields(s.solveFor, s.load.trim() !== '');
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
  if (problems.length > 0) return { status: 'error', problems, fieldErrors };

  const needs: string[] = [];
  for (const k of active) {
    if (parsed.get(k)?.status === 'empty' && NEEDS_TEXT[k] !== undefined) needs.push(NEEDS_TEXT[k] as string);
  }
  if (needs.length > 0) return { status: 'needs-input', needs };

  const quantity = (k: FieldKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  const inputs = {
    solveFor: s.solveFor,
    vin: quantity('vin') as Quantity,
    ...optional('r1', s.solveFor === 'r1' ? undefined : quantity('r1')),
    ...optional('r2', s.solveFor === 'r2' ? undefined : quantity('r2')),
    ...optional('target', s.solveFor === 'vout' ? undefined : quantity('target')),
    ...optional('load', quantity('load')),
    ...optional('tolerance', quantity('tolerance')),
    ...optional('vinTolerance', quantity('vinTolerance')),
    ...optional('loadTolerance', quantity('loadTolerance')),
    ...optional('ratedVoltage', quantity('ratedVoltage')),
    ...(snapApplies(s.solveFor) ? { series: s.series, snap: s.snap } : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    if (key !== undefined) fieldErrors[key] = out.error.message;
    const label = key !== undefined ? FIELD_LABEL[key] : out.error.field === 'series' || out.error.field === 'snap' ? 'Series' : 'Inputs';
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors };
  }

  const raw = out.value;
  const snapped = snapApplies(s.solveFor) && s.series !== 'none';
  const snapLabel = SNAP_CHOICES.find((c) => c.value === s.snap)?.label.toLowerCase() ?? '';
  const headName = s.solveFor;
  const labels: Record<string, string> = { ...RESULT_LABELS };
  if (s.solveFor !== 'vout') {
    labels[headName] = `${RESULT_LABELS[headName] ?? headName}, ${snapped ? `snapped to ${s.series}: ${snapLabel}` : 'exact value, not a stock value'}`;
  }
  const extraRows: { label: string; text: string }[] = [];
  const err = raw.results.find((r) => r.name === ERROR_NAME);
  if (err !== undefined) extraRows.push({ label: 'Vout error vs target (size rounded away from zero)', text: formatSignedPercent(err.value, { accuracyClass: ERROR_ACCURACY }) });
  const result = buildResultView(raw, {
    headline: headName,
    accuracyClass: meta.accuracyClass,
    labels,
    skip: [ERROR_NAME],
    extraRows,
    pinWarningCodes: ['RESISTOR_VOLTAGE'],
  });

  const env = raw.envelope?.find((e) => e.name === 'vout');
  const envelope: EnvelopeView | undefined =
    env === undefined
      ? undefined
      : {
          label: 'Output voltage, initial-tolerance corners',
          // Outward rounding: the minimum is printed rounded down and the maximum rounded up, so the printed range always contains the true one.
          min: formatResult({ value: env.min, bound: 'max-capacity' }, { accuracyClass: meta.accuracyClass }),
          typ: formatResult({ value: env.typ, bound: 'nominal' }, { accuracyClass: meta.accuracyClass }),
          max: formatResult({ value: env.max, bound: 'prediction' }, { accuracyClass: meta.accuracyClass }),
          note: `Initial-tolerance corners: every combination of the tolerances on ${env.toleranceInputs.map((n) => TOLERANCE_NAME[n] ?? n).join(', ')} at their limits. Temperature coefficient (TCR), leakage, ageing, self-heating and voltage coefficient are not included, so these are not limits over the life of the part. The minimum is printed rounded down and the maximum rounded up.`,
        };
  const importantCallouts = resistorDividerCallouts(raw, quantity('ratedVoltage') !== undefined, meta.accuracyClass);
  const base = { status: 'ok', result, raw, fieldErrors, importantCallouts } as const;
  return envelope === undefined ? base : { ...base, envelope };
}

export function liveSummary(v: DividerView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.envelope !== undefined ? `With initial-tolerance corners ${v.envelope.min} to ${v.envelope.max}. ` : ''}Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed. ${String(v.result.warnings.filter((w) => w.severity !== 'info').length)} cautions.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

export type { SeriesChoice, SolveFor };
