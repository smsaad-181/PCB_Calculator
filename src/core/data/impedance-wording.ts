import { LEDGER } from './ledger';

/**
 * Wording shared by the Phase 2 impedance cores, the stackup derivation and the data panel. One constant per statement so the
 * same sentence reaches every page (Phase 2 closure, PCB2-2 and PCB2-8). No magnitude is quoted anywhere here: none is sourced.
 */

/** The soldermask / coating statement used by every outer-layer model's core warning and by the stackup derivation note. */
export const SOLDERMASK_WORDING =
  'Soldermask/coating not modelled: it typically lowers Z0 of an outer-layer line; the size depends on mask thickness and Dk (not sourced here)';

/** Cites S-013 for what the impedance calculators take from it, the mu0 value (the row itself is the skin-depth relation). */
export const MU0_LEDGER_DISPLAY = 'S-013 (mu0 value)';

/**
 * Status-correct role text for ledger rows that are PAYWALLED and whose primary source is a journal paper, not a standard.
 * Keyed by ledger id; a row that is not PAYWALLED-USER-MUST-VERIFY has no entry (a test enforces this).
 */
const PAPER_BY_ID: Readonly<Record<string, string>> = {
  'S-022': 'Hammerstad and Jensen 1980',
  'S-022a': 'Cohn 1955',
  'S-023a': 'Ghione and Naldi 1983',
};

export function paywalledPaperIds(): readonly string[] {
  return Object.keys(PAPER_BY_ID);
}

/** 'Primary source is a paywalled paper (...); not read by this project: check it yourself', or undefined for any other row. */
export function paywalledPaperRole(ledgerId: string): string | undefined {
  const paper = PAPER_BY_ID[ledgerId];
  if (paper === undefined) return undefined;
  const row = LEDGER.find((r) => r.id === ledgerId);
  if (row?.status !== 'PAYWALLED-USER-MUST-VERIFY') return undefined;
  return `Primary source is a paywalled paper (${paper}); not read by this project: check it yourself`;
}
