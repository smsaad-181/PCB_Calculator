# Phase 3 PCB domain re-review: safety spacing (clearance, creepage, IPC-2221 spacing)

Reviewer: pcb-domain-reviewer (practising PCB / hardware-safety lens). Branch `phase-3`, head `5bada17`. Date 2026-10-19.
This report replaces the first review of `2876cea`, which was FAIL with 1 BLOCKER and 8 MAJOR findings. I did not edit `src/` or `tests/`.

## Verdict: **PASS-WITH-CONDITIONS**

The BLOCKER is fixed. Reinforced clearance now steps in a human-entered preferred impulse series, not in rows of T2. It refuses when the basic impulse is not a series value or is at the top of the series. Steady-state (T3) reinforced needs its own rule record.

F-2, F-3 and F-4 are also fixed:
- VERIFIED needs a second name.
- Any frequency above 0 Hz needs the T7 frequency-scope record.
- A peak working voltage above the impulse level used is refused when T3 is empty.

The shipped tables are still empty, so the live app gives no number anywhere. Every finding below is latent: it only matters once a user imports licensed tables.

One new MAJOR (N-1) reopens the F-1 class of error through the `multiplier` mode: a reinforced distance can equal the basic one, the result looks clean, and the step list does not show the multiplier. The fix is small. I accept it as a condition only because no table ships with data. Fix it before anyone imports real tables, and before the Phase 4 close at the latest.

## Method

- Read the changed core (`src/core/spacing/tables.ts`, `gating.ts`, the clearance, creepage and IPC-spacing `calc.ts` and guards) and the UI changes: `clearance.vm.ts`, `ipc-spacing.vm.ts`, `spacing-common.vm.ts`, `spacing-help.ts`, `IpcSpacing.tsx` and `Creepage.tsx`.
- Ran 38 scenarios through the core `compute()` functions using only the repo's **synthetic** tables (`synthetic-tables.testutil.ts`). These are fake round numbers, including a fake preferred series of 1, 2, 4, 5 kV that skips the 3 kV row of T2 on purpose.
  - The runner was a scratch vitest file in the session scratchpad, run with the repo's own vitest binary. It was deleted afterwards.
  - No worktree, no install, no `node_modules` change. `git status` is clean.
- No IEC 60664 or IPC-2221 table value was used, recalled or written in this report.
- The Playwright MCP was not used. I reviewed the UI from its components and view-models.
- I accept the correction from research: the TI AMC1411 "doubled" sentence is about temporary overvoltage, not a T3 rule. No public source gives a reinforced steady-state rule. My earlier F-1 text was wrong on that point. The code's answer is right: T3 reinforced needs a user-entered rule record, or the calculation is refused.

### Scenario results (synthetic tables)

