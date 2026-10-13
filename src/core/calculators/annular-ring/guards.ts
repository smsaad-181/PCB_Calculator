import { DIM, toUnit } from '../../units';
import type { Quantity } from '../../units';
import type { CalcError, Result } from '../../result';
import { fabProfileDateProblems } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { guardQuantity } from '../copper-converter/guards';

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export const HOLE_TYPE_INPUTS = ['via', 'pth', 'npth'] as const;
export type HoleType = (typeof HOLE_TYPE_INPUTS)[number];
export const RING_REFERENCES = ['finished', 'drill'] as const;
export type RingReference = (typeof RING_REFERENCES)[number];
export const LAYER_COUNT_INPUTS = ['1', '2', 'multilayer'] as const;
export type LayerCountInput = (typeof LAYER_COUNT_INPUTS)[number];
export const LAYER_SIDE_INPUTS = ['inner', 'outer'] as const;
export type LayerSideInput = (typeof LAYER_SIDE_INPUTS)[number];

/** A tolerance is either entered by the user or taken from the fab profile (only for the exact scope, only if published). */
export type ToleranceInput = Quantity | 'profile';
export type ToleranceSource = { readonly kind: 'user'; readonly value: Quantity } | { readonly kind: 'profile' };

export interface ValidInputs {
  readonly padDiameter: Quantity;
  readonly finishedHoleDiameter: Quantity;
  readonly holeType: HoleType;
  readonly drillDiameter?: Quantity;
  readonly platingThickness?: Quantity;
  readonly ringReference: RingReference;
  /** True when the caller did not choose the ring reference and "finished" was applied. */
  readonly ringReferenceDefaulted: boolean;
  readonly layerCount?: LayerCountInput;
  /** Ordered copper weight in oz/ft2, converted from the areal-mass quantity. */
  readonly copperOz?: number;
  readonly copperWeight?: Quantity;
  readonly layerSide?: LayerSideInput;
  readonly holeSizeTolPlus?: ToleranceSource;
  readonly positionTol?: ToleranceSource;
  readonly padSizeTol?: ToleranceSource;
  readonly userMinimumRing?: Quantity;
  readonly userRecommendedRing?: Quantity;
  readonly fabProfile?: ParsedFabProfile;
  readonly today?: string;
}

const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T => typeof x === 'string' && (list as readonly string[]).includes(x);

function guardTolerance(field: string, v: unknown): Result<ToleranceSource, CalcError> {
  if (v === 'profile') return { ok: true, value: { kind: 'profile' } };
  const g = guardQuantity(field, v, DIM.LENGTH, 'length (a tolerance, or "profile" to take it from the fab profile)');
  if (!g.ok) return g;
  return { ok: true, value: { kind: 'user', value: g.value } };
}

