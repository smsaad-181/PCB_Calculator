import { confidenceFactorsFromInputs, rateConfidence } from '../../confidence';
import type { OutOfRangeInput } from '../../confidence';
import { copperThermalConductivity } from '../../data/constants';
import type { CopperKMaterial } from '../../data/constants';
import { dataStatusForLedgerIds } from '../../data-status';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, mul, q } from '../../units';
import type { Quantity } from '../../units';
import { validate } from './guards';
import type { ValidInputs } from './guards';
import { meta } from './meta';

export interface Inputs {
  /**
   * The hole diameter as entered; what it means is set by `diameterBasis`. (The key keeps its original name for compatibility:
   * with basis 'drill' it holds the DRILL diameter.)
   */
  finishedHoleDiameter: Quantity;
  /** 'finished' (inside the plating) or 'drill': required at run time, never defaulted (optional in the type only so older callers still compile; they get an error). */
  diameterBasis?: 'finished' | 'drill' | undefined;
  /** Barrel plating thickness: required, never pre-filled. */
  platingThickness: Quantity;
  /** Barrel length: board thickness for a through via, or the span for a blind or buried via. */
  barrelLength: Quantity;
  /** Number of identical vias in parallel, a whole number of at least 1. */
  count: number;
  /** Copper thermal conductivity choice (S-007, CONFLICT): required, no default. */
  kMaterial: CopperKMaterial;
  /** Fill choice: required, no default. */
  fill: 'none' | 'filled';
  /** Fill thermal conductivity from the fill material datasheet: required when filled, forbidden otherwise. */
  fillConductivity?: Quantity;
  /** Heat the user says flows through the vias; enables the temperature difference. */
  power?: Quantity;
  /** Where the plating value came from. 'fab-profile-average' marks a fabricator AVERAGE (S-019m); default 'user'. */
  platingSource?: 'user' | 'fab-profile-average';
}

const RECOMMENDATION =
  'This is a one-dimensional conduction estimate for the barrel (and fill) only. It is not a design constant and not a package metric: treat it as usually a lower bound on the real thermal resistance (not assured: see the 1-D warning), and confirm with the thermal path of your own board (receiving copper, planes, package, airflow) or with measurement or simulation.';
const ONE_D_TEXT =
  'One-dimensional estimate. It covers conduction along the barrels (and fill) only. It excludes spreading in the pads and planes, the package, solder, interface and convection. Published FEA found the 1-D model UNDERESTIMATES the thermal resistance (by up to 27 % in one case, ledger S-041c), so the real resistance is usually higher and this value is usually a lower bound. This is not assured: the dielectric between the vias is also ignored, which OVERSTATES theta for sparse arrays under a large pad or on a high-conductivity laminate.';
const RECEIVING_TEXT =
  'The heat needs somewhere to go. A via array without a receiving copper area or plane has little effect (Brooks and Adam 2024), while application notes recommend thermal vias. The sources disagree on how useful thermal vias are (ledger S-041c, CONFLICT); this calculator takes no side.';
const BULK_K_TEXT =
  'The thermal conductivity of plated barrel copper was not found (ledger S-041d); the value used is the bulk copper value you selected (S-007, CONFLICT). A higher k gives a lower theta, which is the non-conservative side.';
const IDEAL_TEXT =
  'theta/N assumes every via sees the same top and bottom temperature and identical geometry. This is the ideal parallel combination (S-041b); dielectric between the vias is ignored (this overstates theta, the opposite direction to the spreading effect).';
const SHARING_TEXT =
  'More vias give diminishing returns: the array rarely reaches theta/N because heat spreads into the pads and planes unevenly (S-041b, S-041c). Treat theta/N as the ideal, not the expected value.';
const JA_TEXT =
  'This is not theta-JA or theta-JC. Package thermal metrics from JEDEC test boards describe the package on that test board and are not a design constant (ledger S-040); nothing here derives or replaces them.';
