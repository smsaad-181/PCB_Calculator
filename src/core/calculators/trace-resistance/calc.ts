import { rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
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
import { DIM, FOIL_CONVENTIONS, add, foilThickness, fromUnit, q, toUnit } from '../../units';
import type { FoilConvention, Quantity } from '../../units';
import { envelopeResult, hasTolerances, planTolerances, stripEnvelopeInputs } from '../tolerance-shared';
import type { FieldSpec, OutputPlan, ThicknessChoice, TolValue } from '../tolerance-shared';
import { validate } from './guards';
import type { Layer } from './guards';
import { meta } from './meta';

/**
 * Optional input tolerances (task 9). Absent means no envelope and no sensitivity readout; there are no default tolerances.
 * length, width and copperThickness are relative tolerances (copperThickness may instead be an explicit choice of
 * 'foil-convention-spread' (S-003) or 'finished-copper-s009' (S-009, thin side only)). ambient is an absolute
 * temperature-difference tolerance on the conductor temperature and needs a user-supplied ambient. resistivity needs the
 * override and current needs a current. No tolerance is taken from a fab profile here.
 */
export interface Tolerances {
  length?: TolValue;
  width?: TolValue;
  copperThickness?: TolValue | ThicknessChoice;
  ambient?: TolValue;
  resistivity?: TolValue;
  current?: TolValue;
}

export interface Inputs {
  layer: Layer;
  length: Quantity;
  width: Quantity;
  copperWeight?: Quantity;
  copperThickness?: Quantity;
  copperBasis?: CopperBasisKind;
  convention?: FoilConvention;
  ambient?: Quantity;
  deltaT?: Quantity;
  resistivity?: Quantity;
  alpha?: Quantity;
  frequency?: Quantity;
  current?: Quantity;
  tolerances?: Tolerances;
}

const RECOMMENDATION =
  'Resistance is a calculated value for the stated copper thickness. Use finished copper from your fabricator and the worst-case temperature for voltage-drop and heating checks.';
const LINEAR_INFO =
  'The temperature coefficient is the linear coefficient at 20 °C for 100 % IACS copper (ledger S-004); its change with temperature and the effect of alloying, plating and impurities are not modelled. Treat results far from 20 °C as estimates.';
const DELTA_T_INFO =
  'The temperature rise (deltaT) was supplied by the user and added to the ambient temperature; no self-heating iteration is performed, so it is not checked against the current.';
const RHO_CAUTION =
  'The resistivity you entered will replace the ledger value for annealed copper (S-004). The default does not cover plated copper, whose resistivity is a separate row (S-012, UNVERIFIED); replace it only with a value you can source.';
const ALPHA_CAUTION =
  'The temperature coefficient you entered will replace the S-004 value; the result at any temperature other than 20 °C depends directly on it, so replace it only with a value you can source.';
export const VOLTAGE_DROP_SCOPE =
  'Voltage drop and power loss cover this trace only: one conductor, one direction. They exclude the return path (about twice the drop for a trace return of equal size), vias, pads, connectors, solder joints and copper necking. Do not compare this figure with a rail budget; the future path calculator covers the whole path.';
const SKIN_MESSAGE = 'DC formula is optimistic: skin depth is below half the copper thickness';

const REL_TOL = 1e-9;
const MU0 = 4e-7 * Math.PI;
const T20_C = 20;
const V = meta.validity;
const REF_IDS: readonly string[] = meta.reference.ledgerIds;
const STATUS_DEFAULT = dataStatusForLedgerIds([...REF_IDS], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });
const STATUS_FREQ = dataStatusForLedgerIds([...REF_IDS, 'S-013'], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });
const STATUS_RHO = dataStatusForLedgerIds([...REF_IDS, 'S-012'], undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE });
const STATUS_RHO_FREQ = dataStatusForLedgerIds([...REF_IDS, 'S-012', 'S-013'], undefined, {
  exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
});

