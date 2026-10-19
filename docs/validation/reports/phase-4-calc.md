# Phase 4 calculations validation: thermal via array and fusing

Validator: calc-validator (independent). Date: 2026-10-19. Branch `phase-4`, commit `3420891`.
Scope: `thermal-via` (θ = L/(k·π·t·(d+t)), fill in parallel, θ/N, ΔT = θ·P) and `fusing` (adiabatic I²t = A²·K·ln[(Tm+β20)/(Ta+β20)], Onderdonk secondary, Preece historical, I²t mode). Ledger rows S-040 to S-042f.

## Verdict: PASS-WITH-CONDITIONS

- I found no BLOCKER or MAJOR defects. Thirty-four numeric cases plus 24 sensitivity cases match my independent oracle within 6e-16 relative error, and 22 degenerate inputs are rejected with a clear message.
- Every formula step matches the derivation I did myself. The dimensions and unit conversions are correct: circular mil, square mil, m², °C inside the log terms, and finished hole diameter rather than drill diameter.
- The app never calls a result a fuse rating, a safe current, θJA or a design constant. Every match on those phrases is a negative ("not a …").
- Confidence is always `low` (score 4 to 6). That follows the published rule (estimate 2 + CONFLICT 2), as accepted in P4-1.
- The 1 s and 10 s thresholds are warnings only, not refusals. Their text says "product choices, not sourced limits".
- Conditions are listed at the end. They are the open human items Q-54 and Q-56 plus six MINOR items.

## Method (independence)
1. I read `docs/phases/phase-4.md`, the ledger rows S-040 to S-042f, the research note `docs/research/phase-4-thermal-via-and-fusing.md` and OPEN_RISKS Q-50 to Q-61. I did not open `src/` at this stage.
2. I wrote my own oracle in the session scratchpad (`oracle4.py`, python3 and `math` only). It does not import `tools/reference/ref_calcs.py` or anything in `src/`. Constants come from the ledger rows: k 401 or 391 (S-007), D 8890 (S-003d), ρ20 = 1/58e6 and α20 0.00393 (S-004), Tm 1084.62 °C (S-042c), c 383.48, 385.00 or 386 (S-042d), 1 cmil = (π/4)·(25.4 µm)² (S-006), Preece a = 10244 with d in inches (S-042b).
3. Only after that did I read `src/core/calculators/{thermal-via,fusing}/*`. I ran the app's `compute()` from one scratch vitest file using the repo's installed vitest (`node_modules/.bin/vitest --config <scratch config>`). There was no `npm install`, no worktree and no change to `node_modules`, and the scratch files were deleted afterwards. The repo's own Phase 4 suites pass (4 files, 215 tests).

## Results: thermal via (θ in K/W; d finished hole, t plating, L barrel length)

| Case | Inputs | Quantity | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| G1 golden | d 0.3 mm, t 25 µm, L 1.6 mm, k 401, N 1 | θ_array | 156.31562 | 156.31562 | 0 |
| G2 golden | as G1, N 9 | θ_array | 17.368402 | 17.368402 | 0 |
| G3 golden | d 0.2 mm, t 18 µm, L 1.0 mm, k 391, N 4 | θ_array | 51.866194 | 51.866194 | 0 |
| G4 golden (copper fill) | as G1, filled, k_fill 401 | θ_via (= L/(k·π·(d/2+t)²)) | 41.471490 | 41.471490 | 0 |
| G5 golden (fill + ΔT) | as G1, k 391, N 16, k_fill 3.5, P 2 W, fab-average plating | θ_array / ΔT | 9.7772282 / 19.554456 K | same | 0 / 0 |
| B1 boundary (small) | d 0.1 mm, t 10 µm, L 0.2 mm, N 1 | θ_array | 144.32550 | 144.32550 | 2e-16 |
| B2 boundary (large N) | d 1.0 mm, t 50 µm, L 3.2 mm, k 391, N 100 | θ_array | 0.49620832 | 0.49620832 | 0 |
| OOR (must warn) | t 0.3 mm ≥ d 0.2 mm | θ_array | 8.4670959 | 8.4670959 | 0; check fails, `PLATING_EXCEEDS_HOLE` warning, low (score 6) |
| R1 random | d 0.4471 mm, t 31.7 µm, L 2.37 mm, N 7, k_fill 8.3, P 0.75 W | θ_array / ΔT | 16.577162 / 12.432871 K | same | 0 / 0 |
| Degenerate | d = 0, NaN d, L = ∞, t < 0, N = 0, N = 2.5, no kMaterial, filled without k_fill, k_fill with fill none, P < 0, d given as an area, no plating | all | reject | INVALID_INPUT / DIMENSION, every one | n/a |

