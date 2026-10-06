# Phase 0 calculations validation report

Validator: calc-validator (independent, read-only on `src/` and `tests/`)
Date: 2026-10-06
Branch: phase-0 (git not run, per instructions)

## Verdict: FAIL

Two MAJOR defects block the phase:

- **M-1 (numeric).** The root finder's default tolerance acts as an absolute 1e-12 floor in SI units. For roots smaller than about 1e-10 (pF, nH, ps) the solver returns `ok: true` with a wrong root.
- **M-2 (claim/safety).** The compliance gate trusts a caller-supplied boolean. It emits "<standard> compliant" for PAYWALLED or unknown ledger ids and for an empty mandatory-input set.

Both fixes are small. Everything else in scope reproduces exactly against my independent recomputation: exact conversions, °F/°C/K, ΔT handling, oz/ft², foil conventions, AWG, confidence arithmetic, and the cross-check runner logic. The ledger statuses I checked are justified. The remaining findings are MINOR. Several are conditions that must be met before Phase 1 consumes these modules.

## Method (independence protocol)

1. I read CLAUDE.md, `docs/SPEC.md`, `docs/phases/phase-0.md`, `docs/sources/LEDGER.md`, all of `docs/sources/notes/*.md`, `docs/sources/crosscheck-tools.md`, `tests/crosscheck/README.md`, `tools/reference/ref_calcs.py` and `docs/golden-vectors.json`, before reading any of `src/`.
2. I recomputed every exact conversion with Python `fractions.Fraction` (rational, no float rounding), and the AWG and foil values with `math`. Script: session scratchpad `v0.py`, not committed. Nothing was imported from `src/`.
3. `python3 tools/reference/ref_calcs.py` gave 17/17 OK, exit 0.
4. Only then did I read `src/`. I probed the implementation numerically with throw-away vitest files in the session scratchpad (`--root <scratch>`). I wrote nothing to `src/` or `tests/`. No third-party code was installed or run beyond the repo's own installed devDependencies.
5. Web research (2026-10-06) re-fetched NIST SP 811 App. B.8, NBS Handbook 100 (archive.org OCR), the 1959 NBS yard/pound notice (USMA reproduction), Brooks & Adam PCD&F 2015, Altium/Peterson 2022, Siemens/Hargin 2025, and CircuitCalculator.com.

## 1. Numeric results: oracle vs app

Relative error = |app − oracle| / |oracle|. The oracle is exact rational arithmetic (Fraction) or the closed-form formula in Python float. The tolerance for exact math is 0.1 % (all results below are at 1e-13 or better).

### 1a. Exact conversions (S-006)

| Case | Class | Oracle | App | Rel. err |
|---|---|---|---|---|
| 1 in → m | golden | 0.0254 (exact 127/5000) | 0.0254 | 0 |
| 1 mil → m | golden | 2.54e-5 (exact 127/5000000) | 2.5399999999999997e-5 | 1.3e-16 |
| 1 ft → m | golden | 0.3048 | 0.3048 | 0 |
| 1 oz (avdp) → kg | golden | 0.028349523125 (45359237/1.6e9) | 0.028349523125 | 0 |
| 1 oz/ft² → kg/m² | golden | 45359237/148644864 = 0.30515172727394063 | 0.30515172727394063 | 0 |
| 305 g/m² → oz/ft² | golden | 0.99950278 | 0.9995027808779059 | <1e-15 |
| 1000 random mil values (seed 20261006) | random | m·2.54e-5 | max rel err | 2.5e-16 |
| 1e400 mm (parse) | degenerate | reject | InvalidValueError | n/a (correct) |
| "NaN mm" (parse) | degenerate | reject | InvalidValueError | n/a (correct) |
| "1 mils" | out-of-vocabulary | reject | UnitError | n/a (correct) |

### 1b. Absolute temperature, ΔT (S-006)

