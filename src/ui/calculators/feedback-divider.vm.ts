// View-model for the regulator feedback divider page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/feedback-divider compute().
// The best-pair search can take about a second, so `plan` splits the work: either an immediate view, or a worker task
// to run and then `finishView`. `computeView` does both synchronously (tests, and the fallback without a Worker).
import { compute, type Inputs } from '../../core/calculators/feedback-divider/calc';
import { BIAS_DIRECTIONS, validate, type BiasDirection } from '../../core/calculators/feedback-divider/guards';
import { meta } from '../../core/calculators/feedback-divider/meta';
import { formatResult } from '../../core/format-result';
import type { CalcOutcome, CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, type HashState } from '../../state/hash';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultRowView, type ResultView } from '../components/view';
import type { SearchTask } from '../../workers/pair-search.protocol';
import { FEEDBACK_SERIES, SNAP_CHOICES, catalogResistance, isFeedbackSeries, isSnapChoice, parseCountField, parseToleranceField, signedPercent, type FeedbackSeries, type SnapChoice } from './circuit-choices';
import { feedbackDividerCallouts, type DividerCallout } from './divider-emphasis';
import { hasKey, ledgerRowsOf, readText } from './circuit-view';

export const CALCULATOR_ID = 'feedback-divider';

export interface FeedbackState {
  /** The reference voltage from the regulator datasheet. Never pre-filled. */
  readonly vref: string;
  /** Free-text note on where Vref came from. */
  readonly vrefSource: string;
  readonly r1: string;
  readonly r2: string;
  readonly vout: string;
  /** 'none' is the exact value (no snapping). A series is always chosen explicitly. */
  readonly series: FeedbackSeries;
  /** Never defaulted: required whenever a solved resistor is snapped to a series. */
  readonly snap: '' | SnapChoice;
  /** Number of pairs listed in a pair search; empty means the calculator default. */
  readonly pairs: string;
  readonly tolerance: string;
  readonly vrefTolerance: string;
  readonly fbBias: string;
  /** Never defaulted: required whenever a bias current is entered. */
  readonly biasDirection: '' | BiasDirection;
}

export const DEFAULT_STATE: FeedbackState = Object.freeze({
  vref: '',
  vrefSource: '',
  r1: '',
  r2: '',
  vout: '',
  series: 'none',
  snap: '',
  pairs: '',
  tolerance: '',
  vrefTolerance: '',
  fbBias: '',
  biasDirection: '',
});

export const METHOD_TEXT = 'Method: feedback divider Vout = Vref × (1 + R1 / R2), solve R1, R2 or Vout, with E-series snapping or a best-pair search (ideal resistors, DC)';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

/** Longest Vref source note (the calculator refuses more). */
export const MAX_NOTE_CHARS = 200;

export const R1_NAME = 'R1 (top: Vout to FB pin)';
export const R2_NAME = 'R2 (bottom: FB pin to ground)';
export const NAMING_TEXT =
  'R1 is the TOP resistor (between Vout and the FB pin) and R2 is the BOTTOM resistor (between the FB pin and ground). Datasheets and textbooks name these inconsistently, and some adjustable-regulator formulas have R1 at the bottom: follow the positions in the drawing, not the labels.';

/** No value in the placeholder: the app embeds no regulator parameters. */
export const VREF_PLACEHOLDER = 'datasheet Vref';
export const VREF_HELP =
  'Take the reference (feedback) voltage from the regulator datasheet, at your operating conditions, and note where it came from in the source note below. It is never filled in for you: the app embeds no regulator parameters.';
export const VREF_SOURCE_HELP = 'Optional but recommended: datasheet name, revision and table, so a reader can check the number. Free text, shown with the result as your note; it is not checked.';

export const BIAS_OPTIONS: readonly { readonly value: BiasDirection; readonly label: string }[] = [
  { value: 'into-pin', label: 'Into the FB pin' },
  { value: 'out-of-pin', label: 'Out of the FB pin' },
];

