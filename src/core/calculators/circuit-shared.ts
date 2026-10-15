/**
 * Small helpers shared by the second slice of circuit-value calculators (feedback-divider, led-resistor, rc-lc, reactance).
 * Pure: no DOM, no globals. Errors are values; `Failure` is thrown inside a build and turned into an error value by `run`.
 */
import { rateConfidence, confidenceFactorsFromInputs } from '../confidence';
import type { AccuracyClass, Confidence, DataStatus, OutOfRangeInput } from '../confidence';
import { assertCalcResult } from '../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, Result } from '../result';
import { DIM, sameDim } from '../units';
import type { Quantity } from '../units';
import { formatPercent, formatResult } from '../format-result';

export class Failure extends Error {
  readonly code: CalcError['code'];
  readonly field: string | undefined;
  constructor(code: CalcError['code'], message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

export const REL_TOL = 1e-9;
export const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
export const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
export const num = (x: number): string => String(Number(x.toPrecision(4)));

/** A finite number, or an OUT_OF_DOMAIN failure (overflow or underflow for the given inputs, usually a unit slip). */
export function fin(x: number, what: string): number {
  if (!Number.isFinite(x)) throw new Failure('OUT_OF_DOMAIN', `${what} is outside the representable range for these inputs (check the units).`);
  return x;
}

/** A finite number greater than zero, or an OUT_OF_DOMAIN failure. */
export function finPos(x: number, what: string): number {
  fin(x, what);
  if (!(x > 0)) throw new Failure('OUT_OF_DOMAIN', `${what} is outside the representable range for these inputs (check the units).`);
  return x;
}

/** A dimensionless fraction from 0 up to, but not including, 0.5 (0.01 is 1 %). */
export function guardFraction(field: string, v: unknown): Result<Quantity, CalcError> {
  if (!isRecord(v) || typeof v['si'] !== 'number' || !isRecord(v['dim'])) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a quantity with a numeric value and a dimension.`) };
  }
  const qty = v as unknown as Quantity;
  const same = ((): boolean => {
    try {
      return sameDim(qty, { si: 1, dim: DIM.DIMENSIONLESS } as Quantity);
    } catch {
      return false;
    }
  })();
  if (!same) return { ok: false, error: err('DIMENSION', field, `${field} must be a dimensionless fraction (0.01 is 1 %).`) };
  const n = qty.si;
  if (!Number.isFinite(n) || n < 0 || n >= 0.5) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a finite fraction from 0 up to, but not including, 0.5 (0.01 is 1 %).`) };
  }
  return { ok: true, value: qty };
}

/** An enum field: absent gives `fallback` (when given); present must be one of `allowed`. */
export function guardEnum<T extends string>(field: string, v: unknown, allowed: readonly T[], fallback?: T): Result<T, CalcError> {
  if (v === undefined && fallback !== undefined) return { ok: true, value: fallback };
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be exactly ${allowed.map((a) => `"${a}"`).join(', ')}${fallback === undefined ? '; it is never defaulted' : ''}.`) };
  }
  return { ok: true, value: v as T };
}

export const MAX_NOTE_LENGTH = 200;

/** An optional free-text note (a source citation typed by the user). Control characters are rejected. */
export function guardNote(field: string, v: unknown): Result<string | undefined, CalcError> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== 'string') return { ok: false, error: err('INVALID_INPUT', field, `${field} must be text.`) };
  const t = v.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(t)) return { ok: false, error: err('INVALID_INPUT', field, `${field} must not contain control characters.`) };
  if (t.length === 0) return { ok: true, value: undefined };
  if (t.length > MAX_NOTE_LENGTH) return { ok: false, error: err('INVALID_INPUT', field, `${field} is longer than ${String(MAX_NOTE_LENGTH)} characters.`) };
  return { ok: true, value: t };
}

/** Headline-style text for a quantity: rounded in the direction its bound implies, units chosen by the formatter. */
export const text = (value: Quantity, bound: CalcResult['results'][number]['bound'], accuracyClass: AccuracyClass): string => formatResult({ value, bound }, { accuracyClass });
export const pct = (f: number, accuracyClass: AccuracyClass): string => formatPercent(f, 'nominal', { accuracyClass });

export interface Finish {
  readonly accuracyClass: AccuracyClass;
  readonly dataStatus: DataStatus;
  readonly inputs: readonly CalcInput[];
  readonly outOfRange: readonly OutOfRangeInput[];
}

/** Rule-based confidence from the input provenance; never hand-assigned. */
export function rate(f: Finish): Confidence {
  return rateConfidence(confidenceFactorsFromInputs({ inputs: f.inputs, outOfRange: f.outOfRange, accuracyClass: f.accuracyClass, dataStatus: f.dataStatus }));
}

/** Schema check, then wrap as an outcome. A malformed result is an INTERNAL error value, never returned as a result. */
export function finish(result: CalcResult): CalcOutcome {
  const chk = assertCalcResult(result);
  if (!chk.ok) return { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
  return { ok: true, value: result };
}

/** Run a build that may throw `Failure` (or anything else) and return an outcome. Never throws. */
export function run(build: () => CalcOutcome): CalcOutcome {
  try {
    return build();
  } catch (e) {
    if (e instanceof Failure) {
      const error: CalcError = e.field !== undefined ? { code: e.code, field: e.field, message: e.message } : { code: e.code, message: e.message };
      return { ok: false, error };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}

/** Plausibility check helper: inside [lo, hi] up to a relative tolerance. */
export const within = (x: number, lo: number, hi: number): boolean => x >= lo * (1 - REL_TOL) && x <= hi * (1 + REL_TOL);

/** Visible reason shared by every path calculator that takes user-supplied resistances or ratings (voltage-drop and path-load). */
export const USER_SUPPLIED_REASON =
  'Each user-supplied resistance or rating is only as good as its source note; the tool does not verify it, so a path made of such values cannot rate high on the strength of the method alone.';

/**
 * The ONE rule for user-supplied path values: all of them together count as a single defaulted-type item (+1, so a path of
 * only such values is at most medium), listed with its names. Returns undefined when there are none.
 */
export function userSuppliedDefault(names: readonly string[]): string | undefined {
  const unique = [...new Set(names)];
  return unique.length === 0 ? undefined : `user-supplied values taken as given and not checked against any source: ${unique.join('; ')}`;
}

/** Append the visible reason once when user-supplied values were counted. */
export function addUserSuppliedReason(confidence: Confidence, names: readonly string[]): void {
  if (names.length > 0 && !confidence.reasons.includes(USER_SUPPLIED_REASON)) confidence.reasons.push(USER_SUPPLIED_REASON);
}
