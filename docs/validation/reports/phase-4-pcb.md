# Phase 4 PCB domain review: thermal via array and fusing

Reviewer: pcb-domain-reviewer (practising PCB / power hardware lens). Branch `phase-4`, head `3420891`. Date 2026-10-19.
I did not edit `src/` or `tests/`.

## Verdict: **PASS-WITH-CONDITIONS**

Both pages are honest. Neither one presents a number as safe, a rating or a design constant:
- Required inputs have no hidden defaults: plating thickness, copper k, via fill, initial temperature and thickness basis.
- "Not theta-JA" and "not a fuse rating" appear as callouts directly under the headline. They also appear in the always-visible status block.
- Fusing is clearly separated from steady-state heating.
- The arithmetic matches my hand checks (below).

Nothing is a BLOCKER. Five MAJOR findings are conditions. The biggest problems are what the pages leave out, and two cases where a busy engineer would read the result the wrong way:
- **Fusing** is fixed to the copper melting point. On a real board, damage starts several hundred °C lower (M-1).
- **Fusing** never points out vias and necks, which are usually the elements that fuse first (M-2).
- **Thermal via** says nothing about thermal-relief spokes or the plane connection, which are the usual weak link (M-3).
- **Thermal via** asks for the finished hole but uses the typical *drill* size as its placeholder (M-4).
- **Fusing** shows a confident headline in seconds even where the model is meaningless (M-5).

Log M-1 to M-5 in `docs/validation/OPEN_RISKS.md` if they are not fixed before closure.

## Method

- Read the core and UI code:
  - `src/core/calculators/thermal-via/{calc,guards,meta}.ts` and `src/core/calculators/fusing/{calc,guards,meta}.ts`
  - `src/ui/calculators/{ThermalVia,Fusing}.tsx`, `thermal-via.vm.ts`, `fusing.vm.ts`, `ResultsPanel.tsx`, `registry.ts`
  - ledger rows S-040 to S-042f
- Ran 32 scenarios through the view-model `computeView()`. This path covers text parsing, units, core compute and display formatting.
  - The runner was a scratch vitest file in the session scratchpad, run with the repo's own vitest binary and a throw-away config.
  - No worktree, no install, no `node_modules` change.
- Playwright is not available in this session: no MCP tool, and no `playwright` package in `node_modules`. I confirmed that the preview on :4173 serves the current build: the `ThermalVia-GRX66l_b.js` and `Fusing-DwXqfORV.js` chunks return 200 and match `dist/`. I reviewed the rendered layout from the components (`ResultsPanel` order: headline, callouts, ledger badges, validity checks, warnings, confidence, rows, recommendation, details).
- Hand checks:
  - Single via, finished hole 0.3 mm, plating 25 µm, L 1.6 mm, k 401: A = π·25e-6·325e-6 = 2.5525e-8 m², θ = 1.6e-3 / (401·2.5525e-8) = **156.3 K/W**. The tool gives 156.3 K/W. For 9 vias, 17.37 K/W, displayed "18 K/W" (rounded up, the conservative side for a lower bound).
  - Fusing, 10 mil × 35 µm at 25 °C: K = 8890·385 / (1.7241e-8·0.00393) = 5.051e16, ln(1319.07/259.45) = 1.626, I²t = 7.90e-17·5.051e16·1.626 = **6.49 A²s**. The tool gives 6.49 A²s (65 ms at 10 A), and Onderdonk gives 6.59 A²s.

### Scenario results

