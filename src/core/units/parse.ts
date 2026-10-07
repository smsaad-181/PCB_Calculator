import { DIM, describeDim, dimEqual, isDimensionless, type Dim } from './dim';
import { DimensionError, InvalidValueError, UnitError } from './errors';
import { q, type Quantity } from './quantity';
import { formatFor, type DisplayPrefs } from './display';
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
    if (/^[1-9]\d{0,2},\d{3}$/.test(num)) {
      return fail(
        new InvalidValueError(
          `"${t}" is ambiguous: a decimal comma and a thousands separator are both not accepted. Remove the thousands separator, or use "." as the decimal point`,
        ),
      );
    }
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


/** Fields where a bare SI prefix (number + prefix letter, no base unit) is refused: the prefix power is ambiguous. */
const BARE_PREFIX_EXAMPLES: ReadonlyArray<readonly [Dim, readonly string[]]> = [
  [DIM.LENGTH, ['mm', 'um', 'mil']],
  [DIM.AREA, ['mm2', 'cm2', 'mil2']],
  [DIM.RESISTIVITY, ['µΩ·cm', 'Ω·m']],
  [DIM.CURRENT_DENSITY, ['A/mm2', 'A/m2']],
  [DIM.PER_KELVIN, ['ppm/K', '/K']],
  [DIM.THERMAL_RESISTANCE, ['K/W']],
  [DIM.AREAL_MASS, ['oz', 'g/m2']],
  [DIM.DIMENSIONLESS, ['%', 'ppm']],
  [DIM.TEMPERATURE_DIFFERENCE, ['K', '°C']],
  [DIM.ABS_TEMPERATURE, ['K', '°C']],
  [DIM.MASS, ['g', 'oz']],
  [DIM.TIME, ['s', 'ms', 'us']],
  [DIM.THERMAL_CONDUCTIVITY, ['W/mK']],
];

function bareExamples(dim: Dim): readonly string[] | undefined {
  for (const [d, ex] of BARE_PREFIX_EXAMPLES) if (dimEqual(d, dim)) return ex;
  return undefined;
}

function bareNoField(num: string, unit: string): ParseResult {
  return fail(
    new UnitError(
      `Bare prefix "${unit}" in "${num} ${unit}" is ambiguous without a field: it needs a field (resistance ${num} ${unit}Ω, capacitance ${num} ${unit}F, ...). Write the unit, e.g. ${num} ${unit}Ω or ${num} ${unit}F`,
    ),
  );
}

function bareForField(num: string, unit: string, examples: readonly string[]): ParseResult {
  const list = examples.map((e) => `${num} ${e}`).join(', ');
  return fail(
    new UnitError(`Bare prefix "${unit}" in "${num} ${unit}" is not accepted in this field. Write the unit, e.g. ${list}`),
  );
}

const VULGAR = new Map<string, number>([
  ['½', 0.5],
  ['¼', 0.25],
  ['¾', 0.75],
  ['⅓', 1 / 3],
  ['⅔', 2 / 3],
]);
const FRACTION_OZ_RE = /^\s*(?:(\d+)\s+)?(?:(\d+)\s*\/\s*(\d+)|([½¼¾⅓⅔]))\s*oz\s*$/;

