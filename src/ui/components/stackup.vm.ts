// View-model helpers for the optional stackup editor. Pure: no DOM, no engineering math.
// The editor holds what the user typed (strings). Everything is checked and derived by src/core/stackup; lengths are printed
// through src/core/format-result. er, Df and every source label start empty: nothing is pre-filled.
import { formatResult } from '../../core/format-result';
import type { CalcError } from '../../core/result';
import { STACKUP_LIMITS, deriveMicrostrip, deriveStripline, exportStackup, importStackup, validateStackup } from '../../core/stackup';
import type { Stackup } from '../../core/stackup';
import { DIM, formatFor, type Quantity } from '../../core/units';
import { parseNumberField } from '../calculators/impedance.vm';
import { parseField } from './view';

export type LayerKind = 'copper' | 'dielectric' | 'soldermask';
export type CopperBy = 'weight' | 'thickness';
export const LAYER_KINDS: readonly LayerKind[] = ['copper', 'dielectric', 'soldermask'];
export const KIND_LABEL: Readonly<Record<LayerKind, string>> = { copper: 'Copper', dielectric: 'Dielectric', soldermask: 'Soldermask' };

/** One layer as typed. For copper `thickness` holds a foil weight (for example "1 oz") or a thickness, as `copperBy` says. */
export interface DraftLayer {
  readonly kind: LayerKind;
  readonly name: string;
  readonly thickness: string;
  readonly copperBy: CopperBy;
  readonly er: string;
  readonly df: string;
  readonly source: string;
}

export interface Draft {
  readonly name: string;
  readonly layers: readonly DraftLayer[];
  /** Name of the copper layer that carries the signal. */
  readonly signalLayer: string;
}

export const EMPTY_DRAFT: Draft = Object.freeze({ name: 'My stackup', layers: [], signalLayer: '' });

export const NOT_IN_LINK =
  'The stackup is not part of the link: it stays in this browser tab (kept in session storage when the browser allows it) and the link carries only the h or b, t and er values derived from it. Export the JSON to keep or share the stackup itself.';

export const STACKUP_INTRO =
  'Optional: describe your stackup layer by layer and pick the signal layer, and the page derives the dielectric height or spacing, the copper thickness and er for you. er, Df and the source of each dielectric are never filled in: take them from your fabricator.';

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------
const PREFIX: Readonly<Record<LayerKind, string>> = { copper: 'Cu', dielectric: 'Dielectric', soldermask: 'Mask' };

function uniqueName(d: Draft, kind: LayerKind): string {
  const names = new Set(d.layers.map((l) => l.name));
  let n = d.layers.filter((l) => l.kind === kind).length + 1;
  while (names.has(`${PREFIX[kind]} ${String(n)}`)) n += 1;
  return `${PREFIX[kind]} ${String(n)}`;
}

/** Appends an empty layer. A new dielectric has no er, no Df and no source. */
export function addLayer(d: Draft, kind: LayerKind): Draft {
  if (d.layers.length >= STACKUP_LIMITS.maxLayers) return d;
  const layer: DraftLayer = { kind, name: uniqueName(d, kind), thickness: '', copperBy: 'thickness', er: '', df: '', source: '' };
  return { ...d, layers: [...d.layers, layer] };
}

export function updateLayer(d: Draft, index: number, patch: Partial<DraftLayer>): Draft {
  const old = d.layers[index];
  if (old === undefined) return d;
  const layers = d.layers.map((l, i) => (i === index ? { ...l, ...patch } : l));
  const renamed = patch.name !== undefined && old.name === d.signalLayer;
  return { ...d, layers, signalLayer: renamed ? (patch.name ?? '') : d.signalLayer };
}

export function removeLayer(d: Draft, index: number): Draft {
  const old = d.layers[index];
  if (old === undefined) return d;
  return { ...d, layers: d.layers.filter((_, i) => i !== index), signalLayer: old.name === d.signalLayer ? '' : d.signalLayer };
}

export function moveLayer(d: Draft, index: number, dir: -1 | 1): Draft {
  const to = index + dir;
  const a = d.layers[index];
  const b = d.layers[to];
  if (a === undefined || b === undefined) return d;
  return { ...d, layers: d.layers.map((l, i) => (i === index ? b : i === to ? a : l)) };
}

