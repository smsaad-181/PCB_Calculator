# Phase 1 calculations validation (calc-validator)

Date: 2026-10-11. Branch `phase-1-task-3`, head `67ac40d`.
Scope: `src/core/calculators/` copper-converter, trace-width (legacy IPC-2221, Mode B), trace-resistance, ohm-power, resistor-divider; `src/core/eseries.ts` and `src/core/data/eseries.ts`; foil and unit conventions.

## Verdict: PASS-WITH-CONDITIONS

There are no BLOCKER or MAJOR defects.
- **Numbers:** 69 numeric cases agree with an independent python3+math recomputation. Every closed-form case is within 1e-6 relative, so no app value is off by more than 1 ppm.
- **E-series:** the tables match 10^(n/N) rounding everywhere except the published exceptions.
- **Pair search:** `bestPairs` returns the true optimum in all 11 brute-force checks.
- **Rejection:** every degenerate input is rejected with a clear message.
- **Range warnings:** every out-of-range input I tried raises a warning, with one gap (finding F-1).

Four MINOR findings are listed below. They are the conditions for this verdict and should go into `docs/validation/OPEN_RISKS.md`.

## Method (independence)

1. I derived the expected formulas from `docs/SPEC.md`, `docs/sources/LEDGER.md` (S-001, S-003, S-003d, S-004, S-006, S-009, S-010, S-013, S-016, S-019) and the calculator `meta.ts` formula strings. I did not start from the implementations.
2. I wrote the oracle `validator_scratch/p1_indep.py` and the comparator `compare.py` in python3 with `math` only. They do not import `ref_calcs.py` or `src/`.
3. A scratch harness called the public `compute()` / `nearest()` / `bestPairs()` and dumped the raw SI outputs. The Python comparator then compared them with the oracle.
4. After that I read the implementation where behaviour needed explaining: `eseries.ts`, the divider envelope, and the status derivation.
5. `python3 tools/reference/ref_calcs.py` exits 0 (all its vectors OK). `gen_golden.py --check` reports that `docs/golden-vectors.json` matches the oracle (470 vectors). `npx vitest run src/core` gives 56 files and 2399 tests, all passing.
6. The scratch folder was deleted after the run, so it is not committed.

Constants used by the oracle:
- ρ20 = 1/58e6 Ω·m and α20 = 0.00393 K⁻¹ (S-004).
- μ0 = 4π×10⁻⁷ H/m.
- 1 oz/ft² = 0.028349523125 kg / 0.09290304 m² = 0.3051517 kg/m² (S-006).
- Foil conventions (S-003): 35 µm, 1.35 mil = 34.29 µm, or areal mass / 8890 kg/m³ = 34.3253 µm.
- IPC-2221 legacy fit: I = k·ΔT^0.44·A^0.725, with A in mil² and k = 0.048 external, 0.024 internal (S-001).

## Results table (oracle vs app)

All relative errors are below 1e-12 unless a value is shown (closed-form math; the tolerance is 0.1 %). "Bound" is the rounding direction the app applies.

