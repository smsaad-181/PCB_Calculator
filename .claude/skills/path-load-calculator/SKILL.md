---
name: path-load-calculator
description: The current-path / load calculator: a chain of segments (trace, via, connector, pad, spoke) with resistance, current, voltage-drop budget, power, and weakest-link detection. Use for objective 3 (load calculations).
---
# Path / load calculator
Model: ordered `Segment[]`, each `{type, label, R(T), I_max_allowed?, θ?}`. Types: trace(width, length, copper, layer), via(array), connector(R from datasheet), pad/spoke(user R), cable(AWG,length), sense/shunt, ideal source/load.
Outputs:
- Per-segment ΔV, P, % of budget; total ΔV, total P; load voltage; % drop vs allowed budget.
- **Weakest link**: the segment with the smallest margin `I_allowed/I_applied` (or highest ΔT), computed from each segment's own limit; state the limiting reason.
- Parallel branches supported (current division by resistance).
- Temperature iteration using `self-heating-solver` per segment.
Rules: current is the same through series segments; for parallel vias show unequal-sharing warning; connector current rating comes from datasheet input only.
Export: net-class-ready `{trace width, via drill/pad, clearance}` in mm and mil.
Golden: 3 A through 100 mm × 1 mm × 35 µm trace + 4 vias 0.3 mm/25 µm/1.6 mm (compute with oracle).
