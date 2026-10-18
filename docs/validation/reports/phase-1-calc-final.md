# Phase 1 final calculations validation (calc-validator)

Date: 2026-10-15. Branch `phase-1-task-10`, head `c06c05e`.
Scope: every calculator built since the interim report (`phase-1-calc.md`, 2026-10-11):
- self-heating, voltage-drop, via, annular-ring, path-load (with its net-class export);
- feedback-divider, led-resistor, rc-lc, reactance;
- the envelope/sensitivity layer (trace width, trace resistance, via) and the RMS pulse input in trace width;
- the percent and utilisation formatters and the 4-ulp directional-rounding guard;
- the scoped JLCPCB fab profile against ledger rows S-019c and S-019i..m;
- ledger honesty for S-019c..S-019m, confidence behaviour, and the `tests/crosscheck/` records.

For calculators that changed after the interim report, I re-checked only the changed code: resistor-divider load tolerance, copper-converter F-2, and the E-series `nearestRatio`.

## Verdict: PASS-WITH-CONDITIONS

There are no BLOCKER or MAJOR defects.
- **Numbers:** about 110 numeric cases were recomputed independently. Every closed-form case agrees to within 1e-9 relative, and almost all to within 1e-15. The only exception is the self-heating Brent solve at the user search limit: 5e-7 relative, inside its stated 1e-6 tolerance.
- **Rejection:** all of about 60 degenerate or guard inputs are rejected with a field and a clear message. This includes NaN, ±Infinity, zero, negative, fractional counts, over-specified inputs, a missing required choice, absolute temperature given where ΔT is needed (and the reverse), and wrong dimensions.
- **Range warnings:** every out-of-range input I tried gives a validity failure and confidence "low".
- **Orchestrator anchors:** all 7 anchors are reproduced exactly.

Seven MINOR findings (F-1 to F-7, listed below) are the conditions for this verdict and should be logged in `docs/validation/OPEN_RISKS.md`. None of them changes a number in the unsafe direction.

## Method (independence)

1. **Expected formulas.** I took them from `docs/SPEC.md`, `LEDGER.md` (S-004, S-006, S-019, S-019b..m), the notes in `docs/sources/notes/`, and the `meta.ts` formula strings. I did not read the calculation logic in `src/` before recomputing.
2. **Oracle.** A fresh python3 + `math` script, `tools/reference/validator_scratch/oracle_final.py`, is the oracle. It does not use `ref_calcs.py`; I ran that file only for its exit code (0) and `gen_golden.py --check` (OK). The constants are:
   - ρ20 = 1/58e6 Ω·m;
   - α = 0.00393 K⁻¹;
   - k_Cu = 401 W/(m·K), the app default (S-007 is CONFLICT);
   - 1 mil = 25.4 µm;
   - IPC-2221 legacy fit with k = 0.048/0.024 and exponents 0.44/0.725, with the area in mil² (S-001).
3. **App values.** Scratch vitest harnesses (`*.scratch.ts`, with their own config, outside `src/` and `tests/`) called only the public `compute()`, `formatResult`, `formatPercent`, `formatSignedPercent`, `formatUtilisation`, `parseFabProfile` and `nearestRatio`. They dumped the SI values, bounds, printed strings, warnings, validity checks, confidence and data status, and Python compared them with the oracle.
4. **Reading the code.** Only after comparing did I read code, and only where behaviour needed explaining: `round-guard.ts`, `format-result.ts` (the percent part), warning texts, `netclass.ts` notes and the E-series diff.
5. **Project suite.** `vitest run` passes: 120 files, 4420 tests.
6. **Cleanup.** The scratch folder was deleted after the run.

## Results (oracle vs app)

"exact" means a relative error below 1e-12. "Bound" is the print direction the app used, and I checked it against the value.

