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

/**
 * Calculator-local state keys, documented here so two calculators cannot silently collide with a reserved key.
 * Values are validated by the owning calculator's view-model (unknown values fall back to defaults with a notice),
 * not by sanitizeReservedState. A local key must never reuse a reserved key or `v`.
 */
export const CALCULATOR_STATE_KEYS = {
  'copper-converter': {
    by: 'Which quantity is entered: "weight" or "thickness" (the other is solved).',
    w: 'Entered copper weight text, for example "1 oz" (at most 40 characters).',
    t: 'Entered copper thickness text, for example "35 um" (at most 40 characters).',
    ly: 'Copper layer: "outer" or "inner". Absent means not chosen (never defaulted).',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption (fc is not used: a um-per-oz number cannot tell the 34.29 and 34.33 um conventions apart).',
    pl: 'Entered plating thickness text (outer layer only, at most 40 characters).',
    tb: 'Thickness basis: nominal, finished or measured (thickness entry only).',
  },
  'trace-width': {
    sf: 'Solve for: "width", "current" or "rise" (temperature rise). Absent means width. The other two quantities are entered.',
    w: 'Entered trace width text, for example "0.3 mm" or "12 mil" (at most 40 characters; used when solving current or rise).',
    i: 'Entered current text, for example "1 A" or "500 mA" (at most 40 characters; used when solving width or rise).',
    dt: 'Entered temperature RISE text, for example "10 °C" or "10 K" (a difference, not an absolute temperature; at most 40 characters; used when solving width or current).',
    ly: 'Copper layer: "outer" or "inner". Absent means not chosen: there is no default and no result without it.',
    cs: 'How copper is specified: "weight" or "thickness". Absent means weight.',
    cw: 'Entered copper weight text, for example "1 oz" (at most 40 characters).',
    ct: 'Entered copper thickness text, for example "35 um" (at most 40 characters).',
    cb: 'Thickness basis when copper is given as a thickness: nominal, finished or measured. Absent means nominal.',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    am: 'Entered ambient temperature text, for example "40 °C". Absent means the 25 °C engineering default.',
    dm: 'Entered design margin on the minimum width, a plain factor of at least 1, for example "1.5". Absent means the 1.25 engineering default.',
    cd: 'Entered current derating on the current limit, a plain factor above 0 and at most 1, for example "0.7". Absent means the 0.8 engineering default.',
    mt: 'Entered optional maximum allowed conductor temperature text, for example "105 °C".',
  },
  'trace-resistance': {
    l: 'Entered trace length text, for example "100 mm", "4 in" or "250 mil" (at most 40 characters).',
    w: 'Entered trace width text, for example "0.254 mm" or "10 mil" (at most 40 characters).',
    ly: 'Copper layer: "outer" or "inner". Absent means not chosen: there is no default and no result without it.',
    cs: 'How copper is specified: "weight" or "thickness". Absent means weight.',
    cw: 'Entered copper weight text, for example "1 oz" (at most 40 characters).',
    ct: 'Entered copper thickness text, for example "35 um" or "1.4 mil" (at most 40 characters).',
    cb: 'Thickness basis when copper is given as a thickness: nominal, finished or measured. Absent means nominal.',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    am: 'Entered ambient temperature text, for example "40 °C". Absent means the 25 °C engineering default.',
    dt: 'Entered temperature RISE text, for example "20 °C" or "20 K" (a difference, not an absolute temperature; supplied by you, no self-heating iteration; at most 40 characters). Absent means the conductor is at ambient.',
    rho: 'Entered resistivity override text at 20 °C, for example "1.72e-8 Ω·m" (at most 40 characters). Absent means the ledger value for annealed copper; it is never prefilled.',
    al: 'Entered temperature coefficient override text, for example "3930 ppm/K" (at most 40 characters). Absent means the ledger value for copper; it is never prefilled.',
    f: 'Entered frequency text for the skin-depth check, for example "1 GHz" (at most 40 characters). Absent means no skin-depth check.',
    i: 'Entered current text for the voltage drop and power loss, for example "2 A" (at most 40 characters). Absent means neither is shown.',
  },
  'ohm-power': {
    vo: 'Entered voltage text, for example "5 V" (at most 40 characters). Absent means not given. Give exactly two of vo, i, r, p; the other two are solved.',
    i: 'Entered current text, for example "50 mA" (at most 40 characters). Absent means not given.',
    r: 'Entered resistance text, for example "100 Ω" or "4k7" (at most 40 characters). Absent means not given.',
    p: 'Entered power text, for example "250 mW" (at most 40 characters). Absent means not given.',
  },
  'resistor-divider': {
    sf: 'Solve for: "vout" (output voltage), "r1" (top resistor) or "r2" (bottom resistor). Absent means vout.',
    vi: 'Entered input voltage text, for example "12 V" (at most 40 characters).',
    r1: 'Entered R1 text, the TOP resistor from Vin to the Vout node, for example "10k" (at most 40 characters; used when solving vout or r2).',
    r2: 'Entered R2 text, the BOTTOM resistor from the Vout node to ground, for example "4.7k" (at most 40 characters; used when solving vout or r1).',
    tg: 'Entered target output voltage text, for example "3.3 V" (at most 40 characters; used when solving a resistor).',
    rl: 'Entered optional load resistance text across R2, for example "100k" (at most 40 characters). Absent means no load.',
    tol: 'Entered optional resistor tolerance, a percent or fraction such as "1%" or "0.01" (at most 40 characters). Absent means no tolerance envelope.',
    vtol: 'Entered optional input voltage tolerance, a percent or fraction such as "5%" (at most 40 characters). Absent means none.',
    se: 'E-series the solved resistor is snapped to: "E24", "E96" or "E192". Absent means none (exact value). Only used when solving a resistor.',
    sn: 'Snap direction: "nearest", "up" or "down". Absent means nearest. Only used when a series is chosen.',
  },
  'e-series': {
    nt: 'Entered target resistance text for the nearest-value lookup, for example "4k7" or "2.2k" (at most 40 characters).',
    ns: 'E-series for the lookup: E3, E6, E12, E24, E48, E96 or E192. Absent means E24.',
    pt: 'Entered target text for the two-resistor search: a resistance for series and parallel, a fraction or percent such as "0.25" or "25%" for a divider ratio (at most 40 characters).',
    pk: 'Two-resistor topology: "series", "parallel" or "divider-ratio". Absent means series.',
    ps: 'E-series for the two-resistor search: E3, E6, E12, E24, E48, E96 or E192. Absent means E24.',
  },
} as const satisfies Record<string, Record<string, string>>;

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
