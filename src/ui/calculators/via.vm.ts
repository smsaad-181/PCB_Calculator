// View-model for the via barrel resistance and axial thermal page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/via compute().
import { compute, type Inputs } from '../../core/calculators/via/calc';
import { meta } from '../../core/calculators/via/meta';
import { copperThermalConductivity, type CopperKMaterial } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult } from '../../core/result';
import { DIM, q, type Dim, type DisplayPrefs, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import { buildResultView, MAX_FIELD_CHARS, parseField, type FieldView, type LedgerEntryView, type ProvenanceRow, type ResultView } from '../components/view';

export const CALCULATOR_ID = 'via';
export type { Units };

export type KChoice = '' | CopperKMaterial;

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" (or "use the default"). */
export interface ViaState {
  /** FINISHED hole diameter (inside diameter after plating), not the drill. */
  readonly diameter: string;
  /** Required. Never pre-filled. */
  readonly plating: string;
  readonly length: string;
  /** Whole number of vias in parallel; required, no default. */
  readonly count: string;
  readonly current: string;
  /** Empty means the 25 °C engineering default (marked as a default). */
  readonly temperature: string;
  /** User override only. Never prefilled. */
  readonly resistivity: string;
  /** '' means the default material (an assumption, marked as such). */
  readonly kMaterial: KChoice;
  readonly units: Units;
}

export const DEFAULT_STATE: ViaState = Object.freeze({
  diameter: '',
  plating: '',
  length: '',
  count: '',
  current: '',
  temperature: '',
  resistivity: '',
  kMaterial: '',
  units: 'metric',
});

export const METHOD_TEXT = 'Method: plated barrel as a copper annulus; DC resistance, axial thermal conduction, ideal parallel for N vias';

export const DEFAULT_TEXT = {
  temperature: `${String(meta.defaults.conductorTempC)} °C (engineering default, not from a standard)`,
} as const;

export const RANGE_HINT =
  'Outside the stated plausibility range (an engineering range, not a standard): less reliable. See the confidence reasons.';

export const DIAMETER_HELP = 'The FINISHED hole (inside diameter after plating), not the drill. Examples: 0.3 mm, 12 mil.';
export const PLATING_HELP =
  'Required, never filled in for you. Published values differ, and a fab profile figure is an average, not a minimum: use the thinnest value your fabricator guarantees (see the profile data). Always write the unit (um or mil).';

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
const K_IDS: readonly CopperKMaterial[] = ['pure-401', 'c11000-391'];
const K_NAME: Readonly<Record<CopperKMaterial, string>> = { 'pure-401': 'Pure copper', 'c11000-391': 'C11000 copper' };

function kValueText(m: CopperKMaterial): string {
  const k = copperThermalConductivity(m);
  return formatResult({ value: k.value, bound: 'nominal' }, { accuracyClass: meta.accuracyClass });
}

/** Material choices. The first option (empty value) is the default and says so. The k numbers are core data, printed through format-result. */
export function kOptions(): readonly { value: KChoice; label: string }[] {
  return [
    { value: '', label: `Default: pure copper, ${kValueText('pure-401')} (default assumption, ledger S-007 CONFLICT)` },
    ...K_IDS.map((m) => ({ value: m, label: `${K_NAME[m]}, ${kValueText(m)} (ledger S-007 CONFLICT)` })),
  ];
}

export const K_HELP =
  'Sources disagree by a few percent (S-007). The highest conductivity understates the via temperature (non-conservative).';

export const ADVANCED_CAUTION =
  'Empty uses annealed pure copper (S-004). Plated copper (S-012, UNVERIFIED) is usually higher, so the default understates R. Enter a value only if you can source it. Nothing is prefilled.';

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
type TextKey = 'diameter' | 'plating' | 'length' | 'count' | 'current' | 'temperature' | 'resistivity';

const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = {
  diameter: 'd',
  plating: 't',
  length: 'l',
  count: 'n',
  current: 'i',
  temperature: 'tc',
  resistivity: 'rho',
};
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

const FIELD_LABEL: Readonly<Record<TextKey, string>> = {
  diameter: 'Finished hole diameter',
  plating: 'Plating thickness',
  length: 'Barrel length',
  count: 'Number of vias',
  current: 'Current',
  temperature: 'Conductor temperature',
  resistivity: 'Plated copper resistivity',
};

const FIELD_DIM: Readonly<Record<Exclude<TextKey, 'count'>, Dim>> = {
  diameter: DIM.LENGTH,
  plating: DIM.LENGTH,
  length: DIM.LENGTH,
  current: DIM.CURRENT,
  temperature: DIM.ABS_TEMPERATURE,
  resistivity: DIM.RESISTIVITY,
};
export function fieldDim(k: Exclude<TextKey, 'count'>): Dim {
  return FIELD_DIM[k];
}

export function toHashState(s: ViaState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.kMaterial !== '') out['km'] = s.kMaterial;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: ViaState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: ViaState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const text = (k: TextKey): string => {
    const v = get(TEXT_HASH_KEY[k]);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  const km = get('km');
  if (km !== undefined) {
    const m = K_IDS.find((id) => id === km);
    if (m !== undefined) s = { ...s, kMaterial: m };
    else notices.push('The thermal conductivity material was not recognised: the default (pure copper) is used instead.');
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  s = {
    ...s,
    diameter: text('diameter'),
    plating: text('plating'),
    length: text('length'),
    count: text('count'),
    current: text('current'),
    temperature: text('temperature'),
    resistivity: text('resistivity'),
  };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'kMaterial';
export type FieldErrors = Partial<Record<FieldKey, string>>;

function echoFor(s: ViaState, k: Exclude<TextKey, 'count'>): DisplayPrefs {
  return echoPrefs(s.units, k === 'plating' ? 'thickness' : k === 'diameter' || k === 'length' ? 'width' : 'other');
}

const COUNT_MESSAGE = 'Enter a whole number of vias, 1 or more (for example 1 for a single via).';
/** Count is a plain whole number: this is input validation, not engineering math. */
export function parseCount(text: string): { readonly status: 'empty' } | { readonly status: 'ok'; readonly value: number } | { readonly status: 'error'; readonly message: string } {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!/^\d+$/.test(t)) return { status: 'error', message: COUNT_MESSAGE };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < 1) return { status: 'error', message: COUNT_MESSAGE };
  return { status: 'ok', value: n };
}

/** The count as a field view, so the page can use the shared quantity field (a plain number, no unit). */
export function parseCountField(text: string): FieldView {
  const c = parseCount(text);
  return c.status === 'ok' ? { status: 'ok', value: q(c.value, DIM.DIMENSIONLESS), echo: `${String(c.value)} (whole number)`, warnings: [] } : c;
}

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  finishedHoleDiameter: 'diameter',
  platingThickness: 'plating',
  barrelLength: 'length',
  count: 'count',
  current: 'current',
  conductorTemperature: 'temperature',
  resistivity: 'resistivity',
  kMaterial: 'kMaterial',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface CautionView {
  readonly code: string;
  readonly heading: string;
  readonly text: string;
}

export interface LedgerRowView extends LedgerEntryView {
  /** What this row backs on this page, in one sentence. */
  readonly role: string;
}

/** Core warning codes shown prominently next to the headline instead of in the list. In display order. */
export const CAUTION_CODES = ['NO_RATING_NO_RISE', 'PLATED_RESISTIVITY', 'RESISTIVITY_OVERRIDE', 'PARALLEL_SHARING'] as const;
const CAUTION_HEADING: Readonly<Record<(typeof CAUTION_CODES)[number], string>> = {
  NO_RATING_NO_RISE: 'This is a resistance, not a current rating, and no temperature rise is derived',
  PLATED_RESISTIVITY: 'Pure-copper resistivity is used: R, drop and power are understated',
  RESISTIVITY_OVERRIDE: 'Your plated resistivity replaces the pure-copper value (ledger S-012, UNVERIFIED)',
  PARALLEL_SHARING: 'Parallel vias share current unequally: R/N is the ideal',
};

const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-004': 'Annealed copper resistivity, used for R unless you enter a plated value.',
  'S-007': 'Copper thermal conductivity k; sources disagree, so it is a choice.',
  'S-012': 'Plated copper resistivity: not researched; the pure-copper default is non-conservative.',
  'S-015': 'Plating thickness: published values differ; class minimums are paywalled and were not read.',
};

