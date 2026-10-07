# Phase 1 task 0: calculations validation

- Validator: calc-validator (independent; read-only on `src/` and `tests/`; no state-changing git commands)
- Date: 2026-10-07
- Branch: `phase-1-task-0` at 5437854. Scope: `git diff ad003d7..HEAD`, plus the task-0 commits 1981df9 (confidence), d39ff98 (hash) and ad003d7 (oracle, golden vectors, fab-profile JSON).
- Findings this run closes: P-1, P-3, P-4, P-6, P-7 (`phase-0-pcb.md`), and R-9, R-10, R-11, C-5 (`OPEN_RISKS.md`).

## Verdict: PASS-WITH-CONDITIONS

- No BLOCKER and no MAJOR. No wrong number reaches a user today, because no calculator exists yet.
- Every exact unit factor I recomputed matches to ≤ 1 ulp. The changed golden vectors match my own arithmetic bit for bit.
- The fuzz runs found nothing:
  - parser: 40 000 strings, 0 throws, 0 NaN/Infinity, 0 wrong-dimension accepts, 0 comma or space-grouped numbers accepted;
  - display round trip: 60 000 values;
  - shared-link hash: 5 000 hashes plus 5 000 list round trips.
- The confidence code matches its stated rule exactly in all 1 440 enumerated factor combinations.
- Ten MINOR findings are conditions. Most of them must be closed **before the first calculator that uses the affected API** (Phase 1 tasks 2, 3, 7).

## Method
1. **Docs first.** I read `CLAUDE.md`, `phase-1.md` task 0, `phase-0-calc.md`, `phase-0-pcb.md`, `OPEN_RISKS.md`, `plan-delta.md` and ledger rows S-003, S-003d, S-004, S-006, S-007 and S-008. From these I wrote down my expected values (§1) before I read any implementation.
2. **Oracle and golden vectors.**
   - `python3 tools/reference/ref_calcs.py`: 18/18 OK, exit 0.
   - `python3 tools/reference/gen_golden.py --check`: "OK docs/golden-vectors.json matches the oracle", exit 0.
   - I recomputed the changed vectors in a fresh Python script (math only, own constants). The oracle was not imported.
3. **Probing the implementation.**
   - Probe scripts live in the session scratchpad (`scratchpad/v/*.mts`). They run under Node 24 type stripping with an extension-resolve hook. They call `src/` functions read-only.
   - Expected values come from my own constants (NIST SP 811 factors), not from the code.
4. **Sources.** I re-fetched as raw HTML or PDF with curl and grepped for exact strings. Raw fetches avoid the summarizing-fetcher problem in R-21. Sources: JLCPCB capabilities, NBS Handbook 100 OCR, the HPL 1972 PDF (pdftotext), the PPPL copper page, the JLCPCB foil blog, the Siemens copper-thickness blog and CircuitCalculator.
5. **Build and test checks.** `npm run build`, then grep of `src/` and `dist/` for compliance wording. `vitest run`: 1087/1087 pass. I installed nothing and ran no third-party code. The only exception is the project's own pinned vitest and vite, already in `node_modules`.

## 1. Numeric cases (oracle = my own arithmetic or exact definition)

