// View-model for the annular ring page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/annular-ring compute(). The date is handed in.
import { compute, type Inputs } from '../../core/calculators/annular-ring/calc';
import { HOLE_TYPE_INPUTS, LAYER_COUNT_INPUTS, LAYER_SIDE_INPUTS, RING_REFERENCES, type HoleType, type LayerCountInput, type LayerSideInput, type RingReference } from '../../core/calculators/annular-ring/guards';
import { meta } from '../../core/calculators/annular-ring/meta';
import { formatResult, formatStep, type HeadlineOpts } from '../../core/format-result';
import type { Bound, CalcInput, CalcResult } from '../../core/result';
import { DIM, type Dim, type DisplayPrefs, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { echoPrefs, headlinePrefs, type Units } from '../components/prefs';
import { buildResultView, ledgerView, MAX_FIELD_CHARS, parseField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';
import { BUNDLED_LABEL, bundledProfile, choiceFromHash, choiceToHash, type ProfileChoice } from './fab-profile-choice';
import { profileBanner as sharedProfileBanner, type ProfileBanner } from './fab-profile-banner';

export const CALCULATOR_ID = 'annular-ring';
export type { Units };

export type RingRefChoice = '' | RingReference;

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" (or "use the default"). */
export interface AnnularRingState {
  readonly pad: string;
  /** FINISHED hole diameter (for NPTH the hole itself). */
  readonly hole: string;
  /** '' means not chosen: the hole type is never defaulted. */
  readonly holeType: HoleType | '';
  /** '' means the default (finished hole), marked as a default. */
  readonly ringRef: RingRefChoice;
  readonly drill: string;
  readonly plating: string;
  readonly layerCount: LayerCountInput | '';
  readonly copperWeight: string;
  readonly layerSide: LayerSideInput | '';
  /** Each tolerance: empty (not included), typed text, or 'use the fab profile' (the flag). No tolerance is assumed. */
  readonly holeTol: string;
  readonly holeTolProfile: boolean;
  readonly posTol: string;
  readonly posTolProfile: boolean;
  readonly padTol: string;
  readonly padTolProfile: boolean;
  readonly minRing: string;
  readonly recRing: string;
  /** '' means not chosen: the profile is never pre-selected. */
  readonly profile: ProfileChoice;
  readonly units: Units;
}

export const DEFAULT_STATE: AnnularRingState = Object.freeze({
  pad: '',
  hole: '',
  holeType: '',
  ringRef: '',
  drill: '',
  plating: '',
  layerCount: '',
  copperWeight: '',
  layerSide: '',
  holeTol: '',
  holeTolProfile: false,
  posTol: '',
  posTolProfile: false,
  padTol: '',
  padTolProfile: false,
  minRing: '',
  recRing: '',
  profile: '',
  units: 'metric',
});

export const METHOD_TEXT = 'Method: geometry and a linear worst-case tolerance stack-up; compared with your values or a fab profile';
export const NOT_PUBLISHED_TEXT = 'ring-minimum not published for this scope: enter your fabricator value';
export const NO_PROFILE_NOTE = 'No fab profile is in use: only your values are used.';
export const PROFILE_QUESTION = 'Which fab profile do you want to use?';
export const PROFILE_HELP =
  'No default: choose one. A profile supplies limits only for the exact hole type, layer count and copper weight you give. None means only your own values are used.';
export const TOLERANCE_HELP = 'Empty leaves the term out: no tolerance is ever assumed.';
export const RANGE_HINT = 'Outside the stated range: less reliable. See the confidence reasons.';

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
export const HOLE_TYPE_OPTIONS: readonly { value: HoleType; label: string }[] = [
  { value: 'via', label: 'Via' },
  { value: 'pth', label: 'PTH (plated component hole)' },
  { value: 'npth', label: 'NPTH (non-plated)' },
];
export const RING_REF_OPTIONS: readonly { value: RingRefChoice; label: string }[] = [
  { value: '', label: 'Default: finished hole (default assumption)' },
  { value: 'finished', label: 'Finished hole (inside diameter after plating)' },
  { value: 'drill', label: 'Drill (tool diameter before plating)' },
];
export const LAYER_COUNT_OPTIONS: readonly { value: LayerCountInput | ''; label: string }[] = [
  { value: '', label: 'Not given' },
  { value: '1', label: '1 layer' },
  { value: '2', label: '2 layers' },
  { value: 'multilayer', label: 'Multilayer (4 or more)' },
];
export const LAYER_SIDE_OPTIONS: readonly { value: LayerSideInput | ''; label: string }[] = [
  { value: '', label: 'Not given' },
  { value: 'outer', label: 'Outer layer' },
  { value: 'inner', label: 'Inner layer' },
];

export function isHoleType(v: string): v is HoleType {
  return (HOLE_TYPE_INPUTS as readonly string[]).includes(v);
}
export function isRingRef(v: string): v is RingReference {
  return (RING_REFERENCES as readonly string[]).includes(v);
}
export function isLayerCount(v: string): v is LayerCountInput {
  return (LAYER_COUNT_INPUTS as readonly string[]).includes(v);
}
export function isLayerSide(v: string): v is LayerSideInput {
  return (LAYER_SIDE_INPUTS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
type TextKey = 'pad' | 'hole' | 'drill' | 'plating' | 'copperWeight' | 'holeTol' | 'posTol' | 'padTol' | 'minRing' | 'recRing';
const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = {
  pad: 'pd',
  hole: 'hd',
  drill: 'dd',
  plating: 'pl',
  copperWeight: 'cw',
  holeTol: 'th',
  posTol: 'tp',
  padTol: 'ts',
  minRing: 'mn',
  recRing: 'rc',
};
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];
const PROFILE_FLAG: Readonly<Record<'holeTol' | 'posTol' | 'padTol', 'holeTolProfile' | 'posTolProfile' | 'padTolProfile'>> = {
  holeTol: 'holeTolProfile',
  posTol: 'posTolProfile',
  padTol: 'padTolProfile',
};
const PROFILE_WORD = 'profile';
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);
/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (fp and u are reserved keys). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'fp', 'u'];

const FIELD_LABEL: Readonly<Record<TextKey, string>> = {
  pad: 'Pad diameter',
  hole: 'Finished hole diameter',
  drill: 'Drill diameter',
  plating: 'Plating thickness',
  copperWeight: 'Copper weight',
  holeTol: 'Hole size tolerance',
  posTol: 'Position tolerance',
  padTol: 'Pad size tolerance',
  minRing: 'Your minimum ring',
  recRing: 'Your recommended ring',
};

const FIELD_DIM: Readonly<Record<TextKey, Dim>> = {
  pad: DIM.LENGTH,
  hole: DIM.LENGTH,
  drill: DIM.LENGTH,
  plating: DIM.LENGTH,
  copperWeight: DIM.AREAL_MASS,
  holeTol: DIM.LENGTH,
  posTol: DIM.LENGTH,
  padTol: DIM.LENGTH,
  minRing: DIM.LENGTH,
  recRing: DIM.LENGTH,
};
export function fieldDim(k: TextKey): Dim {
  return FIELD_DIM[k];
}

export function toHashState(s: AnnularRingState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) {
    const flag = k === 'holeTol' || k === 'posTol' || k === 'padTol' ? s[PROFILE_FLAG[k]] : false;
    if (flag) out[TEXT_HASH_KEY[k]] = PROFILE_WORD;
    else if (s[k].trim() !== '' && s[k].trim().toLowerCase() !== PROFILE_WORD) out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  }
  if (s.holeType !== '') out['ht'] = s.holeType;
  if (s.ringRef !== '') out['rr'] = s.ringRef;
  if (s.layerCount !== '') out['lc'] = s.layerCount;
  if (s.layerSide !== '') out['ls'] = s.layerSide;
  const fp = choiceToHash(s.profile);
  if (fp !== undefined) out['fp'] = fp;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  return out;
}

