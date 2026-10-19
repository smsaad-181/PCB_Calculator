# Thermal via and fusing: source notes (Phase 4)

Researcher: standards-researcher. Retrieved: 2026-10-19. Ledger rows: S-040, S-041, S-041a-d, S-042, S-042a-f (and S-014 now points here).
Scope by user decision (2026-10-19): (1) thermal via array estimate, (2) fusing (Onderdonk / Preece), kept apart from steady-state heating. Out of scope: θJA/θJC, exposed-pad spreading, RF/antenna, twisted pair/coax (placeholder S-043…S-044 kept).

## Read method and limits
- No shell. The file reader could not render PDFs (pdftoppm missing). Every PDF tried (TI SNVA419C, TTM SMD power handling, ROHM 65AN044E, Allegro AN296291, JLab fusing table, Brooks 1998 "fusing.pdf", ASEE paper) came back from the fetcher as compressed binary, so NO PDF was read.
- HTML pages went through a summarizing fetcher. Quotes below are what the fetcher returned; equations that the page prints as images (Brooks & Adam PCD&F articles, Guenin 2004) were NOT readable, only their surrounding text was.
- No JEDEC, IEC or IPC document was read. jedec.org returned 403 (JEDEC standards are a free download after login, so the human can read them).
- "Researcher arithmetic" = computed here, not quoted.

## What was verified (status VERIFIED)
| Row | What | Sources |
|---|---|---|
| S-040 | θJA depends on the JEDEC test board and environment; never a design constant (caveat text only) | Galloway, Electronics Cooling 2019-11-06; onsemi AND8220/D Rev. 1 (read in full 2026-10-13, S-019d) |
| S-041 | Barrel axial conduction θ = L/(k·π·t·(d + t)), d finished hole | TI SPRADB7 (2023-09) §3.1 (via-specific); MIT 16.Unified §16.4 R = L/(kA); Pulsonix docs as tier-4 cross-check |
| S-041b | Ideal array θ/N | Guenin, Electronics Cooling 2004-08-01; TI SPRADB7 §3.1 |
| S-042b | Preece I = a·d^1.5, copper a = 10244, d in inches | Brooks & Adam, PCD&F 2015-06-29; Ness Engineering "Fuse Equations" |
| S-042c | Copper freezing point 1357.77 K = 1084.62 °C (ITS-90) | NIST ITS-90 overview; ITS-90.com |

Short quotes:
- Galloway (EC 2019): "predictions cannot be expected to be accurate for different environmental conditions".
- TI SPRADB7: area "π * [(Drill Hole Radius)² − (Drill Hole Radius − plating thickness)²]"; the equation is a "general rule of thumb"; λ(Cu) printed as "4 Watts per meter-kelvin" (typo).
- Pulsonix: "(PI * (Drill Diameter - Plating Thickness) * Plating Thickness)"; "Thermal Resistivity for plated copper is assumed to be 0.249 cm-K/W (at a temperature of 300K)".
- Guenin: "The total resistance is equal to the resistance for a unit cell divided by the total number of vias."
- Brooks & Adam 2015: copper coefficient "(10244) is found in his third paper (1888)".
- Ness: copper "10,244"; d "in inches".
- NIST: "the freezing point of Cu at 1357.77 K (1084.62 ° C)".

## Not verified (UNVERIFIED / CONFLICT / PAYWALLED)
| Row | Status | Why |
|---|---|---|
| S-041a filled via | UNVERIFIED | DERIVED (parallel core + barrel); fill k not researched; user input only |
| S-041c 1-D limits, spreading, plane | CONFLICT | Guenin: 1-D model underestimates θ by up to 27 % (his case); Brooks & Adam 2024: vias "almost zero effect" without a lower plane and "Stop wasting time and board area on thermal vias", against app-note practice (TI, ROHM) |
| S-041d plated copper k | UNVERIFIED | not found; Pulsonix 401.6 W/m·K (unsourced), Brooks & Adam "About 385", TI typo "4" |
| S-042 Onderdonk form | UNVERIFIED | constants readable as text in one source only (Goch, Classic Connectors 2012); Brooks & Adam print it as images; no original exists |
| S-042a adiabatic physics form | UNVERIFIED | DERIVED; IEC 60364-5-54 k-form only via one secondary publisher (myElectrical / myCableEngineering) |
| S-042d copper specific heat | CONFLICT | 383.48 J/(kg·K) at 293 K (PPPL) vs 386 at 20 °C (HyperPhysics); temperature rise single-source |
| S-042e PCB validity of fusing equations | UNVERIFIED | one author group (Brooks & Adam) |
| S-042f IPC scope for fusing | PAYWALLED-USER-MUST-VERIFY | secondhand; IPC-2152 / IPC-2221 not read |

## Equations as recorded
- Onderdonk (S-042), Goch's text form: "33 (I/A)2 S = log [(Tm – Ta / 234 + Ta) + 1]" (brackets and superscript flattened). Read as 33·(I/A)²·S = log10[(Tm − Ta)/(234 + Ta) + 1], A in circular mils, S in seconds, temperatures in °C. Solved: I = A·√(log10[(Tm − Ta)/(234 + Ta) + 1]/(33·S)).
- Adiabatic physics (S-042a, derived): I²·t = A²·(D·c/(ρ20·α20))·ln[(Tm + β20)/(Ta + β20)], β20 = 1/α20 − 20 °C.
- IEC 60364-5-54 k-form as reproduced (S-042a second source): k = √[Qc(β + 20)/ρ20 · ln((β + θf)/(β + θi))], copper β 234.5 °C, Qc 3.45 × 10⁻³ J/(K·mm³), ρ20 17.241 × 10⁻⁶ Ω·mm; S = √(I²t)/k; myElectrical copper form "k=226 ln(1+ (θf − θi)/(234.5+ θi))" with the root lost in rendering.
- Preece (S-042b): I = a·d^(3/2), a = 10244 (copper, d in inches).
- Via barrel (S-041): θ = L/(k·π·t·(d + t)).

