// View-model for the edge-coupled differential microstrip page. Pure: no DOM, no engineering math.
// The calculation is src/core/calculators/diff-microstrip compute(); the shared engine is diff.vm.ts.
import { compute, type Inputs } from '../../core/calculators/diff-microstrip/calc';
import { meta } from '../../core/calculators/diff-microstrip/meta';
import { makeDiffVm } from './diff.vm';

export type { DiffState as DiffMicrostripState, DiffView as DiffMicrostripView } from './diff.vm';

const vm = makeDiffVm({
  id: 'diff-microstrip',
  intro:
    'Differential, common-mode, even-mode and odd-mode impedance, effective permittivity and delay of an edge-coupled surface microstrip pair (two bare traces side by side over a reference plane, air above), or the spacing or width for a target Zdiff. Coupled-line static model at zero trace thickness.',
  sizeCoreField: 'height',
  sizeHash: 'h',
  size: {
    label: 'Dielectric height h (to the reference plane)',
    help: "Dielectric thickness between the trace layer and its reference plane, from your fabricator's stackup.",
    needs: 'Enter the dielectric height h from the trace to its reference plane, for example 635 um.',
    resultName: 'height',
    echo: 'thickness',
  },
  widthLabel: 'Trace width w',
  widthResultLabel: 'Trace width for the target Zdiff',
  widthResultName: 'trace width for target Zdiff',
  widthNeeds: 'Enter the trace width w, for example 0.15 mm or 6 mil.',
  compute: (i) => compute(i as unknown as Inputs),
  accuracyClass: meta.accuracyClass,
  modelLedgerId: 'S-022',
  delayNames: ['delay per length (odd mode)', 'delay per length (even mode)'],
  thicknessNames: { height: 'thickness', thickness: 'thickness' },
});

export const {
  CALCULATOR_ID,
  PAGE_INTRO,
  DEFAULT_STATE,
  FIELD,
  SOLVE_OPTIONS,
  NEEDS,
  VERIFY_LINE,
  SIZE_HELP,
  WRITTEN_KEYS,
  toHashState,
  fromHashState,
  computeView,
  extForm,
  liveSummary,
  activeFields,
  modelStatusRows,
  choosePreset,
  chooseSolve,
} = vm;
export { vm };
