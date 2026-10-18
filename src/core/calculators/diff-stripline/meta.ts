import type { AccuracyClass } from '../../confidence';

/**
 * Edge-coupled symmetric stripline pair, Cohn (1955) approximate even/odd forms, zero strip thickness (ledger S-022a,
 * PAYWALLED-USER-MUST-VERIFY), with Zdiff = 2 Zodd and Zcommon = Zeven/2 (ledger S-022b, VERIFIED).
 * Source read: F. Caspers, "RF engineering basic concepts: S-parameters", CERN Accelerator School, arXiv:1201.2346, eq. (3.3),
 * who cites H. Howe, Stripline Circuit Design (Artech, 1982) and calls the forms "a good approximation"; no range or
 * accuracy is stated. The primary (Cohn 1955, IRE Trans. MTT) was NOT read and the exact elliptic forms
 * (ke = tanh(pi w/2b) tanh(pi (w+s)/2b), ko = tanh(pi w/2b) coth(pi (w+s)/2b)) were not read in any source.
 *
 *   Z0,even = (1/sqrt(er)) K / (w/b + ln2/pi + (1/pi) ln(1 + tanh(pi s/2b)))
 *   Z0,odd  = (1/sqrt(er)) K / (w/b + ln2/pi + (1/pi) ln(1 + coth(pi s/2b)))
 *
 * The source prints K = 94.15 ohm; decision Q-1 (OPEN_RISKS) takes that constant as eta0/4 = 94.1826 ohm (mu0 c exact),
 * the same prefactor as the single stripline of ledger S-021 (0.034 % above the printed 94.15). The result states this.
 * The formula string is built here, next to the implementation, so the formula shown is the one implemented.
 *
 * Decisions applied: Q-4 centred symmetric pair only (no offset, no broadside); Q-5 narrow strips with finite thickness are
 * not offered and, since S-022a records NO validity range, the nearest recorded stripline range (S-021a, Steer: w/(b - t) > 0.05)
 * is applied as the out-of-range rule, and w/b below the wide-strip value 0.35 is flagged as an unsourced inference only.
 */

export const meta = {
  id: 'diff-stripline',
  title: 'Edge-coupled differential stripline (centred pair)',
  method:
    'Cohn approximation (zero thickness) for an edge-coupled symmetric stripline pair, TEM, homogeneous dielectric; Zdiff = 2 Zodd (ledger S-022a PAYWALLED-USER-MUST-VERIFY)',
  reference: {
    standard: 'Cohn approximate even/odd forms (Cohn 1955; Howe 1982) as given in Caspers, RF engineering basic concepts: S-parameters, CERN Accelerator School, arXiv:1201.2346 eq. (3.3); Zdiff = 2 Zodd, Zcommon = Zeven/2 per Polar Instruments AP157 and Sonnet help',
    edition: 'Cohn 1955 not read (paywalled); one secondary source (Caspers) retrieved 2026-10-18; ledger S-022a, S-022b',
    ledgerIds: ['S-022a', 'S-022b', 'S-021', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    'Z0e = (η0/4)/√εr / (w/b + ln2/π + (1/π)·ln[1 + tanh(π·s/2b)]); Z0o = (η0/4)/√εr / (w/b + ln2/π + (1/π)·ln[1 + coth(π·s/2b)]); ' +
    'b = plane-to-plane spacing, w = strip width, s = edge-to-edge gap; εe = εr for both modes (homogeneous); ' +
    'weak-coupling limit s → ∞: Zinf = (η0/4)/√εr / (w/b + 2·ln2/π); Zdiff = 2·Z0o; Zcommon = Z0e/2 (S-022b); ' +
    'η0 = μ0·c (exact SI constants, decision Q-1; the source prints 94.15 for η0/4); delay = √εr/c; λg = λ0/√εr',
  ledgerIds: ['S-022a', 'S-022b', 'S-021', 'S-013', 'S-029', 'S-029a', 'S-029b'],
  validity: {
    /** No range is recorded for S-022a. Decision Q-5: apply the nearest recorded stripline range (S-021a, w/(b - t) > 0.05; t is not used here). */
    wOverBMin: 0.05,
    /** Wide-strip value of the single stripline form (part A); w/b below it is flagged as an unsourced inference, never as a limit. */
    wOverBWide: 0.35,
    /** Spacing solve bracket in s/b: numerical bracket, not a validity range. At 30 both modes equal the weak-coupling limit to double precision. */
    sSolveRange: [0.001, 30] as readonly [number, number],
  },
  accuracyClass: 'empirical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
