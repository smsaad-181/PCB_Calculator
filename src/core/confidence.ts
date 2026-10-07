import type { CalcInput } from './result';

export type AccuracyClass = 'exact' | 'analytical' | 'empirical' | 'estimate';
export type DataStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** An out-of-range input: a bare name, or the name with the offending value and the allowed range (preferred). */
export type OutOfRangeInput = string | { readonly name: string; readonly value: string; readonly bound: string };

/** Typed failure for malformed confidence factors; a rating is never produced from unknown data. */
export class ConfidenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfidenceInputError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ConfidenceFactors {
  readonly outOfRangeInputs: readonly OutOfRangeInput[];
  readonly defaultedAssumptions: readonly string[];
  /** Defaulted assumptions that bear on safety (e.g. max temperature, derating). Optional. */
  readonly safetyRelevantDefaults?: readonly string[];
  readonly accuracyClass: AccuracyClass;
  /** The ledger spelling PAYWALLED-USER-MUST-VERIFY is accepted as an alias of PAYWALLED. */
  readonly dataStatus: DataStatus;
}

export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly reasons: string[];
  readonly score: number;
}

/** Rule weights (score points). */
export const WEIGHT_OUT_OF_RANGE_PER_INPUT = 2;
export const WEIGHT_DEFAULTED_PER_ASSUMPTION = 1;
export const WEIGHT_SAFETY_RELEVANT_DEFAULT = 2;
export const WEIGHT_ACCURACY: Readonly<Record<AccuracyClass, number>> = {
  exact: 0,
  analytical: 0,
  empirical: 1,
  estimate: 2,
};
export const WEIGHT_DATA_STATUS: Readonly<Record<DataStatus, number>> = {
  VERIFIED: 0,
  UNVERIFIED: 1,
  PAYWALLED: 2,
  CONFLICT: 2,
};
/** score 0 -> high; 1..MEDIUM_MAX_SCORE -> medium; above -> low. */
export const MEDIUM_MAX_SCORE = 2;

const A = WEIGHT_ACCURACY;
const D = WEIGHT_DATA_STATUS;

export const CONFIDENCE_RULE_TEXT =
  `Confidence score = ${WEIGHT_OUT_OF_RANGE_PER_INPUT} x (inputs outside validity range) ` +
  `+ ${WEIGHT_DEFAULTED_PER_ASSUMPTION} x (defaulted assumptions, uncapped) ` +
  `+ ${WEIGHT_SAFETY_RELEVANT_DEFAULT} x (safety-relevant defaults; a name listed as both defaulted and safety-relevant counts once, at the safety-relevant weight) ` +
  `+ accuracy class (exact ${A.exact}, analytical ${A.analytical}, empirical ${A.empirical}, estimate ${A.estimate}) ` +
  `+ data status (VERIFIED ${D.VERIFIED}, UNVERIFIED ${D.UNVERIFIED}, PAYWALLED ${D.PAYWALLED}, CONFLICT ${D.CONFLICT}). ` +
  `Score 0 = high; 1-${MEDIUM_MAX_SCORE} = medium; ${MEDIUM_MAX_SCORE + 1} or more = low. ` +
  "Any input outside the model's validity range forces the level to low regardless of score.";

const LEDGER_PAYWALLED_SPELLING = 'PAYWALLED-USER-MUST-VERIFY';

function normalizeDataStatus(s: unknown): DataStatus {
  const key = s === LEDGER_PAYWALLED_SPELLING ? 'PAYWALLED' : s;
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(WEIGHT_DATA_STATUS, key)) {
    throw new ConfidenceInputError(`Unknown data status "${String(s)}"; expected one of ${Object.keys(WEIGHT_DATA_STATUS).join(', ')}.`);
  }
  return key as DataStatus;
}

const oorName = (e: OutOfRangeInput): string => (typeof e === 'string' ? e : e.name);
/** A bare name is the whole reason; names too short to read as a sentence get a suffix (reasons must be readable). */
const oorText = (e: OutOfRangeInput): string =>
  typeof e === 'string' ? (e.trim().length > 3 ? e : `${e} (outside validity range)`) : `${e.name} = ${e.value} (allowed: ${e.bound})`;

