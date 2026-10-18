// View-model for the quarter-wave stub page (transmission line, not an antenna). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculation is src/core/calculators/quarter-wave compute(); the page reuses the shared impedance
// engine (impedance.vm.ts) for parsing, the verbatim impedance banner, error handling and result printing.
import { compute, meta, type Inputs } from '../../core/calculators/quarter-wave';
import type { HashState } from '../../state/hash';
import {
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

export type { ImpedanceView as QuarterWaveView };

export const CALCULATOR_ID = 'quarter-wave';
export const PAGE_INTRO =
  'Guided quarter-wave length of a transmission-line stub or resonator from the effective permittivity of your line, or the frequency at which a given length is a quarter wave. A transmission-line helper, not an antenna calculator.';

export type Mode = 'frequency' | 'length';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type QuarterWaveState = {
  readonly mode: Mode;
  readonly epsEff: string;
  readonly epsEffSource: string;
  readonly frequency: string;
  readonly length: string;
  readonly units: Units;
};

export const DEFAULT_STATE: QuarterWaveState = Object.freeze({ mode: 'frequency', epsEff: '', epsEffSource: '', frequency: '', length: '', units: 'metric' });

export const EPS_LABEL = 'Effective permittivity eps_eff (from your impedance result)';
export const EPS_HELP =
  'No default and no example: copy eps_eff from the result of the microstrip, stripline or other impedance page for the line you will use. It carries the accuracy and the data status of the calculation that produced it, and it is not checked here.';
export const SOURCE_HELP = 'Optional. Say where eps_eff came from, for example the calculator page and the stackup; it is echoed in the result inputs.';
export const MODE_OPTIONS: readonly { value: Mode; label: string }[] = [
  { value: 'frequency', label: 'I know the frequency: give the quarter-wave length' },
  { value: 'length', label: 'I know the length: give the quarter-wave frequency' },
];
export const MODE_NOTE = 'Give exactly one of the two; the other is the result.';
export const ANTENNA_HEADING = 'This is not an antenna length';
export const END_EFFECTS_CODE = 'END_EFFECTS_NOT_MODELLED';
export const ANTENNA_CODE = 'ANTENNA_NOT_COMPUTED';

export const FIELD: Readonly<Record<'epsEff' | 'epsEffSource' | 'frequency' | 'length', TextDef>> = {
  epsEff: { key: 'epsEff', label: EPS_LABEL, hash: 'ee', kind: 'number', what: 'effective permittivity' },
  epsEffSource: { key: 'epsEffSource', label: 'Source of eps_eff', hash: 'es', kind: 'note' },
  frequency: { key: 'frequency', label: 'Frequency', hash: 'f', kind: 'frequency', echo: 'other' },
  length: { key: 'length', label: 'Physical length of the stub', hash: 'l', kind: 'length', echo: 'geometry' },
};
const TEXT: readonly TextDef[] = Object.values(FIELD);
const CHOICES: readonly ChoiceDef[] = [
  { key: 'mode', hash: 'md', values: ['frequency', 'length'], notice: 'The mode was not recognised: the frequency mode is used instead.' },
];

export const NEEDS: Readonly<Record<string, string>> = {
  epsEff: 'Enter the effective permittivity eps_eff from your impedance result (no default is provided).',
  frequency: 'Enter the frequency, for example 5 GHz.',
  length: 'Enter the physical length of the stub, for example 8.7 mm or 340 mil.',
};

const GUIDED = 'guided quarter-wave length lambda_g/4';
const FREQ = 'quarter-wave frequency for the given length';

const SPEC: ImpedanceSpec<QuarterWaveState> = {
  id: CALCULATOR_ID,
  defaults: DEFAULT_STATE,
  text: TEXT,
  choices: CHOICES,
  active: (s) => ['epsEff', s.mode === 'length' ? 'length' : 'frequency', 'epsEffSource'],
  required: (s) => ['epsEff', s.mode === 'length' ? 'length' : 'frequency'],
  needs: NEEDS,
  build: (s, get, note) => ({
    epsEff: get('epsEff'),
    ...(s.mode === 'length' ? { length: get('length') } : { frequency: get('frequency') }),
    epsEffSource: note('epsEffSource'),
  }),
  compute: (i) => compute(i as unknown as Inputs),
  coreField: { epsEff: 'epsEff', frequency: 'frequency', length: 'length', epsEffSource: 'epsEffSource' },
  headline: (s) => (s.mode === 'length' ? FREQ : GUIDED),
  labels: {
    [GUIDED]: 'Guided quarter-wave length (lambda_g/4)',
    'guided wavelength lambda_g': 'Guided wavelength lambda_g',
    [FREQ]: 'Quarter-wave frequency for your length',
    'guided wavelength at that frequency': 'Guided wavelength at that frequency',
    'free-space quarter wavelength lambda0/4 (comparison only, not a stub or antenna length)': 'Free-space quarter wavelength lambda0/4 (comparison only, not a stub or antenna length)',
  },
  accuracyClass: meta.accuracyClass,
  thicknessNames: {},
  netClass: false,
  delayNames: [],
  pinCodes: [END_EFFECTS_CODE],
  calloutWarnings: { [ANTENNA_CODE]: ANTENNA_HEADING },
  ext: { tol: [], noLoss: true },
};

export const WRITTEN_KEYS: readonly string[] = writtenKeysOf(SPEC);

export function toHashState(s: QuarterWaveState): Record<string, string> {
  return toHashStateOf(SPEC, s);
}

export function fromHashState(h: HashState): Loaded<QuarterWaveState> {
  return fromHashStateOf(SPEC, h);
}

export function computeView(s: QuarterWaveState): ImpedanceView {
  return computeViewOf(SPEC, s);
}

export function liveSummary(v: ImpedanceView): string {
  return liveSummaryOf(v);
}

/** Which text fields the current mode uses (the page hides the other). */
export function activeFields(s: QuarterWaveState): readonly string[] {
  return SPEC.active(s);
}
