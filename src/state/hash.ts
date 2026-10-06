// Pure URL-hash parse/serialize. Shape: #/calc/<id>?v=1&key=value&...
// Malformed input never throws; it degrades to home route + empty (default) state.
export const HASH_SCHEMA_VERSION = 1;
/** DoS guards: hashes longer than this, or with more query keys, discard state (checked before decoding). */
export const MAX_HASH_LENGTH = 8192;
export const MAX_STATE_KEYS = 64;

export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'about' }
  | { readonly name: 'calc'; readonly id: string }
  | { readonly name: 'notfound'; readonly path: string };

export type HashState = Readonly<Record<string, string>>;

/** Why a present state section was discarded. */
export type DiscardReason = 'version' | 'migration' | 'too-long' | 'too-many-keys' | 'corrupt';

export interface ParsedHash {
  readonly route: Route;
  /** Calculator state; empty when absent, corrupt, or from an unmigratable schema version. */
  readonly state: HashState;
  /** True when a state section was present but discarded (version mismatch or corrupt). */
  readonly stateDiscarded: boolean;
  /** Set exactly when stateDiscarded is true. */
  readonly reason?: DiscardReason;
  /** Human-readable notes about partial problems (e.g. reserved keys with unknown values that were dropped). */
  readonly notes: readonly string[];
}

/** Fixed banner sentence shown whenever state is discarded (P-5). Never silent. */
export const DISCARD_BANNER_TEXT = 'Could not load the shared settings from this link; showing defaults.';

const DISCARD_REASON_TEXT: Readonly<Record<DiscardReason, string>> = {
  version: 'The link was made with a different or unknown settings version.',
  migration: 'The link uses an older settings version that could not be converted.',
  'too-long': 'The link is too long to be safe to load.',
  'too-many-keys': 'The link contains too many settings.',
  corrupt: 'The link text is damaged (corrupt encoding), for example because it was cut off when copied.',
};

/** Reason text for the discard banner, or null when nothing was discarded. */
export function describeDiscard(parsed: Pick<ParsedHash, 'stateDiscarded' | 'reason'>): string | null {
  if (!parsed.stateDiscarded) return null;
  return DISCARD_REASON_TEXT[parsed.reason ?? 'corrupt'];
}

// ---------------------------------------------------------------------------
// Compact list encoding: one state key holds many values.
// Each value is percent-encoded (with '~' escaped, which encodeURIComponent leaves alone) and
// TERMINATED by '~'. Terminator (not separator) form keeps [] ("") distinct from [""] ("~").
// ---------------------------------------------------------------------------
const LIST_DELIM = '~';
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function encodeList(values: readonly string[]): string {
  let out = '';
  for (const v of values) {
    // Lone surrogates make encodeURIComponent throw; replace them with U+FFFD.
    const safe = String(v).replace(LONE_SURROGATE, '�');
    out += encodeURIComponent(safe).replace(/~/g, '%7E') + LIST_DELIM;
  }
  return out;
}

/** Inverse of encodeList. Never throws; an undecodable segment is kept as raw text. */
export function decodeList(s: string): string[] {
  if (typeof s !== 'string' || s === '') return [];
  const parts = s.split(LIST_DELIM);
  if (parts[parts.length - 1] === '') parts.pop(); // terminator after the last value
  return parts.map((p) => safeDecode(p) ?? p);
}

// ---------------------------------------------------------------------------
// Schema migration. To add a schema change:
//   1. bump HASH_SCHEMA_VERSION to N+1;
//   2. append { from: N, to: N+1, migrate: (state) => newState } to MIGRATIONS (pure, return a NEW object,
//      may throw: a throw becomes a discard with reason 'migration');
//   3. add a test with an old-version hash fixture. Old links then keep working instead of being discarded.
// The v1->v1 identity entry below is the template; it is applied only when the link is already current.
// ---------------------------------------------------------------------------
export interface HashMigration {
  readonly from: number;
  readonly to: number;
  readonly migrate: (state: Record<string, string>) => Record<string, string>;
}

export const MIGRATIONS: readonly HashMigration[] = [{ from: 1, to: 1, migrate: (s) => ({ ...s }) }];

export interface MigrateOptions {
  readonly registry?: readonly HashMigration[];
  readonly target?: number;
}

export type MigrateResult =
  | { readonly ok: true; readonly state: Record<string, string>; readonly version: number }
  | { readonly ok: false; readonly reason: string };

export function migrateHashState(
  fromVersion: number,
  state: Record<string, string>,
  opts: MigrateOptions = {},
): MigrateResult {
  const registry = opts.registry ?? MIGRATIONS;
  const target = opts.target ?? HASH_SCHEMA_VERSION;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) return { ok: false, reason: `invalid version ${String(fromVersion)}` };
  if (fromVersion > target) return { ok: false, reason: `version ${fromVersion} is newer than supported version ${target}` };
  let version = fromVersion;
  let cur: Record<string, string> = { ...state };
  try {
    while (version < target) {
      const step = registry.find((m) => m.from === version && m.to > version);
      if (!step) return { ok: false, reason: `no migration from version ${version}` };
      cur = step.migrate({ ...cur });
      version = step.to;
    }
    const identity = registry.find((m) => m.from === target && m.to === target);
    if (identity) cur = identity.migrate({ ...cur });
  } catch {
    return { ok: false, reason: 'migration failed' };
  }
  return { ok: true, state: cur, version };
}

