import { dataStatusFromLedger } from '../data-status';
import { fabProfileAgeDays } from '../fab/profile';
import type { ParsedFabProfile } from '../fab/profile';
import { lookupLimit } from '../fab/scoped-limits';
import type { ScopeRequest, ScopedKey, ScopedLimit } from '../fab/scoped-limits';
import type { CalcError, CalcOutcome, CalcResult, CalcWarning, Result } from '../result';
import { DIM, q, sameDim, toUnit } from '../units';
import type { Quantity } from '../units';
import { LAYER_COUNT_INPUTS } from './annular-ring/guards';
import type { LayerCountInput } from './annular-ring/guards';
import { MAX_REL_MINUS, envelopeResult, fabProfileRecord, planTolerances, stripEnvelopeInputs } from './tolerance-shared';
import type { FieldSpec, OutputPlan, Plan, PlannedTol, TolValue } from './tolerance-shared';

/**
 * Tolerance envelope and sensitivity for the seven Phase 2 impedance calculators (core D, task 5), on top of the Phase 1
 * machinery (src/core/sensitivity.ts and tolerance-shared.ts), which is reused unchanged. The rules are the Phase 1 ones:
 *  - an absent `tolerances` object means no envelope and no sensitivity (there is NO default tolerance anywhere; the laminate
 *    er spread is the user's own entry);
 *  - each tolerance is a dimensionless fraction or {minus, plus}; a tolerance on a quantity the user did not supply (the solved
 *    unknown of a solve mode, a thickness the model does not use) is rejected;
 *  - at most 6 inputs are toleranced (2^k corners; these calculators have at most 4 toleranceable inputs);
 *  - outputs that are not monotone in some input are labelled corners-only; a corner the model rejects is reported and the bound
 *    it would set is omitted, never clamped;
 *  - the envelope does not raise the confidence; user-entered tolerances are listed as visible reasons.
 * A fab-profile tolerance is accepted only as the exact-scope scoped limit `traceWidth` or `traceSpace` of kind `tol-sym` (a length,
 * +/- on the drawn width or space), found by lookupLimit with no cross-scope fallback; otherwise the result says the tolerance is
 * not published and nothing is assumed. The published impedance tolerance has no scoped key and is not used here.
 */

export type ImpedanceTolerance = TolValue | 'profile';

/** Every tolerance key any of the seven calculators knows; a calculator rejects the keys it does not support. */
export interface ImpedanceTolerances {
  width?: ImpedanceTolerance;
  height?: ImpedanceTolerance;
  spacing?: ImpedanceTolerance;
  planeSpacing?: ImpedanceTolerance;
  edgeSpacing?: ImpedanceTolerance;
  gap?: ImpedanceTolerance;
  er?: ImpedanceTolerance;
  thickness?: ImpedanceTolerance;
  outerDiameter?: ImpedanceTolerance;
  innerDiameter?: ImpedanceTolerance;
}

/** Where on the board the traces sit: the exact scope of a fab-profile lookup. Never defaulted. */
export interface ProfileScope {
  layerCount: LayerCountInput;
  layerSide: 'inner' | 'outer';
  /** Ordered copper weight (areal mass). Needed only when the profile publishes the tolerance per copper weight. */
  copperWeight?: Quantity;
}

export interface EnvelopeInputs {
  tolerances?: ImpedanceTolerances;
  fabProfile?: ParsedFabProfile;
  /** YYYY-MM-DD, injected by the caller (no clock is read here); needed with a fab profile. */
  today?: string;
  profileScope?: ProfileScope;
}

export interface ImpField extends FieldSpec {
  /** Scoped limit key a `'profile'` tolerance on this input is looked up under; absent: this input cannot take a profile value. */
  readonly profileKey?: Extract<ScopedKey, 'traceWidth' | 'traceSpace'>;
}

export function impField(key: string, input: string, label: string, present: boolean, absentMessage: string, profileKey?: ImpField['profileKey']): ImpField {
  return { key, input, label, kind: 'relative', present, absentMessage, ...(profileKey !== undefined ? { profileKey } : {}) };
}

