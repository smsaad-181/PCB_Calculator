import type { AccuracyClass } from '../../confidence';

export const meta = {
  id: 'copper-converter',
  title: 'Copper weight and thickness converter',
  method: 'Nominal copper weight/thickness conversion (labelled convention)',
  reference: {
    standard: 'Fabricator nominal conventions (no standard cited)',
    edition: 'n/a',
    ledgerIds: ['S-003', 'S-003d', 'S-006', 'S-009'],
  },
  formula:
    'thickness = weight[oz/ft2] x (um per oz/ft2 of the chosen convention): nominal-35um 35 um, nominal-1.35mil 34.29 um, or areal mass / 8890 kg/m3 (mass-density); weight = thickness / (um per oz/ft2); estimated finished = base + plating',
  ledgerIds: ['S-003', 'S-003d', 'S-006', 'S-009'],
  validity: { weightOzFt2: [0.25, 10], thicknessUm: [8.75, 350] },
  accuracyClass: 'exact' as AccuracyClass,
  toleranceInputs: [] as string[],
} as const;
