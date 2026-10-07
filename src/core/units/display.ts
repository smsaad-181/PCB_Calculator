import { DIM, dimEqual, type Dim } from './dim';
import { InvalidValueError } from './errors';
import { formatQuantity } from './format';
import { type Quantity } from './quantity';
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

export interface FormatForOptions {
  readonly prefs?: DisplayPrefs;
  readonly accuracyClass?: AccuracyClass;
  /** Explicit display unit (overrides prefs; no prefix selection). */
  readonly unit?: string;
}

/** Display unit for a dimension: `unit` is the units-table spelling used for conversion, `label` what is printed. */
interface Plain {
  readonly unit: string;
  readonly label: string;
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
      ? { unit: 'mil', label: 'mil' }
      : prefs.length === 'um'
        ? { unit: 'um', label: 'µm' }
        : { unit: 'mm', label: 'mm' };
  }
  if (dimEqual(dim, DIM.AREA)) {
    return prefs.area === 'mil2' ? { unit: 'mil2', label: `mil${SQ}` } : { unit: 'mm2', label: `mm${SQ}` };
  }
  if (dimEqual(dim, DIM.ABS_TEMPERATURE)) {
    return prefs.temperature === 'K'
      ? { unit: 'K', label: 'K' }
      : prefs.temperature === 'F'
        ? { unit: '°F', label: `${DEG}F` }
        : { unit: '°C', label: `${DEG}C` };
  }
  if (dimEqual(dim, DIM.TEMPERATURE_DIFFERENCE)) {
    return prefs.temperature === 'K'
      ? { unit: 'ΔK', label: `${DELTA}K` }
      : prefs.temperature === 'F'
        ? { unit: 'Δ°F', label: `${DELTA}${DEG}F` }
        : { unit: 'Δ°C', label: `${DELTA}${DEG}C` };
  }
  if (dimEqual(dim, DIM.AREAL_MASS)) return { unit: 'oz/ft2', label: `oz/ft${SQ}` };
  if (dimEqual(dim, DIM.THERMAL_RESISTANCE)) return { unit: 'K/W', label: 'K/W' };
  if (dimEqual(dim, DIM.THERMAL_CONDUCTIVITY)) return { unit: 'W/mK', label: 'W/(m·K)' };
  if (dimEqual(dim, DIM.PER_KELVIN)) return { unit: '/K', label: '/K' };
  if (dimEqual(dim, DIM.CURRENT_DENSITY)) return { unit: 'A/mm2', label: `A/mm${SQ}` };
  return undefined;
}

function round(v: number, sig: number): number {
  return Number(v.toPrecision(sig));
}

function engineering(x: Quantity, e: Engineering, sig: number): string {
  const base = round(x.si * e.factor, sig);
  let prefix = '';
  let value = base;
  if (base !== 0) {
    const a = Math.abs(base);
    let i = 4;
    while (i < e.maxStep && a >= (STEP_SCALE[i + 1] as number)) i++;
    while (i > 0 && a < (STEP_SCALE[i] as number)) i--;
    prefix = STEP_SYMBOL[i] as string;
    value = round(base / (STEP_SCALE[i] as number), sig);
  }
  return `${String(value)} ${prefix}${e.symbol}`;
}

/**
 * Format for display. The unit follows the dimension and the user's prefs (length mm/mil/um, temperature C/K/F,
 * area mm2/mil2); electrical dimensions get an engineering prefix. Significant figures follow the accuracy class
 * (default 6). Rounding happens before prefix choice so 999.9996 rolls over to the next prefix.
 * Throws InvalidValueError on non-finite input. Dimensions without a display rule use formatQuantity.
 */
export function formatFor(x: Quantity, opts: FormatForOptions = {}): string {
  if (!Number.isFinite(x.si)) throw new InvalidValueError('Cannot format a non-finite quantity');
  const sig = opts.accuracyClass === undefined ? 6 : sigFigsFor(opts.accuracyClass);
  if (opts.unit !== undefined) return `${String(round(toUnit(x, opts.unit), sig))} ${opts.unit}`;

  const plain = plainFor(x.dim, opts.prefs ?? DEFAULT_DISPLAY_PREFS);
  if (plain !== undefined) return `${String(round(toUnit(x, plain.unit), sig))} ${plain.label}`;

  for (const [dim, e] of ENGINEERING) {
    if (dimEqual(dim, x.dim)) return engineering(x, e, sig);
  }
  if (dimEqual(x.dim, DIM.DIMENSIONLESS)) return String(round(x.si, sig));
  return formatQuantity(x, { sig });
}