export function copperNames(d: Draft): readonly string[] {
  return d.layers.filter((l) => l.kind === 'copper').map((l) => l.name);
}

// ---------------------------------------------------------------------------
// Parsing the draft through the core guard
// ---------------------------------------------------------------------------
export type StackupParse =
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly errors: readonly string[] }
  | { readonly status: 'ok'; readonly stackup: Stackup };

const layerLabel = (d: Draft, i: number): string => `Layer ${String(i + 1)} (${d.layers[i]?.name ?? '?'})`;

/** Core error field like "layers[2].er" to a readable "Layer 3 (Core): message" using the draft's own names. */
function describeCoreError(d: Draft, e: CalcError): string {
  const m = /^layers\[(\d+)\]/.exec(e.field ?? '');
  if (m === null) return `${e.field === undefined ? 'Stackup' : `Stackup ${e.field}`}: ${e.message}`;
  return `${layerLabel(d, Number(m[1]))}: ${e.message}`;
}

const SELF_MESSAGE = {
  thickness: 'thickness is required.',
  er: 'er is required (no default is provided).',
} as const;

/** Builds the core stackup from the typed draft. Every problem is reported with its layer; nothing is guessed or defaulted. */
export function parseDraft(d: Draft): StackupParse {
  if (d.layers.length === 0) return { status: 'empty' };
  const errors: string[] = [];
  const own = new Set<string>();
  const raw: unknown[] = d.layers.map((l, i) => {
    const label = layerLabel(d, i);
    const out: Record<string, unknown> = { kind: l.kind, name: l.name };
    const byWeight = l.kind === 'copper' && l.copperBy === 'weight';
    const t = parseField(l.thickness, byWeight ? DIM.AREAL_MASS : DIM.LENGTH);
    if (t.status === 'empty') {
      errors.push(`${label}: ${byWeight ? 'foil weight is required.' : SELF_MESSAGE.thickness}`);
      own.add(`layers[${String(i)}].${byWeight ? 'weight' : 'thickness'}`);
    } else if (t.status === 'error') {
      errors.push(`${label}: ${byWeight ? 'foil weight' : 'thickness'}: ${t.message}`);
      own.add(`layers[${String(i)}].${byWeight ? 'weight' : 'thickness'}`);
    } else {
      out[byWeight ? 'weight' : 'thickness'] = t.value;
    }
    if (l.kind === 'dielectric') {
      const er = parseNumberField(l.er);
      if (er.status === 'empty') {
        errors.push(`${label}: ${SELF_MESSAGE.er}`);
        own.add(`layers[${String(i)}].er`);
      } else if (er.status === 'error') {
        errors.push(`${label}: er: ${er.message}`);
        own.add(`layers[${String(i)}].er`);
      } else out['er'] = Number(l.er.trim());
      if (l.df.trim() !== '') {
        const df = parseNumberField(l.df);
        if (df.status === 'error') {
          errors.push(`${label}: Df: ${df.message}`);
          own.add(`layers[${String(i)}].df`);
        } else out['df'] = Number(l.df.trim());
      }
      out['source'] = l.source;
    }
    return out;
  });
  const g = validateStackup({ name: d.name, layers: raw });
  if (!g.ok) {
    for (const e of g.error) {
      if (e.field !== undefined && own.has(e.field.replace(/\.(thickness|weight|er|df)\b.*$/, '.$1'))) continue;
      errors.push(describeCoreError(d, e));
    }
  }
  if (errors.length > 0) return { status: 'error', errors };
  if (!g.ok) return { status: 'error', errors: g.error.map((e) => describeCoreError(d, e)) };
  return { status: 'ok', stackup: g.value };
}

// ---------------------------------------------------------------------------
// Derived geometry
// ---------------------------------------------------------------------------
export type StackupKind = 'microstrip' | 'stripline';

/** The scalar page inputs a stackup derives, as text the page's own fields parse. */
export interface StackupScalars {
  /** h for a microstrip, b for a stripline. */
  readonly size: string;
  readonly thickness: string;
  readonly er: string;
  readonly erSource: string;
  readonly geometrySource: string;
}

