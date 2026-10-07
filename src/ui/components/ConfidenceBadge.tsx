import type { ResultView } from './view';

const LEVEL_ICON = { high: '●●●', medium: '●●○', low: '●○○' } as const;

/** Level, score and every reason together. The level is never shown alone. */
export function ConfidenceBadge({ confidence }: { readonly confidence: ResultView['confidence'] }) {
  return (
    <div class={`confidence level-${confidence.level}`}>
      <p class="confidence-head">
        <strong>Confidence: {confidence.level}</strong>{' '}
        <span class="muted">
          <span aria-hidden="true">{LEVEL_ICON[confidence.level]} </span>
          (score {String(confidence.score)}; 0 is best)
        </span>
      </p>
      {confidence.reasons.length === 0 ? (
        <p class="muted">No rule lowered the confidence.</p>
      ) : (
        <>
          <p class="muted">Why:</p>
          <ul>
            {confidence.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary>How confidence is rated</summary>
        <p class="muted">{confidence.ruleText}</p>
      </details>
    </div>
  );
}
