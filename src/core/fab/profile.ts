import { LEDGER, type LedgerStatus } from '../data/ledger';
import type { Result } from '../result';
import { DIM, fromUnit, type Quantity } from '../units';
import { dimEqual } from '../units/dim';

/**
 * Fab profile schema (Phase 1 task 0 f). A profile is user-editable, date-stamped data. Absent limits stay absent:
 * there are no defaults here, ever (CLAUDE.md rule 9).
 */

export const LENGTH_LIMIT_KEYS = [
  'minTraceWidth',
  'minTraceSpace',
  'minDrill',
  'maxDrill',
  'minAnnularRingRecommended',
  'minAnnularRingAbsolute',
  'holePlatingAverage',
  'drillTolerancePlus',
  'drillToleranceMinus',
  'holePositionTolerance',
  'copperToEdge',
  'holeToTrack',
] as const;
export const PCT_LIMIT_KEYS = ['traceWidthTolerancePct', 'impedanceTolerancePct', 'boardThicknessTolerancePct'] as const;

export type LengthLimitKey = (typeof LENGTH_LIMIT_KEYS)[number];
export type PctLimitKey = (typeof PCT_LIMIT_KEYS)[number];

export type FabLimits = {
  readonly [K in LengthLimitKey]?: Quantity;
} & {
  readonly [K in PctLimitKey]?: number;
} & {
  readonly copperWeightsOzFt2?: readonly number[];
};

export interface ParsedFabProfile {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly fabricator: string;
  readonly profileDate: string;
  readonly source: string;
  readonly edition?: string;
  readonly status: LedgerStatus;
  readonly ledgerIds: readonly string[];
  readonly verifiedBy: string;
  readonly bannerRequired: boolean;
  readonly notes?: string;
  readonly limits: FabLimits;
}

const STATUSES: readonly string[] = ['VERIFIED', 'UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

type Rec = Readonly<Record<string, unknown>>;

function isRec(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
const nonEmpty = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';
const has = (o: Rec, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** UTC day number of a strict, real YYYY-MM-DD date; undefined if malformed or not a calendar date. */
function dayNumber(s: unknown): number | undefined {
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

function parseLength(name: string, raw: unknown, errors: string[]): Quantity | undefined {
  if (!isRec(raw) || !has(raw, 'value') || !has(raw, 'unit')) {
    errors.push(`limits.${name}: must be an object { value, unit }`);
    return undefined;
  }
  const { value, unit } = raw;
  let ok = true;
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    errors.push(`limits.${name}: value must be a finite number greater than zero`);
    ok = false;
  }
  if (typeof unit !== 'string' || unit === '') {
    errors.push(`limits.${name}: unit must be a non-empty string`);
    ok = false;
  }
  if (!ok || typeof value !== 'number' || typeof unit !== 'string') return undefined;
  try {
    const qty = fromUnit(value, unit);
    if (!dimEqual(qty.dim, DIM.LENGTH)) {
      errors.push(`limits.${name}: unit "${unit}" is not a length unit`);
      return undefined;
    }
    return qty;
  } catch {
    errors.push(`limits.${name}: unknown unit "${unit}"`);
    return undefined;
  }
}

export function parseFabProfile(json: unknown): Result<ParsedFabProfile, string[]> {
  if (!isRec(json)) return { ok: false, error: ['profile: must be a JSON object'] };
  const errors: string[] = [];
  const j = json;

  if (j.schemaVersion !== 1) errors.push('schemaVersion: must be the number 1');
  for (const key of ['id', 'fabricator', 'source'] as const) {
    if (!nonEmpty(j[key])) errors.push(`${key}: must be a non-empty string`);
  }
  if (dayNumber(j.profileDate) === undefined) errors.push('profileDate: must be a real calendar date formatted YYYY-MM-DD');

  const status = j.status;
  const statusOk = typeof status === 'string' && STATUSES.includes(status);
  if (!statusOk) errors.push(`status: must be one of ${STATUSES.join(', ')}`);

  const ids = j.ledgerIds;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => nonEmpty(x))) {
    errors.push('ledgerIds: must be a non-empty array of non-empty strings');
  }

  if (typeof j.verifiedBy !== 'string') errors.push('verifiedBy: must be a string');
  else if (status === 'VERIFIED' && j.verifiedBy.trim() === '') errors.push('verifiedBy: required when status is VERIFIED');

  if (typeof j.bannerRequired !== 'boolean') errors.push('bannerRequired: must be a boolean');
  else if (statusOk && status !== 'VERIFIED' && j.bannerRequired !== true) {
    errors.push('bannerRequired: must be true unless status is VERIFIED');
  }

  if (has(j, 'edition') && j.edition !== undefined && typeof j.edition !== 'string') errors.push('edition: must be a string');
  if (has(j, 'notes') && j.notes !== undefined && typeof j.notes !== 'string') errors.push('notes: must be a string');

  const limits: Record<string, Quantity | number | readonly number[]> = {};
  if (!isRec(j.limits)) {
    errors.push('limits: must be an object');
  } else {
    const lim = j.limits;
    const lengthKeys: readonly string[] = LENGTH_LIMIT_KEYS;
    const pctKeys: readonly string[] = PCT_LIMIT_KEYS;
    for (const key of Object.keys(lim)) {
      const v = lim[key];
      if (lengthKeys.includes(key)) {
        const qty = parseLength(key, v, errors);
        if (qty) limits[key] = qty;
      } else if (pctKeys.includes(key)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100) limits[key] = v;
        else errors.push(`limits.${key}: must be a finite number in (0, 100]`);
      } else if (key === 'copperWeightsOzFt2') {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
          limits[key] = [...(v as number[])];
        } else errors.push('limits.copperWeightsOzFt2: must be an array of finite numbers greater than zero');
      } else {
        errors.push(`limits.${key}: unknown limit key`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, error: errors };

  const profile: ParsedFabProfile = {
    schemaVersion: 1,
    id: j.id as string,
    fabricator: j.fabricator as string,
    profileDate: j.profileDate as string,
    source: j.source as string,
    ...(typeof j.edition === 'string' ? { edition: j.edition } : {}),
    status: j.status as LedgerStatus,
    ledgerIds: [...(j.ledgerIds as string[])],
    verifiedBy: j.verifiedBy as string,
    bannerRequired: j.bannerRequired as boolean,
    ...(typeof j.notes === 'string' ? { notes: j.notes } : {}),
    limits: limits as FabLimits,
  };
  return { ok: true, value: profile };
}

/** Whole UTC days from the profile date to `today` (YYYY-MM-DD). Negative if today precedes it. Throws on malformed today. */
export function fabProfileAgeDays(profile: ParsedFabProfile, today: string): number {
  const t = dayNumber(today);
  if (t === undefined) throw new RangeError(`today must be a real calendar date formatted YYYY-MM-DD, got "${String(today)}"`);
  const p = dayNumber(profile.profileDate);
  if (p === undefined) throw new RangeError(`profile date "${profile.profileDate}" is not a valid calendar date`);
  return t - p;
}

export function fabProfileStale(profile: ParsedFabProfile, today: string, maxDays = 365): boolean {
  return fabProfileAgeDays(profile, today) > maxDays;
}

/** Ledger row ids that a profile cites but the in-code ledger does not contain. */
export function unknownLedgerIds(profile: ParsedFabProfile): string[] {
  const known = new Set(LEDGER.map((r) => r.id));
  return profile.ledgerIds.filter((id) => !known.has(id));
}
