# Phase 1 PCB domain review (FINAL)

- **Reviewer:** pcb-domain-reviewer, from the point of view of a practising PCB / hardware designer (power, mixed-signal).
- **Date:** 2026-10-15. **Branch:** `phase-1-task-10`, head `aaa28eb`. All app code is also on `origin/main`.
- **Edits:** I did not edit `src/` or `tests/`. This report is my only repository file. Scratch files (a dump script, a URL builder, a Chrome profile and the DOM dumps) are in the session scratchpad, outside the repo.
- **Read first, not redone:**
  - `phase-1-pcb.md` (interim, PCB-1..PCB-13);
  - `phase-1-calc-final.md` (F-1..F-7);
  - `phase-1-phase-final.md` (PF-1..PF-9);
  - `OPEN_RISKS.md` (T5-1, T7-1, T7-2);
  - `docs/PLAN.md`, `docs/phases/phase-1.md` and `docs/SPEC.md`, for the objectives.

## Verdict: PASS-WITH-CONDITIONS

There is no BLOCKER. Every number I recomputed by hand is right, and none of my findings changes a number in the unsafe direction.

The pages have got much better since the interim review:
- The path calculator names the weakest *rated* element.
- It refuses to rank unrated vias, connectors and necks, and it says loudly that they may be the real limit.
- The net-class export carries basis, ledger status and profile age on every value.
- Fab-profile values are tagged UNVERIFIED everywhere.
- Legacy IPC-2221 is never presented as modern.
- Finished and base copper are asked about explicitly.

I would use this suite on a real board as a **checking aid**. I would not use it as a sign-off tool, and it does not claim to be one.

There are three MAJOR findings. All are about confidence or completeness wording, not arithmetic:
- PCB-F1: T5-1 voltage-drop confidence;
- PCB-F2: the annular-ring "worst case" rated medium while known terms are missing;
- PCB-F3: no via current guidance at all.

PCB-F1 and PCB-F2 are small fixes, and I require them before Phase 1 closes. PCB-F3 may be deferred, but only if the human accepts it in OPEN_RISKS. There are also twelve MINOR findings, to be logged.

## Method

- **Built app:** I used `vite preview` at `http://localhost:4173/`, which was already running. I drove it with headless Chrome `--dump-dom` and a 4 s virtual-time budget, one shared-link hash per scenario, so every scenario also tests the URL workflow. The Playwright MCP was not available to this agent. I installed nothing and ran no third-party code; the scratch scripts use Node built-ins only.
- **Hand recomputation:** I recomputed each key number from first principles (legacy fit, ρ(T) = ρ20(1 + α(T − 20)) with ρ20 = 1/58e6, annulus area, θ = L/(kA), and the divider and LED algebra).
- **Public data:** I compared the results with public fab and vendor data (sources at the end).

## Scenario battery (rendered results)

