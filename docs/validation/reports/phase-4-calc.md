# Phase 4 calculations re-validation: thermal via array and fusing

Validator: calc-validator (independent). Date: 2026-10-19. Branch `phase-4`, head `2107b42`.
This report supersedes the first Phase 4 calc report (commit `3420891`, PASS-WITH-CONDITIONS, C4-1 to C4-6).
Scope of the re-validation, the changes since then:
- fusing: optional end temperature Te (adiabatic to Te); new via-barrel geometry with area π·t·(d+t); input plausibility limits; new warnings (WEAKEST_LINK, BOARD_DAMAGE_BELOW_MELTING, SUB_MS_PULSE, VIA_BARREL_PLATING); a `notChecked` validity flag;
- thermal via: required `diameterBasis` "finished" or "drill" (drill: d = D − 2t, barrel area π·t·(D − t)); warning THERMAL_RELIEF_NOT_MODELLED; reworded "lower bound" text;
- ledger: new row S-045, an S-003d note (pure-copper density 8933), an S-042 note (Brooks & Adam constants) and an S-042a note (user end temperature).

## Verdict: PASS-WITH-CONDITIONS

- I found no BLOCKER or MAJOR defects.
- **Numbers.** All 36 new-mode comparisons match my independent oracle within 4.8e-16 relative error. So do all 16 sensitivity cases. All 14 degenerate or out-of-limit inputs are rejected with a field-specific message.
- **Formulas.** Every new formula step matches my own derivation. The drill-basis identity π·t·(D − t) = π·t·(d + t) with d = D − 2t holds exactly.
- **Claims.** No result is called a fuse rating, a safe current, a safety margin or θJA. Every match on those phrases is a negation ("not a …").
- **S-045.** The ledger status is honest: the two sources I re-fetched say what the ledger quotes. My opinion on whether the fabricator blog is acceptable as a second source is below. It is acceptable for this caveat-only row, but it is weak, and I recommend adding a stronger second source.
- **Conditions.** There are seven new MINOR items (N-1 to N-7) plus the human items carried over (Q-54, Q-56, P4-1). C4-1 is fixed in the core except for one string (N-1). C4-2, C4-3, C4-4 and C4-5 are fixed.

## Method (independence)
1. I read `docs/phases/phase-4.md`, the ledger diff `3420891..2107b42` (S-003d, S-042, S-042a, S-045), the source notes "Validator follow-up pass" and OPEN_RISKS "Phase 4 core fixes" CF-1 to CF-15. That is where the new behaviour is specified. I did not open `src/` at this stage.
2. I wrote a fresh oracle in the session scratchpad: `C:\Users\HI\AppData\Local\Temp\claude\f--pcb-calc-pcb-calc-kit-v2-pcb-calc\99d32e0b-fc16-48ae-91eb-d1507f3e8c9e\scratchpad\oracle4b.py`. It uses python3 and `math` only. It does not import `tools/reference` or `src/`. Constants come from the ledger:
   - ρ20 = 1/58e6 and α20 = 0.00393 (S-004);
   - D = 8890 (S-003d);
   - Tm = 1084.62 °C (S-042c);
   - c = 385 or 386 (S-042d);
   - k = 401 or 391 (S-007);
   - 1 cmil = (π/4)·(25.4 µm)² (S-006);
   - Preece a = 10244 with d in inches (S-042b).
3. Only after that did I read `src/core/calculators/{thermal-via,fusing}/{guards,calc,meta}.ts`. I ran the app's `compute()` from a scratch vitest file in the scratchpad, using the repo's installed `node_modules/.bin/vitest` with a scratch config.
   - There was no npm install or ci, no worktree, and no change to `node_modules`, `src/` or `tests/`.
   - I deleted the scratch test and config afterwards.
   - The repo's own Phase 4 suites pass: thermal-via, fusing, both view-models and the result schema (5 files, 423 tests).

## Results: thermal via, diameter basis (θ in K/W; L barrel length; k Cu)

