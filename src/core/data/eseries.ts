import { ledgerStatusOf, type LedgerStatus } from './ledger-status';

// E-series preferred values (IEC 60063), one decade of mantissas 1.0 <= m < 10 per series.
// Source: ledger S-016 (status PAYWALLED-USER-MUST-VERIFY: the standard itself was not read, the lists come from tertiary
// sources; the UI must show the unverified badge). E3, E6, E12, E24 and E96 are the literal ledger lists.
// E48 is every second E96 value. E192 is the 3 significant-figure definition 10^(n/192) with the single published
// exception n = 185 (9.20, where the rounded formula gives 9.19).

export type SeriesName = 'E3' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192';

const E3: readonly number[] = [1.0, 2.2, 4.7];
const E6: readonly number[] = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];
const E12: readonly number[] = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
const E24: readonly number[] = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
const E96: readonly number[] = [
  1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78,
  1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24,
  3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.9,
  6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76,
];
const E48: readonly number[] = E96.filter((_v, i) => i % 2 === 0);
const E192_PUBLISHED_EXCEPTION_INDEX = 185;
const E192: readonly number[] = Array.from({ length: 192 }, (_v, n) =>
  n === E192_PUBLISHED_EXCEPTION_INDEX ? 9.2 : Number((10 ** (n / 192)).toPrecision(3)),
);

export const ESERIES: Readonly<Record<SeriesName, readonly number[]>> = Object.freeze({
  E3: Object.freeze([...E3]),
  E6: Object.freeze([...E6]),
  E12: Object.freeze([...E12]),
  E24: Object.freeze([...E24]),
  E48: Object.freeze([...E48]),
  E96: Object.freeze([...E96]),
  E192: Object.freeze([...E192]),
});

const sourceStatus0 = ledgerStatusOf('S-016');
if (sourceStatus0 === undefined) throw new Error('Ledger row S-016 (E-series) is missing; the E-series data cannot carry its status.');
const sourceStatus: LedgerStatus = sourceStatus0;

/** Where the E-series lists come from; the status is read from the in-code ledger so the UI badge cannot drift. */
export const ESERIES_SOURCE: Readonly<{ ledgerId: 'S-016'; status: LedgerStatus }> = Object.freeze({ ledgerId: 'S-016', status: sourceStatus });
