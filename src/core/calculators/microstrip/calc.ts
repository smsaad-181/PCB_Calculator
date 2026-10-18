import type { OutOfRangeInput } from '../../confidence';
import { Z_PREFACTOR_OHM } from '../../data/constants';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { brent } from '../../solvers/rootfind';
import { formatSignedPercent } from '../../format-result';
import { DIM, formatFor, q } from '../../units';
import type { Quantity } from '../../units';
import { impField, runEnvelope, solvedMessage, unusedMessage } from '../impedance-envelope';
import type { EnvelopeInputs, ImpField } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, SOLDERMASK_MESSAGE, THICKNESS_NO_RANGE_RECORDED, assemble, commonInputEchoes, delayOutputs, dimensionless, rangeCheck } from '../impedance-shared';
import type { LossInputs } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { withProfileMinimum } from '../profile-minimum';
import type { MinimumSpec } from '../profile-minimum';
import { hasTolerances } from '../tolerance-shared';
import type { OutputPlan } from '../tolerance-shared';
import { validate } from './guards';
import type { ValidInputs } from './guards';
import { HJ, HJ_THICKNESS, meta } from './meta';
import type { ThicknessModel } from './meta';

/** Public input shape. All lengths are Quantities; er is a dimensionless Quantity. Exactly one of width and targetZ0. */
export interface Inputs extends LossInputs, EnvelopeInputs {
  width?: Quantity;
  targetZ0?: Quantity;
  height: Quantity;
  er: Quantity;
  thickness?: Quantity;
  thicknessModel?: ThicknessModel;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

// ---- S-020 model functions (Steer eqs. 9-14), written from the ledger formula; u = w/h ----------------------------------

/** a(u), Steer eq. (10). */
export function hjA(u: number): number {
  return 1 + Math.log((u ** 4 + (u / HJ.a2) ** 2) / (u ** 4 + HJ.a3)) / HJ.a1 + Math.log(1 + (u / HJ.a5) ** 3) / HJ.a4;
}

/** b(er), Steer eq. (11). */
export function hjB(er: number): number {
  return HJ.b1 * ((er - HJ.b2) / (er + HJ.b3)) ** HJ.b4;
}

/** Effective permittivity eps_e(u, er), Steer eq. (9). */
export function epsEffZeroThickness(u: number, er: number): number {
  return (er + 1) / 2 + ((er - 1) / 2) * (1 + HJ.k10 / u) ** -(hjA(u) * hjB(er));
}

/** F1(u), Steer eq. (14). */
export function hjF1(u: number): number {
  return 6 + (2 * Math.PI - 6) * Math.exp(-((HJ.f2 / u) ** HJ.f3));
}

/** Air-filled line impedance Z01(u), Steer eq. (13), with the prefactor eta0/(2 pi) (decision Q-1). */
export function z01(u: number): number {
  return Z_PREFACTOR_OHM * Math.log(hjF1(u) / u + Math.sqrt(1 + (2 / u) ** 2));
}

/** Z0 = Z01 / sqrt(eps_e), Steer eq. (12). */
export function z0ZeroThickness(u: number, er: number): number {
  return z01(u) / Math.sqrt(epsEffZeroThickness(u, er));
}

/** S-020a (H-J form): the width corrections for a strip of normalised thickness tn = t/h. */
export function thicknessDeltas(u: number, tn: number, er: number): { du1: number; dur: number } {
  const th = Math.tanh(Math.sqrt(HJ_THICKNESS.k * u));
  const du1 = (tn / Math.PI) * Math.log(1 + (4 * Math.E * th * th) / tn); // 4e / (tn coth^2) with coth = 1/tanh
  const dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
  return { du1, dur };
}

export interface Evaluated {
  readonly z0: number;
  readonly epsEff: number;
  readonly u1?: number;
  readonly ur?: number;
  readonly du1?: number;
  readonly dur?: number;
}

/** Z0 and eps_eff for the chosen thickness model. Procedure A and B share Z0; they differ in eps_eff (S-020a). */
export function evaluate(u: number, er: number, tn: number, model: ThicknessModel): Evaluated {
  if (model === 'none') return { z0: z0ZeroThickness(u, er), epsEff: epsEffZeroThickness(u, er) };
  const { du1, dur } = thicknessDeltas(u, tn, er);
  const u1 = u + du1;
  const ur = u + dur;
  const eeR = epsEffZeroThickness(ur, er);
  const z0 = z01(ur) / Math.sqrt(eeR);
  const epsEff = model === 'hj-procedure-A' ? eeR * (z01(u1) / z01(ur)) ** 2 : eeR;
  return { z0, epsEff, u1, ur, du1, dur };
}

// ---- messages -------------------------------------------------------------------------------------------------------------

/** Names of the labelled secondary results shown when t is entered but the zero-thickness model is the headline (PCB2-2). */
export const VARIANT_A_Z0 = 'Z0 with thickness variant A (CONFLICT, S-020a)';
export const VARIANT_A_EE = 'effective permittivity with thickness variant A (CONFLICT, S-020a)';
export const VARIANT_A_DIFF = 'Z0 difference, thickness variant A vs zero-thickness headline (CONFLICT, S-020a)';
const ZERO_THICKNESS_MESSAGE =
  'Zero-thickness model: the entered trace thickness t is NOT used. Hammerstad-Jensen zero-thickness values are returned; a real trace of finite thickness has a lower Z0. The thickness correction (ledger S-020a, in CONFLICT between sources) is available as an explicit opt-in variant, and its value at this geometry is shown as a labelled secondary result (the headline and the confidence are unchanged).';
const CONFLICT_MESSAGE =
  'Thickness variant enabled: the H-J width correction is in CONFLICT between the sources read (ledger S-020a): the full procedure (A) and the simplified procedure (B) give the same Z0 but eps_e differs by about 1 %, and the original paper was not read. Treat the result as a labelled variant, not as the verified base value.';

const num = (x: number): string => String(Number(x.toPrecision(5)));

function dispersionMessage(frequency: Quantity | undefined): string {
  const f = frequency === undefined ? 'no frequency was entered' : `frequency entered: ${formatFor(frequency, { accuracyClass: meta.accuracyClass })}`;
  return `Dispersion is not modelled: Z0, eps_e and delay are quasi-static (low-frequency) values and drift upward with frequency in a real microstrip (${f}). No threshold frequency is applied (decision Q-7); verify with a field solver or fabricator data at your operating frequency.`;
}

function failure(code: CalcError['code'], field: string, message: string): CalcOutcome {
  return { ok: false, error: { code, field, message } };
}

function variantLabel(model: ThicknessModel): string {
  return model === 'hj-procedure-A' ? 'procedure A' : 'procedure B';
}

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp: ValidInputs = v.value;
  const h = inp.height.si;
  const er = inp.er;
  const model = inp.thicknessModel;
  const tn = inp.thickness !== undefined ? inp.thickness.si / h : 0;
  if (!Number.isFinite(tn)) return failure('OUT_OF_DOMAIN', 'thickness', 'thickness / height is not finite (check the units).');
  const [uLo, uHi] = meta.validity.uRange;

