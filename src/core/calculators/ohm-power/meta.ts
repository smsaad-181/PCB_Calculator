import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'ohm-power',
  title: "Ohm's law and power",
  method: "Ohm's law and the power relations, any two of V, I, R, P solve the other two",
  reference: {
    standard: "Ohm's law and the electrical power relations (textbook relations, ledger S-019)",
    edition: 'n/a',
    ledgerIds: ['S-019'],
  },
  formula: 'V = I × R; P = V × I; P = I² × R; P = V² / R',
  ledgerIds: ['S-019'],
  validity: { voltageV: 1000, currentA: 1000, resistanceOhm: [1e-6, 1e12], powerW: 1000 },
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
