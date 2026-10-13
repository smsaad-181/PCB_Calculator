import { rateConfidence } from '../../confidence';
import {
  COPPER_ALPHA_20C,
  COPPER_RESISTIVITY_20C,
  DEFAULT_FOIL_CONVENTION,
  FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
  copperBasisFactors,
  copperBasisFromFoil,
} from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis, CopperBasisKind } from '../../result';
import { brent } from '../../solvers/rootfind';
import { DIM, FOIL_CONVENTIONS, add, foilThickness, fromUnit, q, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import { compute as computeLegacyWidth } from '../trace-width/calc';
import type { Inputs as LegacyInputs } from '../trace-width/calc';
import { VOLTAGE_DROP_SCOPE } from '../trace-resistance/calc';
import { validate } from './guards';
import type { Layer, PeriodVsTau, ThermalLaw } from './guards';
import { meta } from './meta';

export interface Inputs {
  thermalLaw: ThermalLaw;
  layer: Layer;
  length: Quantity;
  width: Quantity;
  copperWeight?: Quantity;
  copperThickness?: Quantity;
  copperBasis?: CopperBasisKind;
  convention?: FoilConvention;
  ambient?: Quantity;
  current?: Quantity;
  peakCurrent?: Quantity;
  duty?: Quantity;
  periodVsTau?: PeriodVsTau;
  theta?: Quantity;
  thetaPerLength?: Quantity;
  deltaTMax?: Quantity;
}

export type SolveStatus = 'converged' | 'max_iter' | 'runaway';

export interface CoupledSolution {
  readonly status: SolveStatus;
  readonly iterations: number;
  /** f(dT) = dT - theta x P(dT) at the reported dT (kelvin); at dT_max for runaway. */
  readonly residual: number;
  /** Reported temperature rise (kelvin): the upper end of the final bracket, so a prediction is never rounded below the root. Absent unless converged. */
  readonly dT?: number;
  /** theta x I^2 x R20 x alpha: the loop gain; no steady state exists for a gain of 1 or more. */
  readonly loopGain: number;
}

export interface CoupledArgs {
  /** Thermal resistance, K/W. */
  readonly theta: number;
  /** I^2 x R20: the power at the 20 C reference resistance, W. */
  readonly p20: number;
  /** Linear temperature coefficient at 20 C, per kelvin (0 gives the closed form dT = theta x p20). */
  readonly alpha: number;
  readonly ambientC: number;
  /** Largest temperature rise searched, K (> 0). */
  readonly dTmax: number;
}

const RECOMMENDATION =
  'The temperature rise is an estimate that depends on the thermal resistance used. Confirm it by measurement or thermal simulation of your board, use the worst-case ambient temperature, and keep the conductor temperature well below the limit of the laminate and the attached parts.';
const THETA_USER_CAUTION =
  'The thermal resistance is user-supplied and treated as a constant (independent of the temperature rise, air movement, neighbouring copper, planes and vias). The relation dT = theta x P is a definition (ledger S-019d, VERIFIED), but no value of theta for this trace is checked against any source.';
const LEGACY_CAUTION =
  'Legacy IPC-2221 method: the thermal resistance is derived from the legacy curve fit (ledger S-001, PAYWALLED-USER-MUST-VERIFY), which is a fit to a chart and not a heat-flow model. Coupling it with a temperature-dependent resistance is an extrapolation of the fit, not something the fit was made for. Not a substitute for IPC-2152-based analysis.';
const LINEAR_INFO =
  'The temperature coefficient is the linear coefficient at 20 °C for 100 % IACS copper (ledger S-004); its change with temperature and the effect of alloying, plating and impurities are not modelled.';
const STEADY_INFO =
  'Steady state only: the thermal time constant and transient heating are not computed. DC resistance only: skin effect and AC resistance are not included. Fusing (Onderdonk / Preece) is a different calculation and is out of scope.';
const RMS_INFO =
  'Pulse: I_rms = I_pk x sqrt(D) (ledger S-019e) is used because you stated that the period is much shorter than the thermal time constant. That statement is your declaration, not a computed or checked threshold, and the condition itself is UNVERIFIED (ledger S-019f).';
const PEAK_HIGHER_WARNING =
  'Pulse: the result is the mean (duty-averaged) temperature rise, not the peak. The peak rise is higher by up to (1 - D) x P_pk x Z(t_on), where Z(t_on) is the transient thermal impedance over one on-time. That is not computed: there is no transient thermal impedance for a trace in this calculator. Peak temperature needs the peak power, not the average power.';
const PEAK_WARNING =
  'Pulse: the period is comparable to or longer than the thermal time constant, so an rms-based result would be wrong and none is given. The value shown is the steady rise at the peak current held continuously, a conservative bound for that case, and not an rms result.';

const REL_TOL = 1e-9;
const T20_C = 20;
const ZERO_C_IN_K = 273.15;
const V = meta.validity;
const N = meta.resultNames;
const REF_IDS: readonly string[] = meta.reference.ledgerIds;
const PULSE_IDS: readonly string[] = meta.pulseLedgerIds;
const EXCLUDE = { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE };
const statusFor = (ids: readonly string[]): ReturnType<typeof dataStatusForLedgerIds> => dataStatusForLedgerIds([...ids], undefined, EXCLUDE);

/** Thrown for a value outside the representable or modelled range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const copy = (x: Quantity): Quantity => q(x.si, x.dim);
const dimless = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const above = (x: number, hi: number): boolean => x > hi * (1 + REL_TOL);

function nominalBasis(layer: Layer, weight: Quantity, convention: FoilConvention): CopperBasis {
  const b = copperBasisFromFoil(layer, weight, convention);
  return { ...b, thickness: q(b.thickness.si, b.thickness.dim) };
}

/**
 * Solves dT = theta x P(dT), P = p20 x (1 + alpha x (T_amb + dT - 20 C)), by the existing bracketed Brent finder on
 * f(dT) = dT - theta x P(dT) over [0, dT_max]. At most 50 iterations, relative tolerance 1e-6. Runaway means f(dT_max) < 0:
 * no steady state exists in the search range (heating grows faster than dissipation, or the root lies beyond dT_max).
 * Pure; returns a status value and never loops unbounded. Throws only for non-finite arguments (the caller maps it).
 */
export function solveCoupled(a: CoupledArgs): CoupledSolution {
  const { theta, p20, alpha, ambientC, dTmax } = a;
  if (![theta, p20, alpha, ambientC, dTmax].every(Number.isFinite) || !(theta > 0) || !(p20 > 0) || !(dTmax > 0)) {
    throw new RangeFailure('The self-heating solver needs finite theta, power and search bound greater than zero.');
  }
  const loopGain = theta * p20 * alpha;
  const f = (x: number): number => x - theta * p20 * (1 + alpha * (ambientC + x - T20_C));
  const fHi = f(dTmax);
  if (!Number.isFinite(fHi) || !Number.isFinite(f(0))) throw new RangeFailure('The self-heating residual is not finite for these inputs (check the units).');
  if (fHi < 0) return { status: 'runaway', iterations: 0, residual: fHi, loopGain };
  const out = brent(f, 0, dTmax, { xtol: meta.solver.relativeTolerance, maxIter: meta.solver.maxIterations });
  if (!out.ok) {
    if (out.reason === 'MAX_ITER') return { status: 'max_iter', iterations: out.iterations, residual: fHi, loopGain };
    throw new RangeFailure(`The root finder failed (${out.reason}): ${out.message}`);
  }
  // An exact zero residual stops Brent with a stale far bracket end, so use x itself then. Otherwise the final bracket is
  // tight and its upper end has f >= 0: the reported rise is never below the root.
  const dT = out.fx === 0 ? out.x : out.bracket[1];
  return { status: 'converged', iterations: out.iterations, residual: f(dT), dT, loopGain };
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const layer = inp.layer;
  const legacy = inp.thermalLaw === 'legacy-ipc2221-calibrated';
  const convention: FoilConvention = inp.convention ?? DEFAULT_FOIL_CONVENTION;

  // Copper thickness (SI) and its basis: same machinery as trace-resistance.
  let thickness: Quantity;
  let basis: CopperBasis;
  const foilInfo = inp.copperWeight !== undefined ? foilThickness(inp.copperWeight, convention) : undefined;
  if (inp.copperWeight !== undefined && foilInfo !== undefined) {
    thickness = foilInfo.thickness;
    basis = nominalBasis(layer, inp.copperWeight, convention);
  } else if (inp.copperThickness !== undefined) {
    thickness = copy(inp.copperThickness);
    const b = inp.copperBasis ?? 'nominal';
    basis = { layer, basis: b, thickness, source: `Thickness entered by the user, declared ${b}.` };
  } else {
    throw new RangeFailure('Neither copperWeight nor copperThickness reached the calculation.');
  }
  positive(thickness.si, 'Copper thickness');

  const ambientDefaulted = inp.ambient === undefined;
  const ambient = inp.ambient !== undefined ? copy(inp.ambient) : fromUnit(meta.defaults.ambientC, 'degC');
  const ambientC = toUnit(ambient, 'degC');

  // Effective heating current.
  const pulse = inp.peakCurrent !== undefined && inp.duty !== undefined && inp.periodVsTau !== undefined;
  const rmsUsed = pulse && inp.periodVsTau === 'much-shorter';
  const peakBased = pulse && inp.periodVsTau === 'comparable-or-longer';
  let iEffSi: number;
  if (inp.current !== undefined) iEffSi = inp.current.si;
  else if (inp.peakCurrent !== undefined && inp.duty !== undefined) iEffSi = rmsUsed ? inp.peakCurrent.si * Math.sqrt(inp.duty.si) : inp.peakCurrent.si;
  else throw new RangeFailure('No current reached the calculation.');
  positive(iEffSi, 'Effective current');

  // Resistance (linear model, S-004).
  const rho20 = COPPER_RESISTIVITY_20C;
  const alpha = COPPER_ALPHA_20C;
  const rhoAmb = positive(rho20 * (1 + alpha * (ambientC - T20_C)), 'Resistivity at the ambient temperature (the linear model gives a non-positive value)');
  const areaSi = positive(inp.width.si * thickness.si, 'Cross-section area');
  const r20 = positive((rho20 * inp.length.si) / areaSi, 'Resistance at 20 °C');
  positive((rhoAmb * inp.length.si) / areaSi, 'Resistance at the ambient temperature');
  const p20 = positive(iEffSi * iEffSi * r20, 'Power at the 20 °C reference resistance');

  // Thermal resistance.
  const warnings: CalcWarning[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const outOfRange: (string | { name: string; value: string; bound: string })[] = [];
  let theta: number;
  const thetaSteps: CalcResult['steps'] = [];
  const extraLedger: string[] = [];
  if (!legacy) {
    if (inp.theta !== undefined) {
      theta = positive(inp.theta.si, 'Thermal resistance');
      thetaSteps.push({ label: 'Thermal resistance (user-supplied)', expr: 'theta = user value, K/W', value: q(theta, DIM.THERMAL_RESISTANCE) });
    } else if (inp.thetaPerLength !== undefined) {
      theta = positive(inp.thetaPerLength.si / inp.length.si, 'Thermal resistance');
      thetaSteps.push({ label: 'Thermal resistance (user-supplied per length)', expr: 'theta = (K m / W) / length', value: q(theta, DIM.THERMAL_RESISTANCE) });
    } else {
      throw new RangeFailure('No thermal resistance reached the calculation.');
    }
    warnings.push({ severity: 'caution', message: THETA_USER_CAUTION, code: 'THETA_USER_SUPPLIED' });
  } else {
    const sub: LegacyInputs = {
      mode: 'B',
      layer,
      width: copy(inp.width),
      current: q(iEffSi, DIM.CURRENT),
      ...(inp.copperWeight !== undefined ? { copperWeight: copy(inp.copperWeight) } : {}),
      ...(inp.copperThickness !== undefined ? { copperThickness: copy(inp.copperThickness) } : {}),
      ...(inp.copperBasis !== undefined ? { copperBasis: inp.copperBasis } : {}),
      ...(inp.convention !== undefined ? { convention: inp.convention } : {}),
      ambient: copy(ambient),
    };
    const legacyOut = computeLegacyWidth(sub);
    if (!legacyOut.ok) return { ok: false, error: { ...legacyOut.error, message: `Legacy IPC-2221 relation: ${legacyOut.error.message}` } };
    const rise = legacyOut.value.results.find((r) => r.name === 'temperature rise');
    if (rise === undefined) throw new RangeFailure('The legacy relation returned no temperature rise.');
    const dTipc = positive(rise.value.si, 'Legacy IPC-2221 temperature rise');
    theta = positive(dTipc / p20, 'Calibrated thermal resistance');
    thetaSteps.push({ label: 'Legacy IPC-2221 temperature rise at this current', expr: 'dT_ipc = (I / (k x A^0.725))^(1/0.44) (trace-width core)', value: q(dTipc, DIM.TEMPERATURE_DIFFERENCE), bound: 'prediction' });
    thetaSteps.push({ label: 'Calibrated thermal resistance (legacy)', expr: 'theta_eff = dT_ipc / (I^2 x R20), K/W', value: q(theta, DIM.THERMAL_RESISTANCE) });
    for (const c of legacyOut.value.validityChecks) {
      validityChecks.push({ name: `legacy IPC-2221 chart: ${c.name}`, ok: c.ok, detail: c.detail });
      if (!c.ok) outOfRange.push(`legacy IPC-2221 chart range exceeded: ${c.name}`);
    }
    warnings.push({ severity: 'caution', message: LEGACY_CAUTION, code: 'LEGACY_NOT_HEAT_FLOW' });
    for (const w of legacyOut.value.warnings) warnings.push(w);
    extraLedger.push(...meta.legacyLedgerIds);
    if (layer === 'inner') extraLedger.push('S-018');
  }

  // Search bound: configurable; the default keeps the conductor at or below the copper validity bound.
  const tHiC = V.conductorTempC[1];
  const dTmaxUser = inp.deltaTMax !== undefined;
  const dTmaxSi = inp.deltaTMax !== undefined ? inp.deltaTMax.si : tHiC + ZERO_C_IN_K - ambient.si;
  if (!(dTmaxSi > 0)) {
    return {
      ok: false,
      error: {
        code: 'OUT_OF_DOMAIN',
        field: 'ambient',
        message: `The ambient temperature is at or above the ${String(tHiC)} °C copper validity bound, so the default search range is empty. Lower the ambient or give deltaTMax explicitly.`,
      },
    };
  }

  const sol = solveCoupled({ theta, p20, alpha, ambientC, dTmax: dTmaxSi });
  const solved = sol.status === 'converged' && sol.dT !== undefined;
  const dT0 = theta * p20;
  const dTSi = sol.dT ?? 0;
  const conductor = add(ambient, q(dTSi, DIM.TEMPERATURE_DIFFERENCE));
  const tC = toUnit(conductor, 'degC');
  const rT = solved ? positive(r20 * (1 + alpha * (tC - T20_C)), 'Resistance at the conductor temperature') : 0;
  const power = solved ? positive(iEffSi * iEffSi * rT, 'Power dissipated') : 0;
  const vDrop = solved ? positive(iEffSi * rT, 'Voltage drop') : 0;
  const coupling = solved ? ((dTSi - dT0) / dT0) * 100 : 0;
  const deltaTName = peakBased ? N.deltaTPeak : rmsUsed ? N.deltaTMean : N.deltaT;
  const riseLabel = rmsUsed ? 'Mean temperature rise (duty-averaged)' : 'Temperature rise';

  // Inputs.
  const inputs: CalcInput[] = [];
  const userIn = (name: string, x: Quantity | undefined): void => {
    if (x !== undefined) inputs.push({ name, value: copy(x), source: 'user' });
  };
  userIn('length', inp.length);
  userIn('width', inp.width);
  userIn('copperWeight', inp.copperWeight);
  userIn('copperThickness', inp.copperThickness);
  inputs.push(
    ambientDefaulted
      ? { name: 'ambient', value: ambient, source: 'default', sourceDetail: 'Engineering default 25 °C, not from a standard.' }
      : { name: 'ambient', value: ambient, source: 'user' },
  );
  userIn('current', inp.current);
  userIn('peakCurrent', inp.peakCurrent);
  userIn('duty', inp.duty);
  userIn('theta', inp.theta);
  userIn('thetaPerLength', inp.thetaPerLength);
  userIn('deltaTMax', inp.deltaTMax);

  // Steps.
  const steps: CalcResult['steps'] = [
    { label: 'Copper thickness', expr: 'weight x thickness per oz/ft2 of the chosen convention, or the entered thickness', value: thickness },
    { label: 'Cross-section area', expr: 'A = w x t', value: q(areaSi, DIM.AREA) },
    { label: 'Resistance at 20 °C', expr: 'R20 = rho20 x L / A (rho20 = 1/58 ohm mm2/m, S-004)', value: q(r20, DIM.RESISTANCE) },
    {
      label: 'Effective current for heating',
      expr: rmsUsed ? 'I_rms = I_pk x sqrt(D)' : peakBased ? 'I = I_pk (held continuously; not an rms value)' : 'I = steady current',
      value: q(iEffSi, DIM.CURRENT),
    },
    { label: 'Power at 20 °C resistance', expr: 'P20 = I^2 x R20', value: q(p20, DIM.POWER) },
    ...thetaSteps,
    { label: 'Loop gain', expr: 'k = theta x I^2 x R20 x alpha (no steady state for k >= 1)', value: dimless(sol.loopGain) },
    { label: 'Search limit dT_max', expr: dTmaxUser ? 'dT_max = user value' : `dT_max = ${String(tHiC)} °C - ambient (copper validity bound)`, value: q(dTmaxSi, DIM.TEMPERATURE_DIFFERENCE) },
    { label: 'Solver status', expr: `${sol.status}: Brent on f(dT) = dT - theta x P(dT), max ${String(meta.solver.maxIterations)} iterations, relative tolerance ${String(meta.solver.relativeTolerance)}`, value: dimless(sol.iterations) },
    { label: 'Solver residual', expr: 'f(dT) = dT - theta x P(dT)', value: q(sol.residual, DIM.TEMPERATURE_DIFFERENCE) },
  ];
  if (solved) {
    steps.push({ label: riseLabel, expr: 'dT solves dT = theta x I^2 x R20 x (1 + alpha x (T_amb + dT - 20 °C))', value: q(dTSi, DIM.TEMPERATURE_DIFFERENCE), bound: 'prediction' });
    steps.push({ label: 'Conductor temperature', expr: 'T = ambient + dT', value: conductor, bound: 'prediction' });
    steps.push({ label: 'Resistance at the conductor temperature', expr: 'R(T) = R20 x (1 + alpha x (T - 20 °C))', value: q(rT, DIM.RESISTANCE), bound: 'prediction' });
    steps.push({ label: 'Power dissipated', expr: 'P = I^2 x R(T)', value: q(power, DIM.POWER), bound: 'prediction' });
    steps.push({ label: 'Voltage drop', expr: 'V = I x R(T)', value: q(vDrop, DIM.VOLTAGE), bound: 'prediction' });
  }
  steps.push({ label: 'Uncoupled temperature rise (alpha = 0)', expr: 'dT0 = theta x I^2 x R20', value: q(dT0, DIM.TEMPERATURE_DIFFERENCE) });

  // Results.
  const results: CalcResult['results'] = [];
  if (solved) {
    results.push({ name: deltaTName, value: q(dTSi, DIM.TEMPERATURE_DIFFERENCE), role: 'primary', bound: 'prediction' });
    results.push({ name: N.conductorTemperature, value: conductor, role: 'secondary', bound: 'prediction' });
    results.push({ name: N.resistance, value: q(rT, DIM.RESISTANCE), role: 'secondary', bound: 'prediction' });
    results.push({ name: N.power, value: q(power, DIM.POWER), role: 'secondary', bound: 'prediction' });
    results.push({ name: N.voltageDrop, value: q(vDrop, DIM.VOLTAGE), role: 'secondary', bound: 'prediction' });
    results.push({ name: N.deltaTUncoupled, value: q(dT0, DIM.TEMPERATURE_DIFFERENCE), role: 'secondary', bound: 'nominal' });
    results.push({ name: N.couplingEffect, value: dimless(coupling), role: 'secondary', bound: 'nominal' });
  } else {
    // No steady state found: no rise, temperature or drop is reported. The search limit is the primary item.
    results.push({ name: N.searchLimit, value: q(dTmaxSi, DIM.TEMPERATURE_DIFFERENCE), role: 'primary', bound: 'nominal' });
    results.push({ name: N.deltaTUncoupled, value: q(dT0, DIM.TEMPERATURE_DIFFERENCE), role: 'secondary', bound: 'nominal' });
  }
  results.push({ name: N.theta, value: q(theta, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'nominal' });
  results.push({ name: N.effectiveCurrent, value: q(iEffSi, DIM.CURRENT), role: 'secondary', bound: 'nominal' });
  results.push({ name: N.iterations, value: dimless(sol.iterations), role: 'secondary', bound: 'nominal' });
  results.push({ name: N.residual, value: q(sol.residual, DIM.TEMPERATURE_DIFFERENCE), role: 'secondary', bound: 'nominal' });
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  // Validity checks: plausibility ranges, not standards.
  const [tLo, tHi] = V.conductorTempC;
  const checkedC = solved ? tC : ambientC;
  const tempOk = checkedC >= tLo - REL_TOL && checkedC <= tHi + REL_TOL;
  const lenOk = !above(inp.length.si, V.lengthM);
  const widOk = !above(inp.width.si, V.widthM);
  validityChecks.push(
    {
      name: `solver found a steady state within the search limit (${sol.status})`,
      ok: solved,
      detail: `Brent bracketed fixed point, ${String(sol.iterations)} iterations, residual ${num(sol.residual)} K, loop gain ${num(sol.loopGain)}; status ${sol.status}.`,
    },
    {
      name: `${solved ? 'conductor' : 'ambient'} temperature within ${String(tLo)} to ${String(tHi)} °C`,
      ok: tempOk,
      detail: `Plausibility range for the linear copper model, not a standard. ${solved ? 'Conductor' : 'Ambient'} temperature ${num(checkedC)} °C.`,
    },
    { name: `length up to ${String(V.lengthM)} m`, ok: lenOk, detail: `Plausibility range for a single board trace, not a standard. Length ${num(inp.length.si)} m.` },
    { name: `width up to ${String(V.widthM * 1000)} mm`, ok: widOk, detail: `Plausibility range for a single board trace, not a standard. Width ${num(inp.width.si * 1000)} mm.` },
  );
  if (!solved) {
    outOfRange.push(
      sol.status === 'runaway'
        ? `No steady-state temperature rise exists below dT_max = ${num(dTmaxSi)} K (thermal runaway or a rise beyond the search limit; loop gain ${num(sol.loopGain)}).`
        : `The solver did not converge within ${String(meta.solver.maxIterations)} iterations.`,
    );
  }
  if (!tempOk) outOfRange.push({ name: solved ? 'conductor temperature' : 'ambient temperature', value: `${num(checkedC)} °C`, bound: `${String(tLo)} to ${String(tHi)} °C` });
  if (!lenOk) outOfRange.push({ name: 'length', value: `${num(inp.length.si)} m`, bound: `up to ${String(V.lengthM)} m` });
  if (!widOk) outOfRange.push({ name: 'width', value: `${num(inp.width.si * 1000)} mm`, bound: `up to ${String(V.widthM * 1000)} mm` });

  // Warnings.
  if (sol.status === 'runaway') {
    warnings.push({
      severity: 'critical',
      message: `No steady-state temperature rise was found below dT_max = ${num(dTmaxSi)} K (loop gain ${num(sol.loopGain)}${sol.loopGain >= 1 ? ': at a loop gain of 1 or more the heating grows faster than the dissipation, so there is no steady state' : ': a steady state may exist above the search limit, beyond the validity range of this model'}). No temperature, resistance or voltage drop is reported. Reduce the current or the thermal resistance.`,
      code: 'THERMAL_RUNAWAY',
    });
  } else if (sol.status === 'max_iter') {
    warnings.push({
      severity: 'critical',
      message: `The solver did not converge within ${String(meta.solver.maxIterations)} iterations; no result is reported.`,
      code: 'MAX_ITER',
    });
  }
  warnings.push({ severity: 'info', message: LINEAR_INFO, code: 'LINEAR_ALPHA' }, { severity: 'info', message: STEADY_INFO, code: 'STEADY_STATE_DC_ONLY' });
  if (solved) warnings.push({ severity: 'caution', message: VOLTAGE_DROP_SCOPE, code: 'VOLTAGE_DROP_SCOPE' });
  if (rmsUsed) {
    warnings.push({ severity: 'caution', message: RMS_INFO, code: 'PULSE_RMS_ASSUMPTION' });
    warnings.push({ severity: 'warning', message: PEAK_HIGHER_WARNING, code: 'PULSE_PEAK_HIGHER' });
  }
  if (peakBased) warnings.push({ severity: 'warning', message: PEAK_WARNING, code: 'PULSE_PERIOD_NOT_SHORT' });

  // Assumptions.
  const info = FOIL_CONVENTIONS[convention];
  const assumptions: string[] = [
    legacy
      ? 'Thermal law: legacy IPC-2221 calibrated (chosen by the user). theta_eff = dT_ipc(I) / (I^2 x R20), with the 20 °C resistance as the reference power; labelled legacy, S-001 is PAYWALLED-USER-MUST-VERIFY, and the legacy relation is a curve fit, not a heat-flow model.'
      : 'Thermal law: user-supplied thermal resistance (chosen by the user); it is treated as a constant and is labelled user-supplied.',
    `Foil convention in effect: ${convention} (${info.label}); the copper thickness is nominal unless entered as finished or measured (ledger S-003, CONFLICT between conventions).`,
    `Copper layer: ${layer} (entered by the user, never defaulted).`,
    ambientDefaulted
      ? `Ambient temperature ${String(meta.defaults.ambientC)} °C is an engineering default, not from a standard; it sets the conductor temperature.`
      : `Ambient temperature ${num(ambientC)} °C set by the user.`,
    dTmaxUser
      ? `Search limit dT_max = ${num(dTmaxSi)} K set by the user.`
      : `Search limit dT_max = ${String(tHi)} °C minus the ambient temperature (the copper validity bound of the resistance model), an engineering bound and not from a standard.`,
    'Voltage drop and power are for one conductor, one direction: they exclude the return path, vias, pads, connectors, solder joints and necking.',
    'The temperature rise is the steady-state rise of the whole trace segment as one lumped body; the cross-section is an ideal rectangle.',
    STEADY_INFO,
  ];
  if (pulse) {
    assumptions.push(
      rmsUsed
        ? 'Pulse: rectangular pulses; the user states the period is much shorter than the thermal time constant, so I_rms = I_pk x sqrt(D); the user declares this condition and no threshold is computed. The result is the mean (duty-averaged) rise, not the peak.'
        : 'Pulse: the user states the period is comparable to or longer than the thermal time constant; no rms result is given and the peak current is held continuously.',
    );
  }

  // Confidence.
  const safetyRelevantDefaults: string[] = [];
  if (ambientDefaulted) safetyRelevantDefaults.push('ambient defaulted to 25 °C (engineering default, not from a standard; it sets the conductor temperature)');
  safetyRelevantDefaults.push(...copperBasisFactors(basis).safetyRelevantDefaults);
  const refIds = [...REF_IDS, ...(pulse ? PULSE_IDS : [])];
  const dataStatus = statusFor(legacy ? [...refIds, ...meta.legacyLedgerIds] : refIds);
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: [],
    safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus,
  });
  confidence.reasons.push(
    legacy
      ? 'The thermal resistance is calibrated from the legacy IPC-2221 fit (an extrapolation, not a heat-flow model).'
      : 'The thermal resistance is user-supplied and unchecked against any source.',
  );

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...REF_IDS, ...(pulse ? PULSE_IDS : []), ...extraLedger] },
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
    copperBasis: basis,
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) {
    const error: CalcError = { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
    return { ok: false, error };
  }
  return { ok: true, value: result };
}

/** Trace self-heating with temperature-dependent resistance (user theta or legacy IPC-2221 calibrated). Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
