import type { LedgerStatus } from '../../core/data/ledger';

interface Props {
  readonly status: LedgerStatus;
  readonly ledgerIds: readonly string[];
}

export function badgeText(status: LedgerStatus, ledgerIds: readonly string[]): string | null {
  if (status === 'VERIFIED') return null;
  const where = ledgerIds.length > 0 ? `source ledger ${ledgerIds.join(', ')}` : 'the source ledger';
  switch (status) {
    case 'UNVERIFIED':
      return `Not independently verified — see ${where}`;
    case 'PAYWALLED-USER-MUST-VERIFY':
      return `Not checked against the standard (paywalled): compare with your licensed copy — see ${where}`;
    case 'CONFLICT':
      return `Sources disagree — see ${where}`;
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

/** One badge per status group, so paywalled sources and conflicting sources are described separately. */
export function UnverifiedBadges({ groups }: { readonly groups: readonly { readonly status: LedgerStatus; readonly ids: readonly string[] }[] }) {
  return (
    <>
      {groups.map((g) => (
        <span key={g.status}>
          <UnverifiedBadge status={g.status} ledgerIds={g.ids} />{' '}
        </span>
      ))}
    </>
  );
}
