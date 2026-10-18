// Shared view-model for the two coplanar waveguide pages (CPW, CPWG). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculations are src/core/calculators/{cpw,cpwg} compute(); the per-calculator files
// (cpw.vm.ts, cpwg.vm.ts) supply only what differs: ids, labels, the core compute and the ledger row of the model.
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
import { thicknessMessage } from '../../core/calculators/cpw-shared';
import type { AccuracyClass } from '../../core/confidence';
import type { CalcOutcome } from '../../core/result';
import type { HashState } from '../../state/hash';
import type { LedgerRowBadge } from '../components/LedgerRowBadges';
import { ledgerView, type ResultView } from '../components/view';
import {
  ER_HELP,
  ER_SOURCE_HELP,
  LEDGER_ROLE,
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

export const VERIFY_LINE = 'Verify with your licensed copy / fab stackup.';
export const MODEL_STATUS_HEADING = 'Model status (source ledger)';
/** The core caution about finite thickness, as the field help: what the page does with t is what the core does. */
export const THICKNESS_HELP = `Optional and not modelled: t does not change the result; it is echoed and the calculator adds a warning. ${thicknessMessage(undefined)}`;

export type SolveMode = 'z0' | 'gap' | 'width';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type CoplanarState = {
  readonly solveFor: SolveMode;
  readonly width: string;
  readonly gap: string;
  /** Target Z0 (solve modes). */
  readonly targetZ0: string;
  readonly height: string;
  readonly thickness: string;
  readonly er: string;
  readonly erSource: string;
  readonly geometrySource: string;
  readonly frequency: string;
  readonly length: string;
  readonly mismatch: string;
  readonly units: Units;
};

export type CoplanarView = ImpedanceView;
export type FieldName = 'width' | 'gap' | 'targetZ0' | 'height' | 'thickness' | 'er' | 'erSource' | 'geometrySource' | 'frequency' | 'length' | 'mismatch';

export interface CoplanarKindDef {
  readonly id: string;
  readonly intro: string;
  readonly height: { readonly label: string; readonly help: string; readonly needs: string };
  readonly compute: (inputs: Record<string, unknown>) => CalcOutcome;
  readonly accuracyClass: AccuracyClass;
  /** The ledger row of the model (S-023 or S-023a), then S-023b: shown as the page-level model status. */
  readonly modelLedgerIds: readonly string[];
  /** The model warning shown first (MODEL_CONFLICT or MODEL_UNVERIFIED). */
  readonly modelWarningCode: string;
  /** Validity checks that are information, not a test. */
  readonly informational: readonly string[];
}

export const SOLVE_OPTIONS: readonly { value: SolveMode; label: string }[] = [
  { value: 'z0', label: 'Impedance Z0 from the geometry (W, s)' },
  { value: 'gap', label: 'Gap s for a target Z0' },
  { value: 'width', label: 'Strip width W for a target Z0' },
];

const Z0 = 'characteristic impedance Z0';
const GAP_RESULT = 'gap for target Z0';
const WIDTH_RESULT = 'trace width for target Z0';

export interface CoplanarVm {
  readonly CALCULATOR_ID: string;
  readonly PAGE_INTRO: string;
  readonly DEFAULT_STATE: CoplanarState;
  readonly FIELD: Readonly<Record<FieldName, TextDef>>;
  readonly SOLVE_OPTIONS: typeof SOLVE_OPTIONS;
  readonly NEEDS: Readonly<Record<string, string>>;
  readonly VERIFY_LINE: string;
  readonly THICKNESS_HELP: string;
  readonly HEIGHT_HELP: string;
  readonly WRITTEN_KEYS: readonly string[];
  readonly toHashState: (s: CoplanarState) => Record<string, string>;
  readonly fromHashState: (h: HashState) => Loaded<CoplanarState>;
  readonly computeView: (s: CoplanarState) => CoplanarView;
  readonly liveSummary: (v: CoplanarView) => string;
  readonly activeFields: (s: CoplanarState) => readonly FieldName[];
  readonly modelStatusRows: () => LedgerRowBadge[];
}

export function makeCoplanarVm(def: CoplanarKindDef): CoplanarVm {
  const DEFAULT_STATE: CoplanarState = Object.freeze({
    solveFor: 'z0',
    width: '',
    gap: '',
    targetZ0: '',
    height: '',
    thickness: '',
    er: '',
    erSource: '',
    geometrySource: '',
    frequency: '',
    length: '',
    mismatch: '',
    units: 'metric',
  });

  const FIELD: Readonly<Record<FieldName, TextDef>> = {
    width: { key: 'width', label: 'Centre strip width W', hash: 'w', kind: 'length', echo: 'geometry' },
    gap: { key: 'gap', label: 'Gap s between the strip and each coplanar ground', hash: 's', kind: 'length', echo: 'geometry' },
    targetZ0: { key: 'targetZ0', label: 'Target impedance Z0', hash: 'z', kind: 'resistance', echo: 'other' },
    height: { key: 'height', label: def.height.label, hash: 'h', kind: 'length', echo: 'thickness' },
    thickness: { key: 'thickness', label: 'Copper thickness t (not modelled)', hash: 't', kind: 'length', echo: 'thickness' },
    er: { key: 'er', label: 'Relative permittivity er', hash: 'er', kind: 'number' },
    erSource: { key: 'erSource', label: 'Source of er', hash: 'es', kind: 'note' },
    geometrySource: { key: 'geometrySource', label: 'Source of the geometry', hash: 'gs', kind: 'note' },
    frequency: { key: 'frequency', label: 'Frequency', hash: 'f', kind: 'frequency', echo: 'other' },
    length: { key: 'length', label: 'Line length', hash: 'l', kind: 'length', echo: 'geometry' },
    mismatch: { key: 'mismatch', label: 'Length mismatch', hash: 'dl', kind: 'length', echo: 'geometry' },
  };
  const TEXT: readonly TextDef[] = Object.values(FIELD);

  const CHOICES: readonly ChoiceDef[] = [
    { key: 'solveFor', hash: 'sf', values: ['z0', 'gap', 'width'], notice: 'The solve-for choice was not recognised: impedance from the geometry is used instead.' },
  ];

  const NEEDS: Readonly<Record<string, string>> = {
    width: 'Enter the centre strip width W, for example 500 um or 20 mil.',
    gap: 'Enter the gap s between the strip and each coplanar ground, for example 200 um or 8 mil.',
    targetZ0: 'Enter the target characteristic impedance Z0, for example 50 ohm.',
    height: def.height.needs,
    er: "Enter the relative permittivity er from your fabricator's stackup (no default is provided).",
    erSource: 'Enter the source of er (where er came from, for example the fabricator stackup drawing); it is required.',
  };

  const modeKeys = (mode: SolveMode): readonly FieldName[] => (mode === 'gap' ? ['targetZ0', 'width'] : mode === 'width' ? ['targetZ0', 'gap'] : ['width', 'gap']);
  const ACTIVE_TAIL: readonly FieldName[] = ['height', 'thickness', 'er', 'erSource', 'geometrySource', 'frequency', 'length', 'mismatch'];

  const modelRow = (r: ResultView, label: string): string => r.details.inputs.find((i) => i.label === label)?.value ?? '';
  const netClassText = (r: ResultView, s: Record<string, string>): string | undefined => {
    const mode = s['solveFor'];
    if (mode !== 'gap' && mode !== 'width') return undefined;
    const width = mode === 'width' ? r.headline.text : modelRow(r, 'Width');
    const gap = mode === 'gap' ? r.headline.text : modelRow(r, 'Gap');
    const status = r.ledger.entries.filter((e) => e.status !== 'VERIFIED').map((e) => `${e.id} ${e.status}`);
    return [
      'Coplanar waveguide (starting value for a net class)',
      `Strip width: ${width}`,
      `Gap to each coplanar ground (clearance): ${gap}`,
      `Target Z0: ${modelRow(r, 'Target Z0')}`,
      `Starting value for a net class, not a design rule. ${IMPEDANCE_BANNER}`,
      `Model status: ${status.join('; ')}. ${VERIFY_LINE}`,
    ].join('\n');
  };

  const SPEC: ImpedanceSpec<CoplanarState> = {
    id: def.id,
    defaults: DEFAULT_STATE,
    text: TEXT,
    choices: CHOICES,
    active: (s) => [...modeKeys(s.solveFor), ...ACTIVE_TAIL],
    required: (s) => [...modeKeys(s.solveFor), 'height', 'er', 'erSource'],
    needs: NEEDS,
    build: (s, get, note) => ({
      ...(s.solveFor === 'z0' ? { width: get('width'), gap: get('gap') } : s.solveFor === 'gap' ? { targetZ0: get('targetZ0'), width: get('width') } : { targetZ0: get('targetZ0'), gap: get('gap') }),
      height: get('height'),
      er: get('er'),
      thickness: get('thickness'),
      frequency: get('frequency'),
      length: get('length'),
      lengthMismatch: get('mismatch'),
      erSource: note('erSource'),
      geometrySource: note('geometrySource'),
    }),
    compute: def.compute,
    coreField: {
      width: 'width',
      gap: 'gap',
      targetZ0: 'targetZ0',
      height: 'height',
      er: 'er',
      thickness: 'thickness',
      frequency: 'frequency',
      length: 'length',
      lengthMismatch: 'mismatch',
      erSource: 'erSource',
      geometrySource: 'geometrySource',
    },
    headline: (s) => (s.solveFor === 'gap' ? GAP_RESULT : s.solveFor === 'width' ? WIDTH_RESULT : Z0),
    labels: {
      [Z0]: 'Characteristic impedance Z0',
      [GAP_RESULT]: 'Gap for the target Z0',
      [WIDTH_RESULT]: 'Strip width for the target Z0',
      'effective permittivity': 'Effective permittivity',
      'modulus k = W/(W + 2 s)': 'Modulus k = W/(W + 2 s)',
      'modulus k3': 'Modulus k3',
      'filling factor q': 'Filling factor q',
      'substrate thickness over max(W, s)': 'Substrate thickness over max(W, s)',
      height: 'Substrate height h',
      thickness: 'Copper thickness t (echoed, not used)',
      gap: 'Gap',
    },
    accuracyClass: def.accuracyClass,
    thicknessNames: { height: 'thickness', thickness: 'thickness' },
    netClass: true,
    pinCodes: ['OUT_OF_RANGE', def.modelWarningCode],
    informational: def.informational,
    netClassText,
  };

  return {
    CALCULATOR_ID: def.id,
    PAGE_INTRO: def.intro,
    DEFAULT_STATE,
    FIELD,
    SOLVE_OPTIONS,
    NEEDS,
    VERIFY_LINE,
    THICKNESS_HELP,
    HEIGHT_HELP: def.height.help,
    WRITTEN_KEYS: writtenKeysOf(SPEC),
    toHashState: (s) => toHashStateOf(SPEC, s),
    fromHashState: (h) => fromHashStateOf(SPEC, h),
    computeView: (s) => computeViewOf(SPEC, s),
    liveSummary: liveSummaryOf,
    activeFields: (s) => SPEC.active(s) as readonly FieldName[],
    modelStatusRows: () => ledgerView(def.modelLedgerIds).entries.map((e) => ({ id: e.id, status: e.status, role: LEDGER_ROLE[e.id] ?? e.item })),
  };
}
