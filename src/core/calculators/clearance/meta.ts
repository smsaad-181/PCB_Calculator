import type { AccuracyClass } from '../../confidence';

/**
 * Gated clearance calculator (IEC 60664-1 method). No table value ships with the app: every number comes from tables the user
 * entered from a licensed copy (src/core/spacing/tables.ts). Without all mandatory inputs and a populated table cell there is no result.
 */
export const meta = {
  id: 'clearance',
  title: 'Clearance (IEC 60664-1 method, gated table lookup)',
  method: 'IEC 60664-1 clearance from user-entered tables (gated: no value ships with the app)',
  reference: {
    standard: 'IEC 60664-1',
    edition: 'the data set edition selected by the user',
    ledgerIds: ['S-030', 'S-030a', 'S-030b', 'S-030d', 'S-030f', 'S-030g', 'S-031', 'S-031a', 'S-032', 'S-034'],
  },
  formula:
    'clearance = max(T2(impulse withstand voltage, pollution degree, field condition), T3(peak working voltage) when entered) x T4(altitude); reinforced insulation only through the T7 rule record; no coating credit unless a verified T7 record is selected; every table value is user-entered from the licensed standard',
  ledgerIds: ['S-030', 'S-030a', 'S-030b', 'S-030d', 'S-030f', 'S-030g', 'S-031', 'S-031a', 'S-032', 'S-034'],
  /** Plausibility windows only catch unit slips; they are not standard limits. */
  validity: { altitudeM: [-500, 100_000], voltageV: [1e-3, 1e8] },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
  /** Every mandatory input; none has a default. The impulse requirement is one of two routes. */
  mandatoryInputs: [
    'edition',
    'insulationType',
    'ratedImpulseVoltage OR (overvoltageCategory + supplyVoltage)',
    'pollutionDegree',
    'fieldCondition',
    'altitude',
    'workingVoltagePeak',
    'frequency',
  ] as string[],
} as const;
