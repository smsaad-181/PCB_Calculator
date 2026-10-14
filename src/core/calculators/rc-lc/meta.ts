import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'rc-lc',
  title: 'RC and LC time constant and resonance',
  method: 'Ideal lumped RC (time constant, −3 dB cut-off) and LC (resonant frequency, √(L/C)); give two of three to solve the third',
  reference: {
    standard: 'RC and LC relations (textbook, ledger S-019); √(L/C) for a lumped LC (ledger S-019b, UNVERIFIED naming)',
    edition: 'n/a',
    ledgerIds: ['S-019', 'S-019b'],
  },
  formula: {
    rc: 'τ = R × C; fc = 1 / (2π × R × C)',
    lc: 'f0 = 1 / (2π × √(L × C)); √(L/C) (= X_L = X_C at f0)',
  },
  ledgerIds: ['S-019', 'S-019b'],
  /** Ledger rows per family: the RC family needs only S-019; the LC family also reports √(L/C), which is S-019b. */
  familyLedgerIds: { rc: ['S-019'], lc: ['S-019', 'S-019b'] },
  /** Plausibility ranges, not standards: a value outside them is flagged and rated low confidence. */
  validity: { resistanceOhm: [1e-3, 1e12], capacitanceF: [1e-15, 1], inductanceH: [1e-12, 100], frequencyHz: [1e-3, 1e10] },
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: [] as string[],
  /** Left out on purpose: the 10-90 % rise time (2.197 τ) because its constant is not in ledger S-019; Q because it is not sourced. */
  omitted: ['rise time 10-90 %', 'Q'],
} as const;

export type Family = 'rc' | 'lc';
