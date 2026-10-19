import { DIM } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { copperThermalConductivity } from '../../data/constants';
import type { CopperKMaterial } from '../../data/constants';
import { guardQuantity } from '../copper-converter/guards';

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export type PlatingSource = 'user' | 'fab-profile-average';

export interface ValidInputs {
  readonly finishedHoleDiameter: Quantity;
  readonly platingThickness: Quantity;
  readonly barrelLength: Quantity;
  readonly count: number;
  readonly kMaterial: CopperKMaterial;
  readonly fill: 'none' | 'filled';
  readonly fillConductivity?: Quantity;
  readonly power?: Quantity;
  readonly platingSource: PlatingSource;
}

const LENGTHS = [
  ['finishedHoleDiameter', 'length (finished hole diameter, not the drill diameter)'],
  ['platingThickness', 'length (plating thickness)'],
  ['barrelLength', 'length (barrel length)'],
] as const;

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const len: Partial<Record<(typeof LENGTHS)[number][0], Quantity>> = {};
  for (const [f, name] of LENGTHS) {
    if (raw[f] === undefined) {
      const extra = f === 'platingThickness' ? ' It is required and never pre-filled: take it from your fabricator (an AVERAGE, not a minimum) or measure it.' : '';
      return { ok: false, error: err('INVALID_INPUT', f, `${f} is required.${extra}`) };
    }
    const g = guardQuantity(f, raw[f], DIM.LENGTH, name);
    if (!g.ok) return g;
    len[f] = g.value;
  }

  const n = raw['count'];
  if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > Number.MAX_SAFE_INTEGER) {
    return { ok: false, error: err('INVALID_INPUT', 'count', 'count (number of vias in parallel) must be a whole number of at least 1.') };
  }

  const m = raw['kMaterial'];
  let kMaterial: CopperKMaterial | undefined;
  if (m !== undefined) {
    try {
      copperThermalConductivity(m as CopperKMaterial);
      kMaterial = m as CopperKMaterial;
    } catch {
      kMaterial = undefined;
    }
  }
  if (kMaterial === undefined) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'kMaterial', 'kMaterial is required and must be "pure-401" or "c11000-391". There is no default: the sources disagree (ledger S-007, CONFLICT), so you must choose.'),
    };
  }

  const fill = raw['fill'];
  if (fill !== 'none' && fill !== 'filled') {
    return { ok: false, error: err('INVALID_INPUT', 'fill', 'fill is required and must be "none" or "filled". There is no default.') };
  }
  let fillConductivity: Quantity | undefined;
  if (fill === 'filled') {
    if (raw['fillConductivity'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'fillConductivity', 'fillConductivity is required for a filled via. It has no default: take it from the fill material datasheet.') };
    }
    const g = guardQuantity('fillConductivity', raw['fillConductivity'], DIM.THERMAL_CONDUCTIVITY, 'thermal conductivity (W/(m·K))');
    if (!g.ok) return g;
    fillConductivity = g.value;
  } else if (raw['fillConductivity'] !== undefined) {
    return { ok: false, error: err('INVALID_INPUT', 'fillConductivity', 'fillConductivity was given but fill is "none". Choose "filled" or remove it.') };
  }

  let power: Quantity | undefined;
  if (raw['power'] !== undefined) {
    const g = guardQuantity('power', raw['power'], DIM.POWER, 'power (W)');
    if (!g.ok) return g;
    power = g.value;
  }

  const ps = raw['platingSource'];
  if (ps !== undefined && ps !== 'user' && ps !== 'fab-profile-average') {
    return { ok: false, error: err('INVALID_INPUT', 'platingSource', 'platingSource must be "user" or "fab-profile-average".') };
  }

  return {
    ok: true,
    value: {
      finishedHoleDiameter: len.finishedHoleDiameter as Quantity,
      platingThickness: len.platingThickness as Quantity,
      barrelLength: len.barrelLength as Quantity,
      count: n,
      kMaterial,
      fill,
      ...(fillConductivity !== undefined ? { fillConductivity } : {}),
      ...(power !== undefined ? { power } : {}),
      platingSource: ps ?? 'user',
    },
  };
}
