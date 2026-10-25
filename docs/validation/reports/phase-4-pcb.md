# Phase 4 PCB domain re-review: thermal via array and fusing

Reviewer: pcb-domain-reviewer (practising PCB / power hardware lens). Branch `phase-4`, head `2107b42`. Date 2026-10-19.
This re-review covers the earlier report (head `3420891`, PASS-WITH-CONDITIONS, MAJOR M-1 to M-5) and the fixes logged under "Phase 4 core fixes" (CF-1 to CF-15) and "Phase 4 UI" (P4U-11 to P4U-16) in `docs/validation/OPEN_RISKS.md`.
I did not edit `src/` or `tests/`.

## Verdict: **PASS**

All five MAJOR conditions are fixed in both the core and the page. The fixes behave correctly in my scenarios:
- an optional end temperature;
- "not a safety margin" labels;
- a via-barrel geometry and an always-on weakest-link caution;
- an always-on thermal-relief warning backed by a sourced ledger row (S-045);
- a required drill/finished basis with a neutral placeholder;
- the headline replaced above 10 s, and the 1 s warning moved directly under the headline.

The hand checks still agree. I found no BLOCKER and no new MAJOR. The new items below are MINOR. They should go into the `OPEN_RISKS.md` backlog. None of them would make a number on these pages read as "safe".

## Previous findings: status

| # | Finding (earlier report) | Status | Evidence (this run) |
|---|---|---|---|
| M-1 | Fusing stops at the copper melting point, and the fraction reads as margin | **FIXED** | The optional `te` field has no default. Its results are labelled "your value, not checked", and the input is checked against both the initial temperature and the melting point (F12, F13 refused). F7: the headline is now "…fraction… (estimate, not a safety margin) = 0.32", with the row "fraction of the I²t that reaches your end temperature = **0.72**". That matches my hand value of 0.72 to 300 °C. `BOARD_DAMAGE_BELOW_MELTING` is a warning, first in the list on every result |
| M-2 | No weakest-link guidance; no via geometry | **FIXED** (N-parallel and drill basis deferred, P4U-16) | The `WEAKEST_LINK` caution is on every fusing result. The new "via barrel" geometry requires the plating, with no pre-fill (F10 gated) and a `VIA_BARREL_PLATING` "average is not a minimum" caution. F8: 0.25 mm finished, 18 µm, 10 ms gives 43 A, which matches my hand value of 43.4 A |
| M-3 | Thermal relief and plane connection not mentioned | **FIXED** (no input; source S-045) | `THERMAL_RELIEF_NOT_MODELLED` is warning level and first in the warning list on every thermal-via result (T3 to T11). The text says to check the plane connect style in CAD. Ledger S-045 cites the TI PowerPAD guidance ("do not use the typical web or spoke via connection"). It adds no number |
| M-4 | Drill vs finished hole; the placeholder invited the mistake | **FIXED** | The `db` basis is required with no default: T2 returns "needs input" and no number. An unknown hash value is refused with a notice and stays blank. The placeholder is a unit hint until "finished" is chosen. 0.3 mm drill with 25 µm is the same as 0.25 mm finished: 21 K/W (T3 = T4), and the "finished hole used" row shows 0.25 mm. A drill with t ≥ D/2 is refused (T6). See m-N2 for one correction to my own earlier wording |
| M-5 | Headline time where the model has no meaning | **FIXED** | F3 (2 mm 1 oz, 5 A) and F6 (30 s pulse) show the headline "Not meaningful for this model…". The number is kept and labelled "Numeric detail, not meaningful…", and the live region says "No meaningful result". F5 (2.8 s), F16 and F19 (6.3 s, 8.2 s) show the 1 s warning in the `underHeadline` slot, before the callouts (`ResultsPanel` line 41) |
| m-1 | cmil advertised but refused | FIXED (hint) | The unit hint is "mm2 or mil2 (not cmil)", and the help explains that cmil is not mil². cmil is still refused (F14). Acceptable |
| m-2 | Unqualified "lower bound" | FIXED | Every string now says "usually a lower bound … not assured", and the core names both directions |
| m-3 | Ratio printed as "1" | FIXED | Now prints 1.016 |
| m-4 | Which fuse I²t to use | FIXED | The help says to use the total clearing I²t at your fault current |
| m-5 | Not wired to stackup or fab profile | OPEN (deferred, P4U-16) | Unchanged |
| m-6 | No pad-fit or pitch check; via-in-pad DFM | PARTLY (P4U-15) | From 100 vias up there is a hint covering the hole-to-hole limit and solder wicking (T11). There is still no fit check |
| m-7 | One-way link | FIXED | The self-heating page links to `#/calc/fusing` |
| m-8 | Sub-ms pulse info only | FIXED | F11 (65 ns) shows the `SUB_MS_PULSE` warning: magnetic forces and vaporisation are not modelled, and 1 ms is a product choice |
| m-9 | Export; series thermal-path builder | OPEN (deferred, P4U-16) | Feature request |

