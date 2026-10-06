import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_RULE_TEXT,
  MEDIUM_MAX_SCORE,
  WEIGHT_ACCURACY,
  WEIGHT_DATA_STATUS,
  WEIGHT_DEFAULTED_PER_ASSUMPTION,
  WEIGHT_OUT_OF_RANGE_PER_INPUT,
  WEIGHT_SAFETY_RELEVANT_DEFAULT,
} from './confidence';

/* The displayed rule must not drift from the implemented weights (domain review P-1). */
const text = CONFIDENCE_RULE_TEXT;

/** `label` followed, within the same clause, by the whole-number token n. */
function labelThenNumber(label: string, n: number): RegExp {
  return new RegExp(`${label}[^.;]{0,40}?(?<![\\d.])${n}(?![\\d.])`, 'i');
}
/** whole-number token n followed, within the same clause, by `label`. */
function numberThenLabel(label: string, n: number): RegExp {
  return new RegExp(`(?<![\\d.])${n}(?![\\d.])[^.;]{0,40}?${label}`, 'i');
}

describe('CONFIDENCE_RULE_TEXT', () => {
  it('is a non-empty string', () => {
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(50);
  });
  it('states the out-of-range override: any such input forces level low regardless of score', () => {
    expect(text).toMatch(/validity range/i);
    expect(text).toMatch(/forc(e|es|ed)/i);
    expect(text).toMatch(/low/i);
    expect(text).toMatch(/regardless of (the )?score|independent of (the )?score/i);
  });
  it('states the out-of-range weight (either "2 x ... range" or "range ... 2")', () => {
    const n = WEIGHT_OUT_OF_RANGE_PER_INPUT;
    expect(text).toSatisfy(
      (t: string) => numberThenLabel('range', n).test(t) || labelThenNumber('out(side)?[ -]of[ -]range', n).test(t),
    );
  });
  it('states the defaulted-assumption weight, uncapped, with no min() cap', () => {
    expect(text).toMatch(/defaulted/i);
    const n = WEIGHT_DEFAULTED_PER_ASSUMPTION;
    expect(text).toSatisfy(
      (t: string) => numberThenLabel('defaulted', n).test(t) || labelThenNumber('defaulted', n).test(t),
    );
    expect(text).toMatch(/uncapped|no cap|not capped|without (a )?cap/i);
    expect(text).not.toMatch(/min\(/i);
    expect(text).not.toMatch(/capped at/i);
  });
  it('states the safety-relevant default weight', () => {
    const n = WEIGHT_SAFETY_RELEVANT_DEFAULT;
    expect(text).toMatch(/safety[- ]relevant/i);
    expect(text).toSatisfy(
      (t: string) => numberThenLabel('safety[- ]relevant', n).test(t) || labelThenNumber('safety[- ]relevant', n).test(t),
    );
  });
  it.each(Object.entries(WEIGHT_ACCURACY))('states accuracy class %s with weight %i', (k, w) => {
    expect(text).toMatch(labelThenNumber(k, w));
  });
  it.each(Object.entries(WEIGHT_DATA_STATUS))('states data status %s with weight %i', (k, w) => {
    expect(text).toMatch(labelThenNumber(k, w));
  });
  it('states the level thresholds', () => {
    expect(text).toMatch(/0\s*=\s*high/i);
    expect(text).toMatch(new RegExp(`1\\s*[-\\u2013]\\s*${MEDIUM_MAX_SCORE}\\s*=\\s*medium`, 'i'));
    expect(text).toMatch(new RegExp(`${MEDIUM_MAX_SCORE + 1}\\s*(or more|\\+)?\\s*=\\s*low`, 'i'));
  });
});
