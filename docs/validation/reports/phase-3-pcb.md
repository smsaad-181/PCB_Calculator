# Phase 3 PCB domain review: safety spacing (clearance, creepage, IPC-2221 spacing)

Reviewer: pcb-domain-reviewer (practising PCB / hardware-safety lens). Branch `phase-3`, head `2876cea`. Date 2026-10-19.
Scope: `src/core/spacing/*`, `src/core/calculators/{clearance,creepage,ipc-spacing}`, `src/ui/calculators/{Clearance,Creepage,IpcSpacing}.tsx` and their view-models, `src/ui/components/Spacing*`, `docs/research/spacing-structure-and-gating.md`. I did not edit `src/` or `tests/`.

## Verdict: **FAIL** (1 BLOCKER, 8 MAJOR, 8 MINOR)

The gating is good. With the shipped empty tables the app gives no number anywhere. Every missing input is listed by name. The product-standard banner shows in every state. Edition mismatches, missing cells, out-of-range values and above-scope frequencies are all refused with a reason. "Indicative only" stays on every label while data is unverified. I would trust this skeleton.

The problem is what happens once a user fills the tables from a licensed copy, which is the purpose of this phase. One rule is coded so that it gives too small a reinforced clearance, with no warning, and the rule's name invites the user to pick it (BLOCKER F-1). Several daily-use gaps would make me distrust the numbers or the workflow (MAJOR). The BLOCKER is latent: today's shipped data cannot trigger it. It is still safety logic that disagrees with the clause it claims to implement, so I will not pass it. The fix is small.

## Method

- Read all core and UI code listed above, plus the research doc and ledger row S-030f.
- Ran 22 scenarios through the core `compute()` functions with the repo's **synthetic** test tables (`synthetic-tables.testutil.ts`, made-up round numbers that are not from any standard). I used a scratch vitest file outside the repo (`C:\Users\HI\AppData\Local\Temp\claude\f--pcb-calc-pcb-calc-kit-v2-pcb-calc\99d32e0b-fc16-48ae-91eb-d1507f3e8c9e\scratchpad\p3\scen.test.ts`). No IEC or IPC value was used or written anywhere.
- Checked public manufacturer application data for the reinforced-insulation rule and the IPC-2221 coating columns (sources at the end).
- The Playwright MCP was not available in this session, so the UI was reviewed from the components and view-models, not by clicking. The preview server answered HTTP 200 on :4173.

### Scenario summary (synthetic tables)

| # | Scenario | Outcome | Judgement |
|---|---|---|---|
| S1 | Basic clearance, user-entered impulse 2.5 kV, PD2, inhomogeneous, 0 m, 50 Hz | Number, "indicative only", confidence low, SCOPE_NOT_CHECKED | Correct gating |
| S2 / S2b | Reinforced clearance, T7 `reinforced-clearance: next-higher-row` | Reads the next **T2 row**, not the next impulse step | **F-1 BLOCKER** |
| S3 | Functional insulation | Same as basic (labelled "conservative") | OK, see m-6 |
| S4 | 100 kHz switch node, T7 empty | **A number is given**, only a warning (HF_NOT_CHECKED) | **F-3 MAJOR** |
| S4b | 100 kHz, T7 frequency limit entered | Refused, names IEC 60664-4 | Good |
| S5 | 4 kV DC peak working voltage, 1 kV impulse, T3 empty | **A number from T2 alone** (the 1 kV row) | **F-4 MAJOR** |
| S6 / S6b | Category route, supply voltage above / inside the T1 rows | Refused OUT OF TABLE RANGE / next-higher row | OK. See F-5 for wording |
| S7 | Edition text mismatch | Refused, but names T7 even though basic insulation does not need T7 | m-3 |
| S8 to S11 | Creepage basic, reinforced, PD3 printed-wiring (no column), 5 V below the first row | Correct lookups; refusal on the missing column; first row used below the table (conservative) | OK |
| S9 | Reinforced creepage fed a basic-insulation associated clearance | Accepted silently | F-7 MAJOR |
| S12 / S12b | Coating type 1 with unverified / verified T7 | Not applied / applied as a **multiplier** on creepage and clearance | **F-6 MAJOR** |
| S13 / S15 | IPC external uncoated at 0 m; IPC 100 V above the top band | Correct column; per-volt extension correct | OK |
| S14 | IPC with only an RMS voltage | Refused: "voltagePeak" missing (no silent RMS-to-peak conversion) | Good |
| S16 | IPC component lead + "solder mask" coating | Refused, but the message reads like missing data rather than "this combination does not exist" | m-4 |
| S17 | IPC bare board, "permanent polymer coating or solder mask" | Number from the B4-style column, with no note that pads are uncoated | **F-8 MAJOR** |
| S18 | Fully signed (VERIFIED) set | Banner gone, the result is stated plainly; any single person can sign | **F-2 MAJOR** |
| S21 / S22 | No inputs / shipped empty tables | "Insufficient inputs: ..." / INSUFFICIENT DATA naming T2 and T4 | Good |
| Import | Typo in a selector value | Clear error listing the allowed values | Good. The values are documented nowhere else, see F-9 |