### 1a. Unit factors and parser (exact math, tolerance ≤ 1e-12 relative)
| Input (field) | Oracle (SI) | App (SI) | Rel. error |
|---|---|---|---|
| `1 oz/ft2`, `1 oz`, `1oz` (areal mass) | 0.028349523125/0.3048² = 0.30515172727394063 kg/m² | 0.30515172727394063 | 0 |
| `10 oz` (mass) | 0.28349523125 kg | 0.28349523125000003 | 1.0e-16 |
| `1 mil2`, `1 mil²`, `1 sq mil` | (2.54e-5)² = 6.4516e-10 m² | 6.451599999999999e-10 | 3.2e-16 |
| `1 A/mm2` | 1e6 A/m² | 1e6 | 0 |
| `18 °F` (ΔT field) | 18 × 5/9 = 10 K, no offset | 10 (kind deltaT) | 0 |
| `-18 °F` (ΔT) | −10 K | −10 | 0 |
| `32 °F` (absolute) | 273.15 K | 273.15 | 0 |
| `10 K` ΔT / absolute | 10 ΔK / 10 K | 10 deltaT / 10 absTemp | 0 |
| `10 °C` ΔT / absolute | 10 ΔK / 283.15 K | correct kinds | 0 |
| `3900 ppm/K`, `0.393 %`, `100 ppm` | 3.9e-3 /K, 3.93e-3, 1e-4 | 0.0039, 0.00393, 9.999999999999999e-5 | ≤ 1.1e-16 |
| `20 K/W`, `20 °C/W` | 20 K/W | 20 | 0 |
| `1 µΩ·cm` (resistivity) | 1e-6 × 1e-2 = 1e-8 Ω·m | 1e-8 | 0 |
| `1.7241 µΩ·cm`, `μ` (U+03BC), `uohm.cm` | 1.7241e-8 Ω·m | 1.7241e-8 | 0 |
| `401 W/mK`, `401 W/(m·K)` | 401 | 401 | 0 |
| `4k7` / `4R7` / `R47` / `4M7` / `1G2` (resistance) | 4700 / 4.7 / 0.47 / 4.7e6 / 1.2e9 Ω | identical | ≤ 2e-16 |
| `4n7` / `4u7` / `4p7` (capacitance) | 4.7e-9 / 4.7e-6 / 4.7e-12 F | 4.700000000000001e-9 / … | 2e-16 |
| `4u7` (inductance) | 4.7e-6 H | 4.7e-6 | 0 |
| `4p7` (inductance) | reject (pH not offered) | rejected | – |
| `4k7` (capacitance), `4K7` (resistance), `4n7` (resistance), `4k7` (no field), `4k7` (length), `R47` (capacitance) | reject | all rejected with a field-specific hint | – |
| `1m` resistance / length; `1M` and `10 M` resistance; `10 m` resistance | 1 mΩ / 1 m; 1 MΩ, 10 MΩ; 10 mΩ | as expected | 0 |
| `10 R`, `10 Ohm`, `10 ohms`, `10 Ω` (U+03A9), `10 Ω` (U+2126), `10 kΩ` (U+2126) | 10, 10, 10, 10, 10, 1e4 Ω | as expected | 0 |
| `5 mil` / `5 mils` / `5 thou` | 1.27e-4 m | 1.27e-4 | 0 |
| `5 Mil` / `5 MIL` | reject (no case folding) | rejected; "Did you mean "mil"?" | – |
| `1,5`, `1,5 mm`, `1.5,`, `1,000 mm`, `1.000,5 mm`, `4,7k` | reject | rejected | – |
| `1 000 mm` with any of: space, NBSP, thin space, NNBSP, en space, ideographic space | reject | rejected | – |
| `-300 °C` (absolute) | reject below 0 K | rejected | – |
| `-273.15 °C` | 0 K | 0 | 0 |
| `-459.68 °F` | reject | rejected | – |
| `-459.67 °F` | 0 K | −5.68e-14 (inside the documented 1e-9 float tolerance) | see m-6 |
| `1e400 mm` / `1e-400 mm` / `-0 mm` | reject / 0 / 0 | rejected / 0 / 0 | R-13 (callers must guard) |
| `9…9k9` (400 digits), `1e308 kΩ`, `1e308 k` | reject (overflow) | rejected | – |
| Lookalikes: `１０ mm`, `10 ｍｍ`, `10 мм`, `1O mm`, `l0 mm`, `10 ºC`, `10 ˚C`, `10 ℃`, `10 K` (U+212A), `0x10 mm`, `1_000 mm`, `NaN mm`, `Infinity mm` | reject | all rejected | – |
| `10 m` (area), `35u` (area), `1 m` (current density), `1.72 u` (resistivity) | ambiguous: should reject | **accepted** as 0.01 m², 3.5e-5 m², 1e-3 A/m², 1.72e-6 Ω·m | m-1 |

### 1b. Golden vectors changed by task 0 (oracle = my own Python, ρ = 1/58e6, α = 0.00393, k = 401)
| Vector | My value | Golden `pinned_expected` | Rel. error |
|---|---|---|---|
| trace_R 100 mm × 0.3 mm × 35 µm, 20 °C | 0.1/(58e6 × 1.05e-8) = 0.1642036124794746 Ω | 0.1642036124794746 | 0 |
| trace_R same, 30 °C | × (1 + 0.00393 × 10) = 0.17065681444991793 Ω | 0.17065681444991793 | 0 |
| via barrel area, 0.3 mm finished, 25 µm | π·t·(d+t) = 0.025525440310417067 mm² (annulus cross-check π/4·((d+2t)² − d²) = …074) | 0.025525440310417067 | 0 |
| via_R 1.6 mm | ρL/A = 1.0807338310749393 mΩ | 1.0807338310749393 | 0 |
| via_theta 1.6 mm, k = 401 | L/(kA) = 156.31561646470445 K/W | 156.31561646470445 | 0 |
| skin depth 10 MHz | √(ρ/(π f µ0)) = 20.89806784938892 µm | 20.89806784938892 | 0 |
| foil_spread_pct_1oz | (35 − 34.29)/34.29 × 100 = 2.070574511519396 % | 2.070574511519396 | 0 |
| `foilSpreadPercent()` (TS) | 2.070574511519396 | 2.0705745115193883 | 3.6e-15 |
| `COPPER_RESISTIVITY_20C` | 1/58e6 | `=== 1/58e6` true | 0 |

