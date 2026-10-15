import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import { COPPER_ALPHA_20C, COPPER_RESISTIVITY_20C, copperThermalConductivity } from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { envelopeResult, hasTolerances, planTolerances, stripEnvelopeInputs } from '../tolerance-shared';
import type { FieldSpec, OutputPlan, TolValue } from '../tolerance-shared';
import { validate } from './guards';
import type { ValidInputs } from './guards';
import { meta } from './meta';

/**
 * Optional input tolerances (task 9). Absent means no envelope and no sensitivity readout; there are no default tolerances,
 * and no tolerance is taken from a fab profile (JLCPCB publishes no via hole or plating tolerance: vias are not controlled,
 * S-019i, S-019m). finishedHoleDiameter, platingThickness and barrelLength are relative; conductorTemperature is an absolute
 * temperature-difference tolerance and needs a user-supplied temperature; resistivity needs the plated-copper override and
 * current needs a current. The via count is exact and is never toleranced.
 */
export interface Tolerances {
  finishedHoleDiameter?: TolValue;
  platingThickness?: TolValue;
  barrelLength?: TolValue;
  resistivity?: TolValue;
  conductorTemperature?: TolValue;
  current?: TolValue;
}

export interface Inputs {
  /** FINISHED (inside) hole diameter after plating, not the drill diameter. */
  finishedHoleDiameter: Quantity;
  /** Barrel plating thickness: required, never pre-filled. */
  platingThickness: Quantity;
  /** Barrel length: board thickness for a through via, or the span for a blind/buried via. */
  barrelLength: Quantity;
  /** Number of identical vias in parallel, a whole number of at least 1. */
  count: number;
  /** Absolute temperature of the barrel copper; defaults to 25 degC (marked default). */
  conductorTemperature?: Quantity;
  /** Total current through the whole array; enables voltage drop and power loss. */
  current?: Quantity;
  /** Plated copper resistivity at 20 degC (S-012, UNVERIFIED); replaces the pure-copper default. */
  resistivity?: Quantity;
  kMaterial?: 'pure-401' | 'c11000-391';
  tolerances?: Tolerances;
}

const RECOMMENDATION =
  'Barrel resistance and drop are calculated for the plating thickness you entered, using pure-copper resistivity unless you supplied a plated value. Use the finished plating from your fabricator (the thinnest value you will accept) and treat every number here as a lower bound on resistance. No current rating is derived from hole size.';
const SCOPE_TEXT =
  'No current rating and no temperature rise are derived. The axial thermal resistance is conduction along the barrel copper only (end to end); it is not a trace-to-ambient thermal resistance, so it must not be multiplied by the dissipated power to obtain a temperature rise. The heat path to the board and air depends on the connected copper and the stack-up, which this calculator does not model.';
const VIA_ONLY_TEXT =
  'Voltage drop and power loss cover the via barrel(s) only. They exclude the connecting traces, pads, anti-pads and return path; do not compare this figure with a rail budget.';
const PLATED_RHO_TEXT =
  'The default resistivity is that of annealed pure copper (S-004). Plated copper resistivity is a separate ledger row (S-012, UNVERIFIED) and is usually higher, so the default is non-conservative: it understates R, drop and power. Enter a plated value you can source to replace it.';
const RHO_OVERRIDE_TEXT =
  'The plated copper resistivity you entered replaces the pure-copper value at 20 degC (S-012, UNVERIFIED); the temperature coefficient stays the S-004 value, which may not apply to your plated copper.';
const SHARING_TEXT =
  'R/N and theta/N are the ideal for N identical vias sharing current and heat equally. In practice current crowding (vias nearest the source or load carry more current), unequal sharing from dimensional and plating variation, and the resistance of the pads and planes joining them mean the real array resistance is higher and the worst via carries more than I/N.';
const ASPECT_TEXT =
  'Aspect ratio L/d is shown for information. This calculator applies no limit; the allowed aspect ratio comes from your fabricator, and a high ratio makes uniform plating harder, so the plating thickness you entered should be the thinnest the fabricator guarantees.';
const PLATING_TEXT =
  'The plating thickness you entered is larger than the finished hole diameter. The formula remains valid for a finished hole d, but check the units and whether you entered the drill diameter or the plating thickness in the wrong field.';

const REL_TOL = 1e-9;
const T20_C = 20;
const V = meta.validity;
const STATUS = dataStatusForLedgerIds([...meta.ledgerIds]);

