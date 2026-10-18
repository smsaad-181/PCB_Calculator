import { DiffPage } from '../components/DiffPage';
import { vm } from './diff-microstrip.vm';

const EXAMPLES = { width: '0.15 mm', spacing: '0.2 mm', size: '0.1 mm' } as const;

export default function DiffMicrostrip() {
  return <DiffPage vm={vm} kind="microstrip" stackupKey="pcb-calc.stackup.v1.diff-microstrip" formLabel="Differential microstrip inputs" examples={EXAMPLES} />;
}
