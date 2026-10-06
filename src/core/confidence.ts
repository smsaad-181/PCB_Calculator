export type AccuracyClass = 'exact' | 'analytical' | 'empirical' | 'estimate';
export type DataStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceFactors {
  readonly outOfRangeInputs: readonly string[];
  readonly defaultedAssumptions: readonly string[];
  /** Defaulted assumptions that bear on safety (e.g. max temperature, derating). Optional. */
  readonly safetyRelevantDefaults?: readonly string[];
  readonly accuracyClass: AccuracyClass;
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
  `+ ${WEIGHT_SAFETY_RELEVANT_DEFAULT} x (safety-relevant defaults) ` +
  `+ accuracy class (exact ${A.exact}, analytical ${A.analytical}, empirical ${A.empirical}, estimate ${A.estimate}) ` +
  `+ data status (VERIFIED ${D.VERIFIED}, UNVERIFIED ${D.UNVERIFIED}, PAYWALLED ${D.PAYWALLED}, CONFLICT ${D.CONFLICT}). ` +
  `Score 0 = high; 1-${MEDIUM_MAX_SCORE} = medium; ${MEDIUM_MAX_SCORE + 1} or more = low. ` +
  "Any input outside the model's validity range forces the level to low regardless of score.";

export function confidenceScore(f: ConfidenceFactors): number {
  return (
    WEIGHT_OUT_OF_RANGE_PER_INPUT * f.outOfRangeInputs.length +
    WEIGHT_DEFAULTED_PER_ASSUMPTION * f.defaultedAssumptions.length +
    WEIGHT_SAFETY_RELEVANT_DEFAULT * (f.safetyRelevantDefaults?.length ?? 0) +
    WEIGHT_ACCURACY[f.accuracyClass] +
    WEIGHT_DATA_STATUS[f.dataStatus]
  );
}

export function rateConfidence(f: ConfidenceFactors): Confidence {
  const reasons: string[] = [];
  for (const name of f.outOfRangeInputs) {
    reasons.push(`Input "${name}" is outside the method's validity range.`);
  }
  if (f.outOfRangeInputs.length > 0) {
    const names = f.outOfRangeInputs.map((n) => `"${n}"`).join(', ');
    reasons.push(
      `Confidence level forced to low because input(s) ${names} are outside the model's validity range.`,
    );
  }
  if (f.defaultedAssumptions.length > 0) {
    reasons.push(`Defaulted assumptions used: ${f.defaultedAssumptions.join(', ')}.`);
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
  if (f.dataStatus === 'UNVERIFIED') {
    reasons.push('Underlying data is UNVERIFIED in the source ledger.');
  } else if (f.dataStatus === 'PAYWALLED') {
    reasons.push('Underlying data is PAYWALLED and must be verified by the user.');
  } else if (f.dataStatus === 'CONFLICT') {
    reasons.push('Underlying data is in CONFLICT between sources in the ledger; the value is unresolved.');
  }
  const score = confidenceScore(f);
  const level: ConfidenceLevel =
    f.outOfRangeInputs.length > 0 ? 'low' : score === 0 ? 'high' : score <= MEDIUM_MAX_SCORE ? 'medium' : 'low';
  return { level, reasons, score };
}
