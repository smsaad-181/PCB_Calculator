import type { AccuracyClass } from '../../confidence';

/**
 * Legacy IPC-2221 trace width / current / temperature rise (Mode B). Constants come from ledger S-001 (fitted equation),
 * S-010 (chart validity range), S-006 (units) and S-003 (foil convention); S-001 and S-010 are PAYWALLED-USER-MUST-VERIFY.
 * Margin 1.25 and current derating 0.8 are engineering defaults, not values from a standard.
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
    deltaTMaxC: 100,
    deltaTChartStartC: 10,
    weightOzFt2: [0.5, 3],
    widthMil: 400,
  },
  defaults: { ambientC: 25, designMargin: 1.25, currentDerating: 0.8 },
  accuracyClass: 'empirical' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
