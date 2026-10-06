import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bisect, brent } from './rootfind';

// Regression tests from docs/validation/reports/phase-0-perf.md. Expected values from math only.

const cube = (x: number): number => (x - 1) ** 3;
const quint = (x: number): number => (x - 2) ** 5;

const sept = (x: number): number => (x - 1) ** 7;

// Worst-case safeguard (contract B): on multiple roots brent converges with the default maxIter.
// Phase 1 self-heating callers use a bisection fallback when brent returns MAX_ITER with a small
// maxIter budget (OPEN_RISKS R-14), so no "within 50 iterations" claim is made here.
describe('M-1 brent worst case on multiple roots', () => {
  const cases: Array<[string, (x: number) => number, number, number, number]> = [
    ['(x-1)^3 [0,3]', cube, 0, 3, 1],
    ['(x-1)^3 [-5,2]', cube, -5, 2, 1],
    ['(x-1)^3 [0.9,1e3]', cube, 0.9, 1e3, 1],
    ['(x-1)^3 [-10,990]', cube, -10, 990, 1],
    ['(x-2)^5 [0,5]', quint, 0, 5, 2],
    ['(x-2)^5 [1,1000]', quint, 1, 1000, 2],
    ['(x-2)^5 [-500,500]', quint, -500, 500, 2],
    ['(x-1)^7 [-1,5]', sept, -1, 5, 1],
    ['(x-1)^7 [0,3]', sept, 0, 3, 1],
  ];
  for (const [name, f, lo, hi, root] of cases) {
    it(`M-1 ${name} converges with default maxIter and stays within bisect + 10`, () => {
      const r = brent(f, lo, hi);
      const b = bisect(f, lo, hi);
      expect(r.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (r.ok && b.ok) {
        expect(Math.abs(r.x - root)).toBeLessThan(1e-3);
        expect(r.iterations).toBeLessThanOrEqual(b.iterations + 10);
      }
    });
    it(`M-1 ${name} converges with explicit maxIter 100`, () => {
      expect(brent(f, lo, hi, { maxIter: 100 }).ok).toBe(true);
    });
    it(`M-1 ${name} is deterministic`, () => {
      expect(brent(f, lo, hi)).toEqual(brent(f, lo, hi));
    });
  }

  it('M-1 property: brent iterations <= bisect iterations + 10 for (x-r)^k, k in {1,3,5,7}', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.constantFrom(1, 3, 5, 7),
        fc.double({ min: 0.01, max: 500, noNaN: true }),
        fc.double({ min: 0.01, max: 500, noNaN: true }),
        (r, k, left, right) => {
          const f = (x: number): number => (x - r) ** k;
          const lo = r - left;
          const hi = r + right;
          const bi = bisect(f, lo, hi);
          const br = brent(f, lo, hi);
          expect(bi.ok).toBe(true);
          expect(br.ok).toBe(true);
          if (bi.ok && br.ok) expect(br.iterations).toBeLessThanOrEqual(bi.iterations + 10);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('m-1 converged criterion on success outcomes', () => {
  const step = (x: number): number => (x < 0.5 ? -1 : 1);
  for (const [name, solver] of [
    ['bisect', bisect],
    ['brent', brent],
  ] as const) {
    it(`m-1 ${name}: step discontinuity reports converged 'bracket'`, () => {
      const r = solver(step, 0, 1);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.converged).toBe('bracket');
        expect(Math.abs(r.fx)).toBe(1);
      }
    });
    it(`m-1 ${name}: smooth f with ftol>0 can report 'residual'`, () => {
      const r = solver((x) => x * x * x - 2, 0, 3, { ftol: 1e-3 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.converged).toBe('residual');
        expect(Math.abs(r.fx)).toBeLessThanOrEqual(1e-3);
      }
    });
    it(`m-1 ${name}: smooth f with ftol 0 reports 'bracket'`, () => {
      const r = solver((x) => x * x * x - 2, 0, 3, { ftol: 0 });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.converged).toBe('bracket');
    });
  }
});

describe('m-2 throwing callbacks are returned as F_THREW', () => {
  for (const [name, solver] of [
    ['bisect', bisect],
    ['brent', brent],
  ] as const) {
    it(`m-2 ${name}: throw at first endpoint evaluation`, () => {
      const r = solver(() => {
        throw new Error('boom-first');
      }, 0, 1);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('F_THREW');
        expect(r.message).toContain('boom-first');
        expect(typeof r.iterations).toBe('number');
      }
    });
    it(`m-2 ${name}: throw at second endpoint evaluation`, () => {
      let n = 0;
      const r = solver((x) => {
        if (++n === 2) throw new Error('boom-second');
        return x - 0.3;
      }, 0, 1);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('F_THREW');
        expect(r.message).toContain('boom-second');
      }
    });
    it(`m-2 ${name}: throw mid-iteration`, () => {
      let n = 0;
      let r: ReturnType<typeof solver> | undefined;
      expect(() => {
        r = solver((x) => {
          if (++n === 5) throw new Error('boom-mid');
          return x * x * x - 2;
        }, 0, 3);
      }).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r && !r.ok) {
        expect(r.reason).toBe('F_THREW');
        expect(r.message).toContain('boom-mid');
        expect(r.iterations).toBeGreaterThanOrEqual(1);
      }
    });
    it(`m-2 ${name}: non-Error throw values do not escape`, () => {
      let r: ReturnType<typeof solver> | undefined;
      expect(() => {
        r = solver(() => {
          throw 'string-thrown';
        }, 0, 1);
      }).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r && !r.ok) expect(r.reason).toBe('F_THREW');
    });
  }
});
