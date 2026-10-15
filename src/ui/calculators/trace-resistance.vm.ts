// View-model for the trace resistance page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/trace-resistance compute().
import { compute, type Inputs, type Tolerances } from '../../core/calculators/trace-resistance/calc';
import { meta } from '../../core/calculators/trace-resistance/meta';
import { DEFAULT_FOIL_CONVENTION } from '../../core/data/constants';
import { formatResult } from '../../core/format-result';
import type { CalcResult, CopperBasisKind } from '../../core/result';
import { DIM, FOIL_CONVENTIONS, type Dim, type DisplayPrefs, type FoilConvention, type Quantity } from '../../core/units';
import { CALCULATOR_STATE_KEYS, RESERVED_STATE_KEYS, type HashState } from '../../state/hash';
import { echoPrefs, headlinePrefs, conventionSpreadText, type CopperLayer, type Units } from '../components/prefs';
import { buildResultView, MAX_FIELD_CHARS, parseField, type FieldView, type ProvenanceRow, type ResultView } from '../components/view';

import { FINISHED_NEEDS, NOT_ANSWERED_NOTE, weightSourceFromHash, type WeightSource } from './copper-source';
import {
  buildToleranceView,
  collectTolerances,
  effectiveThickMode,
  thickModeFromHash,
  thickModeToHash,
  thicknessOptionsFor,
  tolFromHash,
  tolKeyOfCoreField,
  tolProblems,
  tolToHash,
  type ThicknessMode,
  type ThicknessOption,
  type TolFieldDef,
  type TolState,
  type ToleranceView,
} from './tolerance-view';
export const CALCULATOR_ID = 'trace-resistance';

export type CopperBy = 'weight' | 'thickness';
export type { Units };

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered" (or "use the default"). */
export interface TraceResistanceState {
  readonly length: string;
  readonly width: string;
  /** '' means not chosen yet. The layer is never defaulted and never written to the URL as a default. */
  readonly layer: CopperLayer | '';
  readonly copperBy: CopperBy;
  readonly copperWeight: string;
  readonly copperThickness: string;
  readonly basis: CopperBasisKind;
  /** '' means not answered. Only meaningful when a copper weight is entered. */
  readonly weightSource: WeightSource;
  /** '' means the default convention (an assumption). */
  readonly convention: FoilConvention | '';
  readonly ambient: string;
  readonly deltaT: string;
  /** User override only. Never prefilled. */
  readonly resistivity: string;
  /** User override only. Never prefilled. */
  readonly alpha: string;
  readonly frequency: string;
  readonly current: string;
  readonly units: Units;
  /** Optional input tolerances as typed, by core tolerance key. Empty means none: no tolerance is ever assumed. */
  readonly tol: TolState;
  /** '' means not chosen: there is no default thickness tolerance. */
  readonly thickMode: ThicknessMode;
}

export const DEFAULT_STATE: TraceResistanceState = Object.freeze({
  length: '',
  width: '',
  layer: '',
  copperBy: 'weight',
  copperWeight: '',
  copperThickness: '',
  basis: 'nominal',
  weightSource: '',
  convention: '',
  ambient: '',
  deltaT: '',
  resistivity: '',
  alpha: '',
  frequency: '',
  current: '',
  units: 'metric',
  tol: {},
  thickMode: '',
});

export const METHOD_TEXT = 'Method: DC resistance of a rectangular copper conductor with linear temperature dependence';

/** Defaults the calculator applies when a field is left empty. Text only; the numbers are core metadata. */
export const DEFAULT_TEXT = {
  ambient: `${String(meta.defaults.ambientC)} °C (engineering default, not from a standard)`,
} as const;

export const ADVANCED_CAUTION =
  'Leave both fields empty to use the ledger values for annealed copper (S-004). Plated copper has a different resistivity (S-012, not independently verified) and the default does not cover it: enter a value only if you can source it. Nothing here is prefilled, and a value you enter replaces the ledger value in the result.';