## Findings

### BLOCKER

**F-1. A reinforced clearance can come out too small: "next-higher-row" steps one row of T2, not one step of the preferred impulse series.**
`lookupGrid(..., { stepUp: true })` (`src/core/spacing/tables.ts` around lines 1118 to 1122, called from `clearance/calc.ts` steps 4 and 5) reads the T2 row after the matched row.

The public manufacturer text says something else. Reinforced clearances are "dimensioned as specified in Table F.2 corresponding to the rated impulse voltage but one step higher in the preferred series of values than that specified for basic insulation" (TI SLUAAR5 §2.2). The project's own research doc says the same thing ("clearance: use the next impulse step", §3.6, Q-35).

The clearance table usually has more rows than the preferred impulse series has steps. Where it does, one step of T2 lands between two preferred steps. The reinforced distance is then too small, and the result looks clean. Once T2, T4 and T7 are VERIFIED there is no banner at all.

The same `stepUp` is also applied to T3 (steady-state / recurring peak). Public sources describe a different reinforced rule there (TI AMC1411 datasheet: the value "is doubled for reinforced isolation"). Stepping a T3 row is not that rule either.

Also, when the requested impulse falls between rows, the code first moves to the next-higher row and then steps again. That is two steps: conservative, but not what the rule says.

- Fix (calc-implementer, with standards-researcher for the rule text):
  - Replace mode `next-higher-row` with `next-preferred-impulse-step`. The preferred series must be an explicit, human-entered, provenance-carrying list (a T7 record, or the column values of T1). Look up the next value of that series, then read T2 at that impulse.
  - If the basic impulse is not in the series, refuse unless the user's T7 holds the edition's rule for that case. Do not invent a fallback.
  - Do not apply `stepUp` to T3. Add a separate T7 rule (`reinforced-steady-state`) or refuse reinforced when T3 is used.
  - Until this is done, the faster safe fix is to remove `next-higher-row` from the schema and require reinforced users to enter the reinforced impulse withstand voltage through route (b).
- Test (test-engineer): a synthetic T2 with intermediate rows plus a synthetic preferred series. Assert that the reinforced lookup lands on the next series value, never on the next T2 row.

### MAJOR

**F-2. VERIFIED can be self-signed, and it removes every visible warning.** `computeState` (`tables.ts` around line 904) accepts `checkedBy` equal to `enteredBy` on every record, and `verifiedBy` equal to both. One rushed engineer can turn a hand-typed T5 into VERIFIED. That drops the red banner, the "indicative only" prefix and the low confidence (S18 shows the result stated plainly).
- Fix (calc-implementer): for VERIFIED, require `checkedBy` ≠ `enteredBy` on every record and `verifiedBy` ≠ `table.enteredBy`. Otherwise derive ENTERED_UNVERIFIED and show "self-checked" in the status panel (ui-engineer). Test (test-engineer).

