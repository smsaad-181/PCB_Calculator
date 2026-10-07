import { DIM, FOIL_CONVENTIONS, sameDim } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, Result } from '../../result';

export type Layer = 'outer' | 'inner';
export type ThicknessBasis = 'nominal' | 'finished' | 'measured';

/** Plating added to the foil on an outer layer; above this the input is treated as a unit slip. */
export const MAX_PLATING_M = 200e-6;
const MAX_PLATING_TOL = 1e-9;

const BASES: readonly string[] = ['nominal', 'finished', 'measured'];

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** Validates one optional-or-required quantity: shape, dimension, then finite and positive. Never throws. */
export function guardQuantity(field: string, v: unknown, dim: Quantity['dim'], dimName: string): Result<Quantity, CalcError> {
  if (!isRecord(v) || typeof v['si'] !== 'number' || !isRecord(v['dim'])) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a quantity with a numeric value and a dimension.`) };
  }
  const qty = v as unknown as Quantity;
  const same = ((): boolean => {
    try {
      return sameDim(qty, { si: 1, dim } as Quantity);
    } catch {
      return false;
    }
  })();
  if (!same) return { ok: false, error: err('DIMENSION', field, `${field} must be a ${dimName}.`) };
  const n = qty.si;
  if (Number.isNaN(n)) return { ok: false, error: err('INVALID_INPUT', field, `${field} is NaN (not a number); it must be a finite number greater than zero.`) };
  if (!Number.isFinite(n)) return { ok: false, error: err('INVALID_INPUT', field, `${field} is infinite; it must be a finite number greater than zero.`) };
  if (n <= 0) return { ok: false, error: err('INVALID_INPUT', field, `${field} is ${n === 0 ? 'zero' : 'negative'}; it must be a finite number greater than zero.`) };
  return { ok: true, value: qty };
}

export interface ValidInputs {
  readonly weight?: Quantity;
  readonly thickness?: Quantity;
  readonly layer: Layer;
  readonly convention: FoilConvention | undefined;
  readonly thicknessBasis: ThicknessBasis;
  readonly platingThickness?: Quantity;
}

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const layer = raw['layer'];
  if (layer !== 'outer' && layer !== 'inner') {
    return { ok: false, error: err('INVALID_INPUT', 'layer', 'layer must be exactly "outer" or "inner"; it is never defaulted.') };
  }
  const conv = raw['convention'];
  if (conv !== undefined && (typeof conv !== 'string' || !Object.prototype.hasOwnProperty.call(FOIL_CONVENTIONS, conv))) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'convention', `convention must be one of ${Object.keys(FOIL_CONVENTIONS).join(', ')}.`),
    };
  }
  const basisRaw = raw['thicknessBasis'];
  if (basisRaw !== undefined && (typeof basisRaw !== 'string' || !BASES.includes(basisRaw))) {
    return { ok: false, error: err('INVALID_INPUT', 'thicknessBasis', `thicknessBasis must be one of ${BASES.join(', ')}.`) };
  }
  const hasW = raw['weight'] !== undefined;
  const hasT = raw['thickness'] !== undefined;
  if (hasW === hasT) {
    return {
      ok: false,
      error: err('INVALID_INPUT', hasW ? 'weight' : 'thickness', 'Give exactly one of weight or thickness, not both and not neither.'),
    };
  }
  let weight: Quantity | undefined;
  let thickness: Quantity | undefined;
  if (hasW) {
    const w = guardQuantity('weight', raw['weight'], DIM.AREAL_MASS, 'foil weight (oz/ft2)');
    if (!w.ok) return w;
    weight = w.value;
  } else {
    const t = guardQuantity('thickness', raw['thickness'], DIM.LENGTH, 'length');
    if (!t.ok) return t;
    thickness = t.value;
  }
  let plating: Quantity | undefined;
  if (raw['platingThickness'] !== undefined) {
    const p = guardQuantity('platingThickness', raw['platingThickness'], DIM.LENGTH, 'length');
    if (!p.ok) return p;
    if (layer === 'inner') {
      return { ok: false, error: err('INVALID_INPUT', 'platingThickness', 'platingThickness applies to outer layers only.') };
    }
    if (p.value.si > MAX_PLATING_M * (1 + MAX_PLATING_TOL)) {
      return { ok: false, error: err('OUT_OF_DOMAIN', 'platingThickness', 'platingThickness above 200 um is outside the supported range; check the unit.') };
    }
    plating = p.value;
  }
  return {
    ok: true,
    value: {
      layer,
      convention: conv as FoilConvention | undefined,
      thicknessBasis: (basisRaw as ThicknessBasis | undefined) ?? 'nominal',
      ...(weight !== undefined ? { weight } : {}),
      ...(thickness !== undefined ? { thickness } : {}),
      ...(plating !== undefined ? { platingThickness: plating } : {}),
    },
  };
}
