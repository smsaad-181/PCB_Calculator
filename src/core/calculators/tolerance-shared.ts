import { finishedVsNominal, FINISHED_COPPER_SOURCE } from '../data/finished-copper';
import { LEDGER } from '../data/ledger';
import { dataStatusFromLedger } from '../data-status';
import { fabProfileAgeDays, fabProfileStale } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import { assertCalcResult } from '../result';
import type { Bound, CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, Envelope, Result } from '../result';
import { analyse } from '../sensitivity';
import type { Analysis, OutputSpec, PerturbSpec } from '../sensitivity';
import { DIM, FOIL_CONVENTIONS, foilThickness, q, sameDim, toUnit } from '../units';
import type { FoilConvention, Quantity } from '../units';

/**
 * Shared plumbing for the tolerance envelope and sensitivity readout (Phase 1 task 9). It turns user-entered tolerances
 * (or an explicit, labelled choice) into perturbation specs for the generic helper in src/core/sensitivity.ts and turns the
 * helper's analysis back into CalcResult additions: envelope[], 'sensitivity of <output> to <input>' results, warnings,
 * assumptions and input echoes. It holds no physics; the calculators supply the model through their own compute.
 *
 * Rules enforced here (CLAUDE.md rules 1, 9, 10): no tolerance is ever defaulted, an absent tolerance means no envelope, a
 * fab-profile tolerance is used only when the user selects the profile and the profile publishes the entry (otherwise the
 * result says it is absent), every non-user tolerance carries its ledger id and status.
 */

/** A tolerance as entered: a symmetric Quantity (dimensionless fraction, or a temperature difference) or an asymmetric pair. */
export type TolValue = Quantity | { readonly plus: Quantity; readonly minus: Quantity };
export type TolKind = 'relative' | 'temperature';

export interface Tol {
  readonly minus: number;
  readonly plus: number;
}

/** Limits that catch unit slips, not standards: a relative minus tolerance must stay below 100 %; a temperature one is bounded in kelvin. */
export const MAX_REL_MINUS = 0.95;
export const MAX_REL_PLUS = 5;
export const MAX_TEMP_K = 200;

/** Ledger row of the published JLCPCB track-width tolerance (S-019l, UNVERIFIED) and the profile key that carries it. */
export const PROFILE_WIDTH_TOL = { key: 'traceWidthTolerancePct', ledgerId: 'S-019l' } as const;

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const dimless = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);

function oneSide(field: string, v: unknown, kind: TolKind, side: string): Result<number, CalcError> {
  const dim = kind === 'relative' ? DIM.DIMENSIONLESS : DIM.TEMPERATURE_DIFFERENCE;
  const what = kind === 'relative' ? 'a dimensionless fraction (for example 10 % = 0.1)' : 'a temperature difference in K (not an absolute temperature)';
  if (!isRec(v) || typeof v['si'] !== 'number' || !isRec(v['dim'])) {
    return { ok: false, error: err('INVALID_INPUT', field, `${field}${side} must be a quantity: ${what}.`) };
  }
  const same = ((): boolean => {
    try {
      return sameDim(v as unknown as Quantity, { si: 1, dim } as Quantity);
    } catch {
      return false;
    }
  })();
  if (!same) return { ok: false, error: err('DIMENSION', field, `${field}${side} must be ${what}.`) };
  const n = v['si'];
  if (!Number.isFinite(n)) return { ok: false, error: err('INVALID_INPUT', field, `${field}${side} is ${Number.isNaN(n) ? 'NaN (not a number)' : 'infinite'}; it must be finite.`) };
  if (n < 0) return { ok: false, error: err('INVALID_INPUT', field, `${field}${side} is negative; a tolerance is a non-negative amount (use the minus and plus sides for asymmetry).`) };
  return { ok: true, value: n };
}

