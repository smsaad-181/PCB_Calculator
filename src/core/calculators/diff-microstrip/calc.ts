import type { OutOfRangeInput } from '../../confidence';
import { ETA0_OHM } from '../../data/constants';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { brent } from '../../solvers/rootfind';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { FINITE_THICKNESS_MESSAGE, SOLVE_CAUTION, dispersionMessageCoupled, evenModeDelay, num, suffixDelay } from '../diff-shared';
import { impField, runEnvelope, solvedMessage, unusedMessage } from '../impedance-envelope';
import type { EnvelopeInputs, ImpField } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, commonInputEchoes, delayOutputs, dimensionless, rangeCheck } from '../impedance-shared';
import type { LossInputs } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { hasTolerances } from '../tolerance-shared';
import type { OutputPlan } from '../tolerance-shared';
import { epsEffZeroThickness, hjA, hjB, z01, z0ZeroThickness } from '../microstrip/calc';
import { validate } from './guards';
import { CJ, meta } from './meta';

/**
 * Public input shape. Lengths are Quantities; er is a dimensionless Quantity; targetZdiff is a resistance.
 * Analysis: width and edgeSpacing. Spacing solve: targetZdiff and width. Width solve: targetZdiff and edgeSpacing.
 * height is the dielectric height h to the reference plane; edgeSpacing is the edge-to-edge gap s of the pair.
 */