## Method

- Read the following:
  - `src/ui/calculators/{fusing,thermal-via}.vm.ts` and `Fusing.tsx`;
  - the `placeholder` and `underHeadline` wiring in `ThermalVia.tsx` and `ResultsPanel.tsx`;
  - the fusing and thermal-via warning texts in `src/core/calculators/*/calc.ts`;
  - ledger row S-045 and OPEN_RISKS CF and P4U rows.
- Ran 32 scenarios through the view-model `computeView()`. This path covers text parsing, units, core compute, display formatting, headline suppression and warning order.
  - The runner was a scratch vitest file in the session scratchpad, run with the repo's vitest binary and a throw-away config.
  - No worktree, no install, no `node_modules` change. The scratch files were deleted afterwards.
- Browser: no Playwright MCP tool was available in this session. I confirmed that the preview on :4173 serves the current build:
  - `index-DMZ_AAuX.js` is the same in the served page and `dist/`;
  - `Fusing-KGpSmRuW.js` returns 200 and contains the "Not meaningful for this model" string;
  - `ThermalVia-BaUusTX_.js` contains the drill-basis option text.
  - Keyboard, contrast and screen-reader checks remain with the human (P4U-17).
- Hand checks (adiabatic K = 5.051e16 A²·s/m⁴, ln-term to melting 1.626 from 25 °C):

| Case | Hand value | Tool |
|---|---|---|
| End-temperature ln-term to 300 °C: ln(534.45/259.45) | 0.7226 (0.444 of melting) | 10 mil 1 oz: 2.9 A²s and 29 ms (F2) |
| Via barrel, 0.25 mm finished, 18 µm: A = π·18e-6·268e-6 | 1.5155e-8 m², I²t 18.9 A²s, 43.4 A at 10 ms | 0.0152 mm², 19 A²s, 43 A (F8) |
| 2 mm × 35 µm, 12 A | I²t 402 A²s, 2.79 s | 400 A²s, 2.8 s (F5) |
| Thermal via, 0.3 mm drill, 18 µm (fab average) | d = 0.264 mm, A = 1.595e-8 m², θ1 = 250.2 K/W, θ9 = 27.8 K/W | 260 K/W (rounded up), 28 K/W (T9) |

### Scenario results (new run)

