# Phase 1 task 10: cross-check worksheet (X-01 KiCad, X-03 twc)

Status: infrastructure ready, NO tool has been run. Every `toolOutputs` value in `tests/crosscheck/X-0*.json` is `null`, `toolVersion` and `retrieved` read `TO BE FILLED BY HUMAN`, and the runner reports "0 of 24 cases obtained". Exit criterion of task 10 (every disagreement classified, none left unexplained) is NOT met until a human completes this worksheet.

## 0. Rules that apply to the whole worksheet

- Outputs must come from a REAL run of the tool by a human. Never type a number from memory, from our app, from a screenshot of unknown version, or from this document. A null you cannot fill stays null.
- **Agreement never verifies a ledger row** (CLAUDE.md rule 14, `docs/sources/crosscheck-tools.md` rule 1). A passing record can only say our code reproduces another tool; ledger rows S-001, S-010, S-003 and the rest stay at their status.
- Do not run third-party code without reading it first (CLAUDE.md rule 15). Install or build each tool in a scratch directory OUTSIDE this repository (for example `D:\scratch\xcheck\kicad` and `D:\scratch\xcheck\twc`), never inside `F:\pcb-calc`. Nothing from the tools (source, binaries, screenshots with source text) is committed. Both tools are GPL: values only (CLAUDE.md rule 13).
- Tolerances were chosen before any run and are stated in each record with a reason. Do not change a tolerance after seeing a result. The ONLY permitted pre-run edits are in sections 2.4 and 3.4 (display digits), done and committed BEFORE the first run, and the commit message must say so.
- If our app and the tool disagree beyond tolerance, do not fix by editing the number or the tolerance: report to `calc-validator` and classify (section 5).

Our adapters (`tests/crosscheck/adapters.ts`) use copper THICKNESS in micrometres (35 um, 70 um) in every case, so the foil-weight convention cannot cause a mismatch. KiCad is given the same thickness in mm (0.035, 0.070). twc takes ounces: 1 oz and 2 oz in twc against 35 um and 70 um in ours; the difference this causes is listed in section 4 and is expected.

## 1. Common procedure

1. `git switch` to a scratch branch or work in a copy; edit only `tests/crosscheck/X-0*.json`.
2. Run the tool with the exact entries in the case tables below.
3. For each case copy the displayed value(s) with ALL displayed digits into `toolOutputs` (replace `null` by the number, no rounding, no unit conversion; units are in the key name: `_mm`, `_mil`, `_A`, `_ohm`, `_V`, `_W`). If the tool displays a unit different from the key (for example milliohm), switch the tool display unit if it has a selector, otherwise STOP and ask: do not convert by hand.
4. Fill `toolVersion` and `retrieved` (YYYY-MM-DD) in each file. Add the OS and any non-default settings to `method`. Leave `obtainedBy` as `"human"`.
5. Fill the results table in section 6 from the runner output.
6. Run: `npx --no-install vitest run tests/crosscheck --silent=false` (the `--silent=false` makes the summary lines visible: the runner prints one `0 of N cases obtained` style line per file and a TOTAL line).
7. Classify every failing case (section 5) and write the classification in section 6. A case may stay null if the tool could not produce it: that is reported, not hidden.

## 2. X-01 KiCad pcb_calculator

### 2.1 Version to record

Help > About: the exact version string and the build date, plus OS. KiCad version decides the model (`docs/research/kicad-pcb-calculator.md` section 5, ledger S-011a/b, S-017):

| KiCad | Track Width model | Use for these records |
|---|---|---|
| 7.0, 9.0 stable, 10.0 branch | IPC-2221 (k 0.048 external / 0.024 internal, exponents 0.44 / 0.725) | Yes. This is the model our legacy Mode B implements. |
| master / nightly | Brooks and Adam IPC-2152 fit (internal coefficients by nearest nominal oz) | NO for the trace-width and inverse cases. A master run is a different model; do not record it in `X-01-trace-width.json`. If you only have master, leave those cases null and say so in section 6. The Via and resistance maths are separate and may still be recorded, with the version stated. |

If the version is not on this list (for example a newer stable), read the in-app Track Width help text: it must say IPC-2221 and show `K is 0.024 for internal traces or 0.048 for external traces`. Write the help text you saw into `method`.

### 2.2 Where to get it

Install the official KiCad release into a scratch location outside the repo (installer or portable build from kicad.org), or use an existing installation. Do not copy any KiCad source or binary into `F:\pcb-calc`. Open the stand-alone PCB Calculator.

### 2.3 Cases and exact field entries

Track Width tab. Set every length selector to mm. KiCad shows External and Internal columns side by side; each case names the column to use. Leave "Copper resistivity" untouched and record the value it displays (research note expects 1.72e-8 ohm m). Conductor length: anything (does not affect width or current).

