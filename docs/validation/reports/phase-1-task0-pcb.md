# Phase 1 task 0: PCB domain review

- Reviewer: pcb-domain-reviewer (independent; read-only on `src/` and `tests/`; no state-changing git commands; skills and `OPEN_RISKS.md` not edited)
- Date: 2026-10-07
- Branch: `phase-1-task-0` at 5437854
- Inputs read: CLAUDE.md, `docs/phases/phase-1.md`, my `phase-0-pcb.md` (P-1..P-7, m-1..m-11), `phase-1-task0-calc.md` and `phase-1-task0-phase.md` (both PASS-WITH-CONDITIONS), `docs/research/plan-delta.md`, `docs/research/jlcpcb.md`, and the task-0 sources: `parse.ts`, `display.ts`, `units-table.ts`, `foil.ts`, `confidence.ts`, `result.ts`, `fab/profile.ts`, `data/constants.ts`, `fab-profiles/jlcpcb-2026-10-06.json`, `state/hash.ts`, `ui/App.tsx`, `DiscardBanner.tsx`, `UnverifiedBadge.tsx`, `About.tsx`, `styles.css`.

## Verdict: PASS-WITH-CONDITIONS

Task 0 fixed most of what I flagged. A designer can now type "10 K" as a rise, "1 oz" as copper weight, "10mils", "4k7", "100nF", "20 °C/W" and "1.7241 µΩ·cm". Results read as "0.254 mm / 10 mil", "193.9 mΩ", "25 °C", "17.24 nΩ·m" and "156.3 K/W". The confidence rule no longer lets an out-of-range input rate "medium". Shared links never fail silently. `CalcResult` has slots for design values, severity, provenance and fab profile.

There is no BLOCKER: no calculator exists yet, so no wrong number can reach a user.

Four MAJOR findings must be closed before the calculator that first needs them merges. In my judgement they are more serious than the MINOR labels the other two validators gave them:

- **D-1.** Display rounding goes to nearest, with no direction, and the estimate class prints 2 significant figures on fab geometry. Examples:
  - a required 1.149 mm width prints "1.1 mm";
  - a 2.96 A capacity prints "3 A";
  - a predicted 104 °C prints "100 °C";
  - a 0.4949 V drop prints "490 mV";
  - a 0.254 mm minimum prints "0.25 mm".
- **D-2.** Copper is still nominal-only, and the confidence reason for copper results blames the wrong thing. The defaulted 35 µm makes every copper result "low" with the text "CONFLICT … value unresolved". The real ±30-50 % effect of finished copper on inner and outer layers is not an input anywhere.
- **D-3.** The only real-fab example profile is non-conservative for a 2-layer JLCPCB board on three limits. Its drill-tolerance and plating fields also carry the wrong semantics for worst-case via work.
- **D-4.** `CalcResult` still lacks a few fields that Phase 1 calculators need:
  - a result-level bound / rounding direction;
  - more than one design value;
  - margin and a ranked list for the limiting element;
  - a structured copper basis (nominal vs finished, inner vs outer).

## Method

1. **Scratch scripts.** I wrote Node 24 type-stripping scripts with an extension-resolve hook in the session scratchpad (`pcb/s1.mts`, `pcb/s2.mts`). They import the real `src/core` modules read-only.
   - `s1.mts`: 128 realistic inputs across 17 field types.
   - `s2.mts`: 47 display cases, 10 confidence scenarios, 5 design-value cases and the JLCPCB profile.
2. **Browser checks.** `npm run build`, then `vite preview --port 4173` (nothing was listening on 4173 beforehand). I drove headless Chrome over CDP (`pcb/cdp.mjs`):
   - 10 hashes at 1280 px and at a true 360 px viewport (`Emulation.setDeviceMetricsOverride`);
   - for each: banner text, layout width, Dismiss, focus after Dismiss, a Tab keypress and a reload;
   - screenshots.
3. **Sources.** Fab data comes from the raw-HTML JLCPCB quotes recorded today by the calc-validator and the phase-validator, and from my Phase 0 citations. My own re-fetch of the JLCPCB page was denied by the session permission system, so I did not re-read it this run.

## 1. Realistic-input battery (P-3)

"Happy" means a designer gets the right number, or a refusal that tells them what to type. "Misled" means a wrong value is accepted silently.