| Case | Inputs | Quantity | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| G1 golden (drill = finished equivalence) | D 0.35 mm drill, t 25 µm, L 1.6 mm, k 401, N 1 | θ_array / d used | 156.31562 / 0.300 mm | same | 0 / 0 |
| G1' (same via, finished basis) | d 0.30 mm finished, same | θ_array | 156.31562 (identical to G1) | same | 0 |
| G2 golden | as G1, N 9 | θ_array | 17.368402 | same | 0 |
| G3 golden (drill + fill) | D 0.25 mm drill, t 18 µm, L 1.0 mm, k 391, N 4, k_fill 3.5 | θ_array / d | 47.568932 / 0.214 mm | same | 0 / 0 |
| G4 golden (copper fill, drill) | as G1, k_fill 401 | θ_via (= L/(k·π(d/2+t)²)) | 41.471490 | same | 0 |
| B1 boundary (thin, t near D/4) | D 0.1 mm, t 24.9 µm, L 0.2 mm | θ / d | 84.897806 / 50.2 µm | same | 0 / 0 |
| OOR (must warn) | D 0.3 mm drill, t 120 µm (d = 60 µm < t) | θ | 58.799277 | same | 0; check fails, `PLATING_EXCEEDS_HOLE`, low |
| R1 random | D 0.4471 mm drill, t 31.7 µm, L 2.37 mm, k 391, N 7, k_fill 8.3, P 0.75 W | θ / ΔT | 19.759014 / 14.819260 K | same | 3.6e-16 / 4.8e-16 |
| Degenerate | t = D/2 drill; t > D/2 drill; no `diameterBasis`; `diameterBasis: "Drill"` | n/a | reject | OUT_OF_DOMAIN on `platingThickness` (twice); INVALID_INPUT on `diameterBasis` (twice) | n/a |

All accepted runs return confidence low. THERMAL_RELIEF_NOT_MODELLED is always present. The new result "finished hole diameter used in the calculation" equals D − 2t, with the note "derived from the entered DRILL diameter".

Sensitivity (drill basis; base D 0.35 mm, t 25 µm):

| Perturbation | −10 % | −1 % | +1 % | +10 % |
|---|---|---|---|---|
| D | +12.069 % | +1.089 % | −1.065 % | −9.722 % |
| t | +10.263 % | +0.933 % | −0.914 % | −8.386 % |

All 8 values equal the oracle. The directions are correct: in the drill basis dA/dt = π(D − 2t) > 0, so more plating lowers θ. Neither calculator has a sensitivity or tolerance readout (`toleranceInputs: []`), so there is no readout to compare.

## Results: fusing, end temperature and via barrel (A m²; default c 385)

