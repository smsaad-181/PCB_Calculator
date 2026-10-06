import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as conf from './confidence';
import {
  WEIGHT_ACCURACY,
  WEIGHT_DATA_STATUS,
  WEIGHT_DEFAULTED_PER_ASSUMPTION,
  WEIGHT_OUT_OF_RANGE_PER_INPUT,
  WEIGHT_SAFETY_RELEVANT_DEFAULT,
  confidenceScore,
  rateConfidence,
} from './confidence';

/*
 * Documented rule (deterministic), Phase 1 task 0(a) / domain review P-1:
 *   score = 2 * (#outOfRangeInputs)
 *         + 1 * (#defaultedAssumptions)          (UNCAPPED; the old min(.,2) cap is removed)
 *         + 2 * (#safetyRelevantDefaults)        (optional factor, defaults to none)
 *         + accuracy(exact 0, analytical 0, empirical 1, estimate 2)
 *         + dataStatus(VERIFIED 0, UNVERIFIED 1, PAYWALLED 2, CONFLICT 2)
 *   level by score: 0 -> high; 1..2 -> medium; >=3 -> low
 *   OVERRIDE: any out-of-range input forces level 'low' regardless of score (score still reported).
 *   result = { level, reasons, score }.
 *   reasons empty iff level high (score 0); every contributor is named.
 *
 * Changed vs previous version of this file (deliberate contract change from the domain review):
 *  - 'score 2 (one out-of-range) -> medium' now expects low (override).
 *  - 'defaulted-assumption contribution is capped at 2' removed; replaced by uncapped tests.
 *  - 'score 0 -> high with no reasons' now also expects score: 0 (result gained `score`).
 *  - model score() no longer caps defaults; level model applies the override.
 *  - arbitraries gain safetyRelevantDefaults; CONFLICT added to the data status arbitrary.
 */
type Acc = 'exact' | 'analytical' | 'empirical' | 'estimate';
type DS = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
interface F {
  outOfRangeInputs: string[];
  defaultedAssumptions: string[];
  safetyRelevantDefaults?: string[];
  accuracyClass: Acc;
  dataStatus: DS;
}
interface FA extends F {
  safetyRelevantDefaults: string[];
}
const ACC: Record<Acc, number> = { exact: 0, analytical: 0, empirical: 1, estimate: 2 };
const DSS: Record<DS, number> = { VERIFIED: 0, UNVERIFIED: 1, PAYWALLED: 2, CONFLICT: 2 };
const score = (f: F): number =>
  2 * f.outOfRangeInputs.length +
  f.defaultedAssumptions.length +
  2 * (f.safetyRelevantDefaults?.length ?? 0) +
  ACC[f.accuracyClass] +
  DSS[f.dataStatus];
const levelOf = (f: F): 'high' | 'medium' | 'low' => {
  if (f.outOfRangeInputs.length > 0) return 'low';
  const s = score(f);
  return s === 0 ? 'high' : s <= 2 ? 'medium' : 'low';
};
const RANK = { low: 0, medium: 1, high: 2 } as const;

const clean: F = {
  outOfRangeInputs: [],
  defaultedAssumptions: [],
  accuracyClass: 'exact',
  dataStatus: 'VERIFIED',
};

const arbF = fc.record({
  outOfRangeInputs: fc.array(fc.constantFrom('width', 'current', 'dT', 'thickness'), { maxLength: 4 }),
  defaultedAssumptions: fc.array(fc.constantFrom('alpha', 'ambient', 'theta', 'rho'), { maxLength: 6 }),
  safetyRelevantDefaults: fc.array(fc.constantFrom('maxTemp', 'derating', 'creepage'), { maxLength: 3 }),
  accuracyClass: fc.constantFrom<Acc>('exact', 'analytical', 'empirical', 'estimate'),
  dataStatus: fc.constantFrom<DS>('VERIFIED', 'UNVERIFIED', 'PAYWALLED', 'CONFLICT'),
}) as fc.Arbitrary<FA>;

