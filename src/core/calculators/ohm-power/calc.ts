import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { FIELDS, solveAll, validate } from './guards';
import type { Field } from './guards';
import { meta } from './meta';

export interface Inputs {
  voltage?: Quantity;
  current?: Quantity;
  resistance?: Quantity;
  power?: Quantity;
}

const RECOMMENDATION =
  'Values are exact for the stated inputs. Choose parts with a power rating of at least twice the calculated dissipation unless your design rules say otherwise.';
const REL_TOL = 1e-9;
const DIMS: Record<Field, Quantity['dim']> = { voltage: DIM.VOLTAGE, current: DIM.CURRENT, resistance: DIM.RESISTANCE, power: DIM.POWER };
const STATUS = dataStatusForLedgerIds([...meta.reference.ledgerIds]);
const num = (x: number): string => String(Number(x.toPrecision(4)));

class RangeFailure extends Error {}

const EXPR: Record<string, [string, string][]> = {
  'voltage,current': [['resistance', 'R = V / I'], ['power', 'P = V × I']],
  'voltage,resistance': [['current', 'I = V / R'], ['power', 'P = V² / R']],
  'voltage,power': [['current', 'I = P / V'], ['resistance', 'R = V² / P']],
  'current,resistance': [['voltage', 'V = I × R'], ['power', 'P = I² × R']],
  'current,power': [['voltage', 'V = P / I'], ['resistance', 'R = P / I²']],
  'resistance,power': [['voltage', 'V = √(P × R)'], ['current', 'I = √(P / R)']],
};

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const given = FIELDS.filter((f) => inp[f] !== undefined);
  const si: Partial<Record<Field, number>> = {};
  for (const f of given) si[f] = (inp[f] as Quantity).si;
  const all = solveAll(si);
  if (!all) throw new RangeFailure('Could not solve.');
  for (const f of FIELDS) if (!Number.isFinite(all[f]) || all[f] <= 0) throw new RangeFailure(`${f} is outside the representable range for these inputs (check the units).`);
  const solved = FIELDS.filter((f) => inp[f] === undefined);

  const inputs: CalcInput[] = given.map((f) => ({ name: f, value: q((inp[f] as Quantity).si, DIMS[f]), source: 'user' }));
  const steps: CalcResult['steps'] = (EXPR[given.join(',')] ?? []).map(([f, expr]) => ({ label: `Solve ${f}`, expr, value: q(all[f as Field], DIMS[f as Field]) }));
  const results: CalcResult['results'] = FIELDS.map((f) => ({
    name: f,
    value: q(all[f], DIMS[f]),
    role: f === solved[0] ? ('primary' as const) : ('secondary' as const),
    bound: f === 'power' && inp.power === undefined ? ('prediction' as const) : ('nominal' as const),
  }));

  const V = meta.validity;
  const above = (x: number, hi: number): boolean => x > hi * (1 + REL_TOL);
  const [rLo, rHi] = V.resistanceOhm;
  const rOk = all.resistance >= rLo * (1 - REL_TOL) && !above(all.resistance, rHi);
  const vOk = !above(all.voltage, V.voltageV);
  const iOk = !above(all.current, V.currentA);
  const pOk = !above(all.power, V.powerW);
  const validityChecks: CalcResult['validityChecks'] = [
    { name: `voltage up to ${String(V.voltageV)} V`, ok: vOk, detail: `Plausibility range for board-level circuits, not a standard. Voltage ${num(all.voltage)} V.` },
    { name: `current up to ${String(V.currentA)} A`, ok: iOk, detail: `Plausibility range for board-level circuits, not a standard. Current ${num(all.current)} A.` },
    { name: `resistance within 1e-6 to 1e12 Ω`, ok: rOk, detail: `Plausibility range, not a standard. Resistance ${num(all.resistance)} Ω.` },
    { name: `power up to ${String(V.powerW)} W`, ok: pOk, detail: `Plausibility range for board-level circuits, not a standard. Power ${num(all.power)} W.` },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!vOk) outOfRange.push({ name: 'voltage', value: `${num(all.voltage)} V`, bound: `up to ${String(V.voltageV)} V` });
  if (!iOk) outOfRange.push({ name: 'current', value: `${num(all.current)} A`, bound: `up to ${String(V.currentA)} A` });
  if (!rOk) outOfRange.push({ name: 'resistance', value: `${num(all.resistance)} Ω`, bound: '1e-6 to 1e12 Ω' });
  if (!pOk) outOfRange.push({ name: 'power', value: `${num(all.power)} W`, bound: `up to ${String(V.powerW)} W` });

  const confidence = rateConfidence({ outOfRangeInputs: outOfRange, defaultedAssumptions: [], accuracyClass: meta.accuracyClass, dataStatus: STATUS });
  const warnings: CalcWarning[] = [];
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...meta.reference.ledgerIds] },
    formula: meta.formula,
    inputs,
    assumptions: ['Ideal resistor with a constant resistance; DC or RMS values of a resistive load. Relations from ledger S-019 (textbook, VERIFIED).'],
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus: STATUS,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
  return { ok: true, value: result };
}

export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const error: CalcError = { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` };
    return { ok: false, error };
  }
}
