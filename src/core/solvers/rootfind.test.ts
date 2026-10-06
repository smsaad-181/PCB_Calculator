import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bisect, brent } from './rootfind';
import type { SolveOutcome } from './rootfind';

/*
 * Tolerance convention assumed (documented): termination when |f(x)| <= ftol
 * OR bracket width <= xtol_eff, with xtol_eff = xtol * (1 + |x|)  (absolute+relative combo).
 * Property/golden tests that need the root pinned to 1e-9 pass { ftol: 0 } so the
 * residual criterion cannot stop early on a flat function. Tests for bracket width
 * allow a factor-of-10 slack on xtol_eff because Brent's final bracket is only
 * guaranteed to be of that order, not exactly <= xtol_eff.
 *
 * All numbers below are test numbers only; none are physical claims.
 */

type Solver = (
  f: (x: number) => number,
  lo: number,
  hi: number,
  opts?: { xtol?: number; ftol?: number; maxIter?: number },
) => SolveOutcome;
const SOLVERS: [string, Solver, 'bisection' | 'brent', number][] = [
  ['bisect', bisect, 'bisection', 200],
  ['brent', brent, 'brent', 100],
];
const STRICT = { xtol: 1e-12, ftol: 0 };

function mustOk(r: SolveOutcome) {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}: ${r.message}`);
  return r;
}

describe.each(SOLVERS)('%s: golden roots', (_name, solve, method) => {
  it('x^2 - 2 on [0,2] -> sqrt(2) within 1e-12', () => {
    const r = mustOk(solve((x) => x * x - 2, 0, 2, STRICT));
    expect(Math.abs(r.x - Math.SQRT2)).toBeLessThan(1e-12 * 4);
    expect(r.method).toBe(method);
  });

  it('cos x - x on [0,1] -> Dottie number (residual and reference loop)', () => {
    const f = (x: number) => Math.cos(x) - x;
    const r = mustOk(solve(f, 0, 1, STRICT));
    expect(Math.abs(f(r.x))).toBeLessThan(1e-12);
    // reference: fixed-point iteration x <- cos x (contraction ~0.67/step)
    let ref = 1;
    for (let i = 0; i < 2000; i++) ref = Math.cos(ref);
    expect(Math.abs(r.x - ref)).toBeLessThan(1e-11);
  });

  it('x^3 on [-1,2] -> 0 (flat root)', () => {
    const r = mustOk(solve((x) => x * x * x, -1, 2, STRICT));
    expect(Math.abs(r.x)).toBeLessThan(1e-9);
  });

  it('step-like function converges to the discontinuity', () => {
    const r = mustOk(solve((x) => (x < 0.3 ? -1 : 1), 0, 1, STRICT));
    expect(Math.abs(r.x - 0.3)).toBeLessThan(1e-9);
  });

  it('works when f(lo) > 0 > f(hi) (decreasing)', () => {
    const r = mustOk(solve((x) => 3 - x, 0, 10, STRICT));
    expect(Math.abs(r.x - 3)).toBeLessThan(1e-9);
  });

  it('root exactly at lo endpoint -> ok, iterations 0, fx 0', () => {
    const r = mustOk(solve((x) => x - 1, 1, 3));
    expect(r.x).toBe(1);
    expect(r.fx).toBe(0);
    expect(r.iterations).toBe(0);
  });

  it('root exactly at hi endpoint -> ok, iterations 0, fx 0', () => {
    const r = mustOk(solve((x) => x - 1, -2, 1));
    expect(r.x).toBe(1);
    expect(r.fx).toBe(0);
    expect(r.iterations).toBe(0);
  });
});

describe.each(SOLVERS)('%s: reporting', (_name, solve, _m, defaultMax) => {
  it('fx equals f(x); x lies inside reported bracket, which contains the root', () => {
    const f = (x: number) => x * x - 2;
    const r = mustOk(solve(f, 0, 2, STRICT));
    expect(r.fx).toBe(f(r.x));
    const [a, b] = r.bracket;
    expect(a).toBeLessThanOrEqual(b);
    expect(a).toBeLessThanOrEqual(r.x);
    expect(r.x).toBeLessThanOrEqual(b);
    expect(a).toBeLessThanOrEqual(Math.SQRT2);
    expect(Math.SQRT2).toBeLessThanOrEqual(b);
  });

  it('with ftol 0, termination is by bracket width (<= ~xtol_eff)', () => {
    const r = mustOk(solve((x) => x * x - 2, 0, 2, { xtol: 1e-12, ftol: 0 }));
    const width = r.bracket[1] - r.bracket[0];
    expect(width).toBeLessThanOrEqual(10 * 1e-12 * (1 + Math.abs(r.x)));
  });

  it('with a loose ftol, termination reports |fx| <= ftol', () => {
    const r = mustOk(solve((x) => x * x - 2, 0, 2, { xtol: 1e-300, ftol: 1e-6 }));
    expect(Math.abs(r.fx)).toBeLessThanOrEqual(1e-6);
  });

  it('iteration count is within the default maxIter', () => {
    const r = mustOk(solve((x) => Math.cos(x) - x, 0, 1, STRICT));
    expect(r.iterations).toBeGreaterThan(0);
    expect(r.iterations).toBeLessThanOrEqual(defaultMax);
  });

  it('tiny maxIter -> MAX_ITER failure value (not thrown, no x)', () => {
    const r = solve((x) => x * x - 2, 0, 2, { xtol: 1e-12, ftol: 0, maxIter: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('MAX_ITER');
      expect(r.iterations).toBeLessThanOrEqual(3);
      expect(r.message.length).toBeGreaterThan(5);
      expect('x' in r).toBe(false);
    }
  });

  it('is deterministic', () => {
    const f = (x: number) => Math.cos(x) - x;
    expect(solve(f, 0, 1)).toEqual(solve(f, 0, 1));
  });
});

describe.each(SOLVERS)('%s: invalid arguments and failures are values', (_name, solve) => {
  const f = (x: number) => x;
  it.each([
    ['lo NaN', NaN, 1],
    ['hi NaN', 0, NaN],
    ['lo -Infinity', -Infinity, 1],
    ['hi +Infinity', 0, Infinity],
    ['lo == hi', 1, 1],
    ['lo > hi', 2, 1],
  ])('INVALID_ARGS: %s', (_n, lo, hi) => {
    const r = solve(f, lo, hi);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('INVALID_ARGS');
      expect(r.iterations).toBe(0);
      expect(r.message.length).toBeGreaterThan(5);
    }
  });

  it('NO_BRACKET when f(lo), f(hi) have the same sign', () => {
    const r = solve((x) => x * x + 1, -1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_BRACKET');
  });

  it('NON_FINITE when f(lo) is NaN', () => {
    const r = solve((x) => (x === 0 ? NaN : x), 0, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NON_FINITE');
  });

  it('NON_FINITE when f(hi) is Infinity', () => {
    const r = solve((x) => (x === 1 ? Infinity : x - 0.5), 0, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NON_FINITE');
  });

  it('NON_FINITE when an interior evaluation (pole at 0) is Infinity', () => {
    const r = solve((x) => 1 / x, -1, 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NON_FINITE');
  });

  it('never returns ok with a non-finite x (property over random bracketed shapes)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: 0.001, max: 50, noNaN: true }),
        fc.double({ min: 0.001, max: 50, noNaN: true }),
        (r0, d1, d2) => {
          const out = solve((x) => (x - r0) * 2, r0 - d1, r0 + d2);
          if (out.ok) {
            expect(Number.isFinite(out.x)).toBe(true);
            expect(Number.isFinite(out.fx)).toBe(true);
          }
        },
      ),
    );
  });
});

describe.each(SOLVERS)('%s: property tests', (_name, solve, _m, defaultMax) => {
  const arbRoot = fc.double({ min: -1000, max: 1000, noNaN: true });
  const arbSide = fc.double({ min: 0.01, max: 100, noNaN: true });
  const arbSlope = fc.double({ min: 0.5, max: 10, noNaN: true });
  const arbSign = fc.constantFrom(1, -1);

  it('linear monotone f: finds root within 1e-9*max(1,|root|)', () => {
    fc.assert(
      fc.property(arbRoot, arbSide, arbSide, arbSlope, arbSign, (r0, d1, d2, a, s) => {
        const out = mustOk(solve((x) => s * a * (x - r0), r0 - d1, r0 + d2, STRICT));
        expect(Math.abs(out.x - r0)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r0)));
        expect(out.iterations).toBeLessThanOrEqual(defaultMax);
      }),
    );
  });

  it('cubic monotone f: finds root within 1e-9*max(1,|root|)', () => {
    fc.assert(
      fc.property(arbRoot, arbSide, arbSide, arbSlope, arbSign, (r0, d1, d2, a, s) => {
        const f = (x: number) => s * a * ((x - r0) ** 3 + (x - r0));
        const out = mustOk(solve(f, r0 - d1, r0 + d2, STRICT));
        expect(Math.abs(out.x - r0)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r0)));
        expect(out.iterations).toBeLessThanOrEqual(defaultMax);
      }),
    );
  });

  it('deterministic: identical inputs give identical outputs', () => {
    fc.assert(
      fc.property(arbRoot, arbSide, arbSide, (r0, d1, d2) => {
        const f = (x: number) => (x - r0) ** 3 + (x - r0);
        expect(solve(f, r0 - d1, r0 + d2)).toEqual(solve(f, r0 - d1, r0 + d2));
      }),
    );
  });
});

describe('brent vs bisect efficiency', () => {
  const cases: [string, (x: number) => number, number, number][] = [
    ['x^2 - 2 on [0,2]', (x) => x * x - 2, 0, 2],
    ['cos x - x on [0,1]', (x) => Math.cos(x) - x, 0, 1],
    ['x^3 + x - 3 on [0,3]', (x) => x ** 3 + x - 3, 0, 3],
    ['exp(x) - 5 on [0,5]', (x) => Math.exp(x) - 5, 0, 5],
  ];
  it.each(cases)('brent iterations <= bisect iterations: %s', (_n, f, lo, hi) => {
    const b = mustOk(bisect(f, lo, hi, STRICT));
    const r = mustOk(brent(f, lo, hi, STRICT));
    expect(r.iterations).toBeLessThanOrEqual(b.iterations);
    expect(r.method).toBe('brent');
    expect(b.method).toBe('bisection');
  });
});

describe('self-heating-style fixed point (test numbers only)', () => {
  // T = T0 + Rth * I^2 * R0 * (1 + alpha * (T - T0)).  Linear in T, so the
  // closed form is dT = k / (1 - k*alpha), with k = Rth*I^2*R0 (valid when k*alpha < 1).
  const T0 = 25;
  const Rth = 20;
  const I = 1;
  const R0 = 0.05;
  const alpha = 0.004;
  const k = Rth * I * I * R0; // = 1.0 exactly

  const rhs = (T: number) => T0 + k * (1 + alpha * (T - T0));
  const g = (T: number) => T - rhs(T);

  it.each(SOLVERS)('%s: solution satisfies its own fixed-point equation to 1e-9 relative', (_n, solve) => {
    const r = mustOk(solve(g, T0, T0 + 100, STRICT));
    const lhs = r.x;
    expect(Math.abs(lhs - rhs(lhs)) / Math.abs(lhs)).toBeLessThan(1e-9);
  });

  it.each(SOLVERS)('%s: matches the closed form', (_n, solve) => {
    const r = mustOk(solve(g, T0, T0 + 100, STRICT));
    const dT = k / (1 - k * alpha);
    expect(Math.abs(r.x - T0 - dT) / dT).toBeLessThan(1e-9);
  });

  it.each(SOLVERS)('%s: alpha = 0 reduces to T0 + k', (_n, solve) => {
    const g0 = (T: number) => T - (T0 + k);
    const r = mustOk(solve(g0, T0 - 1, T0 + 100, STRICT));
    expect(Math.abs(r.x - (T0 + k))).toBeLessThan(1e-9);
  });

  it.each(SOLVERS)('%s: runaway (k*alpha > 1) yields NO_BRACKET on a bounded window', (_n, solve) => {
    // heating slope k*alpha = 2 > 1: g(T) = T - T0 - k(1 + alpha(T-T0)) is monotone decreasing
    // for T > T0 and negative at T0, so there is no root in [T0, T0+100].
    const kr = 100;
    const gr = (T: number) => T - (T0 + kr * (1 + alpha * 5 * (T - T0))); // slope 1 - kr*0.02 = -1
    const r = solve(gr, T0, T0 + 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('NO_BRACKET');
  });
});
