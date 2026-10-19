import { LedgerRowBadges } from './LedgerRowBadges';
import { ResultsPanel } from './ResultsPanel';
import { ResultStatus } from './ResultStatus';
import { IMPORT_ANCHOR_ID, IMPORT_LINK_TEXT, type FailureView, type OkParts } from '../calculators/spacing-common.vm';

type View = FailureView | ({ readonly status: 'ok' } & OkParts);

/** Moves keyboard focus to the table import box (the page routes by hash, so a plain #anchor link would leave the page). */
export function goToImport(): void {
  const el = document.getElementById(IMPORT_ANCHOR_ID);
  if (el === null) return;
  el.scrollIntoView({ block: 'center' });
  el.focus();
}

/** One component for every outcome: needs-input, INSUFFICIENT DATA, OUT OF TABLE RANGE, error, result. Never a number except in `ok`. */
export function SpacingResults({ view, onGoToImport }: { readonly view: View; readonly onGoToImport?: () => void }) {
  switch (view.status) {
    case 'ok':
      return (
        <ResultsPanel
          view={view.result}
          failedCheckHint="This check did not hold, so the result is less reliable. See the confidence reasons."
          afterHeadline={<LedgerRowBadges heading="Data behind this result (one status per ledger row)" rows={view.ledgerRows} />}
        />
      );
    case 'needs-input':
      return (
        <div class="needs">
          <p>
            <strong>{view.summary}</strong>
          </p>
          <p class="muted">No number is shown until every mandatory input is given. None of them has a default.</p>
          <ul>
            {view.needs.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      );
    case 'insufficient-data':
      return (
        <div class="gate-box insufficient-data" role="group" aria-label="Insufficient data">
          <p class="gate-heading">
            <span aria-hidden="true">{'⛔ '}</span>
            <strong>{view.heading}</strong>
          </p>
          <p>{view.lead}</p>
          {view.tables.length > 0 && (
            <p>
              <strong>Table{view.tables.length === 1 ? '' : 's'} needed:</strong> {view.tables.join(', ')}
            </p>
          )}
          <ul>
            {view.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <button type="button" class="secondary" onClick={onGoToImport ?? goToImport}>
            {IMPORT_LINK_TEXT}
          </button>
        </div>
      );
    case 'out-of-range':
      return (
        <div class="gate-box out-of-range" role="group" aria-label="Out of table range">
          <p class="gate-heading">
            <span aria-hidden="true">{'⛔ '}</span>
            <strong>{view.heading}</strong>
          </p>
          <p>{view.lead}</p>
          <p>{view.message}</p>
        </div>
      );
    default:
      return <ResultStatus status="error" items={view.problems} />;
  }
}
