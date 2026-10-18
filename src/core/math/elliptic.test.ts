import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EllipticDomainError, agm, ellipticK, ellipticKPrime, ellipticKRatio } from './elliptic';

// Phase 2 task 2: complete elliptic integral of the first kind by the AGM (ledger S-023b, VERIFIED). TESTS FIRST.
// Convention: K takes the MODULUS k, not the parameter m = k^2. Expected values come from
//  - the independent oracle (tools/reference/ref_impedance.py: AGM written separately and cross-checked there against
//    composite-Simpson quadrature of the defining integral; mirrored in docs/golden-vectors.json),
//  - NIST DLMF section 19.20 (retrieved 2026-10-18): the lemniscatic integral
//      integral_0^1 dt / sqrt(1 - t^4) = Gamma(1/4)^2 / (4 (2 pi)^(1/2)) = 1.31102 87771 46059 90523 ...
//    which equals K(1/sqrt 2) / sqrt 2, so K(1/sqrt 2) = sqrt 2 x 1.31102 87771 46059 90523 = 1.85407 46773 01371 9 ...
//  - the AGM identity DLMF 19.8.5 and the complement relation DLMF 19.2.9 (S-023b), restated below.
// Nothing here reads the implementation for an expected value.

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

const LEMNISCATE_HALF = 1.31102877714606; // DLMF 19.20: Gamma(1/4)^2 / (4 (2 pi)^(1/2)) = 1.31102 87771 46059 90523..., kept to double precision
const K_INV_SQRT2 = Math.SQRT2 * LEMNISCATE_HALF;

describe("golden vectors (oracle): K(k) and K'(k)", () => {
  const ks = [0.001, 0.1, 0.3, 0.5, 5 / 9, Math.SQRT1_2, 0.9, 0.99, 0.999999];
  const name = (kind: 'K' | 'Kprime', k: number): string => `elliptic_${kind}_k${g(k)}`;
  for (const k of ks) {
    it(`k = ${String(k)}`, () => {
      const a = vec(name('K', k));
      const b = vec(name('Kprime', k));
      expect(a.ledger_ids).toEqual(['S-023b']);
      expect(a.status).toBe('VERIFIED');
      expect(relErr(ellipticK(k), a.pinned_expected)).toBeLessThanOrEqual(1e-13);
      expect(relErr(ellipticKPrime(k), b.pinned_expected)).toBeLessThanOrEqual(1e-13);
    });
  }
});

describe('known values (DLMF 19.20 lemniscatic case)', () => {
  it('K(1/sqrt 2) = sqrt 2 x 1.31102877714605990523 to 1e-15', () => {
    expect(relErr(ellipticK(Math.SQRT1_2), K_INV_SQRT2)).toBeLessThanOrEqual(1e-15);
    expect(relErr(K_INV_SQRT2, 1.8540746773013719)).toBeLessThan(1e-15);
  });
  it("K'(1/sqrt 2) = K(1/sqrt 2) (self-complementary modulus)", () => {
    expect(relErr(ellipticKPrime(Math.SQRT1_2), ellipticK(Math.SQRT1_2))).toBeLessThanOrEqual(1e-15);
    expect(relErr(ellipticKRatio(Math.SQRT1_2), 1)).toBeLessThanOrEqual(1e-15);
  });
  it('K(0) = pi/2 is only a limit: K(k) -> pi/2 as k -> 0 (tested at k = 1e-8; k = 0 itself is rejected)', () => {
    expect(relErr(ellipticK(1e-8), Math.PI / 2)).toBeLessThan(1e-15);
    expect(ellipticK(1e-8)).toBeGreaterThanOrEqual(Math.PI / 2);
  });
  it('small-k series K = (pi/2)(1 + k^2/4 + 9k^4/64 + ...) (k = 0.05)', () => {
    const k = 0.05;
    const series = (Math.PI / 2) * (1 + k ** 2 / 4 + (9 * k ** 4) / 64);
    expect(relErr(ellipticK(k), series)).toBeLessThan(2e-8);
  });
  it("logarithmic limit K'(k) ~ ln(4/k) as k -> 0 (k = 1e-6, error O(k^2 ln k))", () => {
    expect(relErr(ellipticKPrime(1e-6), Math.log(4 / 1e-6))).toBeLessThan(1e-10);
  });
});

describe('AGM identities (S-023b)', () => {
  it("K(k) = pi / (2 M(1, k')) with k' = sqrt(1 - k^2) (DLMF 19.8.5), M from the exported agm()", () => {
    for (const k of [0.05, 0.3, 0.6, 0.8, 0.95]) {
      const kp = Math.sqrt(1 - k * k);
      expect(relErr(ellipticK(k), Math.PI / (2 * agm(1, kp)))).toBeLessThanOrEqual(1e-14);
    }
  });
  it("K'(k) = K(k') (DLMF 19.2.9): the direct AGM(1, k) form equals K evaluated at the complementary modulus", () => {
    for (const k of [0.05, 0.3, 0.6, 0.8, 0.95]) {
      expect(relErr(ellipticKPrime(k), ellipticK(Math.sqrt(1 - k * k)))).toBeLessThanOrEqual(1e-13);
    }
  });
  it('agm is symmetric, homogeneous, bounded by the means, and agm(a, a) = a', () => {
    expect(agm(3, 3)).toBe(3);
    expect(relErr(agm(1, 2), agm(2, 1))).toBeLessThanOrEqual(1e-15);
    expect(relErr(agm(2, 4), 2 * agm(1, 2))).toBeLessThanOrEqual(1e-15);
    const m = agm(1, 0.25);
    expect(m).toBeLessThan((1 + 0.25) / 2);
    expect(m).toBeGreaterThan(Math.sqrt(0.25));
    // Gauss's constant 1/agm(1, sqrt 2) = 0.83462684167407318628...
    expect(relErr(1 / agm(1, Math.SQRT2), 0.8346268416740732)).toBeLessThanOrEqual(1e-15);
  });
});

