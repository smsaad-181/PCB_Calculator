import { rateConfidence } from '../../confidence';
import type { DataStatus, OutOfRangeInput } from '../../confidence';
import { FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE, copperBasisFactors } from '../../data/constants';
import type { LedgerStatus } from '../../data/ledger';
import { dataStatusForLedgerIds, dataStatusFromLedger, worstDataStatus } from '../../data-status';
import { fabProfileAgeDays, fabProfileStale } from '../../fab/profile';
import { formatMargin, formatResult, formatUtilisation } from '../../format-result';
import { assertCalcResult, rankElements } from '../../result';
import type { CalcError, CalcInput, CalcOutcome, CalcResult, CalcWarning, CopperBasis, ElementKind, ElementResult } from '../../result';
import { DIM, q, toUnit } from '../../units';
import type { Quantity } from '../../units';
import { compute as computeTraceWidth } from '../trace-width/calc';
import { compute as computeVia } from '../via/calc';
import { analyse as analyseFeed } from '../voltage-drop/calc';
import type { Inputs as FeedInputs, PathAnalysis, PathElement as FeedElement, PathElementState } from '../voltage-drop/calc';
import { validate } from './guards';
import type { LayerCountInput, LoadElement, PathLoadElementKind, ReturnPath, TraceLoadElement, UserLoadElement, ViaLoadElement } from './guards';
import { meta, PATH_LOAD_DEFERRED } from './meta';
import { buildExports } from './netclass';
import { addUserSuppliedReason, userSuppliedDefault } from '../circuit-shared';
import type { ParsedFabProfile } from '../../fab/profile';

export type { LoadElement, PathLoadElementKind, ReturnPath, TraceLoadElement, UserLoadElement, ViaLoadElement } from './guards';

export interface Inputs {
  vsource: Quantity;
  /** Exactly one of the four load quantities describes the load (as in the voltage-drop calculator). */
  loadCurrent?: Quantity;
  loadPower?: Quantity;
  loadResistance?: Quantity;
  loadVoltage?: Quantity;
  /** Required, never defaulted. */
  returnPath: ReturnPath;
  elements: readonly LoadElement[];
  /** Only with returnPath 'included-in-list'. */
  returnElements?: readonly LoadElement[];
  /** Optional user budget as a dimensionless fraction (5 % = 0.05). */
  dropBudgetPercent?: Quantity;
  /** Clearance in the net-class export needs a profile, the layer count (scope) and the injected date. */
  fabProfile?: ParsedFabProfile;
  layerCount?: LayerCountInput;
  today?: string;
}

/** Where an element's current limit comes from. Only a current basis exists. */
export interface ElementLimit {
  readonly amps: number;
  readonly basis: 'current';
  readonly source: string;
  readonly userSupplied: boolean;
}

/** One element of the solved path with its limit, SI numbers. */
export interface PathLoadElementState {
  readonly id: string;
  readonly name: string;
  readonly side: 'forward' | 'return';
  readonly kind: PathLoadElementKind;
  readonly resistance: number;
  readonly drop: number;
  readonly loss: number;
  readonly dropShare: number;
  readonly limit?: ElementLimit;
  /** I / limit, present for rated elements only. */
  readonly utilisation?: number;
  /** limit - I, present for rated elements only. */
  readonly margin?: number;
}

export interface PathLoadAnalysis {
  readonly current: number;
  readonly elements: readonly PathLoadElementState[];
  /** Rated elements by utilisation, highest first (ties by id ascending). */
  readonly ranked: readonly PathLoadElementState[];
  readonly weakest?: PathLoadElementState;
  /** Elements with no limit: excluded from the ranking. */
  readonly unrated: readonly PathLoadElementState[];
  readonly feed: PathAnalysis;
}

export const UNRATED_CAUTION = 'unrated elements are excluded from the weakest-link ranking and may be the real limit';

const LEGACY_CAUTION =
  'Trace current limits are the LEGACY IPC-2221 capacity at the temperature rise you allowed (ledger S-001 and S-010, PAYWALLED, secondary sources only): a legacy curve fit, not IPC-2152 and not a substitute for it. Temperature rise alone does not prove reliability.';
