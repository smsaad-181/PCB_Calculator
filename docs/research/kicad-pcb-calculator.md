# KiCad PCB Calculator: reference-system study

Researcher: standards-researcher agent. Retrieved: 2026-10-06 (all URLs below).
Status: research note, not a ledger entry. Nothing here is `VERIFIED`. KiCad is a cross-check tool (X-01) only. Its documentation and behaviour were read. Its GPL source was read for behaviour in places, and nothing was copied (CLAUDE.md rules 1, 13, 14; `docs/sources/crosscheck-tools.md`).

## 0. Sources and how they were read

| Ref | What | URL | Readable? |
|---|---|---|---|
| K-PDF7 | KiCad 7.0 PCB Calculator manual (PDF, given by the user) | https://docs.kicad.org/7.0/en/pcb_calculator/pcb_calculator.pdf | **No.** The fetcher returned compressed PDF streams (336.6 KB). The local Read tool could not render it because poppler is not installed. Its text content was not read. The HTML version (K-HTML7) was used instead. |
| K-HTML7 | Same manual, HTML | https://docs.kicad.org/7.0/en/pcb_calculator/pcb_calculator.html | Yes |
| K-IMG7 | Screenshots embedded in K-HTML7 (`images/en/{regulators,rfattenuators,eseries,colorcode,transline,viasize,trackwidth,electricalspacing,boardclasses}.png`) | https://docs.kicad.org/7.0/en/pcb_calculator/images/en/ | Yes. Downloaded and viewed as images. These screenshots show the in-app help text and default values. |
| K-HTML9 | 9.0 manual, HTML | https://docs.kicad.org/9.0/en/pcb_calculator/pcb_calculator.html | Yes |
| K-HTML10 / K-HTMLm | 10.0 and master (nightly) manuals | https://docs.kicad.org/10.0/en/pcb_calculator/pcb_calculator.html , https://docs.kicad.org/master/en/pcb_calculator/pcb_calculator.html | Yes |
| K-HELP | In-app help markdown in the source tree (`pcb_calculator/*.md`), branches 9.0, 10.0, master | https://gitlab.com/kicad/code/kicad/-/raw/<branch>/pcb_calculator/tracks_width_versus_current_formula.md (also `iec60664_help.md`, `fusing_current_help.md`) | Yes. Tier 4. |
| K-TREE | GitLab tree API listings of `pcb_calculator/calculator_panels` and `pcb_calculator/transline` for branches 7.0, 9.0, master | https://gitlab.com/api/v4/projects/kicad%2Fcode%2Fkicad/repository/tree?path=pcb_calculator/calculator_panels&ref=<branch>&per_page=100 | Yes. Used only for the tab inventory. |
| K-SRC | GPL source, read for behaviour through a summarizing fetcher (`panel_track_width.cpp`, `panel_via_size.cpp`, `panel_electrical_spacing*.cpp`, `iec60664.cpp`, `transline/*.cpp`) | gitlab.com/kicad/code/kicad/-/raw/<branch>/pcb_calculator/... | Behaviour only. Not copied. The fetcher summarizes, so every claim tagged K-SRC needs a human re-read before anyone relies on it. |
| K-DOX | KiCad doxygen (master, undated build) | https://docs.kicad.org/doxygen/namespaceTRACK__WIDTH__CALCULATIONS.html , https://docs.kicad.org/doxygen/tracks__width__versus__current__formula_8h.html , https://docs.kicad.org/doxygen/common_2transline__calculations_2microstrip_8cpp_source.html , https://docs.kicad.org/doxygen/test__soldermask_8cpp_source.html | Yes. Tier 4. |

**Main finding about the manual:** the user manual is very thin and has barely changed from 7.0 to 9.0, 10.0 and master. Each tab gets 1 to 3 sentences. The manual itself gives no formulas, no units and no limits, except in the Regulators images and the TransLine reference list. All of the substantive content (formulas, k values, limits) is in the **in-app help panels**, which the manual shows only as screenshots. The screenshots are older than the app: they show 9 tabs, while the 7.0 app already had 13 or more panels (§1).

## 1. Scope and tab inventory