/** Thrown for a value outside the representable or modelled range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const num = (x: number): string => String(Number(x.toPrecision(4)));
const copy = (x: Quantity): Quantity => q(x.si, x.dim);
const above = (x: number, hi: number): boolean => x > hi * (1 + REL_TOL);

function nominalBasis(layer: Layer, weight: Quantity, convention: FoilConvention): CopperBasis {
  const b = copperBasisFromFoil(layer, weight, convention);
  return { ...b, thickness: q(b.thickness.si, b.thickness.dim) };
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const layer = inp.layer;
  const convention: FoilConvention = inp.convention ?? DEFAULT_FOIL_CONVENTION;

  // Copper thickness (SI) and its basis.
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
  const conductor = inp.deltaT !== undefined ? add(ambient, inp.deltaT) : copy(ambient);
  positive(conductor.si, 'Conductor temperature');
  const tC = toUnit(conductor, 'degC');

  const rho20 = inp.resistivity !== undefined ? inp.resistivity.si : COPPER_RESISTIVITY_20C;
  const alpha = inp.alpha !== undefined ? inp.alpha.si : COPPER_ALPHA_20C;
  const rhoOverride = inp.resistivity !== undefined;
  const rhoDiffers = rhoOverride && rho20 !== COPPER_RESISTIVITY_20C;
  const alphaOverride = inp.alpha !== undefined;

  const rhoT = positive(rho20 * (1 + alpha * (tC - T20_C)), 'Resistivity at the conductor temperature (the linear model gives a non-positive value)');
  const areaSi = positive(inp.width.si * thickness.si, 'Cross-section area');
  const r20 = positive((rho20 * inp.length.si) / areaSi, 'Resistance at 20 °C');
  const rT = positive((rhoT * inp.length.si) / areaSi, 'Resistance at the conductor temperature');
  const area = q(areaSi, DIM.AREA);

  let skinSi: number | undefined;
  if (inp.frequency !== undefined) skinSi = positive(Math.sqrt(rhoT / (Math.PI * inp.frequency.si * MU0)), 'Skin depth');
  let vDrop: number | undefined;
  let power: number | undefined;
  if (inp.current !== undefined) {
    vDrop = positive(inp.current.si * rT, 'Voltage drop');
    power = positive(inp.current.si * inp.current.si * rT, 'Power loss');
  }

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
  userIn('deltaT', inp.deltaT);
  userIn('resistivity', inp.resistivity);
  userIn('alpha', inp.alpha);
  userIn('frequency', inp.frequency);
  userIn('current', inp.current);

  // Steps.
  const steps: CalcResult['steps'] = [
    { label: 'Copper thickness', expr: 'weight x thickness per oz/ft2 of the chosen convention, or the entered thickness', value: thickness },
    { label: 'Cross-section area', expr: 'A = w x t', value: area },
    { label: 'Conductor temperature', expr: 'T = ambient + deltaT', value: conductor, bound: 'prediction' },
    { label: 'Resistivity at 20 °C', expr: rhoOverride ? 'rho20 = user value' : 'rho20 = 1/58 ohm mm2/m (S-004)', value: q(rho20, DIM.RESISTIVITY) },
    { label: 'Resistivity at the conductor temperature', expr: 'rho(T) = rho20 x (1 + alpha x (T - 20 °C))', value: q(rhoT, DIM.RESISTIVITY) },
    { label: 'Resistance at 20 °C', expr: 'R20 = rho20 x L / A', value: q(r20, DIM.RESISTANCE) },
    { label: 'Resistance at the conductor temperature', expr: 'R(T) = rho(T) x L / A', value: q(rT, DIM.RESISTANCE), bound: 'prediction' },
  ];
  if (skinSi !== undefined) {
    steps.push({ label: 'Skin depth', expr: 'delta = sqrt(rho(T) / (pi x f x mu0))', value: q(skinSi, DIM.LENGTH) });
  }
  if (vDrop !== undefined && power !== undefined) {
    steps.push({ label: 'Voltage drop', expr: 'V = I x R(T)', value: q(vDrop, DIM.VOLTAGE), bound: 'prediction' });
    steps.push({ label: 'Power loss', expr: 'P = I^2 x R(T)', value: q(power, DIM.POWER), bound: 'prediction' });
  }

  // Results.
  const results: CalcResult['results'] = [
    { name: 'resistance at conductor temperature', value: q(rT, DIM.RESISTANCE), role: 'primary', bound: 'prediction' },
    { name: 'resistance at 20 °C', value: q(r20, DIM.RESISTANCE), role: 'secondary', bound: 'nominal' },
    { name: 'conductor temperature', value: conductor, role: 'secondary', bound: 'prediction' },
    { name: 'resistivity at conductor temperature', value: q(rhoT, DIM.RESISTIVITY), role: 'secondary', bound: 'nominal' },
    { name: 'cross-section area', value: area, role: 'secondary', bound: 'nominal' },
    { name: 'copper thickness', value: thickness, role: 'secondary', bound: 'nominal' },
  ];
  if (skinSi !== undefined) results.push({ name: 'skin depth', value: q(skinSi, DIM.LENGTH), role: 'secondary', bound: 'nominal' });
  if (vDrop !== undefined && power !== undefined) {
    results.push({ name: 'voltage drop', value: q(vDrop, DIM.VOLTAGE), role: 'secondary', bound: 'prediction' });
    results.push({ name: 'power loss', value: q(power, DIM.POWER), role: 'secondary', bound: 'prediction' });
  }
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  // Validity checks: plausibility ranges, not standards.
  const [tLo, tHi] = V.conductorTempC;
  const lengthM = inp.length.si;
  const widthM = inp.width.si;
  const tempOk = tC >= tLo - REL_TOL && tC <= tHi + REL_TOL;
  const lenOk = !above(lengthM, V.lengthM);
  const widOk = !above(widthM, V.widthM);
  const validityChecks: CalcResult['validityChecks'] = [
    {
      name: `conductor temperature within ${String(tLo)} to ${String(tHi)} °C`,
      ok: tempOk,
      detail: `Plausibility range for the linear copper model, not a standard. Conductor temperature ${num(tC)} °C.`,
    },
    {
      name: `length up to ${String(V.lengthM)} m`,
      ok: lenOk,
      detail: `Plausibility range for a single board trace, not a standard. Length ${num(lengthM)} m.`,
    },
    {
      name: `width up to ${String(V.widthM * 1000)} mm`,
      ok: widOk,
      detail: `Plausibility range for a single board trace, not a standard. Width ${num(widthM * 1000)} mm.`,
    },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!tempOk) outOfRange.push({ name: 'conductor temperature', value: `${num(tC)} °C`, bound: `${String(tLo)} to ${String(tHi)} °C` });
  if (!lenOk) outOfRange.push({ name: 'length', value: `${num(lengthM)} m`, bound: `up to ${String(V.lengthM)} m` });
  if (!widOk) outOfRange.push({ name: 'width', value: `${num(widthM * 1000)} mm`, bound: `up to ${String(V.widthM * 1000)} mm` });

  const warnings: CalcWarning[] = [{ severity: 'info', message: LINEAR_INFO, code: 'LINEAR_ALPHA' }];
  if (inp.deltaT !== undefined) warnings.push({ severity: 'info', message: DELTA_T_INFO, code: 'DELTA_T_SUPPLIED' });
  if (vDrop !== undefined) warnings.push({ severity: 'caution', message: VOLTAGE_DROP_SCOPE, code: 'VOLTAGE_DROP_SCOPE' });
  if (rhoOverride) warnings.push({ severity: 'caution', message: RHO_CAUTION, code: 'RESISTIVITY_OVERRIDE' });
  if (alphaOverride) warnings.push({ severity: 'caution', message: ALPHA_CAUTION, code: 'ALPHA_OVERRIDE' });

  if (inp.frequency !== undefined && skinSi !== undefined) {
    const f = inp.frequency.si;
    const half = thickness.si / 2;
    const skinOk = skinSi >= half * (1 - REL_TOL);
    validityChecks.push({
      name: 'skin depth vs copper thickness',
      ok: skinOk,
      detail: `Rule of thumb, not a standard: the current fills the conductor when the skin depth is at least half the copper thickness. Skin depth ${num(skinSi * 1e6)} µm against half thickness ${num(half * 1e6)} µm.`,
    });
    if (!skinOk) {
      outOfRange.push({
        name: 'frequency',
        value: `${num(f)} Hz (skin depth ${num(skinSi * 1e6)} µm)`,
        bound: `skin depth at least half the copper thickness (${num(half * 1e6)} µm)`,
      });
      warnings.push({ severity: 'warning', message: SKIN_MESSAGE, code: 'SKIN_EFFECT' });
    }
    if (f < V.frequencyHz[0] * (1 - REL_TOL) || f > V.frequencyHz[1] * (1 + REL_TOL)) {
      warnings.push({
        severity: 'caution',
        message: `The frequency ${num(f)} Hz is outside 1 Hz to 1 GHz, the range this skin-depth screen is intended for; treat the skin depth as indicative.`,
        code: 'FREQUENCY_RANGE',
      });
    }
  }

  // Assumptions.
  const info = FOIL_CONVENTIONS[convention];
  const assumptions: string[] = [
    `Foil convention in effect: ${convention} (${info.label}); the copper thickness is nominal unless entered as finished or measured (ledger S-003, CONFLICT between conventions).`,
    `Copper layer: ${layer} (entered by the user, never defaulted).`,
    ambientDefaulted
      ? `Ambient temperature ${String(meta.defaults.ambientC)} °C is an engineering default, not from a standard; it sets the conductor temperature.`
      : `Ambient temperature ${num(toUnit(ambient, 'degC'))} °C set by the user.`,
    ...(vDrop !== undefined ? ['Voltage drop and power loss are for one conductor, one direction: they exclude the return path, vias, pads, connectors, solder joints and necking (the future path calculator covers the whole path).'] : []),
    'DC resistance of a uniform rectangular conductor; the cross-section is treated as an ideal rectangle (etch factor, plating and surface roughness are not modelled).',
  ];

  // Confidence.
  const defaultedAssumptions = ambientDefaulted ? ['ambient'] : [];
  const safetyRelevantDefaults = [...copperBasisFactors(basis).safetyRelevantDefaults];
  const dataStatus =
    extraLedgerIds.length > 0
      ? dataStatusForLedgerIds([...REF_IDS, ...(rhoDiffers ? ['S-012'] : []), ...(inp.frequency !== undefined ? ['S-013'] : []), ...extraLedgerIds], undefined, {
          exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE,
        })
      : rhoDiffers
        ? inp.frequency !== undefined
          ? STATUS_RHO_FREQ
          : STATUS_RHO
        : inp.frequency !== undefined
          ? STATUS_FREQ
          : STATUS_DEFAULT;
  const confidence = rateConfidence({
    outOfRangeInputs: outOfRange,
    defaultedAssumptions,
    safetyRelevantDefaults,
    accuracyClass: meta.accuracyClass,
    dataStatus,
  });
  if (safetyRelevantDefaults.length > 0) {
    confidence.reasons.push('Resistance is inversely proportional to copper thickness, so any difference between nominal and finished copper carries straight into the resistance.');
  }

  const ledgerIds = [...REF_IDS];
  if (inp.frequency !== undefined) ledgerIds.push('S-013');
  if (rhoOverride) ledgerIds.push('S-012');
  for (const id of extraLedgerIds) if (!ledgerIds.includes(id)) ledgerIds.push(id);

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
    copperBasis: basis,
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
    { key: 'length', input: 'length', label: 'length', kind: 'relative', present: true, absentMessage: '' },
    { key: 'width', input: 'width', label: 'width', kind: 'relative', present: true, absentMessage: '' },
    { key: 'copperThickness', input: inp.copperWeight !== undefined ? 'copperWeight' : 'copperThickness', label: 'copper thickness', kind: 'relative', present: true, absentMessage: '', allow: 'thickness' },
    { key: 'ambient', input: 'ambient', label: 'ambient', kind: 'temperature', present: inp.ambient !== undefined, absentMessage: 'ambient tolerance needs a user-supplied ambient; the 25 degC default is an assumption and is not toleranced.' },
    { key: 'resistivity', input: 'resistivity', label: 'resistivity', kind: 'relative', present: inp.resistivity !== undefined, absentMessage: 'resistivity tolerance needs the resistivity override; the default copper value is a definition (S-004) and is not toleranced.' },
    { key: 'current', input: 'current', label: 'current', kind: 'relative', present: inp.current !== undefined, absentMessage: 'current tolerance needs a current; none was given.' },
  ];
  const planRes = planTolerances(raw.tolerances, fields, {
    layer: inp.layer,
    ...(inp.copperWeight !== undefined ? { copperWeight: inp.copperWeight } : {}),
    ...(inp.convention !== undefined ? { convention: inp.convention } : {}),
  });
  if (!planRes.ok) return { ok: false, error: planRes.error };
  const plan = planRes.value;
  const nominalRes = build(stripEnvelopeInputs(raw), plan.ledgerIds);
  if (!nominalRes.ok) return nominalRes;
  const nominal = nominalRes.value;
  const outputs: OutputPlan[] = [{ name: 'resistance at conductor temperature', sensitivity: true }];
  if (inp.current !== undefined) outputs.push({ name: 'voltage drop', sensitivity: true }, { name: 'power loss', sensitivity: true });
  return envelopeResult({ compute: (i: Inputs) => build(i), base: stripEnvelopeInputs(raw), nominal, plan, outputs });
}

/** Trace resistance at the conductor temperature, with voltage drop, power loss and a skin-depth screen. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