const USER_LIMIT_INFO =
  'Via, connector, pad, spoke, pour-neck and cable ratings are the values you supplied, each with your source note. They carry no ledger status and are not checked: the tool derives no rating from geometry.';
const SELF_HEATING_CAUTION =
  'Self-heating is not coupled. Each resistance is evaluated at the conductor temperature you gave (default 25 °C), not at the temperature the current would raise it to, so drop and loss are understated for a heated trace; the trace limit assumes the rise you allowed. Use the self-heating calculator for the heated state.';
const DEFERRED_INFO = `Not modelled in this version: ${PATH_LOAD_DEFERRED.join('; ')}. The path is a series chain; a via ARRAY inside one via element is allowed, with ideal equal sharing.`;
const BASIS_ASSUMPTION =
  'One utilisation basis: current. utilisation = I_applied / I_allowed, margin = I_allowed - I_applied, for every rated element. A limit given as a temperature rise is converted to a current limit before ranking; an absolute-temperature limit is not accepted.';
const RECOMMENDATION =
  'Check the weakest link first, but treat it as the first place to look, not as proof that the rest of the path is adequate: list every element of the real path, give each connector, pad and via a rating from its datasheet or drawing, include the return, use finished copper from your fabricator, and run the self-heating calculator for traces that carry load. The trace limit is a legacy figure.';

const REL_TOL = 1e-9;
const OPTS_E = { accuracyClass: meta.accuracyClass } as const;
const TRACE_LIMIT_STATUS = dataStatusForLedgerIds(['S-001']);

class ElementFailure extends Error {
  constructor(readonly error: CalcError) {
    super(error.message);
  }
}
const fail = (message: string, code: CalcError['code'] = 'OUT_OF_DOMAIN', field?: string): never => {
  throw new ElementFailure({ code, ...(field !== undefined ? { field } : {}), message });
};
const positive = (n: number, what: string): number => {
  if (!Number.isFinite(n) || n <= 0) return fail(`${what} is outside the representable range for these inputs (check the units).`);
  return n;
};
const num = (x: number): string => String(Number(x.toPrecision(4)));
const copy = (x: Quantity): Quantity => q(x.si, x.dim);
const Aq = (n: number): Quantity => q(n, DIM.CURRENT);
const Fq = (n: number): Quantity => q(n, DIM.DIMENSIONLESS);
const toLedger = (d: DataStatus): LedgerStatus => (d === 'PAYWALLED' ? 'PAYWALLED-USER-MUST-VERIFY' : d);
const worstOf = (ds: readonly DataStatus[]): DataStatus => worstDataStatus(ds.map(toLedger));

const ELEMENT_KIND: Record<PathLoadElementKind, ElementKind> = {
  trace: 'trace',
  via: 'via',
  connector: 'connector',
  pad: 'pad',
  spoke: 'spoke',
  'pour-neck': 'pour-neck',
  cable: 'other',
  resistance: 'other',
};

interface Resolved {
  readonly el: LoadElement;
  readonly feed: FeedElement;
  readonly limit?: ElementLimit;
  readonly inputs: CalcInput[];
  readonly failedChecks: { name: string; detail: string }[];
  readonly warnings: CalcWarning[];
  readonly basis?: CopperBasis;
  readonly tempDefaulted: boolean;
  readonly rhoDefaulted: boolean;
  readonly userSupplied: string[];
}

const withLabel = (label: string, w: CalcWarning): CalcWarning => ({ ...w, message: `Element "${label}": ${w.message}` });

function ratingOf(e: ViaLoadElement | UserLoadElement, inputs: CalcInput[], userSupplied: string[]): ElementLimit | undefined {
  if (e.ratedCurrent === undefined || e.ratingSource === undefined) return undefined;
  inputs.push({ name: `${e.label}.ratedCurrent`, value: copy(e.ratedCurrent), source: 'user', sourceDetail: `user-supplied rating (no ledger status): ${e.ratingSource}` });
  userSupplied.push(`${e.label} rating`);
  return { amps: positive(e.ratedCurrent.si, `Rating of "${e.label}"`), basis: 'current', source: `user-supplied: ${e.ratingSource}`, userSupplied: true };
}

