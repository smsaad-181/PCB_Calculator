// View-model for the symmetric stripline impedance page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/stripline compute().
import { COHN_WIDE_DIFF, COHN_WIDE_Z0, compute, type Inputs } from '../../core/calculators/stripline/calc';
import { STRIPLINE_THICKNESS_MODELS, meta, type StriplineThicknessModel } from '../../core/calculators/stripline/meta';
import type { HashState } from '../../state/hash';
import { EXT_DEFAULTS, extFormOf, type ExtForm, tolEr, tolHeight, tolThickness, tolWidth, type ExtState } from './impedance-ext.vm';
import {
  ER_HELP,
  ER_SOURCE_HELP,
  computeViewOf,
  fromHashStateOf,
  liveSummaryOf,
  toHashStateOf,
  writtenKeysOf,
  type ChoiceDef,
  type ImpedanceSpec,
  type ImpedanceView,
  type Loaded,
  type TextDef,
  type Units,
} from './impedance.vm';

export { ER_HELP, ER_SOURCE_HELP };
export type { ImpedanceView as StriplineView };

export const CALCULATOR_ID = 'stripline';
export const PAGE_INTRO =
  'Characteristic impedance, effective permittivity and delay of a centred stripline (a trace midway between two reference planes in one homogeneous dielectric), or the strip width for a target impedance. Zero-thickness closed-form approximation.';

export type SolveFor = 'z0' | 'width';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type StriplineState = ExtState & {
  readonly solveFor: SolveFor;
  readonly width: string;
  readonly targetZ0: string;
  /** b: the plane-to-plane spacing (dielectric above + strip + dielectric below). */
  readonly spacing: string;
  readonly thickness: string;
  readonly er: string;
  readonly erSource: string;
  readonly geometrySource: string;
  readonly thicknessModel: StriplineThicknessModel;
  readonly frequency: string;
  readonly length: string;
  readonly mismatch: string;
  readonly units: Units;
};

export const DEFAULT_STATE: StriplineState = Object.freeze({
  ...EXT_DEFAULTS,
  solveFor: 'z0',
  width: '',
  targetZ0: '',
  spacing: '',
  thickness: '',
  er: '',
  erSource: '',
  geometrySource: '',
  thicknessModel: 'none',
  frequency: '',
  length: '',
  mismatch: '',
  units: 'metric',
});

export const FIELD: Readonly<Record<'width' | 'targetZ0' | 'spacing' | 'thickness' | 'er' | 'erSource' | 'geometrySource' | 'frequency' | 'length' | 'mismatch', TextDef>> = {
  width: { key: 'width', label: 'Strip width w', hash: 'w', kind: 'length', echo: 'geometry' },
  targetZ0: { key: 'targetZ0', label: 'Target impedance Z0', hash: 'z', kind: 'resistance', echo: 'other' },
  spacing: { key: 'spacing', label: 'Plane-to-plane spacing b', hash: 'b', kind: 'length', echo: 'geometry' },
  thickness: { key: 'thickness', label: 'Strip copper thickness t', hash: 't', kind: 'length', echo: 'thickness' },
  er: { key: 'er', label: 'Relative permittivity er', hash: 'er', kind: 'number' },
  erSource: { key: 'erSource', label: 'Source of er', hash: 'es', kind: 'note' },
  geometrySource: { key: 'geometrySource', label: 'Source of the geometry', hash: 'gs', kind: 'note' },
  frequency: { key: 'frequency', label: 'Frequency', hash: 'f', kind: 'frequency', echo: 'other' },
  length: { key: 'length', label: 'Line length', hash: 'l', kind: 'length', echo: 'geometry' },
  mismatch: { key: 'mismatch', label: 'Length mismatch', hash: 'dl', kind: 'length', echo: 'geometry' },
};

const TEXT: readonly TextDef[] = Object.values(FIELD);

const CHOICES: readonly ChoiceDef[] = [
  { key: 'solveFor', hash: 'sf', values: ['z0', 'width'], notice: 'The solve-for choice was not recognised: impedance from the geometry is used instead.' },
  { key: 'thicknessModel', hash: 'tm', values: STRIPLINE_THICKNESS_MODELS, notice: 'The thickness model was not recognised: zero thickness (the default) is used instead.' },
];

export const SOLVE_OPTIONS: readonly { value: SolveFor; label: string }[] = [
  { value: 'z0', label: 'Impedance Z0 from the geometry (w, b)' },
  { value: 'width', label: 'Strip width from a target Z0' },
];

export interface ThicknessOption {
  readonly value: StriplineThicknessModel;
  readonly label: string;
  /** True for a variant whose source rows disagree (ledger S-021a): the page shows the CONFLICT badge next to it. */
  readonly conflict: boolean;
}

