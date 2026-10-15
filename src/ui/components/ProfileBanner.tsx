import type { ProfileBanner as ProfileBannerData } from '../calculators/fab-profile-banner';

/** Sticky notice for a chosen fab profile: id, date, age, stale and UNVERIFIED state as text (not colour alone). */
export function ProfileBanner({ b }: { readonly b: ProfileBannerData }) {
  return (
    <div class="banner profile-banner" role="status" aria-label="Fab profile in use">
      <div class="banner-body">
        <p>
          <span class="pill-unverified">{b.unverified ? 'UNVERIFIED' : b.status}</span> <strong>{b.title}</strong>
        </p>
        <p>
          Profile <strong>{b.id}</strong> ({b.fabricator}), dated <strong>{b.profileDate}</strong>, <strong>{b.ageText}</strong>.
        </p>
        <p>{b.unverifiedText}</p>
        {b.stale && (
          <p class="profile-stale">
            <span aria-hidden="true">{'⚠ '}</span>
            <strong>{b.staleText}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
