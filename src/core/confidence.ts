export type AccuracyClass = 'exact' | 'analytical' | 'empirical' | 'estimate';
export type DataStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceFactors {
  readonly outOfRangeInputs: readonly string[];
  readonly defaultedAssumptions: readonly string[];
  readonly accuracyClass: AccuracyClass;
  readonly dataStatus: DataStatus;
}

export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly reasons: string[];
}

/** Rule weights (score points). */
export const WEIGHT_OUT_OF_RANGE_PER_INPUT = 2;
export const WEIGHT_DEFAULTED_PER_ASSUMPTION = 1;
export const CAP_DEFAULTED = 2;
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

export const CONFIDENCE_RULE_TEXT =
  'Confidence score = 2 x (inputs outside validity range) + min(defaulted assumptions, 2) ' +
  '+ accuracy class (exact 0, analytical 0, empirical 1, estimate 2) ' +
  '+ data status (VERIFIED 0, UNVERIFIED 1, PAYWALLED 2, CONFLICT 2). ' +
  'Score 0 = high; 1-2 = medium; 3 or more = low.';

export function confidenceScore(f: ConfidenceFactors): number {
  return (
    WEIGHT_OUT_OF_RANGE_PER_INPUT * f.outOfRangeInputs.length +
    Math.min(WEIGHT_DEFAULTED_PER_ASSUMPTION * f.defaultedAssumptions.length, CAP_DEFAULTED) +
    WEIGHT_ACCURACY[f.accuracyClass] +
    WEIGHT_DATA_STATUS[f.dataStatus]
  );
}

export function rateConfidence(f: ConfidenceFactors): Confidence {
  const reasons: string[] = [];
  for (const name of f.outOfRangeInputs) {
    reasons.push(`Input "${name}" is outside the method's validity range.`);
  }
  if (f.defaultedAssumptions.length > 0) {
    reasons.push(`Defaulted assumptions used: ${f.defaultedAssumptions.join(', ')}.`);
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
  const s = confidenceScore(f);
  const level: ConfidenceLevel = s === 0 ? 'high' : s <= MEDIUM_MAX_SCORE ? 'medium' : 'low';
  return { level, reasons };
}
