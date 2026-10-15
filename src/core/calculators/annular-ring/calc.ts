import { confidenceFactorsFromInputs, rateConfidence } from '../../confidence';
import type { DataStatus } from '../../confidence';
import { LEDGER } from '../../data/ledger';
import { dataStatusFromLedger, worstDataStatus } from '../../data-status';
import { fabProfileAgeDays, fabProfileStale } from '../../fab/profile';
import type { ParsedFabProfile } from '../../fab/profile';
import { lookupLimit } from '../../fab/scoped-limits';
import type { LimitKind, ScopeRequest, ScopedKey, ScopedLimit } from '../../fab/scoped-limits';
import { formatResult } from '../../format-result';
import { assertCalcResult } from '../../result';
import type { Bound, CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning } from '../../result';
import { DIM, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { validate } from './guards';
import type { HoleType, LayerCountInput, LayerSideInput, RingReference, ToleranceInput } from './guards';
import { meta } from './meta';

export interface Inputs {
  /** Copper pad diameter. */
  padDiameter: Quantity;
  /** FINISHED hole diameter (inside diameter after plating; for NPTH the hole itself). */
  finishedHoleDiameter: Quantity;
  /** Required, never defaulted: via, pth or npth. Limits differ by hole type. */
  holeType: HoleType;
  /** Drill (tool) diameter before plating, optional; needed for a drill-referenced ring. */
  drillDiameter?: Quantity;
  /** Barrel plating thickness, optional; only used with drillDiameter, for an informational comparison. Not allowed for NPTH. */
  platingThickness?: Quantity;
  /** Which hole the ring is measured to. Defaults to 'finished' (recorded as a default). */
  ringReference?: RingReference;
  /** Scope for profile lookups. A profile entry that is specific to a scope is never used when this is omitted. */
  layerCount?: LayerCountInput;
  copperWeight?: Quantity;
  layerSide?: LayerSideInput;
  /** Finished-hole size tolerance, plus side (a larger hole shrinks the ring). A length, or 'profile'. */
  holeSizeTolPlus?: ToleranceInput;
  /** Drill position / registration tolerance (radial). A length, or 'profile'. */
  positionTol?: ToleranceInput;
  /** Pad diameter tolerance (+/-). A length, or 'profile'. */
  padSizeTol?: ToleranceInput;
  /** Your fabricator's absolute and recommended ring minimums, if you have them. */
  userMinimumRing?: Quantity;
  userRecommendedRing?: Quantity;
  /** A parsed fab profile and the injected evaluation date (YYYY-MM-DD). */
  fabProfile?: ParsedFabProfile;
  today?: string;
}

const NOT_PUBLISHED_TEXT = 'ring-minimum not published for this scope: enter your fabricator value';
const IPC6012_TEXT =
  'IPC-6012 acceptance criteria for annular ring (for example whether breakout is allowed for a product class) are PAYWALLED and were not read: they are not evaluated here. This calculator compares the ring with a fabricator figure or your own, nothing more.';
const LINEAR_TEXT =
  'The worst case adds the supplied tolerances arithmetically (pad tolerance / 2 + hole tolerance / 2 + position tolerance). It is a bounding case, not a statistical combination, and it is only as complete as the tolerances supplied.';
const DOUBLE_COUNT_TEXT =
  'A fabricator ring minimum may already include its process tolerance; the profile does not say. Comparing the worst-case ring (which subtracts tolerances again) with such a minimum can double-count. Compare the nominal ring with a design-rule minimum, and the worst-case ring only if your fabricator states that its figure excludes tolerance.';
const RECOMMENDATION =
  'Confirm with your fabricator which hole (finished or drill) its ring limit is measured from, whether the limit already includes process tolerance, and its current value for your hole type, layer count and copper weight. Any fabricator figure shown here comes from a dated, user-editable fab profile and may have changed; the calculation is geometry only.';

const P_MIN = 'profile minimum annular ring';
const P_REC = 'profile recommended annular ring';
const U_MIN = 'your minimum annular ring';
const U_REC = 'your recommended annular ring';
const VIA_DIFF_MIN = 'profile via pad-minus-hole minimum';
const VIA_DIFF_REC = 'profile via pad-minus-hole recommended';

const REL_EPS = 1e-9;
const T20 = 'S-006';
const OPTS = { accuracyClass: meta.accuracyClass } as const;

const num = (x: number): string => String(Number(x.toPrecision(4)));
const mmText = (x: Quantity): string => `${num(toUnit(x, 'mm'))} mm`;
const lengthQ = (si: number): Quantity => q(si, DIM.LENGTH);
const copy = (x: Quantity): Quantity => q(x.si, x.dim);
const fmt = (value: Quantity, bound: Bound): string => formatResult({ value, bound }, OPTS);

class RangeFailure extends Error {}
function finite(n: number, what: string): number {
  if (!Number.isFinite(n)) throw new RangeFailure(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
}

interface Term {
  readonly id: 'pad' | 'hole' | 'position';
  readonly label: string;
  readonly inputName: string;
  readonly toleranceSi: number;
  readonly contributionSi: number;
  readonly expr: string;
  readonly source: 'user' | 'fab-profile';
  readonly entry?: ScopedLimit;
}

interface Requirement {
  readonly name: string;
  readonly kind: 'ring' | 'diff';
  readonly value: Quantity;
  readonly source: 'user' | 'fab-profile';
  readonly entry?: ScopedLimit;
}

function entryDetail(profile: ParsedFabProfile, e: ScopedLimit): string {
  const oz = e.copperOz === 'any' ? 'any copper weight' : `${String(e.copperOz)} oz/ft2`;
  return `${profile.id}: ${e.key} (${e.kind}); hole type ${e.holeType}, layers ${e.layerCount}, ${oz}, layer side ${e.layerSide}; size basis ${e.sizeBasis}; ledger ${e.ledgerId}; ${e.status}; retrieved ${e.retrievedOn}; published wording: ${e.quote}`;
}

function build(raw: unknown): CalcOutcome {
  const v = validate(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const inp = v.value;
  const profile = inp.fabProfile;

  const pad = inp.padDiameter.si;
  const hole = inp.finishedHoleDiameter.si;
  const drillQty = inp.drillDiameter;
  const drill = drillQty?.si;
  const refName = inp.ringReference === 'drill' ? 'drill' : 'finished hole';
  const refQty = inp.ringReference === 'drill' && drillQty !== undefined ? drillQty : inp.finishedHoleDiameter;
  const refDia = refQty.si;

  const NOM = `nominal annular ring (${refName})`;
  const NOM_OTHER = `nominal annular ring (${inp.ringReference === 'drill' ? 'finished hole' : 'drill'})`;

  const nominalRef = finite((pad - refDia) / 2, 'Nominal annular ring');
  const nominalFinished = finite((pad - hole) / 2, 'Nominal annular ring (finished hole)');
  const nominalDrill = drill !== undefined ? finite((pad - drill) / 2, 'Nominal annular ring (drill)') : undefined;

  const scope: ScopeRequest = {
    holeType: inp.holeType,
    ...(inp.layerCount !== undefined ? { layerCount: inp.layerCount } : {}),
    ...(inp.copperOz !== undefined ? { copperOz: inp.copperOz } : {}),
    ...(inp.layerSide !== undefined ? { layerSide: inp.layerSide } : {}),
  };
  const warnings: CalcWarning[] = [];
  const consulted: string[] = [];
  const inputs: CalcInput[] = [];
  const steps: CalcResult['steps'] = [];
  const results: CalcResult['results'] = [];
  const note = (e: ScopedLimit): void => {
    consulted.push(e.ledgerId);
  };

  // ---- inputs
  inputs.push({ name: 'pad diameter', value: copy(inp.padDiameter), source: 'user' });
  inputs.push({ name: 'finished hole diameter', value: copy(inp.finishedHoleDiameter), source: 'user' });
  if (inp.drillDiameter) inputs.push({ name: 'drill diameter', value: copy(inp.drillDiameter), source: 'user' });
  if (inp.platingThickness) inputs.push({ name: 'plating thickness', value: copy(inp.platingThickness), source: 'user' });
  inputs.push(
    inp.ringReferenceDefaulted
      ? { name: 'ring reference', value: copy(refQty), source: 'default', sourceDetail: 'Ring measured to the finished hole by default; choose "drill" to measure to the drill diameter. Fabricators differ and often do not say which they use.' }
      : { name: 'ring reference', value: copy(refQty), source: 'user', sourceDetail: `Ring measured to the ${refName} diameter.` },
  );
  if (inp.copperWeight) inputs.push({ name: 'copper weight', value: copy(inp.copperWeight), source: 'user' });

  // ---- tolerance terms
  const terms: Term[] = [];
  const omitted: string[] = [];
  const lookupTerm = (
    id: Term['id'],
    label: string,
    inputName: string,
    src: { kind: 'user'; value: Quantity } | { kind: 'profile' } | undefined,
    key: ScopedKey,
    kind: LimitKind,
    divisor: number,
    exprText: string,
    isHoleTol: boolean,
  ): void => {
    if (src === undefined) {
      omitted.push(label);
      return;
    }
    if (src.kind === 'user') {
      const sideNote = isHoleTol && inp.ringReference === 'drill' ? ' (user value, applied to the drill diameter)' : '';
      terms.push({ id, label, inputName, toleranceSi: src.value.si, contributionSi: src.value.si / divisor, expr: `${exprText}; source: user${sideNote}`, source: 'user' });
      inputs.push({ name: inputName, value: copy(src.value), source: 'user', ...(sideNote ? { sourceDetail: `User tolerance${sideNote}.` } : {}) });
      return;
    }
    // 'profile'
    if (profile === undefined) throw new RangeFailure('internal: a profile tolerance without a profile');
    if (isHoleTol && inp.ringReference === 'drill') {
      omitted.push(label);
      warnings.push({
        severity: 'caution',
        code: 'TOLERANCE_NOT_APPLICABLE',
        message: `The ${label} is not taken from the profile: a profile finished-hole tolerance is not applied to a ring measured to the drill (a finished-hole tolerance is never applied to the drill bit). Enter your own drill tolerance if you have one.`,
      });
      return;
    }
    const r = lookupLimit(profile, key, kind, scope);
    if (r.status === 'found') {
      note(r.entry);
      terms.push({ id, label, inputName, toleranceSi: r.value.si, contributionSi: r.value.si / divisor, expr: `${exprText}; source: profile ${profile.id} ${r.entry.ledgerId}, ${r.entry.status}`, source: 'fab-profile', entry: r.entry });
      inputs.push({ name: inputName, value: copy(r.value), source: 'fab-profile', sourceDetail: entryDetail(profile, r.entry) });
      return;
    }
    omitted.push(label);
    if (r.status === 'not-published') {
      note(r.entry);
      warnings.push({
        severity: 'caution',
        code: 'TOLERANCE_NOT_PUBLISHED',
        message: `The ${label} is not published by the fabricator for this scope (profile ${profile.id}, ${r.entry.ledgerId}, ${r.entry.status}: ${r.entry.quote}). It is omitted from the worst case, not assumed: enter your fabricator value.`,
      });
    } else {
      warnings.push({ severity: 'caution', code: 'TOLERANCE_NOT_PUBLISHED', message: `The ${label} is not available from the profile for this scope and is omitted from the worst case, not assumed: enter your fabricator value. ${r.reason}` });
    }
  };
  lookupTerm('pad', 'pad size tolerance', 'pad size tolerance (+/-)', inp.padSizeTol, 'padSizeTol', 'tol-sym', 2, 'pad size term = tol_pad / 2 (the pad grows or shrinks by tol_pad on its diameter)', false);
  lookupTerm('hole', 'hole size tolerance', 'hole size tolerance (+)', inp.holeSizeTolPlus, 'holeFinishedTol', 'tol-plus', 2, 'hole size term = tol_hole_plus / 2 (a larger hole takes ring from one side)', true);
  lookupTerm('position', 'position tolerance', 'position tolerance', inp.positionTol, 'holePositionTol', 'tol-sym', 1, 'position term = tol_position (radial offset of the hole centre from the pad centre)', false);
  if (terms.some((t) => t.id === 'position' && t.source === 'fab-profile')) {
    warnings.push({
      severity: 'info',
      code: 'POSITION_RADIAL',
      message: 'The profile position tolerance is applied as a radial offset of the hole centre (full value on one side of the ring). The fabricator wording does not say whether it is radial or diametral.',
    });
  }

  // ---- worst case (named partial when a term is omitted: PCB-F2)
  const partial = terms.length > 0 && omitted.length > 0;
  const WC = partial ? `partial worst-case annular ring (omits: ${omitted.join(', ')}) (${refName})` : `worst-case annular ring (${refName})`;
  const wcStepLabel = partial ? `Partial worst-case annular ring (omits: ${omitted.join(', ')}) (${refName})` : `Worst-case annular ring (${refName})`;
  const wcWord = partial ? 'partial worst-case ring' : 'worst-case ring';
  const totalSi = terms.reduce((a, t) => a + t.contributionSi, 0);
  const worstSi = terms.length > 0 ? finite(nominalRef - totalSi, 'Worst-case annular ring') : undefined;

  // ---- requirements
  const reqs: Requirement[] = [];
  const addRing = (name: string, kind: LimitKind): void => {
    if (profile === undefined) return;
    const r = lookupLimit(profile, 'annularRing', kind, scope);
    if (r.status === 'found') {
      note(r.entry);
      reqs.push({ name, kind: 'ring', value: r.value, source: 'fab-profile', entry: r.entry });
      inputs.push({ name, value: copy(r.value), source: 'fab-profile', sourceDetail: entryDetail(profile, r.entry) });
    } else if (r.status === 'not-published') {
      note(r.entry);
      warnings.push({
        severity: 'caution',
        code: 'MINIMUM_NOT_PUBLISHED',
        message: `${name}: ${NOT_PUBLISHED_TEXT}. Profile ${profile.id} records it as not published (${r.entry.ledgerId}, ${r.entry.status}: ${r.entry.quote}). No value from another hole type, layer count or copper weight is used.`,
      });
    } else {
      warnings.push({ severity: 'caution', code: 'MINIMUM_NOT_AVAILABLE', message: `${name}: ${NOT_PUBLISHED_TEXT}. ${r.reason}` });
    }
  };
  addRing(P_MIN, 'min');
  addRing(P_REC, 'recommended-min');
  if (inp.userMinimumRing) {
    reqs.push({ name: U_MIN, kind: 'ring', value: inp.userMinimumRing, source: 'user' });
    inputs.push({ name: U_MIN, value: copy(inp.userMinimumRing), source: 'user' });
  }
  if (inp.userRecommendedRing) {
    reqs.push({ name: U_REC, kind: 'ring', value: inp.userRecommendedRing, source: 'user' });
    inputs.push({ name: U_REC, value: copy(inp.userRecommendedRing), source: 'user' });
  }
  if (profile !== undefined && inp.holeType === 'via') {
    const addDiff = (name: string, kind: LimitKind): void => {
      const r = lookupLimit(profile, 'padMinusHole', kind, scope);
      if (r.status === 'found') {
        note(r.entry);
        reqs.push({ name, kind: 'diff', value: r.value, source: 'fab-profile', entry: r.entry });
        inputs.push({ name, value: copy(r.value), source: 'fab-profile', sourceDetail: entryDetail(profile, r.entry) });
      } else if (r.status === 'not-published') {
        note(r.entry);
        warnings.push({ severity: 'caution', code: 'DIFF_NOT_PUBLISHED', message: `${name}: not published for this scope (${r.entry.ledgerId}, ${r.entry.status}); enter your fabricator value.` });
      } else {
        warnings.push({ severity: 'caution', code: 'DIFF_NOT_AVAILABLE', message: `${name}: not available for this scope; enter your fabricator value. ${r.reason}` });
      }
    };
    addDiff(VIA_DIFF_MIN, 'min');
    addDiff(VIA_DIFF_REC, 'recommended-min');
  }

  // ---- steps and results
  const nomQ = lengthQ(nominalRef);
  steps.push({ label: `Nominal annular ring (${refName})`, expr: `AR = (pad - ${refName === 'drill' ? 'drill' : 'finished hole'}) / 2`, value: nomQ, bound: 'nominal' });
  if (nominalDrill !== undefined && drill !== undefined) {
    const otherSi = inp.ringReference === 'drill' ? nominalFinished : nominalDrill;
    steps.push({ label: `Nominal annular ring (${inp.ringReference === 'drill' ? 'finished hole' : 'drill'}), for comparison`, expr: 'AR = (pad - hole) / 2 with the other hole diameter', value: lengthQ(otherSi), bound: 'nominal' });
    const diff = finite(drill - hole, 'Drill minus finished hole');
    steps.push({ label: 'Drill minus finished hole diameter', expr: 'D_drill - D_finished', value: lengthQ(diff), bound: 'nominal' });
  }
  for (const t of terms) steps.push({ label: `Tolerance term: ${t.label}`, expr: `${t.expr}; value ${mmText(lengthQ(t.contributionSi))}`, value: lengthQ(t.contributionSi), bound: 'prediction' });
  if (worstSi !== undefined) {
    steps.push({ label: 'Tolerance stack-up total', expr: 'sum of the terms above (linear worst case)', value: lengthQ(totalSi), bound: 'prediction' });
    steps.push({ label: wcStepLabel, expr: partial ? 'AR_partial = AR - total of the terms supplied (omitted terms are not subtracted: optimistic)' : 'AR_wc = AR - total', value: lengthQ(worstSi), bound: 'max-capacity' });
  }

  const hasWorst = worstSi !== undefined;
  results.push({ name: NOM, value: nomQ, role: hasWorst ? 'secondary' : 'primary', bound: 'nominal' });
  if (nominalDrill !== undefined && drill !== undefined) {
    results.push({ name: NOM_OTHER, value: lengthQ(inp.ringReference === 'drill' ? nominalFinished : nominalDrill), role: 'secondary', bound: 'nominal' });
    results.push({ name: 'drill minus finished hole diameter', value: lengthQ(drill - hole), role: 'secondary', bound: 'nominal' });
  }
  if (worstSi !== undefined) {
    results.push({ name: WC, value: lengthQ(worstSi), role: 'primary', bound: 'max-capacity' });
    results.push({ name: 'tolerance stack-up total', value: lengthQ(totalSi), role: 'secondary', bound: 'prediction' });
  }
  if (inp.holeType === 'via') results.push({ name: 'pad minus hole diameter', value: lengthQ(finite(pad - refDia, 'Pad minus hole diameter')), role: 'secondary', bound: 'nominal' });

  // ---- comparisons (wording: meets / is below the value; never a pass, never certification)
  const statusTextOf = (r: Requirement): string =>
    r.entry !== undefined
      ? `profile ${profile?.id ?? ''}, ledger ${r.entry.ledgerId}, data status ${r.entry.status}${r.entry.status === 'VERIFIED' ? '' : '; this is a comparison with a published figure, not an acceptance result'}`
      : 'your own value';
  const compare = (ringLabel: string, ringSi: number, ringBound: Bound, r: Requirement, marginName: string): void => {
    const reqSi = r.value.si;
    const marginSi = finite(ringSi - reqSi, `Margin to ${r.name}`);
    const meets = marginSi >= -REL_EPS * reqSi;
    results.push({ name: marginName, value: lengthQ(marginSi), role: 'secondary', bound: 'max-capacity' });
    steps.push({ label: marginName, expr: `${ringLabel} - ${r.name}`, value: lengthQ(marginSi), bound: 'max-capacity' });
    warnings.push({
      severity: meets ? 'info' : 'warning',
      code: meets ? 'MEETS_VALUE' : 'BELOW_VALUE',
      message: `The ${ringLabel} (${fmt(lengthQ(ringSi), ringBound)}) ${meets ? 'meets' : 'is below'} the ${r.name} (${fmt(r.value, 'min-requirement')}; ${statusTextOf(r)}).`,
    });
  };
  const seenReq = new Set<string>();
  for (const r of reqs) {
    if (seenReq.has(r.name)) continue;
    seenReq.add(r.name);
    results.push({ name: r.name, value: copy(r.value), role: 'secondary', bound: 'min-requirement' });
    if (r.kind === 'ring') {
      compare('nominal ring', nominalRef, 'nominal', r, `nominal ring margin to ${r.name}`);
      if (worstSi !== undefined) compare(wcWord, worstSi, 'max-capacity', r, `worst-case ring margin to ${r.name}`);
    } else {
      compare('pad-minus-hole diameter', pad - refDia, 'nominal', r, `pad-minus-hole margin to ${r.name}`);
    }
  }

  // ---- statements
  if (worstSi !== undefined && worstSi <= 0) {
    warnings.push({
      severity: 'critical',
      code: 'BREAKOUT_POSSIBLE',
      message: `The worst-case ring (${fmt(lengthQ(worstSi), 'max-capacity')}) is zero or negative: with these tolerances the hole can break out of the pad. This is a geometric statement; whether it is acceptable depends on the standard and class you design to, which is not evaluated here.`,
    });
  }
  if (terms.length === 0) {
    warnings.push({ severity: 'caution', code: 'NO_TOLERANCE_SUPPLIED', message: 'No tolerance was supplied or available, so only the nominal ring is given. No tolerance is assumed: enter the finished-hole, position and pad-size tolerances from your fabricator to get a worst case.' });
  } else {
    warnings.push({ severity: 'info', code: 'LINEAR_STACKUP', message: LINEAR_TEXT });
    if (terms.length < 3) {
      warnings.push({
        severity: 'caution',
        code: 'WORST_CASE_INCOMPLETE',
        message: `The worst case is PARTIAL: it omits ${omitted.join(', ')} (not supplied or not published). It is therefore optimistic by at least those terms, and its confidence is lowered for each omitted term.`,
      });
    }
  }
  if (reqs.length > 0 && worstSi !== undefined) warnings.push({ severity: 'caution', code: 'DOUBLE_COUNT', message: DOUBLE_COUNT_TEXT });
  if (profile === undefined && !inp.userMinimumRing && !inp.userRecommendedRing) {
    warnings.push({ severity: 'caution', code: 'NO_MINIMUM_SUPPLIED', message: 'No ring minimum was supplied and no fab profile was selected, so there is nothing to compare the ring with. Enter your fabricator\'s minimum or select a profile.' });
  }
  const profileRingUsed = reqs.filter((r) => r.entry !== undefined && r.kind === 'ring');
  if (profileRingUsed.length > 0) {
    const basis = profileRingUsed[0]?.entry?.sizeBasis;
    const chosen = inp.ringReference === 'drill' ? 'drill' : 'finished';
    if (basis === 'designed-unstated') {
      warnings.push({
        severity: 'caution',
        code: 'RING_REFERENCE_UNSTATED',
        message: `The profile does not say whether its ring limits are measured from the finished or the drill hole. You chose the ${refName} reference; if the fabricator measures from the other one, the ring differs by the plating thickness plus any drill allowance (which is fabricator specific).`,
      });
    } else if (basis !== undefined && basis !== chosen) {
      warnings.push({ severity: 'warning', code: 'RING_REFERENCE_MISMATCH', message: `The profile ring limit is measured to the ${basis === 'drill' ? 'drill' : 'finished hole'} but this ring uses the ${refName}; compare against the other ring result shown, if available.` });
    }
  }
  if (inp.holeType === 'npth') warnings.push({ severity: 'info', code: 'NPTH_NO_PLATING', message: 'A non-plated hole has no barrel plating: the finished hole equals the drilled hole and no plating is considered.' });
  if (drill !== undefined) {
    const diff = drill - hole;
    const plated = inp.platingThickness !== undefined ? ` The plating you gave contributes 2 x t = ${mmText(lengthQ(2 * inp.platingThickness.si))}; the remainder is the fabricator's drill allowance (fabricator specific, not standardised here) or a data slip.` : ' No plating thickness was given, so the split between plating and drill allowance is unknown.';
    warnings.push({ severity: 'info', code: 'DRILL_ALLOWANCE', message: `Drill minus finished hole diameter is ${mmText(lengthQ(diff))}.${plated}` });
  }
  warnings.push({ severity: 'caution', code: 'IPC6012_NOT_EVALUATED', message: IPC6012_TEXT });

  // ---- profile bookkeeping
  let fabProfile: CalcResult['fabProfile'] | undefined;
  if (profile !== undefined && inp.today !== undefined) {
    const ageDays = fabProfileAgeDays(profile, inp.today);
    const stale = fabProfileStale(profile, inp.today);
    fabProfile = { id: profile.id, fabricator: profile.fabricator, profileDate: profile.profileDate, status: dataStatusFromLedger(profile.status), ageDays, stale };
    if (profile.status !== 'VERIFIED') {
      warnings.push({
        severity: 'caution',
        code: 'FAB_PROFILE_UNVERIFIED',
        message: `Fabricator figures come from profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, status ${profile.status}). Fabricators change limits without notice: re-read them on the fabricator's own page before relying on them.`,
      });
    }
    if (stale) warnings.push({ severity: 'warning', code: 'FAB_PROFILE_STALE', message: `The fab profile is ${String(ageDays)} days old (more than 365): treat its figures as out of date.` });
  }

  // ---- validity, assumptions, confidence
  const validityChecks: CalcResult['validityChecks'] = [
    { name: 'pad diameter is larger than the hole diameter used for the ring', ok: pad > refDia, detail: `Pad ${mmText(inp.padDiameter)} against ${refName} ${mmText(refQty)}.` },
  ];
  const scopeText = `hole type ${inp.holeType}, layer count ${inp.layerCount ?? 'not given'}, copper weight ${inp.copperOz === undefined ? 'not given' : `${String(inp.copperOz)} oz/ft2`}, layer side ${inp.layerSide ?? 'not given'}`;
  const assumptions: string[] = [
    `The ring is measured to the ${refName} diameter${inp.ringReferenceDefaulted ? ' (default; not chosen by the user)' : ''}: AR = (pad - hole) / 2. The finished hole is the inside diameter after plating; the drill is the tool size before plating.`,
    `Scope used for profile lookups: ${scopeText}. A profile entry is used only for exactly this scope; nothing is borrowed from another hole type, layer count, copper weight or limit kind.`,
    'No tolerance is assumed. A tolerance is used only if you entered it or the profile publishes it for this exact scope; the worst case lists every term and its source.',
    'Only the plus side of the finished-hole tolerance (a larger hole) reduces the ring; the minus side (a smaller hole) is not credited, so the worst case is never improved by it.',
    'Pad size tolerance is taken as +/- on the pad diameter (half of it on each side of the ring); position tolerance is a radial offset of the hole centre.',
    profile === undefined ? 'No fab profile was selected: no fabricator limit is used.' : `Fab profile ${profile.id} (${profile.fabricator}, ${profile.profileDate}, ${profile.status}) supplies fabricator limits; every value shows its ledger row and status.`,
    inp.holeType === 'via' ? 'For a via the profile publishes a pad-minus-hole diameter rule rather than a ring minimum; it is compared as a diameter difference (twice the per-side ring), not converted to a ring.' : 'Ring minimums are per hole type: no value is taken from a different hole type.',
  ];

  const consultedRows = [T20, ...consulted];
  const statuses = consultedRows.map((id) => {
    const row = LEDGER.find((x) => x.id === id);
    if (!row) throw new RangeFailure(`internal: unknown ledger id ${id}`);
    return row.status;
  });
  if (profile !== undefined) statuses.push(profile.status);
  const dataStatus: DataStatus = worstDataStatus(statuses);
  const factors = confidenceFactorsFromInputs({ inputs, accuracyClass: meta.accuracyClass, dataStatus });
  // Each omitted worst-case term is a safety-relevant defaulted assumption (a missing term makes the worst case optimistic).
  const omittedDefaults = partial ? omitted.map((t) => `omitted worst-case term: ${t} (not entered or not published; the partial worst case is optimistic by at least this term)`) : [];
  const confidence = rateConfidence({ ...factors, safetyRelevantDefaults: [...(factors.safetyRelevantDefaults ?? []), ...omittedDefaults] });

  for (const r of results) if (!Number.isFinite(r.value.si)) throw new RangeFailure(`Result "${r.name}" is not finite for these inputs (check the units).`);
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds: [...meta.reference.ledgerIds] },
    formula: meta.formula,
    inputs,
    assumptions,
    steps,
    results,
    validityChecks,
    warnings,
    confidence,
    recommendation: RECOMMENDATION,
    dataStatus,
    designValues: [],
    ...(fabProfile !== undefined ? { fabProfile } : {}),
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) {
    const error: CalcError = { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
    return { ok: false, error };
  }
  return { ok: true, value: result };
}


/** Annular ring, drill reference and tolerance stack-up. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  try {
    return build(inputs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}
