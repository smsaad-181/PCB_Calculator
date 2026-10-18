// View-model for the coplanar waveguide (CPW) page. Pure: no DOM, no engineering math.
// The calculation is src/core/calculators/cpw compute(); the shared engine is coplanar.vm.ts.
import { compute, type Inputs } from '../../core/calculators/cpw/calc';
import { meta } from '../../core/calculators/cpw/meta';
import { makeCoplanarVm } from './coplanar.vm';

export type { CoplanarState as CpwState, CoplanarView as CpwView } from './coplanar.vm';

const vm = makeCoplanarVm({
  id: 'cpw',
  intro:
    'Characteristic impedance, effective permittivity, delay and guided wavelength of a coplanar waveguide with no lower ground plane (a centre strip between two coplanar grounds on a substrate, air above and below), or the gap or strip width for a target Z0. Conformal-map model at zero strip thickness; the effective-permittivity form is in conflict between sources.',
  height: {
    label: 'Substrate thickness h (no lower ground plane)',
    help: "Thickness of the substrate under the coplanar strip, from your fabricator's stackup. This model has no lower ground plane. Steer advises a substrate two or three times both W and s.",
    needs: 'Enter the substrate thickness h, for example 500 um or 20 mil.',
  },
  compute: (i) => compute(i as unknown as Inputs),
  accuracyClass: meta.accuracyClass,
  modelLedgerIds: ['S-023', 'S-023b'],
  modelWarningCode: 'MODEL_CONFLICT',
  informational: [],
});

export const {
  CALCULATOR_ID,
  PAGE_INTRO,
  DEFAULT_STATE,
  FIELD,
  SOLVE_OPTIONS,
  NEEDS,
  VERIFY_LINE,
  THICKNESS_HELP,
  HEIGHT_HELP,
  WRITTEN_KEYS,
  toHashState,
  fromHashState,
  computeView,
  liveSummary,
  activeFields,
  modelStatusRows,
} = vm;
export { vm };