/** Defaulted assumptions that are not also safety-relevant (a shared name counts once, at the safety weight). */
function ordinaryDefaults(f: ConfidenceFactors): string[] {
  const safety = new Set(f.safetyRelevantDefaults ?? []);
  return f.defaultedAssumptions.filter((n) => !safety.has(n));
}

export function confidenceScore(f: ConfidenceFactors): number {
  const status = normalizeDataStatus(f.dataStatus);
  return (
    WEIGHT_OUT_OF_RANGE_PER_INPUT * f.outOfRangeInputs.length +
    WEIGHT_DEFAULTED_PER_ASSUMPTION * ordinaryDefaults(f).length +
    WEIGHT_SAFETY_RELEVANT_DEFAULT * (f.safetyRelevantDefaults?.length ?? 0) +
    WEIGHT_ACCURACY[f.accuracyClass] +
    WEIGHT_DATA_STATUS[status]
  );
}

export function rateConfidence(f: ConfidenceFactors): Confidence {
  const status = normalizeDataStatus(f.dataStatus);
  const reasons: string[] = [];
  const oor = [...f.outOfRangeInputs].sort((a, b) => {
    const x = oorName(a);
    const y = oorName(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const seen = new Set<string>();
  for (const e of oor) {
    const n = oorName(e);
    if (seen.has(n)) continue;
    seen.add(n);
    reasons.push(oorText(e));
  }
  if (oor.length > 0) {
    reasons.push(`Confidence level forced to low: ${String(oor.length)} input(s) are outside the model's validity range.`);
  }
  const defaulted = ordinaryDefaults(f);
  if (defaulted.length > 0) {
    reasons.push(`Defaulted assumptions used: ${defaulted.join(', ')}.`);
  }
  const safety = f.safetyRelevantDefaults ?? [];
  if (safety.length > 0) {
    reasons.push(`Safety-relevant values were defaulted, not user-supplied: ${safety.join(', ')}.`);
  }
  if (f.accuracyClass === 'empirical') {
    reasons.push('Method is empirical (curve-fit accuracy class).');
  } else if (f.accuracyClass === 'estimate') {
    reasons.push('Method is an estimate (low accuracy class).');
  }
  if (status === 'UNVERIFIED') {
    reasons.push('Underlying data is UNVERIFIED in the source ledger.');
  } else if (status === 'PAYWALLED') {
    reasons.push('Underlying data is PAYWALLED and must be verified by the user.');
  } else if (status === 'CONFLICT') {
    reasons.push('Underlying data is in CONFLICT between sources in the ledger; the value is unresolved.');
  }
  const score = confidenceScore(f);
  const level: ConfidenceLevel =
    f.outOfRangeInputs.length > 0 ? 'low' : score === 0 ? 'high' : score <= MEDIUM_MAX_SCORE ? 'medium' : 'low';
  return { level, reasons, score };
}

export interface ConfidenceFromInputsArgs {
  readonly inputs: readonly CalcInput[];
  /** Input names whose defaulting bears on safety; each must be one of the inputs. */
  readonly safetyRelevant?: readonly string[];
  readonly outOfRange?: readonly OutOfRangeInput[];
  readonly accuracyClass: AccuracyClass;
  readonly dataStatus: DataStatus;
}

/** Derive confidence factors from input provenance so a calculator cannot default an input and still rate high. */
export function confidenceFactorsFromInputs(a: ConfidenceFromInputsArgs): ConfidenceFactors {
  const names = new Set(a.inputs.map((i) => i.name));
  const safetyNames = new Set(a.safetyRelevant ?? []);
  for (const n of safetyNames) {
    if (!names.has(n)) throw new ConfidenceInputError(`safetyRelevant names "${n}", which is not one of the inputs.`);
  }
  const defaultedInputs = a.inputs.filter((i) => i.source === 'default' || i.source === 'preset');
  return {
    outOfRangeInputs: [...(a.outOfRange ?? [])],
    defaultedAssumptions: defaultedInputs.filter((i) => !safetyNames.has(i.name)).map((i) => i.name),
    safetyRelevantDefaults: defaultedInputs.filter((i) => safetyNames.has(i.name)).map((i) => i.name),
    accuracyClass: a.accuracyClass,
    dataStatus: a.dataStatus,
  };
}