function isParsedProfile(x: unknown): x is ParsedFabProfile {
  return (
    isRecord(x) &&
    typeof x['id'] === 'string' &&
    typeof x['profileDate'] === 'string' &&
    typeof x['status'] === 'string' &&
    Array.isArray(x['ledgerIds']) &&
    Array.isArray(x['scopedLimits']) &&
    isRecord(x['limits'])
  );
}

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  if (!oneOf(HOLE_TYPE_INPUTS, raw['holeType'])) {
    return { ok: false, error: err('INVALID_INPUT', 'holeType', `holeType must be exactly one of ${HOLE_TYPE_INPUTS.join(', ')}; it is required and never defaulted because the limits differ by hole type.`) };
  }
  const holeType = raw['holeType'];

  const need = (field: 'padDiameter' | 'finishedHoleDiameter', name: string): Result<Quantity, CalcError> => {
    if (raw[field] === undefined) return { ok: false, error: err('INVALID_INPUT', field, `${field} is required.`) };
    return guardQuantity(field, raw[field], DIM.LENGTH, name);
  };
  const pad = need('padDiameter', 'length (pad diameter)');
  if (!pad.ok) return pad;
  const hole = need('finishedHoleDiameter', 'length (FINISHED hole diameter after plating, not the drill diameter)');
  if (!hole.ok) return hole;
  if (!(pad.value.si > hole.value.si)) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'padDiameter', 'The pad diameter must be larger than the hole diameter: there is no annular ring otherwise.') };
  }

  let drill: Quantity | undefined;
  if (raw['drillDiameter'] !== undefined) {
    const g = guardQuantity('drillDiameter', raw['drillDiameter'], DIM.LENGTH, 'length (drill diameter, the tool size before plating)');
    if (!g.ok) return g;
    if (g.value.si < hole.value.si) {
      return { ok: false, error: err('OUT_OF_DOMAIN', 'drillDiameter', 'The drill diameter cannot be smaller than the finished hole diameter (plating only shrinks the hole). Check that you did not swap the two.') };
    }
    if (!(pad.value.si > g.value.si)) {
      return { ok: false, error: err('OUT_OF_DOMAIN', 'drillDiameter', 'The pad diameter must be larger than the drill diameter: there is no ring on the drill otherwise.') };
    }
    drill = g.value;
  }

  let plating: Quantity | undefined;
  if (raw['platingThickness'] !== undefined) {
    if (holeType === 'npth') {
      return { ok: false, error: err('INVALID_INPUT', 'platingThickness', 'A non-plated hole (NPTH) has no barrel plating; remove platingThickness.') };
    }
    const g = guardQuantity('platingThickness', raw['platingThickness'], DIM.LENGTH, 'length (barrel plating thickness)');
    if (!g.ok) return g;
    if (drill === undefined) {
      return { ok: false, error: err('INVALID_INPUT', 'platingThickness', 'platingThickness is only used together with drillDiameter (to compare the drill and the finished hole); it is never used to estimate a drill size.') };
    }
    plating = g.value;
  }

  let ringReference: RingReference = 'finished';
  let ringReferenceDefaulted = true;
  if (raw['ringReference'] !== undefined) {
    if (!oneOf(RING_REFERENCES, raw['ringReference'])) {
      return { ok: false, error: err('INVALID_INPUT', 'ringReference', `ringReference must be one of ${RING_REFERENCES.join(', ')}.`) };
    }
    ringReference = raw['ringReference'];
    ringReferenceDefaulted = false;
  }
  if (ringReference === 'drill' && drill === undefined) {
    return { ok: false, error: err('INVALID_INPUT', 'drillDiameter', 'A ring referenced to the drill needs the drill diameter (drillDiameter).') };
  }

  let layerCount: LayerCountInput | undefined;
  if (raw['layerCount'] !== undefined) {
    if (!oneOf(LAYER_COUNT_INPUTS, raw['layerCount'])) {
      return { ok: false, error: err('INVALID_INPUT', 'layerCount', `layerCount must be one of ${LAYER_COUNT_INPUTS.join(', ')} (the scopes fabricators publish).`) };
    }
    layerCount = raw['layerCount'];
  }
  let layerSide: LayerSideInput | undefined;
  if (raw['layerSide'] !== undefined) {
    if (!oneOf(LAYER_SIDE_INPUTS, raw['layerSide'])) {
      return { ok: false, error: err('INVALID_INPUT', 'layerSide', `layerSide must be one of ${LAYER_SIDE_INPUTS.join(', ')}.`) };
    }
    layerSide = raw['layerSide'];
  }
  let copperWeight: Quantity | undefined;
  let copperOz: number | undefined;
  if (raw['copperWeight'] !== undefined) {
    const g = guardQuantity('copperWeight', raw['copperWeight'], DIM.AREAL_MASS, 'areal mass (ordered copper weight, oz/ft2)');
    if (!g.ok) return g;
    copperWeight = g.value;
    copperOz = toUnit(g.value, 'oz/ft2');
  }

  const tol: Partial<Record<'holeSizeTolPlus' | 'positionTol' | 'padSizeTol', ToleranceSource>> = {};
  for (const f of ['holeSizeTolPlus', 'positionTol', 'padSizeTol'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardTolerance(f, raw[f]);
    if (!g.ok) return g;
    tol[f] = g.value;
  }

  const mins: Partial<Record<'userMinimumRing' | 'userRecommendedRing', Quantity>> = {};
  for (const f of ['userMinimumRing', 'userRecommendedRing'] as const) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], DIM.LENGTH, 'length (a ring minimum from your fabricator)');
    if (!g.ok) return g;
    mins[f] = g.value;
  }

  const usesProfileTol = Object.values(tol).some((t) => t.kind === 'profile');
  let fabProfile: ParsedFabProfile | undefined;
  let today: string | undefined;
  if (raw['fabProfile'] !== undefined) {
    if (!isParsedProfile(raw['fabProfile'])) {
      return { ok: false, error: err('INVALID_INPUT', 'fabProfile', 'fabProfile must be a profile returned by parseFabProfile.') };
    }
    fabProfile = raw['fabProfile'];
  } else if (usesProfileTol) {
    return { ok: false, error: err('INVALID_INPUT', 'fabProfile', 'A tolerance set to "profile" needs a fab profile (fabProfile).') };
  }
  if (fabProfile !== undefined) {
    const t = raw['today'];
    if (typeof t !== 'string') {
      return { ok: false, error: err('INVALID_INPUT', 'today', 'today (YYYY-MM-DD) must be supplied with a fab profile: the profile age is computed from it and no clock is read here.') };
    }
    let problems: string[];
    try {
      problems = fabProfileDateProblems(fabProfile, t);
    } catch {
      return { ok: false, error: err('INVALID_INPUT', 'today', 'today must be a real calendar date formatted YYYY-MM-DD.') };
    }
    if (problems.length > 0) {
      return { ok: false, error: err('INVALID_INPUT', 'fabProfile', `The fab profile has a date in the future: ${problems.join('; ')}. A future date would hide that the data is stale.`) };
    }
    today = t;
  }

  return {
    ok: true,
    value: {
      padDiameter: pad.value,
      finishedHoleDiameter: hole.value,
      holeType,
      ...(drill !== undefined ? { drillDiameter: drill } : {}),
      ...(plating !== undefined ? { platingThickness: plating } : {}),
      ringReference,
      ringReferenceDefaulted,
      ...(layerCount !== undefined ? { layerCount } : {}),
      ...(copperOz !== undefined && copperWeight !== undefined ? { copperOz, copperWeight } : {}),
      ...(layerSide !== undefined ? { layerSide } : {}),
      ...(tol.holeSizeTolPlus !== undefined ? { holeSizeTolPlus: tol.holeSizeTolPlus } : {}),
      ...(tol.positionTol !== undefined ? { positionTol: tol.positionTol } : {}),
      ...(tol.padSizeTol !== undefined ? { padSizeTol: tol.padSizeTol } : {}),
      ...(mins.userMinimumRing !== undefined ? { userMinimumRing: mins.userMinimumRing } : {}),
      ...(mins.userRecommendedRing !== undefined ? { userRecommendedRing: mins.userRecommendedRing } : {}),
      ...(fabProfile !== undefined && today !== undefined ? { fabProfile, today } : {}),
    },
  };
}
