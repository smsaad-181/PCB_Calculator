// View-model for the E-series page. Pure: no DOM, no engineering math.
// The E-series library returns plain results (no CalcResult), so this page has its own small view-model and shows
// no confidence rating. Every value is printed as a catalog number through format-result.
import { ESERIES, ESERIES_SOURCE } from '../../core/data/eseries';
import { bestPairs, dropNoisePairs, nearest, nearestRatio, valuesInDecade, type Pair, type SeriesName, type Topology } from '../../core/eseries';
import type { CalcError, Result } from '../../core/result';
import { DIM, type Dim } from '../../core/units';
import type { SearchTask } from '../../workers/pair-search.protocol';
import { type HashState } from '../../state/hash';
import { stateKeyNames } from '../../state/state-keys';
import { MAX_FIELD_CHARS, parseField, parseFractionField, type FieldView } from '../components/view';
import { ALL_SERIES, LOOKUP_MODES, TOPOLOGIES, catalogRatio, catalogResistance, isSeriesName, isTopology, signedPercent } from './circuit-choices';

export const CALCULATOR_ID = 'e-series';

export interface ESeriesState {
  readonly nearestTarget: string;
  readonly nearestSeries: SeriesName;
  readonly pairTarget: string;
  readonly topology: Topology;
  readonly pairSeries: SeriesName;
}

export const DEFAULT_STATE: ESeriesState = Object.freeze({
  nearestTarget: '',
  nearestSeries: 'E24',
  pairTarget: '',
  topology: 'series',
  pairSeries: 'E24',
});

export const METHOD_TEXT = 'Method: lookup in the E-series preferred-value lists; no calculation beyond the error against your target';
export const PAIR_COUNT = 5;
/** How many pairs the search returns: more than are shown, so hiding noise pairs (PCB-12) still leaves PAIR_COUNT to list. */
export const PAIR_FETCH = 60;
/** A single value is announced when its error is no larger than this (percent, prints as 0 %) or the best pair's error. */
const SINGLE_HIT_PERCENT = 0.005;

/** The status shown above the results: the lists are ledger S-016, not yet checked against the standard. */
export const SOURCE_STATUS = ESERIES_SOURCE.status;
export const SOURCE_LEDGER_IDS: readonly string[] = [ESERIES_SOURCE.ledgerId];
export const SOURCE_ADVICE = 'These value lists have not been checked against the standard (it is paywalled), so a listed value may differ from it.';

export const SERIES_OPTIONS: readonly { readonly value: SeriesName; readonly label: string }[] = ALL_SERIES.map((name) => ({
  value: name,
  label: `${name} (${String(ESERIES[name].length)} values per decade)`,
}));
export const TOPOLOGY_OPTIONS = TOPOLOGIES;

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = stateKeyNames(CALCULATOR_ID);
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS];

export function toHashState(s: ESeriesState): Record<string, string> {
  const out: Record<string, string> = {};
  if (s.nearestTarget.trim() !== '') out['nt'] = s.nearestTarget.slice(0, MAX_FIELD_CHARS);
  if (s.nearestSeries !== DEFAULT_STATE.nearestSeries) out['ns'] = s.nearestSeries;
  if (s.pairTarget.trim() !== '') out['pt'] = s.pairTarget.slice(0, MAX_FIELD_CHARS);
  if (s.topology !== DEFAULT_STATE.topology) out['pk'] = s.topology;
  if (s.pairSeries !== DEFAULT_STATE.pairSeries) out['ps'] = s.pairSeries;
  return out;
}