const FAB_AVG_TEXT =
  'The plating thickness is a fabricator AVERAGE, not a minimum (ledger S-019m): thin spots are thinner, so theta at the thinnest spot is higher than shown.';
const FILL_TEXT =
  'The fill is assumed void-free and in full contact with the barrel wall; the thin copper cap of a via-in-pad is not modelled (ledger S-041a, derived). The fill conductivity is your datasheet value; no fill value is built in.';
const PLATING_TEXT =
  'The plating thickness is at or above the finished hole diameter. The formula stays valid for a finished hole d, but check the units and whether you entered the drill diameter or the plating thickness in the wrong field.';
const RISE_TEXT =
  'The temperature difference is theta x P for the power you entered, assuming all of that power flows through the vias between two isothermal copper areas. It is a lower bound on the real rise across the heat path, not a junction or board temperature.';

const RELIEF_TEXT =
  'Not modelled: thermal-relief spokes or any non-solid connection of the vias to the pad and the receiving plane usually dominate the real behaviour. Check the plane connect style in your CAD rules; this result assumes a solid connection.';

const num = (x: number): string => String(Number(x.toPrecision(4)));

/** Thrown for a value outside the representable or modelled range; mapped to OUT_OF_DOMAIN by compute. */
class RangeFailure extends Error {}