/** Thrown for a value outside the representable or modelled range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const copy = (x: Quantity): Quantity => q(x.si, x.dim);

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp: ValidInputs = v.value;
  const N = inp.count;
  const d = inp.finishedHoleDiameter.si;
  const t = inp.platingThickness.si;
  const L = inp.barrelLength.si;

  const tempDefaulted = inp.conductorTemperature === undefined;
  const conductor = inp.conductorTemperature !== undefined ? copy(inp.conductorTemperature) : fromUnit(meta.defaults.conductorTempC, 'degC');
  const tC = toUnit(conductor, 'degC');
  const rhoOverride = inp.resistivity !== undefined;
  const rho20 = inp.resistivity !== undefined ? inp.resistivity.si : COPPER_RESISTIVITY_20C;
  const k = copperThermalConductivity(inp.kMaterial);

  const rhoT = positive(rho20 * (1 + COPPER_ALPHA_20C * (tC - T20_C)), 'Resistivity at the conductor temperature (the linear model gives a non-positive value)');
  const areaOne = positive(Math.PI * t * (d + t), 'Barrel copper area');
  const areaAll = positive(areaOne * N, 'Total barrel copper area');
  const rOne = positive((rhoT * L) / areaOne, 'Resistance of one via at the conductor temperature');
  const rArray = positive((rhoT * L) / areaAll, 'Resistance at the conductor temperature');
  const r20 = positive((rho20 * L) / areaAll, 'Resistance at 20 °C');
  const thetaOne = positive(L / (k.value.si * areaOne), 'Axial thermal resistance of one barrel');
  const thetaArray = positive(L / (k.value.si * areaAll), 'Axial thermal resistance of the array');
  const aspect = positive(L / d, 'Aspect ratio L/d');
  let vDrop: number | undefined;
  let power: number | undefined;
  if (inp.current !== undefined) {
    vDrop = positive(inp.current.si * rArray, 'Voltage drop');
    power = positive(inp.current.si * inp.current.si * rArray, 'Power loss');
  }

  const inputs: CalcInput[] = [];
  const userIn = (name: string, x: Quantity | undefined): void => {
    if (x !== undefined) inputs.push({ name, value: copy(x), source: 'user' });
  };
  userIn('finished hole diameter', inp.finishedHoleDiameter);
  userIn('plating thickness', inp.platingThickness);
  userIn('barrel length', inp.barrelLength);
  inputs.push({ name: 'via count', value: q(N, DIM.DIMENSIONLESS), source: 'user' });
  inputs.push(
    tempDefaulted
      ? { name: 'conductor temperature', value: conductor, source: 'default', sourceDetail: 'Engineering default 25 °C, not from a standard.' }
      : { name: 'conductor temperature', value: conductor, source: 'user' },
  );
  userIn('current', inp.current);
  userIn('plated copper resistivity', inp.resistivity);

  const steps: CalcResult['steps'] = [
    { label: 'Barrel copper area (one via)', expr: 'A = pi x t x (d + t), d = finished hole diameter', value: q(areaOne, DIM.AREA), bound: 'nominal' },
    { label: 'Barrel copper area (all vias)', expr: 'N x A', value: q(areaAll, DIM.AREA), bound: 'nominal' },
    { label: 'Conductor temperature', expr: 'user value, or the 25 °C default', value: conductor, bound: 'prediction' },
    { label: 'Resistivity at 20 °C', expr: rhoOverride ? 'rho20 = user value (plated copper, S-012)' : 'rho20 = 1/58 ohm mm2/m (S-004)', value: q(rho20, DIM.RESISTIVITY) },
    { label: 'Resistivity at the conductor temperature', expr: 'rho(T) = rho20 x (1 + alpha x (T - 20 °C))', value: q(rhoT, DIM.RESISTIVITY) },
    { label: 'Resistance of one via', expr: 'R1 = rho(T) x L / A', value: q(rOne, DIM.RESISTANCE), bound: 'prediction' },
    { label: 'Resistance at the conductor temperature', expr: 'R = rho(T) x L / (N x A) = R1 / N (ideal parallel)', value: q(rArray, DIM.RESISTANCE), bound: 'prediction' },
    { label: 'Resistance at 20 °C', expr: 'R20 = rho20 x L / (N x A)', value: q(r20, DIM.RESISTANCE), bound: 'prediction' },
    { label: 'Axial thermal resistance (one barrel)', expr: 'theta = L / (k x A)', value: q(thetaOne, DIM.THERMAL_RESISTANCE), bound: 'prediction' },
    { label: 'Axial thermal resistance (all barrels)', expr: 'theta / N (ideal parallel)', value: q(thetaArray, DIM.THERMAL_RESISTANCE), bound: 'prediction' },
    { label: 'Aspect ratio L/d', expr: 'L / d', value: q(aspect, DIM.DIMENSIONLESS) },
  ];
  if (vDrop !== undefined && power !== undefined) {
    steps.push({ label: 'Voltage drop', expr: 'V = I x R(T)', value: q(vDrop, DIM.VOLTAGE), bound: 'prediction' });
    steps.push({ label: 'Power loss', expr: 'P = I^2 x R(T)', value: q(power, DIM.POWER), bound: 'prediction' });
  }

  const results: CalcResult['results'] = [
    { name: 'resistance at conductor temperature', value: q(rArray, DIM.RESISTANCE), role: 'primary', bound: 'prediction' },
    { name: 'resistance at 20 °C', value: q(r20, DIM.RESISTANCE), role: 'secondary', bound: 'prediction' },
    { name: 'resistance of one via at conductor temperature', value: q(rOne, DIM.RESISTANCE), role: 'secondary', bound: 'prediction' },
    { name: 'resistivity at conductor temperature', value: q(rhoT, DIM.RESISTIVITY), role: 'secondary', bound: 'nominal' },
    { name: 'conductor temperature', value: conductor, role: 'secondary', bound: 'prediction' },
    { name: 'barrel copper area (one via)', value: q(areaOne, DIM.AREA), role: 'secondary', bound: 'nominal' },
    { name: 'barrel copper area (all vias)', value: q(areaAll, DIM.AREA), role: 'secondary', bound: 'nominal' },
    { name: 'axial thermal resistance (one barrel)', value: q(thetaOne, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'prediction' },
    { name: 'axial thermal resistance (all barrels, ideal parallel)', value: q(thetaArray, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'prediction' },
  ];
  if (vDrop !== undefined && power !== undefined) {
    results.push({ name: 'voltage drop', value: q(vDrop, DIM.VOLTAGE), role: 'secondary', bound: 'prediction' });
    results.push({ name: 'power loss', value: q(power, DIM.POWER), role: 'secondary', bound: 'prediction' });
  }
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  // Validity checks: plausibility range, not a standard.
  const [tLo, tHi] = V.conductorTempC;
  const tempOk = tC >= tLo - REL_TOL && tC <= tHi + REL_TOL;
  const validityChecks: CalcResult['validityChecks'] = [
    {
      name: `conductor temperature within ${String(tLo)} to ${String(tHi)} °C`,
      ok: tempOk,
      detail: `Plausibility range for the linear copper model, not a standard. Conductor temperature ${num(tC)} °C.`,
    },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!tempOk) outOfRange.push({ name: 'conductor temperature', value: `${num(tC)} °C`, bound: `${String(tLo)} to ${String(tHi)} °C` });

  const warnings: CalcWarning[] = [
    { severity: 'caution', message: SCOPE_TEXT, code: 'NO_RATING_NO_RISE' },
    { severity: 'info', message: ASPECT_TEXT, code: 'ASPECT_RATIO' },
  ];
  if (rhoOverride) warnings.push({ severity: 'caution', message: RHO_OVERRIDE_TEXT, code: 'RESISTIVITY_OVERRIDE' });
  else warnings.push({ severity: 'caution', message: PLATED_RHO_TEXT, code: 'PLATED_RESISTIVITY' });
  if (N > 1) warnings.push({ severity: 'caution', message: SHARING_TEXT, code: 'PARALLEL_SHARING' });
  if (t > d) warnings.push({ severity: 'warning', message: PLATING_TEXT, code: 'PLATING_EXCEEDS_HOLE' });
  if (vDrop !== undefined) warnings.push({ severity: 'caution', message: VIA_ONLY_TEXT, code: 'VIA_ONLY_SCOPE' });

  const assumptions: string[] = [
    'd is the FINISHED (inside) hole diameter after plating, not the drill diameter; the barrel is a copper annulus of inside diameter d and wall t.',
    'Plating thickness is a required user input and is never pre-filled; published fabricator and class values differ (ledger S-015, PAYWALLED-USER-MUST-VERIFY).',
    rhoOverride
      ? 'Resistivity: the user-supplied plated copper value at 20 °C (ledger S-012, UNVERIFIED), with the S-004 temperature coefficient.'
      : 'Resistivity: pure annealed copper (ledger S-004); plated copper (S-012, UNVERIFIED) is usually higher, so R, drop and power are understated (non-conservative).',
    tempDefaulted
      ? `Conductor temperature ${String(meta.defaults.conductorTempC)} °C is an engineering default, not from a standard; no self-heating is computed, so supply the expected barrel temperature.`
      : `Conductor temperature ${num(tC)} °C set by the user; no self-heating is computed from the current.`,
    `Thermal conductivity material: ${inp.kMaterial}${inp.kMaterialDefaulted ? ' (default, not chosen by the user)' : ''}. ${k.assumption} Status: ${k.status}.`,
    'No self-heating coupling (R(T) with the dissipated power) is performed: that needs a trace-to-ambient thermal resistance, which the barrel does not provide.',
    N > 1 ? `${String(N)} identical vias in parallel: R/N and theta/N are the ideal for equal sharing (see the current-crowding warning).` : 'A single via.',
    'DC resistance of an ideal annulus; fill, plug, via-in-pad, surface roughness and knee or pad resistance are not modelled. The linear temperature coefficient is that of pure copper at 20 °C; k is taken as temperature independent.',
  ];

  const defaulted: string[] = [];
  if (tempDefaulted) defaulted.push('conductor temperature');
  if (!rhoOverride) defaulted.push('plated copper resistivity');
  if (inp.kMaterialDefaulted) defaulted.push('thermal conductivity material');
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: defaulted,
    safetyRelevantDefaults: [],
    accuracyClass: meta.accuracyClass,
    dataStatus: STATUS,
  });

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...meta.reference.ledgerIds] },
    formula: meta.formula,
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
  const chk = assertCalcResult(result);
  if (!chk.ok) {
    const error: CalcError = { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
    return { ok: false, error };
  }
  return { ok: true, value: result };
}

/** Nominal result plus the tolerance envelope and sensitivities (task 9). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const fields: FieldSpec[] = [
    { key: 'finishedHoleDiameter', input: 'finishedHoleDiameter', label: 'finished hole diameter', kind: 'relative', present: true, absentMessage: '' },
    { key: 'platingThickness', input: 'platingThickness', label: 'plating thickness', kind: 'relative', present: true, absentMessage: '' },
    { key: 'barrelLength', input: 'barrelLength', label: 'barrel length', kind: 'relative', present: true, absentMessage: '' },
    { key: 'resistivity', input: 'resistivity', label: 'plated copper resistivity', kind: 'relative', present: inp.resistivity !== undefined, absentMessage: 'resistivity tolerance needs the plated-copper resistivity override; the default copper value is a definition (S-004) and is not toleranced.' },
    { key: 'conductorTemperature', input: 'conductorTemperature', label: 'conductor temperature', kind: 'temperature', present: inp.conductorTemperature !== undefined, absentMessage: 'conductorTemperature tolerance needs a user-supplied conductor temperature; the 25 degC default is an assumption and is not toleranced.' },
    { key: 'current', input: 'current', label: 'current', kind: 'relative', present: inp.current !== undefined, absentMessage: 'current tolerance needs a current; none was given.' },
  ];
  const planRes = planTolerances(raw.tolerances, fields, {});
  if (!planRes.ok) return { ok: false, error: planRes.error };
  const plan = planRes.value;
  const nominalRes = build(stripEnvelopeInputs(raw));
  if (!nominalRes.ok) return nominalRes;
  const nominal = nominalRes.value;
  const outputs: OutputPlan[] = [
    { name: 'resistance at conductor temperature', sensitivity: true },
    { name: 'axial thermal resistance (all barrels, ideal parallel)', sensitivity: true },
  ];
  if (inp.current !== undefined) outputs.push({ name: 'voltage drop', sensitivity: true }, { name: 'power loss', sensitivity: true });
  return envelopeResult({ compute: (i: Inputs) => build(i), base: stripEnvelopeInputs(raw), nominal, plan, outputs });
}

/** Via barrel resistance, drop, power loss and axial thermal resistance. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
