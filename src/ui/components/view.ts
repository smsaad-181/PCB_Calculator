// Calculator-agnostic view-model helpers. Pure (no DOM): they only turn core outputs into display strings.
// No engineering math lives here. Every headline number is printed through src/core/format-result.ts.
import { CONFIDENCE_RULE_TEXT, type ConfidenceLevel, type AccuracyClass } from '../../core/confidence';
import { LEDGER, type LedgerStatus } from '../../core/data/ledger';
import { formatDesignValue, formatResult, formatStep, type HeadlineOpts } from '../../core/format-result';
import type { Bound, CalcInput, CalcResult, InputSource, WarningSeverity } from '../../core/result';
import {
  DEFAULT_DISPLAY_PREFS,
  DIM,
  describeParsed,
  parseFraction,
  parseQuantityDetailed,
  q,
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

/** Parses a fraction or percent ("25%", "0.25"). A bare number above 1 is refused with the parser's "write 5% or 0.05" hint. */
export function parseFractionField(text: string): FieldView {
  if (text.trim() === '') return { status: 'empty' };
  if (text.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  const r = parseFraction(text);
  if (!r.ok) return { status: 'error', message: r.error.message };
  const value = q(r.value, DIM.DIMENSIONLESS);
  return { status: 'ok', value, echo: describeParsed(value, DIM.DIMENSIONLESS), warnings: [] };
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
  /** Non-VERIFIED ids grouped by their own status, most serious first, so a paywalled source is not described as a conflict. */
  readonly groups: readonly { readonly status: LedgerStatus; readonly ids: readonly string[] }[];
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
  const groups = (['CONFLICT', 'PAYWALLED-USER-MUST-VERIFY', 'UNVERIFIED'] as const)
    .map((status) => ({ status, ids: entries.filter((e) => e.status === status).map((e) => e.id) }))
    .filter((g) => g.ids.length > 0);
  return { entries, unverifiedIds: entries.filter((e) => e.status !== 'VERIFIED').map((e) => e.id), worst, groups };
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

/**
 * Most severe first; equal severities keep their original order. Warnings whose `code` is in `pinFirst` come before
 * everything else (for example a mandatory method caution that must be read first), in their original order.
 */
export function orderWarnings(
  ws: readonly { severity: WarningSeverity; message: string; code?: string }[],
  pinFirst: readonly string[] = [],
): WarningView[] {
  const pinned = (w: { code?: string }): boolean => w.code !== undefined && pinFirst.includes(w.code);
  const view = (w: { severity: WarningSeverity; message: string }): WarningView => ({
    severity: w.severity,
    label: SEVERITY_LABEL[w.severity],
    icon: SEVERITY_ICON[w.severity],
    message: w.message,
  });
  const rest = SEVERITY_ORDER.flatMap((sev) => ws.filter((w) => !pinned(w) && w.severity === sev).map(view));
  return [...ws.filter(pinned).map(view), ...rest];
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
  /** A core warning shown directly under this row (for example the scope of a voltage drop). */
  readonly note?: { readonly label: string; readonly message: string };
  /** A short caveat the core attached to this value (CalcResult.results[].note), shown with it. */
  readonly hint?: string;
}

/** A calculated limit next to the recommended design value, both printed through formatDesignValue. */
export interface DesignValueView {
  readonly name: string;
  readonly direction: 'min-requirement' | 'max-limit';
  readonly calculatedLabel: string;
  readonly calculated: string;
  readonly recommendedLabel: string;
  readonly recommended: string;
  /** The calculator's own sentence on where the factor comes from. */
  readonly rationale: string;
}

export interface ResultView {
  /** `note`, when present, is the core's short caveat for the headline value (for example 'solved without FB bias'). */
  readonly headline: { readonly label: string; readonly text: string; readonly meaning: string; readonly note?: string };
  readonly rows: readonly ResultRowView[];
  readonly designValues: readonly DesignValueView[];
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
    readonly validity: readonly { name: string; ok: boolean; detail: string; informational?: boolean }[];
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
  /** How LENGTH values print by default: 'geometry' (mm and mil, default) or 'thickness' (µm and mil). */
  readonly lengthRole?: 'geometry' | 'thickness';
  /** Per-name override of `lengthRole`, matched against result names, input names and step labels. */
  readonly lengthRoleByName?: Readonly<Record<string, 'geometry' | 'thickness'>>;
  /** Per design value name: what the factor is called ("margin", "derating") and whether it is an engineering default. */
  readonly designNotes?: Readonly<Record<string, { readonly noun: string; readonly defaulted: boolean; /** Replaces "calculated × factor" when the factor is not the user-facing margin. */ readonly basis?: string }>>;
  /** Result name to warning code: that warning is shown under the row instead of in the warning list. */
  readonly rowWarnings?: Readonly<Record<string, string>>;
  /** Extra result rows with text already built through format-result by the caller. */
  readonly extraRows?: readonly ResultRowView[];
  /** Input names left out of the provenance table (inputs the chosen solve does not use). */
  readonly skipInputs?: readonly string[];
  /** Warning codes shown before all other warnings. */
  readonly pinWarningCodes?: readonly string[];
  /** Validity check names that are information, not a pass/fail test: they are listed without a pass mark and are not counted as failed. */
  readonly informationalChecks?: readonly string[];
}

const MEANING: Readonly<Record<Bound, string>> = {
  nominal: 'Nominal value (rounded to nearest)',
  'min-requirement': 'Minimum required (rounded up)',
  'max-capacity': 'Maximum capacity (rounded down)',
  prediction: 'Predicted value (rounded up)',
};

/** A dimensionless factor printed through format-result. */
export function factorText(f: number, opts: HeadlineOpts): string {
  return formatResult({ value: q(f, DIM.DIMENSIONLESS), bound: 'nominal' }, opts);
}

const capitalise = (s: string): string => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

function inputRow(i: CalcInput, label: string, headlineOpts: HeadlineOpts): ProvenanceRow {
  const value = formatResult({ value: i.value, bound: 'nominal' }, headlineOpts);
  return i.sourceDetail === undefined ? { label, value, source: i.source } : { label, value, source: i.source, detail: i.sourceDetail };
}

/** Builds every display string for a result. All numbers go through format-result (no direct formatFor, no override). */
export function buildResultView(r: CalcResult, o: BuildOptions): ResultView {
  const optsFor = (name: string): HeadlineOpts => {
    const role = o.lengthRoleByName?.[name] ?? o.lengthRole ?? 'geometry';
    const base: HeadlineOpts = { accuracyClass: o.accuracyClass, lengthRole: role };
    return o.prefs === undefined ? base : { ...base, prefs: o.prefs };
  };
  const label = (n: string): string => o.labels?.[n] ?? capitalise(n);
  const head = r.results.find((x) => x.name === o.headline) ?? r.results.find((x) => x.role === 'primary') ?? r.results[0];
  if (head === undefined) throw new Error('The result has no entries to show.');
  const skip = new Set(o.skip ?? []);
  const rows: ResultRowView[] = r.results
    .filter((x) => x !== head && !skip.has(x.name))
    .map((x): ResultRowView => {
      const base = { label: label(x.name), text: formatResult(x, optsFor(x.name)), ...(x.note !== undefined ? { hint: x.note } : {}) };
      const code = o.rowWarnings?.[x.name];
      const w = code === undefined ? undefined : r.warnings.find((k) => k.code === code);
      return w === undefined ? base : { ...base, note: { label: SEVERITY_LABEL[w.severity], message: w.message } };
    });
  const inlineCodes = new Set(Object.values(o.rowWarnings ?? {}));
  const listed = r.warnings.filter((w) => w.code === undefined || !inlineCodes.has(w.code) || !rows.some((row) => row.note?.message === w.message));
  rows.push(...(o.extraRows ?? []));
  const designValues: DesignValueView[] = r.designValues.map((dv) => {
    const dvOpts = optsFor(dv.name);
    const note = o.designNotes?.[dv.name];
    const factor = factorText(dv.derating.factor, dvOpts);
    const who = note?.defaulted === true ? 'engineering default' : 'set by you';
    const how = note === undefined ? `calculated × ${factor}` : note.basis !== undefined ? `${note.basis}, ${who}` : `calculated × ${factor} ${note.noun}, ${who}`;
    return {
      name: label(dv.name),
      direction: dv.direction,
      calculatedLabel: 'Calculated',
      calculated: formatDesignValue(dv, 'calculated', dvOpts),
      recommendedLabel: `Recommended (${how})`,
      recommended: formatDesignValue(dv, 'recommended', dvOpts),
      rationale: dv.derating.rationale,
    };
  });
  return {
    headline: { label: label(head.name), text: formatResult(head, optsFor(head.name)), meaning: MEANING[head.bound], ...(head.note !== undefined ? { note: head.note } : {}) },
    rows,
    designValues,
    ledger: ledgerView(r.reference.ledgerIds),
    confidence: { level: r.confidence.level, score: r.confidence.score, reasons: [...r.confidence.reasons], ruleText: CONFIDENCE_RULE_TEXT },
    warnings: orderWarnings(listed, o.pinWarningCodes ?? []),
    recommendation: r.recommendation,
    details: {
      method: r.method,
      reference: `${r.reference.standard}, edition: ${r.reference.edition}`,
      formula: r.formula,
      steps: r.steps.map((s) => ({ label: s.label, expr: s.expr, text: formatStep(s, optsFor(s.label)) })),
      assumptions: [...r.assumptions],
      validity: r.validityChecks.map((v) => ((o.informationalChecks ?? []).includes(v.name) ? { ...v, informational: true } : { ...v })),
      inputs: [...r.inputs.filter((i) => !(o.skipInputs ?? []).includes(i.name)).map((i) => inputRow(i, label(i.name), optsFor(i.name))), ...(o.extraProvenance ?? [])],
    },
  };
}