  let u: number;
  let solved = false;
  let bracketNote = '';
  if (inp.width !== undefined) {
    u = inp.width.si / h;
  } else {
    const target = (inp.targetZ0 as Quantity).si;
    const zAtLo = evaluate(uLo, er, tn, model).z0;
    const zAtHi = evaluate(uHi, er, tn, model).z0;
    if (!(target <= zAtLo && target >= zAtHi)) {
      return failure(
        'OUT_OF_DOMAIN',
        'targetZ0',
        `The target Z0 ${num(target)} ohm is unreachable for er ${num(er)}: inside the validity range ${String(uLo)} <= w/h <= ${String(uHi)} this model gives Z0 from ${num(zAtHi)} ohm (w/h = ${String(uHi)}) to ${num(zAtLo)} ohm (w/h = ${String(uLo)}). The target is outside the range the model covers; change er or the target.`,
      );
    }
    const s = brent((x: number) => evaluate(x, er, tn, model).z0 - target, uLo, uHi, { xtol: 1e-14, maxIter: 200 });
    if (!s.ok) return failure('NO_CONVERGENCE', 'targetZ0', `The width solve did not converge (${s.reason}: ${s.message}).`);
    u = s.x;
    solved = true;
    bracketNote = `Bracketed Brent on the analysis function over ${String(uLo)} <= w/h <= ${String(uHi)} (Z0 decreases monotonically with w/h); ${String(s.iterations)} iterations, bracket width ${num(s.bracket[1] - s.bracket[0])}.`;
  }
  if (!Number.isFinite(u) || u <= 0) return failure('OUT_OF_DOMAIN', 'width', 'width / height is not finite (check the units).');
  if (u >= meta.validity.uMaxZ01) {
    return failure('OUT_OF_DOMAIN', 'width', `w/h = ${num(u)} is at or beyond ${String(meta.validity.uMaxZ01)}, the limit up to which the Z01 equation is quoted (ledger S-020); the model is refused.`);
  }

