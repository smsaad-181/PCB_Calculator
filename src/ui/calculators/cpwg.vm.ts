// View-model for the conductor-backed coplanar waveguide (CPWG) page. Pure: no DOM, no engineering math.
// The calculation is src/core/calculators/cpwg compute(); the shared engine is coplanar.vm.ts.
import { compute, type Inputs } from '../../core/calculators/cpwg/calc';
import { meta } from '../../core/calculators/cpwg/meta';
import { makeCoplanarVm } from './coplanar.vm';

export type { CoplanarState as CpwgState, CoplanarView as CpwgView } from './coplanar.vm';

const vm = makeCoplanarVm({
  id: 'cpwg',
  intro:
    'Characteristic impedance, effective permittivity, filling factor, delay and guided wavelength of a conductor-backed coplanar waveguide (a centre strip between two coplanar grounds over a lower ground plane), or the gap or strip width for a target Z0. Ghione-Naldi conformal-map form at zero strip thickness; the stitching vias are not modelled.',
  height: {
    label: 'Dielectric height h (to the lower ground plane)',
    help: "Dielectric thickness between the coplanar layer and the lower ground plane, from your fabricator's stackup.",
    needs: 'Enter the dielectric height h from the strip to the lower ground plane, for example 500 um or 20 mil.',
  },
  compute: (i) => compute(i as unknown as Inputs),
  accuracyClass: meta.accuracyClass,
  modelLedgerIds: ['S-023a', 'S-023b'],
  modelWarningCode: 'MODEL_UNVERIFIED',
  informational: ['validity range of the model'],
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