| Field | Input | Result | Verdict |
|---|---|---|---|
| ΔT | "10 °C", "10°C", "10 K", "10 degC", "10 Δ°C" | 10 ΔK, echoed "10 Δ°C" | Happy. The Δ in the echo is exactly right. |
| ΔT | "18 °F" | 10 ΔK (no offset) | Happy |
| ΔT | "10 C", "10C", "10 k", "10" | rejected; "Accepted units here: K, °C or °F (a rise, no offset)" | Happy (C is coulomb; a bare number is rightly refused) |
| Abs T | "25 °C", "25 degC", "77 °F" | 298.15 K, echoed "25 °C" | Happy |
| Abs T | "10 Δ°C" | "…is a temperature difference (Δ) but this field is an absolute temperature" | Happy, an excellent message |
| Abs T | "25C", "25" | rejected with the accepted list | OK |
| Copper | "1 oz", "2oz", "0.5 oz/ft²", "0.5 oz/ft2" | correct areal mass, echoed "1 oz/ft²" | Happy. P-3's headline complaint is gone. |
| Copper | "1 OZ", "1 Oz", "1oz/ft^2", "1/2 oz" | rejected. "oz/ft^2" gets "Did you mean oz/ft2"; "1/2 oz" gets `Unknown unit "/2 oz"` | Safe. "1/2 oz" is common on fab forms and deserves its own hint. |
| Copper | "35 um" | DimensionError | Safe, but see D-2: the converter must offer a thickness entry path |
| Length | "10 mil", "10mils", "10 thou", "0.254mm", "  0.3   mm ", ".3mm", "35u", "35 µm", "1 in" | correct | Happy |
| Length | "10 Mil" | "Did you mean mil?" | Happy |
| Length | "10 MIL", "0.254 MM" | accepted list shown | OK (no case folding is the safe choice) |
| Length | "1,5 mm", "0,254 mm" | "uses a decimal comma … e.g. 1.5 mm" | Happy (my m-7 is closed) |
| Length | "1 000 mm" | space-separator message | Happy |
| Length | **"10 M", "10 k", "10 n"** | **accepted** as 10 Mm, 10 km, 10 nm; echoed "10000000000 mm" | **Misled** (silent). Nobody means megametres. A bare prefix in a length field should accept only "u"/"µ", or nothing. Extends calc m-1 (finding m-A). |
| Length | "1.6" | "Missing unit" | Happy |
| Resistance | "4k7", "4R7", "10 R", "10 Ohm", "10 kohm", "10 mΩ", "10 mohm", "1m", "1M", "10 M", "10 m" | correct. "10 m" → 10 mΩ, "10 M" → 10 MΩ | Correct. The m/M trap remains and needs the echo (m-5 still open in the UI). |
| Resistance | **"4K7", "10K", "10 KΩ"** | rejected: `Unknown unit "K7"`, `Unit "K" does not match the expected dimension`, `Unknown unit "KΩ"` | Safe, but annoying. These spellings are everywhere in BOMs. The hint should say "kilo is lower-case k: 4k7 / 10k / 10 kΩ" (m-B). |
| Resistance | "1 Meg", "10 milliohm", "10 r" | rejected with the accepted list | OK |
| Resistance | "4,7k" | decimal-comma message | Happy |
| Resistance | "0R" | parses to 0 Ω | Callers must guard (R-13). Path/load should explain "0R jumper: enter its datasheet max R". |
| Capacitance | "100nF", "100 nF", "100n", "4n7", "0.1uF", "0.1µF", "1 mF" | correct, echoed "100 nF" / "4.7 nF" | Happy |
| Capacitance | **"1 MF"** | **accepted as 1 megafarad** | **Misled.** On older US parts and drawings "MF"/"MFD" means microfarad. Needs a magnitude plausibility warning (m-C, before task 8). |
| Capacitance | "100 NF", "100 nf" | rejected with the accepted list | OK |
| θ | "20 K/W", "20 °C/W", "20 degC/W" | 20 K/W | Happy (P-3 closed) |
| θ | "20 C/W" | "Did you mean K/W?" | OK. "°C/W" would be the better suggestion. |
| θ | "20 K / W" | rejected | Minor friction |
| ρ | "1.72e-8 Ω·m", "ohm.m", "1.7241 µΩ·cm", "uohm-cm", "17.24 nΩ·m" | correct | Happy |
| ρ | **"1.72 u"** | **1.72 µΩ·m (100× if µΩ·cm was meant)** | **Misled.** Endorse calc m-1. |
| ρ | "Ωm", bare number | rejected | OK |
| J | "35 A/mm²", "35 A/mm2" | correct | Happy |
| J | "35 A/mil2" | rejected | Minor (calc m-10g) |
| J | **"1 m"** | 1e-3 A/m² | Misled (calc m-1) |
| Area | "100 mil²", "100 mil2", "100 sq mil", "0.0645 mm2" | correct | Happy |
| Area | "mm^2" | "Did you mean mm2" | OK |
| Area | **"10 m", "35u"** | 0.01 m², **35 mm²** | Misled (calc m-1) |
| α | "3900 ppm/K", "0.00393 /K" | correct | Happy |
| α | "0.393 %/K" | rejected ("Did you mean 1/K") | Minor |
| Dimensionless | "50 %" | 0.5 | Happy |
| Dimensionless | **"50"** | 50 | Trap for duty cycle (calc m-10f) |
| Dimensionless | "4.5 k" | 4500 | Misled for εr (calc m-1) |
| Current | "2 A", "2A", "500mA" | correct | Happy |
| Current | "2", "2 a" | rejected | Happy |
| k | "401 W/mK" | correct | Happy |
| k | "401 W/m-K" | "Did you mean W/mK" | OK |

