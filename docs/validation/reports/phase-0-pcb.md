# Phase 0 PCB domain review

Reviewer: pcb-domain-reviewer (independent; read-only on `src/` and `tests/`; git not run)
Date: 2026-10-06
Branch: phase-0
Inputs read: CLAUDE.md, docs/SPEC.md, docs/PLAN.md, docs/phases/phase-0.md, phase-1.md, phase-2.md, docs/validation/OPEN_RISKS.md, reports/phase-0-calc.md (PASS-WITH-CONDITIONS), reports/phase-0-phase.md (PASS-WITH-CONDITIONS), the Phase 1 skills (path-load-calculator, via-and-annular-ring, self-heating-solver, ipc2221-trace-width, calc-module-pattern), and all non-test `src/` files.

## Verdict: PASS-WITH-CONDITIONS

Phase 0 has no calculators, and nothing in it produces a wrong engineering number today. These parts are sound and I would build on them:

- the units engine: SI internally, separate dimensions for absolute temperature, ΔT and areal mass, and a 0 K floor;
- input guards;
- the ledger-driven badge;
- the compliance gate, which denies everything;
- the app shell wording.

From a working designer's point of view, though, the foundation is not yet ready for the Phase 1 daily-driver calculators. I found seven MAJOR gaps:

- **P-1.** The confidence rule lets an input outside the validity range still rate "medium".
- **P-2.** The foil-convention CONFLICT (about 2 %) is over-penalised, while the real copper uncertainty is not modelled. Finished copper sits about −29 % / +37 % from nominal.
- **P-3.** The parser rejects everyday inputs ("10 K" rise, "1 oz", "4k7", "K/W", "mils").
- **P-4.** Display defaults are not designer-friendly: K for ambient, raw SI exponents, no mil output, and 6 significant figures (false precision).
- **P-5.** Shared links lose their state silently.
- **P-6.** The `CalcResult` schema has no slots for limit vs. design value, envelope, warning severity, fab profile or limiting element.
- **P-7.** The fab profile has no type or schema, although the Phase 1 via and annular-ring calculators need one.

All seven are cheap now and expensive after a dozen calculators exist. **Conditions:** P-1 to P-7 must be closed as "Phase 1 task 0", before the first calculator merges, and logged in `OPEN_RISKS.md`. No BLOCKER.

## Method

1. I wrote a scratch Node 24 script (session scratchpad `pcb/s1.mts`, with a type-stripping resolve hook) that calls the real `src/core` functions with about 60 realistic inputs, plus format, foil, temperature-arithmetic, confidence, solver and hash scenarios. Nothing was written to `src/` or `tests/`.
2. I ran `npm run build` and `vite preview` on port 4173 (stopped afterwards). I captured headless-Chrome screenshots at 1280 px and inside a 360 px iframe, because headless Chrome on Windows will not make a window narrower than about 500 px.
3. I computed WCAG contrast for the palette.
4. I checked against published fab data (cited inline).

### Scenario results (actual outputs)