Every case returns data status CONFLICT and confidence low (4). The warnings 1-D estimate, receiving copper CONFLICT, bulk k, ideal parallel and NOT_THETA_JA are always present. EQUAL_SHARING appears when N > 1, and the FAB_AVERAGE, FILL and RISE warnings appear when their condition applies.

Sensitivity (±1 %, ±10 %, base G1): d −10 % gives θ +10.17 %; t −10 % gives +11.97 %; L scales exactly; N follows 1/N. The direction is correct each time and every value equals the oracle. Analytic check: θ ∝ 1/[t·(d+t)], so for d +10 % the ratio is 0.325/0.355 = 0.9155, i.e. −8.45 %, which is what the app gives. Neither calculator has a sensitivity or tolerance readout (`toleranceInputs: []`), so there is no readout to compare.

## Results: fusing (A in m²; Ta initial conductor temperature; default c = 385 J/(kg·K))

| Case | Inputs | Quantity | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| G1 golden (research sanity case) | trace 0.254 mm × 35 µm finished, Ta 20 °C, I 10 A | t_adiabatic / t_Onderdonk / Preece | 0.065692750 s / 0.066719786 s / 2.7770129 A | same | 0 / 4e-16 / 0 |
| G2 golden | area 0.035 mm², Ta 25 °C, I 30 A | t_adiabatic / ratio O/A | 0.11179985 s / 1.0156231 | same | 0 / 4e-16 |
| G3 golden (time mode, c 383.48) | trace 0.5 mm × 70 µm, Ta 85 °C, t = 0.03496029 s | I_adiabatic / I_Onderdonk | 50.000000 A / 50.486182 A | same | 0 / 3e-16 |
| G4 golden (I²t mode, c 386) | wire d 0.5 mm, Ta 25 °C, I²t 50 A²s | melting I²t / fraction | 3174.9288 A²s / 0.015748385 | same | 4e-16 / 4e-16 |
| B1 boundary | trace 0.15 mm × 17.5 µm, Ta −40 °C, I 5 A, c 386 | t_adiabatic | 0.026723738 s | same | 0 |
| B2 boundary | area 0.07 mm², Ta 150 °C (upper edge), I 10 A | t_adiabatic | 3.0514683 s | same | 0; `OVER_1S` warning |
| OOR Ta (must warn) | Ta 200 °C | t_adiabatic | 0.076356840 s | same | 0; check fails, low (score 6) |
| OOR > 10 s | trace 1.0 mm × 600 µm, I 50 A | t_adiabatic | 11.827967 s | same | 0; thickness check fails, `OVER_1S` warning, `OVER_10S` critical |
| Nominal foil | trace 1.0 mm × 35 µm nominal, I 5 A | t_adiabatic | 4.0247945 s | same | 0; `THICKNESS_NOMINAL`, safety default |
| Unit pitfall mil² | area "100 mil2" (square mils, = 127.32 cmil), I 1 A | I²t adiabatic / Onderdonk | 341.88693 / 347.22826 A²s | same | 5e-16 / 0 |
| R1 random | trace 0.3817 mm × 43.2 µm measured, Ta 61.3 °C, t 0.2173 s | I_adiabatic | 9.7211770 A | same | 0 |
| Degenerate | Ta = Tm, I = 0, current + time together, NaN area, no Ta, Ta given as a ΔT, trace without basis, free-form c = 400, area + wire together, I²t < 0 | all | reject | OUT_OF_DOMAIN / INVALID_INPUT / DIMENSION, every one | n/a |

Sensitivity (G2 base): I −10 % gives t +23.46 % (1/0.81); A +10 % gives +21.0 % (1.1²); Ta ±10 % gives ∓0.59 %. Directions are correct and every value equals the oracle.

