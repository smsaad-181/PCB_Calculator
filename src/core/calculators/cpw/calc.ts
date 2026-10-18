import type { OutOfRangeInput } from '../../confidence';
import type { CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { EllipticDomainError } from '../../math/elliptic';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { Z_CPW_PREFACTOR_OHM, commonCoplanarWarnings, coplanarInputEchoes, cpwModel, domainFailure, resolveGeometry, safeZ0, substrateCheck, GROUND_WIDTH_MESSAGE, num } from '../cpw-shared';
import type { CoplanarInputs } from '../cpw-shared';
import { COPLANAR_OUTPUTS, COPLANAR_SOLVE, coplanarFields } from '../cpw-shared';
import { runEnvelope } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, delayOutputs, dimensionless } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { withProfileMinimum } from '../profile-minimum';
import type { MinimumSpec } from '../profile-minimum';
import { hasTolerances } from '../tolerance-shared';
import { validate } from './guards';
import { meta } from './meta';

export type Inputs = CoplanarInputs;
export { cpwModel } from '../cpw-shared';

const CONFLICT_MESSAGE =
  'The effective-permittivity model for CPW is in CONFLICT between the sources read (ledger S-023): this result uses the conformal-map finite-substrate form (decision Q-6); Steer gives a different, empirical eps_e fit (accurate to 1.5 % for h/s >= 1, log base not stated) that is NOT implemented, and the primary papers were not read. The two differ by about 0.7 % in eps_e (6.24 against 6.28) in the one case compared (Steer geometry W 500 um, s 200 um, h 500 um, er 12.85). Treat the numbers as an estimate.';

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const h = inp.height.si;
  const er = inp.er;

  const sol = resolveGeometry(inp.geometry, (w, s) => safeZ0(cpwModel, w, s, h, er), er);
  if (!sol.ok) return sol.outcome;
  const { w, s } = sol;
  if (!Number.isFinite(w) || !Number.isFinite(s) || !(w > 0) || !(s > 0)) {
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', field: 'width', message: 'width and gap must be finite and positive (check the units).' } };
  }
  let m: ReturnType<typeof cpwModel>;
  try {
    m = cpwModel(w, s, h, er);
  } catch (e) {
    if (e instanceof EllipticDomainError) return domainFailure(e);
    throw e;
  }
  if (![m.z0, m.epsEff, m.rk, m.rk1].every(Number.isFinite) || !(m.z0 > 0) || !(m.epsEff >= 1)) {
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', field: 'width', message: 'The model gave a non-finite or non-physical value for these inputs (check the units).' } };
  }

  const dl = dimensionless;
  const ohms = (x: number): Quantity => q(x, DIM.RESISTANCE);
  const inputs = coplanarInputEchoes(inp, dl(er));

  const steps: CalcResult['steps'] = [
    { label: 'Modulus k', expr: 'k = W / (W + 2 s)', value: dl(m.k) },
    { label: "Complementary modulus k'", expr: "k' = sqrt(1 - k^2) = 2 sqrt(s (W + s)) / (W + 2 s)", value: dl(m.kp) },
    { label: "Elliptic ratio K(k')/K(k)", expr: "K(k')/K(k) = M(1, k') / M(1, k) (AGM, ledger S-023b)", value: dl(m.rk) },
    { label: 'Substrate argument a', expr: 'a = pi W / (4 h)', value: dl(m.a) },
    { label: 'Substrate argument b', expr: 'b = pi (W + 2 s) / (4 h)', value: dl(m.b) },
    { label: 'Modulus k1', expr: 'k1 = sinh(a) / sinh(b)', value: dl(m.k1) },
    { label: "Complementary modulus k1'", expr: "k1' = sqrt(1 - k1^2)", value: dl(m.k1p) },
    { label: "Elliptic ratio K(k1')/K(k1)", expr: "K(k1')/K(k1) = M(1, k1') / M(1, k1)", value: dl(m.rk1) },
    { label: 'Effective permittivity', expr: "eps_e = 1 + (er - 1)/2 x [K(k1)/K(k1')] x [K(k')/K(k)]", value: dl(m.epsEff) },
    { label: 'Characteristic impedance', expr: "Z0 = (eta0/4) / sqrt(eps_e) x K(k')/K(k)", value: ohms(m.z0) },
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
    { name: 'substrate thickness over max(W, s)', value: dl(h / Math.max(w, s)), role: 'secondary', bound: 'nominal' },
    ...delay.results,
  );

  // Validity: Steer's substrate-thickness guidance (a failed check also forces the confidence to low). k outside (0, 1) is a hard error above.
  const outOfRange: OutOfRangeInput[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const warnings: CalcWarning[] = [];
  const sub = substrateCheck(w, s, h, meta.validity.hOverMaxMin, meta.validity.hOverMaxComfort);
  validityChecks.push(sub.check);
  if (sub.outOfRange !== undefined) {
    outOfRange.push(sub.outOfRange);
    warnings.push({ severity: 'warning', message: `Outside the model's recorded validity range: ${sub.check.name} fails (${sub.check.detail}) The result is an extrapolation; treat it as low confidence.`, code: 'OUT_OF_RANGE' });
  }
  if (sub.marginal) {
    warnings.push({ severity: 'caution', message: `The substrate is between two and three times max(W, s) (h/max(W, s) = ${num(h / Math.max(w, s))}): inside the enforced limit but below the upper figure of Steer's guidance (ledger S-023).`, code: 'SUBSTRATE_THICKNESS_MARGINAL' });
  }
  validityChecks.push({
    name: 'modulus k inside (0, 1)',
    ok: true,
    detail: `k = ${num(m.k)}, k1 = ${num(m.k1)}: both elliptic moduli are inside 0 < k < 1, the domain of K (a value outside is refused as OUT_OF_DOMAIN, never extrapolated). No range of W/s or er is recorded for the conformal map, so none is enforced.`,
  });

  warnings.unshift(...commonCoplanarWarnings(inp.common.frequency, inp.thickness));
  warnings.push(
    { severity: 'caution', message: GROUND_WIDTH_MESSAGE, code: 'COPLANAR_GROUND_WIDTH_ASSUMED' },
    { severity: 'warning', message: CONFLICT_MESSAGE, code: 'MODEL_CONFLICT' },
    ...delay.warnings,
  );

  const assumptions = [
    'Coplanar waveguide with no lower ground plane: a centre strip of width W between two coplanar grounds, a gap s on each side, on a homogeneous substrate of thickness h with air above and below. A line over a lower ground plane (conductor-backed CPW) is the separate CPWG calculator.',
    'Effective permittivity by the conformal-map finite-substrate form (ledger S-023, decision Q-6), not by the empirical fit of Steer; the two are the S-023 conflict. K(k) is computed by the arithmetic-geometric mean (ledger S-023b, VERIFIED), with K(k1)/K(k1\') and K(k\')/K(k) taken from the AGM directly.',
    `Prefactor eta0/4 = ${Z_CPW_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (eta0 = mu0 c; decision Q-1), the 30 pi of the sources (94.2478 ohm), which is 0.07 % lower.`,
    'No accuracy figure is recorded for the conformal-map eps_e (the 1.5 % of Steer belongs to the empirical fit that is not used), so none is stated; the primary papers (Gevorgian 1995, Wen 1969, Ghione and Naldi) were not read.',
    'The coplanar grounds are taken as wide (the ground width is not an input; Steer records that w1 of at least 3 W is close to the ideal CPW).',
    'Zero strip thickness, no dispersion, no soldermask; copper roughness, etch profile (trapezoid sidewalls) and dielectric loss are not modelled; er is the value you entered at your own frequency and has not been checked against the fabricator.',
    ...delay.assumptions,
  ];

  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds, ...extraLedgerIds];
  const loss = lossBlock({ common: inp.common, er, modes: [{ suffix: '', epsEff: m.epsEff }], conductor: { kind: 'not-modelled', geometry: 'coplanar waveguide' } });
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

/** Optional fab-profile minimum check (PCB2-4): the widths and spacings this calculator solves for or is given. */
const MINIMUM_SPECS: readonly MinimumSpec[] = [
  { key: 'traceWidth', label: 'trace width', input: 'width', solvedResult: 'trace width for target Z0' },
  { key: 'traceSpace', label: 'gap', input: 'gap', solvedResult: 'gap for target Z0' },
];

/** CPW Z0, eps_e, delay and guided wavelength, or the gap / width for a target Z0. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return withProfileMinimum(hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs), inputs, MINIMUM_SPECS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
