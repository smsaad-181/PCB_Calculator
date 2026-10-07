import { DIM, dimEqual, isDimensionless, type Dim } from './dim';
import { DimensionError, InvalidValueError, UnitError } from './errors';
import { q, type Quantity } from './quantity';
import { PREFIX_SCALE, applyUnit, baseUnits, resolveUnit, type UnitDef } from './units-table';

export type ParseResult =
  | { readonly ok: true; readonly value: Quantity }
  | { readonly ok: false; readonly error: Error };

const NUMBER_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/;
/** Leading digits/commas/dots of a number, used to spot a comma used as separator. */
const COMMA_RE = /^\s*[+-]?(\d[\d.,]*)/;
/** "1 000", "1 000 000" with space, no-break space, narrow no-break space or thin space as thousands separator. */
const SPACE_GROUP_RE = /^\s*[+-]?\d{1,3}(?:[ \u00A0\u202F\u2009]\d{3})+(?!\d)/;
/** Resistor / capacitor / inductor code: 4k7, 4R7, R47, 1M2, 4n7, 4u7. Group 1 sign, 2 integer part, 3 letter, 4 fraction. */
const CODE_RE = /^([+-]?)(\d*)([RkMGnuµμp])(\d+)$/;

function fail(error: Error): ParseResult {
  return { ok: false, error };
}

/** Temperature units that mean a RISE (no offset) when the field expects a temperature difference. */
const DELTA_ALIAS = new Map<string, string>([
  ['K', 'ΔK'],
  ['°C', 'Δ°C'],
  ['degC', 'Δ°C'],
  ['°F', 'Δ°F'],
  ['degF', 'Δ°F'],
]);

const CODE_SCALE = new Map<string, number>([
  ['R', 1],
  ['k', 1e3],
  ['M', 1e6],
  ['G', 1e9],
  ['n', 1e-9],
  ['u', 1e-6],
  ['µ', 1e-6],
  ['μ', 1e-6],
  ['p', 1e-12],
]);

/** Accepted unit spellings per field, for error messages. */
function acceptedUnits(dim: Dim): string | undefined {
  if (dimEqual(dim, DIM.LENGTH)) return 'mm, mil, um (µm), in, cm, m';
  if (dimEqual(dim, DIM.AREA)) return 'mm2, mil2, cm2, m2';
  if (dimEqual(dim, DIM.RESISTANCE)) return 'ohm or Ω (mΩ, kΩ, MΩ), or a code such as 4k7';
  if (dimEqual(dim, DIM.TEMPERATURE_DIFFERENCE)) return 'K, °C or °F (a rise, no offset)';
  if (dimEqual(dim, DIM.ABS_TEMPERATURE)) return 'K, °C, °F';
  if (dimEqual(dim, DIM.CAPACITANCE)) return 'pF, nF, uF (µF), mF, F, or a code such as 4n7';
  if (dimEqual(dim, DIM.INDUCTANCE)) return 'nH, uH (µH), mH, H, or a code such as 4u7';
  if (dimEqual(dim, DIM.CURRENT)) return 'A, mA, uA';
  if (dimEqual(dim, DIM.VOLTAGE)) return 'V, mV, kV';
  if (dimEqual(dim, DIM.POWER)) return 'W, mW, kW';
  if (dimEqual(dim, DIM.FREQUENCY)) return 'Hz, kHz, MHz, GHz';
  if (dimEqual(dim, DIM.AREAL_MASS)) return 'oz (copper weight, oz/ft²), oz/ft2, g/m2, kg/m2';
  if (dimEqual(dim, DIM.THERMAL_RESISTANCE)) return 'K/W';
  if (dimEqual(dim, DIM.RESISTIVITY)) return 'Ω·m, µΩ·cm';
  if (dimEqual(dim, DIM.PER_KELVIN)) return '/K, ppm/K';
  if (dimEqual(dim, DIM.CURRENT_DENSITY)) return 'A/mm2, A/m2';
  if (isDimensionless(dim)) return '%, or a plain number';
  return undefined;
}