/** Message for a tolerance on an input that is solved for, not supplied. */
export const solvedMessage = (what: string): string => `a tolerance on ${what} is not accepted here: ${what} is the unknown of the solve (it was not supplied). Enter the geometry as an analysis, or tolerance the inputs you supplied.`;
/** Message for a tolerance on an input the selected model does not use. */
export const unusedMessage = (what: string, why: string): string => `a tolerance on ${what} is not accepted: ${why} A tolerance with no effect would only imply a model that is not there.`;

/** Result names to envelope for the models whose outputs are not constant. */
export interface SolveSpec {
  /** The target input of the solve mode (removed from the analysis base). */
  readonly target: string;
  /** Result name of the solved unknown -> input key it becomes in the analysis base. */
  readonly results: Readonly<Record<string, string>>;
}

export interface RunArgs<I extends object> {
  readonly raw: I;
  /** The calculator's own build without the envelope; `extra` are ledger ids the used tolerances rely on. */
  readonly build: (inputs: I, extra: readonly string[]) => CalcOutcome;
  readonly fields: readonly ImpField[];
  readonly outputs: readonly OutputPlan[];
  readonly solve?: SolveSpec;
}

const err = (code: CalcError['code'], field: string, message: string): CalcError => ({ code, field, message });
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const dimless = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const mmText = (si: number): string => String(Number(toUnit(q(si, DIM.LENGTH), 'mm').toPrecision(4)));

interface ProfileResolution {
  readonly tolerances: Record<string, unknown>;
  readonly resolved: ReadonlyMap<string, { readonly entry: ScopedLimit; readonly detail: string }>;
  readonly warnings: readonly CalcWarning[];
  readonly profile?: ParsedFabProfile;
  readonly today?: string;
}

function checkScope(raw: Record<string, unknown>): Result<{ scope: ScopeRequest; text: string }, CalcError> {
  const s = raw['profileScope'];
  const need = 'profileScope {layerCount, layerSide, copperWeight?} is needed with a "profile" tolerance: the exact scope (layer count, layer side, copper weight) the fabricator publishes the tolerance for; nothing is defaulted.';
  if (!isRec(s)) return { ok: false, error: err('INVALID_INPUT', 'profileScope', need) };
  if (typeof s['layerCount'] !== 'string' || !(LAYER_COUNT_INPUTS as readonly string[]).includes(s['layerCount'])) {
    return { ok: false, error: err('INVALID_INPUT', 'profileScope.layerCount', `profileScope.layerCount must be one of ${LAYER_COUNT_INPUTS.join(', ')}.`) };
  }
  if (s['layerSide'] !== 'inner' && s['layerSide'] !== 'outer') return { ok: false, error: err('INVALID_INPUT', 'profileScope.layerSide', 'profileScope.layerSide must be "inner" or "outer".') };
  let copperOz: number | undefined;
  const cw = s['copperWeight'];
  if (cw !== undefined) {
    const ok = isRec(cw) && typeof cw['si'] === 'number' && isRec(cw['dim']) && Number.isFinite(cw['si']) && cw['si'] > 0 && sameDim(cw as unknown as Quantity, q(1, DIM.AREAL_MASS));
    if (!ok) return { ok: false, error: err('INVALID_INPUT', 'profileScope.copperWeight', 'profileScope.copperWeight must be a positive copper weight (oz/ft2).') };
    copperOz = Number(toUnit(cw as unknown as Quantity, 'oz/ft2').toFixed(9));
  }
  const scope: ScopeRequest = { layerCount: s['layerCount'] as LayerCountInput, layerSide: s['layerSide'], ...(copperOz !== undefined ? { copperOz } : {}) };
  return { ok: true, value: { scope, text: `layer count ${s['layerCount']}, layer side ${s['layerSide']}, copper weight ${copperOz === undefined ? 'not given' : `${String(copperOz)} oz/ft2`}` } };
}

