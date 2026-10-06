# Phase 2 — Routing (objective 1)

## Research first
S-020 Microstrip model (Hammerstad-Jensen + dispersion) · S-021 Stripline model · S-022 Edge-coupled differential models · S-023 CPW/CPWG formulas (elliptic integrals) · S-024 Coax · S-025 IPC-2141 (legacy; mark) · S-026 Protocol specs for presets: USB 2.0/3.x, LVDS, CAN, RS-485, Ethernet (public spec text/app notes; mark where only paywalled) · S-027 Typical FR-4 εr/Df ranges and frequency dependence (fabricator docs) · S-028 Field-solver reference cases for cross-check (public examples)

## Tasks
1. Shared stackup model (layers, εr, Df, h, copper, mask) + editor + fab-profile import/export (JSON).
2. Models per `impedance-models`; elliptic integral via AGM; width/spacing solvers (bracketed).
3. Delay, ε_eff, guided wavelength, skew from length mismatch; λ/4 helper with antenna warning.
4. Differential pair calculators with overridable protocol presets (source + tolerance per preset).
5. Tolerance envelope (corners ≤ 6 inputs, else Monte Carlo worker) and sensitivity readout.
6. Loss estimate (conductor + dielectric) labelled approximate.
7. Cross-check records for X-01 (KiCad), X-02 (Qucs-S transcalc), X-04 (rf-tool) and, if the human approves it, X-06; plus a field solver or fab-supplied impedance data when available. Document differences in `docs/validation/crosscheck-impedance.md`. Formula verification still needs primary sources (S-020..S-025).

## Exit criteria
- [ ] Each model's validity range enforced, with out-of-range warning
- [ ] Differences from reference tools documented and within model-stated accuracy or explained
- [ ] "Verify with fab stackup/TDR" banner on every impedance result
- [ ] Three validator reports PASS/PASS-WITH-CONDITIONS