export interface LoadedState {
  readonly state: AnnularRingState;
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: AnnularRingState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const choice = <T extends string>(key: string, ok: (v: string) => v is T, what: string, set: (v: T) => AnnularRingState): void => {
    const v = get(key);
    if (v === undefined) return;
    if (ok(v)) s = set(v);
    else notices.push(`${what} was not recognised: none is chosen.`);
  };
  choice('ht', isHoleType, 'The hole type', (v) => ({ ...s, holeType: v }));
  choice('rr', isRingRef, 'The ring reference', (v) => ({ ...s, ringRef: v }));
  choice('lc', isLayerCount, 'The layer count', (v) => ({ ...s, layerCount: v }));
  choice('ls', isLayerSide, 'The layer side', (v) => ({ ...s, layerSide: v }));
  const fp = get('fp');
  if (fp !== undefined) {
    const c = choiceFromHash(fp);
    if (c !== undefined) s = { ...s, profile: c };
    else notices.push('The fab profile in the link is not one this version knows: no profile is chosen. Choose one, or none.');
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  const patch: Record<string, string | boolean> = {};
  for (const k of TEXT_KEYS) {
    const v = get(TEXT_HASH_KEY[k]);
    if (v === undefined) continue;
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      continue;
    }
    if ((k === 'holeTol' || k === 'posTol' || k === 'padTol') && v.trim().toLowerCase() === PROFILE_WORD) patch[PROFILE_FLAG[k]] = true;
    else patch[k] = v;
  }
  s = { ...s, ...patch };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fab profile banner
// ---------------------------------------------------------------------------
export type { ProfileBanner };

/** The banner for an active profile (shown on every state of the page). Undefined when no profile is in use. */
export function profileBanner(s: Pick<AnnularRingState, 'profile'>, today: string): ProfileBanner | undefined {
  return sharedProfileBanner(s.profile, today);
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'holeType' | 'ringRef' | 'layerCount' | 'layerSide' | 'profile';
export type FieldErrors = Partial<Record<FieldKey, string>>;

function echoFor(s: AnnularRingState, k: TextKey): DisplayPrefs {
  return echoPrefs(s.units, k === 'copperWeight' ? 'other' : 'width');
}

const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  padDiameter: 'pad',
  finishedHoleDiameter: 'hole',
  drillDiameter: 'drill',
  platingThickness: 'plating',
  copperWeight: 'copperWeight',
  holeSizeTolPlus: 'holeTol',
  positionTol: 'posTol',
  padSizeTol: 'padTol',
  userMinimumRing: 'minRing',
  userRecommendedRing: 'recRing',
  holeType: 'holeType',
  ringReference: 'ringRef',
  layerCount: 'layerCount',
  layerSide: 'layerSide',
  fabProfile: 'profile',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export interface StackTerm {
  readonly label: string;
  /** The tolerance as supplied. */
  readonly tolerance: string;
  /** What it takes off the ring. */
  readonly contribution: string;
  /** "your value" or "fab profile, ledger S-019i, UNVERIFIED". */
  readonly source: string;
  readonly unverified: boolean;
}

export interface StackUp {
  readonly nominalLabel: string;
  readonly nominal: string;
  readonly terms: readonly StackTerm[];
  readonly total: string | undefined;
  readonly worstLabel: string | undefined;
  readonly worst: string | undefined;
  /** Terms that are not in the worst case (not supplied or not published). */
  readonly omitted: readonly string[];
}

export interface Statement {
  readonly code: 'MEETS_VALUE' | 'BELOW_VALUE';
  /** Text tag carrying the outcome without colour. */
  readonly tag: string;
  /** The core sentence, verbatim. */
  readonly text: string;
}

export interface Comparison {
  readonly name: string;
  readonly kind: 'ring' | 'diff';
  readonly value: string;
  readonly source: string;
  readonly unverified: boolean;
  readonly margins: readonly { readonly label: string; readonly text: string }[];
  readonly statements: readonly Statement[];
}

export interface NotPublished {
  readonly name: string;
  /** Always the exact state wording. There is no margin for it. */
  readonly text: string;
  readonly detail: string;
}

export type AnnularRingView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | { readonly status: 'error'; readonly problems: readonly string[]; readonly fieldErrors: FieldErrors; readonly notes: readonly string[] }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      readonly stackUp: StackUp;
      readonly comparisons: readonly Comparison[];
      readonly notPublished: readonly NotPublished[];
      /** BREAKOUT_POSSIBLE (critical), shown prominently under the headline instead of in the list. */
      readonly breakout: { readonly heading: string; readonly text: string } | undefined;
      /** WORST_CASE_INCOMPLETE, shown inside the stack-up section instead of in the list. */
      readonly incomplete: string | undefined;
    };

const TERMS = [
  { label: 'pad size tolerance', input: 'pad size tolerance (+/-)', title: 'Pad size tolerance (+/-), half taken' },
  { label: 'hole size tolerance', input: 'hole size tolerance (+)', title: 'Hole size tolerance (+), half taken' },
  { label: 'position tolerance', input: 'position tolerance', title: 'Position tolerance (radial), full value' },
] as const;
const TERM_PREFIX = 'Tolerance term: ';
const MARGIN_PREFIXES: readonly { prefix: string; label: string }[] = [
  { prefix: 'nominal ring margin to ', label: 'Nominal ring margin' },
  { prefix: 'worst-case ring margin to ', label: 'Worst-case ring margin' },
  { prefix: 'pad-minus-hole margin to ', label: 'Pad-minus-hole margin' },
];
const STATEMENT_TAG: Readonly<Record<'MEETS_VALUE' | 'BELOW_VALUE', string>> = { MEETS_VALUE: 'Meets this value', BELOW_VALUE: 'Is below this value' };
/** Core warning codes rendered in the comparison table instead of the generic list. */
const COMPARISON_CODES: readonly string[] = ['MEETS_VALUE', 'BELOW_VALUE'];
/** Codes moved out of the list to where they matter most. */
const MOVED_CODES: readonly string[] = [...COMPARISON_CODES, 'BREAKOUT_POSSIBLE', 'WORST_CASE_INCOMPLETE'];
export const BREAKOUT_HEADING = 'The hole can break out of the pad in the worst case';
const PIN_CODES = ['FAB_PROFILE_STALE', 'IPC6012_NOT_EVALUATED'] as const;

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'pad minus hole diameter': 'Pad minus hole diameter (a diameter difference, not an annular ring)',
};