/** True when a and b differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  const la = a.length;
  const lb = b.length;
  if (la - lb > 1 || lb - la > 1) return false;
  let i = 0;
  while (i < la && i < lb && a.charAt(i) === b.charAt(i)) i++;
  if (la === lb) return a.slice(i + 1) === b.slice(i + 1);
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Closest known unit spelling within one edit (shortest wins ties), restricted to the field when one is given. */
function suggestUnit(unit: string, expectedDim: Dim | undefined): string | undefined {
  if (unit.length < 3 || unit.length > 12) return undefined;
  let best: string | undefined;
  for (const d of baseUnits()) {
    if (d.symbol.length < 3 || d.symbol === unit) continue;
    if (expectedDim !== undefined && !dimEqual(d.dim, expectedDim)) continue;
    if (!withinOneEdit(unit, d.symbol)) continue;
    if (best === undefined || d.symbol.length < best.length) best = d.symbol;
  }
  return best;
}

function unknownUnit(unit: string, expectedDim: Dim | undefined): UnitError {
  const hint = suggestUnit(unit, expectedDim);
  if (hint !== undefined) return new UnitError(`Unknown unit "${unit}". Did you mean "${hint}"? (units are case-sensitive)`);
  const list = expectedDim === undefined ? undefined : acceptedUnits(expectedDim);
  return new UnitError(
    list === undefined
      ? `Unknown unit "${unit}" (units are case-sensitive)`
      : `Unknown unit "${unit}". Accepted units here: ${list} (units are case-sensitive)`,
  );
}

/** A comma or a space inside the number is never reinterpreted: reject with a pointer to the accepted spelling. */
function checkSeparators(s: string): ParseResult | undefined {
  const m = COMMA_RE.exec(s);
  const num = m?.[1];
  if (num !== undefined && num.includes(',')) {
    const t = s.trim();
    if (/^\d+,\d+$/.test(num)) {
      return fail(
        new InvalidValueError(
          `"${t}" uses a decimal comma or a thousands separator, which is not accepted. Use "." as the decimal point and no thousands separators, e.g. "${t.replace(',', '.')}"`,
        ),
      );
    }
    return fail(
      new InvalidValueError(
        `"${t}" contains a thousands separator or decimal comma, which is not accepted. Write the number with "." as the decimal point and no grouping`,
      ),
    );
  }
  if (SPACE_GROUP_RE.test(s)) {
    return fail(
      new InvalidValueError(
        `"${s.trim()}" contains a space as thousands separator, which is not accepted. Write the number without grouping, e.g. "1000 mm"`,
      ),
    );
  }
  return undefined;
}

function isResistanceLetter(c: string): boolean {
  return c === 'R' || c === 'k' || c === 'M' || c === 'G';
}

/** Component codes (4k7, 4R7, R47, 4n7, 4u7). Only meaningful with a field; without one the message names the field. */
function parseCode(s: string, expectedDim: Dim | undefined): ParseResult | undefined {
  const m = CODE_RE.exec(s.trim());
  if (!m) return undefined;
  const sign = m[1] as string;
  const int = m[2] as string;
  const letter = m[3] as string;
  const frac = m[4] as string;
  if (int === '' && letter !== 'R') return undefined;
  const res = isResistanceLetter(letter);
  if (expectedDim === undefined) {
    return fail(
      new UnitError(
        `"${s.trim()}" is component-code notation and needs a field: ${res ? 'resistance (4k7 = 4.7 kΩ)' : 'capacitance or inductance (4n7 = 4.7 nF or 4.7 nH)'}`,
      ),
    );
  }
  const fits = dimEqual(expectedDim, DIM.RESISTANCE)
    ? res
    : dimEqual(expectedDim, DIM.CAPACITANCE)
      ? !res
      : dimEqual(expectedDim, DIM.INDUCTANCE) && !res && letter !== 'p';
  if (!fits) return undefined;
  const si = Number(`${sign}${int === '' ? '0' : int}.${frac}`) * (CODE_SCALE.get(letter) as number);
  return { ok: true, value: q(si, expectedDim) };
}