const HEADLINE = { name: 'resistance at conductor temperature', label: 'Via resistance at conductor temperature' } as const;
const RESULT_LABELS: Readonly<Record<string, string>> = {
  'resistance at conductor temperature': HEADLINE.label,
  'axial thermal resistance (one barrel)': 'Axial thermal resistance (one barrel, end to end)',
  'axial thermal resistance (all barrels, ideal parallel)': 'Axial thermal resistance (all barrels, ideal parallel, end to end)',
  'voltage drop': 'Voltage drop (via barrels only)',
  'power loss': 'Power loss (via barrels only)',
  'plated copper resistivity': 'Plated copper resistivity (at 20 °C, your value)',
};
/** Plating thickness is micrometre-scale: it prints as µm and mil, never mm. */
const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = { 'plating thickness': 'thickness', 'Plating thickness': 'thickness' };

const NEEDS: Readonly<Record<'diameter' | 'plating' | 'length' | 'count', string>> = {
  diameter: 'Enter the finished hole diameter (after plating, not the drill), for example 0.3 mm.',
  plating: 'Enter the plating thickness (required, never filled in for you; take it from your fabricator).',
  length: 'Enter the barrel length (board thickness for a through via), for example 1.6 mm.',
  count: 'Enter the number of vias in parallel (1 for a single via).',
};

