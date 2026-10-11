import type { DesignValueView } from './view';

/**
 * Calculated limit next to the recommended design value. Two different numbers, always both shown, so the
 * calculated limit is never mistaken for the number to design to. Generic: the text comes from the view-model.
 */
export function DesignValuesPanel({ values }: { readonly values: readonly DesignValueView[] }) {
  if (values.length === 0) return null;
  return (
    <section class="design-values" aria-label="Calculated limit and recommended design value">
      <h3>Calculated limit vs recommended design value</h3>
      {values.map((dv) => (
        <div key={dv.name} class="dv">
          <p class="dv-name">
            <strong>{dv.name}</strong>
            <span class="muted">{dv.direction === 'min-requirement' ? ' (minimum required)' : ' (maximum allowed)'}</span>
          </p>
          <div class="dv-cols">
            <div class="dv-col">
              <p class="dv-label">{dv.calculatedLabel}</p>
              <p class="dv-value">{dv.calculated}</p>
            </div>
            <div class="dv-col dv-recommended">
              <p class="dv-label">{dv.recommendedLabel}</p>
              <p class="dv-value">{dv.recommended}</p>
            </div>
          </div>
          <p class="muted dv-why">{dv.rationale}</p>
        </div>
      ))}
    </section>
  );
}