**P-3 disposition: closed for every item on the original list.** "10 K" and "10 °C" as a rise, "1 oz", mils/thou, Ohm/R, 4k7/4R7, K/W, °C/W, Ω·m, /K, ppm/K, %, A/mm², mil² and the decimal-comma message all work, and the errors now name the accepted spellings. What remains is the opposite problem: silent acceptance of nonsense.
- Bare prefixes in length, area, resistivity, current-density and dimensionless fields (calc m-1 plus my m-A).
- "1 MF" (m-C).
- Upper-case kilo is refused with a confusing message (m-B).

## 2. Display (P-4)

Actual `formatFor` output:

| Quantity | Class / prefs | Shown | Designer reading |
|---|---|---|---|
| 0.254 mm | exact / analytical / empirical | "0.254 mm"; mil prefs "10 mil" | Good |
| 0.254 mm | **estimate** | **"0.25 mm"**; mil "10 mil" | Rounds a minimum down by 1.6 % in mm but not in mil. The two units disagree about the same requirement. |
| 1.149 mm required | estimate | **"1.1 mm"** / **"45 mil"** (45.24) | **Dangerous.** The designer draws 1.1 mm, 4.3 % under the requirement. |
| 1.149 mm | empirical | "1.15 mm" | Rounds up here by luck |
| 2.96 A capacity | estimate | **"3 A"** | **Dangerous.** It rounds a capacity up. |
| 1.049 A | estimate | "1 A" | Happens to round down |
| 104 °C predicted | estimate | **"100 °C"** | **Dangerous.** It hides 4 K against a 105 °C laminate or part rating. |
| 125 °C | estimate | "130 °C" | Wrong in the other direction, and absurd for a temperature |
| 0.4949 V drop | estimate | **"490 mV"** | Non-conservative against a drop budget |
| 193.941 mΩ | analytical / empirical / no class | "193.9 mΩ" / "194 mΩ" / **"193.941 mΩ"** | Good with a class. **The default (no class) is still 6 s.f.** |
| 25 °C | any | "25 °C"; imperial "77 °F" | Good (P-4 complaint closed) |
| ΔT 20 K | default / imperial | "20 Δ°C" / "36 Δ°F" | Good |
| ρ | analytical | "17.24 nΩ·m" | Good |
| θ | analytical | "156.3 K/W" | Good |
| J | analytical | "225 A/mm²" | Good |
| Area 8.89e-9 m² | analytical | "0.00889 mm²" / "13.78 mil²" | Good |
| 1 oz/ft² | – | "1 oz/ft²"; 305 g/m² → "0.999503 oz/ft²" | Good |
| 1 kg | – | "1000 g" | Acceptable for a PCB tool (no mass output in Phase 1) |
| 6.35 mm hole | estimate, mil | **"250 mil"** | Meaningless: a drill size printed to 2 s.f. |
| 0.15 mm drill (fab limit), mil | no class | "5.90551 mil" | False precision on a fab limit. It should read "0.15 mm (5.9 mil)". |
| 18 µm plating, mm / mil | – | "0.018 mm" / "0.708661 mil" | Plating and copper thickness should be in µm (or mil to 2 dp) |
| `unit:'um'`, `unit:'mil2'` override | – | "254 um", "13.78 mil2" | The override prints ASCII spellings, not µm / mil² (cosmetic) |
| Density | – | "8960 m^-3·kg" | calc m-7 (not reachable yet) |

**Judgement on the 1.149 mm → "1.1 mm" case.** This is the single most likely way this tool produces a field failure, so I rate it **MAJOR (D-1)**, not MINOR. Designers copy the headline number into the CAD net class. The class-based significant-figure rule is the right idea for communicating *accuracy*, but it is the wrong tool for *headline design values*. The rule must be:

1. **Every headline result declares its bound.**
   - `min-requirement` (width, area, annular ring, clearance, plating, via count): round **up**.
   - `max-capacity` (allowable current, power, length, allowed ΔT): round **down**.
   - `predicted-stress` (temperature, rise, drop, loss, resistance): round **up**.
   - `info`: round to nearest.
2. **Geometry headlines print at fab resolution, not at class significant figures.** Use 0.01 mm and 0.1 mil, or the profile's grid, rounded in the bound's direction. Accuracy is shown separately as a ± band or envelope and the confidence level. A 2-s.f. "0.25 mm" or "250 mil" must never be a headline.
3. **mm and mil are each rounded in the same direction** from the SI value. Never convert a rounded mm value to mil.
4. **Absolute temperatures print to fixed decimals** (calc m-3), rounded up when they are predictions.
5. **The unrounded SI value is kept for every comparison.** A pass/fail against a limit must never use the printed string.
6. **`accuracyClass` (or a bound) becomes mandatory in `formatFor` for results.** The 6-s.f. default is reserved for echoing inputs.

**Dual mm/mil.** Core has no dual formatter, so each page will improvise. Add `formatDual(q, bound)` in core so both halves round from SI in the same direction.

**P-4 disposition: partial.**
- Done: units; °C; no SI exponent strings for the Phase 1 dimensions; significant figures by class.
- Open: D-1 (direction and fab resolution), the dual display helper, per-role units (thickness in µm), and the 6-s.f. default.

## 3. Confidence (P-1) and the foil assumption (P-2)

