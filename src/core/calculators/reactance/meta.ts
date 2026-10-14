import type { AccuracyClass } from '../../confidence';

export type Kind = 'inductive' | 'capacitive';

export const meta = {
  id: 'reactance',
  title: 'Reactance of an inductor or capacitor',
  method: 'Ideal inductive or capacitive reactance magnitude; give two of reactance, frequency and the component value to solve the third',
  reference: {
    standard: 'Reactance relations (textbook, ledger S-019)',
    edition: 'n/a',
    ledgerIds: ['S-019'],
  },
  formula: {
    inductive: 'X_L = 2π × f × L (magnitude)',
    capacitive: 'X_C = 1 / (2π × f × C) (magnitude)',
  },
  ledgerIds: ['S-019'],
  /** Plausibility ranges, not standards: a value outside them is flagged and rated low confidence. */
  validity: { reactanceOhm: [1e-6, 1e12], frequencyHz: [1e-3, 1e11], inductanceH: [1e-12, 100], capacitanceF: [1e-15, 1] },
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