/** Replaces every `'profile'` tolerance by the exact-scope published value, or drops it with a "not published" warning. */
function resolveProfile(raw: Record<string, unknown>, tol: Record<string, unknown>, fields: readonly ImpField[]): Result<ProfileResolution, CalcError> {
  const keys = Object.keys(tol).filter((k) => tol[k] === 'profile' && fields.some((f) => f.key === k));
  if (keys.length === 0) return { ok: true, value: { tolerances: tol, resolved: new Map(), warnings: [] } };
  const tolerances: Record<string, unknown> = { ...tol };
  for (const k of keys) {
    const f = fields.find((x) => x.key === k) as ImpField;
    if (!f.present) return { ok: false, error: err('INVALID_INPUT', `tolerances.${k}`, f.absentMessage) };
    if (f.profileKey === undefined) return { ok: false, error: err('INVALID_INPUT', `tolerances.${k}`, `${k} cannot take a fab-profile value (only a width or a spacing has a published tolerance).`) };
  }
  const profile = raw['fabProfile'];
  if (!isRec(profile) || typeof profile['id'] !== 'string' || !Array.isArray(profile['scopedLimits'])) {
    return { ok: false, error: err('INVALID_INPUT', 'fabProfile', 'A "profile" tolerance needs a parsed fab profile (see parseFabProfile) in fabProfile.') };
  }
  const p = profile as unknown as ParsedFabProfile;
  if (typeof raw['today'] !== 'string') return { ok: false, error: err('INVALID_INPUT', 'today', 'today (YYYY-MM-DD) must be supplied with a fab profile: the profile age is computed from it and no clock is read here.') };
  const today = raw['today'];
  let age: number;
  try {
    age = fabProfileAgeDays(p, today);
  } catch (e) {
    return { ok: false, error: err('INVALID_INPUT', 'today', e instanceof Error ? e.message : String(e)) };
  }
  const sc = checkScope(raw);
  if (!sc.ok) return sc;
  const resolved = new Map<string, { entry: ScopedLimit; detail: string }>();
  const warnings: CalcWarning[] = [];
  for (const k of keys) {
    const f = fields.find((x) => x.key === k) as ImpField;
    const key = f.profileKey as 'traceWidth' | 'traceSpace';
    const x0 = (raw[f.input] as Quantity).si;
    const lookup = lookupLimit(p, key, 'tol-sym', sc.value.scope);
    delete tolerances[k];
    if (lookup.status === 'found') {
      const rel = lookup.value.si / x0;
      if (!(rel > 0) || rel > MAX_REL_MINUS) {
        warnings.push({ severity: 'caution', code: 'TOLERANCE_NOT_USABLE', message: `The published ${f.label} tolerance of profile ${p.id} (+/-${mmText(lookup.value.si)} mm) is ${String(Number((rel * 100).toPrecision(4)))} % of the ${f.label} you entered, which is not a usable relative tolerance (more than ${String(MAX_REL_MINUS * 100)} %). No ${f.label} tolerance is applied; check the units or enter your own.` });
        continue;
      }
      tolerances[k] = dimless(rel);
      resolved.set(k, {
        entry: lookup.entry,
        detail: `${f.label} tolerance +/-${mmText(lookup.value.si)} mm (+/-${String(Number((rel * 100).toPrecision(4)))} % of the ${f.label} entered) from profile ${p.id} (${p.fabricator}, dated ${p.profileDate}, ${String(age)} days old, status ${lookup.entry.status}; ledger ${lookup.entry.ledgerId}, retrieved ${lookup.entry.retrievedOn}; published wording: ${lookup.entry.quote}). Exact scope: ${sc.value.text}. UNVERIFIED example data: re-read it on the fabricator's page; no other scope was substituted.`,
      });
    } else {
      const detail = lookup.status === 'not-published' ? `The profile lists this scope and says the fabricator does not publish it (ledger ${lookup.entry.ledgerId}; published wording: ${lookup.entry.quote}).` : lookup.reason;
      warnings.push({
        severity: 'caution',
        code: 'TOLERANCE_NOT_PUBLISHED',
        message: `Tolerance not published: profile ${p.id} has no ${f.label} tolerance for ${sc.value.text}. ${detail} No ${f.label} tolerance is applied and none is assumed; enter your fabricator's value instead.`,
      });
    }
  }
  return { ok: true, value: { tolerances, resolved, warnings, profile: p, today } };
}