| Case | Class | Oracle (K) | App (K) | Rel. err |
|---|---|---|---|---|
| 32 °F | golden | 273.15 | 273.15 | 0 |
| 212 °F | golden | 373.15 | 373.15 | 0 |
| 98.6 °F | golden | 310.15 | 310.15 | 0 |
| −40 °F = −40 °C | boundary | 233.15 | 233.14999999999998 | 1.2e-16 |
| −459.67 °F (absolute zero) | boundary | 0 | −5.7e-14 | abs 5.7e-14 (float) |
| 0 K → °F | boundary | −459.67 | −459.66999999999996 | 9e-17 |
| 18 Δ°F → Δ°C | golden ΔT | 10 | 10 | 0 |
| 212 °F − 32 °F | ΔT algebra | 100 ΔK (kind deltaT) | 100, deltaT | 0 |
| 25 °C + 10 Δ°C | ΔT algebra | 308.15 K absTemp | 308.15 absTemp | 0 |
| ΔT − T, T + T, T × 2, compare(T, ΔT), T → Δ°C | degenerate | must throw | DimensionError (all 5) | correct |
| 10 °C parsed with expected ΔT | degenerate | reject | DimensionError | correct |
| −300 °C / −500 °F | out-of-range | must reject (below 0 K) | **accepted: −26.85 K / −22.41 K** | see m-1 |
| 2000 random °F in [−400, 1600] (seed 20261006) | random | (F+459.67)/1.8 | max rel err 1.4e-15; round trip 2.9e-14 | pass |
| deltaT × PER_KELVIN; K/W × W | dimensional | dimensionless; deltaT | dimensionless; deltaT | correct |

The ΔT vs T distinction is correct and enforced. The only gap is that non-physical absolute temperatures below 0 K are accepted (m-1).

### 1c. Foil weight → thickness (S-003, S-003d)

| Case | Class | Oracle (µm) | App (µm) | Rel. err |
|---|---|---|---|---|
| 1 oz/ft², nominal-35um | golden | 35.000 | 35.000 | 0 |
| 1 oz/ft², nominal-1.35mil | golden | 34.290 | 34.290 | 0 |
| 1 oz/ft², mass-density 8890 | golden | 34.325278658 | 34.32527865848601 | 0 |
| 0.5 / 2 oz/ft², all three | boundary (S-010 range ends) | linear | linear | ≤1e-15 |
| user constant 34.8 µm | user override | 34.8, status UNVERIFIED | 34.8, UNVERIFIED | 0 |
| 0 and −1 oz/ft² | degenerate | reject | InvalidValueError | correct |
| length passed as weight; arealMass × length; unknown convention | degenerate | reject | DimensionError / InvalidValueError | correct |
| 2000 random oz in [0.25, 5.25] (seed 20261006), mass-density | random | oz·0.30515173/8890 | max rel err 3.3e-16 | pass |

Spread between conventions: 35 µm vs 34.29 µm is 2.07 %. My recomputation of the other densities: 8960 kg/m³ gives 34.057 µm (1.3408 mil), 8935 kg/m³ gives 34.152 µm. These match the ledger.

### 1d. AWG (S-005)

| Gauge | Class | Oracle d (mm) | App d (mm) | Rel. err | Oracle area (mm²) | App area |
|---|---|---|---|---|---|---|
| 36 | golden (definition) | 0.127 | 0.127 | 0 | 0.0126676870 | match |
| 0000 (−3) | golden (definition) | 11.684 | 11.684 | ≤1e-16 | 107.219303 | match |
| 10 | golden | 2.58818673 | 2.5881867280128637 | 4e-17 | 5.26115495 | match |
| 20 | golden | 0.81182097 | 0.8118209703737737 | 0 | 0.51761924 | match |
| 00, 000, 0, 12, 24, 30 | golden | (see scratch) | identical to 16 digits | ≤1e-16 | | match |
| 40 | boundary (app max) | 0.0798710851 | 0.0798710851323451 | 0 | | match |
| 41, 44, 56, −4, 1.5, NaN | out-of-range / degenerate | reject | InvalidValueError | correct | | |

HB100 rounding cross-check (0.1 mil): AWG 10 = 101.9 mil, AWG 20 = 31.96 → 32.0 mil, AWG 24 = 20.1 mil. The app returns unrounded formula diameters, which is correct for the formula. The label must say so (m-6).

### 1e. Root finders (`src/core/solvers/rootfind.ts`)