## Cross-checks (researcher arithmetic)
- Onderdonk's 1/33 per log10 (A in cmil) = 0.030303 A²·s/cmil².
- Physics with D 8890 kg/m³ (S-003d), c 385 J/(kg·K) (S-042d), ρ20 1/58e6 Ω·m and α20 0.00393 K⁻¹ (S-004): D·c/(ρ20·α20) = 5.0512 × 10¹⁶ A²·s/m⁴ per unit ln; × (5.06707 × 10⁻¹⁰ m²/cmil)² × ln 10 = 0.029863 = 1/33.49 per log10. Onderdonk is 1.5 % higher in I²t (0.7 % in I).
- IEC k = 226: 226² × (5.06707 × 10⁻⁴ mm²/cmil)² × ln 10 = 0.030196 = 1/33.12. Within 0.4 % of Onderdonk.
- So base-10 log is the only reading of Onderdonk consistent with physics (natural log would be 2.30× off).
- Onderdonk at Ta 20 °C: Tm 1084.62 °C gives log10(1318.62/254) = 0.715286, so t·(I/A)² = 0.021675 (cmil) and 0.035139 (mil²; × (4/π)²). With Tm 1083 °C: 0.021659 and 0.035112. Brooks & Adam's own derived constants: 0.0213 (cmil) and 0.0346 (mil²). They are 1.6 % lower than Onderdonk. Brooks' 2023 worked example (t = 0.0346·(130/15)² = 2.6 s) uses THEIR constant; Onderdonk gives 2.64 s.
- Preece area form: 10244 × (4/π)^(3/4) = 12278.9 (Brooks prints 12277). Metric: 10244/25.4^1.5 = 80.02 (d in mm). Ness table check: (1/10244)^(2/3) = 0.002118 in, (10/10244)^(2/3) = 0.009843 in. Both match the page.
- Via, d 0.3 mm, t 25 µm, L 1.6 mm, k 401 W/m·K: θ = 156.32 K/W (golden vector). The πdt approximation gives 169.4 K/W (+8.3 %). Finished hole put into the drill form π·t·(D − t) gives 184.7 K/W (+18 %). Copper-filled (k_fill = 401): 41.47 K/W, the same as a solid cylinder of radius d/2 + t.

## Conflicts (not resolved, not averaged)
1. Onderdonk constant vs Brooks & Adam derived constant: 0.02166 vs 0.0213 A²·s/cmil² (1.6 %). (S-042)
2. Copper melting point: 1084.62 °C (ITS-90) vs 1083 °C in every fusing source and PPPL. (S-042c)
3. Copper specific heat at 20 °C: 383.48 vs 386 J/(kg·K). (S-042d)
4. Preece date: 1884 (Ness) vs 1888 paper (Brooks & Adam; Royal Society archive snippet). Area constant 12277 vs 12278.9. (S-042b)
5. Are thermal vias worth it? App notes (TI SPRADB7, ROHM) recommend them; Brooks & Adam 2024 say no when a plane is already below the pad. (S-041c)
6. Via area forms: π·d·t (blogs) vs π·t·(d + t) (exact, finished hole) vs π·t·(D − t) (exact, drill). The first and third are often mixed up. (S-041)
7. Plated copper k: 401.6 (Pulsonix, unsourced) vs about 385 (Brooks & Adam) vs S-007 CONFLICT; TI prints 4 (typo). (S-041d)
8. Mis-transcribed Onderdonk forms in the wild: a 2026 vendor page omits the 33; the Physics Forums original post had 234 − Ta and 33·t outside the root. (S-042)

## What the human must still check
- JESD51-1/-2/-3/-7 (free after JEDEC login) only if wording beyond the S-040 caveat is wanted.
- IPC-2152 (2009) scope clause and IPC-2221B/C §6.2 for any fusing / short-time content (S-042f, Q-56).
- IEC 60364-5-54 Annex A (paywalled) only if the IEC adiabatic form is to be cited directly (S-042a, Q-55).
- Preece 1888 (Proc. R. Soc. Lond. 44; DOI 10.1098/rspl.1888.0006 unconfirmed) and Stauffacher 1928 (GE Review 31(6)) if primary confirmation is wanted. Both are old enough to be freely available in some libraries.
- Fill-material conductivity from the fill-material datasheet the fab uses (S-041a).
- Decisions Q-50…Q-60 in `docs/research/phase-4-thermal-via-and-fusing.md`.

## Not used (leads only)
- ICEA/IEEE-242 short-circuit form with 0.0297 (Mike Holt documents: 403; search snippet only).
- IEEE Std 80 / ASTM F855 use of Onderdonk (search snippets only; paywalled).
- Babrauskas, "Fusing of wires by electrical current" (403); search snippet: Onderdonk off by 17 % from his derivation. Not confirmed.
- Wikipedia AWG table: fusing columns "Computed using equations from" Beaty & Fink, Standard Handbook for Electrical Engineers (2007). Tertiary; handbook not read.
- Dimitrov 2018 (PDF, not read): IPC-2221 "not applicable for the design of fuses".
- ROHM TechWeb (search snippet): about 0.3 mm via, about 1.2 mm pitch under ICs. Single publisher, not used as a default.
