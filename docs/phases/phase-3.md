# Phase 3 — Safety spacing

## Human prerequisite
The human must supply or enter the table values from licensed copies of IEC 60664-1 (edition in use) and IPC-2221 spacing table. **Agents must not enter numeric table values from memory.** If not available, build the full gated UI/logic with empty tables and an "INSUFFICIENT DATA" state, and stop.

## Research first
S-030 IEC 60664-1 structure (overvoltage categories → impulse voltage; pollution degrees; material groups/CTI) from public overviews · S-031 IEC 60664-4 high-frequency applicability · S-032 altitude correction factor source · S-033 IPC-2221 spacing table structure · S-034 product standards that may override (62368-1, 61010-1, 60601-1) — list only

## Tasks
1. Data schema + audit for tables (source, edition, entered, verifiedBy, bannerRequired).
2. Clearance and creepage calculators per skill `iec60664-gating`; separate IPC spacing method.
3. Gate: no numeric result without all mandatory inputs; red UNVERIFIED banner otherwise.
4. Always-visible product-standard warning; soldermask ≠ conformal coating rule.
5. Grooves/slots/ribs handled only if verified rule entered, otherwise warning.

## Exit criteria
- [ ] Gating tests: each missing mandatory input blocks output
- [ ] Altitude affects clearance only; creepage ≥ clearance enforced
- [ ] Human has signed `verifiedBy` for any table shipped without banner
- [ ] Three validator reports PASS/PASS-WITH-CONDITIONS
