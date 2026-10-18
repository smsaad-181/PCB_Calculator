# Phase 2 task 7: cross-check worksheet for the impedance calculators (X-01 KiCad TransLine, X-02 Qucs-S transcalc)

Status: infrastructure ready, NO tool has been run. Every `toolOutputs` value in the seven record files is `null`, `toolVersion` and `retrieved` read `TO BE FILLED BY HUMAN`, and the runner reports "0 of 53 cases obtained" in total (one line per file as well). Task 7 is NOT complete until a human completes this worksheet and every disagreement is classified.

Files covered:

| File | Tool | Our calculators | Cases |
|---|---|---|---|
| `tests/crosscheck/X-01-microstrip.json` | KiCad pcb_calculator, TransLine tab, Microstrip line | microstrip | 15 |
| `tests/crosscheck/X-01-stripline.json` | KiCad pcb_calculator, TransLine tab, Stripline | stripline | 8 |
| `tests/crosscheck/X-01-diff.json` | KiCad pcb_calculator, TransLine tab, Coupled microstrip line and (KiCad master only) coupled stripline | diff-microstrip, diff-stripline | 7 |
| `tests/crosscheck/X-01-cpw.json` | KiCad pcb_calculator, TransLine tab, Coplanar wave guide and Coplanar wave guide with ground plane | cpw, cpwg | 7 |
| `tests/crosscheck/X-01-coax.json` | KiCad pcb_calculator, TransLine tab, Coaxial line | coax | 4 |
| `tests/crosscheck/X-02-qucs-microstrip.json` | Qucs-S transcalc (transmission line calculator), Microstrip | microstrip | 7 |
| `tests/crosscheck/X-02-qucs-cpw.json` | Qucs-S transcalc (transmission line calculator), Coplanar waveguide | cpw, cpwg | 5 |

## 0. Rules that apply to the whole worksheet

- Outputs must come from a REAL run of the tool by a human. Never type a number from memory, from our app, from a screenshot of unknown version, or from this document. A null you cannot fill stays null (it is reported, not hidden).
- **Agreement never verifies a ledger row** (CLAUDE.md rule 14, `docs/sources/crosscheck-tools.md` rule 1). A passing record can only say our code reproduces another tool. Ledger rows S-020, S-021, S-022, S-022a, S-023, S-023a, S-024 and the rest keep their status, including CONFLICT and PAYWALLED-USER-MUST-VERIFY. The coupled-line models (S-022, S-022a) and the conductor-backed CPW (S-023a) rest on paywalled primaries: these comparisons cannot verify them.
- **GPL tool code is never copied** (CLAUDE.md rule 13): KiCad is GPL-3.0-or-later and Qucs-S is GPL-2.0 (ledger S-051). Values only. Do not paste tool source, formulas read from tool source, or screenshots showing source into this repository.
- **Do not run third-party code without reading it first** (CLAUDE.md rule 15). Use the official release of each GUI tool installed in a scratch directory OUTSIDE this repository (for example `D:\scratch\xcheck\kicad` and `D:\scratch\xcheck\qucs-s`), never inside `F:\pcb-calc`. Nothing from the tools (source, binaries) is committed.
- **Not approved, no records produced (open risk Q-19):** rf-tool (X-04, `pip install`) and rftools-mcp (X-06, `npx`) have no approval to be installed or run. This worksheet has no cases for them and a human must not add any without a separate explicit approval after reading their code. The JLCPCB impedance calculator (web) is optional and has NO record here: it synthesises widths on JLCPCB stackup templates with no er, frequency or thickness-model input (ledger S-028a), so it does not fit the record format; if wanted it needs its own record designed with the orchestrator. University web calculators (X-07) are manual spot checks, `obtainedBy: human`, and are not covered either.
- Tolerances were derived before any run and are stated in each record with a reason (section 6). Do not change a tolerance after seeing a result. The ONLY permitted pre-run edit is the display-digits check in section 3, done and committed BEFORE the first run; the commit message must say so.
- If our app and the tool disagree beyond tolerance, do not fix it by editing the number or the tolerance: report to `calc-validator` and classify (section 7). Never choose our thickness variant after seeing results: all variants are registered as separate cases from the start.

