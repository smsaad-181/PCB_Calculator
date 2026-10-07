---
name: units-dimensional-analysis
description: Design and rules for the dimensional unit engine: SI normalization, dimension vectors, ΔT vs absolute temperature, foil weight, AWG, SI prefixes. Use when touching units or converting values.
---
# Units

- Representation: `{ si: number; dim: Dim }` where `Dim` is exponent vector over (m, kg, s, A, K, mol, cd) plus tags to separate **temperature (absolute)** vs **temperature difference** and **areal mass**.
- Allowed ops: add/sub same dim; mul/div combine dims; pow integer; compare same dim. Anything else throws `DimensionError`.
- Temperature: `K = °C + 273.15`; `°F → K = (F−32)·5/9 + 273.15`. Differences: `Δ°C = ΔK`, `Δ°F = ΔK·5/9`. UI must make the user choose "temperature" vs "rise".
- Copper weight (oz/ft²) is areal mass: 1 oz/ft² = 0.028349523125/0.09290304 = 0.30515173 kg/m² exactly (S-006). Thickness is never a fixed factor in code: use `foilThickness(weight, convention)` in `src/core/units/foil.ts`, the only sanctioned areal-mass → length path. Conventions (`FOIL_CONVENTIONS`; S-003 is **CONFLICT**):
  - `'nominal-35um'` (default, `DEFAULT_FOIL_CONVENTION`): 35 µm per oz/ft², a common fabricator/laminate nominal (Würth, Rogers). 1.378 mil is just 35 µm expressed in mil; no source ties it to IPC, so never call it "the IPC convention".
  - `'nominal-1.35mil'`: 1.35 mil (34.3 µm), reported secondhand as the IPC-4562A nominal (not read).
  - `'mass-density'`: areal mass / 8890 kg/m³ (IACS density, S-003d), about 34.33 µm.
  - Spread at 1 oz: about 2.07 % (`foilSpreadPercent()`). The choice is a labelled assumption (`foilAssumptionText()`); the default awaits the human (R-9 / P-2). Warn that finished copper differs far more (plating on outer layers, etch).
- Length: mm, mil/mils/thou (25.4 µm exactly), inch (25.4 mm exactly), µm, cm, m.
- AWG diameter (mm) = 0.127·92^((36−n)/39) (S-005); area = π d²/4.
- SI prefixes p n µ m k M G; accept `u` for µ; case-sensitive `m` vs `M`, no case folding (`5 Mil` is rejected with a "Did you mean" hint).

## Parsing (`parseQuantity(text, expectedDim?)`, never throws, returns a Result)
- **Field-aware**: pass the field's dimension.
  - In a temperature-difference (ΔT) field, `K`, `°C`/`degC` and `°F`/`degF` mean a **rise** (°F scaled by 5/9, no offset). In an absolute-temperature field a Δ unit is rejected with a specific message.
  - In a copper-weight (areal-mass) field, bare `oz` means oz/ft². Without a field, bare `oz` is rejected as ambiguous.
  - Component codes (`4k7`, `4R7`, `R47`, `4M7`, `4n7`, `4u7`, `4p7`) are accepted only in the matching resistance/capacitance/inductance field.
- **Compound units**: mil², in², mm², K/W and °C/W (thermal resistance), W/(m·K), /K and ppm/K, %, ppm, A/m², A/cm², A/mm², Ω·m and µΩ·cm, Ohm/ohms/Ω.
- **Locale**: `.` is the only decimal separator. Decimal commas (`1,5`) and space/thin-space thousands grouping (`1 000`) are rejected with a message, never reinterpreted.
- **Bare prefix** (`35u`, `1.5k`): accepted only with a field dimension. Known defect (calc-validator m-1): in compound-unit fields (area, resistivity, current density, dimensionless) a bare prefix multiplies the SI unit, e.g. `1.72 u` resistivity becomes 1.72 µΩ·m (100x off if the user means µΩ·cm). Must be rejected for those dimensions before the first area/resistivity/current-density field ships (task 2/3). Do not advertise bare-prefix input as a convenience.
- Zero, `-0` and underflow (`1e-400 mm`) parse to 0 by design; calculators must call `guardPositiveFinite` (R-13).
- Absolute temperature floor: `q()` rejects values below 0 K (tolerance 1e-9 K for float noise; m-6 open about literal tiny negatives).

## Display (`src/core/units/display.ts`)
- `formatFor(q, { prefs?, accuracyClass?, unit? })`: converts at the UI boundary only. `DisplayPrefs` = `{ length: 'mm'|'mil'|'um', temperature: 'C'|'K'|'F', area: 'mm2'|'mil2' }` (`DEFAULT_DISPLAY_PREFS` mm/°C/mm²); `unit` overrides per field. Engineering prefixes with roll-over for Ω, F, H, A, V, W, Hz, etc. ΔT prints with Δ and no offset.
- `sigFigsFor(accuracyClass)`: exact 6, analytical 4, empirical 3, estimate 2 (never more digits than the method supports).
- Open (m-3, before task 2): no rounding direction yet (minimum widths must round up, maxima down), and fixed significant figures on offset temperatures lose precision (104 °C prints "100 °C" at 2 s.f.). Open (m-7): density has no display rule.
- Never store display units. Conversion happens only at the UI boundary.
- Test: round trips, associativity, mil↔mm exactness, °C/ΔT offsets, locale rejection.
