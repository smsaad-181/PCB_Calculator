import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { validateDiffGeometry } from '../diff-shared';
import type { DiffGeometry } from '../diff-shared';
import { guardEr, isObject, validateCommon } from '../impedance-shared';
import type { CommonInputs } from '../impedance-shared';

export interface ValidInputs {
  readonly geometry: DiffGeometry;
  readonly height: Quantity;
  readonly er: number;
  readonly thickness?: Quantity;
  readonly common: CommonInputs;
}

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: { code: 'INVALID_INPUT', field: 'inputs', message: 'inputs must be an object.' } };
  const geometry = validateDiffGeometry(raw);
  if (!geometry.ok) return geometry;
  const h = guardQuantity('height', raw['height'], DIM.LENGTH, 'length (dielectric height to the reference plane)');
  if (!h.ok) return h;
  const e = guardEr('er', raw['er']);
  if (!e.ok) return e;
  let thickness: Quantity | undefined;
  if (raw['thickness'] !== undefined) {
    const t = guardQuantity('thickness', raw['thickness'], DIM.LENGTH, 'length');
    if (!t.ok) return t;
    thickness = t.value;
  }
  const c = validateCommon(raw);
  if (!c.ok) return c;
  return {
    ok: true,
    value: { geometry: geometry.value, height: h.value, er: e.value, ...(thickness !== undefined ? { thickness } : {}), common: c.value },
  };
}