  const ev = evaluate(u, er, tn, model);
  if (!(ev.z0 > 0) || !Number.isFinite(ev.z0) || !(ev.epsEff >= 1) || !Number.isFinite(ev.epsEff)) {
    return failure('OUT_OF_DOMAIN', 'width', 'The model gave a non-finite or non-physical value for these inputs (check the units).');
  }

  const widthQ = solved ? q(u * h, DIM.LENGTH) : (inp.width as Quantity);
  const ohms = (x: number): Quantity => q(x, DIM.RESISTANCE);
  const dl = dimensionless;

  // Inputs with provenance (all user-entered; the labels name where er and the geometry came from).
  const srcDetail = (label: string | undefined): { sourceDetail?: string } => (label === undefined ? {} : { sourceDetail: label });
  const inputs: CalcInput[] = [];
  if (inp.width !== undefined) inputs.push({ name: 'width', value: inp.width, source: 'user', ...srcDetail(inp.common.geometrySource) });
  if (inp.targetZ0 !== undefined) inputs.push({ name: 'target Z0', value: inp.targetZ0, source: 'user' });
  inputs.push({ name: 'height', value: inp.height, source: 'user', ...srcDetail(inp.common.geometrySource) });
  inputs.push({ name: 'er', value: dl(er), source: 'user', ...srcDetail(inp.common.erSource) });
  if (inp.thickness !== undefined) inputs.push({ name: 'thickness', value: inp.thickness, source: 'user', ...srcDetail(inp.common.geometrySource) });
  inputs.push(...commonInputEchoes(inp.common));

  // Steps.
  const steps: CalcResult['steps'] = [{ label: 'Width over height', expr: 'u = w / h', value: dl(u) }];
  if (model === 'none') {
    steps.push(
      { label: 'a(u)', expr: 'a = 1 + (1/49) ln[(u^4 + (u/52)^2)/(u^4 + 0.432)] + (1/18.7) ln[1 + (u/18.1)^3]', value: dl(hjA(u)) },
      { label: 'b(er)', expr: 'b = 0.564 [(er - 0.9)/(er + 3)]^0.053', value: dl(hjB(er)) },
      { label: 'Effective permittivity', expr: 'eps_e = (er + 1)/2 + (er - 1)/2 (1 + 10/u)^(-a b)', value: dl(ev.epsEff) },
      { label: 'F1(u)', expr: 'F1 = 6 + (2 pi - 6) exp[-(30.666/u)^0.7528]', value: dl(hjF1(u)) },
      { label: 'Air-line impedance', expr: 'Z01 = (eta0 / 2 pi) ln[F1/u + sqrt(1 + (2/u)^2)]', value: ohms(z01(u)) },
      { label: 'Characteristic impedance', expr: 'Z0 = Z01 / sqrt(eps_e)', value: ohms(ev.z0) },
    );
  } else {
    steps.push(
      { label: 'Normalised thickness', expr: 't/h', value: dl(tn) },
      { label: 'Width correction du1', expr: 'du1 = (t/h / pi) ln[1 + 4e / ((t/h) coth^2(sqrt(6.517 u)))]', value: dl(ev.du1 as number) },
      { label: 'Width correction dur', expr: 'dur = 1/2 [1 + 1/cosh(sqrt(er - 1))] du1', value: dl(ev.dur as number) },
      { label: 'Corrected width ratio ur', expr: 'ur = u + dur', value: dl(ev.ur as number) },
      { label: 'Effective permittivity', expr: model === 'hj-procedure-A' ? 'eps_e(t) = eps_e(ur) [Z01(u1)/Z01(ur)]^2' : 'eps_e = eps_e(ur)', value: dl(ev.epsEff) },
      { label: 'Characteristic impedance', expr: 'Z0 = Z01(ur) / sqrt(eps_e(ur))', value: ohms(ev.z0) },
    );
  }
  if (solved) steps.push({ label: 'Solver bracket', expr: bracketNote, value: dl(u) });

  const delay = delayOutputs(ev.epsEff, inp.common);
  steps.push(...delay.steps);

