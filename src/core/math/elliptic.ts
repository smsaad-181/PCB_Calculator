/**
 * Complete elliptic integral of the first kind by the arithmetic-geometric mean (ledger S-023b, VERIFIED).
 *
 * Convention (the usual trap): the argument is the MODULUS k, not the parameter m = k^2.
 *   M(a0, g0): a_{n+1} = (a_n + g_n)/2, g_{n+1} = sqrt(a_n g_n)   (quadratic convergence, NIST DLMF 19.8.1)
 *   K(k)  = pi / (2 M(1, k'))   with k' = sqrt(1 - k^2)            (DLMF 19.8.5)
 *   K'(k) = K(k') = pi / (2 M(1, k))                                (DLMF 19.2.9, and 19.8.5 applied to k')
 * K'(k) is evaluated as pi/(2 M(1, k)) directly, and k' as sqrt((1 - k)(1 + k)), so neither k near 0 nor k near 1 suffers
 * cancellation (numerical practice, not a sourced claim). The open interval 0 < k < 1 is required: K(0) = pi/2 is a limit
 * and K(1) is infinite.
 * Pure: no globals, deterministic.
 */

/** Thrown when an argument is outside the domain of the function. Callers validate first; calculators never let it escape. */
export class EllipticDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EllipticDomainError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const MAX_AGM_ITER = 100;

function checkModulus(k: unknown, fn: string): number {
  if (typeof k !== 'number' || !Number.isFinite(k) || !(k > 0) || !(k < 1)) {
    throw new EllipticDomainError(
      `${fn}: the modulus k must be a finite number with 0 < k < 1 (k is the modulus, not the parameter m = k^2); got ${String(k)}.`,
    );
  }
  return k;
}

/** Arithmetic-geometric mean M(a, g) of two positive finite numbers. */
export function agm(a: number, g: number): number {
  if (typeof a !== 'number' || typeof g !== 'number' || !Number.isFinite(a) || !Number.isFinite(g) || !(a > 0) || !(g > 0)) {
    throw new EllipticDomainError(`agm: both arguments must be finite positive numbers; got ${String(a)} and ${String(g)}.`);
  }
  let x = a;
  let y = g;
  for (let i = 0; i < MAX_AGM_ITER; i++) {
    if (Math.abs(x - y) <= 2 * Number.EPSILON * x) break;
    const next = (x + y) / 2;
    y = Math.sqrt(x * y);
    x = next;
  }
  return (x + y) / 2;
}

/** K(k), modulus k, 0 < k < 1. */
export function ellipticK(k: number): number {
  const m = checkModulus(k, 'ellipticK');
  return Math.PI / (2 * agm(1, Math.sqrt((1 - m) * (1 + m))));
}

/** K'(k) = K(sqrt(1 - k^2)), modulus k, 0 < k < 1. */
export function ellipticKPrime(k: number): number {
  const m = checkModulus(k, 'ellipticKPrime');
  return Math.PI / (2 * agm(1, m));
}

/**
 * K'(k)/K(k) = M(1, k')/M(1, k) from BOTH moduli, for callers that can evaluate the complementary modulus k' = sqrt(1 - k^2)
 * directly without the cancellation of 1 - k^2 (k close to 1) or of k itself (k close to 0). The caller owns the relation
 * k^2 + k'^2 = 1. Each modulus must be in (0, 1]; a value of exactly 1 is accepted because it is what a modulus within half an ulp
 * of 1 rounds to, and the ratio is then still determined to double precision by the other, small modulus (M(1, 1) = 1 is the
 * correct limit of M(1, k) for k -> 1). Both equal to 1 is inconsistent and refused.
 */
export function ellipticKRatioPair(k: number, kPrime: number): number {
  for (const [x, label] of [
    [k, 'ellipticKRatioPair'],
    [kPrime, 'ellipticKRatioPair (complementary modulus)'],
  ] as const) {
    if (typeof x !== 'number' || !Number.isFinite(x) || !(x > 0) || !(x <= 1)) {
      throw new EllipticDomainError(`${label}: the modulus k must be a finite number with 0 < k <= 1 (k is the modulus, not the parameter m = k^2); got ${String(x)}.`);
    }
  }
  if (k === 1 && kPrime === 1) throw new EllipticDomainError('ellipticKRatioPair: the modulus and its complement cannot both be 1.');
  return agm(1, kPrime) / agm(1, k);
}

/** K'(k)/K(k) = M(1, k')/M(1, k): the ratio the conformal-mapping line formulas use. */
export function ellipticKRatio(k: number): number {
  const m = checkModulus(k, 'ellipticKRatio');
  return agm(1, Math.sqrt((1 - m) * (1 + m))) / agm(1, m);
}