describe('properties', () => {
  const kArb = fc.double({ min: 1e-6, max: 1 - 1e-9, noNaN: true });
  it("K is strictly increasing and K' strictly decreasing in k", () => {
    fc.assert(
      fc.property(kArb, kArb, (a, b) => {
        fc.pre(Math.abs(a - b) > 1e-6);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(ellipticK(hi)).toBeGreaterThan(ellipticK(lo));
        expect(ellipticKPrime(hi)).toBeLessThan(ellipticKPrime(lo));
      }),
      { numRuns: 300 },
    );
  });
  it("K >= pi/2 and K' >= pi/2; the ratio K'/K is above 1 below 1/sqrt 2 and below 1 above it", () => {
    fc.assert(
      fc.property(kArb, (k) => {
        expect(ellipticK(k)).toBeGreaterThanOrEqual(Math.PI / 2);
        expect(ellipticKPrime(k)).toBeGreaterThanOrEqual(Math.PI / 2);
        const r = ellipticKRatio(k);
        if (k < Math.SQRT1_2 - 1e-9) expect(r).toBeGreaterThan(1);
        if (k > Math.SQRT1_2 + 1e-9) expect(r).toBeLessThan(1);
      }),
      { numRuns: 300 },
    );
  });
  it("complement symmetry: K(k) = K'(k') for k' computed without cancellation", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 0.99, noNaN: true }), (k) => {
        const kp = Math.sqrt((1 - k) * (1 + k));
        expect(relErr(ellipticK(k), ellipticKPrime(kp))).toBeLessThanOrEqual(1e-12);
      }),
      { numRuns: 300 },
    );
  });
  it("ratio form is K'/K and is finite across the open interval", () => {
    fc.assert(
      fc.property(kArb, (k) => {
        expect(relErr(ellipticKRatio(k), ellipticKPrime(k) / ellipticK(k))).toBeLessThanOrEqual(1e-14);
        expect(Number.isFinite(ellipticKRatio(k))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
  it("Landen: K(k) = (1 + k1) K(k1) with k1 = (1 - k')/(1 + k') (one AGM step of M(1, k'))", () => {
    for (const k of [0.2, 0.5, 0.8]) {
      const kp = Math.sqrt(1 - k * k);
      const k1 = (1 - kp) / (1 + kp);
      expect(relErr(ellipticK(k), (1 + k1) * ellipticK(k1))).toBeLessThanOrEqual(1e-13);
    }
  });
});

describe('domain guards: 0 < k < 1, finite', () => {
  const bad: [string, number][] = [
    ['zero', 0],
    ['negative zero', -0],
    ['negative', -0.5],
    ['one', 1],
    ['above one', 1.5],
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ];
  for (const [label, k] of bad) {
    it(`${label} throws EllipticDomainError with the modulus convention in the message`, () => {
      for (const f of [ellipticK, ellipticKPrime, ellipticKRatio]) {
        expect(() => f(k)).toThrow(EllipticDomainError);
        expect(() => f(k)).toThrow(/modulus k/);
      }
    });
  }
  it('a non-number is rejected', () => {
    expect(() => ellipticK('0.5' as unknown as number)).toThrow(EllipticDomainError);
  });
  it('agm rejects non-positive and non-finite arguments', () => {
    expect(() => agm(0, 1)).toThrow(EllipticDomainError);
    expect(() => agm(1, -1)).toThrow(EllipticDomainError);
    expect(() => agm(Number.NaN, 1)).toThrow(EllipticDomainError);
    expect(() => agm(1, Number.POSITIVE_INFINITY)).toThrow(EllipticDomainError);
  });
  it('the largest and smallest representable moduli stay finite (k = 1 - 2^-53, k = 5e-324)', () => {
    expect(Number.isFinite(ellipticK(1 - 2 ** -53))).toBe(true);
    expect(Number.isFinite(ellipticKPrime(1 - 2 ** -53))).toBe(true);
    expect(Number.isFinite(ellipticK(5e-324))).toBe(true);
    expect(Number.isFinite(ellipticKPrime(5e-324))).toBe(true);
    expect(ellipticKPrime(5e-324)).toBeGreaterThan(700);
  });
});

describe('performance', () => {
  it('100 000 evaluations in well under 1 s', () => {
    const t0 = Date.now();
    let s = 0;
    for (let i = 1; i <= 100000; i++) s += ellipticKRatio(i / 100001);
    expect(Number.isFinite(s)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
