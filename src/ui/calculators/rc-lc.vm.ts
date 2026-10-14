// View-model for the RC and LC page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/rc-lc compute().
import { compute, type Inputs } from '../../core/calculators/rc-lc/calc';
import { FIELDS_OF, type Field } from '../../core/calculators/rc-lc/guards';
import { meta, type Family } from '../../core/calculators/rc-lc/meta';
import type { CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, type HashState } from '../../state/hash';
import type { CalloutView } from '../components/Callout';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultView } from '../components/view';
import { ledgerRowsOf, readChoice, readText, splitCallout } from './circuit-view';

export const CALCULATOR_ID = 'rc-lc';

export type FamilyChoice = '' | Family;
export type FieldKey = Field;

export interface RcLcState {
  /** Never defaulted: empty until the user chooses. */
  readonly family: FamilyChoice;
  readonly resistance: string;
  readonly capacitance: string;
  readonly inductance: string;
  readonly frequency: string;
}

export const DEFAULT_STATE: RcLcState = Object.freeze({ family: '', resistance: '', capacitance: '', inductance: '', frequency: '' });

export const METHOD_TEXT = 'Method: ideal lumped RC (time constant, -3 dB cut-off) and LC (resonant frequency, √(L/C)); give two of three, the third is solved';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

export const FAMILY_OPTIONS: readonly { readonly value: Family; readonly label: string }[] = [
  { value: 'rc', label: 'RC: resistor and capacitor (time constant, cut-off frequency)' },
  { value: 'lc', label: 'LC: inductor and capacitor (resonant frequency)' },
];

export function isFamily(v: string): v is Family {
  return FAMILY_OPTIONS.some((o) => o.value === v);
}

const FIELD_DIM: Readonly<Record<FieldKey, Dim>> = { resistance: DIM.RESISTANCE, capacitance: DIM.CAPACITANCE, inductance: DIM.INDUCTANCE, frequency: DIM.FREQUENCY };

export function fieldDim(k: FieldKey): Dim {
  return FIELD_DIM[k];
}

export function fieldLabel(family: Family, k: FieldKey): string {
  if (k === 'frequency') return family === 'rc' ? 'Cut-off frequency fc, -3 dB' : 'Resonant frequency f0';
  return k === 'resistance' ? 'Resistance R' : k === 'capacitance' ? 'Capacitance C' : 'Inductance L';
}

export const FIELD_UNIT_HINT: Readonly<Record<FieldKey, string>> = {
  resistance: 'Ω, kΩ, MΩ or a code such as 4k7',
  capacitance: 'F, µF, nF or pF',
  inductance: 'H, mH, µH or nH',
  frequency: 'Hz, kHz, MHz or GHz',
};
export const FIELD_HELP: Readonly<Record<FieldKey, string>> = {
  resistance: 'Examples: 1 kΩ, 4.7k, 220 Ω.',
  capacitance: 'Examples: 1 µF, 100 nF, 22 pF. Always write the unit.',
  inductance: 'Examples: 10 µH, 1 mH, 470 nH.',
  frequency: 'Examples: 159 Hz, 10 kHz, 2.4 GHz.',
};
export const FIELD_PLACEHOLDER: Readonly<Record<FieldKey, string>> = { resistance: '1 kΩ', capacitance: '1 µF', inductance: '10 µH', frequency: '1 kHz' };

/** The fields the page shows and reads for a family. Empty before a family is chosen. */
export function activeFields(family: FamilyChoice): readonly FieldKey[] {
  return family === '' ? [] : FIELDS_OF[family];
}

/** The formula text of a family, from the calculator metadata (the same object the result's formula comes from). */
export function formulaOf(family: Family): string {
  return meta.formula[family];
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
export const WRITTEN_KEYS: readonly string[] = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
const HASH_KEY: Readonly<Record<FieldKey, string>> = { resistance: 'r', capacitance: 'c', inductance: 'l', frequency: 'f' };
const ALL_FIELDS: readonly FieldKey[] = ['resistance', 'capacitance', 'inductance', 'frequency'];

export function toHashState(s: RcLcState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.family !== '') out['fm'] = s.family;
  for (const k of activeFields(s.family)) if (s[k].trim() !== '') out[HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  return out;
}

export interface LoadedState {
  readonly state: RcLcState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const family = readChoice(h, 'fm', isFamily, 'The circuit family was not recognised: choose RC or LC.', notices);
  const t = (k: FieldKey): string => readText(h, HASH_KEY[k], fieldLabel(family === '' ? 'rc' : family, k), notices);
  const text = Object.fromEntries(ALL_FIELDS.map((k) => [k, t(k)])) as Record<FieldKey, string>;
  return { state: { family, ...text }, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type RcLcView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly callout: CalloutView | undefined;
      readonly ledgerRows: readonly LedgerRowBadge[];
    };

const isField = (x: string | undefined): x is FieldKey => x !== undefined && (ALL_FIELDS as readonly string[]).includes(x);

export function parseFieldOf(s: RcLcState, k: FieldKey): FieldView {
  return parseField(s[k], FIELD_DIM[k]);
}

const CALLOUT_HEADING = 'Ideal parts: parasitics are ignored';

export function computeView(s: RcLcState): RcLcView {
  if (s.family === '') return { status: 'needs-input', needs: ['Choose the circuit family: RC or LC. There is no default.'] };
  const family = s.family;
  const active = activeFields(family);
  const parsed = new Map<FieldKey, FieldView>();
  for (const k of active) parsed.set(k, parseFieldOf(s, k));

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const k of active) {
    const v = parsed.get(k);
    if (v?.status === 'error') {
      problems.push(`${fieldLabel(family, k)}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors };

  const given = active.filter((k) => parsed.get(k)?.status === 'ok');
  const quantities: Partial<Record<FieldKey, Quantity>> = {};
  for (const k of given) {
    const v = parsed.get(k);
    if (v?.status === 'ok') quantities[k] = v.value;
  }
  const inputs: Inputs = { family, ...quantities };
  const out = compute(inputs);
  if (!out.ok) {
    if (given.length < 2) return { status: 'needs-input', needs: [out.error.message] };
    const key = isField(out.error.field) ? out.error.field : undefined;
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [out.error.message], fieldErrors };
  }

  const { raw, callout } = splitCallout(out.value, 'PARASITICS_IGNORED', CALLOUT_HEADING);
  const solvedName = raw.results.find((r) => r.role === 'primary')?.name ?? '';
  const labels: Record<string, string> = {};
  const fieldOfResult = (name: string): FieldKey | undefined => (name === 'fc' || name === 'f0' ? 'frequency' : isField(name) ? name : undefined);
  for (const r of raw.results) {
    const k = fieldOfResult(r.name);
    if (k !== undefined) labels[r.name] = `${fieldLabel(family, k)} (${r.name === solvedName ? 'solved' : 'given'})`;
  }
  labels['tau'] = 'Time constant τ';
  const result = buildResultView(raw, { headline: solvedName, accuracyClass: meta.accuracyClass, labels });
  return { status: 'ok', result, raw, fieldErrors, callout, ledgerRows: ledgerRowsOf(result.ledger) };
}

export function liveSummary(v: RcLcView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