| Calculator | Case (type) | Oracle | App | Rel. err |
|---|---|---|---|---|
| Trace width | outer, 1 A, ΔT 10, 1 oz at 35 µm (golden) | 11.826241 mil = 0.300387 mm | 0.300387 mm, shown "0.301 mm (11.83 mil)", rounded up | < 1e-12 |
| Trace width | inner, 1 A, 10, 1 oz (golden) | 30.765254 mil = 0.781437 mm | same | < 1e-12 |
| Trace width | outer, 10 A, 30, 2 oz (golden) | matches the formula | same | < 1e-12 |
| Trace width | outer, 35 A, 100, 3 oz (boundary) | 131.3947 mil | same, no warning | < 1e-12 |
| Trace width | inner, 20 A, 100, 3 oz (boundary/OOR per KiCad) | formula value | same, **no warning** (F-1) | < 1e-12 |
| Trace width | outer, 40 A, 20, 1 oz (out of range) | 1259 mil | same; OUT_OF_CHART_RANGE warnings on I and width; confidence low | < 1e-12 |
| Trace width | ΔT 150 / 0.25 oz / width 500 mil (out of range) | formula | same; warned; low | < 1e-12 |
| Trace width | ΔT 5 (below chart start) | formula | same; info DT_BELOW_CHART_START | < 1e-12 |
| Trace width | 18 Δ°F, which is 10 Δ°C (unit) | 0.300387 mm | same | < 1e-12 |
| Trace width | 1.35 mil and mass-density conventions | 34.29 µm and 34.3253 µm bases | same | < 1e-12 |
| Trace width | current from width 20 mil | 1.463635 A | same; shown 1.46 A, rounded down; recommended 1.17 A (×0.8), rounded down | < 1e-12 |
| Trace width | ΔT from 1 A, 12 mil | 9.762531 Δ°C | same; shown 9.8, rounded up | < 1e-12 |
| Trace width | inner, 7.3 A, 27, 1.5 oz (random) | formula | same | < 1e-12 |
| Trace width | I = 0, ΔT < 0, NaN, ∞ (degenerate) | reject | rejected with field and message | n/a |
| Trace width | absolute °C passed as ΔT (dimension) | reject | DIMENSION error | n/a |
| Trace width | all three of width/I/ΔT; both weight and thickness | reject | rejected | n/a |
| Trace resistance | 100 mm × 0.254 mm, 1 oz outer, 25 °C (golden) | 197.752221 mΩ | same; shown 197.8 mΩ, rounded up | < 1e-12 |
| Trace resistance | 1 in × 10 mil × 35 µm, 20 °C (golden) | 49.261084 mΩ | same | < 1e-12 |
| Trace resistance | 25 °C + ΔT 60 = 85 °C; 3 A drop and power (golden) | R(85), 3R, 9R | same; 593.3 mV, 1.78 W | < 1e-12 |
| Trace resistance | −55 °C / 150 °C (boundary) | 136.777084 / 293.025872 mΩ | same | < 1e-12 |
| Trace resistance | 200 °C (out of range) | formula | same; validity fail; low | < 1e-12 |
| Trace resistance | −250 °C, below the ρ(T) = 0 point at −234.45 °C (degenerate) | reject | OUT_OF_DOMAIN | n/a |
| Trace resistance | L = 0, w < 0, NaN (degenerate) | reject | rejected | n/a |
| Trace resistance | 77 °F | 25 °C value | same | < 1e-12 |
| Trace resistance | ρ override 1.9e-8; with α 0.00357 at 85 °C | formula | same; status UNVERIFIED and caution | < 1e-12 |
| Trace resistance | skin depth at 10 MHz, 85 °C (uses ρ(T)) | 23.4 µm | same | < 1e-12 |
| Trace resistance | skin depth at 2 GHz (out of range) | formula | same; SKIN_EFFECT and FREQUENCY_RANGE warnings | < 1e-12 |
| Trace resistance | 20 m length (out of range) | formula | same; validity fail | < 1e-12 |
| Trace resistance | 37.3 mm × 0.61 mm × 2 oz, 43 + 12.5 °C, 1.7 A (random) | formula | same | < 1e-12 |
| Copper converter | 1 oz in each of the 3 conventions (golden) | 35 / 34.29 / 34.32528 µm | same; spread 2.0706 % | < 1e-12 |
| Copper converter | 35 µm back to oz, 3 conventions | 1 / 1.02070 / 1.01966 oz | same | < 1e-12 |
| Copper converter | 0.25 oz / 10 oz (boundary) | 8.75 / 350 µm | same, no warning | < 1e-12 |
| Copper converter | 12 oz / 0.1 oz (out of range) | 420 / 3.5 µm | same; validity fail; low | < 1e-12 |
| Copper converter | 0.3051517 kg/m² input; 1.37 mil input | 35 µm; 0.99420 oz | same | < 1e-12 |
| Copper converter | 0, NaN, both inputs (degenerate) | reject | rejected | n/a |
| Ohm/power | 5 V, 100 Ω (golden) | 50 mA, 250 mW | same | 0 |
| Ohm/power | the V-I, V-P, I-R, I-P, R-P pairs (golden) | closed form | same | < 1e-15 |
| Ohm/power | 5 kV; R = 1e-9 Ω (out of range) | closed form | same; validity fail; low | < 1e-15 |
| Ohm/power | R = 0, V < 0, NaN, 1 input, 3 inputs (degenerate) | reject | rejected (3 consistent inputs are also rejected, by design) | n/a |
| Ohm/power | I 13.7 mA, P 42.1 mW (random) | closed form | same | < 1e-15 |
| Divider | 12 V, R2 10k, 3.3 V, E96 nearest (golden) | ideal R1 26 363.64 → 26.1k, Vout 3.324100 V | same | < 1e-12 |
| Divider | the same with E24; snap up; snap down | 27k → 3.24324 V; 26.7k → 3.26975 V; 26.1k | same | < 1e-12 |
| Divider | solve R2: R1 47k, E96 | ideal 17 827.6 → 17.8k, Vout 3.29630 V | same | < 1e-12 |
| Divider | 100k load, solve R1, E96 | ideal 23 966.94 → 23.7k, Vout 3.32686 V | same | < 1e-12 |
| Divider | Vout with 100k load | 1.944895 V | same | < 1e-12 |
| Divider | envelope: 1 % R (and load), 2 % Vin, corner analysis | 1.874270 / 2.017264 V | same | < 1e-12 |
| Divider | 2 kV; R = 2 GΩ (out of range) | closed form | same; validity fail; low | < 1e-12 |
| Divider | target ≥ Vin; load too heavy; R1 = 0 (degenerate) | reject | rejected with explanation | n/a |
| Divider | 9 V, R1 33k, 2.048 V, E192 (random) | ideal 9721.52 → 9.76k | same | < 1e-12 |

