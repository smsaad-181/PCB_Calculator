---
name: golden-vector-testing
description: How to write golden-vector, property-based, regression, and data-audit tests and keep them tied to the independent Python oracle. Use when creating or changing tests or numeric expectations.
---
# Testing numerics

1. **Golden vectors** live in `docs/golden-vectors.json` and are mirrored in `tools/reference/ref_calcs.py`. Each has name, inputs, expected value, relative tolerance, ledger ID.
2. Tolerances: exact closed-form math 1e-9 relative; empirical formula (IPC-2221) match to 1 % of the oracle; impedance models are compared to source-stated accuracy (typically 1-5 %) and flagged as approximate.
3. **Property tests (fast-check)**: unit round trip; `width(current(w)) ≈ w`; monotonicity in ΔT, width, copper thickness; resistance increases with temperature; no NaN/Infinity for in-range inputs; solver result satisfies its own fixed-point equation.
4. **Regression**: any fixed bug adds a named test with the failing input.
5. **Audit tests**: compliance-phrase grep; every data table row has `source`, `edition`, `verifiedBy`; unverified tables set `bannerRequired`.
6. Never weaken a tolerance to pass; escalate to `calc-validator`.
7. Expected values come from the oracle/ledger, never from running the implementation and pasting the output.
