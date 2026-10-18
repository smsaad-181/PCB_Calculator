import type { OutOfRangeInput } from '../../confidence';
import { Z_STRIPLINE_PREFACTOR_OHM } from '../../data/constants';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { brent } from '../../solvers/rootfind';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { FINITE_THICKNESS_MESSAGE, SOLVE_CAUTION, num, suffixDelay } from '../diff-shared';
import { impField, runEnvelope, solvedMessage, unusedMessage } from '../impedance-envelope';
import type { EnvelopeInputs, ImpField } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, commonInputEchoes, delayOutputs, dimensionless, rangeCheck } from '../impedance-shared';
import type { LossInputs } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { withProfileMinimum } from '../profile-minimum';
import type { MinimumSpec } from '../profile-minimum';
import { hasTolerances } from '../tolerance-shared';
import type { OutputPlan } from '../tolerance-shared';
import { z0ZeroThickness } from '../stripline/calc';
import { validate } from './guards';
import { meta } from './meta';

/**
 * Public input shape. Lengths are Quantities; er is a dimensionless Quantity; targetZdiff is a resistance.
 * Analysis: width and edgeSpacing. Spacing solve: targetZdiff and width. Width solve: targetZdiff and edgeSpacing.
 * planeSpacing is b (plane to plane); edgeSpacing is the edge-to-edge gap s of the pair.
 */
export interface Inputs extends LossInputs, EnvelopeInputs {
  width?: Quantity;
  edgeSpacing?: Quantity;
  targetZdiff?: Quantity;
  planeSpacing: Quantity;
  er: Quantity;
  thickness?: Quantity;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

// ---- S-022a model functions: x = w/b, y = s/b -----------------------------------------------------------------------------

const LN2_OVER_PI = Math.LN2 / Math.PI;

/** Even-mode impedance, Cohn approximate form (Caspers eq. 3.3) with the Q-1 prefactor eta0/4. */
export function cohnEven(x: number, y: number, er: number): number {
  return Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er) / (x + LN2_OVER_PI + Math.log(1 + Math.tanh((Math.PI * y) / 2)) / Math.PI);
}

/** Odd-mode impedance, Cohn approximate form (Caspers eq. 3.3) with the Q-1 prefactor eta0/4. */
export function cohnOdd(x: number, y: number, er: number): number {
  return Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er) / (x + LN2_OVER_PI + Math.log(1 + 1 / Math.tanh((Math.PI * y) / 2)) / Math.PI);
}

/** Weak-coupling limit s -> infinity of the same forms: the denominators tend to x + 2 ln2/pi. */
export function cohnInfinity(x: number, er: number): number {
  return Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er) / (x + 2 * LN2_OVER_PI);
}

const MAX_X = 1e6;

const UNVERIFIED_MESSAGE =
  'The Cohn edge-coupled stripline forms (ledger S-022a) are PAYWALLED-USER-MUST-VERIFY: only one secondary source (Caspers, CERN Accelerator School, arXiv:1201.2346 eq. 3.3) was read, it calls them "a good approximation" without a range or an accuracy, and the primary paper and the exact elliptic forms were not read. Treat the numbers as an estimate and confirm them with the fabricator.';
const NARROW_MESSAGE =
  'w/b is below 0.35, the value from which the single stripline form of this suite (ledger S-021) applies no narrow-strip effective-width correction. That 0.35 is an inference by analogy, not a sourced limit for the Cohn coupled forms, which record no range; the coupled forms carry no narrow-strip correction, so treat narrow strips with extra caution.';

