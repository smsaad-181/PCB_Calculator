export type LedgerStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED-USER-MUST-VERIFY';

/**
 * Mirror of the statuses in docs/sources/LEDGER.md for the rows this module depends on, as of writing.
 * The ledger is authoritative; update this map when a row changes status. The UI renders a badge for any
 * status other than VERIFIED.
 */
export const LEDGER_STATUS: Readonly<Record<'S-003' | 'S-005' | 'S-006', LedgerStatus>> = {
  'S-003': 'UNVERIFIED',
  'S-005': 'UNVERIFIED',
  'S-006': 'UNVERIFIED',
};