  // Results.
  const results: CalcResult['results'] = [];
  if (solved) {
    results.push({ name: 'trace width for target Z0', value: widthQ, role: 'primary', bound: 'nominal' });
    results.push({ name: 'characteristic impedance Z0', value: ohms(ev.z0), role: 'secondary', bound: 'nominal' });
  } else {
    results.push({ name: 'characteristic impedance Z0', value: ohms(ev.z0), role: 'primary', bound: 'nominal' });
  }
  results.push({ name: 'effective permittivity', value: dl(ev.epsEff), role: 'secondary', bound: 'nominal' });
  if (model === 'none') results.push({ name: 'air-line impedance Z01', value: ohms(z01(u)), role: 'secondary', bound: 'nominal' });
  results.push({ name: 'width over height w/h', value: dl(u), role: 'secondary', bound: 'nominal' });
  results.push(...delay.results);
  const secondaryWarnings: CalcWarning[] = [];
  if (inp.thickness !== undefined && model === 'none') {
    if (tn < 1) {
      const va = evaluate(u, er, tn, 'hj-procedure-A');
      const diff = va.z0 / ev.z0 - 1;
      const pct = formatSignedPercent(diff, { accuracyClass: meta.accuracyClass });
      results.push(
        { name: VARIANT_A_Z0, value: ohms(va.z0), role: 'secondary', bound: 'nominal', note: `Same geometry, thickness variant A (full H-J procedure; ${THICKNESS_NO_RANGE_RECORDED}); ledger S-020a is in CONFLICT between sources. Secondary value: the headline (zero-thickness) and the confidence are unchanged.` },
        { name: VARIANT_A_EE, value: dl(va.epsEff), role: 'secondary', bound: 'nominal', note: 'Thickness variant A at the same geometry (ledger S-020a, CONFLICT). Secondary value.' },
        { name: VARIANT_A_DIFF, value: dl(diff), role: 'secondary', bound: 'nominal', note: `${pct} of the zero-thickness Z0 (signed; negative means the finite-thickness variant is lower). Ledger S-020a, CONFLICT: a labelled side value, not a correction applied to the headline.` },
      );
      secondaryWarnings.push({ severity: 'info', code: 'THICKNESS_VARIANT_SECONDARY', message: `Because a thickness was entered, the thickness variant A value at this geometry is shown as a labelled secondary result: Z0 ${num(va.z0)} ohm (${pct} against the zero-thickness headline). Ledger S-020a is in CONFLICT; the headline and the confidence are unchanged.` });
    } else {
      secondaryWarnings.push({ severity: 'info', code: 'THICKNESS_VARIANT_NOT_SHOWN', message: `The thickness variant A value is not shown: t/h = ${num(tn)} is at or above 1, outside the thickness correction's domain (geometric guard, not a sourced range).` });
    }
  }

  // Validity checks: the recorded model ranges. A failed check also forces the confidence to low.
  const outOfRange: OutOfRangeInput[] = [];
  const validityChecks: CalcResult['validityChecks'] = [];
  const warnings: CalcWarning[] = [];
  const checks = [
    rangeCheck('w/h', 'w/h', u, uLo, uHi, 'Range over which the eps_e fit is quoted (better than 0.2 %, ledger S-020).'),
    rangeCheck('er', 'er', er, meta.validity.erRange[0], meta.validity.erRange[1], 'Range over which the eps_e fit is quoted (ledger S-020).'),
  ];
  for (const c of checks) {
    validityChecks.push(c.check);
    if (c.outOfRange !== undefined) {
      outOfRange.push(c.outOfRange);
      warnings.push({ severity: 'warning', message: `Outside the model's recorded validity range: ${c.check.name} fails (${c.check.detail}) The result is an extrapolation; treat it as low confidence.`, code: 'OUT_OF_RANGE' });
    }
  }
  if (inp.thickness !== undefined) {
    validityChecks.push({
      name: 't/h reported',
      ok: true,
      detail: `t/h = ${num(tn)}; ${THICKNESS_NO_RANGE_RECORDED} (ledger S-020a is in CONFLICT), so this is informational, not a pass/fail limit. The only limit enforced is the geometric guard t < h (not a sourced range).`,
    });
  }