Constant checks (my arithmetic):
- K = D·c/(ρ20·α20) = 5.0512e16 A²·s/m⁴ at c = 385. Its units reduce correctly: kg/m³ · J/(kg·K) / (Ω·m · K⁻¹) = A²·s/m⁴.
- Against the IEC form as reproduced by myCableEngineering: Qc(β+20)/ρ20 = 3.45e-3 · 254.5 / 17.241e-6 = 50 926 A²s/mm⁴, and k = 226 gives 51 076. Ours is 50 512, which is 0.8 % and 1.1 % lower. This is consistent with S-042a.
- At Ta 20 °C and Tm 1083 °C our constant gives t = 0.02133·(A_cmil/I)², which reproduces Brooks & Adam's 0.0213. Onderdonk gives 0.021659. The two differ by 1.6 %, which confirms the S-042 CONFLICT.
- Preece: a·(4/π)^0.75 = 12 278.7 for A in in². This confirms the ledger's 12279 against Brooks' 12277.

## Formula-by-formula comparison (after the blind recomputation)

| Step | Expected (my derivation) | Implementation | Match |
|---|---|---|---|
| Barrel area | π·t·(d+t), d finished | `Math.PI * t * (d + t)` | yes |
| Barrel θ | L/(k·A) | `L / (k.value.si * areaOne)` | yes |
| Core θ | L/(k_fill·π·d²/4) | same | yes |
| Parallel | 1/(1/θb + 1/θc) | same | yes |
| Array | θ/N, N an integer ≥ 1 | same; non-integer rejected | yes |
| ΔT | θ·P, dimension ΔT (not absolute T) | `mul(THERMAL_RESISTANCE, POWER)`; a test asserts TEMPERATURE_DIFFERENCE | yes |
| β20 | 1/α20 − 20 = 234.4529 °C | same | yes |
| Adiabatic I²t | A²·K·ln[(Tm+β)/(Ta+β)], Ta and Tm in °C | `toUnit(Ta,'degC')`, natural log | yes |
| Onderdonk | A_cmil²·log10[(Tm+234)/(Ta+234)]/33 | log10, 234 + Ta, 33 inside the root | yes |
| cmil | (π/4)·(25.4e-6)² = 5.0670748e-10 m² | same | yes |
| Preece | 10244·(d_in)^1.5, d = √(4A/π) | same, converted to inches | yes |
| t / I | I²t/I², √(I²t/t) | same | yes |

Pitfalls checked:
- d is the finished diameter, and the UI says "not the drill".
- Square mils are not circular mils. `mil2` parses as square mils, and there is no `cmil` unit, so a typed circular-mil value is refused rather than misread.
- A foil weight in oz/ft² is converted by the core `foilThickness` and forced to basis `nominal`, which adds the safety-relevant default.
- Ta is an absolute temperature; a ΔT input is rejected.
- Neither Onderdonk mis-transcription (234 − Ta, 33·t outside the root) is present.

## Claim audit
- Fusing: the title, results, recommendation and UI headline labels all say "estimate, not a fuse rating", "not a safe overload limit" and "time to REACH the melting point". No positive rating language exists.
- Thermal via: the title says "lower bound, not a design constant". The `NOT_THETA_JA` warning is always present, the UI callout says "Not theta-JA, not theta-JC", and the S-040 note says nothing here derives θJA.
- No "compliant", "production safe" or "fab-ready" text appears in either calculator or its UI view model.
- IPC scope: a validity check is always `ok: false` and labelled "PAYWALLED, not checked". The UI renders it as "not checked" (P4U-2). This is honest.
- Thresholds: the `OVER_1S` and `OVER_10S` texts and the meta comment say "product choices, not sourced limits". They are warnings and never refuse a result (Q-57).

## Source table (my re-check, 2026-10-19)

