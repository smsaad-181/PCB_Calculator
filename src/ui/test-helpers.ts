// Test helper: every core warning message an impedance result shows anywhere (general list, limits block, thickness-variant notes, near-result notes,
// loss block). The core warnings are split over these places on purpose (PCB2-19, PCB2-2, PCB2-4); none may be dropped.
import type { ImpedanceView } from './calculators/impedance.vm';

export function shownMessages(v: ImpedanceView): readonly string[] {
  if (v.status !== 'ok') return [];
  return [
    ...v.result.warnings.map((w) => w.message),
    ...(v.limits?.items.map((i) => i.text) ?? []),
    ...(v.conflict?.notes.map((n) => n.message) ?? []),
    ...(v.near?.notes.map((n) => n.message) ?? []),
    ...(v.loss?.notes.map((n) => n.message) ?? []),
    ...(v.loss?.notices.map((n) => n.message) ?? []),
    ...(v.callouts?.map((c) => c.text) ?? []),
    ...(v.tolerance?.notices.map((n) => n.message) ?? []),
  ];
}
