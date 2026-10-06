import { describe, expect, it } from 'vitest';
import { bisect, brent, type SolveOptions } from './rootfind';

/*
 * Scale-invariance contract (calc-validator finding M-1).
 *
 * Termination: bracket width <= xtol * |x| + xabs, with a machine-epsilon floor on the relative
 * part. Defaults: xtol = 1e-12 (RELATIVE), xabs = 0. There is no unit-blind "1 +" absolute term.
 * `xabs` is an opt-in absolute tolerance (same unit as x), must be finite and >= 0 (else INVALID_ARGS).
 *
 * Root exactly 0: with a purely relative criterion the width can never shrink below xtol*|x| = 0,
 * so the solver must stop on the residual (fx === 0 -> ok, converged 'residual'), or fail with a
 * returned value (MAX_ITER). It must never hang and never throw.
 */
type Opts = SolveOptions & { readonly xabs?: number };
type Solver = (f: (x: number) => number, lo: number, hi: number, o?: Opts) => ReturnType<typeof bisect>;
const SOLVERS: ReadonlyArray<readonly [string, Solver]> = [
  ['bisect', bisect],
  ['brent', brent],
];

const REL = 1e-9;
const ROOTS = [1e-15, 1e-12, 1e-9, 1, 1e6];

describe.each(SOLVERS)('%s: roots at every SI magnitude', (_name, solve) => {
  for (const r of ROOTS) {
    it(`f(x)=x-r, r=${String(r)}, bracket [0, 10r]`, () => {
      const out = solve((x) => x - r, 0, 10 * r);
      expect(out.ok).toBe(true);
      if (out.ok) expect(Math.abs(out.x - r) / r).toBeLessThanOrEqual(REL);
    });
    it(`f(x)=x-r, r=${String(r)}, bracket [r/10, 10r]`, () => {
      const out = solve((x) => x - r, r / 10, 10 * r);
      expect(out.ok).toBe(true);
      if (out.ok) expect(Math.abs(out.x - r) / r).toBeLessThanOrEqual(REL);
    });
    it(`nonlinear f(x)=ln(x/r), r=${String(r)}, bracket [r/10, 10r]`, () => {
      const out = solve((x) => Math.log(x / r), r / 10, 10 * r);
      expect(out.ok).toBe(true);
      if (out.ok) expect(Math.abs(out.x - r) / r).toBeLessThanOrEqual(REL);
    });
  }

  it('capacitance: 1/(2 pi f C) = 50 ohm at 1 GHz, bracket [1e-15, 1e-9] F', () => {
    const f0 = 1e9;
    const target = 50;
    const exact = 1 / (2 * Math.PI * f0 * target);
    const out = solve((C) => 1 / (2 * Math.PI * f0 * C) - target, 1e-15, 1e-9);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(Math.abs(out.x - exact) / exact).toBeLessThanOrEqual(REL);
      // residual in ohms: |dZ/dC| * dC = 50 * relErr, so 1e-6 ohm is generous for 1e-9 relative
      expect(Math.abs(1 / (2 * Math.PI * f0 * out.x) - target)).toBeLessThanOrEqual(1e-6);
    }
  });

  it('inductance: 2 pi f L = 0.01 ohm at 1 MHz, bracket [1e-12, 1e-6] H', () => {
    const exact = 0.01 / (2 * Math.PI * 1e6);
    const out = solve((L) => 2 * Math.PI * 1e6 * L - 0.01, 1e-12, 1e-6);
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x - exact) / exact).toBeLessThanOrEqual(REL);
  });

  it('x - 1e-13 on [0, 1e-12] is solved, not skipped', () => {
    const out = solve((x) => x - 1e-13, 0, 1e-12);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(Math.abs(out.x - 1e-13) / 1e-13).toBeLessThanOrEqual(REL);
      expect(out.iterations).toBeGreaterThan(0);
    }
  });

  it('a wrong root is never reported as ok: if ok, the relative error is small', () => {
    for (const r of [3.3e-14, 4.7e-12, 2.2e-10, 8.1e-8]) {
      const out = solve((x) => x * x - r * r, 0, 1e3 * r);
      if (out.ok) expect(Math.abs(out.x - r) / r).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe.each(SOLVERS)('%s: root exactly 0 terminates', (_name, solve) => {
  it('f(x)=x on [-1, 1] returns ok with fx === 0 and converged residual', () => {
    const out = solve((x) => x, -1, 1);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.fx).toBe(0);
      expect(out.converged).toBe('residual');
      expect(out.x).toBe(0);
    }
  });
  it('f(x)=x on [-1, 3] returns ok with fx === 0', () => {
    const out = solve((x) => x, -1, 3);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.fx).toBe(0);
  });
  it('f(x)=x^3 (zero not hit exactly) returns a value, never hangs or throws; if ok then |x| tiny', () => {
    const out = solve((x) => x * x * x, -1, 2.3);
    if (out.ok) expect(Math.abs(out.x)).toBeLessThanOrEqual(1e-6);
    else expect(['MAX_ITER']).toContain(out.reason);
  });
  it('with xabs the root-at-zero problem converges to an absolute tolerance', () => {
    const out = solve((x) => x * x * x, -1, 2.3, { xabs: 1e-9 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x)).toBeLessThanOrEqual(1e-8);
  });
});

