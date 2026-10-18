import type { CalcError, CopperBasisKind, Result } from '../result';
import { DIM, FOIL_CONVENTIONS, foilThickness, toUnit } from '../units';
import type { FoilConvention, Quantity } from '../units';
import { DEFAULT_FOIL_CONVENTION } from '../data/constants';
import { guardQuantity } from '../calculators/copper-converter/guards';
import { STACKUP_PROVENANCE, STACKUP_SCHEMA_VERSION } from './types';
import type { CopperLayer, DielectricLayer, SoldermaskLayer, Stackup, StackupLayer } from './types';

export { STACKUP_PROVENANCE, STACKUP_SCHEMA_VERSION };

/**
 * Caps and plausibility windows. The windows catch unit slips (a thickness typed in metres instead of micrometres); they are
 * NOT standards and NOT fab limits. er is bounded by the recorded model range (1 to 128, ledger S-020).
 */
export const STACKUP_LIMITS = {
  maxLayers: 64,
  maxNameLength: 100,
  maxSourceLength: 500,
  maxNoteLength: 2000,
  maxTextLength: 200_000,
  dielectricThicknessM: [5e-6, 1e-2],
  copperThicknessM: [1e-6, 1e-3],
  soldermaskThicknessM: [1e-6, 5e-4],
  erRange: [1, 128],
  dfMax: 1,
} as const;

const BASES: readonly CopperBasisKind[] = ['nominal', 'finished', 'measured'];
const TOP_KEYS: readonly string[] = ['schemaVersion', 'name', 'layers', 'note', 'provenance'];
const KEYS: Readonly<Record<StackupLayer['kind'], readonly string[]>> = {
  copper: ['kind', 'name', 'thickness', 'weight', 'convention', 'thicknessBasis'],
  dielectric: ['kind', 'name', 'thickness', 'er', 'df', 'source', 'frequency'],
  soldermask: ['kind', 'name', 'thickness', 'er', 'source'],
};

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const own = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

function text(errs: CalcError[], field: string, v: unknown, max: number, what: string): string | undefined {
  if (typeof v !== 'string' || v.trim() === '') {
    errs.push(err('INVALID_INPUT', field, `${what} must be a non-empty text.`));
    return undefined;
  }
  if (v.length > max) {
    errs.push(err('INVALID_INPUT', field, `${what} must be at most ${String(max)} characters.`));
    return undefined;
  }
  return v;
}

function numberField(errs: CalcError[], field: string, v: unknown, lo: number, hi: number, what: string): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errs.push(err('INVALID_INPUT', field, `${what} must be a finite number; got ${typeof v === 'number' ? String(v) : typeof v}.`));
    return undefined;
  }
  if (v < lo || v > hi) {
    errs.push(err('OUT_OF_DOMAIN', field, `${what} ${String(v)} is outside ${String(lo)} to ${String(hi)}.`));
    return undefined;
  }
  return v;
}

function length(errs: CalcError[], field: string, v: unknown, win: readonly [number, number], kind: string): Quantity | undefined {
  const g = guardQuantity(field, v, DIM.LENGTH, 'length');
  if (!g.ok) {
    errs.push(g.error);
    return undefined;
  }
  const si = g.value.si;
  if (si < win[0] || si > win[1]) {
    errs.push(
      err(
        'OUT_OF_DOMAIN',
        field,
        `${field} ${String(Number((si * 1e6).toPrecision(6)))} um is outside the plausibility window ${String(win[0] * 1e6)} um to ${String(win[1] * 1e6)} um for a ${kind} layer (unit-slip check, not a standard); check the unit.`,
      ),
    );
    return undefined;
  }
  return g.value;
}

function unknownKeys(errs: CalcError[], base: string, o: Record<string, unknown>, allowed: readonly string[]): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) errs.push(err('INVALID_INPUT', base === '' ? k : `${base}.${k}`, `unknown field "${k}"; allowed: ${allowed.join(', ')}.`));
  }
}

