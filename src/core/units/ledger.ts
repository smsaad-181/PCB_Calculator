import { ledgerStatusOf, type LedgerStatus } from '../data/ledger-status';

export type { LedgerStatus };

type UnitsLedgerId = 'S-003' | 'S-003d' | 'S-005' | 'S-006';

function statusOf(id: UnitsLedgerId): LedgerStatus {
  const status = ledgerStatusOf(id);
  if (status === undefined) throw new Error(`Ledger row ${id} missing from src/core/data/ledger.ts`);
  return status;
}

/**
 * Statuses of the ledger rows this module depends on, read from the single in-code ledger mirror
 * (src/core/data/ledger.ts, kept in sync with docs/sources/LEDGER.md by tests/ledger-sync.test.ts).
 * The UI renders a badge for any status other than VERIFIED.
 */
export const LEDGER_STATUS: Readonly<Record<UnitsLedgerId, LedgerStatus>> = {
  'S-003': statusOf('S-003'),
  'S-003d': statusOf('S-003d'),
  'S-005': statusOf('S-005'),
  'S-006': statusOf('S-006'),
};
