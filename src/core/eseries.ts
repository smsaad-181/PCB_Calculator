import { ESERIES } from './data/eseries';
import type { SeriesName } from './data/eseries';
import type { CalcError, Result } from './result';

export type { SeriesName } from './data/eseries';
export type Mode = 'nearest' | 'up' | 'down';
export type Topology = 'series' | 'parallel' | 'divider-ratio';

export interface Nearest {
  /** The series value found, the double nearest mantissa x 10^decade. */
  value: number;
  /** Mantissa of the FOUND value, a member of the series, 1 <= mantissa < 10. */
  mantissa: number;
  /** Decade of the FOUND value. */
  decade: number;
  /** (found - target) / target x 100. */
  errorPercent: number;
}

export interface Pair {
  r1: number;
  r2: number;
  value: number;
  errorPercent: number;
}

export interface PairOptions {
  /** Number of decades of the series in the search window, integer 1..6, default 3. */
  decades?: number;
  /** Lowest decade of the window. Default: series dec(target) - decades + 1, parallel dec(target), divider-ratio 3. */
  lowDecade?: number;
}

/** Smallest and largest target nearest() supports. */
export const ESERIES_MIN_VALUE = 1e-12;
export const ESERIES_MAX_VALUE = 1e12;
/** A target within this relative distance of a series value counts as that value (float noise of a computed ideal resistor). */
const SNAP_TOL = 1e-12;
/** Pair errors within this (relative to the target) are ties. */
const TIE_TOL = 1e-12;
/** The pair window must stay where products of two values cannot overflow or underflow. */
const WINDOW_LIMIT = 100;

const MODES: readonly string[] = ['nearest', 'up', 'down'];
const TOPOLOGIES: readonly string[] = ['series', 'parallel', 'divider-ratio'];

const fail = <T>(code: CalcError['code'], field: string, message: string): Result<T, CalcError> => ({ ok: false, error: { code, field, message } });

const isSeries = (s: unknown): s is SeriesName => typeof s === 'string' && Object.prototype.hasOwnProperty.call(ESERIES, s);
const isPositiveFinite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** mantissa x 10^decade as the double nearest the decimal (never 4700.000000000001). */
const scale = (mantissa: number, decade: number): number => Number(`${String(mantissa)}e${String(decade)}`);

/** The series mantissas scaled into one decade; a fresh array each call. */
export function valuesInDecade(series: SeriesName, decade: number): number[] {
  return ESERIES[series].map((m) => scale(m, decade));
}

interface Dec {
  digits: bigint;
  exp: number;
}

/** Exact decimal value of the shortest decimal form of a positive finite double. */
function toDec(x: number): Dec {
  const [mant = '0', exp = '0'] = x.toExponential().split('e');
  const [whole = '0', frac = ''] = mant.split('.');
  return { digits: BigInt(whole + frac), exp: Number(exp) - frac.length };
}

function addDec(a: Dec, b: Dec): Dec {
  const exp = Math.min(a.exp, b.exp);
  return { digits: a.digits * 10n ** BigInt(a.exp - exp) + b.digits * 10n ** BigInt(b.exp - exp), exp };
}

function cmpDec(a: Dec, b: Dec): number {
  const exp = Math.min(a.exp, b.exp);
  const x = a.digits * 10n ** BigInt(a.exp - exp);
  const y = b.digits * 10n ** BigInt(b.exp - exp);
  return x < y ? -1 : x > y ? 1 : 0;
}

interface Candidate {
  value: number;
  mantissa: number;
  decade: number;
}

/**
 * Snap a positive target to a value of the series. Candidates are the series values of the three decades around
 * the target; the lookup is a binary search over them, comparing doubles (monotone, so exact) and using exact decimal
 * arithmetic only for the half-way tie.
 */