| # | Scenario | App result | My check | Comment |
|---|---|---|---|---|
| 1a | 5 V / 3 A rail, trace width, outer, 1 oz base foil, ΔT 10 °C | 1.368 mm (53.83 mil) min; recommended 1.86 mm (×1.25 on current → ×1.36 width); low (score 9) | A = (3/(0.048·10^0.44))^(1/0.725) = 74.17 mil² → 53.8 mil. Correct. | PCB-3 is fixed: the margin is defined on current and the width factor is derived from it. The rounding direction is right. |
| 1b | Same, 1 oz entered as a **finished** weight (fab order form), JLC profile | No result; the profile's finished values are listed (outer 1 oz 1.6 mil, inner 0.5 oz 0.6 mil, inner 1 oz 1.2 mil, all UNVERIFIED, pairing unconfirmed) | n/a | Correct refusal, with honest labels. The user must retype 1.6 mil by hand as a "finished" thickness (PCB-F7). |
| 1c | Trace resistance, 60 mm × 1.86 mm, outer, 1 oz, 25 °C + 10 Δ°C, 3 A | 16.83 mΩ, 50.49 mV, 151.5 mW | ρ(35 °C) = 1.8258e-8 → 16.83 mΩ. Correct. | The one-conductor caution is now present (PCB-4 fixed). It still says "the **future** path calculator" (PCB-F5). |
| 1d | Path/load: 5 V, 3 A, connector 10 mΩ rated 5 A, 60 mm top run, 4 × 0.3 mm via array (18 µm, unrated), 2 mΩ pour neck (unrated), 20 mm × 1 mm bottom run, return same-as-forward, 3 % budget, 45 °C, JLC profile, 2-layer | Weakest *rated* link: bottom run at 92.5 % (3.24 A legacy at 20 Δ°C). 4 unrated elements listed, not ranked, with an "Important" box. Drop 245 mV (4.89 %) over budget, with a warning. Confidence low. Net class 1.222 mm, plus 0.1 mm clearance tagged as a fabricator minimum (UNVERIFIED, 2 days old) | Total R = 2·(10 + 17.45 + 0.42 + 2 + 10.9) = 81.4 mΩ. Bottom-run capacity 3.245 A. Correct. | This is exactly the weakest-link behaviour I asked for at the interim review. The drawn 1.0 mm bottom run is narrower than the exported 1.222 mm class width, and the export does not say so (PCB-F10). |
| 3 | Same path, via array rated 2.8 A by the user ("Saturn, 4 × 0.7 A"), drill 0.4 mm and pad 0.6 mm | Weakest link: via array at **107.2 %, Over limit, −200 mA**; via drill and pad echoed as "your values, not a recommendation" | Correct | The field text says the rating is for the whole array, not one via, so a per-via figure typed in errs on the safe side. Good. |
| 4a | Via page, 4 × 0.3 mm, 18 µm, 1.6 mm, 3 A, 45 °C | 421.2 µΩ (1.685 mΩ each); θ 221.9 K/W per barrel; "This is a resistance, not a current rating"; pure-Cu ρ flagged as non-conservative | Annulus 0.01798 mm²; θ = 1.6e-3/(401·1.798e-8) = 221.9. Correct. | Honest, but it gives a designer no current guidance at all (PCB-F3). |
| 4b | Annular ring, via 0.6/0.3 mm, profile tolerances, 2-layer vs multilayer | Both: worst-case ring 0.075 mm (only the position term); "Worst case incomplete … optimistic"; via ring "not published"; pad-minus-hole 0.3 mm meets 0.1/0.15 mm; **confidence medium** | 0.15 − 0.075 = 0.075. Correct. | The JLC via hole is "not controlled", so the true worst case is unknown, yet the headline says "Worst-case" and rates medium (PCB-F2). The bound label reads "Maximum capacity" (PCB-F12). |
| 4c | Annular ring, PTH 1.3/1.0 mm, 2-layer vs multilayer | Profile minimum 0.18 mm (2-layer) vs 0.15 mm (multilayer); recommended 0.25 vs 0.20; worst case 0.009 mm, flagged "Is below" | 0.15 − 0.065 − 0.075 = 0.010 (prints 0.009, rounded down). Correct. | Exact-scope lookup by layer count works, with no fallback borrowing. The double-count caution (a fab minimum may already include tolerance) is a good touch. |
| 5 | Self-heating, 200 mm × 0.2 mm, outer, 1 oz, 1 A, 40 °C: legacy-calibrated vs user θ 50 K/W | Legacy: 22.9 Δ°C (uncoupled 19.5, legacy step 19.6, +17 % coupling), converged in 6 iterations. User θ: 29.5 Δ°C, converged in 7. Both low. | Legacy direct rise 19.53 Δ°C. θ_eff = 19.55/(I²R20) = 40 K/W. Coupled result consistent. | The "calibrated" law does not reproduce its own calibration point (PCB-F6), which errs on the conservative side. The same quantity prints as 19.5 and 19.6. |
| 6 | Pulse: 10 A peak, D = 25 %, "much shorter than τ", outer, 1 oz, ΔT 10 °C | I_rms 5 A; 2.766 mm; "Mean temperature rise only: the peak is higher" (Important box); the period condition is labelled as the user's declaration (S-019f UNVERIFIED) | (5/(0.048·2.754))^(1/0.725) = 150.0 mil² → 108.9 mil. Correct. | Good. There is no hint of what τ is for a board trace (PCB-F14). |
| 2 | Buck FB: Vref 0.8 V (source note given), R2 10k, Vout 5 V, E96 nearest, 1 % resistors, 1.5 % Vref, Ib 1 µA into the pin | R1 52.3 kΩ (exact 52.5k); Vout 4.984 V; "Vout error vs target −0.32 %"; with bias 5.0363 V (+1.05 %); divider/Ib ratio 80; corners 4.8276-5.1446 V without bias and 4.8794-5.1974 V with bias; medium | Vout = 0.8(1 + 5.23) + 1e-6·52.3e3 = 5.0363 V. Correct. | F-7: see the decision below. The headline error ignores the bias the user entered (PCB-F4). The corners print to 6 significant figures with 1 % parts (PCB-F13). |
| 7a | LED: 12 V, 3 × 3.1 V, 20 mA, E24 up, rated 63 mW | 150 Ω, 18 mA, 48.6 mW "of the rated 63 mW; no derating applied"; 0 cautions | (12 − 9.3)/0.02 = 135 → 150. Correct. | 77 % of the rating with no caution, while the divider pages advise ≥ 2× (PCB-F11) |
| 7b | RC: 1k, 100 nF | fc 1.59155 kHz, high | 1/(2π·1e-4) = 1591.5 Hz. Correct. | "High" is appropriate for an exact relation with ideal parts |
| 8a | Divider 400 V → 2.5 V, R2 10k, E96, with and without a 200 V rated voltage | R1 1.58 MΩ. With a rating: **Caution**, 397.5 V exceeds 200 V. Without one: **Note** "resistor voltage rating not checked", 0 cautions, medium. | Correct | PCB-5 is fixed in part (PCB-F9) |
| 8b | Voltage drop (T5-1): 5 V, 3 A, two user resistances whose source note is "guess", return same-as-forward, 2 % budget | 150 mV (3.000 %), over budget (warning); "Limiting element: cable (largest drop)"; **confidence high, "No rule lowered the confidence"** | Correct arithmetic | The same inputs on the path page rate low/medium. See PCB-F1. |
| 8c | Misuse: via hole "12" with no unit; plating "0.7 mil"; barrel "62 mil" | "Missing unit in "12"", no result; echoes 17.8 µm and 1.575 mm | Correct | Unit discipline is still good |
| 8d | Misuse: no layer chosen, finished weight, return path not chosen | No result in each case (no default layer, no default return path, no default load kind) | n/a | Required inputs gate the result |
| 8e | Copper converter, 1 oz outer + 25 µm plating | 35 µm nominal; "+37 % … is an IPC-6012 minimum indexed by starting foil … not typical"; "Estimated finished thickness … 60 µm" with "upper estimate … Do not use it as a design input" | n/a | PCB-2 is fixed: the wording is now non-leading |

