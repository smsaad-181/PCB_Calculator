import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import {
  CIRCULAR_MIL_M2,
  COPPER_ALPHA_20C,
  COPPER_DENSITY_KG_M3,
  COPPER_MELTING_POINT_C,
  COPPER_RESISTIVITY_20C,
  ONDERDONK_DIVISOR,
  ONDERDONK_OFFSET_C,
  PREECE_COPPER_A_INCH,
  copperSpecificHeat,
} from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, fromUnit, q, toUnit } from '../../units';
import type { Dim, Quantity } from '../../units';
import { validate } from './guards';
import type { ThicknessBasis } from './guards';
import { meta } from './meta';

export interface Inputs {
  /** Conductor cross-section. Give exactly one of area, a trace (traceWidth + traceThickness + thicknessBasis), wireDiameter, or a via barrel (viaHoleDiameter + viaPlatingThickness). */
  area?: Quantity | undefined;
  traceWidth?: Quantity | undefined;
  /** FINISHED copper thickness of the trace (not an assumed foil weight). */
  traceThickness?: Quantity | undefined;
  /** Where the thickness came from; required with a trace, no default. 'nominal' means converted from a foil weight. */
  thicknessBasis?: ThicknessBasis | undefined;
  wireDiameter?: Quantity | undefined;
  /** Via barrel: FINISHED hole diameter (inside the plating, not the drill); area = pi t (d + t). */
  viaHoleDiameter?: Quantity | undefined;
  /** Via barrel plating thickness: required with a via barrel, never pre-filled (a fabricator average is not a minimum). */
  viaPlatingThickness?: Quantity | undefined;
  /** Optional user END temperature (absolute), above the initial temperature and at most the melting point. No default; no laminate value is held here. */
  endTemperature?: Quantity | undefined;
  /** Conductor temperature at the START of the pulse (absolute): required, no default. */
  initialTemperature: Quantity;
  /** Give exactly one of current (solves time), pulseTime (solves current), actionIntegral (I²t of a non-rectangular pulse). */
  current?: Quantity | undefined;
  pulseTime?: Quantity | undefined;
  actionIntegral?: Quantity | undefined;
  /** Sourced specific heat choice (S-042d, CONFLICT). Absent means the product default, shown as a default. */
  specificHeat?: 'pppl-293k' | 'pppl-300k' | 'hyperphysics-20c' | undefined;
}

/** Dimension of K = D·c/(ρ20·α20): A²·s/m⁴ (local; used only to display the constant as a step). */
const K_DIM: Dim = { exp: [-4, 0, 1, 2, 0, 0, 0], kind: 'plain' };

const RECOMMENDATION =
  'This is an adiabatic estimate of the time (or current) to REACH the copper melting point. It is not a fuse rating and not a safe overload limit. Where protection is required, use a rated fuse or protection device; on a board, the real trace fusing current can be several times higher and the failure is destructive.';
const NOT_RATING_TEXT =
  'Not a fuse rating and not a safe overload limit. Use a rated fuse or protection device when protection is required (S-042e).';
const PCB_TEXT =
  'Adiabatic: no heat loss to the board, air or copper connections. On a PCB the board starts cooling the trace within about 1 to 1.5 s, and simulated trace fusing currents were 1.5 to 6 times the Onderdonk value (Brooks and Adam, one author group; ledger S-042e, UNVERIFIED).';
const REACH_TEXT =
  'This is the time to REACH the melting point, not the time to open: the heat of fusion is excluded. A trace can also fail earlier (delamination, necks, voids) or survive longer.';
const ERRS_SHORT_TEXT =
  'Constant specific heat and linear resistance up to the melting point; real copper specific heat rises about 32 % between 300 K and 1300 K (one source, S-042d), so this estimate errs short.';
const IPC_TEXT =
  'IPC trace-current methods address steady-state heating and are not used here. Whether the IPC documents say anything on fusing or short-time currents has not been read (ledger S-042f, PAYWALLED-USER-MUST-VERIFY).';
const UNIFORM_TEXT =
  'Uniform current density is assumed. Skin effect and inductive current distribution in very short pulses are not modelled, and no pulse-length threshold for them is sourced.';