export function nearest(value: number, series: SeriesName, mode: Mode): Result<Nearest, CalcError> {
  if (!isPositiveFinite(value)) return fail('INVALID_INPUT', 'value', 'value must be a finite number greater than zero.');
  if (!isSeries(series)) return fail('INVALID_INPUT', 'series', `series must be one of ${Object.keys(ESERIES).join(', ')}.`);
  if (typeof mode !== 'string' || !MODES.includes(mode)) return fail('INVALID_INPUT', 'mode', 'mode must be nearest, up or down.');
  if (value < ESERIES_MIN_VALUE || value > ESERIES_MAX_VALUE) {
    return fail('OUT_OF_DOMAIN', 'value', 'value must be between 1e-12 and 1e12 to be snapped to a series value.');
  }

  const mantissas = ESERIES[series];
  const size = mantissas.length;
  const firstDecade = Math.floor(Math.log10(value)) - 1;
  const total = 3 * size;
  const at = (k: number): Candidate => {
    const mantissa = mantissas[k % size] as number;
    const decade = firstDecade + Math.floor(k / size);
    return { value: scale(mantissa, decade), mantissa, decade };
  };

  // first candidate >= value
  let low = 0;
  let high = total;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (at(mid).value < value) low = mid + 1;
    else high = mid;
  }
  if (low === 0 || low >= total) return fail('INTERNAL', 'value', 'the series window does not bracket the target.');
  const upper = at(low);
  const lower = upper.value === value ? upper : at(low - 1);

  let pick: Candidate;
  if (lower === upper) pick = upper;
  else if (upper.value - value <= SNAP_TOL * value) pick = upper;
  else if (value - lower.value <= SNAP_TOL * value) pick = lower;
  else if (mode === 'up') pick = upper;
  else if (mode === 'down') pick = lower;
  else {
    // a tie goes up: target >= (lower + upper) / 2, compared exactly on the decimal forms
    const t = toDec(value);
    pick = cmpDec({ digits: t.digits * 2n, exp: t.exp }, addDec(toDec(lower.value), toDec(upper.value))) >= 0 ? upper : lower;
  }
  return { ok: true, value: { value: pick.value, mantissa: pick.mantissa, decade: pick.decade, errorPercent: ((pick.value - value) / value) * 100 } };
}

/**
 * The series value nearest to the target by RATIO (smallest |ln(found / target)|, the geometric neighbour), as opposed to
 * nearest(..., 'nearest') which minimises the arithmetic difference. The two differ in coarse series: in E3, 3.3 is 1.1 from
 * 2.2 but 1.4 from 4.7, yet 4.7 is nearer by ratio (1.424 against 1.5). It is always the 'up' or the 'down' neighbour; a tie
 * (up x down = target squared) goes up, as for nearest(). Same validation, window and errorPercent as nearest().
 */
export function nearestRatio(value: number, series: SeriesName): Result<Nearest, CalcError> {
  const up = nearest(value, series, 'up');
  if (!up.ok) return up;
  const down = nearest(value, series, 'down');
  if (!down.ok) return down;
  if (up.value.value === down.value.value) return up;
  return up.value.value * down.value.value <= value * value ? up : down;
}

/** Relative slack (of the target) when comparing a part's effect with the pair's error, so an exact tie counts as a tie. */
const NOISE_TOL = 1e-9;

/**
 * True when one resistor of the pair is noise: it moves the result by no more than the pair's own error against the target.
 * Series: the smaller part is the candidate, its effect is |value - larger|. Parallel: the larger part is, its effect is
 * |value - smaller|. In both cases the effect is how far the result sits from the dominant part alone. Example: 10 + 3300 for a
 * 3300 target (effect 10, error 10). A pair with zero error is never noise, and divider-ratio pairs are never filtered (both
 * parts always matter for a ratio). Pure; the pair must come from bestPairs for the same target and topology.
 */
export function isNegligiblePair(p: Pair, target: number, topology: Topology): boolean {
  if (topology === 'divider-ratio') return false;
  const dominant = topology === 'series' ? Math.max(p.r1, p.r2) : Math.min(p.r1, p.r2);
  const effect = Math.abs(p.value - dominant);
  const error = Math.abs(p.value - target);
  return effect <= error + NOISE_TOL * target && error > NOISE_TOL * target;
}

/**
 * Drop noise pairs (see isNegligiblePair) from a best-first list and keep the first `limit` others. The first pair (the best)
 * is never dropped. `hidden` counts the pairs dropped before the last one kept (or in the whole list when fewer than `limit`
 * remain), so it is the number a reader would otherwise have scrolled past.
 */
export function dropNoisePairs(pairs: readonly Pair[], target: number, topology: Topology, limit: number): { kept: Pair[]; hidden: number } {
  const kept: Pair[] = [];
  let hidden = 0;
  for (let i = 0; i < pairs.length && kept.length < limit; i++) {
    const p = pairs[i] as Pair;
    if (i > 0 && isNegligiblePair(p, target, topology)) hidden++;
    else kept.push(p);
  }
  return { kept, hidden };
}