| Calculator | Case (type) | Oracle | App (printed) | Rel. err |
|---|---|---|---|---|
| Self-heating | **Anchor** 2 A, 100 mm × 0.254 mm × 35 µm, θ 50 K/W, 25 °C (golden) | ΔT = θI²R(25)/(1 − θI²R20α) = 46.66377 K; loop gain k = 0.15244 | 46.66377 ("46.7 Δ°C", up) | 1.5e-16 |
| Self-heating | 1 A, θ 80, 40 °C (golden) | 17.82150 K | same | 0 |
| Self-heating | inner, 3 A, θ 20 (golden) | 41.25540 K | same | 0 |
| Self-heating | θ per length 5 K·m/W, and 5000 K·mm/W (unit) | 46.66377 K | same | 1.5e-16 |
| Self-heating | 37.3 mm × 0.61 mm × 70 µm, 3.7 A, θ 23.5, 43 °C (random) | 5.385870 K | same | 0 |
| Self-heating | 77 °F ambient (unit) | 46.66377 K | same | 0 |
| Self-heating | legacy-calibrated 2 A outer, 25 °C (θ_eff = ΔT_ipc/(I²R20)) | ΔT_ipc 63.7075, θ_eff 82.1222 K/W, ΔT 86.6553 K | same; status PAYWALLED | 1.6e-16 |
| Self-heating | legacy-calibrated, 20 °C ambient | 84.9853 K | same | 0 |
| Self-heating | legacy-calibrated inner 1 A | θ_eff 328.489, ΔT 86.6553 K | same | 1.6e-16 |
| Self-heating | 4 A with dT_max 1000 K (out of range, 430 °C) | 405.3871 K | 405.3873 (Brent) | 5.0e-7 |
| Self-heating | runaway boundary: I = √(1/(θR20α)) = 5.1225193 A, so k = 1 (boundary) | no steady state | THERMAL_RUNAWAY critical, no numbers | n/a |
| Self-heating | 5.2 A, k > 1 (degenerate) | no steady state | runaway, no numbers | n/a |
| Self-heating | 5.1 A, k = 0.9912 (boundary) | root about 2.9e4 K, above dT_max | no root below 125 K; runaway-coded (F-2) | n/a |
| Self-heating | pulse 4 A pk, D 0.25, much-shorter | I_rms = 2 A, mean ΔT 46.66377 K | same, plus PULSE_PEAK_HIGHER warning | 1.5e-16 |
| Self-heating | pulse 2 A pk, comparable-or-longer | peak held: 46.66377 K | same | 0 |
| Self-heating | pulse D = 1 | equals steady 2 A | same | 0 |
| Self-heating | sensitivity ±1 % and ±10 % on I, θ, w, L | elasticity on I = 2 + 2k/(1 − k) = 2.3597 | central difference 2.360; ΔT rises with I, θ, L and falls with w | n/a |
| Voltage drop | **Anchor** 12 V, 10 Ω, 0.5 + 0.25 Ω, return not counted | I = 1.116279 A, drop 0.837209 V, P_max 48 W | "837.3 mV" (up), V_load "11.16 V" (down) | 0 |
| Voltage drop | return same as forward | R 1.5 Ω, I 1.043478, P_max 24 W | same | 0 |
| Voltage drop | return listed separately (0.3 Ω) | I 1.111111, P_max 45 W | same | 0 |
| Voltage drop | trace 100 × 0.254 × 35 µm at 25 °C, ×2, 2 A load | R 0.1977522 Ω each, drop 0.791009 V | same | 0 |
| Voltage drop | load voltage 4.5 V | I 2.5 A | same | 0 |
| Voltage drop | constant power 30 W | I = (Vs − √(Vs² − 4RP))/(2R) = 3.101021 A, V_load 9.674235 V | same | 0 |
| Voltage drop | constant power P = P_max = 48 W (boundary) | I 8 A, V_load 6 V, η 0.5 | same, NEAR_MAX_POWER | 0 |
| Voltage drop | 47.99 W (boundary) | I 7.884530 A | same | 0 |
| Voltage drop | 48.0001 W (out of range) | infeasible | OUT_OF_DOMAIN (F-4 wording) | n/a |
| Voltage drop | 24 V, 17.3 W, trace 213 × 0.8 mm at 60 °C plus 37 mΩ, same as forward (random) | R_path 0.3775512 Ω, I 0.7291981 A | same | < 1e-9 |
| Voltage drop | 5 % budget against a 6.98 % drop | warning | DROP_BUDGET_EXCEEDED | n/a |
| Path/load | trace 10 mil × 1 oz (35 µm), ΔT 10 K, outer | I_allowed = 0.048·10^0.44·13.7795^0.725 = 0.885495 A | same; margin "−615 mA" (down) | < 1e-12 |
| Path/load | inner, ΔT 20 K | 0.600633 A | same | < 1e-12 |
| Path/load | 4 vias, d 0.3 mm, t 25 µm, L 1.6 mm, 25 °C | 0.2754926 mΩ | same | < 1e-12 |
| Path/load | weakest link, utilisations 1.694 / 0.75 / 0.5 | trace | trace | exact |
| Path/load | net-class width 1.5 A at 10 K, M = 1.25 on current | min 20.69 mil, recommended 28.15 mil (0.71488 mm) | same | < 1e-12 |
| Path/load | clearance export at 2-layer / multilayer / 1-layer / 2 oz 2-layer, 1 oz | 0.10 / 0.09 / 0.10 / 0.16 mm per S-019l | same, tagged fab-profile UNVERIFIED | exact |
| Path/load | 1.5 oz, or no layer count (no fallback) | none | omitted | n/a |
| Via | **Anchor** d 0.3, t 25 µm, L 1.6 mm, 20 °C | A = πt(d + t) = 2.552544e-8 m², R 1.0807338 mΩ, θ 156.3156 K/W | same ("156.4 K/W", up) | 0 |
| Via | 25 °C, 1 A | 1.1019703 mΩ, 1.10197 mV, 1.10197 mW | same | 0 |
| Via | 8 × (0.2 mm, 18 µm, 1 mm), 85 °C, 5 A | 0.2194838 mΩ, θ 25.28639 K/W | same | 0 |
| Via | ρ 1.9e-8 override, k 391 | 1.2143712 mΩ, θ 160.3135 | same | 0 |
| Via | 200 °C (out of range) | formula | validity fail, low | 0 |
| Via | 3 × (0.45, 30 µm, 2.4 mm), 47 °C, 2.7 A (random) | 0.3372469 mΩ | same | 0 |
| Via | tolerances d ±10 %, t ±20 %, L ±5 % | corners 0.787577 / 1.620894 mΩ; S_d = −d/(d + t) = −0.923077, S_t = −(d + 2t)/(d + t) = −1.076923 | same (central difference, 5e-10) | < 1e-9 |
| Annular ring | **Anchor** pad 1.0, hole 0.6, PTH, 2-layer, 1 oz, profile tolerances | AR 0.200; worst case 0.2 − (0.13/2 + 0.075) = 0.060 | same; pad tolerance "not published", so WORST_CASE_INCOMPLETE | exact |
| Annular ring | multilayer 1 oz / 2 oz / NPTH / via pad-minus-hole | limits 0.15 and 0.20 / recommended 0.254 only / 0.45 / 0.10 and 0.15 | same; via ring and 2 oz minimum "not published" | exact |
| Annular ring | no scope given | no limit | MINIMUM_NOT_AVAILABLE (no fallback) | n/a |
| Annular ring | user tolerances 0.1 / 0.05 / 0.04 | worst case 0.2 − 0.12 = 0.08 | same | exact |
| Annular ring | drill 0.65, plating 25 µm | drill ring 0.175; drill − finished = 0.05 | same | exact |
| Annular ring | pad 0.7 / hole 0.6 (boundary) | worst case −0.09 | BREAKOUT_POSSIBLE critical | exact |
| Feedback | **Anchor** 0.8 V, 100k / 10k | 8.8 V | same | 0 |
| Feedback | solve R1: 0.6 V, R2 10k, 3.3 V; and E96 | 45.000 kΩ; 45.3 kΩ gives 3.318 V | same | 0 |
| Feedback | solve R2 (LM317-style values) | 80 Ω | same | 0 |
| Feedback | FB bias 100 nA into / out of the pin | 8.81 / 8.79 V | same | < 1e-15 |
| Feedback | 1 % R and 1 % Vref envelope | 8.555168 / 9.051232 V | same | < 1e-15 |
| Feedback | E24 pair search for 5 V | brute force: 43k/8.2k, 430k/82k (−0.0976 %), then 6.8k/1.3k ×3 | identical top 5 | exact |
| LED | **Anchor** 5 V, 2.1 V, 10 mA | 290 Ω; E24 up gives 300 Ω, 9.6667 mA | same | 0 |
| LED | 3 × 3.1 V, 12 V, 20 mA, E12, 0.125 W | ideal 135 → 150 Ω, 18 mA, 48.6 mW, utilisation 0.3888 | same | 0 |
| LED | noise: 3.3 − 2.1 = 1.1999999999999997 V at 4 mA, E24 up | 300 Ω, not 330 | 300 | exact |
| LED | 2 × 1.85 V, 9 V, 7.3 mA, E96 (random) | 726.03 → 732 Ω | same | 0 |
| RC/LC | fc = 1/(2πRC); C, R and LC inverses; √(L/C) | 159.1549 Hz; 159.1549 nF; 500.00045 Ω; 159.1549 kHz; 10 Ω; 25.33030 µH; 253.3030 nF | same | < 1e-15 |
| Reactance | X_L, X_C and the inverses | 62.83185 Ω; 1591.549 Ω; 15915.49 Hz; 31.83099 nF | same | < 1e-15 |
| Trace width | **Anchor** pulse 10 A pk, D 0.25, ΔT 20, 35 µm | I_rms 5 A, 71.49065 mil | same | < 1e-12 |
| Trace width | same at ΔT 10 | 108.8788 mil (150.0298 mil²) | same | < 1e-12 |
| Trace width | comparable-or-longer: peak 10 A held | 283.25 mil | same, no rms result | < 1e-12 |
| Trace width | pulse with 2 mm width | ΔT 17.05739 K | same | < 1e-12 |
| Trace width | tolerances I, ΔT, t ±10 % | W × [0.74210, 1.35092] = 0.380691 / 0.693140 mm; S = 1/0.725, −0.44/0.725, −1 | same | < 1e-9 |
| Trace width | profile width tolerance 20 % | drawn width W/0.8 = 0.641372 mm | same | 0 |
| Trace width | 0.2 A, multilayer 1 oz, profile minimum 0.09 mm | warning | BELOW_PROFILE_MIN_TRACE_WIDTH | n/a |
| Trace resistance | tolerances w ±20 %, t ±10 %, L ±1 % | ×0.75 / ×1.40278 = 0.148314 / 0.277402 Ω | same | < 1e-12 |
| Divider (changed) | 1 % R, 2 % Vin, separate 10 % load tolerance | 2.972980 / 3.226813 V; without a load tolerance 2.995158 / 3.206953 V | same | < 1e-15 |
| E-series (changed) | `nearestRatio` E3: 3.3, 3.2, 2.5, 6.0, 1.5 | geometric: 4.7, 2.2, 2.2, 4.7, 2.2 | same | exact |