| Case | Inputs | Quantity | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| G1 regression | trace 0.254 mm × 35 µm finished, Ta 20 °C, I 10 A | t to melt | 0.065692750 s | same | 0 (unchanged from the first report) |
| G2 golden (Te) | as G1, Te 150 °C | t to Te / t to melt | 0.016475618 s / 0.065692750 s | same | 0 / 0 |
| G3 golden (Te, time mode) | as G1, t 10 ms, Te 150 °C | I to Te | 12.835738 A | same | 0 |
| G4 golden (Te, I²t mode) | area 0.035 mm², Ta 25 °C, I²t 5 A²s, Te 260 °C | I²t to Te / fraction to Te / fraction to melt | 39.903472 / 0.12530238 / 0.049691978 | same | 0 / 0 / 0 |
| G5 golden (Te in K) | area 0.035 mm², Ta 25 °C, I 30 A, Te 533.15 K | t to Te | 0.044337191 s (= Te 260 °C) | same | 0 |
| G6 (c 386) | trace 0.5 mm × 70 µm, Ta 85 °C, I 50 A, Te 300 °C | t to Te | 0.012770822 s | same | 0 |
| B1 boundary Te = Tm | area 0.035 mm², Ta 25 °C, I 30 A, Te 1084.62 °C | t to Te = t to melt | 0.11179985 s | same | 0 |
| V1 golden (via) | d 0.3 mm finished, t 25 µm, Ta 25 °C, I 20 A | area / t melt / t Onderdonk / Preece | 2.5525440e-8 m² / 0.13379322 s / 0.13588349 s / 6.1253586 A | same | 0 / 0 / 4e-16 / 0 |
| V2 (via, Te) | as V1, Te 200 °C | t to Te | 0.042415391 s | same | 0 |
| V3 boundary (via, 1 ms) | as V1, t 1 ms | I to melt | 231.33804 A | same | 0 (no SUB_MS: the threshold is strictly below 1 ms) |
| V4 (via, cold) | d 0.2 mm, t 18 µm, Ta −40 °C, I²t mode | I²t to melt | 14.696359 A²s | same | 0 |
| OOR via (must warn) | d 0.1 mm, t 150 µm | t melt | computed | n/a | check "via plating below finished hole" fails, OVER_1S, low |
| Sanity edge | area exactly 1 m², I 1e6 A | t melt | 82138.663 s | same | 0; OVER_1S and OVER_10S |
| Degenerate | Te = Ta; Te 1085 °C; Te given as a ΔT; via without plating; via + area together; via d 2 m; area 1.0001 m²; wire 1.2 m; trace width 2 m; via t 0.6 m (area > 1 m²) | n/a | reject | OUT_OF_DOMAIN on `endTemperature` (twice); DIMENSION on `endTemperature`; INVALID_INPUT on `viaPlatingThickness`; INVALID_INPUT on `geometry`; OUT_OF_DOMAIN sanity on `viaHoleDiameter`, `geometry`, `wireDiameter`, `traceWidth`, `geometry` | n/a |

Sensitivity (via d 0.3 mm, t 25 µm, Ta 25 °C, I 20 A, Te 200 °C):

| Perturbation | −10 % | −1 % | +1 % | +10 % |
|---|---|---|---|---|
| Te | −9.142 % | −0.895 % | +0.891 % | +8.731 % |
| d | −17.610 % | −1.838 % | +1.855 % | +19.314 % |

All values equal the oracle. The directions are correct: the time rises with Te and with area².

Unit checks:
- Te is an absolute temperature, and a ΔT is rejected with DIMENSION.
- K input gives the same result as the equivalent °C.
- The end-temperature I²t uses the same K and β20 as the melt I²t, as S-042a allows ("replace Tm by Tf").
- The fusing via uses π·t·(d + t) with d finished. The UI field says "Via finished hole diameter (not the drill)". The drill basis for the fusing via is deferred, which OPEN_RISKS CF-3 discloses.

## Formula-by-formula comparison (new steps only)

| Step | Expected (my derivation) | Implementation | Match |
|---|---|---|---|
| Drill basis, finished hole | d = D − 2t; reject 2t ≥ D | `enteredDiameter.si - t2`; `t2 >= D` → OUT_OF_DOMAIN | yes |
| Drill barrel area | π·t·(D − t) ≡ π·t·(d + t) | `Math.PI * t * (d + t)` with d = D − 2t | yes (identity checked numerically: 2.5525440e-8 both ways) |
| Drill fill core | π·d²/4, d finished | same d | yes |
| Plausibility (thermal via) | t < d, finished | `t < d` on the derived d | yes |
| Fusing I²t to Te | A²·K·ln[(Te+β20)/(Ta+β20)] | same, `toUnit(Te,'degC')` | yes |
| Te bounds | Ta < Te ≤ Tm | `teC <= taC` reject; `teC > Tm + 1e-9` reject | yes |
| t, I, fraction to Te | I²t_e/I², √(I²t_e/t), I²t_user/I²t_e | same | yes |
| Via barrel area (fusing) | π·t·(d + t) | same | yes |
| Sanity limits | reject absurd magnitudes, labelled not sourced | area > 1 m², any length > 1 m → OUT_OF_DOMAIN, text "input sanity limit … not a sourced limit" | yes |
| notChecked | a paywalled item is neither passed nor failed | IPC scope item `ok:false, notChecked:true`; confidence still low from the score (P4-1) | yes |

