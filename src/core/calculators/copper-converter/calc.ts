import { rateConfidence } from '../../confidence';
import {
  DEFAULT_FOIL_CONVENTION,
  FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
  copperBasisFactors,
  copperBasisFromFoil,
  foilSpreadPercent,
} from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis } from '../../result';
import { DIM, FOIL_CONVENTIONS, foilThickness, fromUnit, q, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import { validate } from './guards';
import type { Layer, ThicknessBasis } from './guards';
import { meta } from './meta';

export interface Inputs {
  weight?: Quantity;
  thickness?: Quantity;
  layer: Layer;
  convention?: FoilConvention;
  thicknessBasis?: ThicknessBasis;
  platingThickness?: Quantity;
}

const RECOMMENDATION =
  'Nominal conversion only. Ask your fabricator for finished copper thickness per layer; enter it as a measured/finished thickness for design calculations.';

const CONVENTION_IDS = Object.keys(FOIL_CONVENTIONS) as FoilConvention[];
const ONE_OZ = fromUnit(1, 'oz/ft2');
// Static data: computed once (the ledger and conventions are constants), keeping repeated computes cheap.
const SPREAD_PCT = foilSpreadPercent();
const SPREAD_TEXT = SPREAD_PCT.toFixed(2);
const DATA_STATUS = dataStatusForLedgerIds(['S-003', 'S-003d', 'S-006'], undefined, {
  exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
});
const [W_LO, W_HI] = meta.validity.weightOzFt2;
const [T_LO, T_HI] = meta.validity.thicknessUm;

// copperBasisFromFoil is pure but re-derives the convention spread each call; memoise it (bounded) for repeated evaluation.
const BASIS_CACHE = new Map<string, CopperBasis>();
const BASIS_CACHE_MAX = 256;
function nominalBasis(layer: Layer, weight: Quantity, convention: FoilConvention): CopperBasis {
  const key = `${layer}|${String(weight.si)}|${convention}`;
  let b = BASIS_CACHE.get(key);
  if (b === undefined) {
    b = copperBasisFromFoil(layer, weight, convention);
    if (BASIS_CACHE.size >= BASIS_CACHE_MAX) BASIS_CACHE.clear();
    BASIS_CACHE.set(key, b);
  }
  return { ...b };
}

function internal(message: string): CalcOutcome {
  const error: CalcError = { code: 'INTERNAL', message };
  return { ok: false, error };
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const convention: FoilConvention = inp.convention ?? DEFAULT_FOIL_CONVENTION;
  const layer = inp.layer;

  const inputs: CalcInput[] = [];
  const steps: CalcResult['steps'] = [];
  const results: CalcResult['results'] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const outOfRange: { name: string; value: string; bound: string }[] = [];
  const nominalBound = 'nominal' as const;

  let baseThickness: Quantity;
  let weightMode = false;
  let basis: CopperBasis;

  if (inp.weight !== undefined) {
    weightMode = true;
    const w = inp.weight;
    inputs.push({ name: 'weight', value: q(w.si, w.dim), source: 'user' });
    const ozVal = toUnit(w, 'oz/ft2');
    const ft = foilThickness(w, convention);
    baseThickness = ft.thickness;
    basis = nominalBasis(layer, w, convention);
    steps.push({ label: 'Foil weight', expr: 'weight [oz/ft2] = areal mass / (1 oz/ft2)', value: q(ozVal, DIM.DIMENSIONLESS) });
    steps.push({ label: 'Thickness from weight', expr: `thickness = weight x thickness per oz/ft2 (${convention})`, value: baseThickness });
    results.push({ name: 'thickness', value: baseThickness, role: 'primary', bound: nominalBound });
    results.push({ name: 'areal mass', value: q(w.si, w.dim), role: 'secondary', bound: nominalBound });
    for (const c of CONVENTION_IDS) {
      results.push({
        name: `thickness (${c})`,
        value: c === convention ? baseThickness : foilThickness(w, c).thickness,
        role: 'secondary',
        bound: nominalBound,
      });
    }
    const spread = SPREAD_PCT / 100;
    steps.push({ label: 'Convention spread', expr: 'spread = (max - min) / min over the three conventions at 1 oz/ft2', value: q(spread, DIM.DIMENSIONLESS) });
    results.push({ name: 'convention spread', value: q(spread, DIM.DIMENSIONLESS), role: 'secondary', bound: nominalBound });
    const wOk = ozVal >= W_LO && ozVal <= W_HI;
    validityChecks.push({
      name: `weight in common range ${String(W_LO)}-${String(W_HI)} oz/ft2`,
      ok: wOk,
      detail: `Plausibility range for common copper weights, not a standard. Entered ${ozVal.toPrecision(4)} oz/ft2.`,
    });
    if (!wOk) outOfRange.push({ name: 'weight', value: `${ozVal.toPrecision(4)} oz/ft2`, bound: `${String(W_LO)}-${String(W_HI)} oz/ft2` });
  } else if (inp.thickness !== undefined) {
    const t = inp.thickness;
    inputs.push({ name: 'thickness', value: q(t.si, t.dim), source: 'user' });
    baseThickness = q(t.si, t.dim);
    // Thickness of one oz/ft2 in this convention: the single source for the inverse conversion.
    const oneOzThickness = foilThickness(ONE_OZ, convention).thickness;
    const ratio = t.si / oneOzThickness.si;
    const mass = q(ratio * ONE_OZ.si, DIM.AREAL_MASS);
    basis = { layer, basis: inp.thicknessBasis, thickness: baseThickness, source: 'Thickness entered by the user.' };
    steps.push({ label: 'Weight from thickness', expr: `weight [oz/ft2] = thickness / thickness per oz/ft2 (${convention})`, value: q(ratio, DIM.DIMENSIONLESS) });
    results.push({ name: 'thickness', value: baseThickness, role: 'primary', bound: nominalBound });
    results.push({ name: 'areal mass', value: mass, role: 'secondary', bound: nominalBound });
    const um = toUnit(t, 'um');
    const tOk = um >= T_LO && um <= T_HI;
    validityChecks.push({
      name: `thickness in common range ${String(T_LO)}-${String(T_HI)} um`,
      ok: tOk,
      detail: `Plausibility range for common copper thicknesses, not a standard. Entered ${um.toPrecision(4)} um.`,
    });
    if (!tOk) outOfRange.push({ name: 'thickness', value: `${um.toPrecision(4)} um`, bound: `${String(T_LO)}-${String(T_HI)} um` });
  } else {
    return internal('Neither weight nor thickness reached the calculation.');
  }

  if (inp.platingThickness !== undefined) {
    const p = inp.platingThickness;
    inputs.push({ name: 'plating thickness', value: q(p.si, p.dim), source: 'user' });
    const fin = q(baseThickness.si + p.si, DIM.LENGTH);
    steps.push({ label: 'Estimated finished thickness', expr: 'finished = base thickness + plating thickness', value: fin });
    results.push({ name: 'estimated finished thickness', value: fin, role: 'secondary', bound: nominalBound });
  }

  const info = FOIL_CONVENTIONS[convention];
  const assumptions: string[] = [
    `Foil convention in effect: ${convention} (${info.label}). The conversion is nominal: it is a labelled convention, not a standard, and the three conventions differ by up to ${SPREAD_TEXT} % at 1 oz/ft2 (ledger S-003).`,
    `Copper layer: ${layer} (entered by the user, never defaulted).`,
  ];
  if (inp.convention === undefined) assumptions.push(`Convention not chosen; default ${DEFAULT_FOIL_CONVENTION} used.`);
  if (!weightMode) assumptions.push(`Thickness basis: ${inp.thicknessBasis} (entered by the user, or nominal when omitted).`);

  const warnings: CalcWarning[] = [];
  if (layer === 'outer') {
    warnings.push({
      severity: 'caution',
      message:
        'Outer-layer copper usually finishes thicker than the nominal foil after plating; a secondhand figure is about +37 % (S-009, not read from the standard). Ask your fabricator for finished copper.',
      code: 'OUTER_FINISHES_THICKER',
    });
  } else {
    warnings.push({
      severity: 'caution',
      message:
        'Inner-layer finished copper can be thinner than nominal after etch and processing; a secondhand figure is about -29 % (S-009, not read from the standard). Ask your fabricator for finished copper.',
      code: 'INNER_FINISHES_THINNER',
    });
  }
  warnings.push({
    severity: 'info',
    message: `The three foil conventions differ by up to ${SPREAD_TEXT} % at 1 oz/ft2; this result uses ${convention}.`,
    code: 'CONVENTION_SPREAD',
  });

  const factors = copperBasisFactors(basis);
  const dataStatus = DATA_STATUS;
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions: factors.defaultedAssumptions,
    safetyRelevantDefaults: factors.safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus,
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
    dataStatus,
    designValues: [],
    copperBasis: basis,
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return internal(`Result failed its schema check: ${chk.error.join('; ')}`);
  return { ok: true, value: result };
}

/** Copper weight <-> thickness, nominal conversion only. Never throws; errors are returned as values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Conversion could not be completed: ${message}` } };
  }
}
