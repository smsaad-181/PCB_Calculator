import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { rateConfidence } from './confidence';

/*
 * Documented rule (deterministic):
 *   score = 2 * (#outOfRangeInputs)
 *         + min(#defaultedAssumptions, 2)
 *         + accuracy(exact 0, analytical 0, empirical 1, estimate 2)
 *         + dataStatus(VERIFIED 0, UNVERIFIED 1, PAYWALLED 2)
 *   level: 0 -> high; 1..2 -> medium; >=3 -> low
 *   Every non-zero contributor yields >= 1 reason; reasons empty iff score 0.
 */
type Acc = 'exact' | 'analytical' | 'empirical' | 'estimate';
type DS = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED';
interface F {
  outOfRangeInputs: string[];
  defaultedAssumptions: string[];
  accuracyClass: Acc;
  dataStatus: DS;
}
const ACC: Record<Acc, number> = { exact: 0, analytical: 0, empirical: 1, estimate: 2 };
const DSS: Record<DS, number> = { VERIFIED: 0, UNVERIFIED: 1, PAYWALLED: 2 };
const score = (f: F): number =>
  2 * f.outOfRangeInputs.length +
  Math.min(f.defaultedAssumptions.length, 2) +
  ACC[f.accuracyClass] +
  DSS[f.dataStatus];
const levelOf = (s: number): 'high' | 'medium' | 'low' => (s === 0 ? 'high' : s <= 2 ? 'medium' : 'low');
const RANK = { low: 0, medium: 1, high: 2 } as const;

const clean: F = {
  outOfRangeInputs: [],
  defaultedAssumptions: [],
  accuracyClass: 'exact',
  dataStatus: 'VERIFIED',
};

const arbF = fc.record({
  outOfRangeInputs: fc.array(fc.constantFrom('width', 'current', 'dT', 'thickness'), { maxLength: 4 }),
  defaultedAssumptions: fc.array(fc.constantFrom('alpha', 'ambient', 'theta', 'rho'), { maxLength: 5 }),
  accuracyClass: fc.constantFrom<Acc>('exact', 'analytical', 'empirical', 'estimate'),
  dataStatus: fc.constantFrom<DS>('VERIFIED', 'UNVERIFIED', 'PAYWALLED'),
});

describe('rateConfidence boundaries', () => {
  it('score 0 -> high with no reasons', () => {
    expect(rateConfidence(clean)).toEqual({ level: 'high', reasons: [] });
  });
  it('analytical + VERIFIED, nothing else -> high', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'analytical' }).level).toBe('high');
  });
  it('score 1 (empirical) -> medium', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'empirical' }).level).toBe('medium');
  });
  it('score 1 (UNVERIFIED) -> medium', () => {
    expect(rateConfidence({ ...clean, dataStatus: 'UNVERIFIED' }).level).toBe('medium');
  });
  it('score 1 (one defaulted) -> medium', () => {
    expect(rateConfidence({ ...clean, defaultedAssumptions: ['a'] }).level).toBe('medium');
  });
  it('score 2 (estimate) -> medium', () => {
    expect(rateConfidence({ ...clean, accuracyClass: 'estimate' }).level).toBe('medium');
  });
  it('score 2 (PAYWALLED) -> medium', () => {
    expect(rateConfidence({ ...clean, dataStatus: 'PAYWALLED' }).level).toBe('medium');
  });
  it('score 2 (one out-of-range) -> medium', () => {
    expect(rateConfidence({ ...clean, outOfRangeInputs: ['w'] }).level).toBe('medium');
  });
  it('score 3 (empirical + UNVERIFIED + 1 defaulted) -> low', () => {
    const r = rateConfidence({
      ...clean,
      accuracyClass: 'empirical',
      dataStatus: 'UNVERIFIED',
      defaultedAssumptions: ['a'],
    });
    expect(r.level).toBe('low');
  });
  it('score 3 (out-of-range + defaulted) -> low', () => {
    expect(
      rateConfidence({ ...clean, outOfRangeInputs: ['w'], defaultedAssumptions: ['a'] }).level,
    ).toBe('low');
  });
  it('defaulted-assumption contribution is capped at 2', () => {
    // 2 defaults -> score 2 (medium); 5 defaults -> still score 2 (medium)
    expect(rateConfidence({ ...clean, defaultedAssumptions: ['a', 'b'] }).level).toBe('medium');
    expect(
      rateConfidence({ ...clean, defaultedAssumptions: ['a', 'b', 'c', 'd', 'e'] }).level,
    ).toBe('medium');
  });
  it('two out-of-range inputs -> low', () => {
    expect(rateConfidence({ ...clean, outOfRangeInputs: ['a', 'b'] }).level).toBe('low');
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
});

describe('rateConfidence properties', () => {
  it('level matches the documented score rule; reasons empty iff score 0', () => {
    fc.assert(
      fc.property(arbF, (f) => {
        const r = rateConfidence(f);
        const s = score(f);
        expect(r.level).toBe(levelOf(s));
        expect(r.reasons.length === 0).toBe(s === 0);
        if (s > 0) expect(r.reasons.length).toBeGreaterThan(0);
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
  it('adding any contributor never raises the level', () => {
    fc.assert(
      fc.property(arbF, fc.integer({ min: 0, max: 3 }), (f, which) => {
        let g: F;
        switch (which) {
          case 0:
            g = { ...f, outOfRangeInputs: [...f.outOfRangeInputs, 'extra'] };
            break;
          case 1:
            g = { ...f, defaultedAssumptions: [...f.defaultedAssumptions, 'extra'] };
            break;
          case 2:
            g = {
              ...f,
              accuracyClass: f.accuracyClass === 'exact' || f.accuracyClass === 'analytical' ? 'empirical' : 'estimate',
            };
            break;
          default:
            g = { ...f, dataStatus: f.dataStatus === 'VERIFIED' ? 'UNVERIFIED' : 'PAYWALLED' };
        }
        expect(RANK[rateConfidence(g).level]).toBeLessThanOrEqual(RANK[rateConfidence(f).level]);
      }),
    );
  });
});