/** Validates one tolerance (symmetric or asymmetric). Zero is allowed (a point envelope); NaN, infinity and negatives are not. */
export function parseTol(field: string, v: unknown, kind: TolKind): Result<Tol, CalcError> {
  let minus: number;
  let plus: number;
  if (isRec(v) && 'plus' in v && 'minus' in v) {
    const p = oneSide(field, v['plus'], kind, ' (plus side)');
    if (!p.ok) return p;
    const m = oneSide(field, v['minus'], kind, ' (minus side)');
    if (!m.ok) return m;
    plus = p.value;
    minus = m.value;
  } else {
    const s = oneSide(field, v, kind, '');
    if (!s.ok) return s;
    plus = s.value;
    minus = s.value;
  }
  if (kind === 'relative') {
    if (minus > MAX_REL_MINUS) return { ok: false, error: err('OUT_OF_DOMAIN', field, `${field} minus tolerance ${String(minus * 100)} % is above ${String(MAX_REL_MINUS * 100)} %: a value cannot fall by 100 % or more. Check the unit.`) };
    if (plus > MAX_REL_PLUS) return { ok: false, error: err('OUT_OF_DOMAIN', field, `${field} plus tolerance ${String(plus * 100)} % is above ${String(MAX_REL_PLUS * 100)} %. Check the unit.`) };
  } else if (minus > MAX_TEMP_K || plus > MAX_TEMP_K) {
    return { ok: false, error: err('OUT_OF_DOMAIN', field, `${field} is above ${String(MAX_TEMP_K)} K; check the unit.`) };
  }
  return { ok: true, value: { minus, plus } };
}

export type ThicknessChoice = { readonly source: 'foil-convention-spread' } | { readonly source: 'finished-copper-s009' };
export const isThicknessChoice = (v: unknown): v is ThicknessChoice =>
  isRec(v) && (v['source'] === 'foil-convention-spread' || v['source'] === 'finished-copper-s009') && !('plus' in v) && !('si' in v);

export type PlanSource = 'user' | 'user-choice' | 'fab-profile';

/** One resolved tolerance. `input` is the compute input name to perturb; absent for a scale-only tolerance (see applyEnvelope). */
export interface PlannedTol {
  readonly key: string;
  readonly input?: string;
  readonly label: string;
  readonly kind: TolKind;
  readonly minus: number;
  readonly plus: number;
  readonly source: PlanSource;
  readonly detail?: string;
  readonly ledgerIds: readonly string[];
}

/** What one tolerance key means for the calculator at hand. */
export interface FieldSpec {
  readonly key: string;
  /** Compute input name to perturb (the value must be a user-given Quantity in the inputs). */
  readonly input: string;
  readonly label: string;
  readonly kind: TolKind;
  /** False when the input is not a user-supplied quantity here (solved, defaulted or absent); then the tolerance is rejected with `absentMessage`. */
  readonly present: boolean;
  readonly absentMessage: string;
  /** The tolerance applies by scaling a solved quantity, not by perturbing an input (the solved-width case). */
  readonly scaleOnly?: boolean;
  readonly allow?: 'thickness' | 'profile-width';
}

export interface PlanContext {
  readonly layer?: 'outer' | 'inner';
  readonly copperWeight?: Quantity;
  readonly convention?: FoilConvention;
  readonly profile?: ParsedFabProfile;
  readonly today?: string;
}

export interface Plan {
  readonly planned: readonly PlannedTol[];
  readonly warnings: readonly CalcWarning[];
  /** Ledger ids whose data the used tolerances rely on (added to the result's dataStatus and reference). */
  readonly ledgerIds: readonly string[];
  readonly profileUsed: boolean;
}

const ledgerStatus = (id: string): string => LEDGER.find((r) => r.id === id)?.status ?? 'MISSING';

interface Resolved {
  readonly tol?: Tol;
  readonly detail: string;
  readonly ledgerIds: string[];
  readonly source: PlanSource;
  readonly warning?: CalcWarning;
}

