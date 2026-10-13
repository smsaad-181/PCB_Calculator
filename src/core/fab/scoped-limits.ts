import type { DataStatus } from '../confidence';
import { LEDGER } from '../data/ledger';
import { dataStatusFromLedger } from '../data-status';
import type { Quantity } from '../units';
import { dayNumber, has, isRec, nonEmpty, parseLength } from './parse-util';

/**
 * Scoped fab limits (gate G-6, Phase 1 task 7b). A fabricator publishes different limits for different hole types, layer
 * counts, copper weights and layer sides, so every entry carries its own scope, ledger row and quote. A lookup returns the
 * entry whose scope matches the request, "not published" (the exact scope exists and says so) or "not available" (no entry
 * for that scope). It NEVER falls back to another hole type, layer count, copper weight, layer side or limit kind
 * (CLAUDE.md rule 9: no hidden defaults). Nothing here knows a fabricator's numbers; the data is in the profile JSON.
 */

export const HOLE_TYPES = ['via', 'pth', 'npth', 'pressfit', 'any'] as const;
export const SIZE_BASES = ['finished', 'drill', 'designed-unstated', 'not-applicable'] as const;
export const LAYER_COUNTS = ['1', '2', 'multilayer', 'any'] as const;
export const LAYER_SIDES = ['inner', 'outer', 'unstated'] as const;
export const LIMIT_KINDS = ['min', 'recommended-min', 'max', 'tol-plus', 'tol-minus', 'tol-sym', 'average'] as const;

export type HoleTypeScope = (typeof HOLE_TYPES)[number];
export type SizeBasis = (typeof SIZE_BASES)[number];
export type LayerCountScope = (typeof LAYER_COUNTS)[number];
export type LayerSide = (typeof LAYER_SIDES)[number];
export type LimitKind = (typeof LIMIT_KINDS)[number];

interface KeySpec {
  readonly kinds: readonly LimitKind[];
  /** Plausibility window in metres. An engineering sanity range for catching unit slips, not a standard. */
  readonly minSi: number;
  readonly maxSi: number;
}
const MIN_REC = ['min', 'recommended-min'] as const;
const CLEARANCE: KeySpec = { kinds: MIN_REC, minSi: 5e-6, maxSi: 0.02 };

/** Every scoped limit key. Lengths only; unit-kind is "length" for all of them. */
export const SCOPED_KEYS = {
  /** Hole size (drill-diameter limits as published; the finished-or-drill basis is in each entry's sizeBasis). */
  holeSize: { kinds: ['min', 'recommended-min', 'max'], minSi: 20e-6, maxSi: 0.05 },
  /** Tolerance on the FINISHED hole diameter. Not a drill-bit tolerance. */
  holeFinishedTol: { kinds: ['tol-plus', 'tol-minus', 'tol-sym'], minSi: 1e-6, maxSi: 2e-3 },
  holePositionTol: { kinds: ['tol-sym'], minSi: 1e-6, maxSi: 2e-3 },
  /** Tolerance on the pad (copper) diameter, as +/- on the diameter. */
  padSizeTol: { kinds: ['tol-sym'], minSi: 1e-6, maxSi: 2e-3 },
  /** Barrel plating: an AVERAGE is never a minimum. */
  holePlating: { kinds: ['average', 'min'], minSi: 1e-6, maxSi: 200e-6 },
  annularRing: { kinds: MIN_REC, minSi: 5e-6, maxSi: 5e-3 },
  padDiameter: { kinds: MIN_REC, minSi: 50e-6, maxSi: 0.05 },
  /** Pad diameter minus hole diameter (a DIAMETER difference, twice the per-side ring). */
  padMinusHole: { kinds: MIN_REC, minSi: 10e-6, maxSi: 5e-3 },
  holeToTrack: CLEARANCE,
  holeToCopper: CLEARANCE,
  holeToHole: CLEARANCE,
  padToTrack: CLEARANCE,
  smdPadToPad: CLEARANCE,
  copperToRoutedEdge: CLEARANCE,
  copperToVcutEdge: CLEARANCE,
  traceWidth: { kinds: MIN_REC, minSi: 5e-6, maxSi: 5e-3 },
  traceSpace: { kinds: MIN_REC, minSi: 5e-6, maxSi: 5e-3 },
} as const satisfies Record<string, KeySpec>;

