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
  readonly planeSpacing: Quantity;
  readonly er: number;
  readonly thickness?: Quantity;
  readonly common: CommonInputs;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const geometry = validateDiffGeometry(raw);
  if (!geometry.ok) return geometry;
  const b = guardQuantity('planeSpacing', raw['planeSpacing'], DIM.LENGTH, 'length (plane-to-plane spacing b)');
  if (!b.ok) return b;
  const e = guardEr('er', raw['er']);
  if (!e.ok) return e;
  let thickness: Quantity | undefined;
  if (raw['thickness'] !== undefined) {
    const t = guardQuantity('thickness', raw['thickness'], DIM.LENGTH, 'length');
    if (!t.ok) return t;
    if (t.value.si >= b.value.si) return { ok: false, error: err('OUT_OF_DOMAIN', 'thickness', 'thickness must be smaller than the plane-to-plane spacing b.') };
    thickness = t.value;
  }
  const c = validateCommon(raw);
  if (!c.ok) return c;
  return {
    ok: true,
    value: { geometry: geometry.value, planeSpacing: b.value, er: e.value, ...(thickness !== undefined ? { thickness } : {}), common: c.value },
  };
}