export interface Inputs extends LossInputs, EnvelopeInputs {
  width?: Quantity;
  edgeSpacing?: Quantity;
  targetZdiff?: Quantity;
  height: Quantity;
  er: Quantity;
  thickness?: Quantity;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

/** Every intermediate of the S-022 equations, so the UI steps and the tests can show and check them. */
export interface CoupledModes {
  readonly a: number;
  readonly b: number;
  readonly z01: number;
  readonly psi: number;
  readonly alpha: number;
  readonly m: number;
  readonly mu: number;
  readonly phi: number;
  readonly phiE: number;
  readonly theta: number;
  readonly beta: number;
  readonly n: number;
  readonly phiO: number;
  readonly p: number;
  readonly q: number;
  readonly r: number;
  readonly fo1: number;
  readonly fo: number;
  readonly eeE: number;
  readonly eeO: number;
  readonly z01e: number;
  readonly z01o: number;
  readonly z0e: number;
  readonly z0o: number;
}

/**
 * Even and odd mode impedance and effective permittivity of a coupled microstrip pair (S-022), u = w/h, g = s/h.
 * Pure arithmetic: out-of-domain inputs give NaN or Infinity members, which the caller checks (never emitted as a result).
 */
export function coupledModes(u: number, g: number, er: number): CoupledModes {
  const a = hjA(u);
  const b = hjB(er);
  const z01v = z01(u);
  const lnU = Math.log(u);
  const psi = 1 + g / CJ.psi.a + g ** CJ.psi.b / CJ.psi.c;
  const alpha = CJ.alpha.c * Math.exp(-g);
  const m = CJ.m.c0 + (CJ.m.k + (CJ.m.r / g) ** CJ.m.rp) ** CJ.m.pw + Math.log(g ** CJ.m.p / (1 + (g / CJ.m.gc) ** CJ.m.p)) / CJ.m.d;
  const mu = g * Math.exp(-g) + (u * (CJ.mu.a + g * g)) / (CJ.mu.b + g * g);
  const phi = CJ.phi.c * u ** CJ.phi.e;
  const phiE = phi / (psi * (alpha * u ** m + (1 - alpha) * u ** -m));
  const theta = CJ.theta.c0 + CJ.theta.c1 * Math.log(1 + CJ.theta.k / (g + CJ.theta.a * g ** CJ.theta.e));
  const beta =
    CJ.beta.c0 + Math.log(g ** CJ.beta.p / (1 + (g / CJ.beta.gc) ** CJ.beta.p)) / CJ.beta.d1 + Math.log(1 + CJ.beta.k * g ** CJ.beta.e) / CJ.beta.d2;
  const n =
    (1 / CJ.n.d + Math.exp(-CJ.n.c - CJ.n.l * Math.log(g) - (g / CJ.n.g0) ** CJ.n.p)) *
    Math.log((CJ.n.k1 + CJ.n.k2 * g * g) / (1 + CJ.n.k3 * g ** CJ.n.e));
  const phiO = phiE - (theta / psi) * Math.exp(beta * u ** n * lnU);
  const p = Math.exp(-CJ.p.a * g ** CJ.p.e) / Math.cosh(g ** CJ.p.h);
  const r = 1 + CJ.r.k * (1 - Math.exp(1 - (er - 1) ** 2 / CJ.r.d) / (1 + g ** CJ.r.ge));
  const fo1 = 1 - Math.exp(-CJ.fo1.a * g ** CJ.fo1.e - (CJ.fo1.b * g ** r) / Math.log(Math.E + (g / CJ.fo1.g0) ** CJ.fo1.ge));
  const qq = Math.exp(-CJ.q.a - g);
  const fo = fo1 * Math.exp(p * lnU + qq * Math.sin((Math.PI * lnU) / Math.LN10));
  const eeE = (er + 1) / 2 + ((er - 1) / 2) * (1 + CJ.ten / mu) ** -(a * b);
  const eeO = (er + 1) / 2 + ((er - 1) / 2) * fo * (1 + CJ.ten / u) ** -(a * b);
  const z01e = z01v / (1 - (z01v * phiE) / ETA0_OHM);
  const z01o = z01v / (1 - (z01v * phiO) / ETA0_OHM);
  return { a, b, z01: z01v, psi, alpha, m, mu, phi, phiE, theta, beta, n, phiO, p, q: qq, r, fo1, fo, eeE, eeO, z01e, z01o, z0e: z01e / Math.sqrt(eeE), z0o: z01o / Math.sqrt(eeO) };
}

function physical(m: CoupledModes): boolean {
  return [m.z0e, m.z0o, m.eeE, m.eeO].every(Number.isFinite) && m.z0e > 0 && m.z0o > 0 && m.eeE >= 1 && m.eeO >= 1;
}

const SOLDERMASK_MESSAGE =
  'Soldermask and any coating over the traces are not modelled (no coating correction); with mask over the pair the real even- and odd-mode impedances are lower and eps_e higher than this bare-trace result, and the mask changes the two modes by different amounts.';
const UNVERIFIED_MESSAGE =
  'The coupled-line model (ledger S-022) is PAYWALLED-USER-MUST-VERIFY: only one secondary source (Steer, section 5.6) was read, the 1980 paper was not, no published worked example exists, and the constants are transcriptions awaiting comparison with the paper. Treat the numbers as an estimate and confirm them with the fabricator.';

function failure(code: CalcError['code'], field: string, message: string): CalcOutcome {
  return { ok: false, error: { code, field, message } };
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const geo = inp.geometry;
  const h = inp.height.si;
  const er = inp.er;
  const [uLo, uHi] = meta.validity.uRange;
  const [gLo, gHi] = meta.validity.gSolveRange;
  const zdiffAt = (u: number, g: number): number => 2 * coupledModes(u, g, er).z0o;

  let u: number;
  let g: number;
  let bracketNote = '';
  if (geo.mode === 'analysis') {
    u = (geo.width as Quantity).si / h;
    g = (geo.edgeSpacing as Quantity).si / h;
  } else if (geo.mode === 'solve-spacing') {
    u = (geo.width as Quantity).si / h;
    if (!Number.isFinite(u) || u <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / height is not finite (check the units).');
    const target = (geo.targetZdiff as Quantity).si;
    const zLo = zdiffAt(u, gLo);
    const zHi = zdiffAt(u, gHi);
    if (![zLo, zHi].every((z) => Number.isFinite(z) && z > 0)) return failure('OUT_OF_DOMAIN', 'width', 'The model cannot be evaluated for this width and height (check the units).');
    if (!(target >= zLo && target <= zHi)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZdiff',
        `The target Zdiff ${num(target)} ohm is unreachable for w/h = ${num(u)} and er ${num(er)}: over ${String(gLo)} <= s/h <= ${String(gHi)} (the range in which Zdiff rises monotonically with spacing in this model) Zdiff runs from ${num(zLo)} ohm (s/h = ${String(gLo)}) to ${num(zHi)} ohm (s/h = ${String(gHi)}). The uncoupled limit is 2 * Z0 = ${num(2 * z0ZeroThickness(u, er))} ohm, approached only as the spacing grows; a target at or above it needs a wider gap than this model resolves. Change the width, er or the target.`,
      );
    }
    const s = brent((x: number): number => zdiffAt(u, x) - target, gLo, gHi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZdiff', `The spacing solve did not converge (${s.reason}: ${s.message}).`);
    g = s.x;
    bracketNote = `Bracketed Brent on the S-022 analysis function over ${String(gLo)} <= s/h <= ${String(gHi)} (Zdiff increases with s/h); ${String(s.iterations)} iterations, bracket width ${num(s.bracket[1] - s.bracket[0])}.`;
  } else {
    g = (geo.edgeSpacing as Quantity).si / h;
    if (!Number.isFinite(g) || g <= 0) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'edge spacing / height is not finite (check the units).');
    const target = (geo.targetZdiff as Quantity).si;
    const zAtLo = zdiffAt(uLo, g);
    const zAtHi = zdiffAt(uHi, g);
    if (![zAtLo, zAtHi].every((z) => Number.isFinite(z) && z > 0)) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'The model cannot be evaluated for this spacing and height (check the units).');
    if (!(target <= zAtLo && target >= zAtHi)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZdiff',
        `The target Zdiff ${num(target)} ohm is unreachable for s/h = ${num(g)} and er ${num(er)}: inside the validity range ${String(uLo)} <= w/h <= ${String(uHi)} this model gives Zdiff from ${num(zAtHi)} ohm (w/h = ${String(uHi)}) to ${num(zAtLo)} ohm (w/h = ${String(uLo)}). The target is outside the range the model covers; change the spacing, er or the target.`,
      );
    }
    const s = brent((x: number): number => zdiffAt(x, g) - target, uLo, uHi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZdiff', `The width solve did not converge (${s.reason}: ${s.message}).`);
    u = s.x;
    bracketNote = `Bracketed Brent on the S-022 analysis function over ${String(uLo)} <= w/h <= ${String(uHi)} (Zdiff decreases with w/h); ${String(s.iterations)} iterations, bracket width ${num(s.bracket[1] - s.bracket[0])}.`;
  }
  if (!Number.isFinite(u) || u <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / height is not finite (check the units).');
  if (!Number.isFinite(g) || g <= 0) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'edge spacing / height is not finite (check the units).');

