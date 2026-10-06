import type { LedgerStatus } from '../../core/data/ledger';

interface Props {
  readonly status: LedgerStatus;
  readonly ledgerIds: readonly string[];
}

export function badgeText(status: LedgerStatus, ledgerIds: readonly string[]): string | null {
  if (status === 'VERIFIED') return null;
  const refs = ledgerIds.length > 0 ? ledgerIds.join(', ') : 'source ledger';
  switch (status) {
    case 'UNVERIFIED':
      return `UNVERIFIED data — see source ledger ${refs}`;
    case 'PAYWALLED-USER-MUST-VERIFY':
      return `UNVERIFIED (paywalled, you must verify) — see source ledger ${refs}`;
    case 'CONFLICT':
      return `UNVERIFIED (sources conflict) — see source ledger ${refs}`;
  }
}

export function UnverifiedBadge({ status, ledgerIds }: Props) {
  const text = badgeText(status, ledgerIds);
  if (text === null) return null;
  return (
    <span class="badge-unverified" role="note">
      <span aria-hidden="true">{'⚠ '}</span>
      {text}
    </span>
  );
}
