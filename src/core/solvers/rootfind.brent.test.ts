import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bisect, brent } from './rootfind';

/*
 * Brent must be genuine (calc-validator M-3): interpolation steps are active, so on smooth
 * problems brent is much faster than bisect. Contract A (efficiency) and B (worst case:
 * brent iterations <= bisect iterations + 10 for any bracketed problem).
 * The validator measured 6, 6, 12, 1 iterations with an original Brent on the first four problems.
 */

const F0 = 1e9;
const Z = 50;

const SMOOTH: Array<[string, (x: number) => number, number, number]> = [
  ['x^3 - 2x - 5 on [2,3]', (x) => x * x * x - 2 * x - 5, 2, 3],
  ['cos x - x on [0,1]', (x) => Math.cos(x) - x, 0, 1],
  ['exp(x) - 1e6 on [0,30]', (x) => Math.exp(x) - 1e6, 0, 30],
  ['x - 123456789.123 on [0,1e9]', (x) => x - 123456789.123, 0, 1e9],
  ['x^2 - 2 on [0,2]', (x) => x * x - 2, 0, 2],
  ['50 ohm / 1 GHz capacitance on [1e-14,1e-10]', (C) => 1 / (2 * Math.PI * F0 * C) - Z, 1e-14, 1e-10],
];

describe('brent is genuine Brent on smooth problems', () => {
  for (const [name, f, lo, hi] of SMOOTH) {
    it(`${name}: <= 15 iterations, strictly fewer than bisect, method brent`, () => {
      const br = brent(f, lo, hi);
      const bi = bisect(f, lo, hi);
      expect(br.ok).toBe(true);
      expect(bi.ok).toBe(true);
      if (br.ok && bi.ok) {
        expect(br.method).toBe('brent');
        expect(br.iterations).toBeLessThanOrEqual(15);
        expect(br.iterations).toBeLessThan(bi.iterations);
      }
    });
  }

  it('x^3 - 2x - 5 root is correct (2.0945514815423265)', () => {
    const r = brent((x) => x * x * x - 2 * x - 5, 2, 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.abs(r.x - 2.0945514815423265)).toBeLessThanOrEqual(1e-11);
  });

  it('is deterministic', () => {
    for (const [, f, lo, hi] of SMOOTH) expect(brent(f, lo, hi)).toEqual(brent(f, lo, hi));
  });
});

describe('brent vs bisect property tests', () => {
  it('smooth monotone a*x + b*x^3 and exp(c*x) - d: brent <= N + 6 and <= bisect + 10, strictly fewer than bisect in >= 90 %', () => {
    let total = 0;
    let strictly = 0;
    const EPS = Number.EPSILON;
    const record = (f: (x: number) => number, lo: number, hi: number): void => {
      const bi = bisect(f, lo, hi);
      const br = brent(f, lo, hi);
      expect(bi.ok).toBe(true);
      expect(br.ok).toBe(true);
      if (bi.ok && br.ok) {
        total++;
        // Stopping tolerance as defined in rootfind.ts (prepare()/bisect()): defaults xtol 1e-12,
        // xabs 0; tol = max(xtol, 4 eps) * |x| + absTol, absTol = 4 eps * max(|lo|,|hi|) only when
        // the bracket contains 0. N = ceil(log2(width0 / tol)). |x| taken from the bisect result.
        const absTol = lo <= 0 && hi >= 0 ? 4 * EPS * Math.max(Math.abs(lo), Math.abs(hi)) : 0;
        const tol = Math.max(1e-12, 4 * EPS) * Math.abs(bi.x) + absTol;
        const N = Math.ceil(Math.log2((hi - lo) / tol));
        expect(br.iterations).toBeLessThanOrEqual(N + 6);
        expect(br.iterations).toBeLessThanOrEqual(bi.iterations + 10);
        if (br.iterations < bi.iterations) strictly++;
      }
    };
    // Targets come from continuous doubles made non-dyadic (irrational offset), so no root sits
    // on an early bisection midpoint; the 90 % figure then measures the algorithm.
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 5, noNaN: true, noDefaultInfinity: true }),
        (a, b, tRaw) => {
          const t = tRaw + Math.SQRT2 * 1e-3 * (a / 10 + 0.1);
          // monotone increasing, root at t, bracket [0, t + 3]
          const target = a * t + b * t * t * t;
          record((x) => a * x + b * x * x * x - target, 0, t + 3);
        },
      ),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 5, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1.5, max: 1e4, noNaN: true, noDefaultInfinity: true }),
        (cRaw, dRaw) => {
          const c = cRaw + Math.PI * 1e-3;
          const d = dRaw + Math.E * 1e-3;
          // root x = ln(d)/c > 0; bracket [0, 2 ln(d)/c + 1] keeps exp finite
          const hi = (2 * Math.log(d)) / c + 1;
          record((x) => Math.exp(c * x) - d, 0, hi);
        },
      ),
      { numRuns: 300 },
    );
    expect(total).toBeGreaterThanOrEqual(600);
    const frac = strictly / total;
    expect(frac).toBeGreaterThanOrEqual(0.9);
  });

  it('worst case: brent iterations <= bisect iterations + 10 on odd-power bracketed problems', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.constantFrom(1, 3, 5, 7),
        fc.double({ min: 0.01, max: 300, noNaN: true }),
        fc.double({ min: 0.01, max: 300, noNaN: true }),
        (r, k, l, h) => {
          const f = (x: number): number => (x - r) ** k;
          const bi = bisect(f, r - l, r + h);
          const br = brent(f, r - l, r + h);
          expect(bi.ok).toBe(true);
          expect(br.ok).toBe(true);
          if (bi.ok && br.ok) expect(br.iterations).toBeLessThanOrEqual(bi.iterations + 10);
        },
      ),
      { numRuns: 300 },
    );
  });
});
