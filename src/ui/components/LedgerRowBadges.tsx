import type { LedgerStatus } from '../../core/data/ledger';
import { UnverifiedBadge } from './UnverifiedBadge';

export interface LedgerRowBadge {
  readonly id: string;
  readonly status: LedgerStatus;
  readonly role: string;
}

/**
 * One line per ledger row with its own status, so a conflicting row cannot hide a paywalled one (and a verified row is
 * stated as verified, not left out). Status is written as text; colour is never the only carrier.
 */
export function LedgerRowBadges({ rows, heading }: { readonly rows: readonly LedgerRowBadge[]; readonly heading: string }) {
  if (rows.length === 0) return null;
  return (
    <section class="ledger-rows" aria-label={heading}>
      <h3>{heading}</h3>
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.id}</strong> <span class="status-text">{r.status}</span>
            {r.status === 'VERIFIED' ? null : (
              <>
                {' '}
                <UnverifiedBadge status={r.status} ledgerIds={[r.id]} />
              </>
            )}
            <span class="muted"> {r.role}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