| Case | Oracle root | bisect (iters) | brent (iters) | Notes |
|---|---|---|---|---|
| x³−2x−5 on [2,3] | 2.0945514815423265 | 2.09455148154120 (39), err 5e-13 | 2.094551481542327 (6), 2e-16 | pass |
| cos x − x on [0,1] | 0.7390851332151607 | err 5e-13 (40) | err 5e-15 (6) | pass |
| x²−2 on [0,2] | √2 | err 1.6e-12 (40) | err 4e-16 (7) | pass |
| eˣ − 1e6 on [0,30] | 13.815510557964274 | err 7e-13 (41) | err 4e-14 (12) | pass |
| x − 123456789.123 on [0,1e9] | 123456789.123 | rel 2e-14 (43) | exact (1) | pass |
| step at 0.3 | 0.3 | err 2e-13 (40) | err 2e-13 (40) | pass |
| (x−1)³ on [0,3] | 1 | (41) | (96) | Brent is 2.3× slower than bisection |
| sign·|x−1|⁷ on [−1,5] | 1 | ok (42) | **MAX_ITER at 100** | m-3 |
| x − 1e-13 on [0,1e-12] | 1e-13 | **5e-13, ok:true (1)**, rel err 400 % | **0, ok:true (0)**, rel err 100 % | M-1 |
| 1/(2π·1 GHz·C) − 50 Ω on [1e-14,1e-10] F | 3.1831e-12 F | **3.916e-12, ok:true**, err +23 %, residual −9.36 Ω | **3.119e-12, ok:true**, err −2 %, residual +1.03 Ω | M-1 |
| 2π·1 MHz·L − 0.01 on [0,1e-6] H | 1.59155e-9 H | 1.59168e-9, err 8e-5 | exact | bisect only 4 digits |
| x²+1 (no bracket); NaN at endpoint; lo>hi; xtol<0; maxIter 2 | failure values | NO_BRACKET / NON_FINITE / INVALID_ARGS / MAX_ITER | same | correct, values not throws |
| 2000 random roots r ∈ [1e-3, 1e3], g = ln(x/r) (seed 20261006) | r | worst rel err 5.5e-10 | worst 1.9e-15 | pass |

### 1f. Confidence (`src/core/confidence.ts`)

I recomputed the documented rule for all 108 combinations: 4 accuracy classes × 3 data statuses × out-of-range {0, 1, 2} × defaulted {0, 1, 3}. The rule is score = 2·OOR + min(defaults, 2) + class weight + data weight, with 0 = high, 1–2 = medium, ≥3 = low. The app's `confidenceScore`/`rateConfidence` matched in all 108. The arithmetic is correct. The design concern (no CONFLICT category) is m-2.

### 1g. Sensitivity

Every Phase 0 conversion is linear or affine. Perturbing inputs by ±1 % and ±10 % changed the outputs by exactly ±1 % / ±10 % for the linear cases (oz/ft² → kg/m², foil thickness for all three conventions, mil/in → m), as linearity predicts.

- °F → K is affine. A ±1 % change in t/°F gives ΔT = 0.01·|t|·5/9 K, which the app reproduces.
- AWG diameter is strictly decreasing in n. Each step changes d by a factor of 92^(1/39) = 1.1229322, and d(n+39) = d(n)/92. Confirmed numerically.
- No sensitivity readout exists yet in Phase 0, so there is nothing to compare against.

### 1h. Golden vectors and oracle provenance

- `docs/golden-vectors.json` `oracle_value` agrees with a fresh `ref_calcs.py` run bit-for-bit for 15 of 17 vectors. Two differ by 1 ulp: `awg_0000_diameter_mm` (JSON 11.684, oracle 11.684000000000001) and `awg_20_area_mm2` (JSON …384, oracle …383). Both JSON digits coincide with the TypeScript result scaled to mm. They are also the exact or neighbouring float values, so this does **not** establish copying from the implementation. It does show that the JSON is hand-assembled rather than generated (m-7).
- The S-004 constant update is applied consistently. ρ20 = 1.7241e-8 and α = 0.00393 give trace_R(0.1 m, 0.3 mm, 35 µm, 20 °C) = 0.164200 Ω and at 30 °C 0.17065306 Ω. Via R = 1.08071 mΩ. Skin depth at 10 MHz = 20.8978 µm. Each matches my independent evaluation.
- Out-of-scope physics vectors (via θ uses k = 385 W/m·K, which has no ledger row) are Phase 1 items, noted in m-8.

