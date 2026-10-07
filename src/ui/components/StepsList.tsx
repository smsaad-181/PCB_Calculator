import type { ResultView } from './view';

export function StepsList({ steps }: { readonly steps: ResultView['details']['steps'] }) {
  if (steps.length === 0) return null;
  return (
    <section aria-labelledby="steps-h">
      <h3 id="steps-h">Steps</h3>
      <ol class="steps">
        {steps.map((s) => (
          <li key={`${s.label}:${s.expr}`}>
            <strong>{s.label}.</strong> <code>{s.expr}</code> = <strong>{s.text}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}
