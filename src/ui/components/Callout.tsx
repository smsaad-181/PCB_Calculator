export interface CalloutView {
  readonly heading: string;
  readonly text: string;
}

/** A prominent bordered notice. The word "Important" carries the meaning, not the colour. */
export function Callout({ heading, text }: CalloutView) {
  return (
    <div class="callout" role="group" aria-label="Important notice">
      <p class="callout-head">
        <span aria-hidden="true">{'⚠ '}</span>
        <strong>Important: {heading}</strong>
      </p>
      <p>{text}</p>
    </div>
  );
}