The deltas from the old vectors match the constant changes exactly:
- trace R: +2.2000e-5 relative, which is (1/58e6)/1.7241e-8 − 1;
- via θ: −3.990 %, which is 385/401 − 1.

The oracle and golden vectors also follow the pitfalls checklist:
- the via area uses the *finished* diameter with π·t·(d+t);
- skin depth uses √(ρ/(π f µ));
- trace R uses the temperature-adjusted ρ.

### 1c. Display (`formatFor`)
| Case | Expected | App | Note |
|---|---|---|---|
| 0.254 mm in mm / mil | 0.254 mm / 10 mil | "0.254 mm" / "10 mil" | exact |
| 1 mm in mil | 39.3701 mil (6 s.f.) | "39.3701 mil" | – |
| 298.15 K in °C / °F | 25 °C / 77 °F | "25 °C" / "77 °F" | – |
| ΔT 10 K in °F | 18 Δ°F | "18 Δ°F" | no offset |
| 999.5 Ω, estimate (2 s.f.); 999.9996 Ω (6 s.f.); 0.9995 Ω, empirical | roll-over to 1 kΩ, 1 kΩ, 1 Ω | "1 kΩ", "1 kΩ", "1 Ω" | roll-over correct; trailing zeros dropped ("1 kΩ", not "1.0 kΩ"), cosmetic |
| −4700 Ω; 0; −0 | −4.7 kΩ; 0 Ω; 0 Ω | as expected | – |
| 1e25 Ω; 1e-300 Ω; 5e-324 Ω | parseable | "10000000000000000 GΩ", "1e-288 pΩ", "4.94066e-312 pΩ" | all parse back |
| 1/58e6 Ω·m; 20 K/W; 401 W/(m·K); 0.00393 /K; 1e6 A/m²; 1 mil²; 1 oz/ft² | readable, parseable | "17.2414 nΩ·m", "20 K/W", "401 W/(m·K)", "0.00393 /K", "1 A/mm²", "1 mil²", "1 oz/ft²" | – |
| Mass 1 kg | – | "1000 g" (by design, never "kg") | Acceptable for a PCB tool: masses are grams-scale (foil, solder). Parses back. |
| 104 °C (377.15 K), estimate | – | **"100 °C"**; the same value in K prints "380 K" (106.85 °C) | m-3 |
| 1.149 mm, estimate | – | **"1.1 mm"** (−4.3 %) | m-3 |
| Density 8960 kg/m³ | – | "8960 m^-3·kg" (not parseable) | m-7 |
| Length 1e306 m | – | throws InvalidValueError (overflow in mm), although the input is finite | m-7 (unreachable in practice) |

**Round-trip fuzz** (60 000 random values × all dimensions × 18 preference sets × 5 accuracy classes): parse(formatFor(q)) is within half a unit in the last printed digit in every case except two:
- DENSITY: no display rule (m-7);
- 229 absolute temperatures within about 0.2 K of 0 K: at 2–3 s.f., °F prints "−460 °F", which is below 0 K and is rejected on re-parse (m-3).

No NaN or Infinity was ever printed.

### 1d. Confidence (`confidence.ts`)
- **Rule check.** I enumerated all 1 440 combinations: 4 accuracy classes × 4 data statuses × 0–2 out-of-range inputs × 0–7 defaulted assumptions × 0–2 safety-relevant defaults. In every case the level and score equal my independent statement of the rule: score = 2·OOR + 1·defaults + 2·safety + accuracy (0/0/1/2) + status (0/1/2/2); any OOR → low. `CONFIDENCE_RULE_TEXT` states exactly this rule.
- **"high"** occurs only for exact or analytical methods with VERIFIED data, no defaults and nothing out of range. I found no other path to "high".
- **"medium"** with nothing out of range occurs for 18 combinations, all consistent with the rule:
  - estimate + VERIFIED;
  - empirical + UNVERIFIED;
  - exact + PAYWALLED or CONFLICT;
  - analytical with 1 safety-relevant default or 2 plain defaults.

  No combination with an estimate method plus any default, or with UNVERIFIED data plus an empirical method plus a default, reaches medium.
- **P-1 is closed in core:** out-of-range forces low (also with an empty input name), defaults are uncapped, and score and reasons are returned. The UI half ("never render the level without reasons and score") cannot be checked until a calculator page exists.
- **Residuals:** m-5.