  const mo = coupledModes(u, g, er);
  const z0 = z0ZeroThickness(u, er);
  const eeIso = epsEffZeroThickness(u, er);
  if (!physical(mo) || !Number.isFinite(z0) || !(z0 > 0) || !Number.isFinite(eeIso)) {
    return failure('OUT_OF_DOMAIN', 'width', 'The model gave a non-finite or non-physical value for these inputs (check the units and the ratios w/h and s/h).');
  }
  const zdiff = 2 * mo.z0o; // S-022b
  const zcommon = mo.z0e / 2; // S-022b
  const dl = dimensionless;
  const ohms = (x: number): Quantity => q(x, DIM.RESISTANCE);

  // Inputs with provenance (all user-entered; the labels name where er and the geometry came from).
  const srcDetail = (label: string | undefined): { sourceDetail?: string } => (label === undefined ? {} : { sourceDetail: label });
  const geoLabel = inp.common.geometrySource;
  const inputs: CalcInput[] = [];
  if (geo.width !== undefined) inputs.push({ name: 'width', value: geo.width, source: 'user', ...srcDetail(geoLabel) });
  if (geo.edgeSpacing !== undefined) inputs.push({ name: 'edge spacing', value: geo.edgeSpacing, source: 'user', ...srcDetail(geoLabel) });
  if (geo.targetZdiff !== undefined) inputs.push({ name: 'target Zdiff', value: geo.targetZdiff, source: 'user' });
  inputs.push({ name: 'height', value: inp.height, source: 'user', ...srcDetail(geoLabel) });
  inputs.push({ name: 'er', value: dl(er), source: 'user', ...srcDetail(inp.common.erSource) });
  if (inp.thickness !== undefined) inputs.push({ name: 'thickness', value: inp.thickness, source: 'user', ...srcDetail(geoLabel) });
  inputs.push(...commonInputEchoes(inp.common));

