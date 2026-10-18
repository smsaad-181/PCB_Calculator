// Shared view-model helpers for the optional "Tolerances and sensitivity" section of the trace width, trace resistance
// and via pages. Pure: no DOM. Every number printed here goes through format-result; the envelope and the sensitivities
// come from the core result (src/core/sensitivity.ts through the calculators). This file only parses what the user typed,
// builds the core `tolerances` object, and turns the core result into display strings.
import type { ThicknessChoice, TolValue } from '../../core/calculators/tolerance-shared';
import { formatResult, formatSignedPercent } from '../../core/format-result';
import type { Bound, CalcResult, CalcWarning, Envelope } from '../../core/result';
import { DIM, sameDim, q, type DisplayPrefs, type Quantity } from '../../core/units';
import type { EnvelopeRow } from '../components/EnvelopeTable';
import { MAX_FIELD_CHARS, parseField, parseFractionField, type FieldView } from '../components/view';

// ---------------------------------------------------------------------------
// One tolerance as typed
// ---------------------------------------------------------------------------
/** What the user typed for one tolerance: one text for both sides, or a minus text and a plus text. Empty means "not entered". */
export interface TolInput {
  readonly asym: boolean;
  readonly both: string;
  readonly minus: string;
  readonly plus: string;
}

export const EMPTY_TOL: TolInput = Object.freeze({ asym: false, both: '', minus: '', plus: '' });
export type TolState = Readonly<Record<string, TolInput>>;
export type TolKind = 'relative' | 'temperature';

export const isTolEmpty = (t: TolInput): boolean => (t.asym ? t.minus.trim() === '' && t.plus.trim() === '' : t.both.trim() === '');

/** Switching between one value and a pair keeps what was typed where it makes sense. */
export function toggleAsym(t: TolInput, asym: boolean): TolInput {
  if (asym === t.asym) return t;
  if (asym) return { asym: true, both: '', minus: t.both, plus: t.both };
  return { asym: false, both: t.minus.trim() === t.plus.trim() ? t.minus : '', minus: '', plus: '' };
}

const PAIR_SEP = '|';

/** Hash text of a tolerance (undefined when empty): "5%" for one value, "3%|10%" for minus|plus. */
export function encodeTol(t: TolInput): string | undefined {
  if (isTolEmpty(t)) return undefined;
  if (!t.asym) return t.both.slice(0, MAX_FIELD_CHARS);
  return `${t.minus.slice(0, MAX_FIELD_CHARS)}${PAIR_SEP}${t.plus.slice(0, MAX_FIELD_CHARS)}`;
}

/** Inverse of encodeTol. Never throws: text that is too long becomes empty plus a notice. */
export function decodeTol(v: string | undefined, notices: string[], label: string): TolInput {
  if (v === undefined) return EMPTY_TOL;
  const tooLong = (): TolInput => {
    notices.push(`${label} was too long and is empty instead.`);
    return EMPTY_TOL;
  };
  const i = v.indexOf(PAIR_SEP);
  if (i >= 0) {
    const minus = v.slice(0, i);
    const plus = v.slice(i + 1);
    if (minus.length > MAX_FIELD_CHARS || plus.length > MAX_FIELD_CHARS) return tooLong();
    return { asym: true, both: '', minus, plus };
  }
  if (v.length > MAX_FIELD_CHARS) return tooLong();
  return { asym: false, both: v, minus: '', plus: '' };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
const BARE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A percent or fraction ("5%", "0.05"). A bare number from 0.5 up is refused with the "write 5%" hint, never read as a huge fraction. */
const ZERO_PERCENT = /^\+?0+(?:\.0*)?\s*%?$/;

function parsePercentSide(text: string): FieldView {
  // Zero is a valid tolerance (it reads the sensitivity without a range); the shared fraction parser refuses it, so it is read here.
  if (ZERO_PERCENT.test(text.trim())) return { status: 'ok', value: q(0, DIM.DIMENSIONLESS), echo: '= 0 % (no tolerance on this side)', warnings: [] };
  const r = parseFractionField(text);
  if (r.status !== 'ok') return r;
  const t = text.trim();
  if (BARE_NUMBER.test(t) && r.value.si >= 0.5) {
    const message =
      r.value.si === 1
        ? `"${t}" is ambiguous: a bare number is a fraction, so it would mean 100 %. Write 1% or 0.01 for one percent.`
        : `"${t}" is read as a fraction, which is far too large for a tolerance. Write ${t}% to mean ${t} percent.`;
    return { status: 'error', message };
  }
  return r;
}

/** Parser for one side of a tolerance: a percent for 'relative', a temperature DIFFERENCE for 'temperature'. */
export function parseSide(text: string, kind: TolKind, prefs?: DisplayPrefs): FieldView {
  if (kind === 'temperature') return prefs === undefined ? parseField(text, DIM.TEMPERATURE_DIFFERENCE) : parseField(text, DIM.TEMPERATURE_DIFFERENCE, prefs);
  return parsePercentSide(text);
}

export type TolParse =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly value: TolValue; readonly echo: string }
  | { readonly status: 'error'; readonly message: string };

