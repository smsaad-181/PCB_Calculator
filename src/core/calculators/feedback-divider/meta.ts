import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'feedback-divider',
  title: 'Regulator feedback divider',
  method: 'Feedback divider Vout = Vref (1 + R1/R2), solve any one of R1, R2, Vout, with optional E-series snapping, FB bias current and tolerance corners',
  reference: {
    standard: 'Feedback divider relation (textbook, ledger S-019); E-series preferred values (IEC 60063, ledger S-016) when snapping',
    edition: 'n/a',
    ledgerIds: ['S-019', 'S-016'],
  },
  formula: 'Vout = Vref × (1 + R1 / R2); R1 (top) is between Vout and FB, R2 (bottom) is between FB and ground; with FB bias current Ib into the pin: Vout = Vref × (1 + R1 / R2) + Ib × R1',
  ledgerIds: ['S-019', 'S-016'],
  /** Plausibility ranges, not standards: a result outside them is flagged and rated low confidence. */
  validity: { vrefV: [0.1, 10], voutV: 1000, resistanceOhm: [1, 1e9], fbBiasA: 1e-3 },
  /** Series values searched for the best pair: this many decades from 1 kohm (1 kohm to 976 kohm of the series). */
  pairWindow: { lowDecade: 3, decades: 3 },
  accuracyClass: 'exact' as AccuracyClass,
  /** Class for printing the tolerance-corner envelope: corners of 1 % parts do not deserve the 6 significant figures of an exact relation (4 s.f.). */
  envelopeAccuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: ['r1', 'r2', 'vref'] as string[],
  /** Rounding of headline values (see results[].bound): resistances, voltages and errors are nominal; currents and powers are predictions (round up). */
  rounding: 'nominal values round to nearest; divider current and powers are predictions and round up',
} as const;