| # | Scenario | Result | Judgement |
|---|---|---|---|
| T1 | Empty form | Seven "needs" lines, including the diameter basis | Good |
| T2 | 0.3 mm with no basis | Needs input only: "Choose the diameter basis…" | Good: gated |
| T3 | 0.3 mm **drill**, 25 µm, 1.6 mm, 9 vias, pure Cu, unfilled, 2 W | 21 K/W, 41.1 Δ°C, finished 0.25 mm shown | Correct and conservative |
| T4 | 0.25 mm **finished**, same | 21 K/W (identical to T3) | Correct |
| T5 | 0.3 mm **finished** | 18 K/W | Correct; the user owns the basis |
| T6 | 0.3 mm drill, 0.15 mm plating | Refused: "plating must be thinner than D/2 … check the units and the diameter basis" | Good |
| T7 | 0.3 mm drill, 0.12 mm plating | 6.6 K/W; PLATING_EXCEEDS_HOLE pinned first | Acceptable |
| T8 | Imperial: 12 mil drill, 1 mil, 62 mil, 16 vias, C11000 | 12 K/W, finished 10 mil | Units fine |
| T9 | Fab AVERAGE 18 µm, 0.3 mm drill | 28 K/W plus the AVERAGE caution | Good |
| T10 | Copper-filled (390 W/mK), drill basis | 6.4 K/W | Plausible |
| T11 | N = 10 000, 100 W | 0.019 K/W, with the ≥100-via fit and wicking hint | Hint present; no fit check (m-6) |
| T12 | Hash `db=drll` | Notice, basis blank, no result | Good |
| F1 | 10 mil 1 oz, 25 °C, 10 A | 65 ms; board-damage warning first | Correct |
| F2 | Same + Te 300 °C | 65 ms headline; rows show 29 ms and 2.9 A²s to "your end temperature (your value, not checked)" | Good (see m-N4) |
| F3, F4 | 2 mm 1 oz, 5 A (± Te 300 °C) | "Not meaningful…" headline; 16 s kept as labelled detail; Te row 7.2 s | M-5 fixed. Wording: m-N1 |
| F5 | 2 mm 1 oz, 12 A | 2.8 s, 1 s warning under the headline | Good |
| F6, F17 | 30 s pulse (± Te) | Headline suppressed; 3.7 A kept as labelled detail | Good. Wording: m-N1 |
| F7 | 0.25 mm 1 oz, I²t 2 A²s, Te 300 °C | Headline 0.32 "not a safety margin"; row 0.72 to Te; NO_DURATION caution | M-1 fixed (see m-N4) |
| F8, F9 | Via barrel 0.25/18 µm at 10 ms; 0.3/25 µm at 20 A | 43 A; 130 ms; VIA_BARREL_PLATING caution | Correct |
| F10 | Via, plating blank | Needs input | Good |
| F11 | 10 mil at 10 kA | 65 ns with the SUB_MS_PULSE warning | Good |
| F12, F13 | Te 20 °C (below the initial temperature); Te 1200 °C | Both refused with clear messages | Good |
| F14 | Area "100 cmil" | Refused; the hint now says "not cmil" | Acceptable |
| F15 | "1 oz/ft2" with no basis | Converted, nominal, THICKNESS_NOMINAL warning names both directions | Good |
| F16, F19 | 2 mm 1 oz at 8 A / 7 A, Te 200 / 150 °C | 6.3 s / 8.2 s with the 1 s warning under the headline; Te rows 2 s | Good |
| F18 | Te "300 K" (26.85 °C, 1.85 K above the start) | 280 µs to "your end temperature", no plausibility note | m-N3 |
| F20 | 5 s pulse, Te 300 °C | 9 A to melting, 6 A to Te, 1 s warning under the headline | Good |

## New findings (all MINOR; log in the `OPEN_RISKS.md` backlog)

**m-N1. The "Not meaningful" headline makes a claim it cannot support.** The text is "the conductor would not fuse in a short pulse; use the self-heating calculator".
- In time mode (F6: "what current melts it in 30 s?") the sentence does not answer the question that was asked.
- In current mode, "would not fuse" reads as a reassurance. The adiabatic model only says that heat loss to the board dominates here. It does not say the trace is fine: a narrow trace in a hot or potted enclosure can still run away at steady state.
- Suggested text: "Outside this model: beyond 10 s, heat loss to the board and air dominates and the adiabatic answer has no meaning. For continuous or long currents, use trace self-heating."
- When an end temperature is given, apply the same 1 s / 10 s cue to the end-temperature rows. In F4 the Te row shows 7.2 s next to a "not meaningful" headline, with no cue of its own.
- Owner: ui-engineer (text); calc-implementer (optional codes for the Te time).