Pitfalls checked:
- Finished vs drill is explicit in both calculators and is never defaulted.
- The via barrel uses π·t·(d+t) on the finished diameter.
- ΔT and absolute temperature are kept separate.
- No laminate Tg/Td value exists in the code or the ledger. The end temperature is the user's own value and is labelled "your value, not checked".

## Claim audit
- Fusing: the title, recommendation, NOT_A_RATING warning, UI headline labels and live-region text all say "not a fuse rating" and "not a safe overload limit". The melt fraction is named "(not a safety margin)" and carries that note. The end-temperature results say "(your value, not checked)". BOARD_DAMAGE_BELOW_MELTING is always present.
- Thermal via: NOT_THETA_JA is always present; the UI says "Not theta-JA, not theta-JC".
- Neither calculator, nor its view-model or page, contains "compliant", "production safe" or "fab-ready".
- Lower-bound wording: every core and UI string is qualified ("usually … not assured") EXCEPT the core `RISE_IS_LOWER_BOUND` text (N-1).
- New overclaim: THERMAL_RELIEF_NOT_MODELLED says relief connections "usually dominate the real behaviour". S-045 supports only "adds (high) thermal resistance", with no magnitude (N-2).

## Source table (re-check 2026-10-19, changed rows only)

| Claim (ledger) | URL | Ledger status | My finding |
|---|---|---|---|
| S-045 primary: spokes have high thermal resistance; connect thermal vias around the full circumference | https://ti.com/document-viewer/THS3095/datasheet/GUID-264019F5-1035-4577-8A67-69D99B217A95 | VERIFIED (caveat only) | Confirmed in SLOS423K (rev. Apr 2023) §9.4.1.1.1: "do not use the typical web or spoke via connection methodology"; "Web connections have a high thermal resistance"; "complete connection around the entire circumference". The hole "0.01 inch (0.254 mm)" and "solder wicking" text is also confirmed (DFM note only). |
| S-045 second source: fabricator blog | https://jlcpcb.com/blog/thermal-relief-pad-design | as above | Confirmed: "Tabs and exposed pads stay solid because moving heat is their whole purpose"; "set exposed pads to direct connect". Published 2026-08-22, updated 2026-08-24, no author. The page never says "thermal resistance"; it says "Spokes make a joint solderable and resistive at once". Ledger inaccuracy: the ledger says "mΩ-per-spoke figures", but the page gives "1 to 3 milliohms per pad" (N-4). The page also quotes an IPC-7093 "50%" voiding limit (paywalled, secondhand); it must not enter code. |
| S-045 candidate extra source (not in the ledger) | https://learnemc.com/qotw-230424 | n/a | "Thermal reliefs are intended to aid in the soldering process. They prevent the planes from pulling too much heat away from the component pad or pin." (LearnEMC, 2023-04-24, no author shown.) This is an independent, educational publisher that supports the physical mechanism. I recommend adding it as a supporting source. TI SLMA004 and SLOA120 repeat the TI wording (search snippets), but they are the same publisher, so they are not independent. |
| S-003d note: pure copper density 8933 (reference only) | https://aries.pppl.gov/LIB/PROPS/PANOS/cu.html | VERIFIED row unchanged; note only | Confirmed: Table 1 at 293 K gives "8933"; the general properties give "8.96 g/cm3". 8933/8890 = 1.00484 (my arithmetic). The note is correctly reference-only, and S-003e stays CONFLICT. The code assumption text gives "about 0.5 % … higher, not used", which agrees, but it cites no ledger id (N-7). |
| S-042 note: Brooks & Adam printed constants do not reproduce 0.0213 | https://www.pcdandf.com/pcdesign/index.php/editorial/menu-features/10179-pcb-design-1507 | UNVERIFIED row unchanged; note only | Confirmed as printed: "1.75×10-8", "8900 kg/m³", "385 J/kgK", "0.00393 1/K", "c = 0.0213 in circular mils". My arithmetic: the printed constants give 0.021034; ours (1/58e6, 8890) give 0.021326, which matches their 0.0213. The note and its "do not tune" instruction are correct. |
| S-042a note: any end temperature Tf below melting | derived | UNVERIFIED (derived) | Correct algebra: integrating dT from Ta to Tf instead of Tm needs no new source. No laminate value appears in the ledger or the code. Correct. |

