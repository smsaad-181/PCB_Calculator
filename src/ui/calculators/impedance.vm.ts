// Shared view-model engine for the three impedance pages (microstrip, stripline, coax). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculations are src/core/calculators/{microstrip,stripline,coax} compute().
// Every number is printed by buildResultView, which prints through src/core/format-result.
import type { AccuracyClass } from '../../core/confidence';
import { formatDelayPerLength } from '../../core/calculators/delay-shared';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { LOSS_LABEL } from '../../core/calculators/loss-shared';
import { MU0_LEDGER_DISPLAY, paywalledPaperRole } from '../../core/data/impedance-wording';
import type { CalcOutcome, CalcResult } from '../../core/result';
import { DIM, q, type Dim, type DisplayPrefs, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import type { CalloutView } from '../components/Callout';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import type { NearNote, NearResultView } from '../components/NearResultNotes';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import { MAX_FIELD_CHARS, buildResultView, orderWarnings, parseField, type FieldView, type ResultRowView, type ResultView, type WarningView } from '../components/view';
import { hasKey, readText } from './circuit-view';
import {
  EXT_LEDGER_ROLE,
  EXT_TEXT_LABEL,
  canTakeProfile,
  collectExt,
  extChoiceDefs,
  extProfileFromHash,
  extProfileToHash,
  extStateKeyOfCoreField,
  extTextDefs,
  type ExtSpec,
} from './impedance-ext.vm';
import { bundledProfile } from './fab-profile-choice';
import { epsHandoffHref, signedPercentText } from './result-links';
import { LOSS_CODES, buildLossView, isLossName, type LossView } from './loss-view';
import { buildToleranceView, type ToleranceView } from './tolerance-view';

export type { Units };

/** The mandatory banner, as a prominent notice. The text is the core constant, never retyped here. */
export const BANNER: CalloutView = { heading: 'Approximate result: verify with the fabricator', text: IMPEDANCE_BANNER };

/** Longest free-text note (er source, geometry source). The core refuses more than 500; the link carries at most this many. */
export const MAX_NOTE_CHARS = 200;

export const ER_HELP =
  "No default and no example: enter the Dk from your fabricator's stackup, at your frequency. Published FR-4 values span about 3.8 to 5.3 across the sources read (ledger S-027, UNVERIFIED) and vary with frequency, resin content and product, so this page does not pick one for you.";
export const ER_SOURCE_HELP =
  "Required. Say where er came from, for example the fabricator's stackup drawing or a laminate datasheet with its revision and test frequency. It is echoed in the result inputs and is not checked.";
export const NOT_IN_LINK_SHORT = 'The stackup is not part of the link: the link carries only the h, t and er values derived from it.';

export const SOLVE_NOTE = 'Choose what to calculate; the field that is solved is not asked for.';

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKind = 'length' | 'resistance' | 'frequency' | 'number' | 'note';

export interface TextDef {
  readonly key: string;
  readonly label: string;
  readonly hash: string;
  readonly kind: FieldKind;
  /** How a length echoes: 'geometry' (mm or mil), 'thickness' (um or mil), 'other'. */
  readonly echo?: 'geometry' | 'thickness' | 'other';
  /** Longest accepted text; defaults to MAX_FIELD_CHARS (a note defaults to MAX_NOTE_CHARS). */
  readonly max?: number;
  /** What a plain-number field is, for its echo and error text (default: relative permittivity). */
  readonly what?: string;
}

export interface ChoiceDef {
  readonly key: string;
  readonly hash: string;
  readonly values: readonly string[];
  /** Shown when the link carries a value that is not one of `values`. */
  readonly notice: string;
}

const DIM_OF: Readonly<Record<Exclude<FieldKind, 'note'>, Dim>> = {
  length: DIM.LENGTH,
  resistance: DIM.RESISTANCE,
  frequency: DIM.FREQUENCY,
  number: DIM.DIMENSIONLESS,
};

/** The dimension a field expects (a note has none; it returns dimensionless and the page does not use it). */
export function dimOfKind(k: FieldKind): Dim {
  return k === 'note' ? DIM.DIMENSIONLESS : DIM_OF[k];
}

const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** A plain number with no unit (relative permittivity). Input validation only; the core refuses values below 1. */
export function parseNumberField(text: string, what = 'relative permittivity'): FieldView {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!PLAIN_NUMBER.test(t)) return { status: 'error', message: `Enter ${what} as a plain number without a unit.` };
  const n = Number(t);
  if (!Number.isFinite(n)) return { status: 'error', message: 'The value is not a finite number.' };
  return { status: 'ok', value: q(n, DIM.DIMENSIONLESS), echo: `= ${t} (${what}, dimensionless)`, warnings: [] };
}