/** Significant digits of a mantissa with trailing zeros dropped: 1 -> 1, 4.7 -> 2, 4.75 -> 3. */
const sigDigits = (m: number): number => Math.max(1, String(m).replace('.', '').replace(/0+$/, '').length);

interface Row {
  r1: number;
  r2: number;
  value: number;
  /** Signed relative error. */
  err: number;
  digits: number;
}

const byAbsError = (a: Row, b: Row): number => Math.abs(a.err) - Math.abs(b.err);
const byTieBreak = (a: Row, b: Row): number => a.digits - b.digits || a.r1 - b.r1 || a.r2 - b.r2;

/**
 * Pairs of series values whose combination is closest to the target.
 * Ordering: absolute error ascending; errors within 1e-12 (relative) of the first of a run are ties and are ordered by
 * fewer significant digits in r1 + r2, then r1, then r2.
 */
export function bestPairs(
  target: number,
  series: SeriesName,
  topology: Topology,
  n = 5,
  opts: PairOptions = {},
): Result<Pair[], CalcError> {
  if (!isPositiveFinite(target)) return fail('INVALID_INPUT', 'target', 'target must be a finite number greater than zero.');
  if (!isSeries(series)) return fail('INVALID_INPUT', 'series', `series must be one of ${Object.keys(ESERIES).join(', ')}.`);
  if (typeof topology !== 'string' || !TOPOLOGIES.includes(topology)) {
    return fail('INVALID_INPUT', 'topology', 'topology must be series, parallel or divider-ratio.');
  }
  if (!Number.isInteger(n) || n < 1 || n > 1000) return fail('INVALID_INPUT', 'n', 'n must be an integer from 1 to 1000.');
  const decades = opts.decades ?? 3;
  if (!Number.isInteger(decades) || decades < 1 || decades > 6) return fail('INVALID_INPUT', 'decades', 'decades must be an integer from 1 to 6.');
  const requestedLow = opts.lowDecade;
  if (requestedLow !== undefined && !Number.isInteger(requestedLow)) return fail('INVALID_INPUT', 'lowDecade', 'lowDecade must be an integer.');
  if (topology === 'divider-ratio' && target >= 1) return fail('OUT_OF_DOMAIN', 'target', 'the ratio of a divider is strictly between 0 and 1.');

  const targetDecade = Math.floor(Math.log10(target));
  const lowDecade = requestedLow ?? (topology === 'series' ? targetDecade - decades + 1 : topology === 'parallel' ? targetDecade : 3);
  if (lowDecade < -WINDOW_LIMIT || lowDecade + decades - 1 > WINDOW_LIMIT) {
    return fail('OUT_OF_DOMAIN', requestedLow === undefined ? 'target' : 'lowDecade', `the search window must lie within decades ${String(-WINDOW_LIMIT)} to ${String(WINDOW_LIMIT)}.`);
  }

  const mantissas = ESERIES[series];
  const values: { v: number; digits: number }[] = [];
  for (let d = lowDecade; d < lowDecade + decades; d++) {
    for (const m of mantissas) values.push({ v: scale(m, d), digits: sigDigits(m) });
  }

  const rows: Row[] = [];
  for (let i = 0; i < values.length; i++) {
    const a = values[i] as (typeof values)[number];
    for (let j = topology === 'divider-ratio' ? 0 : i; j < values.length; j++) {
      const b = values[j] as (typeof values)[number];
      const value = topology === 'series' ? a.v + b.v : topology === 'parallel' ? (a.v * b.v) / (a.v + b.v) : b.v / (a.v + b.v);
      rows.push({ r1: a.v, r2: b.v, value, err: (value - target) / target, digits: a.digits + b.digits });
    }
  }

  // Sort by error, then order each run of near-equal errors (measured from the run's first row) by the tie-break.
  // Chaining from the run start keeps the comparison a proper total order, unlike a tolerance inside the comparator.
  rows.sort(byAbsError);
  const ordered: Row[] = [];
  let start = 0;
  while (start < rows.length) {
    const base = Math.abs((rows[start] as Row).err);
    let end = start + 1;
    while (end < rows.length && Math.abs((rows[end] as Row).err) - base <= TIE_TOL) end++;
    ordered.push(...rows.slice(start, end).sort(byTieBreak));
    start = end;
  }

  return { ok: true, value: ordered.slice(0, n).map((r) => ({ r1: r.r1, r2: r.r2, value: r.value, errorPercent: r.err * 100 })) };
}
