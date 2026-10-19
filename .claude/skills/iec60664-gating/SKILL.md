---
name: iec60664-gating
description: Input gating, structure, and warnings for IEC 60664-1 clearance/creepage and IPC spacing calculators. Use for Phase 3. All table values must be user-verified; never embed from memory.
---
# Clearance & creepage gating

Key relations (verify in ledger, paywalled):
- **Clearance** is driven by *rated impulse withstand voltage* (from overvoltage category + supply voltage), pollution degree, altitude factor.
- **Creepage** is driven by *RMS working voltage*, pollution degree, material group/CTI. It is never derived from voltage alone. Creepage ≥ clearance. Altitude does not scale creepage.
- High frequency: the Part 1 frequency limit is a user-entered T7 record (the IEC 60664-4 abstract states a boundary; ledger S-031a, PAYWALLED). No frequency figure in code. Above a recorded limit: refuse a Part 1 number and name IEC 60664-4; no recorded limit: warn that high-frequency applicability was not checked (SMPS switch nodes often run at high frequency).
- Insulation types: functional, basic, supplementary, reinforced. Reinforced rules come ONLY from user-entered T7 records, never from code (ledger S-030f, PAYWALLED). Per secondary sources (TI SLUAAR5 §2.2, TI AMC1411; unconfirmed): reinforced clearance (impulse case) uses the NEXT STEP OF THE PREFERRED IMPULSE-VOLTAGE SERIES, which is not the next row of the clearance table; the series must itself be a human-entered list. Reinforced creepage is twice basic (unconfirmed). No public source gives the reinforced rule for the steady-state / recurring-peak clearance case (T3); do not reuse the impulse step or a factor for it without its own T7 record.
- Product standards (IEC 62368-1, 61010-1, 60601-1, etc.) can override. Show always: **"IEC 60664-1 is an insulation-coordination framework; product-specific safety standards may impose additional requirements."**

Gating rules:
- If any mandatory input is missing → no numeric clearance/creepage; show "Insufficient inputs: <list>".
- If table data `verified !== true` → show result with a red UNVERIFIED banner and prefix "indicative only".
- Soldermask is not equivalent to conformal coating; do not credit coating unless a verified rule is encoded and the user selects it.
- Grooves/slots/ribs: implement per standard's width/depth rules only after the rule is verified; otherwise warn.
Data tables live in `src/core/data/iec60664/*.json` with `source, edition, entered, verifiedBy, bannerRequired`. The human enters/verifies values from the licensed standard. Agents must not populate numeric values from memory.
Build fails if a safety table without `verifiedBy` lacks `bannerRequired: true`.