### 1i. Cross-check runner

`tests/crosscheck/` contains no records (only `_template.json`, which is skipped). Result: **0 records. Nothing to classify and no outputs "not yet obtained".** No BLOCKER for fabricated numbers is possible. I reviewed the runner logic (`tests/crosscheck/runner.ts`). It does the following correctly:

- rejects placeholders
- requires a real date, `obtainedBy`, and a non-empty `why` for every tolerance
- treats null as pending
- fails, rather than skips, a case that has real tool data but no adapter
- ignores inherited keys

It compares app vs tool only, not oracle vs tool. Classification is left to this validator, which is consistent with the policy.

## 2. Source table (claims → URL → status judgement)

| Claim (ledger row) | Source re-checked 2026-10-06 | What I confirmed | Ledger status | My judgement |
|---|---|---|---|---|
| S-006: in, mil, ft, ft² exact; °F/°C formulas | NIST SP 811 App. B.8 https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8 | "Factors in boldface are exact". Inch **2.54 E-02**, mil **2.54 E-05**, ft **3.048 E-01**, ft² **9.290 304 E-02**, "T/K = (t/°F + **459.67**)/**1.8**", "T/K = t/°C + **273.15**". oz 2.834 952 E-02 and oz/ft² 3.051 517 E-01 are not bold (rounded). lb 4.535 924 E-01 is not bold. | VERIFIED | Justified. The exact lb comes from the 1959 notice below. All the S-006 sources are one agency lineage (NIST/NBS), which is acceptable for definitional SI values. |
| S-006: lb = 0.453 592 37 kg, yd = 0.9144 m | USMA reproduction of NBS notice, 1 July 1959 https://usma.org/?p=237 | Quotes confirmed verbatim. | VERIFIED | Justified. |
| S-004: ρ20 1.7241 µΩ·cm, 0.15328 Ω·g/m², α20 0.00393, density 8.89 | NBS Handbook 100 (1966) https://archive.org/stream/copperwiretables100unit/copperwiretables100unit_djvu.txt | "0.017241 ohm-mm2/meter at 20 °C", "1.7241 microhm-cm", "0.15328 ohm-gram/meter2", "8.89 g/cm3", "a20=0.00393". Self-consistency: 0.15328/8.89e6 = 1.72418e-8 Ω·m. | VERIFIED | Justified (NBS plus independent Techniques de l'Ingénieur and Kanthal). Ledger wording "ρ20 = 1.7241e-8 (= 1/58 Ω·mm²/m)" is approximate: 1/58 = 1.724138e-8, a difference of 2.2e-5 relative (m-9). |
| S-003d: IACS density 8.89 g/cm³ | HB100 (above) | "The international standard density for copper, at 20 °C, is 8.89 g/cm3" | VERIFIED | Justified. |
| S-005: AWG 0000 = 0.4600 in, 36 = 0.0050 in, ratio 1.122932 | HB100 (above); Wikipedia AWG (tier 5, orientation only, cites ASTM B258) | Definition and ratio quoted. Rounding: 0.1 mil for 0000–44, 0.01 mil for 45–56. | VERIFIED | Acceptable because the formula is definitional and the sources are tier 1. Independence is limited (both NBS), as the ledger itself states. A non-NBS tier 1–3 second source (e.g. an EE handbook) would strengthen it (m-6). |
| S-002: IPC-2152 is charts, no printed closed form | Altium, Z. Peterson, updated 2022-12-04 https://resources.altium.com/p/using-ipc-2152-calculator-designing-standards ; Brooks & Adam PCD&F 2015-05-29 https://pcdandf.com/pcdesign/index.php/editorial/menu-features/10122-thermal-management-1506 | Altium: "there is no explicit formula that can be used to calculate the expected temperature rise in a PCB trace". Brooks & Adam digitized IPC-2152 curves with "a digitizing program" (GetData) and wrote "We believe an equation like Eq. 5 is much easier to deal with than are a large set of curves." | PAYWALLED-USER-MUST-VERIFY | Stated accurately. The ledger correctly separates "the standard prints charts" (paywalled, unread) from "no closed form exists anywhere" (wrong, because fits exist). |
| S-011a: ΔT = 215.3·I²·W^−1.15·Th^−1.0 (mil) | Brooks & Adam PCD&F 2015 (above) | Eq. 5 confirmed. Units: A, mil, mil. "1.0 oz. = 1.35 mils". Also "0.5 oz. = 0.65 mils", which is **not** 0.675 (not in ledger, m-10). | UNVERIFIED | Correct (single primary source). |
| S-003 (c): 1.35 mil (34.3 µm) reported as IPC-4562A; ~30 µm post-fab | B. Hargin, Siemens, 2025-08-13 https://blogs.sw.siemens.com/electronic-systems-design/2025/08/13/copper-thickness/ | Table 1: "1.35 mils (34.3 μm)" per IPC-4562A. Post-fab "1.2 mils (30 μm)". | CONFLICT | Correct. IPC-4562A not read. |
| S-003 (a), S-001, S-010: 1.378 mil/oz, k 0.048/0.024, b 0.44, c 0.725, limits | CircuitCalculator 2006 https://circuitcalculator.com/wordpress/2006/01/31/pcb-trace-width-calculator/ | "Thickness[oz]*1.378[mils/oz]". k, b, c as ledger. "constants resulting from curve fitting to the IPC-2221 curves". Limits: 35 A, 0.4 in, 10–100 °C, 0.5–3 oz. Nothing ties 1.378 to IPC. | CONFLICT / PAYWALLED | Correct. The removal of "1.378 mil (IPC convention)" is justified. |
| S-050, S-051 (tool behaviour, licenses) | not re-fetched | n/a | VERIFIED | Acceptable in scope (the repo is the primary source for what the tool does). S-050 has no pinned commit, so the claim cannot be reproduced (m-11). |

