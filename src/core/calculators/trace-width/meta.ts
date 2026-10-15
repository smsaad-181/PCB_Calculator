import type { AccuracyClass } from '../../confidence';

/**
 * Legacy IPC-2221 trace width / current / temperature rise (Mode B). Constants come from ledger S-001 (fitted equation),
 * S-010 (chart validity range), S-006 (units) and S-003 (foil convention); S-001 and S-010 are PAYWALLED-USER-MUST-VERIFY.
 * Margin 1.25 (on current; the recommended width is solved for margin x I) and current derating 0.8 (its reciprocal) are engineering defaults, not values from a standard.
 */
export const meta = {
  id: 'trace-width',
  title: 'Trace width and current capacity (legacy IPC-2221, Mode B)',
  method: 'IPC-2221 legacy (KiCad-compatible)',
  reference: {
    standard: 'IPC-2221 (legacy curve fit; secondary sources only)',
    edition: 'IPC-2221B/C not read',
    ledgerIds: ['S-001', 'S-010', 'S-006', 'S-003'],
  },
  formula:
    'I = k x dT^0.44 x A^0.725 (I in A, dT in degC rise, A in mil2; k = 0.048 external, 0.024 internal); A = (I / (k x dT^0.44))^(1/0.725); width = A / copper thickness; dT = (I / (k x A^0.725))^(1/0.44)',
  ledgerIds: ['S-001', 'S-010', 'S-006', 'S-003', 'S-018'],
  constants: { kOuter: 0.048, kInner: 0.024, exponentDeltaT: 0.44, exponentArea: 0.725 },
  validity: {
    currentA: 35,
    // S-010 CONFLICT: KiCad legacy help text (tier 4, unverified) gives a separate 17.5 A internal limit. Caution only; 35 A is the hard limit.
    innerCurrentCautionA: 17.5,
    deltaTMaxC: 100,
    deltaTChartStartC: 10,
    weightOzFt2: [0.5, 3],
    widthMil: 400,
  },
  defaults: { ambientC: 25, designMargin: 1.25, currentDerating: 0.8 },
  accuracyClass: 'empirical' as AccuracyClass,
  toleranceInputs: ['current', 'deltaT', 'width', 'copperThickness', 'ambient'] as string[],
  /**
   * Min/typ/max envelope and normalised sensitivities (task 9), all optional and only when the user supplies tolerances.
   * Generic helper: src/core/sensitivity.ts (no physics). The envelope is a worst-case corner range over the listed
   * tolerances (2^k corners, k <= 6) plus axis probes; outputs monotone in every tolerated input are exact at corners, others
   * are labelled corners-only. Sensitivities are d ln(output)/d ln(input) by central difference (relative step 1e-4), reported
   * as results named "sensitivity of <output> to <input>". Rounding: a required width rounds up, a capacity rounds down, a
   * rise or temperature is a prediction (rounds up). The thickness tolerance may be an explicit choice of the S-003
   * foil-convention spread or the S-009 finished-copper minimum (thin side only, secondhand); the width tolerance may come from
   * a fab profile only when the user selects it and the profile publishes it (JLCPCB +/-20 %, S-019l, UNVERIFIED).
   */
  envelope: {
    method: 'Worst-case corner analysis of the tolerance box with axis monotonicity probes; local log-log sensitivities by central difference.',
    maxToleratedInputs: 6,
    sensitivityRelativeStep: 1e-4,
    outputs: ['width', 'current capacity', 'temperature rise', 'maximum conductor temperature'],
    thicknessChoices: { 'foil-convention-spread': 'S-003', 'finished-copper-s009': 'S-009' },
    profileTolerance: { key: 'traceWidthTolerancePct', ledgerId: 'S-019l' },
  },
} as const;
