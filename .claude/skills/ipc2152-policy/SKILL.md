---
name: ipc2152-policy
description: Policy for how IPC-2152 is represented. The standard publishes charts with correction factors; every closed-form equation for it is a third-party curve fit. Mode A is therefore labelled an estimate, and using any fit needs a human decision (OPEN_RISKS R-8). Use when working on Mode A.
---
# IPC-2152 policy

## Finding (ledger S-002, S-011a..e, S-050; notes in `docs/sources/notes/ipc2152.md`)
- **The standard itself.** IPC-2152 (2009) is reported to present its results as charts (Figure 5-1, Figure 5-2, correction-factor figures for planes, board thickness and conductivity) plus an appendix of data. No secondary source reports a printed closed-form equation. Status: `PAYWALLED-USER-MUST-VERIFY`, because nobody here has read the standard. The user must check Section 5 and the Appendix.
- **Equations.** Published closed-form *fits* to IPC-2152 chart data do exist. They are third-party work, not the standard. The old wording "no closed form exists" is wrong. The correct statement is: the standard publishes charts, and any equation is a third-party fit.
- **twc** (S-050): its three "IPC-2152 methods" are curve fits copied from web calculators (NinjaCalc, SMPS.us, Sierra Circuits). They are a cross-check only (GPL-3.0, never copy), and they are not a source.

## Known fits
| Ledger | Fit | Status |
|---|---|---|
| S-011a | Brooks & Adam 2015 (PCD&F), external traces: ΔT = 215.3 · I² · W^−1.15 · Th^−1.0 (W, Th in mil) | UNVERIFIED (single primary source; KiCad is derived from it) |
| S-011b | Brooks & Adam, internal traces (per copper weight, KiCad transcription only) | UNVERIFIED |
| S-011c | SMPS.us / Jack Olson, baseline Fig. 5-2 fit, then correction factors | CONFLICT (website vs SMPS source-code coefficient sets; twc's commented copy also mistypes one exponent: −0.018 vs −0.108) |
| S-011d | NinjaCalc (mbedded.ninja), power law plus fitted correction factors | UNVERIFIED (article not retrieved) |
| S-011e | Sierra Circuits | UNVERIFIED (equations not published) |

Always read the current ledger row for status. This table can go stale.

## Rules
- Mode A is named **"IPC-2152-informed estimate"**. Why: the standard publishes charts, and any equation we evaluate is a third-party fit with its own error versus those charts. This label is not because "no closed form exists".
- **Using any fit in Mode A requires a human decision** (OPEN_RISKS R-8). That decision covers both licensing/policy, since the fits are derived from IPC charts, and which fit to use. Until it is made, no fit may ship as the Mode A method.
- If a fit is approved: cite it in the ledger (author, year, equation number). Show its fit range and stated error. Show the ledger status badge, because a non-VERIFIED status lowers confidence.
- **Foil thickness for S-011a:** Eq. 5 was fitted with Brooks & Adam's own thickness table: 0.5 oz = 0.65 mil, 1 oz = 1.35 mil, 2 oz = 2.7 mil, 3 oz = 3.9 mil. That table is not linear in oz. Use it for Th, or state the deviation as an explicit assumption in `CalcResult.assumptions`, for example "Th from 35 µm/oz, +2.1 % vs fit table at 1 oz". Never apply oz × 1.35 or the 35 µm/oz convention silently (see S-003, R-9).
- Never label results "IPC-2152 compliant".
- Do not digitize or embed IPC charts ourselves (copyright). Using an already-published third-party fit is a separate question, and the human decides it under R-8.
- Show adjustments (nearby plane, board thickness, conduction path) only if a verified source quantifies them. Otherwise show them as qualitative warnings.
- Offer a side-by-side comparison with Mode B (legacy IPC-2221) and explain the differences, typically internal traces and plane effects. Never substitute one mode for the other silently.
- Confidence: at best `medium`, usually `low` with reasons.

If the user supplies a licensed data source later, add it under `src/core/data/ipc2152/` with `verifiedBy` filled.