function echoFor(def: TextDef, units: Units): DisplayPrefs {
  return echoPrefs(units, def.echo === 'thickness' ? 'thickness' : def.echo === 'geometry' ? 'width' : 'other');
}

/** Parses one quantity field of the state. Notes are not quantities and must not be passed here. */
export function parseDef(def: TextDef, text: string, units: Units): FieldView {
  if (def.kind === 'number') return parseNumberField(text, def.what);
  return parseField(text, dimOfKind(def.kind), echoFor(def, units));
}

/** Echo preferences for a field, for the page's QuantityField. */
export function echoOf(def: TextDef, units: Units): DisplayPrefs {
  return echoFor(def, units);
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
export function noteMax(def: TextDef): number {
  return def.max ?? (def.kind === 'note' ? MAX_NOTE_CHARS : MAX_FIELD_CHARS);
}

export interface Loaded<S> {
  readonly state: S;
  readonly notices: readonly string[];
}

export type ImpedanceState = Record<string, string>;

export interface ImpedanceSpec<S extends ImpedanceState> {
  readonly id: string;
  readonly defaults: S;
  readonly text: readonly TextDef[];
  readonly choices: readonly ChoiceDef[];
  /** State keys of the text fields used by the current choices (the others are ignored, not parsed). */
  readonly active: (s: S) => readonly string[];
  /** Active keys that must be filled before a result can be shown. */
  readonly required: (s: S) => readonly string[];
  /** Message per required key (shown as "what is still missing"). */
  readonly needs: Readonly<Record<string, string>>;
  readonly needsExtra?: (s: S) => readonly string[];
  /** Core input object from the parsed fields. `note(key)` is the trimmed text of a note, or undefined when empty. */
  readonly build: (s: S, get: (key: string) => Quantity | undefined, note: (key: string) => string | undefined) => Record<string, unknown>;
  readonly compute: (inputs: Record<string, unknown>) => CalcOutcome;
  /** Core error field name to state key. */
  readonly coreField: Readonly<Record<string, string>>;
  readonly headline: (s: S) => string;
  readonly labels: Readonly<Record<string, string>>;
  readonly accuracyClass: AccuracyClass;
  /** Result and input names printed as thickness (um and mil) instead of geometry (mm and mil). */
  readonly thicknessNames: Readonly<Record<string, 'thickness'>>;
  /** When true and the headline is a width, a plain-text starting value for a net class is offered. */
  readonly netClass: boolean;
  /** The optional tolerance and loss sections (shared by every impedance page). */
  readonly ext: ExtSpec;
  /** Names of the result entries that are delay per length (their core note, ps/mm and ps/in, is the row text). Default: 'delay per length'. */
  readonly delayNames?: readonly string[];
  /** Warning codes shown before all others. Default: OUT_OF_RANGE and THICKNESS_VARIANT_CONFLICT. */
  readonly pinCodes?: readonly string[];
  /** Core warning code to the heading of an Important notice: those warnings are shown as notices, not in the warning list. */
  readonly calloutWarnings?: Readonly<Record<string, string>>;
  /** Validity check names that are information, not a test. */
  readonly informational?: readonly string[];
  /** The value lines of the net-class text (for example width and spacing together); the shared basis lines are appended. Undefined means offer none. */
  readonly netClassText?: (result: ResultView, s: Record<string, string>) => readonly string[] | undefined;
  /** Core input name and short label of h (or b), for the net-class basis. Absent: the page has none (coax). */
  readonly sizeInput?: { readonly name: string; readonly label: string };
  /** Core result names of the thickness-variant secondary results; `diff` names print as a signed percent. */
  readonly conflict?: { readonly names: readonly string[]; readonly diff: readonly string[] };
  /** True when the page offers the eps_eff -> quarter-wave hand-off link. */
  readonly epsHandoff?: boolean;
  /** Text in the core assumptions to replace (exact substring) with the page's own wording. */
  readonly assumptionRewrite?: Readonly<Record<string, string>>;
}

const allText = <S extends ImpedanceState>(spec: ImpedanceSpec<S>): readonly TextDef[] => [...spec.text, ...extTextDefs(spec.ext)];
const allChoices = <S extends ImpedanceState>(spec: ImpedanceSpec<S>): readonly ChoiceDef[] => [...spec.choices, ...extChoiceDefs(spec.ext)];

export function toHashStateOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, s: S): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of allText(spec)) {
    const v = s[d.key] ?? '';
    if (v.trim() !== '' && v.trim() !== '|') out[d.hash] = v.slice(0, noteMax(d));
  }
  for (const c of allChoices(spec)) {
    const v = s[c.key] ?? '';
    if (v !== spec.defaults[c.key]) out[c.hash] = v;
  }
  extProfileToHash(spec.ext, s, out);
  if (s['units'] !== spec.defaults['units']) out['u'] = s['units'] ?? 'metric';
  return out;
}

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashStateOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, h: HashState): Loaded<S> {
  const notices: string[] = [];
  const out: Record<string, string> = { ...spec.defaults };
  for (const d of allText(spec)) out[d.key] = readText(h, d.hash, d.label, notices, noteMax(d));
  for (const c of allChoices(spec)) {
    if (!hasKey(h, c.hash)) continue;
    const v = h[c.hash] ?? '';
    if (c.values.includes(v)) out[c.key] = v;
    else notices.push(c.notice);
  }
  extProfileFromHash(spec.ext, h, out, notices);
  const u = h['u'];
  if (u !== undefined && RESERVED_STATE_KEYS.u.isValid(u)) out['units'] = u;
  return { state: out as S, notices };
}