  // Steps: every intermediate of the recorded equations.
  const steps: CalcResult['steps'] = [
    { label: 'Width over height', expr: 'u = w / h', value: dl(u) },
    { label: 'Spacing over height', expr: 'g = s / h', value: dl(g) },
    { label: 'a(u), single line (S-020)', expr: 'a(u) as ledger S-020', value: dl(mo.a) },
    { label: 'b(er), single line (S-020)', expr: 'b(er) as ledger S-020', value: dl(mo.b) },
    { label: 'Air-line impedance', expr: 'Z01(u) = (eta0 / 2 pi) ln[F1/u + sqrt(1 + (2/u)^2)] (S-020)', value: ohms(mo.z01) },
    { label: 'phi(u)', expr: 'phi = 0.8645 u^0.172', value: dl(mo.phi) },
    { label: 'psi(g)', expr: 'psi = 1 + g/1.45 + g^2.09/3.95', value: dl(mo.psi) },
    { label: 'alpha(g)', expr: 'alpha = 0.5 exp(-g)', value: dl(mo.alpha) },
    { label: 'm(g)', expr: 'm = 0.2175 + [4.113 + (20.36/g)^6]^-0.251 + (1/323) ln[g^10/(1 + (g/13.8)^10)]', value: dl(mo.m) },
    { label: 'mu(u,g)', expr: 'mu = g exp(-g) + u (20 + g^2)/(10 + g^2)', value: dl(mo.mu) },
    { label: 'phi_e', expr: 'phi_e = phi / (psi {alpha u^m + (1 - alpha) u^-m})', value: dl(mo.phiE) },
    { label: 'Even-mode effective permittivity', expr: 'eps_ee = (er + 1)/2 + (er - 1)/2 [1 + 10/mu]^(-a b)', value: dl(mo.eeE) },
    { label: 'Even-mode air-line impedance', expr: 'Z01e = Z01 / (1 - Z01 phi_e / eta0)', value: ohms(mo.z01e) },
    { label: 'Even-mode impedance', expr: 'Z0e = Z01e / sqrt(eps_ee)', value: ohms(mo.z0e) },
    { label: 'theta(g)', expr: 'theta = 1.729 + 1.175 ln[1 + 0.627/(g + 0.327 g^2.17)]', value: dl(mo.theta) },
    { label: 'beta(g)', expr: 'beta = 0.2306 + (1/301.8) ln[g^10/(1 + (g/3.73)^10)] + (1/5.3) ln(1 + 0.646 g^1.175)', value: dl(mo.beta) },
    { label: 'n(g)', expr: 'n = {1/17.7 + exp[-6.424 - 0.76 ln g - (g/0.23)^5]} ln[(10 + 68.3 g^2)/(1 + 32.5 g^3.093)]', value: dl(mo.n) },
    { label: 'phi_o', expr: 'phi_o = phi_e - (theta/psi) exp[beta u^n ln u]', value: dl(mo.phiO) },
    { label: 'p(g)', expr: 'p = exp(-0.745 g^0.295) / cosh(g^0.68)', value: dl(mo.p) },
    { label: 'r(g, er)', expr: 'r = 1 + 0.15 {1 - exp[1 - (er - 1)^2/8.2] / (1 + g^-6)}', value: dl(mo.r) },
    { label: 'f_o1(g, er)', expr: 'fo1 = 1 - exp{-0.179 g^0.15 - 0.328 g^r / ln[e + (g/7)^2.8]}', value: dl(mo.fo1) },
    { label: 'q(g)', expr: 'q = exp(-1.366 - g)', value: dl(mo.q) },
    { label: 'f_o', expr: 'fo = fo1 exp[p ln u + q sin(pi ln u / ln 10)]', value: dl(mo.fo) },
    { label: 'Odd-mode effective permittivity', expr: 'eps_eo = (er + 1)/2 + (er - 1)/2 fo [1 + 10/u]^(-a b)', value: dl(mo.eeO) },
    { label: 'Odd-mode air-line impedance', expr: 'Z01o = Z01 / (1 - Z01 phi_o / eta0)', value: ohms(mo.z01o) },
    { label: 'Odd-mode impedance', expr: 'Z0o = Z01o / sqrt(eps_eo)', value: ohms(mo.z0o) },
    { label: 'Differential impedance', expr: 'Zdiff = 2 Zodd (ledger S-022b)', value: ohms(zdiff) },
    { label: 'Common-mode impedance', expr: 'Zcommon = Zeven / 2 (ledger S-022b)', value: ohms(zcommon) },
    { label: 'Isolated single line, same w/h (part A microstrip)', expr: 'Z0 from ledger S-020', value: ohms(z0) },
  ];
  if (geo.mode !== 'analysis') steps.push({ label: 'Solver bracket', expr: bracketNote, value: dl(geo.mode === 'solve-spacing' ? g : u) });

  const oddDelay = suffixDelay(delayOutputs(mo.eeO, inp.common), ' (odd mode)', 'intra-pair skew from length mismatch (odd mode)');
  const evenDelay = evenModeDelay(mo.eeE, inp.common);
  steps.push(...oddDelay.steps, ...evenDelay.steps);

