import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import { FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE, copperBasisFactors } from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis } from '../../result';
import { DIM, FOIL_CONVENTIONS, q } from '../../units';
import type { Quantity } from '../../units';
import { solveAll } from '../ohm-power/guards';
import type { Field } from '../ohm-power/guards';
import { compute as computeTrace } from '../trace-resistance/calc';
import { LOAD_FIELDS, validate } from './guards';
import type { LoadField, PathElement, ReturnPath } from './guards';
import { meta } from './meta';
import { solvePath } from './solve';
import type { LoadKind } from './solve';

export type { PathElement, ReturnPath } from './guards';

export interface Inputs {
  vsource: Quantity;
  /** Exactly one of the four load quantities describes the load (constant current, power, resistance, or voltage at the load). */
  loadCurrent?: Quantity;
  loadPower?: Quantity;
  loadResistance?: Quantity;
  loadVoltage?: Quantity;
  /** Required, never defaulted. */
  returnPath: ReturnPath;
  elements: readonly PathElement[];
  /** Only with returnPath 'included-in-list': return conductors listed separately. */
  returnElements?: readonly PathElement[];
  /** Optional user budget as a dimensionless fraction (5 % = fromUnit(5, '%')); no default, no standard value. */
  dropBudgetPercent?: Quantity;
}

/** One element of the solved path (forward or return), SI values. Reusable by the path calculator (task 6). */
export interface PathElementState {
  readonly id: string;
  readonly name: string;
  readonly side: 'forward' | 'return';
  readonly kind: 'trace' | 'resistance';
  readonly resistance: number;
  readonly drop: number;
  readonly loss: number;
  /** Fraction of the total drop. */
  readonly dropShare: number;
  readonly provenance: string;
}

export interface PathAnalysis {
  readonly vsource: number;
  readonly current: number;
  readonly totalResistance: number;
  readonly totalDrop: number;
  readonly totalLoss: number;
  readonly dropFraction: number;
  readonly loadVoltage: number;
  readonly loadPower: number;
  readonly sourcePower: number;
  readonly efficiency: number;
  readonly maxDeliverablePower: number;
  readonly elements: readonly PathElementState[];
  readonly limiting: PathElementState;
}

export const VOLTAGE_DROP_PATH_SCOPE =
  'Included: the listed path elements only, at DC and at the stated temperatures, feeding one load. Not included: elements you did not list (vias, pads, solder joints, plane or pour spreading and necking, source output resistance, sense wiring), AC, skin and proximity effects, and any change of resistance caused by the current itself.';
const SELF_HEATING_INFO =
  'Trace self-heating is not included: each trace is evaluated at the conductor temperature you gave (default 25 °C), not at the temperature the current would raise it to. Use the self-heating calculator for the heated state.';
const AC_INFO = 'DC resistance only: AC, skin and proximity effects are not included.';
const RECOMMENDATION =
  'Check the drop at the worst-case temperature and with finished copper from your fabricator, include every element of the real path (vias, pads, connectors, return), and compare with the limit of your load, not with a rule of thumb.';
const FORMULA_NOTE = 'Constant-power load: the physical root of the quadratic is the low-current one; the other root has more current and a lower load voltage.';

const REL_TOL = 1e-9;
const NEAR_MAX_FRACTION = 0.99;
const V = meta.validity;
const STATUS_TRACES = dataStatusForLedgerIds([...meta.reference.ledgerIds], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });
const NO_TRACE_IDS = ['S-019'];
const NO_TRACE_IDS_CPL = ['S-019', 'S-019h'];
const STATUS_NO_TRACES = dataStatusForLedgerIds(NO_TRACE_IDS);
const STATUS_NO_TRACES_CPL = dataStatusForLedgerIds(NO_TRACE_IDS_CPL);
const CPL_STABILITY =
  'A constant-power load has negative incremental resistance (-V^2/P); this steady state can be unstable with input filtering; stability is not checked; P is the converter input power (ledger S-019h).';

class RangeFailure extends Error {}
const positive = (n: number, what: string): number => {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
};
const num = (x: number): string => String(Number(x.toPrecision(4)));
const pct = (x: number): string => `${num(x * 100)} %`;
const above = (x: number, hi: number): boolean => x > hi * (1 + REL_TOL);
const copy = (x: Quantity): Quantity => q(x.si, x.dim);