**Guards** (about 60 cases, all rejected with field and message):
- **Self-heating:** I = 0, < 0, NaN, ∞; θ = 0, < 0; θ missing, or both θ forms; absolute ambient given as ΔK; θ in K·m/W passed as θ; current and pulse together; D = 0, D > 1; pulse without periodVsTau; missing law; legacy law with θ; −240 °C ambient (ρ ≤ 0); weight and thickness together; dT_max = 0 or absolute.
- **Voltage drop:** two load quantities; missing returnPath; Vs = 0; NaN R; empty list; I too high; V_load ≥ Vs; absolute T given as ΔK.
- **Path/load:** absolute temperature as the allowed rise; rated current 1e5 A; rating without a source; missing allowed rise.
- **Via:** N = 0 or 1.5; t = 0; d = ∞; T given as ΔK.
- **Annular ring:** pad ≤ hole; missing hole type; NPTH with plating; profile without `today`.
- **Feedback:** Vout ≤ Vref; R2 = 0; three inputs; bias direction without a current, or a current without a direction.
- **LED:** N·Vf ≥ Vs; If = 0; N = 1.5.
- **RC/LC and reactance:** three inputs; a foreign component; missing family; zero values.
- **Trace width:** pulse plus current; D = 0; three inputs.
- **Converter (F-2 fix):** thicknessBasis with a weight.

