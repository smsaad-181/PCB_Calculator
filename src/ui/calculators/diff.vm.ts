// Shared view-model for the two edge-coupled differential pages (microstrip, stripline). Pure: no DOM, no engineering math.
// Text in, display strings out. The calculations are src/core/calculators/{diff-microstrip,diff-stripline} compute().
// The per-calculator files (diff-microstrip.vm.ts, diff-stripline.vm.ts) supply only what differs: ids, labels, the core compute.
import { IMPEDANCE_BANNER } from '../../core/calculators/impedance-shared';
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
import { EXT_DEFAULTS, extFormOf, type ExtForm, tolEr, tolHeight, tolSpacing, tolWidth, type ExtState } from './impedance-ext.vm';
import {
  buildPresetView,
  offeredPresetIds,
  offeredToleranceIds,
  presetTargetText,
  selectPreset,
  type PresetView,
  type SolveMode,
} from './diff-presets.vm';

export { ER_HELP, ER_SOURCE_HELP };
export type { SolveMode };

export const VERIFY_LINE = 'Verify with your licensed copy / fab stackup.';
export const MODEL_STATUS_HEADING = 'Model status (source ledger)';
export const THICKNESS_IGNORED_HELP =
  'Optional. Ignored by the coupled model: it has no finite-thickness form, so t does not change the result. If you enter it the page echoes it and the calculator adds a warning.';

/** Everything the form holds. Strings are exactly what the user typed. Empty means "not entered". Nothing is pre-filled. */
export type DiffState = ExtState & {
  readonly solveFor: SolveMode;
  readonly width: string;
  /** Edge-to-edge gap s of the pair. */
  readonly spacing: string;
  /** Target differential impedance Zdiff (solve modes). */
  readonly targetZ: string;
  /** h (microstrip) or b (stripline). */
  readonly size: string;
  readonly thickness: string;
  readonly er: string;
  readonly erSource: string;
  readonly geometrySource: string;
  readonly frequency: string;
  readonly length: string;
  readonly mismatch: string;
  /** Protocol preset id; empty means none (never pre-selected). */
  readonly preset: string;
  /** Tolerance id of the chosen preset; empty means none chosen (never defaulted). */
  readonly tolerance: string;
  readonly units: Units;
};

export type DiffView = ImpedanceView & { readonly preset: PresetView };
export type FieldName = 'width' | 'spacing' | 'targetZ' | 'size' | 'thickness' | 'er' | 'erSource' | 'geometrySource' | 'frequency' | 'length' | 'mismatch';

export interface DiffKindDef {
  readonly id: string;
  readonly intro: string;
  /** Core input name of h or b. */
  readonly sizeCoreField: 'height' | 'planeSpacing';
  readonly sizeHash: 'h' | 'b';
  readonly size: { readonly label: string; readonly help: string; readonly needs: string; readonly resultName: string; readonly echo: 'thickness' | 'geometry' };
  readonly widthLabel: string;
  readonly widthResultLabel: string;
  readonly widthResultName: string;
  readonly widthNeeds: string;
  readonly compute: (inputs: Record<string, unknown>) => CalcOutcome;
  readonly accuracyClass: AccuracyClass;
  /** The ledger row of the coupled model (S-022 or S-022a): shown as the page-level model status. */
  readonly modelLedgerId: string;
  readonly delayNames: readonly string[];
  readonly thicknessNames: Readonly<Record<string, 'thickness'>>;
}

export const SOLVE_OPTIONS: readonly { value: SolveMode; label: string }[] = [
  { value: 'zdiff', label: 'Differential impedance Zdiff from the geometry' },
  { value: 'spacing', label: 'Edge spacing s for a target Zdiff' },
  { value: 'width', label: 'Trace width w for a target Zdiff' },
];

const ZDIFF = 'differential impedance Zdiff';
const SPACING_RESULT = 'edge spacing for target Zdiff';

export interface DiffVm {
  readonly CALCULATOR_ID: string;
  readonly PAGE_INTRO: string;
  readonly DEFAULT_STATE: DiffState;
  readonly FIELD: Readonly<Record<FieldName, TextDef>>;
  readonly SOLVE_OPTIONS: typeof SOLVE_OPTIONS;
  readonly NEEDS: Readonly<Record<string, string>>;
  readonly VERIFY_LINE: string;
  readonly SIZE_HELP: string;
  readonly WRITTEN_KEYS: readonly string[];
  readonly toHashState: (s: DiffState) => Record<string, string>;
  readonly fromHashState: (h: HashState) => Loaded<DiffState>;
  readonly computeView: (s: DiffState, today?: string) => DiffView;
  readonly extForm: (s: DiffState, today: string) => ExtForm;
  readonly liveSummary: (v: ImpedanceView) => string;
  readonly activeFields: (s: DiffState) => readonly FieldName[];
  readonly modelStatusRows: () => LedgerRowBadge[];
  readonly choosePreset: (s: DiffState, id: string) => DiffState;
  readonly chooseSolve: (s: DiffState, mode: SolveMode) => DiffState;
}

