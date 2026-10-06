---
name: ipc2221-trace-width
description: Legacy IPC-2221 / KiCad-compatible trace width and current capacity formulas, units, validity limits, and mandatory labelling. Use when implementing or checking Mode B trace calculations.
---
# Legacy IPC-2221 trace width (Mode B)

Formula (verify constants in ledger before shipping):
`I = k · ΔT^0.44 · A^0.725`, A in **mil²**, ΔT in °C, I in A. k = 0.048 external, 0.024 internal.
Solve width: `A = (I / (k·ΔT^0.44))^(1/0.725)`, `width_mil = A / (oz · 1.378)`.

Golden: 1 A, ΔT 10 °C, 1 oz external → A ≈ 16.3 mil², width ≈ 11.8 mil (0.30 mm). 3 A → ≈ 54 mil. Internal 1 A → ≈ 31 mil.

Known validity limits (confirm in ledger): the original curves were derived for limited ranges (about up to 35 A, 0.5-3 oz, ΔT up to ~100 °C, widths up to ~400 mil). Warn when outside.

Mandatory UI wording: **"Legacy IPC-2221 method, for compatibility and comparison. Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability."**
Also output resistance, voltage drop, power loss, and a separate "recommended design value" (state derating factor and reason).
Never silently switch between this and Mode A.
