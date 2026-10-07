import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as conf from './confidence';
import { confidenceFactorsFromInputs, confidenceScore, rateConfidence } from './confidence';
import { DIM, q } from './units';
import type { CalcInput } from './result';

// Gate G-3 (domain review m-E, calc m-2/m-5): data-status spellings, structured out-of-range, disjoint lists,
// and the helper that stops a calculator from marking inputs defaulted and still rating high.

type Src = CalcInput['source'];
const inp = (name: string, source: Src): CalcInput => ({ name, value: q(1, DIM.LENGTH), source });
const clean = { outOfRangeInputs: [] as string[], defaultedAssumptions: [] as string[], accuracyClass: 'exact' as const };
const LONG = 'PAYWALLED-USER-MUST-VERIFY';
const asDS = (s: string): conf.DataStatus => s as unknown as conf.DataStatus;
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('dataStatus accepts the ledger spelling (m-2)', () => {
  it('PAYWALLED-USER-MUST-VERIFY scores and rates identically to PAYWALLED', () => {
    const a = rateConfidence({ ...clean, dataStatus: asDS(LONG) });
    const b = rateConfidence({ ...clean, dataStatus: 'PAYWALLED' });
    expect(a.score).toBe(2);
    expect(a.score).toBe(b.score);
    expect(a.level).toBe(b.level);
    expect(a.level).toBe('medium');
    expect(confidenceScore({ ...clean, dataStatus: asDS(LONG) })).toBe(2);
    expect(a.reasons.join(' ')).toMatch(/PAYWALLED/);
  });
  it('the weight table keeps its four keys (the long spelling is an alias, not a new key)', () => {
    expect(Object.keys(conf.WEIGHT_DATA_STATUS).sort()).toEqual(['CONFLICT', 'PAYWALLED', 'UNVERIFIED', 'VERIFIED']);
  });
  it.each(['BOGUS', '', 'verified', 'Paywalled', 'undefined', '__proto__', 'constructor', 'toString'])(
    'unknown status %j throws ConfidenceInputError from both rateConfidence and confidenceScore',
    (s) => {
      expect(typeof conf.ConfidenceInputError).toBe('function');
      expect(() => rateConfidence({ ...clean, dataStatus: asDS(s) })).toThrow(conf.ConfidenceInputError);
      expect(() => confidenceScore({ ...clean, dataStatus: asDS(s) })).toThrow(conf.ConfidenceInputError);
    },
  );
  it('missing / null status throws, never NaN', () => {
    expect(() => rateConfidence({ ...clean, dataStatus: undefined as unknown as conf.DataStatus })).toThrow(conf.ConfidenceInputError);
    expect(() => rateConfidence({ ...clean, dataStatus: null as unknown as conf.DataStatus })).toThrow(conf.ConfidenceInputError);
  });
  it('ConfidenceInputError is an Error subclass with a stable name', () => {
    const e = new conf.ConfidenceInputError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ConfidenceInputError');
  });
});

