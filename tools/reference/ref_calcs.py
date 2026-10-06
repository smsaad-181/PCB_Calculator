#!/usr/bin/env python3
"""
INDEPENDENT REFERENCE ORACLE for the PCB Calculator Suite.

Purpose: let the `calc-validator` agent recompute values WITHOUT importing or reading the TypeScript
implementation. Do not port logic from src/ into this file. If this file and src/ disagree, neither is
automatically right: investigate against a primary source and record the outcome in docs/sources/LEDGER.md.

Constants are UNVERIFIED until the ledger marks them verified.
Run:  python3 tools/reference/ref_calcs.py            (prints golden vectors, exits non-zero on mismatch)
      python3 tools/reference/ref_calcs.py --json     (machine-readable)
"""
import json, math, sys

# ---- constants (verify in docs/sources/LEDGER.md) ----
RHO_CU_20C = 1.7241e-8       # ohm*m, 100 % IACS copper @20C (S-004, VERIFIED; = 1/58 uohm*m)
ALPHA_CU = 0.00393           # 1/K at 20C, 100 % IACS copper (S-004, VERIFIED)
# Foil thickness: CHOSEN CONVENTION, not a standard. 1 oz/ft2 = 35 um nominal (S-003, status CONFLICT).
# Alternatives in S-003: 1.35 mil (34.29 um, reported IPC-4562A, secondhand); mass/8890 kg/m3 (34.33 um, S-003d).
FOIL_UM_PER_OZ = 35.0
MIL_PER_OZ = FOIL_UM_PER_OZ / 25.4   # 35 um expressed in mil = 1.37795 (S-006: 1 mil = 25.4 um exactly)
K_EXT, K_INT = 0.048, 0.024  # IPC-2221 legacy coefficients (verify!)
B_DT, C_AREA = 0.44, 0.725   # IPC-2221 exponents (verify!)
MU0 = 4e-7 * math.pi
K_CU_THERMAL = 385.0         # W/m.K (assumption, editable)

# ---- units (S-003, S-005, S-006) ----
OZ_KG = 0.028349523125       # avoirdupois ounce, exact by definition (S-006)
FT_M = 0.3048                # international foot, exact (S-006)

def oz_ft2_to_kg_m2(oz=1.0):
    return oz * OZ_KG / FT_M ** 2

def awg_diameter_mm(n):      # S-005; n: 0000=-3, 000=-2, 00=-1
    return 0.127 * 92.0 ** ((36 - n) / 39.0)

def awg_area_mm2(n):
    return math.pi * awg_diameter_mm(n) ** 2 / 4.0

def ipc2221_area_mil2(I, dT, k):
    return (I / (k * dT ** B_DT)) ** (1.0 / C_AREA)

def ipc2221_width_mil(I, dT, oz, external=True):
    A = ipc2221_area_mil2(I, dT, K_EXT if external else K_INT)
    return A / (oz * MIL_PER_OZ)

def ipc2221_current(width_mil, oz, dT, external=True):
    A = width_mil * oz * MIL_PER_OZ
    return (K_EXT if external else K_INT) * dT ** B_DT * A ** C_AREA

def trace_R(L_m, w_m, t_m, T_c=20.0, rho20=RHO_CU_20C, alpha=ALPHA_CU):
    return rho20 * (1 + alpha * (T_c - 20.0)) * L_m / (w_m * t_m)

def via_area_m2(d_fin_m, plating_m):
    # finished hole = INSIDE diameter after plating -> barrel OD = d + 2t, area = pi*t*(d+t)
    return math.pi * plating_m * (d_fin_m + plating_m)

def via_R(d_fin_m, plating_m, L_m, rho=RHO_CU_20C):
    return rho * L_m / via_area_m2(d_fin_m, plating_m)

def via_theta(d_fin_m, plating_m, L_m, k=K_CU_THERMAL):
    return L_m / (k * via_area_m2(d_fin_m, plating_m))

def skin_depth_m(f_hz, rho=RHO_CU_20C, mu_r=1.0):
    return math.sqrt(rho / (math.pi * f_hz * MU0 * mu_r))

def annular_ring(pad, hole):  # same units in/out
    return (pad - hole) / 2.0

def self_heating_converge(I, w_m, t_m, L_m, theta_per_len=None, dT_target=None):
    """Optional: coupled R(T) <-> dT loop for a trace using IPC-2221 dT(I) as the thermal law.
    Returns steady dT such that dT = f(I) with R rising with T. (Illustrative oracle; see skill.)"""
    raise NotImplementedError("Add once the self-heating model is specified in docs/phases/phase-1.md")

GOLDEN = [
  ("ipc2221_ext_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, 1, True),  11.8262, 0.02),
  ("ipc2221_ext_3A_dT10_width_mil",  ipc2221_width_mil(3, 10, 1, True),  53.8202,  0.03),
  ("ipc2221_int_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, 1, False), 30.7653,  0.03),
  ("trace_R_100x0.3mm_35um_20C_ohm", trace_R(0.1, 0.3e-3, 35e-6, 20),    0.1642, 0.005),
  ("trace_R_same_30C_ohm",           trace_R(0.1, 0.3e-3, 35e-6, 30),    0.170653, 0.005),
  ("via_area_mm2_0.3fin_25um",       via_area_m2(0.3e-3, 25e-6) * 1e6,   0.02553, 0.01),
  ("via_R_mohm_1.6mm",               via_R(0.3e-3, 25e-6, 1.6e-3) * 1e3, 1.08071,  0.02),
  ("via_theta_KperW_1.6mm",          via_theta(0.3e-3, 25e-6, 1.6e-3),   162.8, 0.03),
  ("skin_depth_um_10MHz",            skin_depth_m(10e6) * 1e6,           20.8978,  0.01),
  ("annular_ring_mm_0.6pad_0.3hole", annular_ring(0.6, 0.3),             0.15,  1e-9),
  ("units_oz_ft2_to_kg_m2",         oz_ft2_to_kg_m2(1.0),               0.30515172727394063, 1e-12),
  ("awg_36_diameter_mm",             awg_diameter_mm(36),                0.127, 1e-12),
  ("awg_0000_diameter_mm",           awg_diameter_mm(-3),                11.684, 1e-9),
  ("awg_10_diameter_mm",             awg_diameter_mm(10),                2.5881867280128636, 1e-9),
  ("awg_20_diameter_mm",             awg_diameter_mm(20),                0.8118209703737738, 1e-9),
  ("awg_40_diameter_mm",             awg_diameter_mm(40),                0.0798710851323451, 1e-9),
  ("awg_20_area_mm2",                awg_area_mm2(20),                   0.5176192419280384, 1e-9),
]

def main():
    rows, bad = [], 0
    for name, got, want, rtol in GOLDEN:
        ok = abs(got - want) <= rtol * abs(want) if want else abs(got) <= rtol
        bad += (not ok)
        rows.append({"name": name, "got": got, "expected": want, "rel_tol": rtol, "ok": ok})
    if "--json" in sys.argv:
        print(json.dumps(rows, indent=2))
    else:
        for r in rows:
            print(f"{'OK  ' if r['ok'] else 'FAIL'} {r['name']:36s} got={r['got']:.6g} expected~{r['expected']:.6g} (tol {r['rel_tol']*100:.2f}%)")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