const LOAD_KIND: Record<LoadField, LoadKind> = { loadCurrent: 'current', loadPower: 'power', loadResistance: 'resistance', loadVoltage: 'voltage' };
const OHM_FIELD: Record<LoadField, Field> = { loadCurrent: 'current', loadPower: 'power', loadResistance: 'resistance', loadVoltage: 'voltage' };

interface Raw {
  readonly id: string;
  readonly name: string;
  readonly side: 'forward' | 'return';
  readonly kind: 'trace' | 'resistance';
  readonly resistance: number;
  readonly provenance: string;
}

interface TraceInfo {
  readonly label: string;
  readonly basis: CopperBasis;
  readonly tempDefaulted: boolean;
  readonly failedChecks: { name: string; detail: string }[];
  readonly layer: string;
  readonly convention: string;
}

/** Resistance of one element; traces go through the trace-resistance calculator (copper R(T), copper basis, weight rules). */
function elementResistance(e: PathElement, idx: number): { raw: Raw; trace?: TraceInfo; inputs: CalcInput[] } {
  const id = `f${String(idx + 1)}`;
  if (e.kind === 'resistance') {
    return {
      raw: { id, name: e.label, side: 'forward', kind: 'resistance', resistance: positive(e.resistance.si, `Resistance of "${e.label}"`), provenance: `user-supplied: ${e.sourceNote}` },
      inputs: [{ name: `${e.label}.resistance`, value: copy(e.resistance), source: 'user', sourceDetail: `user-supplied (no ledger status): ${e.sourceNote}` }],
    };
  }
  const t = computeTrace({
    layer: e.layer,
    length: e.length,
    width: e.width,
    ...(e.copperWeight !== undefined ? { copperWeight: e.copperWeight } : {}),
    ...(e.copperThickness !== undefined ? { copperThickness: e.copperThickness } : {}),
    ...(e.copperBasis !== undefined ? { copperBasis: e.copperBasis } : {}),
    ...(e.convention !== undefined ? { convention: e.convention } : {}),
    ...(e.conductorTemperature !== undefined ? { ambient: e.conductorTemperature } : {}),
  });
  if (!t.ok) throw new RangeFailure(`Trace "${e.label}": ${t.error.message}`);
  const res = t.value.results.find((r) => r.name === 'resistance at conductor temperature');
  const basis = t.value.copperBasis;
  const amb = t.value.inputs.find((i) => i.name === 'ambient');
  if (res === undefined || basis === undefined || amb === undefined) throw new RangeFailure(`Trace "${e.label}": the trace calculation returned no resistance.`);
  const tempDefaulted = amb.source === 'default';
  const inputs: CalcInput[] = [];
  const add = (name: string, v: Quantity | undefined): void => {
    if (v !== undefined) inputs.push({ name: `${e.label}.${name}`, value: copy(v), source: 'user' });
  };
  add('length', e.length);
  add('width', e.width);
  add('copperWeight', e.copperWeight);
  add('copperThickness', e.copperThickness);
  inputs.push(
    tempDefaulted
      ? { name: `${e.label}.conductorTemperature`, value: copy(amb.value), source: 'default', sourceDetail: 'Engineering default 25 °C, not from a standard.' }
      : { name: `${e.label}.conductorTemperature`, value: copy(amb.value), source: 'user' },
  );
  const failedChecks = t.value.validityChecks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail }));
  const info = FOIL_CONVENTIONS[e.convention ?? 'nominal-35um'];
  return {
    raw: {
      id,
      name: e.label,
      side: 'forward',
      kind: 'trace',
      resistance: positive(res.value.si, `Resistance of "${e.label}"`),
      provenance: `trace-resistance calculation, copper ${e.layer} layer, ${basis.basis} copper`,
    },
    trace: { label: e.label, basis, tempDefaulted, failedChecks, layer: e.layer, convention: `${e.convention ?? 'nominal-35um'} (${info.label})` },
    inputs,
  };
}