export function writtenKeysOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>): readonly string[] {
  const fp = spec.ext.tol.some((d) => d.profile !== undefined) ? ['fp'] : [];
  return [...allText(spec).map((d) => d.hash), ...allChoices(spec).map((c) => c.hash), ...fp, 'u'];
}

// ---------------------------------------------------------------------------
// Ledger rows
// ---------------------------------------------------------------------------
/** Model description plus the core's status-correct wording for a paywalled paper (the row is never called a standard). */
function paperRole(id: string, what: string): string {
  return `${what} ${paywalledPaperRole(id) ?? 'Verify against the primary source and your fabricator stackup.'}.`;
}

/** What each ledger row backs on the impedance pages. Wording for the reader; the status always comes from the ledger. */
export const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-020': 'Microstrip Z0 and eps_eff at zero strip thickness (Hammerstad-Jensen form; two independent secondary sources agree, the 1980 paper was not read).',
  'S-020a': 'Strip-thickness correction for microstrip: the sources disagree (full vs simplified procedure), so it is an opt-in variant.',
  'S-021': 'Symmetric stripline Z0 at zero strip thickness (Pozar 3.179 form; secondary sources, the textbook was not read).',
  'S-021a': 'Finite-thickness stripline form for wide strips: the sources disagree, so it is an opt-in variant.',
  'S-024': 'Ideal coaxial line Z0 (two sources agree).',
  'S-022': paperRole('S-022', 'Edge-coupled microstrip even and odd mode (Hammerstad-Jensen coupled-line static model). One secondary source was read.'),
  'S-022a': paperRole('S-022a', 'Edge-coupled stripline even and odd mode (Cohn approximate forms). One secondary source was read.'),
  'S-022b': 'Definitions Zdiff = 2 Zodd and Zcommon = Zeven / 2 (two sources agree).',
  'S-023': 'CPW without a lower ground plane, conformal-map Z0 and eps_e: the sources disagree on the effective permittivity (Steer gives a different empirical fit); the conformal-map form is used and the fit is not implemented. The primary papers were not read.',
  'S-023a': paperRole('S-023a', 'Conductor-backed CPW (CPWG), Ghione-Naldi form as transcribed in one secondary source.'),
  'S-023b': 'Complete elliptic integral K(k) by the arithmetic-geometric mean (NIST DLMF), used by both coplanar models.',
  'S-013': `${MU0_LEDGER_DISPLAY}: permeability of free space, used with c to get the impedance of free space eta0 (exact SI constants).`,
  'S-029': 'Speed of light c = 299 792 458 m/s (exact), used for delay and wavelength.',
  'S-029a': 'Delay = sqrt(eps_eff)/c and guided wavelength = lambda0/sqrt(eps_eff) (independent authors agree).',
  'S-029b': 'Skew from a length mismatch, derived from the delay; one worked table only. Not part of the Z0 or eps_eff result.',
  ...EXT_LEDGER_ROLE,
};

