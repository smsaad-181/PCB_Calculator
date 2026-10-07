---
name: ipc2221-trace-width
description: Legacy IPC-2221 / KiCad-compatible trace width and current capacity formulas, units, validity limits, and mandatory labelling. Use when implementing or checking Mode B trace calculations.
---
# Legacy IPC-2221 trace width (Mode B)

Formula (verify constants in ledger before shipping):
`I = k · ΔT^0.44 · A^0.725`, A in **mil²**, ΔT in °C, I in A. k = 0.048 external, 0.024 internal.
Solve width: `A = (I / (k·ΔT^0.44))^(1/0.725)`, then `width = A / t`, where t is the copper thickness.
- Get t from `foilThickness(weight, convention)` (`src/core/units/foil.ts`) with the selected convention (default `DEFAULT_FOIL_CONVENTION` = `'nominal-35um'`, in `src/core/data/constants.ts`), or from a user-entered finished thickness. Never hard-code a mil-per-oz factor such as 1.378.
- Add `foilAssumptionText()` and the `foilThickness().statement` to `assumptions`, and include ledger S-003 in `reference.ledgerIds`. The convention is a labelled assumption: 35 µm is a common fabricator nominal (CircuitCalculator's 1.378 mil/oz is 35 µm in mil, not an IPC value), 1.35 mil is reported secondhand for IPC-4562A, and mass/8890 kg/m³ gives about 34.3 µm. They differ by about 2.07 % at 1 oz (S-003 CONFLICT). Finished copper differs from nominal far more (plating, etch; P-2).
- Do the arithmetic in SI (`Quantity`); convert A to mil² only inside the fitted equation, because the coefficients are defined for mil² and °C rise.

Golden (from `docs/golden-vectors.json`, computed with the nominal-35um convention; read the file): 1 A, ΔT 10 °C, 1 oz external → A ≈ 16.3 mil², width ≈ 11.83 mil (0.30 mm). 3 A → ≈ 53.8 mil. Internal 1 A → ≈ 30.8 mil. A different foil convention changes these widths by up to about 2 %.

Known validity limits (confirm in ledger): the original curves were derived for limited ranges (about up to 35 A, 0.5-3 oz, ΔT up to ~100 °C, widths up to ~400 mil). Warn when outside.

Mandatory UI wording: **"Legacy IPC-2221 method, for compatibility and comparison. Not a substitute for IPC-2152-based analysis. Temperature rise alone does not prove reliability."**
Also output resistance, voltage drop, power loss, and a separate "recommended design value" (state derating factor and reason).
Never silently switch between this and Mode A.
