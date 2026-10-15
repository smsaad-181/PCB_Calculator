// The banner for a chosen fab profile (id, date, age, stale and UNVERIFIED state). Pure: today is handed in.
// The same wording as the annular ring page; kept separate so a page that only needs the banner does not load that calculator.
import { fabProfileAgeDays, fabProfileStale } from '../../core/fab/profile';
import { BUNDLED_LABEL, bundledProfile, type ProfileChoice } from './fab-profile-choice';

export interface ProfileBanner {
  readonly title: string;
  readonly id: string;
  readonly fabricator: string;
  readonly profileDate: string;
  /** Whole days from the profile date to today, or undefined when today is not a valid date. */
  readonly ageDays: number | undefined;
  readonly ageText: string;
  readonly stale: boolean;
  readonly staleText: string;
  readonly status: string;
  readonly unverified: boolean;
  readonly unverifiedText: string;
  readonly ledgerIds: readonly string[];
}

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? '' : 's'}`;

/** The banner for an active profile. Undefined when no profile is in use (nothing chosen, or "none"). */
export function profileBanner(choice: ProfileChoice, today: string): ProfileBanner | undefined {
  if (choice !== 'bundled') return undefined;
  const p = bundledProfile();
  if (p === null) return undefined;
  let ageDays: number | undefined;
  let stale = false;
  try {
    ageDays = fabProfileAgeDays(p, today);
    stale = fabProfileStale(p, today);
  } catch {
    ageDays = undefined;
  }
  const unverified = p.status !== 'VERIFIED';
  return {
    title: `Fab profile in use: ${BUNDLED_LABEL}`,
    id: p.id,
    fabricator: p.fabricator,
    profileDate: p.profileDate,
    ageDays,
    ageText: ageDays === undefined ? 'age unknown (today is not a valid date)' : ageDays < 0 ? 'dated in the future' : `${plural(ageDays, 'day')} old`,
    stale,
    staleText: 'Stale: this profile is old and the fabricator may have changed these limits. Re-read them on its own page.',
    status: p.status,
    unverified,
    unverifiedText: unverified
      ? `UNVERIFIED: every value from this profile is example data with status ${p.status} (ledger ${p.ledgerIds.join(', ')}). Re-read your fabricator's page and enter your own values.`
      : `Status ${p.status} (ledger ${p.ledgerIds.join(', ')}).`,
    ledgerIds: [...p.ledgerIds],
  };
}
