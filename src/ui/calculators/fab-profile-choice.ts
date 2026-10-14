// The fab profile the user can choose on a page. Nothing is pre-selected: '' means not chosen yet.
// Pure: no DOM, no engineering math. The bundled data is the JLCPCB example profile (UNVERIFIED, ledger S-019i..S-019m).
import profileJson from '../../core/data/fab-profiles/jlcpcb-2026-10-13.json';
import { parseFabProfile, type ParsedFabProfile } from '../../core/fab/profile';

/** '' not chosen, 'none' the user supplies every value, 'bundled' the bundled example profile. */
export type ProfileChoice = '' | 'none' | 'bundled';

export const BUNDLED_LABEL = 'JLCPCB example profile (UNVERIFIED)';
export const NONE_LABEL = 'none / my own values';
export const NONE_HASH = 'none';

let cached: ParsedFabProfile | null | undefined;
/** The bundled profile, or null when its data does not parse (the page then says so and gives no profile values). */
export function bundledProfile(): ParsedFabProfile | null {
  if (cached === undefined) {
    const r = parseFabProfile(profileJson);
    cached = r.ok ? r.value : null;
  }
  return cached;
}

/** Hash value (reserved key fp) for a choice; undefined when nothing is chosen. */
export function choiceToHash(c: ProfileChoice): string | undefined {
  if (c === 'none') return NONE_HASH;
  if (c === 'bundled') return bundledProfile()?.id;
  return undefined;
}

/** Choice for a hash value, or undefined when it names no profile this build knows. */
export function choiceFromHash(v: string): ProfileChoice | undefined {
  if (v === NONE_HASH) return 'none';
  const p = bundledProfile();
  if (p !== null && v === p.id) return 'bundled';
  return undefined;
}

export function isProfileChoice(v: string): v is Exclude<ProfileChoice, ''> {
  return v === 'none' || v === 'bundled';
}
