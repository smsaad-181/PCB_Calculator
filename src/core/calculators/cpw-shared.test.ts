import { describe, expect, it } from 'vitest';
import { EllipticDomainError } from '../math/elliptic';
import { DIM, q } from '../units';
import { SOLVE_RATIO_RANGE, domainFailure, resolveGeometry, safeZ0, sinhRatio, substrateCheck, tanhRatio, validateCoplanar } from './cpw-shared';
import { dimensionless } from './impedance-shared';

// Shared coplanar helpers: stable hyperbolic ratios against the direct formulas, the solver wrapper and the error mapping.

const relErr = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe('stable hyperbolic ratios equal the direct sinh and tanh ratios where those are representable', () => {
  it('sinh(x)/sinh(y) and tanh(x)/tanh(y)', () => {
    for (const [x, y] of [[0.001, 0.002], [0.5, 1.4], [2, 3], [10, 12], [0.7, 0.7], [1e-9, 3]] as [number, number][]) {
      expect(relErr(sinhRatio(x, y), Math.sinh(x) / Math.sinh(y))).toBeLessThan(1e-13);
      expect(relErr(tanhRatio(x, y), Math.tanh(x) / Math.tanh(y))).toBeLessThan(1e-13);
    }
  });
  it('and stay finite where sinh and cosh overflow', () => {
    expect(Number.isFinite(sinhRatio(800, 810))).toBe(true);
    expect(Math.sinh(800) / Math.sinh(810)).toBeNaN();
    expect(tanhRatio(800, 810)).toBeCloseTo(1, 14);
  });
});

describe('safeZ0 and domainFailure', () => {
  it('maps an elliptic domain error to NaN and rethrows anything else', () => {
    expect(safeZ0(() => { throw new EllipticDomainError('x'); }, 1, 1, 1, 1)).toBeNaN();
    expect(safeZ0(() => ({ z0: 42 }), 1, 1, 1, 1)).toBe(42);
    expect(() => safeZ0(() => { throw new Error('other'); }, 1, 1, 1, 1)).toThrow('other');
  });
  it('domainFailure gives OUT_OF_DOMAIN with the detail, for an Error and for a non-Error', () => {
    for (const e of [new Error('detail A'), 'detail B']) {
      const out = domainFailure(e);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe('OUT_OF_DOMAIN');
        expect(out.error.message).toMatch(/detail [AB]/);
      }
    }
  });
});

describe('resolveGeometry and substrateCheck', () => {
  const ohm = (x: number) => q(x, DIM.RESISTANCE);
  const len = (x: number) => q(x, DIM.LENGTH);
  it('the solve bracket is the documented 0.01 to 100', () => {
    expect(SOLVE_RATIO_RANGE).toEqual([0.01, 100]);
  });
  it('a model that cannot be evaluated at the bracket ends is OUT_OF_DOMAIN for both solve modes', () => {
    const r1 = resolveGeometry({ mode: 'solve-gap', width: len(1e-3), targetZ0: ohm(50) }, () => Number.NaN, 4);
    const r2 = resolveGeometry({ mode: 'solve-width', gap: len(1e-3), targetZ0: ohm(50) }, () => Number.NaN, 4);
    for (const r of [r1, r2]) {
      expect(r.ok).toBe(false);
      if (!r.ok && !r.outcome.ok) expect(r.outcome.error.code).toBe('OUT_OF_DOMAIN');
    }
  });
  it('a function that turns non-finite inside the bracket is NO_CONVERGENCE (never a result)', () => {
    // finite at the two ends, NaN in the middle of the bracket
    const z = (w: number, s: number): number => {
      const x = s / w;
      return x > 0.5 && x < 20 ? Number.NaN : x < 1 ? 10 : 100;
    };
    const r = resolveGeometry({ mode: 'solve-gap', width: len(1e-3), targetZ0: ohm(50) }, z, 4);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.outcome.ok) expect(r.outcome.error.code).toBe('NO_CONVERGENCE');
    const zw = (w: number, s: number): number => {
      const x = w / s;
      return x > 0.5 && x < 20 ? Number.NaN : x < 1 ? 100 : 10;
    };
    const r2 = resolveGeometry({ mode: 'solve-width', gap: len(1e-3), targetZ0: ohm(50) }, zw, 4);
    expect(r2.ok).toBe(false);
    if (!r2.ok && !r2.outcome.ok) expect(r2.outcome.error.code).toBe('NO_CONVERGENCE');
  });
  it('substrateCheck: fails below the minimum, is marginal between minimum and comfort, clean above', () => {
    expect(substrateCheck(1, 1, 1.9, 2, 3).check.ok).toBe(false);
    expect(substrateCheck(1, 1, 2, 2, 3)).toMatchObject({ check: { ok: true }, marginal: true });
    expect(substrateCheck(1, 1, 3, 2, 3)).toMatchObject({ check: { ok: true }, marginal: false });
  });
  it('validateCoplanar rejects a non-object', () => {
    expect(validateCoplanar(null, 'length').ok).toBe(false);
    expect(validateCoplanar({ width: dimensionless(1) }, 'length').ok).toBe(false);
  });
});