**F-3. The high-frequency scope check is only a warning when T7 has no frequency record.** A switching node (S4, 100 kHz) gets an IEC 60664-1 clearance or creepage with a warning attached. The frequency limit is the one scope rule that most often decides whether Part 1 applies to an SMPS layout at all. Public listings of the standard state a rated-frequency limit (standards.ie listing of IEC 60664-1:2007).
- Fix (calc-implementer): when frequency > 0, require the `scope-max-frequency` record (INSUFFICIENT DATA, naming the missing T7 rule), just as reinforced requires its rule. It is one line for the user to enter. Apply the same treatment to the voltage scope record.

**F-4. No physical sanity check between the working peak and the impulse withstand when T3 is empty.** In S5 a 4 kV DC peak across a gap sized for a 1 kV impulse gives a number with only a T3_NOT_ENTERED warning. A reviewer would stop that board immediately.
- Fix (calc-implementer): with no table value needed, refuse (or show a critical warning that cannot be dismissed) when the peak working voltage exceeds the impulse withstand voltage used. Make T3 mandatory when the peak working voltage is above the lowest T2 row, unless the edition record in T7 states that the edition has no such table (a `no-steady-state-table` rule with clause text).

**F-5. "Supply voltage" next to "Peak working voltage" invites mixing them up.** The help text only says: "The nominal supply voltage as it is the row key of your table T1. How a system voltage maps to a row is your responsibility." A designer working on an SMPS secondary, a DC link or an IT system will type the wrong number. Examples: the 400 V line-to-line value instead of the line-to-neutral one, or the DC bus voltage instead of the mains nominal, or using the mains category on a circuit downstream of an isolating converter.
- Fix (ui-engineer, wording reviewed by standards-researcher):
  - Rename the field to "Nominal mains / system voltage (row key of T1, as your edition defines it, often line-to-neutral)".
  - Add one sentence: "This is NOT the working voltage across this gap."
  - Add one sentence: "Circuits behind an isolating transformer or converter usually need the impulse level your product standard assigns to that circuit; use route (b)."
  - Add a T1 `rowKeyDefinition` text field in the schema (calc-implementer) and show it on the page.

**F-6. Coating credit is modelled as a distance multiplier (0, 1].** This shape probably does not fit how IEC 60664-3 credit works: coated boards are typically assessed against a different pollution-degree column (type 1) or treated as solid insulation (type 2). I cannot confirm the exact rule without the licensed text. A user who enters "type 1 = use the PD1 column" from the licensed text cannot express it, and will be tempted to compute a ratio and enter that. The credit is also applied to clearance (S12b shows creepage; clearance uses the same path).
- Fix (calc-implementer): change the `coating-credit` rule to a `mode`: `pollution-degree-substitute` (value = PD), `solid-insulation` (refuse in this calculator and point to the solid-insulation route), or `multiplier`. Keep the multiplier only if the clause text says so. Make the rule declare which distances it applies to (clearance, creepage or both). Test (test-engineer).

**F-7. The creepage floor accepts any "associated clearance". There is no link from the clearance page.** A basic clearance fed into a reinforced creepage (S9), or a value in the wrong unit, is accepted. The user must retype the clearance by hand, in a unit the field happens to parse.
- Fix (ui-engineer): add a "Use this clearance in creepage" action on the clearance result. It should carry the value, insulation type, pollution degree, edition and frequency in the creepage hash.
- Fix (calc-implementer): accept an optional `associatedClearanceInsulation` and refuse a mismatch.
- Better still, add a combined "insulation barrier" view that shows clearance, creepage and the design distance = max(clearance, creepage) for one gap. Every safety review needs this.

