import { DIM, toUnit } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { COPPER_ALPHA_20C, COPPER_MELTING_POINT_C, DEFAULT_COPPER_SPECIFIC_HEAT, ONDERDONK_OFFSET_C, copperSpecificHeat } from '../../data/constants';
import type { CopperSpecificHeatSource } from '../../data/constants';
import { guardQuantity } from '../copper-converter/guards';

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export type ThicknessBasis = 'finished' | 'measured' | 'nominal';
export type Geometry = 'area' | 'trace' | 'wire';
export type Pulse = 'current' | 'time' | 'i2t';

export interface ValidInputs {
  readonly geometry: Geometry;
  /** Conductor cross-section, m2 (SI). */
  readonly areaM2: number;
  readonly traceWidth?: Quantity;
  readonly traceThickness?: Quantity;
  readonly wireDiameter?: Quantity;
  readonly area?: Quantity;
  readonly thicknessBasis?: ThicknessBasis;
  readonly initialTemperature: Quantity;
  readonly pulse: Pulse;
  readonly current?: Quantity;
  readonly pulseTime?: Quantity;
  readonly actionIntegral?: Quantity;
  readonly specificHeat: CopperSpecificHeatSource;
  /** True when the caller did not choose the specific heat and the product default was applied. */
  readonly specificHeatDefaulted: boolean;
}

const BASES: readonly string[] = ['finished', 'measured', 'nominal'];

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  // Geometry: exactly one family.
  const hasArea = raw['area'] !== undefined;
  const hasWire = raw['wireDiameter'] !== undefined;
  const hasTrace = raw['traceWidth'] !== undefined || raw['traceThickness'] !== undefined || raw['thicknessBasis'] !== undefined;
  if (Number(hasArea) + Number(hasWire) + Number(hasTrace) !== 1) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'geometry', 'Give exactly one conductor geometry: area, or a trace (traceWidth, traceThickness and thicknessBasis), or a wireDiameter.'),
    };
  }
  let geometry: Geometry;
  let areaM2: number;
  let area: Quantity | undefined;
  let traceWidth: Quantity | undefined;
  let traceThickness: Quantity | undefined;
  let wireDiameter: Quantity | undefined;
  let thicknessBasis: ThicknessBasis | undefined;
  if (hasArea) {
    const g = guardQuantity('area', raw['area'], DIM.AREA, 'area (conductor cross-section)');
    if (!g.ok) return g;
    geometry = 'area';
    area = g.value;
    areaM2 = g.value.si;
  } else if (hasWire) {
    const g = guardQuantity('wireDiameter', raw['wireDiameter'], DIM.LENGTH, 'length (wire diameter)');
    if (!g.ok) return g;
    geometry = 'wire';
    wireDiameter = g.value;
    areaM2 = (Math.PI * g.value.si * g.value.si) / 4;
  } else {
    if (raw['traceWidth'] === undefined) return { ok: false, error: err('INVALID_INPUT', 'traceWidth', 'traceWidth is required for a trace.') };
    const w = guardQuantity('traceWidth', raw['traceWidth'], DIM.LENGTH, 'length (trace width)');
    if (!w.ok) return w;
    if (raw['traceThickness'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'traceThickness', 'traceThickness is required for a trace: the FINISHED copper thickness, not an assumed foil weight.') };
    }
    const t = guardQuantity('traceThickness', raw['traceThickness'], DIM.LENGTH, 'length (finished copper thickness)');
    if (!t.ok) return t;
    const b = raw['thicknessBasis'];
    if (typeof b !== 'string' || !BASES.includes(b)) {
      return { ok: false, error: err('INVALID_INPUT', 'thicknessBasis', 'thicknessBasis is required and must be "finished", "measured" or "nominal". There is no default: thinner finished copper fuses sooner.') };
    }
    geometry = 'trace';
    traceWidth = w.value;
    traceThickness = t.value;
    thicknessBasis = b as ThicknessBasis;
    areaM2 = w.value.si * t.value.si;
  }
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'geometry', 'The conductor cross-section is outside the representable range (check the units).') };
  }

  // Initial temperature: required, absolute, below the melting point and inside the linear-resistivity model.
  if (raw['initialTemperature'] === undefined) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'initialTemperature', 'initialTemperature is required. It is the conductor temperature at the start of the pulse, not room ambient if the trace already carries load. There is no default.'),
    };
  }
  const ta = guardQuantity('initialTemperature', raw['initialTemperature'], DIM.ABS_TEMPERATURE, 'absolute temperature (degC or K, not a temperature difference)');
  if (!ta.ok) return ta;
  const taC = toUnit(ta.value, 'degC');
  const beta20 = 1 / COPPER_ALPHA_20C - 20;
  if (taC >= COPPER_MELTING_POINT_C) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'initialTemperature', 'initialTemperature must be below the copper melting point; the conductor would already be at it.') };
  }
  if (taC + beta20 <= 0 || taC + ONDERDONK_OFFSET_C <= 0) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'initialTemperature', 'initialTemperature is too low for the linear resistivity model used by these equations.') };
  }

  // Exactly one of current, pulseTime, actionIntegral.
  const given = (['current', 'pulseTime', 'actionIntegral'] as const).filter((f) => raw[f] !== undefined);
  if (given.length !== 1) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'pulse', 'Give exactly one of current (solves the time), pulseTime (solves the current) or actionIntegral (I²t of a non-rectangular pulse).'),
    };
  }
  const which = given[0] as 'current' | 'pulseTime' | 'actionIntegral';
  const spec = {
    current: { dim: DIM.CURRENT, name: 'current (A)', pulse: 'current' as Pulse },
    pulseTime: { dim: DIM.TIME, name: 'time (s)', pulse: 'time' as Pulse },
    actionIntegral: { dim: DIM.ACTION_INTEGRAL, name: 'action integral I²t (A²·s)', pulse: 'i2t' as Pulse },
  }[which];
  const p = guardQuantity(which, raw[which], spec.dim, spec.name);
  if (!p.ok) return p;

  // Specific heat: a sourced choice (S-042d), never a free value.
  let specificHeat: CopperSpecificHeatSource = DEFAULT_COPPER_SPECIFIC_HEAT;
  let specificHeatDefaulted = true;
  if (raw['specificHeat'] !== undefined) {
    try {
      copperSpecificHeat(raw['specificHeat'] as CopperSpecificHeatSource);
    } catch {
      return { ok: false, error: err('INVALID_INPUT', 'specificHeat', 'specificHeat must be "pppl-293k", "pppl-300k" or "hyperphysics-20c" (sourced values, ledger S-042d, CONFLICT). There is no free-form override.') };
    }
    specificHeat = raw['specificHeat'] as CopperSpecificHeatSource;
    specificHeatDefaulted = false;
  }

  return {
    ok: true,
    value: {
      geometry,
      areaM2,
      ...(area !== undefined ? { area } : {}),
      ...(traceWidth !== undefined ? { traceWidth } : {}),
      ...(traceThickness !== undefined ? { traceThickness } : {}),
      ...(wireDiameter !== undefined ? { wireDiameter } : {}),
      ...(thicknessBasis !== undefined ? { thicknessBasis } : {}),
      initialTemperature: ta.value,
      pulse: spec.pulse,
      ...(which === 'current' ? { current: p.value } : {}),
      ...(which === 'pulseTime' ? { pulseTime: p.value } : {}),
      ...(which === 'actionIntegral' ? { actionIntegral: p.value } : {}),
      specificHeat,
      specificHeatDefaulted,
    },
  };
}