function resolveThicknessChoice(choice: ThicknessChoice, ctx: PlanContext): Resolved {
  const none = (message: string, code: string): Resolved => ({ detail: '', ledgerIds: [], source: 'user-choice', warning: { severity: 'caution', code, message } });
  if (ctx.copperWeight === undefined || ctx.layer === undefined) {
    return none(`The copper thickness tolerance "${choice.source}" needs a foil weight (copperWeight); you entered a thickness. No thickness tolerance is applied: enter your own percentage instead.`, 'TOLERANCE_CHOICE_NOT_APPLICABLE');
  }
  const convention: FoilConvention = ctx.convention ?? 'nominal-35um';
  const t0 = foilThickness(ctx.copperWeight, convention).thickness.si;
  if (choice.source === 'foil-convention-spread') {
    const ts = (Object.keys(FOIL_CONVENTIONS) as FoilConvention[]).map((c) => foilThickness(ctx.copperWeight as Quantity, c).thickness.si);
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    const tol: Tol = { minus: Math.max(0, (t0 - lo) / t0), plus: Math.max(0, (hi - t0) / t0) };
    return {
      tol,
      source: 'user-choice',
      ledgerIds: ['S-003'],
      detail: `Copper thickness tolerance chosen by the user: the spread between the three foil conventions around the ${convention} thickness (-${(tol.minus * 100).toFixed(2)} % / +${(tol.plus * 100).toFixed(2)} %; ledger S-003, ${ledgerStatus('S-003')}). It covers the convention ambiguity only, not finished-copper or etch variation.`,
    };
  }
  const oz = Number(toUnit(ctx.copperWeight, 'oz/ft2').toFixed(9));
  const f = finishedVsNominal(ctx.layer, oz, t0 * 1e6);
  if (f === undefined) {
    return none(`No S-009 finished-copper figure exists for ${String(oz)} oz/ft2, so the "finished-copper-s009" thickness tolerance is not available. No thickness tolerance is applied: enter your own percentage instead.`, 'TOLERANCE_CHOICE_NOT_AVAILABLE');
  }
  if (!(f.minimumUm < t0 * 1e6)) {
    return {
      detail: '',
      ledgerIds: [FINISHED_COPPER_SOURCE.ledgerId],
      source: 'user-choice',
      warning: {
        severity: 'info',
        code: 'TOLERANCE_CHOICE_NO_THIN_SIDE',
        message: `The S-009 ${ctx.layer}-layer minimum for ${String(oz)} oz/ft2 (${f.minimumUm.toFixed(1)} um, ${f.class}) is not below the nominal ${(t0 * 1e6).toFixed(1)} um (plating build-up), so there is no thin-side spread to apply and no thickness tolerance is used from it. The figure is a secondhand minimum, not a typical value (ledger S-009, ${ledgerStatus('S-009')}); enter your own percentage if you need a range.`,
      },
    };
  }
  const tol: Tol = { minus: 1 - f.minimumUm / (t0 * 1e6), plus: 0 };
  return {
    tol,
    source: 'user-choice',
    ledgerIds: [FINISHED_COPPER_SOURCE.ledgerId],
    detail: `Copper thickness tolerance chosen by the user: thin side only, down to the S-009 ${f.class} for ${String(oz)} oz/ft2 (${f.minimumUm.toFixed(1)} um against the nominal ${(t0 * 1e6).toFixed(1)} um, -${(tol.minus * 100).toFixed(1)} %; ledger S-009, ${ledgerStatus('S-009')}, a secondhand minimum, not a typical value). No thick side is assumed.`,
  };
}

function resolveProfileWidth(ctx: PlanContext): Resolved {
  const profile = ctx.profile;
  const none = (message: string): Resolved => ({ detail: '', ledgerIds: [], source: 'fab-profile', warning: { severity: 'caution', code: 'TOLERANCE_NOT_PUBLISHED', message } });
  if (profile === undefined || ctx.today === undefined) {
    return none('A fab-profile track-width tolerance was selected but no fab profile (with the evaluation date) was supplied. No width tolerance is applied: select a profile or enter your own percentage.');
  }
  const pct = (profile.limits as Record<string, unknown>)[PROFILE_WIDTH_TOL.key];
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || !profile.ledgerIds.includes(PROFILE_WIDTH_TOL.ledgerId)) {
    return none(`Profile ${profile.id} does not publish a track-width tolerance (no "${PROFILE_WIDTH_TOL.key}" entry citing ledger ${PROFILE_WIDTH_TOL.ledgerId}), so no width tolerance is applied; nothing is assumed. Enter your fabricator value.`);
  }
  const f = pct / 100;
  return {
    tol: { minus: f, plus: f },
    source: 'fab-profile',
    ledgerIds: [PROFILE_WIDTH_TOL.ledgerId],
    detail: `Track-width tolerance +/-${String(pct)} % from profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, ${profile.status}; ledger ${PROFILE_WIDTH_TOL.ledgerId}, ${ledgerStatus(PROFILE_WIDTH_TOL.ledgerId)}). The fabricator does not state it per copper weight or layer count, and the profile is example data: re-read it on the fabricator's page.`,
  };
}

