---
name: via-and-annular-ring
description: Via electrical/thermal formulas, finished-hole vs drill definitions, via arrays, annular ring and tolerance stack-up, and the pitfalls. Use for via and drill calculators.
---
# Vias

- **Finished hole diameter d** is the inside diameter after plating. Drill ≈ d + 2·t_plating (+ allowance).
- Barrel copper area: `A = π·t·(d + t)` (annulus between d and d+2t). Do NOT use π(d−t)t.
- Resistance: `R = ρ·L/A` (L = barrel length ≈ board thickness; for blind/buried, use the span). Parallel vias: R/N (warn about current crowding and unequal sharing).
- Thermal: `θ = L/(k·A)`, k_Cu ≈ 385 W/m·K (editable, ledger). Thermal-via-array mode adds the spreading/fill assumptions explicitly.
- Do NOT claim a universal current rating from hole size alone; state assumptions (plating, ΔT, ambient, copper connected).
- Golden: d 0.3 mm, t 25 µm, L 1.6 mm → A ≈ 0.02553 mm², R ≈ 1.08 mΩ, θ ≈ 163 K/W.

# Annular ring
Nominal `AR = (pad − finished_hole)/2`. Worst case includes drill-position/registration tolerance, drill diameter tolerance, plating allowance, pad size tolerance. Warn when below the fab profile minimum. Acceptance criteria (e.g. breakout allowed or not by product class) come from IPC-6012 (paywalled): mark `PAYWALLED-USER-MUST-VERIFY`.
Types: PTH, NPTH (no plating), via, blind, buried, microvia (aspect-ratio warnings); use fab-profile limits only.