## Directional rounding and the 4-ulp guard

| Probe | Result | Correct |
|---|---|---|
| 64 µW prediction, exact / ±2 ulp | "64 µW" in every class | yes (inside the guard) |
| 64 µW + 8 ulp prediction / − 8 ulp max-capacity | 64.0001 / 63.9999 µW (exact class) … 65 / 63 µW (estimate class) | yes, conservative beyond 4 ulp |
| 0.3 mm + 3 ulp / + 5 ulp min-requirement | "0.3 mm" / "0.301 mm" | yes (the guard allows at most 4 ulp the unsafe way) |
| 0.3 mm ± 1e-12 relative | min-requirement 0.301 mm (11.82 mil); capacity 0.299 mm (11.81 mil) | yes |
| Negative margin −0.6145 A, max-capacity | −614.505 mA (toward −∞) | yes |
| Percent: drop 0.069767 prediction / efficiency 0.93023 capacity | 6.977 % / 93.02 % (analytical) | yes |
| Percent 0.99999 capacity; 0.999999 prediction | 99.99 %; 100.0 % | yes |
| Utilisation 0.99999999 / 1.0000001 / 1 + 3 ulp | 99.999999 % / 100.1 % / 100.0 % | yes (below 1 never prints 100 %) |
| Signed percent −0.0333333 | −3.334 % (magnitude rounded away from zero) | yes |
| Margin of −2.7e-20 m from noise in an exact ring (pad 0.9 / hole 0.5 against 0.20 mm) | "−0.001 mm (−0.01 mil)" while the status is MEETS_VALUE | cosmetic, see F-1 |
| 293.15 K + 2 ulp prediction | "20.1 °C" | safe direction; cosmetic over-print, see F-6 |