function positive(n: number, what: string): number {
  if (!Number.isFinite(n) || n <= 0) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

const ALL = [...meta.reference.ledgerIds];
/** S-041a only when filled, S-019d only with a power, S-019m only for a fab average and S-015 only for a user plating value (each is cited only then). */
const idsFor = (filled: boolean, power: boolean, fabAvg: boolean): string[] =>
  ALL.filter((id) => (filled || id !== 'S-041a') && (power || id !== 'S-019d') && (fabAvg || id !== 'S-019m') && (!fabAvg || id !== 'S-015'));
const STATUS: Record<string, ReturnType<typeof dataStatusForLedgerIds>> = {};
for (const f of [false, true]) for (const p of [false, true]) for (const a of [false, true]) STATUS[`${String(f)}${String(p)}${String(a)}`] = dataStatusForLedgerIds(idsFor(f, p, a));

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp: ValidInputs = v.value;
  const N = inp.count;
  const d = inp.finishedHoleDiameter.si;
  const drill = inp.diameterBasis === 'drill';
  const t = inp.platingThickness.si;
  const L = inp.barrelLength.si;
  const filled = inp.fill === 'filled';
  const k = copperThermalConductivity(inp.kMaterial);

  const areaOne = positive(Math.PI * t * (d + t), 'Barrel copper area');
  const thetaBarrel = positive(L / (k.value.si * areaOne), 'Barrel thermal resistance');
  let areaCore: number | undefined;
  let thetaCore: number | undefined;
  let thetaOne = thetaBarrel;
  if (inp.fillConductivity !== undefined) {
    areaCore = positive((Math.PI * d * d) / 4, 'Core area');
    thetaCore = positive(L / (inp.fillConductivity.si * areaCore), 'Fill core thermal resistance');
    thetaOne = positive(1 / (1 / thetaBarrel + 1 / thetaCore), 'Thermal resistance of one filled via');
  }
  const thetaArray = positive(thetaOne / N, 'Thermal resistance of the array');
  const dT = inp.power !== undefined ? mul(q(thetaArray, DIM.THERMAL_RESISTANCE), inp.power) : undefined;
  if (dT !== undefined) positive(dT.si, 'Temperature difference');

  const fabAvg = inp.platingSource === 'fab-profile-average';
  const inputs: CalcInput[] = [
    {
      name: 'hole diameter as entered',
      value: inp.enteredDiameter,
      source: 'user',
      sourceDetail: drill ? 'diameter basis: DRILL (finished hole = D - 2t)' : 'diameter basis: FINISHED (inside the plating)',
    },
    fabAvg
      ? { name: 'plating thickness', value: inp.platingThickness, source: 'fab-profile', sourceDetail: 'fab profile holePlatingAverage: a fabricator AVERAGE, not a minimum (S-019m)' }
      : { name: 'plating thickness', value: inp.platingThickness, source: 'user' },
    { name: 'barrel length', value: inp.barrelLength, source: 'user' },
    { name: 'via count', value: q(N, DIM.DIMENSIONLESS), source: 'user' },
  ];
  if (inp.fillConductivity !== undefined) inputs.push({ name: 'fill thermal conductivity', value: inp.fillConductivity, source: 'user' });
  if (inp.power !== undefined) inputs.push({ name: 'power through the vias', value: inp.power, source: 'user' });

  const steps: CalcResult['steps'] = [
    ...(drill ? [{ label: 'Finished hole diameter from the drill', expr: 'd = D - 2t, D = drill diameter as entered (S-041 drill form A = pi t (D - t))', value: inp.finishedHoleDiameter }] : []),
    { label: 'Barrel copper area (one via)', expr: 'A = pi x t x (d + t), d = finished hole diameter', value: q(areaOne, DIM.AREA), bound: 'nominal' },
    { label: 'Barrel thermal resistance (one via)', expr: 'theta_barrel = L / (k x A)', value: q(thetaBarrel, DIM.THERMAL_RESISTANCE), bound: 'prediction' },
  ];
  if (areaCore !== undefined && thetaCore !== undefined) {
    steps.push({ label: 'Core area (one via)', expr: 'A_core = pi x d^2 / 4', value: q(areaCore, DIM.AREA), bound: 'nominal' });
    steps.push({ label: 'Fill core thermal resistance (one via)', expr: 'theta_core = L / (k_fill x A_core)', value: q(thetaCore, DIM.THERMAL_RESISTANCE), bound: 'prediction' });
    steps.push({ label: 'One via, barrel and core in parallel', expr: 'theta_via = 1 / (1/theta_barrel + 1/theta_core)', value: q(thetaOne, DIM.THERMAL_RESISTANCE), bound: 'prediction' });
  }
  steps.push({ label: 'Via array (ideal parallel)', expr: 'theta_array = theta_via / N', value: q(thetaArray, DIM.THERMAL_RESISTANCE), bound: 'prediction' });
  if (dT !== undefined) steps.push({ label: 'Temperature difference across the array', expr: 'dT = theta_array x P', value: dT, bound: 'prediction' });

  const ARRAY_NAME = 'thermal resistance of the via array (1-D conduction estimate, ideal parallel)';
  const results: CalcResult['results'] = [
    { name: ARRAY_NAME, value: q(thetaArray, DIM.THERMAL_RESISTANCE), role: 'primary', bound: 'prediction' },
    { name: 'thermal resistance of one via', value: q(thetaOne, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'prediction' },
    { name: 'barrel thermal resistance (one via)', value: q(thetaBarrel, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'prediction' },
    { name: 'barrel copper area (one via)', value: q(areaOne, DIM.AREA), role: 'secondary', bound: 'nominal' },
    {
      name: 'finished hole diameter used in the calculation',
      value: inp.finishedHoleDiameter,
      role: 'secondary',
      bound: 'nominal',
      note: drill ? 'derived from the entered DRILL diameter as D - 2t' : 'as entered (finished basis)',
    },
  ];
  if (thetaCore !== undefined) results.push({ name: 'fill core thermal resistance (one via)', value: q(thetaCore, DIM.THERMAL_RESISTANCE), role: 'secondary', bound: 'prediction' });
  if (dT !== undefined) results.push({ name: 'temperature difference across the array for the given power', value: dT, role: 'secondary', bound: 'prediction' });
  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);

  const platingOk = t < d;
  const validityChecks: CalcResult['validityChecks'] = [
    {
      name: 'plating thickness below the finished hole diameter',
      ok: platingOk,
      detail: `Plausibility check, not a standard. Plating ${num(t * 1e6)} um, finished hole ${num(d * 1e6)} um.`,
    },
  ];
  const outOfRange: OutOfRangeInput[] = [];
  if (!platingOk) outOfRange.push({ name: 'plating thickness', value: `${num(t * 1e6)} um`, bound: `below the finished hole diameter ${num(d * 1e6)} um` });

  const warnings: CalcWarning[] = [
    { severity: 'warning', message: ONE_D_TEXT, code: 'ONE_D_ESTIMATE' },
    { severity: 'caution', message: RECEIVING_TEXT, code: 'RECEIVING_COPPER_CONFLICT' },
    { severity: 'caution', message: BULK_K_TEXT, code: 'BULK_COPPER_K' },
    { severity: 'info', message: IDEAL_TEXT, code: 'IDEAL_PARALLEL' },
    { severity: 'info', message: JA_TEXT, code: 'NOT_THETA_JA' },
    { severity: 'warning', message: RELIEF_TEXT, code: 'THERMAL_RELIEF_NOT_MODELLED' },
  ];
  if (N > 1) warnings.push({ severity: 'caution', message: SHARING_TEXT, code: 'EQUAL_SHARING' });
  if (fabAvg) warnings.push({ severity: 'caution', message: FAB_AVG_TEXT, code: 'FAB_AVERAGE_PLATING' });
  if (filled) warnings.push({ severity: 'caution', message: FILL_TEXT, code: 'FILL_ASSUMED_VOID_FREE' });
  if (!platingOk) warnings.push({ severity: 'warning', message: PLATING_TEXT, code: 'PLATING_EXCEEDS_HOLE' });
  if (dT !== undefined) warnings.push({ severity: 'caution', message: RISE_TEXT, code: 'RISE_IS_LOWER_BOUND' });

  const assumptions: string[] = [
    'This is a 1-D conduction estimate: it ignores spreading in the pads and planes, the package, solder, interface and convection, and it is not a design constant.',
    drill
      ? 'The entered diameter is the DRILL diameter D; the finished (inside) hole is d = D - 2t and the barrel is a copper annulus of inside diameter d and wall t, area pi t (D - t) (S-041 drill form). The fill core uses d.'
      : 'd is the FINISHED (inside) hole diameter after plating, not the drill diameter; the barrel is a copper annulus of inside diameter d and wall t.',
    fabAvg
      ? 'Plating thickness comes from a fabricator AVERAGE (ledger S-019m); it is never pre-filled and it is not a minimum.'
      : 'Plating thickness is a required user input and is never pre-filled; published fabricator and class values differ (ledger S-015, PAYWALLED-USER-MUST-VERIFY).',
    `Thermal conductivity material: ${inp.kMaterial}, chosen by the user (no default). ${k.assumption} Status: ${k.status}. Plated barrel copper conductivity was not found (S-041d).`,
    filled
      ? 'Filled via: the core cylinder of the finished hole conducts in parallel with the barrel using your fill conductivity (ledger S-041a, derived); void-free, full contact.'
      : 'Unfilled via: only the barrel wall conducts; air in the hole is ignored.',
    N > 1 ? `${String(N)} identical vias between the same two isothermal copper areas: theta/N is the ideal (see the diminishing-returns caution).` : 'A single via.',
    ...(dT !== undefined ? ['The temperature difference assumes all of the power you entered flows through the vias; it is not a junction or board temperature.'] : []),
  ];

  const status = STATUS[`${String(filled)}${String(inp.power !== undefined)}${String(fabAvg)}`] as CalcResult['dataStatus'];
  const confidence = rateConfidence(confidenceFactorsFromInputs({ inputs, outOfRange, accuracyClass: meta.accuracyClass, dataStatus: status }));

  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: idsFor(filled, inp.power !== undefined, fabAvg) },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus: status,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) {
    const error: CalcError = { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
    return { ok: false, error };
  }
  return { ok: true, value: result };
}

/** Thermal via array 1-D conduction estimate. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