The manual's table of contents (K-HTML7, identical headings in K-HTML9, K-HTML10 and K-HTMLm) lists: Regulators, RF-Attenuators, E-Series, Color-Code, TransLine, Via Size, Track Width, Electrical Spacing, Board-Classes.
App panels come from K-TREE (the `panel_*.cpp` file names). They are not shown in any manual.

| Tab / panel | In manual (7/9/10/master) | In 7.0 tree | In 9.0 tree | In master tree | Manual's stated basis |
|---|---|---|---|---|---|
| Regulators | yes | yes | yes | yes | Formula images only (Vout from Vref, R1, R2, and Iadj for the 3-terminal type) |
| RF Attenuators (Pi, Tee, Bridged tee, Resistive splitter) | yes | yes | yes | yes | Formulas shown in the in-app panel (K-IMG7). No paper cited. |
| E-Series | yes | yes (`panel_eseries`) | yes (`panel_eseries_display` + `panel_r_calculator`) | same as 9.0 | In-app help: "E-series are defined in IEC 60063." |
| Color Code | yes | yes | yes | yes | None cited |
| TransLine | yes | yes | yes | yes (math moved to `common/transline_calculations`) | Atwater 1989; Ramo, Whinnery and van Duzer; Kirschning and Jansen 1984; Jansen 1978; March 1981; "heavilly based on Transcalc" |
| Via Size | yes | yes | yes | yes | Manual: none. Source: CircuitCalculator, Johnson & Graham, IPC-2221A (§3) |
| Track Width | yes | yes | yes | yes | Manual: "uses formulas from IPC-2221 (formerly IPC-D-275)". The master **app** now uses the Brooks & Adam IPC-2152 fit (§5). |
| Electrical Spacing | yes (IPC-2221 table) | yes | yes, split into IPC-2221 and **IEC 60664** sub-panels | yes; the IPC sub-panel cites IPC-2221C | Screenshot note: "Values are minimal values (from IPC 2221)" |
| Board Classes | yes | yes | yes | yes | Manual text cites IPC-6011 (classes 1-3) and IPC-6012B (types 1-6). The numeric table has no cited source. |
| Fusing Current | **no** | yes | yes | yes | In-app help only: "should be used as an estimate only" |
| Cable Size | **no** | yes | yes | yes | not found |
| Galvanic Corrosion | **no** | yes | yes | yes | not found (help file exists, not read) |
| Wavelength | **no** | yes (per K-TREE; not seen in a GUI) | yes | yes | not found |
| Coupled stripline (TransLine type) | no | no | no | **yes** (`c_stripline.cpp`) | not cited |

## 2. Per-calculator inputs, outputs and units

Taken from the K-IMG7 screenshots (7.0 docs). The 9.0 and master track-width screenshots have the same byte size (25 KB) and, where viewed, the same content. "Calc" means the panel has a Calculate button. "Live" means it recalculates as you type.