export function ledgerRowBadges(result: ResultView): LedgerRowBadge[] {
  return result.ledger.entries.map((e) => ({ id: e.id, status: e.status, role: LEDGER_ROLE[e.id] ?? e.item }));
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export type FieldErrors = Partial<Record<string, string>>;

export type ImpedanceView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[]; readonly banner: CalloutView }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[]; readonly banner: CalloutView }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly ledgerRows: readonly LedgerRowBadge[];
      readonly banner: CalloutView;
      /** Plain text with the solved quantity in mm and mil and its basis, offered as a net-class starting value (never a design rule). */
      readonly netClass?: string;
      /** What the net-class text holds: names the solved quantity. */
      readonly netClassHelp?: string;
      /** Labelled secondary results of the thickness variants (ledger CONFLICT), shown beside the headline. */
      readonly conflict?: ConflictView;
      /** What the model does not include, from the core warnings and assumptions. */
      readonly limits?: LimitsView;
      /** Plain-language line shown with a low confidence. */
      readonly lowNote?: string;
      /** Link to the quarter-wave page carrying only eps_eff. */
      readonly handoff?: { readonly href: string; readonly label: string; readonly help: string };
      /** Tolerance corners and sensitivities from the core result; absent when no tolerance was entered. */
      readonly tolerance?: ToleranceView;
      /** The loss block from the core result; absent when no loss was asked for or it could not be computed yet. */
      readonly loss?: LossView;
      /** Notes that belong right next to the result (fab profile stale or unverified, a published tolerance not usable). */
      readonly near?: NearResultView;
      /** What is missing for the loss estimate (the main result is shown without it). */
      readonly lossNeeds: readonly string[];
      /** Core warnings the page shows as Important notices (see ImpedanceSpec.calloutWarnings), in core order. */
      readonly callouts?: readonly CalloutView[];
    };

const DELAY_NAME = 'delay per length';

export interface ConflictView {
  readonly heading: string;
  readonly rows: readonly ResultRowView[];
  readonly notes: readonly WarningView[];
}
export interface LimitsView {
  readonly heading: string;
  readonly items: readonly { readonly title: string; readonly text: string }[];
}

export const CONFLICT_HEADING = 'Same geometry with the thickness variant: sources disagree, so these are side values, not the headline';
export const LIMITS_HEADING = 'What this model does not include, and which way it moves Z0';
export const LOW_CONFIDENCE_NOTE =
  "Low means the model's source is conflicting or paywalled, not that the number is wrong: verify with your fabricator. An input outside the model's range is the one case where the number itself is less reliable; the confidence reasons say which rule applied.";
export const NO_PROFILE_NOTE = 'Width/spacing not checked against any fab minimum: choose a fab profile in the Fab profile section to compare with its published minimum.';
export const HANDOFF_LABEL = 'eps_eff -> quarter-wave helper';
export const HANDOFF_HELP = 'Opens the quarter-wave page with this eps_eff only; its data status and source do not travel with the number, so check them on this page.';
export const NET_CLASS_LEAD = 'Starting value for a net class, not a design rule.';

const CONFLICT_CODES: readonly string[] = ['THICKNESS_VARIANT_SECONDARY', 'THICKNESS_VARIANT_NOT_SHOWN'];
const MINIMUM_CODES: readonly string[] = ['BELOW_PROFILE_MINIMUM', 'MEETS_PROFILE_MINIMUM', 'PROFILE_MINIMUM_NOT_PUBLISHED', 'PROFILE_MINIMUM_NOT_AVAILABLE', 'PROFILE_MINIMUM_NOT_CHECKED'];
/** Core warning code to the heading of its entry in the limits block (the core message is shown verbatim). */
const LIMIT_TITLE: Readonly<Record<string, string>> = {
  SOLDERMASK_NOT_MODELLED: 'Soldermask or coating',
  ZERO_THICKNESS_MODEL: 'Finite copper thickness',
  FINITE_THICKNESS_NOT_MODELLED: 'Finite copper thickness',
  DISPERSION_NOT_MODELLED: 'Frequency dependence',
};
const LIMIT_CODES: readonly string[] = Object.keys(LIMIT_TITLE);
const ETCH = /etch/i;

