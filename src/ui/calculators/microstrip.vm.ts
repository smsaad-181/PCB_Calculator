// View-model for the microstrip impedance page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/microstrip compute().
import { compute, type Inputs } from '../../core/calculators/microstrip/calc';
import { THICKNESS_MODELS, meta, type ThicknessModel } from '../../core/calculators/microstrip/meta';
import type { HashState } from '../../state/hash';
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
export type { ImpedanceView as MicrostripView };

export const CALCULATOR_ID = 'microstrip';
export const PAGE_INTRO =
  'Characteristic impedance, effective permittivity and delay of a surface microstrip (a bare trace over a reference plane, air above), or the trace width for a target impedance. Quasi-static Hammerstad-Jensen model at zero trace thickness.';

export type SolveFor = 'z0' | 'width';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type MicrostripState = {
  readonly solveFor: SolveFor;
  readonly width: string;
  readonly targetZ0: string;
  readonly height: string;
  readonly thickness: string;
  readonly er: string;
  readonly erSource: string;
  readonly geometrySource: string;
  readonly thicknessModel: ThicknessModel;
  readonly frequency: string;
  readonly length: string;
  readonly mismatch: string;
  readonly units: Units;
};

export const DEFAULT_STATE: MicrostripState = Object.freeze({
  solveFor: 'z0',
  width: '',
  targetZ0: '',
  height: '',
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

export const FIELD: Readonly<Record<'width' | 'targetZ0' | 'height' | 'thickness' | 'er' | 'erSource' | 'geometrySource' | 'frequency' | 'length' | 'mismatch', TextDef>> = {
  width: { key: 'width', label: 'Trace width w', hash: 'w', kind: 'length', echo: 'geometry' },
  targetZ0: { key: 'targetZ0', label: 'Target impedance Z0', hash: 'z', kind: 'resistance', echo: 'other' },
  height: { key: 'height', label: 'Dielectric height h (to the reference plane)', hash: 'h', kind: 'length', echo: 'thickness' },
  thickness: { key: 'thickness', label: 'Trace copper thickness t', hash: 't', kind: 'length', echo: 'thickness' },
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
  { key: 'thicknessModel', hash: 'tm', values: THICKNESS_MODELS, notice: 'The thickness model was not recognised: zero thickness (the default) is used instead.' },
];

export const SOLVE_OPTIONS: readonly { value: SolveFor; label: string }[] = [
  { value: 'z0', label: 'Impedance Z0 from the geometry (w, h)' },
  { value: 'width', label: 'Trace width from a target Z0' },
];

export interface ThicknessOption {
  readonly value: ThicknessModel;
  readonly label: string;
  /** True for a variant whose source rows disagree (ledger S-020a): the page shows the CONFLICT badge next to it. */
  readonly conflict: boolean;
}

export function thicknessOptions(): readonly ThicknessOption[] {
  return [
    { value: 'none', label: 'Zero thickness (default)', conflict: false },
    { value: 'hj-procedure-A', label: 'Hammerstad-Jensen thickness correction, procedure A (full)', conflict: true },
    { value: 'hj-procedure-B', label: 'Hammerstad-Jensen thickness correction, procedure B (simplified)', conflict: true },
  ];
}

export const THICKNESS_VARIANT_LEDGER_ID = 'S-020a';
export const THICKNESS_HELP =
  'Zero thickness is the base model and ignores t. The two Hammerstad-Jensen variants add a width correction for the trace copper; the sources disagree on it (ledger S-020a, CONFLICT), so a variant is a labelled alternative, not the verified value. A variant needs t.';

export const NEEDS: Readonly<Record<string, string>> = {
  width: 'Enter the trace width w, for example 600 um or 24 mil.',
  targetZ0: 'Enter the target characteristic impedance Z0, for example 50 ohm.',
  height: 'Enter the dielectric height h from the trace to its reference plane, for example 635 um.',
  er: "Enter the relative permittivity er from your fabricator's stackup (no default is provided).",
  erSource: 'Enter the source of er (where er came from, for example the fabricator stackup drawing); it is required.',
};

const SPEC: ImpedanceSpec<MicrostripState> = {
  id: CALCULATOR_ID,
  defaults: DEFAULT_STATE,
  text: TEXT,
  choices: CHOICES,
  active: (s) => [s.solveFor === 'width' ? 'targetZ0' : 'width', 'height', 'thickness', 'er', 'erSource', 'geometrySource', 'frequency', 'length', 'mismatch'],
  required: (s) => [s.solveFor === 'width' ? 'targetZ0' : 'width', 'height', 'er', 'erSource'],
  needs: NEEDS,
  needsExtra: (s) =>
    s.thicknessModel !== 'none' && s.thickness.trim() === ''
      ? ['The thickness variant needs the trace copper thickness t: enter it, or choose zero thickness.']
      : [],
  build: (s, get, note) => ({
    ...(s.solveFor === 'width' ? { targetZ0: get('targetZ0') } : { width: get('width') }),
    height: get('height'),
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
    height: 'height',
    er: 'er',
    thickness: 'thickness',
    thicknessModel: 'thicknessModel',
    frequency: 'frequency',
    length: 'length',
    lengthMismatch: 'mismatch',
    erSource: 'erSource',
    geometrySource: 'geometrySource',
  },
  headline: (s) => (s.solveFor === 'width' ? 'trace width for target Z0' : 'characteristic impedance Z0'),
  labels: {
    'trace width for target Z0': 'Trace width for the target Z0',
    'characteristic impedance Z0': 'Characteristic impedance Z0',
    'effective permittivity': 'Effective permittivity',
    'air-line impedance Z01': 'Air-line impedance Z01',
    'width over height w/h': 'Width over height w/h',
  },
  accuracyClass: meta.accuracyClass,
  thicknessNames: { height: 'thickness', thickness: 'thickness' },
  netClass: true,
};

export const WRITTEN_KEYS: readonly string[] = writtenKeysOf(SPEC);

export function toHashState(s: MicrostripState): Record<string, string> {
  return toHashStateOf(SPEC, s);
}

export function fromHashState(h: HashState): Loaded<MicrostripState> {
  return fromHashStateOf(SPEC, h);
}

export function computeView(s: MicrostripState): ImpedanceView {
  return computeViewOf(SPEC, s);
}

export function liveSummary(v: ImpedanceView): string {
  return liveSummaryOf(v);
}

/** Which text fields the current choices use (the page hides the others). */
export function activeFields(s: MicrostripState): readonly string[] {
  return SPEC.active(s);
}