function resolveTrace(e: TraceLoadElement): Resolved {
  const tw = computeTraceWidth({
    mode: 'B',
    layer: e.layer,
    width: e.width,
    deltaT: e.allowedTempRise,
    ...(e.copperWeight !== undefined ? { copperWeight: e.copperWeight } : {}),
    ...(e.copperThickness !== undefined ? { copperThickness: e.copperThickness } : {}),
    ...(e.copperBasis !== undefined ? { copperBasis: e.copperBasis } : {}),
    ...(e.convention !== undefined ? { convention: e.convention } : {}),
    ...(e.conductorTemperature !== undefined ? { ambient: e.conductorTemperature } : {}),
  });
  if (!tw.ok) return fail(`Trace "${e.label}": the current limit could not be computed: ${tw.error.message}`, tw.error.code, tw.error.field);
  const cap = tw.value.results.find((r) => r.name === 'current capacity');
  if (cap === undefined || tw.value.copperBasis === undefined) return fail(`Trace "${e.label}": the trace-width calculation returned no current capacity.`);
  const dT = toUnit(e.allowedTempRise, 'ddegC');
  const warnings: CalcWarning[] = tw.value.warnings
    .filter((w) => ['OUT_OF_CHART_RANGE', 'DT_BELOW_CHART_START', 'INNER_K_CONSERVATIVE', 'INNER_CURRENT_ABOVE_17_5A'].includes(w.code ?? ''))
    .map((w) => withLabel(e.label, w));
  const feed: FeedElement = {
    kind: 'trace',
    label: e.label,
    layer: e.layer,
    length: e.length,
    width: e.width,
    ...(e.copperWeight !== undefined ? { copperWeight: e.copperWeight } : {}),
    ...(e.copperThickness !== undefined ? { copperThickness: e.copperThickness } : {}),
    ...(e.copperBasis !== undefined ? { copperBasis: e.copperBasis } : {}),
    ...(e.convention !== undefined ? { convention: e.convention } : {}),
    ...(e.conductorTemperature !== undefined ? { conductorTemperature: e.conductorTemperature } : {}),
  };
  return {
    el: e,
    feed,
    limit: {
      amps: positive(cap.value.si, `Current limit of "${e.label}"`),
      basis: 'current',
      source: `IPC-2221 legacy, ledger S-001 ${TRACE_LIMIT_STATUS}, at user dT ${num(dT)} °C (${e.layer} layer)`,
      userSupplied: false,
    },
    inputs: [{ name: `${e.label}.allowedTempRise`, value: copy(e.allowedTempRise), source: 'user' }],
    failedChecks: tw.value.validityChecks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })),
    warnings,
    basis: tw.value.copperBasis,
    tempDefaulted: e.conductorTemperature === undefined,
    rhoDefaulted: false,
    userSupplied: [],
  };
}

