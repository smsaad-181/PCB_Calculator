import { DIM, FOIL_CONVENTIONS } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, CopperBasisKind, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';

export type Layer = 'outer' | 'inner';

const BASES: readonly string[] = ['nominal', 'finished', 'measured'];

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export interface ValidInputs {
  readonly layer: Layer;
  readonly convention: FoilConvention | undefined;
  readonly length: Quantity;
  readonly width: Quantity;
  readonly copperWeight?: Quantity;
  readonly copperThickness?: Quantity;
  readonly copperBasis?: CopperBasisKind;
  readonly ambient?: Quantity;
  readonly deltaT?: Quantity;
  readonly resistivity?: Quantity;
  readonly alpha?: Quantity;
  readonly frequency?: Quantity;
  readonly current?: Quantity;
}

type QField =
  | 'length'
  | 'width'
  | 'copperWeight'
  | 'copperThickness'
  | 'ambient'
  | 'resistivity'
  | 'alpha'
  | 'frequency'
  | 'current';

const SPEC: Record<QField, { dim: Quantity['dim']; name: string }> = {
  length: { dim: DIM.LENGTH, name: 'length' },
  width: { dim: DIM.LENGTH, name: 'length' },
  copperWeight: { dim: DIM.AREAL_MASS, name: 'foil weight (oz/ft2)' },
  copperThickness: { dim: DIM.LENGTH, name: 'length' },
  ambient: { dim: DIM.ABS_TEMPERATURE, name: 'absolute temperature (degC or K, not a temperature difference)' },
  resistivity: { dim: DIM.RESISTIVITY, name: 'resistivity (ohm metres)' },
  alpha: { dim: DIM.PER_KELVIN, name: 'temperature coefficient (per kelvin)' },
  frequency: { dim: DIM.FREQUENCY, name: 'frequency (Hz)' },
  current: { dim: DIM.CURRENT, name: 'current (A)' },
};
const DELTA_T_NAME = 'temperature difference (not an absolute temperature)';

/** A temperature difference may be zero or negative: only shape, dimension and finiteness are checked. */
function guardSigned(field: string, v: unknown, dim: Quantity['dim'], dimName: string): Result<Quantity, CalcError> {
  if (isRecord(v) && typeof v['si'] === 'number' && Number.isFinite(v['si']) && isRecord(v['dim'])) {
    const shape = guardQuantity(field, { si: 1, dim: v['dim'] }, dim, dimName);
    if (!shape.ok) return shape;
    return { ok: true, value: v as unknown as Quantity };
  }
  return guardQuantity(field, v, dim, dimName);
}

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

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

  const out: Partial<Record<QField, Quantity>> = {};
  const fields: QField[] = ['length', 'width', hasW ? 'copperWeight' : 'copperThickness'];
  for (const f of ['ambient', 'resistivity', 'alpha', 'frequency', 'current'] as const) {
    if (raw[f] !== undefined) fields.push(f);
  }
  for (const f of fields) {
    const g = guardQuantity(f, raw[f], SPEC[f].dim, SPEC[f].name);
    if (!g.ok) return g;
    out[f] = g.value;
  }
  let deltaT: Quantity | undefined;
  if (raw['deltaT'] !== undefined) {
    const g = guardSigned('deltaT', raw['deltaT'], DIM.TEMPERATURE_DIFFERENCE, DELTA_T_NAME);
    if (!g.ok) return g;
    deltaT = g.value;
  }
  if (deltaT !== undefined) {
    const base = out.ambient?.si ?? 298.15;
    if (!(base + deltaT.si > 0)) {
      return {
        ok: false,
        error: err('OUT_OF_DOMAIN', 'deltaT', 'ambient plus deltaT would put the conductor below absolute zero (0 K); check the sign and unit of deltaT.'),
      };
    }
  }

  const length = out.length as Quantity;
  const width = out.width as Quantity;
  return {
    ok: true,
    value: {
      layer,
      convention: conv as FoilConvention | undefined,
      length,
      width,
      ...(out.copperWeight !== undefined ? { copperWeight: out.copperWeight } : {}),
      ...(out.copperThickness !== undefined ? { copperThickness: out.copperThickness } : {}),
      ...(basisRaw !== undefined ? { copperBasis: basisRaw as CopperBasisKind } : {}),
      ...(out.ambient !== undefined ? { ambient: out.ambient } : {}),
      ...(deltaT !== undefined ? { deltaT } : {}),
      ...(out.resistivity !== undefined ? { resistivity: out.resistivity } : {}),
      ...(out.alpha !== undefined ? { alpha: out.alpha } : {}),
      ...(out.frequency !== undefined ? { frequency: out.frequency } : {}),
      ...(out.current !== undefined ? { current: out.current } : {}),
    },
  };
}