| # | Scenario | Outcome | Judgement |
|---|---|---|---|
| R1 | Basic, 2 kV impulse, T3 empty | T2 at 2 kV, warning T3_NOT_ENTERED, confidence low | OK |
| R2 | Reinforced, 2 kV, T3 empty | Step to **4 kV** (series), T2 row 4 kV. The 3 kV T2 row is skipped | **F-1 fixed** |
| R3 | Reinforced, 2 kV, T3 entered | max(T2 at 4 kV, T3 × steady-state multiplier) | OK |
| R4 / R6 | Reinforced at 2.5 kV (user) / 3 kV (from T1), neither in the series | Refused, INSUFFICIENT DATA, "not a value of the preferred impulse series" | Good: nothing invented |
| R5 | Reinforced at the top series value | Refused, OUT OF TABLE RANGE | Good |
| R7 | Reinforced through the category route (T1 gives 4 kV, step to 5 kV) | Number, with the step shown | OK |
| R8 | Reinforced, T3 entered, no `reinforced-clearance-steady-state` record | Refused, the rule is named | Good |
| R9 / X2 | Reinforced, `multiplier` mode with value **1** (X2: fully VERIFIED, T3 empty) | Accepted. Reinforced = basic (7 mm in both). Clean result, and no multiplier step in the step list | **N-1 MAJOR** |
| R10 | Reinforced 2 kV, 3.5 kV peak, T3 empty | Number. The peak is compared with the stepped 4 kV | OK |
| H1 / H5 | 100 kHz, T7 lacks a frequency record (clearance / creepage) | Refused, `scope-max-frequency` named | **F-3 fixed** |
| H2 / Z2 | 50 Hz with T7 empty | Refused, the T7 record is listed with the empty tables | Good (conservative, also for mains) |
| H3 | DC (0 Hz), T7 empty | Number. Voltage scope "not checked" (caution) | Acceptable |
| H4 | 100 kHz above the recorded limit | Refused, IEC 60664-4 named | Good |
| P1 | T3 empty, 4 kV DC peak across a 1 kV-impulse gap | Refused, OUT_OF_SCOPE, with the reason | **F-4 fixed** |
| P2 / P3 / X1 | T3 empty, peak at or below the impulse level (X1: every table VERIFIED) | Number with warning T3_NOT_ENTERED. In X1 the headline has no "indicative only" | N-2 MINOR |
| V1 / V2 / V4 | Verifier equal to the checker or author (differs only in case and spaces), in parse and in import | Refused: "needs a second person" | **F-2 fixed** |
| V3 | Checker = author, verifier a different name | Accepted as VERIFIED | N-3 (accepted residual) |
| V5 | Fully signed set | Plain result. Recommendation names the signer and the product standard | OK |
| C1 | Coating type1 on clearance, record without `appliesTo` | Not applied, warning given (creepage-only default) | Good |
| C2 / C3 / C4 | `appliesTo: both` on clearance; creepage type1; reinforced creepage + coating | × 0.75 applied as a multiplier | F-6 partly fixed, see below |
| E1 / E2 | T7 of another edition, basic: DC / 50 Hz | DC: number, T7 not consulted. 50 Hz: refused (T7 is needed) | **m-3 fixed** |
| K1 | Reinforced creepage fed a 0.1 mm "associated clearance" | Accepted silently | F-7 still open |
| K2 | Sine waveform at 0 Hz | Refused, "0 Hz means DC" | Good |
| K3 | Square waveform given as rms | Warning SQUARE_RMS_UNIPOLAR | Good |
| I1 | IPC external bare board, solder-mask column | Number. The core result carries no exposed-pad warning (the UI shows one) | N-4 MINOR |
| I2 | IPC component lead + mask | Refused. The UI adds the "combination may not exist" hint | m-4 fixed |
| Z1 / Z3 | Shipped empty tables / no inputs | INSUFFICIENT DATA naming T2 and T4 / "Insufficient inputs: ..." with all 8 names | Good |

## Previous findings and status

| Id | Severity (was) | Status at 5bada17 | Evidence |
|---|---|---|---|
| F-1 reinforced clearance stepped one T2 row | BLOCKER | **FIXED** | R2 steps to the series value. R4/R6 refuse a value outside the series. R5 refuses at the top. R8 needs a T3 rule. `lookupGrid` has no step-up. The multiplier path is reopened as N-1 |
| F-2 self-signed VERIFIED | MAJOR | **FIXED** (residual N-3) | V1, V2, V4. `signedBySelf` in both the parser and `computeState` |
| F-3 HF scope only a warning | MAJOR | **FIXED** | H1, H2, H5, Z2 |
| F-4 peak above impulse with T3 empty | MAJOR | **FIXED** (narrow; residual N-2) | P1 |
| F-5 supply vs working voltage confusion | MAJOR | **FIXED** (wording) | `SUPPLY_HELP` says "often line-to-neutral", "NOT the voltage across this gap" and covers DC bus / isolating converter. `PEAK_HELP` says "Not the supply voltage". The T1 `rowKeyDefinition` field was not built (MINOR, condition) |
| F-6 coating credit as a multiplier | MAJOR | **PARTLY FIXED, stays MAJOR (condition)** | `appliesTo` added. The default is creepage only. Labelled "user-stated rule; may not match your standard". Applied only when T7 is VERIFIED. There is still no PD-substitute or solid-insulation mode, see below |
| F-7 creepage takes any associated clearance | MAJOR | **PARTLY FIXED (condition)** | Hint and link to the clearance page. No hand-over of the value, and no `associatedClearanceInsulation` check (K1) |
| F-8 IPC mask column, exposed pads | MAJOR | **PARTLY FIXED (condition, now MINOR)** | `EXPOSED_PAD_WARNING` is shown when a coated column is chosen. There is no "both conductors covered" input and no core warning (N-4) |
| F-9 JSON entry unusable | MAJOR | **FIXED** | `spacing-help.ts`: the selectors per table, the upper-bound row convention, the T7 rules including `series` and `appliesTo`, the second-person rule, a FAKE worked example and an export of the loaded set. Grid/CSV paste and table-level provenance defaults are not built (MINOR) |
| m-1 inner layers | MINOR | FIXED | `INNER_LAYER_NOTE` on both IEC pages |
| m-2 category definitions record | MINOR | OPEN | — |
| m-3 T7 edition blocks basic | MINOR | FIXED | E1 / E2 |
| m-4 missing-column wording | MINOR | FIXED | `NO_COLUMN_HINT` |
| m-5 edition pick list | MINOR | OPEN | Free text. The panel lists the loaded editions |
| m-6 functional insulation | MINOR | OPEN (later phase) | — |
| m-7 unipolar pulse | MINOR | PARTLY FIXED | Help text and the `SQUARE_RMS_UNIPOLAR` warning. No pulse shape to choose |
| m-8 copy block / net-class export | MINOR | OPEN (deferred to Phase 4 by OPEN_RISKS) | — |