const TA_TEXT =
  'The initial temperature is the conductor temperature at the start of the pulse, not room ambient if the trace already carries load.';
const PREECE_TEXT =
  'Preece (1880s round-wire experiments, no time term, wire in still air) is shown as a historical reference only. It is not a PCB model; for a trace it uses the equivalent round wire of the same area, which is an extrapolation.';
const NO_DURATION_TEXT =
  'No pulse duration was given (action integral mode), so the 1 s and 10 s time warnings cannot be checked. The adiabatic model is only meaningful for short pulses; check the duration of your pulse.';
const NOMINAL_TEXT =
  'The copper thickness is nominal (converted from a foil weight), not finished copper. Finished copper differs from nominal (secondhand IPC-6012 minimums, ledger S-009, and the foil weight convention, ledger S-003, CONFLICT); finished copper can be thinner (inner layers) or thicker (outer layers after plating) than nominal; where it is thinner the trace fuses sooner, so the time shown may be too long.';
const WEAKEST_TEXT =
  'The smallest cross-section in the current path usually fuses first: via barrels, neck-downs, pad entries and connector or pour necks in series. Check each one; this result covers only the one cross-section you entered.';
const BOARD_DAMAGE_TEXT =
  'Board damage (laminate decomposition, pad lift) occurs far below the copper melting point, so the time to melt is not a time to board damage. Enter an end temperature from your laminate datasheet to see the time, current and I²t to reach it; no laminate value is built in.';
const BOARD_DAMAGE_USER_TEXT =
  'Board damage (laminate decomposition, pad lift) occurs far below the copper melting point. Your end temperature is your own value, not checked or verified here: take it from your laminate datasheet.';
const NOT_MARGIN_TEXT = 'Not a safety margin: board damage occurs far below the copper melting point.';
const SUB_MS_TEXT =
  'The pulse is under 1 ms: the adiabatic assumption, uniform current density (skin effect) and negligible inductance are unreliable, and magnetic forces and vaporisation are not modelled. The 1 ms threshold is a product choice, not a sourced limit.';
const VIA_TEXT =
  'The plating thickness is your value: fabricator figures are averages, not minimums (ledger S-015, S-019m), so the thinnest spot of the barrel fuses first.';
const OVER_1S_TEXT =
  'The time is beyond 1 s, past the 1.0 to 1.5 s range where the authors report Onderdonk applies to boards (ledger S-042e). The 1 s threshold is one of the product choices, not sourced limits, behind these warnings.';
const OVER_10S_TEXT =
  'The time is beyond 10 s, beyond the usual stated validity even for wires in air (ledger S-042e); long-time near-melting behaviour on a board is unpredictable. The 10 s threshold is one of the product choices, not sourced limits, behind these warnings.';

const SUB_MS_END_TEXT =
  'The time to your end temperature is under 1 ms: the adiabatic assumption, uniform current density (skin effect) and negligible inductance are unreliable, and magnetic forces are not modelled. The 1 ms threshold is a product choice, not a sourced limit.';
const OVER_1S_END_TEXT =
  'The time to your end temperature is beyond 1 s, past the 1.0 to 1.5 s range where the authors report Onderdonk applies to boards (ledger S-042e); the board and the air cool the trace, so the adiabatic time is optimistic. The 1 s threshold is one of the product choices, not sourced limits, behind these warnings.';
const OVER_10S_END_TEXT =
  'The time to your end temperature is beyond 10 s, beyond the usual stated validity even for wires in air (ledger S-042e); heat loss dominates and the adiabatic estimate is not meaningful. The 10 s threshold is one of the product choices, not sourced limits, behind these warnings.';
const NEAR_START_TEXT = (deltaK: number, limitK: number): string =>
  `Your end temperature is only ${num(deltaK)} K above the initial temperature (less than ${String(limitK)} K). Check the unit: a value typed in K instead of degC, or the reverse, gives a very short time. The ${String(limitK)} K threshold is a product choice, not a sourced limit; the result is still computed from your values.`;

