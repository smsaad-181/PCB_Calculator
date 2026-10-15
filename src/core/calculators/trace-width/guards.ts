import { DIM, FOIL_CONVENTIONS } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, CopperBasisKind, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { PERIOD_VS_TAU_CHOICES } from '../pulse-shared';
import type { PeriodVsTau } from '../pulse-shared';

export type Layer = 'outer' | 'inner';

const BASES: readonly string[] = ['nominal', 'finished', 'measured'];

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export interface ValidInputs {
  readonly layer: Layer;
  readonly convention: FoilConvention | undefined;
  readonly width?: Quantity;
  readonly current?: Quantity;
  /** Pulse input (replaces current): peak, duty and the user's period-versus-time-constant statement. */
  readonly peakCurrent?: Quantity;
  readonly duty?: Quantity;
  readonly periodVsTau?: PeriodVsTau;
  readonly deltaT?: Quantity;
  readonly copperWeight?: Quantity;
  readonly copperThickness?: Quantity;
  readonly copperBasis?: CopperBasisKind;
  readonly ambient?: Quantity;
  readonly designMargin?: Quantity;
  readonly currentDerating?: Quantity;
  readonly maxAllowedTemp?: Quantity;
}

type QField =
  | 'width'
  | 'current'
  | 'peakCurrent'
  | 'duty'
  | 'deltaT'
  | 'copperWeight'
  | 'copperThickness'
  | 'ambient'
  | 'designMargin'
  | 'currentDerating'
  | 'maxAllowedTemp';

const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  width: { dim: DIM.LENGTH, name: 'length' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
  peakCurrent: { dim: DIM.CURRENT, name: 'current (A)' },
  duty: { dim: DIM.DIMENSIONLESS, name: 'dimensionless duty cycle in (0, 1]' },
  deltaT: { dim: DIM.TEMPERATURE_DIFFERENCE, name: 'temperature difference (not an absolute temperature)' },
  copperWeight: { dim: DIM.AREAL_MASS, name: 'foil weight (oz/ft2)' },
  copperThickness: { dim: DIM.LENGTH, name: 'length' },
  ambient: { dim: DIM.ABS_TEMPERATURE, name: 'absolute temperature (degC or K, not a temperature difference)' },
  designMargin: { dim: DIM.DIMENSIONLESS, name: 'dimensionless factor' },
  currentDerating: { dim: DIM.DIMENSIONLESS, name: 'dimensionless factor' },
  maxAllowedTemp: { dim: DIM.ABS_TEMPERATURE, name: 'absolute temperature (degC or K, not a temperature difference)' },
};

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const mode = raw['mode'];
  if (mode === 'A') {
    return {
      ok: false,
      error: err(
        'OUT_OF_DOMAIN',
        'mode',
        "Mode A (IPC-2152-informed estimate) is not available yet: its data source is undecided (R-8). It is never substituted; choose mode 'B' (legacy IPC-2221) explicitly.",
      ),
    };
  }
  if (mode !== 'B') {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'mode', "mode must be exactly 'B' (legacy IPC-2221); it is never defaulted and Mode A is not available (R-8).") };
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

  // Current: a steady current, or a pulse (peakCurrent with duty and periodVsTau). A pulse takes the place of the current.
  const hasPk = raw['peakCurrent'] !== undefined;
  const periodRaw = raw['periodVsTau'];
  if (hasPk) {
    if (raw['current'] !== undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'current', 'Give current (steady) or peakCurrent (pulse, with duty and periodVsTau), not both.') };
    }
    if (raw['duty'] === undefined) return { ok: false, error: err('INVALID_INPUT', 'duty', 'duty (0 < D <= 1) is required with peakCurrent.') };
    if (typeof periodRaw !== 'string' || !PERIOD_VS_TAU_CHOICES.includes(periodRaw)) {
      return {
        ok: false,
        error: err('INVALID_INPUT', 'periodVsTau', `periodVsTau must be exactly one of ${PERIOD_VS_TAU_CHOICES.join(', ')} with peakCurrent; it is never defaulted.`),
      };
    }
  } else if (raw['duty'] !== undefined || periodRaw !== undefined) {
    return {
      ok: false,
      error: err('INVALID_INPUT', raw['duty'] !== undefined ? 'duty' : 'periodVsTau', 'duty and periodVsTau are only allowed together with peakCurrent.'),
    };
  }
  const given = (['width', 'current', 'deltaT'] as const).filter((f) => raw[f] !== undefined || (f === 'current' && hasPk));
  if (given.length !== 2) {
    return {
      ok: false,
      error: err(
        'INVALID_INPUT',
        'width',
        'Give exactly two of width, current (or a peakCurrent pulse, which takes the place of the current) and deltaT; the third is solved. Not none, one or all three.',
      ),
    };
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

  const out: Partial<Record<QField, Quantity>> = {};
  const fields: QField[] = [...given.filter((f) => raw[f] !== undefined), hasW ? 'copperWeight' : 'copperThickness'];
  if (hasPk) fields.push('peakCurrent', 'duty');
  for (const f of ['ambient', 'designMargin', 'currentDerating', 'maxAllowedTemp'] as const) {
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
  const dm = out.designMargin;
  if (dm !== undefined && dm.si < 1) {
    return { ok: false, error: err('INVALID_INPUT', 'designMargin', 'designMargin must be at least 1 (a margin below 1 would reduce the minimum width).') };
  }
  const cd = out.currentDerating;
  if (cd !== undefined && cd.si > 1) {
    return { ok: false, error: err('INVALID_INPUT', 'currentDerating', 'currentDerating must be in (0, 1] (a factor above 1 would raise the current limit).') };
  }

  return {
    ok: true,
    value: {
      layer,
      convention: conv as FoilConvention | undefined,
      ...(out.width !== undefined ? { width: out.width } : {}),
      ...(out.current !== undefined ? { current: out.current } : {}),
      ...(out.peakCurrent !== undefined ? { peakCurrent: out.peakCurrent } : {}),
      ...(out.duty !== undefined ? { duty: out.duty } : {}),
      ...(typeof periodRaw === 'string' && hasPk ? { periodVsTau: periodRaw as PeriodVsTau } : {}),
      ...(out.deltaT !== undefined ? { deltaT: out.deltaT } : {}),
      ...(out.copperWeight !== undefined ? { copperWeight: out.copperWeight } : {}),
      ...(out.copperThickness !== undefined ? { copperThickness: out.copperThickness } : {}),
      ...(basisRaw !== undefined ? { copperBasis: basisRaw as CopperBasisKind } : {}),
      ...(out.ambient !== undefined ? { ambient: out.ambient } : {}),
      ...(out.designMargin !== undefined ? { designMargin: out.designMargin } : {}),
      ...(out.currentDerating !== undefined ? { currentDerating: out.currentDerating } : {}),
      ...(out.maxAllowedTemp !== undefined ? { maxAllowedTemp: out.maxAllowedTemp } : {}),
    },
  };
}