## New and remaining findings

### MAJOR

**N-1. The `multiplier` mode lets a reinforced distance equal the basic one, and the clearance step list does not show the multiplier.**
- `parseRules` accepts `reinforced-clearance` in mode `multiplier` and `reinforced-creepage-multiplier` with any value **≥ 1**.
- With value 1 on a fully VERIFIED set, reinforced clearance = basic clearance (X2: 7 mm for both). The result has no "indicative only", no caution about the mode, and no step "× k". In `clearance/calc.ts` around line 119 the multiplier is set but never pushed to `steps`; it appears only in an assumption line.
- No public source describes reinforced clearance as a multiplier of the basic clearance. The public description is one step in the preferred impulse series (TI SLUAAR5 §2.2). A rushed engineer who "knows" reinforced is double will put a multiplier on clearance. At some points of a real table a single fixed factor can be smaller than the series step, which gives too small a gap. Whether it is smaller depends on the edition's values, so check against the licensed copy.
- This is the same failure class as F-1, now reachable through user data. It needs a user error plus a second-person signature, so I rate it MAJOR, not BLOCKER.
- Fix (calc-implementer):
  1. Require value **> 1** (strict) for both reinforced multipliers.
  2. Push a step "Reinforced multiplier (T7) × k" in clearance.
  3. Add a standing caution `REINFORCED_CLEARANCE_MULTIPLIER_MODE` ("public descriptions use the next preferred impulse step; confirm your clause says multiplier").
  4. Better: drop `multiplier` from `reinforced-clearance` and keep only `next-preferred-impulse-step` until a clause that uses a multiplier is cited.
- Test (test-engineer): value 1 is refused; the multiplier step is present in `steps`.
- Do this before any real table import, and before the Phase 4 close at the latest.

**F-6 (remaining). Coating credit can still only be a multiplier.**
- Public scope text for IEC 60664-3 states:
  - Type 1 protection reduces the pollution degree under the coating to PD1.
  - Type 2 protection is treated as similar to solid insulation.
  - Both types require 100 % of the distance between the conductors to be covered.
  
  (AFNOR / EVS listings of IEC 60664-3:2003. The current edition is 2016, so check it.)
- A multiplier cannot express a column substitution. The ratio between the PD1 and PD2 columns changes from row to row, so a ratio entered for one row can be non-conservative at another. `appliesTo: both` now also lets that multiplier shrink clearance (C2).
- The safeguards are real: opt-in, VERIFIED only, labelled as a user rule. They lower the risk but do not remove it.
- Fix (calc-implementer): either
  - build `pollution-degree-substitute` (re-run the T2/T5 lookup at the stated PD) plus a `solid-insulation` refusal, or
  - refuse every `coating-credit` record until that exists.
  
  In either case, add a mandatory "coating covers 100 % of the path between both conductors" yes/no input that refuses a number on "no".
- Condition, owner calc-implementer + test-engineer.

**F-7 (remaining).** Same as before: there is no value hand-over from clearance to creepage, and no insulation-type match check (K1). Condition, owner ui-engineer + calc-implementer. Phase 4 net-class work is the natural place, together with a combined barrier view: design distance = max(clearance, creepage).

### MINOR

- **N-2. A signed set without T3 gives a plain headline when the peak is at or below the impulse level** (X1: no "indicative only"; warning T3_NOT_ENTERED and confidence low only). The P1 refusal catches only the gross case.
  - Fix (calc-implementer): when T3 is empty, either keep the `indicative only` prefix, or require a T7 record `no-steady-state-table` (with clause text) that states the edition has no such table.
