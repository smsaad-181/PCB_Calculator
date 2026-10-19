import type { AccuracyClass } from '../../confidence';

/**
 * Gated creepage calculator (IEC 60664-1 method). Creepage is driven by the RMS working voltage, pollution degree and material
 * group (or CTI), never by voltage alone, and is never scaled by altitude. No table value ships with the app.
 */
export const meta = {
  id: 'creepage',
  title: 'Creepage (IEC 60664-1 method, gated table lookup)',
  method: 'IEC 60664-1 creepage from user-entered tables (gated: no value ships with the app)',
  reference: {
    standard: 'IEC 60664-1',
    edition: 'the data set edition selected by the user',
    ledgerIds: ['S-030', 'S-030a', 'S-030b', 'S-030d', 'S-030e', 'S-030f', 'S-030g', 'S-031', 'S-031a', 'S-032', 'S-034'],
  },
  formula:
    'creepage = max(T5(rms working voltage, pollution degree, material group from T6 or entered, surface) x reinforced multiplier from the T7 rule record, associated clearance); no altitude term; no coating credit unless a verified T7 record is selected; every table value is user-entered from the licensed standard',
  ledgerIds: ['S-030', 'S-030a', 'S-030b', 'S-030d', 'S-030e', 'S-030f', 'S-030g', 'S-031', 'S-031a', 'S-032', 'S-034'],
  /** Plausibility windows only catch unit slips; they are not standard limits. */
  validity: { voltageV: [1e-3, 1e8], lengthM: [1e-6, 1] },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
  mandatoryInputs: [
    'edition',
    'insulationType',
    'workingVoltageRms',
    'pollutionDegree',
    'materialGroup OR cti',
    'surface',
    'frequency',
    'associatedClearance',
  ] as string[],
} as const;