| # | Scenario | Result | Judgement |
|---|---|---|---|
| T1 | Empty form | Six "needs" lines, no number | Good: gated |
| T2 | QFN thermal pad, 3×3 array: 0.3 mm (typed as finished), 25 µm, 1.6 mm, 9 vias, pure Cu, unfilled, 2 W | 18 K/W, ΔT 34.8 Δ°C, low confidence, both callouts | Correct arithmetic. But 0.3 mm is the usual *drill* size (see T3, M-4) |
| T3 | Same with finished 0.25 mm (0.3 drill − 2×25 µm), C11000 | 22 K/W, ΔT 42 Δ°C | Entering the drill as finished gives a θ about 18 % low (non-conservative) |
| T4 | Fab AVERAGE plating 18 µm | 25 K/W plus a FAB_AVERAGE caution | Good |
| T5 | Epoxy-filled, k_fill 0.25 W/mK | 21 K/W vs 21.05 unfilled: the fill adds about 0.2 % | Honest: non-conductive fill does not help heat flow |
| T6 | Copper-filled (k_fill 390) | 6.4 K/W | Plausible, about 3.3× better than unfilled |
| T7 | Imperial: 10 mil, 1 mil plating, 62 mil, 16 vias | 12 K/W | Units fine |
| T8 | Plating "1" with no unit / "1 oz/ft2" | Refused: missing unit / wrong dimension | Good |
| T9 | Plating 0.4 mm on a 0.3 mm hole | 0.51 K/W with a PLATING_EXCEEDS_HOLE warning, confidence forced low | Acceptable: pinned warning |
| T10 | N = 10 000, 100 W | 0.016 K/W, ΔT 1.6 Δ°C, no pad-fit sanity check | m-6 |
| T11 | Microvia 0.1 mm / 15 µm / 0.1 mm, 4 vias | 12 K/W | Plausible |
| T12 | Count "2.5" | Refused | Good |
| F1 | Empty form | Needs geometry, temperature and mode, no number | Good |
| F2 | 10 mil, 35 µm finished, 25 °C, 10 A | 65 ms, Onderdonk 66 ms, conf low | Correct |
| F3 | Same thickness typed as "1 oz/ft2" | Converted to 35 µm, basis forced to nominal, THICKNESS_NOMINAL warning | Good |
| F4 | 2 mm × 35 µm, 85 °C start, 50 A | 140 ms | Plausible |
| F5 | 2 mm × 35 µm, 10 ms pulse | 200 A | Plausible for the adiabatic case |
| F6 | 2 mm × 35 µm, **5 A** | Headline **"16 s"** with OVER_1S and critical OVER_10S | This trace carries 5 A continuously at a modest rise and never melts. The headline would embarrass in review (M-5) |
| F7 | 0.25 mm trace, fuse I²t 2 A²s | Headline "0.32" (fraction of the melting I²t) | Reads as "3× margin". To a 300 °C limit the fraction is 0.72 (M-1) |
| F8 | AWG30-size wire, 1 s | 14.6 A, Preece 10.3 A in a collapsed panel | OK |
| F9 | Thickness or temperature without a unit, temperature as "25 ΔK" | Refused with clear messages | Good |
| F10 | 77 °F start | Same as 25 °C | Good |
| F11 | Area "100 cmil" | **Refused: unknown unit "cmil"**, although the field hint says "mm2, mil2 or cmil" | m-1 |
| F12 | 10 mil at 10 kA | 65 ns, only an info-level uniform-current note | m-8 |
| F13 | Start at 1000 °C | 2.6 ms, failed plausibility check, conf low | OK |

## Findings

### MAJOR

