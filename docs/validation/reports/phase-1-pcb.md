# Phase 1 PCB domain review (interim): tasks 1-3 and circuit values slice 1

- **Reviewer:** pcb-domain-reviewer, from the point of view of a practising PCB / hardware designer (power, mixed-signal).
- **Date:** 2026-10-11. **Branch:** `phase-1-task-3`, head `c9efd83` (the app code is the same as `67ac40d`).
- **Edits:** I did not edit `src/` or `tests/`. This report is my only file. I created no screenshots and no `.playwright-mcp` folder. The scratch Chrome profile was in the session scratchpad and has been deleted.
- **Interim scope:** copper converter, trace width (Mode B legacy), trace resistance, Ohm/power, resistor divider and E-series. Tasks 4-10 are not built yet: self-heating, voltage drop, path/load with weakest link, vias and annular ring, envelope/sensitivity, and cross-checks. Where my brief asks about vias, pads, necking, annular ring and net-class export, I record these as phase-end watch items, not defects.
- **Prior reports read:** `phase-1-calc.md` (PASS-WITH-CONDITIONS, F-1..F-4) and `phase-1-phase.md` (PASS-WITH-CONDITIONS, PV-1..PV-10). I did not repeat their numerics or their gate runs.

## Verdict: PASS-WITH-CONDITIONS (interim)

The numbers are right; I checked every scenario below by hand. The labelling of the legacy method is honest. Inputs are gated properly: no default layer, units are required, and ΔT is kept apart from absolute temperature. The page also says what the method ignores.

I found no BLOCKER. Four MAJOR findings would embarrass the tool in a design review, and they must be fixed before the phase closes:
- copper weight semantics against what fabs actually sell (PCB-1);
- the outer-layer +37 % caution and the "base + plating" estimate, which push the user to the non-conservative side (PCB-2);
- the recommended values for width and current contradict each other (PCB-3);
- the trace-resistance voltage drop does not say it covers one conductor, one way, trace only (PCB-4).

There is also one MAJOR on the divider: no resistor voltage rating at high Vin (PCB-5).

## Method

- I ran the built app at `http://localhost:4173/` in headless Chrome (`--dump-dom`). The Playwright MCP was not available to this agent. Each scenario was a shared-link hash, so it also tests the URL workflow.
- I recomputed the key values by hand.
- I compared the fab assumptions with the published JLCPCB pages (sources at the end).

## Scenario battery (rendered results)