export const SKIN_CHECK_NAME = 'skin depth vs copper thickness';
export const SKIN_HEADING = 'DC formula is optimistic: skin depth is below half the copper thickness';
export const SKIN_HINT =
  'DC formula is optimistic: at this frequency the current crowds toward the surface, so the real resistance is higher than the DC figure shown.';
export const RANGE_HINT =
  'Outside the stated plausibility range (an engineering range, not a standard), so the result is less reliable. See the confidence reasons.';

export function hintForCheck(name: string): string | undefined {
  return name === SKIN_CHECK_NAME ? SKIN_HINT : undefined;
}

// ---------------------------------------------------------------------------
// Hash state
// ---------------------------------------------------------------------------
const LOCAL_KEYS = Object.keys(CALCULATOR_STATE_KEYS[CALCULATOR_ID]);

// ---------------------------------------------------------------------------
// Optional tolerances
// ---------------------------------------------------------------------------
const entered = (t: string): boolean => t.trim() !== '';

/** The tolerance fields for the current inputs. A field is offered only for an input the user actually supplied. */
export function toleranceFields(s: TraceResistanceState): readonly TolFieldDef[] {
  return [
    { key: 'length', hash: 'tlen', id: 'tol-length', label: 'Trace length', kind: 'relative', offered: true, help: 'Tolerance on the trace length you entered, for example 1%.' },
    { key: 'width', hash: 'twid', id: 'tol-width', label: 'Trace width', kind: 'relative', offered: true, help: 'Tolerance on the finished trace width, for example 20% from your fabricator.' },
    { key: 'copperThickness', hash: 'tthk', id: 'tol-copper', label: 'Copper thickness', kind: 'relative', offered: true, thickness: true, help: 'Tolerance on the copper thickness, for example 10%.' },
    { key: 'ambient', hash: 'tamb', id: 'tol-ambient', label: 'Ambient', kind: 'temperature', offered: entered(s.ambient), whyNot: 'enter an ambient temperature above first; the 25 °C default is an assumption and is not toleranced.', help: 'Tolerance on the ambient you entered, as a temperature difference, for example 5 K.' },
    { key: 'resistivity', hash: 'trho', id: 'tol-resistivity', label: 'Resistivity override', kind: 'relative', offered: entered(s.resistivity), whyNot: 'it needs a resistivity override (Advanced); the default copper value is a definition and is not toleranced.', help: 'Tolerance on the resistivity override you entered.' },
    { key: 'current', hash: 'tcur', id: 'tol-current', label: 'Current', kind: 'relative', offered: entered(s.current), whyNot: 'enter a current above first.', help: 'Tolerance on the current you entered, for example 5%.' },
  ];
}

export function thicknessModesOffered(s: Pick<TraceResistanceState, 'copperBy'>): readonly ThicknessOption[] {
  return thicknessOptionsFor(s.copperBy);
}

/** True when any optional tolerance state is set (the section then starts open so it is never hidden from the reader). */
export function hasToleranceState(s: TraceResistanceState): boolean {
  return Object.keys(s.tol).length > 0 || s.thickMode !== '';
}

/** Keys this page writes. Documented in CALCULATOR_STATE_KEYS (and `u`, which is reserved). */
export const WRITTEN_KEYS: readonly string[] = [...LOCAL_KEYS, 'u'];

type TextKey = 'length' | 'width' | 'copperWeight' | 'copperThickness' | 'ambient' | 'deltaT' | 'resistivity' | 'alpha' | 'frequency' | 'current';

/** Text fields and the hash key each one is stored under. */
const TEXT_HASH_KEY: Readonly<Record<TextKey, string>> = {
  length: 'l',
  width: 'w',
  copperWeight: 'cw',
  copperThickness: 'ct',
  ambient: 'am',
  deltaT: 'dt',
  resistivity: 'rho',
  alpha: 'al',
  frequency: 'f',
  current: 'i',
};
const TEXT_KEYS = Object.keys(TEXT_HASH_KEY) as TextKey[];

