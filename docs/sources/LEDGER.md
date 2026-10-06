# Source Ledger

Status: `VERIFIED` (two independent sources agree, ≥1 tier 1–3) · `UNVERIFIED` · `PAYWALLED-USER-MUST-VERIFY` · `CONFLICT`.
**Every row below is UNVERIFIED as shipped.** Values were written from memory by an AI that could not browse. Researchers must verify them.

| ID | Item | Value / claim (as remembered) | Where to verify | Status |
|---|---|---|---|---|
| S-001 | IPC-2221 trace current formula | I = k·ΔT^0.44·A^0.725, A mil²; k=0.048 ext, 0.024 int | IPC-2221 (paywalled), KiCad docs, textbooks | UNVERIFIED |
| S-002 | IPC-2152 nature | Chart/data based with correction factors; no official closed form | IPC-2152 (paywalled), published reviews | UNVERIFIED |
| S-003 | Copper foil weight → thickness | 1 oz ≈ 1.378 mil ≈ 35 µm (IPC convention); mass-based ≈ 34 µm | IPC-4562, fab docs | UNVERIFIED |
| S-004 | Copper resistivity/temperature coefficient | ρ=1.724e-8 Ω·m @20 °C, α≈0.0039–0.00393 /°C | NIST/CRC, IACS definition | UNVERIFIED |
| S-005 | AWG diameter | d(mm)=0.127·92^((36−n)/39) | ASTM B258 | UNVERIFIED |
| S-006 | Exact conversions | 1 in=25.4 mm; 1 mil=25.4 µm; °F↔K | NIST SP 811 | UNVERIFIED |
| S-010 | IPC-2221 validity ranges | ~up to 35 A, ΔT up to ~100 °C, 0.5–3 oz (to confirm) | IPC-2221 | UNVERIFIED |
| S-011 | IPC-2152 third-party fits | unknown; decide Mode A model | literature | UNVERIFIED |
| S-012 | Plated copper resistivity | slightly above annealed foil | fab/app notes | UNVERIFIED |
| S-013 | Skin depth | δ=√(ρ/(π f μ0)) ≈ 66 µm/√f(MHz) | EM textbooks | UNVERIFIED |
| S-016 | E-series | IEC 60063 | IEC 60063 / public tables | UNVERIFIED |
| S-020…S-028 | Impedance models and presets | see phase-2 | papers, Wadell, Pozar, Bogatin | UNVERIFIED |
| S-030…S-034 | IEC 60664 / IPC spacing | see phase-3 | licensed standards | PAYWALLED-USER-MUST-VERIFY |
| S-040…S-044 | Thermal/fusing/RF | see phase-4 | JEDEC, app notes, papers | UNVERIFIED |
| S-050 | twc IPC-2152 methods | Unknown. Reported to implement 3 IPC-2152 methods; nature (fit/table/equation) and source to be found. Challenges claim S-002. | github.com/ymic9963/twc README/source (read only) + its cited source | UNVERIFIED |
| S-051 | Cross-check tool licenses | KiCad GPL-3.0, Qucs-S GPL-2.0, twc GPL-3.0, rf-tool GPL-3.0, weeks MIT (as reported by a third-party scan; verify in each repo's LICENSE file) | each repo LICENSE | UNVERIFIED |