| Tab | Inputs (unit shown) | Outputs (unit) | Mode |
|---|---|---|---|
| Regulators | Type (Standard / 3-terminal); R1 [kΩ], R2 [kΩ], Vout [V] (a radio button selects which one is computed); Vref [V]; Iadj [µA] (3-terminal only); optional regulator data file (Browse, Add/Edit/Remove Regulator) | The selected one of R1/R2/Vout | Calc + Reset to Defaults. Formula shown in the panel: "Vout = Vref * (R1 + R2) / R2" |
| RF Attenuators | Type (radio); Attenuation a [dB]; Zin [Ω]; Zout [Ω] | R1, R2, R3 [Ω]; "Messages" box | Calc. A formula panel per type, e.g. Pi: L = 10^(a/20), A = (L+1)/(L−1), then R1, R2, R3 |
| E-Series | Required resistance [kΩ]; up to 2 excluded values [kΩ]; series E1/E3/E6/E12/E24 | Simple, 3R and 4R solutions with Error [%] | Calc. Help: inputs "from 0.0025 to 4000 kΩ"; parts "between 10Ω and 1MΩ" |
| Color Code | Tolerance group (10%/5% or ≤2%) | Static band chart | Reference only |
| TransLine | Line type (8 radio buttons); substrate: εr, tan δ, ρ [Ω·m], H, H(top), T, Roughness (length units selectable), µ(substrate), µ(conductor); Frequency [GHz, selectable]; physical: W, L (and S for coupled lines) with unit selectors; electrical: Z0 [Ω], Ang_l [rad] | Effective εr, conductor losses, dielectric losses, skin depth (plus mode-specific results) | **Analyze** (physical → electrical, with a down arrow) and **Synthesize** (electrical → physical, with an up arrow). The "..." buttons next to εr, tan δ and ρ open preset material lists. Reset to Defaults. |
| Via Size | Finished hole diameter D, plating thickness T, via length, via pad diameter, clearance hole diameter (all with length unit selectors); Z0 [Ω]; applied current [A]; plating resistivity [Ω·m] (with "..." preset); substrate εr (with "..." preset); temperature rise [°C]; pulse rise time [ns] | Resistance [Ω], voltage drop [V], power loss [W], thermal resistance [°C/W], estimated ampacity [A], capacitance [pF], rise-time degradation [ps], inductance [nH], reactance [Ω] | Live. Shows a dimensioned drawing. Reset to Defaults. |
| Track Width | Current I [A]; temperature rise ΔT [°C]; conductor length (unit selector); copper resistivity [Ω·m], shown greyed with 1.72e-08; External: trace width W, trace thickness H (unit selectors); Internal: W, H | Per layer: width or current (bidirectional), cross-section area [mm²], resistance [Ω], voltage drop [V], power loss [W] | Live and bidirectional. Help text: "The controlling value is shown in bold." |
| Electrical Spacing | Unit selector; "Voltage > 500 V" box | Table: 10 voltage rows by 7 categories (B1-B4, A5-A7) in 7.0 and 9.0 | **Update Values** button |
| Board Classes | Unit selector | Table: Class 1-6 by (line width, min clearance, via diam−drill, plated pad diam−drill, NP pad diam−drill). Note: "Values are minimal values" | Reference only |

**Track width: how layers, ΔT and thickness work** (K-IMG7 help text; K-HELP 9.0 and 10.0, identical)
- External and internal layers are computed **side by side**, each with its own thickness field. The help text says "K is 0.024 for internal traces or 0.048 for external traces".
- ΔT is "temperature rise above ambient in °C". It is a temperature difference, and no ambient temperature is asked for.
- Copper thickness is entered as a **length** (default 0.035 mm), not in oz/ft². No oz→thickness convention is applied by the user, so the 1 oz = 0.035 mm assumption is in the default value. This differs from twc's 1.378 mil/oz (ledger S-050) and from Brooks & Adam's Th table (S-011a).
- Bidirectional: "If you specify one of the trace widths, the maximum current it can handle will be calculated. The width for the other trace to also handle this current will then be calculated."
- Resistance uses fixed ρ = 1.72e-8 Ω·m. A K-SRC comment says resistivity is not adjusted for temperature. There is no conductor-temperature correction.
- Consistency check (my arithmetic, not verification): with I = 1 A, ΔT = 10 °C, H = 0.035 mm, the S-001 formula gives W_ext ≈ 0.3004 mm and W_int ≈ 0.7814 mm. That matches the screenshot values 0.300387 and 0.781437 mm. KiCad (7.0 era) therefore uses exactly k = 0.048/0.024, exponents 0.44/0.725, and 1 mil = 0.0254 mm.

## 3. Formulas, standards and papers cited (candidate ledger rows; ledger NOT edited)