## 1. Common procedure

1. Work in a copy or scratch branch; edit only `tests/crosscheck/X-0*.json` (and, once, the tolerance edit of section 3).
2. Install the tool (section 2), record its version, then run the digits check (section 3).
3. For each case, enter exactly the values in the case tables of section 4 (all lengths in mm; frequency 1 MHz; er as typed; do not use the tool's material preset pickers, type er). One tool run can feed several cases: where a table says so, copy the same displayed numbers into each case.
4. Copy each displayed output into `toolOutputs` with ALL displayed digits (replace `null` by the number, no rounding, no unit conversion; the unit is in the key name: `_ohm`). If the tool shows a different unit or a quantity that is not the one named (for example radius for diameter, centre-to-centre for edge-to-edge), STOP and leave that case null: do not convert by hand. Outputs the tool does not display stay null (never compute `Zdiff = 2 x Zodd` or `eps_eff = er` by hand).
5. Fill `toolVersion` and `retrieved` (YYYY-MM-DD) in each file. Write the OS, the field names as shown, displayed digits, the thickness-model and dispersion-model names the tool states, and all non-default settings into `method`. Leave `obtainedBy` as `"human"`.
6. Run: `npx --no-install vitest run tests/crosscheck --silent=false`. The summary prints one "N of M cases obtained" line per record file and a TOTAL line, plus the pass, pending and fail counts.
7. Classify every failing case (section 7), fill the results table (section 8). A case may stay null if the tool could not produce it.

## 2. Tools and versions

### 2.1 X-01 KiCad PCB Calculator, TransLine tab

Record: Help > About exact version string, build date, OS. Public docs only (no source read): the TransLine tab lists the line types "Microstrip line", "Coplanar wave guide", "Coplanar wave guide with ground plane", "Rectangular waveguide", "Coaxial line", "Coupled microstrip line", "Stripline", "Twisted pair" (ledger S-028a, KiCad 9.0.9 docs). KiCad master additionally has a coupled stripline type and a soldermask cover correction (`docs/research/kicad-pcb-calculator.md`). The manual cites Atwater 1989 for microstrip and Kirschning-Jansen 1984 for coupled microstrip, says the models are frequency dependent, and field names are not in the docs: write the names you see.

| Needed for | KiCad version | Note |
|---|---|---|
| microstrip, stripline, coax, CPW, CPWG, coupled microstrip | any release you can install (7.0, 9.0, newer); record it | Run all of them in the SAME installation and say so. |
| coupled stripline (`kicad-ds-*` cases) | master / nightly only (per the research note) | If your build has no coupled stripline line type, leave the three `kicad-ds-*` cases null and write that in `method`. |

If you also have a master build with a soldermask or cover correction, keep it disabled for these cases and record the setting. Do not mix two KiCad versions inside one file without writing which case came from which.

### 2.2 X-02 Qucs-S transcalc

Record: Qucs-S version (Help > About), OS. Public docs only: the `qucstrans(1)` man page lists "Microstrip, Rectangular Waveguide, Coaxial Line, Coplanar and Coupled Microstrips" with analysis and synthesis; field names, output list and model names are NOT in the man page (ledger S-028a) and are not known to us in advance. The human must write into `method`: the names and the selected entries of every model drop-down in the dialog (static or quasi-static model, dispersion model, thickness handling), the field names, the output names, the displayed digits. For microstrip choose the Hammerstad-Jensen entry for the static model if the dialog offers one and record what you chose; choose "no dispersion" if such an entry exists, otherwise the lowest-frequency setting. For coplanar: run the `qucs-cpwg-*` cases only if the dialog offers a conductor-backed (grounded) variant, otherwise leave them null and say so. Qucs-S has no stripline or coupled stripline in the man page list: no records exist for those.

## 3. Display digits (do this once per tool, BEFORE the first recorded run)

Run ONE case in each tool and note how many decimals it shows for ohm values (d_Z) and for the effective permittivity (d_e). The shipped tolerances assume at least 2 decimals for ohm values and at least 3 decimals for eps_eff. If the tool shows fewer:

1. For each affected output and file compute rounding = 0.5 x 10^-d / (smallest value of that output you expect in that file, taken from the case table or the tool display).
2. New relTol = shipped relTol + rounding (conservative: it adds the whole rounding term). Only increases are allowed here. Update the `relTol` and add one sentence to the `why` text saying the digits seen and the rounding term added.
3. Commit this edit BEFORE running any case further, with a commit message that says "pre-run display-digits tolerance edit". Write the digits you saw in `method`.

If the tool shows MORE digits than assumed, change nothing.

## 4. Cases and exact field entries

Field labels below are generic. Use the tool's own fields for: relative permittivity of the substrate (er), substrate height (H), strip width (W), strip thickness (T) and frequency. Leave loss tangent, conductor resistivity, permeability, surface roughness and any top-dielectric or cover height at the tool defaults and write the defaults in `method` (they do not enter Z0 or eps_eff of our quasi-static models). Strip length: anything (it does not affect Z0). Use the Analyze direction (physical dimensions to electrical results), never Synthesize, so the tool's output is a result of the exact dimensions in the table.

T = "0 (none)" means: enter T = 0; if the tool rejects 0, enter the smallest value it accepts, write it in `method` and treat any resulting difference as thickness (E3). Microstrip and stripline "t35um" cases: one tool run with T = 0.035 mm feeds the three (microstrip: none, A, B) or two (stripline: none, cohn-wide) cases of the same geometry: copy the same displayed numbers into each of them. The `none` case is the control: it compares our zero-thickness model with a tool run that has thickness; it is expected to miss if (and only if) the tool applies a thickness correction.

### 4.1 X-01-microstrip.json (KiCad, Microstrip line)

| Case id | W [mm] | H (substrate height) [mm] | er | T (strip thickness) [mm] | f | Our variant | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|---|---|
| kicad-ms-er3.5-wh0.5-t0 | 0.25 | 0.5 | 3.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er3.5-wh1-t0 | 0.5 | 0.5 | 3.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er3.5-wh2-t0 | 1 | 0.5 | 3.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh0.5-t0 | 0.25 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh1-t0 | 0.5 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh2-t0 | 1 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh0.5-t35um-none | 0.25 | 0.5 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh0.5-t35um-A | 0.25 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-A | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| kicad-ms-er4.5-wh0.5-t35um-B | 0.25 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-B | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| kicad-ms-er4.5-wh1-t35um-none | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh1-t35um-A | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-A | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| kicad-ms-er4.5-wh1-t35um-B | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-B | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| kicad-ms-er4.5-wh2-t35um-none | 1 | 0.5 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| kicad-ms-er4.5-wh2-t35um-A | 1 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-A | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| kicad-ms-er4.5-wh2-t35um-B | 1 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-B | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |

`Z0_ohm` = characteristic impedance shown; `eps_eff` = effective relative permittivity shown. Write the thickness and dispersion model names the tool states for microstrip in `method` (this is what lets a thickness difference be classified as S-020a CONFLICT rather than a bug).

### 4.2 X-01-stripline.json (KiCad, Stripline)

Strip CENTRED between the planes. The tool's substrate-height field must be the plane-to-plane spacing b: check its drawing and write the field and strip-position entries in `method`; if the height means anything else (half spacing, plane to strip), STOP and leave the case null.

| Case id | W [mm] | b (plane-to-plane) [mm] | er | T [mm] | f | Our variant | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|---|---|
| kicad-sl-er4.5-wb0.25-t0 | 0.4 | 1.6 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb0.5-t0 | 0.8 | 1.6 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb1-t0 | 1.6 | 1.6 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er3.5-wb0.5-t0 | 0.8 | 1.6 | 3.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb0.5-t35um-none | 0.8 | 1.6 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb0.5-t35um-cohn-wide | 0.8 | 1.6 | 4.5 | 0.035 | 1 MHz | cohn-wide | Z0_ohm, eps_eff | Z0_ohm 1.5 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb1-t35um-none | 1.6 | 1.6 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 0.1 % |
| kicad-sl-er4.5-wb1-t35um-cohn-wide | 1.6 | 1.6 | 4.5 | 0.035 | 1 MHz | cohn-wide | Z0_ohm, eps_eff | Z0_ohm 1.5 %; eps_eff 0.1 % |

### 4.3 X-01-diff.json (KiCad, Coupled microstrip line and coupled stripline)

S is the EDGE-TO-EDGE gap between the two strips (check the drawing; if the tool uses centre-to-centre, STOP and leave the case null). Copy only outputs the tool displays: `Zodd_ohm`, `Zeven_ohm` (odd and even mode impedance), `Zdiff_ohm` only if it prints a differential impedance (some tools print 2 Zodd, some another definition: write what it says; ledger S-022b warns that tools use different definitions), `eps_eff_odd` and `eps_eff_even` only if per-mode effective permittivity is shown (microstrip), `eps_eff` for the stripline only if shown. `kicad-ds-*` cases need a coupled stripline line type (KiCad master only per the research note).

| Case id | Our calculator | W [mm] | S (edge-to-edge gap) [mm] | H or b [mm] | er | T [mm] | f | Copy into `toolOutputs` (only what is displayed) | relTol |
|---|---|---|---|---|---|---|---|---|---|
| kicad-dm-er4.5-h0.2-w0.2-s0.2 | diff-microstrip | 0.2 | 0.2 | 0.2 | 4.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff_odd, eps_eff_even | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff_odd 2 %; eps_eff_even 2 % |
| kicad-dm-er4.5-h0.2-w0.15-s0.1 | diff-microstrip | 0.15 | 0.1 | 0.2 | 4.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff_odd, eps_eff_even | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff_odd 2 %; eps_eff_even 2 % |
| kicad-dm-er3.5-h0.2-w0.2-s0.4 | diff-microstrip | 0.2 | 0.4 | 0.2 | 3.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff_odd, eps_eff_even | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff_odd 2 %; eps_eff_even 2 % |
| kicad-dm-er4.5-h0.4-w0.2-s0.2 | diff-microstrip | 0.2 | 0.2 | 0.4 | 4.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff_odd, eps_eff_even | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff_odd 2 %; eps_eff_even 2 % |
| kicad-ds-er4.5-b0.5-w0.15-s0.15 | diff-stripline | 0.15 | 0.15 | 0.5 | 4.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff 0.1 % |
| kicad-ds-er4.5-b0.5-w0.2-s0.3 | diff-stripline | 0.2 | 0.3 | 0.5 | 4.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff 0.1 % |
| kicad-ds-er3.5-b0.8-w0.25-s0.4 | diff-stripline | 0.25 | 0.4 | 0.8 | 3.5 | 0 | 1 MHz | Zodd_ohm, Zeven_ohm, Zdiff_ohm, eps_eff | Zodd_ohm 3 %; Zeven_ohm 3 %; Zdiff_ohm 3 %; eps_eff 0.1 % |

### 4.4 X-01-cpw.json (KiCad, Coplanar wave guide and with ground plane)

S is the gap on EACH side of the strip. T = 0 and f = 1 MHz in the tool (the tool is documented to have a thickness correction and TE0-cutoff dispersion for coplanar lines, research note C-K12, unverified summary). If the tool asks for a ground width or other extra field, record it. Case `kicad-cpw-er4.5-h1.6-w0.75-s0.25` has h/max(W, S) = 2.13, inside our core's h >= 2 max(W, S) guidance (ledger S-023); `kicad-cpwg-er4.5-h0.2-w0.3-s0.2` is a thin-dielectric conductor-backed case.

| Case id | Our calculator | W [mm] | S (gap each side) [mm] | H [mm] | h / max(W, S) | er | T [mm] | f | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|---|---|---|---|
| kicad-cpw-er4.5-h1.6-w0.3-s0.2 | cpw | 0.3 | 0.2 | 1.6 | 5.33 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpw-er4.5-h1.6-w0.75-s0.25 | cpw | 0.75 | 0.25 | 1.6 | 2.13 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpw-er3.5-h0.8-w0.2-s0.15 | cpw | 0.2 | 0.15 | 0.8 | 4.00 | 3.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpwg-er4.5-h1.6-w0.3-s0.2 | cpwg | 0.3 | 0.2 | 1.6 | 5.33 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpwg-er4.5-h1.6-w0.75-s0.25 | cpwg | 0.75 | 0.25 | 1.6 | 2.13 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpwg-er3.5-h0.8-w0.2-s0.15 | cpwg | 0.2 | 0.15 | 0.8 | 4.00 | 3.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| kicad-cpwg-er4.5-h0.2-w0.3-s0.2 | cpwg | 0.3 | 0.2 | 0.2 | 0.67 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |

### 4.5 X-01-coax.json (KiCad, Coaxial line)

D is the inner diameter of the outer conductor, d the diameter of the centre conductor, both DIAMETERS in mm. If the tool's fields are radii or named otherwise, STOP and leave the case null. Dielectric and conductor permeability 1 (tool default; record it).

| Case id | D (outer diameter) [mm] | d (inner diameter) [mm] | er | f | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|
| kicad-coax-er2.1-D4-d1 | 4 | 1 | 2.1 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 0.2 %; eps_eff 0.1 % |
| kicad-coax-er2.3-D3-d0.9 | 3 | 0.9 | 2.3 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 0.2 %; eps_eff 0.1 % |
| kicad-coax-er4-D7-d2 | 7 | 2 | 4 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 0.2 %; eps_eff 0.1 % |
| kicad-coax-er1-D10-d3 | 10 | 3 | 1 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 0.2 %; eps_eff 0.1 % |

### 4.6 X-02-qucs-microstrip.json (Qucs-S transcalc, Microstrip)

Same entries as 4.1 with the model choices of section 2.2. Qucs-S gives a different set of output names: copy `Z0_ohm` from the characteristic impedance and `eps_eff` from the effective permittivity, and write the output names in `method`.

| Case id | W [mm] | H (substrate height) [mm] | er | T (strip thickness) [mm] | f | Our variant | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|---|---|
| qucs-ms-er3.5-wh1-t0 | 0.5 | 0.5 | 3.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| qucs-ms-er4.5-wh0.5-t0 | 0.25 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| qucs-ms-er4.5-wh1-t0 | 0.5 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| qucs-ms-er4.5-wh2-t0 | 1 | 0.5 | 4.5 | 0 (none) | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| qucs-ms-er4.5-wh1-t35um-none | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | none | Z0_ohm, eps_eff | Z0_ohm 0.5 %; eps_eff 0.5 % |
| qucs-ms-er4.5-wh1-t35um-A | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-A | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |
| qucs-ms-er4.5-wh1-t35um-B | 0.5 | 0.5 | 4.5 | 0.035 | 1 MHz | hj-procedure-B | Z0_ohm, eps_eff | Z0_ohm 1 %; eps_eff 1.5 % |

### 4.7 X-02-qucs-cpw.json (Qucs-S transcalc, Coplanar)

Same entries as 4.4. The `qucs-cpwg-*` cases only if the dialog offers a conductor-backed variant.

| Case id | Our calculator | W [mm] | S (gap each side) [mm] | H [mm] | h / max(W, S) | er | T [mm] | f | Copy into `toolOutputs` | relTol |
|---|---|---|---|---|---|---|---|---|---|---|
| qucs-cpw-er4.5-h1.6-w0.3-s0.2 | cpw | 0.3 | 0.2 | 1.6 | 5.33 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| qucs-cpw-er4.5-h1.6-w0.75-s0.25 | cpw | 0.75 | 0.25 | 1.6 | 2.13 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| qucs-cpw-er3.5-h0.8-w0.2-s0.15 | cpw | 0.2 | 0.15 | 0.8 | 4.00 | 3.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| qucs-cpwg-er4.5-h1.6-w0.3-s0.2 | cpwg | 0.3 | 0.2 | 1.6 | 5.33 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |
| qucs-cpwg-er4.5-h0.2-w0.3-s0.2 | cpwg | 0.3 | 0.2 | 0.2 | 0.67 | 4.5 | 0 | 1 MHz | Z0_ohm, eps_eff | Z0_ohm 2 %; eps_eff 3 % |

## 5. Differences expected a priori (from the ledger and the documented models; no result of our app is quoted)

| # | Difference | Applies to | Why we expect it | Expected size |
|---|---|---|---|---|
| E1 | Z0 prefactor | microstrip, stripline, coax, CPW, CPWG, coupled | Ours uses eta0/(2 pi), eta0/4 and eta0/4 from exact SI constants (Q-1; ledger S-020, S-021a, S-024). Tools may use the rounded 60 ohm or 30 pi. Z0 scales with it, eps_eff does not. | 0.07 % in Z0 (ledger), ours lower than a tool using 60 or 30 pi |
| E2 | Dispersion | any tool that includes it | KiCad documents frequency-dependent models; Qucs-S offers dispersion models by name. Ours is quasi-static (Q-3). Check the tool's setting and turn dispersion off, or record that it is on. 1 MHz makes the effect small but it is not guaranteed to be zero in every model. | Not quantified; record the tool's setting |
| E3 | Strip thickness | microstrip, stripline (T = 35 um cases); any tool run with T > 0 | Tools apply their own thickness correction; ours is zero thickness unless the opt-in variant is chosen (microstrip A and B, ledger S-020a CONFLICT; stripline cohn-wide, S-021a CONFLICT). The coupled and coplanar cores model zero thickness only, so those tools are run at T = 0. The microstrip thickness variants differ by about 0.4 % in Z0 and 0.9 % in eps_e (S-020a); the Wheeler against Hammerstad-Jensen width correction is about 0.05 % in Z0. | see tolerances in section 6; a miss is classified against S-020a or S-021a, not as a bug, once the tool's model name is recorded |
| E4 | Displayed digits | all | Tool output is rounded for display, ours is not. | set per record from the digits (section 3) |
| E5 | Closed-form family | microstrip | KiCad cites Atwater 1989 (the code names Hammerstad-Jensen and others, research note C-K7); ours is the Hammerstad-Jensen quasi-static form (S-020). Wheeler-type forms differ from Hammerstad-Jensen by about 0.3 % in Z0 (S-020d). | about 0.3 % in Z0 (ledger) |
| E6 | Soldermask or cover correction | microstrip, coupled microstrip, CPW | Present in KiCad master (research note). Ours does not model a cover (a warning says so). Disable it, or leave the top height at its no-cover default. | not quantified; record the setting |
| E7 | Stripline model and strip position | stripline | Ours: Pozar-form, centred strip (S-021). The tool's stripline model origin is not established (research note C-K11) and it has a strip-position field. Constants and narrow-strip models differ between sources (S-021a: 0.10 % constants, up to about 0.5 % between narrow-strip models). | up to about 0.5 % (ledger) plus unknown |
| E8 | Coupled-line model and definitions | coupled microstrip, coupled stripline | Ours: Hammerstad-Jensen 1980 (S-022) and Cohn 1955 approximate forms (S-022a), both paywalled-primary. KiCad documents Kirschning-Jansen 1984 and Jansen 1978 for coupled microstrip. The difference is NOT quantified in the ledger (S-022). Zdiff, Zodd, Zeven definitions differ between tools (S-022b) and spacing may be edge-to-edge or centre-to-centre. | not quantified: a difference larger than E1 and E4 is a finding, not an expected value |
| E9 | CPW effective permittivity model | CPW | Ours: conformal-map finite-substrate form (S-023, Q-6). Steer's empirical fit is stated accurate to 1.5 % for h/s >= 1; the two models are the S-023 CONFLICT. The tool may use either or a third. Thickness and dispersion corrections (tier 4 only) are off at T = 0 and 1 MHz. | up to 1.5 % in eps_e per model, about half of that in Z0 |
| E10 | Conductor-backed CPW model and ground width | CPWG | Ours: Ghione-Naldi form (S-023a, PAYWALLED-USER-MUST-VERIFY), wide via-stitched top grounds, zero thickness. The tool's ground width and model are not known in advance. | not quantified; this comparison cannot verify S-023a |
| E11 | Unit and field definitions | all | Our records are in mm with 1 mil = 25.4 um exactly; tools in mm have no conversion. A tool field that is a radius, half-spacing or centre-to-centre distance would show as a large systematic miss. | large (tens of percent): stop and re-read the field definition |
| E12 | eps_eff for homogeneous lines | stripline, coax, coupled stripline | Ours returns er exactly (TEM in a homogeneous dielectric). A tool may not display it, or may display something else. | display rounding only; compare only if displayed |
| E13 | er provenance | all | Our UI requires a source label for er; the adapter supplies a fixed record label. The tool is given the same typed er. No laminate preset from the tool's "..." picker is used. | none |

## 6. Tolerances (derived before any run; full derivations are in each record's `why`)

| Family | relTol | Derivation summary (percent) |
|---|---|---|
| microstrip Z0, T = 0 | 0.5 % | 0.07 prefactor + 0.30 closed-form spread (S-020d) + 0.10 eps_e fit + 0.02 rounding |
| microstrip eps_eff, T = 0 | 0.5 % | 2 x 0.2 fit accuracy (S-020) + 0.02 rounding |
| microstrip Z0, T = 35 um, variant A or B | 1 % | 0.07 + 0.40 (S-020a) + 0.05 + 0.30 + 0.10 + 0.02 |
| microstrip eps_eff, T = 35 um, variant A or B | 1.5 % | 0.9 (S-020a) + 0.4 + 0.02 |
| microstrip, T = 35 um, our zero-thickness control (none) | 0.5 % | same as T = 0; expected to miss if the tool corrects for thickness (E3) |
| stripline Z0, T = 0 | 1 % | 0.07 + 0.10 + 0.50 (S-021a) + 0.10 rounding |
| stripline Z0, T = 35 um, cohn-wide | 1.5 % | 0.77 + 0.5 undocumented thickness-procedure difference |
| stripline Z0, T = 35 um, none control | 1 % | same as T = 0; expected to miss if the tool corrects for thickness |
| stripline, coax, coupled stripline eps_eff | 0.1 % | display rounding only (ours equals er) |
| coax Z0 | 0.2 % | 0.07 prefactor + 0.02 rounding + margin |
| coupled microstrip and stripline Zodd, Zeven, Zdiff | 3 % | a-priori screening allowance, NOT derivable from the ledger (S-022, S-022a paywalled, model difference unquantified); catches gross errors only |
| coupled microstrip eps_eff (per mode) | 2 % | 0.4 + 1.6 unquantified allowance |
| CPW and CPWG Z0 | 2 % | 1.5 (2 x 1.5 % eps_e, S-023) + 0.07 + 0.02 |
| CPW and CPWG eps_eff | 3 % | 2 x 1.5 % (S-023) |

## 7. Disagreement classification (from `docs/sources/crosscheck-tools.md`)

| Situation | Action |
|---|---|
| Our app differs from the tool, and the tool equals the independent oracle (`tools/reference/ref_calcs.py`, `tools/reference/ref_impedance.py`) | Our bug likely. Owner: `calc-implementer`. |
| Our app equals the oracle, the tool differs | Tool uses a different model or constant. Document the cause (E1..E13 or new), for example the thickness model the tool names. No code change. |
| App, oracle and tool agree | Implementation consistent. Physics still needs a primary source. No ledger change. |
| All three differ | Escalate to `standards-researcher`; ledger row goes to `CONFLICT`. |

To use the table, ask `calc-validator` to run the oracle on the failing case inputs; do not use our app as the oracle. A thickness-control (`-none`) miss is an expected finding of type E3 when the tool names a thickness correction; it is not a defect of either side.

## 8. Results (fill AFTER the run; empty now)

KiCad version string: ____  OS: ____  Date: ____  Digits shown (ohm decimals / eps decimals): ____  Defaults left (tan delta, resistivity, mu, roughness, top height): ____  Dispersion setting: ____  Thickness model name stated by the tool: ____

Qucs-S version string: ____  OS: ____  Date: ____  Static model chosen: ____  Dispersion model chosen: ____  Thickness handling: ____  Digits shown: ____  Output names: ____

| File | Case id | Obtained (Y/N) | Runner status | relErr from runner output | Classification (section 7) | Cause (E1..E13 or new) | Owner / follow-up |
|---|---|---|---|---|---|---|---|
| X-01-microstrip.json | kicad-ms-er3.5-wh0.5-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er3.5-wh1-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er3.5-wh2-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh0.5-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh1-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh2-t0 |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh0.5-t35um-none |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh0.5-t35um-A |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh0.5-t35um-B |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh1-t35um-none |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh1-t35um-A |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh1-t35um-B |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh2-t35um-none |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh2-t35um-A |  |  |  |  |  |  |
| X-01-microstrip.json | kicad-ms-er4.5-wh2-t35um-B |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb0.25-t0 |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb0.5-t0 |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb1-t0 |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er3.5-wb0.5-t0 |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb0.5-t35um-none |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb0.5-t35um-cohn-wide |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb1-t35um-none |  |  |  |  |  |  |
| X-01-stripline.json | kicad-sl-er4.5-wb1-t35um-cohn-wide |  |  |  |  |  |  |
| X-01-diff.json | kicad-dm-er4.5-h0.2-w0.2-s0.2 |  |  |  |  |  |  |
| X-01-diff.json | kicad-dm-er4.5-h0.2-w0.15-s0.1 |  |  |  |  |  |  |
| X-01-diff.json | kicad-dm-er3.5-h0.2-w0.2-s0.4 |  |  |  |  |  |  |
| X-01-diff.json | kicad-dm-er4.5-h0.4-w0.2-s0.2 |  |  |  |  |  |  |
| X-01-diff.json | kicad-ds-er4.5-b0.5-w0.15-s0.15 |  |  |  |  |  |  |
| X-01-diff.json | kicad-ds-er4.5-b0.5-w0.2-s0.3 |  |  |  |  |  |  |
| X-01-diff.json | kicad-ds-er3.5-b0.8-w0.25-s0.4 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpw-er4.5-h1.6-w0.3-s0.2 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpw-er4.5-h1.6-w0.75-s0.25 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpw-er3.5-h0.8-w0.2-s0.15 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpwg-er4.5-h1.6-w0.3-s0.2 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpwg-er4.5-h1.6-w0.75-s0.25 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpwg-er3.5-h0.8-w0.2-s0.15 |  |  |  |  |  |  |
| X-01-cpw.json | kicad-cpwg-er4.5-h0.2-w0.3-s0.2 |  |  |  |  |  |  |
| X-01-coax.json | kicad-coax-er2.1-D4-d1 |  |  |  |  |  |  |
| X-01-coax.json | kicad-coax-er2.3-D3-d0.9 |  |  |  |  |  |  |
| X-01-coax.json | kicad-coax-er4-D7-d2 |  |  |  |  |  |  |
| X-01-coax.json | kicad-coax-er1-D10-d3 |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er3.5-wh1-t0 |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh0.5-t0 |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh1-t0 |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh2-t0 |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh1-t35um-none |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh1-t35um-A |  |  |  |  |  |  |
| X-02-qucs-microstrip.json | qucs-ms-er4.5-wh1-t35um-B |  |  |  |  |  |  |
| X-02-qucs-cpw.json | qucs-cpw-er4.5-h1.6-w0.3-s0.2 |  |  |  |  |  |  |
| X-02-qucs-cpw.json | qucs-cpw-er4.5-h1.6-w0.75-s0.25 |  |  |  |  |  |  |
| X-02-qucs-cpw.json | qucs-cpw-er3.5-h0.8-w0.2-s0.15 |  |  |  |  |  |  |
| X-02-qucs-cpw.json | qucs-cpwg-er4.5-h1.6-w0.3-s0.2 |  |  |  |  |  |  |
| X-02-qucs-cpw.json | qucs-cpwg-er4.5-h0.2-w0.3-s0.2 |  |  |  |  |  |  |

Totals: cases obtained ____ of 53; passed ____; failed ____; classified ____; unexplained ____ (must be 0 to close task 7).

Reminder: nothing in this table upgrades any ledger row. S-020a, S-021a, S-022, S-022a, S-023 and S-023a stay CONFLICT or PAYWALLED-USER-MUST-VERIFY as recorded until a primary source says otherwise. GPL tool code is never copied, and every number in the records must come from a real run.