| Scenario | Level / score | Reasons text | Designer reading |
|---|---|---|---|
| Analytical, VERIFIED, defaulted ambient 25 °C | medium / 1 | "Defaulted assumptions used: ambient 25 °C." | Right |
| Same, ambient listed as safety-relevant | medium / 2 | "Safety-relevant values were defaulted…" | Right |
| Same, ambient in **both** lists | low / 3 | both lines | Double count (calc m-5). The helper must build the lists from `inputs[]`. |
| IPC-2221 legacy, current 40 A out of range, PAYWALLED | low / 5 | out-of-range stated twice, plus empirical and PAYWALLED | Right level. The reason must name the bound ("40 A > 35 A limit of the legacy method"). The rule takes a free-text name, so nothing enforces this. Suggest `{name, value, bound}`. |
| Mode A, estimate, UNVERIFIED | low / 3 | estimate; UNVERIFIED | Honest |
| Trace R, analytical, foil defaulted, S-003 **CONFLICT** | **low / 3** | "…in CONFLICT between sources in the ledger; **the value is unresolved**." | **Misleading (D-2).** The 2.07 % spread is resolved by an explicit choice. The real driver (nominal vs finished copper) is not mentioned. |
| Trace R, analytical, foil defaulted, data VERIFIED | medium / 1 | "Defaulted assumptions used: foil convention" | This is what P-2(b) asked for, but it now understates the finished-copper uncertainty unless copper basis is also scored |
| Copper converter, exact, CONFLICT | medium / 2 | CONFLICT line | Over-penalised for a conversion whose spread is printed |
| Via θ, analytical, k default, S-007 CONFLICT | low / 3 | CONFLICT plus default k | Acceptable, but the reason should say that k = 401 is the *highest* candidate, which gives the *lowest* θ: the non-conservative direction |
| `dataStatus: 'PAYWALLED-USER-MUST-VERIFY'` (ledger spelling) | **low / NaN, reasons []** | none | calc m-4. There are two status vocabularies (`DataStatus` vs `LedgerStatus`). Profile `status` is a `LedgerStatus`; `CalcResult.fabProfile.status` is a `DataStatus`. One mapping function is needed. |

**P-1: closed in core.** Out-of-range forces low, and defaults are uncapped. Two consequences in practice:
- Both trace-width modes will **always** rate low: Mode B is empirical + PAYWALLED and Mode A is estimate + UNVERIFIED. The level alone therefore tells the designer nothing on the most-used calculator. The UI must lead with the **reasons** and show the score, not a coloured pill. This is the UI half of P-1 and is still unverifiable.
- **Sorting reasons by impact** (out-of-range first, then safety defaults, then data status) would help.