function resolveForField(unit: string, expectedDim: Dim | undefined): UnitDef | undefined {
  if (expectedDim !== undefined) {
    if (expectedDim.kind === 'deltaT') {
      const alias = DELTA_ALIAS.get(unit);
      if (alias !== undefined) return resolveUnit(alias);
    } else if (expectedDim.kind === 'arealMass' && unit === 'oz') {
      return resolveUnit('oz/ft2');
    }
  }
  return resolveUnit(unit);
}

/**
 * Parse "10mil", "0.3 mm", "2.2uF", "1.5 kohm". Never throws; returns a Result.
 * A bare prefix with no unit ("35u", "1.5k") is accepted only when `expectedDim` supplies the unit.
 * With `expectedDim`, "1m" for a resistance means milliohm (metre does not match the expected dimension).
 * Field awareness (parse only): in a temperature-difference field K, degC and degF are RISES (degF scaled by 5/9,
 * no offset); in a copper-weight (areal mass) field bare "oz" is oz/ft2; component codes (4k7, 4n7) need their field.
 * "." is the only decimal separator; commas and space grouping are rejected, never reinterpreted.
 */
export function parseQuantity(text: string, expectedDim?: Dim): ParseResult {
  try {
    const s = String(text);
    const sep = checkSeparators(s);
    if (sep) return sep;
    const code = parseCode(s, expectedDim);
    if (code) return code;

    const m = NUMBER_RE.exec(s);
    if (!m) return fail(new InvalidValueError(`Cannot read a number from "${s}"`));
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return fail(new InvalidValueError(`"${m[1] as string}" is not a finite number`));
    const unit = m[2] as string;

    if (unit === '') {
      if (expectedDim !== undefined && isDimensionless(expectedDim)) {
        return { ok: true, value: q(value, expectedDim) };
      }
      return fail(new UnitError(`Missing unit in "${s.trim()}"`));
    }

    if (expectedDim === undefined && unit === 'oz') {
      return fail(
        new UnitError(
          'Bare "oz" is ambiguous. Did you mean "oz/ft²" (copper weight, e.g. "1 oz/ft²")? Use "oz" alone only in a mass field',
        ),
      );
    }

    const u = resolveForField(unit, expectedDim);
    if (u && (expectedDim === undefined || dimEqual(u.dim, expectedDim))) {
      return { ok: true, value: applyUnit(value, u) };
    }
    if (expectedDim !== undefined && expectedDim.kind === 'plain') {
      const scale = unit === 'R' && dimEqual(expectedDim, DIM.RESISTANCE) ? 1 : PREFIX_SCALE.get(unit);
      if (scale !== undefined) {
        const si = value * scale;
        if (!Number.isFinite(si)) return fail(new InvalidValueError(`"${s.trim()}" overflows the representable range`));
        return { ok: true, value: q(si, expectedDim) };
      }
    }
    if (u) {
      if (expectedDim !== undefined && expectedDim.kind === 'absTemp' && u.dim.kind === 'deltaT') {
        return fail(
          new DimensionError(
            `"${unit}" is a temperature difference (Δ) but this field is an absolute temperature. Remove the Δ and use K, °C or °F`,
          ),
        );
      }
      const list = expectedDim === undefined ? undefined : acceptedUnits(expectedDim);
      return fail(
        new DimensionError(
          list === undefined
            ? `Unit "${unit}" does not match the expected dimension`
            : `Unit "${unit}" does not match the expected dimension. Accepted units here: ${list}`,
        ),
      );
    }
    return fail(unknownUnit(unit, expectedDim));
  } catch (e) {
    return fail(e instanceof Error ? e : new InvalidValueError(String(e)));
  }
}