/**
 * The net-class text: the page's value lines, then the basis (model, ledger rows with status, er and its source, h or b, t and whether the
 * model used it, thickness model, geometry source, confidence), the banner and the date. Every number is the one already printed by
 * format-result in the result view.
 */
export function netClassTextOf(
  spec: { readonly ext: ExtSpec; readonly sizeInput?: { readonly name: string; readonly label: string } | undefined },
  lines: readonly string[],
  result: ResultView,
  raw: CalcResult,
  s: Record<string, string>,
  today: string | undefined,
): string {
  const at = (name: string): number => raw.inputs.findIndex((x) => x.name === name);
  const shown = (name: string): string | undefined => (at(name) < 0 ? undefined : result.details.inputs[at(name)]?.value);
  const detail = (name: string): string | undefined => (at(name) < 0 ? undefined : result.details.inputs[at(name)]?.detail);
  const er = shown('er');
  const size = spec.sizeInput === undefined ? undefined : shown(spec.sizeInput.name);
  const t = shown('thickness');
  const used = spec.ext.thicknessUsed?.(s) === true;
  const model = s['thicknessModel'] ?? 'none';
  const geo = ['width', 'edge spacing', 'gap', 'height', 'plane spacing', 'spacing'].map(detail).find((d) => d !== undefined);
  const ledger = result.ledger.entries.map((e) => `${e.id} ${e.status}`).join('; ');
  return [
    ...lines,
    NET_CLASS_LEAD,
    `Model: ${raw.method}`,
    `Ledger rows: ${ledger}`,
    ...(er !== undefined ? [`er: ${er} (source: ${detail('er') ?? 'not given'})`] : []),
    ...(size !== undefined && spec.sizeInput !== undefined ? [`${spec.sizeInput.label}: ${size}`] : []),
    ...(t !== undefined ? [`t: ${t}, ${used ? 'used by the thickness model' : 'not used by this model'}`] : []),
    `Thickness model: ${model === 'none' ? 'zero thickness (t not used)' : `${model} (opt-in variant, sources in CONFLICT)`}`,
    `Geometry source: ${geo ?? 'not given'}`,
    `Confidence: ${result.confidence.level}`,
    IMPEDANCE_BANNER,
    `Date: ${today !== undefined && today !== '' ? today : 'not available'}`,
  ].join('\n');
}

const NEAR_CODES: readonly string[] = ['FAB_PROFILE_UNVERIFIED', 'FAB_PROFILE_STALE', 'TOLERANCE_NOT_USABLE', ...MINIMUM_CODES];
const capitalise = (s: string): string => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

function extLabel(ext: ExtSpec, key: string): string | undefined {
  const d = ext.tol.find((x) => x.state === key);
  return d !== undefined ? `${d.label} tolerance` : EXT_TEXT_LABEL[key];
}

/**
 * Parses the form and runs the calculator. 'ok' only when the core returned a result; otherwise a message, never a number.
 * `today` (YYYY-MM-DD) is needed only for a tolerance taken from a fab profile; the core never reads a clock.
 */
