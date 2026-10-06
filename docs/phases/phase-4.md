# Phase 4 — Extras

## Human prerequisite
Original prompt section 15 (PCB Thermal Calculator) was truncated. **Ask the human to confirm scope before building.** Proposed: trace heating (reuse), via/thermal via array, exposed pad spreading, θJA/θJC estimate, copper-area spreading.

## Research first
S-040 JEDEC JESD51 series scope and θJA caveats · S-041 thermal via array models (published app notes) · S-042 Onderdonk/Preece fusing · S-043 twisted pair & coax formulas · S-044 antenna guided-wavelength rules

## Tasks
1. Thermal estimates: labelled low-confidence, show assumptions (board size, copper area, airflow).
2. RF/antenna helper with free-space vs guided warning.
3. Twisted pair, coax references.
4. Fusing calculators, separate from steady-state heating.
5. Final hardening: performance audit, offline test, accessibility pass, docs.

## Exit criteria
- [ ] θJA never presented as a design constant
- [ ] Fusing and heating clearly separated
- [ ] Final validator reports PASS and RUNBOOK/README complete