  // Results.
  const results: CalcResult['results'] = [];
  if (geo.mode === 'solve-spacing') {
    results.push({ name: 'edge spacing for target Zdiff', value: q(g * h, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'secondary', bound: 'nominal' });
  } else if (geo.mode === 'solve-width') {
    results.push({ name: 'trace width for target Zdiff', value: q(u * h, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'secondary', bound: 'nominal' });
  } else {
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'primary', bound: 'nominal' });
  }
  results.push(
    { name: 'odd-mode impedance Zodd', value: ohms(mo.z0o), role: 'secondary', bound: 'nominal' },
    { name: 'even-mode impedance Zeven', value: ohms(mo.z0e), role: 'secondary', bound: 'nominal' },
    { name: 'common-mode impedance Zcommon', value: ohms(zcommon), role: 'secondary', bound: 'nominal' },
    { name: 'odd-mode effective permittivity', value: dl(mo.eeO), role: 'secondary', bound: 'nominal' },
    { name: 'even-mode effective permittivity', value: dl(mo.eeE), role: 'secondary', bound: 'nominal' },
    { name: 'isolated-line impedance Z0 (single-ended, no coupling)', value: ohms(z0), role: 'secondary', bound: 'nominal', note: 'same w/h and er, part A microstrip model (ledger S-020); shows the coupling reduction' },
    { name: 'isolated-line effective permittivity', value: dl(eeIso), role: 'secondary', bound: 'nominal' },
    { name: 'coupling ratio Zdiff / (2 Z0)', value: dl(zdiff / (2 * z0)), role: 'secondary', bound: 'nominal', note: '1 means uncoupled; smaller means stronger coupling' },
    { name: 'width over height w/h', value: dl(u), role: 'secondary', bound: 'nominal' },
    { name: 'spacing over height s/h', value: dl(g), role: 'secondary', bound: 'nominal' },
    ...oddDelay.results,
    ...evenDelay.results,
  );

