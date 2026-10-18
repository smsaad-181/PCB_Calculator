import { DiffPage } from '../components/DiffPage';
import { vm } from './diff-stripline.vm';

const EXAMPLES = { width: '0.1 mm', spacing: '0.15 mm', size: '0.4 mm' } as const;

export default function DiffStripline() {
  return <DiffPage vm={vm} kind="stripline" stackupKey="pcb-calc.stackup.v1.diff-stripline" formLabel="Differential stripline inputs" examples={EXAMPLES} />;
}
