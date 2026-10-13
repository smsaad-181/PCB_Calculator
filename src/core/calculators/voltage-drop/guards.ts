import { DIM } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { CalcError, CopperBasisKind, Result } from '../../result';
import { guardQuantity } from '../copper-converter/guards';
import { validate as validateTrace } from '../trace-resistance/guards';
import type { Layer } from '../trace-resistance/guards';
import { meta } from './meta';

export type ReturnPath = 'included-in-list' | 'same-as-forward' | 'not-counted';
export const RETURN_PATHS: readonly ReturnPath[] = ['included-in-list', 'same-as-forward', 'not-counted'];

export type LoadField = 'loadCurrent' | 'loadPower' | 'loadResistance' | 'loadVoltage';
export const LOAD_FIELDS: readonly LoadField[] = ['loadCurrent', 'loadPower', 'loadResistance', 'loadVoltage'];
const LOAD_SPEC: Record<LoadField, { dim: Quantity['dim']; name: string }> = {
  loadCurrent: { dim: DIM.CURRENT, name: 'current (A)' },
  loadPower: { dim: DIM.POWER, name: 'power (W)' },
  loadResistance: { dim: DIM.RESISTANCE, name: 'resistance (ohm)' },
  loadVoltage: { dim: DIM.VOLTAGE, name: 'voltage (V)' },
};

/** A copper trace; the fields mirror the trace-resistance inputs (conductorTemperature = its `ambient`, no deltaT). */
export interface TraceElement {
  readonly kind: 'trace';
  readonly label: string;
  readonly layer: Layer;
  readonly length: Quantity;
  readonly width: Quantity;
  readonly copperWeight?: Quantity;
  readonly copperThickness?: Quantity;
  readonly copperBasis?: CopperBasisKind;
  readonly convention?: FoilConvention;
  /** Absolute temperature of the copper; default 25 degC, reported as a default. */
  readonly conductorTemperature?: Quantity;
}
/** A user-given ohmic element (cable, connector, fuse, shunt, ...): the value is taken as given, at operating conditions. */
export interface ResistanceElement {
  readonly kind: 'resistance';
  readonly label: string;
  readonly resistance: Quantity;
  readonly sourceNote: string;
}
export type PathElement = TraceElement | ResistanceElement;

export interface ValidInputs {
  readonly vsource: Quantity;
  readonly loads: readonly { readonly field: LoadField; readonly value: Quantity }[];
  readonly returnPath: ReturnPath;
  readonly elements: readonly PathElement[];
  readonly returnElements: readonly PathElement[];
  readonly dropBudget?: Quantity;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

function guardElement(path: string, raw: unknown): Result<PathElement, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', path, `${path} must be an object.`) };
  const label = raw['label'];
  if (typeof label !== 'string' || label.trim() === '' || label.length > 80) {
    return { ok: false, error: err('INVALID_INPUT', `${path}.label`, 'label must be a non-empty string of at most 80 characters.') };
  }
  const kind = raw['kind'];
  if (kind === 'resistance') {
    const g = guardQuantity(`${path}.resistance`, raw['resistance'], DIM.RESISTANCE, 'resistance (ohm)');
    if (!g.ok) return g;
    const note = raw['sourceNote'];
    if (typeof note !== 'string' || note.trim() === '') {
      return { ok: false, error: err('INVALID_INPUT', `${path}.sourceNote`, 'sourceNote is required: say where this resistance comes from (datasheet, measurement, estimate).') };
    }
    const [lo, hi] = meta.validity.elementResistanceOhm;
    if (g.value.si < lo || g.value.si > hi) {
      return { ok: false, error: err('OUT_OF_DOMAIN', `${path}.resistance`, `resistance must be within ${String(lo)} to ${String(hi)} ohm for a path element (check the unit).`) };
    }
    return { ok: true, value: { kind: 'resistance', label, resistance: g.value, sourceNote: note } };
  }
  if (kind === 'trace') {
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
      return { ok: false, error: { ...t.error, field: `${path}.${f}`, message: `${path} (${label}): ${t.error.message}` } };
    }
    const v = t.value;
    return {
      ok: true,
      value: {
        kind: 'trace',
        label,
        layer: v.layer,
        length: v.length,
        width: v.width,
        ...(v.copperWeight !== undefined ? { copperWeight: v.copperWeight } : {}),
        ...(v.copperThickness !== undefined ? { copperThickness: v.copperThickness } : {}),
        ...(v.copperBasis !== undefined ? { copperBasis: v.copperBasis } : {}),
        ...(v.convention !== undefined ? { convention: v.convention } : {}),
        ...(v.ambient !== undefined ? { conductorTemperature: v.ambient } : {}),
      },
    };
  }
  return { ok: false, error: err('INVALID_INPUT', `${path}.kind`, 'kind must be exactly "trace" or "resistance".') };
}