const BOTH_SIDES = 'Enter both the minus side and the plus side (type 0% for none), or switch back to one value for both sides.';

export function parseTolInput(t: TolInput, kind: TolKind, prefs?: DisplayPrefs): TolParse {
  if (isTolEmpty(t)) return { status: 'empty' };
  if (!t.asym) {
    const v = parseSide(t.both, kind, prefs);
    if (v.status === 'ok') return { status: 'ok', value: v.value, echo: v.echo };
    return v.status === 'error' ? { status: 'error', message: v.message } : { status: 'empty' };
  }
  if (t.minus.trim() === '' || t.plus.trim() === '') return { status: 'error', message: BOTH_SIDES };
  const m = parseSide(t.minus, kind, prefs);
  if (m.status === 'error') return { status: 'error', message: `Minus side: ${m.message}` };
  const p = parseSide(t.plus, kind, prefs);
  if (p.status === 'error') return { status: 'error', message: `Plus side: ${p.message}` };
  if (m.status !== 'ok' || p.status !== 'ok') return { status: 'error', message: BOTH_SIDES };
  return { status: 'ok', value: { minus: m.value, plus: p.value }, echo: `minus ${m.echo}; plus ${p.echo}` };
}

// ---------------------------------------------------------------------------
// Copper thickness choice (an explicit radio; there is no default)
// ---------------------------------------------------------------------------
export type ThicknessMode = '' | 'none' | 'foil' | 'finished' | 'pct';
export const THICKNESS_MODES: readonly ThicknessMode[] = ['foil', 'finished', 'pct', 'none'];
export const isThicknessMode = (v: string): v is Exclude<ThicknessMode, ''> => (THICKNESS_MODES as readonly string[]).includes(v);

export interface ThicknessOption {
  readonly value: Exclude<ThicknessMode, ''>;
  readonly label: string;
  readonly hint?: string;
}

export const THICKNESS_OPTIONS: readonly ThicknessOption[] = [
  {
    value: 'foil',
    label: 'Foil convention spread (S-003)',
    hint: 'The three oz/ft² to thickness conventions disagree; this uses that spread on both sides. It does not cover etch or plating variation.',
  },
  {
    value: 'finished',
    label: 'Finished copper, thin side only (S-009: secondhand figure, PAYWALLED, UNVERIFIED)',
    hint: 'Down to the finished-copper minimum for your weight and layer, no thick side. A minimum, not a typical value.',
  },
  { value: 'pct', label: 'My own percent', hint: 'You type the tolerance below.' },
  { value: 'none', label: 'No thickness tolerance' },
];

export const THICKNESS_LEGEND = 'Copper thickness tolerance (choose one; nothing is assumed for you)';
export const THICKNESS_CHOICE_NEEDS_WEIGHT = 'The foil spread and the finished-copper choices need the copper given as a weight (oz/ft²); with a thickness entered only your own percent is offered.';