### Sensitivity (trace width, base 2 A / 20 Δ°C / 35 µm, perturbed ±1 % and ±10 %)

The measured elasticity d ln W / d ln x is:
- current: 1.3793, which equals 1/0.725;
- ΔT: −0.6069, which equals −0.44/0.725;
- thickness: −1.0000.

All perturbations move W in the expected direction. Trace resistance rises linearly with L and with T. There is no sensitivity readout in the app to compare against.

### E-series library

| Check | Result |
|---|---|
| E3 to E192 sizes | 3, 6, 12, 24, 48, 96, 192; sorted |
| Rounding 10^(n/N) to 2 s.f. (E3 to E24) and 3 s.f. (E48 to E192) | Only the published exceptions differ: E24 n = 10–16 and 22 (2.7 3.0 3.3 3.6 3.9 4.3 4.7 8.2). Their subsets E3/E6/E12 inherit them. E192 n = 185 is 9.20. E48 and E96 have no deviations. |
| Nesting | E48 = E96[::2] and E96 = E192[::2]: both true |
| `nearest` (19 cases) | Matches the oracle. The metric is arithmetic: minimum absolute difference, ties go up. Up and down are exact at series values. Values outside 1e-12 to 1e12, 0, negatives and NaN are rejected. |
| `bestPairs` (11 cases: series, parallel, divider-ratio; E12 to E192) | The best error equals an independent brute force over the same decade window in all 11 cases. The tie-break prefers fewer digits (1k + 2k before 300 + 2.7k). |

### Directional rounding (headline strings)