/** State to put in the hash. Defaults are omitted; `ly`, `rho` and `al` are only ever written from a user entry. */
export function toHashState(s: TraceResistanceState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TEXT_KEYS) if (s[k].trim() !== '') out[TEXT_HASH_KEY[k]] = s[k].slice(0, MAX_FIELD_CHARS);
  if (s.layer !== '') out['ly'] = s.layer;
  if (s.copperBy !== DEFAULT_STATE.copperBy) out['cs'] = s.copperBy;
  if (s.basis !== DEFAULT_STATE.basis) out['cb'] = s.basis;
  if (s.weightSource !== '') out['wsrc'] = s.weightSource;
  if (s.convention !== '') out['conv'] = s.convention;
  if (s.units !== DEFAULT_STATE.units) out['u'] = s.units;
  tolToHash(out, toleranceFields(DEFAULT_STATE), s.tol);
  const km = thickModeToHash(s.thickMode);
  if (km !== undefined) out['tkch'] = km;
  return out;
}

export interface LoadedState {
  readonly state: TraceResistanceState;
  /** Human-readable notices for settings that were not recognised and were replaced by defaults. */
  readonly notices: readonly string[];
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Builds a state from a parsed hash. Never throws; anything unrecognised becomes the default plus a notice. */
export function fromHashState(h: HashState): LoadedState {
  const notices: string[] = [];
  let s: TraceResistanceState = DEFAULT_STATE;
  const get = (k: string): string | undefined => (has(h, k) ? h[k] : undefined);
  const text = (k: TextKey): string => {
    const v = get(TEXT_HASH_KEY[k]);
    if (v === undefined) return '';
    if (v.length > MAX_FIELD_CHARS) {
      notices.push(`${FIELD_LABEL[k]} was too long and is empty instead.`);
      return '';
    }
    return v;
  };

  const ly = get('ly');
  if (ly !== undefined) {
    if (ly === 'outer' || ly === 'inner') s = { ...s, layer: ly };
    else notices.push('Copper layer was not recognised: no layer is chosen. Choose outer or inner.');
  }
  const cs = get('cs');
  if (cs !== undefined) {
    if (cs === 'weight' || cs === 'thickness') s = { ...s, copperBy: cs };
    else notices.push('How copper is specified (weight or thickness) was not recognised: weight is used instead.');
  }
  const cb = get('cb');
  if (cb !== undefined) {
    if (cb === 'nominal' || cb === 'finished' || cb === 'measured') s = { ...s, basis: cb };
    else notices.push('Thickness basis was not recognised: nominal is used instead.');
  }
  s = { ...s, weightSource: weightSourceFromHash(get('wsrc'), notices) };
  const conv = get('conv');
  if (conv !== undefined) {
    if (has(FOIL_CONVENTIONS, conv)) s = { ...s, convention: conv as FoilConvention };
    else notices.push(`Foil convention was not recognised: the default (${DEFAULT_FOIL_CONVENTION}) is used instead.`);
  }
  const u = get('u');
  if (u === 'metric' || u === 'imperial') {
    if (RESERVED_STATE_KEYS.u.isValid(u)) s = { ...s, units: u };
  }
  if (get('mode') !== undefined) notices.push('A method mode in the link does not apply to this calculator and was not used.');
  if (get('fc') !== undefined) {
    notices.push('A foil thickness per oz/ft² in the link is not used by this page. The foil convention is chosen in the form.');
  }
  s = {
    ...s,
    length: text('length'),
    width: text('width'),
    copperWeight: text('copperWeight'),
    copperThickness: text('copperThickness'),
    ambient: text('ambient'),
    deltaT: text('deltaT'),
    resistivity: text('resistivity'),
    alpha: text('alpha'),
    frequency: text('frequency'),
    current: text('current'),
    tol: tolFromHash(get, toleranceFields(DEFAULT_STATE), notices),
    thickMode: thickModeFromHash(get('tkch'), notices),
  };
  return { state: s, notices };
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------
export type FieldKey = TextKey | 'layer' | 'convention';
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Which quantity fields the page shows and reads. The other copper field is not read. */
export function activeFields(s: Pick<TraceResistanceState, 'copperBy'>): readonly TextKey[] {
  const copper: TextKey = s.copperBy === 'weight' ? 'copperWeight' : 'copperThickness';
  return ['length', 'width', copper, 'ambient', 'deltaT', 'resistivity', 'alpha', 'frequency', 'current'];
}

const FIELD_LABEL: Readonly<Record<FieldKey, string>> = {
  length: 'Trace length',
  width: 'Trace width',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  deltaT: 'Temperature rise',
  resistivity: 'Resistivity override',
  alpha: 'Temperature coefficient override',
  frequency: 'Frequency',
  current: 'Current',
  layer: 'Copper layer',
  convention: 'Foil convention',
};

const FIELD_DIM: Readonly<Record<TextKey, Dim>> = {
  length: DIM.LENGTH,
  width: DIM.LENGTH,
  copperWeight: DIM.AREAL_MASS,
  copperThickness: DIM.LENGTH,
  ambient: DIM.ABS_TEMPERATURE,
  deltaT: DIM.TEMPERATURE_DIFFERENCE,
  resistivity: DIM.RESISTIVITY,
  alpha: DIM.PER_KELVIN,
  frequency: DIM.FREQUENCY,
  current: DIM.CURRENT,
};

/** Expected dimension of a field (what the parser must check the typed unit against). */
export function fieldDim(k: TextKey): Dim {
  return FIELD_DIM[k];
}

function echoFor(s: TraceResistanceState, k: TextKey): DisplayPrefs {
  return echoPrefs(s.units, k === 'copperThickness' ? 'thickness' : k === 'length' || k === 'width' ? 'width' : 'other');
}

export function parseFieldOf(s: TraceResistanceState, k: TextKey): FieldView {
  return parseField(s[k], fieldDim(k), echoFor(s, k));
}

/** Core error field names to page field names. */
const CORE_FIELD: Readonly<Record<string, FieldKey>> = {
  length: 'length',
  width: 'width',
  copperWeight: 'copperWeight',
  copperThickness: 'copperThickness',
  ambient: 'ambient',
  deltaT: 'deltaT',
  resistivity: 'resistivity',
  alpha: 'alpha',
  frequency: 'frequency',
  current: 'current',
  layer: 'layer',
  convention: 'convention',
};

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------
export type TraceResistanceView =
  | { readonly status: 'needs-input'; readonly needs: readonly string[]; readonly notes: readonly string[] }
  | {
      readonly status: 'error';
      readonly problems: readonly string[];
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** Error text per tolerance key (present only when a tolerance is the problem). */
      readonly tolErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly status: 'ok';
      readonly result: ResultView;
      readonly raw: CalcResult;
      readonly fieldErrors: FieldErrors;
      readonly notes: readonly string[];
      /** Present only when tolerances were entered and the core returned something to show. */
      readonly tolerance?: ToleranceView;
      /** Present only when the skin-depth check failed: shown prominently under the headline. */
      readonly callout?: { readonly heading: string; readonly text: string };
    };

const HEADLINE = { name: 'resistance at conductor temperature', label: 'Resistance at conductor temperature' } as const;

const NEEDS_TEXT: Readonly<Partial<Record<TextKey, string>>> = {
  length: 'Enter the trace length (for example 100 mm or 4 in).',
  width: 'Enter the trace width (for example 0.254 mm or 10 mil).',
  copperWeight: 'Enter the copper weight (for example 1 oz).',
  copperThickness: 'Enter the copper thickness (for example 35 um).',
};

const RESULT_LABELS: Readonly<Record<string, string>> = {
  'resistance at 20 °C': 'Resistance at 20 °C',
  'conductor temperature': 'Conductor temperature',
  'resistivity at conductor temperature': 'Resistivity at conductor temperature',
  'cross-section area': 'Cross-section area',
  'copper thickness': 'Copper thickness',
  'skin depth': 'Skin depth',
  'voltage drop': 'Voltage drop',
  'power loss': 'Power loss',
  length: 'Trace length',
  width: 'Trace width',
  copperWeight: 'Copper weight',
  copperThickness: 'Copper thickness',
  ambient: 'Ambient temperature',
  deltaT: 'Temperature rise (supplied by you)',
  resistivity: 'Resistivity override (at 20 °C)',
  alpha: 'Temperature coefficient override',
  frequency: 'Frequency',
  current: 'Current',
};

/** Copper thickness and skin depth are micrometre-scale: they print as µm and mil, never mm. */
const THICKNESS_NAMES: Readonly<Record<string, 'thickness'>> = {
  'copper thickness': 'thickness',
  'Copper thickness': 'thickness',
  copperThickness: 'thickness',
  'skin depth': 'thickness',
  'Skin depth': 'thickness',
};

function provenance(s: TraceResistanceState): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [{ label: 'Copper layer', value: s.layer, source: 'user' }];
  rows.push(
    s.convention === ''
      ? { label: 'Foil convention', value: DEFAULT_FOIL_CONVENTION, source: 'default', detail: `conventions differ by up to ${conventionSpreadText()}` }
      : { label: 'Foil convention', value: s.convention, source: 'user' },
  );
  if (s.copperBy === 'weight') {
    rows.push(
      s.weightSource === 'foil'
        ? { label: 'Weight source', value: 'foil spec (base foil)', source: 'user' }
        : { label: 'Weight source', value: 'not answered, treated as base foil', source: 'default' },
    );
  }
  if (s.copperBy === 'thickness') rows.push({ label: 'Thickness basis', value: s.basis, source: s.basis === 'nominal' ? 'default' : 'user' });
  return rows;
}

/** One line on the copper actually used: layer, basis and thickness (through the thickness headline). */
export function copperBasisLine(raw: CalcResult, prefs: DisplayPrefs): string {
  const b = raw.copperBasis;
  if (b === undefined) return 'not stated';
  const t = formatResult({ value: b.thickness, bound: 'nominal' }, { accuracyClass: meta.accuracyClass, prefs, lengthRole: 'thickness' });
  return `${b.layer} layer, ${b.basis} basis, ${t}`;
}

/**
 * Parses the form and runs the calculator. Returns 'ok' only when the calculator returned a result.
 * Invalid or missing input yields a message naming the field, never a number.
 */
export function computeView(s: TraceResistanceState): TraceResistanceView {
  const notes: string[] = [];
  const active = activeFields(s);
  const parsed = new Map<TextKey, FieldView>();
  for (const k of active) parsed.set(k, parseFieldOf(s, k));

  const problems: string[] = [];
  const fieldErrors: FieldErrors = {};
  for (const k of active) {
    const v = parsed.get(k);
    if (v?.status === 'error') {
      problems.push(`${FIELD_LABEL[k]}: ${v.message}`);
      fieldErrors[k] = v.message;
    }
  }
  const tolFields = toleranceFields(s);
  const col = collectTolerances(tolFields, s.tol, effectiveThickMode(s.thickMode, s.copperBy), echoPrefs(s.units, 'other'));
  problems.push(...tolProblems(col.errors, tolFields));
  if (problems.length > 0) {
    return { status: 'error', problems, fieldErrors, notes, ...(Object.keys(col.errors).length > 0 ? { tolErrors: col.errors } : {}) };
  }

  if (s.copperBy === 'weight' && s.weightSource === 'finished') return { status: 'needs-input', needs: [FINISHED_NEEDS], notes };
  if (s.copperBy === 'weight' && s.weightSource === '' && parsed.get('copperWeight')?.status === 'ok') notes.push(NOT_ANSWERED_NOTE);

  const needs: string[] = [];
  for (const k of active) {
    if (parsed.get(k)?.status === 'empty' && NEEDS_TEXT[k] !== undefined) needs.push(NEEDS_TEXT[k] as string);
  }
  if (s.layer === '') needs.push('Choose a copper layer: outer or inner. It is not assumed.');
  needs.push(...col.needs);
  if (needs.length > 0) return { status: 'needs-input', needs, notes };

  const q = (k: TextKey): Quantity | undefined => {
    const v = parsed.get(k);
    return v?.status === 'ok' ? v.value : undefined;
  };
  const optional = <K extends string>(key: K, value: Quantity | undefined): Partial<Record<K, Quantity>> =>
    value === undefined ? {} : ({ [key]: value } as Record<K, Quantity>);

  const inputs = {
    layer: s.layer as CopperLayer,
    length: q('length') as Quantity,
    width: q('width') as Quantity,
    ...(s.copperBy === 'weight' ? optional('copperWeight', q('copperWeight')) : { ...optional('copperThickness', q('copperThickness')), copperBasis: s.basis }),
    ...(s.convention !== '' ? { convention: s.convention } : {}),
    ...optional('ambient', q('ambient')),
    ...optional('deltaT', q('deltaT')),
    ...optional('resistivity', q('resistivity')),
    ...optional('alpha', q('alpha')),
    ...optional('frequency', q('frequency')),
    ...optional('current', q('current')),
    ...(col.tolerances !== undefined ? { tolerances: col.tolerances as Tolerances } : {}),
  } satisfies Inputs;
  const out = compute(inputs);
  if (!out.ok) {
    const tk = tolKeyOfCoreField(out.error.field, tolFields);
    if (tk !== undefined) {
      const errors = { [tk]: out.error.message };
      return { status: 'error', problems: tolProblems(errors, tolFields), fieldErrors, notes, tolErrors: errors };
    }
    const key = CORE_FIELD[out.error.field ?? ''];
    const label = key !== undefined ? FIELD_LABEL[key] : 'Inputs';
    if (key !== undefined) fieldErrors[key] = out.error.message;
    return { status: 'error', problems: [`${label}: ${out.error.message}`], fieldErrors, notes };
  }

  const raw = out.value;
  const prefs = headlinePrefs(s.units);
  if (s.deltaT.trim() === '') {
    notes.push('No temperature rise was entered, so the conductor is taken to be at the ambient temperature (no self-heating). Enter a rise if the trace runs warm.');
  }
  const tolBuild =
    col.tolerances === undefined
      ? undefined
      : buildToleranceView(
          raw,
          {
            accuracyClass: meta.accuracyClass,
            prefs,
            labels: { ...RESULT_LABELS, [HEADLINE.name]: HEADLINE.label },
            phrases: { [HEADLINE.name]: 'resistance' },
          },
          [HEADLINE.name, 'voltage drop', 'power loss'],
        );
  const forView: CalcResult = tolBuild === undefined ? raw : { ...raw, warnings: tolBuild.warnings };
  const result = buildResultView(forView, {
    headline: HEADLINE.name,
    accuracyClass: meta.accuracyClass,
    prefs,
    lengthRole: 'geometry',
    lengthRoleByName: THICKNESS_NAMES,
    labels: { ...RESULT_LABELS, [HEADLINE.name]: HEADLINE.label },
    ...(tolBuild !== undefined ? { skip: tolBuild.skipNames } : {}),
    extraRows: [{ label: 'Copper used', text: copperBasisLine(raw, prefs) }],
    pinWarningCodes: ['SKIN_EFFECT'],
    rowWarnings: { 'voltage drop': 'VOLTAGE_DROP_SCOPE' },
    extraProvenance: provenance(s),
  });
  const skin = result.details.validity.find((c) => c.name === SKIN_CHECK_NAME);
  const callout = skin !== undefined && !skin.ok ? { heading: SKIN_HEADING, text: `The resistance above is the DC value. ${skin.detail}` } : undefined;
  const tolerance = tolBuild === undefined ? {} : { tolerance: tolBuild.view };
  return callout === undefined ? { status: 'ok', result, raw, fieldErrors, notes, ...tolerance } : { status: 'ok', result, raw, fieldErrors, notes, callout, ...tolerance };
}