const NEEDS = {
  pad: 'Enter the pad diameter (for example 1 mm).',
  hole: 'Enter the finished hole diameter (after plating, for example 0.6 mm).',
  holeType: 'Choose the hole type: via, PTH or NPTH (limits differ by type; none is assumed).',
  drill: 'Enter the drill diameter (a drill-referenced ring needs it).',
  profile: 'Choose a fab profile option (the example profile, or none). It is not pre-selected.',
} as const;

const LEDGER_TAIL = /ledger (S-[0-9A-Za-z]+); ([A-Z][A-Z-]*);/;

function sourceOf(input: CalcInput | undefined, fallbackStatus: string | undefined): { text: string; unverified: boolean } {
  if (input === undefined || input.source === 'user') return { text: 'your own value', unverified: false };
  const m = LEDGER_TAIL.exec(input.sourceDetail ?? '');
  const status = m?.[2] ?? fallbackStatus ?? 'UNVERIFIED';
  const unverified = status !== 'VERIFIED';
  const ledger = m?.[1] !== undefined ? `, ledger ${m[1]}` : '';
  return { text: `fab profile${ledger}, ${status}`, unverified };
}

/**
 * Parses the form and runs the calculator. `today` (YYYY-MM-DD) is handed in by the page: the core never reads a clock.
 * Returns 'ok' only when the calculator returned a result. Invalid or missing input yields a message naming the field,
 * never a number.
 */
