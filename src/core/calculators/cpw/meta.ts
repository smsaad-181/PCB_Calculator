import type { AccuracyClass } from '../../confidence';

/**
 * Coplanar waveguide without a lower ground plane: conformal mapping, finite-substrate effective permittivity (ledger S-023,
 * CONFLICT). Sources: Steer, Microwave and RF Design II §3.8 eqs. (2)-(4); Santavicca et al., Appl. Phys. Lett. 119, 252601 (2021),
 * supplementary eqs. (S1)-(S5); Qucs technical documentation §12 eqs. 12.8-12.9 (tier 4). K(k) by the AGM (S-023b, VERIFIED).
 * The primary papers (Gevorgian et al. 1995, Wen 1969, Ghione and Naldi) were NOT read.
 *
 * The conflict (S-023): Steer gives a different, empirical eps_e (a tanh fit with an unstated log base) instead of the conformal
 * map. Decision Q-6 (docs/validation/OPEN_RISKS.md): the conformal-map eps_e is the default because it shares K with Z0; the
 * empirical fit is NOT implemented. Decision Q-1: 30 pi = eta0/4 from exact constants. Q-7: dispersion not modelled, no threshold.
 */
export const meta = {
  id: 'cpw',
  title: 'Coplanar waveguide (CPW, no lower ground plane)',
  method: 'Conformal-map coplanar waveguide with finite-substrate effective permittivity, zero strip thickness, no dispersion, no soldermask',
  reference: {
    standard:
      'Conformal-map CPW as given in Steer, Microwave and RF Design II §3.8, Santavicca et al. APL 119 252601 (2021) supplement and Qucs technical documentation §12; K by AGM (NIST DLMF 19.8.5)',
    edition: 'secondary sources retrieved 2026-10-18 (the primary papers were not read; the effective-permittivity model is in CONFLICT between sources); ledger S-023, S-023b',
    ledgerIds: ['S-023', 'S-023b', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    'k = W/(W + 2s); k′ = √(1 − k²); k1 = sinh(πW/4h)/sinh(π(W + 2s)/4h); k1′ = √(1 − k1²); ' +
    'εe = 1 + ((εr − 1)/2)·[K(k1)/K(k1′)]·[K(k′)/K(k)]; Z0 = (η0/4)/√εe · K(k′)/K(k); ' +
    'K(k) = π/(2·M(1, k′)) by the arithmetic-geometric mean, K′(k) = K(k′); η0/4 = 30π of the sources, η0 = μ0·c (exact SI constants, decision Q-1); ' +
    'W = strip width, s = gap to each coplanar ground, h = substrate thickness; infinite substrate gives εe = (εr + 1)/2; delay = √εe/c; λg = λ0/√εe',
  ledgerIds: ['S-023', 'S-023b', 'S-013', 'S-029', 'S-029a', 'S-029b', 'S-029d', 'S-029e', 'S-029f', 'S-004'],
  validity: {
    /** Steer (S-023): substrate thickness two or three times both W and s. Below the lower figure the check fails; below the upper a caution. */
    hOverMaxMin: 2,
    hOverMaxComfort: 3,
  },
  /** Conformal mapping is an analytical quasi-static solution (not a curve fit); no accuracy figure is recorded for the finite-substrate eps_e. */
  accuracyClass: 'analytical' as AccuracyClass,
  /** Keys of the optional `tolerances` input (core D); none has a default value. */
  toleranceInputs: ['width', 'gap', 'height', 'er'] as string[],
} as const;