- **N-3. The second-person rule compares free-text names.** A checker equal to the author is accepted when the verifier differs (V3). This is an honesty control, not an identity check. It is acceptable and is tied to the human decision UI3-1 / PV3-3.
  - Fix (ui-engineer): the status panel should show "entered by / checked by / verified by" per table, so that a reviewer sees "checked by = entered by".
- **N-4. The IPC exposed-pad caution lives only in the UI** (`IpcSpacing.tsx` line 87). The core `CalcResult` (I1), which a future copy block or net-class export would carry, has no such warning.
  - Fix (calc-implementer): emit a core warning `COATED_COLUMN_EXPOSED_COPPER` whenever a coated column is chosen. Ideally also add the yes/no "both conductors covered along the whole gap" input from F-8, which refuses a number on "no".
- **N-5. Remaining items from F-5 and F-9:**
  - the T1 `rowKeyDefinition` field (calc-implementer, ui-engineer);
  - table-level provenance defaults;
  - a grid/CSV paste importer (ui-engineer + calc-implementer).
  
  Without the last two, users will still script their own JSON converters.
- m-2, m-5, m-6, m-7 (pulse shape), m-8: open as before.

## Checklist answers

- **Required inputs gate the result:** Yes. Z3 lists all 8 mandatory inputs, none with a default. Any frequency above 0 Hz now also needs the T7 frequency record (H1, H2, H5).
- **Product-standard warning always visible:** Yes. `PRODUCT_STANDARD` is in every result. The banner component renders in every state, as before.
- **Reinforced insulation:** The impulse-series step is correct and refuses rather than guesses (R2, R4 to R8). The multiplier route needs N-1.
- **Misuse:**
  - The supply vs peak help text now heads off the line-to-line and DC-bus mistakes.
  - The IPC mask caution is visible in the UI.
  - Coating credit and reinforced multipliers remain the two ways a user's own rule can produce too small a gap with a clean headline (F-6, N-1).
- **Compliance wording:** None. A signed result says "lookups from user-entered tables signed off by <name>" and points to the product standard.
- **Units:** Unchanged. SI internally, unit-slip windows on every table value and on the new `series` field.

## Owners

| Finding | Severity | Owner | When |
|---|---|---|---|
| N-1 | MAJOR | calc-implementer + test-engineer | Before any real table import; Phase 4 close at the latest |
| F-6 (remaining) | MAJOR | calc-implementer + test-engineer | Condition, before coating credit is used on real data |
| F-7 (remaining) | MAJOR | ui-engineer + calc-implementer | Condition, with the Phase 4 net-class work |
| N-2, N-4 | MINOR | calc-implementer | Condition |
| N-3 | MINOR | ui-engineer (+ human decision UI3-1) | Condition |
| N-5, m-2, m-5, m-6, m-7, m-8 | MINOR | as listed | Condition |

Conditions to log in `docs/validation/OPEN_RISKS.md`: N-1, F-6 (remaining), F-7 (remaining), N-2, N-3, N-4, N-5, and the open MINORs above.

## Sources

- TI SLUAAR5 §2.2, "Circuit Board Insulation Design According to IEC60664 for Motor Drive Application". Reinforced clearance is "one step higher in the preferred series of values": https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-B1A84E91-DDEE-4C92-A54D-03C5F8DE95DD
- IEC 60664-3:2003 listing (scope: type 1 reduces the pollution degree under the protection to PD1; type 2 is similar to solid insulation; 100 % of the spacing must be covered): https://www.boutique.afnor.org/en-gb/standard/iec-6066432003/insulation-coordination-for-equipment-within-lowvoltage-systems-part-3-use-/xs109656/432349 and https://www.evs.ee/en/iec-60664-3-2003 (a 2016 edition exists; check it)
- IEC 60664-1:2007 store listing (scope limits stated in the abstract): https://shop.standards.ie/en-ie/standards/iec-60664-1-2007-565005_saig_iec_iec_1289053/
- Altair Pollex IPC material reference (IPC-2221 coated vs uncoated and assembly columns): https://help.altair.com/pollex/topics/pollex/verification/dfe_ipc_material_r.htm

These sources support structural findings only. No table value was taken from them. Per the project rules, the rule text in each finding must be confirmed in the licensed edition.
