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

MIL_UM = 25.4                # 1 mil = 25.4 um exactly (S-006)

def _ipc2221_k(layer):
    if layer == "outer":
        return K_EXT
    if layer == "inner":
        return K_INT
    raise ValueError("layer must be 'outer' or 'inner', got " + repr(layer))

def ipc2221_area_mil2(I, dT, k):
    """A [mil2] = (I / (k * dT^0.44))^(1/0.725)  (S-001; I in A, dT in degC rise)."""
    return (I / (k * dT ** B_DT)) ** (1.0 / C_AREA)

def ipc2221_width_mil(I, dT, layer, thickness_um):
    """Minimum width [mil] for current I [A] at rise dT [degC]; copper thickness in um (S-001, S-006)."""
    return ipc2221_area_mil2(I, dT, _ipc2221_k(layer)) / (thickness_um / MIL_UM)

def ipc2221_current_A(width_mil, dT, layer, thickness_um):
    """I [A] = k * dT^0.44 * (w * t)^0.725, w in mil, t in mil (thickness_um / 25.4)."""
    A = width_mil * (thickness_um / MIL_UM)
    return _ipc2221_k(layer) * dT ** B_DT * A ** C_AREA

def ipc2221_dT_C(I, width_mil, layer, thickness_um):
    """dT [degC] = (I / (k * A^0.725))^(1/0.44), A = w * t in mil2."""
    A = width_mil * (thickness_um / MIL_UM)
    return (I / (_ipc2221_k(layer) * A ** C_AREA)) ** (1.0 / B_DT)

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

CU_DENSITY_IACS = 8890.0     # kg/m3, IACS reference density (S-003d, VERIFIED); pure-copper density is a CONFLICT row (S-003e)
FOIL_CONVENTIONS = ("nominal-35um", "nominal-1.35mil", "mass-density")

def copper_thickness_um(oz, convention="nominal-35um"):
    """Foil weight (oz/ft2) -> nominal thickness (um) under a labelled convention (S-003, S-003d, S-006)."""
    if convention == "nominal-35um":
        return oz * FOIL_UM_PER_OZ
    if convention == "nominal-1.35mil":
        return oz * 1.35 * 25.4              # 1 mil = 25.4 um exactly (S-006)
    if convention == "mass-density":
        return oz_ft2_to_kg_m2(oz) / CU_DENSITY_IACS * 1e6
    raise ValueError("unknown convention " + str(convention))

def copper_oz_from_thickness_um(t_um, convention="nominal-35um"):
    """Inverse of copper_thickness_um (all three conventions are linear through the origin)."""
    return t_um / copper_thickness_um(1.0, convention)

def annular_ring(pad, hole):  # same units in/out
    return (pad - hole) / 2.0

# ---- trace resistance with R(T) (Phase 1 task 3). Independent of src/. ----
def rho_at_C(temp_C, rho20=RHO_CU_20C, alpha=ALPHA_CU):
    """rho(T) = rho20 * (1 + alpha * (T - 20 C)), ohm*m; linear coefficient referenced to 20 C (S-004)."""
    return rho20 * (1.0 + alpha * (temp_C - 20.0))

def trace_resistance_ohm(length_mm, width_mm, thickness_um, temp_C, rho20=RHO_CU_20C, alpha=ALPHA_CU):
    """R = rho(T) * L / (w * t); length, width in mm, thickness in um, conductor temperature in degC, rho20 in ohm*m."""
    area_m2 = (width_mm * 1e-3) * (thickness_um * 1e-6)
    return rho_at_C(temp_C, rho20, alpha) * (length_mm * 1e-3) / area_m2

def skin_depth_um(f_hz, rho=RHO_CU_20C):
    """Skin depth in um: sqrt(rho / (pi f mu0)), mu_r = 1, mu0 = 4e-7*pi (S-013). Thin wrapper over skin_depth_m."""
    return skin_depth_m(f_hz, rho) * 1e6

def trace_skin_depth_um(f_hz, temp_C, rho20=RHO_CU_20C, alpha=ALPHA_CU):
    """Skin depth in um using rho(T)."""
    return skin_depth_um(f_hz, rho_at_C(temp_C, rho20, alpha))

def trace_vdrop_V(current_A, length_mm, width_mm, thickness_um, temp_C):
    return current_A * trace_resistance_ohm(length_mm, width_mm, thickness_um, temp_C)

def trace_power_W(current_A, length_mm, width_mm, thickness_um, temp_C):
    return current_A ** 2 * trace_resistance_ohm(length_mm, width_mm, thickness_um, temp_C)

def _g(x):
    return format(x, "g")

# Case tables mirrored (by construction of the vector names) in src/core/calculators/trace-resistance/calc.test.ts.
# (length mm, width mm, thickness um, conductor temperature degC)
TRACE_R_CASES = [
    (10, 0.1, 17.5, 20), (100, 0.254, 35, 20), (100, 0.254, 35, 25), (100, 0.254, 35, 55), (100, 0.254, 35, 85),
    (100, 0.254, 35, 125), (1000, 1, 70, 20), (1000, 1, 70, 85), (1000, 5, 105, 125), (10, 5, 105, 25),
    (10, 0.1, 105, 55), (1000, 0.1, 17.5, 125), (100, 1, 17.5, 85), (100, 5, 70, 55), (10, 1, 35, 125),
    (1000, 0.254, 105, 25), (100, 0.1, 70, 20), (10, 0.254, 17.5, 85), (1000, 5, 35, 55), (100, 1, 105, 125),
]
# overrides: (L mm, w mm, t um, T degC, rho20 in uohm.cm or None, alpha or None); 1 uohm.cm = 1e-8 ohm.m exactly
TRACE_R_OVERRIDE_CASES = [
    (100, 0.254, 35, 25, 1.9, None), (100, 0.254, 35, 85, 1.9, 0.00357), (100, 0.254, 35, 125, None, 0.0039),
    (1000, 1, 70, 55, 2.2, 0.0035), (10, 0.1, 17.5, 20, 1.7, 0.004),
]
# (frequency Hz, conductor temperature degC)
TRACE_SKIN_CASES = [(1e5, 55), (1e6, 20), (1e7, 85), (1e8, 125), (1e9, 25)]
# (current A, L mm, w mm, t um, T degC)
TRACE_VDROP_CASES = [(3, 100, 0.254, 35, 85), (10, 1000, 1, 70, 25)]

def _tr_name(L, w, t, T, rho=None, alpha=None):
    n = "trace_resistance_ohm_L%smm_w%smm_t%sum_T%sC" % (_g(L), _g(w), _g(t), _g(T))
    if rho is not None:
        n += "_rho%suohmcm" % _g(rho)
    if alpha is not None:
        n += "_alpha%s" % _g(alpha)
    return n

def _trace_vectors():
    out = []
    for L, w, t, T in TRACE_R_CASES:
        out.append((_tr_name(L, w, t, T), trace_resistance_ohm(L, w, t, T), 1e-9, ("S-004", "S-006"),
                    "R = rho(T) L/(w t), rho(T) = rho20 (1 + alpha (T - 20)); default rho20 = 1/58e6, alpha = 0.00393"))
    for L, w, t, T, rho, alpha in TRACE_R_OVERRIDE_CASES:
        kw = {}
        if rho is not None:
            kw["rho20"] = rho * 1e-8
        if alpha is not None:
            kw["alpha"] = alpha
        out.append((_tr_name(L, w, t, T, rho, alpha), trace_resistance_ohm(L, w, t, T, **kw), 1e-9,
                    ("S-004", "S-006", "S-012") if rho is not None else ("S-004", "S-006"),
                    "user override of rho20 and/or alpha (explicit inputs; plated copper S-012 is UNVERIFIED); the oracle value tests arithmetic only"))
    for f, T in TRACE_SKIN_CASES:
        out.append(("trace_skin_depth_um_f%dHz_T%sC" % (int(f), _g(T)), trace_skin_depth_um(f, T), 1e-9, ("S-004", "S-013"),
                    "delta = sqrt(rho(T)/(pi f mu0)), mu0 = 4e-7*pi; rho(T) linear from 20 C"))
    for I, L, w, t, T in TRACE_VDROP_CASES:
        out.append(("trace_vdrop_V_I%sA_L%smm_w%smm_t%sum_T%sC" % (_g(I), _g(L), _g(w), _g(t), _g(T)),
                    trace_vdrop_V(I, L, w, t, T), 1e-9, ("S-004", "S-006"), "V = I R(T)"))
        out.append(("trace_power_W_I%sA_L%smm_w%smm_t%sum_T%sC" % (_g(I), _g(L), _g(w), _g(t), _g(T)),
                    trace_power_W(I, L, w, t, T), 1e-9, ("S-004", "S-006"), "P = I^2 R(T)"))
    return out

