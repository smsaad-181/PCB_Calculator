import { VIA_RATING_POINTER_LABEL, VIA_RATING_POINTER_TEXT } from './via-rating-pointer';

/** A labelled pointer to external via-rating sources. Text only: nothing here feeds a calculation. */
export function ViaRatingPointer() {
  return (
    <aside class="rating-pointer" aria-label="Where to find a via current rating">
      <p>
        <strong>{VIA_RATING_POINTER_LABEL}.</strong> {VIA_RATING_POINTER_TEXT}
      </p>
    </aside>
  );
}
