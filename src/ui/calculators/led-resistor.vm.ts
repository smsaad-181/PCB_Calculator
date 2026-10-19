// View-model for the LED series resistor page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/led-resistor compute().
import { compute, type Inputs } from '../../core/calculators/led-resistor/calc';
import { meta } from '../../core/calculators/led-resistor/meta';
import { formatPercent } from '../../core/format-result';
import type { CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultView } from '../components/view';
import { ERROR_ACCURACY, isLedSeries, parseCountField, signedPercent, type StockSeries } from './circuit-choices';
import { hasKey, ledgerRowsOf, readText } from './circuit-view';

export const CALCULATOR_ID = 'led-resistor';

export type FieldKey = 'vs' | 'vf' | 'current' | 'nLeds' | 'rating';

export interface LedState {
  readonly vs: string;
  /** Forward voltage of ONE LED from its datasheet. Never pre-filled. */
  readonly vf: string;
  readonly current: string;
  /** Empty means one LED (the calculator's documented default). */
  readonly nLeds: string;
  /** 'none' is the exact value (no snapping). A series is always chosen explicitly. */
  readonly series: StockSeries;
  readonly rating: string;
}

export const DEFAULT_STATE: LedState = Object.freeze({ vs: '', vf: '', current: '', nLeds: '', series: 'none', rating: '' });

export const METHOD_TEXT = 'Method: R = (Vs − N × Vf) / If, rounded UP to a stock value when a series is chosen (ideal resistor, DC)';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

export const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  vs: 'Supply voltage (Vs)',
  vf: 'LED forward voltage (Vf, one LED)',
  current: 'Target LED current (If)',
  nLeds: 'LEDs in series (N)',
  rating: 'Rated power of the resistor',
};
export const FIELD_UNIT_HINT: Readonly<Record<FieldKey, string>> = { vs: 'V', vf: 'V', current: 'A, mA or µA', nLeds: 'a whole number', rating: 'W or mW' };
export const FIELD_HELP: Readonly<Record<FieldKey, string>> = {
  vs: 'Examples: 5 V, 3.3 V, 12 V. An ideal supply is assumed.',
  vf: 'Take it from the LED datasheet at your target current. It is never filled in for you: it changes with current, temperature and production bin.',
  current: 'Examples: 10 mA, 2 mA, 20 mA.',
  nLeds: 'Identical LEDs in series. Empty means 1.',
  rating: 'Optional, from the resistor datasheet, for example 250 mW. Empty means the rating is not checked.',
};
export const FIELD_PLACEHOLDER: Readonly<Record<FieldKey, string>> = { vs: '5 V', vf: 'datasheet Vf', current: '10 mA', nLeds: '1', rating: '250 mW' };

const FIELD_DIM: Readonly<Record<Exclude<FieldKey, 'nLeds'>, Dim>> = { vs: DIM.VOLTAGE, vf: DIM.VOLTAGE, current: DIM.CURRENT, rating: DIM.POWER };

export function fieldDim(k: Exclude<FieldKey, 'nLeds'>): Dim {
  return FIELD_DIM[k];
}

const NEEDS: Readonly<Record<'vs' | 'vf' | 'current', string>> = {
  vs: 'Enter the supply voltage (for example 5 V).',
  vf: 'Enter the forward voltage of one LED from its datasheet (required, never filled in for you; for example 2.1 V).',
  current: 'Enter the target LED current (for example 10 mA).',
};

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
export const WRITTEN_KEYS: readonly string[] = stateKeyNames(CALCULATOR_ID);
const TEXT_HASH_KEY: Readonly<Record<FieldKey, string>> = { vs: 'vs', vf: 'vf', current: 'i', nLeds: 'n', rating: 'pr' };
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as FieldKey[];

export function toHashState(s: LedState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.series !== DEFAULT_STATE.series) out['se'] = s.series;
  return out;
}