## 3. Defects

Severity: BLOCKER / MAJOR / MINOR. Owner = suggested fixing agent.

### M-1 MAJOR (numeric): root finder silently returns wrong roots for small-magnitude SI variables

- **Where:** `src/core/solvers/rootfind.ts:120` (bisect `tol = max(xtol·(1+|mid|), 4·EPS·|mid|)`), `src/core/solvers/rootfind.ts:165` (brent `tol1 = 0.5·xtol·(1+|b|) + 2·EPS·|b|`). The default xtol is 1e-12 (`:41`).
- **Reproduction:**
  - `bisect(x => x - 1e-13, 0, 1e-12)` returns `{ok:true, x:5e-13}` (true root 1e-13, +400 %).
  - `brent(x => x - 1e-13, 0, 1e-12)` returns `{ok:true, x:0, iterations:0}` (−100 %).
  - `bisect(C => 1/(2π·1e9·C) − 50, 1e-14, 1e-10)` returns `{ok:true, x:3.916e-12}`. The true value is 3.1831e-12 (+23 %) and the residual is −9.36 Ω on a 50 Ω target.
  - `brent` on the same problem: 3.119e-12 (−2 %), residual 1.03 Ω.
  - Passing `{xtol: 1e-9}` makes it worse, because the term is absolute for |x| ≪ 1.
- **Expected:** convergence to relative accuracy around xtol for any root magnitude, or `ok:false`. The docstring promises "Relative+absolute", but for SI quantities below about 1e-10 (pF, nH, ps, fF) the absolute part dominates and `ok:true` is reported after 0–7 iterations.
- **Why it matters:** CLAUDE.md priority 1 and rule 10 (never emit a numeric result from an invalid state). All existing solver tests use O(1) roots (`rootfind.test.ts:27` STRICT), so the defect is untested.
- **Fix:** make the absolute floor scale-aware. For example, use a relative test `xtol·|x|` plus an absolute floor tied to the bracket (e.g. `xtol·max(|lo|,|hi|)` or a caller-supplied `xatol` with no unit-blind default). Alternatively, require callers to pass nondimensionalized variables and document that in the API. Add tests with roots at 1e-15, 1e-12, 1e-9 and 1e6.
- **Owner:** calc-implementer (solvers); test-engineer for the scale tests.

### M-2 MAJOR (claim audit / safety): the compliance gate trusts a caller-supplied boolean and accepts an empty mandatory-input set and unknown or unverified ledger ids

