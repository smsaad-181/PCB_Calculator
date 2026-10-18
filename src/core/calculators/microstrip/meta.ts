import type { AccuracyClass } from '../../confidence';

/**
 * Microstrip impedance, Hammerstad-Jensen quasi-static model, zero strip thickness (ledger S-020, VERIFIED).
 * Sources: Steer, Microwave and RF Design II (LibreTexts) §3.5 eqs. (9)-(14), and Janssen et al. arXiv:2509.15043v2 App. D.3
 * (independent authors). The 1980 paper (Hammerstad and Jensen, IEEE MTT-S Digest pp. 407-409) was NOT read.
 *
 * Every numeric coefficient lives in HJ below; calc.ts uses these objects and `formula` is built from them, so the formula
 * shown in the UI and the formula implemented cannot drift apart.
 *
 * Decisions applied (docs/validation/OPEN_RISKS.md, Phase 2 research decisions):
 *  Q-1 prefactor eta0/(2 pi), eta0 = mu0 c from exact constants (not the rounded 60 ohm);
 *  Q-2 zero-thickness model is the base; the thickness correction (S-020a, CONFLICT) is an explicit opt-in variant;
 *  Q-3/Q-7 dispersion is not modelled and says so; Q-8 soldermask is not modelled and says so; Q-4 no embedded microstrip.
 */

/** S-020 coefficients (Steer eqs. 9-14). */
export const HJ = {
  /** a(u) = 1 + (1/a1) ln[(u^4 + (u/a2)^2)/(u^4 + a3)] + (1/a4) ln[1 + (u/a5)^3] */
  a1: 49,
  a2: 52,
  a3: 0.432,
  a4: 18.7,
  a5: 18.1,
  /** b(er) = b1 [(er - b2)/(er + b3)]^b4 */
  b1: 0.564,
  b2: 0.9,
  b3: 3,
  b4: 0.053,
  /** F1(u) = 6 + (2 pi - 6) exp[-(f2/u)^f3];  eps_e uses (1 + k10/u)^(-a b) */
  f2: 30.666,
  f3: 0.7528,
  k10: 10,
} as const;

/** S-020a thickness correction, H-J form (t normalised to h): the 6.517 inside coth^2(sqrt(6.517 u)). */
export const HJ_THICKNESS = { k: 6.517 } as const;

export type ThicknessModel = 'none' | 'hj-procedure-A' | 'hj-procedure-B';
export const THICKNESS_MODELS: readonly ThicknessModel[] = ['none', 'hj-procedure-A', 'hj-procedure-B'];

const n = (x: number): string => String(x);

export const meta = {
  id: 'microstrip',
  title: 'Microstrip impedance (surface trace)',
  method: 'Hammerstad-Jensen quasi-static microstrip, zero strip thickness, no dispersion, no soldermask',
  reference: {
    standard: 'Hammerstad and Jensen, Accurate Models for Microstrip Computer-Aided Design (1980), as given in Steer, Microwave and RF Design II §3.5 and Janssen et al. App. D.3',
    edition: 'H-J 1980 not read (paywalled); secondary sources retrieved 2026-10-18; ledger S-020',
    ledgerIds: ['S-020', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    `u = w/h; a(u) = 1 + (1/${n(HJ.a1)})·ln[(u⁴ + (u/${n(HJ.a2)})²)/(u⁴ + ${n(HJ.a3)})] + (1/${n(HJ.a4)})·ln[1 + (u/${n(HJ.a5)})³]; ` +
    `b(εr) = ${n(HJ.b1)}·[(εr − ${n(HJ.b2)})/(εr + ${n(HJ.b3)})]^${n(HJ.b4)}; ` +
    `εe = (εr + 1)/2 + (εr − 1)/2·(1 + ${n(HJ.k10)}/u)^(−a·b); ` +
    `F1 = 6 + (2π − 6)·exp[−(${n(HJ.f2)}/u)^${n(HJ.f3)}]; Z01 = (η0/2π)·ln[F1/u + √(1 + (2/u)²)]; Z0 = Z01/√εe; ` +
    'η0 = μ0·c (exact SI constants, decision Q-1); delay = √εe/c; λg = λ0/√εe',
  thicknessFormula:
    `S-020a (CONFLICT), H-J form, t/h = t̂: Δu1 = (t̂/π)·ln[1 + 4e/(t̂·coth²(√(${n(HJ_THICKNESS.k)}·u)))]; Δur = ½·[1 + 1/cosh(√(εr − 1))]·Δu1; u1 = u + Δu1; ur = u + Δur. ` +
    'Procedure A (Qucs 11.24-11.25): Z0 = Z01(ur)/√εe(ur) and εe(t) = εe(ur)·[Z01(u1)/Z01(ur)]². ' +
    'Procedure B (Janssen D.3): εe = εe(ur), Z0 = Z01(ur)/√εe(ur). The Wheeler form of Δu is not implemented.',
  ledgerIds: ['S-020', 'S-020a', 'S-013', 'S-029', 'S-029a', 'S-029b', 'S-029d', 'S-029e', 'S-029f', 'S-004'],
  validity: {
    /** S-020: eps_e accuracy range (Steer: better than 0.2 %). */
    uRange: [0.01, 100] as readonly [number, number],
    erRange: [1, 128] as readonly [number, number],
    /** S-020: Z01 is quoted for w/h < 1000 (better than 0.1 %); beyond it the model is refused. */
    uMaxZ01: 1000,
  },
  accuracyClass: 'empirical' as AccuracyClass,
  /** Keys of the optional `tolerances` input (core D); none has a default value. */
  toleranceInputs: ['width', 'height', 'er', 'thickness'] as string[],
} as const;