## What I would trust today

- **Weakest-link thinking (objective 3).**
  - The path page ranks only elements with a stated limit, and every limit carries its basis and source ("legacy IPC-2221, ledger S-001, PAYWALLED"; "user-supplied: J1 datasheet").
  - The headline reads "Weakest link … Unrated elements are not ranked: 4".
  - An "Important" box says that "a utilisation below 100 % is not a statement that the path is adequate".
  - Any unrated element, and any user-supplied value, keeps the confidence below high.
  - The via-array equal-sharing ideal, pure-Cu resistivity (non-conservative) and the uncoupled self-heating are all stated as cautions.
  - This is the right behaviour, and better than the commercial calculators I use.
- **Labels on numbers a designer would copy into CAD.** Every net-class value shows:
  - mm and mil;
  - its basis (calculated legacy, fabricator minimum, or your value);
  - its ledger status;
  - the profile id and age;
  - "Starting point, not a design rule".

  The clearance says it is "a manufacturing minimum only: voltage-based spacing and creepage are not evaluated here". The via drill and pad are echoed as "not a recommendation".
- **Finished vs base copper.**
  - The tool now asks where the weight comes from.
  - It refuses to convert a finished order-form weight.
  - It lists the fab's finished values with the warning "pairing unconfirmed, not stated whether plating is included".
  - That is honest and matches what JLCPCB publishes (1.6 mil finished for a 1 oz outer).
