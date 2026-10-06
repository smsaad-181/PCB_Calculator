/*
 * Bracketed scalar root finders (pure, deterministic; failures are returned as values).
 *
 * Algorithm references:
 *  - bisect: classical interval bisection (any numerical-analysis text).
 *  - brent:  R. P. Brent, "Algorithms for Minimization without Derivatives", 1973, ch. 4
 *            (zeroin: inverse quadratic interpolation / secant with bisection fallback).
 *
 * Termination: fx === 0 or |fx| <= ftol (converged 'residual'), or bracket width <=
 * max(xtol * |x|, 4 * eps * |x|) + xabs (converged 'bracket'). The default tolerance is purely
 * RELATIVE (xtol 1e-12, xabs 0) so it is valid at any SI magnitude. A root at exactly 0 cannot
 * satisfy a relative width test, so the absolute tolerance has a scale-aware floor of
 * 4 * eps * max(|lo|, |hi|) (a few machine epsilons of the bracket magnitude, same unit as x):
 * near 0 the width test becomes width <= max(xabs, floor). A root with |x| below that floor is
 * resolved only to that absolute accuracy. Exact zero residual still terminates immediately. Never hangs, never throws.
 *
 * Worst case: bisect needs N = ceil(log2(width/tol)) iterations. Brent is additionally
 * safeguarded: a bisection step is forced whenever, after k iterations, the bracket is wider
 * than width0 * 2^-(k + 0.6) (i.e. Brent must stay ahead of bisection by 0.6 halvings).
 * A forced bisection halves the width, so it preserves that margin, and a single interpolation
 * step can lose less than one halving, so the lag behind pure bisection never exceeds 0.4
 * halving. Hence brent iterations <= N + 1 in exact arithmetic (the two tolerance tests differ
 * only by a few eps), well inside the "bisection + 5" requirement. Plain Brent without this
 * guard can need ~N^2 iterations on multiple roots.
 */

export type SolveFailureReason = 'INVALID_ARGS' | 'NO_BRACKET' | 'MAX_ITER' | 'NON_FINITE' | 'F_THREW';

export interface SolveOptions {
  /** Relative bracket tolerance: width <= xtol * |x| (+ xabs). Default 1e-12. */
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
  /** Effective absolute tolerance: max(xabs, 4 eps * max(|lo|, |hi|)). */
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
  const absTol = Math.max(xabs, 4 * EPS * Math.max(Math.abs(lo), Math.abs(hi)));
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
  // Safeguard (beyond Brent's e/d rule): never lag more than LAG halvings behind bisection.
  const width0 = hi - lo;
  const LAG = -0.6;

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

    const forceBisect = Math.abs(c - b) > width0 * Math.pow(2, -(iter - LAG));

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