| Bound | Values | Rounding | Correct |
|---|---|---|---|
| min-requirement | width 0.30039 → 0.301 mm; recommended 0.37548 → 0.376 mm | up | yes |
| max-capacity | 1.46364 → 1.46 A; recommended 1.17 A | down | yes |
| prediction (ΔT, conductor T, R, V drop, P, current density) | — | up | yes |

Copper and skin-depth thickness use the µm display role in the UI view models.

## Cross-check records

`tests/crosscheck/` contains only `README.md`, `_template.json`, `adapters.ts` and `runner.ts`. There are no records, so the tool outputs are "not yet obtained" for every Phase 1 calculator. Nothing was classified, and no ledger row is affected.

## Source table (claim → URL → status)

| Claim | Source checked by me (retrieved 2026-10-11) | Status |
|---|---|---|
| IPC-2221 fit: I = k·ΔT^0.44·A^0.725, k 0.048/0.024, width = A/(oz·1.378 mil) | CircuitCalculator.com, quoted: "Area[mils^2] = (Current[Amps]/(k*(Temp_Rise[deg. C])^b))^(1/c)", "Width[mils] = Area[mils^2]/(Thickness[oz]*1.378[mils/oz])", "external layers: k = 0.048, b = 0.44, c = 0.725". https://circuitcalculator.com/wordpress/2006/01/31/pcb-trace-width-calculator/ | Secondary only. The ledger correctly keeps S-001 PAYWALLED-USER-MUST-VERIFY, and the app is labelled "legacy" with status PAYWALLED. The standard was not read. |
| E-series values and exceptions | Wikipedia "E series of preferred numbers": E24 list; "eight official values ... are different from the calculated values" (n = 10–16, 22); "n=185 where 9.20 is the official value instead of the calculated 9.19"; E48/E96/E192 "rounded to 3 significant figures". https://en.wikipedia.org/wiki/E_series_of_preferred_numbers | Tertiary; IEC 60063 is paywalled. S-016 is correctly PAYWALLED, and snapped divider results carry status PAYWALLED. |
| IACS ρ = 1/58 µΩ·m at 20 °C, α = 0.00393 K⁻¹ | Search confirms the NBS Circular 31 basis (0.15328 Ω·g/m², α 0.00393, 8.89 g/cm³) and the IEC 1913 adoption of 58 MS/m. https://en.wikipedia.org/wiki/International_Annealed_Copper_Standard ; https://nvlpubs.nist.gov/nistpubs/Legacy/circ/nbscircular31e3.pdf (PDF not text-extracted here) | VERIFIED in the ledger with two sources. I did not re-read the PDF and rely on the ledger's archive.org quote. |
| 1 oz/ft² = 0.3051517 kg/m² | Exact unit definitions (S-006) | Exact; recomputed |
| Foil thickness conventions | Ledger S-003 (CONFLICT). The human decision G-2/D-2 sets the default to 35 µm as a labelled assumption and excludes S-003 from `dataStatus` (SPEC §Result schema). | Shown honestly as an assumption plus a CONVENTION_SPREAD note |
| Ohm, power, divider and loaded-divider relations | Ledger S-019 (OpenStax University Physics 2; Fiore, LibreTexts) | VERIFIED; textbook definitions |

## Known-pitfalls checklist (Phase 1 relevant)

| Pitfall | Result |
|---|---|
| IPC-2221 area in mil², width = A / thickness in mil | Correct |
| Resistance uses ρ(T) | Correct; the linear model rejects T ≤ −234.45 °C |
| Skin depth uses √(ρ/(π f μ)) with ρ(T) | Correct |
| ΔT kept separate from absolute T | Correct; an absolute T passed as ΔT is a DIMENSION error; Δ°F converts correctly |
| Foil weight treated as areal mass, not length | Correct; kg/m² input round-trips |
| No compliance or fab-ready wording outside `gate.ts` | Correct. A grep of `src` (excluding tests) for compliant, production safe, fab-ready, guarantee and certified finds only `gate.ts:77`. |

## Defects