**m-N2. The diameter-basis help should name the fab convention, and my earlier M-4 wording overstated it.**
- I wrote that 0.3 mm is "the canonical drill size" and that CAD and fab forms "usually ask for the drill". For plated holes that is not the common fab convention. Eurocircuits reads every hole size in the data as the **finished** size, and drills plated holes at finished + 0.100 mm ([Eurocircuits, drilled holes](https://www.eurocircuits.com/pcb-design-guidelines-drilled-holes/)). JLCPCB states its plated-hole tolerance against the hole size you design: +0.13 / −0.08 mm, so a 1.00 mm hole finishes at 0.92 to 1.13 mm ([JLCPCB capabilities](https://api.jlcpcb.com/capabilities/Capabilities)).
- The required basis is still the right fix, and choosing "drill" when the number is really finished errs conservative (θ high). But the help should guide the choice. Add to `DIAMETER_HELP`: "Many fabricators read the hole size in your CAD/drill data as the FINISHED hole and drill larger; if unsure, ask your fabricator. Choosing drill when it is finished overstates θ (conservative)." No fab allowance number should be built in; any number belongs in a fab profile.
- Owner: ui-engineer (text), standards-researcher (ledger note on fab hole-size conventions).

**m-N3. End-temperature plausibility.**
- F18: "300 K" is accepted as 26.85 °C, 1.85 K above the start, and gives 280 µs to "your end temperature". The unit is legitimate, but no laminate damage criterion is that close to the start temperature.
- Add a caution, not a refusal, when Te − Ta is small or Te is below about 100 °C: "check the unit; K is absolute". Label the threshold as a product choice.
- Owner: calc-implementer.

**m-N4. When the user gives an end temperature, it is their failure criterion, but the headline still shows the melting result.**
- In F7 the headline 0.32 sits above the row 0.72, the number that answers their question. The labels are honest, so this is not a safety finding.
- Consider showing the Te result as a second headline line, or as the headline when Te is entered, labelled "your value, not checked".
- Owner: ui-engineer.

**m-N5. The fusing via barrel accepts only the finished hole: no drill basis and no N-parallel. This is deferred under P4U-16 and must stay logged.**
- The thermal-via page now trains users to pick "drill". A designer who then types the 0.3 mm drill into the fusing via field (labelled "finished, not the drill", with no placeholder) gets an area 13 to 18 % high. Melting I²t and time are then **27 to 39 % optimistic** (18 to 25 µm plating).
- Reuse the S-041 drill form and the same required basis selector here, so the two pages behave the same.
- Owner: calc-implementer, ui-engineer.

**m-N6. Warning placement (observation, no change required).**
- `THERMAL_RELIEF_NOT_MODELLED` and `WEAKEST_LINK` are first or near the top of the warning list, but the list renders after the ledger badges and validity checks.
- If a later pass trims the page, promote the relief warning to a third callout on the thermal-via page. In practice it is the most common reason a via array underperforms.
- Owner: ui-engineer.

## Would I trust this on a real board?

- **Thermal via:** yes, as a barrel-conduction number. The diameter basis is forced, the plating is never pre-filled, the AVERAGE caveat is there, and the relief, receiving-plane, not-θJA and spreading caveats are visible. I would still pair it with a spreading or FEA estimate for the system θ. The page says so.
- **Fusing:** yes, for fault-coordination screening:
  - "will this trace or via survive until the fuse clears", using the end temperature from my laminate datasheet and the fuse's clearing I²t;
  - a first look at "which element goes first", using the via geometry plus the weakest-link caution.
- Not as a trace-as-fuse design, and the page says that plainly in four places.
- Remaining workflow gaps (deferred P4U-16): no stackup or fab-profile hand-off, no export, no series thermal path.

## Conditions for closure

None from this reviewer. Log m-N1 to m-N6 as backlog in `docs/validation/OPEN_RISKS.md`. Keep m-5, m-6, m-9 and m-N5 in the P4U-16 deferral row. The human browser pass (P4U-17) is still open and outside this report.
