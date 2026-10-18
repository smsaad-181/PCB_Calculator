import { Z_PREFACTOR_OHM } from '../../data/constants';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q } from '../../units';
import type { Quantity } from '../../units';
import type { OutOfRangeInput } from '../../confidence';
import { impField, runEnvelope, solvedMessage } from '../impedance-envelope';
import type { EnvelopeInputs, ImpField } from '../impedance-envelope';
import { CONSTANT_LEDGER_IDS, assemble, commonInputEchoes, delayOutputs, dimensionless } from '../impedance-shared';
import type { LossInputs } from '../impedance-shared';
import { lossBlock, mergeLoss } from '../loss-shared';
import { hasTolerances } from '../tolerance-shared';
import type { OutputPlan } from '../tolerance-shared';
import { validate } from './guards';
import { meta } from './meta';

/** Public input shape. Analysis: both diameters. Solve: targetZ0 and exactly one diameter. er is a dimensionless Quantity. */
export interface Inputs extends LossInputs, EnvelopeInputs {
  outerDiameter?: Quantity;
  innerDiameter?: Quantity;
  targetZ0?: Quantity;
  er: Quantity;
  frequency?: Quantity;
  length?: Quantity;
  lengthMismatch?: Quantity;
  erSource?: string;
  geometrySource?: string;
}

/** S-024: Z0 = (eta0/2 pi) ln(D/d) / sqrt(er), mur = 1, with the Q-1 prefactor. */
export function coaxZ0(ratio: number, er: number): number {
  return (Z_PREFACTOR_OHM * Math.log(ratio)) / Math.sqrt(er);
}

/** Inverse of S-024: D/d = exp(Z0 sqrt(er) / (eta0/2 pi)). */
export function diameterRatioForZ0(z0: number, er: number): number {
  return Math.exp((z0 * Math.sqrt(er)) / Z_PREFACTOR_OHM);
}

const TEM_MESSAGE =
  'TEM only: this is the ideal-line formula for the fundamental TEM mode. Higher-order modes are not checked: the cutoff of the first one was not researched and is not computed, so the upper frequency limit is unknown; eccentricity, braid and connector effects are not modelled.';

const num = (x: number): string => String(Number(x.toPrecision(5)));
const failure = (code: CalcError['code'], field: string, message: string): CalcOutcome => ({ ok: false, error: { code, field, message } });

