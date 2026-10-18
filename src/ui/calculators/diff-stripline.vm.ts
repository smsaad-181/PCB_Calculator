// View-model for the edge-coupled differential stripline page. Pure: no DOM, no engineering math.
// The calculation is src/core/calculators/diff-stripline compute(); the shared engine is diff.vm.ts.
import { compute, type Inputs } from '../../core/calculators/diff-stripline/calc';
import { meta } from '../../core/calculators/diff-stripline/meta';
import { makeDiffVm } from './diff.vm';

export type { DiffState as DiffStriplineState, DiffView as DiffStriplineView } from './diff.vm';

const vm = makeDiffVm({
  id: 'diff-stripline',
  intro:
    'Differential, common-mode, even-mode and odd-mode impedance and delay of a centred edge-coupled stripline pair (two strips side by side midway between two reference planes in one homogeneous dielectric), or the spacing or width for a target Zdiff. Cohn approximate forms at zero strip thickness.',
  sizeCoreField: 'planeSpacing',
  sizeHash: 'b',
  size: {
    label: 'Plane-to-plane spacing b',
    help: 'Distance between the two reference planes (dielectric above and below plus the strip), from your fabricator\'s stackup.',
    needs: 'Enter the plane-to-plane spacing b (dielectric above and below plus the strip), for example 0.4 mm.',
    resultName: 'plane spacing',
    echo: 'geometry',
  },
  widthLabel: 'Strip width w',
  widthResultLabel: 'Strip width for the target Zdiff',
  widthResultName: 'strip width for target Zdiff',
  widthNeeds: 'Enter the strip width w, for example 0.1 mm or 4 mil.',
  compute: (i) => compute(i as unknown as Inputs),
  accuracyClass: meta.accuracyClass,
  modelLedgerId: 'S-022a',
  delayNames: ['delay per length'],
  thicknessNames: { thickness: 'thickness' },
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
  liveSummary,
  activeFields,
  modelStatusRows,
  choosePreset,
  chooseSolve,
} = vm;
export { vm };