/**
 * Resolves the user's tolerances object against the calculator's field table. Unknown keys, tolerances on a quantity that is
 * not a user input here, and malformed values are INVALID_INPUT errors (never silently ignored). An empty object yields an
 * empty plan (no envelope).
 */
export function planTolerances(raw: unknown, fields: readonly FieldSpec[], ctx: PlanContext): Result<Plan, CalcError> {
  if (!isRec(raw)) return { ok: false, error: err('INVALID_INPUT', 'tolerances', 'tolerances must be an object keyed by input name.') };
  for (const k of Object.keys(raw)) {
    if (!fields.some((f) => f.key === k)) {
      return { ok: false, error: err('INVALID_INPUT', `tolerances.${k}`, `"${k}" is not a tolerance this calculator supports (${fields.map((f) => f.key).join(', ')}).`) };
    }
  }
  const planned: PlannedTol[] = [];
  const warnings: CalcWarning[] = [];
  const ledgerIds = new Set<string>();
  let profileUsed = false;
  for (const f of fields) {
    const v = raw[f.key];
    if (v === undefined) continue;
    const field = `tolerances.${f.key}`;
    if (!f.present) return { ok: false, error: err('INVALID_INPUT', field, f.absentMessage) };
    let r: Resolved;
    if (v === 'profile') {
      if (f.allow !== 'profile-width') return { ok: false, error: err('INVALID_INPUT', field, `${f.key} cannot take a fab-profile value.`) };
      r = resolveProfileWidth(ctx);
    } else if (isThicknessChoice(v)) {
      if (f.allow !== 'thickness') return { ok: false, error: err('INVALID_INPUT', field, `${f.key} cannot take the "${v.source}" choice.`) };
      r = resolveThicknessChoice(v, ctx);
    } else {
      const p = parseTol(field, v, f.kind);
      if (!p.ok) return p;
      r = { tol: p.value, detail: '', ledgerIds: [], source: 'user' };
    }
    if (r.warning !== undefined) warnings.push(r.warning);
    if (r.tol === undefined) continue;
    for (const id of r.ledgerIds) ledgerIds.add(id);
    if (r.source === 'fab-profile') profileUsed = true;
    planned.push({
      key: f.key,
      ...(f.scaleOnly === true ? {} : { input: f.input }),
      label: f.label,
      kind: f.kind,
      minus: r.tol.minus,
      plus: r.tol.plus,
      source: r.source,
      ...(r.detail !== '' ? { detail: r.detail } : {}),
      ledgerIds: r.ledgerIds,
    });
  }
  return { ok: true, value: { planned, warnings, ledgerIds: [...ledgerIds], profileUsed } };
}

export const hasTolerances = (inputs: unknown): boolean => {
  if (!isRec(inputs)) return false;
  const t = inputs['tolerances'];
  return t !== undefined && !(isRec(t) && Object.keys(t).length === 0);
};

/** Copy of the inputs without the envelope-only properties, for the nominal and perturbed evaluations. */
export function stripEnvelopeInputs<I extends object>(inputs: I): I {
  const out: Record<string, unknown> = { ...(inputs as Record<string, unknown>) };
  delete out['tolerances'];
  delete out['fabProfile'];
  delete out['today'];
  return out as I;
}

export function perturbSpecs(planned: readonly PlannedTol[]): PerturbSpec[] {
  return planned
    .filter((p): p is PlannedTol & { input: string } => p.input !== undefined)
    .map((p) => ({ input: p.input, kind: p.kind === 'relative' ? 'relative' : 'absolute', minus: p.minus, plus: p.plus }));
}

/** An output to analyse. `bound` defaults to the nominal result's bound; `onlyIfVaries` drops a degenerate (point) envelope. */
export interface OutputPlan {
  readonly name: string;
  readonly sensitivity: boolean;
  readonly bound?: Bound;
  readonly onlyIfVaries?: boolean;
}

/** An extra result and envelope that is a positive multiple of another output (the drawn width covering a width tolerance). */
export interface DerivedOutput {
  readonly name: string;
  readonly from: string;
  readonly factor: number;
  readonly bound: Bound;
  readonly note: string;
}