function copperLayer(errs: CalcError[], p: string, o: Record<string, unknown>, name: string | undefined): CopperLayer | undefined {
  const hasT = own(o, 'thickness');
  const hasW = own(o, 'weight');
  if (hasT === hasW) {
    errs.push(err('INVALID_INPUT', p, 'a copper layer needs exactly one of thickness or weight, not both and not neither.'));
    return undefined;
  }
  if (own(o, 'convention') && !hasW) errs.push(err('INVALID_INPUT', `${p}.convention`, 'convention applies only to a copper layer given as a weight.'));
  if (own(o, 'thicknessBasis') && !hasT) errs.push(err('INVALID_INPUT', `${p}.thicknessBasis`, 'thicknessBasis applies only to a copper layer given as a thickness (a weight is always nominal).'));
  const win = STACKUP_LIMITS.copperThicknessM;
  if (hasT) {
    const basisRaw = o['thicknessBasis'];
    let basis: CopperBasisKind = 'nominal';
    if (basisRaw !== undefined) {
      if (typeof basisRaw !== 'string' || !BASES.includes(basisRaw as CopperBasisKind)) {
        errs.push(err('INVALID_INPUT', `${p}.thicknessBasis`, `thicknessBasis must be one of ${BASES.join(', ')}.`));
        return undefined;
      }
      basis = basisRaw as CopperBasisKind;
    }
    const t = length(errs, `${p}.thickness`, o['thickness'], win, 'copper');
    if (t === undefined || name === undefined) return undefined;
    return { kind: 'copper', name, thickness: t, thicknessSource: { from: 'thickness', basis } };
  }
  const conv = o['convention'];
  if (conv !== undefined && (typeof conv !== 'string' || !Object.prototype.hasOwnProperty.call(FOIL_CONVENTIONS, conv))) {
    errs.push(err('INVALID_INPUT', `${p}.convention`, `convention must be one of ${Object.keys(FOIL_CONVENTIONS).join(', ')}.`));
    return undefined;
  }
  const w = guardQuantity(`${p}.weight`, o['weight'], DIM.AREAL_MASS, 'foil weight (oz/ft2)');
  if (!w.ok) {
    errs.push(w.error);
    return undefined;
  }
  const convention: FoilConvention = (conv as FoilConvention | undefined) ?? DEFAULT_FOIL_CONVENTION;
  let thickness: Quantity;
  try {
    thickness = foilThickness(w.value, convention).thickness;
  } catch (e) {
    errs.push(err('OUT_OF_DOMAIN', `${p}.weight`, `the foil weight could not be converted to a thickness: ${e instanceof Error ? e.message : String(e)}`));
    return undefined;
  }
  if (thickness.si < win[0] || thickness.si > win[1]) {
    errs.push(err('OUT_OF_DOMAIN', `${p}.weight`, `the foil weight gives a thickness outside the plausibility window ${String(win[0] * 1e6)} um to ${String(win[1] * 1e6)} um (unit-slip check); check the unit.`));
    return undefined;
  }
  if (name === undefined) return undefined;
  return {
    kind: 'copper',
    name,
    thickness,
    thicknessSource: { from: 'weight', weight: w.value, weightOzFt2: Number(toUnit(w.value, 'oz/ft2').toFixed(9)), convention, conventionDefaulted: conv === undefined },
  };
}

function dielectricLayer(errs: CalcError[], p: string, o: Record<string, unknown>, name: string | undefined): DielectricLayer | undefined {
  const before = errs.length;
  const [elo, ehi] = STACKUP_LIMITS.erRange;
  const t = length(errs, `${p}.thickness`, o['thickness'], STACKUP_LIMITS.dielectricThicknessM, 'dielectric');
  const er = numberField(errs, `${p}.er`, o['er'], elo, ehi, 'er (relative permittivity)');
  const source = text(errs, `${p}.source`, o['source'], STACKUP_LIMITS.maxSourceLength, 'source (where er and Df came from)');
  let df: number | undefined;
  if (own(o, 'df')) df = numberField(errs, `${p}.df`, o['df'], Number.MIN_VALUE, STACKUP_LIMITS.dfMax, 'df (loss tangent)');
  let frequency: Quantity | undefined;
  if (own(o, 'frequency')) {
    const g = guardQuantity(`${p}.frequency`, o['frequency'], DIM.FREQUENCY, 'frequency (Hz)');
    if (g.ok) frequency = g.value;
    else errs.push(g.error);
  }
  if (errs.length > before || t === undefined || er === undefined || source === undefined || name === undefined) return undefined;
  return { kind: 'dielectric', name, thickness: t, er, source, ...(df !== undefined ? { df } : {}), ...(frequency !== undefined ? { frequency } : {}) };
}

function maskLayer(errs: CalcError[], p: string, o: Record<string, unknown>, name: string | undefined): SoldermaskLayer | undefined {
  const before = errs.length;
  const t = length(errs, `${p}.thickness`, o['thickness'], STACKUP_LIMITS.soldermaskThicknessM, 'soldermask');
  let er: number | undefined;
  let source: string | undefined;
  if (own(o, 'er')) {
    er = numberField(errs, `${p}.er`, o['er'], STACKUP_LIMITS.erRange[0], STACKUP_LIMITS.erRange[1], 'er (relative permittivity)');
    source = text(errs, `${p}.source`, o['source'], STACKUP_LIMITS.maxSourceLength, 'source (where er came from)');
  } else if (own(o, 'source')) {
    source = text(errs, `${p}.source`, o['source'], STACKUP_LIMITS.maxSourceLength, 'source');
  }
  if (errs.length > before || t === undefined || name === undefined) return undefined;
  return { kind: 'soldermask', name, thickness: t, ...(er !== undefined ? { er } : {}), ...(source !== undefined ? { source } : {}) };
}

