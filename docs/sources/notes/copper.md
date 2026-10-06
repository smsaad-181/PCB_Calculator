# Copper: foil thickness, density, resistivity, α (S-003, S-003d, S-004)

Retrieved 2026-10-06.

## IACS (S-004): VERIFIED
NBS Circular 31, 3rd ed. (1914), Copper Wire Tables (archive.org OCR text), and NBS Handbook 100 (1966), at 20 °C:
- mass resistivity 0.15328 Ω·g/m²
- volume resistivity 1.7241 µΩ·cm = 1.7241 × 10⁻⁸ Ω·m (= 1/58 Ω·mm²/m, 58 MS/m)
- density 8.89 g/cm³
- α = 0.00393 per °C, for 100 % conductivity copper
- adopted by the IEC in 1913 (IEC 60028:1925 not read)

Independent agreement: Techniques de l'Ingénieur M4640 (ρ20 = 1.7241e-8 Ω·m, 58.0 MS/m); Kanthal C11000 datasheet (α +0.00393 to +0.00397 K⁻¹, density 8.89, 100 to 101.5 % IACS min).

### Which value is exact (m-9, 2026-10-06)
NBS HB100 and Circular 31 name three fundamental quantities: conductivity 58 m/(Ω·mm²), density 8.89 g/cm³ and α 0.00393 /°C, all at 20 °C. HB100: "All the other numerical values follow from these three", and the conductivity "is an exact whole number, viz, 58".
- Exact: σ = 58 MS/m, so ρ = 1/58 µΩ·m = 1.724137931…e-8 Ω·m.
- Rounded: 1.7241e-8 Ω·m (5 s.f., −2.2e-5 relative) and 0.15328 Ω·g/m² (= 8.89/58 = 0.1532759).
- Pitfall: 0.15328 / 8.89 gives 1.724184e-8 (+2.7e-5) because it propagates the rounding of 0.15328.
- Recommendation: use 1/(58e6) Ω·m in code, or label 1.7241e-8 as rounded. The old wording "1.7241e-8 = 1/58" is withdrawn.

Note: 1.7241e-8 is a defined *reference*. Real annealed ETP copper can be slightly more conductive than 100 % IACS. Pure-copper handbook values (about 1.68e-8 Ω·m) were not researched. Plated copper is S-012.

## Density (S-003d)
- IACS 8.89 g/cm³ (NBS; Kanthal): VERIFIED.
- Pure copper: RSC 8.96 g/cm³; LANL 8.935 g/cm³ at STP: CONFLICT, not averaged.

## Foil weight to thickness (S-003): CONFLICT
Exact areal mass: 1 oz/ft² = 0.028349523125 kg ÷ 0.09290304 m² = 0.30515173 kg/m².

| Convention | Thickness | Source |
|---|---|---|
| 35 µm (1.378 mil) | 35.00 µm | CircuitCalculator.com "1.378[mils/oz]"; twc; Advanced Circuits (copy of CircuitCalculator) |
| 34.8 µm (1.37 mil) | 34.8 µm | JLCPCB blog |
| 1.35 mil (34.3 µm), reported as IPC-4562A nominal | 34.3 µm | B. Hargin, Siemens EDA blog 2025-08-13; Brooks & Adam PCD&F 2015 ("1.0 oz. = 1.35 mils") |
| mass ÷ 8890 kg/m³ (IACS) | 34.33 µm (1.351 mil) | computed |
| mass ÷ 8960 kg/m³ | 34.06 µm (1.341 mil) | computed |
| mass ÷ 8935 kg/m³ | 34.15 µm | computed |

- The ledger's earlier phrase "1.378 mil (IPC convention)" is not supported. 1.378 mil is simply 35 µm in mil, and no source attributes it to IPC.
- The reported IPC-4562A figure (34.3 µm) matches mass-based thickness at IACS density (34.33 µm). That suggests, but does not prove, its origin.
- Post-processing thickness (e.g. about 30 µm after fab, per Hargin) is a separate quantity and must not be confused with nominal foil thickness.

### 35 µm as a fabricator nominal (m-5, 2026-10-06)
Two independent tier-3 sources now pair 1 oz with 35 µm:
- Würth Elektronik "Basic Design Guide" V1.0 (PCB fabricator). Inner-layer "Final Copper Thickness" column: "35 µm / 1 oz/ft²", "17.5 µm/ ½ oz/ft²", "70 µm / 2 oz/ft²", "105 µm / 3 oz/ft²".
- Rogers RO4835 Laminate Data Sheet (Revised 1686 092425, Pub. #92-160; laminate maker). Standard ED copper cladding: "1/2 oz. (18μm)", "1 oz. (35μm)".

Both are nominal labels. Their half-ounce values disagree (17.5 vs 18 µm), so neither defines an exact conversion. No copper-foil-maker datasheet was retrieved. The code label "common calculator/fabricator nominal" is now supportable. S-003 stays CONFLICT because the 34.8 µm and 34.3 µm (IPC-4562A, secondhand) conventions still exist.

## Thermal conductivity k_Cu (S-007, new row, m-8): CONFLICT
| Value (W/m·K) | Condition | Source |
|---|---|---|
| 403 / 401 / 401 / 395 | 273.2 / 298.2 / 300 / 373.2 K; well-annealed high-purity Cu; ±2 % near RT | Ho, Powell & Liley, JPCRD 1, 279 (1972), p. 332 (NIST reprint PDF) |
| 401.00 (300 K), 400.68 (293 K) | pure Cu | PPPL ARIES properties page (secondary; cites JPCRD, Incropera, CRC) |
| 391 | C11000 Cu-ETP, 20 °C, ≥ 99.90 % Cu, 100 % IACS, soft | Aurubis datasheet C11000 (18 08 US) |
| 394 | Cu-ETP CW004A, 20 °C | Bikar product page (distributor) |
| 385.0 | no temperature or purity | HyperPhysics table (from Young, University Physics 7th ed.); its own cal column (0.99) converts to ≈ 414 |

Conclusions:
- The oracle's 385 W/m·K is not adequately sourced and matches none of the HPL values at 273 to 373 K.
- Pure Cu at 300 K = 401 W/m·K is well supported. ETP at 20 °C is 391 to 394 (one manufacturer and one distributor, 0.8 % apart).
- Plated via copper was not researched.
- Do not average. The orchestrator must pick a material class and record it as an assumption.

## User must verify
- IPC-4562A (with Amendment 1, 2013): the foil designation vs area weight (g/m²) vs nominal thickness table. Confirm 1 oz = 305 g/m² and 34.3 µm, and whether a density is stated.
- Product decision: which convention is the default (35 µm, 34.3 µm or mass-based). It must be shown as an assumption in CalcResult, because it changes widths by up to about 2 %.
