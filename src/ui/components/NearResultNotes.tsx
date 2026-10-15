import type { WarningView } from './view';

export interface NearNote extends WarningView {
  /** The core warning code this note came from. */
  readonly code: string;
}

export interface NearResultView {
  readonly notes: readonly NearNote[];
  /** True when a fab profile note is present and its profile is not VERIFIED: the tag is shown next to the notes. */
  readonly unverified: boolean;
}

/**
 * Notes that belong right next to the result (the fab profile minimum trace width note, the inner-layer finished copper caution).
 * Each is a labelled note or caution with its own words; none is styled or worded as a pass.
 */
export function NearResultNotes({ view }: { readonly view: NearResultView | undefined }) {
  if (view === undefined || view.notes.length === 0) return null;
  return (
    <section class="near-result" aria-label="Notes about this result">
      {view.unverified && (
        <p class="unverified-line">
          <span class="pill-unverified">UNVERIFIED</span> fab profile data below is example data
        </p>
      )}
      <ul class="warnings">
        {view.notes.map((n) => (
          <li key={`${n.code}:${n.message}`} class={`warning sev-${n.severity}`}>
            <span class="warning-icon" aria-hidden="true">
              {n.icon}
            </span>
            <span>
              <strong>{n.label}.</strong> {n.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
