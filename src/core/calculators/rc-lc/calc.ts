import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import type { CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { finPos, finish, num, rate, run, within } from '../circuit-shared';
import { validate } from './guards';
import type { Field } from './guards';
import { meta } from './meta';
import type { Family } from './meta';

export interface Inputs {
  /** 'rc' or 'lc'. Required, never defaulted. */
  family: Family;
  /** RC only. */
  resistance?: Quantity;
  /** Both families. */
  capacitance?: Quantity;
  /** LC only. */
  inductance?: Quantity;
  /** The cut-off frequency fc (RC) or the resonant frequency f0 (LC). */
  frequency?: Quantity;
}

const TWO_PI = 2 * Math.PI;
const DIMS: Record<Field, Quantity['dim']> = { resistance: DIM.RESISTANCE, capacitance: DIM.CAPACITANCE, inductance: DIM.INDUCTANCE, frequency: DIM.FREQUENCY };
const STATUS: Record<Family, ReturnType<typeof dataStatusForLedgerIds>> = {
  rc: dataStatusForLedgerIds([...meta.familyLedgerIds.rc]),
  lc: dataStatusForLedgerIds([...meta.familyLedgerIds.lc]),
};
const Z0_NAME = '√(L/C) (= X_L = X_C at f0)';
const PARASITICS =
  'Ideal lumped components: parasitics are ignored. There is no ESR, ESL, self-resonant frequency, saturation, tolerance or temperature coefficient, and no source or load impedance. Real parts resonate away from the ideal values; check the manufacturer data.';
const Z0_NAMING =
  'The name "characteristic impedance" for √(L/C) of a lumped LC rests on one tier-3 source (ledger S-019b, UNVERIFIED): the number is a safe consequence of f0 and X_L = X_C, so it is labelled √(L/C) (= X_L = X_C at f0). It is not a transmission-line impedance (that uses per-unit-length L′ and C′).';
const RECOMMENDATION: Record<Family, string> = {
  rc: 'Values are exact for the stated inputs and an ideal single RC section. Add the source and load impedance, capacitor tolerance and voltage derating, and resistor tolerance before relying on the cut-off frequency.',
  lc: 'Values are exact for the stated inputs and an ideal LC tank. Real inductors and capacitors have losses and a self-resonant frequency, and tolerances shift f0; check them against the manufacturer data before relying on the resonant frequency.',
};

const label = (family: Family, f: Field): string => (f === 'frequency' ? (family === 'rc' ? 'fc' : 'f0') : f);

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const { family, given, unknown } = v.value;
  const g = (k: Field): number => (given[k] as Quantity).si;

  // Solve the unknown from the other two; the second family member is the first-order (RC) or second-order (LC) relation.
  const vals: Partial<Record<Field, number>> = {};
  for (const k of Object.keys(given) as Field[]) vals[k] = g(k);
  let stepExpr: string;
  if (family === 'rc') {
    if (unknown === 'frequency') {
      vals.frequency = finPos(1 / (TWO_PI * g('resistance') * g('capacitance')), 'Cut-off frequency');
      stepExpr = 'fc = 1 / (2π × R × C)';
    } else if (unknown === 'resistance') {
      vals.resistance = finPos(1 / (TWO_PI * g('frequency') * g('capacitance')), 'Resistance');
      stepExpr = 'R = 1 / (2π × fc × C)';
    } else {
      vals.capacitance = finPos(1 / (TWO_PI * g('frequency') * g('resistance')), 'Capacitance');
      stepExpr = 'C = 1 / (2π × fc × R)';
    }
  } else if (unknown === 'frequency') {
    vals.frequency = finPos(1 / (TWO_PI * Math.sqrt(finPos(g('inductance') * g('capacitance'), 'L × C'))), 'Resonant frequency');
    stepExpr = 'f0 = 1 / (2π × √(L × C))';
  } else if (unknown === 'inductance') {
    const w = TWO_PI * g('frequency');
    vals.inductance = finPos(1 / finPos(w * w * g('capacitance'), '(2π f0)² × C'), 'Inductance');
    stepExpr = 'L = 1 / ((2π × f0)² × C)';
  } else {
    const w = TWO_PI * g('frequency');
    vals.capacitance = finPos(1 / finPos(w * w * g('inductance'), '(2π f0)² × L'), 'Capacitance');
    stepExpr = 'C = 1 / ((2π × f0)² × L)';
  }
  const c = vals.capacitance as number;

  const inputs: CalcInput[] = (Object.keys(given) as Field[]).map((k) => ({ name: k, value: q(g(k), DIMS[k]), source: 'user' as const }));
  const steps: CalcResult['steps'] = [{ label: `Solve ${label(family, unknown)}`, expr: stepExpr, value: q(vals[unknown] as number, DIMS[unknown]) }];
  const names: Field[] = family === 'rc' ? ['resistance', 'capacitance', 'frequency'] : ['inductance', 'capacitance', 'frequency'];
  const results: CalcResult['results'] = names.map((k) => ({
    name: label(family, k),
    value: q(vals[k] as number, DIMS[k]),
    role: k === unknown ? ('primary' as const) : ('secondary' as const),
    bound: 'nominal' as const,
  }));
  if (family === 'rc') {
    const r = vals.resistance as number;
    const tau = finPos(r * c, 'Time constant');
    results.push({ name: 'tau', value: q(tau, DIM.TIME), role: 'secondary', bound: 'nominal' });
    steps.push({ label: 'Time constant', expr: 'τ = R × C', value: q(tau, DIM.TIME) });
  } else {
    const l = vals.inductance as number;
    const z0 = finPos(Math.sqrt(finPos(l / c, 'L / C')), Z0_NAME);
    results.push({ name: Z0_NAME, value: q(z0, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' });
    steps.push({ label: Z0_NAME, expr: '√(L / C)', value: q(z0, DIM.RESISTANCE) });
  }

  // Validity: plausibility ranges, not standards.
  const V = meta.validity;
  const checks: { key: Field; lo: number; hi: number; unit: string; text: string }[] = [
    ...(family === 'rc' ? [{ key: 'resistance' as const, lo: V.resistanceOhm[0], hi: V.resistanceOhm[1], unit: 'Ω', text: '1e-3 Ω to 1e12 Ω' }] : [{ key: 'inductance' as const, lo: V.inductanceH[0], hi: V.inductanceH[1], unit: 'H', text: '1e-12 H to 100 H' }]),
    { key: 'capacitance', lo: V.capacitanceF[0], hi: V.capacitanceF[1], unit: 'F', text: '1e-15 F to 1 F' },
    { key: 'frequency', lo: V.frequencyHz[0], hi: V.frequencyHz[1], unit: 'Hz', text: '1e-3 Hz to 1e10 Hz' },
  ];
  const validityChecks: CalcResult['validityChecks'] = [];
  const outOfRange: OutOfRangeInput[] = [];
  for (const k of checks) {
    const x = vals[k.key] as number;
    const ok = within(x, k.lo, k.hi);
    validityChecks.push({ name: `${label(family, k.key)} between ${k.text}`, ok, detail: `Plausibility range for board-level parts, not a standard. ${label(family, k.key)} ${num(x)} ${k.unit}.` });
    if (!ok) outOfRange.push({ name: label(family, k.key), value: `${num(x)} ${k.unit}`, bound: k.text });
  }

  const warnings: CalcWarning[] = [{ severity: 'info', message: PARASITICS, code: 'PARASITICS_IGNORED' }];
  if (family === 'lc') warnings.push({ severity: 'info', message: Z0_NAMING, code: 'Z0_NAMING' });

  const assumptions: string[] =
    family === 'rc'
      ? [
          'Single unloaded first-order RC section, ideal linear time-invariant R and C, sinusoidal steady state for fc. fc is the −3 dB point (where X_C = R); τ is the time constant. Relations from ledger S-019 (textbook, VERIFIED).',
          'The 10-90 % rise time is not provided: its constant is not in ledger S-019 and no unsourced constant is used.',
        ]
      : [
          'Ideal lossless LC, linear time-invariant L and C. f0 is the undamped natural frequency (ledger S-019, textbook, VERIFIED). √(L/C) is ledger S-019b (UNVERIFIED naming).',
          'Q is not provided: it needs the loss resistance and is not sourced here.',
        ];
  assumptions.push(PARASITICS);
  if (family === 'lc') assumptions.push(Z0_NAMING);

  const dataStatus = STATUS[family];
  const confidence = rate({ accuracyClass: meta.accuracyClass, dataStatus, inputs, outOfRange });
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...meta.familyLedgerIds[family]] },
    formula: meta.formula[family],
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION[family],
    dataStatus,
    designValues: [],
  };
  return finish(result);
}

export function compute(inputs: Inputs): CalcOutcome {
  return run(() => build(inputs));
}
