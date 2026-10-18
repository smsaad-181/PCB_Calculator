import { rateConfidence } from '../confidence';
import type { AccuracyClass, OutOfRangeInput } from '../confidence';
import { C_LEDGER_ID, MU0_LEDGER_ID } from '../data/constants';
import { dataStatusForLedgerIds } from '../data-status';
import { assertCalcResult } from '../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, Result } from '../result';
import { DIM, mul, q } from '../units';
import type { Quantity } from '../units';
import { guardQuantity } from './copper-converter/guards';
import { DELAY_LEDGER_IDS, SKEW_LEDGER_ID, delayPerLength, formatDelayPerLength, guidedWavelength, skewFromMismatch } from './delay-shared';

/**
 * Shared pieces of the Phase 2 impedance calculators (microstrip, stripline, coax): the mandatory banner, the common optional
 * inputs (frequency, line length, length mismatch), the delay / wavelength / skew results, and the final assembly with the
 * rule-based confidence and the schema check. No physics of any one model lives here.
 */

/** Verbatim mandatory banner (skill impedance-models). Shown in `recommendation` of every impedance result. */
export const IMPEDANCE_BANNER =
  "Approximate. Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data.";

/**
 * One standing, defaulted assumption on every impedance result: the geometry and er are nominal, user-entered values that have
 * not been checked against the fabricator's stackup. It is counted by the confidence rule as one defaulted assumption, so an
 * impedance result can never rate high (confidence capped at medium, skill impedance-models).
 */
export const STANDING_ASSUMPTION = 'nominal user-entered stackup (er, h, t) not verified against the fabricator';

export const dimensionless = (x: number): Quantity => q(x, DIM.DIMENSIONLESS);

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

export const ER_HARD_MIN = 1;
export const MAX_LABEL_LENGTH = 500;

/** Relative permittivity as a dimensionless Quantity: finite, at least 1 (a passive dielectric cannot be below vacuum). */
export function guardEr(field: string, v: unknown): Result<number, CalcError> {
  const g = guardQuantity(field, v, DIM.DIMENSIONLESS, 'dimensionless number (relative permittivity)');
  if (!g.ok) return g;
  if (g.value.si < ER_HARD_MIN) {
    return { ok: false, error: err('OUT_OF_DOMAIN', field, `${field} is ${String(g.value.si)}; relative permittivity must be at least 1.`) };
  }
  return { ok: true, value: g.value.si };
}

