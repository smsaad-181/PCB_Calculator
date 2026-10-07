import { LEDGER } from './ledger';

/**
 * Finished (plated) copper MINIMUM thickness in um by foil weight (oz/ft2). Ledger S-009: figures read secondhand from a
 * fabricator FAQ quoting IPC-6012 minimums, not from the standard. These are minimums, NOT typical values.
 */
export const FINISHED_COPPER_MIN_UM = {
  inner: { 0.5: 11.4, 1: 24.9, 2: 55.7 },
  outerClass2: { 0.5: 33.4, 1: 47.9, 2: 78.7 },
  outerClass3: { 0.5: 38.4, 1: 52.9, 2: 83.7 },
} as const;

const row = LEDGER.find((r) => r.id === 'S-009');
if (!row) throw new Error('ledger row S-009 missing from src/core/data/ledger.ts');

export const FINISHED_COPPER_SOURCE = { ledgerId: 'S-009', status: row.status } as const;

export interface FinishedVsNominal {
  readonly minimumUm: number;
  /** (minimum / nominal - 1) x 100, against the nominal thickness passed in. */
  readonly percentVsNominal: number;
  readonly class: string;
}

const WEIGHTS = [0.5, 1, 2] as const;

/** Secondhand S-009 minimum finished thickness against a nominal thickness; undefined where the table has no figure. */
export function finishedVsNominal(layer: 'inner' | 'outer', weightOzFt2: number, nominalUm: number): FinishedVsNominal | undefined {
  if (layer !== 'inner' && layer !== 'outer') return undefined;
  if (!Number.isFinite(nominalUm) || nominalUm <= 0) return undefined;
  const w = WEIGHTS.find((x) => x === weightOzFt2);
  if (w === undefined) return undefined;
  const minimumUm = layer === 'inner' ? FINISHED_COPPER_MIN_UM.inner[w] : FINISHED_COPPER_MIN_UM.outerClass2[w];
  return {
    minimumUm,
    percentVsNominal: (minimumUm / nominalUm - 1) * 100,
    class: layer === 'inner' ? 'inner layer minimum' : 'outer layer minimum, Class 2',
  };
}
