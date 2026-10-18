// Shared view-model engine for the three impedance pages (microstrip, stripline, coax). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculations are src/core/calculators/{microstrip,stripline,coax} compute().
// Every number is printed by buildResultView, which prints through src/core/format-result.
import type { AccuracyClass } from '../../core/confidence';
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import type { CalcOutcome, CalcResult } from '../../core/result';
import { DIM, q, type Dim, type DisplayPrefs, type Quantity } from '../../core/units';
import { RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import type { CalloutView } from '../components/Callout';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultRowView, type ResultView } from '../components/view';
import { hasKey, readText } from './circuit-view';

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
export function parseNumberField(text: string): FieldView {
  const t = text.trim();
  if (t === '') return { status: 'empty' };
  if (t.length > MAX_FIELD_CHARS) return { status: 'error', message: `Too long (at most ${String(MAX_FIELD_CHARS)} characters).` };
  if (!PLAIN_NUMBER.test(t)) return { status: 'error', message: 'Enter a plain number without a unit, for example the Dk from your fabricator.' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { status: 'error', message: 'The value is not a finite number.' };
  return { status: 'ok', value: q(n, DIM.DIMENSIONLESS), echo: `= ${t} (relative permittivity, dimensionless)`, warnings: [] };
}

function echoFor(def: TextDef, units: Units): DisplayPrefs {
  return echoPrefs(units, def.echo === 'thickness' ? 'thickness' : def.echo === 'geometry' ? 'width' : 'other');
}

/** Parses one quantity field of the state. Notes are not quantities and must not be passed here. */
export function parseDef(def: TextDef, text: string, units: Units): FieldView {
  if (def.kind === 'number') return parseNumberField(text);
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
  /** Names of the result entries that are delay per length (their core note, ps/mm and ps/in, is the row text). Default: 'delay per length'. */
  readonly delayNames?: readonly string[];
  /** Warning codes shown before all others. Default: OUT_OF_RANGE and THICKNESS_VARIANT_CONFLICT. */
  readonly pinCodes?: readonly string[];
  /** Validity check names that are information, not a test. */
  readonly informational?: readonly string[];
  /** Replaces the default net-class text (for example to give width and spacing together); undefined means offer none. */
  readonly netClassText?: (result: ResultView, s: Record<string, string>) => string | undefined;
}

export function toHashStateOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, s: S): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of spec.text) {
    const v = s[d.key] ?? '';
    if (v.trim() !== '') out[d.hash] = v.slice(0, noteMax(d));
  }
  for (const c of spec.choices) {
    const v = s[c.key] ?? '';
    if (v !== spec.defaults[c.key]) out[c.hash] = v;
  }
  if (s['units'] !== spec.defaults['units']) out['u'] = s['units'] ?? 'metric';
  return out;
}

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashStateOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, h: HashState): Loaded<S> {
  const notices: string[] = [];
  const out: Record<string, string> = { ...spec.defaults };
  for (const d of spec.text) out[d.key] = readText(h, d.hash, d.label, notices, noteMax(d));
  for (const c of spec.choices) {
    if (!hasKey(h, c.hash)) continue;
    const v = h[c.hash] ?? '';
    if (c.values.includes(v)) out[c.key] = v;
    else notices.push(c.notice);
  }
  const u = h['u'];
  if (u !== undefined && RESERVED_STATE_KEYS.u.isValid(u)) out['units'] = u;
  return { state: out as S, notices };
}

export function writtenKeysOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>): readonly string[] {
  return [...spec.text.map((d) => d.hash), ...spec.choices.map((c) => c.hash), 'u'];
}

