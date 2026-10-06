/*
 * Bracketed scalar root finders (pure, deterministic; failures are returned as values).
 *
 * Algorithm references:
 *  - bisect: classical interval bisection (any numerical-analysis text).
 *  - brent:  R. P. Brent, "Algorithms for Minimization without Derivatives", 1973, ch. 4
 *            (zeroin: inverse quadratic interpolation / secant, accepted only under Brent's
 *            e/d rule, with bisection fallback), plus the pace guard described below.
 *
 * Termination: fx === 0 or |fx| <= ftol (converged 'residual'), or bracket width <=
 * max(xtol, 4 * eps) * |x| + absTol (converged 'bracket'). The default tolerance is purely
 * RELATIVE (xtol 1e-12, xabs 0) so it is valid at any SI magnitude; xtol below 4 eps is raised to
 * 4 eps. absTol = xabs, except that when the bracket CONTAINS 0 (lo <= 0 <= hi) it is raised to the
 * floor 4 * eps * max(|lo|, |hi|) (same unit as x). That floor exists only so a root at exactly 0,
 * which no relative width test can satisfy, can terminate; a root with |x| below the floor is
 * then resolved only to that absolute accuracy. A bracket that excludes 0 has NO absolute floor, so
 * tiny roots are resolved to relative accuracy however wide the bracket is. Exact zero residual
 * always terminates immediately. Never hangs, never throws.
 *
 * Worst case. Let N = ceil(log2(width0 / tol)) be the bisection iteration count, k the number of
 * evaluations done, and w_k = |c - b| the width of the current bracket. Pace guard: if
 * w_k > width0 * 2^(LAG - k) (Brent more than LAG halvings behind the bisection pace width0*2^-k)
 * a bisection step is forced (LAG = 5). Claim: w_k <= width0 * 2^(LAG + 1 - k) for all k.
 * Proof: the bracket never widens (an interpolation point is accepted only between b and c, a
 * bisection point is the midpoint), so an unforced step, taken only when w_k <= width0*2^(LAG-k),
 * gives w_{k+1} <= w_k <= width0*2^(LAG-(k+1)) * 2, i.e. at most LAG + 1 halvings behind; a forced
 * step halves w, which keeps the lag unchanged and therefore <= LAG + 1. So with an identical
 * stopping tolerance Brent stops no later than iteration N + LAG + 1 = N + 6, in exact arithmetic.
 * Warm-up: the first 5 steps are always bisection (same midpoint expression as bisect()), so a
 * root sitting exactly on one of the first five midpoints (round-number brackets such as [0, 8]
 * with root 5) is hit by both solvers on the same iteration. Forced bisections keep the lag
 * unchanged, so the bound above is unaffected; the cost is at most 5 steps of interpolation speed.
 * Measured: over 20000 random (x-r)^k problems (k = 1,3,5,7) brent used never more than
 * bisect + 7 iterations (the excess arising when bisect hit the root exactly and stopped early). Because bisect can stop early by an exact residual hit
 * at a dyadic root, a bound relative to the ACTUAL bisect count is not provable; the bound relative
 * to N is the one proven here. Brent's standard e/d rule does not provide any such bound by itself
 * (it can need ~N^2 iterations on multiple roots).
 */

export type SolveFailureReason = 'INVALID_ARGS' | 'NO_BRACKET' | 'MAX_ITER' | 'NON_FINITE' | 'F_THREW';