const REL_TOL = 1e-9;
const STATUS = dataStatusForLedgerIds([...meta.ledgerIds]);
/** S-009 only for a nominal thickness basis; S-015 and S-019m only for a via barrel (each is cited only then). */
const idsFor = (nominal: boolean, via: boolean): string[] => meta.ledgerIds.filter((id) => (nominal || id !== 'S-009') && (via || (id !== 'S-015' && id !== 'S-019m')));

/** Thrown for a value outside the representable or modelled range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const num = (x: number): string => String(Number(x.toPrecision(4)));

const CP_ALL = (['pppl-293k', 'pppl-300k', 'hyperphysics-20c'] as const).map((s) => copperSpecificHeat(s));
const CP_CONFLICT_TEXT = `The copper specific heat is a sourced CONFLICT (ledger S-042d): ${CP_ALL.map((c) => `${String(c.valueJPerKgK)} J/(kg·K) (${c.label})`).join('; ')}. They differ by 0.7 %, and the time scales linearly with c. The values are not averaged; the one used is stated in the assumptions.`;

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const A = inp.areaM2;
  const c = copperSpecificHeat(inp.specificHeat);
  const taC = toUnit(inp.initialTemperature, 'degC');
  const tmC = COPPER_MELTING_POINT_C;

  // Adiabatic energy balance (S-042a).
  const beta20 = 1 / COPPER_ALPHA_20C - 20;
  const kk = positive((COPPER_DENSITY_KG_M3 * c.valueJPerKgK) / (COPPER_RESISTIVITY_20C * COPPER_ALPHA_20C), 'Constant K');
  const lnTerm = positive(Math.log((tmC + beta20) / (taC + beta20)), 'Logarithm term');
  const i2t = positive(A * A * kk * lnTerm, 'Action integral to the melting point');
  // Optional user end temperature: the same equation with Te in place of Tm (S-042a).
  const teC = inp.endTemperature !== undefined ? toUnit(inp.endTemperature, 'degC') : undefined;
  const i2tE = teC !== undefined ? positive(A * A * kk * Math.log((teC + beta20) / (taC + beta20)), 'Action integral to the end temperature') : undefined;

  // Onderdonk (S-042), in circular mils; log10 and 234 + Ta as printed.
  const aCmil = positive(A / CIRCULAR_MIL_M2, 'Area in circular mils');
  const logTerm = positive(Math.log10((tmC + ONDERDONK_OFFSET_C) / (taC + ONDERDONK_OFFSET_C)), 'Onderdonk logarithm term');
  const i2tO = positive((aCmil * aCmil * logTerm) / ONDERDONK_DIVISOR, 'Onderdonk action integral');
  const oRatio = positive(i2tO / i2t, 'Onderdonk to adiabatic ratio');

  // Preece (S-042b): equivalent round wire, diameter in inches. Historical reference only.
  const dEq = positive(Math.sqrt((4 * A) / Math.PI), 'Equivalent wire diameter');
  const preece = positive(PREECE_COPPER_A_INCH * Math.pow(dEq / 0.0254, 1.5), 'Preece current');

  let timeS: number | undefined;
  let curA: number | undefined;
  let timeO: number | undefined;
  let curO: number | undefined;
  let fraction: number | undefined;
  let timeE: number | undefined;
  let curE: number | undefined;
  let fractionE: number | undefined;
  let pulseSeconds: number | undefined;
  if (inp.current !== undefined) {
    const i2 = inp.current.si * inp.current.si;
    timeS = positive(i2t / i2, 'Time to the melting point');
    timeO = positive(i2tO / i2, 'Onderdonk time');
    pulseSeconds = timeS;
    if (i2tE !== undefined) timeE = positive(i2tE / i2, 'Time to the end temperature');
  } else if (inp.pulseTime !== undefined) {
    curA = positive(Math.sqrt(i2t / inp.pulseTime.si), 'Current to the melting point');
    curO = positive(Math.sqrt(i2tO / inp.pulseTime.si), 'Onderdonk current');
    pulseSeconds = inp.pulseTime.si;
    if (i2tE !== undefined) curE = positive(Math.sqrt(i2tE / inp.pulseTime.si), 'Current to the end temperature');
  } else if (inp.actionIntegral !== undefined) {
    fraction = positive(inp.actionIntegral.si / i2t, 'Fraction of the melting action integral');
    if (i2tE !== undefined) fractionE = positive(inp.actionIntegral.si / i2tE, 'Fraction of the end-temperature action integral');
  }

  const inputs: CalcInput[] = [];
  if (inp.area !== undefined) inputs.push({ name: 'conductor cross-section (given)', value: inp.area, source: 'user' });
  if (inp.wireDiameter !== undefined) inputs.push({ name: 'wire diameter', value: inp.wireDiameter, source: 'user' });
  if (inp.viaHoleDiameter !== undefined) inputs.push({ name: 'via finished hole diameter', value: inp.viaHoleDiameter, source: 'user' });
  if (inp.viaPlatingThickness !== undefined) inputs.push({ name: 'via barrel plating thickness', value: inp.viaPlatingThickness, source: 'user' });
  if (inp.traceWidth !== undefined) inputs.push({ name: 'trace width', value: inp.traceWidth, source: 'user' });
  if (inp.traceThickness !== undefined) {
    inputs.push({ name: 'trace copper thickness', value: inp.traceThickness, source: 'user', sourceDetail: `thickness basis: ${inp.thicknessBasis ?? ''}` });
  }
  inputs.push({ name: 'initial conductor temperature', value: inp.initialTemperature, source: 'user' });
  if (inp.endTemperature !== undefined) inputs.push({ name: 'end temperature (your value, not checked)', value: inp.endTemperature, source: 'user' });
  if (inp.current !== undefined) inputs.push({ name: 'current', value: inp.current, source: 'user' });
  if (inp.pulseTime !== undefined) inputs.push({ name: 'pulse time', value: inp.pulseTime, source: 'user' });
  if (inp.actionIntegral !== undefined) inputs.push({ name: 'action integral I²t', value: inp.actionIntegral, source: 'user' });

  const area = q(A, DIM.AREA);
  const tmK = fromUnit(tmC, 'degC');
  const steps: CalcResult['steps'] = [
    { label: 'Conductor cross-section', expr: inp.geometry === 'trace' ? 'A = width x finished thickness' : inp.geometry === 'wire' ? 'A = pi x d^2 / 4' : inp.geometry === 'via' ? 'A = pi x t x (d + t), d = finished hole, t = barrel plating' : 'A as given', value: area, bound: 'nominal' },
    { label: 'Initial conductor temperature Ta', expr: 'user value', value: inp.initialTemperature },
    { label: 'Melting point Tm', expr: 'copper freezing point, ITS-90 (S-042c), no override', value: tmK },
    { label: 'beta20 = 1/alpha20 - 20 °C', expr: 'beta20 = 1 / alpha20 - 20 °C (S-004, S-042a)', value: q(beta20, DIM.TEMPERATURE_DIFFERENCE) },
    { label: 'K = D x c / (rho20 x alpha20)', expr: `K = D x c / (rho20 x alpha20), D = ${String(COPPER_DENSITY_KG_M3)} kg/m3 (S-003d), c = ${String(c.valueJPerKgK)} J/(kg K) (${c.label}, S-042d), rho20 = 1/58e6 ohm m, alpha20 = 0.00393 /K (S-004)`, value: q(kk, K_DIM) },
    { label: 'Logarithm term', expr: 'ln[(Tm + beta20) / (Ta + beta20)]', value: q(lnTerm, DIM.DIMENSIONLESS) },
    { label: 'Adiabatic action integral to the melting point', expr: 'I2t = A^2 x K x ln[(Tm + beta20) / (Ta + beta20)]', value: q(i2t, DIM.ACTION_INTEGRAL), bound: 'nominal' },
  ];
  if (i2tE !== undefined) steps.push({ label: 'Adiabatic action integral to your end temperature', expr: 'I2t = A^2 x K x ln[(Te + beta20) / (Ta + beta20)], Te = your end temperature (S-042a)', value: q(i2tE, DIM.ACTION_INTEGRAL), bound: 'nominal' });
  if (timeS !== undefined) steps.push({ label: 'Adiabatic time to the melting point', expr: 't = I2t / I^2', value: q(timeS, DIM.TIME), bound: 'nominal' });
  if (curA !== undefined) steps.push({ label: 'Adiabatic current to the melting point', expr: 'I = sqrt(I2t / t)', value: q(curA, DIM.CURRENT), bound: 'nominal' });
  steps.push({ label: 'Area in circular mils', expr: 'A_cmil = A / ((pi/4) x (25.4e-6 m)^2) (S-006 arithmetic)', value: q(aCmil, DIM.DIMENSIONLESS) });
  steps.push({ label: 'Onderdonk action integral', expr: 'I2t = A_cmil^2 x log10[(Tm + 234) / (Ta + 234)] / 33, temperatures in °C (S-042)', value: q(i2tO, DIM.ACTION_INTEGRAL), bound: 'nominal' });
  steps.push({ label: 'Equivalent round wire diameter', expr: 'd = sqrt(4 A / pi)', value: q(dEq, DIM.LENGTH), bound: 'nominal' });
  steps.push({ label: 'Preece historical current', expr: 'I = 10244 x d^1.5, d in inches (S-042b); no time term', value: q(preece, DIM.CURRENT), bound: 'nominal' });

  const results: CalcResult['results'] = [];
  const add = (name: string, value: Quantity, role: 'primary' | 'secondary'): void => {
    results.push({ name, value, role, bound: 'nominal' });
  };
  if (timeS !== undefined) add('adiabatic time to reach the melting point', q(timeS, DIM.TIME), 'primary');
  if (curA !== undefined) add('adiabatic current to reach the melting point in the pulse time', q(curA, DIM.CURRENT), 'primary');
  add('adiabatic action integral I²t to reach the melting point', q(i2t, DIM.ACTION_INTEGRAL), fraction !== undefined ? 'primary' : 'secondary');
  if (fraction !== undefined) {
    results.push({ name: 'your I²t as a fraction of the I²t to reach the melting point (not a safety margin)', value: q(fraction, DIM.DIMENSIONLESS), role: 'secondary', bound: 'nominal', note: NOT_MARGIN_TEXT });
  }
  if (timeE !== undefined) add('adiabatic time to reach your end temperature', q(timeE, DIM.TIME), 'secondary');
  if (curE !== undefined) add('adiabatic current to reach your end temperature in the pulse time', q(curE, DIM.CURRENT), 'secondary');
  if (i2tE !== undefined) add('adiabatic action integral I²t to reach your end temperature', q(i2tE, DIM.ACTION_INTEGRAL), 'secondary');
  if (fractionE !== undefined) add('your I²t as a fraction of the I²t to reach your end temperature', q(fractionE, DIM.DIMENSIONLESS), 'secondary');
  if (timeO !== undefined) add('Onderdonk time to reach the melting point (secondary check)', q(timeO, DIM.TIME), 'secondary');
  if (curO !== undefined) add('Onderdonk current to reach the melting point in the pulse time (secondary check)', q(curO, DIM.CURRENT), 'secondary');
  add('Onderdonk action integral I²t (secondary check)', q(i2tO, DIM.ACTION_INTEGRAL), 'secondary');
  add('Onderdonk to adiabatic ratio', q(oRatio, DIM.DIMENSIONLESS), 'secondary');
  add('Preece current, equivalent round wire, historical reference (no time term)', q(preece, DIM.CURRENT), 'secondary');
  add('conductor cross-section', area, 'secondary');
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  // Validity checks: plausibility ranges (not standards), the product time threshold, and the PAYWALLED IPC scope condition.
  const [tLo, tHi] = meta.validity.initialTempC;
  const tempOk = taC >= tLo - REL_TOL && taC <= tHi + REL_TOL;
  const validityChecks: CalcResult['validityChecks'] = [
    {
      name: `initial temperature within ${String(tLo)} to ${String(tHi)} °C`,
      ok: tempOk,
      detail: `Plausibility range for the linear copper model, not a standard. Initial temperature ${num(taC)} °C.`,
    },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!tempOk) outOfRange.push({ name: 'initial temperature', value: `${num(taC)} °C`, bound: `${String(tLo)} to ${String(tHi)} °C` });
  if (inp.traceThickness !== undefined) {
    const [lo, hi] = meta.validity.traceThicknessM;
    const th = inp.traceThickness.si;
    const thOk = th >= lo * (1 - REL_TOL) && th <= hi * (1 + REL_TOL);
    validityChecks.push({
      name: `copper thickness within ${String(lo * 1e6)} to ${String(hi * 1e6)} um`,
      ok: thOk,
      detail: `Plausibility range for PCB copper, not a standard. Thickness ${num(th * 1e6)} um; check units and whether you entered a foil weight in the thickness field.`,
    });
    if (!thOk) outOfRange.push({ name: 'copper thickness', value: `${num(th * 1e6)} um`, bound: `${String(lo * 1e6)} to ${String(hi * 1e6)} um` });
  }
  if (inp.viaHoleDiameter !== undefined && inp.viaPlatingThickness !== undefined) {
    const dv = inp.viaHoleDiameter.si;
    const tv = inp.viaPlatingThickness.si;
    const okV = tv < dv;
    validityChecks.push({
      name: 'via plating thickness below the finished hole diameter',
      ok: okV,
      detail: `Plausibility check, not a standard. Plating ${num(tv * 1e6)} um, finished hole ${num(dv * 1e6)} um; check the units and that the hole is the finished diameter.`,
    });
    if (!okV) outOfRange.push({ name: 'via plating thickness', value: `${num(tv * 1e6)} um`, bound: `below the finished hole diameter ${num(dv * 1e6)} um` });
  }
  if (pulseSeconds !== undefined) {
    validityChecks.push({
      name: `pulse time at most ${String(meta.timeWarnings.overSeconds)} s (product choice)`,
      ok: pulseSeconds <= meta.timeWarnings.overSeconds,
      detail: 'A product choice based on ledger S-042e (one author group), not a sourced limit.',
    });
  }
  validityChecks.push({
    name: 'IPC scope for fusing (PAYWALLED, not checked)',
    ok: false,
    notChecked: true,
    detail: 'The IPC documents were not read for any statement on fusing or short-time currents (ledger S-042f, PAYWALLED-USER-MUST-VERIFY). Not checked, so not passed.',
  });

  const warnings: CalcWarning[] = [
    { severity: 'warning', message: NOT_RATING_TEXT, code: 'NOT_A_RATING' },
    { severity: 'warning', message: PCB_TEXT, code: 'PCB_ADIABATIC_CAVEAT' },
    { severity: 'warning', message: inp.endTemperature !== undefined ? BOARD_DAMAGE_USER_TEXT : BOARD_DAMAGE_TEXT, code: 'BOARD_DAMAGE_BELOW_MELTING' },
    { severity: 'caution', message: WEAKEST_TEXT, code: 'WEAKEST_LINK' },
    { severity: 'caution', message: REACH_TEXT, code: 'REACH_NOT_OPEN' },
    { severity: 'caution', message: CP_CONFLICT_TEXT, code: 'SPECIFIC_HEAT_CONFLICT' },
    { severity: 'info', message: ERRS_SHORT_TEXT, code: 'SPECIFIC_HEAT_ERRS_SHORT' },
    { severity: 'info', message: IPC_TEXT, code: 'IPC_SCOPE_PAYWALLED' },
    { severity: 'info', message: UNIFORM_TEXT, code: 'UNIFORM_CURRENT' },
    { severity: 'info', message: TA_TEXT, code: 'INITIAL_TEMPERATURE' },
    { severity: 'info', message: PREECE_TEXT, code: 'PREECE_HISTORICAL' },
  ];
  if (inp.thicknessBasis === 'nominal') warnings.push({ severity: 'warning', message: NOMINAL_TEXT, code: 'THICKNESS_NOMINAL' });
  if (inp.geometry === 'via') warnings.push({ severity: 'caution', message: VIA_TEXT, code: 'VIA_BARREL_PLATING' });
  if (pulseSeconds !== undefined && pulseSeconds < meta.timeWarnings.subMsSeconds) warnings.push({ severity: 'warning', message: SUB_MS_TEXT, code: 'SUB_MS_PULSE' });
  // The same product-choice time thresholds for the time to the user end temperature (current mode: it differs from the melting time).
  if (timeE !== undefined) {
    if (timeE < meta.timeWarnings.subMsSeconds) warnings.push({ severity: 'warning', message: SUB_MS_END_TEXT, code: 'SUB_MS_END_TIME' });
    if (timeE > meta.timeWarnings.overSeconds) warnings.push({ severity: 'warning', message: OVER_1S_END_TEXT, code: 'OVER_1S_END_TIME' });
    if (timeE > meta.timeWarnings.strongSeconds) warnings.push({ severity: 'critical', message: OVER_10S_END_TEXT, code: 'OVER_10S_END_TIME' });
  }
  if (teC !== undefined && teC - taC < meta.endNearStartKelvin) warnings.push({ severity: 'caution', message: NEAR_START_TEXT(teC - taC, meta.endNearStartKelvin), code: 'END_TEMP_NEAR_START' });
  if (pulseSeconds === undefined) warnings.push({ severity: 'caution', message: NO_DURATION_TEXT, code: 'NO_DURATION' });
  if (pulseSeconds !== undefined && pulseSeconds > meta.timeWarnings.overSeconds) warnings.push({ severity: 'warning', message: OVER_1S_TEXT, code: 'OVER_1S' });
  if (pulseSeconds !== undefined && pulseSeconds > meta.timeWarnings.strongSeconds) warnings.push({ severity: 'critical', message: OVER_10S_TEXT, code: 'OVER_10S' });

  const assumptions: string[] = [
    'Adiabatic: all the Joule heat stays in the conductor; no loss to the board, air or connected copper (S-042a, derived). The result is the time to REACH the melting point, heat of fusion excluded.',
    `Copper constants: density ${String(COPPER_DENSITY_KG_M3)} kg/m3 (S-003d, the IACS wire-table convention; a pure-copper density reference, ledger S-003e CONFLICT and S-003d notes, is about 0.5 % different, higher, and is not used: the time scales with the density), resistivity 1/58e6 ohm m and temperature coefficient 0.00393 per K (S-004), melting point ${String(tmC)} °C (S-042c, pure copper; no override, plated or alloyed copper may differ).`,
    `Specific heat ${String(c.valueJPerKgK)} J/(kg·K) (${c.label}; ledger S-042d, status ${c.status})${inp.specificHeatDefaulted ? ': a product DEFAULT, not chosen by the user; the sourced values disagree and are not averaged' : ': chosen by the user from the sourced values'}. Specific heat and density are taken as constant.`,
    'The initial temperature has no default and is the conductor temperature at the start of the pulse.',
    inp.geometry === 'trace'
      ? `The trace area is width x finished copper thickness; thickness basis: ${inp.thicknessBasis ?? ''}.`
      : inp.geometry === 'wire'
        ? 'The wire area is pi d^2/4 of the solid round conductor.'
        : inp.geometry === 'via'
          ? 'The via barrel area is pi t (d + t): plating annulus around the FINISHED hole d, with your plating thickness t (an average, not a minimum). The hole is empty (no fill or cap).'
          : 'The cross-section is the area as given.',
    inp.endTemperature !== undefined
      ? 'The end temperature is your value (not checked); the same adiabatic equation is used with it in place of the melting point.'
      : 'No end temperature was entered (there is no default); only the melting point is used.',
    'Rectangular pulse of constant current for the time or current modes; for any other pulse give its action integral I²t = the integral of i² dt (not I_rms times an arbitrary time).',
    'Onderdonk (S-042, UNVERIFIED, origin unknown) uses 33 and 234 as printed with log10; it is a secondary check on the same physics, not an independent confirmation. Preece (S-042b) is a historical reference with no time term.',
  ];

  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: inp.specificHeatDefaulted ? ['copper specific heat source'] : [],
    safetyRelevantDefaults: inp.thicknessBasis === 'nominal' ? ['copper thickness (nominal foil weight, not finished copper)'] : [],
    accuracyClass: meta.accuracyClass,
    dataStatus: STATUS,
  });

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: idsFor(inp.thicknessBasis === 'nominal', inp.geometry === 'via') },
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

/** Fusing: adiabatic time/current to reach the copper melting point. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