| # | Severity | Finding | Reproduction | Expected vs actual | Fix owner |
|---|---|---|---|---|---|
| F-1 | MINOR | The trace-width inner-layer current check uses the 35 A limit. Ledger S-010 records a conflicting secondhand internal limit of 17.5 A (KiCad legacy help). No validity check, warning or note covers inner currents between 17.5 and 35 A. | `compute({mode:'B', layer:'inner', current:20 A, deltaT:100 Δ°C, copperWeight:3 oz/ft²})` | Expected at least a caution such as "above 17.5 A internal (KiCad legacy, S-010 conflict)". Actual: no validity failure and no range warning (only LEGACY_METHOD and INNER_K_CONSERVATIVE). The number itself is correct. | calc-implementer (meta `validity`), standards-researcher (resolve the S-010 conflict) |
| F-2 | MINOR | The copper converter ignores `thicknessBasis` in weight mode without saying so. | `compute({layer:'outer', weight:1 oz/ft², thicknessBasis:'finished'})` | Expected a rejection or a warning that the basis is ignored. Actual: OK result with basis `nominal`, and nothing says the field was dropped. The UI may never send this combination; this is an API-level gap. | calc-implementer (guards) |
| F-3 | MINOR | The copper converter's `reference.ledgerIds` includes S-009 (PAYWALLED-USER-MUST-VERIFY), and its numbers drive the OUTER_FINISHES_THICKER / INNER_FINISHES_THINNER cautions. The +37 % and −29 % match 47.9/35 and 24.9/35. `dataStatus` is still VERIFIED because S-009 is not in the status computation. The caution text does say "secondhand, not read from the standard". | any converter result | Expected the paywalled status to be visible on the caution, for example through a per-warning badge, or S-009 included when the caution fires. Actual: the overall status is VERIFIED. | calc-implementer / ui-engineer |
| F-4 | MINOR (documentation) | The meaning of "nearest" in E-series snapping is arithmetic (minimum absolute difference, ties go up), not geometric. This is defensible because it minimises the absolute error, but it is not stated to the user. It changes picks in coarse series: E3 3.3 → 2.2 (−33 %) rather than 4.7 (+42 %), which is the geometric-nearest value. | `nearest(3.3,'E3','nearest')` | Expected the metric to be stated in the UI help or the E-series page text. Actual: it is stated only in the code comments and the oracle. | ui-engineer |

### Notes (no defect)

- The divider tolerance envelope also applies the resistor tolerance to the load RL. This is disclosed through `toleranceInputs: ['r1','r2','load','vin']`. Real loads such as ADC inputs often have much wider tolerance, so the pcb-domain-reviewer may want a separate load tolerance.
- The divider "output impedance" is R1‖R2, which is the Thevenin source impedance seen by the load and excludes RL. That is correct, but the label could say "source (Thevenin) impedance".
- The skin-depth screen ("δ ≥ t/2") is labelled as a rule of thumb, not a standard. That is acceptable for a screen.
- Trace-width confidence is always low because S-001/S-010 are paywalled and the method is empirical. This is conservative and consistent with the rule text.

## What I could NOT verify

- The IPC-2221B/C text: the k values, the exponents, and the Figure 6-4 axis ranges, including any separate internal-layer current limit. Paywalled; I saw only secondary sources.
- IEC 60063:2015 E-series tables. Paywalled; checked against Wikipedia and the 10^(n/N) definition only.
- IPC-4562A (1.35 mil per oz) and IPC-6012 finished-copper minimums (S-009). Paywalled and secondhand.
- NBS Circular 31 / Handbook 100. The PDF was not text-extracted here, so I rely on the ledger's archive.org OCR quote plus a search summary.
- Cross-check tool outputs (KiCad and others). No records exist, and running third-party tools needs human approval.
- UI rendering of the badges and warnings in a browser. My checks covered the view-model code paths only, not the Playwright UI.
