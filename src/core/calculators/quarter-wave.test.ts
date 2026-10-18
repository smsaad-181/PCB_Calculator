import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, fromUnit, q, toUnit } from '../units';
import type { Quantity } from '../units';
import { C_M_PER_S } from '../data/constants';
import { LEDGER } from '../data/ledger';
import { err, expectError, expectNoClaimWording, has, okOf, res, si, vec, warningText } from './circuit-test-utils';
import { compute, meta } from './quarter-wave';
import type { Inputs } from './quarter-wave';

// Phase 2 core D, task 3: quarter-wave helper for a transmission-line stub or resonator (ledger S-029c, UNVERIFIED, derived from
// S-029a). TESTS FIRST. Expected numbers come from the independent oracle (qw_* vectors in docs/golden-vectors.json).

const ee = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const hz = (n: number): Quantity => q(n, DIM.FREQUENCY);
/** A quantity built without the finiteness check of q(), the way a hostile caller can. */
const rawQ = (n: number, dim: Quantity['dim']): Quantity => ({ si: n, dim }) as Quantity;
const LEN = 'guided quarter-wave length lambda_g/4';
const FREQ = 'quarter-wave frequency for the given length';
const FREE = 'free-space quarter wavelength lambda0/4 (comparison only, not a stub or antenna length)';

describe('golden vectors (oracle)', () => {
  const cases: [number, number, string][] = [
    [2.967, 5e9, 'qw_length_mm_ee2.967_f5e+09Hz'],
    [3.2, 1e9, 'qw_length_mm_ee3.2_f1e+09Hz'],
    [4.4, 250e6, 'qw_length_mm_ee4.4_f2.5e+08Hz'],
    [1.0, 2.4e9, 'qw_length_mm_ee1_f2.4e+09Hz'],
  ];
  it.each(cases)('length for eps_eff %f at %f Hz', (e, f, name) => {
    const r = okOf(compute, { epsEff: ee(e), frequency: hz(f) });
    expect(err(toUnit(res(r, LEN).value, 'mm'), vec(name).pinned_expected)).toBeLessThan(1e-9);
  });
  it('frequency from a length', () => {
    const r = okOf(compute, { epsEff: ee(2.967), length: fromUnit(8, 'mm') });
    expect(err(si(r, FREQ) / 1e9, vec('qw_freq_GHz_ee2.967_L8mm').pinned_expected)).toBeLessThan(1e-9);
    const r2 = okOf(compute, { epsEff: ee(4.4), length: fromUnit(150, 'mm') });
    expect(err(si(r2, FREQ) / 1e9, vec('qw_freq_GHz_ee4.4_L150mm').pinned_expected)).toBeLessThan(1e-9);
    const r3 = okOf(compute, { epsEff: ee(3.2), length: fromUnit(30, 'mm') });
    expect(err(si(r3, FREQ) / 1e9, vec('qw_freq_GHz_ee3.2_L30mm').pinned_expected)).toBeLessThan(1e-9);
  });
  it('free-space comparison value', () => {
    const r = okOf(compute, { epsEff: ee(3.2), frequency: hz(1e9) });
    expect(err(toUnit(res(r, FREE).value, 'mm'), vec('qw_freespace_length_mm_f1e+09Hz').pinned_expected)).toBeLessThan(1e-9);
  });
});

describe('hand check from the recorded relation L = c / (4 f sqrt(eps_eff))', () => {
  it('eps_eff 1 at 1 GHz is 74.948 mm, eps_eff 4 halves it to 37.474 mm', () => {
    const a = okOf(compute, { epsEff: ee(1), frequency: hz(1e9) });
    expect(toUnit(res(a, LEN).value, 'mm')).toBeCloseTo(299792458 / 4e9 * 1e3, 9);
    expect(toUnit(res(a, LEN).value, 'mm')).toBeCloseTo(74.9481145, 6);
    const b = okOf(compute, { epsEff: ee(4), frequency: hz(1e9) });
    expect(toUnit(res(b, LEN).value, 'mm')).toBeCloseTo(37.47405725, 6);
  });
  it('uses the exact c, not 3e8', () => {
    const r = okOf(compute, { epsEff: ee(1), frequency: hz(1e9) });
    expect(res(r, LEN).value.si).toBe(C_M_PER_S / 4e9);
  });
});