describe('weight constants', () => {
  it('have the contract values', () => {
    expect(WEIGHT_OUT_OF_RANGE_PER_INPUT).toBe(2);
    expect(WEIGHT_DEFAULTED_PER_ASSUMPTION).toBe(1);
    expect(WEIGHT_SAFETY_RELEVANT_DEFAULT).toBe(2);
    expect(WEIGHT_ACCURACY).toEqual({ exact: 0, analytical: 0, empirical: 1, estimate: 2 });
    expect(WEIGHT_DATA_STATUS).toEqual({ VERIFIED: 0, UNVERIFIED: 1, PAYWALLED: 2, CONFLICT: 2 });
    expect(conf.MEDIUM_MAX_SCORE).toBe(2);
  });
  it('the defaulted-assumption cap constant is removed', () => {
    expect('CAP_DEFAULTED' in conf).toBe(false);
  });
});

describe('rateConfidence boundaries', () => {
  it('score 0 -> high with no reasons and score 0', () => {
    expect(rateConfidence(clean)).toEqual({ level: 'high', reasons: [], score: 0 });
  });
  it('analytical + VERIFIED, nothing else -> high', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'analytical' }).level).toBe('high');
  });
  it('score 1 (empirical) -> medium', () => {
    const r = rateConfidence({ ...clean, accuracyClass: 'empirical' });
    expect(r.level).toBe('medium');
    expect(r.score).toBe(1);
  });
  it('score 1 (UNVERIFIED) -> medium', () => {
    expect(rateConfidence({ ...clean, dataStatus: 'UNVERIFIED' }).level).toBe('medium');
  });
  it('score 1 (one defaulted) -> medium', () => {
    const r = rateConfidence({ ...clean, defaultedAssumptions: ['a'] });
    expect(r.level).toBe('medium');
    expect(r.score).toBe(1);
  });
  it('score 2 (estimate) -> medium', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'estimate' }).level).toBe('medium');
  });
  it('score 2 (PAYWALLED) -> medium', () => {
    expect(rateConfidence({ ...clean, dataStatus: 'PAYWALLED' }).level).toBe('medium');
  });
  it('score 2 (two defaulted) -> medium', () => {
    expect(rateConfidence({ ...clean, defaultedAssumptions: ['a', 'b'] }).level).toBe('medium');
  });
  it('score 3 (empirical + UNVERIFIED + 1 defaulted) -> low', () => {
    const r = rateConfidence({
      ...clean,
      accuracyClass: 'empirical',
      dataStatus: 'UNVERIFIED',
      defaultedAssumptions: ['a'],
    });
    expect(r.level).toBe('low');
    expect(r.score).toBe(3);
  });
  it('score 3 (three defaulted) -> low', () => {
    expect(rateConfidence({ ...clean, defaultedAssumptions: ['a', 'b', 'c'] }).level).toBe('low');
  });
  it('analytical + VERIFIED + 3 defaulted assumptions -> low', () => {
    const r = rateConfidence({
      ...clean,
      accuracyClass: 'analytical',
      defaultedAssumptions: ['a', 'b', 'c'],
    });
    expect(r.level).toBe('low');
    expect(r.score).toBe(3);
  });
  it('analytical + 1 defaulted + UNVERIFIED data -> medium (score 2)', () => {
    const r = rateConfidence({
      ...clean,
      accuracyClass: 'analytical',
      defaultedAssumptions: ['a'],
      dataStatus: 'UNVERIFIED',
    });
    expect(r.level).toBe('medium');
    expect(r.score).toBe(2);
  });
});