- **Where:** `src/core/gate.ts:26-45`. Behaviour is locked in by `src/core/gate.test.ts:43` ("empty mandatoryInputs is vacuously satisfied") and by tests passing `'T-004'` and `'S-001'` as "verified" ids.
- **Reproduction:**
  - `complianceGate({standard:'IEC 60664-1', mandatoryInputs:{}, dataVerified:true, dataLedgerIds:['S-999']})` returns `{allowed:true, label:'IEC 60664-1 compliant (per verified data: S-999)'}`.
  - With `dataLedgerIds:['S-001']`, a row that is PAYWALLED-USER-MUST-VERIFY in `src/core/data/ledger.ts`, it returns `'IPC-2221 compliant (per verified data: S-001)'`.
- **Expected:** CLAUDE.md rule 2 says the gate "requires all mandatory inputs and `verified: true` data". The gate is the only barrier, so it must not take "verified" on trust. It should:
  - (a) resolve every id in `dataLedgerIds` against the ledger mirror and require each to be `VERIFIED`, or a human-signed `verifiedBy` table for the IEC/IPC tables
  - (b) reject unknown ids
  - (c) reject an empty `mandatoryInputs`
  - (d) ideally take the required input list from a per-standard definition rather than from the caller
- **Current exposure:** none (no calculator calls the gate yet). It must be fixed before any Phase 1 or Phase 3 caller exists.
- **Owner:** calc-implementer (gate.ts), test-engineer (invert gate.test.ts:43 and add unknown/unverified-id denial tests).

### m-1 MINOR: absolute temperatures below 0 K are accepted

- **Where:** `src/core/units/quantity.ts:25` (`q`), `src/core/units/units-table.ts:131` (`applyUnit`), `parse.ts` (no check).
- **Reproduction:** `fromUnit(-300,'°C').si` = −26.85 K. `parseQuantity('-300 °C')` gives `ok:true`. `neg()` on an absTemp also produces a negative K.
- **Expected:** reject absTemp < 0 K, allowing a float tolerance of about −1e-9 K because `fromUnit(-459.67,'°F')` returns −5.7e-14.
- **Why:** a Phase 1 ρ(T) = ρ20·(1+α(T−20 °C)) with T = −300 °C gives a negative resistance. The comment "sign rules belong to calculators" is fine for plain quantities, but no absolute temperature below 0 K is valid anywhere.
- **Condition:** fix before Phase 1 consumes ambient temperature.
- **Owner:** units-engine-engineer.

### m-2 MINOR: confidence `DataStatus` cannot represent CONFLICT

- **Where:** `src/core/confidence.ts:2` (`'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED'`) vs LedgerStatus, which includes `CONFLICT` and `PAYWALLED-USER-MUST-VERIFY`.
- **Problem:** foil thickness (S-003) is CONFLICT and every Phase 1 trace calculation depends on it. There is no defined mapping, so an implementer must pick one ad hoc.
- **Fix:** add CONFLICT (weight ≥ UNVERIFIED), or define and test a single mapping function from LedgerStatus to DataStatus.
- **Condition:** before Phase 1.
- **Owner:** calc-implementer.

### m-3 MINOR: Brent safeguard comment is falsified; Brent fails where bisection succeeds