  // Validity checks: the recorded model ranges. A failed check also forces the confidence to low.
  const outOfRange: OutOfRangeInput[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const warnings: CalcWarning[] = [];
  const uCheck = rangeCheck('w/h', 'w/h', u, uLo, uHi, 'Recorded accuracy range of the coupled-line fit (ledger S-022, Steer: better than 1 % for 0.1 <= u <= 10).');
  const erCheck = rangeCheck('er', 'er', er, meta.validity.erRange[0], meta.validity.erRange[1], 'Range inherited from the single-line eps_e fit (ledger S-020).');
  const gOk = g >= meta.validity.gMin * (1 - 1e-12);
  const gShown = num(g);
  const gCheck = {
    name: `s/h above ${String(meta.validity.gMin)}`,
    ok: gOk,
    detail: `Recorded accuracy range (ledger S-022, Steer: better than 1 % for g > 0.01); the boundary value itself is treated as inside. s/h = ${gShown}.`,
  };
  for (const c of [uCheck, { check: gCheck, ...(gOk ? {} : { outOfRange: { name: 's/h', value: gShown, bound: `above ${String(meta.validity.gMin)}` } }) }, erCheck]) {
    validityChecks.push(c.check);
    if (c.outOfRange !== undefined) {
      outOfRange.push(c.outOfRange);
      warnings.push({ severity: 'warning', message: `Outside the model's recorded validity range: ${c.check.name} fails (${c.check.detail}) The result is an extrapolation; treat it as low confidence.`, code: 'OUT_OF_RANGE' });
    }
  }
  const ordered = mo.z0o < z0 && z0 < mo.z0e;
  validityChecks.push({
    name: 'Zodd < Z0 < Zeven',
    ok: ordered,
    detail: `Physical ordering of the two modes around the isolated line. Zodd = ${num(mo.z0o)}, Z0 = ${num(z0)}, Zeven = ${num(mo.z0e)} ohm. Informational: it can fail at weak coupling because the curve fits have a finite resolution.`,
  });
  if (inp.thickness !== undefined) {
    validityChecks.push({ name: 't/h reported', ok: true, detail: `t/h = ${num(inp.thickness.si / h)}. Thickness is not modelled for the coupled model, so this is informational only.` });
  }

  warnings.unshift(
    { severity: 'caution', message: dispersionMessageCoupled(inp.common.frequency, 'empirical'), code: 'DISPERSION_NOT_MODELLED' },
    { severity: 'caution', message: SOLDERMASK_MESSAGE, code: 'SOLDERMASK_NOT_MODELLED' },
    { severity: 'warning', message: UNVERIFIED_MESSAGE, code: 'MODEL_UNVERIFIED' },
  );
  if (inp.thickness !== undefined) warnings.push({ severity: 'caution', message: FINITE_THICKNESS_MESSAGE, code: 'FINITE_THICKNESS_NOT_MODELLED' });
  if (g > meta.validity.gWeakCoupling || !ordered) {
    warnings.push({
      severity: 'caution',
      message: `Weak coupling (s/h = ${gShown}; the check is above ${String(meta.validity.gWeakCoupling)}): the fit residual of the coupled-line equations can exceed the remaining coupling, so Zodd and Zeven are no longer sure to straddle the isolated-line Z0 and Zdiff is not sure to rise with the spacing (found by a scan, not a sourced limit). In that regime use Zdiff of about 2 * Z0 = ${num(2 * z0)} ohm.`,
      code: 'WEAK_COUPLING_FIT',
    });
  }
  warnings.push(...oddDelay.warnings);

  const assumptions = [
    'Symmetric surface pair: two identical bare traces side by side on one dielectric over a reference plane, air above; h is the dielectric height to the reference plane and s the edge-to-edge gap. Embedded (buried) pairs, offset pairs and broadside-coupled pairs are not offered (no verified source).',
    'Z0 inside the Z01e and Z01o expressions is the AIR-FILLED single-line impedance Z01(u) of ledger S-020 (the research note records the source wording as ambiguous; this is the reading used and it makes Zeven and Zodd approach the isolated Z0 as s/h grows).',
    `Source-stated accuracy (Steer section 5.6, ledger S-022): better than 1 % for 0.1 <= w/h <= 10 and s/h > 0.01; the reference of that statement was not seen. ${SOLVE_CAUTION} Zdiff = 2 * Zodd is a definition, so Zdiff is exactly as accurate as Zodd, no better.`,
    `Prefactor eta0/(2 pi) from exact constants (eta0 = ${ETA0_OHM.toFixed(4)} ohm = mu0 c; decision Q-1), as in the single-line model.`,
    'Zero strip thickness, no dispersion, no soldermask; copper roughness, etch profile and dielectric loss are not modelled; er is the value you entered at your own frequency and has not been checked against the fabricator. The coupled-line dispersion model (Kirschning-Jansen 1984) and Garg-Bahl were not read.',
    ...oddDelay.assumptions,
    'Delay and wavelength are shown per mode; the intra-pair skew uses the odd-mode (differential) eps_e.',
  ];
  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...oddDelay.ledgerIds, ...extraLedgerIds];
  const loss = lossBlock({
    common: inp.common,
    er,
    modes: [
      { suffix: ' (odd mode)', epsEff: mo.eeO },
      { suffix: ' (even mode)', epsEff: mo.eeE },
    ],
    conductor: { kind: 'not-modelled', geometry: 'edge-coupled microstrip pair' },
  });
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

const ENVELOPE_OUTPUTS: readonly OutputPlan[] = [
  { name: 'differential impedance Zdiff', sensitivity: true },
  { name: 'odd-mode impedance Zodd', sensitivity: true },
  { name: 'even-mode impedance Zeven', sensitivity: true },
  { name: 'odd-mode effective permittivity', sensitivity: true },
  { name: 'even-mode effective permittivity', sensitivity: true },
  { name: 'delay per length (odd mode)', sensitivity: true },
  { name: 'delay per length (even mode)', sensitivity: true },
];

/** Nominal result plus the tolerance envelope and sensitivities (core D). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const geo = inp.geometry;
  const fields: ImpField[] = [
    impField('width', 'width', 'width', geo.width !== undefined, solvedMessage('the width'), 'traceWidth'),
    impField('edgeSpacing', 'edgeSpacing', 'edge spacing', geo.edgeSpacing !== undefined, solvedMessage('the edge spacing'), 'traceSpace'),
    impField('height', 'height', 'height', true, ''),
    impField('er', 'er', 'er', true, ''),
    impField('thickness', 'thickness', 'thickness', false, inp.thickness === undefined ? 'thickness tolerance needs a thickness; none was given.' : unusedMessage('the thickness', 'the coupled model does not use it (finite thickness is not modelled).')),
  ];
  const results = { 'edge spacing for target Zdiff': 'edgeSpacing', 'trace width for target Zdiff': 'width' };
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields, outputs: ENVELOPE_OUTPUTS, solve: { target: 'targetZdiff', results } });
}

/** Edge-coupled microstrip Zdiff, Zodd, Zeven, Zcommon, eps_e per mode and delay, or the spacing / width for a target Zdiff. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