export type ViaView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly cautions: readonly CautionView[];
      readonly ledgerRows: readonly LedgerRowView[];
    };

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: ViaState): ViaView {
  const notes: string[] = [];
  const problems: string[] = [];
  const needs: string[] = [];
  const fieldErrors: FieldErrors = {};

  const parsed = new Map<Exclude<TextKey, 'count'>, FieldView>();
  const read = (k: Exclude<TextKey, 'count'>): void => {
    const v = parseField(s[k], fieldDim(k), echoFor(s, k));
    parsed.set(k, v);
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  };
  for (const k of ['diameter', 'plating', 'length', 'current', 'temperature', 'resistivity'] as const) read(k);
  const count = parseCount(s.count);
  if (count.status === 'error') {
    problems.push(`${FIELD_LABEL.count}: ${count.message}`);
    fieldErrors.count = count.message;
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  for (const k of ['diameter', 'plating', 'length'] as const) if (parsed.get(k)?.status === 'empty') needs.push(NEEDS[k]);
  if (count.status === 'empty') needs.push(NEEDS.count);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const qty = (k: Exclude<TextKey, 'count'>): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  const inputs = {
    finishedHoleDiameter: qty('diameter') as Quantity,
    platingThickness: qty('plating') as Quantity,
    barrelLength: qty('length') as Quantity,
    count: count.status === 'ok' ? count.value : 0,
    ...optional('conductorTemperature', qty('temperature')),
    ...optional('current', qty('current')),
    ...optional('resistivity', qty('resistivity')),
    ...(s.kMaterial !== '' ? { kMaterial: s.kMaterial } : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined ? FIELD_LABEL[key as TextKey] ?? 'Thermal conductivity material' : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const prefs = headlinePrefs(s.units);
  const cautions: CautionView[] = CAUTION_CODES.flatMap((code) => {
    const w = raw.warnings.find((x) => x.code === code);
    return w === undefined ? [] : [{ code, heading: CAUTION_HEADING[code], text: w.message }];
  });
  const forView: CalcResult = { ...raw, warnings: raw.warnings.filter((w) => w.code === undefined || !(CAUTION_CODES as readonly string[]).includes(w.code)) };

  const extra: ProvenanceRow[] = [
    s.kMaterial === ''
      ? { label: 'Thermal conductivity material', value: 'pure-401', source: 'default', detail: 'ledger S-007, CONFLICT; not chosen by you' }
      : { label: 'Thermal conductivity material', value: s.kMaterial, source: 'user', detail: 'ledger S-007, CONFLICT' },
  ];
  if (s.resistivity.trim() === '') {
    extra.push({ label: 'Plated copper resistivity', value: 'not entered: pure copper value used', source: 'default', detail: 'ledger S-004; plated copper (S-012, UNVERIFIED) is usually higher' });
  }

  const result = buildResultView(forView, {
    headline: HEADLINE.name,
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: RESULT_LABELS,
    extraProvenance: extra,
    pinWarningCodes: ['PLATING_EXCEEDS_HOLE', 'VIA_ONLY_SCOPE'],
  });
  const ledgerRows: LedgerRowView[] = result.ledger.entries.map((e) => ({ ...e, role: LEDGER_ROLE[e.id] ?? e.item }));
  return { status: 'ok', result, raw, fieldErrors, notes, cautions, ledgerRows };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: ViaView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. This is a resistance, not a current rating. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
