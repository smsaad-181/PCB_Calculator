import { LEDGER, type LedgerStatus } from '../data/ledger';
import type { Result } from '../result';
import type { Quantity } from '../units';
import { dayNumber, has, isRec, nonEmpty, parseLength } from './parse-util';
import { parseScopedLimits, type ScopedLimit } from './scoped-limits';

/**
 * Fab profile schema (Phase 1 task 0 f). A profile is user-editable, date-stamped data. Absent limits stay absent:
 * there are no defaults here, ever (CLAUDE.md rule 9).
 */

/**
 * Flat (unscoped) length limits. Only finished copper thickness stays flat: it is keyed by layer and ordered weight in the
 * key name itself. Every hole, annular-ring, clearance and trace limit lives in `scopedLimits` (scoped-limits.ts).
 */
export const LENGTH_LIMIT_KEYS = [
  // Fabricator-published finished copper thickness per layer and ordered weight (ledger S-019c); "1 oz" is an order label, not a thickness.
  'finishedCopperOuter1oz',
  'finishedCopperInner0p5oz',
  'finishedCopperInner1oz',
] as const;

/**
 * Keys of schema v1 profiles written before the scoped model (gate G-6). They are rejected, never silently mapped: each
 * old key mixed hole types, layer counts or copper weights, or was misnamed, and mapping it would hide that.
 */
export const REMOVED_LIMIT_KEYS: Readonly<Record<string, string>> = {
  minTraceWidth: 'use scopedLimits "traceWidth" per layer count and copper weight',
  minTraceSpace: 'use scopedLimits "traceSpace" per layer count and copper weight',
  minDrill: 'use scopedLimits "holeSize" (min) per hole type and layer count',
  maxDrill: 'use scopedLimits "holeSize" (max)',
  minAnnularRingRecommended: 'use scopedLimits "annularRing" (recommended-min) per hole type, layer count and copper weight',
  minAnnularRingAbsolute: 'use scopedLimits "annularRing" (min) per hole type, layer count and copper weight',
  holePlatingAverage: 'use scopedLimits "holePlating" with kind "average"; an average is not a minimum, and a minimum is a separate entry',
  drillTolerancePlus: 'it was a FINISHED-hole tolerance, not a drill tolerance: use scopedLimits "holeFinishedTol" (tol-plus) per hole type',
  drillToleranceMinus: 'it was a FINISHED-hole tolerance, not a drill tolerance: use scopedLimits "holeFinishedTol" (tol-minus) per hole type',
  holePositionTolerance: 'use scopedLimits "holePositionTol"',
  copperToEdge: 'use scopedLimits "copperToRoutedEdge" or "copperToVcutEdge"',
  holeToTrack: 'use scopedLimits "holeToTrack" with a hole type (via, pth or npth are different limits)',
};
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
  /** Scoped limits (hole type, layer count, copper weight, layer side). Empty when the profile has none. */
  readonly scopedLimits: readonly ScopedLimit[];
}

const STATUSES: readonly string[] = ['VERIFIED', 'UNVERIFIED', 'PAYWALLED-USER-MUST-VERIFY', 'CONFLICT'];

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
        const qty = parseLength(`limits.${key}`, v, errors);
        if (qty) limits[key] = qty;
      } else if (pctKeys.includes(key)) {
        if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100) limits[key] = v;
        else errors.push(`limits.${key}: must be a finite number in (0, 100]`);
      } else if (key === 'copperWeightsOzFt2') {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) {
          limits[key] = [...(v as number[])];
        } else errors.push('limits.copperWeightsOzFt2: must be an array of finite numbers greater than zero');
      } else if (has(REMOVED_LIMIT_KEYS, key)) {
        errors.push(`limits.${key}: unscoped key removed (gate G-6); ${REMOVED_LIMIT_KEYS[key] ?? ''}`);
      } else {
        errors.push(`limits.${key}: unknown limit key`);
      }
    }
  }

  const scopedLimits = parseScopedLimits(
    j.scopedLimits,
    {
      profileDate: dayNumber(j.profileDate) === undefined ? undefined : (j.profileDate as string),
      profileLedgerIds: Array.isArray(ids) && ids.every((x) => nonEmpty(x)) ? (ids as string[]) : undefined,
      profileStatus: typeof status === 'string' ? status : undefined,
    },
    errors,
  );

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
    scopedLimits,
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

/**
 * Date problems that need a clock: a profile or entry date later than `today` (today is injected, never read). A future date
 * would make the profile look fresh forever, so callers should refuse a profile that has any. Throws on a malformed today.
 */
export function fabProfileDateProblems(profile: ParsedFabProfile, today: string): string[] {
  const t = dayNumber(today);
  if (t === undefined) throw new RangeError(`today must be a real calendar date formatted YYYY-MM-DD, got "${String(today)}"`);
  const out: string[] = [];
  const p = dayNumber(profile.profileDate);
  if (p !== undefined && p > t) out.push(`profileDate ${profile.profileDate} is in the future (today is ${today})`);
  for (const e of profile.scopedLimits) {
    const r = dayNumber(e.retrievedOn);
    if (r !== undefined && r > t) out.push(`scopedLimits ${e.key} (${e.kind}) retrievedOn ${e.retrievedOn} is in the future (today is ${today})`);
  }
  return out;
}