### Opinion: is a fabricator blog an acceptable second source for VERIFIED on a qualitative caveat?
Under the project rule (source-verification skill: "two independent sources agree, at least one tier 1-3"), S-045 qualifies. The TI datasheet is tier 3, JLCPCB is an independent publisher, and the two agree. My opinion is **acceptable for this row, with reservations**:
- **Why it is acceptable:**
  - The row holds no number.
  - The claim is basic conduction physics that every source I found agrees on (TI, JLCPCB, LearnEMC; TI SLOA120 and SLMA004 by snippet).
  - It is used only to add a warning that makes the app more cautious, never to compute or loosen anything.
  - A wrong VERIFIED here cannot produce a wrong number.
- **Why it is weak:**
  - The JLCPCB page is a recent, unsigned marketing blog. Tier 5 in the skill lists "blogs" as "leads only", and the skill does not say whether a fabricator's blog counts as tier 3 "fabricator documentation" or tier 5.
  - It contains unsourced numbers ("halve the heat path", mΩ per pad) and secondhand IPC-7093 claims.
  - So it should never be the second source for anything quantitative or normative.
- **Recommendation (MINOR, standards-researcher):**
  - Add LearnEMC, or a non-TI device-maker application note, as an additional second source.
  - Have the human clarify in the skill where fabricator blogs sit in the tiers.
  - Keep the VERIFIED scope wording "qualitative caveat only, no number".

## Cross-checks (`tests/crosscheck/`)
There are still no Phase 4 records: no JSON file covers fusing or thermal-via θ, and `X-01-via.json` does not map KiCad's via thermal resistance. Status: **not yet obtained / none planned**. This is acceptable because tool agreement cannot upgrade a ledger row.

## Status of the earlier conditions

| Earlier item | Status at 2107b42 |
|---|---|
| C4-1 lower-bound wording | Fixed in the title, recommendation, ONE_D, IDEAL, meta and UI. Residual: core RISE_TEXT (N-1). |
| C4-2 fusing plausibility | Fixed and verified: area > 1 m² and lengths > 1 m are rejected; the exact edge 1 m² is accepted. |
| C4-3 Preece date | Fixed: "Preece (1884 or 1888, sources conflict, see S-042b)". |
| C4-4 cmil help | Fixed: "A circular mil is not a square mil, and cmil is not accepted"; unit hint "(not cmil)". |
| C4-5 Brooks constants note | Fixed (S-042 note; I re-confirmed it). |
| C4-6 unknown keys ignored | Unchanged (info, accepted). |

## Defects

