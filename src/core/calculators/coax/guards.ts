import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { guardEr, isObject, validateCommon } from '../impedance-shared';
import type { CommonInputs } from '../impedance-shared';

export interface ValidInputs {
  readonly outerDiameter?: Quantity;
  readonly innerDiameter?: Quantity;
  readonly targetZ0?: Quantity;
  readonly er: number;
  readonly common: CommonInputs;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

/**
 * Analysis: outerDiameter and innerDiameter, no targetZ0. Solve: targetZ0 and exactly ONE diameter (the other is solved).
 * Never throws.
 */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isObject(raw) || Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };
  const hasD = raw['outerDiameter'] !== undefined;
  const hasd = raw['innerDiameter'] !== undefined;
  const hasZ = raw['targetZ0'] !== undefined;
  if (hasZ ? hasD === hasd : !(hasD && hasd)) {
    return {
      ok: false,
      error: err(
        'INVALID_INPUT',
        hasZ ? 'targetZ0' : 'outerDiameter',
        hasZ ? 'With targetZ0 give exactly one diameter (outerDiameter or innerDiameter); the other is solved.' : 'Give both outerDiameter and innerDiameter (analysis), or targetZ0 with exactly one diameter (solve).',
      ),
    };
  }
  const out: { -readonly [K in keyof ValidInputs]?: ValidInputs[K] } = {};
  const spec: [keyof Pick<ValidInputs, 'outerDiameter' | 'innerDiameter' | 'targetZ0'>, boolean, Quantity['dim'], string][] = [
    ['outerDiameter', hasD, DIM.LENGTH, 'length'],
    ['innerDiameter', hasd, DIM.LENGTH, 'length'],
    ['targetZ0', hasZ, DIM.RESISTANCE, 'resistance (ohm)'],
  ];
  for (const [k, present, dim, name] of spec) {
    if (!present) continue;
    const g = guardQuantity(k, raw[k], dim, name);
    if (!g.ok) return g;
    out[k] = g.value;
  }
  const e = guardEr('er', raw['er']);
  if (!e.ok) return e;
  if (out.outerDiameter !== undefined && out.innerDiameter !== undefined && out.outerDiameter.si <= out.innerDiameter.si) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'outerDiameter', 'outerDiameter must be larger than innerDiameter (D > d); the outer conductor surrounds the inner one.') };
  }
  const c = validateCommon(raw);
  if (!c.ok) return c;
  return {
    ok: true,
    value: {
      ...(out.outerDiameter !== undefined ? { outerDiameter: out.outerDiameter } : {}),
      ...(out.innerDiameter !== undefined ? { innerDiameter: out.innerDiameter } : {}),
      ...(out.targetZ0 !== undefined ? { targetZ0: out.targetZ0 } : {}),
      er: e.value,
      common: c.value,
    },
  };
}