/** The choices offered: the two data-based ones need a foil weight (the core refuses them for an entered thickness). */
export function thicknessOptionsFor(copperBy: 'weight' | 'thickness'): readonly ThicknessOption[] {
  return copperBy === 'weight' ? THICKNESS_OPTIONS : THICKNESS_OPTIONS.filter((o) => o.value === 'pct' || o.value === 'none');
}

/** The saved mode if it is still offered, else '' (a choice that is no longer offered is ignored, never sent). */
export function effectiveThickMode(mode: ThicknessMode, copperBy: 'weight' | 'thickness'): ThicknessMode {
  return thicknessOptionsFor(copperBy).some((o) => o.value === mode) ? mode : '';
}

// ---------------------------------------------------------------------------
// Fields and the core tolerances object
// ---------------------------------------------------------------------------
export interface TolFieldDef {
  /** Core tolerance key (also the key of the page's tol state). */
  readonly key: string;
  /** Hash key. */
  readonly hash: string;
  readonly id: string;
  /** What the tolerance is on, for example "Current". */
  readonly label: string;
  readonly kind: TolKind;
  /** Only offered for an input the user actually supplied. */
  readonly offered: boolean;
  /** Why it is not offered (shown as a muted line instead of a field). */
  readonly whyNot?: string;
  readonly help: string;
  /** The copper thickness entry: its text is used only with the "my own percent" choice. */
  readonly thickness?: boolean;
  /** Width only: true when the value comes from the fab profile (the typed text is then not used). */
  readonly fromProfile?: boolean;
}

export type TolEntry = TolValue | ThicknessChoice | 'profile';

export interface Collected {
  readonly tolerances?: Readonly<Record<string, TolEntry>>;
  /** Error text per core tolerance key. */
  readonly errors: Readonly<Record<string, string>>;
  readonly needs: readonly string[];
}

export function collectTolerances(fields: readonly TolFieldDef[], tol: TolState, thickMode: ThicknessMode, prefs?: DisplayPrefs): Collected {
  const out: Record<string, TolEntry> = {};
  const errors: Record<string, string> = {};
  const needs: string[] = [];
  for (const f of fields) {
    if (!f.offered) continue;
    if (f.thickness === true) {
      if (thickMode === 'foil') out[f.key] = { source: 'foil-convention-spread' };
      else if (thickMode === 'finished') out[f.key] = { source: 'finished-copper-s009' };
      else if (thickMode === 'pct') {
        const r = parseTolInput(tol[f.key] ?? EMPTY_TOL, f.kind, prefs);
        if (r.status === 'ok') out[f.key] = r.value;
        else if (r.status === 'error') errors[f.key] = r.message;
        else needs.push('Enter your own copper thickness tolerance as a percent (for example 10%), or choose another thickness option.');
      }
      continue;
    }
    if (f.fromProfile === true) {
      out[f.key] = 'profile';
      continue;
    }
    const r = parseTolInput(tol[f.key] ?? EMPTY_TOL, f.kind, prefs);
    if (r.status === 'ok') out[f.key] = r.value;
    else if (r.status === 'error') errors[f.key] = r.message;
  }
  return { ...(Object.keys(out).length > 0 ? { tolerances: out } : {}), errors, needs };
}

/** Maps a core error field such as "tolerances.current" to the tolerance key, when it is one of this page's fields. */
export function tolKeyOfCoreField(field: string | undefined, fields: readonly TolFieldDef[]): string | undefined {
  if (field === undefined || !field.startsWith('tolerances.')) return undefined;
  const k = field.slice('tolerances.'.length);
  return fields.some((f) => f.key === k) ? k : undefined;
}

