# Plan delta from the reference-system research (2026-10-06)

Sources: `jlcpcb.md`, `kicad-pcb-calculator.md`, `reference-systems-survey.md` (21 systems). Quotes came through a summarizing fetcher: re-read any number in a browser before it enters `src/` or the ledger. Cross-check tools are never verification (CLAUDE.md rule 14). No GPL code is copied (rule 13).

## What the research confirmed about our design
- **Path/load weakest-link chain, resistance-vs-temperature self-heating, per-result confidence, ledger traceability:** no surveyed tool has any of them. These stay our differentiators.
- **Every "IPC-2152" mode in other tools is a third-party fit** (Sierra unpublished, Saturn "±10 % of chart", SMPS.us, NinjaCalc, twc, KiCad master = Brooks & Adam). Our "IPC-2152-informed estimate" label is right. JLCPCB's own trace-width blog calls itself IPC-2152 but uses the IPC-2221 constants.
- **KiCad master replaced IPC-2221 with the Brooks & Adam fit with no legacy option and no warning.** We keep legacy mode labelled and never substitute silently (rule 4).
- **Calculators that name no model and state no accuracy** (JLCPCB impedance) are the norm. We name the model, validity range and accuracy class on every result.

## Adopted (Phase 1)
1. **Task 0 (foundation, from the Phase 0 domain review P-1..P-7)** before any calculator: confidence rule, field-aware parsing, per-field display units, link-state banner, extended `CalcResult`, `FabProfile`, R-10/R-11 constants.
2. **Solve for any one unknown** from the others (Sierra, Digi-Key): trace width ↔ current ↔ ΔT; resistance ↔ length/width.
3. **Enforce validity ranges per model and name the exact bound** (Digi-Key); never extrapolate silently (Advanced Circuits, PCBWay do).
4. **Several methods side by side, each labelled** (SMPS.us shows four) → Mode A / Mode B comparison with fit provenance (author, source figure, error).
5. **Derived outputs from the same inputs:** resistance at ambient and at elevated temperature, voltage drop, power, max temperature (Sierra).
6. **Unit dropdown on every field with SI internally;** mil/mm/µm display preference; °C display for temperatures.
7. **Unit/locale test class** (the most common fix in Saturn's changelog): ΔT in °F, °C vs K as rise, decimal comma, mil↔mm round trips, imperial/metric parity.
8. **Internal-layer caveat:** IPC-2221 internal widths derive from external data derated by 50 %; IPC-2152 reports internal traces run cooler (Brooks & Adam 2020). Shown with the result.
9. **Formula/help panel in each calculator and a "controlling value" cue** (KiCad), plus Reset to Defaults and a dimensioned drawing where useful.
10. **Fab profiles carry real, dated, user-editable fields** (JLCPCB publishes: annular ring 0.15–0.25 mm, hole plating 18 µm avg, drill tolerance +0.13/−0.08 mm, min trace/space). The 25 µm plating test value is not pre-filled in the UI.

## Adopted (Phase 2)
Rise-time → critical-length helper; user-editable material profile (Dk/Df vs frequency); accuracy-band table per impedance model feeding confidence (LearnEMC/MST style); explicit "outside high-accuracy band → field solver or your fab" recommendation; a ledger row for every protocol preset; no 2D field solver (out of scope).

## Adopted (Phase 3)
IPC-2221 spacing labelled "functional design guidance, not a safety-insulation result". KiCad's spacing categories differ between 7.0/9.0 (7) and master (8, cites IPC-2221C): the human must compare IPC-2221B and C before any table is entered.

## Phase 4 candidates (human to confirm)
Crosstalk estimate, PDN target impedance, resistor colour/SMD codes, attenuators, wire ampacity, installable offline app.

## Do NOT adopt
- KiCad "Board Classes" geometry table (no source; matches neither IPC-6011 nor IPC-6012).
- KiCad via current rating via IPC-2221 external k (inconsistent with its own track-width change).
- JLCPCB/Sierra hidden defaults (Sierra 40 % safety factor, 1 in length) unless shown as labelled, editable assumptions.

## Manual cross-check candidates (human runs the tool; agents never type outputs)
KiCad 9.0/10.0 and a dated master nightly: 18 input sets listed in `kicad-pcb-calculator.md` §8. Digi-Key and LearnEMC/Missouri S&T as spot checks for Phase 2.

## New open items
- R-21: re-read quoted numbers (JLCPCB stackup page came back partly garbled) in a browser before use.
- R-22: JLCPCB and KiCad disagree by 6–19 % on the same stackup (forum, June 2026): never treat either as ground truth.