export interface DeriveRow {
  readonly label: string;
  readonly text: string;
}

export type DeriveView =
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly errors: readonly string[] }
  | { readonly status: 'no-signal' }
  | { readonly status: 'derive-error'; readonly message: string }
  | { readonly status: 'ok'; readonly rows: readonly DeriveRow[]; readonly notes: readonly string[]; readonly scalars: StackupScalars };

const SHOW = { accuracyClass: 'empirical', lengthRole: 'thickness' } as const;
const show = (x: Quantity): string => formatResult({ value: x, bound: 'nominal' }, SHOW);
/** A length as text a length field parses back (micrometres). */
const asText = (x: Quantity): string => formatFor(x, { unit: 'um' });

export function deriveView(d: Draft, kind: StackupKind): DeriveView {
  const p = parseDraft(d);
  if (p.status === 'empty') return { status: 'empty' };
  if (p.status === 'error') return { status: 'error', errors: p.errors };
  if (d.signalLayer === '') return { status: 'no-signal' };
  const geometrySource = `stackup "${d.name}", signal layer "${d.signalLayer}"`.slice(0, 200);
  if (kind === 'microstrip') {
    const r = deriveMicrostrip(p.stackup, d.signalLayer);
    if (!r.ok) return { status: 'derive-error', message: r.error.message };
    const g = r.value;
    return {
      status: 'ok',
      rows: [
        { label: 'Signal layer', text: g.signalLayer },
        { label: 'Reference plane', text: g.referenceLayer },
        { label: 'Dielectric height h', text: show(g.h) },
        { label: 'Trace thickness t', text: show(g.t) },
        { label: 'Relative permittivity er', text: String(g.er) },
        { label: 'Source of er', text: g.erSource },
      ],
      notes: notesOf(g.notes, g.copper.source, g.conventionDefaulted),
      scalars: { size: asText(g.h), thickness: asText(g.t), er: String(g.er), erSource: g.erSource.slice(0, 500), geometrySource },
    };
  }
  const r = deriveStripline(p.stackup, d.signalLayer);
  if (!r.ok) return { status: 'derive-error', message: r.error.message };
  const g = r.value;
  return {
    status: 'ok',
    rows: [
      { label: 'Signal layer', text: g.signalLayer },
      { label: 'Reference planes', text: `${g.referenceAbove} and ${g.referenceBelow}` },
      { label: 'Plane-to-plane spacing b', text: show(g.b) },
      { label: 'Dielectric above and below the strip', text: `${show(g.hAbove)} and ${show(g.hBelow)}` },
      { label: 'Strip thickness t', text: show(g.t) },
      { label: 'Relative permittivity er', text: String(g.er) },
      { label: 'Source of er', text: g.erSource },
    ],
    notes: notesOf(g.notes, g.copper.source, g.conventionDefaulted),
    scalars: { size: asText(g.b), thickness: asText(g.t), er: String(g.er), erSource: g.erSource.slice(0, 500), geometrySource },
  };
}

function notesOf(notes: readonly string[], copperSource: string, conventionDefaulted: boolean): string[] {
  const out = [...notes, `Copper thickness: ${copperSource}`];
  if (conventionDefaulted) out.push('The foil convention was not named, so the project default was used (a labelled assumption).');
  return out;
}

// ---------------------------------------------------------------------------
// JSON export and import (the core schema)
// ---------------------------------------------------------------------------
/** The core stackup JSON for a valid draft, or undefined when the draft is empty or invalid. */
export function exportDraft(d: Draft): string | undefined {
  const p = parseDraft(d);
  return p.status === 'ok' ? exportStackup(p.stackup) : undefined;
}

