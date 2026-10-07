import { rateConfidence } from '../../confidence';
import {
  DEFAULT_FOIL_CONVENTION,
  FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
  copperBasisFactors,
  copperBasisFromFoil,
} from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis, CopperBasisKind, DesignValue } from '../../result';
import { DIM, FOIL_CONVENTIONS, add, div, foilThickness, fromUnit, mul, q, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import { validate } from './guards';
import type { Layer } from './guards';
import { meta } from './meta';

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
}

const MANDATORY_CAUTION =
  'Legacy IPC-2221 method, for compatibility and comparison. Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability.';
const RECOMMENDATION =
  'Calculated limit and recommended design value are different numbers: use the recommended value (margin shown above, an engineering default unless you set it) and confirm finished copper thickness with your fabricator.';
const INNER_CAUTION =
  'Inner layer: the internal constant k = 0.024 is half the external 0.048 (S-001). IPC-2152 testing is reported to show internal traces running cooler than this assumes, so the legacy internal result is probably conservative (S-018, secondhand and unverified; IPC-2152 not read).';

const REL_TOL = 1e-9;
const C = meta.constants;
const V = meta.validity;
const DEF = meta.defaults;
const ONE_OZ = fromUnit(1, 'oz/ft2');
const REF_IDS: readonly string[] = meta.reference.ledgerIds;
const STATUS_OUTER = dataStatusForLedgerIds([...REF_IDS], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });
const STATUS_INNER = dataStatusForLedgerIds([...REF_IDS, 'S-018'], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });

// copperBasisFromFoil is pure; memoise it (bounded) for repeated evaluation.
const BASIS_CACHE = new Map<string, CopperBasis>();
function nominalBasis(layer: Layer, weight: Quantity, convention: FoilConvention): CopperBasis {
  const key = `${layer}|${String(weight.si)}|${convention}`;
  let b = BASIS_CACHE.get(key);
  if (b === undefined) {
    b = copperBasisFromFoil(layer, weight, convention);
    if (BASIS_CACHE.size >= 256) BASIS_CACHE.clear();
    BASIS_CACHE.set(key, b);
  }
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

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const layer = inp.layer;
  const convention: FoilConvention = inp.convention ?? DEFAULT_FOIL_CONVENTION;
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
  userIn('current', inp.current);
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
    { label: 'Copper thickness', expr: 'weight x thickness per oz/ft2 of the chosen convention, or the entered thickness', value: thickness },
    { label: 'Fitted constant k', expr: `k = ${String(k)} (${layer === 'outer' ? 'external' : 'internal'})`, value: dimless(k) },
  ];
  if (solved === 'width') {
    steps.push({ label: 'Required cross-section area', expr: 'A = (I / (k x dT^0.44))^(1/0.725), computed in mil2', value: area });
    steps.push({ label: 'Required width', expr: 'width = A / copper thickness', value: width });
  } else {
    steps.push({ label: 'Cross-section area', expr: 'A = width x copper thickness', value: area });
    steps.push(
      solved === 'current'
        ? { label: 'Current capacity', expr: 'I = k x dT^0.44 x A^0.725', value: current }
        : { label: 'Temperature rise', expr: 'dT = (I / (k x A^0.725))^(1/0.44)', value: deltaT },
    );
  }
  steps.push({ label: 'Maximum conductor temperature', expr: 'T = ambient + dT', value: maxTemp });
  steps.push({ label: 'Current density', expr: 'J = I / A', value: density });

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
  ];

  // Design values.
  const designValues: DesignValue[] = [];
  if (solved === 'width') {
    const f = margin.si;
    designValues.push({
      name: 'width',
      direction: 'min-requirement',
      calculated: width,
      recommended: q(width.si * f, DIM.LENGTH),
      derating: {
        factor: f,
        rationale: marginDefaulted
          ? `Design margin x${String(f)} on the minimum width: engineering default, not from a standard. Set your own margin.`
          : `Design margin x${String(f)} on the minimum width, set by the user.`,
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
    validityChecks.push({
      name: `maximum conductor temperature within allowed (${num(allowedC)} °C)`,
      ok: okT,
      detail: `Ambient ${num(toUnit(ambient, 'degC'))} °C + rise ${num(dTc)} °C = ${num(tMaxC)} °C against the allowed ${num(allowedC)} °C.`,
    });
    if (!okT) {
      outOfRange.push({ name: 'maxAllowedTemp', value: `${num(tMaxC)} °C`, bound: `at most ${num(allowedC)} °C` });
      warnings.push({
        severity: 'warning',
        message: `Maximum conductor temperature ${num(tMaxC)} °C exceeds the allowed ${num(allowedC)} °C.`,
        code: 'MAX_TEMP_EXCEEDED',
      });
    }
  }

  // Assumptions.
  const info = FOIL_CONVENTIONS[convention];
  const assumptions: string[] = [
    `Foil convention in effect: ${convention} (${info.label}); ${foilInfo.statement}. The copper thickness is nominal unless entered as finished or measured (ledger S-003, CONFLICT between conventions).`,
    `Copper layer: ${layer} (entered by the user, never defaulted); k = ${String(k)}.`,
    ambientDefaulted
      ? `Ambient temperature ${String(DEF.ambientC)} °C is an engineering default, not from a standard; it sets the maximum conductor temperature.`
      : `Ambient temperature ${num(toUnit(ambient, 'degC'))} °C set by the user.`,
    marginDefaulted
      ? `Design margin ${String(DEF.designMargin)} is an engineering default, not from a standard (applied when the width is solved).`
      : `Design margin ${String(margin.si)} set by the user (applied when the width is solved).`,
    derateDefaulted
      ? `Current derating ${String(DEF.currentDerating)} is an engineering default, not from a standard (applied when the current capacity is solved).`
      : `Current derating ${String(derating.si)} set by the user (applied when the current capacity is solved).`,
    'The legacy equation relates a uniform conductor in still air to its temperature rise; it ignores neighbouring copper, planes, vias and board thermal paths.',
  ];

  // Confidence: only defaults the chosen solve actually uses count.
  const safetyRelevantDefaults: string[] = [];
  if (ambientDefaulted) safetyRelevantDefaults.push('ambient defaulted to 25 °C (engineering default, not from a standard; it sets the maximum conductor temperature)');
  if (solved === 'width' && marginDefaulted) safetyRelevantDefaults.push('designMargin defaulted to 1.25 (engineering default, not from a standard)');
  if (solved === 'current' && derateDefaulted) safetyRelevantDefaults.push('currentDerating defaulted to 0.8 (engineering default, not from a standard)');
  safetyRelevantDefaults.push(...copperBasisFactors(basis).safetyRelevantDefaults);
  const dataStatus = layer === 'inner' ? STATUS_INNER : STATUS_OUTER;
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: [],
    safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus,
  });
  confidence.reasons.push(...solvedReasons);

  const result: CalcResult = {
    method: meta.method,
    reference: {
      standard: meta.reference.standard,
      edition: meta.reference.edition,
      ledgerIds: layer === 'inner' ? [...meta.reference.ledgerIds, 'S-018'] : [...meta.reference.ledgerIds],
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

/** Legacy IPC-2221 trace width / current capacity / temperature rise (Mode B only). Never throws; errors are returned as values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
