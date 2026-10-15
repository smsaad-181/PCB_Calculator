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

const PATH_ELEMENT_ENCODING =
  'list-encoded (values percent-encoded and ended by "~"; the page writes the value percent-encoded a second time in the link, and a single encoding is accepted on read). ' +
  'First value is the kind code. Trace "t": label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty), allowed temperature rise (a difference). ' +
  'Via "v": label, finished hole, plating thickness, barrel length, count, drill (optional), pad (optional), rated current (optional), rating source. ' +
  'User elements "c" connector, "p" pad, "s" spoke, "n" pour-neck, "k" cable, "r" resistance: label, resistance, source note, rated current (optional), rating source.';

/** Documents the numbered element slots of the path and load page (numbered from 1 without gaps). */
function pathElementKeys(what: string, prefix: string, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let n = 1; n <= max; n++) {
    out[`${prefix}${String(n)}`] = `${what} ${String(n)}, ${PATH_ELEMENT_ENCODING} Elements are numbered from 1 without gaps; at most ${String(max)}.`;
  }
  return out;
}

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
    wsrc: 'Where an entered copper weight comes from: "foil" (foil spec, base foil) or "finished" (fab order form, finished copper; no thickness is computed). Absent means not answered (weight is treated as base foil, with a visible note).',
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
    wsrc: 'Where an entered copper weight comes from: "foil" (foil spec, base foil) or "finished" (fab order form, finished copper; no result is computed). Absent means not answered (weight is treated as base foil, with a visible note).',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    am: 'Entered ambient temperature text, for example "40 °C". Absent means the 25 °C engineering default.',
    dm: 'Entered design margin on the minimum width, a plain factor of at least 1, for example "1.5". Absent means the 1.25 engineering default.',
    cd: 'Entered current derating on the current limit, a plain factor above 0 and at most 1, for example "0.7". Absent means the 0.8 engineering default.',
    mt: 'Entered optional maximum allowed conductor temperature text, for example "105 °C".',
    tcur: 'Current tolerance: optional tolerance on the entered current, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. Only used when the current is entered (not when solving it).',
    trise: 'Temperature rise tolerance: a percent or fraction such as "10%", or a pair "minus|plus" such as "5%|10%" (at most 81 characters). Absent means none. Only used when the rise is entered (not when solving it).',
    twid: 'Trace width tolerance: optional tolerance on the width, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. With solve-for width it adds the drawn width that covers the minus side. Ignored when twpf is 1.',
    tthk: 'Own copper thickness tolerance (used only when tkch is pct): optional tolerance on the foil weight or the entered thickness, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    tkch: 'Copper thickness tolerance choice: foil (spread between the three foil conventions, ledger S-003), finished (finished-copper thin side only, ledger S-009, secondhand and paywalled), pct (your own percent, tthk) or none. Absent means not chosen: no thickness tolerance. foil and finished need the copper given as a weight.',
    tamb: 'Ambient tolerance as a temperature DIFFERENCE, for example "5 K" or "5 °C", or a pair "minus|plus" (at most 81 characters). Absent means none. Only used when an ambient is entered.',
    twpf: 'Width tolerance from the fab profile: 1 means use the track-width tolerance of the chosen fab profile (reserved key fp; JLCPCB example, ledger S-019l, UNVERIFIED). Absent means not used. Ignored without a chosen profile.',
    cm: 'Current type: "steady" or "pulse" (optional pulsed current, RMS-equivalent mean heating). Absent means steady. A pulse replaces the steady current i and cannot be combined with solving for current (the page then shows the core error).',
    ip: 'Entered pulse peak current text, for example "10 A" (at most 40 characters; used when the current type is pulse).',
    du: 'Entered pulse duty cycle text, a percent or fraction such as "25%" or "0.25" (at most 40 characters; used when the current type is pulse).',
    pt: 'Pulse period versus the thermal time constant: "much-shorter" (evaluate at I_pk x sqrt(D), a mean-heating result) or "comparable-or-longer" (peak held continuously, no rms result). Absent means not chosen: there is no default and no pulse result without it.',
    lc: 'Board layer count that scopes the fab profile minimum trace width note: "1", "2" or "multilayer". Absent means not given: no note. Only used with a chosen fab profile (reserved key fp); dropped with a notice otherwise.',
  },
  'trace-resistance': {
    l: 'Entered trace length text, for example "100 mm", "4 in" or "250 mil" (at most 40 characters).',
    w: 'Entered trace width text, for example "0.254 mm" or "10 mil" (at most 40 characters).',
    ly: 'Copper layer: "outer" or "inner". Absent means not chosen: there is no default and no result without it.',
    cs: 'How copper is specified: "weight" or "thickness". Absent means weight.',
    cw: 'Entered copper weight text, for example "1 oz" (at most 40 characters).',
    ct: 'Entered copper thickness text, for example "35 um" or "1.4 mil" (at most 40 characters).',
    cb: 'Thickness basis when copper is given as a thickness: nominal, finished or measured. Absent means nominal.',
    wsrc: 'Where an entered copper weight comes from: "foil" (foil spec, base foil) or "finished" (fab order form, finished copper; no result is computed). Absent means not answered (weight is treated as base foil, with a visible note).',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    am: 'Entered ambient temperature text, for example "40 °C". Absent means the 25 °C engineering default.',
    dt: 'Entered temperature RISE text, for example "20 °C" or "20 K" (a difference, not an absolute temperature; supplied by you, no self-heating iteration; at most 40 characters). Absent means the conductor is at ambient.',
    rho: 'Entered resistivity override text at 20 °C, for example "1.72e-8 Ω·m" (at most 40 characters). Absent means the ledger value for annealed copper; it is never prefilled.',
    al: 'Entered temperature coefficient override text, for example "3930 ppm/K" (at most 40 characters). Absent means the ledger value for copper; it is never prefilled.',
    f: 'Entered frequency text for the skin-depth check, for example "1 GHz" (at most 40 characters). Absent means no skin-depth check.',
    i: 'Entered current text for the voltage drop and power loss, for example "2 A" (at most 40 characters). Absent means neither is shown.',
    tlen: 'Trace length tolerance: optional tolerance on the length, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    twid: 'Trace width tolerance: optional tolerance on the width, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    tthk: 'Own copper thickness tolerance (used only when tkch is pct): optional tolerance on the foil weight or the entered thickness, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    tkch: 'Copper thickness tolerance choice: foil (spread between the three foil conventions, ledger S-003), finished (finished-copper thin side only, ledger S-009, secondhand and paywalled), pct (your own percent, tthk) or none. Absent means not chosen: no thickness tolerance. foil and finished need the copper given as a weight.',
    tamb: 'Ambient tolerance as a temperature DIFFERENCE, for example "5 K", or a pair "minus|plus" (at most 81 characters). Absent means none. Only used when an ambient is entered.',
    trho: 'Resistivity override tolerance: optional tolerance on the resistivity override, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. Only used with a resistivity override.',
    tcur: 'Current tolerance: optional tolerance on the entered current, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. Only used when a current is entered.',
  },
  'self-heating': {
    law: 'Thermal law: "user-theta" (user-supplied thermal resistance) or "legacy-ipc2221-calibrated" (legacy). Absent means not chosen: there is no default and no result without it.',
    l: 'Entered trace length text, for example "100 mm" or "4 in" (at most 40 characters).',
    w: 'Entered trace width text, for example "0.254 mm" or "10 mil" (at most 40 characters).',
    ly: 'Copper layer: "outer" or "inner". Absent means not chosen: there is no default and no result without it.',
    cs: 'How copper is specified: "weight" or "thickness". Absent means weight.',
    cw: 'Entered copper weight text, for example "1 oz" (at most 40 characters).',
    ct: 'Entered copper thickness text, for example "35 um" (at most 40 characters).',
    cb: 'Thickness basis when copper is given as a thickness: nominal, finished or measured. Absent means nominal.',
    wsrc: 'Where an entered copper weight comes from: "foil" (foil spec, base foil) or "finished" (fab order form, finished copper; no result is computed). Absent means not answered (weight is treated as base foil, with a visible note).',
    conv: 'Foil convention id: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    am: 'Entered ambient temperature text (absolute), for example "40 °C". Absent means the 25 °C engineering default.',
    cm: 'Current type: "steady" or "pulse". Absent means steady.',
    i: 'Entered steady current text, for example "2 A" (at most 40 characters; used when the current type is steady).',
    ip: 'Entered pulse peak current text, for example "4 A" (at most 40 characters; used when the current type is pulse).',
    du: 'Entered pulse duty cycle text, a percent or fraction such as "25%" or "0.25" (at most 40 characters; used when the current type is pulse).',
    pt: 'Pulse period versus the thermal time constant: "much-shorter" or "comparable-or-longer". Absent means not chosen: there is no default and no pulse result without it.',
    thby: 'How the user thermal resistance is given: "theta" (K/W) or "per-length" (K·m/W). Absent means theta.',
    th: 'Entered thermal resistance text, for example "50 K/W" (at most 40 characters; used with law user-theta and thby theta).',
    tl: 'Entered thermal resistance per length text, for example "5 K·m/W" (at most 40 characters; used with law user-theta and thby per-length).',
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
    ltol: 'Entered optional load tolerance, a percent or fraction such as "5%" (at most 40 characters). Only used when a load is given. Absent means the load is exact.',
    vr: 'Entered optional rated working voltage of the resistors, for example "75 V" (at most 40 characters). Absent means the voltage rating is not checked.',
    se: 'E-series the solved resistor is snapped to: "E24", "E96" or "E192". Absent means none (exact value). Only used when solving a resistor.',
    sn: 'Snap direction: "nearest", "up" or "down". Absent means nearest. Only used when a series is chosen.',
  },
  'voltage-drop': {
    vs: 'Entered source voltage text, for example "12 V" (at most 40 characters).',
    lk: 'Kind of load: "current", "power", "resistance" or "voltage". Absent means not chosen: there is no default and no result without it.',
    lv: 'Entered load value text for the chosen kind, for example "2 A", "10 W", "10 ohm" or "11.5 V" (at most 40 characters).',
    rp: 'Return path: "included-in-list", "same-as-forward" or "not-counted". Absent means not chosen: there is no default and no result without it.',
    db: 'Entered optional drop budget, a percent or fraction such as "5%" (at most 40 characters). Absent means no budget; there is no default.',
    tc: 'Entered conductor temperature text of every trace, for example "60 °C" (at most 40 characters). Absent means the 25 °C engineering default.',
    conv: 'Foil convention id for every trace: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    fe1: 'Forward path element 1, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    fe2: 'Forward path element 2, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    fe3: 'Forward path element 3, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    fe4: 'Forward path element 4, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    fe5: 'Forward path element 5, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    fe6: 'Forward path element 6, list-encoded (values percent-encoded and ended by "~"). Trace: t, label, layer (outer|inner|empty), length, width, copper by (w weight|t thickness), copper weight, copper thickness, thickness basis, weight source (foil|finished|empty). Resistance: r, label, resistance, source note. Elements are numbered from 1 without gaps; at most 6.',
    re1: 'Return path element 1 (only with return path included-in-list); same encoding as fe1; at most 6.',
    re2: 'Return path element 2 (only with return path included-in-list); same encoding as fe1; at most 6.',
    re3: 'Return path element 3 (only with return path included-in-list); same encoding as fe1; at most 6.',
    re4: 'Return path element 4 (only with return path included-in-list); same encoding as fe1; at most 6.',
    re5: 'Return path element 5 (only with return path included-in-list); same encoding as fe1; at most 6.',
    re6: 'Return path element 6 (only with return path included-in-list); same encoding as fe1; at most 6.',
  },
  'path-load': {
    vs: 'Entered source voltage text, for example "12 V" (at most 40 characters).',
    lk: 'Kind of load: "current", "power", "resistance" or "voltage". Absent means not chosen: there is no default and no result without it.',
    lv: 'Entered load value text for the chosen kind, for example "2 A", "10 W", "10 ohm" or "11.5 V" (at most 40 characters).',
    rp: 'Return path: "included-in-list", "same-as-forward" or "not-counted". Absent means not chosen: there is no default and no result without it.',
    db: 'Entered optional drop budget, a percent or fraction such as "5%" (at most 40 characters). Absent means no budget; there is no default.',
    tc: 'Entered conductor temperature text of every trace and via, for example "60 °C" (at most 40 characters). Absent means the 25 °C engineering default.',
    conv: 'Foil convention id for every trace: nominal-35um, nominal-1.35mil or mass-density. Absent means the default assumption.',
    lc: 'Layer count scope for the clearance export: "1", "2" or "multilayer". Absent means not given. Only used with a fab profile (reserved key fp).',
    ...pathElementKeys('Forward path element', 'fe', 12),
    ...pathElementKeys('Return path element', 're', 12),
  },
  via: {
    d: 'Finished hole diameter text (not the drill), for example "0.3 mm" (max 40 characters).',
    t: 'Plating thickness text (max 40 characters). Absent means not entered: required, never pre-filled.',
    l: 'Barrel length text, for example "1.6 mm" (max 40 characters).',
    n: 'Number of vias in parallel, a whole number of at least 1 (max 40 characters).',
    i: 'Total current text, for example "1 A" (max 40 characters). Absent means no drop or loss.',
    tc: 'Conductor temperature text, for example "60 °C" (max 40 characters). Absent means the 25 °C default.',
    rho: 'Plated resistivity override text at 20 °C (max 40 characters). Absent means pure copper.',
    km: 'Thermal conductivity material: "pure-401" or "c11000-391". Absent means pure-401 (default).',
    tdia: 'Finished hole diameter tolerance: optional tolerance on the finished hole, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    tpla: 'Plating thickness tolerance: optional tolerance on the plating thickness, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    tlen: 'Barrel length tolerance: optional tolerance on the barrel length, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed.',
    trho: 'Plated resistivity override tolerance: optional tolerance on the resistivity override, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. Only used with a resistivity override.',
    ttmp: 'Conductor temperature tolerance as a temperature DIFFERENCE, for example "5 K", or a pair "minus|plus" (at most 81 characters). Absent means none. Only used when a temperature is entered.',
    tcur: 'Current tolerance: optional tolerance on the entered current, a percent or fraction such as "5%" or "0.05" (at most 40 characters), or an asymmetric pair "minus|plus" such as "3%|10%" (at most 81 characters). Absent means no tolerance for it: nothing is assumed. Only used when a current is entered.',
  },
  'annular-ring': {
    pd: 'Pad diameter text, for example "1 mm" (max 40 characters).',
    hd: 'Finished hole diameter text, for example "0.6 mm" (max 40 characters).',
    ht: 'Hole type: "via", "pth" or "npth". Absent means not chosen: no result.',
    rr: 'Ring reference: "finished" or "drill". Absent means finished (default).',
    dd: 'Drill diameter text (max 40 characters). Required for a drill reference.',
    pl: 'Plating thickness text (max 40 characters); needs a drill diameter; not for NPTH.',
    lc: 'Layer count scope: "1", "2" or "multilayer". Absent means not given.',
    cw: 'Ordered copper weight text, for example "1 oz" (max 40 characters).',
    ls: 'Layer side scope: "inner" or "outer". Absent means not given.',
    th: 'Hole size tolerance (plus): text, or "profile". Absent means none.',
    tp: 'Position tolerance (radial): text, or "profile". Absent means none.',
    ts: 'Pad size tolerance (+/-): text, or "profile". Absent means none.',
    mn: 'Your minimum ring text, for example "0.15 mm" (max 40 characters).',
    rc: 'Your recommended ring text, for example "0.2 mm" (max 40 characters).',
  },
  'e-series': {
    nt: 'Entered target resistance text for the nearest-value lookup, for example "4k7" or "2.2k" (at most 40 characters).',
    ns: 'E-series for the lookup: E3, E6, E12, E24, E48, E96 or E192. Absent means E24.',
    pt: 'Entered target text for the two-resistor search: a resistance for series and parallel, a fraction or percent such as "0.25" or "25%" for a divider ratio (at most 40 characters).',
    pk: 'Two-resistor topology: "series", "parallel" or "divider-ratio". Absent means series.',
    ps: 'E-series for the two-resistor search: E3, E6, E12, E24, E48, E96 or E192. Absent means E24.',
  },
  'feedback-divider': {
    vr: 'Entered reference voltage text from the regulator datasheet, for example "0.8 V" (at most 40 characters). Absent means not entered: required, never pre-filled.',
    vs: 'Entered note on where the Vref value came from, for example a datasheet name and table (free text, at most 200 characters). Absent means no source note.',
    r1: 'Entered R1 text, the TOP resistor from Vout to the FB pin, for example "100k" (at most 40 characters). Leave R1, R2 or Vout out: that one is solved.',
    r2: 'Entered R2 text, the BOTTOM resistor from the FB pin to ground, for example "10k" (at most 40 characters).',
    vo: 'Entered output voltage text, for example "3.3 V" (at most 40 characters): the target when solving a resistor, the only voltage given in a pair search.',
    se: 'E-series for snapping a solved resistor or for the best-pair search: "none", "E12", "E24", "E48", "E96" or "E192". Absent means none (exact value). A pair search needs a series.',
    sn: 'Snap direction of a solved resistor: "nearest", "up" or "down". Absent means not chosen: there is no default and no snapped result without it.',
    pc: 'Number of best pairs listed in a pair search, a whole number from 1 to 10 (at most 40 characters). Absent means the calculator default of 5.',
    tol: 'Entered optional resistor tolerance, a percent or fraction such as "1%" or "0.01" (at most 40 characters). Absent means no tolerance envelope.',
    vtol: 'Entered optional Vref tolerance, a percent or fraction such as "1%" (at most 40 characters). Absent means none.',
    ib: 'Entered optional FB pin bias current magnitude, for example "50 nA" (at most 40 characters). Needs a direction.',
    bd: 'Direction of the FB bias current: "into-pin" or "out-of-pin". Absent means not chosen: there is no default, and a bias current gives no result without it.',
  },
  'led-resistor': {
    vs: 'Entered supply voltage text, for example "5 V" (at most 40 characters).',
    vf: 'Entered forward voltage of ONE LED from its datasheet, for example "2.1 V" (at most 40 characters). Absent means not entered: required, never pre-filled.',
    i: 'Entered target LED current text, for example "10 mA" (at most 40 characters).',
    n: 'Entered number of LEDs in series, a whole number from 1 (at most 40 characters). Absent means 1.',
    se: 'E-series the resistor is rounded UP to: "none", "E6", "E12", "E24", "E48", "E96" or "E192". Absent means none (exact value).',
    pr: 'Entered optional rated power of the resistor you will use, for example "250 mW" (at most 40 characters). Absent means the rating is not checked.',
  },
  'rc-lc': {
    fm: 'Circuit family: "rc" or "lc". Absent means not chosen: there is no default and no result without it.',
    r: 'Entered resistance text, for example "1 kΩ" (at most 40 characters; RC family only). Give exactly two of r, c, f; the third is solved.',
    c: 'Entered capacitance text, for example "1 µF" (at most 40 characters; both families).',
    l: 'Entered inductance text, for example "10 µH" (at most 40 characters; LC family only).',
    f: 'Entered frequency text, for example "1 kHz" (at most 40 characters): the cut-off frequency fc (RC) or the resonant frequency f0 (LC).',
  },
  reactance: {
    kd: 'Kind of reactance: "inductive" or "capacitive". Absent means not chosen: there is no default and no result without it.',
    x: 'Entered reactance MAGNITUDE text, for example "6.28 Ω" (at most 40 characters). Give exactly two of x, f, cv; the third is solved.',
    f: 'Entered frequency text, for example "1 kHz" (at most 40 characters).',
    cv: 'Entered component value text: the inductance for inductive, the capacitance for capacitive, for example "1 mH" or "100 nF" (at most 40 characters).',
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
