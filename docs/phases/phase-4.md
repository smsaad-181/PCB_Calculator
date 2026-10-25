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
- [x] θJA never presented as a design constant (phase-validator: MET; warning `NOT_THETA_JA` always on; no θJA value built)
- [x] Fusing and heating clearly separated (phase-validator: MET; own category, notices and links both ways)
- [x] Final validator reports PASS-WITH-CONDITIONS or better and RUNBOOK/README complete: calc PASS-WITH-CONDITIONS, pcb PASS, phase PASS-WITH-CONDITIONS (conditions logged in OPEN_RISKS). **Task 5 is only partly done**: the human accepted it on 2026-10-19 as a logged partial deferral (OPEN_RISKS H4-1 / PV4R-1). Done: no-runtime-network check on 27 routes, route-switch timings, structural a11y, Tab reach, contrast from stylesheet variables. Not done: throttled broadband load measurement, axe-core (needs approval), screen-reader check, 200 % zoom/reflow, long-task trace, radio/collapsible keyboard behaviour

Offline (human decision 2026-10-19): no network calls at runtime; a route works offline once its code has loaded; a reload while offline is not supported (no service worker).

## Scope decision (human, 2026-10-19)
Confirmed scope for the thermal part: **thermal via array estimate** only. **Fusing (Onderdonk/Preece)** built as a separate calculator. **Final hardening (task 5)** stays required by the exit criteria.
Deferred (not built, logged in OPEN_RISKS): theta-JA/theta-JC estimate, exposed-pad / copper-area spreading, RF/antenna helper (task 2), twisted pair and coax references (task 3). Trace heating reuse is the existing self-heating calculator (no new math). Ledger placeholder S-043…S-044 covers the deferred RF/twisted-pair/coax rows.