describe('result content', () => {
  const r = okOf(compute, { epsEff: ee(2.967), frequency: hz(5e9), epsEffSource: 'microstrip result at 150 um' });
  it('carries the S-029c UNVERIFIED badge data and the rule-based confidence', () => {
    expect(r.reference.ledgerIds).toEqual(expect.arrayContaining(['S-029', 'S-029a', 'S-029c']));
    expect(r.dataStatus).toBe('UNVERIFIED');
    expect(r.confidence.level).toBe('medium');
    expect(r.confidence.reasons.join(' ')).toMatch(/UNVERIFIED/);
    expect(LEDGER.find((x) => x.id === 'S-029c')?.status).toBe('UNVERIFIED');
    expect(meta.ledgerIds).toContain('S-029c');
  });
  it('states that end effects are not modelled and gives the antenna caveat with no antenna length', () => {
    const w = warningText(r);
    expect(w).toMatch(/end effects \(open-end extension\) not modelled/);
    expect(w).toContain('free-space lambda/4 is not the guided lambda/4 and no antenna length is computed here');
    expect(r.warnings.map((x) => x.code)).toEqual(expect.arrayContaining(['END_EFFECTS_NOT_MODELLED', 'ANTENNA_NOT_COMPUTED']));
    expect(r.results.some((x) => /antenna/i.test(x.name) && !/not a stub or antenna/.test(x.name))).toBe(false);
  });
  it('records where eps_eff came from and that it is user-entered', () => {
    expect(r.inputs.find((i) => i.name === 'eps_eff')?.sourceDetail).toBe('microstrip result at 150 um');
    expect(r.inputs.find((i) => i.name === 'eps_eff')?.source).toBe('user');
    expect(warningText(r)).toMatch(/eps_eff is the value you entered/);
  });
  it('has a formula string from meta, the dispersion caveat and no compliance wording', () => {
    expect(r.formula).toBe(meta.formula);
    expect(warningText(r)).toMatch(/Dispersion is not modelled/);
    expectNoClaimWording(r);
  });
  it('mode: exactly one primary and the length mode gives a frequency primary', () => {
    expect(r.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([LEN]);
    const f = okOf(compute, { epsEff: ee(3), length: fromUnit(10, 'mm') });
    expect(f.results.filter((x) => x.role === 'primary').map((x) => x.name)).toEqual([FREQ]);
    expect(has(f, 'guided wavelength at that frequency')).toBe(true);
  });
});

describe('guards: errors are values', () => {
  const base: Inputs = { epsEff: ee(3), frequency: hz(1e9) };
  it('needs exactly one of frequency and length', () => {
    expectError(compute, { epsEff: ee(3) } as Inputs, 'INVALID_INPUT');
    expectError(compute, { epsEff: ee(3), frequency: hz(1e9), length: fromUnit(1, 'mm') }, 'INVALID_INPUT');
  });
  it.each([Number.NaN, Infinity, -Infinity, 0, -1, 0.99, 1e-320])('eps_eff %s is rejected', (v) => {
    expect(() => compute({ ...base, epsEff: rawQ(v, DIM.DIMENSIONLESS) })).not.toThrow();
    const out = compute({ ...base, epsEff: rawQ(v, DIM.DIMENSIONLESS) });
    expect(out.ok).toBe(false);
  });
  it.each([Number.NaN, Infinity, 0, -5])('frequency %s is rejected', (v) => {
    expectError(compute, { ...base, frequency: rawQ(v, DIM.FREQUENCY) }, 'INVALID_INPUT', 'frequency');
  });
  it('length of zero or negative is rejected, a wrong dimension is a DIMENSION error', () => {
    expectError(compute, { epsEff: ee(3), length: fromUnit(0, 'mm') }, 'INVALID_INPUT', 'length');
    expectError(compute, { epsEff: ee(3), length: fromUnit(-1, 'mm') }, 'INVALID_INPUT', 'length');
    expectError(compute, { epsEff: ee(3), frequency: fromUnit(1, 'mm') as unknown as Quantity }, 'DIMENSION', 'frequency');
    expectError(compute, { epsEff: fromUnit(1, 'mm') as unknown as Quantity, frequency: hz(1e9) }, 'DIMENSION', 'epsEff');
  });
  it('a malformed input object and an empty source label are errors', () => {
    expectError(compute, null as unknown as Inputs, 'INVALID_INPUT');
    expectError(compute, { ...base, epsEffSource: '  ' }, 'INVALID_INPUT', 'epsEffSource');
  });
  it('an overflowing or underflowing result is an error value, never a number', () => {
    const out = compute({ epsEff: ee(3), frequency: hz(1e-320) });
    expect(out.ok).toBe(false);
  });
});

describe('properties', () => {
  it('length * frequency * 4 * sqrt(eps_eff) = c, and the two modes invert each other', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 12, noNaN: true }), fc.double({ min: 1e6, max: 1e11, noNaN: true }), (e, f) => {
        const a = okOf(compute, { epsEff: ee(e), frequency: hz(f) });
        const len = res(a, LEN).value;
        expect(err(4 * f * Math.sqrt(e) * len.si, C_M_PER_S)).toBeLessThan(1e-12);
        const b = okOf(compute, { epsEff: ee(e), length: len });
        expect(err(si(b, FREQ), f)).toBeLessThan(1e-12);
        // guided is shorter than free space by sqrt(eps_eff)
        expect(len.si).toBeLessThanOrEqual(si(a, FREE) * (1 + 1e-12));
      }),
      { numRuns: 100 },
    );
  });
  it('is deterministic and fast: 10 000 computes inside a 5 s budget', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const out = compute({ epsEff: ee(1 + (i % 50) / 10), frequency: hz(1e8 * (1 + (i % 97))) });
      if (!out.ok) throw new Error('unexpected error');
    }
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(compute({ epsEff: ee(3), frequency: hz(1e9) })).toEqual(compute({ epsEff: ee(3), frequency: hz(1e9) }));
  });
});
