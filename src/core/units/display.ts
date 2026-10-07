import { DIM, dimEqual, type Dim } from './dim';
import { InvalidValueError } from './errors';
import { formatQuantity } from './format';
import { parseQuantity } from './parse';
import { q, type Quantity } from './quantity';
import { toUnit } from './units-table';

/** User display preferences. Conversion happens here, at the boundary; quantities stay SI. */
export interface DisplayPrefs {
  readonly length: 'mm' | 'mil' | 'um';
  readonly temperature: 'C' | 'K' | 'F';
  readonly area: 'mm2' | 'mil2';
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = Object.freeze({ length: 'mm', temperature: 'C', area: 'mm2' });

/** Method accuracy class, mirrored from the CalcResult confidence rules. */
export type AccuracyClass = 'exact' | 'analytical' | 'empirical' | 'estimate';

/** Significant figures shown per accuracy class: never more digits than the method supports (false-precision guard). */
export function sigFigsFor(accuracyClass: AccuracyClass): number {
  switch (accuracyClass) {
    case 'exact':
      return 6;
    case 'analytical':
      return 4;
    case 'empirical':
      return 3;
    default:
      return 2;
  }
}

/** Direction a displayed number is rounded: 'up' never prints below the SI value, 'down' never above (toward +/- Infinity). */
export type RoundDirection = 'up' | 'down' | 'nearest';

/** Role of a result: a minimum requirement or a predicted stress rounds up, a capacity rounds down, a nominal to nearest. */
export function roundDirectionFor(bound: 'min-requirement' | 'max-capacity' | 'nominal' | 'prediction'): RoundDirection {
  switch (bound) {
    case 'min-requirement':
    case 'prediction':
      return 'up';
    case 'max-capacity':
      return 'down';
    default:
      return 'nearest';
  }
}

export interface FormatForOptions {
  readonly prefs?: DisplayPrefs;
  readonly accuracyClass?: AccuracyClass;
  /** Explicit display unit (overrides prefs; no prefix selection). */
  readonly unit?: string;
  /** Rounding direction (default 'nearest'). */
  readonly round?: RoundDirection;
}

/** Display unit for a dimension: `unit` is the units-table spelling used for conversion, `label` what is printed. */
interface Plain {
  readonly unit: string;
  readonly label: string;
  /** Fixed decimals (fab resolution) for geometry and temperature; undefined means significant figures by accuracy class. */
  readonly decimals?: number;
}

/** Engineering-prefixed dimension: value is shown in prefix + symbol, `factor` converts SI to the symbol's unit. */
interface Engineering {
  readonly symbol: string;
  readonly factor: number;
  /** Highest prefix index usable (index into STEP_*); mass stops at grams so "kg" never appears. */
  readonly maxStep: number;
}

const STEP_SCALE = [1e-12, 1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e9] as const;
const STEP_SYMBOL = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G'] as const;

const OHM = 'Ω';
const ENGINEERING: ReadonlyArray<readonly [Dim, Engineering]> = [
  [DIM.RESISTANCE, { symbol: OHM, factor: 1, maxStep: 7 }],
  [DIM.RESISTIVITY, { symbol: `${OHM}·m`, factor: 1, maxStep: 7 }],
  [DIM.CURRENT, { symbol: 'A', factor: 1, maxStep: 7 }],
  [DIM.VOLTAGE, { symbol: 'V', factor: 1, maxStep: 7 }],
  [DIM.POWER, { symbol: 'W', factor: 1, maxStep: 7 }],
  [DIM.FREQUENCY, { symbol: 'Hz', factor: 1, maxStep: 7 }],
  [DIM.CAPACITANCE, { symbol: 'F', factor: 1, maxStep: 7 }],
  [DIM.INDUCTANCE, { symbol: 'H', factor: 1, maxStep: 7 }],
  [DIM.TIME, { symbol: 's', factor: 1, maxStep: 7 }],
  [DIM.MASS, { symbol: 'g', factor: 1000, maxStep: 4 }],
];

const DEG = '°';
const DELTA = 'Δ';
const SQ = '²';

/** Fixed (non-prefixed) display unit for the dimension under the given prefs, or undefined. */
function plainFor(dim: Dim, prefs: DisplayPrefs): Plain | undefined {
  if (dimEqual(dim, DIM.LENGTH)) {
    return prefs.length === 'mil'
      ? { unit: 'mil', label: 'mil', decimals: 2 }
      : prefs.length === 'um'
        ? { unit: 'um', label: 'µm', decimals: 1 }
        : { unit: 'mm', label: 'mm', decimals: 3 };
  }
  if (dimEqual(dim, DIM.AREA)) {
    return prefs.area === 'mil2'
      ? { unit: 'mil2', label: `mil${SQ}`, decimals: 2 }
      : { unit: 'mm2', label: `mm${SQ}`, decimals: 4 };
  }
  if (dimEqual(dim, DIM.ABS_TEMPERATURE)) {
    return prefs.temperature === 'K'
      ? { unit: 'K', label: 'K', decimals: 1 }
      : prefs.temperature === 'F'
        ? { unit: '°F', label: `${DEG}F`, decimals: 1 }
        : { unit: '°C', label: `${DEG}C`, decimals: 1 };
  }
  if (dimEqual(dim, DIM.TEMPERATURE_DIFFERENCE)) {
    return prefs.temperature === 'K'
      ? { unit: 'ΔK', label: `${DELTA}K`, decimals: 1 }
      : prefs.temperature === 'F'
        ? { unit: 'Δ°F', label: `${DELTA}${DEG}F`, decimals: 1 }
        : { unit: 'Δ°C', label: `${DELTA}${DEG}C`, decimals: 1 };
  }
  if (dimEqual(dim, DIM.AREAL_MASS)) return { unit: 'oz/ft2', label: `oz/ft${SQ}` };
  if (dimEqual(dim, DIM.THERMAL_RESISTANCE)) return { unit: 'K/W', label: 'K/W' };
  if (dimEqual(dim, DIM.THERMAL_CONDUCTIVITY)) return { unit: 'W/mK', label: 'W/(m·K)' };
  if (dimEqual(dim, DIM.PER_KELVIN)) return { unit: '/K', label: '/K' };
  if (dimEqual(dim, DIM.CURRENT_DENSITY)) return { unit: 'A/mm2', label: `A/mm${SQ}` };
  return undefined;
}

/** Fixed decimals for an explicit display unit, or undefined (significant figures). */
function decimalsForUnit(dim: Dim, unit: string): number | undefined {
  if (dim.kind === 'absTemp' || dim.kind === 'deltaT') return 1;
  if (dimEqual(dim, DIM.LENGTH)) return unit === 'mm' ? 3 : unit === 'mil' ? 2 : unit === 'um' || unit === 'µm' ? 1 : undefined;
  if (dimEqual(dim, DIM.AREA)) return unit === 'mm2' ? 4 : unit === 'mil2' ? 2 : undefined;
  return undefined;
}

/** Nearest to `sig` significant figures. */
function round(v: number, sig: number): number {
  return Number(v.toPrecision(sig));
}

/** Decade (floor of log10) of a positive finite number, corrected for log10 noise at exact powers of ten. */
function decadeOf(a: number): number {
  let e = Math.floor(Math.log10(a));
  if (10 ** (e + 1) <= a) e++;
  else if (10 ** e > a) e--;
  return e;
}

const MAX_DEC = 60;

/** Integer n for v*10^dec rounded in direction dir; `snapped` when v sits on the grid up to float noise. */
function stepsOf(v: number, dec: number, dir: 'up' | 'down'): { n: number; snapped: boolean } {
  const s = dec >= 0 ? v * 10 ** dec : v / 10 ** -dec;
  const r = Math.round(s);
  if (Math.abs(s - r) <= 1e-9 * Math.abs(s)) return { n: r, snapped: true };
  return { n: dir === 'up' ? Math.ceil(s) : Math.floor(s), snapped: false };
}

function textOfSteps(n: number, dec: number): string {
  if (n === 0) return '0';
  if (Math.abs(n) >= 2 ** 53) {
    // beyond exact integer range of the step count: build the decimal from the exact integer digits
    const neg = n < 0;
    let d = BigInt(Math.abs(n)).toString();
    if (dec <= 0) d += '0'.repeat(-dec);
    else {
      d = d.padStart(dec + 1, '0');
      d = `${d.slice(0, d.length - dec)}.${d.slice(d.length - dec)}`.replace(/\.?0+$/, '');
    }
    return neg ? `-${d}` : d;
  }
  if (dec <= 0) return String(n * 10 ** -dec);
  const t = (n / 10 ** dec).toFixed(dec);
  return t.includes('.') ? t.replace(/\.?0+$/, '') : t;
}

/**
 * Directional decimal text of v (display-unit value) at `dec` decimals. When v is on the grid within float noise,
 * the printed text is parsed back and, if it crosses the SI value, stepped one place the safe way (exactness).
 */
function directedText(si: number, dim: Dim, v: number, dec: number, dir: 'up' | 'down', mk: (num: string) => string): string {
  const first = stepsOf(v, dec, dir);
  let n = first.n;
  let text = mk(textOfSteps(n, dec));
  if (first.snapped || Math.abs(n) >= 2 ** 50) {
    let step = 1;
    for (let i = 0; i < 64; i++) {
      const r = parseQuantity(text, dim);
      if (!r.ok || (dir === 'up' ? r.value.si >= si : r.value.si <= si)) break;
      n += dir === 'up' ? step : -step;
      step *= 2;
      text = mk(textOfSteps(n, dec));
    }
  }
  return text;
}

/** v rounded to sig figures in direction dir (no text, no verification); used to choose the prefix. */
function directedValue(v: number, sig: number, dir: 'up' | 'down'): number {
  if (v === 0) return 0;
  const dec = sig - 1 - decadeOf(Math.abs(v));
  if (dec > MAX_DEC || dec < -MAX_DEC) return round(v, sig);
  const { n } = stepsOf(v, dec, dir);
  return dec >= 0 ? n / 10 ** dec : n * 10 ** -dec;
}

/** Unprefixed number: fixed decimals if given, else significant figures; direction applied. */
function plainText(x: Quantity, v: number, decimals: number | undefined, sig: number, dir: RoundDirection, label: string, unit: string): string {
  const text = plainRaw(x, v, decimals, sig, dir, label);
  // Next to absolute zero a nearest/down print could land below 0 K: clamp to absolute zero in the display unit.
  if (dir !== 'up' && x.dim.kind === 'absTemp' && x.si < 1 && !parseQuantity(text, x.dim).ok) {
    return `${String(Number(toUnit(q(0, x.dim), unit).toFixed(2)))} ${label}`;
  }
  return text;
}

function plainRaw(x: Quantity, v: number, decimals: number | undefined, sig: number, dir: RoundDirection, label: string): string {
  if (dir === 'nearest') {
    const n = decimals === undefined ? round(v, sig) : Number(v.toFixed(decimals));
    return `${String(n)} ${label}`;
  }
  const mk = (num: string): string => `${num} ${label}`;
  if (v === 0) return mk('0');
  const dec = decimals ?? sig - 1 - decadeOf(Math.abs(v));
  if (dec > MAX_DEC || dec < -MAX_DEC) return mk(String(round(v, sig)));
  return directedText(x.si, x.dim, v, dec, dir, mk);
}

function engineering(x: Quantity, e: Engineering, sig: number, dir: RoundDirection): string {
  const raw = x.si * e.factor;
  const base = dir === 'nearest' ? round(raw, sig) : directedValue(raw, sig, dir);
  let prefix = '';
  let scale = 1;
  if (base !== 0) {
    const a = Math.abs(base);
    let i = 4;
    while (i < e.maxStep && a >= (STEP_SCALE[i + 1] as number)) i++;
    while (i > 0 && a < (STEP_SCALE[i] as number)) i--;
    prefix = STEP_SYMBOL[i] as string;
    scale = STEP_SCALE[i] as number;
  }
  const label = `${prefix}${e.symbol}`;
  if (dir === 'nearest') return `${String(base === 0 ? 0 : round(base / scale, sig))} ${label}`;
  if (raw === 0) return `0 ${label}`;
  const u = raw / scale;
  const dec = sig - 1 - decadeOf(Math.abs(u));
  if (dec > MAX_DEC || dec < -MAX_DEC) return `${String(round(u, sig))} ${label}`;
  return directedText(x.si, x.dim, u, dec, dir, (num) => `${num} ${label}`);
}

/**
 * Format for display. The unit follows the dimension and the user's prefs (length mm/mil/um, temperature C/K/F,
 * area mm2/mil2); electrical dimensions get an engineering prefix. Geometry (length, area) and temperatures print at
 * fixed fab resolution regardless of accuracy class (mm 3, mil 2, um 1, mm2 4, mil2 2 decimals, temperature 1);
 * every other dimension uses significant figures by accuracy class (default 6). `round` sets the direction (default
 * 'nearest'): 'up' never prints below the SI value and 'down' never above it, also across prefix roll-over.
 * Throws InvalidValueError on non-finite input. Dimensions without a display rule use formatQuantity.
 */
export function formatFor(x: Quantity, opts: FormatForOptions = {}): string {
  if (!Number.isFinite(x.si)) throw new InvalidValueError('Cannot format a non-finite quantity');
  const sig = opts.accuracyClass === undefined ? 6 : sigFigsFor(opts.accuracyClass);
  const dir = opts.round ?? 'nearest';
  if (opts.unit !== undefined) {
    return plainText(x, toUnit(x, opts.unit), decimalsForUnit(x.dim, opts.unit), sig, dir, opts.unit, opts.unit);
  }

  const plain = plainFor(x.dim, opts.prefs ?? DEFAULT_DISPLAY_PREFS);
  if (plain !== undefined) return plainText(x, toUnit(x, plain.unit), plain.decimals, sig, dir, plain.label, plain.unit);

  for (const [dim, e] of ENGINEERING) {
    if (dimEqual(dim, x.dim)) return engineering(x, e, sig, dir);
  }
  if (dimEqual(x.dim, DIM.DIMENSIONLESS)) return plainText(x, x.si, undefined, sig, dir, '', '').trimEnd();
  return formatQuantity(x, { sig });
}

export interface FormatDualOptions {
  readonly prefs?: DisplayPrefs;
  readonly round?: RoundDirection;
  readonly accuracyClass?: AccuracyClass;
}

/** Length as "<mm> (<mil>)", area as "<mm²> (<mil²>)", each part rounded from the SI value; other dimensions as formatFor. */
export function formatDual(x: Quantity, opts: FormatDualOptions = {}): string {
  if (!dimEqual(x.dim, DIM.LENGTH) && !dimEqual(x.dim, DIM.AREA)) return formatFor(x, opts);
  const base = {
    ...(opts.round === undefined ? {} : { round: opts.round }),
    ...(opts.accuracyClass === undefined ? {} : { accuracyClass: opts.accuracyClass }),
  };
  const metric: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, length: 'mm', area: 'mm2' };
  const imperial: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, length: 'mil', area: 'mil2' };
  return `${formatFor(x, { ...base, prefs: metric })} (${formatFor(x, { ...base, prefs: imperial })})`;
}
