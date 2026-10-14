import { DIM } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, CopperBasisKind, Result } from '../../result';
import { fabProfileDateProblems } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { guardQuantity } from '../copper-converter/guards';
import { validate as validateTrace } from '../trace-resistance/guards';
import type { Layer } from '../trace-resistance/guards';
import { LAYER_COUNT_INPUTS } from '../annular-ring/guards';
import type { LayerCountInput } from '../annular-ring/guards';
import { validate as validateFeed } from '../voltage-drop/guards';
import type { LoadField, ReturnPath } from '../voltage-drop/guards';
import { meta } from './meta';

export type { LoadField, ReturnPath } from '../voltage-drop/guards';
export type { LayerCountInput } from '../annular-ring/guards';

export const USER_ELEMENT_KINDS = ['connector', 'pad', 'spoke', 'pour-neck', 'cable', 'resistance'] as const;
export type UserElementKind = (typeof USER_ELEMENT_KINDS)[number];
export const ELEMENT_KINDS = ['trace', 'via', ...USER_ELEMENT_KINDS] as const;
export type PathLoadElementKind = (typeof ELEMENT_KINDS)[number];

/** A copper trace. Its current limit is the LEGACY IPC-2221 capacity at `allowedTempRise` (a temperature DIFFERENCE, never an absolute temperature). */
export interface TraceLoadElement {
  readonly kind: 'trace';
  readonly label: string;
  readonly layer: Layer;
  readonly length: Quantity;
  readonly width: Quantity;
  readonly copperWeight?: Quantity;
  readonly copperThickness?: Quantity;
  readonly copperBasis?: CopperBasisKind;
  readonly convention?: FoilConvention;
  /** Absolute temperature the resistance is evaluated at; default 25 degC, reported as a default. */
  readonly conductorTemperature?: Quantity;
  /** Required, never defaulted: the temperature rise you allow this trace. */
  readonly allowedTempRise: Quantity;
}

/** A via (or an array of N identical vias in parallel). The calculator derives no rating from geometry: no `ratedCurrent` means UNRATED. */
export interface ViaLoadElement {
  readonly kind: 'via';
  readonly label: string;
  /** FINISHED (inside) hole diameter after plating. */
  readonly finishedHoleDiameter: Quantity;
  /** Barrel plating thickness: required, never pre-filled. */
  readonly platingThickness: Quantity;
  readonly barrelLength: Quantity;
  readonly count: number;
  readonly conductorTemperature?: Quantity;
  /** Plated copper resistivity at 20 degC (S-012, UNVERIFIED); replaces the pure-copper default. */
  readonly resistivity?: Quantity;
  /** Echoed into the net-class export only; never derived or recommended. */
  readonly drillDiameter?: Quantity;
  readonly padDiameter?: Quantity;
  /** The user's rating for the WHOLE element (the whole array when count > 1), with its source. */
  readonly ratedCurrent?: Quantity;
  readonly ratingSource?: string;
}

/** A user-given ohmic element with an optional user-given rating. */
export interface UserLoadElement {
  readonly kind: UserElementKind;
  readonly label: string;
  readonly resistance: Quantity;
  readonly sourceNote: string;
  readonly ratedCurrent?: Quantity;
  readonly ratingSource?: string;
}

export type LoadElement = TraceLoadElement | ViaLoadElement | UserLoadElement;