describe('structured out-of-range inputs (G-3)', () => {
  const sa = { name: 'thickness', value: '12 um', bound: '20-100 um' };
  const sb = { name: 'aspect', value: '12:1', bound: '<= 10:1' };
  it('a structured entry lists "name = value (allowed: bound)"', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: [sa], dataStatus: 'VERIFIED' });
    expect(r.reasons).toContain('thickness = 12 um (allowed: 20-100 um)');
    expect(r.level).toBe('low');
    expect(r.score).toBe(2);
  });
  it('a plain string entry lists just the name', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: ['plainname'], dataStatus: 'VERIFIED' });
    expect(r.reasons).toContain('plainname');
  });
  it('mixed string and structured entries are SORTED by name, each exactly once', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: ['zeta', sa, 'beta', sb], dataStatus: 'VERIFIED' });
    const per = r.reasons.filter((x) => !/forced to low/i.test(x));
    const idx = (n: string): number => per.findIndex((x) => x.startsWith(n) || x.includes(n));
    const order = ['aspect', 'beta', 'thickness', 'zeta'].map(idx);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const n of ['aspect', 'beta', 'thickness', 'zeta']) expect(count(r.reasons.join('\n'), n)).toBe(1);
    expect(r.score).toBe(8);
  });
  it('the forced-to-low sentence is the fixed text with the count and no names', () => {
    const r = rateConfidence({ ...clean, outOfRangeInputs: [sa, sb, 'zeta'], dataStatus: 'VERIFIED' });
    const forced = r.reasons.filter((x) => /forced to low/i.test(x));
    expect(forced).toEqual(["Confidence level forced to low: 3 input(s) are outside the model's validity range."]);
  });
  it('accepts frozen structured input and does not mutate it', () => {
    const list = Object.freeze([Object.freeze({ ...sa }), 'zeta']);
    expect(() => rateConfidence({ ...clean, outOfRangeInputs: list, dataStatus: 'VERIFIED' })).not.toThrow();
  });
  it('property: reasons are order-independent for the out-of-range list', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(['q1', 'q2', 'q3', 'q4'], { minLength: 1 }), (names) => {
        const a = rateConfidence({ ...clean, outOfRangeInputs: names, dataStatus: 'VERIFIED' });
        const b = rateConfidence({ ...clean, outOfRangeInputs: [...names].reverse(), dataStatus: 'VERIFIED' });
        expect(a).toEqual(b);
      }),
    );
  });
});

describe('disjoint defaulted / safety-relevant lists (m-5)', () => {
  it('a name in both lists counts only at the safety weight (2), not 1 + 2', () => {
    const f = { ...clean, dataStatus: 'VERIFIED' as const, defaultedAssumptions: ['sharedname'], safetyRelevantDefaults: ['sharedname'] };
    expect(confidenceScore(f)).toBe(2);
    expect(rateConfidence(f).score).toBe(2);
  });
  it('other names in the lists still count normally', () => {
    const f = {
      ...clean,
      dataStatus: 'VERIFIED' as const,
      defaultedAssumptions: ['sharedname', 'ordinary'],
      safetyRelevantDefaults: ['sharedname', 'critical'],
    };
    expect(confidenceScore(f)).toBe(1 + 2 + 2);
  });
  it('the shared name appears exactly once in the reasons', () => {
    const r = rateConfidence({
      ...clean,
      dataStatus: 'VERIFIED',
      defaultedAssumptions: ['sharedname', 'ordinary'],
      safetyRelevantDefaults: ['sharedname'],
    });
    expect(count(r.reasons.join('\n'), 'sharedname')).toBe(1);
    expect(r.reasons.join('\n')).toContain('ordinary');
  });
  it('does not mutate the input lists', () => {
    const d = ['sharedname'];
    const s = ['sharedname'];
    rateConfidence({ ...clean, dataStatus: 'VERIFIED', defaultedAssumptions: d, safetyRelevantDefaults: s });
    expect(d).toEqual(['sharedname']);
    expect(s).toEqual(['sharedname']);
  });
});

