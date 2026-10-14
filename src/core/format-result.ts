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
  formatDualThickness,
  formatFor,
  roundDirectionFor,
  sigFigsFor,
  type AccuracyClass,
  type DisplayPrefs,
  type Quantity,
} from './units';
import { ceilGuarded, floorGuarded } from './units/round-guard';

export interface HeadlineOpts {
  readonly accuracyClass: AccuracyClass;
  readonly prefs?: DisplayPrefs;
  /** How LENGTH values print: 'geometry' (default, mm and mil) or 'thickness' (µm and mil). Ignored for other dimensions. */
  readonly lengthRole?: 'geometry' | 'thickness';
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
  if (opts.lengthRole === 'thickness' && sameDim(value, LENGTH_REF)) return formatDualThickness(value, { round });
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

/** A step value printed with the same directional rounding as the headline it repeats (bound defaults to nominal when the step has none). */
export function formatStep(step: { value: Quantity; bound?: Bound }, opts: HeadlineOpts): string {
  return formatResult({ value: step.value, bound: step.bound ?? 'nominal' }, opts);
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

const MAX_PERCENT_DECIMALS = 20;

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

const MAX_PERCENT_MAGNITUDE = 1e20;

/** Percent text of p (already times 100) with `sig` significant figures, rounded in `dir`; 'up'/'down' go toward +/- infinity. */
function percentText(p: number, dir: 'up' | 'down' | 'nearest', sig: number): string {
  if (p === 0) return '0 %';
  const decimalsFor = (x: number): number => sig - 1 - Math.floor(Math.log10(Math.abs(x)));
  const scale = 10 ** decimalsFor(p);
  const t = p * scale;
  const n = dir === 'up' ? ceilGuarded(t) : dir === 'down' ? floorGuarded(t) : Math.round(t);
  const r = n / scale;
  if (r === 0) return '0 %';
  return `${r.toFixed(Math.max(decimalsFor(r), 0))} %`;
}

function fractionOf(x: Quantity | number): number {
  let f: number;
  if (typeof x === 'number') f = x;
  else if (sameDim(x, q(1, DIM.DIMENSIONLESS))) f = x.si;
  else throw new InvalidValueError('A percent needs a dimensionless fraction');
  if (!Number.isFinite(f)) throw new InvalidValueError('Cannot format a non-finite percent');
  if (Math.abs(f) * 100 >= MAX_PERCENT_MAGNITUDE) throw new InvalidValueError('Percent is too large to print');
  return f;
}

/**
 * A dimensionless fraction printed as a percent, in the direction implied by its bound (prediction and min-requirement up,
 * max-capacity down, nominal nearest; up/down are toward +/- infinity). Significant figures follow the accuracy class.
 * No `round` override. Example: drop 0.06977 prediction -> '6.98 %'; efficiency 0.93028 max-capacity -> '93.0 %'.
 */
export function formatPercent(x: Quantity | number, bound: Bound, opts: { readonly accuracyClass: AccuracyClass }): string {
  const f = fractionOf(x);
  return percentText(f * 100, roundDirectionFor(bound), sigFigsFor(opts.accuracyClass));
}

/**
 * A signed error or deviation as a percent. Rule: the MAGNITUDE rounds away from zero (a deviation is never understated,
 * whichever way it points), and the sign is always printed ('+' or '-'). Exact zero prints '0 %'.
 */
export function formatSignedPercent(x: Quantity | number, opts: { readonly accuracyClass: AccuracyClass }): string {
  const f = fractionOf(x);
  if (f === 0) return '0 %';
  const text = percentText(Math.abs(f) * 100, 'up', sigFigsFor(opts.accuracyClass));
  return `${f < 0 ? '-' : '+'}${text}`;
}

export const HEADLINE_FORMATTERS =[formatResult, formatDesignValue, formatMargin, formatUtilisation] as const;