**P-2 / foil presentation.** The 35 µm default with a visible 2.07 % spread is a sensible *nominal* convention. Fabs quote it, and JLCPCB even heads its outer-copper row "Finished Outer Layer Copper … 1 oz / 2 oz" (calc-validator raw quote, 2026-10-07). As the sole copper basis it is not sensible, for three reasons:
- **Inner layers:** 1 oz after processing has an IPC-6012 minimum of about 24.9 µm, about −29 %. Using 35 µm understates R, drop and ΔT by roughly 29-40 %. That is the non-conservative direction. (NCAB, https://www.ncabgroup.com/faq/how-much-finished-copper-can-be-expected/, secondary source, IPC-6012 PAYWALLED.)
- **Outer layers:** after plating the Class 2 minimum is about 47.9 µm, about +37 %. 35 µm is conservative for R and ΔT, but non-conservative for etch-limited spacing and slightly for impedance.
- **The order of magnitudes is upside down.** The foil wording puts a 2 % effect in a badge and a 30-50 % effect in a footnote ("Finished copper differs: plating adds, etching removes", `foil.ts:30`).

**Fix (D-2):**
- (a) The foil convention, when defaulted, counts as one defaulted assumption. It must not set `dataStatus = CONFLICT` for the result. The reason text says "conventions differ by ≤ 2.1 %; 35 µm used".
- (b) Add a structured **copper basis** input to every copper-dependent calculator: `{layer: inner|outer, basis: nominal|finished, thickness, source}`. When the basis is nominal, it is a **safety-relevant default** (weight 2), with reason text such as: "Copper is nominal 1 oz (35 µm). Finished inner copper is typically thinner and outer copper thicker after plating. Enter finished thickness from your fab for a design value."
- (c) `layer` is a required input for trace R, current and ΔT, never a default.
- (d) Owners: human for R-9; calc-implementer for the factors and text; standards-researcher for a PAYWALLED ledger row with the IPC-6012 secondhand figures.
- (e) Due before task 1 (the converter's finished-copper caution) and task 2/3.

## 4. CalcResult (P-6) and FabProfile (P-7) against the Phase 1 calculators

### CalcResult: what is there
- Provenance per input.
- Warning severity (info / caution / warning / critical).
- `DesignValue` with direction and derating.
- `Envelope`.
- Fab-profile reference.
- `limitingElement`.

That is enough for the copper converter (task 1), resistance (task 3) and circuit values (task 8).

### CalcResult: still missing for the others (D-4)

| Need | Calculator | Missing |
|---|---|---|
| Bound / rounding semantics on each result | all (D-1) | `results[]` has only `role`. Add `bound: 'min-requirement' \| 'max-capacity' \| 'predicted' \| 'info'`, which the formatter consumes. |
| Several design values | trace (width **and** current), via (count **and** current), path/load | `designValue` is singular (V-6). Make it an array. |
| Limiting element with margin and a ranked list | path/load (task 6), via array | `limitingElement` has no margin or utilisation. Add `elements: {id, kind, utilisation, margin, limitBasis, source}[]`, sorted, with `limitingElement` = first. Thermal-relief spokes, copper-pour necks and connector pins must be element kinds (my m-8; the `path-load-calculator` skill still lists "pad/spoke (user R)" only, with no spoke-geometry helper and no pour-neck segment). |
| Sensitivity drivers | task 9 | `Envelope.toleranceInputs` is a name list without ranking or ±% (V-6) |
| Copper basis | trace, R, drop, path, via | Not structured: nominal/finished, inner/outer, thickness and source (D-2) |
| Fab-profile age and staleness | via, annular ring, net-class export | `fabProfile` lacks `ageDays` / `stale`, so the UI cannot flag an old profile from the result alone |
| Net-class export payload | path/load | No `exports` slot: width, clearance, via drill/pad, with the profile id |
| Status vocabulary | all | `DataStatus` vs `LedgerStatus` (see §3) |
| Absolute-temperature derating | trace (max conductor T) | Accepted (calc m-2). Derate as ΔT margin only. |

### FabProfile: the type is good; the content is not yet trustworthy (D-3)

The validator has no hidden defaults, forces the banner for UNVERIFIED profiles, uses strict dates and an injected today, and requires every length to carry a unit. These are the right rules.

Against what a designer needs on a JLCPCB job, the shipped `jlcpcb-2026-10-06.json` has these problems:

1. **It is non-conservative for 1-2 layer boards, the most common JLCPCB order.** The notes say multilayer values are used where 1-2 layer values differ, so the profile's limits are the multilayer ones:

   | Limit | Profile (multilayer) | 1-2 layer value | Gap |
   |---|---|---|---|
   | Annular ring, absolute | 0.15 mm | 0.18 mm | 0.03 mm |
   | Annular ring, recommended | 0.20 mm | 0.25 mm | 0.05 mm |
   | Trace/space | 3.5/3.5 mil | 4/4 mil | 0.5 mil |

   The 1-2 layer values exist only in `notes` (`jlcpcb-2026-10-06.json:12`), which no calculator reads. A 2-layer design checked against this profile "passes" at limits JLCPCB does not offer for 2 layers.
2. **`holeToTrack 0.2 mm` is the via value.** PTH-to-track is minimum 0.28 mm, with 0.35 mm recommended (calc m-8a, re-confirmed by the phase-validator). That is 0.08 mm non-conservative for any THT connector, the classic power-entry weakest link.
3. **`drillTolerancePlus/Minus` (+0.13/−0.08 mm) is JLCPCB's finished-hole-size tolerance.** Named "drill", it invites applying it to the drill bit. The annular-ring worst case then uses the wrong diameter, and the via pitfall (finished vs drilled) comes back. The schema needs explicit `finishedHoleTolerance` and a separate `drillOversize` (drill vs finished allowance, fab-supplied), with a `holeSizeBasis: 'finished'` note.
4. **`holePlatingAverage 18 µm` is an average.** Worst-case barrel R, current and θ need a minimum. The profile must carry `holePlatingMin` (or force the user to enter one) and label 18 µm "average, not for worst case". The 25 µm golden-vector value must still never be pre-filled (my m-10).
5. **The 2 oz annular ring (0.254 mm) is dropped,** and the schema has no layer-count or copper-weight dimension. Add `appliesTo: {layerCount, copperOz, layer: inner|outer}` per limit, or limit tables keyed by these.
6. **No finished copper per layer type.** JLCPCB's own outer weights are labelled "Finished". The profile should carry `finishedCopper.outer[oz]` and `finishedCopper.inner[oz]` (min/typ). This is the P-7 field that D-2 depends on.
7. **3.5 mil = 0.0889 mm vs JLCPCB's 0.09 mm** (calc m-8b). Store limits in the unit the fab publishes.
8. **Plausibility gaps** (calc m-9): minDrill > maxDrill, absolute > recommended ring, an "18 m" plating and a 2062 profile date (which disables staleness) are all accepted. I reproduced each.
9. **Still absent** from my P-7 list: per-weight and per-layer trace/space, aspect ratio, NPTH tolerance, solder-mask web/expansion, min thermal-relief spoke, impedance-controlled availability. Aspect ratio is needed by task 7; the rest can wait.

### How the UI must present an unverified fab profile
- **Never pre-select it.** The user picks a profile or "none, enter limits".
- **Persistent banner** naming the fabricator, the profile date and age in days, and "UNVERIFIED example: values read from the fabricator's web page; fabs change limits without notice; confirm against their current capability page or DFM report before release". Stale (> 365 days) or future-dated profiles get a caution.
- **Tag every number taken from the profile**: "from JLCPCB profile 2026-10-06 (unverified)". Show the layer-count and copper-weight scope the value applies to.
- **No green "OK" or "pass" against an unverified profile.** Use "within the profile's stated limit (unverified)". Pass/fail compares SI values, never printed strings.
- **Banner for an unknown `fp` id** from a shared link: syntactically valid but not installed means the profile was not loaded.

## 5. Shared links (P-5) in headless Chrome

Built `dist`, ran `vite preview --port 4173` (nothing was listening beforehand) and drove headless Chrome over CDP at 1280 px and at a true 360 px viewport.

| Hash | Banner (verbatim) | 360 px |
|---|---|---|
| `?v=1&w=10%20mil` | none | – |
| `?v=2&…` | "Could not load the shared settings from this link; showing defaults. The link was made with a different or unknown settings version." | fits (328 px wide), no horizontal scroll |
| no `v` | same version text | fits |
| `%E0%A4%A` | "…The link text is damaged (corrupt encoding), for example because it was cut off when copied." | fits |
| 9 000-character value | "…The link is too long to be safe to load." | fits |
| 70 keys | "…The link contains too many settings." | fits |
| `mode=Z&fc=99&fp=JLC%20PCB&u=si` | four bullets: `Ignored "mode": unrecognised value.` (and `fc`, `fp`, `u`) | fits |
| valid reserved keys | none | – |
| `#/?v=2&x=1` (home) | version banner | fits |

**Keyboard and focus:**
- Dismiss removes the banner and focus moves to `<main>`.
- The next Tab lands on the first link in the content ("Back to the home page" or "About"). That is correct.
- Reloading the same link shows the banner again, which is right: dismissal is per visit.
- `role="status"` is acceptable.

**About page:** at 360 px the ledger renders as cards with ID, Item, Edition and Status visible (my m-2 is closed). There is no horizontal scroll at either width.

**Badge wording:** clear and not alarmist. My m-1 residual: "Sources disagree — see source ledger S-003" still does not quantify the disagreement ("≤ 2.1 %").

**Residual (m-D).** The partial-ignore banner is the riskiest case: the link *did* load, but with some settings silently replaced by defaults. It prints internal key names (`mode`, `fc`, `fp`, `u`) and does not say what replaced them. A reviewer opening a colleague's via check with `fp` dropped is now checking against a different fab profile. Required wording:

> "This link loaded, but these settings were not recognised and defaults are used instead: Method (Mode A/B) → default; Fab profile 'JLC PCB' → none. Results may differ from the sender's."

Also endorse V-7: `fc` and `u` cannot express the core types.

**P-5: closed.** Residuals: m-D and V-7.

## Findings

### BLOCKER
None.

### MAJOR (conditions; each must be closed before the named task merges)

**D-1. Display rounding is non-directional, and the estimate class prints 2 s.f. on design geometry.**
- Where: `src/core/units/display.ts:20-31` (estimate = 2 s.f.), `:109-111` (`toPrecision`, nearest), `:136` (6-s.f. default).
- Evidence (§2):
  - 1.149 mm → "1.1 mm" / "45 mil";
  - 0.254 mm → "0.25 mm" while the same value prints "10 mil";
  - 2.96 A → "3 A";
  - 104 °C → "100 °C";
  - 0.4949 V → "490 mV";
  - 6.35 mm → "250 mil".
- Fix: the six rules in §2. A result-level `bound` (D-4) drives the rounding direction. Geometry prints at fab resolution. A core `formatDual`. Fixed decimals for absolute temperature. `accuracyClass`/`bound` mandatory for results. Supersedes and upgrades calc m-3.
- Owner: units-engine-engineer + ui-engineer + test-engineer (property test: printed min-requirement ≥ SI value; printed max-capacity ≤ SI value, in both mm and mil).
- **Before task 2** (first headline result). The copper converter (task 1) also needs it for thickness.

**D-2. Copper is nominal-only, and its confidence reason is wrong.**
- Where: `src/core/units/foil.ts:22-30` (status = S-003 CONFLICT for the default); `src/core/data/constants.ts:64-67`; `src/core/confidence.ts:88-89` (reason text "the value is unresolved").
- Evidence (§3): trace R with defaulted 35 µm rates low because of "CONFLICT … unresolved". Inner-layer finished copper (about −29 %) and outer-layer copper (about +37 %) are modelled nowhere.
- Fix: §3 (a)-(e). A defaulted convention is one defaulted assumption, not CONFLICT data. A structured copper basis `{layer, basis, thickness, source}`. Nominal basis counts as a safety-relevant default with explicit text. `layer` is a required input.
- Owner: human (R-9) + calc-implementer + standards-researcher.
- **Before task 1** (the converter's finished-copper caution) **and tasks 2/3.**

**D-3. The shipped JLCPCB example is non-conservative for 2-layer boards, and three field semantics are wrong for worst-case via and annular-ring work.**
- Where: `src/core/data/fab-profiles/jlcpcb-2026-10-06.json:12,14-25`; `src/core/fab/profile.ts:11-24`.
- Evidence (§4):
  - annular ring 0.15/0.20 vs 0.18/0.25 mm (1-2 layer);
  - trace/space 3.5 vs 4 mil;
  - `holeToTrack` 0.2 (via) vs 0.28/0.35 mm (PTH);
  - "drill" tolerance is really finished-hole tolerance;
  - plating is an average, not a minimum;
  - the 2 oz ring is dropped;
  - no finished copper.
- Fix:
  - per-limit `appliesTo` (layer count, copper weight, inner/outer);
  - split hole-to-track into via, PTH and NPTH;
  - `finishedHoleTolerance` plus `drillOversize`;
  - `holePlatingMin` separate from the average;
  - `finishedCopper` per layer type;
  - store values in the fab's published units;
  - plausibility and cross-field checks (calc m-9).
- Owner: calc-implementer (schema) + standards-researcher (S-008, research note §4 also mislabels "Via annular ring", where the calc-validator found the "PTH annular ring" heading) + human (R-5).
- Severity: MINOR while nothing loads the file. **MAJOR before task 7, or before any profile picker or net-class export ships, whichever is first.**

**D-4. `CalcResult` is short of what tasks 2, 6, 7 and 9 need.**
- Where: `src/core/result.ts:32-65`.
- Fix:
  - `results[].bound`;
  - `designValues: DesignValue[]`;
  - `elements[]` with utilisation and margin, plus the limiting element;
  - `copperBasis`;
  - `fabProfile.ageDays/stale`;
  - an `exports` slot for net-class values;
  - one `DataStatus` ↔ `LedgerStatus` mapping;
  - reject absolute-temperature derating (calc m-2);
  - `assertCalcResult` (calc m-4).
- Owner: calc-implementer + test-engineer.
- Due:
  - bound and designValues: **before task 2**;
  - elements and exports: **before task 6**;
  - fabProfile age: **before task 7**.

### MINOR

- **m-A. A bare SI prefix in a length field is accepted.**
  - "10 M" → 10 Mm, "10 k" → 10 km, "10 n" → 10 nm (`src/core/units/parse.ts:213-220`).
  - Allow only u/µ in length fields (or none), and reject the rest with a hint. Fold this into calc m-1.
  - Owner: units-engine-engineer. Before task 2.
- **m-B. Upper-case kilo is refused with confusing errors.**
  - "4K7" gives `Unknown unit "K7"`; "10K" gives a dimension error; "10 KΩ" gives an unknown-unit error (`parse.ts:16,134-158`).
  - Keep rejecting, but say "kilo is lower-case k: 4k7, 10k, 10 kΩ". Add a "1/2 oz → use 0.5 oz" hint.
  - Owner: units-engine-engineer. Before task 8.
- **m-C. "1 MF" is accepted as 1 megafarad.**
  - Add per-field magnitude plausibility warnings, e.g. capacitance > 1 F, length > 10 m, resistance < 1 µΩ, so silent prefix mistakes surface.
  - Owner: units-engine-engineer + calc-implementer. Before task 8.
- **m-D. The partial-ignore link banner uses internal key names and does not say what replaced them.**
  - Where: `src/state/hash.ts:160`, `DiscardBanner.tsx:23-28`.
  - Use human labels plus "defaults are used instead; results may differ from the sender's". Add a banner for an `fp` id that is not installed.
  - Owner: ui-engineer. Before the first calculator page.
- **m-E. Out-of-range reasons are free text and duplicated.**
  - Where: `confidence.ts:63-71`.
  - Use structured `{name, value, bound}` so every reason names the exact bound (plan-delta item 3). Merge the two lines into one. Sort reasons by impact.
  - Owner: calc-implementer. Before task 2.
- **m-F. Per-role display units are missing.**
  - Copper and plating thickness print as "0.018 mm" / "0.708661 mil"; fab limits print at 6 s.f.; the `unit` override prints "um" and "mil2".
  - Thickness should default to µm (or mil to 2 dp). Fab limits should print in the published unit and precision with the conversion in brackets.
  - Owner: units-engine-engineer + ui-engineer. Before task 1.
- **m-G. The k assumption hides its conservative direction.**
  - Where: `constants.ts:49`.
  - Add "highest candidate k gives lowest θ (non-conservative for via temperature); plated barrel copper not researched". Same as calc m-10c, endorsed.
  - Owner: calc-implementer. Before task 7.
- **Carry-forward from Phase 0, still open:**
  - m-3 (solver `suspect` flag);
  - m-4 (runaway mapping);
  - m-5 (parsed-value echo in the UI; essential given the "10 m"/"10 M" trap);
  - m-6 (zero guards per calculator, R-13);
  - m-8 (spoke helper and pour-neck segment);
  - m-9 (Mode B must take thickness from `foilThickness()` or the copper basis);
  - m-10 (plating never pre-filled);
  - m-11 (short gate label).
- **Endorsed without change:** calc-validator m-1..m-10 and phase-validator V-1..V-13. V-1 is particularly important: the skills still teach the old `CalcResult`, k = 385 and `oz·1.378`.

## Disposition of my Phase 0 findings

| Item | Status | Residual |
|---|---|---|
| P-1 confidence | **Closed in core** | UI must lead with the reasons (both trace modes will always be "low"); m-E; calc m-4, m-5 |
| P-2 copper | **Open** | D-2; human R-9 |
| P-3 parser | **Closed** for the original list | m-A, m-B, m-C, calc m-1 (silent accepts) |
| P-4 display | **Partial** | D-1, m-F, dual helper |
| P-5 shared links | **Closed** (observed in browser at 1280 and 360 px; keyboard OK) | m-D, V-7 |
| P-6 CalcResult | **Mostly closed** | D-4 |
| P-7 FabProfile | **Type closed; content not trustworthy** | D-3, calc m-8, m-9 |
| m-1 badge wording | Closed, except the CONFLICT badge does not quantify the spread | – |
| m-2 mobile About | Closed (verified at 360 px) | – |
| m-7 decimal comma | Closed | – |

## Must be true before the first Phase 1 calculator merges

1. **Rounding (D-1).** Every headline result carries a `bound`. The formatter rounds min-requirements and predicted stresses up and capacities down, in mm and mil independently from SI. Geometry prints at fab resolution, not class significant figures. Absolute temperatures use fixed decimals. A property test proves that no printed minimum is below its SI value and no printed capacity is above it.
2. **Copper (D-2).**
   - R-9 is decided by the human.
   - A defaulted foil convention is one defaulted assumption, not CONFLICT data.
   - Copper-dependent calculators take `layer` (inner/outer) as a required input, plus a copper basis (nominal/finished).
   - A nominal basis is a safety-relevant default with explicit text about finished copper.
3. **Result schema (D-4 for tasks 1-3).** `results[].bound` and `designValues[]` exist. `assertCalcResult` runs `checkDesignValue`/`checkEnvelope`, rejects NaN score and factor, and rejects absolute-temperature derating (calc m-2, m-4). The factors are built from `inputs[].source` (calc m-5).
4. **Parser.** Bare prefixes are rejected in length, area, resistivity, current-density, per-kelvin and dimensionless fields (calc m-1 + m-A). Fraction inputs are range-checked or require "%" (calc m-10f).
5. **UI contract.**
   - Every result shows the confidence reasons and score next to the level.
   - Every input shows its parsed echo with unit (m-5).
   - The partial-ignore banner uses human labels and names the replaced defaults (m-D).
6. **Skills (V-1, V-3) match the code:** `CalcResult`, k = 401 via `copperThermalConductivity()`, foil thickness via `foilThickness()` / copper basis, and 25 µm plating marked test-only.
7. **Before any calculator reads a fab profile (task 7, net-class export, profile picker),** D-3 is closed:
   - scoped limits (layer count, copper weight, inner/outer);
   - via / PTH / NPTH hole-to-track;
   - finished-hole tolerance vs drill oversize;
   - plating minimum vs average;
   - finished copper;
   - plausibility checks;
   - never pre-selected;
   - banner plus per-value "(unverified)" tags.
8. **Before task 6:** `elements[]` with margin and utilisation, thermal-relief spoke and pour-neck element kinds, and an `exports` slot.

## Sources

- NCAB Group, "How much finished copper can be expected?" (IPC-6012 minimums quoted secondhand: inner 1 oz 24.9 µm; outer 1 oz Class 2 47.9 µm / Class 3 52.9 µm): https://www.ncabgroup.com/faq/how-much-finished-copper-can-be-expected/ (cited in phase-0-pcb.md; not re-fetched this run)
- JLCPCB PCB capabilities, https://jlcpcb.com/capabilities/pcb-capabilities. Quotes as recorded from raw HTML on 2026-10-07 by the calc-validator (§1f) and the phase-validator (§6):
  - "Via hole to Track 0.2mm PTH to Track 0.28mm 0.35mm is recommended, minimum 0.28mm";
  - "Hole size Tolerance Through-holes: +0.13 / -0.08 mm … (Finished hole size";
  - "Average Hole Plating Thickness 18μm";
  - "Finished Outer Layer Copper … Multi-layer: 1 oz / 2 oz";
  - "Multilayer: 1 oz: Recommended 0.20 mm or above; absolute minimum 0.15 mm 2 oz: 0.254 mm or above".
  - The 1-2 layer figures (0.25/0.18 mm ring, 4/4 mil) are from `docs/research/jlcpcb.md` §4 and the profile `notes`.
  - My own re-fetch was denied by the session permission system this run.
- PCBWay capabilities, https://www.pcbway.com/capabilities.html (Phase 0 citation, not re-fetched)
- IPC-6012, IPC-4562A, IPC-2221 and IPC-2152 were not read (paywalled). Any IPC-6012 figure used in a calculator must be ledgered PAYWALLED-USER-MUST-VERIFY.

## What I could not do
- **Stopping the preview server.** The `vite preview` I started on port 4173 (PID 9640, background task `bda5q95ma`; there was no prior listener) could not be stopped: the session permission system denied `Stop-Process`. The orchestrator or the human should stop it.
- **JLCPCB re-fetch.** My WebFetch of the JLCPCB page was denied; I relied on the two validators' raw quotes from today.
- **UI rendering of results.** No calculator exists, so the display of confidence reasons, the parsed echo and the dual units could not be observed in the UI.
- **Screen-reader output** was not tested beyond the `role` attributes.