export function outputSpecs(outputs: readonly OutputPlan[]): OutputSpec[] {
  return outputs.map((o) => ({ name: o.name, sensitivity: o.sensitivity }));
}

const pct = (x: number): string => `${String(Number((x * 100).toPrecision(4)))} %`;
const tolText = (p: PlannedTol): string => {
  const unit = (x: number): string => (p.kind === 'relative' ? pct(x) : `${String(Number(x.toPrecision(4)))} K`);
  return p.minus === p.plus ? `+/-${unit(p.plus)}` : `-${unit(p.minus)} / +${unit(p.plus)}`;
};

export interface ApplyArgs {
  readonly nominal: CalcResult;
  readonly analysis: Analysis;
  readonly plan: Plan;
  readonly outputs: readonly OutputPlan[];
  readonly derived?: readonly DerivedOutput[];
}

/**
 * Adds the envelope, the sensitivity results, warnings, assumptions and tolerance input echoes to a nominal result. The
 * envelope never raises confidence: the level and score are unchanged, user-entered tolerances add a visible reason and a
 * profile tolerance counts through the dataStatus of its ledger row (done by the calculator before this call).
 */
export function applyEnvelope(a: ApplyArgs): CalcOutcome {
  const r = a.nominal;
  const results = [...r.results];
  const warnings = [...r.warnings, ...a.plan.warnings];
  const assumptions = [...r.assumptions];
  const inputs: CalcInput[] = [...r.inputs];
  const envelope: Envelope[] = [];
  const perturbed = a.plan.planned.filter((p) => p.input !== undefined);
  const activeLabels = a.plan.planned.filter((p) => p.minus > 0 || p.plus > 0).map((p) => p.label);
  const nominalOf = (name: string): CalcResult['results'][number] | undefined => results.find((x) => x.name === name);

  const perturbedLabels = perturbed.filter((p) => p.minus > 0 || p.plus > 0).map((p) => p.label);
  const pushEnvelope = (name: string, min: number, typ: number, max: number, dimOf: Quantity, bound: Bound, labels: readonly string[]): void => {
    envelope.push({
      name,
      min: q(min, dimOf.dim),
      typ: q(typ, dimOf.dim),
      max: q(max, dimOf.dim),
      toleranceInputs: [...labels],
      bound,
    });
  };

  for (const o of a.outputs) {
    const nom = nominalOf(o.name);
    const env = a.analysis.envelopes.find((e) => e.output === o.name);
    if (nom === undefined || env === undefined) continue;
    const bound = o.bound ?? nom.bound;
    const varies = env.min === null || env.max === null || env.min !== env.typ || env.max !== env.typ;
    if (o.onlyIfVaries === true && !varies) continue;
    if (env.min === null || env.max === null) {
      const missing = [env.min === null ? 'minimum' : '', env.max === null ? 'maximum' : ''].filter((x) => x !== '').join(' and ');
      warnings.push({
        severity: 'warning',
        code: 'ENVELOPE_BOUND_OMITTED',
        message: `The envelope for "${o.name}" is omitted: its ${missing} could not be determined because the calculator rejected the corner(s) that set it (see the incomplete-corner warnings). Nothing was clamped or guessed.`,
      });
    } else {
      pushEnvelope(o.name, env.min, env.typ, env.max, nom.value, bound, perturbedLabels);
      if (!env.monotone) {
        warnings.push({
          severity: 'caution',
          code: 'ENVELOPE_CORNERS_ONLY',
          message: `"${o.name}" is not monotone in ${env.nonMonotoneInputs.join(', ')}: its envelope is from corners and axis points only, not guaranteed extremes.`,
        });
      }
    }
    for (const d of a.derived ?? []) {
      if (d.from !== o.name) continue;
      const base = nominalOf(d.name);
      if (base !== undefined && env.min !== null && env.max !== null) pushEnvelope(d.name, env.min * d.factor, env.typ * d.factor, env.max * d.factor, base.value, d.bound, activeLabels);
    }
    if (o.sensitivity) {
      for (const s of a.analysis.sensitivities[o.name] ?? []) {
        const plan = perturbed.find((p) => p.input === s.input);
        const label = plan?.label ?? s.input;
        if (s.value === null) {
          warnings.push({ severity: 'info', code: 'SENSITIVITY_UNAVAILABLE', message: `The sensitivity of ${o.name} to ${label} is unavailable${s.note !== undefined ? `: ${s.note}` : '.'}` });
          continue;
        }
        const dim = s.kind === 'relative' ? DIM.DIMENSIONLESS : DIM.PER_KELVIN;
        results.push({ name: `sensitivity of ${o.name} to ${label}`, value: q(s.value, dim), role: 'secondary', bound: 'nominal' });
        if (s.scheme !== 'central') {
          warnings.push({ severity: 'info', code: 'SENSITIVITY_ONE_SIDED', message: `The sensitivity of ${o.name} to ${label} is a one-sided difference: ${s.note ?? ''}` });
        }
      }
    }
  }

  for (const msg of a.analysis.incomplete) warnings.push({ severity: 'warning', code: 'ENVELOPE_INCOMPLETE', message: msg });
  if (a.analysis.extrapolatedCorners.length > 0) {
    warnings.push({
      severity: 'caution',
      code: 'ENVELOPE_EXTRAPOLATION',
      message: `At corner(s) ${a.analysis.extrapolatedCorners.slice(0, 6).join('; ')}${a.analysis.extrapolatedCorners.length > 6 ? '; ...' : ''} the inputs leave a validity range that the nominal point is inside: the envelope bound there is an extrapolation.`,
    });
  }
  if (a.plan.planned.length > 0 && activeLabels.length === 0) {
    warnings.push({ severity: 'info', code: 'ENVELOPE_ZERO_TOLERANCE', message: 'Every tolerance entered is zero, so the envelope is a single point equal to the nominal result.' });
  }
  warnings.push({
    severity: 'info',
    code: 'ENVELOPE_SCOPE',
    message: `The envelope is a worst-case corner range over the tolerances listed (${activeLabels.length > 0 ? activeLabels.join(', ') : 'none non-zero'}); every other input stays at its stated value. It is arithmetic, not a statistical distribution, and it is only as complete as the tolerances you supply.`,
  });

  for (const p of a.plan.planned) {
    const base = `${p.label} tolerance`;
    const detail = p.detail ?? (p.source === 'user' ? 'Tolerance entered by the user.' : undefined);
    const mk = (suffix: string, x: number): CalcInput => ({
      name: `${base} (${suffix})`,
      value: p.kind === 'relative' ? dimless(x) : q(x, DIM.TEMPERATURE_DIFFERENCE),
      source: p.source === 'fab-profile' ? 'fab-profile' : 'user',
      ...(detail !== undefined ? { sourceDetail: detail } : {}),
    });
    if (p.minus === p.plus) inputs.push(mk('+/-', p.plus));
    else {
      inputs.push(mk('-', p.minus));
      inputs.push(mk('+', p.plus));
    }
    assumptions.push(
      p.detail !== undefined ? `${p.label}: ${tolText(p)}. ${p.detail}` : `${p.label}: ${tolText(p)}, entered by the user (never defaulted).`,
    );
  }
  assumptions.push(
    `Envelope method: the calculator is re-evaluated at the nominal point, at the ${String(a.analysis.cornerCount)} corner(s) of the tolerance box (2^k for k = ${String(a.analysis.activeInputs.length)} tolerated inputs, at most 6) and along each axis; the minimum and maximum are taken over those evaluations. Outputs monotone in every tolerated input have their extremes at corners, so the range is exact for them; others are labelled corners-only. Initial tolerances only: no ageing, drift or process distribution.`,
  );

  const userLabels = a.plan.planned.filter((p) => p.source !== 'fab-profile').map((p) => p.label);
  const confidence = { ...r.confidence, reasons: [...r.confidence.reasons] };
  if (userLabels.length > 0) {
    confidence.reasons.push(`Envelope tolerances (${userLabels.join(', ')}) are user-supplied or user-selected values, not verified data; the envelope does not raise the confidence level.`);
  }

  const result: CalcResult = {
    ...r,
    inputs,
    assumptions,
    results,
    warnings,
    confidence,
    ...(r.envelope !== undefined || envelope.length > 0 ? { envelope: [...(r.envelope ?? []), ...envelope] } : {}),
  };
  return finishResult(result);
}