## Fab profile `jlcpcb-2026-10-13.json` against the ledger

I compared all 67 scoped entries and 5 flat limits field by field with the S-019i..m and S-019c quotes. Every value, kind and scope matches:
- **Holes:**
  - via minimum hole 0.15 mm (2-layer and multilayer, 1-layer not published), preferred 0.2 mm, via pad 0.25 mm;
  - PTH minimum hole 0.3 mm (1-layer) and 0.15 mm (2-layer and multilayer);
  - NPTH minimum 0.5 mm, maximum 6.3 mm.
- **Hole tolerances:** finished pad hole +0.13/−0.08 mm (PTH only); via and NPTH not published; press-fit ±0.05 mm; position ±0.075 mm; pad size tolerance not published.
- **PTH ring:** 2-layer 1 oz 0.25 recommended / 0.18 minimum; multilayer 1 oz 0.20 / 0.15; 2 oz 0.254 recommended only (T7-1).
- **Other rings:** NPTH 0.45 mm; via ring not published; via pad-minus-hole 0.10 / 0.15 mm.
- **Clearances:**
  - hole to track: via 0.2, PTH 0.28 / 0.35, NPTH 0.2 mm;
  - inner layers: via 0.2, PTH 0.3 mm;
  - hole to hole: via 0.2, PTH 0.45 mm;
  - pad to track 0.1 mm (1 oz only);
  - SMD pad to pad 0.15 mm;
  - copper to edge: routed 0.2, V-cut 0.4 mm.
- **Track and space:** 1- and 2-layer 0.10 mm, multilayer 0.09 mm (the mm value, not 3.5 mil); 2 oz 0.16 / 0.15 mm; 2.5 / 3.5 / 4.5 oz 0.20 / 0.25 / 0.30 mm.
- **Plating:** 18 µm average, minimum not published.
- **Other flat limits:** track tolerance 20 %, impedance tolerance 10 %, finished copper 1.6 / 0.6 / 1.2 mil.
- **Lookups:** they do not fall back across scopes. With no scope I got MINIMUM_NOT_AVAILABLE; for 1.5 oz no clearance was exported.

One interpretation to note: rows scoped `layerSide: unstated` are applied to inner layers too (for example, the clearance export for an inner trace on a multilayer board is 0.09 mm). That is defensible because the publisher gives no inner/outer split (S-019l, "NOT PUBLISHED: inner vs outer split").