function resolveVia(e: ViaLoadElement): Resolved {
  const v = computeVia({
    finishedHoleDiameter: e.finishedHoleDiameter,
    platingThickness: e.platingThickness,
    barrelLength: e.barrelLength,
    count: e.count,
    ...(e.conductorTemperature !== undefined ? { conductorTemperature: e.conductorTemperature } : {}),
    ...(e.resistivity !== undefined ? { resistivity: e.resistivity } : {}),
  });
  if (!v.ok) return fail(`Via "${e.label}": ${v.error.message}`, v.error.code, v.error.field);
  const r = v.value.results.find((x) => x.name === 'resistance at conductor temperature');
  if (r === undefined) return fail(`Via "${e.label}": the via calculation returned no resistance.`);
  const inputs: CalcInput[] = [];
  const add = (name: string, x: Quantity | undefined): void => {
    if (x !== undefined) inputs.push({ name: `${e.label}.${name}`, value: copy(x), source: 'user' });
  };
  add('finishedHoleDiameter', e.finishedHoleDiameter);
  add('platingThickness', e.platingThickness);
  add('barrelLength', e.barrelLength);
  inputs.push({ name: `${e.label}.count`, value: Fq(e.count), source: 'user' });
  add('resistivity', e.resistivity);
  add('drillDiameter', e.drillDiameter);
  add('padDiameter', e.padDiameter);
  const tempDefaulted = e.conductorTemperature === undefined;
  inputs.push(
    tempDefaulted
      ? { name: `${e.label}.conductorTemperature`, value: copy(v.value.inputs.find((i) => i.name === 'conductor temperature')?.value ?? q(298.15, DIM.ABS_TEMPERATURE)), source: 'default', sourceDetail: 'Engineering default 25 °C, not from a standard.' }
      : { name: `${e.label}.conductorTemperature`, value: copy(e.conductorTemperature as Quantity), source: 'user' },
  );
  const userSupplied: string[] = [];
  const limit = ratingOf(e, inputs, userSupplied);
  const warnings = v.value.warnings
    .filter((w) => ['PLATED_RESISTIVITY', 'RESISTIVITY_OVERRIDE', 'PARALLEL_SHARING', 'PLATING_EXCEEDS_HOLE'].includes(w.code ?? ''))
    .map((w) => withLabel(e.label, w));
  if (limit !== undefined && e.count > 1) {
    warnings.push({
      severity: 'caution',
      code: 'ARRAY_RATING',
      message: `Element "${e.label}": the rating you entered is taken as the rating of the whole array of ${String(e.count)} vias. Do not multiply a single-via rating by ${String(e.count)} unless you accept ideal sharing, which real arrays do not achieve (current crowding).`,
    });
  }
  const feed: FeedElement = {
    kind: 'resistance',
    label: e.label,
    resistance: copy(r.value),
    sourceNote: `via calculator: barrel R(T) of ${String(e.count)} via(s) in parallel, plating ${num(toUnit(e.platingThickness, 'um'))} um as entered`,
  };
  return {
    el: e,
    feed,
    ...(limit !== undefined ? { limit } : {}),
    inputs,
    failedChecks: v.value.validityChecks.filter((c) => !c.ok).map((c) => ({ name: c.name, detail: c.detail })),
    warnings,
    tempDefaulted,
    rhoDefaulted: e.resistivity === undefined,
    userSupplied,
  };
}

function resolveUser(e: UserLoadElement): Resolved {
  const inputs: CalcInput[] = [];
  const userSupplied = [`${e.label} resistance`];
  const limit = ratingOf(e, inputs, userSupplied);
  return {
    el: e,
    feed: { kind: 'resistance', label: e.label, resistance: copy(e.resistance), sourceNote: e.sourceNote },
    ...(limit !== undefined ? { limit } : {}),
    inputs,
    failedChecks: [],
    warnings: [],
    tempDefaulted: false,
    rhoDefaulted: false,
    userSupplied,
  };
}

function resolve(e: LoadElement): Resolved {
  if (e.kind === 'trace') return resolveTrace(e);
  if (e.kind === 'via') return resolveVia(e);
  return resolveUser(e);
}

