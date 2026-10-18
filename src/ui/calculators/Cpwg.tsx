import { CoplanarPage } from '../components/CoplanarPage';
import { vm } from './cpwg.vm';

const NOTE =
  'The stackup editor has no coplanar layer type: it can supply only h (the dielectric height from the signal layer to its reference plane, here the lower ground plane), t and er. It cannot supply W or s.';

export default function Cpwg() {
  return <CoplanarPage vm={vm} stackupKey="pcb-calc.stackup.v1.cpwg" formLabel="Conductor-backed coplanar waveguide inputs" stackupNote={NOTE} />;
}
