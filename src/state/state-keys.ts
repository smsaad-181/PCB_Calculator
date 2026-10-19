// Names-only runtime table of calculator-local hash state keys (descriptions live in ./state-key-docs.ts, test/doc only).
// A local key must never reuse a reserved key or `v`. state-keys.test.ts asserts this table matches the documented one.
export const CALCULATOR_STATE_KEY_NAMES: Readonly<Record<string, readonly string[]>> = {
  'copper-converter': ['by', 'w', 't', 'ly', 'conv', 'pl', 'tb', 'wsrc'],
  'trace-width': ['sf', 'w', 'i', 'dt', 'ly', 'cs', 'cw', 'ct', 'cb', 'wsrc', 'conv', 'am', 'dm', 'cd', 'mt', 'tcur', 'trise', 'twid', 'tthk', 'tkch', 'tamb', 'twpf', 'cm', 'ip', 'du', 'pt', 'lc'],
  'trace-resistance': ['l', 'w', 'ly', 'cs', 'cw', 'ct', 'cb', 'wsrc', 'conv', 'am', 'dt', 'rho', 'al', 'f', 'i', 'tlen', 'twid', 'tthk', 'tkch', 'tamb', 'trho', 'tcur'],
  'self-heating': ['law', 'l', 'w', 'ly', 'cs', 'cw', 'ct', 'cb', 'wsrc', 'conv', 'am', 'cm', 'i', 'ip', 'du', 'pt', 'thby', 'th', 'tl'],
  'ohm-power': ['vo', 'i', 'r', 'p'],
  'resistor-divider': ['sf', 'vi', 'r1', 'r2', 'tg', 'rl', 'tol', 'vtol', 'ltol', 'vr', 'se', 'sn'],
  'voltage-drop': ['vs', 'lk', 'lv', 'rp', 'db', 'tc', 'conv', 'fe1', 'fe2', 'fe3', 'fe4', 'fe5', 'fe6', 're1', 're2', 're3', 're4', 're5', 're6'],
  'path-load': ['vs', 'lk', 'lv', 'rp', 'db', 'tc', 'conv', 'lc', 'fe1', 'fe2', 'fe3', 'fe4', 'fe5', 'fe6', 'fe7', 'fe8', 'fe9', 'fe10', 'fe11', 'fe12', 're1', 're2', 're3', 're4', 're5', 're6', 're7', 're8', 're9', 're10', 're11', 're12'],
  via: ['d', 't', 'l', 'n', 'i', 'tc', 'rho', 'km', 'tdia', 'tpla', 'tlen', 'trho', 'ttmp', 'tcur'],
  'annular-ring': ['pd', 'hd', 'ht', 'rr', 'dd', 'pl', 'lc', 'cw', 'ls', 'th', 'tp', 'ts', 'mn', 'rc'],
  'e-series': ['nt', 'ns', 'pt', 'pk', 'ps'],
  'feedback-divider': ['vr', 'vs', 'r1', 'r2', 'vo', 'se', 'sn', 'pc', 'tol', 'vtol', 'ib', 'bd'],
  'led-resistor': ['vs', 'vf', 'i', 'n', 'se', 'pr'],
  'rc-lc': ['fm', 'r', 'c', 'l', 'f'],
  reactance: ['kd', 'x', 'f', 'cv'],
  microstrip: ['sf', 'w', 'z', 'h', 't', 'er', 'es', 'gs', 'tm', 'f', 'l', 'dl', 'kw', 'kh', 'ke', 'kt', 'td', 'ds', 'rho', 'pw', 'lc', 'ls', 'cw'],
  stripline: ['sf', 'w', 'z', 'b', 't', 'er', 'es', 'gs', 'tm', 'f', 'l', 'dl', 'kw', 'kh', 'ke', 'kt', 'td', 'ds', 'rho', 'pw', 'lc', 'ls', 'cw'],
  coax: ['sf', 'od', 'id', 'z', 'er', 'es', 'f', 'l', 'dl', 'ko', 'ki', 'ke', 'td', 'ds', 'rho'],
  'diff-microstrip': ['sf', 'w', 's', 'z', 'h', 't', 'er', 'es', 'gs', 'f', 'l', 'dl', 'pr', 'tl', 'kw', 'ks', 'kh', 'ke', 'td', 'ds', 'rho', 'pw', 'ps', 'lc', 'ls', 'cw'],
  'diff-stripline': ['sf', 'w', 's', 'z', 'b', 't', 'er', 'es', 'gs', 'f', 'l', 'dl', 'pr', 'tl', 'kw', 'ks', 'kh', 'ke', 'td', 'ds', 'rho', 'pw', 'ps', 'lc', 'ls', 'cw'],
  cpw: ['sf', 'w', 's', 'z', 'h', 't', 'er', 'es', 'gs', 'f', 'l', 'dl', 'kw', 'ks', 'kh', 'ke', 'td', 'ds', 'rho', 'pw', 'ps', 'lc', 'ls', 'cw'],
  cpwg: ['sf', 'w', 's', 'z', 'h', 't', 'er', 'es', 'gs', 'f', 'l', 'dl', 'kw', 'ks', 'kh', 'ke', 'td', 'ds', 'rho', 'pw', 'ps', 'lc', 'ls', 'cw'],
  'quarter-wave': ['ee', 'md', 'f', 'l', 'es'],
  clearance: ['ed', 'it', 'rt', 'iv', 'oc', 'sv', 'pd', 'fld', 'alt', 'vm', 'vp', 'vr', 'ws', 'wb', 'wv', 'fq', 'cc', 'sm'],
  creepage: ['ed', 'it', 'pd', 'mt', 'mg', 'cti', 'sf', 'ac', 'gr', 'alt', 'vm', 'vp', 'vr', 'ws', 'wb', 'wv', 'fq', 'cc', 'sm'],
  'ipc-spacing': ['ed', 'lc', 'ck', 'co', 'el', 'eh', 'vm', 'vp', 'vr', 'ws', 'wb', 'wv'],
  'thermal-via': ['d', 'db', 't', 'l', 'n', 'km', 'fl', 'kf', 'p', 'ps'],
  fusing: ['gm', 'a', 'dw', 'w', 'th', 'tb', 'cv', 'vd', 'vp', 'ta', 'te', 'pm', 'i', 'tp', 'it', 'cp'],
};

/** Local state key names of one calculator (a fresh array; empty for an unknown id). */
export function stateKeyNames(id: string): string[] {
  return [...(CALCULATOR_STATE_KEY_NAMES[id] ?? [])];
}