export function guardLabel(field: string, v: unknown): Result<string | undefined, CalcError> {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== 'string' || v.trim() === '' || v.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field} must be a non-empty text of at most ${String(MAX_LABEL_LENGTH)} characters.`) };
  }
  return { ok: true, value: v };
}

export interface CommonInputs {
  readonly frequency?: Quantity;
  readonly length?: Quantity;
  readonly lengthMismatch?: Quantity;
  readonly erSource?: string;
  readonly geometrySource?: string;
}

/** Optional inputs every impedance calculator accepts. A zero or negative value is an error, never silently ignored. */
export function validateCommon(raw: Record<string, unknown>): Result<CommonInputs, CalcError> {
  const out: { -readonly [K in keyof CommonInputs]: CommonInputs[K] } = {};
  const spec: [keyof Pick<CommonInputs, 'frequency' | 'length' | 'lengthMismatch'>, Quantity['dim'], string][] = [
    ['frequency', DIM.FREQUENCY, 'frequency (Hz)'],
    ['length', DIM.LENGTH, 'length'],
    ['lengthMismatch', DIM.LENGTH, 'length'],
  ];
  for (const [k, dim, name] of spec) {
    if (raw[k] === undefined) continue;
    const g = guardQuantity(k, raw[k], dim, name);
    if (!g.ok) return g;
    out[k] = g.value;
  }
  for (const k of ['erSource', 'geometrySource'] as const) {
    const g = guardLabel(k, raw[k]);
    if (!g.ok) return g;
    if (g.value !== undefined) out[k] = g.value;
  }
  return { ok: true, value: out };
}

export const isObject = isRecord;

/** The optional input echoes shared by every calculator. */
export function commonInputEchoes(c: CommonInputs): CalcInput[] {
  const out: CalcInput[] = [];
  if (c.frequency !== undefined) out.push({ name: 'frequency', value: c.frequency, source: 'user' });
  if (c.length !== undefined) out.push({ name: 'line length', value: c.length, source: 'user' });
  if (c.lengthMismatch !== undefined) out.push({ name: 'length mismatch', value: c.lengthMismatch, source: 'user' });
  return out;
}

export interface DelayOutputs {
  readonly results: CalcResult['results'];
  readonly steps: CalcResult['steps'];
  readonly warnings: CalcWarning[];
  readonly assumptions: string[];
  readonly ledgerIds: string[];
}

const SKEW_CAUTION =
  'Skew uses one eps_eff for both traces, so both must be the same structure on the same layer; microstrip and stripline segments must be summed separately. Fibre-weave skew is not modelled and can add to it.';

/** Delay per length, optional line delay, guided wavelength and skew from one eps_eff (S-029, S-029a, S-029b). */
export function delayOutputs(epsEff: number, c: CommonInputs): DelayOutputs {
  const tpd = delayPerLength(epsEff);
  const results: CalcResult['results'] = [
    { name: 'delay per length', value: tpd, role: 'secondary', bound: 'prediction', note: formatDelayPerLength(tpd, 'prediction') },
  ];
  const steps: CalcResult['steps'] = [{ label: 'Delay per length', expr: 't_pd = sqrt(eps_eff) / c, c = 299 792 458 m/s exactly', value: tpd, bound: 'prediction' }];
  const warnings: CalcWarning[] = [];
  const assumptions: string[] = [
    'Delay and wavelength use the exact speed of light c = 299 792 458 m/s (S-029), not 3e8 m/s or an app-note figure such as 85 ps/in.',
  ];
  const ledgerIds = [...DELAY_LEDGER_IDS];
  if (c.length !== undefined) {
    const total = mul(tpd, c.length);
    results.push({ name: 'propagation delay', value: total, role: 'secondary', bound: 'prediction' });
    steps.push({ label: 'Propagation delay', expr: 't = t_pd x line length', value: total, bound: 'prediction' });
  }
  if (c.frequency !== undefined) {
    const lam = guidedWavelength(epsEff, c.frequency);
    results.push({ name: 'guided wavelength', value: lam, role: 'secondary', bound: 'nominal' });
    steps.push({ label: 'Guided wavelength', expr: 'lambda_g = c / (f x sqrt(eps_eff))', value: lam });
  }
  if (c.lengthMismatch !== undefined) {
    const sk = skewFromMismatch(c.lengthMismatch, epsEff);
    results.push({ name: 'skew from length mismatch', value: sk, role: 'secondary', bound: 'prediction' });
    steps.push({ label: 'Skew', expr: 'skew = |delta L| x t_pd (derived, ledger S-029b UNVERIFIED)', value: sk, bound: 'prediction' });
    warnings.push({ severity: 'caution', message: SKEW_CAUTION, code: 'SKEW_SCOPE' });
    ledgerIds.push(SKEW_LEDGER_ID);
  }
  return { results, steps, warnings, assumptions, ledgerIds };
}

/** Rows every impedance result relies on for its constants: mu0 (S-013) and c (S-029). */
export const CONSTANT_LEDGER_IDS: readonly string[] = [MU0_LEDGER_ID, C_LEDGER_ID];

export interface RangeCheck {
  readonly check: CalcResult['validityChecks'][number];
  readonly outOfRange?: OutOfRangeInput;
}

/** A validity check "lo <= x <= hi" with the structured out-of-range entry that forces the confidence to low when it fails. */
export function rangeCheck(name: string, label: string, x: number, lo: number, hi: number, detail: string): RangeCheck {
  const ok = x >= lo * (1 - 1e-12) && x <= hi * (1 + 1e-12);
  const shownValue = String(Number(x.toPrecision(5)));
  const bound = `${String(lo)} to ${String(hi)}`;
  return {
    check: { name: `${label} within ${bound}`, ok, detail: `${detail} ${name} = ${shownValue}.` },
    ...(ok ? {} : { outOfRange: { name, value: shownValue, bound } }),
  };
}

export interface AssembleArgs {
  readonly method: string;
  readonly standard: string;
  readonly edition: string;
  readonly formula: string;
  readonly accuracyClass: AccuracyClass;
  readonly ledgerIds: readonly string[];
  readonly inputs: CalcInput[];
  readonly assumptions: string[];
  readonly steps: CalcResult['steps'];
  readonly results: CalcResult['results'];
  readonly validityChecks: CalcResult['validityChecks'];
  readonly warnings: CalcWarning[];
  readonly outOfRange: OutOfRangeInput[];
  readonly recommendationExtra?: string;
}

/** Rates the confidence by the rule, builds the CalcResult, and runs the schema check. */
export function assemble(a: AssembleArgs): CalcOutcome {
  const ids = [...new Set(a.ledgerIds)];
  // dataStatus shows the worst row relied on, S-029b (skew, derived, UNVERIFIED) included. The confidence score does not count
  // S-029b: skew is a separate output that does not touch Z0 or eps_e, and a reason line says so (same pattern as the S-009
  // handling in trace-resistance).
  const dataStatus = dataStatusForLedgerIds(ids);
  const skewUsed = ids.includes(SKEW_LEDGER_ID);
  const confidence = rateConfidence({
    outOfRangeInputs: a.outOfRange,
    defaultedAssumptions: [STANDING_ASSUMPTION],
    accuracyClass: a.accuracyClass,
    dataStatus: skewUsed ? dataStatusForLedgerIds(ids.filter((id) => id !== SKEW_LEDGER_ID)) : dataStatus,
  });
  if (skewUsed) {
    confidence.reasons.push('The skew output rests on ledger S-029b (UNVERIFIED, derived from the delay); it does not change Z0 or eps_e, so it is shown through the data status and not counted in the score.');
  }
  for (const r of a.results) {
    if (!Number.isFinite(r.value.si)) return { ok: false, error: err('OUT_OF_DOMAIN', r.name, `Result "${r.name}" is not finite for these inputs (check the units).`) };
  }
  const result: CalcResult = {
    method: a.method,
    reference: { standard: a.standard, edition: a.edition, ledgerIds: ids },
    formula: a.formula,
    inputs: a.inputs,
    assumptions: [
      `Standing assumption (counted in the confidence score): ${STANDING_ASSUMPTION}.`,
      ...a.assumptions,
    ],
    steps: a.steps,
    results: a.results,
    validityChecks: a.validityChecks,
    warnings: a.warnings,
    confidence,
    recommendation: a.recommendationExtra === undefined ? IMPEDANCE_BANNER : `${IMPEDANCE_BANNER} ${a.recommendationExtra}`,
    dataStatus,
    designValues: [],
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
  return { ok: true, value: result };
}