- **Fab profile discipline.**
  - Lookups are exact-scope by layer count, copper weight, hole type and side, with no borrowing between scopes.
  - Unpublished limits are shown as "Not published: enter your fabricator value".
  - Every value is tagged UNVERIFIED and carries its age.
  - A fab ring minimum is flagged as possibly already including tolerance.
- **Legacy labelling.**
  - Pages say "IPC-2221 legacy (Mode B)" and "not a substitute for IPC-2152".
  - Mode A is disabled, so nothing is silently substituted.
  - Each self-heating law is labelled.
- **Input gating.**
  - No default layer, return path, load kind, thermal law or pulse-period answer.
  - Bare numbers are refused.
  - ΔT is kept separate from absolute temperature.
- **Circuit pages.**
  - R1/R2 positions are spelled out.
  - FB bias needs a direction.
  - Vref is never pre-filled.
  - The LED Vf variation is noted.
  - HV dividers show the voltage across each resistor and take a rated-voltage input.

## Decisions requested of me

### T5-1 (voltage-drop confidence "high" for a path of user-supplied values only)

**Decision:** not acceptable as is. Apply the path-load rule to the voltage-drop calculator: each user-supplied resistance counts as a defaulted-type assumption, so such a path is at most medium, with the same visible reason ("Each user-supplied resistance is only as good as its source note; the tool does not verify it").

Reasons:
- The same two resistances rate **high, "No rule lowered the confidence"**, on the voltage-drop page, but low/medium on the path page. Two calculators disagree about one set of inputs.
- The source note the user typed was literally "guess".
- A reviewer who sees "high" next to "guess" will stop trusting every confidence badge in the suite.

A path made only of traces (no user values) can keep its current rating. See PCB-F1.

### F-7 (FB bias ignored when solving R1)

**Decision:** the uncompensated solve is **acceptable**, and I would not make compensation the default.
- TI datasheets tell designers to size the divider current at least 100× the FB pin current so that the bias term can be dropped (TPS785-Q1; TI SLVA450 for comparator inputs).
- Datasheet bias figures are usually maximums with an uncertain sign. Compensating R1 for a maximum bias moves the typical part off target.

What I require (PCB-F4, MINOR):
- (a) When a bias current is entered, the solved-resistor headline says "solved without the FB bias current; with the bias Vout is X (+Y %)".
- (b) "Vout error vs target" is also given including the bias. Today the page shows −0.32 % while the real nominal error is +0.73 %.
- (c) Optionally add an opt-in "compensate for bias" choice, with the formula R1 = (Vout − Vref)/(Vref/R2 + Ib) shown.
- (d) Optionally state the 100× rule of thumb, cited, next to the ratio that is already shown (80 in my scenario).

## Findings