### 1e. CalcResult (`result.ts`)
- **Correctly enforced:**
  - `checkDesignValue` rejects max-limit factors outside (0, 1], min-requirement factors < 1, non-finite values, mixed kinds (absolute T vs ΔT), recommended ≠ calculated × factor beyond 1e-12 relative, and an empty rationale.
  - `checkEnvelope` rejects min > typ, typ > max, non-finite values and mixed dimensions.
  - `defaultedInputNames` returns every input whose source is not "user", including fab-profile, preset and unknown sources, which is conservative.
  - `highestWarningSeverity` ranks info < caution < warning < critical.
- **Invalid but accepted:** see m-2 and m-4.

### 1f. FabProfile (`fab/profile.ts`, JSON)
- **All checks behave as their messages say.** Verified behaviours:
  - non-VERIFIED with `bannerRequired: false` is rejected;
  - VERIFIED needs a non-blank `verifiedBy`;
  - status must be the full ledger spelling (`PAYWALLED` alone is rejected);
  - dates: 2024-02-29 and 2000-02-29 accepted; 2100-02-29, 2026-02-30, 0099-01-01, 0000-01-01, 2026-1-06 and dates with time, whitespace or numbers rejected;
  - units `mil`, `mils`, `thou`, `um`, `µm` and `μm` accepted; `MIL` and `oz/ft2` rejected;
  - value 0, string values, bare numbers and unknown limit keys rejected;
  - a JSON `__proto__` key is rejected as an unknown key;
  - pct must be in (0, 100]; copper weights must be > 0;
  - no hidden defaults: the template parses with `limits: {}`.
- **Age:** 2026-10-06 → 2027-10-06 is 365 days, not stale; 2027-10-07 is stale. The leap-day span 2024-02-28 → 03-01 is 2 days.
- **JLCPCB example vs live page** (raw HTML retrieved 2026-10-07; strings grepped verbatim):

| Profile key | Profile | `jlcpcb.md` §4c / S-008 | Live page 2026-10-07 (verbatim) | Result |
|---|---|---|---|---|
| minTraceWidth / Space | 3.5 mil | 3.5/3.5 mil multilayer | "Multilayer: 0.09 / 0.09 mm (3.5 / 3.5 mil)" | matches, but 3.5 mil = 0.0889 mm < 0.09 mm (m-8) |
| minDrill / maxDrill | 0.15 / 6.3 mm | 0.15–6.3 mm | "2-layer: 0.15 – 6.3 mm … Multilayer: 0.15 – 6.3 mm"; "1-layer: 0.3 – 6.3 mm" | matches (multilayer) |
| minAnnularRingRecommended / Absolute | 0.20 / 0.15 mm | 0.20 / 0.15 multilayer | "Multilayer: 1 oz: Recommended 0.20 mm or above; absolute minimum 0.15 mm 2 oz: 0.254 mm or above". The page heads this "PTH annular ring", not "via annular ring". | matches 1 oz; the 2 oz value 0.254 mm is not carried |
| holePlatingAverage | 18 µm | 18 µm | "Average Hole Plating Thickness 18μm" | matches |
| drillTolerancePlus / Minus | 0.13 / 0.08 mm | +0.13/−0.08 | "Hole size Tolerance Through-holes: +0.13 / -0.08 mm". The page frames this as the *finished* hole size. | value matches; the key name is misleading (m-8) |
| holePositionTolerance | 0.075 mm | ±0.075 | "Hole Position Tolerance ±0.075 mm" | matches |
| copperToEdge | 0.2 mm | 0.2 | "Copper clearance from routed board edges: ≧0.2 mm" | matches |
| holeToTrack | 0.2 mm | "hole to track 0.2 mm" | "Via hole to Track 0.2mm PTH to Track 0.28mm 0.35mm is recommended, minimum 0.28mm NPTH to Track 0.2mm" | **0.2 mm is the via value only.** PTH is 0.28 mm, and 0.35 mm is recommended (m-8) |
| traceWidthTolerancePct | 20 | ±20 % | "Track width tolerance ±20%" | matches |
| impedanceTolerancePct | 10 | ±10 % | "Impedance Tolerance ±10%" | matches |
| copperWeightsOzFt2 | [1] | 1/2 oz outer multilayer | "Finished Outer Layer Copper 2-layer: 1 oz / 2 oz / 2.5 oz / 3.5 oz / 4.5oz Multi-layer: 1 oz / 2 oz Finished Inner Layer Copper 0.5 oz / 1 oz / 2 oz" | deliberately a subset (the notes say so). JLCPCB itself calls these weights **"Finished"**, which is relevant to P-2 (m-8). |