**M-1. Fusing only computes to the copper melting point. On a PCB, damage happens far below it, so the I²t "fraction" reads as a large margin.**
- I use this page mostly for fault coordination: will the trace survive until the fuse or eFuse clears? The useful end temperature for that question is a board-damage temperature, not 1084.6 °C. For example, Isola 370HR has Tg 180 °C and Td 340 °C ([Isola 370HR datasheet](https://www.isola-group.com/wp-content/uploads/data-sheets/370hr.pdf)). Lifted pads and charring happen long before copper melts.
- The adiabatic I²t to 300 °C is **0.444×** the I²t to melting, and to 260 °C it is 0.397×. In F7 the user sees "0.32" and reads about 3× margin. Against 300 °C the real figure is 0.72, about 1.4× margin.
- The REACH text says "A trace can also fail earlier (delamination…)", but the page gives no way to quantify that.
- Fix:
  - Add an optional *end temperature* choice: "copper melting point (S-042c)" or "a temperature I enter (laminate Td, Tg, solder reflow…)", with no default value. The S-042a derivation already holds for any final temperature.
  - Relabel the fraction headline "fraction of the I²t to reach <end temperature>: not a safety margin".
- Owner: calc-implementer (core option), ui-engineer (field and labels), standards-researcher (confirm that S-042a covers an arbitrary end temperature; no laminate value goes in the ledger as a default).

**M-2. Fusing gives no weakest-link guidance: vias, necks and pad entries in series usually fuse first.**
- The page offers trace, wire or area, and nothing for a via barrel. A single 0.3 mm via with 18 µm plating has a cross-section of about 1.6e-8 m². That is about half the cross-section of a 1 mm × 35 µm trace feeding it, so the via fuses first. The same is true for a 0.25 mm neck-down at a pad or a pour neck.
- The core result schema already has element kinds `via`, `spoke` and `pour-neck`, but this page does not use them.
- Fix:
  - Add a "via barrel" geometry: finished hole (or drill) plus plating, area π·t·(d + t), reusing S-041 geometry, with an N-vias-in-parallel option.
  - Add an always-visible caution: "The smallest cross-section in the path fuses first (vias, necks, pad entries). Check each one."
- Owner: calc-implementer, ui-engineer.

**M-3. The thermal via page never mentions thermal-relief spokes or how the vias connect to the plane.**
- In practice, the usual reasons a via array does nothing are:
  - the CAD tool's plane connect style puts thermal reliefs on the vias;
  - the vias land on a small island instead of a plane;
  - the bottom copper is cut up.
- RECEIVING_TEXT covers "no receiving plane" but not reliefs. A 1-D θ of 18 K/W can become several times worse through four 0.25 mm spokes per via.
- Fix: add a caution: "The vias must be solid-connected (no thermal-relief spokes) to the pad and to the receiving plane; check the plane connect style in your CAD rules." Also consider an input "connection to plane: solid / thermal relief / unknown". Relief or unknown would add a warning and lower the confidence.
- Owner: ui-engineer (text), standards-researcher (find a public app-note source for the solid-connect advice before adding any number).

**M-4. Drill diameter vs finished hole: the placeholder invites the non-conservative mistake.**
- The field is labelled "Finished hole diameter (not the drill)", which is correct. But the placeholder and example are "0.3 mm", the canonical *drill* size, and CAD tools and fab order forms usually ask for the drill.
- Entering a 0.3 mm drill as the finished hole (T2 vs T3, 25 µm plating) gives θ = 17.4 instead of 21.1 K/W, about 18 % optimistic, on top of a result that is already a lower bound.
- S-041 already records the drill form A = π·t·(D − t).
- Fix: add a "diameter basis: drill / finished hole" selector with no default, and change the placeholder to something that is clearly finished (for example 0.25 mm).
- Owner: calc-implementer (accept a drill basis in core), ui-engineer.

**M-5. Fusing shows a big headline time where the model has no meaning.**
- F6: a 2 mm 1 oz trace at 5 A shows **"16 s"** at headline size. The OVER_10S critical warning sits below the callouts, ledger badges and validity list. That trace runs at steady state indefinitely.
- In time mode the risk is the reverse. "Current that melts the trace in 30 s" gives a small current that a designer could take as the current at which a trace-as-fuse opens. Brooks and Adam report real trace fusing currents of 1.5 to 6 times the Onderdonk value (S-042e).
- Fix:
  - When the time or pulse is longer than the 10 s product threshold, replace the headline value with "Not meaningful: the board cools the trace; use trace self-heating (steady-state)". Keep the number in the rows, labelled.
  - Between 1 s and 10 s, show the OVER_1S warning directly under the headline, not after the validity list.
- Owner: ui-engineer.

### MINOR

- **m-1. The area field advertises "cmil", but the parser rejects it (F11).** Onderdonk users think in circular mils. Either add `cmil` to the units table (S-006 already holds the arithmetic) or change the hint to "mm2 or mil2". Owner: units-engine-engineer / ui-engineer.
- **m-2. "Lower bound" is stated without conditions, but ignoring the dielectric between vias makes the via-only θ an over-estimate.**
  - The ledger itself says that excluding the dielectric "overstates θ" (S-041b).
  - Example: one via under a 10 × 10 mm pad on 1.6 mm FR-4 (k ≈ 0.3) has a laminate path of about 53 K/W in parallel with the 156 K/W via. On thermally conductive prepregs the laminate path matters even more.
  - Fix: reword to "usually a lower bound because spreading is ignored. For sparse arrays under large pads, or on high-k laminates, the laminate path (not modelled) can make the real through-board resistance lower."
  - Owner: calc-implementer (text).
- **m-3. The Onderdonk-to-adiabatic ratio displays as "1" (true value 1.0156).** This looks like perfect agreement. Show 3 significant figures for this ratio. Owner: ui-engineer.
- **m-4. The I²t help should say which fuse I²t to use.** It should be the fuse's total *clearing* I²t at the prospective fault current, not the melting (pre-arcing) I²t, and the datasheet curve at the actual fault current. Owner: ui-engineer (text), standards-researcher (cite a fuse maker's application note).
- **m-5. Neither page is wired to the shared stackup or the fab profile.**
  - Barrel length is not offered from the stackup board thickness or the layer span.
  - The "fabricator AVERAGE" radio only labels a value the user typed. It does not pull `holePlatingAverage` from the active profile.
  - On fusing, the trace thickness is not offered from the stackup's finished copper.
  - Fix: add "use stackup / fab profile" buttons that fill the field and show where the value came from. Owner: ui-engineer.
- **m-6. There is no pad-fit or pitch check, and no via-in-pad DFM note.**
  - N is unbounded (T10: 10 000 vias accepted).
  - There is no pad size or pitch input to show whether N vias fit at the fab's hole-to-hole limit (S-019k, from the profile).
  - Open vias in an exposed pad wick solder. Public guidance conflicts:
    - TI recommends vias of 0.3 mm or smaller at about 1 mm spacing, not covered by solder mask ([TI SLOA122](https://ti.com/lit/sloa122)).
    - MACOM recommends mask over the via areas to stop wicking ([MACOM S2083](https://cdn.macom.com/applicationnotes/S2083_V18.pdf)).
    - TI package notes suggest filled, plugged or tented vias ([TI QFN/SON attachment SLUA271B](https://docs.ampnuts.ru/ti.com.datasheet/BQ24020/Application_note_SLUA271B.PDF)).
  - Fix: add a caution that names this conflict, and an optional pad-size / pitch fit check against the fab profile. Owner: standards-researcher, ui-engineer.
- **m-7. The separation is one-way.** Fusing links to self-heating, but self-heating has no "short pulse / fault: see fusing" link. Owner: ui-engineer.
- **m-8. Very short pulses get a number with only an info-level note** (F12: 65 ns at 10 kA). Raise UNIFORM_CURRENT to a caution when the solved or entered time is in the sub-millisecond range, and say plainly that magnetic forces and explosive vaporisation are not modelled. Label any threshold as a product choice. Owner: calc-implementer.
- **m-9. Workflow gaps I would need daily.**
  - No copy or export of the result block for a design review.
  - No series thermal-path builder (θJC + TIM/solder + via array + spreading + plane-to-air) with each element and its source shown, the thermal analogue of the path-load calculator.
  - Not a condition for this phase. Log it as a feature request. Owner: ui-engineer (export), calc-implementer (path builder, future phase).

### Questions the caller asked

- **Is a 1-D thermal via result realistic?** It is right as a via-barrel number, and it is clearly labelled as one. Real boards are dominated by spreading in the pad and plane and by the plane-to-ambient path (Guenin 2004: the 1-D model is 10 to 27 % low; Brooks and Adam 2024: with no plane the vias have almost zero effect). Those caveats are on the page, prominently. The missing piece is the plane connection (M-3).
- **Is the adiabatic fusing time realistic for PCB traces?** It is conservative for "will it survive" and non-conservative for "will it open". The page says both clearly, and quotes the 1 to 1.5 s board-cooling onset. M-1 and M-5 are about making the number useful and stopping it from being shown where it means nothing.
- **Could someone use the fusing time as a fuse rating?** Strongly guarded: callout, status block, recommendation and live-region text. Acceptable.
- **Could someone use θ from the vias as θJA?** Guarded by a callout and a status line. Acceptable.
- **Is the specific-heat default of 385 acceptable?** Yes. The spread between sourced values is 0.7 %. The default is shown as a default and lowers confidence. The 32 % rise of c with temperature is disclosed, and it makes the time err short, which is the right side for survival checks.
- **Thickness basis and oz conversion:** good. A foil weight forces the nominal basis and adds a warning, a bare number is refused, and a temperature typed as a Δ is refused. One improvement: the nominal warning names only the "thinner fuses sooner" direction. Outer layers after plating are usually *thicker* than nominal. Saying both directions would help (fold into m-4 text work).
- **Is it acceptable that confidence is always low?** Yes, for two estimate-class methods with CONFLICT data. The reasons list says why, which is what matters. The badge itself never moves, so the warnings and callouts do the real work. That is acceptable here.
- **Wording:** clear, if long. The "not checked" IPC-scope state for fusing is shown as neither pass nor fail, which is correct.

## Conditions for closure

M-1 to M-5 are fixed, or logged in `docs/validation/OPEN_RISKS.md` with an owner and a target phase. Minor findings can be tracked as backlog.
