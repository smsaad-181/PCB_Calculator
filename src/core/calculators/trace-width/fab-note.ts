import { dataStatusForLedgerIds } from '../../data-status';
import { FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE } from '../../data/constants';
import { fabProfileAgeDays } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { lookupLimit } from '../../fab/scoped-limits';
import type { ScopeRequest } from '../../fab/scoped-limits';
import { assertCalcResult } from '../../result';
import type { CalcError, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q, toUnit } from '../../units';
import { LAYER_COUNT_INPUTS } from '../annular-ring/guards';
import { checkProfileInputs, fabProfileRecord } from '../tolerance-shared';
import type { Inputs } from './calc';

/**
 * PCB-10: compares the result's widths with the fab profile's published minimum trace width for the exact scope (layer count,
 * copper weight, layer side). Optional: with no fabProfile the result is returned unchanged. The scope is exact: a limit that is
 * not published, or a scope the profile does not list, is reported as such and never replaced by another scope or limit kind.
 * The note is about manufacturability only; it says nothing about current capacity. Fab data is UNVERIFIED example data.
 */

const fail = (field: string, message: string): CalcOutcome => ({ ok: false, error: { code: 'INVALID_INPUT', field, message } satisfies CalcError });
const mmText = (si: number): string => String(Number(toUnit(q(si, DIM.LENGTH), 'mm').toPrecision(4)));

export function applyProfileMinimumWidth(raw: Inputs, result: CalcResult): CalcOutcome {
  const layerCount: unknown = raw.layerCount;
  if (raw.fabProfile === undefined) {
    if (layerCount !== undefined) return fail('layerCount', 'layerCount is only used with a fab profile (fabProfile); none was given.');
    return { ok: true, value: result };
  }
  // The minimum-width note is requested by giving layerCount with the profile; a profile alone changes nothing (it is also
  // passed for the width tolerance, which has its own handling).
  if (layerCount === undefined) return { ok: true, value: result };
  if (!(LAYER_COUNT_INPUTS as readonly unknown[]).includes(layerCount)) {
    return fail('layerCount', `layerCount must be one of ${LAYER_COUNT_INPUTS.join(', ')} (the scopes fabricators publish).`);
  }
  const pe = checkProfileInputs(raw, true);
  if (pe !== undefined) return { ok: false, error: pe };
  const profile: ParsedFabProfile = raw.fabProfile;
  const today = raw.today as string;

  const copperOz = result.copperBasis?.weightOzFt2;
  const layer = result.copperBasis?.layer ?? raw.layer;
  const scope: ScopeRequest = {
    layerSide: layer,
    layerCount: layerCount as Exclude<ScopeRequest['layerCount'], undefined>,
    ...(copperOz !== undefined ? { copperOz } : {}),
  };
  const scopeText = `layer count ${String(layerCount)}, copper weight ${copperOz === undefined ? 'not given (entered as a thickness)' : `${String(copperOz)} oz/ft2`}, layer side ${layer}`;
  const lookup = lookupLimit(profile, 'traceWidth', 'min', scope);
  const rec = result.fabProfile ?? fabProfileRecord(profile, today);
  const warnings: CalcWarning[] = [...result.warnings];
  const ledgerIds = [...result.reference.ledgerIds];
  let assumption: string;

  if (lookup.status === 'found') {
    const minSi = lookup.value.si;
    const ref = `profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, ${String(fabProfileAgeDays(profile, today))} days old, status ${lookup.entry.status}; ledger ${lookup.entry.ledgerId}, retrieved ${lookup.entry.retrievedOn}; published wording: ${lookup.entry.quote})`;
    const solvedWidth = result.designValues.find((d) => d.name === 'width');
    const entered = result.results.find((x) => x.name === 'width');
    const compared: { label: string; si: number }[] = [];
    if (solvedWidth !== undefined) {
      compared.push({ label: 'minimum width', si: solvedWidth.calculated.si }, { label: 'recommended width', si: solvedWidth.recommended.si });
    } else if (entered !== undefined) {
      compared.push({ label: 'width you entered', si: entered.value.si });
    }
    // A width equal to the published value meets it (relative float noise of 1e-9 is ignored).
    const below = compared.filter((c) => c.si < minSi * (1 - 1e-9));
    const parts = compared.map((c) => `${c.label} ${mmText(c.si)} mm`).join(', ');
    if (below.length > 0) {
      warnings.push({
        severity: 'warning',
        code: 'BELOW_PROFILE_MIN_TRACE_WIDTH',
        message: `Width check against profile ${profile.id}: ${parts}, below the profile minimum trace width for this scope (published minimum ${mmText(minSi)} mm; ${below.map((c) => c.label).join(' and ')} below it). Scope: ${scopeText}. Source: ${ref}. UNVERIFIED example data: re-read it on the fabricator's page. This is a manufacturing limit, not a statement about current capacity.`,
      });
    } else {
      warnings.push({
        severity: 'info',
        code: 'MEETS_PROFILE_MIN_TRACE_WIDTH',
        message: `Width check against profile ${profile.id}: ${parts}, meets the profile minimum trace width for this scope (published minimum ${mmText(minSi)} mm). Scope: ${scopeText}. Source: ${ref}. This is not a statement about current capacity or reliability, and the profile is UNVERIFIED example data: re-read it on the fabricator's page.`,
      });
    }
    if (!ledgerIds.includes(lookup.entry.ledgerId)) ledgerIds.push(lookup.entry.ledgerId);
    assumption = `Fab profile ${profile.id} minimum trace width ${mmText(minSi)} mm for ${scopeText} (ledger ${lookup.entry.ledgerId}, ${lookup.entry.status}); compared with the result as a manufacturing note only.`;
  } else {
    const detail =
      lookup.status === 'not-published'
        ? `The profile lists this scope and says the fabricator does not publish a minimum trace width for it (ledger ${lookup.entry.ledgerId}; published wording: ${lookup.entry.quote}).`
        : lookup.reason;
    warnings.push({
      severity: 'caution',
      code: 'PROFILE_MIN_TRACE_WIDTH_NOT_PUBLISHED',
      message: `No published minimum trace width for this scope in profile ${profile.id} (${scopeText}). ${detail} No other copper weight, layer count or limit is substituted, so no comparison is made.`,
    });
    if (lookup.status === 'not-published' && !ledgerIds.includes(lookup.entry.ledgerId)) ledgerIds.push(lookup.entry.ledgerId);
    assumption = `Fab profile ${profile.id}: no published minimum trace width for ${scopeText}; no comparison made and no other scope substituted.`;
  }

  // Profile status and age warnings, once (the width-tolerance path adds them itself).
  if (result.fabProfile === undefined) {
    if (profile.status !== 'VERIFIED') {
      warnings.push({
        severity: 'caution',
        code: 'FAB_PROFILE_UNVERIFIED',
        message: `The minimum trace width note comes from profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, status ${profile.status}). Fabricators change limits without notice: re-read it on the fabricator's own page before relying on it.`,
      });
    }
    if (rec.stale) warnings.push({ severity: 'warning', code: 'FAB_PROFILE_STALE', message: `The fab profile is ${String(rec.ageDays)} days old (more than 365): treat its figures as out of date.` });
  }

  const out: CalcResult = {
    ...result,
    reference: { ...result.reference, ledgerIds },
    assumptions: [...result.assumptions, assumption],
    warnings,
    dataStatus: dataStatusForLedgerIds(ledgerIds, undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE }),
    fabProfile: rec,
  };
  const chk = assertCalcResult(out);
  return chk.ok ? { ok: true, value: out } : { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
}