### 1g. Shared-link hash (`src/state/hash.ts`)
- **Fuzz:** 5 000 random hashes. Atoms included `__proto__`, `constructor`, lone surrogates, `%E0%A4%A`, `<script>`, 70-key and 9 000-character links. Results:
  - 0 throws;
  - `reason` is always set exactly when `stateDiscarded` is set;
  - no prototype pollution;
  - no invalid reserved value passes;
  - every accepted calc state round-trips through `serializeHash` → `parseHash`.
- **List encoding:** 5 000 random lists containing `~ % & = # ? +`, emoji, lone surrogates and empty strings round-trip both directly and nested inside a hash. Lone surrogates become U+FFFD, as documented. Encoded output never contains `& = # ?`.
- **Residuals:** m-10.

### 1h. Compliance wording
- `npm run build` succeeded (25.8 kB JS).
- grep of `src/` (excluding tests) and `dist/` for compliant, compliance, certif, production-safe and fab-ready:
  - The only positive-claim string is `src/core/gate.ts:77` (`req.standard + ' compliant (per verified data…'`), which is the sanctioned gate path. It is not present in `dist/`, because no caller exists and it was tree-shaken.
  - Everything else is a negation: "Not a compliance certification", "does not certify compliance", "Nothing here certifies a design".
- No task-0 file adds claim text.
- C-1 and C-2 (the gate and audit residuals) remain as logged.

### 1i. Sensitivity and cross-checks
- **Sensitivity:** there is no calculator and no sensitivity readout yet, so there is nothing to compare. `Envelope` exists only as a type plus `checkEnvelope`.
- **Cross-checks:** `tests/crosscheck/` has only `_template.json`, `README.md`, `adapters.ts` and `runner.ts`. There are 0 records, none fabricated. X-01 and X-03 are "not yet obtained" (Phase 1 task 10).

## 2. Source table
| Claim | Source (retrieved 2026-10-07 unless noted) | Quote / evidence | Status |
|---|---|---|---|
| ρ20 = 1/58 Ω·mm²/m exactly; 1.7241 µΩ·cm is derived | NBS Handbook 100 (1966), archive.org OCR, https://archive.org/stream/copperwiretables100unit/copperwiretables100unit_djvu.txt | "in terms of volume conductivity it is an exact whole number, viz, 58 meter/ohm-mm2 at 20 °C"; "The fundamental quantities … the conductivity, 58 meter/ohm-mm2; the density, 8.89 …; and the temperature coefficient, 0.00393 per °C; all at 20 °C … All the other numerical values follow from these three"; "1.7241 microhm-cm at 20 °C" | S-004 wording CONFIRMED (VERIFIED is justified) |
| α20 = 0.00393 /K | same | "The International Electrotechnical Commission specified the temperature coefficient of standard copper to be 0.00393 at 20 °C, for the resistance between points fixed on a wire which is allowed to expand freely" | CONFIRMED |
| k(pure Cu) = 401 W/m·K at 300 K, ±2 % | Ho, Powell & Liley, JPCRD 1, 279 (1972), https://srd.nist.gov/jpcrdreprint/1.3253100.pdf (pdftotext; OCR partly garbled) | copper row "4.03 4.01 4.01" W/cm·K at 273.2 / 298.2 / 300 K; "The recommended values are for well-annealed high-purity copper and considered accurate to within ±2% of the true values near room temperature" (OCR-repaired reading) | S-007(a) CONFIRMED |
| PPPL pure copper | https://aries.pppl.gov/LIB/PROPS/PANOS/cu.html | Table: 293 K → k 400.68; 300 K → k 401.00, **c 385.00 J/kg·K**; header "Thermal Conductivity, @ 0 - 100 C : 401 W/m-K"; "Specific Heat @ 25 C : 385 J/kg-K" | CONFIRMED. Observation, not proof: the unsourced oracle value 385 W/m·K equals copper's *specific heat* 385 J/(kg·K), a plausible origin of the old error |
| C11000 391 (Aurubis), 394 (Bikar), HyperPhysics 385 | not re-fetched this run | – | relied on S-007 as recorded in the phase-0 run-2 extracts |
| Foil 35 µm (CircuitCalculator 1.378 mil/oz) | https://circuitcalculator.com/wordpress/2006/01/31/pcb-trace-width-calculator/ | "Width[mils] = Area[mils^2]/(Thickness[oz]*1.378[mils/oz])" | S-003(a) CONFIRMED |
| Foil 34.8 µm | https://jlcpcb.com/blog/pcb-copper-foil | "approximately 34.8 µm (1.37 mil), which is typically rounded to 35 µm" | S-003(b) CONFIRMED |
| Foil 1.35 mil (reported IPC-4562A) | https://blogs.sw.siemens.com/electronic-systems-design/2025/08/13/copper-thickness/ | "1 oz. 1.35 mils (34.3 μm)"; "nominal thicknesses, per IPC-4562A" (½ oz listed as 0.68 mil / 17.1 µm) | S-003(c) CONFIRMED (secondhand; IPC-4562A itself not read) |
| JLCPCB capability values | https://jlcpcb.com/capabilities/pcb-capabilities (raw HTML via curl, not a summarizer) | see §1f table | S-008 values confirmed except "hole to track" (m-8); row stays UNVERIFIED (fabricator data, changes without notice) |
| Exact factors (in, mil, ft², oz, °F) | NIST SP 811 App. B.8 (S-006) | not re-fetched; recomputed from the definitions | S-006 unchanged |