# Golden vectors: (name, computed value, pinned expected, rel_tol, ledger ids the value depends on, note).
# `pinned expected` are full-precision literals recorded from this oracle (regression pins; they catch any
# change to the constants/formulas above). Tolerances: exact closed-form math 1e-9 relative; IPC-2221 width
# vectors 1e-6 (closed form GIVEN the coefficients; the empirical uncertainty is in the coefficients
# S-001/S-003, which is a ledger matter, not an arithmetic tolerance).
# docs/golden-vectors.json is GENERATED from this list by tools/reference/gen_golden.py (never edit by hand).
GOLDEN = [
  ("ipc2221_ext_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, "outer", 35.0),  11.82624097768917,   1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("ipc2221_ext_3A_dT10_width_mil",  ipc2221_width_mil(3, 10, "outer", 35.0),  53.820162727525585,  1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("ipc2221_int_1A_dT10_width_mil",  ipc2221_width_mil(1, 10, "inner", 35.0), 30.76525444522158,   1e-6, ("S-001", "S-003"), "convention: 35 um/oz"),
  ("ipc2221_width_mil_outer_1A_dT10C_0.5oz", ipc2221_width_mil(1, 10, "outer", 35.0 * 0.5), 23.65248195537834, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 0.5 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_1A_dT10C_2oz", ipc2221_width_mil(1, 10, "outer", 35.0 * 2), 5.913120488844585, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 2 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_1A_dT10C_3oz", ipc2221_width_mil(1, 10, "outer", 35.0 * 3), 3.9420803258963892, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 3 oz at 35 um/oz"),
  ("ipc2221_width_mil_inner_3A_dT10C_1oz", ipc2221_width_mil(3, 10, "inner", 35.0 * 1), 140.00991555298867, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; inner; 1 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_10A_dT30C_2oz", ipc2221_width_mil(10, 30, "outer", 35.0 * 2), 72.70492471716675, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 2 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_20A_dT50C_3oz", ipc2221_width_mil(20, 50, "outer", 35.0 * 3), 92.47984986023936, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 3 oz at 35 um/oz"),
  ("ipc2221_width_mil_inner_5A_dT20C_0.5oz", ipc2221_width_mil(5, 20, "inner", 35.0 * 0.5), 371.9572244351801, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; inner; 0.5 oz at 35 um/oz"),
  ("ipc2221_width_mil_inner_2A_dT20C_2oz", ipc2221_width_mil(2, 20, "inner", 35.0 * 2), 26.275454465722817, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; inner; 2 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_35A_dT100C_3oz", ipc2221_width_mil(35, 100, "outer", 35.0 * 3), 131.3947292703504, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 3 oz at 35 um/oz"),
  ("ipc2221_width_mil_outer_0.5A_dT10C_1oz", ipc2221_width_mil(0.5, 10, "outer", 35.0 * 1), 4.546036695760122, 1e-9, ("S-001", "S-003", "S-006"), "width [mil] from I and dT; outer; 1 oz at 35 um/oz"),
  ("ipc2221_current_A_outer_w20mil_dT10C_1oz", ipc2221_current_A(20, 10, "outer", 35.0 * 1), 1.4636352884345563, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; outer; 1 oz at 35 um/oz"),
  ("ipc2221_current_A_outer_w50mil_dT30C_2oz", ipc2221_current_A(50, 30, "outer", 35.0 * 2), 7.622886914429655, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; outer; 2 oz at 35 um/oz"),
  ("ipc2221_current_A_outer_w100mil_dT50C_3oz", ipc2221_current_A(100, 50, "outer", 35.0 * 3), 21.166343340289462, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; outer; 3 oz at 35 um/oz"),
  ("ipc2221_current_A_inner_w30mil_dT20C_0.5oz", ipc2221_current_A(30, 20, "inner", 35.0 * 0.5), 0.8058894867745958, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; inner; 0.5 oz at 35 um/oz"),
  ("ipc2221_current_A_inner_w200mil_dT40C_2oz", ipc2221_current_A(200, 40, "inner", 35.0 * 2), 11.818327461436601, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; inner; 2 oz at 35 um/oz"),
  ("ipc2221_current_A_outer_w10mil_dT10C_0.5oz", ipc2221_current_A(10, 10, "outer", 35.0 * 0.5), 0.5357218724695709, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; outer; 0.5 oz at 35 um/oz"),
  ("ipc2221_current_A_outer_w400mil_dT100C_3oz", ipc2221_current_A(400, 100, "outer", 35.0 * 3), 78.44992421193986, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; outer; 3 oz at 35 um/oz"),
  ("ipc2221_current_A_inner_w12mil_dT10C_1oz", ipc2221_current_A(12, 10, "inner", 35.0 * 1), 0.5053153984819593, 1e-9, ("S-001", "S-003", "S-006"), "current [A] from width [mil] and dT; inner; 1 oz at 35 um/oz"),
  ("ipc2221_dT_C_outer_1A_w12mil_1oz", ipc2221_dT_C(1, 12, "outer", 35.0 * 1), 9.76253121548664, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; outer; 1 oz at 35 um/oz"),
  ("ipc2221_dT_C_outer_3A_w40mil_1oz", ipc2221_dT_C(3, 40, "outer", 35.0 * 1), 16.306747805554735, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; outer; 1 oz at 35 um/oz"),
  ("ipc2221_dT_C_outer_10A_w150mil_2oz", ipc2221_dT_C(10, 150, "outer", 35.0 * 2), 9.09632210112523, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; outer; 2 oz at 35 um/oz"),
  ("ipc2221_dT_C_inner_5A_w60mil_1oz", ipc2221_dT_C(5, 60, "inner", 35.0 * 1), 128.99645317208393, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; inner; 1 oz at 35 um/oz"),
  ("ipc2221_dT_C_outer_2A_w20mil_0.5oz", ipc2221_dT_C(2, 20, "outer", 35.0 * 0.5), 63.70750767082846, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; outer; 0.5 oz at 35 um/oz"),
  ("ipc2221_dT_C_inner_8A_w100mil_2oz", ipc2221_dT_C(8, 100, "inner", 35.0 * 2), 51.6327494460789, 1e-9, ("S-001", "S-003", "S-006"), "temperature rise [degC] from I and width [mil]; inner; 2 oz at 35 um/oz"),
  ("trace_R_100x0.3mm_35um_20C_ohm", trace_R(0.1, 0.3e-3, 35e-6, 20),    0.1642036124794746,  1e-9, ("S-004", "S-003"), "convention: 35 um/oz"),
  ("trace_R_same_30C_ohm",           trace_R(0.1, 0.3e-3, 35e-6, 30),    0.17065681444991793, 1e-9, ("S-004", "S-003"), "convention: 35 um/oz"),
  ("via_area_mm2_0.3fin_25um",       via_area_m2(0.3e-3, 25e-6) * 1e6,   0.025525440310417067, 1e-9, (), "pure geometry, no constants"),
  ("via_R_mohm_1.6mm",               via_R(0.3e-3, 25e-6, 1.6e-3) * 1e3, 1.0807338310749393,  1e-9, ("S-004",), ""),
  ("via_theta_KperW_1.6mm",          via_theta(0.3e-3, 25e-6, 1.6e-3),   156.31561646470445, 1e-9, ("S-007",), "k_Cu = 401 W/m.K pure copper default (S-007, CONFLICT row); plating 25 um is a test value, not a default"),
  ("skin_depth_um_10MHz",            skin_depth_m(10e6) * 1e6,           20.89806784938892,  1e-9, ("S-004", "S-013"), "mu_r = 1, mu0 = 4e-7*pi"),
  ("annular_ring_mm_0.6pad_0.3hole", annular_ring(0.6, 0.3),             0.15,               1e-9, (), "pure geometry, no constants"),
  ("foil_spread_pct_1oz",            foil_spread_pct(1.0),               2.070574511519396, 1e-9, ("S-003", "S-003d"), "(35 - 34.29)/34.29; conventions 35 um, 1.35 mil, mass/8890 kg/m3"),
  ("units_oz_ft2_to_kg_m2",         oz_ft2_to_kg_m2(1.0),               0.30515172727394063, 1e-9, ("S-006",), ""),
  ("copper_um_1oz_nominal-35um",        copper_thickness_um(1, "nominal-35um"),     35.0,               1e-9, ("S-003",), "chosen convention 35 um per oz/ft2"),
  ("copper_um_2oz_nominal-35um",        copper_thickness_um(2, "nominal-35um"),     70.0,               1e-9, ("S-003",), "chosen convention 35 um per oz/ft2"),
  ("copper_um_0.5oz_nominal-35um",      copper_thickness_um(0.5, "nominal-35um"),   17.5,               1e-9, ("S-003",), "chosen convention 35 um per oz/ft2"),
  ("copper_um_1oz_nominal-1.35mil",     copper_thickness_um(1, "nominal-1.35mil"),  34.29,              1e-9, ("S-003", "S-006"), "1.35 mil x 25.4 um/mil, reported IPC-4562A (secondhand)"),
  ("copper_um_2oz_nominal-1.35mil",     copper_thickness_um(2, "nominal-1.35mil"),  68.58,              1e-9, ("S-003", "S-006"), "1.35 mil x 25.4 um/mil, reported IPC-4562A (secondhand)"),
  ("copper_um_0.5oz_nominal-1.35mil",   copper_thickness_um(0.5, "nominal-1.35mil"), 17.145,            1e-9, ("S-003", "S-006"), "1.35 mil x 25.4 um/mil, reported IPC-4562A (secondhand)"),
  ("copper_um_1oz_mass-density",        copper_thickness_um(1, "mass-density"),     34.32527865848601,  1e-9, ("S-003", "S-003d", "S-006"), "areal mass (0.028349523125/0.09290304 kg/m2) / 8890 kg/m3"),
  ("copper_um_2oz_mass-density",        copper_thickness_um(2, "mass-density"),     68.65055731697203,  1e-9, ("S-003", "S-003d", "S-006"), "areal mass / 8890 kg/m3"),
  ("copper_um_0.5oz_mass-density",      copper_thickness_um(0.5, "mass-density"),   17.162639329243007, 1e-9, ("S-003", "S-003d", "S-006"), "areal mass / 8890 kg/m3"),
  ("copper_oz_35um_nominal-35um",       copper_oz_from_thickness_um(35, "nominal-35um"),   1.0,                1e-9, ("S-003",), "thickness -> weight"),
  ("copper_oz_17.5um_nominal-35um",     copper_oz_from_thickness_um(17.5, "nominal-35um"), 0.5,                1e-9, ("S-003",), "thickness -> weight"),
  ("copper_oz_70um_nominal-35um",       copper_oz_from_thickness_um(70, "nominal-35um"),   2.0,                1e-9, ("S-003",), "thickness -> weight"),
  ("copper_oz_35um_nominal-1.35mil",    copper_oz_from_thickness_um(35, "nominal-1.35mil"),   1.020705745115194, 1e-9, ("S-003", "S-006"), "thickness -> weight"),
  ("copper_oz_17.5um_nominal-1.35mil",  copper_oz_from_thickness_um(17.5, "nominal-1.35mil"), 0.510352872557597, 1e-9, ("S-003", "S-006"), "thickness -> weight"),
  ("copper_oz_70um_nominal-1.35mil",    copper_oz_from_thickness_um(70, "nominal-1.35mil"),   2.041411490230388, 1e-9, ("S-003", "S-006"), "thickness -> weight"),
  ("copper_oz_35um_mass-density",       copper_oz_from_thickness_um(35, "mass-density"),   1.019656689410362, 1e-9, ("S-003", "S-003d", "S-006"), "thickness -> weight"),
  ("copper_oz_17.5um_mass-density",     copper_oz_from_thickness_um(17.5, "mass-density"), 0.509828344705181, 1e-9, ("S-003", "S-003d", "S-006"), "thickness -> weight"),
  ("copper_oz_70um_mass-density",       copper_oz_from_thickness_um(70, "mass-density"),   2.039313378820724, 1e-9, ("S-003", "S-003d", "S-006"), "thickness -> weight"),
  ("awg_36_diameter_mm",            awg_diameter_mm(36),                0.127,              1e-9, ("S-005",), ""),
  ("awg_0000_diameter_mm",           awg_diameter_mm(-3),                11.684,             1e-9, ("S-005",), ""),
  ("awg_10_diameter_mm",             awg_diameter_mm(10),                2.5881867280128636, 1e-9, ("S-005",), ""),
  ("awg_20_diameter_mm",             awg_diameter_mm(20),                0.8118209703737738, 1e-9, ("S-005",), ""),
  ("awg_40_diameter_mm",             awg_diameter_mm(40),                0.0798710851323451, 1e-9, ("S-005",), ""),
  ("awg_20_area_mm2",                awg_area_mm2(20),                   0.5176192419280384, 1e-9, ("S-005",), ""),
]

# Pinned literals recorded from this oracle (regression pins, same policy as the GOLDEN list above).
_TRACE_PINNED = {
    'trace_resistance_ohm_L10mm_w0.1mm_t17.5um_T20C': 0.09852216748768473,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T20C': 0.1939412745820566,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T25C': 0.19775222062759398,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T55C': 0.2206178969008185,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T85C': 0.24348357317404298,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T125C': 0.27397114153834223,
    'trace_resistance_ohm_L1000mm_w1mm_t70um_T20C': 0.24630541871921188,
    'trace_resistance_ohm_L1000mm_w1mm_t70um_T85C': 0.30922413793103454,
    'trace_resistance_ohm_L1000mm_w5mm_t105um_T125C': 0.04639244663382595,
    'trace_resistance_ohm_L10mm_w5mm_t105um_T25C': 0.0003348604269293925,
    'trace_resistance_ohm_L10mm_w0.1mm_t105um_T55C': 0.01867898193760263,
    'trace_resistance_ohm_L1000mm_w0.1mm_t17.5um_T125C': 13.917733990147784,
    'trace_resistance_ohm_L100mm_w1mm_t17.5um_T85C': 0.12368965517241383,
    'trace_resistance_ohm_L100mm_w5mm_t70um_T55C': 0.005603694581280789,
    'trace_resistance_ohm_L10mm_w1mm_t35um_T125C': 0.006958866995073892,
    'trace_resistance_ohm_L1000mm_w0.254mm_t105um_T25C': 0.6591740687586466,
    'trace_resistance_ohm_L100mm_w0.1mm_t70um_T20C': 0.24630541871921185,
    'trace_resistance_ohm_L10mm_w0.254mm_t17.5um_T85C': 0.04869671463480859,
    'trace_resistance_ohm_L1000mm_w5mm_t35um_T55C': 0.11207389162561578,
    'trace_resistance_ohm_L100mm_w1mm_t105um_T125C': 0.023196223316912977,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T25C_rho1.9uohmcm': 0.21792294713160856,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T85C_rho1.9uohmcm_alpha0.00357': 0.26331777277840274,
    'trace_resistance_ohm_L100mm_w0.254mm_t35um_T125C_alpha0.0039': 0.2733602265234088,
    'trace_resistance_ohm_L1000mm_w1mm_t70um_T55C_rho2.2uohmcm_alpha0.0035': 0.35278571428571437,
    'trace_resistance_ohm_L10mm_w0.1mm_t17.5um_T20C_rho1.7uohmcm_alpha0.004': 0.09714285714285716,
    'trace_skin_depth_um_f100000Hz_T55C': 222.89040956876843,
    'trace_skin_depth_um_f1000000Hz_T20C': 66.08549310080564,
    'trace_skin_depth_um_f10000000Hz_T85C': 23.415629911539728,
    'trace_skin_depth_um_f100000000Hz_T125C': 7.854588217447649,
    'trace_skin_depth_um_f1000000000Hz_T25C': 2.1102392504180014,
    'trace_vdrop_V_I3A_L100mm_w0.254mm_t35um_T85C': 0.7304507195221289,
    'trace_power_W_I3A_L100mm_w0.254mm_t35um_T85C': 2.191352158566387,
    'trace_vdrop_V_I10A_L1000mm_w1mm_t70um_T25C': 2.5114532019704434,
    'trace_power_W_I10A_L1000mm_w1mm_t70um_T25C': 25.114532019704434,
}
GOLDEN.extend(
    (n, got, _TRACE_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _trace_vectors()
)

# ---- circuit values, first slice (Phase 1 task 8): Ohm/power, divider, E-series. Independent of src/. ----
# These vectors test an implementation against formulas; they verify nothing in the ledger. S-016 (E-series,
# PAYWALLED-USER-MUST-VERIFY) is read from docs/sources/LEDGER.md and compared with the 10^(n/N) definition; the
# published lists themselves are NOT verified by this code.
import os, re
from decimal import Decimal, getcontext, ROUND_HALF_EVEN
from fractions import Fraction

def ohm_solve(v=None, i=None, r=None, p=None):
    """Exactly two of V, I, R, P given -> all four (V = I R; P = V I = I^2 R = V^2 / R)."""
    given = {k: x for k, x in (("v", v), ("i", i), ("r", r), ("p", p)) if x is not None}
    if len(given) != 2:
        raise ValueError("give exactly two of v, i, r, p")
    keys = "".join(sorted(given))
    if keys == "iv":
        r = v / i
        p = v * i
    elif keys == "rv":
        i = v / r
        p = v * v / r
    elif keys == "pv":
        i = p / v
        r = v * v / p
    elif keys == "ir":
        v = i * r
        p = i * i * r
    elif keys == "ip":
        v = p / i
        r = p / (i * i)
    elif keys == "pr":
        v = math.sqrt(p * r)
        i = math.sqrt(p / r)
    return {"v": v, "i": i, "r": r, "p": p}

def par(a, b):
    return a * b / (a + b)

def divider_vout(vin, r1, r2, rl=None):
    """Vout = Vin Re / (R1 + Re), Re = R2 || RL when a load RL is across R2 (Re = R2 unloaded)."""
    r2e = r2 if rl is None else par(r2, rl)
    return vin * r2e / (r1 + r2e)

def divider_solve_r1(vin, target, r2, rl=None):
    """R1 so that the (loaded) Vout equals target: R1 = Re (Vin - target) / target."""
    r2e = r2 if rl is None else par(r2, rl)
    return r2e * (vin - target) / target

def divider_solve_r2(vin, target, r1, rl=None):
    """R2 so that the (loaded) Vout equals target. Needs RL > Re (the required R2 || RL)."""
    r2e = r1 * target / (vin - target)
    if rl is None:
        return r2e
    if rl <= r2e:
        raise ValueError("load too heavy: RL <= required Re")
    return r2e * rl / (rl - r2e)

def divider_currents_powers(vin, r1, r2, rl=None):
    """Current through R1 and the powers; total power = Vin x I(R1), which includes the load."""
    vout = divider_vout(vin, r1, r2, rl)
    i1 = (vin - vout) / r1
    out = {"vout": vout, "i": i1, "p_r1": i1 * i1 * r1, "p_r2": vout * vout / r2, "p_total": vin * i1, "rout": par(r1, r2)}
    if rl is not None:
        out["p_load"] = vout * vout / rl
    return out

def divider_envelope(vin, r1, r2, rl=None, tol=0.0, vin_tol=0.0, load_tol=0.0):
    """Corner analysis (Vout is monotonic in every input): (min, typ, max) over Vin(1+-vin_tol), r1 and r2 at (1+-tol), rl at (1+-load_tol).
    The load tolerance is its own input (default 0: unspecified, NOT the resistor tolerance). Initial-tolerance corners only: TCR and leakage excluded."""
    vs = (vin * (1 - vin_tol), vin * (1 + vin_tol))
    a = (r1 * (1 - tol), r1 * (1 + tol))
    b = (r2 * (1 - tol), r2 * (1 + tol))
    c = (None,) if rl is None else (rl * (1 - load_tol), rl * (1 + load_tol))
    vals = [divider_vout(x, y, z, w) for x in vs for y in a for z in b for w in c]
    return min(vals), divider_vout(vin, r1, r2, rl), max(vals)

# ---- E-series (S-016). Lists E3..E96 are read from the ledger text (not typed here); E48 = every second E96;
# E192 = the 10^(n/192) definition rounded to 3 s.f. with the single published exception n = 185 (9.20; formula 9.19).
getcontext().prec = 60
_LN10 = Decimal(10).ln()
_LEDGER_MD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "sources", "LEDGER.md")

def eseries_formula(n, N, sig):
    """round_half_even(10^(n/N), sig significant figures) as a decimal string; exact-decimal arithmetic, no float."""
    v = (Decimal(n) / Decimal(N) * _LN10).exp()
    return str(v.quantize(Decimal(1).scaleb(-(sig - 1)), rounding=ROUND_HALF_EVEN))

def _ledger_s016_row():
    with open(_LEDGER_MD, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("| S-016"):
                return line
    raise RuntimeError("ledger row S-016 not found")

_ES_SIZES = {"E3": 3, "E6": 6, "E12": 12, "E24": 24, "E48": 48, "E96": 96, "E192": 192}
_ES_SIG = {"E3": 2, "E6": 2, "E12": 2, "E24": 2, "E48": 3, "E96": 3, "E192": 3}
_ES_NEXT = {"E3": "E6", "E6": "E12", "E12": "E24", "E24": "E96", "E96": "E48"}
_E192_PUBLISHED_EXCEPTIONS = {185: "9.20"}

def eseries_strings(name):
    """Mantissa strings (decade 1.0 .. 9.xx) of a series (E3-E96 from the ledger row S-016)."""
    if name in _ES_NEXT:
        m = re.search(name + r": ([0-9. ]+?)\. " + _ES_NEXT[name], _ledger_s016_row())
        out = m.group(1).split()
    elif name == "E48":
        out = eseries_strings("E96")[::2]
    elif name == "E192":
        out = [_E192_PUBLISHED_EXCEPTIONS.get(n, eseries_formula(n, 192, 3)) for n in range(192)]
    else:
        raise ValueError("unknown series " + repr(name))
    if len(out) != _ES_SIZES[name]:
        raise RuntimeError("series %s has %d values, expected %d" % (name, len(out), _ES_SIZES[name]))
    return out

def eseries_formula_deviations(name):
    """[(n, published, formula)] where the list differs from round(10^(n/N)) (2 s.f. for E3-E24, 3 s.f. for E48-E192)."""
    N = _ES_SIZES[name]
    sig = _ES_SIG[name]
    return [(n, s, eseries_formula(n, N, sig)) for n, s in enumerate(eseries_strings(name))
            if Decimal(s) != Decimal(eseries_formula(n, N, sig))]

def eseries_values(name):
    return [float(s) for s in eseries_strings(name)]

def _decade_of(x):
    """floor(log10(x)) for a positive Fraction, exact."""
    d = 0
    while x >= 10:
        x /= 10
        d += 1
    while x < 1:
        x *= 10
        d -= 1
    return d

def eseries_nearest(value, name, mode="nearest"):
    """Nearest series value to a positive float, in exact arithmetic on the shortest decimal repr of the double.
    nearest: minimum |found - target|, a tie goes UP; up: smallest >= target; down: largest <= target.
    Returns (found, mantissa, decade, error_percent), error_percent = (found - target)/target x 100."""
    t = Fraction(repr(float(value)))
    d0 = _decade_of(t)
    cands = sorted((Fraction(s) * Fraction(10) ** d, float(s), d) for d in (d0 - 1, d0, d0 + 1) for s in eseries_strings(name))
    if mode == "up":
        c = next(x for x in cands if x[0] >= t)
    elif mode == "down":
        c = [x for x in cands if x[0] <= t][-1]
    else:
        best = min(abs(x[0] - t) for x in cands)
        c = [x for x in cands if abs(x[0] - t) == best][-1]
    return float(c[0]), c[1], c[2], float((c[0] - t) / t * 100)

def eseries_max_nearest_error_pct(name):
    """Largest |error %| the nearest rule can produce, at the midpoint of the widest relative gap (tie goes up)."""
    vals = [Fraction(s) for s in eseries_strings(name)] + [Fraction(10)]
    worst = Fraction(0)
    for a, b in zip(vals, vals[1:]):
        mid = (a + b) / 2
        worst = max(worst, (b - mid) / mid)
    return float(worst * 100)

def _digits(s):
    """Significant digits of a mantissa string, trailing zeros stripped: 1.00 -> 1, 4.70 -> 2, 4.75 -> 3."""
    return len(s.replace(".", "").rstrip("0")) or 1

def best_pairs(target, name, topology, n=5, decades=3, low_decade=None):
    """Exhaustive two-resistor search in exact arithmetic. series: r1 + r2; parallel: r1 r2/(r1 + r2); divider-ratio: r2/(r1 + r2).
    Window: `decades` decades of series values from low_decade (default: series dec(target) - decades + 1; parallel dec(target);
    divider-ratio 3). series and parallel enumerate each unordered pair once (r1 <= r2); divider-ratio enumerates ordered pairs.
    Order: |error| exact, then total significant digits (fewer first), then r1, then r2 ascending.
    Returns [(r1, r2, value, error_percent)]."""
    t = Fraction(repr(float(target)))
    if low_decade is None:
        low_decade = {"series": _decade_of(t) - decades + 1, "parallel": _decade_of(t), "divider-ratio": 3}[topology]
    strs = eseries_strings(name)
    vals = sorted((Fraction(s) * Fraction(10) ** d, _digits(s)) for d in range(low_decade, low_decade + decades) for s in strs)
    rows = []
    for ia, (a, da) in enumerate(vals):
        for ib, (b, db) in enumerate(vals):
            if topology != "divider-ratio" and ib < ia:
                continue
            v = a + b if topology == "series" else (a * b / (a + b) if topology == "parallel" else b / (a + b))
            err = (v - t) / t
            rows.append((abs(err), da + db, a, b, v, err))
    rows.sort(key=lambda x: (x[0], x[1], x[2], x[3]))
    return [(float(a), float(b), float(v), float(e * 100)) for _ae, _d, a, b, v, e in rows[:n]]

# Case tables are mirrored in the TypeScript tests (vector names use the case index, so number formatting cannot drift).
OHM_CASES = [  # (pair, givens); the vectors are the two quantities NOT given
    ("VI", {"v": 12.0, "i": 0.5}), ("VI", {"v": 3.3, "i": 0.02}),
    ("VR", {"v": 5.0, "r": 330.0}), ("VR", {"v": 24.0, "r": 4700.0}),
    ("VP", {"v": 12.0, "p": 6.0}), ("VP", {"v": 230.0, "p": 1000.0}),
    ("IR", {"i": 0.02, "r": 150.0}), ("IR", {"i": 3.0, "r": 0.05}),
    ("IP", {"i": 2.0, "p": 10.0}), ("IP", {"i": 0.001, "p": 0.25}),
    ("RP", {"r": 100.0, "p": 0.25}), ("RP", {"r": 4700.0, "p": 1.0}),
]
OHM_UNIT = {"v": "V", "i": "A", "r": "ohm", "p": "W"}
DIV_UNLOADED = [(5.0, 10e3, 10e3), (12.0, 47e3, 10e3), (3.3, 2.2e3, 1e3), (24.0, 100e3, 6.8e3), (48.0, 220e3, 4.7e3), (1.8, 1e3, 2e3)]
DIV_LOADED = [(5.0, 10e3, 10e3, 100e3), (12.0, 47e3, 10e3, 10e3), (3.3, 2.2e3, 1e3, 4.7e3), (24.0, 100e3, 6.8e3, 1e6), (5.0, 1e3, 1e3, 1e3)]
DIV_SOLVE_R1 = [(12.0, 3.3, 10e3, None), (5.0, 1.8, 10e3, None), (24.0, 5.0, 4.7e3, None), (3.3, 1.25, 10e3, None), (12.0, 3.3, 10e3, 100e3)]
DIV_SOLVE_R2 = [(12.0, 3.3, 47e3, None), (5.0, 3.3, 10e3, None), (24.0, 5.0, 100e3, None), (5.0, 2.5, 10e3, 100e3)]
DIV_POWER = [(12.0, 47e3, 10e3, None), (12.0, 47e3, 10e3, 100e3), (5.0, 330.0, 330.0, None)]
# snapping: (solveFor, vin, target, the given resistor); the ideal resistor is solved UNLOADED, then snapped
DIV_SNAP_CASES = [("r1", 12.0, 3.3, 10e3), ("r2", 12.0, 3.3, 47e3)]
DIV_SNAP_SERIES = ("E24", "E96", "E192")
SNAP_MODES = ("nearest", "up", "down")
# envelope: (vin, r1, r2, rl, tolerance, vin tolerance, load tolerance); load tolerance 0 = unspecified (own input, not the resistor tolerance)
DIV_ENV = [(5.0, 10e3, 10e3, None, 0.01, 0.0, 0.0), (12.0, 47e3, 10e3, None, 0.05, 0.0, 0.0), (12.0, 47e3, 10e3, 100e3, 0.01, 0.02, 0.0),
           (3.3, 2.2e3, 1e3, 4.7e3, 0.001, 0.0, 0.0), (5.0, 10e3, 10e3, None, 0.1, 0.05, 0.0), (12.0, 47e3, 10e3, 100e3, 0.01, 0.02, 0.01)]
NEAREST_TARGETS = [9.8, 0.97, 4700.0, 26363.636363636364, 1.234e-9, 8.6e5]
PAIR_CASES = [  # (topology, series, target, n, decades)
    ("series", "E24", 3000.0, 5, 3), ("series", "E96", 12345.0, 5, 3), ("parallel", "E96", 1234.0, 5, 3),
    ("parallel", "E24", 1500.0, 5, 3), ("divider-ratio", "E96", 0.2, 5, 3), ("divider-ratio", "E24", 0.25, 5, 2),
]

def divider_snap(kind, vin, target, other, series, mode):
    """Solve the ideal resistor unloaded, snap it, return (snapped ohm, Vout V, error fraction vs target)."""
    ideal = divider_solve_r1(vin, target, other) if kind == "r1" else divider_solve_r2(vin, target, other)
    snapped = eseries_nearest(ideal, series, mode)[0]
    vout = divider_vout(vin, snapped, other) if kind == "r1" else divider_vout(vin, other, snapped)
    return snapped, vout, (vout - target) / target

def _circuit_vectors():
    out = []
    S6 = ("S-019",)
    S616 = ("S-019", "S-016")
    for ci, (pair, given) in enumerate(OHM_CASES):
        sol = ohm_solve(**given)
        for k in ("v", "i", "r", "p"):
            if k not in given:
                out.append(("ohm_%s_c%d_%s" % (pair, ci, OHM_UNIT[k]), sol[k], 1e-9, S6, "V = I R; P = V I = I^2 R = V^2/R; solved from the two givens"))
    for ci, (vin, r1, r2) in enumerate(DIV_UNLOADED):
        out.append(("divider_unloaded_c%d_vout_V" % ci, divider_vout(vin, r1, r2), 1e-9, S6, "Vout = Vin R2/(R1 + R2)"))
    for ci, (vin, r1, r2, rl) in enumerate(DIV_LOADED):
        out.append(("divider_loaded_c%d_vout_V" % ci, divider_vout(vin, r1, r2, rl), 1e-9, S6, "Vout = Vin Re/(R1 + Re), Re = R2 || RL"))
    for ci, (vin, t, r2, rl) in enumerate(DIV_SOLVE_R1):
        out.append(("divider_solve_r1_c%d_ohm" % ci, divider_solve_r1(vin, t, r2, rl), 1e-9, S6, "R1 = Re (Vin - Vt)/Vt, Re = R2 (|| RL when loaded); exact, unsnapped"))
    for ci, (vin, t, r1, rl) in enumerate(DIV_SOLVE_R2):
        out.append(("divider_solve_r2_c%d_ohm" % ci, divider_solve_r2(vin, t, r1, rl), 1e-9, S6, "Re = R1 Vt/(Vin - Vt); R2 = Re RL/(RL - Re) when loaded; exact, unsnapped"))
    for ci, (vin, r1, r2, rl) in enumerate(DIV_POWER):
        o = divider_currents_powers(vin, r1, r2, rl)
        for key, unit in (("i", "A"), ("p_r1", "W"), ("p_r2", "W"), ("p_total", "W"), ("rout", "ohm")):
            out.append(("divider_power_c%d_%s_%s" % (ci, key, unit), o[key], 1e-9, S6, "I(R1) = (Vin - Vout)/R1; P = I^2 R1 and Vout^2/R2; total = Vin I(R1) incl. the load; Rout = R1 || R2"))
        if rl is not None:
            out.append(("divider_power_c%d_p_load_W" % ci, o["p_load"], 1e-9, S6, "P(RL) = Vout^2/RL"))
    for ci, (kind, vin, t, other) in enumerate(DIV_SNAP_CASES):
        for s in DIV_SNAP_SERIES:
            for m in SNAP_MODES:
                sn, vo, ef = divider_snap(kind, vin, t, other, s, m)
                note = "solved %s snapped to %s (%s); exact solve, then nearest/up/down in exact decimal arithmetic" % (kind, s, m)
                out.append(("divider_snap_c%d_%s_%s_ohm" % (ci, s, m), sn, 1e-9, S616, note))
                out.append(("divider_snap_c%d_%s_%s_vout_V" % (ci, s, m), vo, 1e-9, S616, "Vout with the snapped resistor"))
                out.append(("divider_snap_c%d_%s_%s_err_frac" % (ci, s, m), ef, 1e-9, S616, "(Vout - target)/target as a fraction"))
    for ci, (vin, r1, r2, rl, tol, vt, lt) in enumerate(DIV_ENV):
        lo, _typ, hi = divider_envelope(vin, r1, r2, rl, tol, vt, lt)
        out.append(("divider_env_c%d_min_V" % ci, lo, 1e-9, S6, "initial-tolerance corners over Vin (+-vin tol), R1 and R2 (+-tol) and RL (+-load tol, default 0)"))
        out.append(("divider_env_c%d_max_V" % ci, hi, 1e-9, S6, "initial-tolerance corners over Vin (+-vin tol), R1 and R2 (+-tol) and RL (+-load tol, default 0)"))
        # element voltages (PCB-5): V(R1) = Vin - Vout, V(R2) = Vout
    for ci, (vin, r1, r2, rl) in enumerate(DIV_POWER):
        vo = divider_vout(vin, r1, r2, rl)
        out.append(("divider_power_c%d_v_r1_V" % ci, vin - vo, 1e-9, S6, "voltage across R1 = Vin - Vout"))
        out.append(("divider_power_c%d_v_r2_V" % ci, vo, 1e-9, S6, "voltage across R2 = Vout"))
    for name in ("E3", "E6", "E12", "E24", "E48", "E96", "E192"):
        lst = eseries_values(name)
        out.append(("eseries_%s_size" % name, float(len(lst)), 1e-9, ("S-016",), "series size"))
        out.append(("eseries_%s_mantissa_sum" % name, math.fsum(lst), 1e-9, ("S-016",), "checksum of the mantissas; E3-E96 from the ledger row, E192 from the definition with the published n = 185 exception"))
        out.append(("eseries_%s_formula_deviation_count" % name, float(len(eseries_formula_deviations(name))), 1e-9, ("S-016",), "entries that differ from round(10^(n/N)) at 2 s.f. (E3-E24) or 3 s.f. (E48-E192)"))
    for name in ("E24", "E96", "E192"):
        out.append(("eseries_%s_max_nearest_error_pct" % name, eseries_max_nearest_error_pct(name), 1e-9, ("S-016",), "largest |error %| of the nearest rule, at the midpoint of the widest relative gap"))
    for ti, t in enumerate(NEAREST_TARGETS):
        for s in DIV_SNAP_SERIES:
            for m in SNAP_MODES:
                f, _man, _dec, e = eseries_nearest(t, s, m)
                out.append(("eseries_nearest_t%d_%s_%s_value" % (ti, s, m), f, 1e-9, ("S-016",), "exact-decimal nearest search; a tie goes up"))
                out.append(("eseries_nearest_t%d_%s_%s_err_pct" % (ti, s, m), e, 1e-9, ("S-016",), "(found - target)/target x 100"))
    for ci, (topo, s, t, n, dec) in enumerate(PAIR_CASES):
        for rank, (a, b, v, e) in enumerate(best_pairs(t, s, topo, n, dec), 1):
            for nm, x in (("r1", a), ("r2", b), ("value", v), ("err_pct", e)):
                out.append(("pairs_c%d_rank%d_%s" % (ci, rank, nm), x, 1e-9, ("S-016",), "exhaustive two-resistor search (%s, %s); order: |error|, then digits, then r1, then r2" % (topo, s)))
    return out

# Pinned literals recorded from this oracle (regression pins, same policy as _TRACE_PINNED).
_CIRCUIT_PINNED = {
    'ohm_VI_c0_ohm': 24.0,
    'ohm_VI_c0_W': 6.0,
    'ohm_VI_c1_ohm': 165.0,
    'ohm_VI_c1_W': 0.066,
    'ohm_VR_c2_A': 0.015151515151515152,
    'ohm_VR_c2_W': 0.07575757575757576,
    'ohm_VR_c3_A': 0.005106382978723404,
    'ohm_VR_c3_W': 0.1225531914893617,
    'ohm_VP_c4_A': 0.5,
    'ohm_VP_c4_ohm': 24.0,
    'ohm_VP_c5_A': 4.3478260869565215,
    'ohm_VP_c5_ohm': 52.9,
    'ohm_IR_c6_V': 3.0,
    'ohm_IR_c6_W': 0.060000000000000005,
    'ohm_IR_c7_V': 0.15000000000000002,
    'ohm_IR_c7_W': 0.45,
    'ohm_IP_c8_V': 5.0,
    'ohm_IP_c8_ohm': 2.5,
    'ohm_IP_c9_V': 250.0,
    'ohm_IP_c9_ohm': 250000.0,
    'ohm_RP_c10_V': 5.0,
    'ohm_RP_c10_A': 0.05,
    'ohm_RP_c11_V': 68.55654600401044,
    'ohm_RP_c11_A': 0.014586499149789456,
    'divider_unloaded_c0_vout_V': 2.5,
    'divider_unloaded_c1_vout_V': 2.1052631578947367,
    'divider_unloaded_c2_vout_V': 1.03125,
    'divider_unloaded_c3_vout_V': 1.5280898876404494,
    'divider_unloaded_c4_vout_V': 1.0040053404539386,
    'divider_unloaded_c5_vout_V': 1.2,
    'divider_loaded_c0_vout_V': 2.380952380952381,
    'divider_loaded_c1_vout_V': 1.1538461538461537,
    'divider_loaded_c2_vout_V': 0.8996519721577725,
    'divider_loaded_c3_vout_V': 1.5184220320059545,
    'divider_loaded_c4_vout_V': 1.6666666666666667,
    'divider_solve_r1_c0_ohm': 26363.636363636364,
    'divider_solve_r1_c1_ohm': 17777.777777777777,
    'divider_solve_r1_c2_ohm': 17860.0,
    'divider_solve_r1_c3_ohm': 16400.0,
    'divider_solve_r1_c4_ohm': 23966.942148760325,
    'divider_solve_r2_c0_ohm': 17827.586206896554,
    'divider_solve_r2_c1_ohm': 19411.76470588235,
    'divider_solve_r2_c2_ohm': 26315.78947368421,
    'divider_solve_r2_c3_ohm': 11111.111111111111,
    'divider_power_c0_i_A': 0.0002105263157894737,
    'divider_power_c0_p_r1_W': 0.0020831024930747922,
    'divider_power_c0_p_r2_W': 0.0004432132963988919,
    'divider_power_c0_p_total_W': 0.0025263157894736842,
    'divider_power_c0_rout_ohm': 8245.61403508772,
    'divider_power_c1_i_A': 0.0002139384116693679,
    'divider_power_c1_p_r1_W': 0.002151173267417761,
    'divider_power_c1_p_r2_W': 0.00037826152055877633,
    'divider_power_c1_p_total_W': 0.002567260940032415,
    'divider_power_c1_rout_ohm': 8245.61403508772,
    'divider_power_c1_p_load_W': 3.7826152055877634e-05,
    'divider_power_c2_i_A': 0.007575757575757576,
    'divider_power_c2_p_r1_W': 0.01893939393939394,
    'divider_power_c2_p_r2_W': 0.01893939393939394,
    'divider_power_c2_p_total_W': 0.03787878787878788,
    'divider_power_c2_rout_ohm': 165.0,
    'divider_snap_c0_E24_nearest_ohm': 27000.0,
    'divider_snap_c0_E24_nearest_vout_V': 3.2432432432432434,
    'divider_snap_c0_E24_nearest_err_frac': -0.01719901719901709,
    'divider_snap_c0_E24_up_ohm': 27000.0,
    'divider_snap_c0_E24_up_vout_V': 3.2432432432432434,
    'divider_snap_c0_E24_up_err_frac': -0.01719901719901709,
    'divider_snap_c0_E24_down_ohm': 24000.0,
    'divider_snap_c0_E24_down_vout_V': 3.5294117647058822,
    'divider_snap_c0_E24_down_err_frac': 0.06951871657754014,
    'divider_snap_c0_E96_nearest_ohm': 26100.0,
    'divider_snap_c0_E96_nearest_vout_V': 3.3240997229916895,
    'divider_snap_c0_E96_nearest_err_frac': 0.0073029463611180975,
    'divider_snap_c0_E96_up_ohm': 26700.0,
    'divider_snap_c0_E96_up_vout_V': 3.2697547683923704,
    'divider_snap_c0_E96_up_err_frac': -0.009165221699281629,
    'divider_snap_c0_E96_down_ohm': 26100.0,
    'divider_snap_c0_E96_down_vout_V': 3.3240997229916895,
    'divider_snap_c0_E96_down_err_frac': 0.0073029463611180975,
    'divider_snap_c0_E192_nearest_ohm': 26400.0,
    'divider_snap_c0_E192_nearest_vout_V': 3.2967032967032965,
    'divider_snap_c0_E192_nearest_err_frac': -0.0009990009990009955,
    'divider_snap_c0_E192_up_ohm': 26400.0,
    'divider_snap_c0_E192_up_vout_V': 3.2967032967032965,
    'divider_snap_c0_E192_up_err_frac': -0.0009990009990009955,
    'divider_snap_c0_E192_down_ohm': 26100.0,
    'divider_snap_c0_E192_down_vout_V': 3.3240997229916895,
    'divider_snap_c0_E192_down_err_frac': 0.0073029463611180975,
    'divider_snap_c1_E24_nearest_ohm': 18000.0,
    'divider_snap_c1_E24_nearest_vout_V': 3.3230769230769233,
    'divider_snap_c1_E24_nearest_err_frac': 0.006993006993007103,
    'divider_snap_c1_E24_up_ohm': 18000.0,
    'divider_snap_c1_E24_up_vout_V': 3.3230769230769233,
    'divider_snap_c1_E24_up_err_frac': 0.006993006993007103,
    'divider_snap_c1_E24_down_ohm': 16000.0,
    'divider_snap_c1_E24_down_vout_V': 3.0476190476190474,
    'divider_snap_c1_E24_down_err_frac': -0.07647907647907648,
    'divider_snap_c1_E96_nearest_ohm': 17800.0,
    'divider_snap_c1_E96_nearest_vout_V': 3.2962962962962963,
    'divider_snap_c1_E96_nearest_err_frac': -0.0011223344556677403,
    'divider_snap_c1_E96_up_ohm': 18200.0,
    'divider_snap_c1_E96_up_vout_V': 3.3496932515337425,
    'divider_snap_c1_E96_up_err_frac': 0.015058561070831126,
    'divider_snap_c1_E96_down_ohm': 17800.0,
    'divider_snap_c1_E96_down_vout_V': 3.2962962962962963,
    'divider_snap_c1_E96_down_err_frac': -0.0011223344556677403,
    'divider_snap_c1_E192_nearest_ohm': 17800.0,
    'divider_snap_c1_E192_nearest_vout_V': 3.2962962962962963,
    'divider_snap_c1_E192_nearest_err_frac': -0.0011223344556677403,
    'divider_snap_c1_E192_up_ohm': 18000.0,
    'divider_snap_c1_E192_up_vout_V': 3.3230769230769233,
    'divider_snap_c1_E192_up_err_frac': 0.006993006993007103,
    'divider_snap_c1_E192_down_ohm': 17800.0,
    'divider_snap_c1_E192_down_vout_V': 3.2962962962962963,
    'divider_snap_c1_E192_down_err_frac': -0.0011223344556677403,
    'divider_env_c0_min_V': 2.475,
    'divider_env_c0_max_V': 2.525,
    'divider_env_c1_min_V': 1.9371282922684792,
    'divider_env_c1_max_V': 2.28467815049864,
    'divider_env_c2_min_V': 1.875702941523804,
    'divider_env_c2_max_V': 2.015733693051292,
    'divider_env_c3_min_V': 0.8984585075769131,
    'divider_env_c3_max_V': 0.9008464475537348,
    'divider_env_c4_min_V': 2.1375,
    'divider_env_c4_max_V': 2.8875,
    'divider_env_c5_min_V': 1.8742695236408713,
    'divider_env_c5_max_V': 2.017264167876899,
    'divider_power_c0_v_r1_V': 9.894736842105264,
    'divider_power_c0_v_r2_V': 2.1052631578947367,
    'divider_power_c1_v_r1_V': 10.055105348460291,
    'divider_power_c1_v_r2_V': 1.9448946515397083,
    'divider_power_c2_v_r1_V': 2.5,
    'divider_power_c2_v_r2_V': 2.5,
    'eseries_E3_size': 3.0,
    'eseries_E3_mantissa_sum': 7.9,
    'eseries_E3_formula_deviation_count': 1.0,
    'eseries_E6_size': 6.0,
    'eseries_E6_mantissa_sum': 19.5,
    'eseries_E6_formula_deviation_count': 2.0,
    'eseries_E12_size': 12.0,
    'eseries_E12_mantissa_sum': 42.9,
    'eseries_E12_formula_deviation_count': 5.0,
    'eseries_E24_size': 24.0,
    'eseries_E24_mantissa_sum': 90.1,
    'eseries_E24_formula_deviation_count': 8.0,
    'eseries_E48_size': 48.0,
    'eseries_E48_mantissa_sum': 183.13,
    'eseries_E48_formula_deviation_count': 0.0,
    'eseries_E96_size': 96.0,
    'eseries_E96_mantissa_sum': 370.7,
    'eseries_E96_formula_deviation_count': 0.0,
    'eseries_E192_size': 192.0,
    'eseries_E192_mantissa_sum': 745.99,
    'eseries_E192_formula_deviation_count': 1.0,
    'eseries_E24_max_nearest_error_pct': 7.142857142857143,
    'eseries_E96_max_nearest_error_pct': 1.4814814814814814,
    'eseries_E192_max_nearest_error_pct': 0.970873786407767,
    'eseries_nearest_t0_E24_nearest_value': 10.0,
    'eseries_nearest_t0_E24_nearest_err_pct': 2.0408163265306123,
    'eseries_nearest_t0_E24_up_value': 10.0,
    'eseries_nearest_t0_E24_up_err_pct': 2.0408163265306123,
    'eseries_nearest_t0_E24_down_value': 9.1,
    'eseries_nearest_t0_E24_down_err_pct': -7.142857142857143,
    'eseries_nearest_t0_E96_nearest_value': 9.76,
    'eseries_nearest_t0_E96_nearest_err_pct': -0.40816326530612246,
    'eseries_nearest_t0_E96_up_value': 10.0,
    'eseries_nearest_t0_E96_up_err_pct': 2.0408163265306123,
    'eseries_nearest_t0_E96_down_value': 9.76,
    'eseries_nearest_t0_E96_down_err_pct': -0.40816326530612246,
    'eseries_nearest_t0_E192_nearest_value': 9.76,
    'eseries_nearest_t0_E192_nearest_err_pct': -0.40816326530612246,
    'eseries_nearest_t0_E192_up_value': 9.88,
    'eseries_nearest_t0_E192_up_err_pct': 0.8163265306122449,
    'eseries_nearest_t0_E192_down_value': 9.76,
    'eseries_nearest_t0_E192_down_err_pct': -0.40816326530612246,
    'eseries_nearest_t1_E24_nearest_value': 1.0,
    'eseries_nearest_t1_E24_nearest_err_pct': 3.0927835051546393,
    'eseries_nearest_t1_E24_up_value': 1.0,
    'eseries_nearest_t1_E24_up_err_pct': 3.0927835051546393,
    'eseries_nearest_t1_E24_down_value': 0.91,
    'eseries_nearest_t1_E24_down_err_pct': -6.185567010309279,
    'eseries_nearest_t1_E96_nearest_value': 0.976,
    'eseries_nearest_t1_E96_nearest_err_pct': 0.6185567010309279,
    'eseries_nearest_t1_E96_up_value': 0.976,
    'eseries_nearest_t1_E96_up_err_pct': 0.6185567010309279,
    'eseries_nearest_t1_E96_down_value': 0.953,
    'eseries_nearest_t1_E96_down_err_pct': -1.7525773195876289,
    'eseries_nearest_t1_E192_nearest_value': 0.965,
    'eseries_nearest_t1_E192_nearest_err_pct': -0.5154639175257731,
    'eseries_nearest_t1_E192_up_value': 0.976,
    'eseries_nearest_t1_E192_up_err_pct': 0.6185567010309279,
    'eseries_nearest_t1_E192_down_value': 0.965,
    'eseries_nearest_t1_E192_down_err_pct': -0.5154639175257731,
    'eseries_nearest_t2_E24_nearest_value': 4700.0,
    'eseries_nearest_t2_E24_nearest_err_pct': 0.0,
    'eseries_nearest_t2_E24_up_value': 4700.0,
    'eseries_nearest_t2_E24_up_err_pct': 0.0,
    'eseries_nearest_t2_E24_down_value': 4700.0,
    'eseries_nearest_t2_E24_down_err_pct': 0.0,
    'eseries_nearest_t2_E96_nearest_value': 4750.0,
    'eseries_nearest_t2_E96_nearest_err_pct': 1.0638297872340425,
    'eseries_nearest_t2_E96_up_value': 4750.0,
    'eseries_nearest_t2_E96_up_err_pct': 1.0638297872340425,
    'eseries_nearest_t2_E96_down_value': 4640.0,
    'eseries_nearest_t2_E96_down_err_pct': -1.2765957446808511,
    'eseries_nearest_t2_E192_nearest_value': 4700.0,
    'eseries_nearest_t2_E192_nearest_err_pct': 0.0,
    'eseries_nearest_t2_E192_up_value': 4700.0,
    'eseries_nearest_t2_E192_up_err_pct': 0.0,
    'eseries_nearest_t2_E192_down_value': 4700.0,
    'eseries_nearest_t2_E192_down_err_pct': 0.0,
    'eseries_nearest_t3_E24_nearest_value': 27000.0,
    'eseries_nearest_t3_E24_nearest_err_pct': 2.4137931034482745,
    'eseries_nearest_t3_E24_up_value': 27000.0,
    'eseries_nearest_t3_E24_up_err_pct': 2.4137931034482745,
    'eseries_nearest_t3_E24_down_value': 24000.0,
    'eseries_nearest_t3_E24_down_err_pct': -8.965517241379311,
    'eseries_nearest_t3_E96_nearest_value': 26100.0,
    'eseries_nearest_t3_E96_nearest_err_pct': -1.0000000000000013,
    'eseries_nearest_t3_E96_up_value': 26700.0,
    'eseries_nearest_t3_E96_up_err_pct': 1.2758620689655158,
    'eseries_nearest_t3_E96_down_value': 26100.0,
    'eseries_nearest_t3_E96_down_err_pct': -1.0000000000000013,
    'eseries_nearest_t3_E192_nearest_value': 26400.0,
    'eseries_nearest_t3_E192_nearest_err_pct': 0.13793103448275723,
    'eseries_nearest_t3_E192_up_value': 26400.0,
    'eseries_nearest_t3_E192_up_err_pct': 0.13793103448275723,
    'eseries_nearest_t3_E192_down_value': 26100.0,
    'eseries_nearest_t3_E192_down_err_pct': -1.0000000000000013,
    'eseries_nearest_t4_E24_nearest_value': 1.2e-09,
    'eseries_nearest_t4_E24_nearest_err_pct': -2.755267423014587,
    'eseries_nearest_t4_E24_up_value': 1.3e-09,
    'eseries_nearest_t4_E24_up_err_pct': 5.348460291734198,
    'eseries_nearest_t4_E24_down_value': 1.2e-09,
    'eseries_nearest_t4_E24_down_err_pct': -2.755267423014587,
    'eseries_nearest_t4_E96_nearest_value': 1.24e-09,
    'eseries_nearest_t4_E96_nearest_err_pct': 0.4862236628849271,
    'eseries_nearest_t4_E96_up_value': 1.24e-09,
    'eseries_nearest_t4_E96_up_err_pct': 0.4862236628849271,
    'eseries_nearest_t4_E96_down_value': 1.21e-09,
    'eseries_nearest_t4_E96_down_err_pct': -1.9448946515397083,
    'eseries_nearest_t4_E192_nearest_value': 1.23e-09,
    'eseries_nearest_t4_E192_nearest_err_pct': -0.3241491085899514,
    'eseries_nearest_t4_E192_up_value': 1.24e-09,
    'eseries_nearest_t4_E192_up_err_pct': 0.4862236628849271,
    'eseries_nearest_t4_E192_down_value': 1.23e-09,
    'eseries_nearest_t4_E192_down_err_pct': -0.3241491085899514,
    'eseries_nearest_t5_E24_nearest_value': 820000.0,
    'eseries_nearest_t5_E24_nearest_err_pct': -4.651162790697675,
    'eseries_nearest_t5_E24_up_value': 910000.0,
    'eseries_nearest_t5_E24_up_err_pct': 5.813953488372093,
    'eseries_nearest_t5_E24_down_value': 820000.0,
    'eseries_nearest_t5_E24_down_err_pct': -4.651162790697675,
    'eseries_nearest_t5_E96_nearest_value': 866000.0,
    'eseries_nearest_t5_E96_nearest_err_pct': 0.6976744186046512,
    'eseries_nearest_t5_E96_up_value': 866000.0,
    'eseries_nearest_t5_E96_up_err_pct': 0.6976744186046512,
    'eseries_nearest_t5_E96_down_value': 845000.0,
    'eseries_nearest_t5_E96_down_err_pct': -1.744186046511628,
    'eseries_nearest_t5_E192_nearest_value': 856000.0,
    'eseries_nearest_t5_E192_nearest_err_pct': -0.46511627906976744,
    'eseries_nearest_t5_E192_up_value': 866000.0,
    'eseries_nearest_t5_E192_up_err_pct': 0.6976744186046512,
    'eseries_nearest_t5_E192_down_value': 856000.0,
    'eseries_nearest_t5_E192_down_err_pct': -0.46511627906976744,
    'pairs_c0_rank1_r1': 1000.0,
    'pairs_c0_rank1_r2': 2000.0,
    'pairs_c0_rank1_value': 3000.0,
    'pairs_c0_rank1_err_pct': 0.0,
    'pairs_c0_rank2_r1': 300.0,
    'pairs_c0_rank2_r2': 2700.0,
    'pairs_c0_rank2_value': 3000.0,
    'pairs_c0_rank2_err_pct': 0.0,
    'pairs_c0_rank3_r1': 1200.0,
    'pairs_c0_rank3_r2': 1800.0,
    'pairs_c0_rank3_value': 3000.0,
    'pairs_c0_rank3_err_pct': 0.0,
    'pairs_c0_rank4_r1': 1500.0,
    'pairs_c0_rank4_r2': 1500.0,
    'pairs_c0_rank4_value': 3000.0,
    'pairs_c0_rank4_err_pct': 0.0,
    'pairs_c0_rank5_r1': 10.0,
    'pairs_c0_rank5_r2': 3000.0,
    'pairs_c0_rank5_value': 3010.0,
    'pairs_c0_rank5_err_pct': 0.3333333333333333,
    'pairs_c1_rank1_r1': 845.0,
    'pairs_c1_rank1_r2': 11500.0,
    'pairs_c1_rank1_value': 12345.0,
    'pairs_c1_rank1_err_pct': 0.0,
    'pairs_c1_rank2_r1': 243.0,
    'pairs_c1_rank2_r2': 12100.0,
    'pairs_c1_rank2_value': 12343.0,
    'pairs_c1_rank2_err_pct': -0.016200891049007696,
    'pairs_c1_rank3_r1': 249.0,
    'pairs_c1_rank3_r2': 12100.0,
    'pairs_c1_rank3_value': 12349.0,
    'pairs_c1_rank3_err_pct': 0.03240178209801539,
    'pairs_c1_rank4_r1': 549.0,
    'pairs_c1_rank4_r2': 11800.0,
    'pairs_c1_rank4_value': 12349.0,
    'pairs_c1_rank4_err_pct': 0.03240178209801539,
    'pairs_c1_rank5_r1': 1050.0,
    'pairs_c1_rank5_r2': 11300.0,
    'pairs_c1_rank5_value': 12350.0,
    'pairs_c1_rank5_err_pct': 0.04050222762251924,
    'pairs_c2_rank1_r1': 1240.0,
    'pairs_c2_rank1_r2': 255000.0,
    'pairs_c2_rank1_value': 1233.9993755853886,
    'pairs_c2_rank1_err_pct': -5.060085991101333e-05,
    'pairs_c2_rank2_r1': 1300.0,
    'pairs_c2_rank2_r2': 24300.0,
    'pairs_c2_rank2_value': 1233.984375,
    'pairs_c2_rank2_err_pct': -0.0012662074554294976,
    'pairs_c2_rank3_r1': 1240.0,
    'pairs_c2_rank3_r2': 261000.0,
    'pairs_c2_rank3_value': 1234.136668700427,
    'pairs_c2_rank3_err_pct': 0.011075259353897058,
    'pairs_c2_rank4_r1': 1240.0,
    'pairs_c2_rank4_r2': 249000.0,
    'pairs_c2_rank4_value': 1233.8554987212276,
    'pairs_c2_rank4_err_pct': -0.01170999017604364,
    'pairs_c2_rank5_r1': 1470.0,
    'pairs_c2_rank5_r2': 7680.0,
    'pairs_c2_rank5_value': 1233.8360655737704,
    'pairs_c2_rank5_err_pct': -0.013284799532375057,
    'pairs_c3_rank1_r1': 3000.0,
    'pairs_c3_rank1_r2': 3000.0,
    'pairs_c3_rank1_value': 1500.0,
    'pairs_c3_rank1_err_pct': 0.0,
    'pairs_c3_rank2_r1': 1600.0,
    'pairs_c3_rank2_r2': 24000.0,
    'pairs_c3_rank2_value': 1500.0,
    'pairs_c3_rank2_err_pct': 0.0,
    'pairs_c3_rank3_r1': 2200.0,
    'pairs_c3_rank3_r2': 4700.0,
    'pairs_c3_rank3_value': 1498.5507246376812,
    'pairs_c3_rank3_err_pct': -0.0966183574879227,
    'pairs_c3_rank4_r1': 1500.0,
    'pairs_c3_rank4_r2': 910000.0,
    'pairs_c3_rank4_value': 1497.5315414152496,
    'pairs_c3_rank4_err_pct': -0.16456390565002743,
    'pairs_c3_rank5_r1': 1500.0,
    'pairs_c3_rank5_r2': 820000.0,
    'pairs_c3_rank5_value': 1497.2611077297627,
    'pairs_c3_rank5_err_pct': -0.18259281801582472,
    'pairs_c4_rank1_r1': 10200.0,
    'pairs_c4_rank1_r2': 2550.0,
    'pairs_c4_rank1_value': 0.2,
    'pairs_c4_rank1_err_pct': 0.0,
    'pairs_c4_rank2_r1': 102000.0,
    'pairs_c4_rank2_r2': 25500.0,
    'pairs_c4_rank2_value': 0.2,
    'pairs_c4_rank2_err_pct': 0.0,
    'pairs_c4_rank3_r1': 16900.0,
    'pairs_c4_rank3_r2': 4220.0,
    'pairs_c4_rank3_value': 0.19981060606060605,
    'pairs_c4_rank3_err_pct': -0.0946969696969697,
    'pairs_c4_rank4_r1': 169000.0,
    'pairs_c4_rank4_r2': 42200.0,
    'pairs_c4_rank4_value': 0.19981060606060605,
    'pairs_c4_rank4_err_pct': -0.0946969696969697,
    'pairs_c4_rank5_r1': 16500.0,
    'pairs_c4_rank5_r2': 4120.0,
    'pairs_c4_rank5_value': 0.19980601357904948,
    'pairs_c4_rank5_err_pct': -0.09699321047526673,
    'pairs_c5_rank1_r1': 3000.0,
    'pairs_c5_rank1_r2': 1000.0,
    'pairs_c5_rank1_value': 0.25,
    'pairs_c5_rank1_err_pct': 0.0,
    'pairs_c5_rank2_r1': 30000.0,
    'pairs_c5_rank2_r2': 10000.0,
    'pairs_c5_rank2_value': 0.25,
    'pairs_c5_rank2_err_pct': 0.0,
    'pairs_c5_rank3_r1': 3300.0,
    'pairs_c5_rank3_r2': 1100.0,
    'pairs_c5_rank3_value': 0.25,
    'pairs_c5_rank3_err_pct': 0.0,
    'pairs_c5_rank4_r1': 3600.0,
    'pairs_c5_rank4_r2': 1200.0,
    'pairs_c5_rank4_value': 0.25,
    'pairs_c5_rank4_err_pct': 0.0,
    'pairs_c5_rank5_r1': 3900.0,
    'pairs_c5_rank5_r2': 1300.0,
    'pairs_c5_rank5_value': 0.25,
    'pairs_c5_rank5_err_pct': 0.0,
}
GOLDEN.extend((n, got, _CIRCUIT_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _circuit_vectors())

# ---- self-heating (Phase 1 task 4). Independent of src/: CLOSED FORM, no iteration (the TS side uses Brent). ----
# With a constant theta [K/W] and linear R(T) the fixed point dT = theta * I^2 * R20 * (1 + alpha (T_amb + dT - 20)) is
# linear in dT: dT = theta I^2 R(T_amb) / (1 - theta I^2 R20 alpha), a steady state only while k = theta I^2 R20 alpha < 1
# (S-019g, UNVERIFIED/DERIVED: algebra from S-019d dT = theta P (VERIFIED), S-019 and S-004; no source states it for a conductor). Reference temperature of the legacy calibration is 20 C.
def sh_r20_ohm(L_mm, w_mm, t_um, rho20=RHO_CU_20C):
    return rho20 * (L_mm * 1e-3) / ((w_mm * 1e-3) * (t_um * 1e-6))

def sh_k(I, L_mm, w_mm, t_um, theta, alpha=ALPHA_CU):
    """Loop gain k = theta * I^2 * R20 * alpha; runaway (no steady state) for k >= 1."""
    return theta * I * I * sh_r20_ohm(L_mm, w_mm, t_um) * alpha

def sh_dT_K(I, L_mm, w_mm, t_um, theta, Tamb_C, alpha=ALPHA_CU):
    r20 = sh_r20_ohm(L_mm, w_mm, t_um)
    k = theta * I * I * r20 * alpha
    if k >= 1.0:
        return None
    return theta * I * I * r20 * (1.0 + alpha * (Tamb_C - 20.0)) / (1.0 - k)

def sh_dT0_K(I, L_mm, w_mm, t_um, theta):
    """alpha = 0 closed form: theta * I^2 * R20."""
    return theta * I * I * sh_r20_ohm(L_mm, w_mm, t_um)

def sh_power_W(I, L_mm, w_mm, t_um, theta, Tamb_C):
    dT = sh_dT_K(I, L_mm, w_mm, t_um, theta, Tamb_C)
    return I * I * sh_r20_ohm(L_mm, w_mm, t_um) * (1.0 + ALPHA_CU * (Tamb_C + dT - 20.0))

def sh_theta_crit_K_per_W(I, L_mm, w_mm, t_um, alpha=ALPHA_CU):
    """theta at which k = 1 (runaway for any larger theta)."""
    return 1.0 / (I * I * sh_r20_ohm(L_mm, w_mm, t_um) * alpha)

def sh_legacy_theta(I, L_mm, w_mm, t_um, layer):
    """theta_eff = dT_ipc(I) / P0, P0 = I^2 R(20 C): legacy IPC-2221 rise divided by the 20 C power (S-001 PAYWALLED)."""
    dT_ipc = ipc2221_dT_C(I, w_mm / 0.0254, layer, t_um)
    return dT_ipc / (I * I * sh_r20_ohm(L_mm, w_mm, t_um))

# (I A, L mm, w mm, t um, theta K/W, Tamb C)
SH_USER_CASES = [
    (2, 100, 0.254, 35, 50, 25), (3, 100, 0.5, 35, 20, 25), (5, 200, 1, 70, 10, 55), (1, 50, 0.2, 17.5, 80, 85),
    (10, 300, 3, 105, 4, 40), (2, 100, 0.254, 35, 120, 25),
]
# (I A, L mm, w mm, t um, layer, Tamb C)
SH_LEGACY_CASES = [(2, 100, 0.5, 35, "outer", 25), (5, 150, 2, 70, "outer", 25), (2, 100, 1, 35, "inner", 40), (10, 100, 5, 70, "outer", 25)]
SH_CRIT_CASES = [(2, 100, 0.254, 35), (5, 200, 1, 70), (1, 50, 0.2, 17.5)]

def _sh_tag(I, L, w, t):
    return "I%sA_L%smm_w%smm_t%sum" % (_g(I), _g(L), _g(w), _g(t))

def _selfheat_vectors():
    out = []
    ids_u = ("S-004", "S-019", "S-019d", "S-019g", "S-006")
    for I, L, w, t, th, Ta in SH_USER_CASES:
        tag = _sh_tag(I, L, w, t) + "_theta%s_Ta%sC" % (_g(th), _g(Ta))
        out.append(("self_heating_user_dT_K_" + tag, sh_dT_K(I, L, w, t, th, Ta), 1e-9, ids_u,
                    "closed form dT = theta I^2 R(Tamb)/(1 - theta I^2 R20 alpha); theta user-supplied"))
        out.append(("self_heating_user_dT0_K_" + tag, sh_dT0_K(I, L, w, t, th), 1e-9, ids_u, "alpha = 0: dT0 = theta I^2 R20"))
        out.append(("self_heating_user_P_W_" + tag, sh_power_W(I, L, w, t, th, Ta), 1e-9, ids_u, "P = I^2 R20 (1 + alpha (Tamb + dT - 20))"))
    ids_l = ("S-001", "S-004", "S-019", "S-019d", "S-019g", "S-006", "S-003")
    for I, L, w, t, layer, Ta in SH_LEGACY_CASES:
        tag = _sh_tag(I, L, w, t) + "_%s_Ta%sC" % (layer, _g(Ta))
        th = sh_legacy_theta(I, L, w, t, layer)
        out.append(("self_heating_legacy_theta_K_per_W_" + tag, th, 1e-9, ids_l, "theta_eff = dT_ipc / (I^2 R20), legacy IPC-2221 fit (not a heat-flow model)"))
        out.append(("self_heating_legacy_dT_K_" + tag, sh_dT_K(I, L, w, t, th, Ta), 1e-9, ids_l, "coupled closed form with theta_eff; LEGACY extrapolation"))
    for I, L, w, t in SH_CRIT_CASES:
        out.append(("self_heating_theta_crit_K_per_W_" + _sh_tag(I, L, w, t), sh_theta_crit_K_per_W(I, L, w, t), 1e-9,
                    ("S-004", "S-019", "S-019d", "S-019g", "S-006"), "theta at loop gain 1: runaway above this"))
    return out

_SELFHEAT_PINNED = {
    'self_heating_user_dT_K_I2A_L100mm_w0.254mm_t35um_theta50_Ta25C': 46.66376824859275,
    'self_heating_user_dT0_K_I2A_L100mm_w0.254mm_t35um_theta50_Ta25C': 38.78825491641132,
    'self_heating_user_P_W_I2A_L100mm_w0.254mm_t35um_theta50_Ta25C': 0.9332753649718551,
    'self_heating_user_dT_K_I3A_L100mm_w0.5mm_t35um_theta20_Ta25C': 19.437125368013053,
    'self_heating_user_dT0_K_I3A_L100mm_w0.5mm_t35um_theta20_Ta25C': 17.733990147783256,
    'self_heating_user_P_W_I3A_L100mm_w0.5mm_t35um_theta20_Ta25C': 0.9718562684006526,
    'self_heating_user_dT_K_I5A_L200mm_w1mm_t70um_theta10_Ta55C': 14.72175488546655,
    'self_heating_user_dT0_K_I5A_L200mm_w1mm_t70um_theta10_Ta55C': 12.315270935960594,
    'self_heating_user_P_W_I5A_L200mm_w1mm_t70um_theta10_Ta55C': 1.4721754885466551,
    'self_heating_user_dT_K_I1A_L50mm_w0.2mm_t17.5um_theta80_Ta85C': 26.81439555745408,
    'self_heating_user_dT0_K_I1A_L50mm_w0.2mm_t17.5um_theta80_Ta85C': 19.704433497536947,
    'self_heating_user_P_W_I1A_L50mm_w0.2mm_t17.5um_theta80_Ta85C': 0.335179944468176,
    'self_heating_user_dT_K_I10A_L300mm_w3mm_t105um_theta4_Ta40C': 7.272114347357066,
    'self_heating_user_dT0_K_I10A_L300mm_w3mm_t105um_theta4_Ta40C': 6.568144499178982,
    'self_heating_user_P_W_I10A_L300mm_w3mm_t105um_theta4_Ta40C': 1.8180285868392665,
    'self_heating_user_dT_K_I2A_L100mm_w0.254mm_t35um_theta120_Ta25C': 149.68254939140013,
    'self_heating_user_dT0_K_I2A_L100mm_w0.254mm_t35um_theta120_Ta25C': 93.09181179938716,
    'self_heating_user_P_W_I2A_L100mm_w0.254mm_t35um_theta120_Ta25C': 1.2473545782616677,
    'self_heating_legacy_theta_K_per_W_I2A_L100mm_w0.5mm_t35um_outer_Ta25C': 52.959061826606025,
    'self_heating_legacy_dT_K_I2A_L100mm_w0.5mm_t35um_outer_Ta25C': 23.18209937814933,
    'self_heating_legacy_theta_K_per_W_I5A_L150mm_w2mm_t70um_outer_Ta25C': 11.78751077838797,
    'self_heating_legacy_dT_K_I5A_L150mm_w2mm_t70um_outer_Ta25C': 5.672056455546067,
    'self_heating_legacy_theta_K_per_W_I2A_L100mm_w1mm_t35um_inner_Ta40C': 163.34807690488054,
    'self_heating_legacy_dT_K_I2A_L100mm_w1mm_t35um_inner_Ta40C': 39.74409298486989,
    'self_heating_legacy_theta_K_per_W_I10A_L100mm_w5mm_t70um_outer_Ta25C': 11.799289453214055,
    'self_heating_legacy_dT_K_I10A_L100mm_w5mm_t70um_outer_Ta25C': 6.065220235141266,
    'self_heating_theta_crit_K_per_W_I2A_L100mm_w0.254mm_t35um': 328.002544529262,
    'self_heating_theta_crit_K_per_W_I5A_L200mm_w1mm_t70um': 206.61577608142488,
    'self_heating_theta_crit_K_per_W_I1A_L50mm_w0.2mm_t17.5um': 1033.0788804071244,
}
GOLDEN.extend((n, got, _SELFHEAT_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _selfheat_vectors())

# ---- voltage drop / power loss along a feed path (Phase 1 task 5). Independent of src/. ----
# One source Vs, series path elements (copper traces with R(T) per S-004, or user-given ohmic elements), one load
# described by exactly ONE of: current I, power P (constant power), resistance RL, or the voltage Vl at the load.
# Constant power uses the textbook quadratic Rp I^2 - Vs I + P = 0 in the (Vs - sqrt(Vs^2 - 4 Rp P)) / (2 Rp) form (the
# physical, low-current root); no real root = the load cannot be supplied (P > Vs^2/(4 Rp)). Quadratic, P_max = Vs^2/(4 Rp)
# and efficiency = P_load/P_src are ledger S-019h (VERIFIED); series R and Ohm's law are S-019 (a),(b).
# Element: ("t", L_mm, w_mm, t_um, T_degC) or ("r", ohm). Return: "none" | "same" | "list" (ret list separate).
def vd_element_R(e):
    if e[0] == "t":
        return trace_resistance_ohm(e[1], e[2], e[3], e[4])
    return e[1]

def vd_solve(vs, load_kind, load_value, fwd, ret_mode="none", ret=()):
    """Returns dict with the self-consistent DC state, or None when the load cannot be supplied."""
    elems = [vd_element_R(e) for e in fwd]
    if ret_mode == "same":
        elems += [vd_element_R(e) for e in fwd]
    elif ret_mode == "list":
        elems += [vd_element_R(e) for e in ret]
    rp = sum(elems)
    if load_kind == "I":
        i = load_value
    elif load_kind == "R":
        i = vs / (rp + load_value)
    elif load_kind == "V":
        i = (vs - load_value) / rp
    else:  # constant power
        disc = vs * vs - 4.0 * rp * load_value
        if disc < 0:
            return None
        i = (vs - math.sqrt(disc)) / (2.0 * rp)
    v_load = vs - i * rp
    if v_load <= 0 or i <= 0:
        return None
    return {
        "elems_R": elems, "r_total": rp, "i": i, "drop": i * rp, "pct": i * rp / vs, "v_load": v_load,
        "p_loss": i * i * rp, "p_load": v_load * i, "p_src": vs * i, "eff": v_load / vs, "p_max": vs * vs / (4.0 * rp),
        "r_load": v_load / i,
    }

# (case name, Vs, load kind, load value, forward elements, return mode, return list)
VD_CASES = [
    ("A_constR_same",  12.0, "R", 10.0,  [("t", 100, 1.0, 35, 25), ("r", 0.05)], "same", ()),
    ("B_constI_none",   5.0, "I", 2.0,   [("t", 200, 2.0, 70, 85), ("r", 0.02)], "none", ()),
    ("C_constP_list",  12.0, "P", 20.0,  [("t", 300, 3.0, 35, 55), ("r", 0.1), ("r", 0.03)], "list", [("t", 300, 5.0, 35, 55)]),
    ("D_constV_none",   3.3, "V", 3.2,   [("t", 150, 0.5, 35, 25), ("r", 0.01)], "none", ()),
    ("E_pmax_edge",     5.0, "P", 6.25,  [("r", 1.0)], "none", ()),
    ("F_constP_heavy", 24.0, "P", 100.0, [("t", 500, 4.0, 70, 105), ("r", 0.2)], "same", ()),
]

def _vd_vectors():
    out = []
    ids = ("S-004", "S-019", "S-006")
    # S-019h (constant-power quadratic, P_max, efficiency) is cited where the value depends on it: every vector of a
    # constant-power case whose value depends on the current from the quadratic (not r_total or the element
    # resistances, which are plain series R) and the p_max / eff vectors of every case.
    ids_h = ("S-004", "S-019", "S-019h", "S-006")
    for name, vs, kind, val, fwd, rm, ret in VD_CASES:
        s = vd_solve(vs, kind, val, fwd, rm, ret)
        case_ids = ids_h if kind == "P" else ids
        for key, unit in (("r_total", "ohm"), ("i", "A"), ("drop", "V"), ("pct", "frac"), ("v_load", "V"), ("p_loss", "W"), ("p_load", "W"), ("p_src", "W"), ("eff", "frac"), ("p_max", "W")):
            key_ids = ids_h if key in ("eff", "p_max") else (ids if key == "r_total" else case_ids)
            out.append(("vdrop_%s_%s_%s" % (name, key, unit), s[key], 1e-9, key_ids, "V = I R; P = I^2 R; series R; constant-power quadratic root (low-current)"))
        for k, rk in enumerate(s["elems_R"]):
            out.append(("vdrop_%s_e%d_R_ohm" % (name, k), rk, 1e-9, ids, "element resistance (trace R(T) or user ohmic value)"))
            out.append(("vdrop_%s_e%d_drop_V" % (name, k), s["i"] * rk, 1e-9, case_ids, "I x R_k"))
            out.append(("vdrop_%s_e%d_loss_W" % (name, k), s["i"] * s["i"] * rk, 1e-9, case_ids, "I^2 x R_k"))
    return out

_VDROP_PINNED = {
    'vdrop_A_constR_same_r_total_ohm': 0.20045812807881774,
    'vdrop_A_constR_same_i_A': 1.1764177499996378,
    'vdrop_A_constR_same_drop_V': 0.23582250000362198,
    'vdrop_A_constR_same_pct_frac': 0.01965187500030183,
    'vdrop_A_constR_same_v_load_V': 11.764177499996379,
    'vdrop_A_constR_same_p_loss_W': 0.2774257748535505,
    'vdrop_A_constR_same_p_load_W': 13.839587225142104,
    'vdrop_A_constR_same_p_src_W': 14.117012999995653,
    'vdrop_A_constR_same_eff_frac': 0.9803481249996983,
    'vdrop_A_constR_same_p_max_W': 179.58862703659105,
    'vdrop_A_constR_same_e0_R_ohm': 0.05022906403940887,
    'vdrop_A_constR_same_e0_drop_V': 0.0590903625018291,
    'vdrop_A_constR_same_e0_loss_W': 0.06951495130106476,
    'vdrop_A_constR_same_e1_R_ohm': 0.05,
    'vdrop_A_constR_same_e1_drop_V': 0.05882088749998189,
    'vdrop_A_constR_same_e1_loss_W': 0.06919793612571051,
    'vdrop_A_constR_same_e2_R_ohm': 0.05022906403940887,
    'vdrop_A_constR_same_e2_drop_V': 0.0590903625018291,
    'vdrop_A_constR_same_e2_loss_W': 0.06951495130106476,
    'vdrop_A_constR_same_e3_R_ohm': 0.05,
    'vdrop_A_constR_same_e3_drop_V': 0.05882088749998189,
    'vdrop_A_constR_same_e3_loss_W': 0.06919793612571051,
    'vdrop_B_constI_none_r_total_ohm': 0.05092241379310346,
    'vdrop_B_constI_none_i_A': 2.0,
    'vdrop_B_constI_none_drop_V': 0.10184482758620692,
    'vdrop_B_constI_none_pct_frac': 0.020368965517241384,
    'vdrop_B_constI_none_v_load_V': 4.8981551724137935,
    'vdrop_B_constI_none_p_loss_W': 0.20368965517241383,
    'vdrop_B_constI_none_p_load_W': 9.796310344827587,
    'vdrop_B_constI_none_p_src_W': 10.0,
    'vdrop_B_constI_none_eff_frac': 0.9796310344827587,
    'vdrop_B_constI_none_p_max_W': 122.7357372608769,
    'vdrop_B_constI_none_e0_R_ohm': 0.030922413793103457,
    'vdrop_B_constI_none_e0_drop_V': 0.061844827586206914,
    'vdrop_B_constI_none_e0_loss_W': 0.12368965517241383,
    'vdrop_B_constI_none_e1_R_ohm': 0.02,
    'vdrop_B_constI_none_e1_drop_V': 0.04,
    'vdrop_B_constI_none_e1_loss_W': 0.08,
    'vdrop_C_constP_list_r_total_ohm': 0.21965911330049262,
    'vdrop_C_constP_list_i_A': 1.7208750767428527,
    'vdrop_C_constP_list_drop_V': 0.3780058934582522,
    'vdrop_C_constP_list_pct_frac': 0.031500491121521014,
    'vdrop_C_constP_list_v_load_V': 11.621994106541749,
    'vdrop_C_constP_list_p_loss_W': 0.6505009209142204,
    'vdrop_C_constP_list_p_load_W': 20.000000000000014,
    'vdrop_C_constP_list_p_src_W': 20.650500920914233,
    'vdrop_C_constP_list_eff_frac': 0.968499508878479,
    'vdrop_C_constP_list_p_max_W': 163.89030921176564,
    'vdrop_C_constP_list_e0_R_ohm': 0.05603694581280789,
    'vdrop_C_constP_list_e0_drop_V': 0.09643258342605085,
    'vdrop_C_constP_list_e0_loss_W': 0.1659484294038168,
    'vdrop_C_constP_list_e1_R_ohm': 0.1,
    'vdrop_C_constP_list_e1_drop_V': 0.17208750767428527,
    'vdrop_C_constP_list_e1_loss_W': 0.2961411029754719,
    'vdrop_C_constP_list_e2_R_ohm': 0.03,
    'vdrop_C_constP_list_e2_drop_V': 0.051626252302285576,
    'vdrop_C_constP_list_e2_loss_W': 0.08884233089264157,
    'vdrop_C_constP_list_e3_R_ohm': 0.033622167487684734,
    'vdrop_C_constP_list_e3_drop_V': 0.05785955005563051,
    'vdrop_C_constP_list_e3_loss_W': 0.09956905764229008,
    'vdrop_D_constV_none_r_total_ohm': 0.16068719211822663,
    'vdrop_D_constV_none_i_A': 0.6223271356090658,
    'vdrop_D_constV_none_drop_V': 0.09999999999999963,
    'vdrop_D_constV_none_pct_frac': 0.030303030303030193,
    'vdrop_D_constV_none_v_load_V': 3.2,
    'vdrop_D_constV_none_p_loss_W': 0.06223271356090636,
    'vdrop_D_constV_none_p_load_W': 1.9914468339490108,
    'vdrop_D_constV_none_p_src_W': 2.053679547509917,
    'vdrop_D_constV_none_eff_frac': 0.9696969696969698,
    'vdrop_D_constV_none_p_max_W': 16.942856266956877,
    'vdrop_D_constV_none_e0_R_ohm': 0.15068719211822662,
    'vdrop_D_constV_none_e0_drop_V': 0.09377672864390897,
    'vdrop_D_constV_none_e0_loss_W': 0.058359802923752514,
    'vdrop_D_constV_none_e1_R_ohm': 0.01,
    'vdrop_D_constV_none_e1_drop_V': 0.0062232713560906585,
    'vdrop_D_constV_none_e1_loss_W': 0.0038729106371538464,
    'vdrop_E_pmax_edge_r_total_ohm': 1.0,
    'vdrop_E_pmax_edge_i_A': 2.5,
    'vdrop_E_pmax_edge_drop_V': 2.5,
    'vdrop_E_pmax_edge_pct_frac': 0.5,
    'vdrop_E_pmax_edge_v_load_V': 2.5,
    'vdrop_E_pmax_edge_p_loss_W': 6.25,
    'vdrop_E_pmax_edge_p_load_W': 6.25,
    'vdrop_E_pmax_edge_p_src_W': 12.5,
    'vdrop_E_pmax_edge_eff_frac': 0.5,
    'vdrop_E_pmax_edge_p_max_W': 6.25,
    'vdrop_E_pmax_edge_e0_R_ohm': 1.0,
    'vdrop_E_pmax_edge_e0_drop_V': 2.5,
    'vdrop_E_pmax_edge_e0_loss_W': 6.25,
    'vdrop_F_constP_heavy_r_total_ohm': 0.4821459359605912,
    'vdrop_F_constP_heavy_i_A': 4.58989265292049,
    'vdrop_F_constP_heavy_drop_V': 2.2129980891009904,
    'vdrop_F_constP_heavy_pct_frac': 0.09220825371254127,
    'vdrop_F_constP_heavy_v_load_V': 21.787001910899008,
    'vdrop_F_constP_heavy_p_loss_W': 10.15742367009172,
    'vdrop_F_constP_heavy_p_load_W': 100.00000000000003,
    'vdrop_F_constP_heavy_p_src_W': 110.15742367009176,
    'vdrop_F_constP_heavy_eff_frac': 0.9077917462874586,
    'vdrop_F_constP_heavy_p_max_W': 298.66475948429445,
    'vdrop_F_constP_heavy_e0_R_ohm': 0.041072967980295576,
    'vdrop_F_constP_heavy_e0_drop_V': 0.1885205139663972,
    'vdrop_F_constP_heavy_e0_loss_W': 0.8652889219791612,
    'vdrop_F_constP_heavy_e1_R_ohm': 0.2,
    'vdrop_F_constP_heavy_e1_drop_V': 0.9179785305840981,
    'vdrop_F_constP_heavy_e1_loss_W': 4.213422913066699,
    'vdrop_F_constP_heavy_e2_R_ohm': 0.041072967980295576,
    'vdrop_F_constP_heavy_e2_drop_V': 0.1885205139663972,
    'vdrop_F_constP_heavy_e2_loss_W': 0.8652889219791612,
    'vdrop_F_constP_heavy_e3_R_ohm': 0.2,
    'vdrop_F_constP_heavy_e3_drop_V': 0.9179785305840981,
    'vdrop_F_constP_heavy_e3_loss_W': 4.213422913066699,
}
GOLDEN.extend((n, got, _VDROP_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _vd_vectors())

# ---- via barrel electrical / axial thermal (Phase 1 task 7a). Independent of src/. ----
# A = pi t (d + t), d = FINISHED hole (inside) diameter; R(T) = rho20 (1 + alpha (T - 20)) L / (N A) (ideal parallel, equal
# sharing); theta_axial = L / (k N A) (axial conduction through the barrel copper only; NOT a trace-to-ambient resistance).
# Plating thicknesses below are TEST values, not defaults (S-015 is PAYWALLED). k from S-007 (CONFLICT): 401 pure, 391 C11000.
# Case: (d_mm, t_um, L_mm, N, T_degC, I_A or None, k_W_per_mK)
VIA_CASES = [
    (0.3, 25, 1.6, 1, 20, None, 401.0),
    (0.3, 25, 1.6, 4, 85, 2.0, 391.0),
    (0.2, 18, 0.8, 1, 105, 0.5, 401.0),
    (0.5, 35, 2.4, 6, 55, 3.0, 401.0),
    (0.25, 20, 1.0, 2, 25, 1.0, 391.0),
]

def via_R_T(d_mm, t_um, L_mm, N, T_c, rho20=RHO_CU_20C, alpha=ALPHA_CU):
    A = via_area_m2(d_mm * 1e-3, t_um * 1e-6)
    return rho20 * (1 + alpha * (T_c - 20.0)) * (L_mm * 1e-3) / (N * A)

def via_theta_array(d_mm, t_um, L_mm, N, k):
    return via_theta(d_mm * 1e-3, t_um * 1e-6, L_mm * 1e-3, k) / N

def _via_tag(d, t, L, N, T, k):
    return "d%smm_t%sum_L%smm_N%s_T%sC_k%s" % (_g(d), _g(t), _g(L), N, _g(T), _g(k))

def _via_vectors():
    out = []
    for d, t, L, N, T, I, k in VIA_CASES:
        tag = _via_tag(d, t, L, N, T, k)
        out.append(("via_task7a_area_mm2_" + tag, via_area_m2(d * 1e-3, t * 1e-6) * 1e6, 1e-9, (), "one barrel, pure geometry (finished hole d, test plating t)"))
        out.append(("via_task7a_R_T_mohm_" + tag, via_R_T(d, t, L, N, T) * 1e3, 1e-9, ("S-004",), "ideal parallel R(T)/N, pure-copper rho (S-012 plated copper unverified)"))
        out.append(("via_task7a_R20_mohm_" + tag, via_R_T(d, t, L, N, 20.0) * 1e3, 1e-9, ("S-004",), "ideal parallel R20/N"))
        out.append(("via_task7a_theta_KperW_" + tag, via_theta_array(d, t, L, N, k), 1e-9, ("S-007",), "axial conduction only, ideal parallel theta/N"))
        if I is not None:
            R = via_R_T(d, t, L, N, T)
            out.append(("via_task7a_vdrop_mV_" + tag, I * R * 1e3, 1e-9, ("S-004", "S-019"), "I = %s A through the whole array" % _g(I)))
            out.append(("via_task7a_power_mW_" + tag, I * I * R * 1e3, 1e-9, ("S-004", "S-019"), "P = I^2 R(T) for the whole array"))
    return out

# Pinned literals recorded from this oracle (regression pins, same policy as _TRACE_PINNED).
_VIA_PINNED = {
    'via_task7a_area_mm2_d0.3mm_t25um_L1.6mm_N1_T20C_k401': 0.025525440310417067,
    'via_task7a_R_T_mohm_d0.3mm_t25um_L1.6mm_N1_T20C_k401': 1.0807338310749393,
    'via_task7a_R20_mohm_d0.3mm_t25um_L1.6mm_N1_T20C_k401': 1.0807338310749393,
    'via_task7a_theta_KperW_d0.3mm_t25um_L1.6mm_N1_T20C_k401': 156.31561646470445,
    'via_task7a_area_mm2_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 0.025525440310417067,
    'via_task7a_R_T_mohm_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 0.33920182205575816,
    'via_task7a_R20_mohm_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 0.2701834577687348,
    'via_task7a_theta_KperW_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 40.07836457950542,
    'via_task7a_vdrop_mV_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 0.6784036441115163,
    'via_task7a_power_mW_d0.3mm_t25um_L1.6mm_N4_T85C_k391': 1.3568072882230326,
    'via_task7a_area_mm2_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 0.012327609572686348,
    'via_task7a_R_T_mohm_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 1.4926405274824635,
    'via_task7a_R20_mohm_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 1.1188789981503418,
    'via_task7a_theta_KperW_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 161.8328725504235,
    'via_task7a_vdrop_mV_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 0.7463202637412317,
    'via_task7a_power_mW_d0.2mm_t18um_L0.8mm_N1_T105C_k401': 0.37316013187061586,
    'via_task7a_area_mm2_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 0.05882632243846887,
    'via_task7a_R_T_mohm_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 0.13336159883186635,
    'via_task7a_R20_mohm_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 0.11723581278349642,
    'via_task7a_theta_KperW_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 16.95680085147828,
    'via_task7a_vdrop_mV_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 0.4000847964955991,
    'via_task7a_power_mW_d0.5mm_t35um_L2.4mm_N6_T55C_k401': 1.2002543894867972,
    'via_task7a_area_mm2_d0.25mm_t20um_L1mm_N2_T25C_k391': 0.01696460032938488,
    'via_task7a_R_T_mohm_d0.25mm_t20um_L1mm_N2_T25C_k391': 0.5181428407523981,
    'via_task7a_R20_mohm_d0.25mm_t20um_L1mm_N2_T25C_k391': 0.5081575449932803,
    'via_task7a_theta_KperW_d0.25mm_t20um_L1mm_N2_T25C_k391': 75.37886856677815,
    'via_task7a_vdrop_mV_d0.25mm_t20um_L1mm_N2_T25C_k391': 0.5181428407523981,
    'via_task7a_power_mW_d0.25mm_t20um_L1mm_N2_T25C_k391': 0.5181428407523981,
}
GOLDEN.extend((n, got, _VIA_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _via_vectors())

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
