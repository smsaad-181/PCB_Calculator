import { AssumptionsList } from './AssumptionsList';
import { ConfidenceBadge } from './ConfidenceBadge';
import { FormulaPanel } from './FormulaPanel';
import { InputsProvenance } from './InputsProvenance';
import { StepsList } from './StepsList';
import { UnverifiedBadge } from './UnverifiedBadge';
import { WarningList } from './WarningList';
import type { ResultView } from './view';

interface Props {
  readonly view: ResultView;
}

/** Quick answer first (headline, status, confidence with reasons, warnings); details are in an expandable section. */
export function ResultsPanel({ view }: Props) {
  const v = view;
  return (
    <div class="results">
      <p class="answer-label">{v.headline.label}</p>
      <p class="answer">{v.headline.text}</p>
      <p class="muted">{v.headline.meaning}</p>
      {v.ledger.unverifiedIds.length > 0 && (
        <p class="unverified-line">
          <span class="pill-unverified">UNVERIFIED</span> <UnverifiedBadge status={v.ledger.worst} ledgerIds={v.ledger.unverifiedIds} />
        </p>
      )}
      {v.rows.length > 0 && (
        <dl class="rows">
          {v.rows.map((r) => (
            <div key={r.label} class="row">
              <dt>{r.label}</dt>
              <dd>{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      <ConfidenceBadge confidence={v.confidence} />
      <WarningList warnings={v.warnings} />
      <p class="recommendation">
        <strong>Recommendation:</strong> {v.recommendation}
      </p>
      <details class="more">
        <summary>Details: formula, steps, assumptions, validity, sources</summary>
        <FormulaPanel details={v.details} ledger={v.ledger} />
        <StepsList steps={v.details.steps} />
        <AssumptionsList assumptions={v.details.assumptions} />
        <section aria-labelledby="validity-h">
          <h3 id="validity-h">Validity checks</h3>
          <ul>
            {v.details.validity.map((c) => (
              <li key={c.name}>
                <span aria-hidden="true">{c.ok ? '✔ ' : '✖ '}</span>
                <strong>{c.ok ? 'Within range' : 'Outside range'}:</strong> {c.name}. <span class="muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
        <InputsProvenance inputs={v.details.inputs} />
      </details>
    </div>
  );
}