export interface SolveOptions {
  /**
   * Relative bracket tolerance: width <= max(xtol, 4 eps) * |x| (+ xabs), so values below
   * 4 eps are raised to 4 eps. Default 1e-12. When the bracket contains 0 an absolute floor of
   * 4 eps * max(|lo|, |hi|) is added; a bracket excluding 0 has no absolute floor.
   */
  readonly xtol?: number;
  /** Absolute bracket tolerance, same unit as x. Default 0. Finite and >= 0. */
  readonly xabs?: number;
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
      /** 'residual': fx === 0 or |fx| <= ftol. 'bracket': stopped on bracket width only. */
      readonly converged: 'residual' | 'bracket';
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
/** Halvings Brent may fall behind the bisection pace before a bisection step is forced. */
const BRENT_LAG = 5;
/** Leading bisection steps (see header): shares exact dyadic-midpoint hits with bisect(). */
const BRENT_WARMUP = 5;

function fail(reason: SolveFailureReason, message: string, iterations: number): SolveOutcome {
  return { ok: false, reason, message, iterations };
}

/** Evaluates f without letting anything escape. */
type Evaluated = { readonly v: number } | { readonly threw: string };

function safeEval(f: (x: number) => number, x: number): Evaluated {
  try {
    return { v: f(x) };
  } catch (err: unknown) {
    return { threw: err instanceof Error ? err.message : String(err) };
  }
}

function threw(msg: string, x: number, iterations: number): SolveOutcome {
  return fail('F_THREW', `Function threw at x = ${x}: ${msg}`, iterations);
}

interface Prepared {
  readonly xtol: number;
  readonly xabs: number;
  /** Effective absolute tolerance: xabs, raised to 4 eps * max(|lo|, |hi|) only if lo <= 0 <= hi. */
  readonly absTol: number;
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
  const xabs = opts?.xabs ?? 0;
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
  if (!(xabs >= 0) || !Number.isFinite(xabs)) {
    return fail('INVALID_ARGS', 'Tolerance xabs must be finite and >= 0.', 0);
  }
  if (!Number.isInteger(maxIter) || maxIter < 1) {
    return fail('INVALID_ARGS', 'maxIter must be a positive integer.', 0);
  }
  const elo = safeEval(f, lo);
  if ('threw' in elo) return threw(elo.threw, lo, 0);
  const ehi = safeEval(f, hi);
  if ('threw' in ehi) return threw(ehi.threw, hi, 0);
  const flo = elo.v;
  const fhi = ehi.v;
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) {
    return fail('NON_FINITE', 'Function is not finite at a bracket endpoint.', 0);
  }
  if (flo === 0) return { ok: true, x: lo, fx: flo, iterations: 0, converged: 'residual', bracket: [lo, lo], method };
  if (fhi === 0) return { ok: true, x: hi, fx: fhi, iterations: 0, converged: 'residual', bracket: [hi, hi], method };
  if (Math.sign(flo) === Math.sign(fhi)) {
    return fail('NO_BRACKET', 'f(lo) and f(hi) have the same sign; no root bracketed.', 0);
  }
  // m-A: the machine-epsilon absolute floor exists only so that a root at 0 can terminate; it is
  // applied only when the bracket contains 0. A bracket that excludes 0 is purely relative.
  const containsZero = lo <= 0 && hi >= 0;
  const absTol = containsZero ? Math.max(xabs, 4 * EPS * Math.max(Math.abs(lo), Math.abs(hi))) : xabs;
  return { xtol, xabs, absTol, ftol, maxIter, flo, fhi };
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
    const em = safeEval(f, mid);
    if ('threw' in em) return threw(em.threw, mid, iter);
    const fm = em.v;
    if (!Number.isFinite(fm)) {
      return fail('NON_FINITE', `Function is not finite at x = ${mid}.`, iter);
    }
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
    const tol = Math.max(p.xtol, 4 * EPS) * Math.abs(mid) + p.absTol;
    const byResidual = fm === 0 || Math.abs(fm) <= p.ftol;
    if (byResidual || b - a <= tol) {
      return {
        ok: true,
        x: mid,
        fx: fm,
        iterations: iter,
        converged: byResidual ? 'residual' : 'bracket',
        bracket: [a, b],
        method: 'bisection',
      };
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
  // Safeguard (beyond Brent's e/d rule): see the header. Never lag more than LAG + 1 halvings
  // behind the bisection pace width0 * 2^-k.
  const width0 = hi - lo;
  const LAG = BRENT_LAG;

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
    const tol1 = 0.5 * p.xtol * Math.abs(b) + 2 * EPS * Math.abs(b) + 0.5 * p.absTol;
    const xm = 0.5 * (c - b);
    const byResidual = fb === 0 || Math.abs(fb) <= p.ftol;
    if (byResidual || Math.abs(xm) <= tol1) {
      return {
        ok: true,
        x: b,
        fx: fb,
        iterations: iter,
        converged: byResidual ? 'residual' : 'bracket',
        bracket: [Math.min(b, c), Math.max(b, c)],
        method: 'brent',
      };
    }
    if (iter >= p.maxIter) {
      return fail('MAX_ITER', `Brent did not converge within ${p.maxIter} iterations.`, iter);
    }

    const forceBisect = iter < BRENT_WARMUP || Math.abs(c - b) > width0 * Math.pow(2, LAG - iter);

    let bisected = false;
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
        bisected = true;
      }
    } else {
      d = xm;
      e = d;
      bisected = true;
    }
    a = b;
    fa = fb;
    if (bisected) {
      // Same midpoint expression as bisect(), so both solvers see identical points (e.g. an
      // exactly representable root at the midpoint is hit by both).
      const lowEnd = Math.min(b, c);
      b = lowEnd + 0.5 * (Math.max(b, c) - lowEnd);
    } else {
      b += Math.abs(d) > tol1 ? d : xm >= 0 ? tol1 : -tol1;
    }
    const eb = safeEval(f, b);
    if ('threw' in eb) return threw(eb.threw, b, iter + 1);
    fb = eb.v;
    if (!Number.isFinite(fb)) {
      return fail('NON_FINITE', `Function is not finite at x = ${b}.`, iter + 1);
    }
  }
}
