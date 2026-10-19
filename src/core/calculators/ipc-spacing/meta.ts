import type { AccuracyClass } from '../../confidence';

/**
 * IPC-2221 conductor spacing method (Table 6-1). A separate, labelled DESIGN GUIDELINE: it has no pollution degree, material group
 * or overvoltage category input (S-033a) and never replaces the IEC 60664-1 calculators. No table value ships with the app.
 */
export const meta = {
  id: 'ipc-spacing',
  title: 'IPC-2221 conductor spacing (design guideline; not a safety insulation assessment)',
  method: 'IPC-2221 Table 6-1 conductor spacing from a user-entered table (design guideline; gated: no value ships with the app)',
  reference: {
    standard: 'IPC-2221',
    edition: 'the data set edition selected by the user',
    ledgerIds: ['S-033', 'S-033a', 'S-034'],
  },
  formula:
    'spacing = T8(voltage between conductors (DC or AC peak), location, conductor kind, coating, elevation); above the top voltage band: top-band value + (V - V_top) x per-volt value from the same column; every table value is user-entered from the licensed standard',
  ledgerIds: ['S-033', 'S-033a', 'S-034'],
  /** Plausibility windows only catch unit slips; they are not standard limits. */
  validity: { voltageV: [1e-3, 1e8], elevationM: [-500, 100_000] },
  accuracyClass: 'analytical' as AccuracyClass,
  toleranceInputs: [] as string[],
  /** Conditional inputs are listed with their condition. None has a default. */
  mandatoryInputs: ['edition', 'voltagePeak', 'location', 'conductorKind (external)', 'coating (external)', 'elevation (external, uncoated)'] as string[],
} as const;
