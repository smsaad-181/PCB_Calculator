import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DIM, div, fromUnit, q, sameDim, toUnit } from '../units';
import {
  DELAY_LEDGER_IDS,
  DelayDomainError,
  TIME_PER_LENGTH,
  delayPerLength,
  formatDelayPerLength,
  guidedWavelength,
  skewFromMismatch,
} from './delay-shared';

// Phase 2 task 3 (delay part), ledger S-029 (c exact), S-029a (delay = sqrt(eps_eff)/c, lambda_g = lambda0/sqrt(eps_eff)) and
// S-029b (skew = dL x delay per length, derived, UNVERIFIED). TESTS FIRST. Expected numbers come from the oracle
// (tools/reference/ref_impedance.py, mirrored in docs/golden-vectors.json) and from the arithmetic restated below.
// R2 (research doc, reference case): eps_eff 2.967 at 5 GHz gives lambda_g 34.809 mm and t_pd 5.7457 ps/mm.

const goldenFiles = import.meta.glob('../../../docs/golden-vectors.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const goldenText = Object.values(goldenFiles)[0];
const vectors =
  goldenText === undefined
    ? []
    : (JSON.parse(goldenText) as { vectors: { name: string; pinned_expected: number; rel_tol: number; ledger_ids: string[]; status: string }[] }).vectors;
const vec = (name: string) => {
  const v = vectors.find((x) => x.name === name);
  if (!v) throw new Error(`golden vector ${name} not found`);
  return v;
};
const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const g = (x: number): string => String(Number(x.toPrecision(6)));
const ps_mm = (x: ReturnType<typeof delayPerLength>): number => x.si * 1e9;

// [eps_eff, f Hz, dL mm, the oracle's %g spelling of f used in the vector name]
const CASES: [number, number, number, string][] = [
  [2.967, 5e9, 10, '5e+09'],
  [3.2, 1e9, 2.5, '1e+09'],
  [4.4, 250e6, 100, '2.5e+08'],
  [1.0, 10e9, 1, '1e+10'],
];

describe('golden vectors (oracle): delay, guided wavelength, skew', () => {
  for (const [ee, f, dl, ftag] of CASES) {
    it(`eps_eff ${String(ee)}, f ${String(f)} Hz, dL ${String(dl)} mm`, () => {
      const d = vec(`delay_ps_per_mm_ee${g(ee)}`);
      const l = vec(`guided_wavelength_mm_ee${g(ee)}_f${ftag}Hz`);
      const s = vec(`skew_ps_dL${g(dl)}mm_ee${g(ee)}`);
      expect(d.status).toBe('VERIFIED');
      expect(s.status).toBe('UNVERIFIED');
      expect(relErr(ps_mm(delayPerLength(ee)), d.pinned_expected)).toBeLessThanOrEqual(1e-9);
      expect(relErr(toUnit(guidedWavelength(ee, fromUnit(f, 'Hz')), 'mm'), l.pinned_expected)).toBeLessThanOrEqual(1e-9);
      expect(relErr(toUnit(skewFromMismatch(fromUnit(dl, 'mm'), ee), 's') * 1e12, s.pinned_expected)).toBeLessThanOrEqual(1e-9);
    });
  }
  it('R2 reference case (published-style numbers): eps_eff 2.967 at 5 GHz gives t_pd 5.7457 ps/mm and lambda_g 34.809 mm', () => {
    expect(ps_mm(delayPerLength(2.967))).toBeCloseTo(5.7458, 3);
    expect(toUnit(guidedWavelength(2.967, fromUnit(5, 'GHz')), 'mm')).toBeCloseTo(34.809, 3);
  });
  it('uses the exact c: eps_eff = 1 gives 3.33564095198 ps/mm, never 3.3333 (3e8) and never 85 ps/in', () => {
    expect(relErr(ps_mm(delayPerLength(1)), 1e12 / 299792458 / 1000)).toBeLessThanOrEqual(1e-15);
    expect(ps_mm(delayPerLength(1))).not.toBeCloseTo(3.3333, 3);
  });
});

describe('quantities and dimensions', () => {
  it('delay per length is time / length (s/m), wavelength is a length, skew is a time', () => {
    expect(sameDim(delayPerLength(4), q(1, TIME_PER_LENGTH))).toBe(true);
    expect(sameDim(q(1, TIME_PER_LENGTH), div(q(1, DIM.TIME), q(1, DIM.LENGTH)))).toBe(true);
    expect(sameDim(guidedWavelength(4, fromUnit(1, 'GHz')), q(1, DIM.LENGTH))).toBe(true);
    expect(sameDim(skewFromMismatch(fromUnit(1, 'mm'), 4), q(1, DIM.TIME))).toBe(true);
  });
  it('the ledger rows behind the helpers are S-029 and S-029a (S-029b only for skew)', () => {
    expect(DELAY_LEDGER_IDS).toEqual(['S-029', 'S-029a']);
  });
});

describe('formatDelayPerLength (ps/mm and ps/in, rounded up for a prediction)', () => {
  it('prints both units from the SI value and never below it', () => {
    const d = delayPerLength(2.967);
    const t = formatDelayPerLength(d, 'prediction');
    expect(t).toMatch(/^[\d.]+ ps\/mm \([\d.]+ ps\/in\)$/);
    const nums = (t.match(/[\d.]+/g) ?? []).map(Number);
    expect(nums[0]).toBeGreaterThanOrEqual(d.si * 1e9);
    expect(nums[0]).toBeLessThan(d.si * 1e9 * 1.001);
    expect(nums[1]).toBeGreaterThanOrEqual(d.si * 1e12 * 0.0254);
    expect(nums[1]).toBeLessThan(d.si * 1e12 * 0.0254 * 1.001);
  });
  it('a nominal bound rounds to nearest', () => {
    expect(formatDelayPerLength(delayPerLength(1), 'nominal')).toBe('3.336 ps/mm (84.73 ps/in)');
  });
  it('rejects a non time-per-length quantity', () => {
    expect(() => formatDelayPerLength(q(1, DIM.LENGTH), 'nominal')).toThrow(DelayDomainError);
  });
});

describe('properties', () => {
  const eeArb = fc.double({ min: 1, max: 130, noNaN: true });
  it('delay grows with eps_eff and wavelength shrinks with it and with f', () => {
    fc.assert(
      fc.property(eeArb, eeArb, (a, b) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(delayPerLength(hi).si).toBeGreaterThan(delayPerLength(lo).si);
        const f = fromUnit(1, 'GHz');
        expect(guidedWavelength(hi, f).si).toBeLessThan(guidedWavelength(lo, f).si);
      }),
      { numRuns: 200 },
    );
  });
  it('lambda_g x f x delay-per-length x c / c is consistent: lambda_g = 1 / (f x delay per length)', () => {
    fc.assert(
      fc.property(eeArb, fc.double({ min: 1e6, max: 1e11, noNaN: true }), (ee, f) => {
        const lam = guidedWavelength(ee, q(f, DIM.FREQUENCY)).si;
        expect(relErr(lam, 1 / (f * delayPerLength(ee).si))).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 200 },
    );
  });
  it('skew is linear in the length mismatch and equals mismatch x delay per length', () => {
    fc.assert(
      fc.property(eeArb, fc.double({ min: 1e-5, max: 1, noNaN: true }), (ee, dl) => {
        const s1 = skewFromMismatch(q(dl, DIM.LENGTH), ee).si;
        const s2 = skewFromMismatch(q(2 * dl, DIM.LENGTH), ee).si;
        expect(relErr(s2, 2 * s1)).toBeLessThanOrEqual(1e-14);
        expect(relErr(s1, dl * delayPerLength(ee).si)).toBeLessThanOrEqual(1e-14);
      }),
      { numRuns: 200 },
    );
  });
  it('skew uses the magnitude of a signed mismatch', () => {
    expect(skewFromMismatch(q(-0.005, DIM.LENGTH), 3).si).toBe(skewFromMismatch(q(0.005, DIM.LENGTH), 3).si);
  });
});

describe('guards', () => {
  it('eps_eff below 1, NaN, infinite, zero and negative are rejected', () => {
    for (const ee of [0.99, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => delayPerLength(ee)).toThrow(DelayDomainError);
      expect(() => guidedWavelength(ee, fromUnit(1, 'GHz'))).toThrow(DelayDomainError);
      expect(() => skewFromMismatch(fromUnit(1, 'mm'), ee)).toThrow(DelayDomainError);
    }
  });
  it('frequency must be a positive frequency quantity', () => {
    expect(() => guidedWavelength(4, fromUnit(0, 'Hz'))).toThrow(DelayDomainError);
    expect(() => guidedWavelength(4, fromUnit(-1, 'Hz'))).toThrow(DelayDomainError);
    expect(() => guidedWavelength(4, fromUnit(1, 'mm'))).toThrow(DelayDomainError);
  });
  it('a mismatch must be a length', () => {
    expect(() => skewFromMismatch(fromUnit(1, 's'), 4)).toThrow(DelayDomainError);
  });
});