| Cand. | Item | What KiCad states | Where | Action for ledger owner |
|---|---|---|---|---|
| C-K1 | IPC-2221 trace formula | "I = K · ΔT^0.44 · (W · H)^0.725"; K 0.048 ext / 0.024 int; W, H in mils | K-IMG7, K-HELP 9.0/10.0 | Same as S-001. Another tier-4 source, **not independent** (it is a tool, and its text closely follows CircuitCalculator). It does not change the S-001 status. |
| C-K2 | IPC-2221 validity | "valid for currents up to 35 A (external) or 17.5 A (internal), temperature rises up to 100 °C, and widths of up to 400 mils (10 mm)" | K-IMG7, K-HELP 9.0/10.0 | Confirms the S-010 "KiCad legacy help text" (S-010 had it from a search snippet only; now seen directly). The S-010 minor conflict stands: no lower ΔT bound here, against 10 °C at CircuitCalculator. Also note that 400 mil = 10.16 mm, while KiCad writes "10 mm". |
| C-K3 | IPC-2152 fit (master only) | ΔT = K·I^a·W^b·Th^c; external K = 215.3, a = 2, b = −1.15, c = −1.0; internal coefficients per 0.5/1/2/3 oz; "selected from the nearest nominal weight using the supplied thickness"; "IPC-2152 publishes only charts, not equations" | K-HELP master, K-DOX | Already S-011a/b. New detail: internal coefficients are chosen by **nearest nominal weight**, with no interpolation. The thickness→oz mapping used for "nearest" was **not found**. |
| C-K4 | Via ampacity | Via barrel area treated as a trace in IPC-2221 with **external** k = 0.048, b = 0.44, c = 0.725, **still in master** | K-SRC `panel_via_size.cpp` | Not an IPC method for vias. Cited refs: CircuitCalculator "PCB Via Calculator" (2006), TI SLUP230, UltraCAD "Current Carrying Capacity of Vias", IPC-2221A. Note: KiCad's IPC-2221A link points to a third-party copy of the standard (sphere.bc.ca). **Do not use that link.** |
| C-K5 | Via thermal resistance | Thermal resistivity 2.49e-3 m·K/W ("equivalent to thermal conductivity of 401 Watt/(meter-Kelvin)"); refs Goodfellow, EngineeringToolbox | K-SRC | Copper k = 401 W/(m·K) is a candidate constant. It needs tier-1 to tier-3 sources (e.g. CRC Handbook), and the temperature it applies at must be stated. |
| C-K6 | Via capacitance, inductance, rise-time degradation, reactance | Johnson & Graham, *High-Speed Digital Design: A Handbook of Black Magic*, Eqs 7.6, 7.8, 7.9, 7.11 | K-SRC | Textbook (tier 2). The user must check the equation numbers in the book. |
| C-K7 | Microstrip | Manual cites "H. A. Atwater, 'Simplified Design Equations for Microstrip Line Parameters', Microwave Journal, pp. 109-115, November 1989". Master code comments (K-DOX) name Hammerstad-Jensen (filling factor), Wheeler, Kobayashi (εeff dispersion), Kirschning (Z0 dispersion), Pucel/Hammerstad (conductor loss), March 1981 (cover), Bahl-Stuchly 1980, Wan-Hoorfar 2000 (soldermask), Svacina 1992, Garg-Bahl-Bozzi 2024 | K-HTML7, K-DOX | The manual's single citation (Atwater) does not cover the models the code names. Candidate rows for the impedance-models skill: Hammerstad & Jensen 1980, Kirschning & Jansen 1982 (single) / 1984 (coupled), Kobayashi 1988, Wan & Hoorfar 2000. All exact citations still have to be found independently. The KiCad doc does not give them. |
| C-K8 | Microstrip roughness | Conductor loss multiplied by 1 + (2/π)·atan(1.40·(Δ/δ)²) (9.0 K-SRC) | K-SRC | This is the widely cited Hammerstad-Bekkadal (Morgan-type) roughness factor. KiCad does not name it in its comments (not found). Needs a primary source. |
| C-K9 | Coupled microstrip | Kirschning & Jansen, IEEE T-MTT vol. 32 no. 1 pp. 83-90, Jan 1984, doi 10.1109/TMTT.1984.1132616; Jansen, IEEE T-MTT vol. 26 no. 2 pp. 75-82, Feb 1978; March, Microwaves vol. 20 no. 13, Dec 1981 | K-HTML7/9 | Use the DOI to fetch the abstract independently. |
| C-K10 | Rectangular waveguide | Ramo, Whinnery and van Duzer, *Fields and Waves in Communication Electronics*, Wiley-India 2008, ISBN 9788126515257 | K-HTML7 | Textbook (tier 2). |
| C-K11 | Stripline | No citation in the manual. Code: off-centre strip (distance a), two half-impedances combined harmonically, εeff = εr ("no dispersion"), two regimes split at w/spacing 0.35 | K-SRC 9.0 | The model's origin was not found (it resembles the Transcalc/Qucs stripline). |
| C-K12 | Coplanar (with or without ground plane) | No citation in the manual. Code: elliptic-integral conformal mapping, Ghione thickness correction, TE0-cutoff dispersion | K-SRC 9.0 | Candidate: Ghione & Naldi. Citation not given by KiCad. |
| C-K13 | Coax, twisted pair | No citation | K-HTML7 | not found |
| C-K14 | Electrical spacing (IPC) | 7.0/9.0: 10 voltage rows by 7 categories B1-B4, A5-A7, no edition named. Master: categories **B1-B5, A6-A8** (8 columns), comment "These values come from IPC2221C Dec 2023". Above 500 V: the 500 V value plus a per-volt increment times (V − 500). | K-IMG7, K-SRC | **Conflict between KiCad versions.** The category set changed (7 → 8 columns), which suggests IPC-2221C revised the spacing table. PAYWALLED: the user must check the electrical conductor spacing table in IPC-2221B and IPC-2221C (often cited as Table 6-1; verify the number) and its >500 V per-volt rule. Table values are not reproduced here (IPC copyright). |
| C-K15 | Electrical spacing (IEC 60664-1) | 9.0 and master: "IEC60664-1 : 2020-05"; tables A.1, A.2 (altitude), F.1, F.2, F.5, F.8; inputs OVC, PD, material group, altitude, basic/reinforced, rated, peak and RMS voltage; outputs clearance, creepage, min groove width; **step lookup, no interpolation**, returns −1 when out of range | K-SRC, K-HELP | PAYWALLED. Relevant to the `iec60664-gating` skill. Help text warning: "For frequencies higher than 30kHz, the dielectric performances are degraded." |
| C-K16 | Board classes | Manual: IPC-6011 classes 1-3, IPC-6012B types 1-6. Panel: "Class 1..6" geometry minimums with no source | K-HTML7, K-IMG7 | **Internal inconsistency in KiCad:** the panel's 6 numeric classes match neither IPC-6011's 3 performance classes nor IPC-6012's board types. Source of the numbers: **not found**. Do not adopt them. |
| C-K17 | E-series | "E-series are defined in IEC 60063." | K-IMG7 help | Candidate row for `circuit-values`. IEC 60063 is paywalled. |
| C-K18 | Copper resistivity default | 1.72e-8 Ω·m (track width, via) | K-IMG7 | Compare with the ledger copper rows (notes/copper.md). No temperature is stated in KiCad. |
| C-K19 | Fusing current | Energy to reach melting point plus latent heat, compared with I²R energy; "should be used as an estimate only" | K-HELP | Formula and constants not read. Candidate (Onderdonk-type) needs a primary source. |

