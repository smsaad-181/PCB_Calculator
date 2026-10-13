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

## Task 4 decisions (self-heating core, 2026-10-13)
- Model: R(T) = R20 (1 + alpha (T - 20 C)) with the S-004 constants; P = I^2 R(T) (S-019); dT = theta x P(dT), solved as a bracketed fixed point with the existing Brent (`src/core/solvers/rootfind.ts`) on f(dT) = dT - theta x P(dT) over [0, dT_max]; max 50 iterations, relative tolerance 1e-6; status converged | max_iter | runaway, with iterations and residual. Ledger rows (research pass 2026-10-13 split the old S-019d): S-019d thermal resistance dT = theta x P VERIFIED; S-019e I_rms = I_pk sqrt(D) VERIFIED; S-019f pulse validity (period much shorter than the time constant) UNVERIFIED; S-019g coupled fixed point, closed form and runaway criterion UNVERIFIED (DERIVED). Every result cites S-019g; pulsed results also cite S-019e and S-019f.
- Thermal law is an explicit required choice, never defaulted: `user-theta` (theta in K/W, or K m/W with the length; labelled user-supplied) or `legacy-ipc2221-calibrated` (theta_eff = dT_ipc(I) / (I^2 R20), dT_ipc from the trace-width core; always labelled legacy; S-001 PAYWALLED shows through confidence). No IPC-2152 fit is used (Mode A blocked by R-8).
- Reference temperature of the legacy calibration is 20 C (power P0 = I^2 R20), so the uncoupled (alpha = 0) rise equals the legacy rise exactly and the coupling effect is the extra rise caused by R(T) alone. This is a modelling choice, not from a source.
- Runaway means no root in [0, dT_max]: either loop gain k = theta I^2 R20 alpha >= 1 (no steady state exists) or a root beyond dT_max. Default dT_max = 150 C minus ambient (the trace-resistance copper validity bound); configurable. On runaway or max_iter the result is ok with a critical warning and NO rise, temperature or drop (rule 10); the primary item is the search limit.
- Brent returns the upper end of the final bracket (or x when the residual is exactly zero), so the predicted rise is never below the root. Tolerance caveat: the bracket test is relative to the root with a floor of 2 eps x dT_max when the bracket contains 0, so a root smaller than about 1e-9 x dT_max is resolved to less than 1e-6 relative.
- Pulse: I_rms = I_pk sqrt(D) only for `periodVsTau: 'much-shorter'` (a user declaration, not checked; no threshold is invented). The result is labelled 'mean temperature rise (duty-averaged)' and carries a warning that the peak is higher by up to (1 - D) x P_pk x Z(t_on), which is not computed (no transient impedance for a trace); `comparable-or-longer` returns no rms result, a warning, and the separately named peak-based value (peak held continuously).
- Fusing (Onderdonk / Preece), transient heating, skin effect: out of scope.
- Confidence: accuracy class 'estimate' for both laws. Because S-019g (coupled fixed point) is cited by every result and is UNVERIFIED, the user-theta score is 2 + 1 = 3, so the level stays low until S-019g is sourced (then medium); legacy adds PAYWALLED (score 4, low). Default ambient is counted as a safety-relevant default, as in trace-width.
- Oracle: the Python oracle uses the CLOSED FORM dT = theta I^2 R(Tamb) / (1 - theta I^2 R20 alpha) (exact for constant theta and linear R(T)), so it is independent of the Brent iteration.

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