/**
 * Validates a stack given as plain data whose lengths, frequencies and weights are Quantities. Reports every problem with a
 * field path (layers[2].er) and never throws. The returned stack is a fresh object tagged 'user-entered, unverified'.
 */
export function validateStackup(raw: unknown): Result<Stackup, CalcError[]> {
  const errs: CalcError[] = [];
  if (!isRecord(raw)) return { ok: false, error: [err('INVALID_INPUT', 'stackup', 'the stackup must be an object with a name and a layers array.')] };
  unknownKeys(errs, '', raw, TOP_KEYS);
  if (own(raw, 'schemaVersion') && raw['schemaVersion'] !== STACKUP_SCHEMA_VERSION) {
    errs.push(err('INVALID_INPUT', 'schemaVersion', `schemaVersion must be ${String(STACKUP_SCHEMA_VERSION)}; got ${String(raw['schemaVersion'])} (this version cannot read other schema versions).`));
  }
  const name = text(errs, 'name', raw['name'], STACKUP_LIMITS.maxNameLength, 'name');
  let note: string | undefined;
  if (own(raw, 'note')) note = text(errs, 'note', raw['note'], STACKUP_LIMITS.maxNoteLength, 'note');
  const rawLayers = raw['layers'];
  if (!Array.isArray(rawLayers)) {
    errs.push(err('INVALID_INPUT', 'layers', 'layers must be an array of layer objects, top to bottom.'));
    return { ok: false, error: errs };
  }
  if (rawLayers.length < 2) errs.push(err('INVALID_INPUT', 'layers', 'a stackup needs at least 2 layers (one copper and one dielectric).'));
  if (rawLayers.length > STACKUP_LIMITS.maxLayers) {
    errs.push(err('OUT_OF_DOMAIN', 'layers', `a stackup may have at most ${String(STACKUP_LIMITS.maxLayers)} layers; got ${String(rawLayers.length)}.`));
    return { ok: false, error: errs };
  }

  const layers: (StackupLayer | undefined)[] = [];
  const kinds: (string | undefined)[] = [];
  const seen = new Set<string>();
  rawLayers.forEach((l: unknown, i: number) => {
    const p = `layers[${String(i)}]`;
    if (!isRecord(l)) {
      errs.push(err('INVALID_INPUT', p, 'each layer must be an object.'));
      layers.push(undefined);
      kinds.push(undefined);
      return;
    }
    const kind = l['kind'];
    if (kind !== 'copper' && kind !== 'dielectric' && kind !== 'soldermask') {
      errs.push(err('INVALID_INPUT', `${p}.kind`, 'kind must be exactly "copper", "dielectric" or "soldermask".'));
      layers.push(undefined);
      kinds.push(undefined);
      return;
    }
    kinds.push(kind);
    unknownKeys(errs, p, l, KEYS[kind]);
    let lname = text(errs, `${p}.name`, l['name'], STACKUP_LIMITS.maxNameLength, 'name');
    if (lname !== undefined) {
      if (seen.has(lname)) {
        errs.push(err('INVALID_INPUT', `${p}.name`, `duplicate layer name "${lname}"; names must be unique.`));
        lname = undefined;
      } else seen.add(lname);
    }
    layers.push(kind === 'copper' ? copperLayer(errs, p, l, lname) : kind === 'dielectric' ? dielectricLayer(errs, p, l, lname) : maskLayer(errs, p, l, lname));
  });

  const last = rawLayers.length - 1;
  kinds.forEach((k, i) => {
    if (k === 'soldermask' && i !== 0 && i !== last) errs.push(err('INVALID_INPUT', `layers[${String(i)}]`, 'a soldermask layer must be the first or last layer (outer surface).'));
    if (k === 'copper' && kinds[i + 1] === 'copper') errs.push(err('INVALID_INPUT', `layers[${String(i + 1)}]`, 'two copper layers are adjacent with no dielectric between them.'));
  });
  if (rawLayers.length >= 2 && kinds.every((k) => k !== undefined)) {
    if (!kinds.includes('copper')) errs.push(err('INVALID_INPUT', 'layers', 'a stackup needs at least one copper layer.'));
    if (!kinds.includes('dielectric')) errs.push(err('INVALID_INPUT', 'layers', 'a stackup needs at least one dielectric layer.'));
  }

  if (errs.length > 0 || name === undefined) return { ok: false, error: errs };
  const good = layers.filter((l): l is StackupLayer => l !== undefined);
  return {
    ok: true,
    value: { schemaVersion: STACKUP_SCHEMA_VERSION, provenance: STACKUP_PROVENANCE, name, ...(note !== undefined ? { note } : {}), layers: good },
  };
}
