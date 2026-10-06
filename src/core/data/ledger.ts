// Source ledger mirror. Transcribed from docs/sources/LEDGER.md; tests/ledger-sync.test.ts
// fails if ids or statuses drift from the markdown. Status here never upgrades the markdown.
export type LedgerStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED-USER-MUST-VERIFY' | 'CONFLICT';

export interface LedgerRow {
  readonly id: string;
  readonly item: string;
  /** Edition is not yet recorded in the ledger for any row. */
  readonly edition: string;
  readonly status: LedgerStatus;
}

const E = 'edition not yet confirmed';

export const LEDGER: readonly LedgerRow[] = [
  { id: 'S-001', item: 'IPC-2221 trace current formula', edition: E, status: 'UNVERIFIED' },
  { id: 'S-002', item: 'IPC-2152 nature (chart/data based vs closed form)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-003', item: 'Copper foil weight to thickness', edition: E, status: 'UNVERIFIED' },
  { id: 'S-004', item: 'Copper resistivity and temperature coefficient', edition: E, status: 'UNVERIFIED' },
  { id: 'S-005', item: 'AWG diameter', edition: E, status: 'UNVERIFIED' },
  { id: 'S-006', item: 'Exact unit conversions', edition: E, status: 'UNVERIFIED' },
  { id: 'S-010', item: 'IPC-2221 validity ranges', edition: E, status: 'UNVERIFIED' },
  { id: 'S-011', item: 'IPC-2152 third-party fits', edition: E, status: 'UNVERIFIED' },
  { id: 'S-012', item: 'Plated copper resistivity', edition: E, status: 'UNVERIFIED' },
  { id: 'S-013', item: 'Skin depth', edition: E, status: 'UNVERIFIED' },
  { id: 'S-016', item: 'E-series preferred values (IEC 60063)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-020…S-028', item: 'Impedance models and presets', edition: E, status: 'UNVERIFIED' },
  { id: 'S-030…S-034', item: 'IEC 60664 / IPC spacing', edition: E, status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-040…S-044', item: 'Thermal, fusing and RF references', edition: E, status: 'UNVERIFIED' },
  { id: 'S-050', item: 'twc IPC-2152 methods (cross-check tool)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-051', item: 'Cross-check tool licenses', edition: E, status: 'UNVERIFIED' },
];