/** Final schema check for a result built or extended here: a malformed result is an INTERNAL error value, never returned. */
export function finishResult(out: CalcResult): CalcOutcome {
  const chk = assertCalcResult(out);
  return chk.ok ? { ok: true, value: out } : { ok: false, error: { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` } };
}

/** The fabProfile record for a result that used a profile value (age and staleness from the injected date). */
export function fabProfileRecord(profile: ParsedFabProfile, today: string): NonNullable<CalcResult['fabProfile']> {
  const ageDays = fabProfileAgeDays(profile, today);
  return {
    id: profile.id,
    fabricator: profile.fabricator,
    profileDate: profile.profileDate,
    status: dataStatusFromLedger(profile.status),
    ageDays,
    stale: fabProfileStale(profile, today),
  };
}

/** Warnings for a used profile: unverified status and staleness (same wording family as the annular-ring calculator). */
export function fabProfileWarnings(profile: ParsedFabProfile, rec: NonNullable<CalcResult['fabProfile']>): CalcWarning[] {
  const out: CalcWarning[] = [];
  if (profile.status !== 'VERIFIED') {
    out.push({
      severity: 'caution',
      code: 'FAB_PROFILE_UNVERIFIED',
      message: `The track-width tolerance comes from profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, status ${profile.status}). Fabricators change limits without notice: re-read it on the fabricator's own page before relying on it.`,
    });
  }
  if (rec.stale) out.push({ severity: 'warning', code: 'FAB_PROFILE_STALE', message: `The fab profile is ${String(rec.ageDays)} days old (more than 365): treat its figures as out of date.` });
  return out;
}

