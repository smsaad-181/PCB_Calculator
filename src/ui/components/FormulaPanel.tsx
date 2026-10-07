import { UnverifiedBadge } from './UnverifiedBadge';
import type { ResultView } from './view';

/** Formula text comes from the calculator's exported metadata via the result, so it cannot drift from the code. */
export function FormulaPanel({ details, ledger }: { readonly details: ResultView['details']; readonly ledger: ResultView['ledger'] }) {
  return (
    <section aria-labelledby="formula-h">
      <h3 id="formula-h">Formula and sources</h3>
      <p>
        <strong>Method:</strong> {details.method}
      </p>
      <p>
        <strong>Formula:</strong>
      </p>
      <pre class="formula">{details.formula}</pre>
      <p>
        <strong>Reference:</strong> {details.reference}
      </p>
      <ul class="ledger-list">
        {ledger.entries.map((e) => (
          <li key={e.id}>
            <strong>{e.id}</strong>: {e.item}. <span class="muted">{e.edition}.</span> Status: <strong>{e.status}</strong>{' '}
            <UnverifiedBadge status={e.status} ledgerIds={[e.id]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