function failure(code: CalcError['code'], field: string, message: string): CalcOutcome {
  return { ok: false, error: { code, field, message } };
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const geo = inp.geometry;
  const b = inp.planeSpacing.si;
  const er = inp.er;
  const [yLo, yHi] = meta.validity.sSolveRange;
  const xLo = meta.validity.wOverBMin;
  const zdiffAt = (x: number, y: number): number => 2 * cohnOdd(x, y, er);

  let x: number;
  let y: number;
  let bracketNote = '';
  if (geo.mode === 'analysis') {
    x = (geo.width as Quantity).si / b;
    y = (geo.edgeSpacing as Quantity).si / b;
  } else if (geo.mode === 'solve-spacing') {
    x = (geo.width as Quantity).si / b;
    if (!Number.isFinite(x) || x <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / plane spacing is not finite (check the units).');
    const target = (geo.targetZdiff as Quantity).si;
    const zLo = zdiffAt(x, yLo);
    const zHi = zdiffAt(x, yHi);
    if (![zLo, zHi].every((z) => Number.isFinite(z) && z > 0)) return failure('OUT_OF_DOMAIN', 'width', 'The model cannot be evaluated for this width and plane spacing (check the units).');
    if (!(target >= zLo && target <= zHi)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZdiff',
        `The target Zdiff ${num(target)} ohm is unreachable for w/b = ${num(x)} and er ${num(er)}: over ${String(yLo)} <= s/b <= ${String(yHi)} (Zdiff rises monotonically with spacing) this model gives Zdiff from ${num(zLo)} ohm (s/b = ${String(yLo)}) to ${num(zHi)} ohm (s/b = ${String(yHi)}). The upper end is the weak-coupling limit 2 * Zinf = ${num(2 * cohnInfinity(x, er))} ohm, which no finite spacing exceeds. Change the width, er or the target.`,
      );
    }
    const s = brent((t: number): number => zdiffAt(x, t) - target, yLo, yHi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZdiff', `The spacing solve did not converge (${s.reason}: ${s.message}).`);
    y = s.x;
    bracketNote = `Bracketed Brent on the S-022a analysis function over ${String(yLo)} <= s/b <= ${String(yHi)} (Zdiff increases with s/b); ${String(s.iterations)} iterations.`;
  } else {
    y = (geo.edgeSpacing as Quantity).si / b;
    if (!Number.isFinite(y) || y <= 0) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'edge spacing / plane spacing is not finite (check the units).');
    const target = (geo.targetZdiff as Quantity).si;
    const zLo = zdiffAt(xLo, y);
    if (!Number.isFinite(zLo) || !(zLo > 0)) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'The model cannot be evaluated for this spacing and plane spacing (check the units).');
    if (!(target <= zLo)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZdiff',
        `The target Zdiff ${num(target)} ohm is unreachable for s/b = ${num(y)} and er ${num(er)}: the highest Zdiff this model gives from w/b = ${String(xLo)} upward is ${num(zLo)} ohm (w/b = ${String(xLo)} is the lowest w/b of the nearest recorded stripline range, decision Q-5). The target is outside the range the model covers.`,
      );
    }
    let hi = 1;
    while (zdiffAt(hi, y) > target && hi < MAX_X) hi *= 2;
    if (zdiffAt(hi, y) > target) return failure('OUT_OF_DOMAIN', 'targetZdiff', `The target Zdiff ${num(target)} ohm is unreachable: it would need w/b above ${String(MAX_X)}.`);
    const s = brent((t: number): number => zdiffAt(t, y) - target, xLo, hi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZdiff', `The width solve did not converge (${s.reason}: ${s.message}).`);
    x = s.x;
    bracketNote = `Bracketed Brent on the S-022a analysis function over ${String(xLo)} <= w/b <= ${num(hi)} (Zdiff decreases with w/b); ${String(s.iterations)} iterations.`;
  }
  if (!Number.isFinite(x) || x <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / plane spacing is not finite (check the units).');
  if (!Number.isFinite(y) || y <= 0) return failure('OUT_OF_DOMAIN', 'edgeSpacing', 'edge spacing / plane spacing is not finite (check the units).');

  const zo = cohnOdd(x, y, er);
  const ze = cohnEven(x, y, er);
  const zinf = cohnInfinity(x, er);
  const z0 = z0ZeroThickness(x, er);
  if (![zo, ze, zinf, z0].every((z) => Number.isFinite(z) && z > 0)) {
    return failure('OUT_OF_DOMAIN', 'width', 'The model gave a non-finite or non-physical value for these inputs (check the units and the ratios w/b and s/b).');
  }
  const zdiff = 2 * zo; // S-022b
  const zcommon = ze / 2; // S-022b
  const dl = dimensionless;
  const ohms = (n: number): Quantity => q(n, DIM.RESISTANCE);

  const srcDetail = (label: string | undefined): { sourceDetail?: string } => (label === undefined ? {} : { sourceDetail: label });
  const geoLabel = inp.common.geometrySource;
  const inputs: CalcInput[] = [];
  if (geo.width !== undefined) inputs.push({ name: 'width', value: geo.width, source: 'user', ...srcDetail(geoLabel) });
  if (geo.edgeSpacing !== undefined) inputs.push({ name: 'edge spacing', value: geo.edgeSpacing, source: 'user', ...srcDetail(geoLabel) });
  if (geo.targetZdiff !== undefined) inputs.push({ name: 'target Zdiff', value: geo.targetZdiff, source: 'user' });
  inputs.push({ name: 'plane spacing', value: inp.planeSpacing, source: 'user', ...srcDetail(geoLabel) });
  inputs.push({ name: 'er', value: dl(er), source: 'user', ...srcDetail(inp.common.erSource) });
  if (inp.thickness !== undefined) inputs.push({ name: 'thickness', value: inp.thickness, source: 'user', ...srcDetail(geoLabel) });
  inputs.push(...commonInputEchoes(inp.common));

  const steps: CalcResult['steps'] = [
    { label: 'Width over plane spacing', expr: 'x = w / b', value: dl(x) },
    { label: 'Edge spacing over plane spacing', expr: 'y = s / b', value: dl(y) },
    { label: 'Prefactor', expr: 'K / sqrt(er) = (eta0 / 4) / sqrt(er)', value: ohms(Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er)) },
    { label: 'tanh(pi y / 2)', expr: 'tanh(pi s / 2b)', value: dl(Math.tanh((Math.PI * y) / 2)) },
    { label: 'Even-mode impedance', expr: 'Z0e = K/sqrt(er) / (x + ln2/pi + (1/pi) ln[1 + tanh(pi y/2)])', value: ohms(ze) },
    { label: 'coth(pi y / 2)', expr: 'coth(pi s / 2b)', value: dl(1 / Math.tanh((Math.PI * y) / 2)) },
    { label: 'Odd-mode impedance', expr: 'Z0o = K/sqrt(er) / (x + ln2/pi + (1/pi) ln[1 + coth(pi y/2)])', value: ohms(zo) },
    { label: 'Differential impedance', expr: 'Zdiff = 2 Zodd (ledger S-022b)', value: ohms(zdiff) },
    { label: 'Common-mode impedance', expr: 'Zcommon = Zeven / 2 (ledger S-022b)', value: ohms(zcommon) },
    { label: 'Weak-coupling limit of the same forms', expr: 'Zinf = K/sqrt(er) / (x + 2 ln2/pi)', value: ohms(zinf) },
    { label: 'Isolated single line, same w/b (part A stripline)', expr: 'Z0 from ledger S-021', value: ohms(z0) },
  ];
  if (geo.mode !== 'analysis') steps.push({ label: 'Solver bracket', expr: bracketNote, value: dl(geo.mode === 'solve-spacing' ? y : x) });
  const delay = suffixDelay(delayOutputs(er, inp.common), '', 'intra-pair skew from length mismatch'); // homogeneous: eps_eff = er for both modes
  steps.push(...delay.steps);

  const results: CalcResult['results'] = [];
  if (geo.mode === 'solve-spacing') {
    results.push({ name: 'edge spacing for target Zdiff', value: q(y * b, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'secondary', bound: 'nominal' });
  } else if (geo.mode === 'solve-width') {
    results.push({ name: 'strip width for target Zdiff', value: q(x * b, DIM.LENGTH), role: 'primary', bound: 'nominal' });
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'secondary', bound: 'nominal' });
  } else {
    results.push({ name: 'differential impedance Zdiff', value: ohms(zdiff), role: 'primary', bound: 'nominal' });
  }
  results.push(
    { name: 'odd-mode impedance Zodd', value: ohms(zo), role: 'secondary', bound: 'nominal' },
    { name: 'even-mode impedance Zeven', value: ohms(ze), role: 'secondary', bound: 'nominal' },
    { name: 'common-mode impedance Zcommon', value: ohms(zcommon), role: 'secondary', bound: 'nominal' },
    { name: 'effective permittivity', value: dl(er), role: 'secondary', bound: 'nominal', note: 'homogeneous dielectric: eps_eff = er for both modes' },
    { name: 'weak-coupling limit of the Cohn forms (s to infinity)', value: ohms(zinf), role: 'secondary', bound: 'nominal', note: 'Zodd < this < Zeven for every finite spacing' },
    { name: 'isolated-line impedance Z0 (single-ended, no coupling)', value: ohms(z0), role: 'secondary', bound: 'nominal', note: 'same w/b and er, part A stripline model (ledger S-021); shows the coupling reduction' },
    { name: 'coupling ratio Zdiff / (2 Z0)', value: dl(zdiff / (2 * z0)), role: 'secondary', bound: 'nominal', note: '1 means uncoupled; smaller means stronger coupling' },
    { name: 'width over plane spacing w/b', value: dl(x), role: 'secondary', bound: 'nominal' },
    { name: 'edge spacing over plane spacing s/b', value: dl(y), role: 'secondary', bound: 'nominal' },
    ...delay.results,
  );

  // Validity. S-022a records no range or accuracy. Decision Q-5: the nearest recorded stripline range (S-021a) is the rule.
  const outOfRange: OutOfRangeInput[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const warnings: CalcWarning[] = [];
  const wCheck = rangeCheck('w/b', 'w/b', x, meta.validity.wOverBMin, Infinity, 'No range is recorded for the Cohn coupled forms (ledger S-022a); the nearest recorded stripline range (S-021a, Steer: w/(b - t) > 0.05, decision Q-5) is applied.');
  validityChecks.push({ ...wCheck.check, name: `w/b above ${String(meta.validity.wOverBMin)}` });
  if (wCheck.outOfRange !== undefined) {
    outOfRange.push({ name: 'w/b', value: num(x), bound: `above ${String(meta.validity.wOverBMin)}` });
    warnings.push({
      severity: 'warning',
      message: `Outside the nearest recorded validity range: w/b above ${String(meta.validity.wOverBMin)} fails (w/b = ${num(x)}). No range is recorded for S-022a itself, so this is the S-021a range applied by decision Q-5. The result is an extrapolation; treat it as low confidence.`,
      code: 'OUT_OF_RANGE',
    });
  }
  const ordered = zo < z0 && z0 < ze;
  validityChecks.push({
    name: 'Zodd < Z0 < Zeven',
    ok: ordered,
    detail: `Ordering of the two modes around the part A isolated line. Zodd = ${num(zo)}, Z0 = ${num(z0)}, Zeven = ${num(ze)} ohm. Informational: against the model's own weak-coupling limit the ordering always holds (Zinf = ${num(zinf)} ohm).`,
  });
  if (inp.thickness !== undefined) {
    validityChecks.push({ name: 't/b reported', ok: true, detail: `t/b = ${num(inp.thickness.si / b)}. Thickness is not modelled for the coupled model, so this is informational only.` });
  }

  warnings.unshift({ severity: 'warning', message: UNVERIFIED_MESSAGE, code: 'MODEL_UNVERIFIED' });
  if (x < meta.validity.wOverBWide) warnings.push({ severity: 'caution', message: NARROW_MESSAGE, code: 'NARROW_STRIP_FORM' });
  if (!ordered) {
    warnings.push({
      severity: 'caution',
      message: `The coupled forms and the single stripline form of this suite (part A, ledger S-021) are different approximations: here Zodd < Z0 < Zeven does not hold against the part A line (Z0 = ${num(z0)} ohm), mainly because part A applies a narrow-strip effective-width correction below w/b = 0.35 and the Cohn coupled forms have none. Compare against the Cohn weak-coupling limit (${num(zinf)} ohm) for the coupling reduction.`,
      code: 'ISOLATED_MODEL_MISMATCH',
    });
  }
  if (inp.thickness !== undefined) warnings.push({ severity: 'caution', message: FINITE_THICKNESS_MESSAGE, code: 'FINITE_THICKNESS_NOT_MODELLED' });
  warnings.push(...delay.warnings);

  const assumptions = [
    'Centred symmetric pair: two identical strips side by side midway between two reference planes (b = plane-to-plane spacing, s = edge-to-edge gap) in one homogeneous, bonded dielectric (no air voids). Offset stripline, broadside-coupled pairs and inhomogeneous dielectrics are not offered (no verified source).',
    'Accuracy and validity: no accuracy figure and no validity range are recorded for the Cohn coupled forms (the source calls them "a good approximation"); none is invented. Decision Q-5 applies the nearest recorded stripline range (ledger S-021a, w/(b - t) > 0.05) as the out-of-range rule. The exact elliptic forms were not read and are not used.',
    `Prefactor: the source prints 94.15 ohm; decision Q-1 takes it as eta0/4 = ${Z_STRIPLINE_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (0.034 % above the printed 94.15), the same prefactor as the single stripline model.`,
    SOLVE_CAUTION,
    'Pure TEM: no dispersion term and higher-order modes are not checked. Zero strip thickness; copper roughness, etch profile and dielectric loss are not modelled; er is the value you entered and has not been checked against the fabricator. Delay and wavelength are the same for both modes (homogeneous dielectric).',
    ...delay.assumptions,
    'The intra-pair skew uses the homogeneous eps_eff = er.',
  ];
  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds, ...extraLedgerIds];
  const loss = lossBlock({ common: inp.common, er, modes: [{ suffix: '', epsEff: er }], conductor: { kind: 'not-modelled', geometry: 'edge-coupled stripline pair' } });
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
  { name: 'effective permittivity', sensitivity: true, onlyIfVaries: true },
  { name: 'delay per length', sensitivity: true, onlyIfVaries: true },
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
    impField('planeSpacing', 'planeSpacing', 'plane spacing', true, ''),
    impField('er', 'er', 'er', true, ''),
    impField('thickness', 'thickness', 'thickness', false, inp.thickness === undefined ? 'thickness tolerance needs a thickness; none was given.' : unusedMessage('the thickness', 'the coupled model does not use it (finite thickness is not modelled).')),
  ];
  const results = { 'edge spacing for target Zdiff': 'edgeSpacing', 'strip width for target Zdiff': 'width' };
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields, outputs: ENVELOPE_OUTPUTS, solve: { target: 'targetZdiff', results } });
}

/** Optional fab-profile minimum check (PCB2-4): the widths and spacings this calculator solves for or is given. */
const MINIMUM_SPECS: readonly MinimumSpec[] = [
  { key: 'traceWidth', label: 'strip width', input: 'width', solvedResult: 'strip width for target Zdiff' },
  { key: 'traceSpace', label: 'edge spacing', input: 'edgeSpacing', solvedResult: 'edge spacing for target Zdiff' },
];

/** Edge-coupled stripline Zdiff, Zodd, Zeven, Zcommon and delay, or the spacing / width for a target Zdiff. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return withProfileMinimum(hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs), inputs, MINIMUM_SPECS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
