# Plated (electrodeposited) copper: resistivity and α (S-012)

Retrieved 2026-10-07. Status: UNVERIFIED.

## Found
- **Foil specification limit (secondhand).** Mitsui patent US 6,652,725 B2 (2003) quotes IPC-MF-150F: maximum mass resistivity 0.181 / 0.171 / 0.166 / 0.162 Ω·g/m² for 3 / 9 / 18 / ≥35 µm foil.
  - Derived at 8.89 g/cm³: 0.162 gives ρ ≤ 1.822e-8 Ω·m, or ≥ 94.6 % IACS.
  - The same patent says its own high-resistivity ED foils run 10–20 % above these limits (e.g. 0.180 Ω·g/m² at 18 µm).
  - IPC-MF-150F was superseded by IPC-4562, which is paywalled. Check IPC-4562 Table 3-2 "Maximum Resistivity of Deposited Foil" (title from a TOC search snippet).
- **Plated via copper (blog tier).** CircuitCalculator "PCB Via Calculator" (2006): 1.7–2.2 µΩ·cm, default 1.9 µΩ·cm. The source gives no reason for the range; the author's comment attributes it to porosity and impurities.
- **α rule.** NBS Circular 31 (1914): α20 = (fractional conductivity) × 0.00393. The resistivity-temperature constant is "0.006 81 microhm—cm" per °C for any copper sample.
  - Applying this to electrodeposited copper is an assumption.
  - Derived: ρ = 1.9 µΩ·cm gives α20 ≈ 0.00357 K⁻¹; ρ = 1.822 µΩ·cm gives ≈ 0.00372 K⁻¹.

## Not used
- A search snippet claimed 6.0 µΩ·cm for plated copper; its origin was not found.
- IC thin-film values (2–8 µΩ·cm) do not apply to PCB plating.

## Gaps and recommendation
- No measured TCR for PCB plated copper was found.
- No peer-reviewed PCB plated-copper ρ was retrieved. Candidates, both paywalled: Safranek, "The Properties of Electrodeposited Metals and Alloys", 2nd ed. 1986; Brooks & Adam, Artech House 2021.
- Recommendation: make plated ρ a flagged user input, and show α as derived from the NBS rule.
