# Reference systems survey: calculators comparable to JLCPCB and KiCad PCB Calculator

Retrieved: 2026-10-06 (all URLs below, unless a different date is stated).
Author: standards-researcher agent (reference-system research, not ledger work).
Scope: what other tools offer, how they show assumptions/validity, and where they go wrong.
Companion files (written by other agents, not duplicated here): `docs/research/jlcpcb.md`, `docs/research/kicad-pcb-calculator.md`.

**Rules respected.** No third-party code was copied or run. Nothing here is a source of truth for a constant
(CLAUDE.md rules 1, 13, 14). Tool behaviour is described, not reproduced. Quotes are short (under 15 words).
**Caveat:** most page text was retrieved through a summarizing fetcher. Quotes are what the fetcher returned
as verbatim. Re-check any quote on the live page before using it in a ledger row or a public document.
"not found" means searched and not found. "?" in the matrix means not checked or could not be confirmed.

---

## 1. Systems surveyed (21)

| # | System | Vendor / author | Type | Openness |
|---|---|---|---|---|
| 1 | JLCPCB Impedance Calculator | JLCPCB | Web, fab-locked | Proprietary |
| 2 | KiCad PCB Calculator | KiCad project | Desktop, part of EDA | GPL-3.0-or-later |
| 3 | Saturn PCB Toolkit v8.47 | Saturn PCB Design | Windows desktop | Freeware, closed |
| 4 | Sierra Circuits / ProtoExpress tools | Sierra Circuits | Web suite | Proprietary, free |
| 5 | Altium (resources.altium.com calculators + Layer Stack Manager) | Altium / Z. Peterson | Web articles + EDA | Proprietary |
| 6 | Digi-Key conversion calculators | Digi-Key | Web suite | Proprietary, free |
| 7 | Advanced Circuits (4pcb) trace width | Advanced Circuits | Web | Proprietary, free |
| 8 | Eurocircuits impedance calculator | Eurocircuits | Web, in PCB Visualizer | Customers |
| 9 | Polar Instruments Si9000e (+Si8000m, Speedstack) | Polar Instruments | Windows field solver | Commercial |
| 10 | Rogers MWI online calculator | Rogers Corp. | Web (login) | Proprietary, free |
| 11 | Cadence AWR TX-LINE | Cadence (AWR) | Windows desktop | Free, closed |
| 12 | Qucs-S `qucs-transcalc` | Qucs-S project | Desktop | GPL-2.0 |
| 13 | NinjaCalc (now blog.mbedded.ninja) | G. Hunter | Web (React/Next.js) | Repo deprecated; license not shown |
| 14 | SMPS.us PCB trace calculator | smps.us | Web | Proprietary |
| 15 | twc | ymic9963 | C CLI | GPL-3.0 |
| 16 | rf-tool | E. Buer | Python library/CLI | GPL-3.0 |
| 17 | weeks | O. Saether | C CLI (PEEC) | MIT |
| 18 | LearnEMC / Missouri S&T EMC Lab PCB-TL calculators | LearnEMC LLC / MST | Web | Proprietary |
| 19 | Omni Calculator PCB impedance | Omni Calculator | Web | Proprietary |
| 20 | TI ANALOG-ENGINEER-CALC and VOLT-DIVIDER-CALC | Texas Instruments | Windows + web JS | Proprietary, free |
| 21 | Electrodoc (formerly ElectroDroid) | iodema srl | Android app | Free + PRO |

Also checked, with little or nothing to record:
- **PCBWay**: no PCBWay-hosted calculator found. Its blog post (2014-03-07) describes an IPC-2221 JS calculator with the 4pcb formula.
- **EEWeb**: no current EEWeb calculator found by search on 2026-10-06. Not asserted either way.
- **Würth Elektronik**: no public PCB impedance calculator found. Only a CBT webinar PDF on impedance-matched boards.
- **Mouser**: not checked (time).
- **Microchip / ADI** feedback calculators: not checked. TI is used as the representative vendor.
- **Zuken / Cadence Sigrity / Ansys Q2D**: commercial EDA field solvers. Not surveyed in detail because there are no public pages with accuracy statements.
- **Small GitHub web apps**: GitHub search for "pcb calculator trace width" returned 18 repos (2026-10-06). The top one by stars was twc (7 stars). Examples:
  - `Sakamoto-media/pcb-trace-width-calculator`: a single index.html; its description claims IPC-2221 "規格準拠" (standard-compliant).
  - `Ux-Geek/PCB-Trace-Calculator`: React/TS/Vite, generated from a Google AI Studio template, and needs a `GEMINI_API_KEY` to run locally.
  - Neither states validity limits.

---

## 2. Per-system notes