| Claim (ledger) | URL | Status in ledger | My finding |
|---|---|---|---|
| θ = L/(k·A), annulus area (S-041) | https://ti.com/document-viewer/lit/html/SPRADB7/GUID-DD5100C1-40A7-405D-AEC4-9F30DC88A553 ; https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node118.html | VERIFIED | Confirmed. TI gives area "π * [ (Drill Hole Radius)² - (Drill Hole Radius - plating thickness)² ]", which equals π·t·(D−t) = π·t·(d+t). TI calls it "a general rule of thumb" and prints λ(Cu) "4 W/m·K" (typo, as the ledger notes). Honest. |
| θ/N ideal (S-041b) | https://www.electronics-cooling.com/2004/08/thermal-vias-a-packaging-engineers-best-friend/ | VERIFIED (ideal only) | Confirmed quote: "The total resistance is equal to the resistance for a unit cell divided by the total number of vias." |
| 1-D underestimates θ; vias ineffective without a plane (S-041c) | Guenin as above; https://pcdandf.com/pcdesign/index.php/editorial/menu-features/17991-thermal-vias-are-ineffective-here-s-why | CONFLICT | Confirmed. Guenin: "The error exceeds 10% … as high as 27% for 9 through 16 vias", "the calculation underestimates the thermal resistance". Brooks & Adam: "if no lower pad or plane is present, the thermal vias have almost zero effect"; "Stop wasting time and board area on thermal vias." The CONFLICT on usefulness is honest and is displayed. |
| Filled via in parallel (S-041a) | derived | UNVERIFIED | Correct; the algebra is consistent (a copper fill gives a solid cylinder). |
| Plated barrel k (S-041d) | not found | UNVERIFIED | Correct. |
| θJA caveat (S-040) | https://www.electronics-cooling.com/2019/11/jedec-thermal-standards-developing-a-common-understanding/ | VERIFIED (caveat text only) | Confirmed: "the predictions cannot be expected to be accurate for different environmental conditions or for different test board design." |
| Onderdonk form (S-042) | https://classicconnectors.com/fault-current-and-the-effects-on-clampstar/ | UNVERIFIED | Confirmed as printed: "33 (I/A)2 S = log [(Tm – Ta / 234 + Ta) + 1]", A in circular mils, no log base. A search-engine snippet (not a page read) also shows "I = A*(log(1 + (Tm-Ta)/(234+Ta))/33*s).5" attributed to a PCB design article. It supports 33·s under the root and 234 + Ta, but it is a snippet, so UNVERIFIED stays correct. The Brooks & Adam 2015 and 2023 pages and Signal Integrity Journal 2020 show the equation only as an image (rechecked). |
| Adiabatic physics (S-042a) | https://www.pcdandf.com/pcdesign/index.php/editorial/menu-features/10179-pcb-design-1507 ; https://mycableengineering.com/the-adiabatic-equation/ | UNVERIFIED (derived) | Correct status. The IEC form as reproduced is k = √[Qc(β+20)/ρ20 · ln((β+θf)/(β+θi))] with "Values are suitable for durations up to 5 seconds". It is algebraically identical to ours (1/α20 = β+20). |
| Preece (S-042b) | Brooks 2015 as above; https://www.nessengr.com/technical-data/fuse-equations/ | VERIFIED | Confirmed. Brooks: "a is a constant (10244 for copper)", d in inches, Eq. 2 "12277*A3/4". Ness: copper "10,244", "d is the fuse element diameter in inches" (the equation itself is an image). Ness does NOT give Onderdonk, which is consistent with the ledger only citing it for Preece. |
| Cu melting point (S-042c) | https://its90.nist.gov/Overview | VERIFIED | Confirmed: "freezing point of Cu at 1357.77 K (1084.62 ° C)". |
| Specific heat (S-042d) | https://aries.pppl.gov/LIB/PROPS/PANOS/cu.html ; https://hyperphysics.gsu.edu/hbase/Tables/sphtt.html | CONFLICT | Confirmed: PPPL 383.48 (293 K), 385.00 (300 K), 506.00 (1300 K); HyperPhysics 0.386 J/(g·K). PPPL also lists density 8933 kg/m³ and melting point 1083 °C. They are not used, and S-003d (8890, IACS) governs. The CONFLICT is honest (0.7 %). |
| PCB validity / not a rating (S-042e) | https://www.pcdandf.com/pcdesign/index.php/magazine/10293-pcb-design-1509 | UNVERIFIED (one author group) | Confirmed: "actual fusing currents can be 1.5 to 6.0 times larger than Onderdonk suggests"; plane 12 mil below "from around 33% to over 100%"; "considered a destructive failure". 2023 article: "cooling effect kicks in very quickly, less than 1.5 sec". |
| IPC scope (S-042f) | Brooks 2015 as above | PAYWALLED-USER-MUST-VERIFY | Confirmed secondhand: "falls outside the scope of IPC-2152". No IPC document was read by me either. |

Status honesty: all 13 rows are honest. No row is over-claimed. S-042 could cite the snippet as a supporting transcription, but that does not justify an upgrade.

## Cross-checks (`tests/crosscheck/`)
There are no Phase 4 records. No JSON file covers fusing or thermal-via θ. `X-01-via.json` explicitly says KiCad's via thermal resistance is NOT mapped. Status: **not yet obtained / none planned**. That is acceptable, because tool agreement would not upgrade any ledger row anyway.

