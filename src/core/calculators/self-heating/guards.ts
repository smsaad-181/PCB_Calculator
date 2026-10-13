import { DIM, FOIL_CONVENTIONS, mul, q } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, CopperBasisKind, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';

export type Layer = 'outer' | 'inner';
export type ThermalLaw = 'user-theta' | 'legacy-ipc2221-calibrated';
export type PeriodVsTau = 'much-shorter' | 'comparable-or-longer';

const BASES: readonly string[] = ['nominal', 'finished', 'measured'];
const LAWS: readonly string[] = ['user-theta', 'legacy-ipc2221-calibrated'];
const PERIODS: readonly string[] = ['much-shorter', 'comparable-or-longer'];

/** Dimension of a thermal resistance per length (K m / W): thermal resistance times length. */
const THETA_PER_LENGTH_DIM = mul(q(1, DIM.THERMAL_RESISTANCE), q(1, DIM.LENGTH)).dim;

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export interface ValidInputs {
  readonly thermalLaw: ThermalLaw;
  readonly layer: Layer;
  readonly convention: FoilConvention | undefined;
  readonly length: Quantity;
  readonly width: Quantity;
  readonly copperWeight?: Quantity;
  readonly copperThickness?: Quantity;
  readonly copperBasis?: CopperBasisKind;
  readonly ambient?: Quantity;
  readonly current?: Quantity;
  readonly peakCurrent?: Quantity;
  readonly duty?: Quantity;
  readonly periodVsTau?: PeriodVsTau;
  readonly theta?: Quantity;
  readonly thetaPerLength?: Quantity;
  readonly deltaTMax?: Quantity;
}

type QField =
  | 'length'
  | 'width'
  | 'copperWeight'
  | 'copperThickness'
  | 'ambient'
  | 'current'
  | 'peakCurrent'
  | 'duty'
  | 'theta'
  | 'thetaPerLength'
  | 'deltaTMax';

