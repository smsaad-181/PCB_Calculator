// Shared view-model pieces of the three safety spacing pages (clearance, creepage, IPC spacing). Pure: no DOM, no engineering math.
// Text in, display strings out. Every number comes from src/core (calculators, spacing tables, waveform helpers) and is printed through
// src/core/format-result. The banner wording is the core's own constants, never retyped here.
import type { AccuracyClass } from '../../core/confidence';
import { formatResult } from '../../core/format-result';
import type { CalcError, CalcOutcome, CalcResult } from '../../core/result';
import { INDICATIVE_PREFIX, INSULATION_TYPES, PRODUCT_STANDARD_BANNER, SOLDERMASK_NOTE, UNVERIFIED_BANNER } from '../../core/spacing/gating';
import type { InsulationType } from '../../core/spacing/gating';
import {
  SHIPPED_TABLES,
  TABLE_IDS,
  dataStateOf,
  isTableEmpty,
  serializeTableSet,
} from '../../core/spacing/tables';
import type { DataState, SpacingTableSet, TableId } from '../../core/spacing/tables';
import { WAVEFORM_SHAPES, voltageFromWaveform } from '../../core/spacing/waveform';
import type { VoltageBasis, WaveformShape } from '../../core/spacing/waveform';
import { DIM, type Dim, type Quantity } from '../../core/units';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { buildResultView, parseField, type ResultView } from '../components/view';
import { ledgerRowsOf } from './circuit-view';

// ---------------------------------------------------------------------------
// Banners (always visible, in every state)
// ---------------------------------------------------------------------------
export const IMPORT_ANCHOR_ID = 'spacing-import';
export const TABLES_PANEL_ID = 'spacing-tables';
export const IPC_COATING_NOTE = 'On this page the coating choice only selects a column of the table you entered; the app adds no credit of its own.';

export interface BannerView {
  /** The core's product-standard sentence, verbatim. */
  readonly product: string;
  /** The core's solder-mask sentence, verbatim (plus a page-specific clarification where it is needed). */
  readonly soldermask: string;
  /** Present when any table this page can use is entered but not verified. */
  readonly unverified?: { readonly text: string; readonly prefix: string; readonly tables: readonly TableId[] };
}

/** Tables each page can read, for the UNVERIFIED banner (a table of another page never raises it). */
export const PAGE_TABLES: Readonly<Record<'clearance' | 'creepage' | 'ipc-spacing', readonly TableId[]>> = {
  clearance: ['T1', 'T2', 'T3', 'T4', 'T7'],
  creepage: ['T5', 'T6', 'T7'],
  'ipc-spacing': ['T8'],
};