## 4. Validity limits and warnings that KiCad states

- Track width (IPC-2221 mode, all versions ≤ 10.0): 35 A ext / 17.5 A int, ΔT ≤ 100 °C, W ≤ 400 mil "(10 mm)". This is only **stated in the help text**. K-SRC (master `panel_track_width.cpp`) shows no range check or warning in code. Whether 7.0/9.0 warn when out of range was not determined.
- Track width master (IPC-2152 fit): K-DOX states no validity range.
- Via size: warns when the pad diameter is larger than the clearance diameter (the via cannot then be computed reliably inside a zone) (K-SRC).
- TransLine: "The models implemented are frequency-dependent, so they disagree with simpler models at high *enough* frequencies." (K-HTML9). Master cover/soldermask correction states "0.05 ≤ W/h ≤ 20" (K-DOX). Per-field error status indicators exist (K-SRC). The thresholds were not read.
- Electrical spacing IPC: above 500 V is extrapolated from a per-volt rule. Master enforces 500 V as a floor for the extrapolation input and does not tell the user (K-SRC).
- IEC 60664: >30 kHz degradation; coating reduces distances only "if all conditions specified by IEC60664-3 are met"; PD4 cannot be specified; out-of-table returns −1.
- Fusing current: "estimate only".
- E-series: range 0.0025 to 4000 kΩ.
- **Accuracy:** no tab states a numeric accuracy or tolerance anywhere in the manual or the help texts read. "not found".

## 5. 7.0 vs 9.0 (and 10.0 / master) differences

