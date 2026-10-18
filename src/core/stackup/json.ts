import type { CalcError, Result } from '../result';
import { fromUnit, toUnit } from '../units';
import { STACKUP_LIMITS, validateStackup } from './guards';
import { STACKUP_PROVENANCE, STACKUP_SCHEMA_VERSION } from './types';
import type { Stackup, StackupLayer } from './types';

/**
 * Stackup JSON import and export (string in, string out; no DOM, no file access). Schema version 1:
 *   { schemaVersion, kind: 'pcb-calc-stackup', provenance: 'user-entered, unverified', name, note?, layers: [...] }
 * Layers use readable units (thicknessUm, weightOzFt2, frequencyHz). The export carries every er/Df source label. The import
 * is strict: unknown keys are errors, text length and layer count are capped, numbers must be numbers, plausibility windows
 * apply, and the result is ALWAYS tagged 'user-entered, unverified', whatever the file says.
 */

export const STACKUP_FORMAT = 'pcb-calc-stackup';

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** 12 significant digits: stable under unit conversion round trips, far finer than any physical input. */
const r12 = (x: number): number => Number(x.toPrecision(12));

function layerToJson(l: StackupLayer): Record<string, unknown> {
  const base: Record<string, unknown> = { kind: l.kind, name: l.name };
  if (l.kind === 'copper') {
    const s = l.thicknessSource;
    if (s.from === 'weight') {
      base['weightOzFt2'] = r12(toUnit(s.weight, 'oz/ft2'));
      if (!s.conventionDefaulted) base['foilConvention'] = s.convention;
    } else {
      base['thicknessUm'] = r12(toUnit(l.thickness, 'um'));
      base['thicknessBasis'] = s.basis;
    }
    return base;
  }
  base['thicknessUm'] = r12(toUnit(l.thickness, 'um'));
  if (l.er !== undefined) base['er'] = l.er;
  if (l.kind === 'dielectric') {
    if (l.df !== undefined) base['df'] = l.df;
    base['source'] = l.source;
    if (l.frequency !== undefined) base['frequencyHz'] = r12(l.frequency.si);
  } else if (l.source !== undefined) {
    base['source'] = l.source;
  }
  return base;
}

/** Deterministic, versioned, pretty-printed JSON for a stackup. Includes the er/Df source labels and the unverified tag. */
export function exportStackup(s: Stackup): string {
  const out: Record<string, unknown> = {
    schemaVersion: STACKUP_SCHEMA_VERSION,
    kind: STACKUP_FORMAT,
    provenance: STACKUP_PROVENANCE,
    name: s.name,
  };
  if (s.note !== undefined) out['note'] = s.note;
  out['layers'] = s.layers.map(layerToJson);
  return `${JSON.stringify(out, null, 2)}\n`;
}

const TOP_KEYS: readonly string[] = ['schemaVersion', 'kind', 'provenance', 'name', 'note', 'layers'];
const LAYER_KEYS: Readonly<Record<string, readonly string[]>> = {
  copper: ['kind', 'name', 'thicknessUm', 'thicknessBasis', 'weightOzFt2', 'foilConvention'],
  dielectric: ['kind', 'name', 'thicknessUm', 'er', 'df', 'source', 'frequencyHz'],
  soldermask: ['kind', 'name', 'thicknessUm', 'er', 'source'],
};

/** A JSON number as a Quantity of the given unit, or the value itself so the guard reports the problem with its path. */
function numberToQuantity(v: unknown, unit: string): unknown {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v;
  try {
    return fromUnit(v, unit);
  } catch {
    return Number.NaN;
  }
}

/** Parses a stackup from JSON text. Never throws; every problem is returned with a field path. */
export function importStackup(textIn: string): Result<Stackup, CalcError[]> {
  if (typeof textIn !== 'string') return { ok: false, error: [err('INVALID_INPUT', 'text', 'the stackup file must be text.')] };
  if (textIn.length > STACKUP_LIMITS.maxTextLength) {
    return { ok: false, error: [err('OUT_OF_DOMAIN', 'text', `the stackup file may have at most ${String(STACKUP_LIMITS.maxTextLength)} characters; got ${String(textIn.length)}.`)] };
  }
  let json: unknown;
  try {
    json = JSON.parse(textIn);
  } catch (e) {
    return { ok: false, error: [err('INVALID_INPUT', 'text', `the stackup file is not valid JSON (${e instanceof Error ? e.message : 'parse error'}).`)] };
  }
  if (!isRecord(json)) return { ok: false, error: [err('INVALID_INPUT', 'text', 'the stackup file must contain one JSON object.')] };

  const errs: CalcError[] = [];
  for (const k of Object.keys(json)) {
    if (!TOP_KEYS.includes(k)) errs.push(err('INVALID_INPUT', k, `unknown field "${k}"; allowed: ${TOP_KEYS.join(', ')}.`));
  }
  if (json['schemaVersion'] !== STACKUP_SCHEMA_VERSION) {
    errs.push(
      err('INVALID_INPUT', 'schemaVersion', `schemaVersion must be ${String(STACKUP_SCHEMA_VERSION)}; got ${json['schemaVersion'] === undefined ? 'nothing' : String(json['schemaVersion'])} (this version cannot read other schema versions).`),
    );
  }
  if (json['kind'] !== STACKUP_FORMAT) errs.push(err('INVALID_INPUT', 'kind', `kind must be "${STACKUP_FORMAT}".`));

  // Convert readable units to Quantities layer by layer, keeping every unknown key so the guard reports it with its path.
  const rawLayers = json['layers'];
  let layers: unknown = rawLayers;
  if (Array.isArray(rawLayers) && rawLayers.length <= STACKUP_LIMITS.maxLayers) {
    layers = rawLayers.map((l: unknown) => {
      if (!isRecord(l)) return l;
      const kindKeys = typeof l['kind'] === 'string' ? LAYER_KEYS[l['kind']] : undefined;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(l)) {
        if (kindKeys !== undefined && !kindKeys.includes(k)) {
          out[k] = v; // unknown: the guard reports "unknown field"
        } else if (k === 'thicknessUm') {
          out['thickness'] = numberToQuantity(v, 'um');
        } else if (k === 'weightOzFt2') {
          out['weight'] = numberToQuantity(v, 'oz/ft2');
        } else if (k === 'frequencyHz') {
          out['frequency'] = numberToQuantity(v, 'Hz');
        } else if (k === 'foilConvention') {
          out['convention'] = v;
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }
  const guarded = validateStackup({
    name: json['name'],
    ...(json['note'] !== undefined ? { note: json['note'] } : {}),
    layers,
  });
  if (!guarded.ok) {
    errs.push(...guarded.error.map(toFileNames));
    return { ok: false, error: errs };
  }
  if (errs.length > 0) return { ok: false, error: errs };
  return guarded;
}

const FILE_NAMES: readonly (readonly [RegExp, string])[] = [
  [/\.thickness(?![A-Za-z])/g, '.thicknessUm'],
  [/\.weight(?![A-Za-z])/g, '.weightOzFt2'],
  [/\.frequency(?![A-Za-z])/g, '.frequencyHz'],
  [/\.convention(?![A-Za-z])/g, '.foilConvention'],
];

/** The guard names the Quantity fields thickness, weight, frequency, convention; the file calls them thicknessUm, weightOzFt2, frequencyHz, foilConvention. */
function toFileNames(e: CalcError): CalcError {
  const fix = (t: string): string => FILE_NAMES.reduce((acc, [re, to]) => acc.replace(re, to), t);
  return { ...e, ...(e.field !== undefined ? { field: fix(e.field) } : {}), message: fix(e.message) };
}
