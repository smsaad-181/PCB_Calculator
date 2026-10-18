import type { OutOfRangeInput } from '../../confidence';
import { Z_STRIPLINE_PREFACTOR_OHM } from '../../data/constants';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { brent } from '../../solvers/rootfind';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import { impField, runEnvelope, solvedMessage, unusedMessage } from '../impedance-envelope';
import type { EnvelopeInputs, ImpField } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, commonInputEchoes, delayOutputs, dimensionless } from '../impedance-shared';
import type { LossInputs } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { hasTolerances } from '../tolerance-shared';
import type { OutputPlan } from '../tolerance-shared';
import { validate } from './guards';
import { SL, meta } from './meta';
import type { StriplineThicknessModel } from './meta';

/** Public input shape: lengths are Quantities, er is a dimensionless Quantity; exactly one of width and targetZ0. spacing is b. */
export interface Inputs extends LossInputs, EnvelopeInputs {
  width?: Quantity;
  targetZ0?: Quantity;
  spacing: Quantity;
  er: Quantity;
  thickness?: Quantity;
  thicknessModel?: StriplineThicknessModel;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

// ---- S-021 and S-021a model functions, x = w/b ------------------------------------------------------------------------

/** Effective width We/b (Steer eq. 6): w/b - (0.35 - w/b)^2 for narrow strips, else w/b. */
export function effectiveWidthOverB(x: number): number {
  return x < SL.wNarrow ? x - (SL.wNarrow - x) ** 2 : x;
}

/** Z0 = (eta0/4)/sqrt(er) / (We/b + 0.441), the Pozar 3.179 form (S-021) with the Q-1 prefactor. */
export function z0ZeroThickness(x: number, er: number): number {
  return Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er) / (effectiveWidthOverB(x) + SL.k);
}

/** Wide-strip finite-thickness form (Steer eqs. 1-4, S-021a CONFLICT), x = w/b >= 0.35, tn = t/b. */
export function z0CohnWide(x: number, tn: number, er: number): number {
  const cf = (2 / Math.PI) * Math.log(1 / (1 - tn) + 1) - (tn / Math.PI) * Math.log(1 / (1 - tn) ** 2 - 1);
  return ((Z_STRIPLINE_PREFACTOR_OHM / Math.sqrt(er)) * (1 - tn)) / (x + cf);
}

const MAX_X = 1e6;
const num = (x: number): string => String(Number(x.toPrecision(5)));

const ZERO_THICKNESS_MESSAGE =
  'Zero-thickness model: the entered strip thickness t is NOT used. A real strip of finite thickness has a lower Z0 for the same width. The finite-thickness form (ledger S-021a, in CONFLICT between sources) is available only as an explicit opt-in variant for wide strips.';
const CONFLICT_MESSAGE =
  'Finite-thickness variant enabled for a wide strip (ledger S-021a is in CONFLICT: the narrow-strip forms of the two sources differ by about 0.2 % and their prefactors by 0.1 %, and the original paper was not read). Treat the result as a labelled variant, not as the verified base value.';