export type ScopedKey = keyof typeof SCOPED_KEYS;
export const SCOPED_KEY_NAMES = Object.keys(SCOPED_KEYS) as ScopedKey[];
const isKey = (k: string): k is ScopedKey => Object.prototype.hasOwnProperty.call(SCOPED_KEYS, k);

export interface ScopedLimit {
  readonly key: ScopedKey;
  readonly kind: LimitKind;
  /** False means the fabricator does not publish this limit for this scope: there is no value, never a default. */
  readonly published: boolean;
  readonly value?: Quantity;
  readonly holeType: HoleTypeScope;
  readonly sizeBasis: SizeBasis;
  readonly layerCount: LayerCountScope;
  /** Ordered copper weight in oz/ft2, or 'any' when the fabricator publishes it without a copper-weight scope. */
  readonly copperOz: number | 'any';
  readonly layerSide: LayerSide;
  readonly ledgerId: string;
  /** Data status derived from the ledger row, never typed in the file. */
  readonly status: DataStatus;
  readonly quote: string;
  readonly retrievedOn: string;
}

/** What the caller needs the limit for. An omitted dimension matches only entries that are explicitly 'any' / 'unstated'. */
export interface ScopeRequest {
  readonly holeType?: Exclude<HoleTypeScope, 'any'>;
  readonly layerCount?: Exclude<LayerCountScope, 'any'>;
  readonly copperOz?: number;
  readonly layerSide?: Exclude<LayerSide, 'unstated'>;
}

export type LimitLookup =
  | { readonly status: 'found'; readonly entry: ScopedLimit; readonly value: Quantity }
  | { readonly status: 'not-published'; readonly entry: ScopedLimit }
  | { readonly status: 'not-available'; readonly reason: string };

const OZ_TOL = 1e-9;
const ozEq = (a: number, b: number): boolean => Math.abs(a - b) <= OZ_TOL * Math.max(1, Math.abs(a), Math.abs(b));

function matches(e: ScopedLimit, s: ScopeRequest): boolean {
  if (e.holeType !== 'any' && e.holeType !== s.holeType) return false;
  if (e.layerCount !== 'any' && e.layerCount !== s.layerCount) return false;
  if (e.copperOz !== 'any' && (s.copperOz === undefined || !ozEq(e.copperOz, s.copperOz))) return false;
  if (e.layerSide !== 'unstated' && e.layerSide !== s.layerSide) return false;
  return true;
}

export function describeScope(s: ScopeRequest): string {
  const parts = [
    `hole type ${s.holeType ?? '(not given)'}`,
    `layer count ${s.layerCount ?? '(not given)'}`,
    `copper weight ${s.copperOz === undefined ? '(not given)' : `${String(s.copperOz)} oz/ft2`}`,
  ];
  if (s.layerSide !== undefined) parts.push(`layer side ${s.layerSide}`);
  return parts.join(', ');
}

/**
 * Exact-scope lookup. At most one entry can match because the parser rejects overlapping entries. A request that omits a
 * dimension the profile distinguishes gets "not available" and a reason naming that dimension; nothing is guessed.
 */