| # | Scenario | Result | Assessment |
|---|---|---|---|
| 1 | Width "10 mil", "10mil", "0.254mm", "35u", "35 µm", "1e3 um" | All parse correctly; 10 mil displays as **"254 µm"** | Correct numbers. A designer expects mm or mil, not µm (P-4) |
| 2 | "10 mils", "10 thou", "0,254 mm" | UnitError; decimal comma gives `Unknown unit ",254 mm"` | P-3, m-7 |
| 3 | Copper weight "1 oz" (expected areal mass) | **DimensionError** ("oz" is mass); only "1 oz/ft2" works | P-3. Every fab and every designer writes "1 oz" |
| 4 | Foil 0.5/1/2/3 oz under the 3 conventions | 1 oz: 35.00 / 34.33 / 34.29 µm; spread **2.07 %** at every weight | Math correct; see P-2 for why this is the wrong uncertainty to emphasise |
| 5 | Ambient "25 °C", "25 degC" | 298.15 K, **displayed as "298.15 K"** | P-4 |
| 6 | Temperature rise "10 K", "10 °C" in a ΔT field | **Both rejected** (DimensionError); only "10 Δ°C" or "10 dK" work | P-3. SI writes a rise in K; IPC charts say "°C rise" |
| 7 | 85 °C − 25 °C; 25 °C + 10 Δ°C; 25 °C + 10 °C; α·T | 60 ΔK; 35 °C; rejected; rejected | Correct and safe. This is the right physics guard |
| 8 | θ·P: 20 K/W × 0.5 W, then add to Ta | 10 ΔK (kind deltaT), 35 °C | Correct, but "20 K/W" cannot be typed (P-3) and θ displays as `m^-2·kg^-1·s^3·K` (P-4) |
| 9 | R of a 10 mil × 100 mm, 1 oz (35 µm) trace, ρ = 1/58e6 | **193.941 mΩ**, area "8.89e-9 m²", J "224972000 m^-2·A" | Value correct (hand check 0.1/(58e6·8.89e-9) = 0.19394 Ω). Display unusable and over-precise (P-4) |
| 10 | "1m" in a resistance field vs a length field; "1M" | 1 mΩ / 1 m / 1 MΩ | Correct, but a trap; echo the parsed value (m-5) |
| 11 | "4k7", "4R7", "10 Ohm", "10 R" | All rejected | P-3 (Phase 1 circuit values needs RKM notation) |
| 12 | "-300 °C", "-0 mm", "1e-400 mm", "-5 mm" | Below 0 K rejected; −0 and underflow give 0; negative accepted | 0 K floor is good. Zero and negative must be guarded per calculator (R-13, already logged) |
| 13 | Confidence: exact + VERIFIED + **1 out-of-range input** | score 2, **medium** | P-1 |
| 14 | Confidence: analytical + VERIFIED + 5 defaulted assumptions | score 2, **medium** | P-1 (cap hides "everything defaulted") |
| 15 | Confidence: copper converter (exact + CONFLICT) | medium; trace R (analytical + CONFLICT + 1 default) low | P-2 |
| 16 | Confidence: IPC-2221 legacy (empirical + PAYWALLED); Mode A (estimate + UNVERIFIED) | both 3, low | Sensible |
| 17 | brent on a pole 1/(x−1.2345) | `ok:true, converged:'bracket', fx = −1.43e12` | Known (R-14 / C-4); see m-3 |
| 18 | Self-heating fixed point, 2 A vs 50 A (runaway, θI²R0α ≈ 4.9) | 300.21 K in 7 iterations / `NO_BRACKET` | Solver fine; caller must map to RUNAWAY (m-4) |
| 19 | Hash, 12-segment path/load (72 keys) | **state discarded**; nothing in the UI tells the user | P-5 |
| 20 | Hash with `v=2` | state discarded silently | P-5 |

## Findings

Severity is about trust in daily use. Line numbers are from the files as read on 2026-10-06.

### MAJOR

**P-1. Confidence can say "medium" while an input is outside the method's validity range.**
- Where: `src/core/confidence.ts:18-20,72`.
- What happens: one out-of-range input on an exact or analytical method with VERIFIED data scores 2, which rates "medium" (scenario 13). An analytical, VERIFIED calculation where every assumption was defaulted also rates "medium", because the defaulted term is capped at 2 (scenario 14).
- Why it matters: a rushed engineer reads "medium" as "probably fine". Extrapolating outside a model's range (Hammerstad-Jensen w/h, IPC-2221 > 35 A) is exactly the case that embarrasses you in a design review.
- The rest of the rule is reasonable for engineering use: empirical/estimate penalties, and PAYWALLED/UNVERIFIED driving IPC-2221 and Mode A to "low". "Medium" for an analytical formula whose only flaw is an UNVERIFIED citation (skin depth, score 1) is acceptable, but only if the reasons are shown next to the level.
- **Fix:**
  - Any out-of-range input forces level = low, a hard floor independent of the score.
  - Remove the cap on defaulted assumptions, or flag defaulted *safety-relevant* inputs (copper thickness, ambient, ΔT, εr) individually.
  - The UI must never render the level without its reasons and the score.
  - Update `CONFIDENCE_RULE_TEXT` and the tests.
