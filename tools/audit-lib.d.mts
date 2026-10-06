export interface PhraseHit {
  file: string;
  line: number;
  phrase: string;
}
export interface Ledger {
  ids: Set<string>;
  ranges: [number, number][];
  rows: number;
  errors: string[];
}
export function detectForbidden(text: string): string[];
export const ALLOWED_PHRASE_FILES: string[];
export const SCAN_ROOTS: string[];
export const EXCLUDED_DIRS: Set<string>;
export const ALLOWED_STATUS: string[];
export const LEDGER_STATUS: string[];
export const DATA_DIRS: string[];
export function scanForbiddenPhrases(root: string, opts?: { roots?: string[]; allowed?: string[] }): PhraseHit[];
export function validateTable(obj: unknown, relPath: string): string[];
export function auditDataTables(root: string, dirs?: string[]): { count: number; errors: string[] };
export function parseLedger(text: string): Ledger;
export function ledgerCovers(ledger: Ledger, id: string): boolean;
export function auditLedgerRefs(root: string, ledger: Ledger, srcDir?: string): string[];
export function runAudit(
  root: string,
  opts?: { ledgerText?: string },
): { errors: string[]; tables: number; ledgerRows: number };
export function fixtureRoot(testFileUrl: string, name: string): string;