export interface ValidInputs {
  readonly vsource: Quantity;
  readonly loads: readonly { readonly field: LoadField; readonly value: Quantity }[];
  readonly returnPath: ReturnPath;
  readonly dropBudget?: Quantity;
  readonly elements: readonly LoadElement[];
  readonly returnElements: readonly LoadElement[];
  readonly layerCount?: LayerCountInput;
  readonly fabProfile?: ParsedFabProfile;
  readonly today?: string;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Keys that would put an absolute temperature on an element as a limit or rating (G3-d). */
const ABSOLUTE_TEMPERATURE_KEYS: readonly string[] = [
  'maxTemperature',
  'ratedTemperature',
  'limitTemperature',
  'temperatureLimit',
  'maxTemp',
  'ratedTemp',
  'maxOperatingTemperature',
  'allowedTemperature',
  'temperatureRating',
];

const COMMON_KEYS = ['kind', 'label'] as const;
const KEYS: Record<PathLoadElementKind, readonly string[]> = {
  trace: [...COMMON_KEYS, 'layer', 'length', 'width', 'copperWeight', 'copperThickness', 'copperBasis', 'convention', 'conductorTemperature', 'allowedTempRise'],
  via: [...COMMON_KEYS, 'finishedHoleDiameter', 'platingThickness', 'barrelLength', 'count', 'conductorTemperature', 'resistivity', 'drillDiameter', 'padDiameter', 'ratedCurrent', 'ratingSource'],
  connector: [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
  pad: [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
  spoke: [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
  'pour-neck': [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
  cable: [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
  resistance: [...COMMON_KEYS, 'resistance', 'sourceNote', 'ratedCurrent', 'ratingSource'],
};

function guardText(path: string, v: unknown, what: string, max: number): Result<string, CalcError> {
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) {
    return { ok: false, error: err('INVALID_INPUT', path, `${what} is required: a non-empty string of at most ${String(max)} characters.`) };
  }
  return { ok: true, value: v };
}

/** The optional rating pair: a rating needs its source, and a source needs a rating. */
function guardRating(path: string, raw: Record<string, unknown>): Result<{ ratedCurrent?: Quantity; ratingSource?: string }, CalcError> {
  const hasR = raw['ratedCurrent'] !== undefined;
  const hasS = raw['ratingSource'] !== undefined;
  if (!hasR && !hasS) return { ok: true, value: {} };
  if (!hasR) return { ok: false, error: err('INVALID_INPUT', `${path}.ratingSource`, 'ratingSource is given without ratedCurrent; give both or neither.') };
  const g = guardQuantity(`${path}.ratedCurrent`, raw['ratedCurrent'], DIM.CURRENT, 'current (A)');
  if (!g.ok) return g;
  const [lo, hi] = meta.validity.ratedCurrentA;
  if (g.value.si < lo || g.value.si > hi) {
    return { ok: false, error: err('OUT_OF_DOMAIN', `${path}.ratedCurrent`, `ratedCurrent must be within ${String(lo)} to ${String(hi)} A (check the unit).`) };
  }
  if (!hasS) {
    return { ok: false, error: err('INVALID_INPUT', `${path}.ratingSource`, 'ratingSource is required with ratedCurrent: say where the rating comes from (datasheet, drawing, measurement). A rating without a source is not accepted.') };
  }
  const s = guardText(`${path}.ratingSource`, raw['ratingSource'], 'ratingSource', meta.validity.noteMaxLength);
  if (!s.ok) return s;
  return { ok: true, value: { ratedCurrent: g.value, ratingSource: s.value } };
}

function guardElement(path: string, raw: unknown): Result<LoadElement, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', path, `${path} must be an object.`) };
  const label = guardText(`${path}.label`, raw['label'], 'label', meta.validity.labelMaxLength);
  if (!label.ok) return label;
  for (const k of ABSOLUTE_TEMPERATURE_KEYS) {
    if (raw[k] !== undefined) {
      return {
        ok: false,
        error: err(
          'INVALID_INPUT',
          `${path}.${k}`,
          `${path} (${label.value}): an absolute-temperature limit cannot be ranked against a current. Give a trace its allowed temperature RISE (allowedTempRise), or convert a datasheet temperature rating to a current rating yourself and enter it as ratedCurrent with its source.`,
        ),
      };
    }
  }
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !(ELEMENT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: err('INVALID_INPUT', `${path}.kind`, `kind must be exactly one of ${ELEMENT_KINDS.join(', ')}.`) };
  }
  const k = kind as PathLoadElementKind;
  const unknown = Object.keys(raw).filter((key) => !KEYS[k].includes(key));
  if (unknown.length > 0) {
    return { ok: false, error: err('INVALID_INPUT', `${path}.${unknown[0] ?? 'kind'}`, `${path} (${label.value}): "${unknown.join('", "')}" is not an input of a ${k} element (allowed: ${KEYS[k].join(', ')}).`) };
  }

  if (k === 'trace') {
    if (raw['allowedTempRise'] === undefined) {
      return { ok: false, error: err('INVALID_INPUT', `${path}.allowedTempRise`, `${path} (${label.value}): allowedTempRise is required and never defaulted: the temperature rise you allow this trace sets its legacy current limit.`) };
    }
    const rise = guardQuantity(`${path}.allowedTempRise`, raw['allowedTempRise'], DIM.TEMPERATURE_DIFFERENCE, 'temperature difference (a rise in kelvin or degC, not an absolute temperature)');
    if (!rise.ok) return rise;
    const t = validateTrace({
      layer: raw['layer'],
      convention: raw['convention'],
      copperBasis: raw['copperBasis'],
      copperWeight: raw['copperWeight'],
      copperThickness: raw['copperThickness'],
      length: raw['length'],
      width: raw['width'],
      ambient: raw['conductorTemperature'],
    });
    if (!t.ok) {
      const f = t.error.field === 'ambient' ? 'conductorTemperature' : (t.error.field ?? 'inputs');
      return { ok: false, error: { ...t.error, field: `${path}.${f}`, message: `${path} (${label.value}): ${t.error.message}` } };
    }
    const v = t.value;
    return {
      ok: true,
      value: {
        kind: 'trace',
        label: label.value,
        layer: v.layer,
        length: v.length,
        width: v.width,
        ...(v.copperWeight !== undefined ? { copperWeight: v.copperWeight } : {}),
        ...(v.copperThickness !== undefined ? { copperThickness: v.copperThickness } : {}),
        ...(v.copperBasis !== undefined ? { copperBasis: v.copperBasis } : {}),
        ...(v.convention !== undefined ? { convention: v.convention } : {}),
        ...(v.ambient !== undefined ? { conductorTemperature: v.ambient } : {}),
        allowedTempRise: rise.value,
      },
    };
  }

  if (k === 'via') {
    const q = (f: string, dim: Quantity['dim'], name: string, required: boolean): Result<Quantity | undefined, CalcError> => {
      if (raw[f] === undefined) {
        if (!required) return { ok: true, value: undefined };
        const extra = f === 'platingThickness' ? ' It is required and never pre-filled: take it from your fabricator or measure it.' : '';
        return { ok: false, error: err('INVALID_INPUT', `${path}.${f}`, `${path} (${label.value}): ${f} is required.${extra}`) };
      }
      return guardQuantity(`${path}.${f}`, raw[f], dim, name);
    };
    const hole = q('finishedHoleDiameter', DIM.LENGTH, 'length (finished hole diameter, not the drill diameter)', true);
    if (!hole.ok) return hole;
    const plating = q('platingThickness', DIM.LENGTH, 'length (plating thickness)', true);
    if (!plating.ok) return plating;
    const barrel = q('barrelLength', DIM.LENGTH, 'length (barrel length)', true);
    if (!barrel.ok) return barrel;
    const temp = q('conductorTemperature', DIM.ABS_TEMPERATURE, 'absolute temperature (degC or K, not a temperature difference)', false);
    if (!temp.ok) return temp;
    const rho = q('resistivity', DIM.RESISTIVITY, 'resistivity (ohm metres)', false);
    if (!rho.ok) return rho;
    const drill = q('drillDiameter', DIM.LENGTH, 'length (drill diameter)', false);
    if (!drill.ok) return drill;
    const pad = q('padDiameter', DIM.LENGTH, 'length (pad diameter)', false);
    if (!pad.ok) return pad;
    const n = raw['count'];
    if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > meta.validity.viaCountMax) {
      return { ok: false, error: err('INVALID_INPUT', `${path}.count`, `${path} (${label.value}): count (number of vias in parallel) must be a whole number from 1 to ${String(meta.validity.viaCountMax)}.`) };
    }
    const holeSi = (hole.value as Quantity).si;
    if (drill.value !== undefined && drill.value.si < holeSi) {
      return { ok: false, error: err('OUT_OF_DOMAIN', `${path}.drillDiameter`, `${path} (${label.value}): the drill diameter is smaller than the finished hole diameter; the finished hole is the drill minus the plating, so check which value is which.`) };
    }
    if (pad.value !== undefined && pad.value.si <= (drill.value?.si ?? holeSi)) {
      return { ok: false, error: err('OUT_OF_DOMAIN', `${path}.padDiameter`, `${path} (${label.value}): the pad diameter must be larger than the hole.`) };
    }
    const rating = guardRating(path, raw);
    if (!rating.ok) return rating;
    return {
      ok: true,
      value: {
        kind: 'via',
        label: label.value,
        finishedHoleDiameter: hole.value as Quantity,
        platingThickness: plating.value as Quantity,
        barrelLength: barrel.value as Quantity,
        count: n,
        ...(temp.value !== undefined ? { conductorTemperature: temp.value } : {}),
        ...(rho.value !== undefined ? { resistivity: rho.value } : {}),
        ...(drill.value !== undefined ? { drillDiameter: drill.value } : {}),
        ...(pad.value !== undefined ? { padDiameter: pad.value } : {}),
        ...rating.value,
      },
    };
  }

  // connector, pad, spoke, pour-neck, cable, resistance
  const r = guardQuantity(`${path}.resistance`, raw['resistance'], DIM.RESISTANCE, 'resistance (ohm)');
  if (!r.ok) return r;
  const note = guardText(`${path}.sourceNote`, raw['sourceNote'], 'sourceNote (where this resistance comes from: datasheet, measurement, estimate)', meta.validity.noteMaxLength);
  if (!note.ok) return note;
  const rating = guardRating(path, raw);
  if (!rating.ok) return rating;
  return { ok: true, value: { kind: k as UserElementKind, label: label.value, resistance: r.value, sourceNote: note.value, ...rating.value } };
}

function guardList(name: string, raw: unknown, min: number, max: number): Result<LoadElement[], CalcError> {
  if (!Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', name, `${name} must be an array of path elements.`) };
  if (raw.length < min) return { ok: false, error: err('INVALID_INPUT', name, `${name} needs at least ${String(min)} element.`) };
  if (raw.length > max) return { ok: false, error: err('OUT_OF_DOMAIN', name, `${name} supports at most ${String(max)} elements (${String(raw.length)} given).`) };
  const out: LoadElement[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = guardElement(`${name}[${String(i)}]`, raw[i]);
    if (!g.ok) return g;
    out.push(g.value);
  }
  return { ok: true, value: out };
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

/** Placeholder ohmic element so the voltage-drop guard can validate the feed, load, return path and labels without the real resistances. */
const placeholder = (e: LoadElement): Record<string, unknown> => ({
  kind: 'resistance',
  label: e.label,
  resistance: { si: 1e-3, dim: DIM.RESISTANCE },
  sourceNote: 'placeholder',
});

/** Full input validation. Returns an error value for anything malformed; never throws. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const fwd = guardList('elements', raw['elements'], 1, meta.validity.maxForwardElements);
  if (!fwd.ok) return fwd;
  let ret: LoadElement[] = [];
  if (raw['returnElements'] !== undefined) {
    const r = guardList('returnElements', raw['returnElements'], 0, meta.validity.maxReturnElements);
    if (!r.ok) return r;
    ret = r.value;
  }

  // Feed, load kind (exactly one is checked after the path resistance is known), return rule, labels and drop budget.
  const feed: Record<string, unknown> = {
    vsource: raw['vsource'],
    returnPath: raw['returnPath'],
    elements: fwd.value.map(placeholder),
  };
  for (const f of ['loadCurrent', 'loadPower', 'loadResistance', 'loadVoltage', 'dropBudgetPercent'] as const) {
    if (raw[f] !== undefined) feed[f] = raw[f];
  }
  if (raw['returnElements'] !== undefined) feed['returnElements'] = ret.map(placeholder);
  const f = validateFeed(feed);
  if (!f.ok) return f;

  let layerCount: LayerCountInput | undefined;
  if (raw['layerCount'] !== undefined) {
    const lc = raw['layerCount'];
    if (typeof lc !== 'string' || !(LAYER_COUNT_INPUTS as readonly string[]).includes(lc)) {
      return { ok: false, error: err('INVALID_INPUT', 'layerCount', `layerCount must be one of ${LAYER_COUNT_INPUTS.join(', ')} (the scopes fabricators publish).`) };
    }
    layerCount = lc as LayerCountInput;
  }
  let fabProfile: ParsedFabProfile | undefined;
  let today: string | undefined;
  if (raw['fabProfile'] !== undefined) {
    if (!isParsedProfile(raw['fabProfile'])) {
      return { ok: false, error: err('INVALID_INPUT', 'fabProfile', 'fabProfile must be a profile returned by parseFabProfile.') };
    }
    fabProfile = raw['fabProfile'];
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
  } else if (layerCount !== undefined || raw['today'] !== undefined) {
    return { ok: false, error: err('INVALID_INPUT', layerCount !== undefined ? 'layerCount' : 'today', 'layerCount and today are only used with a fab profile (fabProfile); none was given.') };
  }

  return {
    ok: true,
    value: {
      vsource: f.value.vsource,
      loads: f.value.loads,
      returnPath: f.value.returnPath,
      ...(f.value.dropBudget !== undefined ? { dropBudget: f.value.dropBudget } : {}),
      elements: fwd.value,
      returnElements: ret,
      ...(layerCount !== undefined ? { layerCount } : {}),
      ...(fabProfile !== undefined && today !== undefined ? { fabProfile, today } : {}),
    },
  };
}