describe('defaulted assumptions are uncapped', () => {
  it('score grows by 1 per defaulted assumption with no ceiling', () => {
    for (let n = 0; n <= 12; n++) {
      const names = Array.from({ length: n }, (_, i) => `d${i}`);
      expect(confidenceScore({ ...clean, defaultedAssumptions: names })).toBe(n);
      expect(rateConfidence({ ...clean, defaultedAssumptions: names }).score).toBe(n);
    }
  });
  it('5 defaults scores 5 and rates low (P-1 scenario 14)', () => {
    const r = rateConfidence({
      ...clean,
      accuracyClass: 'analytical',
      defaultedAssumptions: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(r.score).toBe(5);
    expect(r.level).toBe('low');
  });
});

describe('safetyRelevantDefaults', () => {
  it('is optional: omitted equals empty array', () => {
    expect(rateConfidence(clean)).toEqual(rateConfidence({ ...clean, safetyRelevantDefaults: [] }));
  });
  it('each adds 2 to the score', () => {
    expect(confidenceScore({ ...clean, safetyRelevantDefaults: ['maxTemp'] })).toBe(2);
    expect(confidenceScore({ ...clean, safetyRelevantDefaults: ['maxTemp', 'derating'] })).toBe(4);
    expect(confidenceScore({ ...clean, safetyRelevantDefaults: ['a', 'b', 'c'] })).toBe(6);
  });
  it('one alone -> medium (score 2); two -> low (score 4)', () => {
    expect(rateConfidence({ ...clean, safetyRelevantDefaults: ['maxTemp'] }).level).toBe('medium');
    expect(rateConfidence({ ...clean, safetyRelevantDefaults: ['maxTemp', 'derating'] }).level).toBe('low');
  });
  it('one plus any other point -> low (2 + 1 = 3)', () => {
    expect(
      rateConfidence({ ...clean, safetyRelevantDefaults: ['maxTemp'], defaultedAssumptions: ['a'] }).level,
    ).toBe('low');
    expect(
      rateConfidence({ ...clean, safetyRelevantDefaults: ['maxTemp'], accuracyClass: 'empirical' }).level,
    ).toBe('low');
  });
  it('weights one safety-relevant default as twice an ordinary default', () => {
    const safety = confidenceScore({ ...clean, safetyRelevantDefaults: ['x'] });
    const ordinary = confidenceScore({ ...clean, defaultedAssumptions: ['x'] });
    expect(safety).toBe(2 * ordinary);
  });
  it('is named in the reasons', () => {
    const r = rateConfidence({ ...clean, safetyRelevantDefaults: ['maxTemp', 'derating'] });
    const joined = r.reasons.join(' | ');
    expect(joined).toContain('maxTemp');
    expect(joined).toContain('derating');
    expect(joined).toMatch(/safety/i);
  });
});

describe('out-of-range override', () => {
  it('one out-of-range input on an otherwise perfect method -> low, score still 2', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: ['w'] });
    expect(r.level).toBe('low');
    expect(r.score).toBe(2);
  });
  it('analytical + VERIFIED + 1 out-of-range -> low', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'analytical', outOfRangeInputs: ['w/h'] }).level).toBe('low');
  });
  it('reasons include one explicit forced-to-low sentence naming every out-of-range input', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: ['width', 'current'] });
    const forced = r.reasons.filter((x) => /forced to low/i.test(x));
    expect(forced).toHaveLength(1);
    expect(forced[0]).toMatch(/outside the model'?s validity range/i);
    expect(forced[0]).toContain('width');
    expect(forced[0]).toContain('current');
  });
  it('no forced-to-low sentence when nothing is out of range, even when level is low', () => {
    const r = rateConfidence({ ...clean, accuracyClass: 'estimate', dataStatus: 'PAYWALLED' });
    expect(r.level).toBe('low');
    expect(r.reasons.join(' ')).not.toMatch(/forced to low/i);
  });
  it('property: any factors with >= 1 out-of-range input are low', () => {
    fc.assert(
      fc.property(arbF, fc.constantFrom('x', 'y'), (f, extra) => {
        const g = { ...f, outOfRangeInputs: [...f.outOfRangeInputs, extra] };
        const r = rateConfidence(g);
        expect(r.level).toBe('low');
        expect(r.reasons.join(' ')).toMatch(/forced to low/i);
        expect(r.score).toBe(score(g));
      }),
    );
  });
});