| # | Scenario | App result | My check | Comment |
|---|---|---|---|---|
| 1 | Trace width: 2 A, outer, 1 oz, ΔT 10 °C | 0.782 mm (30.77 mil); recommended ×1.25 = 0.977 mm; confidence low (score 9) | 2/(0.048·10^0.44) = 15.13 → A = 42.4 mil², / 1.378 = 30.77 mil. Correct. | Plausible and the same as the familiar legacy calculators. The Steps list shows **0.781 mm** and 73.1 A/mm², but the headline shows 0.782 mm and 73.2 A/mm² (PCB-9). |
| 2 | Trace width: 10 A, outer, 2 oz, ΔT 20 °C | 2.362 mm (93.0 mil); recommended 2.953 mm | Correct | Realistic power trace |
| 3 | Trace width: 10 A, **inner, 0.5 oz** (the JLC default inner), ΔT 20 °C | 24.58 mm (967.6 mil); width check failed; extrapolation warning; INNER_K_CONSERVATIVE caution | Correct per the fit | Warns properly. The −35 % S-009 inner shortfall appears only in the "Why" list, not in the numbers (PCB-6). |
| 4 | Current capacity: 0.2 mm, outer, 1 oz, ΔT 10 °C | 744 mA; recommended ×0.8 = 595 mA | 10.85 mil² → 0.744 A. Correct. | |
| 5 | ΔT: 3 A in 1 mm, outer, 1 oz, ambient 70 °C, max 105 °C | 16.8 Δ°C; 86.74 °C "Within range ✔ maximum conductor temperature within allowed (105 °C)" | 16.74 Δ°C. Correct. | The fit does not depend on ambient. At 70 °C copper resistance is about 18 % higher than at 25 °C, and nothing says so. A green tick under "Validity checks" reads as a design pass (PCB-8). |
| 6 | Round trip: the recommended width from #1 (0.977 mm) solved back for current | 2.35 A capacity; **recommended 1.88 A** | 2·1.25^0.725 = 2.352. Correct. | **The tool recommends a width for 2 A and then says that width should carry only 1.88 A** (PCB-3). |
| 7 | Trace resistance: 5 V / 3 A buck output, 40 mm × 1.5 mm, outer, 1 oz, 25 °C + 20 Δ°C | 14.43 mΩ; drop 43.29 mV; loss 129.9 mW; confidence medium | ρ(45 °C) = 1.8935e-8 → 14.43 mΩ. Correct. | Nothing says this is one conductor, one way, with no return path, vias, pads or connector (PCB-4) |
| 8 | Divider: 48 V → 3.3 V, R2 1k, 1 % parts, Vin 5 %, RL 100k, solve R1 | R1 13.41 kΩ (exact, labelled "not a stock value"); 3.077-3.530 V; P(R1) 149 mW; confidence **high** | Correct | The RL tolerance is the 1 % resistor tolerance (PCB-7). The 2× power note is good. |
| 9 | Divider: **400 V** → 2.5 V, R2 10k, E96 nearest | R1 1.58 MΩ, 100 mW, confidence medium, **0 cautions** | Correct (ideal 1.59 MΩ) | 397 V across one resistor, with no word on element working voltage or creepage (PCB-5) |
| 10 | E-series: 3.3k in E6; pair search 3.3k series E12 | Nearest 3.3k exact; best pair 1.5k + 1.8k, then 10 Ω + 3.3 kΩ ... | Correct | It does not say that a single E12 value (3.3k) already hits the target (PCB-12) |
| 11 | Ohm/power: 3 A in R010 / 10m / 10 mΩ | 30 mV, 90 mW, confidence high | Correct | "mR" is rejected with a clear message listing the accepted units. Good. |
| 12 | Copper converter: 1 oz outer; plus 25 µm plating | 35 µm; "usually finishes thicker ... about +37 %"; estimated finished thickness **60 µm** | Arithmetic correct | JLC publishes 1.6 mil (about 41 µm) finished for a 1 oz outer (PCB-1, PCB-2) |
| 13 | Misuse: width "12" with no unit; "12 mils"; ΔT typed as "283 K" | Rejected ("Missing unit"); 1.01 A; 0.04 mm (1.56 mil), with a failed check and confidence low | | Unit discipline is good. A 1.56 mil width is shown as a headline even though it is below every fab minimum, and the fab profile is not consulted (PCB-10). |

## What I would trust today

- **Legacy labelling.**
  - The method is shown as "IPC-2221 legacy (Mode B)" on the page title, the method line and the inputs.
  - A mandatory caution says "Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability."
  - Mode A is disabled, so nothing is silently substituted.
  - I could not mistake the legacy result for an IPC-2152 one.
- **Confidence is honest.** Trace width is always "low" (score 9) because of the paywalled data and the empirical fit, and the reasons are listed. That matches how I would rate a legacy chart fit.
- **Input gating.**
  - There is no default copper layer.
  - Bare numbers are refused.
  - ΔT and absolute temperature are separate dimensions, with explicit help ("10 °C here means 10 degrees of heating").
  - Defaults (ambient 25 °C, margin 1.25, derating 0.8) are flagged as "engineering default, not from a standard" in three places.
- **Weakest-link honesty (as far as built).** The trace-width assumptions say the equation "ignores neighbouring copper, planes, vias and board thermal paths". The trace-resistance assumptions say "etch factor, plating and surface roughness are not modelled".
- **Directional rounding.** Minimum widths round up and capacities round down. The E-series error is rounded up in size.
- **Shareable URLs** reproduce every scenario exactly. Each page leads with a quick answer and keeps the details below.
- **Divider.** An unsnapped solved resistor says "exact value, not a stock value". The divider shows the power in each resistor with a 2× rating note.

## Findings