function failure(code: CalcError['code'], field: string, message: string): CalcOutcome {
  return { ok: false, error: { code, field, message } };
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const b = inp.spacing.si;
  const er = inp.er;
  const model = inp.thicknessModel;
  const tn = inp.thickness !== undefined ? inp.thickness.si / b : 0;
  const wide = model === 'cohn-wide';
  const zOf = (x: number): number => (wide ? z0CohnWide(x, tn, er) : z0ZeroThickness(x, er));
  const xLo = wide ? meta.validity.wideMin : meta.validity.wOverBMin;

  let x: number;
  let solved = false;
  let bracketNote = '';
  if (inp.width !== undefined) {
    x = inp.width.si / b;
  } else {
    const target = (inp.targetZ0 as Quantity).si;
    const zLo = zOf(xLo);
    if (!(target <= zLo)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZ0',
        `The target Z0 ${num(target)} ohm is unreachable for er ${num(er)}: the highest Z0 this model gives from w/b = ${String(xLo)} upward is ${num(zLo)} ohm (w/b = ${String(xLo)} is the ${wide ? 'wide-strip limit of the finite-thickness variant' : 'lowest w/b with a recorded accuracy range'}). The target is outside the range the model covers.`,
      );
    }
    let hi = Math.max(1, 2 * xLo);
    while (zOf(hi) > target && hi < MAX_X) hi *= 2;
    if (zOf(hi) > target) {
      return failure('OUT_OF_DOMAIN', 'targetZ0', `The target Z0 ${num(target)} ohm is unreachable: it would need w/b above ${String(MAX_X)}.`);
    }
    const s = brent((t: number) => zOf(t) - target, xLo, hi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZ0', `The width solve did not converge (${s.reason}: ${s.message}).`);
    x = s.x;
    solved = true;
    bracketNote = `Bracketed Brent on the analysis function over ${String(xLo)} <= w/b <= ${num(hi)} (Z0 decreases monotonically with w/b); ${String(s.iterations)} iterations.`;
  }
  if (!Number.isFinite(x) || x <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / spacing is not finite (check the units).');
  if (wide && x < meta.validity.wideMin) {
    return failure('OUT_OF_DOMAIN', 'width', `w/b = ${num(x)} is below ${String(meta.validity.wideMin)}: narrow strips with finite thickness are not offered (ledger S-021a, CONFLICT between sources). Use the zero-thickness model or a wider strip.`);
  }
  const z0 = zOf(x);
  if (!(z0 > 0) || !Number.isFinite(z0)) return failure('OUT_OF_DOMAIN', 'width', 'The model gave a non-finite or non-physical value for these inputs (check the units).');

  const widthQ = solved ? q(x * b, DIM.LENGTH) : (inp.width as Quantity);
  const dl = dimensionless;
  const ohms = (n: number): Quantity => q(n, DIM.RESISTANCE);
  const srcDetail = (label: string | undefined): { sourceDetail?: string } => (label === undefined ? {} : { sourceDetail: label });

  const inputs: CalcInput[] = [];
  if (inp.width !== undefined) inputs.push({ name: 'width', value: inp.width, source: 'user', ...srcDetail(inp.common.geometrySource) });
  if (inp.targetZ0 !== undefined) inputs.push({ name: 'target Z0', value: inp.targetZ0, source: 'user' });
  inputs.push({ name: 'spacing', value: inp.spacing, source: 'user', ...srcDetail(inp.common.geometrySource) });
  inputs.push({ name: 'er', value: dl(er), source: 'user', ...srcDetail(inp.common.erSource) });
  if (inp.thickness !== undefined) inputs.push({ name: 'thickness', value: inp.thickness, source: 'user', ...srcDetail(inp.common.geometrySource) });
  inputs.push(...commonInputEchoes(inp.common));

  const steps: CalcResult['steps'] = [{ label: 'Width over spacing', expr: 'x = w / b', value: dl(x) }];
  if (!wide) {
    steps.push(
      { label: 'Effective width over spacing', expr: 'We/b = x - (0.35 - x)^2 for x < 0.35, else x', value: dl(effectiveWidthOverB(x)) },
      { label: 'Characteristic impedance', expr: 'Z0 = (eta0/4) / sqrt(er) / (We/b + 0.441)', value: ohms(z0) },
    );
  } else {
    steps.push(
      { label: 'Normalised thickness', expr: 't/b', value: dl(tn) },
      { label: 'Characteristic impedance', expr: 'Z0 = (eta0/4)/sqrt(er) (1 - t/b)/(w/b + Cf)', value: ohms(z0) },
    );
  }
  if (solved) steps.push({ label: 'Solver bracket', expr: bracketNote, value: dl(x) });
  const delay = delayOutputs(er, inp.common); // homogeneous dielectric: eps_eff = er
  steps.push(...delay.steps);

  const results: CalcResult['results'] = [];
  if (solved) {
    results.push({ name: 'strip width for target Z0', value: widthQ, role: 'primary', bound: 'nominal' });
    results.push({ name: 'characteristic impedance Z0', value: ohms(z0), role: 'secondary', bound: 'nominal' });
  } else {
    results.push({ name: 'characteristic impedance Z0', value: ohms(z0), role: 'primary', bound: 'nominal' });
  }
  results.push({ name: 'effective permittivity', value: dl(er), role: 'secondary', bound: 'nominal', note: 'homogeneous dielectric: eps_eff = er' });
  results.push({ name: 'width over spacing w/b', value: dl(x), role: 'secondary', bound: 'nominal' });
  results.push(...delay.results);

  // Validity: the only stripline ranges recorded are the S-021a accuracy ranges (Steer): w/(b - t) > 0.05 and t/b < 0.025.
  const outOfRange: OutOfRangeInput[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const warnings: CalcWarning[] = [];
  const t = inp.thickness !== undefined ? inp.thickness.si : 0;
  const wEff = inp.width !== undefined || solved ? (x * b) / (b - t) : x;
  const wOk = wEff >= meta.validity.wOverBMin * (1 - 1e-12);
  const shownW = num(wEff);
  validityChecks.push({
    name: `w/(b-t) above ${String(meta.validity.wOverBMin)}`,
    ok: wOk,
    detail: `Lowest w/(b - t) with a recorded accuracy range (ledger S-021a, Steer: better than 1 % for w/(b - t) > 0.05); it is the only stripline range recorded. w/(b-t) = ${shownW}.`,
  });
  if (!wOk) outOfRange.push({ name: 'w/(b-t)', value: shownW, bound: `above ${String(meta.validity.wOverBMin)}` });
  if (inp.thickness !== undefined) {
    const tOk = tn < meta.validity.tOverBMax;
    const shownT = num(tn);
    if (wide) {
      validityChecks.push({ name: `t/b below ${String(meta.validity.tOverBMax)}`, ok: tOk, detail: `Recorded accuracy range of the finite-thickness form (ledger S-021a, Steer). t/b = ${shownT}.` });
      if (!tOk) outOfRange.push({ name: 't/b', value: shownT, bound: `below ${String(meta.validity.tOverBMax)}` });
    } else {
      validityChecks.push({
        name: 't/b reported',
        ok: true,
        detail: `t/b = ${shownT}. The zero-thickness model ignores t; the finite-thickness accuracy range t/b < ${String(meta.validity.tOverBMax)} (ledger S-021a) is ${tOk ? 'met' : 'not met'}.`,
      });
    }
  }
  if (outOfRange.length > 0) {
    warnings.push({
      severity: 'warning',
      message: `Outside the model's recorded validity range: ${validityChecks.filter((c) => !c.ok).map((c) => c.name).join('; ')}. The result is an extrapolation; treat it as low confidence.`,
      code: 'OUT_OF_RANGE',
    });
  }
  if (inp.thickness !== undefined && !wide) warnings.push({ severity: 'caution', message: ZERO_THICKNESS_MESSAGE, code: 'ZERO_THICKNESS_MODEL' });
  if (wide) warnings.push({ severity: 'warning', message: CONFLICT_MESSAGE, code: 'THICKNESS_VARIANT_CONFLICT' });
  warnings.push(...delay.warnings);

  const assumptions = [
    'Centred strip between two reference planes (b = plane-to-plane spacing) in one homogeneous, bonded dielectric (no air voids). Offset stripline not offered (no verified source); inhomogeneous dielectrics are not offered.',
    `Prefactor eta0/4 = ${Z_STRIPLINE_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (eta0 = mu0 c; decision Q-1); the textbook 30 pi = 94.2478 ohm is the same quantity rounded and gives Z0 about 0.07 % higher.`,
    'Accuracy: no accuracy figure is quoted by the sources read for the zero-thickness form. The finite-thickness form is quoted better than 1 % for w/(b - t) > 0.05 and t/b < 0.025 (Steer, ledger S-021a). The exact elliptic form (ledger S-021b) is unverified and is not used.',
    'Pure TEM: there is no dispersion term in this model and higher-order modes are not checked. Copper roughness, etch profile and dielectric loss are not modelled; er is the value you entered and has not been checked against the fabricator.',
    ...(wide ? ['Strip thickness handled by the opt-in wide-strip form (Steer eqs. 1-4, ledger S-021a, CONFLICT); narrow strips with finite thickness are not offered.'] : ['Strip thickness is zero in this model (Pozar 3.179 zero-thickness approximation).']),
    ...delay.assumptions,
  ];
  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds];
  if (wide) ledgerIds.push('S-021a');
  ledgerIds.push(...extraLedgerIds);
  const loss = lossBlock({ common: inp.common, er, modes: [{ suffix: '', epsEff: er }], conductor: { kind: 'not-modelled', geometry: 'stripline' } });
  const lossDefaults = mergeLoss(loss, { inputs, steps, results, validityChecks, warnings, outOfRange, assumptions, ledgerIds });

  return assemble({
    method: wide ? 'Symmetric stripline with the opt-in finite-thickness wide-strip form (ledger S-021a, CONFLICT); TEM, centred strip' : meta.method,
    standard: meta.reference.standard,
    edition: meta.reference.edition,
    formula: wide ? `${meta.formula} ${meta.thicknessFormula}` : meta.formula,
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
  { name: 'characteristic impedance Z0', sensitivity: true },
  { name: 'effective permittivity', sensitivity: true, onlyIfVaries: true },
  { name: 'delay per length', sensitivity: true, onlyIfVaries: true },
];

/** Nominal result plus the tolerance envelope and sensitivities (core D). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const thicknessUsed = inp.thickness !== undefined && inp.thicknessModel !== 'none';
  const fields: ImpField[] = [
    impField('width', 'width', 'width', inp.width !== undefined, solvedMessage('the width'), 'traceWidth'),
    impField('spacing', 'spacing', 'spacing', true, ''),
    impField('er', 'er', 'er', true, ''),
    impField('thickness', 'thickness', 'thickness', thicknessUsed, inp.thickness === undefined ? 'thickness tolerance needs a thickness; none was given.' : unusedMessage('the thickness', 'the zero-thickness model (thicknessModel none) does not use it.')),
  ];
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields, outputs: ENVELOPE_OUTPUTS, solve: { target: 'targetZ0', results: { 'strip width for target Z0': 'width' } } });
}

/** Symmetric stripline Z0, eps_e (= er), delay and guided wavelength, or the width for a target Z0. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
