// View-model for the reactance page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/reactance compute().
import { compute, type Inputs } from '../../core/calculators/reactance/calc';
import { meta, type Kind } from '../../core/calculators/reactance/meta';
import type { CalcResult } from '../../core/result';
import { DIM, type Dim, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, type HashState } from '../../state/hash';
import type { CalloutView } from '../components/Callout';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { MAX_FIELD_CHARS, buildResultView, parseField, type FieldView, type ResultView } from '../components/view';
import { ledgerRowsOf, readChoice, readText, splitCallout } from './circuit-view';

export const CALCULATOR_ID = 'reactance';

export type KindChoice = '' | Kind;
export type FieldKey = 'reactance' | 'frequency' | 'component';
export const FIELD_KEYS: readonly FieldKey[] = ['reactance', 'frequency', 'component'];

export interface ReactanceState {
  /** Never defaulted: empty until the user chooses. */
  readonly kind: KindChoice;
  readonly reactance: string;
  readonly frequency: string;
  /** The inductance for an inductive kind, the capacitance for a capacitive kind. */
  readonly component: string;
}

export const DEFAULT_STATE: ReactanceState = Object.freeze({ kind: '', reactance: '', frequency: '', component: '' });

export const METHOD_TEXT = 'Method: ideal inductive or capacitive reactance, shown as a magnitude; give two of reactance, frequency and the component value, the third is solved';
export const RANGE_HINT = 'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

export const KIND_OPTIONS: readonly { readonly value: Kind; readonly label: string }[] = [
  { value: 'inductive', label: 'Inductive: an inductor, X_L' },
  { value: 'capacitive', label: 'Capacitive: a capacitor, X_C' },
];

export function isKind(v: string): v is Kind {
  return KIND_OPTIONS.some((o) => o.value === v);
}

/** The formula text of a kind, from the calculator metadata (the same object the result's formula comes from). */
export function formulaOf(kind: Kind): string {
  return meta.formula[kind];
}

export function fieldDim(kind: Kind, k: FieldKey): Dim {
  return k === 'reactance' ? DIM.RESISTANCE : k === 'frequency' ? DIM.FREQUENCY : kind === 'inductive' ? DIM.INDUCTANCE : DIM.CAPACITANCE;
}

export function fieldLabel(kind: Kind, k: FieldKey): string {
  if (k === 'reactance') return kind === 'inductive' ? 'Reactance magnitude |X_L|' : 'Reactance magnitude |X_C|';
  if (k === 'frequency') return 'Frequency';
  return kind === 'inductive' ? 'Inductance L' : 'Capacitance C';
}

export function fieldUnitHint(kind: Kind, k: FieldKey): string {
  if (k === 'reactance') return 'Ω, kΩ or MΩ; magnitude, always positive';
  if (k === 'frequency') return 'Hz, kHz, MHz or GHz';
  return kind === 'inductive' ? 'H, mH, µH or nH' : 'F, µF, nF or pF';
}

export function fieldHelp(kind: Kind, k: FieldKey): string {
  if (k === 'reactance') return 'The size of the reactance, not its sign. Examples: 6.28 Ω, 1.59 kΩ.';
  if (k === 'frequency') return 'A single sinusoidal frequency. Examples: 1 kHz, 100 MHz.';
  return kind === 'inductive' ? 'Examples: 1 mH, 10 µH, 470 nH.' : 'Examples: 100 nF, 1 µF, 22 pF. Always write the unit.';
}

export function fieldPlaceholder(kind: Kind, k: FieldKey): string {
  if (k === 'reactance') return '6.28 Ω';
  if (k === 'frequency') return '1 kHz';
  return kind === 'inductive' ? '1 mH' : '100 nF';
}

export function activeFields(kind: KindChoice): readonly FieldKey[] {
  return kind === '' ? [] : FIELD_KEYS;
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
export const WRITTEN_KEYS: readonly string[] = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
const HASH_KEY: Readonly<Record<FieldKey, string>> = { reactance: 'x', frequency: 'f', component: 'cv' };

export function toHashState(s: ReactanceState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.kind !== '') out['kd'] = s.kind;
  for (const k of FIELD_KEYS) if (s[k].trim() !== '') out[HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  return out;
}

export interface LoadedState {
  readonly state: ReactanceState;
  readonly notices: readonly string[];
}

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  const kind = readChoice(h, 'kd', isKind, 'The kind of reactance was not recognised: choose inductive or capacitive.', notices);
  const k0: Kind = kind === '' ? 'inductive' : kind;
  const t = (k: FieldKey): string => readText(h, HASH_KEY[k], fieldLabel(k0, k), notices);
  return { state: { kind, reactance: t('reactance'), frequency: t('frequency'), component: t('component') }, notices };
}

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type FieldErrors = Partial<Record<FieldKey, string>>;

export type ReactanceView =
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

const CALLOUT_HEADING = 'Ideal component: no ESR, ESL or self-resonance';

export function parseFieldOf(s: ReactanceState, kind: Kind, k: FieldKey): FieldView {
  return parseField(s[k], fieldDim(kind, k));
}

/** Core field names (the component is named by its kind) back to page fields. */
function pageField(kind: Kind, coreField: string | undefined): FieldKey | undefined {
  if (coreField === 'reactance' || coreField === 'frequency') return coreField;
  if (coreField === (kind === 'inductive' ? 'inductance' : 'capacitance')) return 'component';
  return undefined;
}

export function computeView(s: ReactanceState): ReactanceView {
  if (s.kind === '') return { status: 'needs-input', needs: ['Choose the kind of reactance: inductive or capacitive. There is no default.'] };
  const kind = s.kind;
  const parsed = new Map<FieldKey, FieldView>();
  for (const k of FIELD_KEYS) parsed.set(k, parseFieldOf(s, kind, k));

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const k of FIELD_KEYS) {
    const v = parsed.get(k);
    if (v?.status === 'error') {
      problems.push(`${fieldLabel(kind, k)}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors };

  const given = FIELD_KEYS.filter((k) => parsed.get(k)?.status === 'ok');
  const q = (k: FieldKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const reactance = q('reactance');
  const frequency = q('frequency');
  const component = q('component');
  const inputs: Inputs = {
    kind,
    ...(reactance !== undefined ? { reactance } : {}),
    ...(frequency !== undefined ? { frequency } : {}),
    ...(component !== undefined ? (kind === 'inductive' ? { inductance: component } : { capacitance: component }) : {}),
  };
  const out = compute(inputs);
  if (!out.ok) {
    if (given.length < 2) return { status: 'needs-input', needs: [out.error.message] };
    const key = pageField(kind, out.error.field);
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [out.error.message], fieldErrors };
  }

  const { raw, callout } = splitCallout(out.value, 'IDEAL_COMPONENT', CALLOUT_HEADING);
  const solvedName = raw.results.find((r) => r.role === 'primary')?.name ?? '';
  const labels: Record<string, string> = {};
  for (const r of raw.results) {
    const k = pageField(kind, r.name);
    if (k !== undefined) labels[r.name] = `${fieldLabel(kind, k)} (${r.name === solvedName ? 'solved' : 'given'})`;
  }
  const result = buildResultView(raw, { headline: solvedName, accuracyClass: meta.accuracyClass, labels });
  return { status: 'ok', result, raw, fieldErrors, callout, ledgerRows: ledgerRowsOf(result.ledger) };
}

export function liveSummary(v: ReactanceView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. Confidence ${v.result.confidence.level}. ${String(v.result.details.validity.filter((c) => !c.ok).length)} validity checks failed.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
