---
name: self-heating-solver
description: Iterative solver for coupled resistance-temperature self-heating, RMS pulse heating, thermal runaway detection, and separation from fusing models. Use for trace temperature rise with temperature-dependent resistance.
---
# Self-heating

Coupling: `R(T) = R20·(1 + α·(T − 20))`, `P = I²R(T)`, `ΔT = f(P)` from the chosen thermal law (e.g. IPC-2221 ΔT(I) inverted, or a user θ in K/W per length).
Solve the fixed point `ΔT = θ·P(ΔT)` with a **bracketed** method (bisection/Brent). Max 50 iterations, tolerance 1e-6 relative. Return `{status: 'converged'|'max_iter'|'runaway', iterations, residual}`.
Runaway: if no root exists in [0, ΔT_max] (heating grows faster than dissipation), return `runaway` with a hard warning. Never loop unbounded.

Pulse/duty: `I_rms = I_pk·√D` for rectangular pulses, valid only when period ≪ thermal time constant. Otherwise warn and show the peak-based estimate separately.
Fusing (Onderdonk/Preece) is a **different calculator** with separate labels and sources; never mix it with steady-state heating.
Skin effect: `δ = √(ρ/(π f μ0))` ≈ 66 µm/√f(MHz) in copper; warn when δ is comparable to copper thickness (AC resistance > DC).
Tests: fixed-point residual, monotonic in I, α=0 reduces to closed form, runaway case.