### 2.1 JLCPCB Impedance Calculator (brief; detail in `jlcpcb.md`)
- URL: https://jlcpcb.com/pcb-impedance-calculator. Guide: https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator
- **Computes:** "track width values and recommended stack-ups". Targets are 20–90 Ω single-ended and 50–150 Ω differential.
- **Structures:** coplanar and non-coplanar, single-ended and differential.
- **Stackups:** fixed JLCPCB stackups and materials (NP-155F for 4–8 layers; S1000-2M for 10+ layers).
- **Units:** mm, mil, µm, inch.
- **Solver:** not stated in the guide.
- **Disclaimer:** values are "for reference only" and "may be adjusted in the future".
- **Notes:** the guide says inner copper is thinner than nominal after deoxidation, but the fetched text gave no number.
- **Strength:** synthesis that is tied to a real, orderable stackup.
- **Weakness:** locked to one fab, the model is opaque, and there are no validity or accuracy statements.

### 2.2 KiCad PCB Calculator (brief; detail in `kicad-pcb-calculator.md`)
- URL: https://docs.kicad.org/9.0/en/pcb_calculator/pcb_calculator.html
- **Tabs in the docs:** Regulators, RF-Attenuators, E-Series, Color-Code, TransLine, Via Size, Track Width, Electrical Spacing, Board-Classes.
- **Track width:**
  - 9.0 docs: "uses formulas from IPC-2221 (formerly IPC-D-275)".
  - Master doxygen (https://docs.kicad.org/doxygen/tracks__width__versus__current__formula_8h.html): "closed-form equations fit by Douglas Brooks and Johannes Adam".
  - So the same tab changes its model between versions.
- **Strength:** broad, offline, open.
- **Weakness:** the method changes by version, and the docs give no validity limits.

### 2.3 Saturn PCB Toolkit (studied in detail)
- **URL:** https://saturnpcb.com/saturn-pcb-toolkit/. Version 8.47. No release dates are shown in the revision notes.
- **License and platform:** freeware, Windows only. The page notes it "does not use JAVA" (Log4j).
- **Calculators:**
  - Impedance: microstrip/stripline and many differential pair forms.
  - Via current and properties.
  - Conductor (trace) width and resistance.
  - Planar inductors.
  - Padstack and BGA land.
  - Crosstalk.
  - Bandwidth and maximum trace length.
  - Wavelength.
  - Thermal resistance.
  - Embedded resistor.
  - Fusing current.
  - PDS impedance.
  - Conductor spacing.
  - Wire gauge and drill charts.
  - Ohm's law and reactance.
  - Conversions.
- **Standards named:**
  - IPC-2152 "with and without modifiers".
  - IPC-2221A is still selectable.
  - Spacing was updated to IPC-2221C (v8.44).
  - Impedance per IPC-2251 and Wadell. v8.0 adds "option to select between default asymmetrical stripline formula and the IPC and Wadell formulas".
- **Accuracy:** "All values are within +/-10% of the chart values" (IPC-2152 multipliers, v5/v8).
- **Method change:** v8.0 "Replaced cross sectional area multipliers with polynomials to reduce step errors". So Saturn's IPC-2152 mode is its own curve fit, not the standard's charts.
- **Marketing claim:** "All online calculators that use the IPC-2221 formula are now obsolete!!!"
- **Revision log, which is the most useful evidence in this survey.** A public log of calculation fixes:
  - Unit and locale bugs:
    - "Fixed Temprise C vs. F scale" (v5.1)
    - "Fixed Temprise F scale" (v5.2)
    - "Corrected a /1000 error in the Signal Calculator for Inches" (v6.63)
    - "Corrected DC resistance error in metric mode" (v5.71)
    - "Fixed Via Inductance output in Imperial mode" (v6.6)
    - "Corrected comma as dp issues" (v8.20)
    - "Corrected the V8.08 metric error" (v8.09)
  - Formula bugs:
    - "Corrected cross sectional area computation error in the conductor calculator" (v8.21)
    - "Fixed incorrect current density calculation" (v8.42)
    - "Corrected S/H and W/H formula for the Edge Coupled Embedded differential pair" (v6.81)
    - "Changed the microstrip impedance calculator formula" (v6.82)
  - Data and preset bugs:
    - "Corrected USB 2.x target impedance" (v8.10)
    - "Corrected value of 0-15V and 16-30V in the B4 selection" (v8.23)
  - Robustness bugs:
    - "Fixed an invalid floating point error when Er = 1" (v6.86)
    - "Corrected improper location of 'Invalid' flag" (v5.4)
- **Strengths:** the widest feature set of any free tool, offline, and an honest changelog.
- **Weaknesses:** Windows only, closed, model provenance only partly documented, and a long history of unit-conversion bugs.

### 2.4 Sierra Circuits / ProtoExpress (studied in detail)
- **Trace width:** https://www.protoexpress.com/tools/trace-width-and-current-capacity-calculator and https://www.protoexpress.com/pcb/trace-width-calculator/
  - Inputs: layer internal/external; ambient (default 25 °C); copper oz; "any two" of ΔT, width, current; length (default 1 in).
  - Advanced inputs: PCB thickness, material, thermal conductivity, plane thickness, board dimensions, layer type, copper area %, separation, and a **safety factor defaulting to 40 %**.
  - Outputs: width, R at ambient and at elevated temperature, voltage drop, power loss, maximum temperature.
  - Method: "curve-fitting equations based on IPC-2152 graphical data". **No equations are shown.**
  - twc notes that Sierra uses "a wrong resistivity value". This is secondhand (twc METHODS.md, see `docs/sources/notes/ipc2152.md`) and was not confirmed by us.
- **Impedance:** https://www.protoexpress.com/tools/impedance-calculator
  - "82 impedance calculators", using a "2D numerical solution of Maxwell's equations".
  - Outputs: Z, insertion/dielectric/conductor loss, NEXT/FEXT, L, C, delay, εeff, coupling, and even/odd mode values.
  - Units: mil, inch, mm, cm, µm.
  - Linked to a Stackup Designer and a material library.
  - The page says "most free online impedance calculation tools are generally not accurate".
- **Other tools:** via impedance; via current capacity and temperature rise; via thermal resistance; conductor spacing and voltage (based on IPC-2221B Table 6-1, per search snippet: https://protoexpress.com/tools/pcb-conductor-spacing-and-voltage-calculator); signal and plane layer estimator; PDN Analyzer (target impedance, capacitor selection).
- **Third-party review:** Bogatin (SI Journal, https://www.signalintegrityjournal.com/blogs/4-eric-bogatin-signal-integrity-journal-technical-editor/post/2436-sierra-circuits-releases-a-free-online-2d-field-solver, date not found) said 2D solvers are "generally accurate to better than 1%".
- **Strengths:**
  - Solve any of the three variables.
  - Rich secondary outputs.
  - A free field solver.
  - Fab-grade material data.
- **Weaknesses:**
  - Hidden fit equations.
  - Hidden defaults that change the answer (40 % safety factor, 1 in length).
  - No validity ranges stated on the page.

### 2.5 Altium (web calculators and Layer Stack Manager)
- **IPC-2152 article/calculator** (Z. Peterson, 2019-01-04, updated 2022-12-04): https://resources.altium.com/p/using-ipc-2152-calculator-designing-standards
  - "there is no explicit formula". The calculator uses the SMPS.us interpolation, shown as an image.
  - Stated limits: traces more than 1 in apart; no heat sinks or enclosure conduction; tends to "overestimate the PCB trace width".
- **IPC-2221 calculator** (2022-12-10, updated 2025-06-26): https://resources.altium.com/p/ipc-2221-calculator-pcb-trace-current-and-heating
  - Notes that IPC-2221 results are "very conservative" on modern boards.
- **Microstrip calculator** (2022-02-09, updated 2026-03-13): https://resources.altium.com/p/microstrip-impedance-calculator
  - Uses Wadell. Says IPC-2141 results "are known to be inaccurate".
  - Lossless only: no dispersion, solder mask or etch.
- **Clearing up impedance formulas** (updated 2026-09-05): https://resources.altium.com/p/clearing-up-trace-impedance-calculators-and-formulas
  - Says IPC-2141 microstrip is "less accurate" than Wheeler.
  - Reports an apparent error in a Polar article's Wheeler equation ("redundant square root").
- **Layer Stack Manager:** uses the Simbeor 2D quasi-static MoM solver, with roughness, etch and wideband Debye dispersion.
  - The KB https://www.altium.com/documentation/knowledge-base/altium-designer/validate-transmission-impedance-computed-in-layer-stack explains why it differs from web calculators: closed-form vs field solver, solder mask and surface finish toggles, reference-plane setup.
  - The KB advises: "consult your board fabricator upfront".
- **IPC-2221 HV clearance article** (2020-01-17, updated 2025-09-09): https://resources.altium.com/p/using-an-ipc-2221-calculator-for-high-voltage-design
  - Does **not** separate IPC-2221 spacing from safety insulation standards (IEC 60664 / 62368 / UL).

### 2.6 Digi-Key conversion calculators
- **Index:** https://digikey.com/en/resources/online-conversion-calculators
  - PCB trace width and trace impedance.
  - Ohm's law; voltage and current divider.
  - Series/parallel R and C; resistor colour and SMD codes.
  - Reactance; LP/HP filter; LED series resistor; time constant; capacitor discharge.
  - 555; attenuator; three-phase.
- **Trace width:** https://www.digikey.com/en/resources/conversion-calculators/conversion-calculator-pcb-trace-width
  - IPC-2221, with k = 0.024/0.048, b = 0.44, c = 0.725 printed.
  - Inputs accept oz/ft², mil, mm or µm, and **temperature rise in °C or °F**.
  - Outputs internal and external widths, R, drop and power.
  - "The results are estimates; actual results may vary."
  - Whether ΔT in °F is converted as a difference (×5/9, no offset) was not tested (we did not run the page).
- **Impedance:** https://www.digikey.com/en/resources/conversion-calculators/conversion-calculator-pcb-trace-impedance
  - IPC-2141, seven structures, solve for Z or for width.
  - **Enforces validity ranges:** "(w/h) only valid from 0.1 to 2.0", "(t/h) only valid up to 0.25".
  - Recommends field solvers for loss, dispersion and roughness.
- **Strengths:** unit dropdowns on every field, explicit validity messages, formula constants printed.
- **Weakness:** IPC-2221/2141 only.

### 2.7 Advanced Circuits (4pcb) trace width
- **URL:** https://www.advancedpcb.com/en-us/tools/trace-width-calculator/ (4pcb.com redirects here).
- **Method:** prints the IPC-2221 equations in full, including "Thickness[oz]*1.378[mils/oz]".
- **Stated range:** "up to 35 Amps, up to 0.4 inches of trace width, from 10 to 100 degrees C of temperature rise, and copper of 0.5 to 3 ounces per square foot".
- **Behaviour outside that range:** it extrapolates beyond these limits rather than blocking. PCBWay's 2014 description of the same calculator says it "will simply extrapolate".
- **Strength:** the most transparent formula display of all the trace-width tools.
- **Weakness:** silent extrapolation.

### 2.8 Eurocircuits impedance calculator
- **URL:** https://www.eurocircuits.com/blog/defined-impedance-calculators/ (2022-02-10).
- **Access:** for customers, inside PCB Visualizer.
- **Data:** stackup-driven; εr "will change depending upon the selected frequency".
- **Accuracy claim:** "Measured values on the PCB are within a ±10%" of calculated values.
- **Notable:** says calculators "cannot take in to account" process tolerances.
- **Strength:** frequency-dependent Dk from the fab's own data, and a measured-accuracy claim.

### 2.9 Polar Instruments Si9000e / Si8000m / Speedstack
- **URLs:** https://www.polarinstruments.com/products/si/Si9000.html and https://www.polarinstruments.com/products/si/help/calculationmethods.htm
- **Solver:** boundary element method; "over 100 structures"; RLGC and S-parameters from about 1 kHz upward.
- **Roughness models:** "Huray / Canonball / Gradient" plus Hammerstad & Groisse.
- **Platform:** Windows, commercial. Pairs with the Speedstack stackup tool.
- **Role:** the de-facto fab and OEM reference for controlled impedance.
- **Not stated:** no accuracy figure on the pages we fetched.

### 2.10 Rogers MWI online calculator
- **Blog:** https://rogerscorp.com/blog/2020/new-online-microwave-impedance-calculator (2020-10-13).
- **Tool:** https://www.rogerstechub.com/tools/mwicalculator.php (login required, free account).
- **Model:** "well known closed form equations".
- **Outputs:** impedance; conductor and dielectric loss; wavelength; skin depth; thermal rise above ambient.
- **Not documented on the pages fetched:** models by name, roughness model.

### 2.11 Cadence AWR TX-LINE
- **Status:** free and Windows-only, per search results. The official page returned HTTP 403 to the fetcher.
- **Structures:** microstrip, stripline, CPW, grounded CPW, slotline, coupled MS/SL. Both analysis and synthesis.
- **Not found:** a model reference or accuracy statement.

### 2.12 Qucs-S transcalc
- **URL:** https://github.com/ra3xdh/qucs_s
- **License:** GPL-2.0.
- **Contents:** the repo contains `qucs-transcalc`, `qucs-filter`, `qucs-attenuator` and `qucs-powercombining`.
- **Model detail:** see `crosscheck-tools.md` X-02.

### 2.13 NinjaCalc / mbedded.ninja
- **Repo:** https://github.com/gbmhunter/NinjaCalc. Deprecated: "All calculators have been ported to blog.mbedded.ninja/calculators/".
- **Stack and license:** Next.js/React, Jest tests, GitHub Actions. License not visible to the fetcher.
- **IPC-2152 track current:** https://ninjacalc.mbedded.ninja/calculators/electronics/pcb-design/track-current-ipc2152 (now redirects).
  - Inputs: ΔT, thickness, board thickness, plane proximity, thermal conductivity. The default k ≈ 0.20 W/m·K comes from a search snippet.
  - Its constants are what twc Method A copies (see `notes/ipc2152.md`).
- **Other calculators:** IPC-2221A track current, microstrip impedance, 555, cable gauge.
- **Not found:** a calculator index (the blog page returned 404).

### 2.14 SMPS.us
- **URL:** https://www.smps.us/pcb-calculator.html
- **Formula shown:** "Acsq.mil=(117.555×∆T^-0.913+1.15)×i^(0.84×∆T^-0.108+1.159)".
- **Basis:** fitted to "IPC-2152 Figure 5-2" (polyimide, 0.070 in, 3 oz). It applies this single-figure fit generically.
- **Credit:** coefficients credited to Jack Olson (Caterpillar).
- **Results:** shows four side by side: Universal, Revised, IPC-2221 external, IPC-2221 internal.
- **Limits stated:** tests up to 30 A and ΔT 100 °C; traces more than 1 in apart; "there is always some inaccuracy".
- **Conflict:** the coefficients in the SMPS source code (as copied by twc) differ from the website's (ledger S-011c, see `notes/ipc2152.md`).

### 2.15 twc
- **URL:** https://github.com/ymic9963/twc
- **License and form:** GPL-3.0, C CLI.
- **Methods:** IPC-2221 plus three "IPC-2152" methods. All three are third-party curve fits (ledger S-050).
- **Units:** "Accepts SI prefixes on all SI units", both metric and imperial.
- **Outputs:** width, R, drop, power.
- **Disclaimer:** "provided with no liability whatsoever".
- **Last commit:** 2025-08-29.

### 2.16 rf-tool
- **URL:** https://github.com/ErikBuer/rf-tool
- **License and form:** GPL-3.0, Python.
- **Impedance:** microstrip using Hammerstad-Jensen, plus Yamashita and Kirschning-Jansen dispersion.
- **Other:** radar and comms utilities.
- **Interface:** library/CLI, not a web app.

### 2.17 weeks
- **URL:** https://github.com/osaether/weeks
- **License and form:** MIT, C.
- **Method:** PEEC R/L matrices after Weeks et al., IBM J. Res. Dev. 23(6), 1979. Also outputs Z0 and attenuation.
- **Input:** YAML.

### 2.18 LearnEMC / Missouri S&T EMC Lab
- **URLs:** https://learnemc.com/ext/calculators/pcb-tl/microstrip.html and https://emclab.mst.edu/resources/tools/pcb-trace-impedance-calculator/microstrip/
- **Formulas:** from IPC-2251 (Feb 2001 draft).
- **Validity:** "0.1< w/h < 3.0; 1 < εr < 15".
- **Accuracy:** a **published accuracy-vs-field-solver table by w/h band**, from within 2 % (0.2 < w/h < 1.5) up to 15 % at the extremes, for εr = 4, h = 30 mil, t = 1.37 mil.
- **Units:** selectable for each output.
- **Assessment:** the best-practice example of stating accuracy by validity sub-range.

### 2.19 Omni Calculator
- **URL:** https://www.omnicalculator.com/other/pcb-impedance
- **Structures:** eight, citing IPC-2141A (2004).
- **Credits:** named author and reviewer.
- **Not found:** the formulas (the page says equations are in the cited literature) and validity ranges.

### 2.20 TI calculators
- **ANALOG-ENGINEER-CALC:** https://www.ti.com/tool/ANALOG-ENGINEER-CALC
  - Windows installer.
  - "Gain selections using standard resistors".
  - Dividers, filters, noise, ADC/DAC, sensors.
  - "PCB parasitic calculations (e.g., R, L, and C)".
- **VOLT-DIVIDER-CALC:** https://www.ti.com/tool/VOLT-DIVIDER-CALC
  - "KnowledgeBase JavaScript utility", released 2024-08-23.
  - The E-series used and tolerance handling are not stated on the page.

### 2.21 Electrodoc (ElectroDroid)
- **Source:** app-store and review pages only. The vendor page was not fetched.
- **Calculators:** resistor and inductor colour codes, SMD codes, Ohm's law, reactance/resonance, divider, LED resistor, op-amp, battery life, PCB trace width.
- **Model:** free + PRO, mobile offline.
- **Not found:** the method behind its trace width calculation.

---

## 3. Feature matrix

Key:
- Y = offered.
- P = partial, as noted.
- N = not offered (checked).
- ? = not checked or could not be confirmed.

Columns: JLC = JLCPCB, KiC = KiCad 9, Sat = Saturn, Sie = Sierra, Alt = Altium (web + LSM), DK = Digi-Key, AC = Advanced Circuits, Euro = Eurocircuits, Pol = Polar Si9000e, Rog = Rogers MWI, TXL = TX-LINE, Qucs = Qucs-S transcalc, Nin = NinjaCalc, SMPS, twc, rft = rf-tool, wks = weeks, MST = LearnEMC/MST, Omni, TI, EDoc = Electrodoc.

| Objective | JLC | KiC | Sat | Sie | Alt | DK | AC | Euro | Pol | Rog | TXL | Qucs | Nin | SMPS | twc | rft | wks | MST | Omni | TI | EDoc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Routing impedance family (MS/SL/diff/CPW) | P¹ | Y | Y | Y (FS) | Y (FS) | Y (2141) | ? | P² | Y (FS) | Y | Y | Y | P | ? | N | P (MS) | P | P (MS checked) | Y (2141A) | N | ? |
| Trace width/current: IPC-2221 legacy | ? | Y (9.0) | Y | N | Y | Y | Y | ? | N | N | N | N | Y | Y | Y | N | N | ? | ? | ? | Y |
| Trace width/current: IPC-2152-based | ? | P (master, Brooks-Adam fit) | Y (own fit) | Y (own fit) | Y (SMPS fit) | N | N | ? | N | N | N | N | Y (own fit) | Y (Olson fit) | Y (3 fits) | N | N | ? | ? | ? | ? |
| Trace resistance / self-heating | ? | P (R only) | P (R) | P (R at elevated T, no loop) | ? | P (R) | P (R) | ? | N | ? | N | N | ? | N | P (R) | N | P (R(f)) | N | ? | ? | ? |
| Voltage drop / power | ? | ? | P | Y | ? | Y | Y | ? | N | N | N | N | ? | N | Y | N | N | N | ? | ? | ? |
| Via electrical & thermal | ? | Y | Y | Y (3 tools) | ? | N | ? | ? | N | N | N | N | ? | N | N | N | N | ? | ? | N | ? |
| Annular ring / drill | ? | P (board classes) | P (padstack/BGA) | ? | ? | N | ? | ? | N | N | N | N | ? | N | N | N | N | N | N | N | ? |
| Path/load chain, weakest link | N | N | N | N³ | N³ | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| Circuit values (divider, feedback, LED, RC/LC, E-series) | N | Y (regulator, E-series) | P (Ohm, reactance) | N | ? | Y | N | N | N | N | N | N | P (555 etc.) | N | N | N | N | N | ? | Y | Y |
| Spacing / creepage | ? | P (IPC-2221) | P (IPC-2221C) | P (IPC-2221B T6-1) | P (articles) | N | ? | ? | N | N | N | N | ? | N | N | N | N | N | N | N | ? |
| Stackup editor | P (pick fixed) | N | N | Y | Y | N | N | P (pick) | Y (Speedstack) | ? | N | N | N | N | N | N | N | N | N | N | N |
| Protocol presets (USB/HDMI/Eth/DDR) | ? | N | P⁴ | ? | ? | N | N | ? | ? | N | N | N | N | N | N | N | N | N | N | N | N |
| Fab profiles | Y (own, locked) | N | N | P (own materials) | N | N | N | Y (own, locked) | P (material libs) | P (Rogers materials) | N | N | N | N | N | N | N | N | N | N | N |
| States validity ranges | N | ? | P | N | P | **Y (enforced)** | P (states, then extrapolates) | N | ? | ? | ? | ? | ? | Y | N | ? | ? | **Y + accuracy bands** | N | ? | ? |
| Shows formula/steps | N | P (docs) | N | N | P (image) | Y (constants) | Y | N | N (numeric) | N | N | P (source) | ? | Y | P (source) | P (source) | P (source) | Y | P | ? | ? |
| Offline / open source | N/N | Y/Y | Y/N | N/N | P/N | N/N | N/N | N/N | Y/N | N/N | Y/N | Y/Y | N/? | N/N | Y/Y | Y/Y | Y/Y | N/N | N/N | P/N | Y/N |

Notes:
1. JLC: single-ended and differential, coplanar and non-coplanar, on JLC stackups only.
2. Eurocircuits: customers only, within its buildups.
3. Sierra and Altium do PDN analysis (AC target impedance, or IR drop in EDA). That is not a DC chain weakest-link calculator.
4. Saturn: evidence is "Corrected USB 2.x target impedance". The full preset list was not seen.

"FS" = 2D field solver.

---

## 4. Synthesis

### (a) Table-stakes features (every serious tool has them)
1. **Impedance analysis and synthesis.** Solve Z from geometry, or width from Z, for microstrip, stripline and edge-coupled differential at minimum (KiCad, Saturn, Sierra, DK, Omni, TX-LINE, JLC).
2. **IPC-2221 trace width with internal and external results**, plus R, voltage drop and power from the same inputs (DK, AC, Sierra, twc, KiCad).
3. **Unit choice for each field**: mil/mm/µm/in, oz or thickness, °C/°F (DK, Sierra, JLC).
4. **An "IPC-2152" option** in every trace tool updated since about 2015. It is always a third-party fit, never the standard's charts.
5. **Via current/thermal and a basic spacing table** (KiCad, Saturn, Sierra).
6. **A disclaimer** that results are estimates or "for reference only" (DK, JLC, SMPS, twc, AC).

### (b) Differentiators we already plan (no surveyed tool has them)
- **Rule-based confidence.** Nobody rates confidence. MST publishes accuracy bands; we can turn such bands into confidence inputs.
- **Ledger traceability for every constant.** No tool links its constants to a dated source with a status. Saturn's changelog is the closest.
- **ΔT vs absolute T as separate dimensions.** Saturn's log shows two releases fixing "Temprise C vs. F scale". DK accepts ΔT in °F. This is a real bug class.
- **Self-heating solver with runaway detection.** Sierra reports R at elevated temperature, but there is no evidence of an iterated R(T)–ΔT loop anywhere.
- **Min/typ/max envelope and sensitivity.** Not found in any free tool. Polar has goal-seek, but no envelope was seen.
- **Path/load weakest-link chain.** Not found anywhere. This is unique.
- **Mode A / Mode B side by side, each labelled.** SMPS does show four methods side by side. That supports our design, and SMPS is the only precedent.
- **Compliance-wording gate.** Hobby tools claim compliance freely (Sakamoto-media: IPC-2221 "規格準拠", i.e. standard-compliant). Commercial tools avoid the word.

### (c) Features users commonly want that are NOT in our phases
| Feature | Seen in | Justification / suggestion |
|---|---|---|
| **2D field solver** for impedance | Sierra (free), Altium, Polar, Eurocircuits | Closed forms "can be off by more than 20%" for differential pairs and extreme geometry (Bogatin). This is out of scope (bundle budget, verification burden). Keep closed form with stated accuracy, and **add an explicit "use a field solver / fab" escalation rule** when outside the high-accuracy band. |
| Crosstalk (NEXT/FEXT) estimate | Saturn, Sierra | Common request alongside impedance. Candidate for Phase 4. Needs a primary source. |
| PDN target impedance / decoupling | Sierra PDN Analyzer, Saturn PDS | Different physics from the DC path/load chain. Candidate for Phase 4, or explicitly out of scope. |
| Roughness-aware insertion loss (Huray, Hammerstad-Groisse) | Polar, Altium LSM, Sierra | Phase 2 task 6 says "loss estimate, approximate". Decide whether to include Hammerstad roughness, with a label. |
| Rise time → critical length / bandwidth | Saturn | Cheap closed form and useful in routing. Suggest adding it to Phase 2 with task 3 (delay/λ). |
| Frequency-dependent Dk/Df material library | Eurocircuits, Sierra, Polar, Rogers | Phase 2 S-027 has typical ranges only. Suggest a **user-editable material profile** (same model as fab profiles). |
| Resistor colour/SMD codes, series/parallel, attenuators (Pi/T), 555, filters | KiCad, DK, Electrodoc, Ninja | Low risk and popular. Candidates for the Phase 4 "extras" bucket. |
| Wire/cable gauge ampacity | Saturn, Ninja | We already have AWG unit work (`notes/units-awg.md`). Ampacity needs its own source. |
| Via impedance | Sierra | Niche. Phase 4 at most. |
| Planar inductor, embedded resistor | Saturn | Niche. Skip. |
| Touchstone / S-parameter export | Polar | Out of scope. |
| Installable offline (PWA / mobile) | Electrodoc, desktop tools | We are offline-capable already. A PWA manifest is cheap. Suggest it for Phase 4 hardening. |

### (d) Common pitfalls found in other tools (with evidence)
1. **Silent extrapolation outside the IPC-2221 data range.**
   - AC states the 35 A / 0.4 in / 10–100 °C / 0.5–3 oz range and then extrapolates past it.
   - PCBWay's 2014 write-up: "will simply extrapolate".
   - *Our rule: out of range → warning plus lower confidence, never silent.*
2. **"IPC-2152" labels on undisclosed third-party fits, with conflicting coefficients.**
   - Sierra: "curve-fitting equations", unpublished.
   - Saturn: its own polynomials, "+/-10% of the chart values".
   - SMPS website vs SMPS source differ (S-011c).
   - twc mistyped an exponent (−0.018 vs −0.108).
   - SMPS fits a single figure (Fig. 5-2: polyimide, 3 oz, 0.070 in) and applies it generally.
   - *Our rule: name the fit, its author, its source figure and its error.*
3. **Unit and locale conversion bugs**, which are the most frequent fix class in Saturn's changelog. Examples: "/1000 error … for Inches", "metric mode", "Temprise C vs. F", "comma as dp". DK offers ΔT in °F (correct handling untested).
   - *Our rule: property tests for round-trips, ΔT °F→K without offset, and locale-agnostic parsing.*
4. **Closed-form impedance used beyond its validity, or mis-stated.**
   - Bogatin: ">20%" off for many differential structures.
   - Altium: IPC-2141 "less accurate" than Wheeler, and a published Polar article had an apparent formula error.
   - Two sources print different ranges for different formulas: DK/IPC-2141 w/h 0.1–2.0 vs MST/IPC-2251 0.1–3.0.
   - *Our rule: enforce each model's own range, and never borrow another model's range.*
5. **Hidden defaults that move the answer.**
   - Sierra: safety factor default 40 %, length default 1 in.
   - Ninja: k default 0.20 W/m·K (snippet).
   - JLC: inner copper "slightly thinner" (no value shown).
   - *Our rule: every defaulted input is listed and counted in confidence.*
6. **Wrong preset data.** Saturn "Corrected USB 2.x target impedance" (v8.10), and wrong B4 spacing values (v8.23).
   - *Our rule: every protocol preset has a ledger row and a tolerance.*
7. **Treating IPC-2221 spacing as safety spacing.** Popular articles (Altium 2020/2025, Siemens 2025) present IPC-2221 clearance without separating it from IEC 60664 / 62368 safety insulation. *This supports the Phase 3 gating.*
8. **Internal-layer IPC-2221 widths presented as physics.** The internal chart was external data "derated by 50%". IPC-2152 found internal traces are **cooler** (Brooks & Adam, SI Journal, 2020-03-10, https://www.signalintegrityjournal.com/articles/1596-internal-trace-temperatures-more-complicated-than-we-think). Tools print internal = roughly 2.6× external width with no caveat.
9. **Other unconfirmed reports and AI-built tools.**
   - Wrong resistivity (Sierra, per twc). Unconfirmed.
   - AI-generated calculators that need a runtime LLM API key (Ux-Geek), which conflicts with determinism and offline use.
10. **dB / Np or dB/length unit mix-ups:** no specific evidence found in this survey. Not asserted.

### (e) Licensing and ethics constraints for reusing ideas
- **GPL code** (KiCad GPL-3.0+, Qucs-S GPL-2.0, twc GPL-3.0, rf-tool GPL-3.0): read for behaviour, record outputs, never copy or translate (CLAUDE.md rule 13).
- **weeks** is MIT, so reuse is legally possible with attribution. Project policy still says implement from the paper (Weeks 1979).
- **NinjaCalc:** no license was visible to the fetcher, so treat it as all rights reserved. Its fit constants come from digitized IPC charts, which falls under policy question R-8.
- **Proprietary web tools** (Sierra, JLC, DK, AC, Saturn, Altium, Omni, Rogers, TI):
  - Feature ideas and UX patterns are generally free to adopt.
  - Page text, images, formula images, icons and datasets (material libraries, stackups) are not.
  - Manual spot checks only. No scraping or automated querying (terms of service not reviewed).
  - Results would be `obtainedBy: human` cross-checks, never verification (rule 14).
- **Fits derived from IPC charts** (SMPS/Olson, Brooks & Adam, Sierra, Saturn, Ninja): using any of them is a human policy decision (OPEN_RISKS R-8). We must not digitize charts ourselves.
- **Trademarks:** do not say "JLCPCB-compatible" or "Polar-equivalent". Name tools only in cross-check records.
- **Not checked:** Saturn freeware EULA terms; Polar terms on publishing solver results; Rogers tech-hub terms.

---

## 5. Suggested plan changes (for the orchestrator; human decides)
1. **Phase 1:**
   - Add a test class for unit and locale bugs: ΔT in °F, decimal-comma input, mil↔mm↔µm round-trip, imperial/metric parity. Saturn's changelog shows these are the most common real-world failure.
   - Enforce IPC-2221 range warnings. Do not extrapolate silently.
   - Show the internal-layer caveat (50 % derate origin).
   - Show Mode A fit provenance (author, figure, error).
2. **Phase 2:**
   - Add a rise-time → critical-length / bandwidth helper.
   - Add a user-editable **material profile** (Dk/Df vs frequency), parallel to fab profiles.
   - Store an accuracy-band table per model (MST style) and feed it to confidence.
   - Add an explicit "outside high-accuracy band → field solver / fab" recommendation.
   - Every protocol preset gets a ledger row (Saturn's USB 2.x correction shows the risk).
3. **Phase 3:** keep IEC 60664 gating. Label IPC-2221 spacing as "functional / design guidance, not a safety-insulation result".
4. **Phase 4 candidates** (confirm with the human):
   - Crosstalk estimate.
   - PDN target impedance.
   - Resistor colour/SMD codes, Pi/T attenuators, series/parallel.
   - Wire ampacity.
   - PWA install.
5. **Crosscheck tools:** Digi-Key (IPC-2141, enforced ranges) and LearnEMC/MST (IPC-2251 with accuracy bands) are useful **manual** spot checks for Phase 2 (X-07 style, `obtainedBy: human`). Polar Si9000e or Sierra's free field solver could provide field-solver reference cases for S-028. They are still cross-checks only.
