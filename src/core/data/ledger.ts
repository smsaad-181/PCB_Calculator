// Source ledger mirror. Transcribed from docs/sources/LEDGER.md; tests/ledger-sync.test.ts
// fails if ids or statuses drift from the markdown. Status here never upgrades the markdown.
export type LedgerStatus = 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED-USER-MUST-VERIFY' | 'CONFLICT';

export interface LedgerRow {
  readonly id: string;
  readonly item: string;
  /** Edition or source date as recorded in the ledger; "not confirmed" where no source was read. */
  readonly edition: string;
  readonly status: LedgerStatus;
}

const E = 'edition not yet confirmed';

const LEDGER_ROWS: readonly LedgerRow[] = [
  { id: 'S-001', item: 'IPC-2221 trace current formula (legacy)', edition: 'IPC-2221B (2012) / IPC-2221C (2023-12), not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-002', item: 'IPC-2152 nature (charts vs closed form)', edition: 'IPC-2152 (2009), not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-003', item: 'Copper foil weight to thickness', edition: 'IPC-4562A (secondhand); fab sources', status: 'CONFLICT' },
  { id: 'S-003d', item: 'Copper density, IACS reference value', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)', status: 'VERIFIED' },
  { id: 'S-003e', item: 'Copper density, pure copper', edition: 'RSC; LANL periodic tables', status: 'CONFLICT' },
  { id: 'S-004', item: 'Copper resistivity and temperature coefficient (IACS)', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966)', status: 'VERIFIED' },
  { id: 'S-005', item: 'AWG diameter', edition: 'NBS Circular 31 (1914); NBS Handbook 100 (1966); ASTM B258-18 not read', status: 'VERIFIED' },
  { id: 'S-006', item: 'Exact unit conversions', edition: 'NIST SP 811 (2008) App. B.8', status: 'VERIFIED' },
  { id: 'S-007', item: 'Copper thermal conductivity k_Cu: pure Cu 401 W/m·K (default, 300 K); C11000 391–394 W/m·K; the earlier oracle value 385 had no source and was replaced', edition: 'Ho, Powell & Liley 1972; Aurubis C11000 datasheet', status: 'CONFLICT' },
  { id: 'S-008', item: 'Fabricator capability data (JLCPCB published, example fab profile)', edition: 'jlcpcb.com capabilities, retrieved 2026-10-06', status: 'UNVERIFIED' },
  { id: 'S-009', item: 'Finished copper thickness vs nominal (IPC-6012 minimums, secondhand)', edition: 'NCAB FAQ, retrieved 2026-10-06; IPC-6012 not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-010', item: 'IPC-2221 chart validity range', edition: 'IPC-2221B/C Figure 6-4, not read', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-011a', item: 'IPC-2152 fit: Brooks & Adam, external traces', edition: 'PCD&F 2015-05-29', status: 'UNVERIFIED' },
  { id: 'S-011b', item: 'IPC-2152 fit: Brooks & Adam, internal traces', edition: 'PCD&F 2015 Appendix 1, not read', status: 'UNVERIFIED' },
  { id: 'S-011c', item: 'IPC-2152 fit: SMPS.us (Jack Olson coefficients)', edition: 'smps.us, retrieved 2026-10-06', status: 'CONFLICT' },
  { id: 'S-011d', item: 'IPC-2152 fit: NinjaCalc', edition: E, status: 'UNVERIFIED' },
  { id: 'S-011e', item: 'IPC-2152 fit: Sierra Circuits (undisclosed)', edition: E, status: 'UNVERIFIED' },
  { id: 'S-012', item: 'Plated copper resistivity', edition: E, status: 'UNVERIFIED' },
  { id: 'S-013', item: 'Skin depth', edition: E, status: 'VERIFIED' },
  { id: 'S-016', item: 'E-series preferred values (IEC 60063)', edition: E, status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-020…S-028', item: 'Impedance models and presets', edition: E, status: 'UNVERIFIED' },
  { id: 'S-030…S-034', item: 'IEC 60664 / IPC spacing', edition: E, status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-040…S-044', item: 'Thermal, fusing and RF references', edition: E, status: 'UNVERIFIED' },
  { id: 'S-050', item: 'twc IPC-2152 methods (cross-check tool; describes the tool only)', edition: 'ymic9963/twc commit 308002f (main, 2026-10-06)', status: 'VERIFIED' },
  { id: 'S-051', item: 'Cross-check tool licenses', edition: 'each repository license file, 2026-10-06', status: 'VERIFIED' },
  { id: 'S-014', item: 'Onderdonk fusing equation (Phase 4, info only)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'UNVERIFIED' },
  { id: 'S-015', item: 'Via barrel (hole-wall) copper plating thickness: fabricator data and secondhand IPC-6012 minimums', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'PAYWALLED-USER-MUST-VERIFY' },
  { id: 'S-017', item: 'KiCad PCB Calculator behaviour (cross-check pointer)', edition: 'see docs/sources/LEDGER.md (researched 2026-10-07)', status: 'UNVERIFIED' },
];

/** Frozen so no code path can mark a row VERIFIED at runtime (the compliance gate trusts these statuses). */
export const LEDGER: readonly LedgerRow[] = Object.freeze(LEDGER_ROWS.map((r) => Object.freeze({ ...r })));
