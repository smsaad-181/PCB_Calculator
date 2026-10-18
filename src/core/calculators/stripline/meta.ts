import type { AccuracyClass } from '../../confidence';

/**
 * Symmetric (centred) stripline, zero-thickness closed-form approximation (ledger S-021, VERIFIED): Pozar's 3.179 form as given
 * in Steer, Microwave and RF Design II §3.7 eqs. (5), (6), and in the Ansys Lumerical script stripline_Z0.lsf (independent).
 * The finite-thickness wide-strip form (Steer eqs. (1)-(4), ledger S-021a, CONFLICT) is an explicit opt-in variant.
 *
 * Decisions applied (docs/validation/OPEN_RISKS.md): Q-1 the textbook 30 pi is eta0/4 with eta0 = mu0 c (exact constants);
 * Q-4 offset (asymmetric) stripline is not offered; Q-5 narrow strips with finite thickness are not offered (the finite-thickness
 * variant needs w/b >= 0.35), and S-021b (exact elliptic form, UNVERIFIED) is not implemented.
 * Every coefficient lives in SL below and the formula string is built from it, so the formula shown is the one implemented.
 */

export const SL = {
  /** We/b = w/b - (wNarrow - w/b)^2 for w/b < wNarrow, else w/b. */
  wNarrow: 0.35,
  /** Z0 = (eta0/4)/sqrt(er) * 1/(We/b + k); k = 0.441 is 2 ln2/pi rounded as printed in the sources. */
  k: 0.441,
} as const;

export type StriplineThicknessModel = 'none' | 'cohn-wide';
export const STRIPLINE_THICKNESS_MODELS: readonly StriplineThicknessModel[] = ['none', 'cohn-wide'];

const n = (x: number): string => String(x);

export const meta = {
  id: 'stripline',
  title: 'Symmetric stripline impedance (centred inner trace)',
  method: 'Zero-thickness symmetric stripline closed-form approximation (Pozar 3.179 form), TEM, homogeneous dielectric, centred strip',
  reference: {
    standard: 'Pozar 3.179 form, as given in Steer, Microwave and RF Design II §3.7 and in the Ansys Lumerical stripline_Z0.lsf script',
    edition: 'Pozar not read; secondary sources retrieved 2026-10-18; ledger S-021',
    ledgerIds: ['S-021', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    `Z0 = (η0/4)/√εr · 1/(We/b + ${n(SL.k)}); We/b = w/b − (${n(SL.wNarrow)} − w/b)² for w/b < ${n(SL.wNarrow)}, else w/b; ` +
    'b = plane-to-plane spacing, w = strip width; εe = εr (homogeneous); η0 = μ0·c (exact SI constants, decision Q-1; the textbook 30π is η0/4 rounded); ' +
    'delay = √εr/c; λg = λ0/√εr',
  thicknessFormula:
    'S-021a (CONFLICT), wide strips only (w/b ≥ 0.35), t̂ = t/b: Z0 = (η0/4)/√εr · (1 − t̂)/(w/b + Cf); ' +
    'Cf = (2/π)·ln[1/(1 − t̂) + 1] − (t̂/π)·ln[1/(1 − t̂)² − 1]. Narrow strips with finite thickness are not offered.',
  ledgerIds: ['S-021', 'S-021a', 'S-013', 'S-029', 'S-029a', 'S-029b'],
  validity: {
    /** S-021a (Steer): accuracy better than 1 % for w/(b - t) > 0.05 and t/b < 0.025; the only stripline ranges recorded. */
    wOverBMin: 0.05,
    tOverBMax: 0.025,
    /** Wide-strip threshold of the finite-thickness variant. */
    wideMin: SL.wNarrow,
  },
  accuracyClass: 'empirical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
