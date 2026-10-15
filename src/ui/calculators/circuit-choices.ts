// Choices and display helpers shared by the three circuit-value pages. Pure: no DOM, no engineering math.
// This is the ONE UI file that spells the E-series snap direction of the core library; the source-scan tests rely on that.
import type { SeriesChoice, SnapMode } from '../../core/calculators/resistor-divider/guards';
import { formatResult, formatSignedPercent, type HeadlineOpts } from '../../core/format-result';
import type { Mode, SeriesName, Topology } from '../../core/eseries';
import { DIM, q } from '../../core/units';
import { MAX_FIELD_CHARS, parseFractionField, type FieldView } from '../components/view';

/** Catalog numbers (E-series values and the parts typed by the user) are exact, so they print at full precision. */
export const CATALOG_OPTS: HeadlineOpts = { accuracyClass: 'exact' };

/** A resistance in ohms printed as a catalog value, for example 4.7 kΩ. Goes through format-result. */
export function catalogResistance(ohms: number): string {
  return formatResult({ value: q(ohms, DIM.RESISTANCE), bound: 'nominal' }, CATALOG_OPTS);
}

/** A dimensionless ratio printed through format-result, for example 0.25. */
export function catalogRatio(ratio: number): string {
  return formatResult({ value: q(ratio, DIM.DIMENSIONLESS), bound: 'nominal' }, CATALOG_OPTS);
}

/** Relative errors below this are floating-point noise, not an error. */
export const NEGLIGIBLE_ERROR = 1e-9;

/** Accuracy class for printing a catalog-lookup error (a computed ratio of catalog values, not an exact number). */
export const ERROR_ACCURACY = 'analytical' as const;

/** Signed error as a percent through core formatSignedPercent (sign always printed, size rounded away from zero). */
export function signedPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return 'not available';
  // Float noise (a pair that is exact on paper) must not print as a tiny error.
  return formatSignedPercent(Math.abs(fraction) < NEGLIGIBLE_ERROR ? 0 : fraction, { accuracyClass: ERROR_ACCURACY });
}

// ---------------------------------------------------------------------------
// Series and snap choices
// ---------------------------------------------------------------------------
export type SnapChoice = SnapMode;

export const SNAP_CHOICES: readonly { readonly value: SnapChoice; readonly label: string }[] = [
  { value: 'nearest', label: 'Nearest value' },
  { value: 'up', label: 'Next value up' },
  { value: 'down', label: 'Next value down' },
];
export const DEFAULT_SNAP: SnapChoice = 'nearest';

export function isSnapChoice(v: string): v is SnapChoice {
  return SNAP_CHOICES.some((c) => c.value === v);
}

/** Divider snapping series. */
export const DIVIDER_SERIES: readonly { readonly value: SeriesChoice; readonly label: string }[] = [
  { value: 'none', label: 'None (exact value)' },
  { value: 'E24', label: 'E24' },
  { value: 'E96', label: 'E96' },
  { value: 'E192', label: 'E192' },
];

export function isDividerSeries(v: string): v is SeriesChoice {
  return DIVIDER_SERIES.some((c) => c.value === v);
}

/** Every series the E-series library has. */
export const ALL_SERIES: readonly SeriesName[] = ['E3', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'];

export function isSeriesName(v: string): v is SeriesName {
  return (ALL_SERIES as readonly string[]).includes(v);
}

/** What 'nearest' means wherever a value is snapped to a series (F-4). Shown on the E-series, divider and feedback pages. */
export const NEAREST_NOTE =
  'Nearest means the smallest difference in ohms, not the smallest ratio. In a coarse series (E3, E6) the two can pick different values; the E-series page shows both.';

/** The three answers of a lookup, in display order. */
export const LOOKUP_MODES: readonly { readonly mode: Mode; readonly label: string }[] = [
  { mode: 'nearest', label: 'Nearest' },
  { mode: 'up', label: 'Next up (at or above the target)' },
  { mode: 'down', label: 'Next down (at or below the target)' },
];

export const TOPOLOGIES: readonly { readonly value: Topology; readonly label: string }[] = [
  { value: 'series', label: 'Series (R1 + R2)' },
  { value: 'parallel', label: 'Parallel (R1 ‖ R2)' },
  { value: 'divider-ratio', label: 'Divider ratio (R2 / (R1 + R2))' },
];

export function isTopology(v: string): v is Topology {
  return TOPOLOGIES.some((c) => c.value === v);
}

// ---------------------------------------------------------------------------
// Tolerance field
// ---------------------------------------------------------------------------
const BARE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A tolerance: "1%" or "0.01". A bare number from 0.5 up is a fraction that large is not a tolerance, so it gets the
 * "write 1% or 0.01" hint instead of being accepted as 100 %. (The calculator rejects 50 % and above as well.)
 */
export function parseToleranceField(text: string): FieldView {
  const r = parseFractionField(text);
  if (r.status !== 'ok') return r;
  const t = text.trim();
  if (BARE_NUMBER.test(t) && r.value.si >= 0.5) {
    const hint =
      r.value.si === 1
        ? `"${t}" is ambiguous: a bare number is a fraction, so it would mean 100 %. Write 1% or 0.01 for one percent.`
        : `"${t}" is read as a fraction, which is far too large for a tolerance. Write ${t}% to mean ${t} percent.`;
    return { status: 'error', message: hint };
  }
  return r;
}

export { MAX_FIELD_CHARS };

// ---------------------------------------------------------------------------
// Series lists of the second slice (feedback divider, LED resistor)
// ---------------------------------------------------------------------------
export type StockSeries = 'none' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192';

const seriesRow = (value: StockSeries): { readonly value: StockSeries; readonly label: string } => ({ value, label: value === 'none' ? 'None (exact value, not a stock value)' : value });

/** Feedback divider series (the core accepts E12 to E192). */
export const FEEDBACK_SERIES = (['none', 'E12', 'E24', 'E48', 'E96', 'E192'] as const).map(seriesRow);
/** LED resistor series (the core accepts E6 to E192). */
export const LED_SERIES = (['none', 'E6', 'E12', 'E24', 'E48', 'E96', 'E192'] as const).map(seriesRow);

export type FeedbackSeries = Exclude<StockSeries, 'E6'>;

export function isFeedbackSeries(v: string): v is FeedbackSeries {
  return FEEDBACK_SERIES.some((c) => c.value === v);
}
export function isLedSeries(v: string): v is StockSeries {
  return LED_SERIES.some((c) => c.value === v);
}

// ---------------------------------------------------------------------------
// Whole-number field (LED count, number of pairs)
// ---------------------------------------------------------------------------
export type CountView =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly count: number }
  | { readonly status: 'error'; readonly message: string };

/** A whole number written with digits only. Range limits belong to the calculator, whose message is shown for a count outside them. */
export function parseCountField(text: string): CountView {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!/^\d+$/.test(t)) return { status: 'error', message: `"${t}" is not a whole number. Write digits only, for example 3.` };
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return { status: 'error', message: 'The number is too large.' };
  return { status: 'ok', count: n };
}

/** The same whole-number parse in the field shape QuantityField expects (a dimensionless count). */
export function parseCountFieldView(text: string): FieldView {
  const r = parseCountField(text);
  if (r.status !== 'ok') return r;
  return { status: 'ok', value: q(r.count, DIM.DIMENSIONLESS), echo: `${String(r.count)} (whole number)`, warnings: [] };
}
