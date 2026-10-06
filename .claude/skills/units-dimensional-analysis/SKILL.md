---
name: units-dimensional-analysis
description: Design and rules for the dimensional unit engine: SI normalization, dimension vectors, ΔT vs absolute temperature, foil weight, AWG, SI prefixes. Use when touching units or converting values.
---
# Units

- Representation: `{ si: number; dim: Dim }` where `Dim` is exponent vector over (m, kg, s, A, K, mol, cd) plus tags to separate **temperature (absolute)** vs **temperature difference** and **areal mass**.
- Allowed ops: add/sub same dim; mul/div combine dims; pow integer; compare same dim. Anything else throws `DimensionError`.
- Temperature: `K = °C + 273.15`; `°F → K = (F−32)·5/9 + 273.15`. Differences: `Δ°C = ΔK`, `Δ°F = ΔK·5/9`. UI must make the user choose "temperature" vs "rise".
- Copper weight (oz/ft²) is areal mass: 1 oz/ft² = 0.3051 kg/m² (verify in ledger). Thickness = areal mass / density, OR the IPC convention 1 oz ≈ 1.378 mil ≈ 35 µm. Expose as a selectable constant, label it, and warn that finished copper differs (plating on outer layers, etch).
- Length: mm, mil (25.4 µm exactly), inch (25.4 mm exactly), µm, cm, m.
- AWG diameter (mm) = 0.127·92^((36−n)/39) (verify in ledger); area = π d²/4.
- SI prefixes p n µ m k M G; accept `u` for µ; case-sensitive `m` vs `M`.
- Parsing is forgiving ("10mil", "0.3 mm", "35u"); formatting chooses the engineering prefix.
- Never store display units. Conversion happens only at UI boundary.
- Test: round trips, associativity, mil↔mm exactness, °C/ΔT offsets.
