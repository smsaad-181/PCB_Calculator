/*
 * Bracketed scalar root finders (pure, deterministic; failures are returned as values).
 *
 * Algorithm references:
 *  - bisect: classical interval bisection (any numerical-analysis text).
 *  - brent:  R. P. Brent, "Algorithms for Minimization without Derivatives", 1973, ch. 4
 *            (zeroin: inverse quadratic interpolation / secant with bisection fallback).
 *
 * Termination: |f(x)| <= ftol (ftol 0 only stops on an exact zero residual), or
 * bracket width <= xtol * (1 + |x|).
 */

export type SolveFailureReason = 'INVALID_ARGS' | 'NO_BRACKET' | 'MAX_ITER' | 'NON_FINITE';

export interface SolveOptions {
  /** Relative+absolute bracket tolerance: width <= xtol * (1 + |x|). Default 1e-12. */
  readonly xtol?: number;
  /** Residual tolerance. 0 (default) never stops on residual except an exact zero. */
  readonly ftol?: number;
  /** Maximum iterations. Default 200 (bisect) / 100 (brent). */
  readonly maxIter?: number;
}

export type SolveOutcome =
  | {
      readonly ok: true;
      readonly x: number;
      readonly fx: number;
      readonly iterations: number;
      readonly bracket: readonly [number, number];
      readonly method: 'bisection' | 'brent';
    }
  | {
      readonly ok: false;
      readonly reason: SolveFailureReason;
      readonly message: string;
      readonly iterations: number;
    };

const EPS = Number.EPSILON;
const DEFAULT_XTOL = 1e-12;
const DEFAULT_FTOL = 0;

function fail(reason: SolveFailureReason, message: string, iterations: number): SolveOutcome {
  return { ok: false, reason, message, iterations };
}

interface Prepared {
  readonly xtol: number;
  readonly ftol: number;
  readonly maxIter: number;
  readonly flo: number;
  readonly fhi: number;
}

/** Validates args, evaluates endpoints. Returns an outcome if solving is already decided. */
function prepare(
  f: (x: number) => number,
  lo: number,
  hi: number,
  opts: SolveOptions | undefined,
  defaultMax: number,
  method: 'bisection' | 'brent',
): Prepared | SolveOutcome {
  const xtol = opts?.xtol ?? DEFAULT_XTOL;
  const ftol = opts?.ftol ?? DEFAULT_FTOL;
  const maxIter = opts?.maxIter ?? defaultMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return fail('INVALID_ARGS', 'Bracket endpoints must be finite numbers.', 0);
  }
  if (!(lo < hi)) {
    return fail('INVALID_ARGS', 'Bracket requires lo < hi.', 0);
  }
  if (!(xtol >= 0) || !Number.isFinite(xtol) || !(ftol >= 0) || !Number.isFinite(ftol)) {
    return fail('INVALID_ARGS', 'Tolerances xtol and ftol must be finite and >= 0.', 0);
  }
  if (!Number.isInteger(maxIter) || maxIter < 1) {
    return fail('INVALID_ARGS', 'maxIter must be a positive integer.', 0);
  }
  const flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) {
    return fail('NON_FINITE', 'Function is not finite at a bracket endpoint.', 0);
  }
  if (flo === 0) return { ok: true, x: lo, fx: flo, iterations: 0, bracket: [lo, lo], method };
  if (fhi === 0) return { ok: true, x: hi, fx: fhi, iterations: 0, bracket: [hi, hi], method };
  if (Math.sign(flo) === Math.sign(fhi)) {
    return fail('NO_BRACKET', 'f(lo) and f(hi) have the same sign; no root bracketed.', 0);
  }
  return { xtol, ftol, maxIter, flo, fhi };
}

function isOutcome(p: Prepared | SolveOutcome): p is SolveOutcome {
  return 'ok' in p;
}

export function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  opts?: SolveOptions,
): SolveOutcome {
  const p = prepare(f, lo, hi, opts, 200, 'bisection');
  if (isOutcome(p)) return p;
  let a = lo;
  let b = hi;
  let fa = p.flo;
  for (let iter = 1; iter <= p.maxIter; iter++) {
    const mid = a + 0.5 * (b - a);
    const fm = f(mid);
    if (!Number.isFinite(fm)) {
      return fail('NON_FINITE', `Function is not finite at x = ${mid}.`, iter);
    }
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
    const tol = Math.max(p.xtol * (1 + Math.abs(mid)), 4 * EPS * Math.abs(mid));
    if (fm === 0 || Math.abs(fm) <= p.ftol || b - a <= tol) {
      return { ok: true, x: mid, fx: fm, iterations: iter, bracket: [a, b], method: 'bisection' };
    }
  }
  return fail('MAX_ITER', `Bisection did not converge within ${p.maxIter} iterations.`, p.maxIter);
}

export function brent(
  f: (x: number) => number,
  lo: number,
  hi: number,
  opts?: SolveOptions,
): SolveOutcome {
  const p = prepare(f, lo, hi, opts, 100, 'brent');
  if (isOutcome(p)) return p;
  let a = lo;
  let b = hi;
  let fa = p.flo;
  let fb = p.fhi;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  // Safeguard (beyond Brent's e/d rule): if the bracket has not at least halved over
  // the last two iterations, force a bisection. Bounds the worst case (e.g. flat roots)
  // to about 2*log2(width/tol) iterations.
  let widthRef = Math.abs(hi - lo);

  for (let iter = 0; ; iter++) {
    // Keep the root bracketed between b and c; b is the best estimate.
    if (Math.sign(fb) === Math.sign(fc)) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 0.5 * p.xtol * (1 + Math.abs(b)) + 2 * EPS * Math.abs(b);
    const xm = 0.5 * (c - b);
    if (fb === 0 || Math.abs(fb) <= p.ftol || Math.abs(xm) <= tol1) {
      return {
        ok: true,
        x: b,
        fx: fb,
        iterations: iter,
        bracket: [Math.min(b, c), Math.max(b, c)],
        method: 'brent',
      };
    }
    if (iter >= p.maxIter) {
      return fail('MAX_ITER', `Brent did not converge within ${p.maxIter} iterations.`, iter);
    }

    let forceBisect = false;
    if (iter % 2 === 0) {
      const width = Math.abs(c - b);
      forceBisect = iter > 0 && width > 0.5 * widthRef;
      widthRef = width;
    }

    if (!forceBisect && Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let pp: number;
      let q: number;
      const s = fb / fa;
      if (a === c) {
        // secant
        pp = 2 * xm * s;
        q = 1 - s;
      } else {
        // inverse quadratic interpolation
        const qq = fa / fc;
        const r = fb / fc;
        pp = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (pp > 0) q = -q;
      pp = Math.abs(pp);
      if (2 * pp < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
        e = d;
        d = pp / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm >= 0 ? tol1 : -tol1;
    fb = f(b);
    if (!Number.isFinite(fb)) {
      return fail('NON_FINITE', `Function is not finite at x = ${b}.`, iter + 1);
    }
  }
}