/*
 * m-A (calc-validator): the absolute floor 4*eps*max(|lo|,|hi|) applies ONLY when the bracket
 * contains 0 (lo <= 0 <= hi). A bracket that excludes 0 is purely relative, so tiny roots are
 * resolved to relative accuracy regardless of how wide the bracket is.
 */
describe.each(SOLVERS)('%s: m-A absolute floor only when the bracket contains 0', (_name, solve) => {
  it('root 1e-15 on [1e-18, 1] (excludes 0): relative error <= 1e-9', () => {
    const out = solve((x) => x - 1e-15, 1e-18, 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x - 1e-15) / 1e-15).toBeLessThanOrEqual(1e-9);
  });
  it('root 1e-13 on [1e-14, 1] (excludes 0): relative error <= 1e-9', () => {
    const out = solve((x) => x - 1e-13, 1e-14, 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x - 1e-13) / 1e-13).toBeLessThanOrEqual(1e-9);
  });
  it('root 1e-13 on [0, 1] (contains 0): only floor-limited accuracy is expected', () => {
    // Documented: the floor is 4*eps*max(|lo|,|hi|) = 4*eps*1, so the error bound is that floor
    // plus a 1e-12 relative allowance on the root.
    const root = 1e-13;
    const out = solve((x) => x - root, 0, 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x - root)).toBeLessThanOrEqual(4 * Number.EPSILON * 1 + 1e-12 * root);
  });
  it('root exactly 0 on [-1, 1] still terminates (residual or width below floor)', () => {
    const out = solve((x) => x, -1, 1);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(['residual', 'bracket']).toContain(out.converged);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(4 * Number.EPSILON);
    }
  });
});

describe.each(SOLVERS)('%s: xabs option', (_name, solve) => {
  it('absolute tolerance terminates earlier than the relative default', () => {
    const f = (x: number): number => x - 0.3 + 1e-3 * Math.sin(x);
    const tight = solve(f, 0, 1);
    const loose = solve(f, 0, 1, { xtol: 0, xabs: 1e-4 });
    expect(tight.ok && loose.ok).toBe(true);
    if (tight.ok && loose.ok) {
      expect(loose.iterations).toBeLessThan(tight.iterations);
      expect(Math.abs(loose.x - tight.x)).toBeLessThanOrEqual(2e-4);
    }
  });
  it('x - 1e-13 on [0, 1e-12] with xabs 1e-9 stops within xabs of the root', () => {
    const out = solve((x) => x - 1e-13, 0, 1e-12, { xabs: 1e-9 });
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.abs(out.x - 1e-13)).toBeLessThanOrEqual(1e-9);
  });
  it.each([-1e-9, Number.NaN, Number.POSITIVE_INFINITY])('rejects xabs = %s as INVALID_ARGS', (bad) => {
    const out = solve((x) => x - 0.5, 0, 1, { xabs: bad });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('INVALID_ARGS');
  });
  it('default relative criterion is independent of an explicit xabs of 0', () => {
    const a = solve((x) => Math.log(x / 1e-12), 1e-13, 1e-11);
    const b = solve((x) => Math.log(x / 1e-12), 1e-13, 1e-11, { xabs: 0 });
    expect(b).toEqual(a);
  });
});
