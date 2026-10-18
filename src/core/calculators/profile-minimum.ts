import { fabProfileAgeDays, fabProfileStale } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import { lookupLimit } from '../fab/scoped-limits';
import type { CalcOutcome, CalcWarning } from '../result';
import { DIM, q, toUnit } from '../units';
import { checkScope } from './impedance-envelope';

/**
 * Optional fab-profile minimum check for a width, spacing or gap the impedance calculators solved for or were given (Phase 2
 * closure, PCB2-4). It uses the same inputs as the tolerance envelope (fabProfile, today, profileScope {layerCount, layerSide,
 * copperWeight?}) and looks up the scoped limit `traceWidth` or `traceSpace` of kind `min` for the EXACT scope: no cross-scope
 * fallback, no hard-coded number (rule 9). The outcome is a note on the result, never a verdict: the wording is only "below" or
 * "meets" the profile minimum, with the profile id, its status tag, the ledger id and the profile age. Without a fabProfile input
 * there is no note (the UI shows its own).
 */

export interface MinimumSpec {
  readonly key: 'traceWidth' | 'traceSpace';
  /** Human label: 'trace width', 'edge spacing', 'gap'. */
  readonly label: string;
  /** Name of the input holding the entered value. */
  readonly input: string;
  /** Result name that holds the value when the input was solved for. */
  readonly solvedResult: string;
}

const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const mm = (si: number): string => String(Number(toUnit(q(si, DIM.LENGTH), 'mm').toPrecision(4)));
const mil = (si: number): string => String(Number(toUnit(q(si, DIM.LENGTH), 'mil').toPrecision(4)));
const both = (si: number): string => `${mm(si)} mm (${mil(si)} mil)`;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** Relative slack so a width solved to the minimum itself is not called "below" for a rounding residue. */
const REL_SLACK = 1e-9;

export function withProfileMinimum(outcome: CalcOutcome, raw: unknown, specs: readonly MinimumSpec[]): CalcOutcome {
  if (!outcome.ok || !isRec(raw)) return outcome;
  const profile = raw['fabProfile'];
  if (!isRec(profile) || typeof profile['id'] !== 'string' || !Array.isArray(profile['scopedLimits'])) return outcome;
  const p = profile as unknown as ParsedFabProfile;
  const notChecked = (why: string): CalcOutcome => ({
    ok: true,
    value: { ...outcome.value, warnings: [...outcome.value.warnings, { severity: 'caution', code: 'PROFILE_MINIMUM_NOT_CHECKED', message: `The fab-profile minimum was not checked: ${why}` }] },
  });
  if (typeof raw['today'] !== 'string') return notChecked('today (YYYY-MM-DD) was not supplied, and no clock is read here.');
  let age: number;
  let stale: boolean;
  try {
    age = fabProfileAgeDays(p, raw['today']);
    stale = fabProfileStale(p, raw['today']);
  } catch (e) {
    return notChecked(e instanceof Error ? e.message : String(e));
  }
  const sc = checkScope(raw);
  if (!sc.ok) return notChecked(sc.error.message);

  const warnings: CalcWarning[] = [];
  const ids: string[] = [];
  const tag = (status: string): string => (status === 'VERIFIED' ? status : `${status} (re-read the fabricator's own page)`);
  const profileText = `profile ${p.id}, ${p.fabricator}, dated ${p.profileDate}, ${String(age)} days old${stale ? ' (more than 365 days: out of date)' : ''}`;
  const scopeText = `exact scope: ${sc.value.text}; no other scope was substituted`;
  for (const spec of specs) {
    const inRaw = raw[spec.input];
    let value: number | undefined;
    let solved = false;
    if (isRec(inRaw) && typeof inRaw['si'] === 'number') value = inRaw['si'];
    else {
      const r = outcome.value.results.find((x) => x.name === spec.solvedResult);
      if (r !== undefined) {
        value = r.value.si;
        solved = true;
      }
    }
    if (value === undefined || !Number.isFinite(value)) continue;
    const what = `${cap(spec.label)}${solved ? ' (solved)' : ''}`;
    const lookup = lookupLimit(p, spec.key, 'min', sc.value.scope);
    if (lookup.status === 'found') {
      ids.push(lookup.entry.ledgerId);
      const min = lookup.value.si;
      const detail = `${profileText}; status ${tag(lookup.entry.status)}; ledger ${lookup.entry.ledgerId}, retrieved ${lookup.entry.retrievedOn}; published wording: ${lookup.entry.quote}; ${scopeText}.`;
      if (value < min * (1 - REL_SLACK)) {
        warnings.push({ severity: 'warning', code: 'BELOW_PROFILE_MINIMUM', message: `${what} ${both(value)} is below the profile minimum ${both(min)} for this scope (${detail}) Compare with your fabricator's current minimum; no limit is built into this tool.` });
      } else {
        warnings.push({ severity: 'info', code: 'MEETS_PROFILE_MINIMUM', message: `${what} ${both(value)} meets the profile minimum ${both(min)} for this scope (${detail}) This compares the drawn value only; the profile is example data and the fabricator's own tolerance is not included.` });
      }
    } else if (lookup.status === 'not-published') {
      ids.push(lookup.entry.ledgerId);
      warnings.push({ severity: 'info', code: 'PROFILE_MINIMUM_NOT_PUBLISHED', message: `Minimum ${spec.label} not published: ${profileText} lists this scope and says the fabricator does not publish it (ledger ${lookup.entry.ledgerId}; published wording: ${lookup.entry.quote}). No minimum is assumed; ${scopeText}.` });
    } else {
      warnings.push({ severity: 'info', code: 'PROFILE_MINIMUM_NOT_AVAILABLE', message: `Minimum ${spec.label} not available for this scope in ${profileText}. ${lookup.reason} No minimum is assumed.` });
    }
  }
  if (warnings.length === 0) return outcome;
  const known = new Set(outcome.value.reference.ledgerIds);
  const extra = [...new Set(ids)].filter((id) => !known.has(id));
  return {
    ok: true,
    value: {
      ...outcome.value,
      warnings: [...outcome.value.warnings, ...warnings],
      reference: extra.length === 0 ? outcome.value.reference : { ...outcome.value.reference, ledgerIds: [...outcome.value.reference.ledgerIds, ...extra] },
    },
  };
}