| Area | 7.0 | 9.0 | 10.0 branch | master (2026-10-06) |
|---|---|---|---|---|
| User manual | 9 sections | **Same text** (only typo-level differences seen) | Same | Same, and still says "IPC-2221" for track width, which is **stale relative to master code** |
| Track width formula | IPC-2221 | IPC-2221 (K-HELP 9.0) | IPC-2221 (K-HELP 10.0) | **Brooks & Adam IPC-2152 fit only**, with no IPC-2221 option (K-SRC); internal coefficients by nearest oz |
| Internal vs external | Fixed 0.5 derating (k 0.024 vs 0.048) | same | same | Separate fits; help says internal traces "are no longer derated by a fixed factor" |
| Via ampacity | IPC-2221 ext k | same | not checked | **Still IPC-2221 ext k**. Inconsistent with master track width. |
| Electrical spacing | IPC-2221 table, B1-A7 | IPC-2221 + **IEC 60664-1:2020** sub-panels | not checked | IPC table becomes B1-B5/A6-A8 citing IPC-2221C Dec 2023 |
| E-series | `panel_eseries` | `panel_eseries_display` + `panel_r_calculator` | not checked | same as 9.0 |
| TransLine | 8 line types | 8 | not checked | + coupled stripline; soldermask cover correction (Wan-Hoorfar) for microstrip, coupled microstrip and CPW; dielectric model selection and frequency-dependent εr reported by fetcher (not confirmed) |

