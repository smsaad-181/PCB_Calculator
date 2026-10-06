/*
 * The ONLY module permitted to emit standard-conformance wording.
 * Wording is produced only when all mandatory inputs are provided and the
 * underlying data is verified and traceable to ledger ids.
 */

export type GateStandard = 'IPC-2221' | 'IPC-2152' | 'IEC 60664-1' | 'IPC-6012';

export interface GateRequest {
  readonly standard: GateStandard;
  readonly mandatoryInputs: Readonly<Record<string, boolean>>;
  readonly dataVerified: boolean;
  readonly dataLedgerIds: readonly string[];
}

export interface GateResult {
  readonly allowed: boolean;
  readonly label: string;
  readonly missing: string[];
  readonly reasons: string[];
}

const DENIED_PREFIX = 'Not assessed for compliance — ';

export function complianceGate(req: GateRequest): GateResult {
  const missing = Object.keys(req.mandatoryInputs).filter((k) => !req.mandatoryInputs[k]);
  const reasons: string[] = [];
  if (missing.length > 0) {
    reasons.push(`mandatory inputs not provided: ${missing.join(', ')}`);
  }
  if (!req.dataVerified) {
    reasons.push('underlying data is not verified');
  }
  if (req.dataLedgerIds.length === 0) {
    reasons.push('no source ledger ids cited for the data');
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