function overSpecMessage(loads: readonly { field: LoadField; value: Quantity }[], vs: number, rPath: number): string {
  const first = loads.slice(0, 2);
  const base: Partial<Record<Field, number>> = {};
  for (const l of first) base[OHM_FIELD[l.field]] = l.value.si;
  const all = solveAll(base);
  let consistent = true;
  let impliedVs: number | undefined;
  if (all) {
    for (const l of loads.slice(2)) {
      const want = all[OHM_FIELD[l.field]];
      if (Math.abs(l.value.si - want) > REL_TOL * Math.abs(want)) consistent = false;
    }
    impliedVs = all.voltage + all.current * rPath;
    if (Math.abs(impliedVs - vs) > REL_TOL * vs) consistent = false;
  }
  const names = LOAD_FIELDS.join(', ');
  const extra = impliedVs === undefined ? '' : ` The load as given would need a source voltage of ${num(impliedVs)} V for this path (R_path ${num(rPath)} ohm); the source is ${num(vs)} V.`;
  return `Give exactly one of ${names}; ${String(loads.length)} given, so the problem is over-specified${consistent ? '' : ' and the values are inconsistent'}. The source voltage and the path resistance already fix the operating point.${extra}`;
}

function build(raw: unknown): { result: CalcResult; analysis: PathAnalysis } | CalcError {
  const v = validate(raw);
  if (!v.ok) return v.error;
  const inp = v.value;
  const vs = inp.vsource.si;

  // Elements and their resistance (forward, then return).
  const fwd = inp.elements.map((e, i) => elementResistance(e, i));
  const inputs: CalcInput[] = [{ name: 'vsource', value: copy(inp.vsource), source: 'user' }];
  const raws: Raw[] = fwd.map((f) => f.raw);
  const traces: TraceInfo[] = [];
  for (const f of fwd) {
    inputs.push(...f.inputs);
    if (f.trace) traces.push(f.trace);
  }
  if (inp.returnPath === 'same-as-forward') {
    for (const f of fwd) {
      raws.push({ ...f.raw, id: `${f.raw.id}-return`, name: `${f.raw.name} (return, same as forward)`, side: 'return' });
    }
  } else if (inp.returnPath === 'included-in-list') {
    inp.returnElements.forEach((e, i) => {
      const r = elementResistance(e, i);
      raws.push({ ...r.raw, id: `r${String(i + 1)}`, side: 'return' });
      inputs.push(...r.inputs);
      if (r.trace) traces.push(r.trace);
    });
  }
  for (const l of inp.loads) inputs.push({ name: l.field, value: copy(l.value), source: 'user' });
  inputs.push({ name: 'returnPath', value: q(1, DIM.DIMENSIONLESS), source: 'user', sourceDetail: `return path choice: ${inp.returnPath}` });
  if (inp.dropBudget) inputs.push({ name: 'dropBudgetPercent', value: copy(inp.dropBudget), source: 'user' });

  const rTotal = positive(raws.reduce((s, r) => s + r.resistance, 0), 'Total path resistance');

  if (inp.loads.length !== 1) return { code: 'INVALID_INPUT', field: 'inputs', message: overSpecMessage(inp.loads, vs, rTotal) };
  const load = inp.loads[0] as { field: LoadField; value: Quantity };

  const sol = solvePath(vs, rTotal, { kind: LOAD_KIND[load.field], si: load.value.si });
  if (!sol.ok) {
    return { code: 'OUT_OF_DOMAIN', field: load.field, message: `${sol.reason} Maximum deliverable power: ${num(sol.maxDeliverablePower)} W.` };
  }
  const s = sol.value;
  const I = positive(s.current, 'Load current');

  // Per-element state; totals are the sums so the parts always add up to the whole.
  const drops = raws.map((r) => positive(I * r.resistance, `Voltage drop of "${r.name}"`));
  const losses = raws.map((r) => positive(I * I * r.resistance, `Power loss of "${r.name}"`));
  const totalDrop = positive(drops.reduce((a, b) => a + b, 0), 'Total voltage drop');
  const totalLoss = positive(losses.reduce((a, b) => a + b, 0), 'Total power loss');
  const loadVoltage = positive(load.field === 'loadVoltage' ? s.loadVoltage : load.field === 'loadCurrent' ? vs - totalDrop : s.loadVoltage, 'Load voltage');
  const loadPower = positive(load.field === 'loadPower' ? load.value.si : loadVoltage * I, 'Load power');
  const sourcePower = positive(vs * I, 'Source power');
  const efficiency = positive(loadPower / sourcePower, 'Efficiency');
  const dropFraction = positive(totalDrop / vs, 'Percent drop');
  const elements: PathElementState[] = raws.map((r, i) => ({
    id: r.id,
    name: r.name,
    side: r.side,
    kind: r.kind,
    resistance: r.resistance,
    drop: drops[i] as number,
    loss: losses[i] as number,
    dropShare: (drops[i] as number) / totalDrop,
    provenance: r.provenance,
  }));
  let limiting = elements[0] as PathElementState;
  for (const e of elements) if (e.drop > limiting.drop) limiting = e;

  const analysis: PathAnalysis = {
    vsource: vs,
    current: I,
    totalResistance: rTotal,
    totalDrop,
    totalLoss,
    dropFraction,
    loadVoltage,
    loadPower,
    sourcePower,
    efficiency,
    maxDeliverablePower: s.maxDeliverablePower,
    elements,
    limiting,
  };

  const given = (name: LoadField): boolean => load.field === name;
  const Vq = (n: number): Quantity => q(n, DIM.VOLTAGE);
  const Rq = (n: number): Quantity => q(n, DIM.RESISTANCE);
  const Pq = (n: number): Quantity => q(n, DIM.POWER);
  const Fq = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);

  // Steps.
  const steps: CalcResult['steps'] = [
    { label: 'Total path resistance', expr: 'R_path = ΣR_k (forward and return elements)', value: Rq(rTotal), bound: 'prediction' },
  ];
  if (load.field === 'loadCurrent') steps.push({ label: 'Load current', expr: 'I = I_load (given)', value: q(I, DIM.CURRENT) });
  if (load.field === 'loadResistance') steps.push({ label: 'Load current', expr: 'I = V_source / (R_path + R_load)', value: q(I, DIM.CURRENT), bound: 'prediction' });
  if (load.field === 'loadVoltage') steps.push({ label: 'Load current', expr: 'I = (V_source − V_load) / R_path', value: q(I, DIM.CURRENT), bound: 'prediction' });
  if (load.field === 'loadPower') {
    steps.push({ label: 'Maximum deliverable power', expr: 'P_max = V_source² / (4 R_path)', value: Pq(s.maxDeliverablePower), bound: 'max-capacity' });
    steps.push({ label: 'Load current', expr: 'I = (V_source − √(V_source² − 4 R_path P)) / (2 R_path), low-current root', value: q(I, DIM.CURRENT), bound: 'prediction' });
  }
  steps.push(
    { label: 'Total voltage drop', expr: 'V_drop = Σ I·R_k', value: Vq(totalDrop), bound: 'prediction' },
    { label: 'Load voltage', expr: 'V_load = V_source − V_drop', value: Vq(loadVoltage), bound: 'max-capacity' },
    { label: 'Total power loss', expr: 'P_loss = Σ I²·R_k', value: Pq(totalLoss), bound: 'prediction' },
    { label: 'Power delivered to the load', expr: 'P_load = V_load × I', value: Pq(loadPower), bound: 'max-capacity' },
    { label: 'Efficiency', expr: 'η = P_load / (V_source × I)', value: Fq(efficiency), bound: 'max-capacity' },
  );

  // Results.
  const results: CalcResult['results'] = [
    { name: 'total voltage drop', value: Vq(totalDrop), role: 'primary', bound: 'prediction' },
    { name: 'voltage drop percent of source', value: Fq(dropFraction), role: 'secondary', bound: 'prediction' },
    { name: 'load voltage', value: Vq(loadVoltage), role: 'secondary', bound: given('loadVoltage') ? 'nominal' : 'max-capacity' },
    { name: 'load current', value: q(I, DIM.CURRENT), role: 'secondary', bound: given('loadCurrent') ? 'nominal' : 'prediction' },
    { name: 'total path resistance', value: Rq(rTotal), role: 'secondary', bound: 'prediction' },
    { name: 'total power loss', value: Pq(totalLoss), role: 'secondary', bound: 'prediction' },
    { name: 'power delivered to load', value: Pq(loadPower), role: 'secondary', bound: given('loadPower') ? 'nominal' : 'max-capacity' },
    { name: 'efficiency', value: Fq(efficiency), role: 'secondary', bound: 'max-capacity' },
    { name: 'source power', value: Pq(sourcePower), role: 'secondary', bound: 'prediction' },
    { name: 'load resistance', value: Rq(s.loadResistance), role: 'secondary', bound: given('loadResistance') ? 'nominal' : 'prediction' },
    { name: 'maximum deliverable power', value: Pq(s.maxDeliverablePower), role: 'secondary', bound: 'max-capacity' },
  ];
  for (const e of elements) {
    results.push(
      { name: `resistance: ${e.name}`, value: Rq(e.resistance), role: 'secondary', bound: 'prediction' },
      { name: `voltage drop: ${e.name}`, value: Vq(e.drop), role: 'secondary', bound: 'prediction' },
      { name: `power loss: ${e.name}`, value: Pq(e.loss), role: 'secondary', bound: 'prediction' },
      { name: `share of total drop: ${e.name}`, value: Fq(e.dropShare), role: 'secondary', bound: 'prediction' },
    );
  }
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  // Validity checks: plausibility ranges, not standards.
  const vOk = !above(vs, V.voltageV);
  const iOk = !above(I, V.currentA);
  const pOk = !above(sourcePower, V.powerW);
  const validityChecks: CalcResult['validityChecks'] = [
    { name: `source voltage up to ${String(V.voltageV)} V`, ok: vOk, detail: `Plausibility range for board-level circuits, not a standard. Source ${num(vs)} V.` },
    { name: `current up to ${String(V.currentA)} A`, ok: iOk, detail: `Plausibility range for board-level circuits, not a standard. Current ${num(I)} A.` },
    { name: `source power up to ${String(V.powerW)} W`, ok: pOk, detail: `Plausibility range for board-level circuits, not a standard. Source power ${num(sourcePower)} W.` },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!vOk) outOfRange.push({ name: 'vsource', value: `${num(vs)} V`, bound: `up to ${String(V.voltageV)} V` });
  if (!iOk) outOfRange.push({ name: 'current', value: `${num(I)} A`, bound: `up to ${String(V.currentA)} A` });
  if (!pOk) outOfRange.push({ name: 'source power', value: `${num(sourcePower)} W`, bound: `up to ${String(V.powerW)} W` });
  for (const t of traces) {
    for (const c of t.failedChecks) {
      validityChecks.push({ name: `${t.label}: ${c.name}`, ok: false, detail: c.detail });
      outOfRange.push(`${t.label}: ${c.name}`);
    }
  }
  if (traces.length > 0) {
    validityChecks.push({ name: 'trace plausibility ranges (temperature, length, width)', ok: traces.every((t) => t.failedChecks.length === 0), detail: 'Each trace is screened by the trace-resistance calculator; ranges are plausibility limits, not standards.' });
  }

  // Warnings.
  const warnings: CalcWarning[] = [{ severity: 'caution', message: VOLTAGE_DROP_PATH_SCOPE, code: 'PATH_SCOPE' }];
  if (inp.returnPath === 'not-counted') {
    warnings.push({
      severity: 'caution',
      message: 'The return path is not counted: the drop and loss here cover the forward path only, and the load voltage is measured against the source return, not against the load return. A real loop has a return drop as well.',
      code: 'RETURN_NOT_COUNTED',
    });
  }
  if (inp.returnPath === 'same-as-forward') {
    warnings.push({
      severity: 'info',
      message: 'The return path is counted as identical to the forward path (every element duplicated). A return over a plane or a different route will differ; list it explicitly if you know it.',
      code: 'RETURN_SAME_AS_FORWARD',
    });
  }
  if (traces.length > 0) warnings.push({ severity: 'caution', message: SELF_HEATING_INFO, code: 'SELF_HEATING_NOT_INCLUDED' });
  warnings.push({ severity: 'info', message: AC_INFO, code: 'AC_NOT_INCLUDED' });
  if (inp.dropBudget !== undefined && dropFraction > inp.dropBudget.si * (1 + REL_TOL)) {
    warnings.push({
      severity: 'warning',
      message: `The total drop ${pct(dropFraction)} of the source exceeds the budget you set, ${pct(inp.dropBudget.si)}. The biggest contributor is "${limiting.name}" (${pct(limiting.dropShare)} of the drop).`,
      code: 'DROP_BUDGET_EXCEEDED',
    });
  }
  if (load.field === 'loadPower') warnings.push({ severity: 'caution', message: CPL_STABILITY, code: 'CONSTANT_POWER_STABILITY' });
  if (load.field === 'loadPower' && loadPower >= s.maxDeliverablePower * NEAR_MAX_FRACTION) {
    warnings.push({
      severity: 'caution',
      message: `The load power is within 1 % of the maximum this source and path can deliver (${num(s.maxDeliverablePower)} W): efficiency is about 50 % and the result is extremely sensitive to the path resistance.`,
      code: 'NEAR_MAX_POWER',
    });
  }
  if (fwd.some((f) => f.raw.kind === 'resistance') || inp.returnElements.some((e) => e.kind === 'resistance')) {
    warnings.push({
      severity: 'info',
      message: 'User-supplied resistances are taken as given, at the conditions you care about (temperature, contact wear, tolerance); they carry no ledger status and are not checked.',
      code: 'USER_RESISTANCE',
    });
  }

  // Assumptions.
  const returnText: Record<ReturnPath, string> = {
    'included-in-list': inp.returnElements.length > 0 ? `Return path: listed separately (${String(inp.returnElements.length)} element(s)) and included, as stated by the user.` : 'Return path: stated by the user to be included in the element list; nothing is added.',
    'same-as-forward': 'Return path: counted as the same as the forward path (every forward element duplicated), as stated by the user.',
    'not-counted': 'Return path: not counted, as stated by the user.',
  };
  const assumptions: string[] = [
    returnText[inp.returnPath],
    `Load model: ${load.field === 'loadCurrent' ? 'constant current' : load.field === 'loadPower' ? 'constant power (physical low-current root of the quadratic)' : load.field === 'loadResistance' ? 'constant resistance' : 'constant voltage at the load'}, entered by the user.`,
    'DC steady state; ideal source with zero output resistance; the path elements are in series.',
    `Voltage drop, power loss, resistance and source power are calculated predictions and print rounded up; the load voltage, the power delivered to the load and the efficiency print rounded down (never overstated). ${FORMULA_NOTE}`,
  ];
  for (const t of traces) {
    assumptions.push(`Trace "${t.label}": copper ${t.layer} layer (entered by the user, never defaulted); foil convention ${t.convention}; the copper thickness is ${t.basis.basis} (ledger S-003, CONFLICT between conventions).`);
  }
  const defTemp = traces.filter((t) => t.tempDefaulted).map((t) => t.label);
  if (defTemp.length > 0) assumptions.push(`Conductor temperature 25 °C is an engineering default, not from a standard, for: ${defTemp.join(', ')}.`);
  const fixedRes = [...inp.elements, ...inp.returnElements].filter((e) => e.kind === 'resistance');
  if (fixedRes.length > 0) assumptions.push('User-supplied resistances are used as given; they carry no ledger status.');

  // Confidence.
  const defaultedAssumptions = defTemp.length > 0 ? ['conductor temperature (trace default 25 °C)'] : [];
  const safetyRelevantDefaults = [...new Set(traces.flatMap((t) => copperBasisFactors(t.basis).safetyRelevantDefaults))];
  const dataStatus = traces.length > 0 ? STATUS_TRACES : load.field === 'loadPower' ? STATUS_NO_TRACES_CPL : STATUS_NO_TRACES;
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions,
    safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus,
  });
  if (safetyRelevantDefaults.length > 0) {
    confidence.reasons.push('Trace resistance is inversely proportional to copper thickness, so any difference between nominal and finished copper carries straight into the drop and the loss.');
  }

  const basisForResult = traces.find((t) => t.basis.basis === 'nominal')?.basis ?? traces[0]?.basis;
  const ledgerIds = traces.length > 0 ? [...meta.reference.ledgerIds] : load.field === 'loadPower' ? [...NO_TRACE_IDS_CPL] : [...NO_TRACE_IDS];
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds },
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
    limitingElement: {
      id: limiting.id,
      name: limiting.name,
      reason: `Largest voltage drop on the path: ${num(limiting.drop)} V, ${pct(limiting.dropShare)} of the total drop (${limiting.provenance}).`,
    },
    ...(basisForResult !== undefined ? { copperBasis: basisForResult } : {}),
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
  return { result, analysis };
}

/** Same as compute, but also returns the typed per-element state for the path calculator. Never throws; errors are values. */
export function analyse(inputs: Inputs): { ok: true; value: { result: CalcResult; analysis: PathAnalysis } } | { ok: false; error: CalcError } {
  try {
    const out = build(inputs);
    if ('analysis' in out) return { ok: true, value: out };
    return { ok: false, error: out };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}

/** Voltage drop, power loss, load voltage and efficiency of a feed path. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  const a = analyse(inputs);
  return a.ok ? { ok: true, value: a.value.result } : { ok: false, error: a.error };
}

