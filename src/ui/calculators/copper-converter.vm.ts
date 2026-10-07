// View-model for the copper weight/thickness converter page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/copper-converter compute().
import { compute, type Inputs } from '../../core/calculators/copper-converter/calc';
import type { Layer, ThicknessBasis } from '../../core/calculators/copper-converter/guards';
import { meta } from '../../core/calculators/copper-converter/meta';
import { DEFAULT_FOIL_CONVENTION, foilSpreadPercent } from '../../core/data/constants';
import type { CalcResult } from '../../core/result';
import { DEFAULT_DISPLAY_PREFS, DIM, FOIL_CONVENTIONS, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { buildResultView, MAX_FIELD_CHARS, parseField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';

export const CALCULATOR_ID = 'copper-converter';

export type EntryMode = 'weight' | 'thickness';
export type Units = 'metric' | 'imperial';

/** Everything the form holds. Strings are exactly what the user typed. */
export interface ConverterState {
  readonly by: EntryMode;
  readonly weight: string;
  readonly thickness: string;
  /** '' means not chosen yet. The layer is never defaulted. */
  readonly layer: Layer | '';
  /** '' means the default convention (an assumption). */
  readonly convention: FoilConvention | '';
  readonly basis: ThicknessBasis;
  readonly plating: string;
  readonly units: Units;
}

export const DEFAULT_STATE: ConverterState = Object.freeze({
  by: 'weight',
  weight: '',
  thickness: '',
  layer: '',
  convention: '',
  basis: 'nominal',
  plating: '',
  units: 'metric',
});

export const CONVENTION_IDS = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
export const BASES: readonly ThicknessBasis[] = ['nominal', 'finished', 'measured'];
export const LAYERS: readonly Layer[] = ['outer', 'inner'];

const LABELS: Readonly<Record<string, string>> = {
  thickness: 'Copper thickness',
  'areal mass': 'Copper weight',
  'estimated finished thickness': 'Estimated finished thickness (base + plating)',
};
const SKIP: readonly string[] = ['convention spread'];

// ---------------------------------------------------------------------------
// Display preferences. The headline length is always dual (mm and mil); this chooses the echo unit.
// ---------------------------------------------------------------------------
export function headlinePrefs(units: Units): DisplayPrefs {
  return units === 'imperial' ? { ...DEFAULT_DISPLAY_PREFS, length: 'mil', area: 'mil2' } : { ...DEFAULT_DISPLAY_PREFS };
}

/** Thickness fields echo in um (metric) or mil (imperial), never mm (copper is tens of micrometres). */
export function echoPrefs(units: Units): DisplayPrefs {
  return { ...DEFAULT_DISPLAY_PREFS, length: units === 'imperial' ? 'mil' : 'um' };
}

export function conventionSpreadText(): string {
  return `${foilSpreadPercent().toFixed(2)} %`;
}

export function conventionOptionLabel(id: FoilConvention | ''): string {
  if (id === '') return `Default: ${FOIL_CONVENTIONS[DEFAULT_FOIL_CONVENTION].label} (default assumption)`;
  return FOIL_CONVENTIONS[id].label;
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

/** State to put in the hash. Defaults are omitted, so the default page has a clean URL. */
export function toHashState(s: ConverterState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.by !== DEFAULT_STATE.by) out['by'] = s.by;
  if (s.weight.trim() !== '') out['w'] = s.weight.slice(0, MAX_FIELD_CHARS);
  if (s.thickness.trim() !== '') out['t'] = s.thickness.slice(0, MAX_FIELD_CHARS);
  if (s.layer !== '') out['ly'] = s.layer;
  if (s.convention !== '') out['conv'] = s.convention;
  if (s.basis !== DEFAULT_STATE.basis) out['tb'] = s.basis;
  if (s.plating.trim() !== '') out['pl'] = s.plating.slice(0, MAX_FIELD_CHARS);
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: ConverterState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: ConverterState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const text = (k: string, label: string): string => {
    const v = get(k);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${label} was too long and is empty instead.`);
      return '';
    }
    return v;
  };

  const by = get('by');
  if (by !== undefined) {
    if (by === 'weight' || by === 'thickness') s = { ...s, by };
    else notices.push('Which value you enter (weight or thickness) was not recognised: weight is used instead.');
  }
  const ly = get('ly');
  if (ly !== undefined) {
    if (ly === 'outer' || ly === 'inner') s = { ...s, layer: ly };
    else notices.push('Copper layer was not recognised: no layer is chosen. Choose outer or inner.');
  }
  const conv = get('conv');
  if (conv !== undefined) {
    if (has(FOIL_CONVENTIONS, conv)) s = { ...s, convention: conv as FoilConvention };
    else notices.push(`Foil convention was not recognised: the default (${DEFAULT_FOIL_CONVENTION}) is used instead.`);
  }
  const tb = get('tb');
  if (tb !== undefined) {
    if (tb === 'nominal' || tb === 'finished' || tb === 'measured') s = { ...s, basis: tb };
    else notices.push('Thickness basis was not recognised: nominal is used instead.');
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  s = { ...s, weight: text('w', 'Copper weight'), thickness: text('t', 'Copper thickness'), plating: text('pl', 'Plating thickness') };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface FieldErrors {
  weight?: string;
  thickness?: string;
  plating?: string;
  layer?: string;
}

export type ConverterView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | { readonly status: 'ok'; readonly result: ResultView; readonly raw: CalcResult; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] };

const FIELD_LABEL: Readonly<Record<string, string>> = {
  weight: 'Copper weight',
  thickness: 'Copper thickness',
  platingThickness: 'Plating thickness',
  layer: 'Copper layer',
  convention: 'Foil convention',
  thicknessBasis: 'Thickness basis',
  inputs: 'Inputs',
};

const FIELD_KEY: Readonly<Record<string, keyof FieldErrors>> = {
  weight: 'weight',
  thickness: 'thickness',
  platingThickness: 'plating',
  layer: 'layer',
};

function dimFor(mode: EntryMode) {
  return mode === 'weight' ? DIM.AREAL_MASS : DIM.LENGTH;
}

export function parseEntered(s: ConverterState): FieldView {
  return parseField(s.by === 'weight' ? s.weight : s.thickness, dimFor(s.by), echoPrefs(s.units));
}

export function parsePlating(s: ConverterState): FieldView {
  return parseField(s.plating, DIM.LENGTH, echoPrefs(s.units));
}

function provenance(s: ConverterState): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [{ label: 'Copper layer', value: s.layer, source: 'user' }];
  rows.push(
    s.convention === ''
      ? { label: 'Foil convention', value: DEFAULT_FOIL_CONVENTION, source: 'default', detail: `conventions differ by up to ${conventionSpreadText()}` }
      : { label: 'Foil convention', value: s.convention, source: 'user' },
  );
  if (s.by === 'thickness') rows.push({ label: 'Thickness basis', value: s.basis, source: s.basis === 'nominal' ? 'default' : 'user' });
  return rows;
}

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: ConverterState): ConverterView {
  const notes: string[] = [];
  const entered = parseEntered(s);
  const fieldName = s.by === 'weight' ? 'Copper weight' : 'Copper thickness';
  const innerPlating = s.layer === 'inner' && s.plating.trim() !== '';
  if (innerPlating) notes.push('Plating thickness is ignored for an inner layer.');
  const plating: FieldView = s.layer === 'outer' ? parsePlating(s) : { status: 'empty' };

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  if (entered.status === 'error') problems.push(`${fieldName}: ${entered.message}`);
  if (plating.status === 'error') problems.push(`Plating thickness: ${plating.message}`);
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  const needs: string[] = [];
  if (entered.status === 'empty') needs.push(`Enter the ${s.by === 'weight' ? 'copper weight (for example 1 oz)' : 'copper thickness (for example 35 um)'}.`);
  if (s.layer === '') needs.push('Choose a copper layer: outer or inner. It is not assumed.');
  if (needs.length > 0 || entered.status !== 'ok') return { status: 'needs-input', needs, notes };

  const inputs: Inputs = {
    layer: s.layer as Layer,
    ...(s.by === 'weight' ? { weight: entered.value } : { thickness: entered.value, thicknessBasis: s.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...(plating.status === 'ok' ? { platingThickness: plating.value as Quantity } : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    const label = FIELD_LABEL[out.error.field ?? 'inputs'] ?? 'Input';
    const message = `${label}: ${out.error.message}`;
    const key = FIELD_KEY[out.error.field ?? ''];
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [message], fieldErrors, notes };
  }
  const headline = s.by === 'weight' ? 'thickness' : 'areal mass';
  const result = buildResultView(out.value, {
    headline,
    accuracyClass: meta.accuracyClass,
    prefs: headlinePrefs(s.units),
    labels: LABELS,
    skip: SKIP,
    extraProvenance: provenance(s),
  });
  return { status: 'ok', result, raw: out.value, fieldErrors, notes };
}
