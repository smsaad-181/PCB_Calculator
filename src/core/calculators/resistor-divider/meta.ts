import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'resistor-divider',
  title: 'Resistor divider',
  method: 'Two-resistor divider with an optional load, tolerance envelope and E-series snapping',
  reference: {
    standard: 'Resistor divider relations (textbook, ledger S-019); E-series preferred values (IEC 60063, ledger S-016) when snapping',
    edition: 'n/a',
    ledgerIds: ['S-019', 'S-016'],
  },
  formula: 'Vout = Vin × R2 / (R1 + R2); with a load RL across R2: Vout = Vin × Re / (R1 + Re), Re = R2 ‖ RL',
  ledgerIds: ['S-019', 'S-016'],
  validity: { vinV: 1000, resistanceOhm: [1, 1e9] },
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: ['r1', 'r2', 'load', 'vin'] as string[],
} as const;
