# Skin depth (S-013)

Retrieved 2026-10-07. Status: VERIFIED for the formula (good-conductor approximation).

## Formula
δ = 1/√(π f μ σ) = √(ρ/(π f μ0 μr)). This is algebraically identical to √(2/(ωμσ)).

Sources:
- Ellingson, "Electromagnetics Vol. 2" (open textbook), §3.12: "δs ≈ 1/√(πfμσ) (good conductors)". Its aluminum example (26 µm at 10 MHz) was recomputed here as 26.2 µm.
- Ness Engineering skin-depth page: μ0 = 1.2566E-6. Its copper table (2.09E-3 cm at 10 MHz) agrees to 3 s.f.
- Wikipedia (tertiary, cites Hayt 5th ed.) gives the same form.

## Copper values
Conditions: ρ = 1/58e6 Ω·m, μr = 1, μ0 = 4π × 10⁻⁷. Then δ = 66.0855 µm / √(f / MHz).

| f | δ |
|---|---|
| 1 MHz | 66.0855 µm |
| 10 MHz | 20.8981 µm |
| 100 MHz | 6.60855 µm |
| 1 GHz | 2.08981 µm |

The golden vector 20.89806784938892 µm agrees with this hand calculation to 7 s.f.

## μ0
- The current NIST value is CODATA 2022: 1.256 637 061 27(20) × 10⁻⁶ N A⁻². It shifts δ by +6.6e-11 relative.
- The value given in the task, 1.25663706212e-6, is CODATA 2018 (not re-read here). It shifts δ by −2.7e-10 relative.
- Both shifts are inside rel_tol 1e-9. Keep 4π × 10⁻⁷ and state the deviation.

## Validity and caveats
- Requires σ ≫ ωε. For copper at 1 GHz, ωε0ρ ≈ 1e-9.
- Assumes a planar conductor, or a radius and thickness of several δ.
- δ scales with √ρ(T): about +15 % at 100 °C.
- Surface roughness and plated-copper ρ (S-012) are not included.
