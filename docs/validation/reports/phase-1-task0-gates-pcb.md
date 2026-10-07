# Phase 1 task 0, gates G-1..G-4: PCB domain re-review

- Reviewer: pcb-domain-reviewer (independent; read-only on `src/` and `tests/`; no state-changing git commands; the preview server on port 4173 was not touched)
- Date: 2026-10-07
- Code under review: branch `phase-1-task-0` at 571a9b8 (HEAD 92a645c is docs only). The working tree also had an uncommitted one-line S-009 row in `src/core/data/ledger.ts` and `docs/sources/LEDGER.md`. That row is not mine and does not change any result below.
- `npm test`: 46 files, 1393 tests, all passed.
- Method: Node 24 type-stripping scratch scripts in the session scratchpad (`g/p1.mts`, `fz.mts`, `d1.mts`, `perf.mts`, `g23.mts`, `g3.mts`). They import the real `src/core` modules.
  - 178-input parser battery: my earlier 128 inputs plus 50 new traps.
  - 80 000-case directional-rounding fuzz: 19 dimensions, every preference, every accuracy class, up and down, `formatDual` halves, grid-edge and ±ulp values. That gave 96 594 printed strings parsed back and checked.
  - 60 display scenarios and edge cases.
  - Timing of `formatFor`.
  - 7 confidence scenarios.
  - 45 `CalcResult` construction and mutation probes.
