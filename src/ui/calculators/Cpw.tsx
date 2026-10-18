import { CoplanarPage } from '../components/CoplanarPage';
import { vm } from './cpw.vm';

const NOTE =
  'The stackup editor has no coplanar layer type: it can supply only h (the dielectric height under the signal layer, taken to the nearest reference plane), t and er. It cannot supply W or s, and this model has no lower ground plane, so check that the h it derives is the substrate thickness you mean.';

export default function Cpw() {
  return <CoplanarPage vm={vm} stackupKey="pcb-calc.stackup.v1.cpw" formLabel="Coplanar waveguide inputs" stackupNote={NOTE} />;
}
