import { WEIGHT_DATA_STATUS, type DataStatus } from './confidence';
import { LEDGER, type LedgerRow, type LedgerStatus } from './data/ledger';

/** Typed failure for data-status lookups; never swallowed into a default status. */
export class DataStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataStatusError';
  }
}

/** Ledger status name to confidence-rule status name. Exhaustive: adding a LedgerStatus breaks the build here. */
export function dataStatusFromLedger(status: LedgerStatus): DataStatus {
  switch (status) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'UNVERIFIED':
      return 'UNVERIFIED';
    case 'PAYWALLED-USER-MUST-VERIFY':
      return 'PAYWALLED';
    case 'CONFLICT':
      return 'CONFLICT';
    default: {
      const unreachable: never = status;
      throw new DataStatusError(`Unknown ledger status: ${String(unreachable)}`);
    }
  }
}

/** Tie-break rank for equal confidence weights: higher is more severe. */
const SEVERITY_RANK: Readonly<Record<DataStatus, number>> = {
  VERIFIED: 0,
  UNVERIFIED: 1,
  PAYWALLED: 2,
  CONFLICT: 3,
};

/** Status with the highest confidence weight; ties resolved CONFLICT > PAYWALLED > UNVERIFIED > VERIFIED. */
export function worstDataStatus(statuses: readonly LedgerStatus[]): DataStatus {
  if (statuses.length === 0) {
    throw new DataStatusError('worstDataStatus requires at least one status; an empty list is not VERIFIED.');
  }
  let worst = dataStatusFromLedger(statuses[0] as LedgerStatus);
  for (const s of statuses) {
    const d = dataStatusFromLedger(s);
    const heavier = WEIGHT_DATA_STATUS[d] > WEIGHT_DATA_STATUS[worst];
    const tied = WEIGHT_DATA_STATUS[d] === WEIGHT_DATA_STATUS[worst];
    if (heavier || (tied && SEVERITY_RANK[d] > SEVERITY_RANK[worst])) worst = d;
  }
  return worst;
}

/** Worst data status over the given ledger ids. Unknown or empty id lists throw. */
export function dataStatusForLedgerIds(ids: readonly string[], ledger: readonly LedgerRow[] = LEDGER): DataStatus {
  if (ids.length === 0) {
    throw new DataStatusError('dataStatusForLedgerIds requires at least one ledger id.');
  }
  const statuses = ids.map((id) => {
    const row = ledger.find((r) => r.id === id);
    if (row === undefined) throw new DataStatusError(`Unknown ledger id: ${id}`);
    return row.status;
  });
  return worstDataStatus(statuses);
}