// ---------------------------------------------------------------------------
// Reserved state keys (shared by every calculator). Values are validated; unknown values are dropped.
// ---------------------------------------------------------------------------
export interface ReservedKeySpec {
  readonly description: string;
  readonly isValid: (value: string) => boolean;
}

export const RESERVED_STATE_KEYS = {
  fc: {
    description: 'Foil convention: micrometres of copper per oz/ft² (decimal number, 30 to 40; default assumption 35).',
    isValid: (v) => /^\d{2}(\.\d{1,3})?$/.test(v) && Number(v) >= 30 && Number(v) <= 40,
  },
  fp: {
    description: 'Fab profile id: lower-case letters, digits, dot, underscore, hyphen (max 64 characters).',
    isValid: (v) => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(v),
  },
  mode: {
    description: 'Method mode: A = IPC-2152-informed estimate, B = legacy IPC-2221 formula.',
    isValid: (v) => v === 'A' || v === 'B',
  },
  u: {
    description: 'Unit preference: metric (mm, °C) or imperial (mil, °F).',
    isValid: (v) => v === 'metric' || v === 'imperial',
  },
} as const satisfies Record<string, ReservedKeySpec>;

export function sanitizeReservedState(state: HashState): { state: Record<string, string>; notes: string[] } {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  const notes: string[] = [];
  for (const k of Object.keys(state)) {
    const v = state[k] ?? '';
    if (Object.prototype.hasOwnProperty.call(RESERVED_STATE_KEYS, k)) {
      const spec: ReservedKeySpec = RESERVED_STATE_KEYS[k as keyof typeof RESERVED_STATE_KEYS];
      if (!spec.isValid(v)) {
        notes.push(`Ignored "${k}": unrecognised value.`);
        continue;
      }
    }
    out[k] = v;
  }
  return { state: { ...out }, notes };
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export function parseRoute(path: string): Route {
  const segs = path.split('/').filter((s) => s.length > 0);
  if (segs.length === 0) return { name: 'home' };
  if (segs.length === 1 && segs[0] === 'about') return { name: 'about' };
  if (segs.length === 2 && segs[0] === 'calc') {
    const id = safeDecode(segs[1] ?? '');
    if (id !== null && /^[a-z0-9][a-z0-9-]*$/.test(id)) return { name: 'calc', id };
  }
  return { name: 'notfound', path: segs.join('/').slice(0, 80) };
}

export function parseHash(hash: string, opts: MigrateOptions = {}): ParsedHash {
  let raw = typeof hash === 'string' ? hash : '';
  if (raw.startsWith('#')) raw = raw.slice(1);
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q + 1) : '';
  const route = parseRoute(path);
  const discard = (reason: DiscardReason): ParsedHash => ({ route, state: {}, stateDiscarded: true, reason, notes: [] });
  if (query === '') return { route, state: {}, stateDiscarded: false, notes: [] };
  if (raw.length > MAX_HASH_LENGTH) return discard('too-long');
  // Count '&' separators with early abort, before any decoding.
  let keyCount = 1;
  for (let i = query.indexOf('&'); i >= 0; i = query.indexOf('&', i + 1)) {
    if (++keyCount > MAX_STATE_KEYS) return discard('too-many-keys');
  }

  const state: Record<string, string> = Object.create(null) as Record<string, string>;
  let version: string | null = null;
  let corrupt = false;
  for (const part of query.split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const k = safeDecode(eq >= 0 ? part.slice(0, eq) : part);
    const v = safeDecode(eq >= 0 ? part.slice(eq + 1) : '');
    if (k === null || v === null || k === '') {
      corrupt = true;
      continue;
    }
    if (k === 'v') version = v;
    else if (!(k in state)) state[k] = v;
  }
  if (corrupt) return discard('corrupt');
  if (version === null || !/^\d{1,9}$/.test(version)) return discard('version');
  const migrated = migrateHashState(Number(version), { ...state }, opts);
  if (!migrated.ok) {
    const target = opts.target ?? HASH_SCHEMA_VERSION;
    return discard(Number(version) < target ? 'migration' : 'version');
  }
  const clean = sanitizeReservedState(migrated.state);
  return { route, state: clean.state, stateDiscarded: false, notes: clean.notes };
}

export function serializeRoute(route: Route): string {
  switch (route.name) {
    case 'about':
      return '/about';
    case 'calc':
      return `/calc/${encodeURIComponent(route.id)}`;
    default:
      return '/';
  }
}

/** Keys are sorted so equal state always yields an identical hash. `v` is always first. */
export function serializeHash(route: Route, state: HashState = {}): string {
  const clean = sanitizeReservedState(state).state;
  const keys = Object.keys(clean)
    .filter((k) => k !== 'v')
    .sort();
  const base = `#${serializeRoute(route)}`;
  if (route.name !== 'calc' || keys.length === 0) return base;
  const parts = [`v=${HASH_SCHEMA_VERSION}`];
  for (const k of keys) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(clean[k] ?? '')}`);
  return `${base}?${parts.join('&')}`;
}