/** Validates the profile and date pair when a profile is part of the inputs. Returns an error value, never throws. */
export function checkProfileInputs(inputs: { readonly fabProfile?: unknown; readonly today?: unknown }, needed: boolean): CalcError | undefined {
  if (!needed) return undefined;
  if (inputs.fabProfile === undefined) return err('INVALID_INPUT', 'fabProfile', 'tolerances.width is "profile" but no fabProfile was supplied.');
  if (!isRec(inputs.fabProfile) || typeof inputs.fabProfile['id'] !== 'string' || !Array.isArray(inputs.fabProfile['scopedLimits'])) {
    return err('INVALID_INPUT', 'fabProfile', 'fabProfile must be a parsed fab profile (see parseFabProfile).');
  }
  if (typeof inputs.today !== 'string') return err('INVALID_INPUT', 'today', 'today (YYYY-MM-DD) must be supplied with a fab profile: the profile age is computed from it and no clock is read here.');
  try {
    fabProfileAgeDays(inputs.fabProfile as unknown as ParsedFabProfile, inputs.today);
  } catch (e) {
    return err('INVALID_INPUT', 'today', e instanceof Error ? e.message : String(e));
  }
  return undefined;
}

export interface EnvelopeRun<I extends object> {
  /** The calculator's own compute without the envelope-only properties (it is called for every perturbed point). */
  readonly compute: (inputs: I) => CalcOutcome;
  /** The base inputs without the envelope-only properties. */
  readonly base: I;
  readonly nominal: CalcResult;
  readonly plan: Plan;
  readonly outputs: readonly OutputPlan[];
  readonly derived?: readonly DerivedOutput[];
}

/**
 * Runs the analysis and applies it. An empty plan (every requested choice was unavailable) returns the nominal result with the
 * plan's warnings and no envelope; an analysis that cannot run returns the nominal result with an ENVELOPE_UNAVAILABLE warning.
 * The nominal result is never lost and never altered.
 */
export function envelopeResult<I extends object>(a: EnvelopeRun<I>): CalcOutcome {
  if (a.plan.planned.length === 0) return finishResult({ ...a.nominal, warnings: [...a.nominal.warnings, ...a.plan.warnings] });
  const an = analyse(a.compute, a.base, perturbSpecs(a.plan.planned), outputSpecs(a.outputs));
  if (!an.ok) {
    return finishResult({
      ...a.nominal,
      warnings: [
        ...a.nominal.warnings,
        ...a.plan.warnings,
        { severity: 'warning', code: 'ENVELOPE_UNAVAILABLE', message: `The tolerance envelope could not be computed: ${an.error} The nominal result is unchanged.` },
      ],
    });
  }
  return applyEnvelope({ nominal: a.nominal, analysis: an.value, plan: a.plan, outputs: a.outputs, ...(a.derived !== undefined ? { derived: a.derived } : {}) });
}
