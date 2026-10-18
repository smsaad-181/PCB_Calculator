import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { guardEr, isObject, validateCommon } from '../impedance-shared';
import type { CommonInputs } from '../impedance-shared';
import { THICKNESS_MODELS } from './meta';
import type { ThicknessModel } from './meta';

export interface ValidInputs {
  readonly width?: Quantity;
  readonly targetZ0?: Quantity;
  readonly height: Quantity;
  readonly er: number;
  readonly thickness?: Quantity;
  readonly thicknessModel: ThicknessModel;
  readonly common: CommonInputs;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const hasW = raw['width'] !== undefined;
  const hasZ = raw['targetZ0'] !== undefined;
  if (hasW === hasZ) {
    return { ok: false, error: err('INVALID_INPUT', 'width', 'Give exactly one of width or targetZ0 (analysis from a width, or the width for a target Z0), not both and not neither.') };
  }
  let width: Quantity | undefined;
  let targetZ0: Quantity | undefined;
  if (hasW) {
    const w = guardQuantity('width', raw['width'], DIM.LENGTH, 'length');
    if (!w.ok) return w;
    width = w.value;
  } else {
    const z = guardQuantity('targetZ0', raw['targetZ0'], DIM.RESISTANCE, 'resistance (ohm)');
    if (!z.ok) return z;
    targetZ0 = z.value;
  }
  const h = guardQuantity('height', raw['height'], DIM.LENGTH, 'length');
  if (!h.ok) return h;
  const e = guardEr('er', raw['er']);
  if (!e.ok) return e;
  let thickness: Quantity | undefined;
  if (raw['thickness'] !== undefined) {
    const t = guardQuantity('thickness', raw['thickness'], DIM.LENGTH, 'length');
    if (!t.ok) return t;
    thickness = t.value;
  }
  const mRaw = raw['thicknessModel'];
  if (mRaw !== undefined && (typeof mRaw !== 'string' || !(THICKNESS_MODELS as readonly string[]).includes(mRaw))) {
    return { ok: false, error: err('INVALID_INPUT', 'thicknessModel', `thicknessModel must be one of ${THICKNESS_MODELS.join(', ')} (the Wheeler form is not implemented).`) };
  }
  const thicknessModel = (mRaw as ThicknessModel | undefined) ?? 'none';
  if (thicknessModel !== 'none' && thickness === undefined) {
    return { ok: false, error: err('INVALID_INPUT', 'thickness', `thicknessModel ${thicknessModel} needs a thickness (t); enter the trace copper thickness.`) };
  }
  // F-3: a defensive geometric guard, not a sourced range (none is recorded for the thickness correction, ledger S-020a).
  if (thicknessModel !== 'none' && thickness !== undefined && thickness.si >= h.value.si) {
    return {
      ok: false,
      error: err('OUT_OF_DOMAIN', 'thickness', `thickness is at or above the dielectric height h (t/h = ${String(Number((thickness.si / h.value.si).toPrecision(5)))}): outside the thickness correction's domain (geometric guard, not a sourced range). Use the zero-thickness model, or check the units of t and h.`),
    };
  }
  const c = validateCommon(raw);
  if (!c.ok) return c;
  return {
    ok: true,
    value: {
      ...(width !== undefined ? { width } : {}),
      ...(targetZ0 !== undefined ? { targetZ0 } : {}),
      height: h.value,
      er: e.value,
      ...(thickness !== undefined ? { thickness } : {}),
      thicknessModel,
      common: c.value,
    },
  };
}