**F-8. The IPC coating option "Permanent polymer coating or solder mask" gives no warning that pads and lands are uncoated.** The most common real misuse of IPC-2221 is applying the coated-board column to pad-to-pad or pad-to-trace spacing, where the copper is exposed. Public discussion maps this column to solder resist over conductors and puts assembly clearances under the component-lead columns (Altair Pollex IPC material reference; TI E2E DRV8350R thread). The tool also states the opposite policy on the same page ("Solder mask is not conformal coating ... no coating credit is ever given"), followed by a qualifier. That is confusing.
- Fix (ui-engineer): when that option is chosen, add a pinned caution: "Applies only where solder mask fully covers BOTH conductors along the whole gap. Pad-to-pad, pad-to-trace and any exposed copper use the uncoated column (and the component-lead column for terminations)."
- Fix (calc-implementer): add a mandatory yes/no input "both conductors fully covered along the gap" for that option, and refuse a number when the answer is no.

**F-9. Entering the JSON is not realistically usable without reading the source code.** The blank template has empty `rows`, `columns` and `cells` arrays. There is no example. Selector names and allowed values (`pollutionDegree`, `fieldCondition`, `surface`, `conductorKind`, `permanent-polymer-or-solder-mask`, `below-breakpoint`, ...) are documented nowhere outside `tables.ts`. The row convention is not stated (T5 and T8 band rows must use the band's upper bound for the next-higher lookup to mean "up to and including"). Each cell needs 7 provenance fields, so a full creepage table runs to several hundred cells with roughly nine fields each, typed by hand. In practice users will write their own converter script, and that becomes an unreviewed transcription step for safety data.
- Fix (ui-engineer + calc-implementer):
  1. A user-facing schema page: every table's selectors and allowed values, the row-key convention, and a fully worked example using obviously synthetic values.
  2. Table-level provenance defaults (source, enteredBy, enteredDate) inherited by cells, with per-cell override. Keep per-cell `printed` and `checkedBy`.
  3. A grid/CSV paste importer: rows × columns as printed, plus a header line of selectors.
  4. "Download my loaded set" so a team can share one reviewed file.

### MINOR

- **m-1. No inner-layer warning on the IEC pages.** Clearance and creepage are surface/air distances. Conductors on inner layers are separated by solid insulation (distance through insulation), which these pages do not assess. Users will run inner-layer pairs through the clearance page. Fix (ui-engineer): a one-line note on both IEC pages, and a "solid insulation / inner layers: not covered" entry in the limitations.
- **m-2. Overvoltage-category help is minimal.** This is deliberate because of the S-030c CONFLICT. Add a T7 record where the user pastes their product standard's category definitions, shown next to the selector (ui-engineer, calc-implementer).
- **m-3. A T7 of another edition blocks a basic-insulation clearance that does not use T7** (S7, the message names T7). This is conservative but confusing. Only check T7's edition when a T7 rule is actually consulted, including scope rules (calc-implementer).
- **m-4. The refusal for a combination that does not exist (S16) reads as missing data, and the button says "Go to the table import box".** When no column carries that selector combination, say "Your table T8 has no column for component leads with a polymer coating; this combination may not exist in your edition" (ui-engineer).
- **m-5. The edition must be typed exactly.** The panel lists the loaded editions, but the field is free text. Offer the loaded editions as choices, keeping free text (ui-engineer).
- **m-6. Functional insulation uses the basic lookup.** The label says this is conservative, but it oversizes functional gaps on the same side of a barrier, for example DC bus to switch node, which is daily work. Allow a T7 `functional-insulation` rule record when the edition gives one (calc-implementer, later phase).
- **m-7. The waveform choices lack DC + ripple and a unipolar pulse at duty D.** The core already has `dcPlusSine` and `pulseRms`. A unipolar switch node entered as a "symmetric square" overstates RMS (conservative for creepage, but it confuses users). Expose both in `VoltageEntry` (ui-engineer).
- **m-8. No copy block or design-rule export** for the spacing results, unlike Phase 2 pages: no clearance or creepage value to paste into a net-class rule with its basis line. Add a copy block naming the edition, the tables, the signers and "indicative only" when applicable (ui-engineer).

## Checklist answers (phase brief)

- **Required inputs gate the result:** Yes. Every mandatory input has no default; "Insufficient inputs: <list>" gives no number (S21). Altitude needs an explicit 0 m. Field condition, pollution degree and material group have no default.
- **Product-standard warning always visible:** Yes. `SpacingBanners` renders the product-standard callout and the solder-mask note above the form in every state, including needs-input and INSUFFICIENT DATA. On the IPC page the banner text talks about IEC 60664-1. That is acceptable, but a sentence about IPC would read better (see F-8 on the solder-mask contradiction).
- **IPC-2221 not presented as safety insulation:** Yes. There is a separate page, the label "design guideline; not a safety insulation assessment" sits on the page and in the result name, and there is no pollution, material or overvoltage input.
- **Solder mask as coating:** IEC side correct (never credited). IPC side, see F-8.
- **Altitude:** Routed to clearance only. On the creepage page, altitude is ignored with a note. Altitude below T4's first row uses the first row (conservative).
- **Creepage vs clearance:** Creepage is raised to the clearance with a warning. Input linkage is weak, see F-7.
- **Compliance wording:** None found in the spacing code. Results say "indicative only" or "lookups from user-entered tables signed off by ...".
- **Units:** Results are SI internally and rounded up for minimum requirements. Table units are checked against unit-slip windows (mm vs m, kV vs V). mil is accepted at exactly 25.4 µm.

## Owners

| Finding | Severity | Owner |
|---|---|---|
| F-1 | BLOCKER | calc-implementer (+ standards-researcher for the rule text; test-engineer) |
| F-2, F-3, F-4, F-6 | MAJOR | calc-implementer, test-engineer |
| F-5, F-8 | MAJOR | ui-engineer (+ calc-implementer for the new inputs) |
| F-7, F-9 | MAJOR | ui-engineer + calc-implementer |
| m-1 to m-8 | MINOR | as listed |

To close: F-1 must be fixed and re-validated. F-2, F-3 and F-4 should be fixed before PASS-WITH-CONDITIONS. F-5 through F-9 and the MINORs can be logged in `docs/validation/OPEN_RISKS.md` as conditions.

## Sources

- TI SLUAAR5 §2.2, "Circuit Board Insulation Design According to IEC60664 for Motor Drive Application" (reinforced clearance "one step higher in the preferred series"; reinforced creepage twice basic): https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-B1A84E91-DDEE-4C92-A54D-03C5F8DE95DD
- TI AMC1411 datasheet, insulation example (reinforced temporary-overvoltage value "doubled for reinforced isolation", IEC 61800-5-1 context): https://ti.com/document-viewer/AMC1411/datasheet/GUID-E226C2E8-2871-425C-A26D-C554E661C8A1
- IEC 60664-1:2007 store listing (scope: altitude, voltage and rated-frequency limits stated in the abstract): https://shop.standards.ie/en-ie/standards/iec-60664-1-2007-565005_saig_iec_iec_1289053/
- Altair Pollex, IPC material reference (IPC-2221 coated vs uncoated columns, assembly columns): https://help.altair.com/pollex/topics/pollex/verification/dfe_ipc_material_r.htm
- TI E2E, DRV8350R pad spacing vs IPC-2221B (coated-column use in practice): https://e2e.ti.com/support/motor-drivers-group/motor-drivers/f/motor-drivers-forum/976166/drv8350r-pad-spacing-vs-ipc2221-b
- FEDEVEL forum on "permanent polymer coating" = solder resist (secondary, interpretive): https://fedevel.com/forum/schematic-design-pcb-layout/20605-electrical

None of these sources was used to enter or check a table value. They support only the structural findings above. Per the project rules, the rule text in each finding must be confirmed in the licensed edition.
