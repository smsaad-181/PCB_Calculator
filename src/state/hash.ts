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

export interface ParsedHash {
  readonly route: Route;
  /** Calculator state; empty when absent, corrupt, or from another schema version. */
  readonly state: HashState;
  /** True when a state section was present but discarded (version mismatch or corrupt). */
  readonly stateDiscarded: boolean;
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

export function parseHash(hash: string): ParsedHash {
  let raw = typeof hash === 'string' ? hash : '';
  if (raw.startsWith('#')) raw = raw.slice(1);
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q + 1) : '';
  const route = parseRoute(path);
  if (query === '') return { route, state: {}, stateDiscarded: false };
  if (raw.length > MAX_HASH_LENGTH) return { route, state: {}, stateDiscarded: true };
  // Count '&' separators with early abort, before any decoding.
  let keyCount = 1;
  for (let i = query.indexOf('&'); i >= 0; i = query.indexOf('&', i + 1)) {
    if (++keyCount > MAX_STATE_KEYS) return { route, state: {}, stateDiscarded: true };
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
  if (corrupt || version !== String(HASH_SCHEMA_VERSION)) {
    return { route, state: {}, stateDiscarded: true };
  }
  return { route, state: { ...state }, stateDiscarded: false };
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
  const keys = Object.keys(state)
    .filter((k) => k !== 'v')
    .sort();
  const base = `#${serializeRoute(route)}`;
  if (route.name !== 'calc' || keys.length === 0) return base;
  const parts = [`v=${HASH_SCHEMA_VERSION}`];
  for (const k of keys) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(state[k] ?? '')}`);
  return `${base}?${parts.join('&')}`;
}
