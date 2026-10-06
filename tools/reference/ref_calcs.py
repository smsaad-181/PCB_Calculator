#!/usr/bin/env python3
"""
INDEPENDENT REFERENCE ORACLE for the PCB Calculator Suite.

Purpose: let the `calc-validator` agent recompute values WITHOUT importing or reading the TypeScript
implementation. Do not port logic from src/ into this file. If this file and src/ disagree, neither is
automatically right: investigate against a primary source and record the outcome in docs/sources/LEDGER.md.

Constants are UNVERIFIED until the ledger marks them verified.
Run:  python3 tools/reference/ref_calcs.py            (prints golden vectors, exits non-zero on mismatch)
      python3 tools/reference/ref_calcs.py --json     (machine-readable)
Generate docs/golden-vectors.json:  python3 tools/reference/gen_golden.py   (CI: --check)
"""
import json, math, sys

# ---- constants (verify in docs/sources/LEDGER.md) ----
RHO_CU_20C = 1 / 58e6        # ohm*m, 100 % IACS copper @20C: exact IACS value (S-004, VERIFIED); 1.7241e-8 was a rounding (R-11)
ALPHA_CU = 0.00393           # 1/K at 20C, 100 % IACS copper (S-004, VERIFIED)
# Foil thickness: CHOSEN CONVENTION, not a standard. 1 oz/ft2 = 35 um nominal (S-003, status CONFLICT).
# Alternatives in S-003: 1.35 mil (34.29 um, reported IPC-4562A, secondhand); mass/8890 kg/m3 (34.33 um, S-003d).
FOIL_UM_PER_OZ = 35.0
MIL_PER_OZ = FOIL_UM_PER_OZ / 25.4   # 35 um expressed in mil = 1.37795 (S-006: 1 mil = 25.4 um exactly)
K_EXT, K_INT = 0.048, 0.024  # IPC-2221 legacy coefficients (verify!)
B_DT, C_AREA = 0.44, 0.725   # IPC-2221 exponents (verify!)
MU0 = 4e-7 * math.pi
K_CU_THERMAL = 401.0         # W/m.K: S-007 pure copper default at 300 K (CONFLICT row; 391-394 for C11000; the old 385 had no source, R-10)

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

def foil_spread_pct(oz=1.0):
    """Max relative spread (%) between the three S-003 foil conventions, relative to the thinnest."""
    t = [oz * FOIL_UM_PER_OZ, oz * 1.35 * 25.4, oz_ft2_to_kg_m2(oz) / 8890.0 * 1e6]
    return (max(t) - min(t)) / min(t) * 100.0

def annular_ring(pad, hole):  # same units in/out
    return (pad - hole) / 2.0

def self_heating_converge(I, w_m, t_m, L_m, theta_per_len=None, dT_target=None):
    """Optional: coupled R(T) <-> dT loop for a trace using IPC-2221 dT(I) as the thermal law.
    Returns steady dT such that dT = f(I) with R rising with T. (Illustrative oracle; see skill.)"""
    raise NotImplementedError("Add once the self-heating model is specified in docs/phases/phase-1.md")

# Golden vectors: (name, computed value, pinned expected, rel_tol, ledger ids the value depends on, note).
# `pinned expected` are full-precision literals recorded from this oracle (regression pins; they catch any
# change to the constants/formulas above). Tolerances: exact closed-form math 1e-9 relative; IPC-2221 width
# vectors 1e-6 (closed form GIVEN the coefficients; the empirical uncertainty is in the coefficients
# S-001/S-003, which is a ledger matter, not an arithmetic tolerance).
# docs/golden-vectors.json is GENERATED from this list by tools/reference/gen_golden.py (never edit by hand).
GOLDEN = [
  ("ipc2221_ext_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, 1, True),  11.82624097768917,   1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("ipc2221_ext_3A_dT10_width_mil",  ipc2221_width_mil(3, 10, 1, True),  53.820162727525585,  1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("ipc2221_int_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, 1, False), 30.76525444522158,   1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("trace_R_100x0.3mm_35um_20C_ohm", trace_R(0.1, 0.3e-3, 35e-6, 20),    0.1642036124794746,  1e-9, ("S-004", "S-003"), "convention: 35 um/oz"),
  ("trace_R_same_30C_ohm",           trace_R(0.1, 0.3e-3, 35e-6, 30),    0.17065681444991793, 1e-9, ("S-004", "S-003"), "convention: 35 um/oz"),
  ("via_area_mm2_0.3fin_25um",       via_area_m2(0.3e-3, 25e-6) * 1e6,   0.025525440310417067, 1e-9, (), "pure geometry, no constants"),
  ("via_R_mohm_1.6mm",               via_R(0.3e-3, 25e-6, 1.6e-3) * 1e3, 1.0807338310749393,  1e-9, ("S-004",), ""),
  ("via_theta_KperW_1.6mm",          via_theta(0.3e-3, 25e-6, 1.6e-3),   156.31561646470445, 1e-9, ("S-007",), "k_Cu = 401 W/m.K pure copper default (S-007, CONFLICT row); plating 25 um is a test value, not a default"),
  ("skin_depth_um_10MHz",            skin_depth_m(10e6) * 1e6,           20.89806784938892,  1e-9, ("S-004", "S-013"), "mu_r = 1, mu0 = 4e-7*pi"),
  ("annular_ring_mm_0.6pad_0.3hole", annular_ring(0.6, 0.3),             0.15,               1e-9, (), "pure geometry, no constants"),
  ("foil_spread_pct_1oz",            foil_spread_pct(1.0),               2.070574511519396, 1e-9, ("S-003", "S-003d"), "(35 - 34.29)/34.29; conventions 35 um, 1.35 mil, mass/8890 kg/m3"),
  ("units_oz_ft2_to_kg_m2",         oz_ft2_to_kg_m2(1.0),               0.30515172727394063, 1e-9, ("S-006",), ""),
  ("awg_36_diameter_mm",             awg_diameter_mm(36),                0.127,              1e-9, ("S-005",), ""),
  ("awg_0000_diameter_mm",           awg_diameter_mm(-3),                11.684,             1e-9, ("S-005",), ""),
  ("awg_10_diameter_mm",             awg_diameter_mm(10),                2.5881867280128636, 1e-9, ("S-005",), ""),
  ("awg_20_diameter_mm",             awg_diameter_mm(20),                0.8118209703737738, 1e-9, ("S-005",), ""),
  ("awg_40_diameter_mm",             awg_diameter_mm(40),                0.0798710851323451, 1e-9, ("S-005",), ""),
  ("awg_20_area_mm2",                awg_area_mm2(20),                   0.5176192419280384, 1e-9, ("S-005",), ""),
]

def main():
    rows, bad = [], 0
    for name, got, want, rtol, _ids, _note in GOLDEN:
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
