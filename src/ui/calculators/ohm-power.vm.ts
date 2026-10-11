// View-model for the Ohm's law and power page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/ohm-power compute().
import { compute, type Inputs } from '../../core/calculators/ohm-power/calc';
import { meta } from '../../core/calculators/ohm-power/meta';
import type { CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, type HashState } from '../../state/hash';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultView } from '../components/view';

export const CALCULATOR_ID = 'ohm-power';

export type FieldKey = 'voltage' | 'current' | 'resistance' | 'power';
export const FIELD_KEYS: readonly FieldKey[] = ['voltage', 'current', 'resistance', 'power'];

/** Everything the form holds. Strings are exactly what the user typed; empty means "not given". */
export interface OhmState {
  readonly voltage: string;
  readonly current: string;
  readonly resistance: string;
  readonly power: string;
}

export const DEFAULT_STATE: OhmState = Object.freeze({ voltage: '', current: '', resistance: '', power: '' });

export const METHOD_TEXT = "Method: Ohm's law and the power relations; any two of V, I, R, P solve the other two";
export const HINT_TEXT = 'Give exactly two; the other two are solved.';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

const FIELD_DIM: Readonly<Record<FieldKey, Dim>> = {
  voltage: DIM.VOLTAGE,
  current: DIM.CURRENT,
  resistance: DIM.RESISTANCE,
  power: DIM.POWER,
};

export function fieldDim(k: FieldKey): Dim {
  return FIELD_DIM[k];
}

export const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  voltage: 'Voltage',
  current: 'Current',
  resistance: 'Resistance',
  power: 'Power',
};

export const FIELD_UNIT_HINT: Readonly<Record<FieldKey, string>> = {
  voltage: 'V, mV or kV',
  current: 'A, mA or µA',
  resistance: 'Ω, kΩ, MΩ, or a code such as 4k7',
  power: 'W, mW or kW',
};

export const FIELD_HELP: Readonly<Record<FieldKey, string>> = {
  voltage: 'Examples: 5 V, 3.3 V, 250 mV.',
  current: 'Examples: 50 mA, 1.5 A, 20 µA.',
  resistance: 'Examples: 100 Ω, 4.7 kΩ, 4k7, 1 MΩ.',
  power: 'Examples: 250 mW, 0.25 W, 2 W.',
};

export const FIELD_PLACEHOLDER: Readonly<Record<FieldKey, string>> = { voltage: '5 V', current: '50 mA', resistance: '100 Ω', power: '250 mW' };

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS. */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS];

const HASH_KEY: Readonly<Record<FieldKey, string>> = { voltage: 'vo', current: 'i', resistance: 'r', power: 'p' };

/** State to put in the hash: only the fields that hold text. */
export function toHashState(s: OhmState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FIELD_KEYS) if (s[k].trim() !== '') out[HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  return out;
}

export interface LoadedState {
  readonly state: OhmState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unusable becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const text = (k: FieldKey): string => {
    const key = HASH_KEY[k];
    if (!has(h, key)) return '';
    const v = h[key] ?? '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  return { state: { voltage: text('voltage'), current: text('current'), resistance: text('resistance'), power: text('power') }, notices };
}

// ---------------------------------------------------------------------------
// Count state
// ---------------------------------------------------------------------------
export function givenCount(s: OhmState): number {
  return FIELD_KEYS.filter((k) => s[k].trim() !== '').length;
}

/** Live state of the "give exactly two" rule, for example "2 of 2 given". */
export function countText(s: OhmState): string {
  const n = givenCount(s);
  if (n <= 2) return `${String(n)} of 2 given`;
  return `${String(n)} given: over-specified — remove ${n === 3 ? 'one' : 'two'}`;
}

export function countStatus(s: OhmState): 'short' | 'ok' | 'over' {
  const n = givenCount(s);
  return n < 2 ? 'short' : n === 2 ? 'ok' : 'over';
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type OhmView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors }
  | { readonly status: 'ok'; readonly result: ResultView; readonly raw: CalcResult; readonly fieldErrors: FieldErrors; readonly solved: readonly FieldKey[]; readonly given: readonly FieldKey[] };

/** The state change for one edited field. */
export function fieldPatch(k: FieldKey, text: string): Partial<OhmState> {
  return { [k]: text } as Partial<OhmState>;
}

export function parseFieldOf(s: OhmState, k: FieldKey): FieldView {
  return parseField(s[k], FIELD_DIM[k]);
}

const isFieldKey = (x: string | undefined): x is FieldKey => x !== undefined && (FIELD_KEYS as readonly string[]).includes(x);

/** Parses the form and runs the calculator. 'ok' only when the calculator returned a result. */
export function computeView(s: OhmState): OhmView {
  const parsed = new Map<FieldKey, FieldView>();
  for (const k of FIELD_KEYS) parsed.set(k, parseFieldOf(s, k));

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const k of FIELD_KEYS) {
    const v = parsed.get(k);
    if (v?.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors };

  const n = givenCount(s);
  if (n < 2) {
    return { status: 'needs-input', needs: [`Give exactly two of voltage, current, resistance and power (${String(n)} of 2 given). The other two are solved.`] };
  }

  const q = (k: FieldKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);
  const inputs = {
    ...optional('voltage', q('voltage')),
    ...optional('current', q('current')),
    ...optional('resistance', q('resistance')),
    ...optional('power', q('power')),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = isFieldKey(out.error.field) ? out.error.field : undefined;
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [out.error.message], fieldErrors };
  }

  const raw = out.value;
  const given = FIELD_KEYS.filter((k) => parsed.get(k)?.status === 'ok');
  const solved = FIELD_KEYS.filter((k) => !given.includes(k));
  const labels: Record<string, string> = {};
  for (const k of FIELD_KEYS) labels[k] = `${FIELD_LABEL[k]} (${given.includes(k) ? 'given' : 'solved'})`;
  const head = raw.results.find((r) => r.role === 'primary')?.name ?? solved[0] ?? 'current';
  const built = buildResultView(raw, { headline: head, accuracyClass: meta.accuracyClass, labels });
  // Solved quantities first, then the quantities you gave.
  const isSolved = (label: string): boolean => label.endsWith('(solved)');
  const rows = [...built.rows.filter((r) => isSolved(r.label)), ...built.rows.filter((r) => !isSolved(r.label))];
  return { status: 'ok', result: { ...built, rows }, raw, fieldErrors, solved, given };
}

/** One sentence per outcome for the visually hidden live region. */
export function liveSummary(s: OhmState, v: OhmView): string {
  switch (v.status) {
    case 'ok':
      return `${countText(s)}. Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.rows
        .filter((r) => r.label.endsWith('(solved)'))
        .map((r) => `${r.label} ${r.text}`)
        .join('. ')}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.`;
    case 'error':
      return `${countText(s)}. No result. ${v.problems.join(' ')}`;
    default:
      return `${countText(s)}. No result yet. ${v.needs.join(' ')}`;
  }
}
