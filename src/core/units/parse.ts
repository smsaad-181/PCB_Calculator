import { dimEqual, isDimensionless, type Dim } from './dim';
import { DimensionError, InvalidValueError, UnitError } from './errors';
import { type Quantity } from './quantity';
import { PREFIX_SCALE, applyUnit, resolveUnit } from './units-table';

export type ParseResult =
  | { readonly ok: true; readonly value: Quantity }
  | { readonly ok: false; readonly error: Error };

const NUMBER_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/;

function fail(error: Error): ParseResult {
  return { ok: false, error };
}

/**
 * Parse "10mil", "0.3 mm", "2.2uF", "1.5 kohm". Never throws; returns a Result.
 * A bare prefix with no unit ("35u", "1.5k") is accepted only when `expectedDim` supplies the unit.
 * With `expectedDim`, "1m" for a resistance means milliohm (metre does not match the expected dimension).
 */
export function parseQuantity(text: string, expectedDim?: Dim): ParseResult {
  try {
    const m = NUMBER_RE.exec(text);
    if (!m) return fail(new InvalidValueError(`Cannot read a number from "${text}"`));
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return fail(new InvalidValueError(`"${m[1] as string}" is not a finite number`));
    const unit = m[2] as string;

    if (unit === '') {
      if (expectedDim !== undefined && isDimensionless(expectedDim)) {
        return { ok: true, value: { si: value, dim: expectedDim } };
      }
      return fail(new UnitError(`Missing unit in "${text.trim()}"`));
    }

    const u = resolveUnit(unit);
    if (u && (expectedDim === undefined || dimEqual(u.dim, expectedDim))) {
      return { ok: true, value: applyUnit(value, u) };
    }
    if (expectedDim !== undefined && expectedDim.kind === 'plain') {
      const scale = PREFIX_SCALE.get(unit);
      if (scale !== undefined) {
        const si = value * scale;
        if (!Number.isFinite(si)) return fail(new InvalidValueError(`"${text.trim()}" overflows the representable range`));
        return { ok: true, value: { si, dim: expectedDim } };
      }
    }
    if (u) return fail(new DimensionError(`Unit "${unit}" does not match the expected dimension`));
    return fail(new UnitError(`Unknown unit "${unit}" (units are case-sensitive)`));
  } catch (e) {
    return fail(e instanceof Error ? e : new InvalidValueError(String(e)));
  }
}