- **Where:** `src/core/solvers/rootfind.ts:144-147` claims the worst case is bounded to about 2·log2(width/tol), which here is about 85 iterations.
- **Reproduction:** `brent(x => Math.sign(x-1)*Math.abs(x-1)**7, -1, 5)` returns MAX_ITER at 100. Bisection converges in 42. `(x-1)^3` takes 96 Brent iterations vs 41 for bisection.
- **Assessment:** this fails safely (returns a failure value).
- **Fix:** correct the comment, or strengthen the safeguard (e.g. Brent–Dekker's standard "if |e| < tol or |fa| ≤ |fb| bisect" plus a forced bisection whenever the bracket has not halved in 2 consecutive steps, measured against the bracket at the last forced step). Phase 1 self-heating has a ≤ 50-iteration budget (SPEC), so Brent should not be worse than bisection.
- **Owner:** calc-implementer.

### m-4 MINOR: compliance-phrase grep has gaps

- **Where:** `tools/audit-lib.mjs:11-12`. The pattern requires `IPC|IEC` *before* "compliant".
- **Not detected:** "compliant with IPC-2221", "complies with IEC 60664-1", "conforms to IPC-2221", "meets IPC-6012 Class 3", "fab-ready", "certified", and template-built strings such as `` `${std} compliant` `` in any file other than gate.ts.
- **Current state:** I found no such text in `src/`. The UI disclaimers (App.tsx:57, About.tsx:10, Home.tsx:8) are correct negatives. **No compliance phrase is currently emitted outside gate.ts.**
- **Fix:** widen the pattern (e.g. `\bcompl(?:iant|ies|iance with)\b|\bconform(?:s|ant)\b|\bfab[- ]ready\b|\bcertif` restricted outside an allow-list) and add a test for template literals containing `compliant`.
- **Owner:** test-engineer / devops-engineer.

### m-5 MINOR: foil convention label "Common fabricator nominal" is not ledger-backed

- **Where:** `src/core/units/foil.ts:25`.
- **Problem:** the S-003 sources for 35 µm are CircuitCalculator and twc (calculators). The one fabricator cited (JLCPCB) says 34.8 µm.
- **IPC endorsement:** the 35 µm label does not mention IPC, and a test enforces this (golden.test.ts:129). The 1.35 mil label names IPC-4562A but says "Reported … (unverified, secondhand)". I judge that it does **not** imply IPC endorsement. The mass-density label is accurate.
- **Fix:** relabel as "Common calculator/fabricator convention" or cite a fabricator source in S-003.
- **Owner:** standards-researcher (source) or units-engine-engineer (label).

### m-6 MINOR: AWG metadata cites an unread paywalled standard and has a stale status comment

- **Where:** `src/core/units/awg.ts:6` comment "(ledger S-005, ASTM B258, UNVERIFIED)" (S-005 is now VERIFIED); `awg.ts:11` `source: 'ASTM B258 (as recorded in … S-005)'`.
- **Problem:** the ledger's source is NBS Circular 31 / Handbook 100, and ASTM B258-18 is explicitly "not read". This metadata is meant to be rendered in the UI, so it would display an unread standard as the source of a VERIFIED value.
- **Further gaps:**
  - The output is the unrounded formula diameter. It is not labelled as such, while HB100/B258 nominal values are rounded to 0.1 mil.
  - The range stops at 40, while HB100 defines gauges to 56. That restriction is acceptable but should be stated.
- **Fix:** set `source` to "NBS Handbook 100 (1966) / Circular 31 (1914); ASTM B258 not read", add "formula value, not B258-rounded nominal", and update the comment.
- **Owner:** units-engine-engineer.

### m-7 MINOR: golden-vectors.json is hand-assembled, not generated by the oracle

- **Where:** `docs/golden-vectors.json` (two 1-ulp differences vs the oracle, §1h). The `"status": "UNVERIFIED"` fields on the S-005/S-006 vectors (e.g. lines 90, 98, and all units/AWG entries) are stale relative to the ledger.
- **Assessment:** no evidence that values came from the TypeScript implementation (the differences are 1 ulp and consistent with exact definitional values). Provenance should still be mechanical.
- **Fix:** add `ref_calcs.py --emit-golden` that writes the JSON (values plus ledger ids plus current statuses), and a CI check that the committed file equals the generated one.
- **Owner:** test-engineer.

### m-8 MINOR (Phase 1 condition): golden tolerances for closed-form IPC-2221 vectors are 2–3 %

- **Where:** `tools/reference/ref_calcs.py:76-78`; `docs/golden-vectors.json` lines 8, 16, 24 (also 56, 64 for via R/θ).
- **Problem:** these are exact evaluations of a closed form. Policy for closed-form math is ≤ 0.1 %. A 3 % tolerance would **mask the exact S-003 pitfall**: swapping 35 µm for 1.35 mil shifts width by +2.07 %. For example, ext 3 A goes from 53.820 to 54.934 mil and passes. These vectors are not yet consumed by TS tests (no calculators exist), so the impact is nil today.
- **Condition:** tighten to ≤ 1e-6 relative (`oracle_value` is exact) before Phase 1 tests use them.
- **Related:** `via_theta` uses K_CU_THERMAL = 385 W/m·K, which has no ledger row.
- **Owner:** test-engineer; standards-researcher for the k_Cu ledger row.

### m-9 MINOR: ledger and oracle comments equate 1.7241e-8 with 1/58 µΩ·m

- **Where:** LEDGER.md S-004 value cell; `ref_calcs.py:16`.
- **Problem:** 1/58 × 10⁻⁶ = 1.7241379e-8, which differs from 1.7241e-8 by 2.2e-5 relative. Both are legitimate IACS statements (HB100 gives 0.017241 Ω·mm²/m; 58 MS/m is the conductivity form), but "=" is not exact.
- **Fix:** write "≈ 1/58" and pick one value consistently.
- **Owner:** standards-researcher.

### m-10 MINOR: S-011a omits that Brooks & Adam use 0.5 oz = 0.65 mil

- **Problem:** this is not 0.5 × 1.35 = 0.675. Any Mode A implementation of Eq. 5 must use the paper's Th convention or state the deviation.
- **Owner:** standards-researcher.

### m-11 MINOR: S-050 is VERIFIED without a pinned commit

- **Problem:** the ledger itself says the constants "came through a summarizing fetcher". The claim cannot be reproduced.
- **Fix:** pin a commit before any X-03 record.
- **Owner:** standards-researcher.

## 4. Pitfall checklist (Phase 0-relevant items)

| Pitfall | Status |
|---|---|
| ΔT vs T (no offset on Δ°C/Δ°F; T−T → ΔT; T+T, T×k, ΔT−T rejected) | PASS |
| oz (mass) vs oz/ft² (areal mass) kept separate; areal mass → length only via `foilThickness` | PASS ("1 oz" parsed as areal mass is rejected) |
| oz → thickness constant explicit, selectable, CONFLICT-badged, user override → UNVERIFIED | PASS |
| mil vs µm, mil² vs mm²: exact 25.4 µm/mil | PASS |
| IPC-2221 area in mil², width = A/(oz·1.378 mil) | Not in Phase 0 code. Oracle uses 35/25.4 = 1.37795 mil with an explicit "chosen convention" label. PASS for the oracle. |
| Temperature-adjusted ρ; skin depth √(ρ/(π f μ)) | Oracle only. Formulas correct. Phase 1. |
| Creepage/altitude, ε_eff, via barrel area | Out of Phase 0 scope. The oracle's via area π·t·(d+t) uses finished (inside) diameter, which is correct. |

## 5. Claim audit

- No "IPC/IEC compliant", "production safe" or "fab-ready" text exists outside `src/core/gate.ts` and its test. UI text is disclaimers only. This passes, subject to the grep gaps in m-4.
- The gate's own logic can be satisfied by an untrustworthy caller (M-2).
- The S-002 / Mode A wording in the ledger and notes is accurate. "IPC-2152-informed estimate" is justified. No UI text yet claims anything about IPC-2152.

## 6. Conditions for re-validation

Fix M-1 and M-2, then re-run calc-validator on `rootfind.ts` and `gate.ts` only. The MINOR items should be logged in `docs/validation/OPEN_RISKS.md`. m-1, m-2, m-6 and m-8 must be closed before Phase 1 code consumes the affected modules.

## What I could NOT verify

- IPC-2221B/C, IPC-2152 (2009), IPC-4562A and ASTM B258-18(2026) are paywalled and none was read. S-001, S-002, S-010, the 1.35 mil IPC-4562A figure and B258 rounding rules remain user-must-verify. I have not claimed otherwise.
- NBS Circular 31 (1914) was not re-fetched. I confirmed the same values in its successor, Handbook 100.
- Techniques de l'Ingénieur M4640 (paywalled abstract) and the Kanthal datasheet were not re-fetched. S-004 independence rests on the researcher's retrieval.
- The Brooks & Adam paper PDF (Appendix 1, internal-trace coefficients, S-011b) and the SMPS/NinjaCalc/Sierra fits (S-011c–e) were not re-examined. They are not used by Phase 0 code.
- No cross-check tool outputs exist, so there was nothing to classify. I did not run any third-party tool.
- Coverage figures (≥ 95 % branch for units) and CI/Pages status belong to the phase-validator and were not measured here.
