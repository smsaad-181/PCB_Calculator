// Calculator-agnostic view-model helpers. Pure (no DOM): they only turn core outputs into display strings.
// No engineering math lives here. Every headline number is printed through src/core/format-result.ts.
import { CONFIDENCE_RULE_TEXT, type ConfidenceLevel, type AccuracyClass } from '../../core/confidence';
import { LEDGER, type LedgerStatus } from '../../core/data/ledger';
import { formatDesignValue, formatResult } from '../../core/format-result';
import type { Bound, CalcInput, CalcResult, InputSource, WarningSeverity } from '../../core/result';
import {
  DEFAULT_DISPLAY_PREFS,
  describeParsed,
  parseQuantityDetailed,
  type Dim,
  type DisplayPrefs,
  type Quantity,
} from '../../core/units';

// ---------------------------------------------------------------------------
// Input fields
// ---------------------------------------------------------------------------
export type FieldView =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly value: Quantity; readonly echo: string; readonly warnings: readonly string[] }
  | { readonly status: 'error'; readonly message: string };

/** Longest text accepted in a quantity field (also the maxlength of the input). */
export const MAX_FIELD_CHARS = 40;

/** Parses user text against the field's dimension. Never throws; never yields a non-finite value. */
export function parseField(text: string, expectedDim: Dim, echoPrefs: DisplayPrefs = DEFAULT_DISPLAY_PREFS): FieldView {
  if (text.trim() === '') return { status: 'empty' };
  if (text.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  const r = parseQuantityDetailed(text, expectedDim);
  if (!r.ok) return { status: 'error', message: r.error.message };
  if (!Number.isFinite(r.value.si)) return { status: 'error', message: 'The value is not a finite number.' };
  return { status: 'ok', value: r.value, echo: describeParsed(r.value, expectedDim, echoPrefs), warnings: r.warnings };
}

// ---------------------------------------------------------------------------
// Ledger status
// ---------------------------------------------------------------------------
export interface LedgerEntryView {
  readonly id: string;
  readonly item: string;
  readonly edition: string;
  readonly status: LedgerStatus;
}

export interface LedgerView {
  readonly entries: readonly LedgerEntryView[];
  /** Ids whose status is not VERIFIED. Non-empty means the UNVERIFIED badge is shown. */
  readonly unverifiedIds: readonly string[];
  readonly worst: LedgerStatus;
}

const STATUS_RANK: Readonly<Record<LedgerStatus, number>> = {
  VERIFIED: 0,
  UNVERIFIED: 1,
  'PAYWALLED-USER-MUST-VERIFY': 2,
  CONFLICT: 3,
};

/** Unknown ids are treated as UNVERIFIED (never as verified). */
export function ledgerView(ids: readonly string[]): LedgerView {
  const unique = [...new Set(ids)];
  const entries = unique.map((id): LedgerEntryView => {
    const row = LEDGER.find((r) => r.id === id);
    return row === undefined
      ? { id, item: 'not found in the source ledger', edition: 'unknown', status: 'UNVERIFIED' }
      : { id: row.id, item: row.item, edition: row.edition, status: row.status };
  });
  let worst: LedgerStatus = 'VERIFIED';
  for (const e of entries) if (STATUS_RANK[e.status] > STATUS_RANK[worst]) worst = e.status;
  return { entries, unverifiedIds: entries.filter((e) => e.status !== 'VERIFIED').map((e) => e.id), worst };
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------
export interface WarningView {
  readonly severity: WarningSeverity;
  /** Text label that carries the severity without colour: "Critical", "Warning", "Caution", "Note". */
  readonly label: string;
  readonly icon: string;
  readonly message: string;
}

const SEVERITY_ORDER: readonly WarningSeverity[] = ['critical', 'warning', 'caution', 'info'];
const SEVERITY_LABEL: Readonly<Record<WarningSeverity, string>> = { critical: 'Critical', warning: 'Warning', caution: 'Caution', info: 'Note' };
const SEVERITY_ICON: Readonly<Record<WarningSeverity, string>> = { critical: '⛔', warning: '⚠', caution: '▲', info: 'ℹ' };

/** Most severe first; equal severities keep their original order. */
export function orderWarnings(ws: readonly { severity: WarningSeverity; message: string }[]): WarningView[] {
  return SEVERITY_ORDER.flatMap((sev) =>
    ws
      .filter((w) => w.severity === sev)
      .map((w) => ({ severity: sev, label: SEVERITY_LABEL[sev], icon: SEVERITY_ICON[sev], message: w.message })),
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export interface ProvenanceRow {
  readonly label: string;
  readonly value: string;
  readonly source: InputSource;
  readonly detail?: string;
}

export interface ResultRowView {
  readonly label: string;
  readonly text: string;
}

export interface ResultView {
  readonly headline: { readonly label: string; readonly text: string; readonly meaning: string };
  readonly rows: readonly ResultRowView[];
  readonly ledger: LedgerView;
  readonly confidence: { readonly level: ConfidenceLevel; readonly score: number; readonly reasons: readonly string[]; readonly ruleText: string };
  readonly warnings: readonly WarningView[];
  readonly recommendation: string;
  readonly details: {
    readonly method: string;
    readonly reference: string;
    readonly formula: string;
    readonly steps: readonly { label: string; expr: string; text: string }[];
    readonly assumptions: readonly string[];
    readonly validity: readonly { name: string; ok: boolean; detail: string }[];
    readonly inputs: readonly ProvenanceRow[];
  };
}

export interface BuildOptions {
  /** Name of the `results[]` entry that is the quick answer (falls back to the primary result). */
  readonly headline: string;
  readonly accuracyClass: AccuracyClass;
  readonly prefs?: DisplayPrefs;
  /** Display label per result name; unlisted names are capitalised. */
  readonly labels?: Readonly<Record<string, string>>;
  /** Result names not listed as rows (for example a dimensionless spread already stated in a warning). */
  readonly skip?: readonly string[];
  /** Extra provenance rows (choices that are not quantities: layer, convention). */
  readonly extraProvenance?: readonly ProvenanceRow[];
}

const MEANING: Readonly<Record<Bound, string>> = {
  nominal: 'Nominal value (rounded to nearest)',
  'min-requirement': 'Minimum required (rounded up)',
  'max-capacity': 'Maximum capacity (rounded down)',
  prediction: 'Predicted value (rounded up)',
};

const capitalise = (s: string): string => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

function inputRow(i: CalcInput, headlineOpts: { accuracyClass: AccuracyClass; prefs?: DisplayPrefs }): ProvenanceRow {
  const value = formatResult({ value: i.value, bound: 'nominal' }, headlineOpts);
  return i.sourceDetail === undefined
    ? { label: capitalise(i.name), value, source: i.source }
    : { label: capitalise(i.name), value, source: i.source, detail: i.sourceDetail };
}

/** Builds every display string for a result. All numbers go through format-result (no direct formatFor, no override). */
export function buildResultView(r: CalcResult, o: BuildOptions): ResultView {
  const opts = o.prefs === undefined ? { accuracyClass: o.accuracyClass } : { accuracyClass: o.accuracyClass, prefs: o.prefs };
  const label = (n: string): string => o.labels?.[n] ?? capitalise(n);
  const head = r.results.find((x) => x.name === o.headline) ?? r.results.find((x) => x.role === 'primary') ?? r.results[0];
  if (head === undefined) throw new Error('The result has no entries to show.');
  const skip = new Set(o.skip ?? []);
  const rows: ResultRowView[] = r.results
    .filter((x) => x !== head && !skip.has(x.name))
    .map((x) => ({ label: label(x.name), text: formatResult(x, opts) }));
  for (const dv of r.designValues) {
    rows.push({ label: `${capitalise(dv.name)} (calculated)`, text: formatDesignValue(dv, 'calculated', opts) });
    rows.push({ label: `${capitalise(dv.name)} (recommended, derated)`, text: formatDesignValue(dv, 'recommended', opts) });
  }
  return {
    headline: { label: label(head.name), text: formatResult(head, opts), meaning: MEANING[head.bound] },
    rows,
    ledger: ledgerView(r.reference.ledgerIds),
    confidence: { level: r.confidence.level, score: r.confidence.score, reasons: [...r.confidence.reasons], ruleText: CONFIDENCE_RULE_TEXT },
    warnings: orderWarnings(r.warnings),
    recommendation: r.recommendation,
    details: {
      method: r.method,
      reference: `${r.reference.standard}, edition: ${r.reference.edition}`,
      formula: r.formula,
      steps: r.steps.map((s) => ({ label: s.label, expr: s.expr, text: formatResult({ value: s.value, bound: 'nominal' }, opts) })),
      assumptions: [...r.assumptions],
      validity: r.validityChecks.map((v) => ({ ...v })),
      inputs: [...r.inputs.map((i) => inputRow(i, opts)), ...(o.extraProvenance ?? [])],
    },
  };
}