| # | Severity | Finding | Reproduction | Expected vs actual | Fix owner |
|---|---|---|---|---|---|
| N-1 | MINOR | The core RISE_TEXT still says the temperature difference "is a lower bound on the real rise", without the qualifier (C4-1 residual). The UI power help is qualified, but the core warning message is shown as is. | `thermal-via` with `power` 0.75 W (R1); warning `RISE_IS_LOWER_BOUND` | Expected: "usually a lower bound … not assured". Actual: unqualified. | calc-implementer |
| N-2 | MINOR | THERMAL_RELIEF_NOT_MODELLED says relief connections "usually dominate the real behaviour", which is stronger than S-045 (TI: "high thermal resistance"; no magnitude). S-045 is also missing from the thermal-via `meta.ledgerIds` and `reference.ledgerIds`, and the text does not cite it (the researcher flagged this as a calc-implementer follow-up). | any `thermal-via` run | Expected: "…adds a thermal resistance that is not modelled and can be large (ledger S-045)"; S-045 listed in the ids. Actual: unsourced "dominate"; no S-045 id. | calc-implementer |
| N-3 | MINOR | The `diameterBasis` error text says a drill diameter entered as the finished hole "makes theta about 18 % too low for 25 um plating on 0.3 mm". In fact θ_wrong/θ_true = 0.275/0.325 = 0.846, i.e. 15.4 % too low. 18.2 % is how much HIGHER the true θ is (the research note's "+18 % θ" is right). | `thermal-via` without `diameterBasis` | Expected: "theta about 15 % too low (the real theta is about 18 % higher)". | calc-implementer |
| N-4 | MINOR (ledger) | The S-045 notes describe JLCPCB "mΩ-per-spoke figures"; the page gives "1 to 3 milliohms per pad". The page also states an IPC-7093 50 % voiding limit, which the ledger should flag as secondhand and paywalled, never a constant. | LEDGER S-045 notes | Correct the wording; add the IPC-7093 voiding mention to the "not usable" list. | standards-researcher |
| N-5 | MINOR (info) | The 1 s and 10 s thresholds and SUB_MS are evaluated on the time to MELT. With an end temperature Te, the time to Te is shorter and is not checked against SUB_MS. Example: V2 has t_Te 42 ms against t_melt 134 ms; a case with t_melt 2 ms and t_Te 0.6 ms would give no SUB_MS. This is disclosed in CF-1 ("Time thresholds stay on the time to melting"). | `fusing` via d 0.3 mm, t 25 µm, I 20 A, Te 200 °C | Consider also checking SUB_MS on the time to Te. | calc-implementer (optional) |
| N-6 | MINOR (cosmetic) | Grammar in the shared DIMENSION message: "endTemperature must be a absolute temperature". | `fusing` with `endTemperature` as a ΔT | "an absolute temperature" | units-engine-engineer / calc-implementer |
| N-7 | MINOR (traceability) | The fusing density assumption mentions "a pure-copper density reference … about 0.5 % … higher" with no ledger id. The value now has a ledger home (S-003d notes, S-003e). CF-7 is still OPEN in OPEN_RISKS although the researcher has done its part. | `fusing` assumptions[1] | Cite "S-003d notes / S-003e"; close CF-7. | calc-implementer, orchestrator |

There are no numeric defects. The maximum relative error is 4.8e-16 against my oracle across 36 value comparisons and 16 sensitivity cases.

## Conditions to log in OPEN_RISKS
1. Q-54: the human confirms the default specific heat (385.00 J/(kg·K), a product choice). Carried over.
2. Q-56: the human reads the IPC-2152 scope clause and IPC-2221 §6.2 for fusing or short-time currents (S-042f). Carried over.
3. P4-1: confidence can never exceed `low` under the current weights; this is a human decision. Carried over.
4. N-1 to N-7 (text, ids and ledger wording only) when the phase is next touched.
5. Strengthen S-045 with a non-blog second source, and have the human clarify the tier of fabricator blogs in the source-verification skill.

## What I could NOT verify
- No PDF was read by me: TI SLOA120, SLMA002/SLMA004 and SLOA122, MACOM S2083 and Active-Semi AN-104 were seen as search snippets only. I did not read IPC-7093 (paywalled), IPC-2152, IPC-2221B/C or IEC 60364-5-54.
- There is no measured spoke or relief thermal resistance from an independent source, so the magnitude behind "dominate" (N-2) is unverified.
- The fusing via drill basis and N parallel vias are not built (deferred in CF-3), so they were not tested.
- Everything listed in the first report remains: no Onderdonk original, Preece 1888 not read, the Brooks & Adam equation images, and no plated-barrel k measurement.
- I did not check the UI live in a browser. The UI strings were audited from source, and the view-model tests pass.