  // Warnings: always-shown model limits first.
  warnings.unshift(
    { severity: 'caution', message: dispersionMessage(inp.common.frequency), code: 'DISPERSION_NOT_MODELLED' },
    { severity: 'caution', message: SOLDERMASK_MESSAGE, code: 'SOLDERMASK_NOT_MODELLED' },
  );
  if (inp.thickness !== undefined && model === 'none') warnings.push({ severity: 'caution', message: ZERO_THICKNESS_MESSAGE, code: 'ZERO_THICKNESS_MODEL' }, ...secondaryWarnings);
  if (model !== 'none') warnings.push({ severity: 'warning', message: CONFLICT_MESSAGE, code: 'THICKNESS_VARIANT_CONFLICT' });
  warnings.push(...delay.warnings);

  const accuracy = 'Source-stated accuracy (Steer, ledger S-020): eps_e better than 0.2 % for 0.01 <= w/h <= 100 and 1 <= er <= 128; Z01 better than 0.1 % for w/h < 1000 (a second reading of 0.01 %/0.03 % was not confirmed, so the conservative 0.1 % is shown). No accuracy is quoted for Z0 itself.';
  const assumptions = [
    `Surface microstrip: a bare trace on a homogeneous dielectric over a reference plane, air above; the dielectric thickness h is measured to the reference plane. Embedded (buried) microstrip is not offered (no verified source).`,
    `Prefactor eta0/(2 pi) = ${Z_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (eta0 = mu0 c; decision Q-1), not the rounded 60 ohm of textbooks; Z0 is about 0.07 % lower than with 60.`,
    accuracy,
    'Copper roughness, etch (trapezoid) profile, plating and the dielectric loss are not modelled; er is the value you entered at your own frequency and has not been checked against the fabricator.',
    ...(model === 'none' ? ['Strip thickness is zero in this model (Hammerstad-Jensen zero-thickness quasi-static form).'] : [`Strip thickness handled by the opt-in H-J variant, ${variantLabel(model)} (ledger S-020a, CONFLICT); the Wheeler form of the width correction is not implemented.`]),
    ...delay.assumptions,
  ];

  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds];
  if (model !== 'none') ledgerIds.push('S-020a');
  ledgerIds.push(...extraLedgerIds);
  const loss = lossBlock({
    common: inp.common,
    er,
    modes: [{ suffix: '', epsEff: ev.epsEff }],
    conductor: { kind: 'microstrip', width: widthQ, z0: ev.z0, ...(inp.thickness !== undefined ? { thickness: inp.thickness } : {}) },
  });
  const lossDefaults = mergeLoss(loss, { inputs, steps, results, validityChecks, warnings, outOfRange, assumptions, ledgerIds });

  const method = model === 'none' ? meta.method : `Hammerstad-Jensen quasi-static microstrip with the opt-in strip-thickness variant, ${variantLabel(model)} (ledger S-020a, CONFLICT); no dispersion, no soldermask`;
  const formula = model === 'none' ? meta.formula : `${meta.formula} ${meta.thicknessFormula}`;
  return assemble({
    method,
    standard: meta.reference.standard,
    edition: meta.reference.edition,
    formula,
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
  { name: 'effective permittivity', sensitivity: true },
  { name: 'delay per length', sensitivity: true },
];

/** Nominal result plus the tolerance envelope and sensitivities (core D). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const thicknessUsed = inp.thickness !== undefined && inp.thicknessModel !== 'none';
  const fields: ImpField[] = [
    impField('width', 'width', 'width', inp.width !== undefined, solvedMessage('the width'), 'traceWidth'),
    impField('height', 'height', 'height', true, ''),
    impField('er', 'er', 'er', true, ''),
    impField('thickness', 'thickness', 'thickness', thicknessUsed, inp.thickness === undefined ? 'thickness tolerance needs a thickness; none was given.' : unusedMessage('the thickness', 'the zero-thickness model (thicknessModel none) does not use it.')),
  ];
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields, outputs: ENVELOPE_OUTPUTS, solve: { target: 'targetZ0', results: { 'trace width for target Z0': 'width' } } });
}

/** Optional fab-profile minimum check (PCB2-4): the widths and spacings this calculator solves for or is given. */
const MINIMUM_SPECS: readonly MinimumSpec[] = [{ key: 'traceWidth', label: 'trace width', input: 'width', solvedResult: 'trace width for target Z0' }];

/** Microstrip Z0, eps_e, delay and guided wavelength, or the width for a target Z0. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return withProfileMinimum(hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs), inputs, MINIMUM_SPECS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
