---
name: path-load-calculator
description: The current-path / load calculator: a chain of segments (trace, via, connector, pad, spoke) with resistance, current, voltage-drop budget, power, and weakest-link detection. Use for objective 3 (load calculations).
---
# Path / load calculator
Model: ordered `Segment[]`, each `{type, label, R(T), I_max_allowed?, θ?}`. Types: trace(width, length, copper, layer), via(array), connector(R from datasheet), pad/spoke(user R), cable(AWG,length), sense/shunt, ideal source/load.
Outputs:
- Per-segment ΔV, P, % of budget; total ΔV, total P; load voltage; % drop vs allowed budget.
- **Weakest link**: the segment with the smallest margin `I_allowed/I_applied` (or highest ΔT), computed from each segment's own limit; state the limiting reason.
- Parallel branches: DEFERRED (round 1 is a series path; a via array N is allowed inside one via element, rated as a whole array).
- Temperature iteration per segment: DEFERRED; the path calculator warns SELF_HEATING_NOT_COUPLED and points to the self-heating calculator.
- Limits: one utilisation basis (current). Traces use the legacy IPC-2221 capacity at the user's allowed rise; via and connector-type ratings are user-supplied with a source note; unrated elements are excluded from the ranking and listed with a caution.
Rules: current is the same through series segments; for parallel vias show unequal-sharing warning; connector current rating comes from datasheet input only.
Export: net-class-ready `{trace width, via drill/pad, clearance}` in mm and mil.
Golden: 3 A through 100 mm × 1 mm × 35 µm trace + 4 vias 0.3 mm/25 µm/1.6 mm (compute with oracle).