## Ledger honesty (rows added since the interim report)

| Row | Status | My check | Honest? |
|---|---|---|---|
| S-019c JLCPCB finished copper | UNVERIFIED | Single publisher; the pairing of labels to values is unconfirmed and stated | yes |
| S-019d θ = ΔT/P | VERIFIED | I re-extracted onsemi AND8220/D Rev. 1 (2022) text: "By steady state, we mean operating conditions wherein power dissipation … has been constant for a long enough period of time that temperature changes are no longer occurring". It is a definitional relation with two manufacturers (onsemi, Burr-Brown), and the row says that θ itself is never taken from it. | yes |
| S-019e I_rms = I_pk·√D | VERIFIED | I re-extracted onsemi p. 11: "the average power will be d*Pp, the duty cycle times the peak power". I also derived it independently: I_rms² = (1/T)∫i²dt = D·I_pk². I could not text-extract the Erickson PDF (encoded fonts). | yes |
| S-019f pulse validity | UNVERIFIED | One source; no numeric threshold claimed | yes |
| S-019g coupled closed form and runaway | UNVERIFIED (DERIVED) | My own algebra: ΔT(1 − θI²R20α) = θI²R20(1 + α(Ta − 20)), so ΔT = θI²R(Ta)/(1 − k), with no finite root for k ≥ 1. It matches. | yes; it correctly stays UNVERIFIED |
| S-019h constant-power quadratic and P_max = Vs²/(4R) | VERIFIED | The algebra is re-derived (KVL: RI² − VsI + P = 0; discriminant ≥ 0 gives P ≤ Vs²/(4R); the low-current root gives V_load ≥ Vs/2). I could not text-extract the Tu et al. arXiv PDF. | yes |
| S-019i..m JLCPCB limits | UNVERIFIED | Single publisher, summarizing fetcher, R-21 browser re-read pending | yes |

Result data status follows from these rows:
- self-heating is UNVERIFIED (user θ) or PAYWALLED (legacy);
- via is CONFLICT (S-007);
- path-load is PAYWALLED (S-001);
- snapped circuit results are PAYWALLED (S-016);
- profile-backed annular results are UNVERIFIED;
- RC/LC with √(L/C) is UNVERIFIED (S-019b).

I saw no row promoted on the strength of tool agreement.

## Confidence

The rules are applied consistently:
- Any validity failure forces "low": divider Vref of 20 V, RC with R = 1e13, reactance at 1 THz, an LED at 20 A, a via at 200 °C, self-heating out of range.
- Empirical or estimate methods and paywalled data give "low".
- Defaulted inputs lower the score: for example the ring reference default, or the via temperature default.

Two known items remain:
- **T5-1:** a voltage-drop path made only of user resistances is rated "high 0".
- **Via status:** the via result is CONFLICT/low even when only R is wanted, because S-007 (k_Cu) is lumped into the whole result. This is conservative.

## Cross-check records (`tests/crosscheck/`)

There are four files: X-01 trace width, X-01 track resistance, X-01 via and X-03 twc IPC-2221, with 24 cases in total.
- **Tool outputs:** every `toolOutputs` value is `null`, so all 24 are "not yet obtained". `toolVersion` and `retrieved` read "TO BE FILLED BY HUMAN" and `obtainedBy` is "human". No number was invented or copied from the app.
- **Tolerance reasons:** each one is derivable, and I recomputed them:
  - (1/58e6)/1.72e-8 − 1 = 2.4058e-3, which gives 2.5e-3 and 2.6e-3 with display-rounding allowances;
  - 1.378 mil = 35.0012 µm, which is +3.43e-5 relative for twc;
  - 5e-7 mm / 0.05 mm = 1e-5;
  - 1e-4 for 5 displayed significant digits.

  The 0.05 mm and "about 5 mil" denominators are deliberately smaller than the smallest real width in the files (0.300 mm, 11.8 mil), so those tolerances are conservative, as stated.
- **Ledger:** nothing to classify, and no ledger row is affected.

## Source table (claim → URL → status)

