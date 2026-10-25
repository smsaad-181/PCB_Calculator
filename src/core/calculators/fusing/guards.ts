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
export type Geometry = 'area' | 'trace' | 'wire' | 'via';
export type Pulse = 'current' | 'time' | 'i2t';

export interface ValidInputs {
  readonly geometry: Geometry;
  /** Conductor cross-section, m2 (SI). */
  readonly areaM2: number;
  readonly traceWidth?: Quantity;
  readonly traceThickness?: Quantity;
  readonly wireDiameter?: Quantity;
  /** Via barrel: FINISHED hole diameter and barrel plating thickness. */
  readonly viaHoleDiameter?: Quantity;
  readonly viaPlatingThickness?: Quantity;
  readonly area?: Quantity;
  readonly thicknessBasis?: ThicknessBasis;
  readonly initialTemperature: Quantity;
  /** Optional user end temperature (absolute), above the initial temperature and at most the melting point. No default. */
  readonly endTemperature?: Quantity;
  readonly pulse: Pulse;
  readonly current?: Quantity;
  readonly pulseTime?: Quantity;
  readonly actionIntegral?: Quantity;
  readonly specificHeat: CopperSpecificHeatSource;
  /** True when the caller did not choose the specific heat and the product default was applied. */
  readonly specificHeatDefaulted: boolean;
}

const BASES: readonly string[] = ['finished', 'measured', 'nominal'];

/** Input sanity limits (NOT sourced limits): they only reject absurd magnitudes, almost always a unit slip. */
const SANITY_AREA_M2 = 1;
const SANITY_LENGTH_M = 1;
const sanity = (field: string, what: string): CalcError =>
  err('OUT_OF_DOMAIN', field, `${what} is above the input sanity limit (${String(SANITY_LENGTH_M)} m or ${String(SANITY_AREA_M2)} m2). This is an input sanity limit to catch unit slips, not a sourced limit; check the units.`);

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  // Geometry: exactly one family.
  const hasArea = raw['area'] !== undefined;
  const hasWire = raw['wireDiameter'] !== undefined;
  const hasTrace = raw['traceWidth'] !== undefined || raw['traceThickness'] !== undefined || raw['thicknessBasis'] !== undefined;
  const hasVia = raw['viaHoleDiameter'] !== undefined || raw['viaPlatingThickness'] !== undefined;
  if (Number(hasArea) + Number(hasWire) + Number(hasTrace) + Number(hasVia) !== 1) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'geometry', 'Give exactly one conductor geometry: area, or a trace (traceWidth, traceThickness and thicknessBasis), or a wireDiameter, or a via barrel (viaHoleDiameter and viaPlatingThickness).'),
    };
  }
  let geometry: Geometry;
  let areaM2: number;
  let area: Quantity | undefined;
  let traceWidth: Quantity | undefined;
  let traceThickness: Quantity | undefined;
  let wireDiameter: Quantity | undefined;
  let thicknessBasis: ThicknessBasis | undefined;
  let viaHoleDiameter: Quantity | undefined;
  let viaPlatingThickness: Quantity | undefined;
  if (hasArea) {
    const g = guardQuantity('area', raw['area'], DIM.AREA, 'area (conductor cross-section)');
    if (!g.ok) return g;
    geometry = 'area';
    area = g.value;
    areaM2 = g.value.si;
  } else if (hasWire) {
    const g = guardQuantity('wireDiameter', raw['wireDiameter'], DIM.LENGTH, 'length (wire diameter)');
    if (!g.ok) return g;
    if (g.value.si > SANITY_LENGTH_M) return { ok: false, error: sanity('wireDiameter', 'The wire diameter') };
    geometry = 'wire';
    wireDiameter = g.value;
    areaM2 = (Math.PI * g.value.si * g.value.si) / 4;
  } else if (hasVia) {
    if (raw['viaHoleDiameter'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'viaHoleDiameter', 'viaHoleDiameter is required for a via barrel: the FINISHED hole diameter (inside the plating), not the drill.') };
    }
    const d = guardQuantity('viaHoleDiameter', raw['viaHoleDiameter'], DIM.LENGTH, 'length (finished hole diameter, not the drill diameter)');
    if (!d.ok) return d;
    if (raw['viaPlatingThickness'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'viaPlatingThickness', 'viaPlatingThickness is required for a via barrel. It is never pre-filled: take it from your fabricator (an AVERAGE, not a minimum) or measure it.') };
    }
    const t = guardQuantity('viaPlatingThickness', raw['viaPlatingThickness'], DIM.LENGTH, 'length (barrel plating thickness)');
    if (!t.ok) return t;
    if (d.value.si > SANITY_LENGTH_M) return { ok: false, error: sanity('viaHoleDiameter', 'The via hole diameter') };
    geometry = 'via';
    viaHoleDiameter = d.value;
    viaPlatingThickness = t.value;
    areaM2 = Math.PI * t.value.si * (d.value.si + t.value.si);
  } else {
    if (raw['traceWidth'] === undefined) return { ok: false, error: err('INVALID_INPUT', 'traceWidth', 'traceWidth is required for a trace.') };
    const w = guardQuantity('traceWidth', raw['traceWidth'], DIM.LENGTH, 'length (trace width)');
    if (!w.ok) return w;
    if (raw['traceThickness'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'traceThickness', 'traceThickness is required for a trace: the FINISHED copper thickness, not an assumed foil weight.') };
    }
    const t = guardQuantity('traceThickness', raw['traceThickness'], DIM.LENGTH, 'length (finished copper thickness)');
    if (!t.ok) return t;
    if (w.value.si > SANITY_LENGTH_M) return { ok: false, error: sanity('traceWidth', 'The trace width') };
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
  if (areaM2 > SANITY_AREA_M2) return { ok: false, error: sanity('geometry', 'The conductor cross-section') };

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

  // Optional end temperature (S-042a with Te in place of Tm): never defaulted; above Ta and at most the melting point.
  let endTemperature: Quantity | undefined;
  if (raw['endTemperature'] !== undefined) {
    const te = guardQuantity('endTemperature', raw['endTemperature'], DIM.ABS_TEMPERATURE, 'absolute temperature (degC or K, not a temperature difference)');
    if (!te.ok) return te;
    const teC = toUnit(te.value, 'degC');
    if (teC <= taC) {
      return { ok: false, error: err('OUT_OF_DOMAIN', 'endTemperature', 'endTemperature must be above the initial temperature (the conductor would already be at it).') };
    }
    if (teC > COPPER_MELTING_POINT_C + 1e-9) {
      return { ok: false, error: err('OUT_OF_DOMAIN', 'endTemperature', 'endTemperature must not exceed the copper melting point; the model stops there.') };
    }
    endTemperature = te.value;
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
      ...(viaHoleDiameter !== undefined ? { viaHoleDiameter } : {}),
      ...(viaPlatingThickness !== undefined ? { viaPlatingThickness } : {}),
      ...(endTemperature !== undefined ? { endTemperature } : {}),
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