export function lookupLimit(
  profile: { readonly scopedLimits: readonly ScopedLimit[] },
  key: ScopedKey,
  kind: LimitKind,
  scope: ScopeRequest,
): LimitLookup {
  const candidates = profile.scopedLimits.filter((e) => e.key === key && e.kind === kind);
  const hits = candidates.filter((e) => matches(e, scope));
  if (hits.length === 1) {
    const e = hits[0] as ScopedLimit;
    return e.published && e.value !== undefined ? { status: 'found', entry: e, value: e.value } : { status: 'not-published', entry: e };
  }
  const head = `Not available for this scope: no "${key}" (${kind}) entry in the profile for ${describeScope(scope)}.`;
  if (hits.length > 1) return { status: 'not-available', reason: `${head} The profile has ${String(hits.length)} entries matching this scope, which is ambiguous.` };
  if (candidates.length === 0) return { status: 'not-available', reason: `${head} The profile has no "${key}" (${kind}) entries at all.` };
  const missing: string[] = [];
  if (scope.holeType === undefined && candidates.some((c) => c.holeType !== 'any')) missing.push('hole type');
  if (scope.layerCount === undefined && candidates.some((c) => c.layerCount !== 'any')) missing.push('layer count');
  if (scope.copperOz === undefined && candidates.some((c) => c.copperOz !== 'any')) missing.push('copper weight');
  if (scope.layerSide === undefined && candidates.some((c) => c.layerSide !== 'unstated')) missing.push('layer side');
  const why = missing.length > 0 ? ` The profile distinguishes ${missing.join(', ')}, which was not given.` : '';
  return {
    status: 'not-available',
    reason: `${head}${why} The profile has ${String(candidates.length)} "${key}" (${kind}) entr${candidates.length === 1 ? 'y' : 'ies'} for other scopes; they are not substituted (no other hole type, layer count, copper weight or limit kind is used).`,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------------------

export interface ScopedParseContext {
  readonly profileDate: string | undefined;
  readonly profileLedgerIds: readonly string[] | undefined;
  readonly profileStatus: string | undefined;
}

const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);

const compat = (a: ScopedLimit, b: ScopedLimit): boolean =>
  (a.holeType === 'any' || b.holeType === 'any' || a.holeType === b.holeType) &&
  (a.layerCount === 'any' || b.layerCount === 'any' || a.layerCount === b.layerCount) &&
  (a.copperOz === 'any' || b.copperOz === 'any' || ozEq(a.copperOz, b.copperOz)) &&
  (a.layerSide === 'unstated' || b.layerSide === 'unstated' || a.layerSide === b.layerSide);

const label = (e: ScopedLimit): string => `${e.key} (${e.kind}; ${e.holeType}, layers ${e.layerCount}, ${String(e.copperOz)} oz, ${e.layerSide})`;

function parseEntry(raw: unknown, i: number, ctx: ScopedParseContext, ledgerStatus: ReadonlyMap<string, DataStatus>, errors: string[]): ScopedLimit | undefined {
  const at = `scopedLimits[${String(i)}]`;
  if (!isRec(raw)) {
    errors.push(`${at}: must be an object`);
    return undefined;
  }
  const tag = typeof raw.key === 'string' ? `${at} (${raw.key})` : at;
  const n0 = errors.length;
  const bad = (m: string): void => {
    errors.push(`${tag}: ${m}`);
  };

  let key: ScopedKey | undefined;
  if (typeof raw.key !== 'string' || !isKey(raw.key)) bad(`key "${String(raw.key)}" is not a known scoped limit key (${SCOPED_KEY_NAMES.join(', ')})`);
  else key = raw.key;

  let kind: LimitKind | undefined;
  if (!oneOf(LIMIT_KINDS, raw.kind)) bad(`kind must be one of ${LIMIT_KINDS.join(', ')}`);
  else if (key !== undefined && !(SCOPED_KEYS[key].kinds as readonly string[]).includes(raw.kind)) bad(`kind "${raw.kind}" is not allowed for this key (allowed: ${SCOPED_KEYS[key].kinds.join(', ')})`);
  else kind = raw.kind;

  if (typeof raw.published !== 'boolean') bad('published must be true or false');
  const published = raw.published === true;
  const hasValue = has(raw, 'value') && raw.value !== undefined && raw.value !== null;
  let value: Quantity | undefined;
  if (typeof raw.published === 'boolean') {
    if (published && !hasValue) bad('value is required when published is true');
    else if (!published && hasValue) bad('value must be absent when published is false (a limit the fabricator does not publish has no number)');
    else if (published) {
      const sub: string[] = [];
      value = parseLength('value', raw.value, sub);
      for (const m of sub) bad(m);
      if (value !== undefined && key !== undefined) {
        const spec = SCOPED_KEYS[key];
        if (!(value.si >= spec.minSi && value.si <= spec.maxSi)) {
          bad(`value is implausible for this limit (${String(value.si)} m is outside ${String(spec.minSi)} to ${String(spec.maxSi)} m); check the unit`);
          value = undefined;
        }
      }
    }
  }

  const holeType = raw.holeType;
  if (!oneOf(HOLE_TYPES, holeType)) bad(`holeType must be one of ${HOLE_TYPES.join(', ')}`);
  const sizeBasis = raw.sizeBasis;
  if (!oneOf(SIZE_BASES, sizeBasis)) bad(`sizeBasis must be one of ${SIZE_BASES.join(', ')}`);
  const layerCount = raw.layerCount;
  if (!oneOf(LAYER_COUNTS, layerCount)) bad(`layerCount must be one of ${LAYER_COUNTS.join(', ')}`);
  const copperOz = raw.copperOz;
  const ozOk = copperOz === 'any' || (typeof copperOz === 'number' && Number.isFinite(copperOz) && copperOz > 0 && copperOz <= 20);
  if (!ozOk) bad('copperOz must be "any" or a finite number of oz/ft2 greater than zero (at most 20)');
  const layerSide = raw.layerSide;
  if (!oneOf(LAYER_SIDES, layerSide)) bad(`layerSide must be one of ${LAYER_SIDES.join(', ')}`);

  if (!nonEmpty(raw.quote)) bad('quote must be a non-empty string (the published wording)');

  let status: DataStatus | undefined;
  const lid = raw.ledgerId;
  if (!nonEmpty(lid)) bad('ledgerId must be a non-empty string');
  else {
    status = ledgerStatus.get(lid);
    if (status === undefined) bad(`ledgerId "${lid}" is not a row in the in-code ledger`);
    else if (ctx.profileLedgerIds !== undefined && !ctx.profileLedgerIds.includes(lid)) bad(`ledgerId "${lid}" is not listed in the profile's ledgerIds`);
    else if (status !== 'VERIFIED' && ctx.profileStatus === 'VERIFIED') bad(`ledger row ${lid} is ${status} but the profile status is VERIFIED`);
  }

  const rd = raw.retrievedOn;
  const rdn = dayNumber(rd);
  if (rdn === undefined) bad('retrievedOn must be a real calendar date formatted YYYY-MM-DD');
  else {
    const pdn = dayNumber(ctx.profileDate);
    if (pdn !== undefined && rdn > pdn) bad(`retrievedOn ${String(rd)} is after the profile date ${String(ctx.profileDate)}`);
  }

  if (errors.length > n0 || key === undefined || kind === undefined) return undefined;
  if (!oneOf(HOLE_TYPES, holeType) || !oneOf(SIZE_BASES, sizeBasis) || !oneOf(LAYER_COUNTS, layerCount) || !oneOf(LAYER_SIDES, layerSide)) return undefined;
  if (status === undefined || typeof rd !== 'string' || typeof raw.quote !== 'string' || typeof lid !== 'string') return undefined;
  return {
    key,
    kind,
    published,
    ...(value !== undefined ? { value } : {}),
    holeType,
    sizeBasis,
    layerCount,
    copperOz: copperOz as number | 'any',
    layerSide,
    ledgerId: lid,
    status,
    quote: raw.quote,
    retrievedOn: rd,
  };
}

/** Parses the `scopedLimits` array. Returns every problem; entries are returned only when the whole array is valid. */
export function parseScopedLimits(raw: unknown, ctx: ScopedParseContext, errors: string[]): readonly ScopedLimit[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('scopedLimits: must be an array of limit entries');
    return [];
  }
  const ledgerStatus = new Map<string, DataStatus>(LEDGER.map((r) => [r.id, dataStatusFromLedger(r.status)]));
  const n0 = errors.length;
  const out: ScopedLimit[] = [];
  raw.forEach((r, i) => {
    const e = parseEntry(r, i, ctx, ledgerStatus, errors);
    if (e) out.push(e);
  });
  if (errors.length > n0) return [];

  for (let i = 0; i < out.length; i++) {
    const a = out[i] as ScopedLimit;
    for (let j = i + 1; j < out.length; j++) {
      const b = out[j] as ScopedLimit;
      if (a.key === b.key && a.kind === b.kind && compat(a, b)) {
        errors.push(`scopedLimits[${String(i)}] and scopedLimits[${String(j)}] overlap: ${label(a)} and ${label(b)} could both apply to one request, so there is no single exact entry`);
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[i] as ScopedLimit;
    for (let j = 0; j < out.length; j++) {
      const b = out[j] as ScopedLimit;
      if (i === j || a.key !== b.key || !a.value || !b.value || !compat(a, b)) continue;
      if (a.kind === 'min' && b.kind === 'recommended-min' && b.value.si < a.value.si) {
        errors.push(`scopedLimits[${String(j)}]: recommended minimum is below the minimum of an overlapping scope (${label(b)} vs ${label(a)})`);
      }
      if ((a.kind === 'min' || a.kind === 'recommended-min') && b.kind === 'max' && !(a.value.si < b.value.si)) {
        errors.push(`scopedLimits[${String(i)}]: minimum is not below the maximum of an overlapping scope (${label(a)} vs ${label(b)})`);
      }
    }
  }
  return errors.length > n0 ? [] : out;
}
