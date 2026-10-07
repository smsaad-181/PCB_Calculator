import { DIM, dimEqual, describeDim, type Dim } from './dim';
import { DimensionError, InvalidValueError, UnitError } from './errors';
import { assertFinite, q, type Quantity } from './quantity';

/**
 * Unit definitions. Conversion: si = (value + pre) * scale + post.
 * ledgerIds point at docs/sources/LEDGER.md rows. Definitional exact SI factors are still tagged
 * (S-006: inch = 0.0254 m, foot = 0.3048 m, avoirdupois ounce = 0.028349523125 kg, F -> K).
 */
export interface UnitDef {
  readonly symbol: string;
  readonly dim: Dim;
  readonly scale: number;
  readonly pre: number;
  readonly post: number;
  /** SI prefixes may be attached (e.g. m -> mm, kHz). */
  readonly prefixable: boolean;
  readonly ledgerIds: readonly string[];
}

export const INCH_M = 0.0254; // exact [S-006]
export const FOOT_M = 0.3048; // exact [S-006]
export const OUNCE_KG = 0.028349523125; // exact [S-006]
export const OZ_PER_FT2_KG_M2 = OUNCE_KG / (FOOT_M * FOOT_M); // [S-006]
export const KELVIN_AT_0C = 273.15; // [S-006]
export const MIL_M = INCH_M / 1000; // exact [S-006]

const NO_LEDGER: readonly string[] = [];
const S006: readonly string[] = ['S-006'];
const S006_S003: readonly string[] = ['S-006', 'S-003'];

const DEFS = new Map<string, UnitDef>();

function def(
  symbols: readonly string[],
  dim: Dim,
  scale: number,
  opts: { prefixable?: boolean; pre?: number; post?: number; ledgerIds?: readonly string[] } = {},
): void {
  for (const symbol of symbols) {
    DEFS.set(symbol, {
      symbol,
      dim,
      scale,
      pre: opts.pre ?? 0,
      post: opts.post ?? 0,
      prefixable: opts.prefixable ?? false,
      ledgerIds: opts.ledgerIds ?? NO_LEDGER,
    });
  }
}

const OHM_SYMBOLS = ['Ω', 'Ω', 'ohm', 'Ohm', 'ohms', 'Ohms'] as const; // Greek capital omega, OHM SIGN, ascii spellings

// Length
def(['m'], DIM.LENGTH, 1, { prefixable: true });
def(['cm'], DIM.LENGTH, 1e-2);
def(['in', 'inch'], DIM.LENGTH, INCH_M, { ledgerIds: S006 });
def(['mil', 'mils', 'thou'], DIM.LENGTH, MIL_M, { ledgerIds: S006 }); // 1 mil = 25.4 um exactly
def(['ft'], DIM.LENGTH, FOOT_M, { ledgerIds: S006 });
// Area
def(['m2', 'm²'], DIM.AREA, 1);
def(['cm2', 'cm²'], DIM.AREA, 1e-4);
def(['mm2', 'mm²'], DIM.AREA, 1e-6);
def(['mil2', 'mil²', 'sq mil', 'sqmil'], DIM.AREA, MIL_M * MIL_M, { ledgerIds: S006 });
def(['in2', 'in²', 'sq in'], DIM.AREA, INCH_M * INCH_M, { ledgerIds: S006 });
// Mass, time, electrical, frequency
def(['g'], DIM.MASS, 1e-3, { prefixable: true });
def(['oz'], DIM.MASS, OUNCE_KG, { ledgerIds: S006 });
def(['s'], DIM.TIME, 1, { prefixable: true });
def(['A'], DIM.CURRENT, 1, { prefixable: true });
def(['V'], DIM.VOLTAGE, 1, { prefixable: true });
def(OHM_SYMBOLS, DIM.RESISTANCE, 1, { prefixable: true });
def(['W'], DIM.POWER, 1, { prefixable: true });
def(['Hz'], DIM.FREQUENCY, 1, { prefixable: true });
def(['F'], DIM.CAPACITANCE, 1, { prefixable: true });
def(['H'], DIM.INDUCTANCE, 1, { prefixable: true });
// Absolute temperature (offset) [S-006]
def(['K'], DIM.ABS_TEMPERATURE, 1);
def(['°C', 'degC'], DIM.ABS_TEMPERATURE, 1, { post: KELVIN_AT_0C, ledgerIds: S006 });
def(['°F', 'degF'], DIM.ABS_TEMPERATURE, 5 / 9, { pre: -32, post: KELVIN_AT_0C, ledgerIds: S006 });
// Temperature difference (no offset) [S-006]
def(['ΔK', 'dK'], DIM.TEMPERATURE_DIFFERENCE, 1);
def(['Δ°C', 'ΔdegC', 'ddegC'], DIM.TEMPERATURE_DIFFERENCE, 1, { ledgerIds: S006 });
def(['Δ°F', 'ΔdegF', 'ddegF'], DIM.TEMPERATURE_DIFFERENCE, 5 / 9, { ledgerIds: S006 });
// Areal mass (copper foil weight is oz/ft2) [S-006 factors; S-003 for the foil-thickness convention]
def(['oz/ft2', 'oz/ft²'], DIM.AREAL_MASS, OZ_PER_FT2_KG_M2, { ledgerIds: S006_S003 });
// Compound units (no prefixes; the unit text is matched exactly)
def(['K/W', '°C/W', 'degC/W'], DIM.THERMAL_RESISTANCE, 1);
def(['W/mK', 'W/(mK)', 'W/m·K', 'W/(m·K)', 'W/m.K'], DIM.THERMAL_CONDUCTIVITY, 1);
def(['/K', '1/K', '/°C', '1/°C', '/degC', '1/degC'], DIM.PER_KELVIN, 1);
def(['ppm/K', 'ppm/°C', 'ppm/degC'], DIM.PER_KELVIN, 1e-6);
def(['%'], DIM.DIMENSIONLESS, 0.01);
def(['ppm'], DIM.DIMENSIONLESS, 1e-6);
def(['A/m2', 'A/m²'], DIM.CURRENT_DENSITY, 1);
def(['A/cm2', 'A/cm²'], DIM.CURRENT_DENSITY, 1e4);
def(['A/mm2', 'A/mm²'], DIM.CURRENT_DENSITY, 1e6);
def(['kg/m2', 'kg/m²'], DIM.AREAL_MASS, 1);
def(['g/m2', 'g/m²'], DIM.AREAL_MASS, 1e-3);

