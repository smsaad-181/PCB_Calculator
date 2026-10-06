---
name: iec60664-gating
description: Input gating, structure, and warnings for IEC 60664-1 clearance/creepage and IPC spacing calculators. Use for Phase 3. All table values must be user-verified; never embed from memory.
---
# Clearance & creepage gating

Key relations (verify in ledger, paywalled):
- **Clearance** is driven by *rated impulse withstand voltage* (from overvoltage category + supply voltage), pollution degree, altitude factor.
- **Creepage** is driven by *RMS working voltage*, pollution degree, material group/CTI. It is never derived from voltage alone. Creepage ≥ clearance. Altitude does not scale creepage.
- Frequency above about 30 kHz: IEC 60664-4 applies; show a warning (switching nodes in SMPS often exceed this).
- Insulation types: functional, basic, supplementary, reinforced; reinforced doubles basic requirements per the standard's rules.
- Product standards (IEC 62368-1, 61010-1, 60601-1, etc.) can override. Show always: **"IEC 60664-1 is an insulation-coordination framework; product-specific safety standards may impose additional requirements."**

Gating rules:
- If any mandatory input is missing → no numeric clearance/creepage; show "Insufficient inputs: <list>".
- If table data `verified !== true` → show result with a red UNVERIFIED banner and prefix "indicative only".
- Soldermask is not equivalent to conformal coating; do not credit coating unless a verified rule is encoded and the user selects it.
- Grooves/slots/ribs: implement per standard's width/depth rules only after the rule is verified; otherwise warn.
Data tables live in `src/core/data/iec60664/*.json` with `source, edition, entered, verifiedBy, bannerRequired`. The human enters/verifies values from the licensed standard. Agents must not populate numeric values from memory.
Build fails if a safety table without `verifiedBy` lacks `bannerRequired: true`.