export function stackupToDraft(s: Stackup, signalLayer: string): Draft {
  const layers: DraftLayer[] = s.layers.map((l): DraftLayer => {
    if (l.kind === 'copper') {
      const src = l.thicknessSource;
      return src.from === 'weight'
        ? { kind: 'copper', name: l.name, thickness: `${String(src.weightOzFt2)} oz/ft2`, copperBy: 'weight', er: '', df: '', source: '' }
        : { kind: 'copper', name: l.name, thickness: asText(l.thickness), copperBy: 'thickness', er: '', df: '', source: '' };
    }
    if (l.kind === 'dielectric') {
      return { kind: 'dielectric', name: l.name, thickness: asText(l.thickness), copperBy: 'thickness', er: String(l.er), df: l.df === undefined ? '' : String(l.df), source: l.source };
    }
    return { kind: 'soldermask', name: l.name, thickness: asText(l.thickness), copperBy: 'thickness', er: '', df: '', source: '' };
  });
  const keep = layers.some((l) => l.kind === 'copper' && l.name === signalLayer);
  return { name: s.name, layers, signalLayer: keep ? signalLayer : '' };
}

export type ImportResult = { readonly ok: true; readonly draft: Draft } | { readonly ok: false; readonly errors: readonly string[] };

/** Imports pasted JSON through the core import validation. Errors are listed with their field path. */
export function importDraft(text: string, signalLayer: string): ImportResult {
  const r = importStackup(text);
  if (!r.ok) return { ok: false, errors: r.error.map((e) => (e.field === undefined ? e.message : `${e.field}: ${e.message}`)) };
  return { ok: true, draft: stackupToDraft(r.value, signalLayer) };
}

// ---------------------------------------------------------------------------
// Session storage fallback (guarded)
// ---------------------------------------------------------------------------
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORE_VERSION = 1;
/** The stored draft is size-checked against the core text cap before it is parsed. */
const MAX_STORED_CHARS = STACKUP_LIMITS.maxTextLength;

/** Shown under a refusal to derive values (PCB2-5): what the user can do instead. */
export const NEXT_STEP =
  'What to do next: take the value from your fabricator (a field-solver result for the real stackup), or enter an approximate b or h yourself in the fields above and label its source as approximate.';
/** Longest import text the page accepts (the core cap). */
export const MAX_IMPORT_CHARS = STACKUP_LIMITS.maxTextLength;
const MAX_FIELD = 500;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.length <= MAX_FIELD ? x : undefined);

function layerFromStored(x: unknown): DraftLayer | undefined {
  if (!isRecord(x)) return undefined;
  const kind = x['kind'];
  const by = x['copperBy'];
  const [name, thickness, er, df, source] = [str(x['name']), str(x['thickness']), str(x['er']), str(x['df']), str(x['source'])];
  if ((kind !== 'copper' && kind !== 'dielectric' && kind !== 'soldermask') || (by !== 'weight' && by !== 'thickness')) return undefined;
  if (name === undefined || thickness === undefined || er === undefined || df === undefined || source === undefined) return undefined;
  return { kind, name, thickness, copperBy: by, er, df, source };
}

/** The saved draft, or the empty draft when storage is missing, blocked, corrupt, too large or the wrong version. Never throws. */
export function loadStored(storage: StorageLike | null | undefined, key: string): Draft {
  try {
    const text = storage?.getItem(key);
    if (typeof text !== 'string' || text.length > MAX_STORED_CHARS) return EMPTY_DRAFT;
    const j: unknown = JSON.parse(text);
    if (!isRecord(j) || j['v'] !== STORE_VERSION || !isRecord(j['draft'])) return EMPTY_DRAFT;
    const dr = j['draft'];
    const rawLayers = dr['layers'];
    const name = str(dr['name']);
    const signalLayer = str(dr['signalLayer']);
    if (!Array.isArray(rawLayers) || rawLayers.length > STACKUP_LIMITS.maxLayers || name === undefined || signalLayer === undefined) return EMPTY_DRAFT;
    const layers = rawLayers.map(layerFromStored);
    if (layers.some((l) => l === undefined)) return EMPTY_DRAFT;
    return { name, layers: layers as DraftLayer[], signalLayer };
  } catch {
    return EMPTY_DRAFT;
  }
}

/** Saves the draft; any failure (blocked storage, quota) is ignored: the stackup then lives in memory only. */
export function saveStored(storage: StorageLike | null | undefined, key: string, draft: Draft): void {
  try {
    storage?.setItem(key, JSON.stringify({ v: STORE_VERSION, draft }));
  } catch {
    /* in-memory only */
  }
}