/** SI prefixes accepted by parse. `u` and the Greek mu are accepted as the micro sign. Case-sensitive. */
export const PREFIX_SCALE: ReadonlyMap<string, number> = new Map([
  ['p', 1e-12],
  ['n', 1e-9],
  ['µ', 1e-6],
  ['μ', 1e-6],
  ['u', 1e-6],
  ['m', 1e-3],
  ['k', 1e3],
  ['M', 1e6],
  ['G', 1e9],
]);

const prefixed = new Map<string, UnitDef>(); // hits only (bounded), misses are never cached

/** Length factors allowed after the separator in a resistivity unit (ohm.m, uohm.cm). */
const RESISTIVITY_LENGTH = new Map<string, number>([
  ['m', 1],
  ['cm', 1e-2],
  ['mm', 1e-3],
]);

function isResistivitySeparator(c: string): boolean {
  return c === '·' || c === '.' || c === '*' || c === '-' || c === ' ';
}

/** "ohm.m", "µΩ·cm", "Ω m": a resistance unit, one separator, then a length unit. Undefined if the text is not of that form. */
function resolveResistivity(name: string): UnitDef | undefined {
  for (let i = 1; i < name.length - 1; i++) {
    if (!isResistivitySeparator(name.charAt(i))) continue;
    const per = RESISTIVITY_LENGTH.get(name.slice(i + 1));
    if (per === undefined) continue;
    const left = resolveUnit(name.slice(0, i));
    if (left === undefined || left.dim !== DIM.RESISTANCE) continue;
    return { ...left, symbol: name, dim: DIM.RESISTIVITY, scale: left.scale * per, ledgerIds: NO_LEDGER };
  }
  return undefined;
}

/** All unit definitions without prefixes (used for spelling suggestions). */
export function baseUnits(): IterableIterator<UnitDef> {
  return DEFS.values();
}

/** Resolve a unit string to its definition, or undefined. Case-sensitive. */
export function resolveUnit(name: string): UnitDef | undefined {
  const direct = DEFS.get(name);
  if (direct) return direct;
  const cached = prefixed.get(name);
  if (cached) return cached;
  if (name.length < 2) return undefined;
  const scale = PREFIX_SCALE.get(name.charAt(0));
  const base = scale === undefined ? undefined : DEFS.get(name.slice(1));
  if (scale !== undefined && base?.prefixable) {
    const made: UnitDef = { ...base, symbol: name, scale: scale * base.scale };
    prefixed.set(name, made);
    return made;
  }
  const compound = resolveResistivity(name);
  if (compound) prefixed.set(name, compound);
  return compound;
}

/** Public metadata for UI badges: dimension and ledger rows backing the unit's definition. */
export function unitInfo(name: string): { dim: Dim; ledgerIds: readonly string[] } | undefined {
  const u = resolveUnit(name);
  return u ? { dim: u.dim, ledgerIds: u.ledgerIds } : undefined;
}

function need(name: string): UnitDef {
  const u = resolveUnit(name);
  if (!u) throw new UnitError(`Unknown unit "${name}" (units are case-sensitive)`);
  return u;
}

export function applyUnit(value: number, u: UnitDef): Quantity {
  assertFinite(value, 'Value');
  const si = u.pre === 0 && u.post === 0 ? value * u.scale : (value + u.pre) * u.scale + u.post;
  if (!Number.isFinite(si)) throw new InvalidValueError(`${String(value)} ${u.symbol} overflows the representable range`);
  return q(si, u.dim);
}

/** Convert a number in `unit` into an SI Quantity. */
export function fromUnit(value: number, unit: string): Quantity {
  return applyUnit(value, need(unit));
}

/** Convert an SI Quantity into a number in `unit`. Throws DimensionError if the dimension does not match. */
export function toUnit(x: Quantity, unit: string): number {
  const u = need(unit);
  if (!dimEqual(x.dim, u.dim)) {
    throw new DimensionError(`Cannot express ${describeDim(x.dim)} in "${unit}" (${describeDim(u.dim)})`);
  }
  const v = u.pre === 0 && u.post === 0 ? x.si / u.scale : (x.si - u.post) / u.scale - u.pre;
  if (!Number.isFinite(v)) throw new InvalidValueError(`Conversion to ${unit} overflows the representable range`);
  return v;
}