export function thicknessOptions(): readonly ThicknessOption[] {
  return [
    { value: 'none', label: 'Zero thickness (default)', conflict: false },
    { value: 'cohn-wide', label: 'Cohn wide strip, finite thickness (wide strips only)', conflict: true },
  ];
}

export const THICKNESS_VARIANT_LEDGER_ID = 'S-021a';
export const THICKNESS_HELP =
  'Zero thickness is the base model and ignores t. The Cohn wide-strip variant accounts for the strip copper for wide strips only (w/b of 0.35 or more); the sources disagree on it (ledger S-021a, CONFLICT), so it is a labelled alternative, not the verified value. It needs t.';

export const NEEDS: Readonly<Record<string, string>> = {
  width: 'Enter the strip width w, for example 0.2 mm or 8 mil.',
  targetZ0: 'Enter the target characteristic impedance Z0, for example 50 ohm.',
  spacing: 'Enter the plane-to-plane spacing b (dielectric above and below plus the strip), for example 0.4 mm.',
  er: "Enter the relative permittivity er from your fabricator's stackup (no default is provided).",
  erSource: 'Enter the source of er (where er came from, for example the fabricator stackup drawing); it is required.',
};

const SPEC: ImpedanceSpec<StriplineState> = {
  id: CALCULATOR_ID,
  defaults: DEFAULT_STATE,
  text: TEXT,
  choices: CHOICES,
  active: (s) => [s.solveFor === 'width' ? 'targetZ0' : 'width', 'spacing', 'thickness', 'er', 'erSource', 'geometrySource', 'frequency', 'length', 'mismatch'],
  required: (s) => [s.solveFor === 'width' ? 'targetZ0' : 'width', 'spacing', 'er', 'erSource'],
  needs: NEEDS,
  needsExtra: (s) =>
    s.thicknessModel !== 'none' && s.thickness.trim() === ''
      ? ['The thickness variant needs the strip copper thickness t: enter it, or choose zero thickness.']
      : [],
  build: (s, get, note) => ({
    ...(s.solveFor === 'width' ? { targetZ0: get('targetZ0') } : { width: get('width') }),
    spacing: get('spacing'),
    er: get('er'),
    thickness: get('thickness'),
    thicknessModel: s.thicknessModel,
    frequency: get('frequency'),
    length: get('length'),
    lengthMismatch: get('mismatch'),
    erSource: note('erSource'),
    geometrySource: note('geometrySource'),
  }),
  compute: (i) => compute(i as unknown as Inputs),
  coreField: {
    width: 'width',
    targetZ0: 'targetZ0',
    spacing: 'spacing',
    er: 'er',
    thickness: 'thickness',
    thicknessModel: 'thicknessModel',
    frequency: 'frequency',
    length: 'length',
    lengthMismatch: 'mismatch',
    erSource: 'erSource',
    geometrySource: 'geometrySource',
  },
  headline: (s) => (s.solveFor === 'width' ? 'strip width for target Z0' : 'characteristic impedance Z0'),
  labels: {
    'strip width for target Z0': 'Strip width for the target Z0',
    'characteristic impedance Z0': 'Characteristic impedance Z0',
    'effective permittivity': 'Effective permittivity',
    'width over spacing w/b': 'Width over spacing w/b',
  },
  accuracyClass: meta.accuracyClass,
  thicknessNames: { thickness: 'thickness' },
  netClass: true,
  sizeInput: { name: 'spacing', label: 'b' },
  epsHandoff: true,
  conflict: { names: [COHN_WIDE_Z0, COHN_WIDE_DIFF], diff: [COHN_WIDE_DIFF] },
  ext: {
    tol: [tolWidth('Strip width w', 'width'), tolHeight('spacing', 'Plane-to-plane spacing b', 'spacing'), tolEr(), tolThickness('Strip copper thickness t', 'thickness')],
    thicknessUsed: (s) => s['thicknessModel'] !== 'none',
  },
};

export const WRITTEN_KEYS: readonly string[] = writtenKeysOf(SPEC);

export function toHashState(s: StriplineState): Record<string, string> {
  return toHashStateOf(SPEC, s);
}

export function fromHashState(h: HashState): Loaded<StriplineState> {
  return fromHashStateOf(SPEC, h);
}

export function computeView(s: StriplineState, today?: string): ImpedanceView {
  return computeViewOf(SPEC, s, today);
}

export function liveSummary(v: ImpedanceView): string {
  return liveSummaryOf(v);
}

/** Which text fields the current choices use (the page hides the others). */
export function activeFields(s: StriplineState): readonly string[] {
  return SPEC.active(s);
}

/** The tolerance and fab-profile form model of the optional sections. */
export function extForm(s: StriplineState, today: string): ExtForm {
  return extFormOf(SPEC.ext, s, SPEC.active(s), today);
}
