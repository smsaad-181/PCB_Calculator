import type { WarningView } from './view';

/** Most severe first. Severity is carried by an icon and a text label as well as colour. */
export function WarningList({ warnings }: { readonly warnings: readonly WarningView[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul class="warnings" aria-label="Warnings">
      {warnings.map((w) => (
        <li key={`${w.severity}:${w.message}`} class={`warning sev-${w.severity}`}>
          <span class="warning-icon" aria-hidden="true">
            {w.icon}
          </span>
          <span>
            <strong>{w.label}.</strong> {w.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