describe('rateConfidence reasons', () => {
  it('names each out-of-range input', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: ['width', 'current'] });
    const joined = r.reasons.join(' | ');
    expect(joined).toContain('width');
    expect(joined).toContain('current');
  });
  it('mentions defaulted assumption names', () => {
    const r = rateConfidence({ ...clean, defaultedAssumptions: ['ambient'] });
    expect(r.reasons.join(' ')).toContain('ambient');
  });
  it('non-VERIFIED data and low-accuracy classes each give a reason', () => {
    expect(rateConfidence({ ...clean, dataStatus: 'UNVERIFIED' }).reasons.length).toBeGreaterThan(0);
    expect(rateConfidence({ ...clean, dataStatus: 'PAYWALLED' }).reasons.length).toBeGreaterThan(0);
    expect(rateConfidence({ ...clean, accuracyClass: 'empirical' }).reasons.length).toBeGreaterThan(0);
    expect(rateConfidence({ ...clean, accuracyClass: 'estimate' }).reasons.length).toBeGreaterThan(0);
  });
  it('reasons are non-empty human-readable strings', () => {
    fc.assert(
      fc.property(arbF, (f) => {
        for (const s of rateConfidence(f).reasons) {
          expect(typeof s).toBe('string');
          expect(s.trim().length).toBeGreaterThan(3);
        }
      }),
    );
  });
  it('every contributor is named in some reason', () => {
    fc.assert(
      fc.property(arbF, (f) => {
        const joined = rateConfidence(f).reasons.join(' | ');
        for (const n of f.outOfRangeInputs) expect(joined).toContain(n);
        for (const n of f.defaultedAssumptions) expect(joined).toContain(n);
        for (const n of f.safetyRelevantDefaults) expect(joined).toContain(n);
        if (f.accuracyClass === 'empirical') expect(joined).toMatch(/empirical/i);
        if (f.accuracyClass === 'estimate') expect(joined).toMatch(/estimate/i);
        if (f.dataStatus !== 'VERIFIED') expect(joined).toContain(f.dataStatus);
      }),
    );
  });
});

describe('rateConfidence properties', () => {
  it('level/score match the documented rule; reasons non-empty iff level not high', () => {
    fc.assert(
      fc.property(arbF, (f) => {
        const r = rateConfidence(f);
        expect(r.score).toBe(score(f));
        expect(confidenceScore(f)).toBe(score(f));
        expect(r.level).toBe(levelOf(f));
        expect(r.reasons.length === 0).toBe(r.level === 'high');
        if (r.level !== 'high') expect(r.reasons.length).toBeGreaterThan(0);
      }),
    );
  });
  it('is deterministic and does not mutate input', () => {
    fc.assert(
      fc.property(arbF, (f) => {
        const copy = JSON.parse(JSON.stringify(f)) as F;
        const a = rateConfidence(f);
        const b = rateConfidence(f);
        expect(a).toEqual(b);
        expect(f).toEqual(copy);
      }),
    );
  });
  it('accepts frozen input', () => {
    const f = Object.freeze({
      outOfRangeInputs: Object.freeze(['w']),
      defaultedAssumptions: Object.freeze(['a']),
      safetyRelevantDefaults: Object.freeze(['m']),
      accuracyClass: 'empirical' as const,
      dataStatus: 'UNVERIFIED' as const,
    });
    expect(() => rateConfidence(f)).not.toThrow();
  });
  it('adding any contributor never raises the level and never lowers the score', () => {
    fc.assert(
      fc.property(arbF, fc.integer({ min: 0, max: 4 }), (f, which) => {
        let g: FA;
        switch (which) {
          case 0:
            g = { ...f, outOfRangeInputs: [...f.outOfRangeInputs, 'extra'] };
            break;
          case 1:
            g = { ...f, defaultedAssumptions: [...f.defaultedAssumptions, 'extra'] };
            break;
          case 2:
            g = { ...f, safetyRelevantDefaults: [...f.safetyRelevantDefaults, 'extra'] };
            break;
          case 3:
            g = {
              ...f,
              accuracyClass: f.accuracyClass === 'exact' || f.accuracyClass === 'analytical' ? 'empirical' : 'estimate',
            };
            break;
          default:
            g = { ...f, dataStatus: f.dataStatus === 'VERIFIED' ? 'UNVERIFIED' : 'PAYWALLED' };
        }
        const rf = rateConfidence(f);
        const rg = rateConfidence(g);
        expect(RANK[rg.level]).toBeLessThanOrEqual(RANK[rf.level]);
        expect(rg.score).toBeGreaterThanOrEqual(rf.score);
      }),
    );
  });
});