function guardList(name: string, raw: unknown, min: number): Result<PathElement[], CalcError> {
  if (!Array.isArray(raw)) return { ok: false, error: err('INVALID_INPUT', name, `${name} must be an array of path elements.`) };
  if (raw.length < min) return { ok: false, error: err('INVALID_INPUT', name, `${name} needs at least ${String(min)} element.`) };
  const out: PathElement[] = [];
  for (let i = 0; i < raw.length; i++) {
    const g = guardElement(`${name}[${String(i)}]`, raw[i]);
    if (!g.ok) return g;
    out.push(g.value);
  }
  return { ok: true, value: out };
}

/** Full input validation. Returns an error value for anything malformed; never throws. Consistency of several load quantities needs R_path and is checked in calc.ts. */
export function validate(raw: unknown): Result<ValidInputs, CalcError> {
  if (!isRecord(raw)) return { ok: false, error: err('INVALID_INPUT', 'inputs', 'inputs must be an object.') };

  const vs = guardQuantity('vsource', raw['vsource'], DIM.VOLTAGE, 'voltage (V)');
  if (!vs.ok) return vs;
  if (vs.value.si > meta.validity.voltageV * 1e6) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'vsource', 'vsource is implausibly large for a board-level feed (check the unit).') };
  }

  const loads: { field: LoadField; value: Quantity }[] = [];
  for (const f of LOAD_FIELDS) {
    if (raw[f] === undefined) continue;
    const g = guardQuantity(f, raw[f], LOAD_SPEC[f].dim, LOAD_SPEC[f].name);
    if (!g.ok) return g;
    loads.push({ field: f, value: g.value });
  }
  if (loads.length === 0) {
    return {
      ok: false,
      error: err(
        'INVALID_INPUT',
        'inputs',
        `Needs more input: give one of ${LOAD_FIELDS.join(', ')} to describe the load (the source voltage and the path resistance fix the rest); none given.`,
      ),
    };
  }

  const rp = raw['returnPath'];
  if (typeof rp !== 'string' || !RETURN_PATHS.includes(rp as ReturnPath)) {
    return {
      ok: false,
      error: err('INVALID_INPUT', 'returnPath', `returnPath is required and must be exactly one of ${RETURN_PATHS.join(', ')}; it is never defaulted.`),
    };
  }
  const returnPath = rp as ReturnPath;

  const fwd = guardList('elements', raw['elements'], 1);
  if (!fwd.ok) return fwd;
  let ret: PathElement[] = [];
  if (raw['returnElements'] !== undefined) {
    if (returnPath !== 'included-in-list') {
      return {
        ok: false,
        error: err('INVALID_INPUT', 'returnElements', `returnElements may only be given with returnPath "included-in-list"; with "${returnPath}" the return is not listed.`),
      };
    }
    const r = guardList('returnElements', raw['returnElements'], 0);
    if (!r.ok) return r;
    ret = r.value;
  }
  if (fwd.value.length + ret.length > meta.validity.maxElements) {
    return { ok: false, error: err('OUT_OF_DOMAIN', 'elements', `At most ${String(meta.validity.maxElements)} path elements are supported.`) };
  }
  const seen = new Set<string>();
  for (const e of [...fwd.value, ...ret]) {
    const key = e.label.trim().toLowerCase();
    if (seen.has(key)) return { ok: false, error: err('INVALID_INPUT', 'elements', `Element labels must be unique; "${e.label}" appears more than once.`) };
    seen.add(key);
  }

  let dropBudget: Quantity | undefined;
  if (raw['dropBudgetPercent'] !== undefined) {
    const g = guardQuantity('dropBudgetPercent', raw['dropBudgetPercent'], DIM.DIMENSIONLESS, 'dimensionless fraction (for example 5 % is 0.05)');
    if (!g.ok) return g;
    if (g.value.si > 1) return { ok: false, error: err('OUT_OF_DOMAIN', 'dropBudgetPercent', 'dropBudgetPercent must be at most 100 %.') };
    dropBudget = g.value;
  }

  return {
    ok: true,
    value: { vsource: vs.value, loads, returnPath, elements: fwd.value, returnElements: ret, ...(dropBudget !== undefined ? { dropBudget } : {}) },
  };
}