export interface LoadedState {
  readonly state: ESeriesState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: ESeriesState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const ns = get('ns');
  if (ns !== undefined) {
    if (isSeriesName(ns)) s = { ...s, nearestSeries: ns };
    else notices.push(`The series for the nearest-value lookup was not recognised: ${DEFAULT_STATE.nearestSeries} is used instead.`);
  }
  const ps = get('ps');
  if (ps !== undefined) {
    if (isSeriesName(ps)) s = { ...s, pairSeries: ps };
    else notices.push(`The series for the two-resistor search was not recognised: ${DEFAULT_STATE.pairSeries} is used instead.`);
  }
  const pk = get('pk');
  if (pk !== undefined) {
    if (isTopology(pk)) s = { ...s, topology: pk };
    else notices.push('The two-resistor topology was not recognised: series is used instead.');
  }
  const text = (key: string, label: string): string => {
    const v = get(key);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${label} was too long and is empty instead.`);
      return '';
    }
    return v;
  };
  s = { ...s, nearestTarget: text('nt', 'The lookup target'), pairTarget: text('pt', 'The search target') };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Nearest-value lookup
// ---------------------------------------------------------------------------
const DIM_R: Dim = DIM.RESISTANCE;

export function parseNearestTarget(s: ESeriesState): FieldView {
  return parseField(s.nearestTarget, DIM_R);
}

export interface LookupRow {
  readonly label: string;
  readonly value: string;
  /** Signed error against your target. */
  readonly error: string;
}

export interface DecadeView {
  readonly title: string;
  readonly values: readonly { readonly text: string; readonly chosen: boolean }[];
}

export const ARITHMETIC_LABEL = 'Nearest = the smallest difference in ohms (target minus value), not the smallest ratio.';
export const RATIO_LABEL = 'Nearest by ratio (geometric neighbour)';

export type NearestView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[] }
  | {
      readonly status: 'ok';
      readonly rows: readonly LookupRow[];
      readonly decade: DecadeView;
      readonly exact: boolean;
      readonly arithmeticLabel: string;
      /** The ratio-nearest value, only when it differs from the arithmetic nearest (coarse series). */
      readonly ratio: LookupRow | undefined;
    };

export function computeNearest(s: ESeriesState): NearestView {
  const f = parseNearestTarget(s);
  if (f.status === 'empty') return { status: 'needs-input', needs: ['Enter a target resistance (for example 4k7, 2.2k or 4.7 kΩ).'] };
  if (f.status === 'error') return { status: 'error', problems: [`Target resistance: ${f.message}`] };
  const target = f.value.si;
  const rows: LookupRow[] = [];
  let nearestValue = Number.NaN;
  let decade = 0;
  for (const m of LOOKUP_MODES) {
    const r = nearest(target, s.nearestSeries, m.mode);
    if (!r.ok) return { status: 'error', problems: [`Target resistance: ${r.error.message}`] };
    if (m.mode === LOOKUP_MODES[0]?.mode) {
      nearestValue = r.value.value;
      decade = r.value.decade;
    }
    rows.push({ label: m.label, value: catalogResistance(r.value.value), error: signedPercent(r.value.errorPercent / 100) });
  }
  const list = valuesInDecade(s.nearestSeries, decade);
  const first = list[0];
  const last = list[list.length - 1];
  const decadeView: DecadeView = {
    title: `${s.nearestSeries} values from ${first === undefined ? '' : catalogResistance(first)} to ${last === undefined ? '' : catalogResistance(last)} (${String(list.length)} values in this decade)`,
    values: list.map((v) => ({ text: catalogResistance(v), chosen: v === nearestValue })),
  };
  const g = nearestRatio(target, s.nearestSeries);
  const ratio: LookupRow | undefined =
    g.ok && g.value.value !== nearestValue ? { label: RATIO_LABEL, value: catalogResistance(g.value.value), error: signedPercent(g.value.errorPercent / 100) } : undefined;
  return { status: 'ok', rows, decade: decadeView, exact: nearestValue === target, arithmeticLabel: ARITHMETIC_LABEL, ratio };
}

// ---------------------------------------------------------------------------
// Two-resistor search
// ---------------------------------------------------------------------------
export const TOPOLOGY_FORMULA: Readonly<Record<Topology, string>> = {
  series: 'R1 + R2',
  parallel: 'R1 ‖ R2 = R1 × R2 / (R1 + R2)',
  'divider-ratio': 'R2 / (R1 + R2), with R1 on top (from the source) and R2 at the bottom (to ground)',
};

/** Where the search looks. These are the library's documented default windows (three decades of the series). */
export const SEARCH_WINDOW_TEXT: Readonly<Record<Topology, string>> = {
  series: 'Both resistors are taken from three decades of the series: the decade of the target and the two below it.',
  parallel: 'Both resistors are taken from three decades of the series: the decade of the target and the two above it (a parallel pair is always below its smaller part).',
  'divider-ratio': 'Both resistors are taken from three decades of the series, 1 kΩ up to just under 1 MΩ. Only the ratio matters here, not the absolute values.',
};

export function pairTargetLabel(t: Topology): string {
  return t === 'divider-ratio' ? 'Target ratio R2 / (R1 + R2)' : t === 'series' ? 'Target series resistance' : 'Target parallel resistance';
}

export function parsePairTarget(s: ESeriesState): FieldView {
  return s.topology === 'divider-ratio' ? parseFractionField(s.pairTarget) : parseField(s.pairTarget, DIM_R);
}

export interface PairRow {
  readonly r1: string;
  readonly r2: string;
  readonly value: string;
  readonly error: string;
}

export type PairsView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[] }
  | {
      readonly status: 'ok';
      readonly rows: readonly PairRow[];
      readonly resultHeading: string;
      readonly window: string;
      /** Set when one stock value already hits the target (series and parallel only). */
      readonly single: string | undefined;
      /** Pairs not listed because one resistor has negligible effect. */
      readonly hidden: number;
      readonly hiddenText: string | undefined;
    };

function pairRow(p: Pair, t: Topology): PairRow {
  return {
    r1: catalogResistance(p.r1),
    r2: catalogResistance(p.r2),
    value: t === 'divider-ratio' ? catalogRatio(p.value) : catalogResistance(p.value),
    error: signedPercent(p.errorPercent / 100),
  };
}

/** What to do for the two-resistor search: show a view now, or run a search (in a worker) and then call finishPairs. */
export type PairsPlan =
  | { readonly kind: 'view'; readonly view: PairsView }
  | { readonly kind: 'search'; readonly task: Extract<SearchTask, { kind: 'e-pairs' }>; readonly state: ESeriesState };

export function planPairs(s: ESeriesState): PairsPlan {
  const f = parsePairTarget(s);
  if (f.status === 'empty') {
    return {
      kind: 'view',
      view: { status: 'needs-input', needs: [s.topology === 'divider-ratio' ? 'Enter a target ratio between 0 and 1 (for example 0.25 or 25%).' : 'Enter a target resistance (for example 4k7 or 4.7 kΩ).'] },
    };
  }
  if (f.status === 'error') return { kind: 'view', view: { status: 'error', problems: [`${pairTargetLabel(s.topology)}: ${f.message}`] } };
  return { kind: 'search', task: { kind: 'e-pairs', target: f.value.si, series: s.pairSeries, topology: s.topology, count: PAIR_FETCH }, state: s };
}

/** The view for a finished search (from a worker or from bestPairs on this thread). */
export function finishPairs(s: ESeriesState, r: Result<Pair[], CalcError>): PairsView {
  if (!r.ok) return { status: 'error', problems: [`${pairTargetLabel(s.topology)}: ${r.error.message}`] };
  const f = parsePairTarget(s);
  const target = f.status === 'ok' ? f.value.si : Number.NaN;
  const { kept, hidden } = dropNoisePairs(r.value, target, s.topology, PAIR_COUNT);
  let single: string | undefined;
  if (s.topology !== 'divider-ratio') {
    const first = LOOKUP_MODES[0];
    const n = first === undefined ? undefined : nearest(target, s.pairSeries, first.mode);
    const bestErr = Math.abs(r.value[0]?.errorPercent ?? 0);
    if (n?.ok === true && Math.abs(n.value.errorPercent) <= Math.max(SINGLE_HIT_PERCENT, bestErr)) {
      single = `A single ${s.pairSeries} value matches: ${catalogResistance(n.value.value)} (error ${signedPercent(n.value.errorPercent / 100)}).`;
    }
  }
  return {
    status: 'ok',
    rows: kept.map((p) => pairRow(p, s.topology)),
    resultHeading: TOPOLOGY_FORMULA[s.topology],
    window: SEARCH_WINDOW_TEXT[s.topology],
    single,
    hidden,
    hiddenText: hidden > 0 ? `${String(hidden)} pair${hidden === 1 ? '' : 's'} hidden: one resistor has negligible effect.` : undefined,
  };
}

/** Plan and search on this thread (tests, and the page's fallback when it has no worker). */
export function computePairs(s: ESeriesState): PairsView {
  const p = planPairs(s);
  return p.kind === 'view' ? p.view : finishPairs(p.state, bestPairs(p.task.target, p.task.series, p.task.topology, p.task.count));
}

export function nearestSummary(v: NearestView): string {
  switch (v.status) {
    case 'ok':
      return `Nearest-value lookup: ${v.rows.map((r) => `${r.label} ${r.value}, error ${r.error}`).join('. ')}.`;
    case 'error':
      return `Nearest-value lookup: no result. ${v.problems.join(' ')}`;
    default:
      return `Nearest-value lookup: no result yet. ${v.needs.join(' ')}`;
  }
}

export function pairsSummary(v: PairsView): string {
  switch (v.status) {
    case 'ok': {
      const best = v.rows[0];
      return `Two-resistor search: ${String(v.rows.length)} best pairs. Best is R1 ${best?.r1 ?? ''} and R2 ${best?.r2 ?? ''}, giving ${best?.value ?? ''}, error ${best?.error ?? ''}.`;
    }
    case 'error':
      return `Two-resistor search: no result. ${v.problems.join(' ')}`;
    default:
      return `Two-resistor search: no result yet. ${v.needs.join(' ')}`;
  }
}