| # | Sev. | Finding and evidence | Concrete fix | Owner |
|---|---|---|---|---|
| PCB-1 | MAJOR | **Copper-weight meaning does not match what fabs sell.** The trace-width and converter help says the weight is "Nominal foil, not finished copper". The bundled fab profile `jlcpcb-2026-10-06.json` says "1 oz is the base outer copper only". JLCPCB's capabilities page actually lists "Outer layer copper (finished)" and says "Finished copper weight of inner layer is 0.5oz by default". Its laminate page gives finished values of 1.6 mil for a 1 oz outer, 0.6 mil for a 0.5 oz inner and 1.2 mil for a 1 oz inner, and says "The copper thickness in the laminate is the finished product copper thickness". So the weight a user reads off a fab order form is a *finished* weight, and the tool's framing and profile note are wrong for the most common hobby/prototype fab. At JLC a 1 oz inner finishes at 30.5 µm (−13 %), not 35 µm. | (a) Ask "Is this weight from a fab order form (finished) or a foil spec (base)?" and record the answer in `copperBasis`. (b) Correct the profile note and add per-layer finished thicknesses (outer 1 oz 1.6 mil; inner 0.5 oz 0.6 mil; inner 1 oz 1.2 mil; inner default 0.5 oz) with the date and URL. (c) When a fab profile is selected, offer its finished thickness as the copper input. | standards-researcher (profile/ledger S-008), calc-implementer, ui-engineer |
| PCB-2 | MAJOR | **The outer-layer caution and the plating estimate lean non-conservative.** The converter says outer copper "usually finishes thicker ... about +37 % (S-009)". The S-009 figures are IPC-6012 *minimums indexed by starting foil*, and the confidence text itself says "minimums, not typical values"; the two messages contradict each other. The converter's "Estimated finished thickness (base + plating)" gives **60 µm** for 1 oz + 25 µm, against JLC's published 1.6 mil (≈ 41 µm) for an ordered 1 oz outer. It ignores that a "1 oz finished" outer often starts from ½ oz foil, and it ignores processing loss (iConnect007 models about 3 µm). A user who copies 48-60 µm into trace width as "finished" gets a trace 15-30 % narrower than the fab will deliver. | Reword to: "IPC-6012 minimum finished thickness for 1 oz *starting* foil (secondhand): 47.9 µm. Your fab's '1 oz outer' may be a finished target from ½ oz foil; JLC publishes 1.6 mil." Drop "usually". Label the plating estimate "upper estimate; use the fab's finished value", and give it no role as a design input. | calc-implementer, ui-engineer, standards-researcher |
| PCB-3 | MAJOR | **The recommended width and the recommended current contradict each other.** The 1.25 margin on width is about a 1.18× current margin (1.25^0.725). The 0.8 derating on current is a 1.25× current margin. Scenario 6: the recommended width for 2 A (0.977 mm) solved back for current gives a recommended **1.88 A**, which is less than the 2 A it was sized for. A reviewer who checks the tool's own answer this way will stop trusting it. | Define one margin on one quantity, for example a current margin, and derive the width margin from it (width ×1.25^(1/0.725) = 1.36). Or show the equivalent current headroom and ΔT next to the recommended width ("this width carries 2.35 A at 10 Δ°C, or 2 A at about 6.9 Δ°C"). Add a round-trip property test. | calc-implementer, test-engineer |
| PCB-4 | MAJOR | **The trace-resistance voltage drop and power are shown with no scope statement.** Scenario 7 shows "Voltage drop 43.29 mV" for a 5 V / 3 A path. Nothing says it is one conductor, one way, trace only. It excludes the return path (×2 for a trace return), vias, pads, connector contacts and pour necking. A rushed engineer will compare 43 mV with a 2 % rail budget and approve it. | Label the drop "this trace only, one direction". Add an assumption: "excludes return path, vias, pads, connectors, solder joints and copper necking; use the path calculator (task 6) for the full budget". Until task 6 lands, add a note linking the two. | calc-implementer, ui-engineer |
| PCB-5 | MAJOR | **The divider accepts up to 1000 V with no resistor working-voltage or spacing caution.** Scenario 9 puts 397 V across one resistor with "0 cautions" and confidence medium. Small chip resistors have low limits; for example, Yageo RC_L 0402 is rated 50 V maximum working voltage. HV dividers are a classic field failure: arc-over, drift and creepage. The power note is present, but there is no voltage note. | When the voltage across any resistor exceeds a threshold (for example 50 V, as an engineering default and labelled so), add a caution: "check the resistor maximum working voltage (often 50-200 V for 0402-1206 chip resistors; see the datasheet); split into series parts; creepage/clearance are not checked here (future IEC 60664 phase)". Show the voltage across R1 and R2 as results. | calc-implementer (meta/ledger for the threshold as an engineering default), ui-engineer |
| PCB-6 | MINOR | **Known finished-thickness shortfalls appear in the text but not in the numbers.** For inner layers the S-009 shortfall (−29 % at 1 oz, −35 % at ½ oz) is larger than the default 1.25 margin. It appears only in the confidence "Why" list. The legacy internal k is probably conservative (S-018), which partly offsets this, but that offset rests on an unverified source. | Add a secondary result: "width if copper is at the S-009 minimum finished thickness" (or the fab profile's finished value), so the sensitivity can be seen. This fits task 9 (envelope). | calc-implementer |
| PCB-7 | MINOR | **The divider "worst case" is narrower than a real worst case.** (a) The load RL inherits the 1 % resistor tolerance, but ADC inputs and sensor loads vary much more (endorses the calc note). (b) TCR, ageing, ADC leakage and bias current are excluded, yet the envelope is called "Worst case over every combination". | Add a separate optional load tolerance, defaulting to "no tolerance" with a note. Rename the envelope "initial-tolerance corners (excludes TCR, ageing, leakage)". | calc-implementer, ui-engineer |
| PCB-8 | MINOR | **A design limit is shown as a validity check, and ambient independence is not stated.** "Maximum conductor temperature within allowed (105 °C) ✔" sits in the "Validity checks" list next to the chart-range checks, so a green tick reads as a design pass. The legacy fit takes no account of ambient: at 70 °C the copper is about 18 % more resistive than at 25 °C (S-004 α), so the rise is under-predicted, and nothing says so. | Move the allowed-temperature comparison to a "Design check" group with neutral wording. Add an assumption: "the fit does not depend on ambient; at high ambient the rise is larger than predicted (copper R rises about 0.39 %/K)". | calc-implementer, ui-engineer |
| PCB-9 | MINOR | **The same quantity is shown twice with different values.** The headline says 0.782 mm and 73.2 A/mm²; the Steps list says 0.781 mm and 73.1 A/mm². That is directional rounding against plain rounding, and in a design review it looks like a bug. | Apply the result's bound direction in the Steps display as well, or label the steps "unrounded intermediate". | ui-engineer |
| PCB-10 | MINOR | **The fab profile exists but is not used.** The profile has `minTraceWidth` 3.5 mil and `traceWidthTolerancePct` 20; JLC states ±20 % ("a 0.1 mm track ... 0.08 and 0.12 mm"). Trace width never mentions etch loss or the fab minimum. Scenario 13 shows 1.56 mil as a headline with no fab note. | When a profile is selected, compare the recommended width with `minTraceWidth`, and show "drawn width × (1 − tolerance)" as the worst finished width. Add "etch reduces finished width" to the trace-width recommendation, as trace resistance already does. | calc-implementer, ui-engineer |
| PCB-11 | MINOR | **The headline data badge says the wrong thing.** Trace width shows "UNVERIFIED ⚠ Sources disagree — see source ledger S-001, S-010, S-003". S-001 and S-010 are *paywalled*, not conflicting. The badge takes the worst status (S-003 CONFLICT) and applies its wording to every ID, so it hides the message that matters most: "IPC-2221 not read; compare with your licensed copy". The converter does the same with S-009. | Group the badge by status, for example: "Paywalled, verify with licensed copy: S-001, S-010. Sources disagree: S-003." | ui-engineer |
| PCB-12 | MINOR | **E-series pair search does not show single-value hits.** Target 3.3k series, E12: the first pair is 1.5k + 1.8k, followed by 10 Ω + 3.3k. It never says "3.3k alone is an E12 value". Pairs with a 10 Ω trim part are noise for a designer. | Show the "single value" row first when one exists, and optionally filter pairs whose smaller part is under 1 % of the target. The calc F-4 "nearest" metric text also belongs on this page. | ui-engineer |
| PCB-13 | MINOR | **Unproven and internal wording.** The method name says "(KiCad-compatible)", but no KiCad cross-check record exists yet (task 10). The Mode A option tells end users "waiting for a decision (OPEN_RISKS R-8)", which is project-internal jargon. | Say "KiCad-style formula" until X-01 is recorded. Change the Mode A hint to "not available yet: no verified IPC-2152 data source". | ui-engineer, orchestrator |
| (calc F-1) | MINOR, endorsed | **No inner-layer current range check.** The legacy internal curve is the external curve with k halved, so a 17.5 A internal current bound (KiCad) is consistent with the same area axis. Inner currents of 17.5-35 A are extrapolation and are not flagged. | As in calc F-1. Resolve S-010 and add the inner bound. | calc-implementer, standards-researcher |

## Phase-end watch items (not defects; tasks not built)

- **Weakest link (tasks 6-7).** The path calculator must surface vias (barrel resistance and current per via; for example, a 0.3 mm via with 18 µm average plating per the profile), pads, connector pin ratings, thermal-relief spokes and pour necking as the limiting element, and export net-class values. Until then no page should suggest that a trace result sizes a power path.
- **Annular ring and drill (task 7).** Worst-case drill +0.13/−0.08 mm, position 0.075 mm and plating 18 µm average are already in the profile. The via calculator must use them and show the profile date and its UNVERIFIED status.
- **Stackup sharing.** There is no stackup object yet. The copper weight and convention are re-entered on each page. A shared per-layer stackup (finished thickness per layer, from a fab profile) would fix PCB-1, PCB-6 and PCB-10 together.
- **Export.** There is no copy-as-netclass or CSV yet; the URL is the only share path. That is acceptable for the interim.
- **Safety spacing.** Not in Phase 1. PCB-5 is the first place where high voltage meets the tool, so a pointer to the future IEC 60664 phase belongs there.

## Conditions for PASS-WITH-CONDITIONS

1. Before phase closure, fix PCB-1..PCB-5, or record each in `docs/validation/OPEN_RISKS.md` with an accepted-risk owner. PCB-1 and PCB-2 need standards-researcher input (re-read the JLC pages in a browser per R-21; update S-008 and S-009 wording).
2. Log PCB-6..PCB-13 in OPEN_RISKS. PCB-6 and PCB-10 can close with task 9 and the fab-profile wiring.
3. The tasks 6-7 deliverables must meet the watch items above, or the final Phase 1 PCB review will FAIL on weakest-link coverage.

## Sources (retrieved 2026-10-11)

- JLCPCB PCB capabilities: "Outer layer copper (finished)"; "Finished copper weight of inner layer is 0.5oz by default"; trace width tolerance "±20%", "For a 0.1 mm track, the finished track width ranges from 0.08 and 0.12 mm"; min track 3.5/3.5 mil multilayer. https://jlcpcb.com/capabilities/pcb-capabilities
- JLCPCB multi-layer laminated structures: "Outer Layer Finished Copper Thickness (1 oz) 1.6 mil"; "Inner Layer Finished Copper Thickness (0.5 oz) 0.6 mil"; "(1 oz) 1.2 mil"; "The copper thickness in the laminate is the finished product copper thickness." https://jlcpcb.com/help/article/multi-layer-pcb-standard-laminated-structures
- JLCPCB copper weight help: inner "0.5oz (default), 1oz, 2oz"; "1oz copper = copper thickness of 35 µm" (basis not stated). https://jlcpcb.com/help/article/jlcpcb-copper-weight
- I-Connect007, "Fresh PCB Concepts: How Do You Calculate Finished Copper?": a starting foil plus 20/25 µm plating minus about 3 µm processing gives about 48-53 µm (via search summary; not fully read). https://mail.iconnect007.com/article/124068/fresh-pcb-concepts-how-do-you-calculate-finished-copper/124071/design
- Yageo RC_L 0402: maximum working voltage 50 V (distributor listing; the datasheet table for 0603-1206 was not read). https://se.rs-online.com/web/p/surface-mount-resistors/1987843P

All of the above are fabricator or vendor pages and change without notice. They support review findings only and do not upgrade any ledger row.

## What I could not do

- The Playwright MCP was not available to me. I used headless Chrome DOM dumps instead, so I made no visual or layout check and no mobile-width check.
- I did not read IPC-2221, IPC-6012 or IPC-2152 (paywalled).
- I did not read the Yageo datasheet table for 0603-1206.
- I did not fully read the I-Connect007 article.