#### X-01-trace-width.json: width from current (type current and temperature rise)

| Case id | Current I [A] | Temp rise [degC] | Thickness H typed in the column [mm] | Column | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|
| kicad-tw-ext-1A-dT10-35um | 1 | 10 | 0.035 | External | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |
| kicad-tw-int-1A-dT10-35um | 1 | 10 | 0.035 | Internal | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |
| kicad-tw-ext-3A-dT20-35um | 3 | 20 | 0.035 | External | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |
| kicad-tw-int-3A-dT20-70um | 3 | 20 | 0.07 | Internal | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |
| kicad-tw-ext-10A-dT30-70um | 10 | 30 | 0.07 | External | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |
| kicad-tw-int-10A-dT30-35um | 10 | 30 | 0.035 | Internal | `width_mm`: width shown in that column, mm, all digits | width_mm 0.00001 |

#### X-01-trace-width.json: current from width (inverse direction; the typed width becomes the bold controlling value)

| Case id | Width W [mm] | Temp rise [degC] | Thickness H [mm] | Column | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|
| kicad-tw-inv-ext-w1.0mm-dT10-35um | 1 | 10 | 0.035 | External | `current_A`: maximum current shown, A, all digits | current_A 0.0001 |
| kicad-tw-inv-int-w2.0mm-dT20-70um | 2 | 20 | 0.07 | Internal | `current_A`: maximum current shown, A, all digits | current_A 0.0001 |

#### X-01-track-resistance.json (Track Width tab, width-driven)

Type the External width (it becomes the controlling value), set the temperature rise to any value (it only sets the current), and read the External column. KiCad shows the current it derived from the width: copy that displayed current into the case `inputs.current_A` (replace `null`) BEFORE running the runner, with all displayed digits. Without it the voltage-drop and power entries cannot be compared; leave those two `toolOutputs` null in that case.

| Case id | Length [mm] | Width W [mm] | Thickness H [mm] | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|
| kicad-tr-L50-W0.5-35um | 50 | 0.5 | 0.035 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed) | resistance_ohm 0.0025; voltage_drop_V 0.0026; power_W 0.0026 |
| kicad-tr-L100-W1.0-35um | 100 | 1 | 0.035 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed) | resistance_ohm 0.0025; voltage_drop_V 0.0026; power_W 0.0026 |
| kicad-tr-L200-W2.0-70um | 200 | 2 | 0.07 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed) | resistance_ohm 0.0025; voltage_drop_V 0.0026; power_W 0.0026 |
| kicad-tr-L10-W0.2-35um | 10 | 0.2 | 0.035 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed) | resistance_ohm 0.0025; voltage_drop_V 0.0026; power_W 0.0026 |
| kicad-tr-L50-W0.5-35um-rho172 | 50 | 0.5 | 0.035 | resistance_ohm (ohm, V, W as displayed) | resistance_ohm 0.0001 |
| kicad-tr-L100-W1.0-35um-rho172 | 100 | 1 | 0.035 | resistance_ohm (ohm, V, W as displayed) | resistance_ohm 0.0001 |

The two `-rho172` cases reuse the SAME tool run as the first two cases above: copy the same displayed resistance. They exist to separate the resistivity constant (we override ours to 1.72e-8 ohm m, which is NOT typed into KiCad) from the geometry and arithmetic.

#### X-01-via.json (Via Size tab)

Set length selectors to mm. Leave the other fields (pad diameter, clearance hole, Z0, plating resistivity, epsilon_r, temperature rise, rise time) at their defaults, and write what they were in section 6. Applied current: 1 A.

| Case id | Finished hole D [mm] | Plating T [mm] | Via length [mm] | Applied current [A] | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|
| kicad-via-D0.4-T35um-L1.6 | 0.4 | 0.035 | 1.6 | 1 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed; switch the tool display unit instead of converting a milliohm value) | resistance_ohm 0.0025; voltage_drop_V 0.0025; power_W 0.0025 |
| kicad-via-D0.3-T25um-L1.6 | 0.3 | 0.025 | 1.6 | 1 | resistance_ohm, voltage_drop_V, power_W (ohm, V, W as displayed; switch the tool display unit instead of converting a milliohm value) | resistance_ohm 0.0025; voltage_drop_V 0.0025; power_W 0.0025 |
| kicad-via-D0.4-T35um-L1.6-rho172 | 0.4 | 0.035 | 1.6 | 1 | resistance_ohm (ohm, V, W as displayed; switch the tool display unit instead of converting a milliohm value) | resistance_ohm 0.0001 |
| kicad-via-D0.3-T25um-L1.6-rho172 | 0.3 | 0.025 | 1.6 | 1 | resistance_ohm (ohm, V, W as displayed; switch the tool display unit instead of converting a milliohm value) | resistance_ohm 0.0001 |

