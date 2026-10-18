import type { AccuracyClass } from '../../confidence';

/**
 * Coaxial line characteristic impedance (ledger S-024, VERIFIED): Z0 = (eta0/2 pi) sqrt(mur/er) ln(b/a), mur = 1, b/a = D/d.
 * Sources: Steer, Microwave and RF Design II §2.8 eq. (1) ("Exact" for the ideal geometry) and A. Ferendeci (Univ. of Cincinnati
 * EE-611 notes), which derives Zc = (1/2 pi) eta ln(b/a), about (60/sqrt(er)) ln(b/a). TEM only: the first higher-order mode
 * cutoff was not researched, so it is not computed and the result says so.
 * Decision Q-1: the prefactor is eta0/(2 pi) from exact constants (59.958 ohm), not the rounded 60 ohm.
 */
export const meta = {
  id: 'coax',
  title: 'Coaxial line impedance',
  method: 'Ideal coaxial line, TEM, lossless: Z0 = (eta0/2 pi) ln(D/d) / sqrt(er)',
  reference: {
    standard: 'Steer, Microwave and RF Design II §2.8 eq. (1); Ferendeci, Univ. of Cincinnati EE-611 TEM modes in coaxial lines',
    edition: 'secondary sources retrieved 2026-10-18; ledger S-024',
    ledgerIds: ['S-024', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    'Z0 = (η0/2π)·ln(D/d)/√εr, μr = 1; D = inner diameter of the outer conductor, d = outer diameter of the inner conductor (radii give the same ratio); ' +
    'η0 = μ0·c (exact SI constants, decision Q-1; textbooks round η0/2π to 60 Ω); εe = εr; delay = √εr/c; λg = λ0/√εr; inverse: D/d = exp(Z0·√εr/(η0/2π))',
  ledgerIds: ['S-024', 'S-013', 'S-029', 'S-029a', 'S-029b'],
  validity: {
    /** Domain, not an accuracy range: concentric round conductors need D > d and a passive dielectric needs er >= 1. */
    erMin: 1,
  },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
