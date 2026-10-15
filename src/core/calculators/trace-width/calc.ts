import { rateConfidence } from '../../confidence';
import {
  COPPER_ALPHA_20C,
  DEFAULT_FOIL_CONVENTION,
  FINISHED_COPPER_LEDGER_ID,
  FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
  copperBasisFactors,
  copperBasisFromFoil,
  usesFinishedCopperStatement,
} from '../../data/constants';
import { finishedVsNominal } from '../../data/finished-copper';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis, CopperBasisKind, DesignValue } from '../../result';
import { DIM, FOIL_CONVENTIONS, add, div, foilThickness, fromUnit, mul, q, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import type { ParsedFabProfile } from '../../fab/profile';
import {
  checkProfileInputs,
  envelopeResult,
  fabProfileRecord,
  fabProfileWarnings,
  hasTolerances,
  planTolerances,
  stripEnvelopeInputs,
} from '../tolerance-shared';
import type { DerivedOutput, FieldSpec, OutputPlan, ThicknessChoice, TolValue } from '../tolerance-shared';
import { validate } from './guards';
import type { Layer, ValidInputs } from './guards';
import { PULSE_LEDGER_IDS, effectiveHeatingCurrent, pulseWarnings } from '../pulse-shared';
import type { PeriodVsTau } from '../pulse-shared';
import type { LayerCountInput } from '../annular-ring/guards';
import { applyProfileMinimumWidth } from './fab-note';
import { meta } from './meta';

/**
 * Optional input tolerances (task 9). Absent means no envelope and no sensitivity readout; there are no default tolerances.
 * current, deltaT and width apply only to quantities you supply (a solved quantity has no input tolerance, except that a
 * width tolerance in the solved-width case adds the drawn width that covers it). copperThickness is a tolerance on the foil
 * weight or entered thickness, or an explicit choice of 'foil-convention-spread' (S-003) or 'finished-copper-s009' (S-009,
 * thin side only). width may be 'profile' to use the fab profile track-width tolerance (S-019l, UNVERIFIED) when the profile
 * publishes it. ambient is an absolute temperature-difference tolerance and needs a user-supplied ambient.
 */
export interface Tolerances {
  current?: TolValue;
  deltaT?: TolValue;
  width?: TolValue | 'profile';
  copperThickness?: TolValue | ThicknessChoice;
  ambient?: TolValue;
}

export interface Inputs {
  mode: 'B';
  layer: Layer;
  width?: Quantity;
  current?: Quantity;
  deltaT?: Quantity;
  copperWeight?: Quantity;
  copperThickness?: Quantity;
  copperBasis?: CopperBasisKind;
  convention?: FoilConvention;
  ambient?: Quantity;
  designMargin?: Quantity;
  currentDerating?: Quantity;
  maxAllowedTemp?: Quantity;
  /**
   * Optional pulse input (RMS-equivalent heating, task 2 advanced input). It replaces `current`: give peakCurrent, duty
   * (0 < D <= 1) and periodVsTau, your own statement of whether the pulse period is much shorter than the thermal time constant.
   * 'much-shorter' evaluates the legacy relation at I_rms = I_pk x sqrt(D) (mean heating, S-019e VERIFIED; S-019f UNVERIFIED);
   * 'comparable-or-longer' gives no rms result and holds the peak current continuously. Width or rise is solved, never current.
   */
  peakCurrent?: Quantity;
  duty?: Quantity;
  periodVsTau?: PeriodVsTau;
  tolerances?: Tolerances;
  /**
   * A parsed fab profile and the injected evaluation date (YYYY-MM-DD). Used for the 'profile' width tolerance and, when
   * layerCount is also given, for the minimum-trace-width note (exact scope: layer count, copper weight, layer side; no
   * fallback). A profile alone changes nothing else.
   */
  fabProfile?: ParsedFabProfile;
  today?: string;
  layerCount?: LayerCountInput;
}

const MANDATORY_CAUTION =
  'Legacy IPC-2221 method, for compatibility and comparison. Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability.';
const RECOMMENDATION =
  'Calculated limit and recommended design value are different numbers: use the recommended value (margin shown above, an engineering default unless you set it) and confirm finished copper thickness with your fabricator.';
const INNER_CAUTION =
  'Inner layer: the internal constant k = 0.024 is half the external 0.048 (S-001). IPC-2152 testing is reported to show internal traces running cooler than this assumes, so the legacy internal result is probably conservative (S-018, secondhand and unverified; IPC-2152 not read).';

const REL_TOL = 1e-9;
const T20_C = 20;
const T25_C = 25;
const C = meta.constants;
const V = meta.validity;
const DEF = meta.defaults;
const ONE_OZ = fromUnit(1, 'oz/ft2');
const EXCLUDE = { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE };

function nominalBasis(layer: Layer, weight: Quantity, convention: FoilConvention): CopperBasis {
  const b = copperBasisFromFoil(layer, weight, convention);
  return { ...b, thickness: q(b.thickness.si, b.thickness.dim) };
}

/** Thrown for a value outside the representable range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const copy = (x: Quantity): Quantity => q(x.si, x.dim);
const dimless = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const above = (x: number, hi: number): boolean => x > hi * (1 + REL_TOL);
const below = (x: number, lo: number): boolean => x < lo * (1 - REL_TOL);

interface Chart {
  name: string;
  label: string;
  value: string;
  bound: string;
  ok: boolean;
  detail: string;
  given: boolean;
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const given: ValidInputs = v.value;
  const layer = given.layer;
  const convention: FoilConvention = given.convention ?? DEFAULT_FOIL_CONVENTION;
  // A pulse takes the place of the current: the legacy relation is evaluated at the effective heating current.
  const pulse = given.peakCurrent !== undefined && given.duty !== undefined && given.periodVsTau !== undefined;
  const rmsUsed = pulse && given.periodVsTau === 'much-shorter';
  const inp: ValidInputs =
    given.peakCurrent !== undefined && given.duty !== undefined && given.periodVsTau !== undefined
      ? { ...given, current: q(positive(effectiveHeatingCurrent(given.peakCurrent.si, given.duty.si, given.periodVsTau), 'Effective current'), DIM.CURRENT) }
      : given;
  const rmsTag = rmsUsed ? ', RMS-equivalent (mean heating)' : '';
  const solved: 'width' | 'current' | 'deltaT' =
    inp.width === undefined ? 'width' : inp.current === undefined ? 'current' : 'deltaT';

  // Copper thickness (SI) and its basis.
  let thickness: Quantity;
  let basis: CopperBasis;
  let ozEquivalent: number;
  const foilInfo = foilThickness(inp.copperWeight ?? ONE_OZ, convention);
  const oneOzThickness = inp.copperWeight === undefined ? foilInfo.thickness.si : foilThickness(ONE_OZ, convention).thickness.si;
  if (inp.copperWeight !== undefined) {
    thickness = foilInfo.thickness;
    basis = nominalBasis(layer, inp.copperWeight, convention);
    ozEquivalent = toUnit(inp.copperWeight, 'oz/ft2');
  } else if (inp.copperThickness !== undefined) {
    thickness = copy(inp.copperThickness);
    const b = inp.copperBasis ?? 'nominal';
    basis = { layer, basis: b, thickness, source: `Thickness entered by the user, declared ${b}.` };
    ozEquivalent = thickness.si / oneOzThickness;
  } else {
    throw new RangeFailure('Neither copperWeight nor copperThickness reached the calculation.');
  }
  positive(thickness.si, 'Copper thickness');

  const ambientDefaulted = inp.ambient === undefined;
  const marginDefaulted = inp.designMargin === undefined;
  const derateDefaulted = inp.currentDerating === undefined;
  const ambient = inp.ambient !== undefined ? copy(inp.ambient) : fromUnit(DEF.ambientC, 'degC');
  const margin = inp.designMargin !== undefined ? copy(inp.designMargin) : dimless(DEF.designMargin);
  const derating = inp.currentDerating !== undefined ? copy(inp.currentDerating) : dimless(DEF.currentDerating);

  // Solve. The fitted equation works in mil2 and degC rise; everything else stays SI.
  const k = layer === 'outer' ? C.kOuter : C.kInner;
  let width: Quantity;
  let current: Quantity;
  let deltaT: Quantity;
  let area: Quantity;
  if (solved === 'width') {
    current = copy(inp.current as Quantity);
    deltaT = copy(inp.deltaT as Quantity);
    const dT = toUnit(deltaT, 'ddegC');
    const aMil2 = positive((current.si / (k * dT ** C.exponentDeltaT)) ** (1 / C.exponentArea), 'Required cross-section area');
    area = fromUnit(aMil2, 'mil2');
    width = div(area, thickness);
    positive(width.si, 'Required width');
  } else {
    width = copy(inp.width as Quantity);
    area = mul(width, thickness);
    const aMil2 = positive(toUnit(area, 'mil2'), 'Cross-section area');
    if (solved === 'current') {
      deltaT = copy(inp.deltaT as Quantity);
      const dT = toUnit(deltaT, 'ddegC');
      current = q(positive(k * dT ** C.exponentDeltaT * aMil2 ** C.exponentArea, 'Current capacity'), DIM.CURRENT);
    } else {
      current = copy(inp.current as Quantity);
      const rise = positive((current.si / (k * aMil2 ** C.exponentArea)) ** (1 / C.exponentDeltaT), 'Temperature rise');
      deltaT = q(rise, DIM.TEMPERATURE_DIFFERENCE);
    }
  }
  const maxTemp = add(ambient, deltaT);
  const density = div(current, area);
  positive(density.si, 'Current density');

  // Inputs.
  const inputs: CalcInput[] = [];
  const userIn = (name: string, x: Quantity | undefined): void => {
    if (x !== undefined) inputs.push({ name, value: copy(x), source: 'user' });
  };
  userIn('width', inp.width);
  userIn('current', given.current);
  userIn('peakCurrent', given.peakCurrent);
  userIn('duty', given.duty);
  userIn('deltaT', inp.deltaT);
  userIn('copperWeight', inp.copperWeight);
  userIn('copperThickness', inp.copperThickness);
  inputs.push(
    ambientDefaulted
      ? { name: 'ambient', value: ambient, source: 'default', sourceDetail: 'Engineering default 25 degC, not from a standard.' }
      : { name: 'ambient', value: ambient, source: 'user' },
  );
  inputs.push(
    marginDefaulted
      ? { name: 'designMargin', value: margin, source: 'default', sourceDetail: 'Engineering default 1.25, not from a standard.' }
      : { name: 'designMargin', value: margin, source: 'user' },
  );
  inputs.push(
    derateDefaulted
      ? { name: 'currentDerating', value: derating, source: 'default', sourceDetail: 'Engineering default 0.8, not from a standard.' }
      : { name: 'currentDerating', value: derating, source: 'user' },
  );
  userIn('maxAllowedTemp', inp.maxAllowedTemp);

  // Steps.
  const steps: CalcResult['steps'] = [
    ...(rmsUsed ? [{ label: 'Effective heating current, RMS-equivalent (mean heating)', expr: 'I_rms = I_pk x sqrt(D)', value: copy(current) }] : []),
    ...(pulse && !rmsUsed ? [{ label: 'Effective heating current (peak held continuously, not an rms value)', expr: 'I = I_pk', value: copy(current) }] : []),
    { label: 'Copper thickness', expr: 'weight x thickness per oz/ft2 of the chosen convention, or the entered thickness', value: thickness, bound: 'nominal' },
    { label: 'Fitted constant k', expr: `k = ${String(k)} (${layer === 'outer' ? 'external' : 'internal'})`, value: dimless(k) },
  ];
  if (solved === 'width') {
    steps.push({ label: `Required cross-section area${rmsTag}`, expr: 'A = (I / (k x dT^0.44))^(1/0.725), computed in mil2', value: area, bound: 'min-requirement' });
    steps.push({ label: `Required width${rmsTag}`, expr: 'width = A / copper thickness', value: width, bound: 'min-requirement' });
  } else {
    steps.push({ label: 'Cross-section area', expr: 'A = width x copper thickness', value: area, bound: 'nominal' });
    steps.push(
      solved === 'current'
        ? { label: 'Current capacity', expr: 'I = k x dT^0.44 x A^0.725', value: current, bound: 'max-capacity' }
        : { label: `Temperature rise${rmsTag}`, expr: 'dT = (I / (k x A^0.725))^(1/0.44)', value: deltaT, bound: 'prediction' },
    );
  }
  steps.push({ label: 'Maximum conductor temperature', expr: 'T = ambient + dT', value: maxTemp, bound: 'prediction' });
  steps.push({ label: 'Current density', expr: 'J = I / A', value: density, bound: 'prediction' });

  // Results.
  const roleOf = (n: 'width' | 'current' | 'deltaT'): 'primary' | 'secondary' => (n === solved ? 'primary' : 'secondary');
  const results: CalcResult['results'] = [
    { name: 'width', value: width, role: roleOf('width'), bound: solved === 'width' ? 'min-requirement' : 'nominal' },
    { name: 'current capacity', value: current, role: roleOf('current'), bound: solved === 'current' ? 'max-capacity' : 'nominal' },
    { name: 'temperature rise', value: deltaT, role: roleOf('deltaT'), bound: solved === 'deltaT' ? 'prediction' : 'nominal' },
    { name: 'cross-section area', value: area, role: 'secondary', bound: solved === 'width' ? 'min-requirement' : 'nominal' },
    { name: 'copper thickness', value: thickness, role: 'secondary', bound: 'nominal' },
    { name: 'maximum conductor temperature', value: maxTemp, role: 'secondary', bound: 'prediction' },
    { name: 'current density', value: density, role: 'secondary', bound: 'prediction' },
    ...(rmsUsed ? [{ name: 'RMS-equivalent current (mean heating)', value: copy(current), role: 'secondary' as const, bound: 'nominal' as const }] : []),
  ];

  // Design values.
  const designValues: DesignValue[] = [];
  if (solved === 'width') {
    // One margin basis for the whole tool: the margin is on CURRENT (the reciprocal of the current derating). The
    // recommended width is the width that carries margin x I at the same temperature rise: A is proportional to I^(1/0.725).
    const f = margin.si;
    const widthFactor = f ** (1 / C.exponentArea);
    const effect = `the recommended width carries ${String(f)} x the requested current at the same temperature rise (minimum width x${num(widthFactor)})`;
    designValues.push({
      name: 'width',
      direction: 'min-requirement',
      calculated: width,
      recommended: q(width.si * widthFactor, DIM.LENGTH),
      derating: {
        // The schema requires recommended = calculated x factor, so the factor is the WIDTH factor; the margin on current is f.
        factor: widthFactor,
        rationale: marginDefaulted
          ? `Design margin x${String(f)} on the current: ${effect}. This margin is an engineering default, not from a standard. Set your own margin.`
          : `Design margin x${String(f)} on the current, set by the user: ${effect}.`,
      },
    });
  } else if (solved === 'current') {
    const f = derating.si;
    designValues.push({
      name: 'current capacity',
      direction: 'max-limit',
      calculated: current,
      recommended: q(current.si * f, DIM.CURRENT),
      derating: {
        factor: f,
        rationale: derateDefaulted
          ? `Current derating x${String(f)} on the current limit: engineering default, not from a standard. Set your own factor.`
          : `Current derating x${String(f)} on the current limit, set by the user.`,
      },
    });
  }

  // Validity checks against the S-010 chart range, on the final quantities (given or solved).
  const curA = toUnit(current, 'A');
  const dTc = toUnit(deltaT, 'ddegC');
  const widthMil = toUnit(width, 'mil');
  const [wLo, wHi] = V.weightOzFt2;
  const charts: Chart[] = [
    {
      name: `current within chart range (up to ${String(V.currentA)} A)`,
      label: 'current',
      value: `${num(curA)} A`,
      bound: `up to ${String(V.currentA)} A`,
      ok: !above(curA, V.currentA),
      detail: `Chart range as reported by a secondary source (ledger S-010, paywalled, not read in the standard): current up to ${String(V.currentA)} A. Value ${num(curA)} A.`,
      given: solved !== 'current',
    },
    {
      name: `temperature rise within chart range (up to ${String(V.deltaTMaxC)} °C)`,
      label: 'temperature rise',
      value: `${num(dTc)} °C`,
      bound: `up to ${String(V.deltaTMaxC)} °C`,
      ok: !above(dTc, V.deltaTMaxC),
      detail: `Chart range as reported by a secondary source (ledger S-010, paywalled): temperature rise up to ${String(V.deltaTMaxC)} °C. Value ${num(dTc)} °C.`,
      given: solved !== 'deltaT',
    },
    {
      name: `copper weight within chart range (${String(wLo)}-${String(wHi)} oz/ft2)`,
      label: 'copper weight',
      value: `${num(ozEquivalent)} oz/ft2`,
      bound: `${String(wLo)}-${String(wHi)} oz/ft2`,
      ok: !below(ozEquivalent, wLo) && !above(ozEquivalent, wHi),
      detail: `Chart range as reported by a secondary source (ledger S-010, paywalled): ${String(wLo)} to ${String(wHi)} oz/ft2 (a thickness is converted with the ${convention} convention). Value ${num(ozEquivalent)} oz/ft2.`,
      given: true,
    },
    {
      name: `width within chart range (up to ${String(V.widthMil)} mil)`,
      label: 'width',
      value: `${num(widthMil)} mil`,
      bound: `up to ${String(V.widthMil)} mil`,
      ok: !above(widthMil, V.widthMil),
      detail: `Chart range as reported by a secondary source (ledger S-010, paywalled): width up to ${String(V.widthMil)} mil. Value ${num(widthMil)} mil.`,
      given: solved !== 'width',
    },
  ];
  const validityChecks: CalcResult['validityChecks'] = charts.map((c) => ({ name: c.name, ok: c.ok, detail: c.detail }));
  const outOfRange: { name: string; value: string; bound: string }[] = [];
  const solvedReasons: string[] = [];
  const warnings: CalcWarning[] = [{ severity: 'caution', message: MANDATORY_CAUTION, code: 'LEGACY_METHOD' }];
  if (layer === 'inner') warnings.push({ severity: 'caution', message: INNER_CAUTION, code: 'INNER_K_CONSERVATIVE' });
  if (layer === 'inner' && above(curA, V.innerCurrentCautionA)) {
    warnings.push({
      severity: 'caution',
      message: `Inner-layer current ${num(curA)} A is above ${String(V.innerCurrentCautionA)} A. Ledger S-010 records a CONFLICT: one source gives a separate ${String(V.innerCurrentCautionA)} A internal limit (KiCad legacy help text, tier 4, unverified) while the main chart range is ${String(V.currentA)} A. The ${String(V.currentA)} A hard limit still applies; between the two the result is extrapolation, so treat it with extra caution.`,
      code: 'INNER_CURRENT_ABOVE_17_5A',
    });
  }
  if (dTc < V.deltaTChartStartC * (1 - REL_TOL)) {
    warnings.push({
      severity: 'info',
      message: `Temperature rise ${num(dTc)} °C is below 10 °C: one source (S-010) says the chart starts at 10 °C, so this lies below the charted range. Treat the result with caution.`,
      code: 'DT_BELOW_CHART_START',
    });
  }
  for (const c of charts) {
    if (c.ok) continue;
    if (c.given) outOfRange.push({ name: c.label, value: c.value, bound: c.bound });
    else solvedReasons.push(`Solved ${c.label} = ${c.value} is outside the chart range (${c.bound}); it follows from the inputs and is not counted again in the score.`);
    warnings.push({
      severity: 'warning',
      message: `Extrapolation: ${c.label} ${c.value} is outside the chart range (${c.bound}, S-010). The curve fit is extended beyond the range it was fitted to; treat the result as indicative only.`,
      code: 'OUT_OF_CHART_RANGE',
    });
  }
  if (inp.maxAllowedTemp !== undefined) {
    const tMaxC = toUnit(maxTemp, 'degC');
    const allowedC = toUnit(inp.maxAllowedTemp, 'degC');
    const okT = tMaxC <= allowedC + Math.abs(allowedC) * REL_TOL;
    // The legacy fit has no ambient term, and copper is more resistive when hot (linear alpha at 20 degC, S-004): state both, computed.
    const hotPct = ((1 + COPPER_ALPHA_20C * (tMaxC - T20_C)) / (1 + COPPER_ALPHA_20C * (T25_C - T20_C)) - 1) * 100;
    const hotText = `${Math.abs(hotPct).toFixed(1)} % ${hotPct >= 0 ? 'higher' : 'lower'} than at ${String(T25_C)} °C`;
    validityChecks.push({
      name: 'Estimated conductor temperature vs your stated maximum (informational)',
      ok: okT,
      detail: `Ambient ${num(toUnit(ambient, 'degC'))} °C + rise ${num(dTc)} °C = ${num(tMaxC)} °C, against your stated maximum ${num(allowedC)} °C. ${okT ? 'The estimate is at or below your stated maximum.' : 'The estimate exceeds your stated maximum.'} This is an estimate from a legacy curve fit, not a design check: the legacy relation does not model ambient (it predicts the same rise at any ambient), and copper resistance is higher when hot: at ${num(tMaxC)} °C the resistivity is ${hotText} (linear coefficient, ledger S-004), so the real conductor dissipates more than the fit assumes.`,
    });
    if (!okT) {
      outOfRange.push({ name: 'maxAllowedTemp', value: `${num(tMaxC)} °C`, bound: `at most ${num(allowedC)} °C` });
      warnings.push({
        severity: 'warning',
        message: `Estimated conductor temperature ${num(tMaxC)} °C exceeds your stated maximum ${num(allowedC)} °C.`,
        code: 'MAX_TEMP_EXCEEDED',
      });
    }
  }

  // PCB-6: inner-layer finished-copper shortfall as a number (S-009 via finished-copper.ts, secondhand, PAYWALLED).
  const usesS009 = usesFinishedCopperStatement(basis);
  if (layer === 'inner' && usesS009 && basis.weightOzFt2 !== undefined) {
    const nominalUm = thickness.si * 1e6;
    const f = finishedVsNominal('inner', basis.weightOzFt2, nominalUm);
    if (f !== undefined && f.minimumUm < nominalUm) {
      const widthFactor = nominalUm / f.minimumUm;
      warnings.push({
        severity: 'caution',
        message: `Inner-layer finished copper: the S-009 ${f.class} for ${String(basis.weightOzFt2)} oz/ft2 is ${f.minimumUm.toFixed(1)} um, ${String(Math.round(f.percentVsNominal))} % against the nominal ${nominalUm.toFixed(1)} um used here (secondhand figure from IPC-6012 minimums, ledger S-009, PAYWALLED-USER-MUST-VERIFY, not read from the standard; a minimum, not a typical value). Consequence: a thinner finished copper than nominal would need a wider trace: required width scales as 1/thickness (about x${widthFactor.toFixed(2)} at the S-009 minimum); for a drawn width the current capacity falls and the temperature rise grows. The headline numbers use the nominal thickness.`,
        code: 'INNER_FINISHED_COPPER_THINNER',
      });
    }
  }
  if (pulse && given.periodVsTau !== undefined) warnings.push(...pulseWarnings(given.periodVsTau));

  // Assumptions.
  const info = FOIL_CONVENTIONS[convention];
  const assumptions: string[] = [
    `Foil convention in effect: ${convention} (${info.label}); ${foilInfo.statement}. The copper thickness is nominal unless entered as finished or measured (ledger S-003, CONFLICT between conventions).`,
    `Copper layer: ${layer} (entered by the user, never defaulted); k = ${String(k)}.`,
    ambientDefaulted
      ? `Ambient temperature ${String(DEF.ambientC)} °C is an engineering default, not from a standard; it sets the maximum conductor temperature.`
      : `Ambient temperature ${num(toUnit(ambient, 'degC'))} °C set by the user.`,
    marginDefaulted
      ? `Design margin ${String(DEF.designMargin)} is a margin on current and an engineering default, not from a standard (applied when the width is solved: the recommended width is solved for margin x current).`
      : `Design margin ${String(margin.si)} on current set by the user (applied when the width is solved: the recommended width is solved for margin x current).`,
    derateDefaulted
      ? `Current derating ${String(DEF.currentDerating)} is an engineering default, not from a standard (applied when the current capacity is solved).`
      : `Current derating ${String(derating.si)} set by the user (applied when the current capacity is solved).`,
    'The legacy equation relates a uniform conductor in still air to its temperature rise; it ignores neighbouring copper, planes, vias and board thermal paths.',
    'Adjacent plane and cooling (airflow, heatsinking, thermal vias) are not modelled: no credit and no penalty is taken for either; they are qualitative only (deferred).',
  ];
  if (pulse && given.peakCurrent !== undefined && given.duty !== undefined) {
    assumptions.push(
      rmsUsed
        ? `Pulse: rectangular pulses; you state the period is much shorter than the thermal time constant, so the legacy relation is evaluated at I_rms = I_pk x sqrt(D) = ${num(current.si)} A (I_pk ${num(given.peakCurrent.si)} A, D ${num(given.duty.si)}; ledger S-019e). The condition is your declaration and no threshold is computed (S-019f, UNVERIFIED). The result is RMS-equivalent (mean heating), not the peak.`
        : `Pulse: you state the period is comparable to or longer than the thermal time constant; no rms result is given and the peak current ${num(current.si)} A is held continuously.`,
    );
  }

  // Confidence: only defaults the chosen solve actually uses count.
  const safetyRelevantDefaults: string[] = [];
  if (ambientDefaulted) safetyRelevantDefaults.push('ambient defaulted to 25 °C (engineering default, not from a standard; it sets the maximum conductor temperature)');
  if (solved === 'width' && marginDefaulted) safetyRelevantDefaults.push('designMargin defaulted to 1.25 (engineering default, not from a standard)');
  if (solved === 'current' && derateDefaulted) safetyRelevantDefaults.push('currentDerating defaulted to 0.8 (engineering default, not from a standard)');
  safetyRelevantDefaults.push(...copperBasisFactors(basis).safetyRelevantDefaults);
  // Ledger rows the printed statements rest on: S-009 only when an S-009-based statement is present; pulse rows only with a pulse.
  const ledgerIds = [
    ...new Set([
      ...meta.reference.ledgerIds,
      ...(layer === 'inner' ? ['S-018'] : []),
      ...(usesS009 ? [FINISHED_COPPER_LEDGER_ID] : []),
      ...(pulse ? PULSE_LEDGER_IDS : []),
      ...extraLedgerIds,
    ]),
  ];
  const dataStatus = dataStatusForLedgerIds(ledgerIds, undefined, EXCLUDE);
  // The confidence rule does not count the implicit S-009 row a second time (the nominal-copper safety-relevant default already
  // carries it); S-009 chosen explicitly through a thickness tolerance still counts. S-001 (PAYWALLED) sets the same status anyway.
  const confidenceStatus = usesS009 && !extraLedgerIds.includes(FINISHED_COPPER_LEDGER_ID) ? dataStatusForLedgerIds(ledgerIds.filter((id) => id !== FINISHED_COPPER_LEDGER_ID), undefined, EXCLUDE) : dataStatus;
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: [],
    safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus: confidenceStatus,
  });
  confidence.reasons.push(...solvedReasons);

  const result: CalcResult = {
    method: meta.method,
    reference: {
      standard: meta.reference.standard,
      edition: meta.reference.edition,
      ledgerIds,
    },
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
    designValues,
    copperBasis: basis,
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) {
    const error: CalcError = { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
    return { ok: false, error };
  }
  return { ok: true, value: result };
}

const DRAWN_WIDTH = 'drawn width covering the width tolerance';

/** Nominal result plus the tolerance envelope and sensitivities (task 9). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const solved: 'width' | 'current' | 'deltaT' =
    inp.width === undefined ? 'width' : inp.current === undefined && inp.peakCurrent === undefined ? 'current' : 'deltaT';
  const tolRaw = raw.tolerances as unknown;
  const wantsProfile = typeof tolRaw === 'object' && tolRaw !== null && (tolRaw as { width?: unknown }).width === 'profile';
  const pe = checkProfileInputs(raw, wantsProfile);
  if (pe !== undefined) return { ok: false, error: pe };
  const solvedMsg = (n: string): string => `${n} is the solved quantity here, not an input, so it has no input tolerance. Give ${n} as an input (and solve another quantity) to tolerance it.`;
  const fields: FieldSpec[] = [
    {
      key: 'current',
      input: 'current',
      label: 'current',
      kind: 'relative',
      present: inp.current !== undefined,
      absentMessage:
        inp.peakCurrent !== undefined
          ? 'A current tolerance is not available with a pulse (peakCurrent, duty): the rms current is derived from them. Tolerance the width, rise, copper or ambient instead.'
          : solvedMsg('current'),
    },
    { key: 'deltaT', input: 'deltaT', label: 'temperature rise', kind: 'relative', present: inp.deltaT !== undefined, absentMessage: solvedMsg('deltaT') },
    { key: 'width', input: 'width', label: 'width', kind: 'relative', present: true, absentMessage: '', scaleOnly: solved === 'width', allow: 'profile-width' },
    { key: 'copperThickness', input: inp.copperWeight !== undefined ? 'copperWeight' : 'copperThickness', label: 'copper thickness', kind: 'relative', present: true, absentMessage: '', allow: 'thickness' },
    { key: 'ambient', input: 'ambient', label: 'ambient', kind: 'temperature', present: inp.ambient !== undefined, absentMessage: 'ambient tolerance needs a user-supplied ambient; the 25 degC default is an assumption and is not toleranced.' },
  ];
  const planRes = planTolerances(raw.tolerances, fields, {
    layer: inp.layer,
    ...(inp.copperWeight !== undefined ? { copperWeight: inp.copperWeight } : {}),
    ...(inp.convention !== undefined ? { convention: inp.convention } : {}),
    ...(raw.fabProfile !== undefined ? { profile: raw.fabProfile } : {}),
    ...(raw.today !== undefined ? { today: raw.today } : {}),
  });
  if (!planRes.ok) return { ok: false, error: planRes.error };
  const plan = planRes.value;

  const nominalRes = build(stripEnvelopeInputs(raw), plan.ledgerIds);
  if (!nominalRes.ok) return nominalRes;
  let nominal = nominalRes.value;
  if (plan.profileUsed && raw.fabProfile !== undefined && raw.today !== undefined) {
    const rec = fabProfileRecord(raw.fabProfile, raw.today);
    nominal = { ...nominal, fabProfile: rec, warnings: [...nominal.warnings, ...fabProfileWarnings(raw.fabProfile, rec)] };
  }
  // Solved width with a width tolerance: the drawn width must cover the minus side so the finished width still meets the requirement.
  const derived: DerivedOutput[] = [];
  const wTol = plan.planned.find((p) => p.key === 'width');
  if (solved === 'width' && wTol !== undefined && wTol.minus > 0) {
    const factor = 1 / (1 - wTol.minus);
    const w = nominal.results.find((r) => r.name === 'width') as CalcResult['results'][number];
    const drawn = q(w.value.si * factor, DIM.LENGTH);
    derived.push({ name: DRAWN_WIDTH, from: 'width', factor, bound: 'min-requirement', note: '' });
    nominal = {
      ...nominal,
      results: [...nominal.results, { name: DRAWN_WIDTH, value: drawn, role: 'secondary', bound: 'min-requirement' }],
      steps: [...nominal.steps, { label: 'Drawn width covering the width tolerance', expr: 'drawn = required width / (1 - width tolerance, minus side)', value: drawn, bound: 'min-requirement' }],
      assumptions: [...nominal.assumptions, 'The required width is the finished (as-etched) width. If the fabricator can deliver a finished width that low by the minus tolerance, draw the trace wider by 1 / (1 - minus); the plus side does not reduce the requirement.'],
    };
  }

  const primary = solved === 'width' ? 'width' : solved === 'current' ? 'current capacity' : 'temperature rise';
  const outputs: OutputPlan[] = [
    { name: primary, sensitivity: true },
    { name: 'maximum conductor temperature', sensitivity: false, onlyIfVaries: true },
  ];
  return envelopeResult({ compute: (i: Inputs) => build(i), base: stripEnvelopeInputs(raw), nominal, plan, outputs, derived });
}

/** Legacy IPC-2221 trace width / current capacity / temperature rise (Mode B only). Never throws; errors are returned as values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    const out = hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
    return out.ok ? applyProfileMinimumWidth(inputs, out.value) : out;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