Mapping scope for the via: only Resistance, Voltage drop and Power loss correspond to our via calculator. KiCad also shows thermal resistance, estimated ampacity, capacitance, rise-time degradation, inductance and reactance. They are NOT mapped, because KiCad treats the barrel with an IPC-2221 trace formula for ampacity (research note C-K4), uses Johnson and Graham formulas for the electrical parameters (C-K6), and its thermal-resistance model is not established to be the same as our axial conduction value. Do not add them to the record unless a human first reads the KiCad help text and writes the correspondence into `method`.

### 2.4 Display digits (do this once, BEFORE the first run)

Look at one KiCad result and note how many digits it shows. The shipped tolerances assume: width at least 6 decimals in mm; current and resistance at least 5 significant digits. If the tool shows fewer, recompute BEFORE running with relTol = 0.5 x 10^-d / (smallest displayed value of that output in your cases) for d decimals, or 0.5 x 10^-(s-1) for s significant digits (worst case, mantissa 1), add the derived non-rounding term from the `why` text (for resistance 2.4058e-3), edit the JSON, and commit that edit before running. Write the digits you saw in `method`.

## 3. X-03 twc (IPC-2221 method only)

### 3.1 Version to record

The git commit of the checkout you built, from `git rev-parse HEAD` in the scratch clone. Ledger S-050 pins `308002ff79933fda6a9fb5aa86b889f76c7aedba` (HEAD of main on 2026-10-06, 2025-08-29). Use that commit if you can; if you use another, record it and note that S-050 was read at the pinned commit only.

### 3.2 Where to get it

Clone and build in a scratch directory outside the repo, for example `D:\scratch\xcheck\twc`. Before building, read the build files and the source you will execute (CLAUDE.md rule 15) and note any network or file writes in the worksheet. Do not copy anything from it into `F:\pcb-calc`. Select the IPC-2221 method ONLY.

### 3.3 Cases and entries

twc takes foil weight in oz. I have not run twc or read its interface beyond ledger S-050; use the prompts the tool shows and write the exact field names you used into `method`. If twc asks for ambient or maximum temperature instead of a temperature rise, STOP for that case (do not derive a rise by hand) and leave it null.

| Case id | Current [A] | Temp rise [degC] | Copper [oz] | Layer | Copy into `toolOutputs` | relTol (provisional) |
|---|---|---|---|---|---|---|
| twc-2221-ext-1A-dT10-1oz | 1 | 10 | 1 | external | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |
| twc-2221-int-1A-dT10-1oz | 1 | 10 | 1 | internal | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |
| twc-2221-ext-3A-dT20-1oz | 3 | 20 | 1 | external | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |
| twc-2221-int-3A-dT20-2oz | 3 | 20 | 2 | internal | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |
| twc-2221-ext-10A-dT30-2oz | 10 | 30 | 2 | external | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |
| twc-2221-int-10A-dT30-1oz | 10 | 30 | 1 | internal | width in the unit the tool shows: `width_mil` OR `width_mm` (leave the other null), all displayed digits | 0.001 |

Out of scope: twc methods A, B and C are web-calculator curve fits labelled IPC-2152 (ledger S-050). They are not the model of our legacy Mode B and our Mode A is blocked by open risk R-8. Record no number from them and compare them to nothing.

### 3.4 Display digits and tolerance (BEFORE the first run)

The shipped twc tolerance is a provisional, conservative placeholder (1e-3) because the number of digits twc prints is not known to us. After seeing ONE output, replace it with: 3.43e-5 (foil convention term, section 4) + 0.5 x 10^-d / (smallest displayed width in the file), where d is the number of displayed decimals in the unit you record. Edit all twc `relTol` and `why` accordingly, commit that edit, and only then fill the other cases.

## 4. Differences expected a priori (from our documented formulas and constants; no result of our app is quoted)