export function tolProblems(errors: Readonly<Record<string, string>>, fields: readonly TolFieldDef[]): string[] {
  return Object.entries(errors).map(([k, m]) => `${fields.find((f) => f.key === k)?.label ?? k} tolerance: ${m}`);
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
export function tolToHash(out: Record<string, string>, fields: readonly TolFieldDef[], tol: TolState): void {
  for (const f of fields) {
    const v = encodeTol(tol[f.key] ?? EMPTY_TOL);
    if (v !== undefined) out[f.hash] = v;
  }
}

export function tolFromHash(get: (k: string) => string | undefined, fields: readonly TolFieldDef[], notices: string[]): TolState {
  const tol: Record<string, TolInput> = {};
  for (const f of fields) {
    const t = decodeTol(get(f.hash), notices, `${f.label} tolerance`);
    if (!isTolEmpty(t)) tol[f.key] = t;
  }
  return tol;
}

export function thickModeToHash(m: ThicknessMode): string | undefined {
  return m === '' ? undefined : m;
}

export function thickModeFromHash(v: string | undefined, notices: string[]): ThicknessMode {
  if (v === undefined) return '';
  if (isThicknessMode(v)) return v;
  notices.push('The copper thickness tolerance choice was not recognised: none is chosen. Choose one, or none.');
  return '';
}

// ---------------------------------------------------------------------------
// Sensitivity wording (pure, tested)
// ---------------------------------------------------------------------------
const SENS_OPTS = { accuracyClass: 'empirical' } as const;
/** Statements describe small changes only: the step shrinks until the stated change is at most 10 %. */
const STEP_TEXT: readonly string[] = ['1', '0.1', '0.01'];
const STEP_SCALE: readonly number[] = [1, 0.1, 0.01];
const STATEMENT_LIMIT = 0.1;
export const LOCAL_ESTIMATE = 'local estimate for small changes';

export function sensitivityStatement(value: number, kind: 'relative' | 'absolute', inputLabel: string, outputPhrase: string): string {
  if (!Number.isFinite(value)) return `No statement: the sensitivity is not a finite number (${LOCAL_ESTIMATE}).`;
  if (value === 0) return `No local effect: a small change in ${inputLabel} does not move ${outputPhrase} at this point (${LOCAL_ESTIMATE}).`;
  const unitFraction = kind === 'relative' ? 0.01 : 1;
  for (let i = 0; i < STEP_SCALE.length; i++) {
    const effect = value * unitFraction * (STEP_SCALE[i] as number);
    const last = i === STEP_SCALE.length - 1;
    if (Math.abs(effect) <= STATEMENT_LIMIT || last) {
      if (Math.abs(effect) > STATEMENT_LIMIT) return `Too steep for a linear statement: even a tiny change in ${inputLabel} moves ${outputPhrase} a lot. Use the tolerance corners instead (${LOCAL_ESTIMATE}).`;
      const step = `+${STEP_TEXT[i] as string} ${kind === 'relative' ? '%' : 'K'}`;
      return `${step} ${inputLabel} gives about ${formatSignedPercent(effect, SENS_OPTS)} ${outputPhrase} (${LOCAL_ESTIMATE}).`;
    }
  }
  return `No statement (${LOCAL_ESTIMATE}).`;
}

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------
export const BOUND_NAME: Readonly<Record<Bound, string>> = {
  nominal: 'nominal',
  'min-requirement': 'minimum requirement',
  'max-capacity': 'capacity',
  prediction: 'prediction',
};

/** Core warning codes shown in the tolerance block instead of the general warning list. */
export const BLOCK_CODES: readonly string[] = [
  'ENVELOPE_CORNERS_ONLY',
  'ENVELOPE_INCOMPLETE',
  'ENVELOPE_BOUND_OMITTED',
  'ENVELOPE_EXTRAPOLATION',
  'ENVELOPE_UNAVAILABLE',
  'ENVELOPE_ZERO_TOLERANCE',
  'TOLERANCE_NOT_PUBLISHED',
  'TOLERANCE_CHOICE_NOT_APPLICABLE',
  'TOLERANCE_CHOICE_NOT_AVAILABLE',
  'TOLERANCE_CHOICE_NO_THIN_SIDE',
];
const PROMINENT: Readonly<Record<string, string>> = {
  ENVELOPE_CORNERS_ONLY: 'This range comes from corners and axis points only; its extremes are not proven',
  ENVELOPE_INCOMPLETE: 'Part of the tolerance range could not be evaluated',
  ENVELOPE_BOUND_OMITTED: 'A bound of the tolerance range is omitted',
  ENVELOPE_EXTRAPOLATION: 'A corner leaves the range the formula was checked over',
  TOLERANCE_NOT_PUBLISHED: 'No fab-profile tolerance was applied',
};
const SEVERITY_TAG: Readonly<Record<CalcWarning['severity'], string>> = { info: 'Note', caution: 'Caution', warning: 'Warning', critical: 'Critical' };

export interface ToleranceNotice {
  readonly code: string;
  readonly tag: string;
  /** Set for the notices that must not be missed (shown as a bordered callout). */
  readonly heading?: string;
  readonly message: string;
}

export interface EnvelopeView {
  readonly name: string;
  /** "minimum requirement", "capacity", "prediction" or "nominal" (from the core Envelope.bound). */
  readonly boundName: string;
  readonly cornersOnly: boolean;
  readonly row: EnvelopeRow;
}

export interface SensitivityView {
  readonly output: string;
  readonly input: string;
  readonly title: string;
  /** Signed, 3 significant figures, with "/K" for a per-kelvin value. */
  readonly value: string;
  readonly kindText: string;
  readonly statement: string;
}

export interface ToleranceView {
  readonly envelopes: readonly EnvelopeView[];
  readonly notices: readonly ToleranceNotice[];
  readonly sensitivities: readonly SensitivityView[];
}

export interface ToleranceViewOpts {
  readonly accuracyClass: Parameters<typeof formatResult>[1]['accuracyClass'];
  readonly prefs: DisplayPrefs;
  /** Display label per output name (unlisted names are used as they are). */
  readonly labels: Readonly<Record<string, string>>;
  /** Words for an output inside a sentence ("required width"); falls back to the lower-cased label. */
  readonly phrases?: Readonly<Record<string, string>>;
  /** Names that print as micrometre-scale thicknesses. */
  readonly thicknessNames?: readonly string[];
  /** Per output name: a printer for a quantity that format-result prints badly (for example a delay per length). */
  readonly printers?: Readonly<Record<string, (value: Quantity, bound: Bound) => string>>;
}

export interface ToleranceBuild {
  readonly view: ToleranceView;
  /** The result's warnings without the ones shown in the tolerance block. */
  readonly warnings: CalcWarning[];
  /** Result names that are sensitivities (shown in the block, not as plain rows). */
  readonly skipNames: readonly string[];
}

const SENSITIVITY_PREFIX = 'sensitivity of ';
/** First letter lower-cased for use inside a sentence; the rest is kept so names such as "Z0" stay as they are. */
const lower = (s: string): string => (s === '' ? s : s.charAt(0).toLowerCase() + s.slice(1));

function envelopeView(e: Envelope, raw: CalcResult, o: ToleranceViewOpts): EnvelopeView | undefined {
  // A point is not a range: when every corner equals the nominal value there is nothing to tabulate.
  if (e.min.si === e.typ.si && e.max.si === e.typ.si) return undefined;
  const label = o.labels[e.name] ?? e.name;
  const role = o.thicknessNames?.includes(e.name) === true ? 'thickness' : 'geometry';
  const h = { accuracyClass: o.accuracyClass, prefs: o.prefs, lengthRole: role } as const;
  const cornersOnly = raw.warnings.some((w) => w.code === 'ENVELOPE_CORNERS_ONLY' && w.message.includes(`"${e.name}"`));
  const bound: Bound = e.bound ?? 'nominal';
  const printer = o.printers?.[e.name];
  const print = (v: Quantity): string => (printer !== undefined ? printer(v, bound) : formatResult({ value: v, bound }, h));
  const boundName = BOUND_NAME[bound];
  return {
    name: e.name,
    boundName,
    cornersOnly,
    row: {
      label: `${label} (${boundName}), tolerance corners${cornersOnly ? ': corners and axis points only' : ''}`,
      // All three values use the rounding direction of the core Envelope.bound, the same as the headline: a requirement or a
      // prediction is never printed below its computed value, a capacity never above it.
      min: print(e.min),
      typ: print(e.typ),
      max: print(e.max),
      note: `Tolerance corners: every combination of the limits of ${e.toleranceInputs.join(', ')}, plus points along each axis; every other input stays at its stated value. Each value is rounded in the safe direction for what it means (requirements and predictions up, capacities down), as the headline is; the typical value is the nominal result. Initial tolerances only: no ageing, drift or process distribution. An arithmetic range over what you entered, not a statistical range and not a verdict on the design.`,
    },
  };
}

function signed(text: string, v: number): string {
  return v > 0 && !text.startsWith('+') ? `+${text}` : text;
}

function sensitivityViews(raw: CalcResult, o: ToleranceViewOpts, outputs: readonly string[]): { rows: SensitivityView[]; names: string[] } {
  const rows: SensitivityView[] = [];
  const names: string[] = [];
  for (const r of raw.results) {
    if (!r.name.startsWith(SENSITIVITY_PREFIX)) continue;
    names.push(r.name);
    const rest = r.name.slice(SENSITIVITY_PREFIX.length);
    const known = [...outputs].sort((a, b) => b.length - a.length).find((n) => rest.startsWith(`${n} to `));
    const output = known ?? rest.split(' to ')[0] ?? rest;
    const input = rest.slice(output.length + ' to '.length);
    const relative = sameDim(r.value, q(1, DIM.DIMENSIONLESS));
    const text = signed(formatResult({ value: r.value, bound: 'nominal' }, SENS_OPTS), r.value.si);
    const phrase = o.phrases?.[output] ?? lower(o.labels[output] ?? output);
    rows.push({
      output,
      input,
      title: `Sensitivity of ${lower(o.labels[output] ?? output)} to ${input}`,
      value: text,
      kindText: relative ? 'exponent, no unit (% change in output per % change in input)' : 'per kelvin (change of the logarithm of the output per K)',
      statement: sensitivityStatement(r.value.si, relative ? 'relative' : 'absolute', input, phrase),
    });
  }
  return { rows, names };
}

/**
 * Builds the tolerance block from a core result that was computed with tolerances. `outputs` are the core output names
 * (used to split "sensitivity of <output> to <input>"). Nothing here computes an envelope or a sensitivity.
 */
export function buildToleranceView(raw: CalcResult, o: ToleranceViewOpts, outputs: readonly string[]): ToleranceBuild {
  const envelopes = (raw.envelope ?? []).flatMap((e) => {
    const v = envelopeView(e, raw, o);
    return v === undefined ? [] : [v];
  });
  const notices: ToleranceNotice[] = raw.warnings
    .filter((w) => w.code !== undefined && BLOCK_CODES.includes(w.code))
    .map((w) => {
      const code = w.code as string;
      const heading = PROMINENT[code];
      return { code, tag: SEVERITY_TAG[w.severity], message: w.message, ...(heading !== undefined ? { heading } : {}) };
    });
  const s = sensitivityViews(raw, o, outputs);
  return {
    view: { envelopes, notices, sensitivities: s.rows },
    warnings: raw.warnings.filter((w) => w.code === undefined || !BLOCK_CODES.includes(w.code)),
    skipNames: s.names,
  };
}

/** True when there is anything to show in the block. */
export const hasToleranceContent = (v: ToleranceView): boolean => v.envelopes.length > 0 || v.notices.length > 0 || v.sensitivities.length > 0;

export const TOLERANCE_HEADING = 'Tolerance corners and sensitivity';
export const SENSITIVITY_CAPTION = `Sensitivity of each output to each input you gave a tolerance (${LOCAL_ESTIMATE}, valid near the nominal point).`;