| Claim | Source (retrieved 2026-10-15) | Status |
|---|---|---|
| Steady-state definition, θ relation (S-019d) | onsemi AND8220/D, https://onsemi.com/pub/Collateral/AND8220-D.PDF (text extracted from the PDF streams; steady-state quote matched) | Consistent with the ledger |
| Average power = D·P_pk (S-019e) | same PDF, p. 11 quote matched | Consistent with the ledger |
| I_rms = I_pk√D (S-019e) | Erickson App. 1, https://u.dianyuan.com/bbs/u/39/1141871556.pdf: downloaded, text not extractable (metadata author "Erickson", 1998-01-05) | Not re-read by me; derivation checked |
| CPL quadratic and P_max (S-019h) | Tu, Yu, Lukic, arXiv:2211.04242: downloaded, text not extractable | Not re-read by me; algebra checked |
| IACS ρ, α (S-004), exact conversions (S-006) | as in the interim report | VERIFIED; unchanged |
| JLCPCB limits (S-019c, S-019i..m) | profile JSON compared with the ledger quotes; the live page was not re-read | UNVERIFIED; correct |

## Known-pitfalls checklist

| Pitfall | Result |
|---|---|
| Via barrel area π·t·(d + t) with the FINISHED diameter | Correct. Area 2.552544e-8 m² for d 0.3 mm and t 25 µm; the drill is never used for R. |
| IPC-2221 area in mil², width = A/t in mil | Correct (path-load limit and net-class width) |
| Resistance uses ρ(T) | Correct in self-heating, voltage drop, via and path-load |
| RMS pulse current = I_pk·√D | Correct. The mean-heating result is labelled as such, the peak is warned, and the comparable-or-longer case holds the peak continuously. |
| ΔT kept separate from absolute T | Correct. Every crossing (ambient, allowed rise, dT_max, conductor temperature) is a DIMENSION error. |
| Claim audit (compliant, production safe, fab-ready, guarantee, certified) | Only `gate.ts:77` and negations ("a minimum, not a guarantee"). The net-class clearance says "manufacturing minimum only: voltage-based spacing and creepage are not evaluated here". |

## Defects (conditions)