- Owner: calc-implementer + test-engineer.

**P-2. The foil-convention CONFLICT is treated as a data defect, while the real copper uncertainty is invisible.**
- Where: `src/core/units/foil.ts:22-50`; R-9.
- The 2.07 % spread between 35 / 34.33 / 34.29 µm is real but small. Through `CONFLICT = 2` it will:
  - push every copper-dependent result (resistance, drop, current, via) to at best "medium" (scenario 15);
  - put a "sources conflict" badge on every trace result. That trains users to ignore badges.
- Meanwhile the uncertainty that actually moves results is not modelled anywhere in the foundation: **finished copper vs nominal**. Published IPC-6012 minimums, quoted by NCAB (https://www.ncabgroup.com/faq/how-much-finished-copper-can-be-expected/):
  - inner 1 oz after processing: 24.9 µm, about −29 % vs 35 µm;
  - outer 1 oz after plating: Class 2 47.9 µm / Class 3 52.9 µm, about +37 % / +51 %;
  - outer ½ oz plus plating: 33.4 µm (Class 2).
- Fabs quote nominal: JLCPCB "1 oz / 2 oz" outer, 0.5/1/2 oz inner (https://jlcpcb.com/capabilities/pcb-capabilities); PCBWay "1oz … (35um …)" (https://www.pcbway.com/capabilities.html).
- **Fix:**
  - (a) Human decision (R-9). Default the convention to 35 µm per oz/ft², which is what fabricators print and what designers expect.
  - (b) Treat the convention as an explicit, labelled *user assumption*. If it is defaulted it counts once as a defaulted assumption, not as CONFLICT data. Keep S-003 CONFLICT in the ledger.
  - (c) The badge and statement should quantify: "conventions differ by ≤ 2.1 %".
  - (d) In Phase 1, make *finished* thickness (from a fab profile or the user) the primary input for R, I and ΔT calculations, with a nominal→finished caution and inner/outer distinction. Show the IPC-6012 minimums only as PAYWALLED-USER-MUST-VERIFY guidance.
- Owner: human (R-9) + standards-researcher + calc-implementer.

**P-3. The unit vocabulary rejects everyday designer input, and the errors give no hint.**
- Where: `src/core/units/parse.ts:36-49`, `units-table.ts:54-86`.
- Rejected today (scenarios 2, 3, 6, 8, 11):
  - "10 K" and "10 °C" as a temperature rise;
  - "1 oz" as copper weight;
  - "mils", "thou", "Ohm", "R", "4k7", "4R7";
  - "K/W", "°C/W", "Ω·m", "/K" or "ppm/K", "%", "A/mm2", "mil2", "W/(m·K)", "ghz".
- The error text ("does not match the expected dimension") does not say what to type.
- **Fix:**
  - Context-aware aliases that are unambiguous *because* the field's expected dimension is known:
    - in a ΔT field, K / °C / °F are read as differences, and the parsed echo shows "Δ";
    - in an areal-mass field, "oz" means oz/ft².
  - Add compound units: K/W, °C/W (= K/W), Ω·m, µΩ·cm, 1/K, ppm/K, %, A/mm², A/mil², mm², mil², W/(m·K), S/m, dB, mΩ/sq.
  - Add aliases: mils/thou, Ohm/ohms/R. Add RKM notation (4k7, 4R7, 2n2) for circuit values.
  - Errors should suggest the accepted spelling (e.g. 'For a temperature rise use "10 K" or "10 Δ°C"').
- Owner: units-engine-engineer (also closes the units half of R-14).

**P-4. Display defaults would embarrass the tool in review.**
- Where: `src/core/units/format.ts:21-37,59`.
- Default output:
  - absolute temperature as "298.15 K";
  - ρ, θ, α and J as SI exponent strings;
  - area as "8.89e-9 m²";
  - lengths as µm (a 10 mil trace shows "254 µm"), and mil is never offered;
  - **6 significant figures** ("193.941 mΩ", "1.37795 mil"). For an empirical ±tens-of-percent method that is false precision; "IPC-2221 width = 0.254371 mm" invites misplaced trust.
- **Fix:**
  - Each calculator field declares its display unit, with a global metric/imperial (mm+mil) preference, and the length field shows both.
  - Add display entries for °C, Ω·m, K/W, 1/K, A/mm², mm², mil².
  - Tie significant figures to the accuracy class: exact/analytical 4, empirical/estimate 2-3.
  - Output headline values in fab units (mm and mil, rounded *up* to the fab grid for widths).
- Owner: units-engine-engineer + ui-engineer.

**P-5. Shared links can silently open with default values.**
- Where: `src/state/hash.ts:6,55-56,73-74`; `src/ui/App.tsx:13`.
- More than 64 keys, or any `v` other than 1, discards the whole state. `stateDiscarded` is never shown to the user.
- A 12-segment path/load link (72 keys) loads the defaults (scenario 19). A reviewer opening a colleague's link then checks the wrong design and believes it is the colleague's.
- **Fix:**
  - Show a visible banner: "The shared settings in this link could not be loaded; showing defaults".
  - Use a structured encoding for list inputs (one base64url/JSON value per segment list) rather than one key per field, or raise the cap with a byte budget.
  - Use schema migrations (v1→v2) instead of discarding.
  - Store raw user text with units (e.g. "10 mil"), not SI floats. The current serializer already does this (scenario output `w=10%20mil`). Keep it.
  - Put the foil convention, the fab-profile id + date, and Mode A/B in the state so a link reproduces the result.
- Owner: ui-engineer (+ perf-stability-auditor for the length budget).

**P-6. The `CalcResult` schema is missing fields every Phase 1 calculator needs.**
- Where: `src/core/result.ts:13-26`.
- Missing:
  - (a) **Calculated limit vs recommended design value.** The skill (`calc-module-pattern`, `ipc2221-trace-width`) requires both, but `results[].role` is only primary/secondary, and `recommendation` is a free string with no stated derating.
  - (b) An **envelope** slot (min/typ/max plus the sensitivity drivers) for Phase 1 task 9.
  - (c) **Warning severity**: `warnings: string[]` makes "thermal runaway" or "below fab minimum annular ring" look like an info note.
  - (d) A **fab profile** reference (id, fabricator, profileDate) when a limit came from a profile.
  - (e) A **limiting element** for path/load (segment id, margin, reason).
  - (f) **Per-input provenance** (user / default / fab-profile / preset) rather than a boolean `defaulted`.
- **Fix:** extend the type and `assertNoNonFinite` before the first calculator. Results get `kind: 'limit' | 'design' | 'info'` plus `derating`; warnings become `{severity: 'danger' | 'caution' | 'info', code, text}`.
- Owner: calc-implementer.

**P-7. There is no fab-profile type, but Phase 1 needs one (rule 9).**
- Where: only `tools/audit-lib.mjs:103-111` checks `profileDate` and `fabricator`. No TypeScript type, no schema, no example. The profile editor is a Phase 2 task (`phase-2.md:7`).
- Phase 1's annular ring (worst case), via electrical and thermal, and path/load net-class export cannot work without drill tolerance, plating thickness, registration and minimum annular ring.
- Published examples show these differ by fab and must not be defaulted:
  - JLCPCB: PTH drill tolerance +0.13/−0.08 mm; **average hole plating 18 µm**; annular ring ≥ 0.20 mm recommended, 0.15 mm absolute minimum; 1 oz multilayer track/space 0.09/0.09 mm; 2 oz 0.15/0.15 mm; via 0.15/0.25 mm (https://jlcpcb.com/capabilities/pcb-capabilities).
  - PCBWay: PTH ±0.08 mm; NPTH ±0.05 mm; hole wall 18-25 µm standard; annular ring 0.15 mm; impedance ±10 % (±5 Ω at ≤ 50 Ω) (https://www.pcbway.com/capabilities.html).
  - The via skill's 25 µm golden plating therefore matches neither fab's standard figure.
- **Fix:** Phase 1 task 0 defines `FabProfile` (TS type + JSON schema + audit). Every field carries a unit and a source note, and the shipped example is a clearly labelled "generic, UNVERIFIED, fill in from your fab" profile. Minimum fields:
  - identity: `fabricator`, `process/service tier`, `profileDate`, `sourceUrl/document + revision`, `verifiedBy`;
  - copper per layer type: offered nominal weights (inner, outer); **finished thickness min/typ** for outer (after plating) and inner (after processing); copper thickness tolerance;
  - min trace/space **per copper weight and per layer type** (inner vs outer); etch compensation / trace width tolerance (± abs or %);
  - drilling: min mechanical drill; min laser/microvia drill; drill size step; PTH and NPTH finished-hole tolerance; drill-to-copper; drill position (registration) tolerance; max aspect ratio (through, microvia);
  - plating: hole wall copper min/avg (standard and class-3 option); via fill/tenting/plug options;
  - pads: min annular ring PTH, via, NPTH clearance; pad size tolerance; IPC class targeted (2/3, user-declared, PAYWALLED note); breakout allowed (yes/no/tangency);
  - solder mask: expansion, min web/dam, registration;
  - stackup (Phase 2, but reserve now): layer list with dielectric material, εr and Df at frequency, thickness and tolerance, prepreg/core, board thickness and tolerance, impedance tolerance;
  - thermal reliefs: min spoke width and count;
  - board: max board thickness; outline tolerance.
- Owner: calc-implementer (type) + devops-engineer (audit/schema) + human (R-5 data).

### MINOR

**m-1. Badge wording.** `src/ui/components/UnverifiedBadge.tsx:13-17`.
- "UNVERIFIED (paywalled, you must verify)" does not say what to verify, or against what. It is not alarmist, but it is ambiguous, and repeated 15× on About it becomes wallpaper.
- "UNVERIFIED (sources conflict)" hides the size of the disagreement.
- Suggested wording:
  - PAYWALLED: "Not checked against the standard (paywalled): compare with your licensed copy — ledger S-001".
  - CONFLICT: "Sources disagree (S-003): this result uses {choice}; alternatives differ by ≤ {x} %".
- Nothing I read could be misread as a compliance claim. The footer ("Estimates only. Not a compliance certification…"), the home line and the About notice are clear and appropriately sober.
- Owner: ui-engineer.

**m-2. Mobile About table.** `About.tsx:20-44`, `styles.css:37`.
- At 360 px the **Status** column (the safety-relevant one) is scrolled off-screen, and only "⚠ U…" shows.
- Fix: on narrow screens, put Status before Edition or stack rows as cards.
- Home, nav, footer and the not-found page fit 360 px. Contrast is good: warn 10.3:1 light / 11.1:1 dark, muted 7.4:1 on the card background, link 7.5:1. There is a skip link, focus moves to `main` on route change, and the focus ring is visible.
- Owner: ui-engineer.

**m-3. Solver success on non-roots.** `rootfind.ts` (`SolveOutcome`).
- `ok:true` with `converged:'bracket'` and |fx| ≈ 1e12 at a pole (scenario 17).
- Already R-14 / C-4. Suggest the outcome also carry a `residualRelative` / `suspect` flag, so callers cannot forget to check.
- Owner: calc-implementer.

**m-4. Self-heating runaway mapping.**
- A physical runaway returns `NO_BRACKET` (scenario 18).
- The Phase 1 caller must:
  - map it to RUNAWAY with a hard danger warning;
  - bracket T only up to a physical ceiling (user max conductor T, or laminate limit). Never widen the bracket to find a meaningless high-temperature root.
- Owner: calc-implementer.

**m-5. Parsed-value echo.**
- "1m" means 1 mΩ in a resistance field but 1 m in a length field; "1M" is 1 MΩ. This is correct but a trap (scenario 10).
- Fix: echo every parsed input with its unit beside the field ("= 1.000 mΩ").
- Owner: ui-engineer.

**m-6. Negative and zero inputs.**
- "-5 mm", "-0 mm" and "1e-400 mm" parse (to −5 mm, 0 and 0).
- Already R-13. Every Phase 1 calculator must use `guardPositiveFinite`, and its fuzz test should include these exact strings.
- Owner: calc-implementer / test-engineer.

**m-7. Decimal comma.**
- "0,254 mm" gives `Unknown unit ",254 mm"`.
- Fix: detect the comma and say "use a decimal point". Do not silently accept it, because "1,000" is ambiguous.
- Owner: units-engine-engineer.

**m-8. Weakest-link coverage in the plan.**
- `path-load-calculator` lists via, connector, pad/spoke and cable, but has no explicit **thermal-relief spoke helper** (count × width × length) and no **copper-pour neck / plane cut-out** segment. These are the usual real-world limiters on a 10 A path.
- Fix: add both segment types, with R from geometry, and treat each as a candidate weakest link.
- Owner: calc-implementer (Phase 1 design).

**m-9. Hidden copper constant in the Mode B skill.**
- `ipc2221-trace-width` uses `width_mil = A/(oz·1.378)`, which hard-wires the 35 µm convention.
- Fix: Mode B must take thickness from `foilThickness()` with the user's selected convention or finished thickness, so Mode B, Mode A and the copper converter always agree.
- Owner: calc-implementer.

**m-10. Via plating golden vector.**
- 25 µm (and k = 385, R-10) is a test vector, not a default. The UI must not pre-fill plating. It comes from the fab profile or the user.
- Owner: calc-implementer / test-engineer.

**m-11. Compliance gate.**
- Denying everything today is the right state. The denial label ("Not assessed for compliance — " plus a reason list) is long. In the UI, show the short prefix, and the reasons on expand.
- Owner: ui-engineer (Phase 3).

## What works (would trust)

- ΔT and absolute temperature are separate, and absolute temperatures cannot be added or multiplied (scenario 7). This removes a whole class of "ambient + rise" mistakes.
- K/W × W produces a ΔT that adds correctly to an ambient.
- The units engine has no implicit unit: a bare "25" in a temperature field and a bare "2" in a current field are rejected.
- The 0 K floor rejects "-300 °C" with a clear message.
- `foilThickness()` takes no default convention, and it returns the constant used, its source (default or user) and its status. That is the right traceability shape.
- The UI shell is offline-only, hash-routed and light (9.2 kB gzip JS), with a clear disclaimer and a per-page error boundary that shows no number on failure.

## Must-do before Phase 1 starts (Phase 1 task 0)

1. P-1: change the confidence rule (out-of-range → low; no hidden defaulted cap; the UI always shows reasons).
2. P-2: human decides R-9. Default 35 µm/oz as a labelled user assumption, not CONFLICT data; badge quantifies the spread; finished-copper input path planned.
3. P-3: context-aware ΔT ("10 K", "10 °C") and copper-weight ("1 oz") parsing; add K/W, °C/W, Ω·m, 1/K, ppm/K, %, A/mm², mm², mil², mils/thou, Ohm/R, RKM notation; error hints.
4. P-4: per-field display units with a mm/mil preference, °C display, sig figs by accuracy class.
5. P-5: show `stateDiscarded`; list encoding for segments; version migration.
6. P-6: extend `CalcResult` (limit vs design with derating, envelope, warning severity, fab-profile ref, limiting element, input provenance).
7. P-7: define the `FabProfile` type, schema and a labelled generic UNVERIFIED example, with the fields listed above; move the minimum of it from Phase 2 into Phase 1.
8. Carry forward and keep open: R-9, R-10, R-11, R-13, R-14 / C-4 (solver caller rules), R-5.

## Sources consulted

- NCAB Group, "How much finished copper can be expected?" (IPC-6012 minimum values quoted): https://www.ncabgroup.com/faq/how-much-finished-copper-can-be-expected/
- JLCPCB PCB capabilities: https://jlcpcb.com/capabilities/pcb-capabilities
- PCBWay PCB capabilities: https://www.pcbway.com/capabilities.html
- Epec, "Misinterpreting IPC-6012 standards" (internal layers only lose copper; external layers are plated up): https://blog.epectec.com/misinterpreting-ipc-6012-standards-for-rigid-printed-circuit-boards

These are secondary sources. IPC-6012 itself was not read (paywalled); any IPC-6012 value used in a calculator must be ledgered as PAYWALLED-USER-MUST-VERIFY.