## 3. Defects

### BLOCKER
None.

### MAJOR
None.

### MINOR (conditions)

**m-1. A bare SI prefix is accepted in compound-unit fields, against the SI prefix-power convention.**
- Where: `src/core/units/parse.ts:213-220`.
- In any `plain`-kind field, a lone prefix multiplies the field's SI unit:
  - `10 m` in an AREA field → 0.01 m² (milli-*square-metre*). Under the SI convention (BIPM SI Brochure: a prefix is part of the unit symbol before the exponent; mm² = (mm)²), it would be 1e-6 × 10 = 1e-5 m²;
  - `35u` (area) → 3.5e-5 m²;
  - `1 m` (current density) → 1e-3 A/m²;
  - `1.72 u` (resistivity) → 1.72 µΩ·m. A designer who means the customary µΩ·cm is off by **100×**;
  - `4.5 k` (dimensionless, e.g. εr) → 4500.
- These are silent reinterpretations: the result is accepted and not flagged.
- **Fix:** allow a bare prefix only for dimensions with a single named unit (Ω, F, H, A, V, W, Hz, s, m). Reject it with a hint for AREA, CURRENT_DENSITY, RESISTIVITY, THERMAL_*, PER_KELVIN and DIMENSIONLESS.
- **Must close before** the first area, resistivity or current-density input field ships (tasks 2, 3).
- Owner: units-engine-engineer.

**m-2. `checkDesignValue` accepts multiplicative derating of an absolute temperature and of non-positive values.**
- Where: `src/core/result.ts:110-136`.
- Reproduction: `{direction:'max-limit', calculated: 378.15 K (105 °C), recommended: 340.335 K, factor 0.9}` is accepted. This means "recommended max 67.2 °C". Scaling an offset scale has no physical meaning, and `mul()` deliberately forbids it, but the check computes on raw `.si` and bypasses that guard.
- Also accepted:
  - `calculated −10 A, recommended −8 A, max-limit 0.8`: the "derated" value is larger than the limit;
  - `calculated 0, recommended 0`.
- Today's direction is conservative and there is no caller, so this is not MAJOR.
- **Fix:**
  - reject `dim.kind === 'absTemp'`; derate temperatures as a ΔT margin;
  - require `calculated.si > 0`.
- **Must close before** Phase 1 task 2 (max conductor temperature is an input there).
- Owner: calc-implementer + test-engineer.

**m-3. Display rounding has no direction, and fixed significant figures are applied to offset-scale temperatures.**
- Where: `src/core/units/display.ts:109-111,136-140`.
- Reproduction (estimate class, 2 s.f.):
  - required width 1.149 mm prints "1.1 mm" (−4.3 %, non-conservative for a minimum);
  - 104 °C prints "100 °C" (−4 K for a maximum temperature). The same quantity prints "380 K" (106.85 °C) under the K preference, so the precision depends on the chosen offset;
  - 0.4 °C prints "0.4 °C".
  - Near 0 K, °F prints "−460 °F", which fails re-parse.
- **Fix:**
  - add a rounding direction (`'up' | 'down' | 'nearest'`) so limits round conservatively (P-4 asked for widths to round *up* to the fab grid);
  - format absolute temperatures to fixed decimals derived from the ΔT precision, not to s.f.;
  - keep trailing zeros ("1.0 kΩ") so the printed precision is visible.
- **Must close before** the first headline result (task 2).
- Owner: units-engine-engineer + ui-engineer.

**m-4. `assertNoNonFinite` does not cover every numeric field.**
- Where: `src/core/result.ts:152-170`.
- It does not check `designValue.derating.factor` or `confidence.score`. A result with factor NaN and score NaN passes. A score of NaN does occur when `dataStatus` is an unknown string at runtime (`confidence.ts:51-58` → `{level:'low', reasons:[], score:NaN}`).
- `checkDesignValue` and `checkEnvelope` are also not invoked by `assertNoNonFinite`. A calculator can therefore return an invalid design value or envelope unless each one calls the checks.
- **Fix:**
  - include both numbers in the check;
  - have `assertNoNonFinite` (or a new `assertCalcResult`) run `checkDesignValue` and `checkEnvelope`;
  - make `confidenceScore` throw on an unknown status.