export interface LoadedState {
  readonly state: LedState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let series: StockSeries = DEFAULT_STATE.series;
  if (hasKey(h, 'se')) {
    const se = h['se'] ?? '';
    if (isLedSeries(se)) series = se;
    else notices.push('The E-series choice was not recognised: no series (exact value) is used instead.');
  }
  const t = (k: FieldKey): string => readText(h, TEXT_HASH_KEY[k], FIELD_LABEL[k], notices);
  return { state: { vs: t('vs'), vf: t('vf'), current: t('current'), nLeds: t('nLeds'), series, rating: t('rating') }, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type LedView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors }
  | { readonly status: 'ok'; readonly result: ResultView; readonly raw: CalcResult; readonly fieldErrors: FieldErrors; readonly ledgerRows: readonly LedgerRowBadge[] };

const CORE_FIELD: Readonly<Record<string, FieldKey>> = { vs: 'vs', vf: 'vf', current: 'current', nLeds: 'nLeds', resistorRating: 'rating' };

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'led current': 'LED current with this resistor',
  'voltage across resistor': 'Voltage across the resistor',
  'power in resistor': 'Power in the resistor',
  'power in each led': 'Power in each LED',
  'power in all leds': 'Power in all LEDs',
  'source power': 'Power from the supply',
  'current change per 0.1 V Vf shift per led': 'Current change for a 0.1 V shift of Vf, per LED',
  'ideal resistor': 'Exact resistor before rounding up',
  'total forward voltage': 'Total forward voltage (N × Vf)',
  'resistor power margin': 'Resistor power margin (rating minus dissipation)',
};
const ERROR_NAME = 'current error vs target';
const UTIL_NAME = 'resistor power utilisation';

export function computeView(s: LedState): LedView {
  const parsed = new Map<'vs' | 'vf' | 'current' | 'rating', FieldView>();
  for (const k of ['vs', 'vf', 'current', 'rating'] as const) parsed.set(k, parseField(s[k], FIELD_DIM[k]));
  const count = parseCountField(s.nLeds);

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const [k, v] of parsed) {
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (count.status === 'error') {
    problems.push(`${FIELD_LABEL.nLeds}: ${count.message}`);
    fieldErrors.nLeds = count.message;
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors };

  const needs = (['vs', 'vf', 'current'] as const).filter((k) => parsed.get(k)?.status === 'empty').map((k) => NEEDS[k]);
  if (needs.length > 0) return { status: 'needs-input', needs };

  const q = (k: 'vs' | 'vf' | 'current' | 'rating'): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const rating = q('rating');
  const inputs: Inputs = {
    vs: q('vs') as Quantity,
    vf: q('vf') as Quantity,
    current: q('current') as Quantity,
    series: s.series,
    ...(count.status === 'ok' ? { nLeds: count.count } : {}),
    ...(rating !== undefined ? { resistorRating: rating } : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [out.error.message], fieldErrors };
  }

  const raw = out.value;
  const snapped = s.series !== 'none';
  const labels: Record<string, string> = {
    ...RESULT_LABELS,
    resistor: `Series resistor R, ${snapped ? `rounded up to ${s.series}` : 'exact value (not a stock value)'}`,
  };
  const extraRows: { label: string; text: string }[] = [];
  const err = raw.results.find((r) => r.name === ERROR_NAME);
  if (err !== undefined) extraRows.push({ label: 'Current error vs target (signed; size rounded away from zero)', text: signedPercent(err.value.si) });
  const util = raw.results.find((r) => r.name === UTIL_NAME);
  if (util !== undefined) {
    extraRows.push({ label: 'Resistor power utilisation (of the rating you entered)', text: formatPercent(util.value, util.bound, { accuracyClass: ERROR_ACCURACY }) });
  }
  const result = buildResultView(raw, { headline: 'resistor', accuracyClass: meta.accuracyClass, labels, skip: [ERROR_NAME, UTIL_NAME], extraRows, pinWarningCodes: ['VF_NOT_CONSTANT', 'RESISTOR_POWER'] });
  return { status: 'ok', result, raw, fieldErrors, ledgerRows: ledgerRowsOf(result.ledger) };
}

export function liveSummary(v: LedView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed. ${String(v.result.warnings.filter((w) => w.severity !== 'info').length)} cautions.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
