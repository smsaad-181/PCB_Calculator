import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import { dataStatusForLedgerIds } from '../../data-status';
import { nearest } from '../../eseries';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, Envelope } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { validate } from './guards';
import type { SeriesChoice, SnapMode, SolveFor } from './guards';
import { meta } from './meta';

export interface Inputs {
  solveFor: SolveFor;
  vin: Quantity;
  r1?: Quantity;
  r2?: Quantity;
  target?: Quantity;
  load?: Quantity;
  series?: SeriesChoice;
  snap?: SnapMode;
  tolerance?: Quantity;
  vinTolerance?: Quantity;
}

const RECOMMENDATION =
  'Values are exact for the stated inputs and ideal resistors. Check the power rating of each resistor against the dissipation shown, and use the tolerance envelope for real parts.';
const POWER_INFO = 'Choose resistors rated for at least twice the dissipation shown for each resistor unless your design rules say otherwise; check the power rating against the figures above.';
const REL_TOL = 1e-9;
const STATUS_PLAIN = dataStatusForLedgerIds(['S-019']);
const STATUS_SNAP = dataStatusForLedgerIds(['S-019', 'S-016']);

class Failure extends Error {
  readonly code: CalcError['code'];
  readonly field: string | undefined;
  constructor(code: CalcError['code'], message: string, field?: string) {
    super(message);
    this.code = code;
    this.field = field;
  }
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const par = (a: number, b: number): number => (a * b) / (a + b);
const re = (r2: number, rl: number | undefined): number => (rl === undefined ? r2 : par(r2, rl));
const vdiv = (vin: number, r1: number, r2: number, rl: number | undefined): number => {
  const e = re(r2, rl);
  return (vin * e) / (r1 + e);
};
function fin(x: number, what: string): number {
  if (!Number.isFinite(x)) throw new Failure('OUT_OF_DOMAIN', `${what} is outside the representable range for these inputs (check the units).`);
  return x;
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const vin = inp.vin.si;
  const rl = inp.load?.si;
  const target = inp.target?.si;
  if (target !== undefined && !(target < vin)) throw new Failure('OUT_OF_DOMAIN', 'target must be below vin: a divider cannot output more than its input.', 'target');

  let r1: number;
  let r2: number;
  let ideal: number | undefined;
  if (inp.solveFor === 'vout') {
    r1 = (inp.r1 as Quantity).si;
    r2 = (inp.r2 as Quantity).si;
  } else if (inp.solveFor === 'r1') {
    r2 = (inp.r2 as Quantity).si;
    ideal = fin((re(r2, rl) * (vin - (target as number))) / (target as number), 'Solved r1');
    r1 = ideal;
  } else {
    r1 = (inp.r1 as Quantity).si;
    const e = fin((r1 * (target as number)) / (vin - (target as number)), 'Required Re');
    if (rl !== undefined) {
      if (!(rl > e)) throw new Failure('OUT_OF_DOMAIN', 'The load is too heavy: it must be larger than the required R2 || RL to reach the target.', 'load');
      ideal = fin((e * rl) / (rl - e), 'Solved r2');
    } else ideal = e;
    r2 = ideal;
  }
  const snapped = inp.series !== 'none' && ideal !== undefined;
  if (snapped && ideal !== undefined) {
    if (ideal < 1e-12 || ideal > 1e12) throw new Failure('OUT_OF_DOMAIN', `The solved ${inp.solveFor} is outside 1e-12 to 1e12 ohm and cannot be snapped to a series.`, inp.solveFor);
    const n = nearest(ideal, inp.series as 'E24' | 'E96' | 'E192', inp.snap);
    if (!n.ok) throw new Failure('OUT_OF_DOMAIN', n.error.message, inp.solveFor);
    if (inp.solveFor === 'r1') r1 = n.value.value;
    else r2 = n.value.value;
  }

  const vout = fin(vdiv(vin, r1, r2, rl), 'Vout');
  const vUnloaded = vdiv(vin, r1, r2, undefined);
  const i1 = fin((vin - vout) / r1, 'Divider current');
  const p1 = fin(i1 * i1 * r1, 'Power in r1');
  const p2 = fin((vout * vout) / r2, 'Power in r2');
  const pTotal = fin(vin * i1, 'Total power');
  const pLoad = rl === undefined ? undefined : fin((vout * vout) / rl, 'Power in load');
  const rout = fin(par(r1, r2), 'Output impedance');

  const inputs: CalcInput[] = [{ name: 'vin', value: q(vin, DIM.VOLTAGE), source: 'user' }];
  if (inp.r1 !== undefined) inputs.push({ name: 'r1', value: q(inp.r1.si, DIM.RESISTANCE), source: 'user' });
  if (inp.r2 !== undefined) inputs.push({ name: 'r2', value: q(inp.r2.si, DIM.RESISTANCE), source: 'user' });
  if (inp.target !== undefined) inputs.push({ name: 'target', value: q(inp.target.si, DIM.VOLTAGE), source: 'user' });
  if (inp.load !== undefined) inputs.push({ name: 'load', value: q(inp.load.si, DIM.RESISTANCE), source: 'user' });
  if (inp.tolerance !== undefined) inputs.push({ name: 'tolerance', value: q(inp.tolerance.si, DIM.DIMENSIONLESS), source: 'user' });
  if (inp.vinTolerance !== undefined) inputs.push({ name: 'vinTolerance', value: q(inp.vinTolerance.si, DIM.DIMENSIONLESS), source: 'user' });

  const steps: CalcResult['steps'] = [];
  if (ideal !== undefined) steps.push({ label: `Solve ${inp.solveFor}`, expr: inp.solveFor === 'r1' ? 'R1 = Re × (Vin − Vt) / Vt' : 'Re = R1 × Vt / (Vin − Vt); R2 = Re × RL / (RL − Re)', value: q(ideal, DIM.RESISTANCE) });
  steps.push({ label: 'Output voltage', expr: 'Vout = Vin × Re / (R1 + Re)', value: q(vout, DIM.VOLTAGE) });
  steps.push({ label: 'Divider current', expr: 'I = (Vin − Vout) / R1', value: q(i1, DIM.CURRENT) });
  steps.push({ label: 'Total power', expr: 'P = Vin × I', value: q(pTotal, DIM.POWER) });

  const role = (name: string): 'primary' | 'secondary' => (name === inp.solveFor ? 'primary' : 'secondary');
  const results: CalcResult['results'] = [
    { name: 'vout', value: q(vout, DIM.VOLTAGE), role: inp.solveFor === 'vout' ? 'primary' : 'secondary', bound: 'nominal' },
    { name: 'r1', value: q(r1, DIM.RESISTANCE), role: role('r1'), bound: 'nominal' },
    { name: 'r2', value: q(r2, DIM.RESISTANCE), role: role('r2'), bound: 'nominal' },
    { name: 'divider current', value: q(i1, DIM.CURRENT), role: 'secondary', bound: 'prediction' },
    { name: 'power in r1', value: q(p1, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'power in r2', value: q(p2, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'total power', value: q(pTotal, DIM.POWER), role: 'secondary', bound: 'prediction' },
    { name: 'output impedance', value: q(rout, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' },
  ];
  if (rl !== undefined && pLoad !== undefined) {
    results.push({ name: 'vout unloaded', value: q(vUnloaded, DIM.VOLTAGE), role: 'secondary', bound: 'nominal' });
    results.push({ name: 'power in load', value: q(pLoad, DIM.POWER), role: 'secondary', bound: 'prediction' });
  }
  if (snapped && target !== undefined && ideal !== undefined) {
    results.push({ name: 'vout error vs target', value: q((vout - target) / target, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal' });
    results.push({ name: `ideal ${inp.solveFor}`, value: q(ideal, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' });
  }

  // Envelope.
  let envelope: Envelope[] | undefined;
  if (inp.tolerance !== undefined || inp.vinTolerance !== undefined) {
    const t = inp.tolerance?.si ?? 0;
    const vt = inp.vinTolerance?.si ?? 0;
    const vals: number[] = [];
    for (const a of [1 - vt, 1 + vt]) for (const b of [1 - t, 1 + t]) for (const c of [1 - t, 1 + t]) for (const d of rl === undefined ? [1] : [1 - t, 1 + t]) {
      vals.push(vdiv(vin * a, r1 * b, r2 * c, rl === undefined ? undefined : rl * d));
    }
    const typ = vout;
    for (const x of vals) fin(x, 'Envelope corner');
    const min = Math.min(typ, ...vals);
    const max = Math.max(typ, ...vals);
    const names = [...(inp.tolerance !== undefined ? ['r1', 'r2', ...(rl !== undefined ? ['load'] : [])] : []), ...(inp.vinTolerance !== undefined ? ['vin'] : [])];
    envelope = [{ name: 'vout', min: q(min, DIM.VOLTAGE), typ: q(typ, DIM.VOLTAGE), max: q(max, DIM.VOLTAGE), toleranceInputs: names }];
  }

  // Validity.
  const [rLo, rHi] = meta.validity.resistanceOhm;
  const used: [string, number][] = [['r1', r1], ['r2', r2], ...(rl !== undefined ? ([['load', rl]] as [string, number][]) : [])];
  const badR = used.filter(([, x]) => x < rLo * (1 - REL_TOL) || x > rHi * (1 + REL_TOL));
  const vinOk = vin <= meta.validity.vinV * (1 + REL_TOL);
  const validityChecks: CalcResult['validityChecks'] = [
    { name: `vin up to ${String(meta.validity.vinV)} V`, ok: vinOk, detail: `Plausibility range for board-level circuits, not a standard. Vin ${num(vin)} V.` },
    { name: `resistances between 1 Ω and 1e9 Ω`, ok: badR.length === 0, detail: `Plausibility range for board-level resistors, not a standard. ${used.map(([n, x]) => `${n} ${num(x)} Ω`).join(', ')}.` },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!vinOk) outOfRange.push({ name: 'vin', value: `${num(vin)} V`, bound: `up to ${String(meta.validity.vinV)} V` });
  for (const [n, x] of badR) outOfRange.push({ name: n, value: `${num(x)} Ω`, bound: '1 Ω to 1e9 Ω' });

  const warnings: CalcWarning[] = [{ severity: 'info', message: POWER_INFO, code: 'POWER_RATING' }];
  if (rl !== undefined) {
    const loss = (vUnloaded - vout) / vUnloaded;
    if (loss > 0.01) warnings.push({ severity: 'caution', message: `The load changes the output by ${String(Number((loss * 100).toPrecision(3)))} % compared with the unloaded divider.`, code: 'LOAD_ERROR' });
  }

  const assumptions = ['Ideal resistors at their stated values; DC. Divider relations from ledger S-019 (textbook, VERIFIED).'];
  if (inp.solveFor !== 'vout') {
    assumptions.push(
      snapped
        ? `Solved resistor snapped to the ${inp.series} series, direction ${inp.snap}; the E-series lists are ledger S-016 (PAYWALLED-USER-MUST-VERIFY).`
        : 'Solved resistor is the exact value, not a stock value.',
    );
  }
  const dataStatus = snapped ? STATUS_SNAP : STATUS_PLAIN;
  const confidence = rateConfidence({ outOfRangeInputs: outOfRange, defaultedAssumptions: [], accuracyClass: meta.accuracyClass, dataStatus });
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: snapped ? ['S-019', 'S-016'] : ['S-019'] },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus,
    designValues: [],
    ...(envelope !== undefined ? { envelope } : {}),
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
  return { ok: true, value: result };
}

export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    if (e instanceof Failure) {
      const error: CalcError = e.field !== undefined ? { code: e.code, field: e.field, message: e.message } : { code: e.code, message: e.message };
      return { ok: false, error };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