- Owner: calc-implementer.

**m-5. The confidence contract for `safetyRelevantDefaults` is undocumented and not wired to inputs.**
- Where: `src/core/confidence.ts:8-9,51-58`.
- It is not stated whether a safety-relevant default must also appear in `defaultedAssumptions`. The same situation scores 2 (medium) or 3 (low) depending on the caller. Duplicate names count twice.
- Nothing links `CalcInput.source` / `defaultedInputNames()` to the factors. A calculator can mark an input `source:'default'` and still pass `defaultedAssumptions: []`, which gives "high".
- **Fix:**
  - document the sets as disjoint and dedupe them;
  - add a helper that builds the factors from `inputs[]` plus a per-calculator safety list;
  - add a per-calculator test that `defaultedInputNames(inputs) ⊆ defaultedAssumptions ∪ safetyRelevantDefaults`.
- Owner: calc-implementer + test-engineer.

**m-6. The absolute-zero tolerance applies to literal input.**
- Where: `src/core/units/quantity.ts:23-30`.
- `-1e-10 K` and `-1e-12 K` typed by a user are accepted as negative absolute temperatures.
- `-459.67 °F` stores −5.68e-14 K, which prints as "−5.684e-14 K" under the K preference.
- This is harmless physically but prints an impossible value.
- **Fix:** clamp values in [−tol, 0) to 0 at `q()`, or apply the tolerance only to converted values.
- Owner: units-engine-engineer.

**m-7. Display gaps.**
- Where: `display.ts:146`, `units-table.ts:194-195`.
- DENSITY (and any other dimension without a rule) falls back to "8960 m^-3·kg", which is not parseable.
- `formatFor` throws on a finite length ≥ about 1.8e305 m, because the mm conversion overflows. The docstring says it throws only on non-finite input.
- Both are unreachable in current flows.
- Owner: units-engine-engineer.

**m-8. JLCPCB example profile, S-008 and key semantics.**
- Where: `src/core/data/fab-profiles/jlcpcb-2026-10-06.json:14,21-22,25,28`; `docs/sources/LEDGER.md:22`; `docs/research/jlcpcb.md` §4c.
- (a) `holeToTrack 0.2 mm` is JLCPCB's **via**-hole-to-track value. PTH-to-track is "minimum 0.28mm", with "0.35mm … recommended". As a single "hole to track" limit, 0.2 mm is non-conservative by 0.08 mm for PTH. Split the key (`viaToTrack`, `pthToTrack`, `npthToTrack`) or use 0.28 mm, and correct S-008 and the research note.
- (b) 3.5 mil (0.0889 mm) is used where JLCPCB's primary figure is 0.09 mm. 3.5 mil passes a 0.089 mm track that is below JLCPCB's mm limit (1.2 %). Prefer `{value: 0.09, unit: 'mm'}`.
- (c) `drillTolerancePlus/Minus` is the published *finished-hole* size tolerance ("Hole size Tolerance Through-holes"). Naming it "drill" invites applying it to the drill bit, which is the via-pitfall finished-vs-drill confusion. Rename it or document it.
- (d) The schema has no layer-count or copper-weight dimension. 1-2 layer values exist only in `notes`, and the 2 oz annular ring (0.254 mm) is dropped.
- (e) JLCPCB lists outer copper as "Finished Outer Layer Copper … 1 oz / 2 oz". This is input for P-2 (what "1 oz" means at this fab).
- Severity is MINOR because the profile is UNVERIFIED, banner-required and labelled "example only".
- Owner: standards-researcher (S-008, research note) + calc-implementer (schema) + human (R-5).

**m-9. FabProfile plausibility gaps.**
- Where: `src/core/fab/profile.ts:66-78,147-162,193-195`.
- No cross-field checks: `minDrill 7 mm > maxDrill 6.3 mm` and `minAnnularRingAbsolute > Recommended` are accepted.
- No magnitude sanity: a 0.2 **m** annular ring, a 1e308 in drill and 1000 oz copper are all accepted.
- Future dates are accepted (9999-12-31). `fabProfileStale` returns false for future dates, so a mistyped year disables the staleness warning.
- The parsed profile and its `limits` are not frozen.
- Unknown ledger ids pass `parseFabProfile`; only the separate `unknownLedgerIds()` reports them.
- There is no machine-readable JSON Schema file; the TS validator is the schema.
- Owner: calc-implementer + devops-engineer (audit).