describe('confidenceFactorsFromInputs', () => {
  const base = { accuracyClass: 'analytical' as const, dataStatus: 'VERIFIED' as const };
  it("'default' and 'preset' inputs become defaulted assumptions; 'user' and 'fab-profile' do not", () => {
    const f = confidenceFactorsFromInputs({
      ...base,
      inputs: [inp('a', 'user'), inp('b', 'default'), inp('c', 'preset'), inp('d', 'fab-profile')],
    });
    expect([...f.defaultedAssumptions]).toEqual(['b', 'c']);
    expect([...(f.safetyRelevantDefaults ?? [])]).toEqual([]);
    expect([...f.outOfRangeInputs]).toEqual([]);
    expect(f.accuracyClass).toBe('analytical');
    expect(f.dataStatus).toBe('VERIFIED');
  });
  it('a defaulted input named in safetyRelevant moves to safetyRelevantDefaults only (disjoint)', () => {
    const f = confidenceFactorsFromInputs({
      ...base,
      inputs: [inp('maxTemp', 'default'), inp('foil', 'preset'), inp('w', 'user')],
      safetyRelevant: ['maxTemp'],
    });
    expect([...f.defaultedAssumptions]).toEqual(['foil']);
    expect([...(f.safetyRelevantDefaults ?? [])]).toEqual(['maxTemp']);
    expect(confidenceScore(f)).toBe(1 + 2);
  });
  it('a safety-relevant input that the user supplied is neither defaulted nor a safety default', () => {
    const f = confidenceFactorsFromInputs({ ...base, inputs: [inp('maxTemp', 'user')], safetyRelevant: ['maxTemp'] });
    expect([...f.defaultedAssumptions]).toEqual([]);
    expect([...(f.safetyRelevantDefaults ?? [])]).toEqual([]);
  });
  it('a fab-profile input named safety-relevant is not a default either', () => {
    const f = confidenceFactorsFromInputs({ ...base, inputs: [inp('plating', 'fab-profile')], safetyRelevant: ['plating'] });
    expect([...(f.safetyRelevantDefaults ?? [])]).toEqual([]);
  });
  it('an unknown name in safetyRelevant throws ConfidenceInputError', () => {
    expect(() => confidenceFactorsFromInputs({ ...base, inputs: [inp('a', 'default')], safetyRelevant: ['typo'] })).toThrow(
      conf.ConfidenceInputError,
    );
  });
  it('outOfRange (strings and structured) is passed through', () => {
    const oor = ['w', { name: 't', value: '1', bound: '2-3' }];
    const f = confidenceFactorsFromInputs({ ...base, inputs: [], outOfRange: oor });
    expect(f.outOfRangeInputs).toHaveLength(2);
    expect(rateConfidence(f).level).toBe('low');
  });
  it('a calculator cannot mark three inputs defaulted and still get high', () => {
    const f = confidenceFactorsFromInputs({ ...base, inputs: [inp('a', 'default'), inp('b', 'default'), inp('c', 'preset')] });
    const r = rateConfidence(f);
    expect(r.level).not.toBe('high');
    expect(r.level).toBe('low');
    expect(r.score).toBe(3);
  });
  it('one default on an exact VERIFIED method is medium, never high', () => {
    const r = rateConfidence(
      confidenceFactorsFromInputs({ accuracyClass: 'exact', dataStatus: 'VERIFIED', inputs: [inp('a', 'default')] }),
    );
    expect(r.level).toBe('medium');
  });
  it('all-user inputs on exact/VERIFIED give high', () => {
    const r = rateConfidence(
      confidenceFactorsFromInputs({ accuracyClass: 'exact', dataStatus: 'VERIFIED', inputs: [inp('a', 'user'), inp('b', 'fab-profile')] }),
    );
    expect(r.level).toBe('high');
  });
  it('property: defaulted count equals the number of default/preset inputs (no safety list)', () => {
    const src = fc.constantFrom<Src>('user', 'default', 'fab-profile', 'preset');
    fc.assert(
      fc.property(fc.array(src, { maxLength: 15 }), (sources) => {
        const inputs = sources.map((s, i) => inp(`n${String(i)}`, s));
        const f = confidenceFactorsFromInputs({ ...base, inputs });
        expect(f.defaultedAssumptions).toHaveLength(sources.filter((s) => s === 'default' || s === 'preset').length);
      }),
    );
  });
  it('does not mutate its arguments', () => {
    const inputs = [inp('a', 'default'), inp('b', 'user')];
    const copy = inputs.map((i) => ({ ...i }));
    const safetyRelevant = ['a'];
    confidenceFactorsFromInputs({ ...base, inputs, safetyRelevant });
    expect(inputs).toEqual(copy);
    expect(safetyRelevant).toEqual(['a']);
  });
});
