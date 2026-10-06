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

## User must verify
- IPC-4562A (with Amendment 1, 2013): the foil designation vs area weight (g/m²) vs nominal thickness table. Confirm 1 oz = 305 g/m² and 34.3 µm, and whether a density is stated.
- Product decision: which convention is the default (35 µm, 34.3 µm or mass-based). It must be shown as an assumption in CalcResult, because it changes widths by up to about 2 %.