export function computeViewOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, s: S, today?: string): ImpedanceView {
  const notes: string[] = [];
  const problems: string[] = [];
  const needs: string[] = [];
  const fieldErrors: FieldErrors = {};
  const units = s['units'] === 'imperial' ? 'imperial' : 'metric';
  const active = spec.active(s);
  const parsed = new Map<string, FieldView>();

  for (const d of spec.text) {
    if (!active.includes(d.key)) continue;
    const text = s[d.key] ?? '';
    if (d.kind === 'note') {
      if (text.length > noteMax(d)) {
        const m = `Too long (at most ${String(noteMax(d))} characters).`;
        problems.push(`${d.label}: ${m}`);
        fieldErrors[d.key] = m;
      }
      continue;
    }
    const v = parseDef(d, text, units);
    parsed.set(d.key, v);
    if (v.status === 'error') {
      problems.push(`${d.label}: ${v.message}`);
      fieldErrors[d.key] = v.message;
    }
  }
  const ext = collectExt(spec.ext, s, active, { today, hasFrequency: parsed.get('frequency')?.status === 'ok' });
  problems.push(...ext.problems);
  Object.assign(fieldErrors, ext.fieldErrors);
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes, banner: BANNER };

  const noteOf = (key: string): string | undefined => {
    const t = (s[key] ?? '').trim();
    return t === '' ? undefined : t;
  };
  for (const key of spec.required(s)) {
    const def = spec.text.find((d) => d.key === key);
    const empty = def?.kind === 'note' ? noteOf(key) === undefined : parsed.get(key)?.status === 'empty';
    if (empty) needs.push(spec.needs[key] ?? `Enter ${def?.label ?? key}.`);
  }
  needs.push(...(spec.needsExtra?.(s) ?? []), ...ext.needs);
  if (needs.length > 0) return { status: 'needs-input', needs, notes, banner: BANNER };

  const get = (key: string): Quantity | undefined => {
    const v = parsed.get(key);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const out = spec.compute({ ...spec.build(s, get, noteOf), ...ext.inputs });
  if (!out.ok) {
    const coreKey = spec.coreField[out.error.field ?? ''];
    const key = coreKey ?? extStateKeyOfCoreField(spec.ext, out.error.field);
    const label = key === undefined ? undefined : (spec.text.find((d) => d.key === key)?.label ?? extLabel(spec.ext, key));
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return {
      status: 'error',
      problems: [label !== undefined ? `${label}: ${out.error.message}` : out.error.message],
      fieldErrors,
      notes,
      banner: BANNER,
    };
  }

  const raw = out.value;
  const prefs = headlinePrefs(units);
  const delayNames = spec.delayNames ?? [DELAY_NAME];
  const extraRows: ResultRowView[] = delayNames.flatMap((n): ResultRowView[] => {
    const d = raw.results.find((r) => r.name === n);
    return d?.note === undefined ? [] : [{ label: spec.labels[n] ?? n.charAt(0).toUpperCase() + n.slice(1), text: d.note }];
  });
  const head = spec.headline(s);

  // the optional blocks come from the core result; their warnings are shown in their block, not in the general list
  const names = [...new Set([...(raw.envelope ?? []).map((e) => e.name), ...Object.keys(spec.labels), ...delayNames])];
  const tolLabels: Record<string, string> = { ...Object.fromEntries(names.map((n) => [n, capitalise(n)])), ...spec.labels };
  const tb = buildToleranceView(raw, { accuracyClass: spec.accuracyClass, prefs, labels: tolLabels, thicknessNames: Object.keys(spec.thicknessNames), printers: Object.fromEntries(delayNames.map((n) => [n, formatDelayPerLength])) }, names);
  const loss = buildLossView(raw, (id) => LEDGER_ROLE[id]);
  const takesProfile = canTakeProfile(spec.ext);
  const nearWarnings = tb.warnings.filter((w) => w.code !== undefined && NEAR_CODES.includes(w.code));
  const nearNotes: NearNote[] = nearWarnings.flatMap((w) => orderWarnings([w]).map((v) => ({ ...v, code: w.code ?? '' })));
  const minimumShown = nearWarnings.some((w) => w.code !== undefined && MINIMUM_CODES.includes(w.code));
  if (takesProfile && !minimumShown) nearNotes.push(...orderWarnings([{ severity: 'info', message: NO_PROFILE_NOTE }]).map((v) => ({ ...v, code: 'PROFILE_MINIMUM_NOT_CHOSEN' })));
  const profileStatus = ext.inputs['fabProfile'] !== undefined ? bundledProfile()?.status : undefined;
  const near: NearResultView = {
    notes: nearNotes,
    unverified: (raw.fabProfile !== undefined && raw.fabProfile.status !== 'VERIFIED') || (minimumShown && profileStatus !== undefined && profileStatus !== 'VERIFIED'),
  };
  const calloutMap = spec.calloutWarnings ?? {};
  const callouts: CalloutView[] = raw.warnings.flatMap((w) => (w.code !== undefined && calloutMap[w.code] !== undefined ? [{ heading: calloutMap[w.code] as string, text: w.message }] : []));
  const hidden = (w: { readonly code?: string | undefined }): boolean =>
    w.code !== undefined && (NEAR_CODES.includes(w.code) || LOSS_CODES.includes(w.code) || CONFLICT_CODES.includes(w.code) || LIMIT_CODES.includes(w.code) || calloutMap[w.code] !== undefined);
  const rewrite = Object.entries(spec.assumptionRewrite ?? {});
  const forView: CalcResult = {
    ...raw,
    assumptions: raw.assumptions.map((a) => rewrite.reduce((acc, [from, to]) => acc.split(from).join(to), a)),
    warnings: tb.warnings.filter((w) => !hidden(w)),
  };
  const lossNames = raw.results.filter((r) => isLossName(r.name)).map((r) => r.name);
  const labelOf = (n: string): string => spec.labels[n] ?? capitalise(n);
  const conflictLabels = (spec.conflict?.names ?? []).map(labelOf);
  const diffLabels = (spec.conflict?.diff ?? []).map(labelOf);

  const built = buildResultView(forView, {
    headline: head,
    accuracyClass: spec.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: spec.thicknessNames,
    labels: spec.labels,
    skip: [...delayNames, ...tb.skipNames, ...lossNames],
    extraRows,
    pinWarningCodes: spec.pinCodes ?? ['OUT_OF_RANGE', 'THICKNESS_VARIANT_CONFLICT'],
    ...(spec.informational !== undefined ? { informationalChecks: spec.informational } : {}),
  });
  const conflictRows: ResultRowView[] = built.rows
    .filter((r) => conflictLabels.includes(r.label))
    .map((r) => {
      if (!diffLabels.includes(r.label)) return r;
      const core = raw.results.find((x) => labelOf(x.name) === r.label);
      return core === undefined ? r : { ...r, text: signedPercentText(core.value, spec.accuracyClass) };
    });
  const result: ResultView = { ...built, rows: built.rows.filter((r) => !conflictLabels.includes(r.label)) };
  const conflictNotes = orderWarnings(tb.warnings.filter((w) => w.code !== undefined && CONFLICT_CODES.includes(w.code)));
  const conflict: ConflictView | undefined = conflictRows.length > 0 || conflictNotes.length > 0 ? { heading: CONFLICT_HEADING, rows: conflictRows, notes: conflictNotes } : undefined;

  const limitItems: { title: string; text: string }[] = [];
  for (const w of tb.warnings) {
    const title = w.code === undefined ? undefined : LIMIT_TITLE[w.code];
    if (title !== undefined && !limitItems.some((i) => i.title === title)) limitItems.push({ title, text: w.message });
  }
  const etch = raw.assumptions.find((a) => ETCH.test(a));
  if (etch !== undefined) limitItems.push({ title: 'Copper roughness and etch profile', text: [etch, ...(loss === undefined ? [LOSS_LABEL] : [])].join(' ') });
  const limits: LimitsView | undefined = limitItems.length > 0 ? { heading: LIMITS_HEADING, items: limitItems } : undefined;

  const lines =
    spec.netClassText !== undefined
      ? spec.netClassText(result, s)
      : spec.netClass && /width/.test(head)
        ? [`${result.headline.label}: ${result.headline.text}`]
        : undefined;
  const netClass = lines === undefined ? undefined : netClassTextOf(spec, lines, result, raw, s, today);
  const netClassHelp = lines === undefined ? undefined : `The solved quantity (${result.headline.label.toLowerCase()}) in mm and mil, with its stackup basis, the data status and the approximation note. A starting point, not a design rule.`;
  const eps = spec.epsHandoff === true ? raw.results.find((r) => r.name === 'effective permittivity') : undefined;
  const handoff = eps === undefined ? undefined : { href: epsHandoffHref(eps.value), label: HANDOFF_LABEL, help: HANDOFF_HELP };
  const hasTol = tb.view.envelopes.length > 0 || tb.view.notices.length > 0 || tb.view.sensitivities.length > 0;
  return {
    status: 'ok',
    result,
    raw,
    fieldErrors,
    notes,
    ledgerRows: ledgerRowBadges(result),
    banner: BANNER,
    lossNeeds: ext.lossNeeds,
    ...(callouts.length > 0 ? { callouts } : {}),
    ...(hasTol ? { tolerance: tb.view } : {}),
    ...(loss !== undefined ? { loss } : {}),
    ...(near.notes.length > 0 ? { near } : {}),
    ...(netClass !== undefined ? { netClass } : {}),
    ...(netClassHelp !== undefined ? { netClassHelp } : {}),
    ...(conflict !== undefined ? { conflict } : {}),
    ...(limits !== undefined ? { limits } : {}),
    ...(result.confidence.level === 'low' ? { lowNote: LOW_CONFIDENCE_NOTE } : {}),
    ...(handoff !== undefined ? { handoff } : {}),
  };
}

/** Text for the screen-reader live region. */
export function liveSummaryOf(v: ImpedanceView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}. ${v.banner.text}`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