function build(raw: unknown, extraLedgerIds: readonly string[] = []): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const er = inp.er;
  const dl = dimensionless;
  const ohms = (n: number): Quantity => q(n, DIM.RESISTANCE);

  let D: Quantity;
  let d: Quantity;
  let solved: 'outer' | 'inner' | undefined;
  if (inp.targetZ0 !== undefined) {
    const ratio = diameterRatioForZ0(inp.targetZ0.si, er);
    if (!Number.isFinite(ratio) || !(ratio > 1)) {
      return failure('OUT_OF_DOMAIN', 'targetZ0', `The target Z0 ${num(inp.targetZ0.si)} ohm gives a non-finite diameter ratio D/d for er ${num(er)}; check the target.`);
    }
    if (inp.innerDiameter !== undefined) {
      d = inp.innerDiameter;
      D = q(d.si * ratio, DIM.LENGTH);
      solved = 'outer';
    } else {
      D = inp.outerDiameter as Quantity;
      d = q(D.si / ratio, DIM.LENGTH);
      solved = 'inner';
    }
  } else {
    D = inp.outerDiameter as Quantity;
    d = inp.innerDiameter as Quantity;
  }
  const ratio = D.si / d.si;
  if (!Number.isFinite(ratio) || !(ratio > 1)) return failure('OUT_OF_DOMAIN', 'outerDiameter', 'D/d is not finite or not above 1 (check the units).');
  const z0 = coaxZ0(ratio, er);
  if (!Number.isFinite(z0) || !(z0 > 0)) return failure('OUT_OF_DOMAIN', 'outerDiameter', 'The model gave a non-finite value for these inputs (check the units).');

  const srcDetail = (label: string | undefined): { sourceDetail?: string } => (label === undefined ? {} : { sourceDetail: label });
  const inputs: CalcInput[] = [];
  if (inp.outerDiameter !== undefined) inputs.push({ name: 'outer diameter D', value: inp.outerDiameter, source: 'user', ...srcDetail(inp.common.geometrySource) });
  if (inp.innerDiameter !== undefined) inputs.push({ name: 'inner diameter d', value: inp.innerDiameter, source: 'user', ...srcDetail(inp.common.geometrySource) });
  if (inp.targetZ0 !== undefined) inputs.push({ name: 'target Z0', value: inp.targetZ0, source: 'user' });
  inputs.push({ name: 'er', value: dl(er), source: 'user', ...srcDetail(inp.common.erSource) });
  inputs.push(...commonInputEchoes(inp.common));

  const steps: CalcResult['steps'] = [];
  if (solved !== undefined) {
    steps.push({ label: 'Diameter ratio', expr: 'D/d = exp(Z0 sqrt(er) / (eta0 / 2 pi))', value: dl(ratio) });
  } else {
    steps.push({ label: 'Diameter ratio', expr: 'D/d', value: dl(ratio) });
  }
  steps.push({ label: 'Characteristic impedance', expr: 'Z0 = (eta0 / 2 pi) ln(D/d) / sqrt(er)', value: ohms(z0) });
  const delay = delayOutputs(er, inp.common); // TEM, homogeneous dielectric: eps_eff = er
  steps.push(...delay.steps);

  const results: CalcResult['results'] = [];
  if (solved === 'outer') results.push({ name: 'outer diameter for target Z0', value: D, role: 'primary', bound: 'nominal' });
  else if (solved === 'inner') results.push({ name: 'inner diameter for target Z0', value: d, role: 'primary', bound: 'nominal' });
  results.push({ name: 'characteristic impedance Z0', value: ohms(z0), role: solved === undefined ? 'primary' : 'secondary', bound: 'nominal' });
  results.push({ name: 'effective permittivity', value: dl(er), role: 'secondary', bound: 'nominal', note: 'TEM in a homogeneous dielectric: eps_eff = er' });
  results.push({ name: 'diameter ratio D/d', value: dl(ratio), role: 'secondary', bound: 'nominal' });
  results.push(...delay.results);

  const validityChecks: CalcResult['validityChecks'] = [
    { name: 'D > d', ok: true, detail: `Concentric round conductors need D > d; D/d = ${num(ratio)}. This is a domain condition; no accuracy range is recorded for the ideal formula (Steer: "Exact").` },
  ];
  const warnings: CalcWarning[] = [{ severity: 'caution', message: TEM_MESSAGE, code: 'TEM_ONLY' }, ...delay.warnings];
  const assumptions = [
    'Ideal coaxial line: concentric round conductors, lossless, homogeneous isotropic dielectric, mu_r = 1, fundamental TEM mode. Diameters or radii give the same ratio.',
    `Prefactor eta0/(2 pi) = ${Z_PREFACTOR_OHM.toFixed(4)} ohm from exact constants (eta0 = mu0 c; decision Q-1), not the rounded 60 ohm; Z0 is about 0.07 % lower than with 60.`,
    'Accuracy: the formula is exact for the ideal geometry (Steer: "Exact"); real cables differ through eccentricity, dielectric inhomogeneity and surface condition, none of which is modelled. er is the value you entered and has not been checked against the manufacturer.',
    ...delay.assumptions,
  ];
  const ledgerIds = [...meta.reference.ledgerIds, ...CONSTANT_LEDGER_IDS, ...delay.ledgerIds, ...extraLedgerIds];
  const outOfRange: OutOfRangeInput[] = [];
  const loss = lossBlock({ common: inp.common, er, modes: [{ suffix: '', epsEff: er }], conductor: { kind: 'coax', outer: D, inner: d, z0 } });
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
  { name: 'characteristic impedance Z0', sensitivity: true },
  { name: 'effective permittivity', sensitivity: true, onlyIfVaries: true },
  { name: 'delay per length', sensitivity: true, onlyIfVaries: true },
];

/** Nominal result plus the tolerance envelope and sensitivities (core D). */
function buildWithEnvelope(raw: Inputs): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const fields: ImpField[] = [
    impField('outerDiameter', 'outerDiameter', 'outer diameter', inp.outerDiameter !== undefined, solvedMessage('the outer diameter')),
    impField('innerDiameter', 'innerDiameter', 'inner diameter', inp.innerDiameter !== undefined, solvedMessage('the inner diameter')),
    impField('er', 'er', 'er', true, ''),
  ];
  const results = { 'outer diameter for target Z0': 'outerDiameter', 'inner diameter for target Z0': 'innerDiameter' };
  return runEnvelope({ raw, build: (i: Inputs, extra) => build(i, extra), fields, outputs: ENVELOPE_OUTPUTS, solve: { target: 'targetZ0', results } });
}

/** Coax Z0, delay and guided wavelength, or a diameter for a target Z0. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return hasTolerances(inputs) ? buildWithEnvelope(inputs) : build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