| # | Severity | Finding | Reproduction | Expected vs actual | Fix owner |
|---|---|---|---|---|---|
| F-1 | MINOR | The 4-ulp guard is relative to the printed number, so it cannot catch absolute float noise in a margin that is a difference of nearly equal lengths. An exactly-met ring then prints a negative margin. | `annular-ring` with pad 0.9 mm, hole 0.5 mm, PTH, multilayer, 1 oz, JLCPCB profile. Pad/hole 0.65/0.25 and 1.3/0.9 also show it. | Expected: margin "0 mm (0 mil)", consistent with MEETS_VALUE. Actual: margin −2.7e-20 m printed "−0.001 mm (−0.01 mil)" next to "meets". The comparison itself is noise-tolerant (correct); only the display is wrong. | calc-implementer: snap margins with \|m\| ≤ a few ulp of max(\|a\|, \|b\|) to 0 before formatting. This applies to all difference-type margins (ring, pad-minus-hole). |
| F-2 | MINOR | Self-heating codes every "no root below dT_max" case as `THERMAL_RUNAWAY` (critical). Its validity check is also named "…(runaway)" when the loop gain k < 1, i.e. when a steady state exists above the search limit. The message text is correct, but the code, severity and check name overstate. | User θ 50 K/W, 2 A, deltaTMax 46.6 ΔK (k = 0.152). Also 4 A with the default dT_max (150 °C − ambient). | Expected: a distinct code (for example ABOVE_SEARCH_LIMIT, warning) for k < 1, with THERMAL_RUNAWAY reserved for k ≥ 1. Actual: THERMAL_RUNAWAY critical. It is safe (no numbers are emitted). | calc-implementer |
| F-3 | MINOR | The `PULSE_PERIOD_NOT_SHORT` text says "The value shown is the steady rise at the peak current held continuously" even when that solve found no root and no value is shown. | Self-heating, peak 4 A, D 0.25, comparable-or-longer, θ 50 K/W | Expected: the text depends on whether a value exists. Actual: it claims a value that is not shown. | calc-implementer |
| F-4 | MINOR | The constant-power rejection prints P and P_max at display precision, so the message is self-contradictory. | voltage-drop, 12 V, 0.75 Ω, loadPower 48.0001 W | Expected: "48.0001 W exceeds 48 W" or the excess shown. Actual: "load power 48 W exceeds the maximum … 48 W". | calc-implementer |
| F-5 | MINOR (disclosed) | The via resistivity override keeps α = 0.00393 K⁻¹. The ledger S-012(c) NBS rule gives α ≈ 0.00357 at 1.9 µΩ·cm. The effect is conservative above 20 °C. Below 20 °C R is understated, by 3.7 % at −55 °C with ρ 1.9e-8. The message discloses it ("the temperature coefficient stays the S-004 value…"), and trace resistance offers an α override that the via calculator lacks. | via, ρ 1.9e-8, T = −55 °C | Expected: an α override, as in trace resistance, or α derived by the S-012 rule and labelled. Actual: IACS α with a caution. | calc-implementer |
| F-6 | MINOR (cosmetic) | K→°C conversion amplifies about 2 ulp of noise in K to about 22 ulp in °C, beyond the guard, so a conductor temperature equal to 20 °C can print "20.1 °C" (prediction). This is the safe direction. | `formatResult({value: 293.15 K + 2 ulp, bound: 'prediction'})` | Expected "20 °C". Actual "20.1 °C". | units-engineer: apply the guard in K, or add an absolute tolerance after the offset subtraction |
| F-7 | MINOR (domain, note) | With an FB bias current, solving R1 ignores the bias and reports the shifted Vout. For a 5 V target, 1 µA into the pin and R2 10k, R1 = 52.5k gives 5.0525 V (+1.05 %). This is transparent, but a designer may expect R1 = (Vout − Vref)/(Vref/R2 + Ib) = 51.85k. | feedback-divider, vref 0.8 V, R2 10k, vout 5 V, fbBiasCurrent 1 µA into the pin | Expected: either a compensated solve or wording that makes clear the solve ignores the bias. Actual: an uncompensated solve, with the shift reported. | pcb-domain-reviewer to decide; then calc-implementer |

**Carried, still open** (not re-raised):
- Interim F-4: the E-series "nearest" metric. A geometric `nearestRatio` now exists and is correct; the UI statement is still OPEN in OPEN_RISKS.
- T5-1: "high" confidence for paths made only of user resistances.
- T7-1: the 2 oz ring minimum is not published, and the position tolerance is taken as radial (conservative).
- R-21: the JLCPCB values need a browser re-read.

**Notes, no defect:**
- `fromUnit(0.09, 'mm')` gives 8.999999999999999e-5 m, 1 ulp low, because prefixed units take the multiplicative path. All headline and export printing goes through the guard, so it prints 0.09 mm.
- Self-heating stores "coupling effect (percent)" as a percent number (20.3), not a fraction. It is labelled "(percent)" in the UI, so the display is consistent, but the convention differs from voltage drop, which stores fractions.

## What I could NOT verify

- **Primary texts I could not read:** Erickson App. 1 and Tu et al. (arXiv:2211.04242). Both PDFs downloaded but are not text-extractable with stdlib tools, so I checked the algebra instead. Burr-Brown AB-038, Liu et al., Stolp and Tatum were not re-read.
- **Paywalled standards:** IPC-2221B/C (S-001, S-010), IPC-6012 (S-009, S-015) and IEC 60063 (S-016). Results that depend on them correctly carry PAYWALLED.
- **Live JLCPCB pages:** I checked the profile only against the ledger quotes, not against the pages themselves. That is the same reading (T7-2), so it is not independent.
- **Plated-copper ρ, α and k:** S-007 and S-012 have no primary measurement.
- **Cross-check tools:** I have no KiCad or twc outputs. All records are null, and running the tools needs human approval.
- **Rendered UI:** I did not check the served page (`localhost:4173`). Headline strings were checked through the core formatters the view models call (`formatResult`, `formatPercent`, `formatUtilisation`), not in a browser.
