import type { CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { EllipticDomainError } from '../../math/elliptic';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { GROUND_WIDTH_MESSAGE, Z_CPWG_PREFACTOR_OHM, commonCoplanarWarnings, coplanarInputEchoes, cpwgModel, domainFailure, num, resolveGeometry, safeZ0 } from '../cpw-shared';
import type { CoplanarInputs } from '../cpw-shared';
import { COPLANAR_OUTPUTS, COPLANAR_SOLVE, coplanarFields } from '../cpw-shared';
import { runEnvelope } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, delayOutputs, dimensionless } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { hasTolerances } from '../tolerance-shared';
import { validate } from './guards';
import { meta } from './meta';

export type Inputs = CoplanarInputs;
export { cpwgModel } from '../cpw-shared';

const UNVERIFIED_MESSAGE =
  'The conductor-backed CPW model (ledger S-023a) is PAYWALLED-USER-MUST-VERIFY: the Ghione-Naldi paper was not read, the equations come from one tier-4 transcription (Qucs technical documentation §12), and no published worked example exists. The k3 argument follows Qucs, KiCad\'s citation and US 7,202,765; one calculator page (NextPCB) prints it with a factor of 2 different, and that form is not used. Treat the numbers as an estimate and confirm them with the fabricator.';
const STITCHING_MESSAGE =
  'Stitching vias are not modelled: the equations assume the coplanar top grounds are tied to the lower ground plane and extend far enough, and no via-fence or via-spacing effect is included. This result makes no statement about whether the grounding is adequate; unstitched or sparsely stitched top grounds float and change Z0 and eps_e by an amount this model does not give.';

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const h = inp.height.si;
  const er = inp.er;

  const sol = resolveGeometry(inp.geometry, (w, s) => safeZ0(cpwgModel, w, s, h, er), er);
  if (!sol.ok) return sol.outcome;
  const { w, s } = sol;
  if (!Number.isFinite(w) || !Number.isFinite(s) || !(w > 0) || !(s > 0)) {
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', field: 'width', message: 'width and gap must be finite and positive (check the units).' } };
  }
  let m: ReturnType<typeof cpwgModel>;
  try {
    m = cpwgModel(w, s, h, er);
  } catch (e) {
    if (e instanceof EllipticDomainError) return domainFailure(e);
    throw e;
  }
  if (![m.z0, m.epsEff, m.ratioK, m.ratioK3, m.q].every(Number.isFinite) || !(m.z0 > 0) || !(m.epsEff >= 1)) {
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', field: 'width', message: 'The model gave a non-finite or non-physical value for these inputs (check the units).' } };
  }

  const dl = dimensionless;
  const ohms = (x: number): Quantity => q(x, DIM.RESISTANCE);
  const inputs = coplanarInputEchoes(inp, dl(er));

  const steps: CalcResult['steps'] = [
    { label: 'Modulus k', expr: 'k = W / (W + 2 s)', value: dl(m.k) },
    { label: "Complementary modulus k'", expr: "k' = sqrt(1 - k^2) = 2 sqrt(s (W + s)) / (W + 2 s)", value: dl(m.kp) },
    { label: "Elliptic ratio K(k)/K(k')", expr: "K(k)/K(k') = M(1, k) / M(1, k') (AGM, ledger S-023b)", value: dl(m.ratioK) },
    { label: 'Substrate argument a', expr: 'a = pi W / (4 h)', value: dl(m.a) },
    { label: 'Substrate argument b', expr: 'b = pi (W + 2 s) / (4 h)', value: dl(m.b) },
    { label: 'Modulus k3', expr: 'k3 = tanh(a) / tanh(b)', value: dl(m.k3) },
    { label: "Complementary modulus k3'", expr: "k3' = sqrt(1 - k3^2)", value: dl(m.k3p) },
    { label: "Elliptic ratio K(k3)/K(k3')", expr: "K(k3)/K(k3') = M(1, k3) / M(1, k3')", value: dl(m.ratioK3) },
    { label: 'Filling factor q', expr: "q = [K(k3)/K(k3')] / ( K(k)/K(k') + K(k3)/K(k3') )", value: dl(m.q) },
    { label: 'Effective permittivity', expr: 'eps_e = 1 + q (er - 1)', value: dl(m.epsEff) },
    { label: 'Characteristic impedance', expr: "Z0 = (eta0/2) / sqrt(eps_e) / ( K(k)/K(k') + K(k3)/K(k3') )", value: ohms(m.z0) },
  ];
  if (sol.solved !== null) steps.push({ label: 'Solver bracket', expr: sol.bracketNote, value: dl(sol.solved === 'gap' ? s / w : w / s) });

  const delay = delayOutputs(m.epsEff, inp.common);
  steps.push(...delay.steps);

  const results: CalcResult['results'] = [];
  if (sol.solved === 'gap') {
    results.push({ name: 'gap for target Z0', value: q(s, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'characteristic impedance Z0', value: ohms(m.z0), role: 'secondary', bound: 'nominal' });
  } else if (sol.solved === 'width') {
    results.push({ name: 'trace width for target Z0', value: q(w, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'characteristic impedance Z0', value: ohms(m.z0), role: 'secondary', bound: 'nominal' });
  } else {
    results.push({ name: 'characteristic impedance Z0', value: ohms(m.z0), role: 'primary', bound: 'nominal' });
  }
  results.push(
    { name: 'effective permittivity', value: dl(m.epsEff), role: 'secondary', bound: 'nominal' },
    { name: 'modulus k = W/(W + 2 s)', value: dl(m.k), role: 'secondary', bound: 'nominal' },
    { name: 'modulus k3', value: dl(m.k3), role: 'secondary', bound: 'nominal' },
    { name: 'filling factor q', value: dl(m.q), role: 'secondary', bound: 'nominal' },
    ...delay.results,
  );

  // Validity: no numeric range is recorded for S-023a, so none is enforced or invented; the domain (0 < k, k3 <= 1) is a hard error above.
  const validityChecks: CalcResult['validityChecks'] = [
    {
      name: 'moduli k and k3 inside (0, 1]',
      ok: true,
      detail: `k = ${num(m.k)}, k3 = ${num(m.k3)}: both are inside the domain of K (a value outside is refused as OUT_OF_DOMAIN, never extrapolated).`,
    },
    {
      name: 'validity range of the model',
      ok: true,
      detail: `No numeric validity range is recorded for the Ghione-Naldi form (ledger S-023a: only the Qucs transcription was read), so none is enforced; informational: h/(W + 2 s) = ${num(h / (w + 2 * s))}, W/h = ${num(w / h)}, s/h = ${num(s / h)}. The confidence reflects the PAYWALLED status instead.`,
    },
  ];
  const outOfRange: never[] = [];
  const warnings: CalcWarning[] = [
    ...commonCoplanarWarnings(inp.common.frequency, inp.thickness),
    { severity: 'caution', message: STITCHING_MESSAGE, code: 'STITCHING_VIAS_NOT_MODELLED' },
    { severity: 'caution', message: GROUND_WIDTH_MESSAGE, code: 'COPLANAR_GROUND_WIDTH_ASSUMED' },
    { severity: 'warning', message: UNVERIFIED_MESSAGE, code: 'MODEL_UNVERIFIED' },
    ...delay.warnings,
  ];

  const assumptions = [
    'Conductor-backed coplanar waveguide: a centre strip of width W between two coplanar top grounds, a gap s on each side, on a homogeneous substrate of thickness h over a lower ground plane, air above. The top grounds are assumed wide and tied to the lower plane by stitching vias that are not modelled. Without a lower plane use the CPW calculator.',
    "k3 uses the argument pi W/(4h) and pi (W + 2 s)/(4h) as in Qucs, KiCad's citation and US 7,202,765; the factor-2 form printed by one calculator page is a recorded conflict and is not used (ledger S-023a). K(k) is computed by the arithmetic-geometric mean (ledger S-023b, VERIFIED).",
    `Prefactor eta0/2 = ${Z_CPWG_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (eta0 = mu0 c; decision Q-1), the 60 pi of the sources (188.4956 ohm), which is 0.07 % lower. As the substrate thickens (h tending to infinity) the model tends to the infinite-substrate CPW, eps_e = (er + 1)/2.`,
    'No accuracy figure and no validity range are recorded for this form (the primary paper was not read), so none is stated; the PAYWALLED-USER-MUST-VERIFY status is shown and counted in the confidence.',
    'Zero strip thickness, no dispersion, no soldermask; copper roughness, etch profile (trapezoid sidewalls) and dielectric loss are not modelled; er is the value you entered at your own frequency and has not been checked against the fabricator.',
    ...delay.assumptions,
  ];

  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds, ...extraLedgerIds];
  const loss = lossBlock({ common: inp.common, er, modes: [{ suffix: '', epsEff: m.epsEff }], conductor: { kind: 'not-modelled', geometry: 'conductor-backed coplanar waveguide' } });
  const lossDefaults = mergeLoss(loss, { inputs, steps, results, validityChecks, warnings, outOfRange, assumptions, ledgerIds });
  return assemble({
    method: meta.method,
    standard: meta.reference.standard,
    edition: meta.reference.edition,
    formula: meta.formula,
    accuracyClass: meta.accuracyClass,
    ledgerIds,
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    outOfRange,
    defaultedExtra: lossDefaults,
  });
}

/** Nominal result plus the tolerance envelope and sensitivities (core D). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields: coplanarFields(v.value), outputs: COPLANAR_OUTPUTS, solve: COPLANAR_SOLVE });
}

/** CPWG Z0, eps_e, delay and guided wavelength, or the gap / width for a target Z0. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
