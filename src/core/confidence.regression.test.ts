import { describe, expect, it } from 'vitest';
import { WEIGHT_DATA_STATUS, confidenceScore, rateConfidence, type DataStatus } from './confidence';

/* Calc-validator finding m-2: DataStatus includes CONFLICT, weight 2 (same as PAYWALLED). */
const base = {
  outOfRangeInputs: [] as string[],
  defaultedAssumptions: [] as string[],
  accuracyClass: 'exact' as const,
};

describe('confidence: CONFLICT data status', () => {
  // Widened through string so this file type-checks before and after DataStatus gains 'CONFLICT'.
  const conflictText: string = 'CONFLICT';
  const CONFLICT = conflictText as DataStatus;
  it('has weight 2, equal to PAYWALLED', () => {
    expect(WEIGHT_DATA_STATUS[CONFLICT]).toBe(2);
    expect(WEIGHT_DATA_STATUS[CONFLICT]).toBe(WEIGHT_DATA_STATUS.PAYWALLED);
  });
  it('scores 2 on its own and is never better than UNVERIFIED', () => {
    expect(confidenceScore({ ...base, dataStatus: CONFLICT })).toBe(2);
    expect(confidenceScore({ ...base, dataStatus: CONFLICT })).toBeGreaterThan(
      confidenceScore({ ...base, dataStatus: 'UNVERIFIED' }),
    );
  });
  it('rates medium alone and low with one more point', () => {
    expect(rateConfidence({ ...base, dataStatus: CONFLICT }).level).toBe('medium');
    expect(rateConfidence({ ...base, accuracyClass: 'empirical', dataStatus: CONFLICT }).level).toBe('low');
  });
  it('has its own reason text mentioning "conflict", distinct from the PAYWALLED text', () => {
    const c = rateConfidence({ ...base, dataStatus: CONFLICT }).reasons;
    const p = rateConfidence({ ...base, dataStatus: 'PAYWALLED' }).reasons;
    expect(c).toHaveLength(1);
    expect(c.join(' ')).toMatch(/conflict/i);
    expect(c).not.toEqual(p);
    expect(p.join(' ')).not.toMatch(/conflict/i);
  });
});
