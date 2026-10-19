import type { LedgerStatus } from '../../core/data/ledger';
import { paywalledPaperRole } from '../../core/data/impedance-wording';

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
    case 'PAYWALLED-USER-MUST-VERIFY': {
      // a row whose primary source is a paper is not a standard: the core decides which rows those are
      const papers = ledgerIds.filter((id) => paywalledPaperRole(id) !== undefined);
      const others = ledgerIds.filter((id) => !papers.includes(id));
      const paper = `Primary source is a paywalled paper; not read by this project — see source ledger ${papers.join(', ')}`;
      if (papers.length === 0) return `Not checked against the standard (paywalled): compare with your licensed copy — see ${where}`;
      if (others.length === 0) return paper;
      return `${paper}. Not checked against the standard (paywalled): compare with your licensed copy — see source ledger ${others.join(', ')}`;
    }
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
