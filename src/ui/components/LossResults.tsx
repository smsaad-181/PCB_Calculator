import type { LossView } from '../calculators/loss-view';
import { Callout } from './Callout';
import { LedgerRowBadges } from './LedgerRowBadges';

interface Props {
  readonly loss: LossView | undefined;
  /** What is missing for the estimate (shown when there is no estimate yet). */
  readonly needs: readonly string[];
}

/**
 * The loss estimate: the approximation label sits right above the numbers and is repeated in every row's note, the notices that must
 * not be missed are Important blocks, and each ledger row has its own status written as text. Every string comes from the view-model.
 */
export function LossResults({ loss, needs }: Props) {
  if (loss === undefined) {
    if (needs.length === 0) return null;
    return (
      <section class="loss-results" aria-labelledby="loss-h">
        <h3 id="loss-h">Loss estimate: not shown yet</h3>
        <ul class="needs-list">
          {needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section class="loss-results" aria-labelledby="loss-h">
      <h3 id="loss-h">{loss.heading}</h3>
      <p class="loss-caption">
        <span aria-hidden="true">{'▲ '}</span>
        <strong>{loss.caption}</strong>
      </p>
      {loss.notices.map((n) => (
        <Callout key={n.code} heading={n.heading} text={n.message} />
      ))}
      {loss.rows.length > 0 && (
        <dl class="rows">
          {loss.rows.map((r) => (
            <div key={r.label} class="row">
              <dt>{r.label}</dt>
              <dd>{r.text}</dd>
              {r.hint !== undefined && (
                <dd class="row-note">
                  <strong>Note:</strong> {r.hint}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {loss.notes.length > 0 && (
        <ul class="warnings" aria-label="Loss estimate notes">
          {loss.notes.map((w) => (
            <li key={w.message} class={`warning sev-${w.severity}`}>
              <span class="warning-icon" aria-hidden="true">
                {w.icon}
              </span>
              <span>
                <strong>{w.label}.</strong> {w.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {needs.length > 0 && (
        <ul class="needs-list">
          {needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <LedgerRowBadges heading="Data behind the loss estimate (one status per ledger row)" rows={loss.ledgerRows} />
    </section>
  );
}