Implication for `crosscheck-tools.md` X-01: its line "9.0 stable uses IPC-2221; the master branch uses the Brooks & Adam IPC-2152 fit" is consistent with this study. Add: the **10.0 branch also uses IPC-2221**, and KiCad docs for 10.0 exist (https://docs.kicad.org/10.0/). Whether KiCad 10.0 is formally released was not checked. Always record the exact KiCad version and the panel help text in a cross-check record.

## 6. UX patterns worth adopting

1. **One tab per calculator**, with the help/formula panel inside the tab next to the inputs (Track Width, RF Attenuators, E-Series). This matches our "formula metadata rendered in UI" rule.
2. **Bidirectional fields with a visible "controlling value"** (bold) in Track Width. Our version should make the solved-for field explicit in `CalcResult.steps`.
3. **Radio button to choose the unknown** (Regulators: R1 / R2 / Vout).
4. **Analyze ↓ / Synthesize ↑** pair for transmission lines.
5. **Per-field unit selectors** on every length input, plus one table-wide unit selector for reference tables.
6. **"..." preset pickers** for εr, tan δ and resistivity (material libraries). For us these should be date-stamped, sourced presets.
7. **Reset to Defaults** per tab. Settings persist between sessions (KiCad stores calculator settings, e.g. `PCB_CALCULATOR_SETTINGS`, per K-DOX).
8. **Dimensioned geometry drawing** next to the inputs (Via Size, TransLine).
9. External and internal results **side by side**, so the user does not have to toggle.
10. Secondary outputs computed for free: R, V drop and P loss next to the width.

## 7. Gaps relative to our SPEC

| Our requirement | KiCad |
|---|---|
| `CalcResult` with method, reference+edition, formula, steps | Formula text in help for some tabs only. No edition (7.0/9.0 just say "IPC 2221"). No step trace. |
| Assumptions list / defaulted inputs | None. Defaults such as ρ = 1.72e-8 and H = 0.035 mm are silent. |
| Rule-based confidence | None |
| Validity checks emitted with the result | Limits only stated in prose. No result-level flag found. IEC 60664 returns −1. |
| Envelope / tolerance (min/typ/max over Cu thickness, etching, εr spread) | None |
| Path/load chain (connector → trace → via → plane) | None. Each tab is isolated. Via current and track current use different methods in master. |
| Fab profiles (date-stamped, user-editable) | None. Board Classes is a fixed unsourced table. |
| Separate ΔT vs absolute temperature dimension | ΔT only, no ambient. Resistance not temperature-corrected. |
| oz/ft² as areal mass | Thickness entered only as length. No oz input. Master maps thickness → nearest oz silently. |
| "Legacy" labelling of IPC-2221 | Not labelled legacy in 7.0/9.0/10.0. Master replaced it silently, with no option to choose. |
| Accuracy statement | None found |
| Unsourced data | Board Classes numbers; electrical-spacing edition missing before master |

## 8. Numerical cross-check candidates (for a human to run; no outputs invented here)

Record per `tests/crosscheck/README.md`: KiCad version string (Help → About), OS, exact inputs with units, all displayed digits, and the panel help-text formula seen. **Run each set in both 9.0 (or 10.0) and a dated master nightly** where the method differs.

| # | Tab | Inputs | Why |
|---|---|---|---|
| T1 | Track Width | I = 1 A, ΔT = 10 °C, H = 0.035 mm both layers, L = 20 mm | Default case. The 7.0 docs screenshot shows W_ext 0.300387 mm and W_int 0.781437 mm (version unknown). Re-run to confirm on a stated version. |
| T2 | Track Width | I = 1, 3, 10, 20 A; ΔT = 10, 20, 45, 100 °C; H = 0.035 mm | Spans the S-010 envelope. Compare against the S-001 oracle. |
| T3 | Track Width | I = 30 A ext, I = 20 A int, ΔT = 100 °C; also W = 12 mm (above 400 mil) | Records whether KiCad warns outside S-010 limits (does int > 17.5 A get flagged?). |
| T4 | Track Width | H = 0.0175, 0.035, 0.070, 0.105 mm (nominal 0.5/1/2/3 oz), I = 2 A, ΔT = 20 °C | In master, tests the per-oz internal fits (S-011b). Compare against the S-011a/b oracle. |
| T5 | Track Width (master) | H = 0.05 mm and 0.09 mm (between nominals), I = 2 A, ΔT = 20 °C | Reveals the "nearest nominal weight" thresholds (not documented). |
| T6 | Track Width | Width-driven: W_ext = 1.0 mm, H = 0.035 mm, ΔT = 10 °C | Inverse direction. Checks that the inverse matches the forward result. |
| V1 | Via Size | Defaults: D 0.4, T 0.035, length 1.6, pad 0.6, clearance 1.0 mm, Z0 50 Ω, 1 A, ρ 1.72e-8, εr 4.5, ΔT 10 °C, rise 1 ns | Baseline for the R, thermal R and Johnson & Graham L/C formulas. |
| V2 | Via Size | D 0.3, T 0.025, length 1.6 mm; D 0.2, T 0.018, length 0.8 mm | Typical fab via sizes. Checks the barrel-area and resistance arithmetic. |
| M1 | TransLine microstrip | εr 4.6, tan δ 0.02, ρ 1.72e-8, H 0.2 mm, H(top) 1e20, T 0.035 mm, roughness 0, f 1 GHz; synthesize Z0 = 50 Ω, then analyze W = 0.2/0.35/1.0 mm | Default set (K-IMG7). Compare with Qucs-S (X-02) and the oracle's Hammerstad-Jensen. |
| M2 | TransLine microstrip | Same as M1 with T = 0 and f = 1 MHz | Isolates the static model from thickness and dispersion corrections. |
| M3 | TransLine microstrip (master) | M1 with a soldermask layer enabled (e.g. 25 µm, εr 3.5) | Records the size of the Wan-Hoorfar correction, so it does not get confused with model error. |
| S1 | TransLine stripline | εr 4.3, H (plane spacing) 0.5 mm, strip centred (a = (H−T)/2), T 0.035 mm, W 0.15/0.25 mm, f 1 GHz | Symmetric stripline. Compare with the oracle. |
| S2 | TransLine stripline | As S1, off-centre (a = 0.1 mm) | Asymmetric case. |
| C1 | TransLine CPW and grounded CPW | εr 4.5, H 1.6 mm, W 1.0 mm, gap 0.2 mm, T 0.035 mm, f 1 GHz | Checks the conformal-mapping implementation. |
| R1 | RF Attenuators | Pi and Tee, a = 3, 6, 10, 20 dB, Zin = Zout = 50 Ω | Closed-form. Our oracle should match exactly. |
| G1 | Regulators | Standard, Vref 1.25 V, R1 240 Ω → Vout 5 V; 3-terminal with Iadj 50 µA | Closed-form check. |
| E1 | Electrical Spacing | Voltage > 500 V box: 600, 1000, 2000 V | Records the per-volt extrapolation in 9.0 and master (B-set changed). **Do not commit IPC table values into the repo beyond what the user decides the copyright policy allows.** |
| I1 | IEC 60664 (9.0+) | 230 V RMS, OVC II, PD2, MG IIIa, 2000 m, basic and reinforced | Records the lookup steps. The result must be judged against the standard by the user, not against KiCad. |

Reminder: none of these runs can upgrade a ledger row (crosscheck-tools.md, rule 1).