export function computeView(s: AnnularRingState, today: string): AnnularRingView {
  const notes: string[] = [];
  const problems: string[] = [];
  const needs: string[] = [];
  const fieldErrors: FieldErrors = {};

  const parsed = new Map<TextKey, FieldView>();
  const useProfile = s.profile === 'bundled';
  const profileFlag = (k: TextKey): boolean => (k === 'holeTol' || k === 'posTol' || k === 'padTol') && s[PROFILE_FLAG[k]];
  for (const k of ['pad', 'hole', 'drill', 'plating', 'copperWeight', 'holeTol', 'posTol', 'padTol', 'minRing', 'recRing'] as const) {
    if (profileFlag(k)) continue;
    const v = parseField(s[k], fieldDim(k), echoFor(s, k));
    parsed.set(k, v);
    if (v.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  for (const k of ['holeTol', 'posTol', 'padTol'] as const) {
    if (s[PROFILE_FLAG[k]] && !useProfile) {
      const m = 'This is set to use the fab profile, but no profile is selected. Choose the profile above, or enter a value yourself.';
      problems.push(`${FIELD_LABEL[k]}: ${m}`);
      fieldErrors[k] = m;
    }
  }
  const profile = bundledProfile();
  if (useProfile && profile === null) {
    problems.push('The bundled fab profile could not be read, so no profile values are available. Choose none and enter your own values.');
    fieldErrors.profile = 'The bundled profile could not be read.';
  }
  if (problems.length > 0) return { status: 'error', problems, fieldErrors, notes };

  if (parsed.get('pad')?.status === 'empty') needs.push(NEEDS.pad);
  if (parsed.get('hole')?.status === 'empty') needs.push(NEEDS.hole);
  if (s.holeType === '') needs.push(NEEDS.holeType);
  if (s.ringRef === 'drill' && parsed.get('drill')?.status === 'empty') needs.push(NEEDS.drill);
  if (s.profile === '') needs.push(NEEDS.profile);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const qty = (k: TextKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);
  const tol = <K extends string>(key: K, k: 'holeTol' | 'posTol' | 'padTol'): Partial<Record<K, Quantity | 'profile'>> =>
    s[PROFILE_FLAG[k]] ? ({ [key]: 'profile' } as Record<K, 'profile'>) : optional(key, qty(k));

  const inputs = {
    padDiameter: qty('pad') as Quantity,
    finishedHoleDiameter: qty('hole') as Quantity,
    holeType: s.holeType as HoleType,
    ...optional('drillDiameter', qty('drill')),
    ...optional('platingThickness', qty('plating')),
    ...(s.ringRef !== '' ? { ringReference: s.ringRef } : {}),
    ...(s.layerCount !== '' ? { layerCount: s.layerCount } : {}),
    ...optional('copperWeight', qty('copperWeight')),
    ...(s.layerSide !== '' ? { layerSide: s.layerSide } : {}),
    ...tol('holeSizeTolPlus', 'holeTol'),
    ...tol('positionTol', 'posTol'),
    ...tol('padSizeTol', 'padTol'),
    ...optional('userMinimumRing', qty('minRing')),
    ...optional('userRecommendedRing', qty('recRing')),
    ...(useProfile && profile !== null ? { fabProfile: profile, today } : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined && key in FIELD_LABEL ? FIELD_LABEL[key as TextKey] : key === 'holeType' ? 'Hole type' : key === 'profile' ? 'Fab profile' : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const prefs = headlinePrefs(s.units);
  const opts: HeadlineOpts = { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'geometry' };
  const print = (value: Quantity, bound: Bound): string => formatResult({ value, bound }, opts);
  const resultByName = (name: string) => raw.results.find((r) => r.name === name);
  const inputByName = (name: string): CalcInput | undefined => raw.inputs.find((i) => i.name === name);
  const fallbackStatus = raw.fabProfile?.status;

  // Stack-up: nominal, each term with its source, total, worst case, and what is left out.
  const nominalItem = raw.results.find((r) => r.name.startsWith('nominal annular ring ('));
  const worstItem = raw.results.find((r) => r.name.startsWith('worst-case annular ring ('));
  const terms: StackTerm[] = [];
  const omitted: string[] = [];
  for (const t of TERMS) {
    const step = raw.steps.find((x) => x.label === `${TERM_PREFIX}${t.label}`);
    if (step === undefined) {
      omitted.push(t.label);
      continue;
    }
    const inp = inputByName(t.input);
    const src = sourceOf(inp, fallbackStatus);
    terms.push({
      label: t.title,
      tolerance: inp === undefined ? '' : print(inp.value, 'nominal'),
      contribution: formatStep(step, opts),
      source: src.text,
      unverified: src.unverified,
    });
  }
  const totalStep = raw.steps.find((x) => x.label === 'Tolerance stack-up total');
  const stackUp: StackUp = {
    nominalLabel: nominalItem?.name ?? 'nominal annular ring',
    nominal: nominalItem === undefined ? '' : print(nominalItem.value, nominalItem.bound),
    terms,
    total: totalStep === undefined ? undefined : formatStep(totalStep, opts),
    worstLabel: worstItem?.name,
    worst: worstItem === undefined ? undefined : print(worstItem.value, worstItem.bound),
    omitted,
  };

  // Comparisons: each requirement (profile or yours) with its margins and the core's own meets / is-below sentence.
  const requirements = raw.results.filter((r) => r.bound === 'min-requirement');
  const comparisons: Comparison[] = requirements.map((r) => {
    const inp = inputByName(r.name);
    const src = sourceOf(inp, fallbackStatus);
    const margins = MARGIN_PREFIXES.flatMap((m) => {
      const item = resultByName(`${m.prefix}${r.name}`);
      return item === undefined ? [] : [{ label: m.label, text: print(item.value, item.bound) }];
    });
    const statements = raw.warnings.flatMap((w): Statement[] => {
      if ((w.code !== 'MEETS_VALUE' && w.code !== 'BELOW_VALUE') || !w.message.includes(`the ${r.name} (`)) return [];
      return [{ code: w.code, tag: STATEMENT_TAG[w.code], text: w.message }];
    });
    return {
      name: r.name,
      kind: r.name.includes('pad-minus-hole') ? 'diff' : 'ring',
      value: print(r.value, r.bound),
      source: src.text,
      unverified: src.unverified,
      margins,
      statements,
    };
  });
  const notPublished: NotPublished[] = raw.warnings.flatMap((w): NotPublished[] => {
    if (w.code !== 'MINIMUM_NOT_PUBLISHED' && w.code !== 'MINIMUM_NOT_AVAILABLE') return [];
    const i = w.message.indexOf(':');
    return [{ name: i > 0 ? w.message.slice(0, i) : 'ring minimum', text: NOT_PUBLISHED_TEXT, detail: w.message }];
  });

  // The ring sections are shown as tables; their numbers must not also appear as generic rows.
  const skip = new Set<string>([...requirements.map((r) => r.name), 'tolerance stack-up total']);
  for (const r of raw.results) if (MARGIN_PREFIXES.some((m) => r.name.startsWith(m.prefix))) skip.add(r.name);
  const forView: CalcResult = { ...raw, warnings: raw.warnings.filter((w) => w.code === undefined || !MOVED_CODES.includes(w.code)) };
  const breakoutWarning = raw.warnings.find((w) => w.code === 'BREAKOUT_POSSIBLE');
  const breakout = breakoutWarning === undefined ? undefined : { heading: BREAKOUT_HEADING, text: breakoutWarning.message };
  const incomplete = raw.warnings.find((w) => w.code === 'WORST_CASE_INCOMPLETE')?.message;

  const extra: ProvenanceRow[] = [{ label: 'Hole type', value: s.holeType, source: 'user' }];
  if (s.layerCount !== '') extra.push({ label: 'Layer count (scope)', value: s.layerCount, source: 'user' });
  if (s.layerSide !== '') extra.push({ label: 'Layer side (scope)', value: s.layerSide, source: 'user' });
  extra.push({ label: 'Fab profile', value: useProfile ? BUNDLED_LABEL : 'none / my own values', source: 'user' });

  const headName = (worstItem ?? nominalItem ?? raw.results[0])?.name ?? '';
  const rv = buildResultView(forView, {
    headline: headName,
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    labels: RESULT_LABELS,
    skip: [...skip],
    extraProvenance: extra,
    pinWarningCodes: PIN_CODES,
  });
  // Without a profile no profile row is consulted: show only the ledger rows the numbers actually rest on.
  const ledger = useProfile ? rv.ledger : ledgerView(['S-006']);
  const result: ResultView = { ...rv, ledger };
  if (!useProfile) notes.push(NO_PROFILE_NOTE);
  return { status: 'ok', result, raw, fieldErrors, notes, stackUp, comparisons, notPublished, breakout, incomplete };
}

/** Text for the screen-reader live region. */
export function liveSummary(v: AnnularRingView): string {
  switch (v.status) {
    case 'ok':
      return `Result: ${v.result.headline.label} ${v.result.headline.text}. ${v.result.headline.meaning}. Confidence ${v.result.confidence.level}.`;
    case 'error':
      return `No result. ${v.problems.join(' ')}`;
    default:
      return `No result yet. ${v.needs.join(' ')}`;
  }
}
