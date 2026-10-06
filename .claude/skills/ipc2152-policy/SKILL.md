---
name: ipc2152-policy
description: Policy for how IPC-2152 is represented. IPC-2152 is believed to be chart/data based with correction factors, not a published closed-form; Mode A must be labelled an estimate unless a verified source exists. Use when working on Mode A.
---
# IPC-2152 policy

Claim to verify first (ledger S-002): IPC-2152 publishes measured data as charts with correction factors (planes, board thickness, conductivity), not a closed-form equation.

Open lead: the `twc` tool reportedly implements three IPC-2152 methods. Research what they are (ledger S-002/S-011) before finalizing this policy. If a published, citable equation or fit exists, update this skill and the ledger rather than keeping the claim above.

Until verified otherwise:
- Mode A is named **"IPC-2152-informed estimate"**.
- Any equation used is a **third-party curve fit**; cite its origin in the ledger; show its fit range and stated error.
- Never label results "IPC-2152 compliant".
- Do not digitize or embed IPC charts (copyright).
- Show adjustments only if a verified source quantifies them (nearby plane, board thickness, conduction path). Otherwise show them as qualitative warnings.
- Offer a side-by-side comparison with Mode B and explain differences (typically internal traces and plane effects).
- Confidence: at best `medium`, usually `low` with reasons.
If the user supplies a licensed data source later, add it under `src/core/data/ipc2152/` with `verifiedBy` filled.
