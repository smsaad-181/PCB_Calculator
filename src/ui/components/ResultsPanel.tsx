import type { ComponentChildren } from 'preact';
import { AssumptionsList } from './AssumptionsList';
import { Callout, type CalloutView } from './Callout';
import { ConfidenceBadge } from './ConfidenceBadge';
import { DesignValuesPanel } from './DesignValuesPanel';
import { FormulaPanel } from './FormulaPanel';
import { InputsProvenance } from './InputsProvenance';
import { StepsList } from './StepsList';
import { UnverifiedBadges } from './UnverifiedBadge';
import { ValidityChecksList } from './ValidityChecksList';
import { WarningList } from './WarningList';
import type { ResultView } from './view';

interface Props {
  readonly view: ResultView;
  /** What a failed validity check means for this calculator (shown under each failed check). */
  readonly failedCheckHint?: string;
  /** Per-check replacement for `failedCheckHint`, matched by the validity check's name. */
  readonly failedHintFor?: (name: string) => string | undefined;
  /** A prominent notice shown directly under the headline (for example a method limit that makes the headline optimistic). */
  readonly callout?: CalloutView;
  /** More prominent notices, shown after `callout` (each one is an Important block). */
  readonly callouts?: readonly CalloutView[];
  /** Shown directly under the headline, before every callout (for example a time warning that changes how the headline reads). */
  readonly underHeadline?: ComponentChildren;
  /** Shown first, above the headline (for example the user's own end-temperature result, which answers their question before the melting result). */
  readonly aboveHeadline?: ComponentChildren;
  /** Extra content directly under the headline and its callout (for example a min/typ/max row). */
  readonly afterHeadline?: ComponentChildren;
}

const DEFAULT_FAILED_HINT = 'This input or result is outside the stated range, so the result is less reliable. See the confidence reasons.';

/** Quick answer first (headline, status, confidence with reasons, warnings); details are in an expandable section. */
export function ResultsPanel({ view, failedCheckHint, failedHintFor, callout, callouts, afterHeadline, underHeadline, aboveHeadline }: Props) {
  const v = view;
  return (
    <div class="results">
      {aboveHeadline}
      <p class="answer-label">{v.headline.label}</p>
      <p class="answer">{v.headline.text}</p>
      <p class="muted">{v.headline.meaning}</p>
      {v.headline.note !== undefined && <p class="muted"><strong>Note:</strong> {v.headline.note}</p>}
      {underHeadline}
      {callout !== undefined && <Callout heading={callout.heading} text={callout.text} />}
      {(callouts ?? []).map((c) => (
        <Callout key={c.heading} heading={c.heading} text={c.text} />
      ))}
      {afterHeadline}
      {v.ledger.unverifiedIds.length > 0 && (
        <p class="unverified-line">
          <span class="pill-unverified">UNVERIFIED</span> <UnverifiedBadges groups={v.ledger.groups} />
        </p>
      )}
      <DesignValuesPanel values={v.designValues} />
      <ValidityChecksList checks={v.details.validity} failedHint={failedCheckHint ?? DEFAULT_FAILED_HINT} {...(failedHintFor !== undefined ? { hintFor: failedHintFor } : {})} />
      <WarningList warnings={v.warnings} />
      <ConfidenceBadge confidence={v.confidence} />
      {v.rows.length > 0 && (
        <dl class="rows">
          {v.rows.map((r) => (
            <div key={r.label} class="row">
              <dt>{r.label}</dt>
              <dd>{r.text}</dd>
              {r.hint !== undefined && (
                <dd class="row-note">
                  <strong>Note:</strong> {r.hint}
                </dd>
              )}
              {r.note !== undefined && (
                <dd class="row-note">
                  <strong>{r.note.label}.</strong> {r.note.message}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      <p class="recommendation">
        <strong>Recommendation:</strong> {v.recommendation}
      </p>
      <details class="more">
        <summary>Details: formula, steps, assumptions, sources, inputs</summary>
        <FormulaPanel details={v.details} ledger={v.ledger} />
        <StepsList steps={v.details.steps} />
        <AssumptionsList assumptions={v.details.assumptions} />
        <InputsProvenance inputs={v.details.inputs} />
      </details>
    </div>
  );
}
