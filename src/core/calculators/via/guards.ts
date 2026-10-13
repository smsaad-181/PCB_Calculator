import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { DEFAULT_COPPER_K_MATERIAL, copperThermalConductivity } from '../../data/constants';
import type { CopperKMaterial } from '../../data/constants';
import { guardQuantity } from '../copper-converter/guards';

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export interface ValidInputs {
  readonly finishedHoleDiameter: Quantity;
  readonly platingThickness: Quantity;
  readonly barrelLength: Quantity;
  readonly count: number;
  readonly conductorTemperature?: Quantity;
  readonly current?: Quantity;
  readonly resistivity?: Quantity;
  readonly kMaterial: CopperKMaterial;
  /** True when the caller did not choose the k material and the default was applied. */
  readonly kMaterialDefaulted: boolean;
}

type QField = 'finishedHoleDiameter' | 'platingThickness' | 'barrelLength' | 'conductorTemperature' | 'current' | 'resistivity';

const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  finishedHoleDiameter: { dim: DIM.LENGTH, name: 'length (finished hole diameter, not the drill diameter)' },
  platingThickness: { dim: DIM.LENGTH, name: 'length (plating thickness)' },
  barrelLength: { dim: DIM.LENGTH, name: 'length (barrel length)' },
  conductorTemperature: { dim: DIM.ABS_TEMPERATURE, name: 'absolute temperature (degC or K, not a temperature difference)' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
  resistivity: { dim: DIM.RESISTIVITY, name: 'resistivity (ohm metres)' },
};

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const out: Partial<Record<QField, Quantity>> = {};
  const required: QField[] = ['finishedHoleDiameter', 'platingThickness', 'barrelLength'];
  const fields: QField[] = [...required];
  for (const f of ['conductorTemperature', 'current', 'resistivity'] as const) if (raw[f] !== undefined) fields.push(f);
  for (const f of fields) {
    if (raw[f] === undefined) {
      const extra = f === 'platingThickness' ? ' It is required and never pre-filled: take it from your fabricator or measure it.' : '';
      return { ok: false, error: err('INVALID_INPUT', f, `${f} is required.${extra}`) };
    }
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }

  const n = raw['count'];
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: err('INVALID_INPUT', 'count', 'count (number of vias in parallel) must be a whole number of at least 1.') };
  }

  let kMaterial: CopperKMaterial = DEFAULT_COPPER_K_MATERIAL;
  let kMaterialDefaulted = true;
  if (raw['kMaterial'] !== undefined) {
    const m = raw['kMaterial'];
    try {
      copperThermalConductivity(m as CopperKMaterial);
    } catch {
      return { ok: false, error: err('INVALID_INPUT', 'kMaterial', 'kMaterial must be "pure-401" or "c11000-391".') };
    }
    kMaterial = m as CopperKMaterial;
    kMaterialDefaulted = false;
  }

  return {
    ok: true,
    value: {
      finishedHoleDiameter: out.finishedHoleDiameter as Quantity,
      platingThickness: out.platingThickness as Quantity,
      barrelLength: out.barrelLength as Quantity,
      count: n,
      ...(out.conductorTemperature !== undefined ? { conductorTemperature: out.conductorTemperature } : {}),
      ...(out.current !== undefined ? { current: out.current } : {}),
      ...(out.resistivity !== undefined ? { resistivity: out.resistivity } : {}),
      kMaterial,
      kMaterialDefaulted,
    },
  };
}