| # | Sev. | Finding and evidence | Concrete fix | Owner |
|---|---|---|---|---|
| PCB-F1 | MAJOR | **T5-1: voltage-drop confidence is "high" for unchecked user values, and contradicts path-load.** Scenario 8b: two "guess" resistances give "Confidence high ●●● (score 0) No rule lowered the confidence". The same elements on the path page add +1 and a visible reason. | Reuse the path-load rule in `src/core/calculators/voltage-drop` (count user-supplied resistances; same reason text). Add a test that voltage-drop and path-load give the same confidence for the same element list. | calc-implementer, test-engineer |
| PCB-F2 | MAJOR | **The annular-ring "worst case" is known to be incomplete but still rates medium.** Scenario 4b: the headline is "Worst-case annular ring 0.075 mm", and the stack-up has only the position term because JLC via holes are "not controlled" and no pad tolerance is published. The page says "Worst case incomplete … optimistic", but the confidence is unchanged ("Defaulted assumptions used: ring reference"). For a 0.3 mm via the missing hole term could be the whole ring, which means breakout. A rushed reviewer copies "worst-case 0.075 mm, medium". | (a) When any tolerance term is omitted, title the headline "Partial worst case (omits: hole, pad)". (b) Count each omitted term as a safety-relevant default, which forces low. (c) Keep "Worst case" only when all three terms were supplied. | calc-implementer, ui-engineer |
| PCB-F3 | MAJOR (may be deferred with human acceptance) | **No via current guidance anywhere.** The via page says "This is a resistance, not a current rating", and path-load ranks a via only when the user types a rating. That is honest (no verified source), but the most frequent power-layout question ("how many 0.3 mm vias for 3 A?") gets no number. A via left unrated drops out of the ranking, so the headline then names a trace. Public app-note data exists: TI SLVA959B Table 3-1 (from IPC-2152, 10 °C rise, 1 oz) gives 0.84 A for a 12 mil via and 1.1 A for 16 mil. My 4 × 0.3 mm at 3 A sits at about 90 % of that ideal with crowding unmodelled. | Pick one: (a) a ledgered, clearly labelled "app-note reference rating" for the via (TI SLVA959B as UNVERIFIED secondhand IPC-2152 data, never a default, user must opt in); (b) a labelled legacy "barrel as an equivalent outer trace" estimate with its own ledger row; or (c) record in OPEN_RISKS that via ratings are user-only in Phase 1 and schedule them, with the human's acceptance. Either way, add a pointer on the via and path pages: "Need a rating? Typical sources: via-current tables in IC vendor layout app notes; enter it with the source." | standards-researcher (source), calc-implementer, human (accept deferral) |
| PCB-F4 | MINOR | **F-7: the headline error ignores the FB bias the user entered.** "Vout error vs target −0.32 %" while Vout with the bias is +0.73 % off target; "0 cautions". | See the F-7 decision (a)-(d) | calc-implementer, ui-engineer |
| PCB-F5 | MINOR | **Stale wording: "the future path calculator covers the whole path".** It appears on trace resistance and self-heating (`src/core/calculators/trace-resistance/calc.ts:69`, reused in self-heating). The path calculator has shipped. | Replace it with a link: "use the Path and load calculator for the whole path". | calc-implementer, ui-engineer |
| PCB-F6 | MINOR | **The legacy-calibrated self-heating does not reproduce its calibration point, and it double-counts R(T).** θ_eff = ΔT_ipc/(I²·R20), then R(T) is coupled on top. At 1 A the result is 22.9 Δ°C against the legacy 19.55 Δ°C (+17 %). The IPC chart data were measured on real copper, so the R(T) rise is already inside ΔT_ipc. The error is conservative but inconsistent: the trace-width page and the "IPC-2221-calibrated" self-heating page give different rises for the same trace and current. The same quantity also prints as 19.5 (uncoupled result) and 19.6 (step), a recurrence of PCB-9. | Either calibrate with R at (T_ref + ΔT_ipc), so the fixed point returns ΔT_ipc at the calibration current, or state plainly: "this law counts the copper resistance rise twice (conservative); at the calibration current it reads about X % above the legacy rise". Use one rounding for the uncoupled rise and the step. | calc-implementer, ui-engineer |
| PCB-F7 | MINOR (workflow) | **A finished order-form weight dead-ends.** Scenario 1b: with a profile chosen, the page lists "Outer layer, ordered 1 oz: 1.6 mil (40.6 µm)" and then makes the user switch to thickness entry and retype it. JLC users, the common case, hit this every time. | Add a "use this value (UNVERIFIED)" action that fills thickness = 1.6 mil, basis = finished, source = fab profile; the provenance then flows as a fab-profile input. Never auto-select it. | ui-engineer |
| PCB-F8 | MINOR | **Voltage drop calls the largest-drop element "Limiting".** "Limiting element: cable (largest drop)". On the path page "weakest link" means current utilisation, so one word has two meanings across the suite. | Rename it "Largest contributor to the drop". | calc-implementer, ui-engineer |
| PCB-F9 | MINOR | **The HV divider without a rating is only a Note.** At 400 V with 397.5 V across one resistor and no rating entered: "ℹ Note: resistor voltage rating not checked", 0 cautions, medium. With a rating entered and exceeded, it is only a "Caution", not a warning. | Above a ledgered threshold (for example a chip-resistor working voltage from a cited datasheet, labelled), raise the "not checked" note to a caution and count it as a safety-relevant unchecked item. Make "exceeds your rated working voltage" a warning. | calc-implementer, standards-researcher |
| PCB-F10 | MINOR | **The net-class export does not compare drawn widths with the class it exports.** Scenario 1d: the class width is 1.222 mm, but the listed bottom run is 1.0 mm, and no line says so. Via drill/pad are echoed without the profile's pad-minus-hole check, which the annular-ring page already does. | Add "listed element narrower than the exported class: bottom run 1.0 mm < 1.222 mm". When a profile is selected, run the via pad-minus-hole comparison on the echoed drill/pad. | calc-implementer |
| PCB-F11 | MINOR | **Power-rating guidance differs between pages.** Divider and feedback say "choose resistors rated for at least twice the dissipation". The LED page says "No derating is applied here", and 48.6 mW in a 63 mW part (77 %) gives 0 cautions. Chip-resistor power also derates above about 70 °C ambient. | Use one engineering-default note (2×, labelled as an engineering default) on all circuit pages, and a caution when dissipation exceeds 50 % of the entered rating. | calc-implementer |
| PCB-F12 | MINOR | **Wrong bound label on the ring.** The annular-ring headline is tagged "Maximum capacity (rounded down)" (`src/ui/components/view.ts:207`, the generic `max-capacity` label). A ring is not a capacity. | Use a per-calculator label: "Predicted minimum ring (rounded down)". | ui-engineer |
| PCB-F13 | MINOR | **Spurious precision.** Feedback-divider corners print as 4.82763 V / 5.14456 V for 1 % parts and a 1.5 % reference. | Tie the corner precision to the tolerances (3-4 s.f.). | ui-engineer, units-engine-engineer |
| PCB-F14 | MINOR | **The pulse declaration has no guidance.** "Much shorter than the thermal time constant" is the user's call, with no indication of the order of a board trace's τ. Most users cannot answer it. | Add a cited order-of-magnitude note when a source is found, or say "if unsure, choose comparable-or-longer (peak held), which is conservative". | standards-researcher, ui-engineer |
| PCB-F15 | MINOR | **The path headline drop is not qualified when the return is not counted.** "Total voltage drop 49.8 mV (0.996 %)" with "rp = not counted". The caution is further down the page. | Append "(forward path only)" to the headline when the return is not counted. | ui-engineer |
| (PCB-13 residual) | MINOR | The formula panel still says "IPC-2221 legacy (KiCad-compatible)", and X-01 has no recorded output (task 10, PF-2). | Say "KiCad-style formula" until X-01 is recorded. | ui-engineer |