function build(raw: unknown): { result: CalcResult; analysis: PathLoadAnalysis } | CalcError {
  const v = validate(raw);
  if (!v.ok) return v.error;
  const inp = v.value;

  const fwd = inp.elements.map(resolve);
  const retList = inp.returnPath === 'included-in-list' ? inp.returnElements.map(resolve) : [];
  const feedInputs: FeedInputs = {
    vsource: inp.vsource,
    returnPath: inp.returnPath,
    elements: fwd.map((r) => r.feed),
    ...(inp.returnPath === 'included-in-list' ? { returnElements: retList.map((r) => r.feed) } : {}),
    ...Object.fromEntries(inp.loads.map((l) => [l.field, l.value])),
    ...(inp.dropBudget !== undefined ? { dropBudgetPercent: inp.dropBudget } : {}),
  };
  const fa = analyseFeed(feedInputs);
  if (!fa.ok) return fa.error;
  const { result: vd, analysis: feed } = fa.value;

  const specs: Resolved[] = [...fwd, ...(inp.returnPath === 'same-as-forward' ? fwd : retList)];
  if (specs.length !== feed.elements.length) return { code: 'INTERNAL', message: 'The path elements and the solved states do not line up.' };
  const I = positive(feed.current, 'Applied current');

  // Per-element state with limits.
  const states: PathLoadElementState[] = feed.elements.map((s: PathElementState, i) => {
    const sp = specs[i] as Resolved;
    const limit = sp.limit;
    return {
      id: s.id,
      name: s.name,
      side: s.side,
      kind: sp.el.kind,
      resistance: s.resistance,
      drop: s.drop,
      loss: s.loss,
      dropShare: s.dropShare,
      ...(limit !== undefined ? { limit, utilisation: I / limit.amps, margin: limit.amps - I } : {}),
    };
  });
  const elementResults: ElementResult[] = [];
  states.forEach((s) => {
    if (s.limit === undefined || s.utilisation === undefined || s.margin === undefined) return;
    elementResults.push({
      id: s.id,
      name: s.name,
      kind: ELEMENT_KIND[s.kind],
      load: Aq(I),
      limit: Aq(s.limit.amps),
      utilisation: s.utilisation,
      margin: Aq(s.margin),
      limitBasis: 'current',
      limitSource: s.limit.source,
      resistance: q(s.resistance, DIM.RESISTANCE),
      drop: q(s.drop, DIM.VOLTAGE),
      loss: q(s.loss, DIM.POWER),
    });
  });
  const ranked = rankElements(elementResults);
  const rankedStates = ranked.map((e) => states.find((s) => s.id === e.id) as PathLoadElementState);
  const unrated = states.filter((s) => s.limit === undefined);
  const top = ranked[0];
  const topState = rankedStates[0];

  const analysis: PathLoadAnalysis = { current: I, elements: states, ranked: rankedStates, ...(topState !== undefined ? { weakest: topState } : {}), unrated, feed };

  // Inputs: the feed calculator's, with via resistances replaced by the via geometry, plus per-element extras.
  const viaLabels = new Set([...inp.elements, ...inp.returnElements].filter((e) => e.kind === 'via').map((e) => e.label));
  const inputs: CalcInput[] = vd.inputs.filter((i) => ![...viaLabels].some((l) => i.name === `${l}.resistance`));
  for (const r of [...fwd, ...retList]) inputs.push(...r.inputs);

  // Net-class export.
  const allEls = [...inp.elements, ...(inp.returnPath === 'included-in-list' ? inp.returnElements : [])];
  const ex = buildExports({
    current: I,
    traces: allEls.filter((e): e is TraceLoadElement => e.kind === 'trace'),
    vias: allEls.filter((e): e is ViaLoadElement => e.kind === 'via'),
    ...(inp.fabProfile !== undefined && inp.today !== undefined ? { fabProfile: inp.fabProfile, today: inp.today } : {}),
    ...(inp.layerCount !== undefined ? { layerCount: inp.layerCount } : {}),
    accuracyClass: specs.some((s) => s.el.kind === 'trace') ? 'empirical' : 'analytical',
  });

  // Steps and results.
  const hasRated = ranked.length > 0;
  const steps: CalcResult['steps'] = [...vd.steps];
  for (const e of ranked) {
    steps.push({ label: `Current limit: ${e.name}`, expr: `I_allowed (${e.limitSource ?? ''})`, value: q(e.limit.si, e.limit.dim), bound: 'max-capacity' });
    steps.push({ label: `Utilisation: ${e.name}`, expr: 'u = I / I_allowed', value: Fq(e.utilisation), bound: 'prediction' });
  }
  steps.push(...ex.steps);
  const results: CalcResult['results'] = vd.results.map((r) => (hasRated && r.role === 'primary' ? { ...r, role: 'secondary' as const } : r));
  if (top !== undefined) results.unshift({ name: 'weakest-link utilisation', value: Fq(top.utilisation), role: 'primary', bound: 'prediction' });
  for (const e of ranked) {
    results.push(
      { name: `current limit: ${e.name}`, value: q(e.limit.si, e.limit.dim), role: 'secondary', bound: 'max-capacity' },
      { name: `utilisation: ${e.name}`, value: Fq(e.utilisation), role: 'secondary', bound: 'prediction' },
      { name: `margin: ${e.name}`, value: q(e.margin.si, e.margin.dim), role: 'secondary', bound: 'max-capacity' },
    );
  }
  for (const r of results) if (!Number.isFinite(r.value.si)) return { code: 'OUT_OF_DOMAIN', message: `Result "${r.name}" is not finite for these inputs (check the units).` };

  // Validity checks and out-of-range inputs.
  const validityChecks: CalcResult['validityChecks'] = [...vd.validityChecks];
  const outOfRange: OutOfRangeInput[] = vd.validityChecks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const labelled: { label: string; checks: { name: string; detail: string }[] }[] = [...fwd, ...retList].map((r) => ({ label: r.el.label, checks: r.failedChecks }));
  for (const { label, checks } of labelled) {
    for (const c of checks) {
      validityChecks.push({ name: `${label}: ${c.name}`, ok: false, detail: c.detail });
      outOfRange.push(`${label}: ${c.name}`);
    }
  }
  if ([...fwd, ...retList].some((r) => r.el.kind === 'trace')) {
    validityChecks.push({
      name: 'trace current limits inside the chart range of the legacy method',
      ok: [...fwd, ...retList].every((r) => r.el.kind !== 'trace' || r.failedChecks.length === 0),
      detail: 'Each trace limit is screened against the chart range reported for the legacy method (ledger S-010, paywalled, secondary source); ranges are not standards.',
    });
  }
  validityChecks.push(...ex.validityChecks);
  outOfRange.push(...ex.outOfRange);

  // Warnings.
  const warnings: CalcWarning[] = vd.warnings.filter((w) => w.code !== 'SELF_HEATING_NOT_INCLUDED' && (w.code !== 'USER_RESISTANCE' || specs.some((s) => s.el.kind !== 'trace' && s.el.kind !== 'via')));
  const hasTrace = specs.some((s) => s.el.kind === 'trace');
  if (hasTrace) warnings.push({ severity: 'caution', message: LEGACY_CAUTION, code: 'LEGACY_TRACE_LIMIT' });
  warnings.push({ severity: 'caution', message: SELF_HEATING_CAUTION, code: 'SELF_HEATING_NOT_COUPLED' });
  if (specs.some((s) => s.limit?.userSupplied === true)) warnings.push({ severity: 'info', message: USER_LIMIT_INFO, code: 'USER_RATINGS' });
  for (const r of [...fwd, ...retList]) warnings.push(...r.warnings);
  if (unrated.length > 0) {
    warnings.push({
      severity: 'caution',
      code: 'UNRATED_ELEMENTS',
      message: `${String(unrated.length)} element(s) have no current rating (${unrated.map((u) => `"${u.name}"`).join(', ')}): ${UNRATED_CAUTION}. Enter a rating from the datasheet or drawing, with its source.`,
    });
  }
  if (!hasRated) {
    warnings.push({
      severity: 'warning',
      code: 'NO_RATED_ELEMENTS',
      message: `No element has a current limit, so there is no weakest link to name. ${UNRATED_CAUTION}. The voltage drop and loss above are still calculated.`,
    });
  }
  for (const e of ranked) {
    if (e.utilisation > 1 + REL_TOL) {
      warnings.push({
        severity: 'warning',
        code: 'OVER_LIMIT',
        message: `Element "${e.name}" carries ${formatResult({ value: e.load, bound: 'prediction' }, OPTS_E)}, above its limit of ${formatResult({ value: e.limit, bound: 'max-capacity' }, OPTS_E)} (${formatUtilisation(e.utilisation)}; limit basis: ${e.limitSource ?? ''}).`,
      });
    }
  }
  warnings.push({ severity: 'info', message: DEFERRED_INFO, code: 'DEFERRED_SCOPE' });
  warnings.push(...ex.warnings);
  const stale = inp.fabProfile !== undefined && inp.today !== undefined ? fabProfileStale(inp.fabProfile, inp.today) : false;
  let fabProfile: CalcResult['fabProfile'] | undefined;
  if (inp.fabProfile !== undefined && inp.today !== undefined) {
    const p = inp.fabProfile;
    const ageDays = fabProfileAgeDays(p, inp.today);
    fabProfile = { id: p.id, fabricator: p.fabricator, profileDate: p.profileDate, status: dataStatusFromLedger(p.status), ageDays, stale };
    if (p.status !== 'VERIFIED') {
      warnings.push({ severity: 'caution', code: 'FAB_PROFILE_UNVERIFIED', message: `Fabricator figures come from profile ${p.id} (${p.fabricator}, dated ${p.profileDate}, status ${p.status}). Fabricators change limits without notice: re-read them on the fabricator's own page before relying on them.` });
    }
    if (stale) warnings.push({ severity: 'warning', code: 'FAB_PROFILE_STALE', message: `The fab profile is ${String(ageDays)} days old (more than 365): treat its figures as out of date.` });
  }

  // Assumptions.
  const assumptions: string[] = vd.assumptions.filter((a) => !a.startsWith('User-supplied resistances are used as given') || specs.some((s) => s.el.kind !== 'trace' && s.el.kind !== 'via'));
  assumptions.push(
    'The path is a series chain from the source to one load; every element carries the same current. Parallel branches and current division are not modelled in this version.',
    BASIS_ASSUMPTION,
    hasTrace
      ? 'Trace limits: legacy IPC-2221 current capacity (ledger S-001, S-010) at the temperature rise entered for each trace, with the foil convention and copper basis shown above. The rise you allow is the budget: no further derating factor is applied to the limit.'
      : 'No trace in the path: no legacy trace limit is used.',
    'Via, connector, pad, spoke, pour-neck and cable limits are only the ratings you entered with their source notes; the via calculator derives no rating, so a via without one is unrated.',
    'Utilisation compares the applied current with the limit you entered or the legacy trace figure. A utilisation below 100 % says nothing about elements with no rating, thermal coupling between elements, the environment, or the reliability of the legacy figure.',
    `Rounding: drops, losses, utilisation and required widths print rounded up; load voltage, delivered power, efficiency, current limits and margins print rounded down.`,
    ...ex.assumptions,
  );
  const sameViaLabels = inp.returnPath === 'same-as-forward' && specs.some((s) => s.el.kind === 'via');
  if (sameViaLabels) assumptions.push('With the return counted as the same as the forward path, a via is duplicated with the same rating; the rating is checked for each copy against the same current.');

  // Confidence (rule-based; the decisions are documented in meta.ts and the reasons below).
  const allResolved = [...fwd, ...retList];
  const userSupplied = [...new Set(allResolved.flatMap((r) => r.userSupplied))];
  const defaulted: string[] = [];
  if (allResolved.some((r) => r.tempDefaulted)) defaulted.push('conductor temperature (default 25 °C)');
  if (allResolved.some((r) => r.rhoDefaulted)) defaulted.push('plated copper resistivity (pure copper used; non-conservative)');
  const userDefault = userSuppliedDefault(userSupplied);
  if (userDefault !== undefined) defaulted.push(userDefault);
  const bases = new Map<string, CopperBasis>();
  for (const r of allResolved) if (r.basis !== undefined) bases.set(`${r.basis.layer}|${String(r.basis.weightOzFt2)}|${r.basis.basis}|${String(r.basis.thickness.si)}`, r.basis);
  const safety = [...new Set([...bases.values()].flatMap((b) => copperBasisFactors(b).safetyRelevantDefaults))];
  if (unrated.length > 0) {
    safety.push(`${String(unrated.length)} element(s) have no current rating (${unrated.map((u) => u.name).join(', ')}) and are excluded from the weakest-link ranking; the real limit may be one of them`);
  }
  if (stale) safety.push('the fab profile used for the export is stale');
  const ledgerIds = ['S-019', 'S-004', 'S-006'];
  if (inp.loads[0]?.field === 'loadPower') ledgerIds.push('S-019h');
  if (hasTrace) ledgerIds.push('S-003', 'S-001', 'S-010');
  if (specs.some((s) => s.el.kind === 'trace' && (s.el as TraceLoadElement).layer === 'inner')) ledgerIds.push('S-018');
  if (specs.some((s) => s.el.kind === 'via')) ledgerIds.push('S-012');
  const accuracyClass = hasTrace ? meta.accuracyClass : meta.accuracyClassNoTraceLimit;
  const dataStatus = worstOf([
    dataStatusForLedgerIds(ledgerIds, undefined, { exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE }),
    ...ex.statuses,
    ...(fabProfile !== undefined ? [fabProfile.status] : []),
  ]);
  const confidence = rateConfidence({ outOfRangeInputs: outOfRange, defaultedAssumptions: defaulted, safetyRelevantDefaults: safety, accuracyClass, dataStatus });
  addUserSuppliedReason(confidence, userSupplied);
  if (unrated.length > 0) {
    confidence.reasons.push('A path with any unrated element cannot rate high: the weakest link named here is only the weakest of the elements that have a limit.');
  }
  if (safety.some((s) => s.startsWith('Nominal copper'))) {
    confidence.reasons.push('Trace capacity and resistance both depend on copper thickness, so any difference between nominal and finished copper carries straight into the limit and the drop.');
  }

  const limitingElement = top === undefined
    ? undefined
    : {
        id: top.id,
        name: top.name,
        reason: `Highest utilisation ${formatUtilisation(top.utilisation)}: applied ${formatResult({ value: top.load, bound: 'prediction' }, OPTS_E)} against an allowed ${formatResult({ value: top.limit, bound: 'max-capacity' }, OPTS_E)}, margin ${formatMargin(top, OPTS_E)}. Limit basis: ${top.limitSource ?? ''}.${unrated.length > 0 ? ` ${String(unrated.length)} unrated element(s) are not in this ranking.` : ''}`,
      };

  const basisForResult = vd.copperBasis ?? [...bases.values()][0];
  const result: CalcResult = {
    method: meta.method,
    reference: { standard: meta.reference.standard, edition: meta.reference.edition, ledgerIds },
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
    ...(elementResults.length > 0 ? { elements: elementResults } : {}),
    ...(limitingElement !== undefined ? { limitingElement } : {}),
    ...(basisForResult !== undefined ? { copperBasis: basisForResult } : {}),
    ...(ex.exports.length > 0 ? { exports: ex.exports } : {}),
    ...(fabProfile !== undefined ? { fabProfile } : {}),
  };
  const chk = assertCalcResult(result);
  if (!chk.ok) return { code: 'INTERNAL', message: `Result failed its schema check: ${chk.error.join('; ')}` };
  return { result, analysis };
}

/** Same as compute, but also returns the typed per-element state (including unrated elements). Never throws; errors are values. */
export function analysePathLoad(inputs: Inputs): { ok: true; value: { result: CalcResult; analysis: PathLoadAnalysis } } | { ok: false; error: CalcError } {
  try {
    const out = build(inputs);
    if ('analysis' in out) return { ok: true, value: out };
    return { ok: false, error: out };
  } catch (e) {
    if (e instanceof ElementFailure) return { ok: false, error: e.error };
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: 'OUT_OF_DOMAIN', message: `Calculation could not be completed: ${message}` } };
  }
}

/** Current path and load: voltage drop, per-element current utilisation, weakest link and net-class export. Never throws; errors are values. */
export function compute(inputs: Inputs): CalcOutcome {
  const a = analysePathLoad(inputs);
  return a.ok ? { ok: true, value: a.value.result } : { ok: false, error: a.error };
}
