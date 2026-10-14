import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import type { CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { finPos, finish, num, rate, run, within } from '../circuit-shared';
import { validate } from './guards';
import type { Field } from './guards';
import { meta } from './meta';
import type { Kind } from './meta';

export interface Inputs {
  /** 'inductive' (X_L) or 'capacitive' (X_C). Required, never defaulted. */
  kind: Kind;
  /** Reactance MAGNITUDE (ohm). */
  reactance?: Quantity;
  frequency?: Quantity;
  /** Inductive only. */
  inductance?: Quantity;
  /** Capacitive only. */
  capacitance?: Quantity;
}

const TWO_PI = 2 * Math.PI;
const STATUS = dataStatusForLedgerIds([...meta.reference.ledgerIds]);
const IDEAL =
  'Ideal component: no ESR, ESL, self-resonant frequency, saturation, tolerance or temperature coefficient. A real inductor behaves capacitively and a real capacitor inductively above its self-resonant frequency, so the ideal reactance is wrong near and above it; use the manufacturer data for that part.';
const MAGNITUDE =
  'Reactance is shown as a magnitude (always positive, ohm). In the jX convention X_L is positive and X_C negative; the sign (phase) is not reported.';
const RECOMMENDATION =
  'Values are exact for the stated inputs and an ideal component. Check the part against its self-resonant frequency and its tolerance before relying on the reactance.';

const compName = (kind: Kind): 'inductance' | 'capacitance' => (kind === 'inductive' ? 'inductance' : 'capacitance');

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const { kind, given, unknown } = v.value;
  const g = (k: Field): number => (given[k] as Quantity).si;
  const comp = compName(kind);
  const dims: Record<Field, Quantity['dim']> = { reactance: DIM.RESISTANCE, frequency: DIM.FREQUENCY, component: kind === 'inductive' ? DIM.INDUCTANCE : DIM.CAPACITANCE };
  const vals: Partial<Record<Field, number>> = {};
  for (const k of Object.keys(given) as Field[]) vals[k] = g(k);
  let expr: string;
  if (kind === 'inductive') {
    if (unknown === 'reactance') {
      vals.reactance = finPos(TWO_PI * g('frequency') * g('component'), 'Reactance');
      expr = 'X_L = 2π × f × L';
    } else if (unknown === 'frequency') {
      vals.frequency = finPos(g('reactance') / (TWO_PI * g('component')), 'Frequency');
      expr = 'f = X_L / (2π × L)';
    } else {
      vals.component = finPos(g('reactance') / (TWO_PI * g('frequency')), 'Inductance');
      expr = 'L = X_L / (2π × f)';
    }
  } else if (unknown === 'reactance') {
    vals.reactance = finPos(1 / (TWO_PI * g('frequency') * g('component')), 'Reactance');
    expr = 'X_C = 1 / (2π × f × C)';
  } else if (unknown === 'frequency') {
    vals.frequency = finPos(1 / (TWO_PI * g('reactance') * g('component')), 'Frequency');
    expr = 'f = 1 / (2π × X_C × C)';
  } else {
    vals.component = finPos(1 / (TWO_PI * g('reactance') * g('frequency')), 'Capacitance');
    expr = 'C = 1 / (2π × X_C × f)';
  }

  const nameOf = (k: Field): string => (k === 'component' ? comp : k);
  const inputs: CalcInput[] = (Object.keys(given) as Field[]).map((k) => ({ name: nameOf(k), value: q(g(k), dims[k]), source: 'user' as const }));
  const steps: CalcResult['steps'] = [{ label: `Solve ${nameOf(unknown)}`, expr, value: q(vals[unknown] as number, dims[unknown]) }];
  const order: Field[] = ['reactance', 'frequency', 'component'];
  const results: CalcResult['results'] = order.map((k) => ({
    name: nameOf(k),
    value: q(vals[k] as number, dims[k]),
    role: k === unknown ? ('primary' as const) : ('secondary' as const),
    bound: 'nominal' as const,
  }));

  const V = meta.validity;
  const rng: Record<Field, { lo: number; hi: number; unit: string; text: string }> = {
    reactance: { lo: V.reactanceOhm[0], hi: V.reactanceOhm[1], unit: 'Ω', text: '1e-6 Ω to 1e12 Ω' },
    frequency: { lo: V.frequencyHz[0], hi: V.frequencyHz[1], unit: 'Hz', text: '1e-3 Hz to 1e11 Hz' },
    component: kind === 'inductive' ? { lo: V.inductanceH[0], hi: V.inductanceH[1], unit: 'H', text: '1e-12 H to 100 H' } : { lo: V.capacitanceF[0], hi: V.capacitanceF[1], unit: 'F', text: '1e-15 F to 1 F' },
  };
  const validityChecks: CalcResult['validityChecks'] = [];
  const outOfRange: OutOfRangeInput[] = [];
  for (const k of order) {
    const x = vals[k] as number;
    const r = rng[k];
    const ok = within(x, r.lo, r.hi);
    validityChecks.push({ name: `${nameOf(k)} between ${r.text}`, ok, detail: `Plausibility range for board-level parts, not a standard. ${nameOf(k)} ${num(x)} ${r.unit}.` });
    if (!ok) outOfRange.push({ name: nameOf(k), value: `${num(x)} ${r.unit}`, bound: r.text });
  }

  const warnings: CalcWarning[] = [
    { severity: 'info', message: IDEAL, code: 'IDEAL_COMPONENT' },
    { severity: 'info', message: MAGNITUDE, code: 'MAGNITUDE_ONLY' },
  ];
  const assumptions = [
    `Ideal ${kind === 'inductive' ? 'inductor' : 'capacitor'}, sinusoidal steady state at a single frequency f (ω = 2π f; the factor 2π is kept). Relation from ledger S-019 (textbook, VERIFIED).`,
    MAGNITUDE,
    IDEAL,
  ];
  const confidence = rate({ accuracyClass: meta.accuracyClass, dataStatus: STATUS, inputs, outOfRange });
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...meta.reference.ledgerIds] },
    formula: meta.formula[kind],
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus: STATUS,
    designValues: [],
  };
  return finish(result);
}

export function compute(inputs: Inputs): CalcOutcome {
  return run(() => build(inputs));
}