export function isBiasDirection(v: string): v is BiasDirection {
  return (BIAS_DIRECTIONS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// What is being solved
// ---------------------------------------------------------------------------
export type Mode = 'vout' | 'r1' | 'r2' | 'pair' | 'over' | 'incomplete';

const filled = (t: string): boolean => t.trim() !== '';

/** The solved quantity is whichever of R1, R2, Vout is left empty (the calculator's rule); Vout alone is a pair search. */
export function mode(s: FeedbackState): Mode {
  const [a, b, c] = [filled(s.r1), filled(s.r2), filled(s.vout)];
  if (a && b && c) return 'over';
  if (a && b) return 'vout';
  if (c && a) return 'r2';
  if (c && b) return 'r1';
  if (c) return 'pair';
  return 'incomplete';
}

/** Series and snap choices only matter when a resistor is solved (snap) or searched (series). */
export function seriesApplies(s: FeedbackState): boolean {
  const m = mode(s);
  return m === 'r1' || m === 'r2' || m === 'pair';
}
export function snapApplies(s: FeedbackState): boolean {
  const m = mode(s);
  return (m === 'r1' || m === 'r2') && s.series !== 'none';
}

/** Text alternative of the schematic: where every part sits, in words. */
export function schematicDescription(m: 'vout' | 'r1' | 'r2' | 'pair'): string {
  const base = `The regulator output Vout connects to the top of ${R1_NAME}. The bottom of R1 joins the FB pin node. ${R2_NAME} runs from the FB node to ground. The FB pin is held at Vref by the regulator.`;
  const solved = m === 'vout' ? ' Vout is the unknown.' : m === 'pair' ? ' R1 and R2 are the unknowns: the best pair of stock values is searched.' : ` ${m === 'r1' ? 'R1' : 'R2'} is the unknown.`;
  return `${base}${solved}`;
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = 'vref' | 'vrefSource' | 'r1' | 'r2' | 'vout' | 'pairs' | 'tolerance' | 'vrefTolerance' | 'fbBias';
export type FieldErrors = Partial<Record<FieldKey | 'series' | 'snap' | 'biasDirection', string>>;

export const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  vref: 'Reference voltage (Vref)',
  vrefSource: 'Vref source note',
  r1: R1_NAME,
  r2: R2_NAME,
  vout: 'Output voltage (Vout)',
  pairs: 'Number of pairs to list',
  tolerance: 'Resistor tolerance',
  vrefTolerance: 'Vref tolerance',
  fbBias: 'FB pin bias current',
};

type QuantityKey = 'vref' | 'r1' | 'r2' | 'vout' | 'fbBias';
const FIELD_DIM: Readonly<Record<QuantityKey, Dim>> = { vref: DIM.VOLTAGE, r1: DIM.RESISTANCE, r2: DIM.RESISTANCE, vout: DIM.VOLTAGE, fbBias: DIM.CURRENT };

export function fieldDim(k: QuantityKey): Dim {
  return FIELD_DIM[k];
}

const CORE_FIELD: Readonly<Record<string, FieldKey | 'series' | 'biasDirection'>> = {
  vref: 'vref',
  vrefSource: 'vrefSource',
  r1: 'r1',
  r2: 'r2',
  vout: 'vout',
  pairs: 'pairs',
  tolerance: 'tolerance',
  vrefTolerance: 'vrefTolerance',
  fbBiasCurrent: 'fbBias',
  series: 'series',
  fbBiasDirection: 'biasDirection',
};

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
export const WRITTEN_KEYS: readonly string[] = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
const TEXT_HASH_KEY: Readonly<Record<Exclude<FieldKey, 'vrefSource'>, string>> = {
  vref: 'vr',
  r1: 'r1',
  r2: 'r2',
  vout: 'vo',
  pairs: 'pc',
  tolerance: 'tol',
  vrefTolerance: 'vtol',
  fbBias: 'ib',
};
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as Exclude<FieldKey, 'vrefSource'>[];

export function toHashState(s: FeedbackState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.vrefSource.trim() !== '') out['vs'] = s.vrefSource.slice(0, MAX_NOTE_CHARS);
  if (s.series !== DEFAULT_STATE.series) out['se'] = s.series;
  if (s.snap !== '') out['sn'] = s.snap;
  if (s.biasDirection !== '') out['bd'] = s.biasDirection;
  return out;
}

export interface LoadedState {
  readonly state: FeedbackState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let series: FeedbackSeries = DEFAULT_STATE.series;
  if (hasKey(h, 'se')) {
    const se = h['se'] ?? '';
    if (isFeedbackSeries(se)) series = se;
    else notices.push('The E-series choice was not recognised: no series (exact value) is used instead.');
  }
  let snap: '' | SnapChoice = '';
  if (hasKey(h, 'sn')) {
    const sn = h['sn'] ?? '';
    if (isSnapChoice(sn)) snap = sn;
    else notices.push('The snap direction was not recognised: please choose one.');
  }
  let biasDirection: '' | BiasDirection = '';
  if (hasKey(h, 'bd')) {
    const bd = h['bd'] ?? '';
    if (isBiasDirection(bd)) biasDirection = bd;
    else notices.push('The FB bias direction was not recognised: please choose one.');
  }
  const t = (k: Exclude<FieldKey, 'vrefSource'>): string => readText(h, TEXT_HASH_KEY[k], FIELD_LABEL[k], notices);
  const vrefSource = readText(h, 'vs', FIELD_LABEL.vrefSource, notices, MAX_NOTE_CHARS);
  return {
    state: {
      vref: t('vref'),
      vrefSource,
      r1: t('r1'),
      r2: t('r2'),
      vout: t('vout'),
      series,
      snap,
      pairs: t('pairs'),
      tolerance: t('tolerance'),
      vrefTolerance: t('vrefTolerance'),
      fbBias: t('fbBias'),
      biasDirection,
    },
    notices,
  };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export interface EnvelopeView {
  readonly label: string;
  readonly min: string;
  readonly typ: string;
  readonly max: string;
  readonly note: string;
}

export interface PairRowView {
  readonly n: number;
  readonly r1: string;
  readonly r2: string;
  readonly vout: string;
  readonly error: string;
}

export type FeedbackView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly pairs: readonly PairRowView[];
      readonly envelopes: readonly EnvelopeView[];
      readonly ledgerRows: readonly LedgerRowBadge[];
      /** Important blocks shown under the headline (presentation only; the core is unchanged). */
      readonly importantCallouts: readonly DividerCallout[];
    };

export type Plan =
  | { readonly kind: 'view'; readonly view: FeedbackView }
  | { readonly kind: 'search'; readonly task: Extract<SearchTask, { kind: 'feedback' }>; readonly state: FeedbackState };

const NEEDS_SNAP = 'Choose the snap direction for the solved resistor: nearest value, next value up or next value down. There is no default.';
const NEEDS_BIAS = 'Choose the direction of the FB bias current: into the pin or out of the pin. The sign of the shift depends on it and there is no default.';

/** Parses the form and decides what to do. Never runs the pair search itself. */
export function plan(s: FeedbackState): Plan {
  const parsed = new Map<QuantityKey | 'tolerance' | 'vrefTolerance', FieldView>();
  for (const k of ['vref', 'r1', 'r2', 'vout', 'fbBias'] as const) parsed.set(k, parseField(s[k], FIELD_DIM[k]));
  for (const k of ['tolerance', 'vrefTolerance'] as const) parsed.set(k, parseToleranceField(s[k]));
  const count = parseCountField(s.pairs);

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const [k, v] of parsed) {
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (count.status === 'error') {
    problems.push(`${FIELD_LABEL.pairs}: ${count.message}`);
    fieldErrors.pairs = count.message;
  }
  if (problems.length > 0) return { kind: 'view', view: { status: 'error', problems, fieldErrors } };

  const q = (k: QuantityKey | 'tolerance' | 'vrefTolerance'): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const m = mode(s);
  const [vref, r1, r2, vout, fbBias, tolerance, vrefTolerance] = [q('vref'), q('r1'), q('r2'), q('vout'), q('fbBias'), q('tolerance'), q('vrefTolerance')];
  const snapping = m === 'r1' || m === 'r2' ? s.series !== 'none' : false;
  const inputs = {
    ...(vref !== undefined ? { vref } : {}),
    ...(s.vrefSource.trim() !== '' ? { vrefSource: s.vrefSource } : {}),
    ...(r1 !== undefined ? { r1 } : {}),
    ...(r2 !== undefined ? { r2 } : {}),
    ...(vout !== undefined ? { vout } : {}),
    ...(seriesApplies(s) ? { series: s.series } : {}),
    ...(snapping && s.snap !== '' ? { snap: s.snap } : {}),
    ...(m === 'pair' && count.status === 'ok' ? { pairs: count.count } : {}),
    ...(tolerance !== undefined ? { tolerance } : {}),
    ...(vrefTolerance !== undefined ? { vrefTolerance } : {}),
    ...(fbBias !== undefined ? { fbBiasCurrent: fbBias } : {}),
    ...(fbBias !== undefined && s.biasDirection !== '' ? { fbBiasDirection: s.biasDirection } : {}),
  } as Inputs;

  const choiceNeeds: string[] = [];
  if (snapping && s.snap === '') choiceNeeds.push(NEEDS_SNAP);
  if (fbBias !== undefined && s.biasDirection === '') choiceNeeds.push(NEEDS_BIAS);

  const given = [r1, r2, vout].filter((x) => x !== undefined).length;
  const v = validate(inputs);
  if (!v.ok) {
    const e = v.error;
    // Missing or unchosen things are needs; a value the calculator refuses is an error.
    const needsish = e.field === 'vref' || (e.field === 'inputs' && given < 3) || e.field === 'fbBiasDirection' || (e.field === 'series' && given <= 1);
    if (needsish) return { kind: 'view', view: { status: 'needs-input', needs: [e.message, ...choiceNeeds] } };
    const key = CORE_FIELD[e.field ?? ''];
    if (key !== undefined) fieldErrors[key] = e.message;
    return { kind: 'view', view: { status: 'error', problems: [e.message], fieldErrors } };
  }
  if (choiceNeeds.length > 0) return { kind: 'view', view: { status: 'needs-input', needs: choiceNeeds } };
  if (v.value.mode === 'pair') return { kind: 'search', task: { kind: 'feedback', inputs }, state: s };
  return { kind: 'view', view: finishView(s, compute(inputs)) };
}

const RESULT_LABELS: Readonly<Record<string, string>> = {
  vout: 'Output voltage (Vout)',
  r1: R1_NAME,
  r2: R2_NAME,
  'voltage across r1': 'Voltage across R1',
  'voltage across r2': 'Voltage across R2 (equals Vref)',
  'divider current': 'Divider current',
  'power in r1': 'Power in R1',
  'power in r2': 'Power in R2',
  'total power': 'Total power (from Vout)',
  'ideal r1': 'Exact R1 before snapping',
  'ideal r2': 'Exact R2 before snapping',
  'fb bias shift': 'FB bias shift of Vout (signed)',
  'vout with fb bias': 'Output voltage with the FB bias',
  'divider current / fb bias current': 'Divider current / FB bias current',
};
const ERROR_NAME = 'vout error vs target';
const ERROR_BIAS_NAME = 'vout error vs target including FB bias';
const BIAS_SHARE_NAME = 'fb bias shift vs vout';
const PAIR_NAME = /^pair (\d+) (r1|r2|vout|vout error vs target)$/;
const TOLERANCE_NAME: Readonly<Record<string, string>> = { r1: 'R1', r2: 'R2', vref: 'Vref' };
const ENVELOPE_LABEL: Readonly<Record<string, string>> = {
  vout: 'Output voltage, initial-tolerance corners',
  'vout with fb bias': 'Output voltage with FB bias, initial-tolerance corners',
};

/** Builds the view from the calculator outcome (from a worker or from `compute`). */
export function finishView(s: FeedbackState, out: CalcOutcome): FeedbackView {
  const fieldErrors: FieldErrors = {};
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [out.error.message], fieldErrors };
  }
  const raw = out.value;
  const m = mode(s);
  const headName = raw.results.find((r) => r.role === 'primary')?.name ?? 'vout';
  const snapLabel = SNAP_CHOICES.find((c) => c.value === s.snap)?.label.toLowerCase() ?? '';
  const labels: Record<string, string> = { ...RESULT_LABELS };
  if (m === 'vout') labels['vout'] = 'Output voltage (Vout), solved';
  else if (m === 'pair') labels['r1'] = `R1 (top) of the best pair, ${s.series}`;
  else {
    const snapped = s.series !== 'none';
    labels[headName] = `${RESULT_LABELS[headName] ?? headName}, solved, ${snapped ? `snapped to ${s.series}: ${snapLabel}` : 'exact value, not a stock value'}`;
  }

  const extraRows: ResultRowView[] = [];
  const err = raw.results.find((r) => r.name === ERROR_NAME);
  if (err !== undefined) extraRows.push({ label: 'Vout error vs target (signed; size rounded away from zero)', text: signedPercent(err.value.si), ...(err.note !== undefined ? { hint: err.note } : {}) });
  const errBias = raw.results.find((r) => r.name === ERROR_BIAS_NAME);
  if (errBias !== undefined) extraRows.push({ label: 'Vout error vs target including FB bias (signed)', text: signedPercent(errBias.value.si), ...(errBias.note !== undefined ? { hint: errBias.note } : {}) });
  const share = raw.results.find((r) => r.name === BIAS_SHARE_NAME);
  if (share !== undefined) extraRows.push({ label: 'FB bias shift as a share of Vout (signed)', text: signedPercent(share.value.si) });

  const pairNames = raw.results.filter((r) => PAIR_NAME.test(r.name)).map((r) => r.name);
  const result = buildResultView(raw, {
    headline: headName,
    accuracyClass: meta.accuracyClass,
    labels,
    skip: [ERROR_NAME, ERROR_BIAS_NAME, BIAS_SHARE_NAME, ...pairNames],
    extraRows,
    pinWarningCodes: ['RESISTOR_NAMING', 'FB_BIAS_DOMINATES'],
  });

  const pairs: PairRowView[] = [];
  if (m === 'pair') {
    const get = (n: number, what: string) => raw.results.find((r) => r.name === `pair ${String(n)} ${what}`);
    for (let n = 1; ; n++) {
      const [a, b, c, d] = [get(n, 'r1'), get(n, 'r2'), get(n, 'vout'), get(n, 'vout error vs target')];
      if (a === undefined || b === undefined || c === undefined || d === undefined) break;
      pairs.push({
        n,
        r1: catalogResistance(a.value.si),
        r2: catalogResistance(b.value.si),
        vout: formatResult(c, { accuracyClass: meta.accuracyClass }),
        error: signedPercent(d.value.si),
      });
    }
  }

  const envelopes: EnvelopeView[] = (raw.envelope ?? []).map((env) => ({
    label: ENVELOPE_LABEL[env.name] ?? env.name,
    // Outward rounding: the minimum rounds down and the maximum up, so the printed range always contains the true one.
    min: formatResult({ value: env.min, bound: 'max-capacity' }, { accuracyClass: meta.envelopeAccuracyClass }),
    typ: formatResult({ value: env.typ, bound: 'nominal' }, { accuracyClass: meta.envelopeAccuracyClass }),
    max: formatResult({ value: env.max, bound: 'prediction' }, { accuracyClass: meta.envelopeAccuracyClass }),
    note: `Initial-tolerance corners: every combination of the tolerances on ${env.toleranceInputs.map((n) => TOLERANCE_NAME[n] ?? n).join(', ')} at their limits. Temperature coefficient (TCR), leakage, ageing, self-heating, line and load regulation are not included, so these are not limits over the life of the part. The minimum is printed rounded down and the maximum rounded up.`,
  }));
  return { status: 'ok', result, raw, fieldErrors, pairs, envelopes, ledgerRows: ledgerRowsOf(result.ledger), importantCallouts: feedbackDividerCallouts(raw, meta.accuracyClass) };
}

/** Everything synchronously: the plan, and the pair search on this thread when there is one. */
export function computeView(s: FeedbackState): FeedbackView {
  const p = plan(s);
  return p.kind === 'view' ? p.view : finishView(p.state, compute(p.task.inputs));
}

export function liveSummary(v: FeedbackView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.envelopes.length > 0 ? `With initial-tolerance corners ${v.envelopes[0]?.min ?? ''} to ${v.envelopes[0]?.max ?? ''}. ` : ''}Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed. ${String(v.result.warnings.filter((w) => w.severity !== 'info').length)} cautions.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}

/** Live-region text while the pair search runs. */
export function searchingSummary(s: FeedbackState): string {
  return `Searching the ${s.series} series for the best R1 and R2 pair. No result yet.`;
}

export { FEEDBACK_SERIES };