## Defects

| # | Severity | Finding | Reproduction | Expected vs actual | Fix owner |
|---|---|---|---|---|---|
| C4-1 | MINOR | "This value is a lower bound" is stated without qualification. S-041b itself says that leaving out the dielectric parallel path OVERstates θ, which pushes the other way. For a 3×3 array at 1 mm pitch with FR-4 "about 0.6" W/m·K (Brooks & Adam 2024), the dielectric path is roughly 1.6e-3/(0.6·9e-6) ≈ 300 K/W against 17 K/W for the vias. Ignoring it overstates θ by about 5 %, against Guenin's +10 to 27 % understatement. The net direction is still usually "lower bound", but it is not guaranteed. | `thermal-via` G2 | Expected wording: "usually a lower bound (published FEA found the 1-D model underestimates θ); the dielectric path is omitted (small, conservative)". Actual: "this value is a lower bound". | calc-implementer (text), ui-engineer |
| C4-2 | MINOR | Fusing `area` and `wireDiameter` geometries have no plausibility range, unlike trace thickness. `area = 1e10 m²` with I = 1e-10 A is accepted; only OVER_10S fires. | `fusing {area: 1e10 m², Ta 25 °C, current 1e-10 A}` | Expected: a validity check, as for thickness. Actual: none. | calc-implementer |
| C4-3 | MINOR | The `meta.reference.standard` string says "Preece equation (1888)", but S-042b records a date CONFLICT (Ness 1884 vs Brooks 1888) and an unconfirmed DOI. | `meta.ts` | Expected: "Preece (1880s; copper constant per Brooks & Adam from the 1888 paper)". Actual: "(1888)". | calc-implementer |
| C4-4 | MINOR | The area field help ("0.07 mm2 or 100 mil2") does not say that circular mils are not accepted and differ from square mils by 4/π. Typing `cmil` is refused, so this is safe, but users of wire tables think in cmil. | Fusing page, area field | Expected: help adds "square mils, not circular mils (1 cmil = π/4 mil²)". | ui-engineer |
| C4-5 | MINOR (ledger note) | Brooks & Adam 2015 list ρ20 "1.75×10⁻⁸" and density 8900 kg/m³ as fetched. Those constants give 0.0210, not their stated 0.0213. Their 0.0213 is reproduced exactly with ρ20 = 1/58e6 and D = 8890 (my arithmetic). Possibly a rendering error; it does not affect the app, which uses S-003d and S-004. | none | Add to S-042 notes so nobody "fixes" the constants toward 8900 / 1.75e-8. | standards-researcher |
| C4-6 | MINOR (info) | Unknown fields such as `meltingPoint` are silently ignored (Q-59, documented and tested). The UI does not offer the field. | `fusing {…, meltingPoint: 900 °C}` gives the same result as without it | Acceptable; it could reject unknown keys. | none required |

There are no numeric defects. The relative error is at most 6e-16 against my oracle across all 58 runs.

## Conditions to log in OPEN_RISKS
1. Q-54: the human confirms the default specific heat (385.00 J/(kg·K), a product choice).
2. Q-56: the human reads the IPC-2152 scope clause and IPC-2221 §6.2 for fusing or short-time currents (S-042f).
3. P4-1: confidence can never exceed `low` under the current weights. This was accepted by the orchestrator; it remains a human decision whether to change the rule.
4. Fix C4-1 to C4-4 (text and plausibility only) when the phase is next touched.

## What I could NOT verify
- No original Onderdonk document exists online. The Brooks & Adam equation images (2015, 2020, 2023) are not machine-readable. The 1928 GE Review (Stauffacher) was not found. The Artech House blog returned 403.
- I did not read the Preece 1888 Proc. R. Soc. paper (primary source), so the DOI remains unconfirmed.
- I did not read IEC 60364-5-54 Annex A (paywalled); I saw only reproductions. I did not read IPC-2152 or IPC-2221B/C, or JEDEC JESD51 (it needs a login).
- I found no measured thermal conductivity for plated via-barrel copper, and no independent experimental trace-fusing data (S-042e has one author group).
- I could not check Guenin's spreading equations or the Brooks & Adam simulation set-up, because the equations are images.
- I did not check the UI live in a browser (out of my tools). The view-model tests pass and the text was audited from source.
