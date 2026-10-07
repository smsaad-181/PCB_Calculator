/**
 * Headline formatters (gate G1-a): the rounding direction is derived from the meaning of the number, never chosen by
 * the caller. None of these accepts a `round` override and `accuracyClass` is required, so safe rounding is not opt-in.
 * Pure: no DOM, no globals.
 */
import type { Bound, DesignDirection, DesignValue, ElementResult } from './result';
import {
  DIM,
  InvalidValueError,
  q,
  sameDim,
  formatDual,
  formatFor,
  roundDirectionFor,
  type AccuracyClass,
  type DisplayPrefs,
  type Quantity,
} from './units';

export interface HeadlineOpts {
  readonly accuracyClass: AccuracyClass;
  readonly prefs?: DisplayPrefs;
}

/** Design-value direction expressed as a result bound. */
export function boundForDesignDirection(d: DesignDirection): Bound {
  return d === 'min-requirement' ? 'min-requirement' : 'max-capacity';
}

/** Result bound expressed as a design direction; nominal and prediction have none. */
export function designDirectionForBound(b: Bound): DesignDirection | undefined {
  if (b === 'min-requirement') return 'min-requirement';
  if (b === 'max-capacity') return 'max-limit';
  return undefined;
}

const LENGTH_REF = q(1, DIM.LENGTH);
const AREA_REF = q(1, DIM.AREA);

function print(value: Quantity, round: 'up' | 'down' | 'nearest', opts: HeadlineOpts): string {
  const base = { round, accuracyClass: opts.accuracyClass };
  if (sameDim(value, LENGTH_REF) || sameDim(value, AREA_REF)) {
    return formatDual(value, opts.prefs === undefined ? base : { ...base, prefs: opts.prefs });
  }
  return formatFor(value, opts.prefs === undefined ? base : { ...base, prefs: opts.prefs });
}

/** Value printed in the direction implied by its bound; length and area print dual (mm and mil). */
export function formatResult(item: { value: Quantity; bound: Bound }, opts: HeadlineOpts): string {
  return print(item.value, roundDirectionFor(item.bound), opts);
}

/** Calculated or recommended value of a design value, rounded in the direction of its design direction. */
export function formatDesignValue(dv: DesignValue, which: 'calculated' | 'recommended', opts: HeadlineOpts): string {
  return formatResult({ value: dv[which], bound: boundForDesignDirection(dv.direction) }, opts);
}

/** Margin is a capacity: always rounded toward minus infinity, explicit sign, flagged when over the limit. */
export function formatMargin(el: ElementResult, opts: HeadlineOpts): string {
  const text = print(el.margin, 'down', opts);
  if (el.margin.si < 0) return `${text} (over limit)`;
  return `+${text}`;
}

const GUARD = 4 * Number.EPSILON;
const MAX_PERCENT_DECIMALS = 20;

/** ceil(t), except that t within a 4-ulp relative guard of an integer is taken as that integer (float noise only). */
function ceilGuarded(t: number): number {
  const r = Math.round(t);
  return Math.abs(t - r) <= GUARD * Math.abs(t) ? r : Math.ceil(t);
}

/** Utilisation as percent with one decimal, rounded up; a value below 1 never prints as 100 or more (decimals are added). */
export function formatUtilisation(u: number): string {
  if (!Number.isFinite(u)) throw new InvalidValueError('Cannot format a non-finite utilisation');
  const p = u * 100;
  let decimals = 1;
  let text = (ceilGuarded(p * 10) / 10).toFixed(1);
  if (u < 1) {
    while (Number(text) >= 100 && decimals < MAX_PERCENT_DECIMALS) {
      decimals++;
      const scale = 10 ** decimals;
      text = (ceilGuarded(p * scale) / scale).toFixed(decimals);
    }
  }
  return `${text} %`;
}

export const HEADLINE_FORMATTERS = [formatResult, formatDesignValue, formatMargin, formatUtilisation] as const;