Endorsed from the other validators without repeating them: calc F-1..F-6; phase PF-1 (log everything, including these findings), PF-2 (R-9, R-10 and task 10 need the human) and PF-9 (no in-app profile editor or import yet). On T7-1 (radial position tolerance) and T7-2 (profile values not independently re-read):
- The UI states the radial interpretation as a note, and every profile value is tagged UNVERIFIED. I accept both as logged conditions.
- Radial use of a figure that might be diametral is the conservative reading for the ring.

## Phase 1 objectives (PLAN objectives 2, 3, 4)

- **(2) Trace calculations: MET.**
  - Built: width, current and rise (legacy, labelled), RMS pulse, resistance with R(T), self-heating (two laws, converged and reported), the copper converter with a finished/base question, and tolerance/sensitivity.
  - Mode A is not built (R-8 decision pending, PF-4). This is acceptable because nothing is silently substituted.
- **(3) Load calculations: MET with conditions.**
  - Voltage drop and the path calculator cover all four load kinds, return-path choices, budgets, a ranked weakest link and net-class export.
  - Conditions: PCB-F1 (confidence consistency), and PCB-F3 (via current rating), which is accepted only as a logged deferral.
  - Parallel branches and coupled self-heating are deferred and disclosed on the page.
- **(4) Circuit values: MET.** Ohm/power, divider, feedback, LED, RC/LC, reactance and E-series all give correct numbers with sensible labels. The minors are PCB-F4, F9, F11 and F13.