// ---------------------------------------------------------------------------
// Ledger rows
// ---------------------------------------------------------------------------
/** What each ledger row backs on the impedance pages. Wording for the reader; the status always comes from the ledger. */
export const LEDGER_ROLE: Readonly<Record<string, string>> = {
  'S-020': 'Microstrip Z0 and eps_eff at zero strip thickness (Hammerstad-Jensen form; two independent secondary sources agree, the 1980 paper was not read).',
  'S-020a': 'Strip-thickness correction for microstrip: the sources disagree (full vs simplified procedure), so it is an opt-in variant.',
  'S-021': 'Symmetric stripline Z0 at zero strip thickness (Pozar 3.179 form; secondary sources, the textbook was not read).',
  'S-021a': 'Finite-thickness stripline form for wide strips: the sources disagree, so it is an opt-in variant.',
  'S-024': 'Ideal coaxial line Z0 (two sources agree).',
  'S-022': 'Edge-coupled microstrip even and odd mode (Hammerstad-Jensen coupled-line static model). One secondary source was read; the 1980 paper was not. Verify with your licensed copy / fab stackup.',
  'S-022a': 'Edge-coupled stripline even and odd mode (Cohn approximate forms). One secondary source was read; the primary paper was not. Verify with your licensed copy / fab stackup.',
  'S-022b': 'Definitions Zdiff = 2 Zodd and Zcommon = Zeven / 2 (two sources agree).',
  'S-023': 'CPW without a lower ground plane, conformal-map Z0 and eps_e: the sources disagree on the effective permittivity (Steer gives a different empirical fit); the conformal-map form is used and the fit is not implemented. The primary papers were not read.',
  'S-023a': 'Conductor-backed CPW (CPWG), Ghione-Naldi form as transcribed in one secondary source; the 1983 paper is paywalled and was not read. Verify with your licensed copy / fab stackup.',
  'S-023b': 'Complete elliptic integral K(k) by the arithmetic-geometric mean (NIST DLMF), used by both coplanar models.',
  'S-013': 'Permeability of free space mu0, used with c to get the impedance of free space eta0 (exact SI constants).',
  'S-029': 'Speed of light c = 299 792 458 m/s (exact), used for delay and wavelength.',
  'S-029a': 'Delay = sqrt(eps_eff)/c and guided wavelength = lambda0/sqrt(eps_eff) (independent authors agree).',
  'S-029b': 'Skew from a length mismatch, derived from the delay; one worked table only. Not part of the Z0 or eps_eff result.',
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
      /** Plain text with the solved width in mm and mil, offered as a net-class starting value (never a design rule). */
      readonly netClass?: string;
    };

const DELAY_NAME = 'delay per length';

export function startingValueText(label: string, headlineText: string): string {
  return `${label}: ${headlineText}\nStarting value for a net class, not a design rule. ${IMPEDANCE_BANNER}`;
}

/** Parses the form and runs the calculator. 'ok' only when the core returned a result; otherwise a message, never a number. */
export function computeViewOf<S extends ImpedanceState>(spec: ImpedanceSpec<S>, s: S): ImpedanceView {
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
  needs.push(...(spec.needsExtra?.(s) ?? []));
  if (needs.length > 0) return { status: 'needs-input', needs, notes, banner: BANNER };

  const get = (key: string): Quantity | undefined => {
    const v = parsed.get(key);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const out = spec.compute(spec.build(s, get, noteOf));
  if (!out.ok) {
    const key = spec.coreField[out.error.field ?? ''];
    const def = key === undefined ? undefined : spec.text.find((d) => d.key === key);
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return {
      status: 'error',
      problems: [def !== undefined ? `${def.label}: ${out.error.message}` : out.error.message],
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
  const result = buildResultView(raw, {
    headline: head,
    accuracyClass: spec.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: spec.thicknessNames,
    labels: spec.labels,
    skip: delayNames,
    extraRows,
    pinWarningCodes: spec.pinCodes ?? ['OUT_OF_RANGE', 'THICKNESS_VARIANT_CONFLICT'],
    ...(spec.informational !== undefined ? { informationalChecks: spec.informational } : {}),
  });
  const netClass =
    spec.netClassText !== undefined
      ? spec.netClassText(result, s)
      : spec.netClass && /width/.test(head)
        ? startingValueText(result.headline.label, result.headline.text)
        : undefined;
  return {
    status: 'ok',
    result,
    raw,
    fieldErrors,
    notes,
    ledgerRows: ledgerRowBadges(result),
    banner: BANNER,
    ...(netClass !== undefined ? { netClass } : {}),
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
