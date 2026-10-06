---
name: impedance-models
description: Analytical transmission-line models for microstrip, stripline, differential pairs, CPW/CPWG, coax; accuracy classes; mandatory fabricator-stackup verification wording. Use for Phase 2 routing calculators.
---
# Impedance models

Candidate models (each must have ledger entries with citations verified; do not use any until verified):
- Microstrip: Hammerstad-Jensen (with dispersion via Kirschning-Jansen) and thickness correction.
- Stripline: Cohn / Wheeler-type closed forms; asymmetric stripline caveat.
- Edge-coupled differential: coupled-line even/odd mode formulas; show Zdiff = 2·Zodd and note approximations.
- CPW / CPWG: conformal-mapping elliptic-integral forms (implement K(k)/K'(k) via AGM for speed and accuracy).
- Coax: `Z = (60/√εr)·ln(D/d)`.
- IPC-2141 closed forms: older, rougher; implement only as labelled "legacy approximation".

Outputs: Z0, Zdiff, ε_eff, delay (ps/mm or ps/in) = `√ε_eff / c`, guided wavelength = `λ0/√ε_eff`, optional loss estimate (conductor + dielectric) clearly labelled approximate.
Solve for width/spacing with bracketed root-finding; report validity-range checks (w/h, t/h, s/h).
Accuracy: state each model's source accuracy; confidence ≤ medium. Soldermask effect is approximated or flagged.
Mandatory banner: **"Approximate. Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data."**
Protocol presets (USB, LVDS, CAN, RS-485, Ethernet) store source spec + tolerance and are overridable. Do not invent universal values. CAN/RS-485 are mainly termination/routing, not tight controlled impedance.
Antenna note: λ/4 from free space ≠ guided λ/4; warn that geometry, substrate, ground plane, end effects matter.
Cross-check against a field solver or commercial tool (record differences).
