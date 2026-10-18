import type { AccuracyClass } from '../../confidence';

/**
 * Conductor-backed coplanar waveguide (CPWG, lower ground plane at the substrate thickness h): Ghione-Naldi form as transcribed in
 * the Qucs technical documentation §12 eqs. 12.10-12.13 (ledger S-023a, PAYWALLED-USER-MUST-VERIFY). The primary (G. Ghione and
 * C. Naldi, Electronics Letters 19(18), 1983) was NOT read, and Qucs (tier 4) is the only full read. K(k) by the AGM (S-023b, VERIFIED).
 *
 * k3 convention: k3 = tanh(pi W/(4h)) / tanh(pi (W + 2s)/(4h)), the form of Qucs, KiCad's citation and US 7,202,765. The NextPCB
 * calculator writes the argument as pi w/(2h) with the full width, a factor-2 conflict that is probably a page error; it is NOT used.
 * Decision Q-1: 60 pi = eta0/2 from exact constants. Decision Q-6: CPWG Ghione-Naldi, badged. Q-7: dispersion not modelled.
 */
export const meta = {
  id: 'cpwg',
  title: 'Conductor-backed coplanar waveguide (CPWG, with lower ground plane)',
  method: 'Conductor-backed coplanar waveguide, Ghione-Naldi conformal-map form, zero strip thickness, no via fence, no dispersion, no soldermask',
  reference: {
    standard:
      'Ghione and Naldi, Parameters of coplanar waveguides with lower ground plane, Electronics Letters 19(18) 1983, as transcribed in Qucs technical documentation §12 eqs. 12.10-12.13; K by AGM (NIST DLMF 19.8.5)',
    edition: 'primary NOT read (paywalled); Qucs tier-4 transcription retrieved 2026-10-18; ledger S-023a (PAYWALLED-USER-MUST-VERIFY), S-023b',
    ledgerIds: ['S-023a', 'S-023b', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    'k = W/(W + 2s); k′ = √(1 − k²); k3 = tanh(πW/4h)/tanh(π(W + 2s)/4h); k3′ = √(1 − k3²); ' +
    'q = [K(k3)/K(k3′)] / ( K(k)/K(k′) + K(k3)/K(k3′) ); εe = 1 + q·(εr − 1); ' +
    'Z0 = (η0/2)/√εe · 1/( K(k)/K(k′) + K(k3)/K(k3′) ); ' +
    'K(k) = π/(2·M(1, k′)) by the arithmetic-geometric mean, K′(k) = K(k′); η0/2 = 60π of the sources, η0 = μ0·c (exact SI constants, decision Q-1); ' +
    'W = strip width, s = gap to each coplanar ground, h = substrate thickness (distance to the lower ground); delay = √εe/c; λg = λ0/√εe',
  ledgerIds: ['S-023a', 'S-023b', 'S-013', 'S-029', 'S-029a', 'S-029b'],
  validity: {
    /** No numeric validity range is recorded for the Ghione-Naldi form (only the Qucs transcription was read), so none is enforced. */
    recordedRange: 'none',
  },
  /** Conformal mapping is an analytical quasi-static solution (not a curve fit); no accuracy figure is recorded for it. */
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