| # | Difference | Applies to | Why we expect it | Expected size |
|---|---|---|---|---|
| E1 | Copper resistivity constant | KiCad track resistance, via | Ours is exactly 1/58e6 ohm m (ledger S-004); KiCad uses 1.72e-8 ohm m (research note C-K18). Resistance, voltage drop and power scale with it. | relative 2.4058e-3 (constants only), ours larger |
| E2 | Temperature term | KiCad track resistance, via | Ours carries a linear temperature coefficient (S-004) and is run at 20 degC, where it vanishes. KiCad applies none to the track resistance (research note section 2). For the via, whether KiCad includes its temperature-rise field in R is NOT established: if the via disagrees by more than E1, check this first. | 0 for the track at 20 degC; unknown for the via |
| E3 | Foil weight to thickness | twc only | twc converts 1 oz to 1.378 mil (S-050) = 35.0012 um (1 mil = 25.4 um exactly). We pass 35 um and 70 um. KiCad has no oz input in the version range used, so no difference. | width relative 3.43e-5 (area unaffected) |
| E4 | Displayed digits | all | Tool output is rounded for display; our values are not. | set per record from the digits (sections 2.4, 3.4) |
| E5 | KiCad version model | KiCad trace-width and inverse | Master uses a different fit (S-011a/b). A master run is not comparable with Mode B at all. | not a tolerance matter; do not record |
| E6 | mil and length conversion | KiCad, twc | We use 1 mil = 25.4 um exactly (units table). A tool using a rounded conversion would differ in the last digits. KiCad is consistent with 0.0254 mm per the research note (hand arithmetic, not verification). | below display rounding if both exact |
| E7 | Via model | KiCad via | Ours: a copper annulus of finished diameter d and wall t, one conductor, resistance at the given temperature, no rating. KiCad: not established that the area expression, the length or the temperature handling match; it also treats ampacity, capacitance and so on with other models (not compared). | unknown: a difference larger than E1 is a finding, not an expected value |
| E8 | Inner layer constant | KiCad, twc | Both use k 0.024 internal against 0.048 external (ledger S-001, S-050, research note C-K1). No expected difference; a mismatch on internal cases only points at a layer mapping error in the record. | none |
| E9 | Our extrapolation flags | ours | Cases are inside the S-010 chart range recorded in our calculator, so no flag changes the number. A flag never alters the value; an out-of-domain input returns an error and the adapter throws. | none |

## 5. Disagreement classification (from `docs/sources/crosscheck-tools.md`)

| Situation | Action |
|---|---|
| Our app differs from the tool, and the tool equals the independent oracle (`tools/reference/ref_calcs.py`) | Our bug likely. Owner: `calc-implementer`. |
| Our app equals the oracle, the tool differs | Tool uses a different model or constant. Document the cause (for example a different oz to um conversion). No code change. |
| App, oracle and tool agree | Implementation consistent. Physics still needs a primary source. No ledger change. |
| All three differ | Escalate to `standards-researcher`; ledger row goes to `CONFLICT`. |

To use the table, ask `calc-validator` to run the oracle on the failing case inputs; do not use our app as the oracle.

## 6. Results (fill AFTER the run; empty now)

KiCad version string: ____  OS: ____  Date: ____  Digits shown (width decimals / current and resistance significant digits): ____  Defaults left in the Via tab: ____  Tool resistivity shown: ____

twc commit: ____  Date: ____  Fields as named in the tool: ____  Digits shown: ____

| File | Case id | Obtained (Y/N) | Runner status | relErr from runner output | Classification (section 5) | Cause (E1..E9 or new) | Owner / follow-up |
|---|---|---|---|---|---|---|---|
| X-01-trace-width.json | kicad-tw-ext-1A-dT10-35um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-int-1A-dT10-35um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-ext-3A-dT20-35um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-int-3A-dT20-70um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-ext-10A-dT30-70um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-int-10A-dT30-35um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-inv-ext-w1.0mm-dT10-35um |  |  |  |  |  |  |
| X-01-trace-width.json | kicad-tw-inv-int-w2.0mm-dT20-70um |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L50-W0.5-35um |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L100-W1.0-35um |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L200-W2.0-70um |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L10-W0.2-35um |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L50-W0.5-35um-rho172 |  |  |  |  |  |  |
| X-01-track-resistance.json | kicad-tr-L100-W1.0-35um-rho172 |  |  |  |  |  |  |
| X-01-via.json | kicad-via-D0.4-T35um-L1.6 |  |  |  |  |  |  |
| X-01-via.json | kicad-via-D0.3-T25um-L1.6 |  |  |  |  |  |  |
| X-01-via.json | kicad-via-D0.4-T35um-L1.6-rho172 |  |  |  |  |  |  |
| X-01-via.json | kicad-via-D0.3-T25um-L1.6-rho172 |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-ext-1A-dT10-1oz |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-int-1A-dT10-1oz |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-ext-3A-dT20-1oz |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-int-3A-dT20-2oz |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-ext-10A-dT30-2oz |  |  |  |  |  |  |
| X-03-twc-ipc2221.json | twc-2221-int-10A-dT30-1oz |  |  |  |  |  |  |

Totals: cases obtained ____ of 24; passed ____; failed ____; classified ____; unexplained ____ (must be 0 to close task 10).

Reminder: nothing in this table upgrades any ledger row. S-001, S-010 and S-003 stay PAYWALLED-USER-MUST-VERIFY or CONFLICT as recorded until a primary source says otherwise.

