import type { BannerView } from '../calculators/spacing-common.vm';

/**
 * Always visible, in every state of every spacing page: the product-standard sentence and the solder-mask note (both the core's own text),
 * and a red UNVERIFIED banner when any table the page can use is entered but not verified. Text carries the meaning, colour only adds to it.
 */
export function SpacingBanners({ banners }: { readonly banners: BannerView }) {
  return (
    <div class="spacing-banners">
      {banners.unverified !== undefined && (
        <div class="unverified-banner" role="alert">
          <p>
            <span class="pill-unverified-red">UNVERIFIED</span> <strong>{banners.unverified.prefix}</strong>
          </p>
          <p>{banners.unverified.text}</p>
          <p>Tables entered but not verified: {banners.unverified.tables.join(', ')}.</p>
        </div>
      )}
      <div class="callout" role="note" aria-label="Product standards">
        <p class="callout-head">
          <span aria-hidden="true">{'⚠ '}</span>
          <strong>Product standards</strong>
        </p>
        <p>{banners.product}</p>
      </div>
      <p class="soldermask-note" role="note">
        <strong>Solder mask:</strong> {banners.soldermask}
      </p>
    </div>
  );
}