- Source re-checked: NCAB finished-copper table (https://www.ncabgroup.com/faq/how-much-finished-copper-can-be-expected/, fetched today; IPC-6012 itself is paywalled and was not read).

## Verdict

| Gate | Verdict |
|---|---|
| G-1 rounding | **PASS-WITH-CONDITIONS** |
| G-2 copper | **PASS-WITH-CONDITIONS** |
| G-3 result / confidence | **PASS-WITH-CONDITIONS** |
| G-4 parser | **PASS** (minors only) |
| **Overall** | **PASS-WITH-CONDITIONS**. No BLOCKER. Three MAJOR conditions, each with a deadline before the first consumer. |

The arithmetic is now right. In 96 594 directional prints across every dimension and preference, no printed minimum is below its SI value and no printed capacity is above it. Every one of those prints parsed back.

The remaining risk sits in the API around the arithmetic:
- The formatter still defaults to round-to-nearest at 6 significant figures.
- Nothing ties a result's `bound` to how it is printed.
- The skills still teach the pre-571a9b8 contract.

A rushed UI author can therefore still print "3 A" for a 2.96 A capacity. The engine is safe; the defaults and the documentation are not yet.

## G-1 Rounding

### Scenarios (actual output)

| Case | Options | Printed | Designer reading |
|---|---|---|---|
| 1.149 mm min width, estimate | `round: roundDirectionFor('min-requirement')` | `1.149 mm (45.24 mil)` | Correct. Was "1.1 mm". |
| 1.14937 mm min width | up | `1.15 mm (45.26 mil)` | Correct. Each half is rounded from SI. |
| 0.254 mm min | up | `0.254 mm (10 mil)` | Correct. mm and mil now agree. |
| 2.96 A capacity, estimate | down | `2.9 A` | Correct. Was "3 A". |
| **2.96 A capacity, estimate, no `round`** | default | **`3 A`** | **Still non-conservative by default (MAJOR G1-a)** |
| 104 °C predicted | up | `104 °C`; 104.04 °C → `104.1 °C`; °F `219.2 °F` | Correct. Was "100 °C". |
| 0.4949 V drop, estimate | up | `500 mV` (analytical: `494.9 mV`) | Correct direction |
| ΔT 9.96 K predicted | up | `10 Δ°C` | Correct |
| 6.35 mm hole | up | `6.35 mm (250 mil)` | Correct. The mm half carries the precision. |
| 0.15 mm fab limit, mil prefs | nearest | `5.91 mil` / dual `0.15 mm (5.91 mil)` | Good. Was "5.90551 mil". |
| 999.6 mA min / 999.96 mA cap, empirical | up / down | `1 A` / `999 mA` | Prefix roll-over handled in the right direction |
| 193.941 mΩ predicted, no class | up | `193.941 mΩ` | 6 s.f. default still applies when no class is given (G1-a) |
| 298.15 K (25 °C) in K prefs | nearest / up / down | `298.1 K` / `298.2 K` / `298.1 K` | See judgement below |
| 0 K | down, °C / nearest, °F | `-273.15 °C` / `-459.67 °F` | Clamp works and the text re-parses |
| margin −0.4 µm | up | `0 mm (-0.01 mil)` | The two halves disagree in sign. Margins have no defined direction (G1-c). |
| 17.5 µm foil | nearest | `0.017 mm (0.69 mil)`; µm prefs `17.5 µm` | A half-ounce thickness prints as 17 µm in mm (m-F / G-8) |
| 1e-15 m | nearest | `0 mm (0 mil)` | Below the grid. Not reachable in PCB work. |
| 1e20 m / 1e300 m | up | 23-digit / 300-digit strings; 1.8e305 m throws | Unreachable (input plausibility warns above 1 m). Carry calc m-7. |
| via count 3.2 | `min-requirement` | `3.2` | Counts must be ceiled in core, not in display. Task 7 note. |

### Fuzz and timing

- **Fuzz:** 80 000 random cases gave 96 594 printed strings.
  - 19 dimensions, 18 preference combinations, 5 accuracy-class settings, up and down.
  - About 30 % sat exactly on, or ±4 ulp from, realistic grid values: 0.254, 1.149, 0.0889 and 0.127 mm, 298.15 K, 17.5 µm and others.
  - About 20 % were on random decimal grids in mm, mil, µm and K.
  - 5 % were negative.
  - **0 direction violations, 0 unparseable outputs, 0 throws.**
- **Timing** (`formatFor`, Node 24): 0.24–0.38 µs off-grid and nearest. 0.7–1.0 µs on-grid up/down, because a value on the grid is parsed back to verify it. `formatDual` up on-grid: 1.9 µs; `parseQuantity`: 0.43 µs. The < 1 µs expectation holds except for the on-grid verification path (≤ 1.02 µs). That is irrelevant for a page that shows tens of numbers.

### Judgements

- **Fab resolution.** The code uses 0.001 mm, 0.01 mil, 0.1 µm, 0.0001 mm² and 0.01 mil². That is finer than the 0.01 mm / 0.1 mil I suggested. Finer is not unsafe, because the print is rounded in the bound's direction, and it leaves snapping to the board grid to the designer or the net-class export. Accepted.
- **Absolute temperature at 1 decimal, and the 298.15 K tie.** "25 °C" echoes as "298.1 K" with nearest in K preferences: the binary value of 298.15 sits just below the tie. The 0.05 K error is far below any thermal-model accuracy, and the °C and °F paths, which designers actually use, print "25 °C" and "77 °F". Directional prints are correct. **Acceptable.** Cosmetic suggestion: print K with 2 decimals so the 273.15 offset survives (G1-d, MINOR).
- **Absolute-zero clamp.** It works for display. The input side is still open (calc m-6): "−1e-10 K" and "−459.67 °F" are accepted, the latter as si = −5.7e-14. This is a G-8 item, not a G-1 item.
- **Is the API hard to misuse? No (G1-a, MAJOR).**
  - `FormatForOptions.round` is optional and defaults to `'nearest'` (`src/core/units/display.ts:56`, `:266`).
  - `accuracyClass` is optional and defaults to 6 s.f. (`:265`).
  - There is no helper that takes a result (`{value, bound}`) and maps the bound itself.
  - `roundDirectionFor` uses the `Bound` vocabulary (`'max-capacity'`), but `DesignValue.direction` uses `'max-limit'` (`src/core/result.ts:30` vs `:33`). Printing a design value's recommended number therefore needs a hand-written mapping.
  - Element margins have no direction at all.
  - The skills do not mention `round`, `roundDirectionFor` or `formatDual`. `.claude/skills/units-dimensional-analysis/SKILL.md:31,33` still documents `formatFor(q, {prefs?, accuracyClass?, unit?})` and says "no rounding direction yet".
  - My D-1 rule 6 ("bound mandatory in formatFor for results; 6-s.f. default only for echoing inputs") is not implemented.

## G-2 Copper

### Scenarios (`rateConfidence(confidenceFactorsFromInputs(...) + copperBasisFactors(...))`)

| Scenario | Level / score | Reasons (abridged) |
|---|---|---|
| Mode B, 2 A, 10 K, 1 oz outer, all user input, nominal basis, foil convention defaulted; status from `dataStatusForLedgerIds(['S-001','S-010','S-003','S-004'], …, {exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE})` | low / 6 | foil convention defaulted; "Safety-relevant values were defaulted, not user-supplied: Nominal copper thickness used instead of finished copper: finished thickness is roughly -29 % to +37 % … by that range**..**"; empirical; PAYWALLED |
| Same without `exclude` | status becomes **CONFLICT** | The S-003 exclusion is opt-in per call |
| Mode B, 40 A out of range (structured) | low / 7 | "current = 40 A (allowed: ≤ 35 A (legacy chart range))", then "forced to low". Readable. |
| Resistance 50 × 0.5 mm, 1 oz inner, T defaulted 20 °C | low / 4 | conductor temperature and foil convention defaulted, plus the nominal-copper line |
| Resistance, finished 25 µm inner, all user, VERIFIED | **high / 0** | none |
| Via θ: drill user, plating from fab profile (listed safety-relevant), 1.6 mm board defaulted, k defaulted (safety) | low / 5 | board thickness; copper k; CONFLICT. **Plating from the fab profile is not counted** (see G3-b). |

The "CONFLICT … unresolved" text no longer appears on copper results when callers use the exclusion. That was my D-2(a) complaint. Entering finished copper takes a resistance result to high. That is the right incentive: it rewards the one action that actually removes the 30–90 % uncertainty.

### Is "roughly −29 % to +37 %" fairly hedged?

The hedges are honest: "roughly", "secondhand", "not read from the standard". The number itself is only right for **1 oz**, and the text is the same for both layers. NCAB's IPC-6012 figures, against the 35 µm/oz nominal:

| Base foil | Inner, after processing | Outer, Class 2, after plating | Outer, Class 3 |
|---|---|---|---|
| 0.5 oz (17.5 µm) | 11.4 µm, **−35 %** | 33.4 µm, **+91 %** | 38.4 µm, +119 % |
| 1 oz (35 µm) | 24.9 µm, −29 % | 47.9 µm, +37 % | 52.9 µm, +51 % |
| 2 oz (70 µm) | 55.7 µm, −20 % | 78.7 µm, +12 % | 83.7 µm, +20 % |

Two problems with the current wording:
- **0.5 oz inner is the most common inner layer on a cheap 4-layer stack, and the text understates its deficit.** −35 % thickness means about +54 % resistance and drop. The text says resistance is "uncertain by that range" (−29 %).
- **It hides the direction.** Thinner inner copper is the non-conservative side for R, drop and ΔT. Thicker outer copper is conservative for R and ΔT, but it consumes etch margin for fine spacing.

Not dangerous, because the default already forces a low rating and names the cause. But it is the sentence a designer will remember. Finding G2-a (MINOR).

### Other G-2 points

- **Wording when the user typed the weight.** The user typed "1 oz", yet the text says "Safety-relevant values were defaulted, not user-supplied: Nominal copper…". What was defaulted is the *basis* (nominal vs finished), not the weight. Sentence nesting also produces a double full stop (`confidence.ts:122` joins a text that already ends in "."). Finding G2-b (MINOR).
- **The S-003 exclusion is opt-in** (`constants.ts:71`, `data-status.ts:58-77`). A caller that forgets `{exclude}` silently rates every copper result CONFLICT again. That fails safe (lower confidence), so it is MINOR (G2-c). A `copperDataStatus(ids)` helper that applies the exclusion would remove the trap.
- **`layer` has no provenance.** `CopperBasis.layer` is required, which is good. `CalcInput.value` is a `Quantity` (`result.ts:17-22`), so categorical inputs have no `source`: layer, foil convention, k material and Mode A/B. A UI that pre-selects "outer" cannot be detected by `confidenceFactorsFromInputs`. G-2 asked that `layer` never be a default; nothing enforces that. Finding G2-d (MINOR, before task 2).
- **R-9.** With the defaulted convention now one ordinary assumption (2.07 % spread, selectable, labelled), R-9 no longer moves any confidence level or headline. **It no longer blocks a merge for tasks 1–3**, provided the convention stays user-selectable and the S-003 badge stays. It still needs the human decision before Phase 1 closes, because rule 1 forbids presenting 35 µm as settled.
- `foilAssumptionText()` still ends "(ledger S-003, status CONFLICT)". That is fine for the assumption line. The nominal-copper text should cite the S-009 row being added in the working tree.

## G-3 CalcResult and confidence

### Legitimate results: all accepted

| Probe | Result |
|---|---|
| Trace width: min width (`min-requirement`), max current (`max-capacity`), design values for width ×1.25 and current ×0.8, nominal copper basis | ACCEPT |
| Resistance with self-heating: R, conductor T, rise all `prediction`; ΔT design value ×0.9; R envelope | ACCEPT |
| Same with allowed T_max as an absolute temperature with bound `max-capacity` | ACCEPT (correct; rounding down is conservative) |
| Path/load with 6 elements (trace, via, connector, **spoke**, **pour-neck**, pad) at 5 A; `rankElements` → SP1 1.087, J1 0.909, V1 0.833, T1 0.704, PN1 0.556, P1 0.417; limiting = SP1 (over limit); net-class export | ACCEPT |
| Elements array not in ranked order, limiting element correct | ACCEPT (the check ranks internally) |
| Via with fab profile (JLCPCB, age 1 day, not stale) | ACCEPT |

### Mistakes: caught

- Absolute-temperature derating.
- Wrong or missing limiting element.
- Wrong utilisation, or margin with the wrong sign.
- Duplicate element id; unknown kind ("thermal-relief").
- Missing bound, or bound typo ("min").
- NaN in results or exports.
- Factor 1.2 on a max-limit.
- Recommended ≠ calculated × factor.
- Warning severity "error".
- Copper basis layer "top" or thickness 0.
- Envelope with min > typ.
- Negative `ageDays` or non-boolean `stale`.
- Ledger spelling of `dataStatus` at the top level.
- Unknown data status passed to `rateConfidence`: typed `ConfidenceInputError`, no NaN.
- `safetyRelevant` naming a non-input: throws.

### Mistakes: accepted (gaps)

| # | Accepted | Why it matters to a designer |
|---|---|---|
| G3-a | Confidence `high` with a `validityChecks` entry `ok:false` ("40 A > 35 A"); `high` with score 7; `medium` with empty reasons | The out-of-range → low rule only works if the calculator also passes `outOfRange`. A calculator that records the failed check but forgets the factor shows a green "high" next to an out-of-range result. That is the exact misreading P-1 was about. The UI rule "never show a level without reasons" is not enforced in core. |
| G3-b | `fabProfile.status` UNVERIFIED and `stale: true` (900 days), with `dataStatus` VERIFIED and confidence high; `ageDays: 400` with `stale: false`; `fabProfile.status` in the ledger spelling | An old, unverified example profile can feed a "high" via result. In addition, `confidenceFactorsFromInputs` deliberately ignores `source: 'fab-profile'` (`confidence.ts:158`), even when the input is named safety-relevant (plating). `defaultedInputNames` counts the same input as not user-supplied (`result.ts:145-147`). The two helpers contradict each other, so the per-calculator invariant the skill asks for (`defaultedInputNames ⊆ defaulted ∪ safety`) fails for any input taken from a fab profile. |
| G3-c | Export `trackWidth` given as a current, or as −1 mm | Net-class values go straight into CAD |
| G3-d | Element with absolute-temperature load and limit (100 °C vs 105 °C → utilisation 0.987, a kelvin ratio); elements mixing ΔT and current bases ranked by one utilisation | Utilisation on absolute temperature is meaningless. 25 °C against a 105 °C limit reads 79 %. ΔT goes as I², so 0.9 current-utilisation ≈ 0.81 ΔT-utilisation, and mixed bases mis-rank the weakest link. |
| G3-e | No primary result or no results; negative `min-requirement` width; finished copper 35 m; empty `ledgerIds` with VERIFIED; envelope `typ` ≠ the result value | Cheap invariants |

### Is it enough for task 6?

Almost. `elements[]` has kind (including spoke and pour-neck), load, limit, utilisation and margin, plus a checked limiting element. Still missing (G-7 stays open):
- `ElementResult` has no **limit basis and source**. A designer needs to read where each limit came from, e.g. "J1: 5.5 A, connector datasheet, user" vs "SP1: 4.6 A, spoke-width estimate, legacy IPC-2221".
- No per-element R, drop or power. A drop budget is the other half of path/load.
- `CalcExport.values` are bare quantities. They carry no **bound** (a width or clearance must snap *up* to the CAD grid), no fab-profile id and no dimension check.

### Readability of the structured out-of-range reasons

The structured form reads well: "current = 40 A (allowed: ≤ 35 A (legacy chart range))". The bare-string form does not (`confidence.ts:78-79`):
- "dT" and "w" get " (outside validity range)" appended;
- "current" (more than 3 characters) is printed alone as a reason line: "current".

The "more than 3 characters means it is already a sentence" heuristic is the quirk. Make the structured form mandatory, or always append the suffix to bare strings. Finding G3-f (MINOR). Grammar: "1 input(s) are".

## G-4 Parser

I re-ran the 128-input battery and added 50 inputs. Every trap I listed is closed, and the error messages name the accepted spelling:

| Trap | Now |
|---|---|
| "10 M" / "10 k" / "10 n" / "10 G" (length) | Rejected: `Bare prefix "M" … Write the unit, e.g. 10 mm, 10 um, 10 mil` |
| "35u" (length / area) | Rejected, with examples for the field |
| "1.72 u" (resistivity); "1 k" (current density); "20 k" (θ); "4.5 k" (dimensionless) | Rejected, with examples for the field |
| "10 m" (area) / "1 m" (current density) | Rejected with a dimension error |
| "4K7", "10K", "10 KΩ", "10 KOhm" | `upper-case K means kelvin, not kilo. Write kilo with a lower-case k: 4k7, 10k, 10 kΩ` |
| "1/2 oz", "½ oz", "1 1/2 oz" | `Fractions are not accepted in copper weight: write 0.5 oz` / `1.5 oz` |
| "1 MF", "1 M" (capacitance) | Accepted as megafarad **with** the warning `"MF" … means microfarad: write uF` and echo "= 1 MF". Acceptable: the value is visible and warned. |
| "1,000 mm" | `ambiguous … Remove the thousands separator, or use "." as the decimal point` (calc m-10a closed) |
| "10 m", "1m", "0.5 m" (resistance) | 10 mΩ with warning `"m" is read as milliohm … write "mΩ" … or "MΩ"`, echo "= 10 mΩ (resistance)" |
| "10 m" / "1.5 m" (length) | Accepted as metres, with warning "Length is longer than 1 m: check the unit"; echo "= 10000 mm" |
| "50" (dimensionless) | Accepted; echo "= 5000 % (ratio)". `parseFraction("50")` rejects it as ambiguous. |

**False positives.** None on ordinary inputs: 10 mil, 0.254 mm, 2 A, 500 mA, 4k7, 100 nF, 4700 uF, 20 K/W, 1.7241 µΩ·cm, 35 A/mm² and 25 °C all have empty warnings. Borderline cases:
- "1 mF" warns "very large for a capacitor". A 1 mF bulk electrolytic is ordinary, but the warning is harmless.
- "1000 V" and "1.5 kV" warn "Value is 1 kV or more: kilovolts: check…" (`parse.ts:355`). This will fire on legitimate IEC 60664 / mains-isolation inputs in the safety-spacing phase, and the double colon reads badly.

**Echo (`describeParsed`).** Good for ordinary inputs ("= 10 Δ°C (temperature rise)", "= 4.7 kΩ (resistance)", "= 25 °C (absolute temperature)"). Three weaknesses:
- It uses nearest at 3 mm decimals, so "17.5 um" echoes "= 0.017 mm" and "0.1 um" echoes "= 0 mm". The confirmation contradicts what was typed (copper and plating need µm, m-F / G-8).
- Every dimensionless value echoes as a percentage, so a dielectric constant "4.5" echoes "= 450 % (ratio)" (`parse.ts:443`). That is misleading for εr fields in Phase 2.
- "-1e-10 K" is accepted and echoes "-273.15 °C" (calc m-6 still open at input).

Still rejected: "4k7 Ω" (calc m-10g), "20 K / W", "%/K". All are safe refusals.

## Findings

### BLOCKER
None.

### MAJOR (conditions with deadlines)

**G1-a. Directional rounding is opt-in, so the safe print depends on every caller remembering it.**
- Where: `src/core/units/display.ts:50-57` (`round?`, `accuracyClass?`), `:265-266` (defaults 6 s.f., `'nearest'`); `src/core/result.ts:30,33` (two vocabularies for one concept); `.claude/skills/units-dimensional-analysis/SKILL.md:31,33` (stale).
- Evidence: `formatFor(q(2.96 A), {accuracyClass:'estimate'})` → "3 A"; with no class, "193.941 mΩ".
- Fix:
  - Add a core `formatResult(value, bound, opts)` (and `formatDesignValue`, `formatMargin`) with **required** `bound` and `accuracyClass`. It maps max-limit → down and margins → down.
  - Make the UI use only these for results. A UI or lint test should reject `formatFor` on any `results[].value`.
  - Unify `DesignDirection` with `Bound`, or map them explicitly in core.
  - Update the skill.
- Owner: units-engine-engineer (helper) + ui-engineer (use + test) + orchestrator (skill).
- Deadline: before the first calculator page (G-5). Core math does not depend on it.

**G3-a/b. `assertCalcResult` does not tie confidence to validity checks or to the fab profile, and the two provenance helpers contradict each other.**
- Where: `src/core/result.ts:312-362`, `:145-147`; `src/core/confidence.ts:158`.
- Fix (invariants to add):
  - any `validityChecks[].ok === false` ⇒ `confidence.level === 'low'`;
  - level consistent with score (`rateConfidence` thresholds);
  - non-empty reasons when the level is not high;
  - `fabProfile.status` is a valid `DataStatus`, and `dataStatus` is no better than it;
  - `stale` consistent with `ageDays` and the threshold.
- Also decide fab-profile provenance one way. My recommendation: count a value from an UNVERIFIED profile as a defaulted input (safety-relevant when listed) with the reason "from fab profile X (unverified)". Then make `defaultedInputNames` and `confidenceFactorsFromInputs` agree.
- Owner: calc-implementer + test-engineer.
- Deadline: the validity/level/reasons invariants before task 2; the fab-profile items before task 7 (or any profile picker).

**DOC-1. Skills and SPEC teach the old contract.**
- Where: `.claude/skills/calc-module-pattern/SKILL.md:44` (`designValue?` singular), `:72` (says `assertNoNonFinite` lacks checks and that there is no `assertCalcResult`); no mention anywhere in `.claude/skills` of `bound`, `designValues`, `elements`, `copperBasis`, `exports`, `confidenceFactorsFromInputs`, `copperBasisFactors`, `FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE`, `parseQuantityDetailed`, `parseFraction`, `describeParsed`, `formatDual` or `roundDirectionFor`; `docs/SPEC.md:18` (singular `designValue`).
- This is the V-1 drift again. The task-1 implementer follows the skill.
- Owner: orchestrator / calc-implementer.
- Deadline: before task 1 starts.

### MINOR

| # | Finding | Where | Fix | Owner | Before |
|---|---|---|---|---|---|
| G1-c | Margins have no rounding direction; a −0.4 µm margin prints "0 mm (-0.01 mil)" | `display.ts:38` | `formatMargin` rounds down (pessimistic) | units-engine-engineer | task 6 |
| G1-d | K prints 1 decimal; 298.15 K echoes 298.1 K | `display.ts:112` | 2 decimals for K | units-engine-engineer | any time |
| G1-e | Huge lengths print 300-digit strings; ≥ 1.8e305 m throws (calc m-7) | `display.ts:163-179` | Fall back to exponent above about 1e9 display units | units-engine-engineer | low |
| G2-a | Nominal-copper text gives 1-oz figures for all weights and both layers, with no direction | `src/core/data/constants.ts:97-98` | Per-weight, per-layer text from the S-009 table, e.g. "inner 0.5 oz: about 35 % thinner after processing, so R, drop and ΔT about 50 % higher (non-conservative); outer: thicker after plating (conservative for R/ΔT, less etch margin)"; cite S-009 | calc-implementer + standards-researcher | task 2/3 |
| G2-b | "defaulted, not user-supplied: Nominal copper…" when the user typed the weight; double full stop | `confidence.ts:122`, `constants.ts:97` | Reason "Copper basis is nominal (finished thickness not entered): …"; strip the trailing full stop before joining | calc-implementer | task 2 |
| G2-c | S-003 exclusion is opt-in per call | `constants.ts:71`, `data-status.ts:58` | `copperDataStatus(ids)` helper, or exclude by default for copper calculators | calc-implementer | task 2 |
| G2-d | Categorical inputs (layer, foil convention, k material, Mode) have no provenance | `result.ts:17-22` | `choices[]: {name, value: string, source}` counted by `confidenceFactorsFromInputs`; layer never defaulted | calc-implementer | task 2 |
| G3-c | Export values: no dimension, sign or bound check; no profile id | `result.ts:61-66`, `:291-293` | Typed net-class keys (all lengths > 0), `bound` per value (width/clearance up), `fabProfileId` | calc-implementer | task 6 |
| G3-d | Absolute-temperature elements accepted; utilisation across mixed bases | `result.ts:218-252` | Reject absTemp in `checkElements` (use the ΔT budget); define a common basis (current-equivalent) or rank per basis | calc-implementer | task 6 |
| G3-e | No primary result accepted; negative `min-requirement`; copper basis magnitude (35 m); empty `ledgerIds` with VERIFIED; envelope `typ` not tied to the result | `result.ts:312-362` | Add these invariants | calc-implementer + test-engineer | task 2 |
| G3-f | Bare out-of-range names longer than 3 characters print alone ("current") | `confidence.ts:78-79` | Structured form only, or always append the suffix; "input(s) are" grammar | calc-implementer | task 2 |
| G3-g | `ElementResult` has no limit basis/source and no per-element drop/R | `result.ts:40-50` | `limitBasis`, `limitSource`, optional `drop`/`resistance` | calc-implementer | task 6 (G-7) |
| G4-a | Dimensionless echo is always "%": εr 4.5 → "450 % (ratio)" | `parse.ts:443` | Echo as a percentage only for fraction fields (a `kind: 'fraction' \| 'ratio'` hint) | units-engine-engineer | Phase 2 impedance / any εr field |
| G4-b | kV warning fires on legitimate isolation voltages and reads "…or more: kilovolts: check…" | `parse.ts:355` | Per-field thresholds; reword | units-engine-engineer | safety-spacing phase |
| G4-c | Echo of thin copper/plating at mm resolution ("17.5 um" → "= 0.017 mm"; sub-µm → "0 mm") | `parse.ts:444`, `display.ts:103` | Thickness role prints µm (G-8 per-role units) | units-engine-engineer | task 1 |
| carry | calc m-6 (input-side 0 K clamp), m-7, m-10g ("4k7 Ω"), counts must be ceiled in core (via count) | as logged | as logged | as logged | as logged |

## Gate disposition

| Gate | Status | Residual |
|---|---|---|
| G-1 | **Engine closed** (0 violations in 96 594 prints; scenarios correct; formatDual from SI; fixed-decimal temperatures; clamp) | G1-a (MAJOR, before the first page), G1-c..e |
| G-2 | **Closed in structure** (structured basis; defaulted convention = one assumption; nominal = safety default; finished basis rates high) | G2-a..d; R-9 human decision before Phase 1 closes, no longer a merge blocker for tasks 1–3 |
| G-3 | **Mostly closed** (bound, designValues, ranked elements with margin, spoke and pour-neck kinds, copperBasis, exports, fab age, status mapping, abs-T derating rejected, typed unknown-status error) | G3-a/b (MAJOR), G3-c..g, DOC-1 |
| G-4 | **Closed** | G4-a..c (MINOR) |

## Must be true before the first Phase 1 calculator merges (updated)

1. **DOC-1:** `calc-module-pattern`, `units-dimensional-analysis` and SPEC §Result schema match 571a9b8:
   - `bound`, `designValues[]`, `assertCalcResult`;
   - `confidenceFactorsFromInputs` + `copperBasisFactors` + the S-003 exclusion;
   - `parseQuantityDetailed` / `describeParsed` / `parseFraction`;
   - `formatDual` and the rounding rule.
2. **G3-a (core invariants):** `assertCalcResult` enforces:
   - validity-check failure ⇒ level low;
   - level consistent with score;
   - non-empty reasons unless high;
   - at least one primary result;
   - no negative `min-requirement`.
   Every calculator's tests call `assertCalcResult` on every output.
3. **G2-a/b/d (copper wording and provenance) for tasks 2/3:**
   - layer- and weight-specific finished-copper text with direction, citing S-009;
   - correct "basis is nominal" wording;
   - categorical inputs (layer, convention, Mode) carry provenance;
   - `layer` is never defaulted.
4. **G-5 (UI), before the first calculator page:**
   - results printed only through a bound-aware helper (G1-a), with mm and mil dual for geometry;
   - confidence reasons and score always next to the level;
   - parsed echo and parse warnings on every input, with thickness echoed in µm (G4-c);
   - readable partial-ignore banner (m-D);
   - a UI test proving no headline uses `'nearest'`.
5. **G-6 (fab profile content)** before task 7, any profile picker or net-class export:
   - per-limit scope (layer count, copper weight, inner/outer);
   - via / PTH / NPTH hole-to-track;
   - finished-hole tolerance vs drill;
   - plating minimum vs average;
   - finished copper per layer;
   - plausibility checks;
   - never pre-selected;
   - age banner and per-value "(unverified)";
   - **plus G3-b:** fab-profile provenance counted, and `dataStatus`/`stale` consistent with the profile.
6. **G-7** before task 6:
   - `ElementResult` limit basis and source, per-element drop/R (G3-g);
   - absolute-temperature elements rejected and a common utilisation basis (G3-d);
   - margins printed pessimistically (G1-c);
   - export values typed and bounded, with the profile id (G3-c).
7. **G-8** in its tasks:
   - per-role units (µm thickness, fab limits in the published unit);
   - k = 401 non-conservative text: **done** in `constants.ts:50`;
   - solver `suspect` flag and the NO_BRACKET→RUNAWAY mapping (m-3, m-4);
   - zero-input guards and the input-side 0 K clamp (m-6, R-13);
   - short gate label;
   - via counts ceiled in core.
8. **R-9:** the human confirms the 35 µm working default before Phase 1 closes. It is no longer a merge blocker for tasks 1–3, provided the convention stays selectable and badged.