**m-10. Small issues in the parser, hash, constants and ledger.**
- (a) `parse.ts:106-111`: for `1,000 mm` the hint suggests `"1.000 mm"`. A user who meant one thousand is pointed at 1 mm (1000×). When the comma group is exactly 3 digits, say "remove the thousands separator **or** use '.' as the decimal point", without a single example.
- (b) `hash.ts:216-217`: a duplicate `v` is last-wins (`v=2&v=1` is accepted) while other keys are first-wins. Pick one rule.
- (c) `constants.ts:49`: the k assumption text says "sources disagree by a few percent". It should also say that 401 is well-annealed high-purity copper at 300 K, that plated via-barrel copper was **not** researched, and that the highest k gives the lowest θ (the non-conservative direction for via temperature).
- (d) `constants.ts:66`: the foil assumption text says everything derived "carries that spread" (2.07 %). It should add that finished copper differs from nominal far more (P-2).
- (e) Stale text:
  - `src/core/data/ledger.ts:24`, rendered on the About page: "oracle 385 unsourced";
  - `docs/sources/LEDGER.md:21` item: "(oracle uses 385 W/m·K for via θ)";
  - `OPEN_RISKS.md` still lists R-10, R-11 and C-5 as OPEN, although the oracle, golden vectors and constants now use 401 and 1/58e6 and cite S-007.
- (f) A dimensionless field accepts bare "50". For any fraction input (duty cycle D in I_rms = I_pk·√D), the calculator must range-check (0, 1] or require "%". Otherwise "50" gives I_rms = 7.07 × I_pk.
- (g) The vocabulary still lacks `A/mil2`, `sq mm`, `mm^2`, `K^-1`, `kA/mm2` and `4k7 Ω`. `mil^2` and `mm^2` get a "Did you mean" hint, but these spellings are not P-3 essentials.
- Owners:
  - (a, g): units-engine-engineer;
  - (b): ui-engineer;
  - (c, d): calc-implementer;
  - (e): standards-researcher + orchestrator (R-10, R-11 and C-5 status);
  - (f): calc-implementer (every calculator with a fraction input).

## 4. Disposition of the findings task 0 was meant to close
| Item | Status after this run |
|---|---|
| P-1 confidence | **Closed in core.** UI rendering of reasons and score not yet checkable. m-5 open. |
| P-3 parser | **Closed** for the task-0 list. m-1 and m-10(a, g) open. |
| P-4 display | **Partly closed.** Units and s.f. by class are done. Conservative rounding and absolute-temperature precision are open (m-3). |
| P-6 CalcResult | **Closed** (all six slots exist). m-2 and m-4 open. |
| P-7 FabProfile | **Closed for type + validator + example.** m-8 and m-9 open; the richer P-7 field list (finished copper, per-weight/per-layer trace/space, aspect ratio) is deferred. |
| R-9 foil default | 35 µm default, labelled; spread 2.0706 % verified; text names no standard. Close per human decision. |
| R-10 k_Cu | 401 default, 391 selectable, 385 gone; S-007(a) re-verified. Can close; update the stale texts (m-10e). |
| R-11 ρ exact | `1/58e6` exact in TS and the oracle; S-004 re-verified. Can close. |
| C-5 vector note | via_theta now cites S-007 and "UNLEDGERED" is removed. Can close. |

## What I could NOT verify
- IPC-4562A, IPC-6012, IPC-2221/2152 and IEC 60028 are paywalled; none was read. The 1.35 mil figure is secondhand (Siemens blog).
- Aurubis C11000, Bikar CW004A and HyperPhysics (the S-007 b/c values) were not re-fetched this run.
- The HPL 1972 copper table was read through garbled OCR. The digits 4.03/4.01/4.01 and the ±2 % sentence are legible, but the column alignment to 273.2/298.2/300 K is inferred from the table layout.
- The JLCPCB page was read as raw HTML text with tags stripped. Values are verbatim strings, but the table structure (which value belongs to which row heading) is inferred from text order. JLCPCB can change the page at any time.
- UI behaviour (whether reasons and score are always shown, the discard banner in a real browser, the parsed-value echo) is outside my tools in this run; it belongs to the phase-validator and the domain reviewer.
- Lint, typecheck, bundle size and CI were not checked; they belong to the phase-validator. `vitest run` passed 1087/1087 and `npm run build` succeeded.
- The SI prefix-power convention cited in m-1 is supported only by a web-search snippet, retrieved 2026-10-07, of the BIPM/NIST SI guidance (https://www.nist.gov/node/1579471; https://en.wikipedia.org/wiki/Metric_prefix): "The symbol of a prefix is considered to be combined with the single unit symbol to which it is directly attached, forming with it a new symbol … that can be raised to a positive or negative power … 1 cm³ = (10⁻² m)³ = 10⁻⁶ m³". The BIPM SI Brochure text itself was not opened. m-1 does not depend on it, because rejecting an ambiguous bare prefix is safe either way.
