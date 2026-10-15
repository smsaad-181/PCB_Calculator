import { SENSITIVITY_CAPTION, TOLERANCE_HEADING, hasToleranceContent, type ToleranceView } from '../calculators/tolerance-view';
import { Callout } from './Callout';
import { EnvelopeTable } from './EnvelopeTable';

/**
 * The tolerance corners (one table per output, minimum / typical / maximum) and the sensitivity readout. Shown only when the
 * core returned something to show: with no tolerances there is no table and no block. Every string is built by the view-model.
 */
export function ToleranceResults({ view }: { readonly view: ToleranceView | undefined }) {
  if (view === undefined || !hasToleranceContent(view)) return null;
  const prominent = view.notices.filter((n) => n.heading !== undefined);
  const plain = view.notices.filter((n) => n.heading === undefined);
  return (
    <section class="tolerance-results" aria-labelledby="tol-results-h">
      <h3 id="tol-results-h">{TOLERANCE_HEADING}</h3>
      {prominent.map((n) => (
        <Callout key={`${n.code}-${n.message}`} heading={n.heading as string} text={n.message} />
      ))}
      {view.envelopes.map((e, i) => (
        <EnvelopeTable key={e.name} env={e.row} id={`tol-env-${String(i)}`} />
      ))}
      {plain.map((n) => (
        <p key={`${n.code}-${n.message}`} class="muted">
          <strong>{n.tag}.</strong> {n.message}
        </p>
      ))}
      {view.sensitivities.length > 0 && (
        <div class="table-wrap">
          <table class="sensitivity">
            <caption>{SENSITIVITY_CAPTION}</caption>
            <thead>
              <tr>
                <th scope="col">Sensitivity of output to input</th>
                <th scope="col">Exponent</th>
                <th scope="col">Reading</th>
              </tr>
            </thead>
            <tbody>
              {view.sensitivities.map((s) => (
                <tr key={s.title}>
                  <th scope="row">{s.title}</th>
                  <td>
                    <strong>{s.value}</strong>
                    <br />
                    <span class="muted">{s.kindText}</span>
                  </td>
                  <td>{s.statement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