## Conditions for PASS-WITH-CONDITIONS

1. Fix **PCB-F1** and **PCB-F2** before Phase 1 is closed. Both are small, local changes plus tests. Re-review is limited to those two pages.
2. **PCB-F3:** implement option (a) or (b), **or** the human accepts in OPEN_RISKS that via current ratings are user-supplied only in Phase 1, with a target phase. The pointer text on the via and path pages is required either way.
3. Log PCB-F4..PCB-F15 and the PCB-13 residual in `docs/validation/OPEN_RISKS.md`, with owners. Record the T5-1 and F-7 decisions above against those rows.
4. The human items from the phase validator (R-9, R-10 and task 10 per PF-2) remain preconditions for closure. This report does not waive them.

## Sources (retrieved 2026-10-15 unless stated)

- TI SLVA959B application note, §3.1 "Via current capacity", Table 3-1 (IPC-2152, 10 °C rise, 1 oz): 6 mil 0.2 A, 8 mil 0.55 A, 10 mil 0.81 A, 12 mil 0.84 A, 16 mil 1.1 A. https://www.ti.com/document-viewer/lit/html/SLVA959B/GUID-F81CF4B0-A8D1-4CFC-A514-446480F98089 (read through a summarizing fetcher; numbers to be re-read before any ledger use).
- TI TPS785-Q1 data sheet (SBVS388B): choose R2 so that the divider current is at least 100× the FB pin current, so the IFB term can be dropped. https://ti.com/document-viewer/lit/html/SBVS388B/GUID-65FE4449-0635-42D6-8D71-D3BCFA7ECD44 (from search summary).
- TI TLV6703 data sheet, resistor divider selection (about 100× the input current; refers to SLVA450). https://www.ti.com/document-viewer/TLV6703/datasheet/resistor-divider-selection-sbvs1877950 (from search summary).
- JLCPCB capabilities and multilayer stackup pages, as cited in the interim report `phase-1-pcb.md` (1 oz outer finished 1.6 mil; ±20 % track width; via hole not controlled per the profile quote). https://jlcpcb.com/capabilities/pcb-capabilities and https://jlcpcb.com/help/article/multi-layer-pcb-standard-laminated-structures
- PCD&F, "Saturn PCB delivers PCB Design Toolkit v7.12" (via current calculator based on IPC-2152), context only. https://pcdandf.com/pcdesign/index.php/editorial/menu-new-indust-prod/14858-saturn-pcb-delivers-pcb-design-toolkit-v-7-12

These are vendor pages and app notes. They support review findings only and do not upgrade any ledger row (CLAUDE.md rule 14).

## What I could not do

- The Playwright MCP was not available. I made no visual, layout, mobile-width or console check; the phase validator reports zero console messages on all routes.
- I did not read IPC-2152, IPC-2221, IPC-6012 or IEC 60063 (all paywalled).
- I did not re-read the JLCPCB pages in a browser (R-21 remains a human item).
- I ran no KiCad or twc comparison (task 10 is with the human).
