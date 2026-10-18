// View-model for the coaxial line impedance page. Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/coax compute().
import { compute, type Inputs } from '../../core/calculators/coax/calc';
import { meta } from '../../core/calculators/coax/meta';
import type { HashState } from '../../state/hash';
import { EXT_DEFAULTS, extFormOf, type ExtForm, tolDiameter, tolEr, type ExtState } from './impedance-ext.vm';
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
export type { ImpedanceView as CoaxView };

export const CALCULATOR_ID = 'coax';
export const PAGE_INTRO =
  'Characteristic impedance, delay and guided wavelength of an ideal coaxial line (TEM, lossless), or the outer or inner diameter for a target impedance.';

export type SolveFor = 'z0' | 'outer' | 'inner';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type CoaxState = ExtState & {
  readonly solveFor: SolveFor;
  readonly outerDiameter: string;
  readonly innerDiameter: string;
  readonly targetZ0: string;
  readonly er: string;
  readonly erSource: string;
  readonly frequency: string;
  readonly length: string;
  readonly mismatch: string;
  readonly units: Units;
};

export const DEFAULT_STATE: CoaxState = Object.freeze({
  ...EXT_DEFAULTS,
  solveFor: 'z0',
  outerDiameter: '',
  innerDiameter: '',
  targetZ0: '',
  er: '',
  erSource: '',
  frequency: '',
  length: '',
  mismatch: '',
  units: 'metric',
});

export const FIELD: Readonly<Record<'outerDiameter' | 'innerDiameter' | 'targetZ0' | 'er' | 'erSource' | 'frequency' | 'length' | 'mismatch', TextDef>> = {
  outerDiameter: { key: 'outerDiameter', label: 'Outer diameter D (inside of the shield)', hash: 'od', kind: 'length', echo: 'geometry' },
  innerDiameter: { key: 'innerDiameter', label: 'Inner diameter d (centre conductor)', hash: 'id', kind: 'length', echo: 'geometry' },
  targetZ0: { key: 'targetZ0', label: 'Target impedance Z0', hash: 'z', kind: 'resistance', echo: 'other' },
  er: { key: 'er', label: 'Relative permittivity er', hash: 'er', kind: 'number' },
  erSource: { key: 'erSource', label: 'Source of er', hash: 'es', kind: 'note' },
  frequency: { key: 'frequency', label: 'Frequency', hash: 'f', kind: 'frequency', echo: 'other' },
  length: { key: 'length', label: 'Line length', hash: 'l', kind: 'length', echo: 'geometry' },
  mismatch: { key: 'mismatch', label: 'Length mismatch', hash: 'dl', kind: 'length', echo: 'geometry' },
};

const TEXT: readonly TextDef[] = Object.values(FIELD);

const CHOICES: readonly ChoiceDef[] = [
  { key: 'solveFor', hash: 'sf', values: ['z0', 'outer', 'inner'], notice: 'The solve-for choice was not recognised: impedance from the diameters is used instead.' },
];

export const SOLVE_OPTIONS: readonly { value: SolveFor; label: string }[] = [
  { value: 'z0', label: 'Impedance Z0 from both diameters' },
  { value: 'outer', label: 'Outer diameter D from a target Z0 and the inner diameter' },
  { value: 'inner', label: 'Inner diameter d from a target Z0 and the outer diameter' },
];

export const NEEDS: Readonly<Record<string, string>> = {
  outerDiameter: 'Enter the outer diameter D (the inside diameter of the shield), for example 4 mm.',
  innerDiameter: 'Enter the inner diameter d (the centre conductor), for example 1 mm.',
  targetZ0: 'Enter the target characteristic impedance Z0, for example 50 ohm.',
  er: "Enter the relative permittivity er of the dielectric from its datasheet or your cable's specification (no default is provided).",
  erSource: 'Enter the source of er (where er came from, for example the cable datasheet); it is required.',
};

function activeKeys(s: CoaxState): readonly string[] {
  const geometry = s.solveFor === 'outer' ? ['targetZ0', 'innerDiameter'] : s.solveFor === 'inner' ? ['targetZ0', 'outerDiameter'] : ['outerDiameter', 'innerDiameter'];
  return [...geometry, 'er', 'erSource', 'frequency', 'length', 'mismatch'];
}

const SPEC: ImpedanceSpec<CoaxState> = {
  id: CALCULATOR_ID,
  defaults: DEFAULT_STATE,
  text: TEXT,
  choices: CHOICES,
  active: activeKeys,
  required: (s) => activeKeys(s).filter((k) => k !== 'frequency' && k !== 'length' && k !== 'mismatch'),
  needs: NEEDS,
  build: (s, get, note) => ({
    ...(s.solveFor === 'z0' || s.solveFor === 'inner' ? { outerDiameter: get('outerDiameter') } : {}),
    ...(s.solveFor === 'z0' || s.solveFor === 'outer' ? { innerDiameter: get('innerDiameter') } : {}),
    ...(s.solveFor === 'z0' ? {} : { targetZ0: get('targetZ0') }),
    er: get('er'),
    frequency: get('frequency'),
    length: get('length'),
    lengthMismatch: get('mismatch'),
    erSource: note('erSource'),
  }),
  compute: (i) => compute(i as unknown as Inputs),
  coreField: {
    outerDiameter: 'outerDiameter',
    innerDiameter: 'innerDiameter',
    targetZ0: 'targetZ0',
    er: 'er',
    frequency: 'frequency',
    length: 'length',
    lengthMismatch: 'mismatch',
    erSource: 'erSource',
  },
  headline: (s) => (s.solveFor === 'outer' ? 'outer diameter for target Z0' : s.solveFor === 'inner' ? 'inner diameter for target Z0' : 'characteristic impedance Z0'),
  labels: {
    'outer diameter for target Z0': 'Outer diameter D for the target Z0',
    'inner diameter for target Z0': 'Inner diameter d for the target Z0',
    'characteristic impedance Z0': 'Characteristic impedance Z0',
    'effective permittivity': 'Effective permittivity',
    'diameter ratio D/d': 'Diameter ratio D/d',
  },
  accuracyClass: meta.accuracyClass,
  thicknessNames: {},
  netClass: false,
  ext: { tol: [tolDiameter('outerDiameter', 'Outer diameter D', 'outerDiameter'), tolDiameter('innerDiameter', 'Inner diameter d', 'innerDiameter'), tolEr()] },
};

export const WRITTEN_KEYS: readonly string[] = writtenKeysOf(SPEC);

export function toHashState(s: CoaxState): Record<string, string> {
  return toHashStateOf(SPEC, s);
}

export function fromHashState(h: HashState): Loaded<CoaxState> {
  return fromHashStateOf(SPEC, h);
}

export function computeView(s: CoaxState, today?: string): ImpedanceView {
  return computeViewOf(SPEC, s, today);
}

export function liveSummary(v: ImpedanceView): string {
  return liveSummaryOf(v);
}

/** Which text fields the current choices use (the page hides the others). */
export function activeFields(s: CoaxState): readonly string[] {
  return SPEC.active(s);
}

/** The tolerance and fab-profile form model of the optional sections. */
export function extForm(s: CoaxState, today: string): ExtForm {
  return extFormOf(SPEC.ext, s, SPEC.active(s), today);
}