export function bannerView(set: SpacingTableSet, page: keyof typeof PAGE_TABLES): BannerView {
  const entered = PAGE_TABLES[page].filter((id) => dataStateOf(set.tables[id]) === 'ENTERED_UNVERIFIED');
  const soldermask = page === 'ipc-spacing' ? `${SOLDERMASK_NOTE} ${IPC_COATING_NOTE}` : SOLDERMASK_NOTE;
  return {
    product: PRODUCT_STANDARD_BANNER,
    soldermask,
    ...(entered.length > 0 ? { unverified: { text: UNVERIFIED_BANNER, prefix: INDICATIVE_PREFIX, tables: entered } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Table status panel
// ---------------------------------------------------------------------------
export interface TableStatusRow {
  readonly id: TableId;
  readonly name: string;
  readonly standard: string;
  readonly state: DataState;
  readonly stateText: string;
  readonly edition: string;
  readonly enteredBy: string;
  readonly verifiedBy: string;
  readonly records: number;
}

const STATE_TEXT: Readonly<Record<DataState, string>> = {
  EMPTY: 'EMPTY: no values entered, so no result can be given',
  ENTERED_UNVERIFIED: 'ENTERED_UNVERIFIED: entered by a user, not verified (results are indicative only)',
  VERIFIED: 'VERIFIED: signed in the imported file (this app cannot verify values itself)',
};
export const NONE_TEXT = '(none)';

export function tableStatusRows(set: SpacingTableSet): TableStatusRow[] {
  return TABLE_IDS.map((id) => {
    const t = set.tables[id];
    const state = dataStateOf(t);
    const empty = isTableEmpty(t);
    return {
      id,
      name: t.name,
      standard: t.standard,
      state,
      stateText: STATE_TEXT[state],
      edition: empty || t.edition.trim() === '' ? NONE_TEXT : t.edition,
      enteredBy: t.enteredBy.trim() === '' ? NONE_TEXT : t.enteredBy,
      verifiedBy: t.verifiedBy.trim() === '' ? NONE_TEXT : t.verifiedBy,
      records: t.cells.length + t.groups.length + t.rules.length,
    };
  });
}

/** Editions found in the non-empty tables, so the user can type the matching edition text. */
export function loadedEditions(set: SpacingTableSet): string[] {
  return TABLE_IDS.filter((id) => !isTableEmpty(set.tables[id])).map((id) => `${id}: ${set.tables[id].edition}`);
}

/** The blank template the user fills in: the shipped empty shells as one bundle. Never contains a value. */
export function templateJson(): string {
  return serializeTableSet(SHIPPED_TABLES);
}
export const TEMPLATE_FILE_NAME = 'safety-tables-blank-template.json';

export const MAX_ERRORS_SHOWN = 20;
/** Import problems in plain language, capped so a broken file does not flood the page. */
export function importProblems(errors: readonly string[]): { readonly shown: readonly string[]; readonly more: number } {
  const shown = errors.slice(0, MAX_ERRORS_SHOWN).map((e) => (e.endsWith('.') ? e : `${e}.`));
  return { shown, more: Math.max(0, errors.length - shown.length) };
}

export function importSuccessLines(imported: readonly { readonly table: string; readonly state: DataState; readonly records: number }[]): string[] {
  return imported.map((i) => `${i.table}: ${i.state}, ${String(i.records)} record${i.records === 1 ? '' : 's'}`);
}

// ---------------------------------------------------------------------------
// Quantity fields
// ---------------------------------------------------------------------------
export interface QtyDef {
  readonly key: string;
  readonly label: string;
  readonly dim: Dim;
  readonly text: string;
}
export interface ParsedQuantities {
  readonly values: Readonly<Record<string, Quantity | undefined>>;
  readonly problems: readonly string[];
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/** Parses each non-empty field against its dimension. Blank fields give undefined (the core lists them as missing). */
export function parseQuantities(defs: readonly QtyDef[]): ParsedQuantities {
  const values: Record<string, Quantity | undefined> = {};
  const problems: string[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const d of defs) {
    const v = parseField(d.text, d.dim);
    if (v.status === 'error') {
      problems.push(`${d.label}: ${v.message}`);
      fieldErrors[d.key] = v.message;
      values[d.key] = undefined;
    } else values[d.key] = v.status === 'ok' ? v.value : undefined;
  }
  return { values, problems, fieldErrors };
}

export const VOLTAGE = DIM.VOLTAGE;
export const LENGTH = DIM.LENGTH;
export const FREQUENCY = DIM.FREQUENCY;

// ---------------------------------------------------------------------------
// Working voltage entry (direct, or a declared waveform) and the peak/RMS helper
// ---------------------------------------------------------------------------
export type VoltageMode = 'direct' | 'waveform';
export const VOLTAGE_MODES: readonly { value: VoltageMode; label: string }[] = [
  { value: 'direct', label: 'I know the peak and/or rms voltage' },
  { value: 'waveform', label: 'I declare a waveform and one value (peak or rms)' },
];
export const isVoltageMode = (v: string): v is VoltageMode => v === 'direct' || v === 'waveform';
export const isShape = (v: string): v is WaveformShape => (WAVEFORM_SHAPES as readonly string[]).includes(v);
export const isBasis = (v: string): v is VoltageBasis => v === 'peak' || v === 'rms';
export const SHAPE_OPTIONS: readonly { value: WaveformShape; label: string }[] = [
  { value: 'dc', label: 'DC (peak = rms)' },
  { value: 'sine', label: 'Sine' },
  { value: 'square', label: 'Symmetric square (peak = rms)' },
  { value: 'triangle', label: 'Symmetric triangle' },
];
export const BASIS_OPTIONS: readonly { value: VoltageBasis; label: string }[] = [
  { value: 'peak', label: 'Peak value' },
  { value: 'rms', label: 'RMS value' },
];
export const WAVEFORM_HELP =
  'The app never guesses a shape: peak and rms are converted only for the shape you declare (textbook crest factors, ledger S-035). A real converter or switching waveform may differ; measure it or use the datasheet.';

export interface VoltageState {
  readonly voltageMode: VoltageMode;
  readonly peak: string;
  readonly rms: string;
  readonly shape: WaveformShape | '';
  readonly basis: VoltageBasis | '';
  readonly waveValue: string;
}
export const VOLTAGE_DEFAULTS: VoltageState = { voltageMode: 'direct', peak: '', rms: '', shape: '', basis: '', waveValue: '' };

export interface WaveformHelperView {
  readonly status: 'idle' | 'error' | 'ok';
  readonly text: string;
}

/** Peak and rms of the declared waveform, through the core helper and format-result. Idle until shape, basis and value are all given. */
export function waveformHelper(s: VoltageState): WaveformHelperView {
  if (s.voltageMode !== 'waveform') return { status: 'idle', text: '' };
  if (s.shape === '' || s.basis === '' || s.waveValue.trim() === '') {
    return { status: 'idle', text: 'Choose a shape and a basis and enter a value to see the peak and rms voltage.' };
  }
  const v = parseField(s.waveValue, VOLTAGE);
  if (v.status !== 'ok') return { status: 'error', text: v.status === 'error' ? v.message : 'Enter a value.' };
  const r = voltageFromWaveform(s.shape, s.basis, v.value);
  if (!r.ok) return { status: 'error', text: r.error.message };
  const opts = { accuracyClass: 'analytical' as AccuracyClass };
  const peak = formatResult({ value: r.value.peak, bound: 'nominal' }, opts);
  const rms = formatResult({ value: r.value.rms, bound: 'nominal' }, opts);
  return { status: 'ok', text: `Declared ${s.shape} waveform: peak ${peak}, rms ${rms}.` };
}

export interface CoreVoltage {
  readonly peak?: Quantity;
  readonly rms?: Quantity;
  readonly waveform?: { shape: WaveformShape; basis: VoltageBasis; value: Quantity };
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------
export const INSUFFICIENT_DATA_HEADING = 'INSUFFICIENT DATA';
export const OUT_OF_RANGE_HEADING = 'OUT OF TABLE RANGE';
export const INSUFFICIENT_DATA_LEAD =
  'No number is given because the table data this calculation needs is missing. The app ships no standard values; the tables must be entered from your licensed copy and imported below.';
export const OUT_OF_RANGE_LEAD = 'No number is given: the request is outside the range or scope recorded in the tables you entered.';
export const IMPORT_LINK_TEXT = 'Go to the table import box';

export type FailureView =
  | { readonly status: 'needs-input'; readonly summary: string; readonly needs: readonly string[] }
  | { readonly status: 'insufficient-data'; readonly heading: string; readonly lead: string; readonly items: readonly string[]; readonly tables: readonly TableId[] }
  | { readonly status: 'out-of-range'; readonly heading: string; readonly lead: string; readonly message: string }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: Readonly<Record<string, string>> };

const TABLE_REF = /\bT[1-8]\b/g;

/** Maps a core error value to what the page shows. `labels` turns core input names into the page's field labels. */
export function classifyFailure(e: CalcError, labels: Readonly<Record<string, string>>, coreField: Readonly<Record<string, string>>): FailureView {
  if (e.gate === 'INSUFFICIENT_INPUTS') {
    const needs = (e.missing ?? []).map((m) => labels[m] ?? m);
    return { status: 'needs-input', summary: `Insufficient inputs: ${needs.join(', ')}`, needs };
  }
  if (e.gate === 'INSUFFICIENT_DATA') {
    const items = e.message.split(/;\s+(?=INSUFFICIENT DATA)/).map((m) => m.trim());
    const found = new Set<TableId>();
    for (const m of e.message.match(TABLE_REF) ?? []) found.add(m as TableId);
    return { status: 'insufficient-data', heading: INSUFFICIENT_DATA_HEADING, lead: INSUFFICIENT_DATA_LEAD, items, tables: TABLE_IDS.filter((id) => found.has(id)) };
  }
  if (e.gate === 'OUT_OF_SCOPE') return { status: 'out-of-range', heading: OUT_OF_RANGE_HEADING, lead: OUT_OF_RANGE_LEAD, message: e.message };
  const key = coreField[e.field ?? ''];
  return { status: 'error', problems: [e.message], fieldErrors: key !== undefined ? { [key]: e.message } : {} };
}

export function failureOf(out: CalcOutcome, labels: Readonly<Record<string, string>>, coreField: Readonly<Record<string, string>>): FailureView | undefined {
  return out.ok ? undefined : classifyFailure(out.error, labels, coreField);
}

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------
/** Core warning codes whose text the banners already show verbatim (same constants), so the list does not repeat them. */
const BANNER_CODES: Readonly<Record<string, string>> = {
  UNVERIFIED_TABLE_DATA: UNVERIFIED_BANNER,
  PRODUCT_STANDARD: PRODUCT_STANDARD_BANNER,
  SOLDERMASK_NOT_COATING: SOLDERMASK_NOTE,
};

export function withoutBannerWarnings(raw: CalcResult): CalcResult {
  return { ...raw, warnings: raw.warnings.filter((w) => w.code === undefined || BANNER_CODES[w.code] !== w.message) };
}

export interface OkParts {
  readonly result: ResultView;
  readonly raw: CalcResult;
  readonly ledgerRows: readonly LedgerRowBadge[];
}

/** Display labels: the core's "indicative only: " prefix is kept visible on every label it appears on. */
export function labelsFor(raw: CalcResult, base: Readonly<Record<string, string>>): Record<string, string> {
  const prefix = `${INDICATIVE_PREFIX}: `;
  const out: Record<string, string> = {};
  for (const r of raw.results) {
    const marked = r.name.startsWith(prefix);
    const bare = marked ? r.name.slice(prefix.length) : r.name;
    const label = base[bare] ?? bare;
    out[r.name] = marked ? `${prefix}${label}` : label.charAt(0).toUpperCase() + label.slice(1);
  }
  return out;
}

export function okParts(raw: CalcResult, accuracyClass: AccuracyClass, baseLabels: Readonly<Record<string, string>>, pin: readonly string[]): OkParts {
  const shown = withoutBannerWarnings(raw);
  const head = raw.results.find((r) => r.role === 'primary') ?? raw.results[0];
  const result = buildResultView(shown, {
    headline: head?.name ?? '',
    accuracyClass,
    labels: labelsFor(raw, baseLabels),
    pinWarningCodes: pin,
  });
  return { result, raw: shown, ledgerRows: ledgerRowsOf(result.ledger) };
}

// ---------------------------------------------------------------------------
// Shared form wording
// ---------------------------------------------------------------------------
export type PollutionText = '' | '1' | '2' | '3' | '4';
export const POLLUTION_OPTIONS: readonly { value: Exclude<PollutionText, ''>; label: string }[] = [
  { value: '1', label: 'Pollution degree 1' },
  { value: '2', label: 'Pollution degree 2' },
  { value: '3', label: 'Pollution degree 3' },
  { value: '4', label: 'Pollution degree 4' },
];
export const isPollution = (v: string): v is Exclude<PollutionText, ''> => v === '1' || v === '2' || v === '3' || v === '4';
export const INSULATION_OPTIONS: readonly { value: InsulationType; label: string }[] = INSULATION_TYPES.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
export const isInsulation = (v: string): v is InsulationType => (INSULATION_TYPES as readonly string[]).includes(v);
export const INSULATION_HELP = 'Functional and supplementary use the basic lookup (conservative); reinforced needs a rule record in table T7. Double insulation is basic plus supplementary: calculate each layer.';

export const COATING_CREDIT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'none', label: 'No coating credit' },
  { value: 'type1', label: 'Coating type 1 (needs a verified T7 rule record)' },
  { value: 'type2', label: 'Coating type 2 (needs a verified T7 rule record)' },
];
export const COATING_HELP =
  'A credit is applied only if table T7 is VERIFIED and holds the rule record for the chosen type. Otherwise the page says it was not applied and shows the distance without credit. Solder mask is never a coating credit.';
export const SOLDERMASK_LABEL = 'Solder mask is present on this surface (declared; it gives no credit)';

export function liveSummaryOf(v: { readonly status: string } & Partial<{ summary: string; heading: string; message: string; problems: readonly string[]; result: ResultView }>): string {
  switch (v.status) {
    case 'ok': {
      const r = v.result;
      return r === undefined ? 'Result ready.' : `Result: ${r.headline.label} ${r.headline.text}. Confidence ${r.confidence.level}.`;
    }
    case 'needs-input':
      return `No result yet. ${v.summary ?? ''}`;
    case 'insufficient-data':
      return `${v.heading ?? INSUFFICIENT_DATA_HEADING}. No result: table data is missing.`;
    case 'out-of-range':
      return `${v.heading ?? OUT_OF_RANGE_HEADING}. No result. ${v.message ?? ''}`;
    default:
      return `No result. ${(v.problems ?? []).join(' ')}`;
  }
}