const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  length: { dim: DIM.LENGTH, name: 'length' },
  width: { dim: DIM.LENGTH, name: 'length' },
  copperWeight: { dim: DIM.AREAL_MASS, name: 'foil weight (oz/ft2)' },
  copperThickness: { dim: DIM.LENGTH, name: 'length' },
  ambient: { dim: DIM.ABS_TEMPERATURE, name: 'absolute temperature (degC or K, not a temperature difference)' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
  peakCurrent: { dim: DIM.CURRENT, name: 'current (A)' },
  duty: { dim: DIM.DIMENSIONLESS, name: 'dimensionless duty cycle in (0, 1]' },
  theta: { dim: DIM.THERMAL_RESISTANCE, name: 'thermal resistance (K/W)' },
  thetaPerLength: { dim: THETA_PER_LENGTH_DIM, name: 'thermal resistance per length (K m / W)' },
  deltaTMax: { dim: DIM.TEMPERATURE_DIFFERENCE, name: 'temperature difference (not an absolute temperature)' },
};

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const law = raw['thermalLaw'];
  if (typeof law !== 'string' || !LAWS.includes(law)) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'thermalLaw', `thermalLaw must be exactly one of ${LAWS.join(', ')}; it is never defaulted.`),
    };
  }
  const layer = raw['layer'];
  if (layer !== 'outer' && layer !== 'inner') {
    return { ok: false, error: err('INVALID_INPUT', 'layer', 'layer must be exactly "outer" or "inner"; it is never defaulted.') };
  }
  const conv = raw['convention'];
  if (conv !== undefined && (typeof conv !== 'string' || !Object.prototype.hasOwnProperty.call(FOIL_CONVENTIONS, conv))) {
    return { ok: false, error: err('INVALID_INPUT', 'convention', `convention must be one of ${Object.keys(FOIL_CONVENTIONS).join(', ')}.`) };
  }
  const basisRaw = raw['copperBasis'];
  if (basisRaw !== undefined && (typeof basisRaw !== 'string' || !BASES.includes(basisRaw))) {
    return { ok: false, error: err('INVALID_INPUT', 'copperBasis', `copperBasis must be one of ${BASES.join(', ')}.`) };
  }
  const hasW = raw['copperWeight'] !== undefined;
  const hasT = raw['copperThickness'] !== undefined;
  if (hasW === hasT) {
    return {
      ok: false,
      error: err('INVALID_INPUT', hasW ? 'copperWeight' : 'copperThickness', 'Give exactly one of copperWeight or copperThickness, not both and not neither.'),
    };
  }
  if (basisRaw !== undefined && !hasT) {
    return { ok: false, error: err('INVALID_INPUT', 'copperBasis', 'copperBasis is only allowed together with copperThickness (a weight is always nominal).') };
  }

  // Current: either a steady current, or a pulse (peak, duty, and the period-versus-time-constant statement).
  const hasI = raw['current'] !== undefined;
  const hasPk = raw['peakCurrent'] !== undefined;
  if (hasI === hasPk) {
    return {
      ok: false,
      error: err('INVALID_INPUT', hasI ? 'current' : 'peakCurrent', 'Give exactly one of current (steady) or peakCurrent (pulse, with duty and periodVsTau), not both and not neither.'),
    };
  }
  const periodRaw = raw['periodVsTau'];
  if (hasPk) {
    if (raw['duty'] === undefined) return { ok: false, error: err('INVALID_INPUT', 'duty', 'duty (0 < D <= 1) is required with peakCurrent.') };
    if (typeof periodRaw !== 'string' || !PERIODS.includes(periodRaw)) {
      return {
        ok: false,
        error: err('INVALID_INPUT', 'periodVsTau', `periodVsTau must be exactly one of ${PERIODS.join(', ')} with peakCurrent; it is never defaulted.`),
      };
    }
  } else if (raw['duty'] !== undefined || periodRaw !== undefined) {
    return {
      ok: false,
      error: err('INVALID_INPUT', raw['duty'] !== undefined ? 'duty' : 'periodVsTau', 'duty and periodVsTau are only allowed together with peakCurrent.'),
    };
  }

  // Thermal law inputs.
  const hasTheta = raw['theta'] !== undefined;
  const hasPerLen = raw['thetaPerLength'] !== undefined;
  if (law === 'user-theta') {
    if (hasTheta === hasPerLen) {
      return {
        ok: false,
        error: err('INVALID_INPUT', hasTheta ? 'theta' : 'thetaPerLength', 'Law user-theta needs exactly one of theta (K/W) or thetaPerLength (K m / W), not both and not neither.'),
      };
    }
  } else if (hasTheta || hasPerLen) {
    return {
      ok: false,
      error: err('INVALID_INPUT', hasTheta ? 'theta' : 'thetaPerLength', 'Law legacy-ipc2221-calibrated derives its own thermal resistance; do not supply theta or thetaPerLength.'),
    };
  }

  const out: Partial<Record<QField, Quantity>> = {};
  const fields: QField[] = ['length', 'width', hasW ? 'copperWeight' : 'copperThickness'];
  for (const f of ['ambient', 'current', 'peakCurrent', 'duty', 'theta', 'thetaPerLength', 'deltaTMax'] as const) {
    if (raw[f] !== undefined) fields.push(f);
  }
  for (const f of fields) {
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  if (out.duty !== undefined && out.duty.si > 1) {
    return { ok: false, error: err('INVALID_INPUT', 'duty', 'duty must be in (0, 1].') };
  }

  const length = out.length as Quantity;
  const width = out.width as Quantity;
  return {
    ok: true,
    value: {
      thermalLaw: law as ThermalLaw,
      layer,
      convention: conv as FoilConvention | undefined,
      length,
      width,
      ...(out.copperWeight !== undefined ? { copperWeight: out.copperWeight } : {}),
      ...(out.copperThickness !== undefined ? { copperThickness: out.copperThickness } : {}),
      ...(basisRaw !== undefined ? { copperBasis: basisRaw as CopperBasisKind } : {}),
      ...(out.ambient !== undefined ? { ambient: out.ambient } : {}),
      ...(out.current !== undefined ? { current: out.current } : {}),
      ...(out.peakCurrent !== undefined ? { peakCurrent: out.peakCurrent } : {}),
      ...(out.duty !== undefined ? { duty: out.duty } : {}),
      ...(typeof periodRaw === 'string' && hasPk ? { periodVsTau: periodRaw as PeriodVsTau } : {}),
      ...(out.theta !== undefined ? { theta: out.theta } : {}),
      ...(out.thetaPerLength !== undefined ? { thetaPerLength: out.thetaPerLength } : {}),
      ...(out.deltaTMax !== undefined ? { deltaTMax: out.deltaTMax } : {}),
    },
  };
}