/** "1/2 oz", "½ oz", "1 1/2 oz": rejected with the decimal spelling. */
function fractionOz(s: string): ParseResult | undefined {
  const m = FRACTION_OZ_RE.exec(s);
  if (!m) return undefined;
  const whole = m[1] === undefined ? 0 : Number(m[1]);
  let frac: number;
  if (m[4] !== undefined) frac = VULGAR.get(m[4]) as number;
  else {
    const den = Number(m[3]);
    frac = den === 0 ? Number.NaN : Number(m[2]) / den;
  }
  const v = whole + frac;
  const hint = Number.isFinite(v) ? `write ${String(Number(v.toPrecision(3)))} oz` : 'write a decimal such as 0.5 oz';
  return fail(new UnitError(`Fractions are not accepted in copper weight: ${hint}`));
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
    if (expectedDim !== undefined && expectedDim.kind === 'arealMass') {
      const fr = fractionOz(s);
      if (fr) return fr;
    }
    const code = parseCode(s, expectedDim);
    if (code) return code;

    const m = NUMBER_RE.exec(s);
    if (!m) return fail(new InvalidValueError(`Cannot read a number from "${s}"`));
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return fail(new InvalidValueError(`"${m[1] as string}" is not a finite number`));
    const unit = m[2] as string;

    if (expectedDim !== undefined && unit.charCodeAt(0) === 75 && dimEqual(expectedDim, DIM.RESISTANCE)) {
      return fail(
        new UnitError(
          `"${s.trim()}": upper-case K means kelvin, not kilo. Write kilo with a lower-case k: 4k7, 10k, 10 kΩ`,
        ),
      );
    }

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
    if (!u && unit.length === 1 && PREFIX_SCALE.has(unit)) {
      if (expectedDim === undefined) return bareNoField(m[1] as string, unit);
      const examples = bareExamples(expectedDim);
      if (examples !== undefined) return bareForField(m[1] as string, unit, examples);
    }
    if (expectedDim !== undefined && expectedDim.kind === 'plain') {
      const scale = unit === 'R' && dimEqual(expectedDim, DIM.RESISTANCE) ? 1 : PREFIX_SCALE.get(unit);
      if (scale !== undefined && bareExamples(expectedDim) === undefined) {
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

export type ParseDetailed =
  | { readonly ok: true; readonly value: Quantity; readonly warnings: string[] }
  | { readonly ok: false; readonly error: Error };

function unitText(text: string): string {
  const m = NUMBER_RE.exec(String(text));
  return m ? (m[2] as string) : '';
}

/** Plausibility warnings for a value that parsed. Slow path only (called once per accepted input). */
function plausibility(text: string, v: Quantity, dim: Dim | undefined): string[] {
  const w: string[] = [];
  const d = dim ?? v.dim;
  const unit = unitText(text);
  if (dimEqual(d, DIM.CAPACITANCE)) {
    if (unit === 'MF' || unit === 'M') {
      w.push('"MF" is read as megafarad (1e6 F). On older parts "MF"/"MFD" means microfarad: write uF if that is what you mean');
    } else if (unit === 'mF' || unit === 'm') {
      w.push('"mF" is read as millifarad (1e-3 F), which is very large for a capacitor: write uF if you mean microfarad');
    }
  } else if (dimEqual(d, DIM.RESISTANCE)) {
    if (unit === 'm') w.push('"m" is read as milliohm (1e-3 ohm): write "mΩ" to be explicit, or "MΩ" for megohm');
  } else if (dimEqual(d, DIM.VOLTAGE)) {
    if (v.si >= 1000) w.push('Value is 1 kV or more: kilovolts: check that this is intended, not volts');
  } else if (dimEqual(d, DIM.LENGTH)) {
    if (v.si > 1) w.push('Length is longer than 1 m: check the unit');
  } else if (dimEqual(d, DIM.CURRENT)) {
    if (v.si > 1000) w.push('Current is above 1000 A: check the unit');
  } else if (dimEqual(d, DIM.RESISTIVITY)) {
    if (v.si < 1e-9 || v.si > 1e-3) w.push('unusual resistivity (outside 1e-9 to 1e-3 ohm.m): check the unit');
  }
  return w;
}

/** Same acceptance and values as parseQuantity, plus plausibility warnings (never changes validity). */
export function parseQuantityDetailed(text: string, expectedDim?: Dim): ParseDetailed {
  const r = expectedDim === undefined ? parseQuantity(text) : parseQuantity(text, expectedDim);
  if (!r.ok) return r;
  let warnings: string[];
  try {
    warnings = plausibility(text, r.value, expectedDim);
  } catch {
    warnings = [];
  }
  return { ok: true, value: r.value, warnings };
}

const FRACTION_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(%?)$/;

/** Duty cycle, efficiency, ratios: "50%" or "0.5". Bare numbers above 1 are ambiguous and rejected. Value in (0, 1]. */
export function parseFraction(text: string): { ok: true; value: number } | { ok: false; error: Error } {
  const bad = (e: Error): { ok: false; error: Error } => ({ ok: false, error: e });
  try {
    const t = String(text).trim();
    const m = FRACTION_RE.exec(t);
    if (!m) return bad(new InvalidValueError(`Cannot read a fraction from "${t}". Write 50% or 0.5`));
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return bad(new InvalidValueError(`"${t}" is not a finite number`));
    const pct = m[2] === '%';
    const v = pct ? n / 100 : n;
    if (!(v > 0)) return bad(new InvalidValueError(`"${t}" must be greater than 0`));
    if (!pct && n > 1) {
      return bad(
        new InvalidValueError(
          `"${t}" is ambiguous: write ${String(n)}% or ${String(Number((n / 100).toPrecision(12)))}`,
        ),
      );
    }
    if (v > 1) return bad(new InvalidValueError(`"${t}" is above 100%`));
    return { ok: true, value: v };
  } catch (e) {
    return bad(e instanceof Error ? e : new InvalidValueError(String(e)));
  }
}

const FIELD_NAMES: ReadonlyArray<readonly [Dim, string]> = [
  [DIM.RESISTANCE, 'resistance'],
  [DIM.LENGTH, 'length'],
  [DIM.AREA, 'area'],
  [DIM.TEMPERATURE_DIFFERENCE, 'temperature rise'],
  [DIM.ABS_TEMPERATURE, 'absolute temperature'],
  [DIM.AREAL_MASS, 'copper weight'],
  [DIM.CAPACITANCE, 'capacitance'],
  [DIM.INDUCTANCE, 'inductance'],
  [DIM.CURRENT, 'current'],
  [DIM.VOLTAGE, 'voltage'],
  [DIM.POWER, 'power'],
  [DIM.FREQUENCY, 'frequency'],
  [DIM.RESISTIVITY, 'resistivity'],
  [DIM.THERMAL_RESISTANCE, 'thermal resistance'],
  [DIM.THERMAL_CONDUCTIVITY, 'thermal conductivity'],
  [DIM.PER_KELVIN, 'temperature coefficient'],
  [DIM.CURRENT_DENSITY, 'current density'],
  [DIM.MASS, 'mass'],
  [DIM.TIME, 'time'],
  [DIM.DIMENSIONLESS, 'ratio'],
];

/** "= 0.254 mm (length)": what the parser understood, shown next to the input so a misread is visible. */
export function describeParsed(value: Quantity, expectedDim?: Dim, prefs?: DisplayPrefs): string {
  const field = expectedDim ?? value.dim;
  let name = describeDim(field);
  for (const [d, n] of FIELD_NAMES) {
    if (dimEqual(d, field)) {
      name = n;
      break;
    }
  }
  let shown: string;
  try {
    if (!Number.isFinite(value.si)) shown = 'invalid value';
    else if (isDimensionless(value.dim)) shown = `${String(Number((value.si * 100).toPrecision(6)))} %`;
    else shown = formatFor(value, prefs === undefined ? {} : { prefs });
  } catch {
    shown = `${String(value.si)} (SI)`;
  }
  return `= ${shown} (${name})`;
}
