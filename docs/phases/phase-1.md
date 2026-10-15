# Phase 1 — Daily driver (objectives 2, 3, 4)

## Research first
S-010 IPC-2221 validity ranges & any amendment in revision C · S-011 IPC-2152 data availability / third-party fits (decide Mode A model or keep "estimate") · S-012 temperature coefficient of plated copper · S-013 skin depth formula · S-014 Onderdonk (info only, Phase 4) · S-015 via plating thickness typical values (fab docs) · S-016 E-series definition IEC 60063 · S-017 KiCad calculator behavior for cross-check

## Tasks
0. **Foundation fixes before any calculator (domain-review P-1..P-7 + research, see `docs/research/plan-delta.md` and OPEN_RISKS).** (a) confidence: any out-of-range input forces "low", no silent cap on defaulted assumptions, reasons always shown; (b) parser/units: field-aware ΔT and copper weight, compound units (K/W, °C/W, Ω·m, /K, %, A/mm², mil²), aliases (mils, thou, Ohm), resistor-code notation (4k7, 4R7), decimal-comma message, helpful errors; (c) per-field display units (mm/mil, °C), significant figures tied to accuracy class; (d) shared-link banner when state is discarded, compact list encoding, version migration; (e) `CalcResult` gains calculated-limit vs recommended-value, min/typ/max envelope, warning severity, fab-profile reference, limiting element, per-input provenance; (f) `FabProfile` type + schema + generic unverified example; (g) constants: exact ρ = 1/58e6 Ω·m (R-11), copper k as a labelled material choice with default 401 W/m·K pure copper (R-10, assumption shown), foil convention default 35 µm per oz/ft² as a labelled assumption showing the ≤ 2.1 % spread (R-9). Unit/locale test class: ΔT in °F, °C vs K as rise, decimal comma, mil↔mm↔µm round trips, imperial/metric parity.
1. Copper weight/thickness converter + finished-copper caution (nominal vs finished, selectable constant).
2. Trace width/current: **Mode B legacy** (exact formula, labelled) and **Mode A estimate** (labelled, confidence ≤ medium, side-by-side comparison). Advanced: continuous/peak/duty (RMS), ambient, max conductor temp, length, layer, adjacent plane (qualitative unless verified), cooling. **Status of the advanced inputs (Mode B legacy):** BUILT: RMS pulse input (optional `peakCurrent` + `duty` + required `periodVsTau`; I_rms = I_pk sqrt(D), ledger S-019e VERIFIED, validity S-019f UNVERIFIED; labelled "RMS-equivalent (mean heating)"; "comparable-or-longer" gives no RMS result), ambient, stated maximum conductor temperature (informational check). DEFERRED (not modelled; the result carries a "not modelled" assumption): adjacent plane and cooling. Reason: no verified source for a plane or airflow correction to the legacy relation (IPC-2152 is chart-based and not read; CLAUDE.md rule 3), and inventing a factor would be a number from memory. Length is not an input of the legacy width relation (it is used by the resistance and self-heating calculators).
3. Trace resistance with R(T), conductivity override; skin-effect warning.
4. Self-heating solver integration with convergence/runaway reporting (skill `self-heating-solver`).
5. Voltage drop / power loss (all four relations; over-specification detection).
6. **Path/load calculator** with weakest-link detection and net-class export (skill `path-load-calculator`).
7. Via electrical calculator (+ array & thermal-barrel θ) and annular ring/drill with worst-case tolerance (skill `via-and-annular-ring`).
8. Circuit values: Ohm/power, divider, feedback, LED, RC/LC, reactance, E-series nearest + two-resistor search in worker (skill `circuit-values`).
9. Min/typ/max envelope + sensitivity readout for trace and via calculators.
10. Cross-check records in `tests/crosscheck/` for X-01 (KiCad) and X-03 (twc) per `docs/sources/crosscheck-tools.md`. If agents cannot run the tool, ask the human for the GUI/CLI outputs and mark `obtainedBy: human`. Summarize disagreements in `docs/validation/crosscheck-phase1.md`. Exit criterion: every disagreement is classified, none left unexplained.

## Added by the reference-system research
Every calculator: solve-for-any-unknown where the relation allows; validity ranges enforced with the exact bound named and no silent extrapolation; named model + accuracy class; formula/help panel; Reset to Defaults. Trace width shows Mode A/B side by side with fit provenance and the internal-layer caveat (IPC-2221 internal widths come from external data derated 50 %; IPC-2152 reports internal traces run cooler). Derived outputs from the same inputs (R at ambient and elevated temperature, drop, power, max temperature).

## Exit criteria
- [ ] Every calculator returns full `CalcResult`; UI shows quick answer + details
- [ ] Golden vectors & property tests pass; oracle agrees within tolerance
- [ ] Mode A/B never mixed; legacy labelled; no compliance wording outside gate
- [ ] Self-heating: convergence ≤ 50 iterations; runaway case handled
- [ ] Performance: closed-form < 1 ms (benchmarked); fuzz test no NaN/throw
- [ ] Three validator reports PASS/PASS-WITH-CONDITIONS

## Closure status (2026-10-15)

Built: tasks 0-9 (core, pages, validators). Task 10: kit prepared, awaiting HUMAN-run KiCad/twc outputs (carried into Phase 2 by user decision).
Deferred by decision (logged in `docs/validation/OPEN_RISKS.md`, 'Phase 1 closure record'): task 2 Mode A estimate side by side (blocked by R-8; the page shows Mode A disabled), task 2 adjacent plane and cooling (qualitative only), task 6 parallel branches and per-segment temperature coupling, via current rating (PCB-F3, pointer text only), per-layer stackup object, in-app profile editor. Validators: `phase-1-calc-final.md`, `phase-1-phase-final.md`, `phase-1-pcb-final.md` all PASS-WITH-CONDITIONS; record `docs/validation/reports/phase-1-closure.md`.