export function makeDiffVm(def: DiffKindDef): DiffVm {
  const DEFAULT_STATE: DiffState = Object.freeze({
    ...EXT_DEFAULTS,
    solveFor: 'zdiff',
    width: '',
    spacing: '',
    targetZ: '',
    size: '',
    thickness: '',
    er: '',
    erSource: '',
    geometrySource: '',
    frequency: '',
    length: '',
    mismatch: '',
    preset: '',
    tolerance: '',
    units: 'metric',
  });

  const FIELD: Readonly<Record<FieldName, TextDef>> = {
    width: { key: 'width', label: def.widthLabel, hash: 'w', kind: 'length', echo: 'geometry' },
    spacing: { key: 'spacing', label: 'Edge-to-edge spacing s of the pair', hash: 's', kind: 'length', echo: 'geometry' },
    targetZ: { key: 'targetZ', label: 'Target differential impedance Zdiff', hash: 'z', kind: 'resistance', echo: 'other' },
    size: { key: 'size', label: def.size.label, hash: def.sizeHash, kind: 'length', echo: def.size.echo },
    thickness: { key: 'thickness', label: 'Copper thickness t (ignored by the coupled model)', hash: 't', kind: 'length', echo: 'thickness' },
    er: { key: 'er', label: 'Relative permittivity er', hash: 'er', kind: 'number' },
    erSource: { key: 'erSource', label: 'Source of er', hash: 'es', kind: 'note' },
    geometrySource: { key: 'geometrySource', label: 'Source of the geometry', hash: 'gs', kind: 'note' },
    frequency: { key: 'frequency', label: 'Frequency', hash: 'f', kind: 'frequency', echo: 'other' },
    length: { key: 'length', label: 'Line length', hash: 'l', kind: 'length', echo: 'geometry' },
    mismatch: { key: 'mismatch', label: 'Length mismatch within the pair', hash: 'dl', kind: 'length', echo: 'geometry' },
  };
  const TEXT: readonly TextDef[] = Object.values(FIELD);

  const CHOICES: readonly ChoiceDef[] = [
    { key: 'solveFor', hash: 'sf', values: ['zdiff', 'spacing', 'width'], notice: 'The solve-for choice was not recognised: Zdiff from the geometry is used instead.' },
    { key: 'preset', hash: 'pr', values: offeredPresetIds(), notice: 'The protocol preset was not recognised (or is not one this page offers): no preset is used.' },
    { key: 'tolerance', hash: 'tl', values: offeredToleranceIds(), notice: 'The preset tolerance was not recognised: no tolerance is chosen.' },
  ];

  const NEEDS: Readonly<Record<string, string>> = {
    width: def.widthNeeds,
    spacing: 'Enter the edge-to-edge spacing s between the two traces of the pair, for example 0.2 mm or 8 mil.',
    targetZ: 'Enter the target differential impedance Zdiff, for example 90 ohm, or choose a protocol preset.',
    size: def.size.needs,
    er: "Enter the relative permittivity er from your fabricator's stackup (no default is provided).",
    erSource: 'Enter the source of er (where er came from, for example the fabricator stackup drawing); it is required.',
  };

  const modeKeys = (mode: SolveMode): readonly FieldName[] => (mode === 'spacing' ? ['targetZ', 'width'] : mode === 'width' ? ['targetZ', 'spacing'] : ['width', 'spacing']);
  const ACTIVE_TAIL: readonly FieldName[] = ['size', 'thickness', 'er', 'erSource', 'geometrySource', 'frequency', 'length', 'mismatch'];

  const modelRow = (r: ResultView, label: string): string => r.details.inputs.find((i) => i.label === label)?.value ?? '';
  const netClassText = (r: ResultView, s: Record<string, string>): string | undefined => {
    const mode = s['solveFor'];
    if (mode !== 'spacing' && mode !== 'width') return undefined;
    const width = mode === 'width' ? r.headline.text : modelRow(r, 'Width');
    const spacing = mode === 'spacing' ? r.headline.text : modelRow(r, 'Edge spacing');
    const status = r.ledger.entries.filter((e) => e.status !== 'VERIFIED').map((e) => `${e.id} ${e.status}`);
    return [
      'Edge-coupled differential pair (starting value for a net class)',
      `Trace width: ${width}`,
      `Edge-to-edge spacing: ${spacing}`,
      `Target Zdiff: ${modelRow(r, 'Target Zdiff')}`,
      `Starting value for a net class, not a design rule. ${IMPEDANCE_BANNER}`,
      `Model status: ${status.join('; ')}. ${VERIFY_LINE}`,
    ].join('\n');
  };

  const SPEC: ImpedanceSpec<DiffState> = {
    id: def.id,
    defaults: DEFAULT_STATE,
    text: TEXT,
    choices: CHOICES,
    active: (s) => [...modeKeys(s.solveFor), ...ACTIVE_TAIL],
    required: (s) => [...modeKeys(s.solveFor), 'size', 'er', 'erSource'],
    needs: NEEDS,
    build: (s, get, note) => ({
      ...(s.solveFor === 'zdiff' ? { width: get('width'), edgeSpacing: get('spacing') } : s.solveFor === 'spacing' ? { targetZdiff: get('targetZ'), width: get('width') } : { targetZdiff: get('targetZ'), edgeSpacing: get('spacing') }),
      [def.sizeCoreField]: get('size'),
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
      edgeSpacing: 'spacing',
      targetZdiff: 'targetZ',
      [def.sizeCoreField]: 'size',
      er: 'er',
      thickness: 'thickness',
      frequency: 'frequency',
      length: 'length',
      lengthMismatch: 'mismatch',
      erSource: 'erSource',
      geometrySource: 'geometrySource',
    },
    headline: (s) => (s.solveFor === 'spacing' ? SPACING_RESULT : s.solveFor === 'width' ? def.widthResultName : ZDIFF),
    labels: {
      [ZDIFF]: 'Differential impedance Zdiff',
      [SPACING_RESULT]: 'Edge spacing for the target Zdiff',
      [def.widthResultName]: def.widthResultLabel,
    },
    accuracyClass: def.accuracyClass,
    thicknessNames: def.thicknessNames,
    netClass: true,
    delayNames: def.delayNames,
    pinCodes: ['OUT_OF_RANGE', 'MODEL_UNVERIFIED', 'WEAK_COUPLING_FIT', 'FINITE_THICKNESS_NOT_MODELLED', 'ISOLATED_MODEL_MISMATCH'],
    informational: ['Zodd < Z0 < Zeven', 't/h reported', 't/b reported'],
    netClassText,
    ext: { tol: [tolWidth(def.widthLabel, 'width'), tolSpacing('edgeSpacing', 'Edge-to-edge spacing s', 'spacing'), tolHeight(def.sizeCoreField, def.size.label, 'size'), tolEr()] },
  };

  const WRITTEN_KEYS = writtenKeysOf(SPEC);

  function computeView(s: DiffState, today?: string): DiffView {
    const base = computeViewOf(SPEC, s, today);
    const zdiff = base.status === 'ok' ? base.raw.results.find((r) => r.name === ZDIFF)?.value : undefined;
    const preset = buildPresetView({ preset: s.preset, tolerance: s.tolerance, solveMode: s.solveFor, targetText: s.targetZ, ...(zdiff !== undefined ? { zdiff } : {}) });
    return { ...base, preset };
  }

  function choosePreset(s: DiffState, id: string): DiffState {
    const r = selectPreset({ preset: s.preset, tolerance: s.tolerance, solveMode: s.solveFor, targetText: s.targetZ }, id);
    return { ...s, preset: r.preset, tolerance: r.tolerance, targetZ: r.targetText };
  }

  function chooseSolve(s: DiffState, mode: SolveMode): DiffState {
    const target = presetTargetText(s.preset);
    const fill = mode !== 'zdiff' && s.targetZ.trim() === '' && target !== undefined;
    return { ...s, solveFor: mode, ...(fill ? { targetZ: target } : {}) };
  }

  return {
    CALCULATOR_ID: def.id,
    PAGE_INTRO: def.intro,
    DEFAULT_STATE,
    FIELD,
    SOLVE_OPTIONS,
    NEEDS,
    VERIFY_LINE,
    SIZE_HELP: def.size.help,
    WRITTEN_KEYS,
    toHashState: (s) => toHashStateOf(SPEC, s),
    fromHashState: (h) => fromHashStateOf(SPEC, h),
    computeView,
    extForm: (s, today) => extFormOf(SPEC.ext, s, SPEC.active(s), today),
    liveSummary: liveSummaryOf,
    activeFields: (s) => SPEC.active(s) as readonly FieldName[],
    modelStatusRows: () => ledgerView([def.modelLedgerId]).entries.map((e) => ({ id: e.id, status: e.status, role: LEDGER_ROLE[e.id] ?? e.item })),
    choosePreset,
    chooseSolve,
  };
}
