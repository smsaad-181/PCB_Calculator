/*
 * The ONLY module permitted to emit standard-conformance wording.
 * Wording is produced only when all mandatory inputs are provided and every
 * cited ledger row exists and has status VERIFIED. The caller is never trusted
 * about data status; it is looked up in the ledger.
 */
import { LEDGER, type LedgerRow } from './data/ledger';

export type GateStandard = 'IPC-2221' | 'IPC-2152' | 'IEC 60664-1' | 'IPC-6012';

export interface GateRequest {
  readonly standard: GateStandard;
  readonly mandatoryInputs: Readonly<Record<string, boolean>>;
  readonly dataLedgerIds: readonly string[];
}

export interface GateResult {
  readonly allowed: boolean;
  readonly label: string;
  readonly missing: string[];
  readonly reasons: string[];
}

const DENIED_PREFIX = 'Not assessed for compliance — ';

export function complianceGateWith(ledger: readonly LedgerRow[], req: GateRequest): GateResult {
  const keys = Object.keys(req.mandatoryInputs);
  const missing = keys.filter((k) => !req.mandatoryInputs[k]);
  const reasons: string[] = [];
  if (keys.length === 0) {
    reasons.push('mandatory inputs list is empty (no mandatory inputs declared)');
  }
  if (missing.length > 0) {
    reasons.push(`mandatory inputs not provided: ${missing.join(', ')}`);
  }
  if (req.dataLedgerIds.length === 0) {
    reasons.push('no source ledger ids cited for the data');
  }
  const unknown: string[] = [];
  const unverified: string[] = [];
  for (const id of req.dataLedgerIds) {
    const found = ledger.find((r) => r.id === id);
    if (found === undefined) unknown.push(id);
    else if (found.status !== 'VERIFIED') unverified.push(`${id} (${found.status})`);
  }
  if (unknown.length > 0) {
    reasons.push(`unknown ledger ids (not found in ledger): ${unknown.join(', ')}`);
  }
  if (unverified.length > 0) {
    reasons.push(`ledger data not VERIFIED: ${unverified.join(', ')}`);
  }
  if (reasons.length > 0) {
    return { allowed: false, label: DENIED_PREFIX + reasons.join('; '), missing, reasons };
  }
  return {
    allowed: true,
    label: `${req.standard} compliant (per verified data: ${req.dataLedgerIds.join(', ')})`,
    missing: [],
    reasons: [],
  };
}

export function complianceGate(req: GateRequest): GateResult {
  return complianceGateWith(LEDGER, req);
}