function patchPlan(plan: Plan, res: ProfileResolution): Plan {
  const planned: PlannedTol[] = plan.planned.map((p) => {
    const r = res.resolved.get(p.key);
    return r === undefined ? p : { ...p, source: 'fab-profile', detail: r.detail, ledgerIds: [r.entry.ledgerId] };
  });
  const ids = new Set(plan.ledgerIds);
  for (const r of res.resolved.values()) ids.add(r.entry.ledgerId);
  return { planned, warnings: [...res.warnings, ...plan.warnings], ledgerIds: [...ids], profileUsed: res.resolved.size > 0 };
}

function withProfile(nominal: CalcResult, res: ProfileResolution): CalcResult {
  const profile = res.profile;
  if (profile === undefined || res.resolved.size === 0 || res.today === undefined) return nominal;
  const rec = fabProfileRecord(profile, res.today);
  const warnings = [...nominal.warnings];
  if (profile.status !== 'VERIFIED') {
    warnings.push({ severity: 'caution', code: 'FAB_PROFILE_UNVERIFIED', message: `A tolerance comes from profile ${profile.id} (${profile.fabricator}, dated ${profile.profileDate}, status ${profile.status}). Fabricators change limits without notice: re-read it on the fabricator's own page before relying on it.` });
  }
  if (rec.stale) warnings.push({ severity: 'warning', code: 'FAB_PROFILE_STALE', message: `The fab profile is ${String(rec.ageDays)} days old (more than 365): treat its figures as out of date.` });
  const pStatus = dataStatusFromLedger(profile.status);
  return { ...nominal, fabProfile: rec, warnings, dataStatus: pStatus !== 'VERIFIED' && nominal.dataStatus === 'VERIFIED' ? pStatus : nominal.dataStatus };
}

/** Names of the loss inputs: the envelope does not analyse the loss outputs, so the perturbed evaluations leave them out. */
const LOSS_INPUT_KEYS = ['lossTangent', 'lossTangentSource', 'resistivity'] as const;

/**
 * Nominal result plus the envelope and sensitivities. In a solve mode the envelope is evaluated at the SOLVED geometry taken as
 * the drawn one (an analysis at the solved value), so the tolerances answer "what impedance range results if the solved geometry
 * is built with these tolerances"; the nominal result is the solve itself and is never altered.
 */
export function runEnvelope<I extends object>(a: RunArgs<I>): CalcOutcome {
  const raw = a.raw as unknown as Record<string, unknown>;
  const tolRaw = raw['tolerances'];
  if (!isRec(tolRaw)) return { ok: false, error: err('INVALID_INPUT', 'tolerances', 'tolerances must be an object keyed by input name.') };
  const pr = resolveProfile(raw, tolRaw, a.fields);
  if (!pr.ok) return pr;
  const planRes = planTolerances(pr.value.tolerances, a.fields, {});
  if (!planRes.ok) return planRes;
  const plan = patchPlan(planRes.value, pr.value);

  const stripped = (inputs: Record<string, unknown>): Record<string, unknown> => {
    const out = stripEnvelopeInputs(inputs);
    delete out['profileScope'];
    return out;
  };
  const nominalRes = a.build(stripped(raw) as unknown as I, plan.ledgerIds);
  if (!nominalRes.ok) return nominalRes;
  const nominal = withProfile(nominalRes.value, pr.value);

  const base = stripped(raw);
  for (const k of LOSS_INPUT_KEYS) delete base[k];
  let solvedNote: CalcWarning | undefined;
  if (a.solve !== undefined) {
    delete base[a.solve.target];
    for (const [resultName, inputKey] of Object.entries(a.solve.results)) {
      const r = nominal.results.find((x) => x.name === resultName);
      if (r !== undefined) {
        base[inputKey] = r.value;
        solvedNote = {
          severity: 'info',
          code: 'ENVELOPE_AT_SOLVED_GEOMETRY',
          message: `The envelope is evaluated at the solved geometry (${resultName}) taken as drawn; the tolerances are on the inputs you supplied, not on the solved value. The typical value equals the target to the solver's precision.`,
        };
      }
    }
  }
  const finalPlan: Plan = solvedNote === undefined ? plan : { ...plan, warnings: [...plan.warnings, solvedNote] };
  return envelopeResult({ compute: (i: I) => a.build(i, []), base: base as unknown as I, nominal, plan: finalPlan, outputs: a.outputs });
}
