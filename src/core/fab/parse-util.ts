import { DIM, fromUnit, type Quantity } from '../units';
import { dimEqual } from '../units/dim';

/** Small shared helpers for fab-profile parsing (pure; no clock, no DOM). */

export type Rec = Readonly<Record<string, unknown>>;

export function isRec(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
export const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
export const has = (o: Rec, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;

/** UTC day number of a strict, real YYYY-MM-DD date; undefined if malformed or not a calendar date. */
export function dayNumber(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined;
  const m = DATE_RE.exec(s);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return undefined;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return undefined;
  return ms / DAY_MS;
}

/** Parses `{ value, unit }` into a SI length Quantity (finite, greater than zero); problems are pushed to `errors`. */
export function parseLength(name: string, raw: unknown, errors: string[]): Quantity | undefined {
  if (!isRec(raw) || !has(raw, 'value') || !has(raw, 'unit')) {
    errors.push(`${name}: must be an object { value, unit }`);
    return undefined;
  }
  const { value, unit } = raw;
  let ok = true;
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    errors.push(`${name}: value must be a finite number greater than zero`);
    ok = false;
  }
  if (typeof unit !== 'string' || unit === '') {
    errors.push(`${name}: unit must be a non-empty string`);
    ok = false;
  }
  if (!ok || typeof value !== 'number' || typeof unit !== 'string') return undefined;
  try {
    const qty = fromUnit(value, unit);
    if (!dimEqual(qty.dim, DIM.LENGTH)) {
      errors.push(`${name}: unit "${unit}" is not a length unit`);
      return undefined;
    }
    return qty;
  } catch {
    errors.push(`${name}: unknown unit "${unit}"`);
    return undefined;
  }
}
