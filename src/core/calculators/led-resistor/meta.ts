import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'led-resistor',
  title: 'LED series resistor',
  method: 'LED series resistor R = (Vs − N × Vf) / If, rounded UP to an E-series value so the current does not exceed the target',
  reference: {
    standard: 'LED series resistor relation (textbook, ledger S-019); E-series preferred values (IEC 60063, ledger S-016) when snapping',
    edition: 'n/a',
    ledgerIds: ['S-019', 'S-016'],
  },
  formula: 'R = (Vs − N × Vf) / If; with a stock value R′ ≥ R: If′ = (Vs − N × Vf) / R′, P(R) = If′² × R′, P(LED) = Vf × If′, P(source) = Vs × If′',
  ledgerIds: ['S-019', 'S-016'],
  /** Plausibility ranges, not standards: a value outside them is flagged and rated low confidence. They are not typical LED values. */
  validity: { vsV: 1000, vfV: [0.1, 100], currentA: [1e-6, 10], resistanceOhm: [0.1, 1e9], nLeds: 1000 },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
  /** Rounding of headline values: the required resistor is a minimum (rounds up); the actual current and powers are predictions (round up). */
  rounding: 'resistor is a min-requirement (rounds up); current and powers are predictions (round up); errors are nominal; the snap treats an ideal value within 1e-12 (relative) of a series value as that value, so the current can exceed the target by that float noise only',
  /** Step used for the Vf sensitivity result: a stated unit step, not a threshold. */
  vfSensitivityStepV: 0.1,
} as const;
