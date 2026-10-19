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


# ---------------------------------------------------------------------------------------------------------------
# Task 7b: annular ring stack-up arithmetic (pure geometry; every number below is a TEST value, not fab data).
# AR = (pad - hole)/2. Linear worst case: AR_wc = AR - (pad_tol/2 + hole_tol_plus/2 + position_tol). Tolerances that are
# absent contribute nothing (no tolerance is assumed). Drill reference: finished hole = drill - 2*plating, so
# AR_finished = AR_drill + plating.
# ---------------------------------------------------------------------------------------------------------------
# (pad mm, finished hole mm, pad tol +/- mm | None, hole tol plus mm | None, position tol mm | None, test minimum mm)
RING_CASES = [
    (1.0, 0.6, 0.05, 0.13, 0.075, 0.15),
    (0.9, 0.5, None, None, 0.075, 0.18),
    (1.4, 0.8, 0.1, 0.13, 0.075, 0.254),
    (0.5, 0.3, 0.05, None, None, 0.05),
]
# (pad mm, drill mm, plating um)
RING_DRILL_CASES = [
    (1.0, 0.65, 25.0),
    (0.7, 0.45, 18.0),
]

def ring_nominal_mm(pad, hole):
    return (pad - hole) / 2.0

def ring_worst_mm(pad, hole, pad_tol, hole_plus, pos_tol):
    return ring_nominal_mm(pad, hole) - ((pad_tol or 0.0) / 2.0 + (hole_plus or 0.0) / 2.0 + (pos_tol or 0.0))

def ring_drill_to_finished_mm(pad, drill, t_um):
    return (pad - (drill - 2.0 * t_um * 1e-3)) / 2.0

def _ring_tag(pad, hole, pt, hp, pos):
    return "p%smm_h%smm_pt%s_hp%s_pos%s" % (_g(pad), _g(hole), _g(pt) if pt is not None else "na", _g(hp) if hp is not None else "na", _g(pos) if pos is not None else "na")

def _ring_vectors():
    out = []
    for pad, hole, pt, hp, pos, mn in RING_CASES:
        tag = _ring_tag(pad, hole, pt, hp, pos)
        nom = ring_nominal_mm(pad, hole)
        out.append(("ring_task7b_nominal_mm_" + tag, nom, 1e-9, (), "(pad - finished hole)/2, pure geometry"))
        out.append(("ring_task7b_nominal_margin_mm_%s_min%s" % (tag, _g(mn)), nom - mn, 1e-9, (), "nominal ring minus a TEST minimum"))
        if pt is not None or hp is not None or pos is not None:
            wc = ring_worst_mm(pad, hole, pt, hp, pos)
            out.append(("ring_task7b_worst_mm_" + tag, wc, 1e-9, (), "linear worst case: AR - (pad_tol/2 + hole_tol_plus/2 + position_tol); absent terms omitted"))
            out.append(("ring_task7b_worst_margin_mm_%s_min%s" % (tag, _g(mn)), wc - mn, 1e-9, (), "worst-case ring minus a TEST minimum"))
    for pad, drill, t in RING_DRILL_CASES:
        tag = "p%smm_drill%smm_t%sum" % (_g(pad), _g(drill), _g(t))
        out.append(("ring_task7b_drillref_mm_" + tag, ring_nominal_mm(pad, drill), 1e-9, (), "ring referenced to the drill diameter"))
        out.append(("ring_task7b_finishedref_mm_" + tag, ring_drill_to_finished_mm(pad, drill, t), 1e-9, (), "ring referenced to the finished hole = drill - 2*plating"))
    return out

_RING_PINNED = {
    'ring_task7b_nominal_mm_p1mm_h0.6mm_pt0.05_hp0.13_pos0.075': 0.2,
    'ring_task7b_nominal_margin_mm_p1mm_h0.6mm_pt0.05_hp0.13_pos0.075_min0.15': 0.05000000000000002,
    'ring_task7b_worst_mm_p1mm_h0.6mm_pt0.05_hp0.13_pos0.075': 0.03500000000000003,
    'ring_task7b_worst_margin_mm_p1mm_h0.6mm_pt0.05_hp0.13_pos0.075_min0.15': -0.11499999999999996,
    'ring_task7b_nominal_mm_p0.9mm_h0.5mm_ptna_hpna_pos0.075': 0.2,
    'ring_task7b_nominal_margin_mm_p0.9mm_h0.5mm_ptna_hpna_pos0.075_min0.18': 0.020000000000000018,
    'ring_task7b_worst_mm_p0.9mm_h0.5mm_ptna_hpna_pos0.075': 0.125,
    'ring_task7b_worst_margin_mm_p0.9mm_h0.5mm_ptna_hpna_pos0.075_min0.18': -0.05499999999999999,
    'ring_task7b_nominal_mm_p1.4mm_h0.8mm_pt0.1_hp0.13_pos0.075': 0.29999999999999993,
    'ring_task7b_nominal_margin_mm_p1.4mm_h0.8mm_pt0.1_hp0.13_pos0.075_min0.254': 0.04599999999999993,
    'ring_task7b_worst_mm_p1.4mm_h0.8mm_pt0.1_hp0.13_pos0.075': 0.10999999999999993,
    'ring_task7b_worst_margin_mm_p1.4mm_h0.8mm_pt0.1_hp0.13_pos0.075_min0.254': -0.14400000000000007,
    'ring_task7b_nominal_mm_p0.5mm_h0.3mm_pt0.05_hpna_posna': 0.1,
    'ring_task7b_nominal_margin_mm_p0.5mm_h0.3mm_pt0.05_hpna_posna_min0.05': 0.05,
    'ring_task7b_worst_mm_p0.5mm_h0.3mm_pt0.05_hpna_posna': 0.07500000000000001,
    'ring_task7b_worst_margin_mm_p0.5mm_h0.3mm_pt0.05_hpna_posna_min0.05': 0.02500000000000001,
    'ring_task7b_drillref_mm_p1mm_drill0.65mm_t25um': 0.175,
    'ring_task7b_finishedref_mm_p1mm_drill0.65mm_t25um': 0.2,
    'ring_task7b_drillref_mm_p0.7mm_drill0.45mm_t18um': 0.12499999999999997,
    'ring_task7b_finishedref_mm_p0.7mm_drill0.45mm_t18um': 0.14299999999999996,
}
GOLDEN.extend((n, got, _RING_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _ring_vectors())


# ---------------------------------------------------------------------------------------------------------------
# Task 6: series current path with per-element current limits (path/load calculator). Independent of src/.
# The DC state comes from vd_solve (S-019, S-019h). Element kinds:
#   ("t", L_mm, w_mm, t_um, T_C, layer, dT_K)       copper trace; limit = IPC-2221 legacy current at the allowed rise dT_K (S-001)
#   ("v", d_mm, t_um, L_mm, N, T_C, rating_A|None)  via array (finished hole d, test plating t); limit = USER rating or None
#   ("r", ohm, rating_A|None)                        any user ohmic element; limit = USER rating or None
# Utilisation = I / I_limit (current basis only); margin = I_limit - I. A rating of None means the element is UNRATED and is
# left out of the ranking. Net-class width: the trace-width solve at the same dT for the applied current I, and with the
# 1.25 design margin on current (an engineering default of the trace-width calculator, not from a standard).
# Every number below is a TEST value, not fab data and not a rating from any datasheet.
# ---------------------------------------------------------------------------------------------------------------
PL_MARGIN = 1.25

def pl_R(e):
    if e[0] == "t":
        return trace_resistance_ohm(e[1], e[2], e[3], e[4])
    if e[0] == "v":
        return via_R_T(e[1], e[2], e[3], e[4], e[5])
    return e[1]

def pl_limit_A(e):
    if e[0] == "t":
        return ipc2221_current_A(e[2] * 1000.0 / MIL_UM, e[6], e[5], e[3])
    return e[6] if e[0] == "v" else e[2]

def pl_conv(e):
    return ("t", e[1], e[2], e[3], e[4]) if e[0] == "t" else ("r", pl_R(e))

def pl_solve(vs, kind, val, fwd, ret_mode, ret):
    s = vd_solve(vs, kind, val, [pl_conv(e) for e in fwd], ret_mode, [pl_conv(e) for e in ret])
    els = list(fwd) + (list(fwd) if ret_mode == "same" else list(ret) if ret_mode == "list" else [])
    rated = [(k, s["i"] / pl_limit_A(e)) for k, e in enumerate(els) if pl_limit_A(e) is not None]
    weakest = max(rated, key=lambda kv: (kv[1], -kv[0]))[0] if rated else None
    return s, els, weakest

# (case name, Vs, load kind, load value, forward elements, return mode, return list)
PL_CASES = [
    ("A_skill3A",   12.0, "I", 3.0,  [("t", 100, 1.0, 35.0, 25, "outer", 20.0), ("v", 0.3, 25.0, 1.6, 4, 25, None)], "none", ()),
    ("B_unratedconn", 5.0, "I", 2.0, [("t", 50, 2.0, 35.0, 25, "outer", 10.0), ("r", 0.01, None)], "none", ()),
    ("C_viaweakest", 12.0, "I", 2.0, [("t", 80, 3.0, 70.0, 25, "outer", 20.0), ("v", 0.3, 25.0, 1.6, 2, 25, 2.5), ("r", 0.02, 6.0)], "same", ()),
    ("D_constP",    24.0, "P", 60.0, [("t", 200, 4.0, 70.0, 60, "outer", 30.0), ("r", 0.015, 5.0)], "same", ()),
    ("E_over",       5.0, "R", 2.0,  [("t", 100, 0.3, 35.0, 25, "outer", 10.0)], "none", ()),
    ("F_under",     12.0, "I", 0.5,  [("t", 100, 2.0, 35.0, 25, "outer", 20.0), ("r", 0.05, 3.0)], "none", ()),
    ("G_innerlist",  5.0, "V", 4.8,  [("t", 150, 1.0, 35.0, 25, "inner", 20.0), ("r", 0.02, 4.0)], "list", [("t", 150, 2.0, 35.0, 25, "outer", 20.0)]),
]

def _pl_vectors():
    out = []
    for name, vs, kind, val, fwd, rm, ret in PL_CASES:
        s, els, weakest = pl_solve(vs, kind, val, fwd, rm, ret)
        h = ("S-019h",) if kind == "P" else ()
        out.append(("pl_%s_i_A" % name, s["i"], 1e-9, ("S-004", "S-019", "S-006") + h, "applied (series) current of the path"))
        out.append(("pl_%s_drop_V" % name, s["drop"], 1e-9, ("S-004", "S-019", "S-006") + h, "total drop = sum I R_k"))
        out.append(("pl_%s_weakest_idx" % name, float(weakest) if weakest is not None else -1.0, 1e-9, ("S-019",), "index of the rated element with the highest I/I_limit (-1: none rated); ties go to the first"))
        for k, e in enumerate(els):
            R = pl_R(e)
            rids = ("S-004", "S-006") if e[0] in ("t", "v") else ()
            out.append(("pl_%s_e%d_R_ohm" % (name, k), R, 1e-9, rids, "element resistance"))
            out.append(("pl_%s_e%d_drop_V" % (name, k), s["i"] * R, 1e-9, ("S-019",) + rids + h, "I x R_k"))
            out.append(("pl_%s_e%d_loss_W" % (name, k), s["i"] ** 2 * R, 1e-9, ("S-019",) + rids + h, "I^2 x R_k"))
            lim = pl_limit_A(e)
            if lim is not None:
                lids = ("S-001", "S-010", "S-003", "S-006") if e[0] == "t" else ()
                lnote = "IPC-2221 legacy current capacity at the allowed rise (S-001, PAYWALLED)" if e[0] == "t" else "USER-SUPPLIED rating, not a ledger value"
                out.append(("pl_%s_e%d_limit_A" % (name, k), lim, 1e-9, lids, lnote))
                out.append(("pl_%s_e%d_util_frac" % (name, k), s["i"] / lim, 1e-9, lids + ("S-019",) + h, "I / I_limit"))
                out.append(("pl_%s_e%d_margin_A" % (name, k), lim - s["i"], 1e-9, lids + ("S-019",) + h, "I_limit - I (negative when over)"))
            if e[0] == "t":
                wmin = ipc2221_width_mil(s["i"], e[6], e[5], e[3]) * MIL_UM / 1000.0
                wrec = ipc2221_width_mil(PL_MARGIN * s["i"], e[6], e[5], e[3]) * MIL_UM / 1000.0
                out.append(("pl_%s_e%d_wmin_mm" % (name, k), wmin, 1e-9, ("S-001", "S-003", "S-006") + h, "net-class: minimum width for the applied current at the allowed rise (legacy)"))
                out.append(("pl_%s_e%d_wrec_mm" % (name, k), wrec, 1e-9, ("S-001", "S-003", "S-006") + h, "net-class: width solved for 1.25 x the applied current (engineering-default margin on current)"))
    return out

_PL_PINNED = {
    'pl_A_skill3A_i_A': 3.0,
    'pl_A_skill3A_drop_V': 0.15151366980636827,
    'pl_A_skill3A_weakest_idx': 0.0,
    'pl_A_skill3A_e0_R_ohm': 0.05022906403940887,
    'pl_A_skill3A_e0_drop_V': 0.15068719211822662,
    'pl_A_skill3A_e0_loss_W': 0.4520615763546798,
    'pl_A_skill3A_e0_limit_A': 3.2444036291288856,
    'pl_A_skill3A_e0_util_frac': 0.9246691666429595,
    'pl_A_skill3A_e0_margin_A': 0.24440362912888558,
    'pl_A_skill3A_e0_wmin_mm': 0.8976037469333806,
    'pl_A_skill3A_e0_wrec_mm': 1.2211067734861527,
    'pl_A_skill3A_e1_R_ohm': 0.00027549256271389047,
    'pl_A_skill3A_e1_drop_V': 0.0008264776881416714,
    'pl_A_skill3A_e1_loss_W': 0.0024794330644250144,
    'pl_B_unratedconn_i_A': 2.0,
    'pl_B_unratedconn_drop_V': 0.04511453201970443,
    'pl_B_unratedconn_weakest_idx': 0.0,
    'pl_B_unratedconn_e0_R_ohm': 0.012557266009852217,
    'pl_B_unratedconn_e0_drop_V': 0.025114532019704434,
    'pl_B_unratedconn_e0_loss_W': 0.05022906403940887,
    'pl_B_unratedconn_e0_limit_A': 3.9530146812356732,
    'pl_B_unratedconn_e0_util_frac': 0.5059429729653369,
    'pl_B_unratedconn_e0_margin_A': 1.9530146812356732,
    'pl_B_unratedconn_e0_wmin_mm': 0.781437462908628,
    'pl_B_unratedconn_e0_wrec_mm': 1.0630733018590897,
    'pl_B_unratedconn_e1_R_ohm': 0.01,
    'pl_B_unratedconn_e1_drop_V': 0.02,
    'pl_B_unratedconn_e1_loss_W': 0.04,
    'pl_C_viaweakest_i_A': 2.0,
    'pl_C_viaweakest_drop_V': 0.10899277465606252,
    'pl_C_viaweakest_weakest_idx': 1.0,
    'pl_C_viaweakest_e0_R_ohm': 0.00669720853858785,
    'pl_C_viaweakest_e0_drop_V': 0.0133944170771757,
    'pl_C_viaweakest_e0_loss_W': 0.0267888341543514,
    'pl_C_viaweakest_e0_limit_A': 11.893085335448598,
    'pl_C_viaweakest_e0_util_frac': 0.16816494152604697,
    'pl_C_viaweakest_e0_margin_A': 9.893085335448598,
    'pl_C_viaweakest_e0_wmin_mm': 0.2565489053349371,
    'pl_C_viaweakest_e0_wrec_mm': 0.34901102753328894,
    'pl_C_viaweakest_e1_R_ohm': 0.0005509851254277809,
    'pl_C_viaweakest_e1_drop_V': 0.0011019702508555619,
    'pl_C_viaweakest_e1_loss_W': 0.0022039405017111238,
    'pl_C_viaweakest_e1_limit_A': 2.5,
    'pl_C_viaweakest_e1_util_frac': 0.8,
    'pl_C_viaweakest_e1_margin_A': 0.5,
    'pl_C_viaweakest_e2_R_ohm': 0.02,
    'pl_C_viaweakest_e2_drop_V': 0.04,
    'pl_C_viaweakest_e2_loss_W': 0.08,
    'pl_C_viaweakest_e2_limit_A': 6.0,
    'pl_C_viaweakest_e2_util_frac': 0.3333333333333333,
    'pl_C_viaweakest_e2_margin_A': 4.0,
    'pl_C_viaweakest_e3_R_ohm': 0.00669720853858785,
    'pl_C_viaweakest_e3_drop_V': 0.0133944170771757,
    'pl_C_viaweakest_e3_loss_W': 0.0267888341543514,
    'pl_C_viaweakest_e3_limit_A': 11.893085335448598,
    'pl_C_viaweakest_e3_util_frac': 0.16816494152604697,
    'pl_C_viaweakest_e3_margin_A': 9.893085335448598,
    'pl_C_viaweakest_e3_wmin_mm': 0.2565489053349371,
    'pl_C_viaweakest_e3_wrec_mm': 0.34901102753328894,
    'pl_C_viaweakest_e4_R_ohm': 0.0005509851254277809,
    'pl_C_viaweakest_e4_drop_V': 0.0011019702508555619,
    'pl_C_viaweakest_e4_loss_W': 0.0022039405017111238,
    'pl_C_viaweakest_e4_limit_A': 2.5,
    'pl_C_viaweakest_e4_util_frac': 0.8,
    'pl_C_viaweakest_e4_margin_A': 0.5,
    'pl_C_viaweakest_e5_R_ohm': 0.02,
    'pl_C_viaweakest_e5_drop_V': 0.04,
    'pl_C_viaweakest_e5_loss_W': 0.08,
    'pl_C_viaweakest_e5_limit_A': 6.0,
    'pl_C_viaweakest_e5_util_frac': 0.3333333333333333,
    'pl_C_viaweakest_e5_margin_A': 4.0,
    'pl_D_constP_i_A': 2.515423579078251,
    'pl_D_constP_drop_V': 0.1471584750006567,
    'pl_D_constP_weakest_idx': 1.0,
    'pl_D_constP_e0_R_ohm': 0.0142512315270936,
    'pl_D_constP_e0_drop_V': 0.03584788381415459,
    'pl_D_constP_e0_loss_W': 0.09017261220618203,
    'pl_D_constP_e0_limit_A': 17.512787302243233,
    'pl_D_constP_e0_util_frac': 0.14363353677892537,
    'pl_D_constP_e0_margin_A': 14.997363723164982,
    'pl_D_constP_e0_wmin_mm': 0.27520370310656606,
    'pl_D_constP_e0_wrec_mm': 0.37438915234033837,
    'pl_D_constP_e1_R_ohm': 0.015,
    'pl_D_constP_e1_drop_V': 0.03773135368617376,
    'pl_D_constP_e1_loss_W': 0.09491033673274256,
    'pl_D_constP_e1_limit_A': 5.0,
    'pl_D_constP_e1_util_frac': 0.5030847158156502,
    'pl_D_constP_e1_margin_A': 2.484576420921749,
    'pl_D_constP_e2_R_ohm': 0.0142512315270936,
    'pl_D_constP_e2_drop_V': 0.03584788381415459,
    'pl_D_constP_e2_loss_W': 0.09017261220618203,
    'pl_D_constP_e2_limit_A': 17.512787302243233,
    'pl_D_constP_e2_util_frac': 0.14363353677892537,
    'pl_D_constP_e2_margin_A': 14.997363723164982,
    'pl_D_constP_e2_wmin_mm': 0.27520370310656606,
    'pl_D_constP_e2_wrec_mm': 0.37438915234033837,
    'pl_D_constP_e3_R_ohm': 0.015,
    'pl_D_constP_e3_drop_V': 0.03773135368617376,
    'pl_D_constP_e3_loss_W': 0.09491033673274256,
    'pl_D_constP_e3_limit_A': 5.0,
    'pl_D_constP_e3_util_frac': 0.5030847158156502,
    'pl_D_constP_e3_margin_A': 2.484576420921749,
    'pl_E_over_i_A': 2.30687934907365,
    'pl_E_over_drop_V': 0.3862413018527007,
    'pl_E_over_weakest_idx': 0.0,
    'pl_E_over_e0_R_ohm': 0.16743021346469625,
    'pl_E_over_e0_drop_V': 0.3862413018527007,
    'pl_E_over_e0_loss_W': 0.8910120830033175,
    'pl_E_over_e0_limit_A': 0.9990669447801742,
    'pl_E_over_e0_util_frac': 2.3090338051182697,
    'pl_E_over_e0_margin_A': -1.3078124042934758,
    'pl_E_over_e0_wmin_mm': 0.9514904090535866,
    'pl_E_over_e0_wrec_mm': 1.2944145870289887,
    'pl_F_under_i_A': 0.5,
    'pl_F_under_drop_V': 0.03755726600985222,
    'pl_F_under_weakest_idx': 1.0,
    'pl_F_under_e0_R_ohm': 0.025114532019704434,
    'pl_F_under_e0_drop_V': 0.012557266009852217,
    'pl_F_under_e0_loss_W': 0.006278633004926109,
    'pl_F_under_e0_limit_A': 5.362676823028493,
    'pl_F_under_e0_util_frac': 0.09323701884344252,
    'pl_F_under_e0_margin_A': 4.862676823028493,
    'pl_F_under_e0_wmin_mm': 0.07581804597041836,
    'pl_F_under_e0_wrec_mm': 0.10314343027562439,
    'pl_F_under_e1_R_ohm': 0.05,
    'pl_F_under_e1_drop_V': 0.025,
    'pl_F_under_e1_loss_W': 0.0125,
    'pl_F_under_e1_limit_A': 3.0,
    'pl_F_under_e1_util_frac': 0.16666666666666666,
    'pl_F_under_e1_margin_A': 2.5,
    'pl_G_innerlist_i_A': 1.5035853659665686,
    'pl_G_innerlist_drop_V': 0.20000000000000018,
    'pl_G_innerlist_weakest_idx': 0.0,
    'pl_G_innerlist_e0_R_ohm': 0.07534359605911331,
    'pl_G_innerlist_e0_drop_V': 0.1132855284537792,
    'pl_G_innerlist_e0_loss_W': 0.17033446275889172,
    'pl_G_innerlist_e0_limit_A': 1.6222018145644428,
    'pl_G_innerlist_e0_util_frac': 0.9268793515499041,
    'pl_G_innerlist_e0_margin_A': 0.11861644859787424,
    'pl_G_innerlist_e0_wmin_mm': 0.9005643870284858,
    'pl_G_innerlist_e0_wrec_mm': 1.2251344501601182,
    'pl_G_innerlist_e1_R_ohm': 0.02,
    'pl_G_innerlist_e1_drop_V': 0.030071707319331373,
    'pl_G_innerlist_e1_loss_W': 0.0452153790549764,
    'pl_G_innerlist_e1_limit_A': 4.0,
    'pl_G_innerlist_e1_util_frac': 0.37589634149164214,
    'pl_G_innerlist_e1_margin_A': 2.4964146340334317,
    'pl_G_innerlist_e2_R_ohm': 0.037671798029556655,
    'pl_G_innerlist_e2_drop_V': 0.0566427642268896,
    'pl_G_innerlist_e2_loss_W': 0.08516723137944586,
    'pl_G_innerlist_e2_limit_A': 5.362676823028493,
    'pl_G_innerlist_e2_util_frac': 0.2803796341986987,
    'pl_G_innerlist_e2_margin_A': 3.8590914570619246,
    'pl_G_innerlist_e2_wmin_mm': 0.3461792092728165,
    'pl_G_innerlist_e2_wrec_mm': 0.47094475566454,
}
GOLDEN.extend((n, got, _PL_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _pl_vectors())


# ---------------------------------------------------------------------------------------------------------------
# Circuit values, second slice (Phase 1 task 8): feedback divider, LED resistor, RC / LC, reactance. Independent of src/.
# Relations are ledger S-019 (VERIFIED textbook relations); sqrt(L/C) is S-019b (UNVERIFIED naming); snapping to preferred
# values reuses the S-016 lists above (PAYWALLED-USER-MUST-VERIFY). Nothing here verifies any ledger row.
# Every number in the case tables is a TEST value: Vref values are not taken from any datasheet.
# ---------------------------------------------------------------------------------------------------------------
TWO_PI = 2.0 * math.pi

def fb_vout(vref, r1, r2):
    """Vout = Vref (1 + R1/R2); R1 top (Vout to FB), R2 bottom (FB to ground)."""
    return vref * (1.0 + r1 / r2)

def fb_solve_r1(vref, vout, r2):
    return r2 * (vout / vref - 1.0)

def fb_solve_r2(vref, vout, r1):
    return r1 / (vout / vref - 1.0)

def fb_bias_vout(vref, r1, r2, ib, sign):
    """FB bias current ib (magnitude) INTO the pin (sign +1) or OUT of the pin (sign -1): Vout = Vref (1 + R1/R2) + sign ib R1."""
    return fb_vout(vref, r1, r2) + sign * ib * r1

def fb_powers(vref, r1, r2):
    vout = fb_vout(vref, r1, r2)
    i = vref / r2
    return {"vout": vout, "i": i, "v_r1": vout - vref, "v_r2": vref, "p_r1": (vout - vref) ** 2 / r1, "p_r2": vref * vref / r2, "p_total": vout * i}

def fb_snap(kind, vref, vout_t, other, series, mode):
    ideal = fb_solve_r1(vref, vout_t, other) if kind == "r1" else fb_solve_r2(vref, vout_t, other)
    snapped = eseries_nearest(ideal, series, mode)[0]
    vo = fb_vout(vref, snapped, other) if kind == "r1" else fb_vout(vref, other, snapped)
    return ideal, snapped, vo, (vo - vout_t) / vout_t

def fb_pairs(vref, vout_t, series, n=5):
    """Best (R1, R2) pairs: ranked by the divider-ratio error R2/(R1+R2) against Vref/Vout (best_pairs); Vout re-derived per pair."""
    out = []
    for r1, r2, _ratio, _e in best_pairs(vref / vout_t, series, "divider-ratio", n):
        vo = fb_vout(vref, r1, r2)
        out.append((r1, r2, vo, (vo - vout_t) / vout_t))
    return out

def fb_envelope(vref, r1, r2, tol, vtol, ib=0.0, sign=0):
    """Corner analysis over Vref (1 +- vtol), R1 and R2 (1 +- tol); ib (no tolerance) adds sign ib R1 at the corner R1. Returns (min, typ, max)."""
    vals = []
    for a in (1 - vtol, 1 + vtol):
        for b in (1 - tol, 1 + tol):
            for c in (1 - tol, 1 + tol):
                vals.append(fb_bias_vout(vref * a, r1 * b, r2 * c, ib, sign))
    typ = fb_bias_vout(vref, r1, r2, ib, sign)
    return min(vals), typ, max(vals)

def led_ideal_r(vs, vf, n, i):
    return (vs - n * vf) / i

def led_design(vs, vf, n, i, series):
    """Snap UP to the series (series None: exact). Returns the used R, the actual current, the signed current error fraction and powers."""
    ideal = led_ideal_r(vs, vf, n, i)
    r = ideal if series is None else eseries_nearest(ideal, series, "up")[0]
    ia = (vs - n * vf) / r
    return {"ideal": ideal, "r": r, "i": ia, "err": (ia - i) / i, "p_r": ia * ia * r, "p_led": vf * ia, "p_leds": n * vf * ia, "p_src": vs * ia,
            "di_per_100mV": n * 0.1 / r}

def rc_tau(r, c):
    return r * c

def rc_fc(r, c):
    return 1.0 / (TWO_PI * r * c)

def rc_solve_r(fc, c):
    return 1.0 / (TWO_PI * fc * c)

def rc_solve_c(fc, r):
    return 1.0 / (TWO_PI * fc * r)

def lc_f0(l, c):
    return 1.0 / (TWO_PI * math.sqrt(l * c))

def lc_z0(l, c):
    return math.sqrt(l / c)

def lc_solve_l(f0, c):
    return 1.0 / ((TWO_PI * f0) ** 2 * c)

def lc_solve_c(f0, l):
    return 1.0 / ((TWO_PI * f0) ** 2 * l)

def x_l(f, l):
    return TWO_PI * f * l

def x_c(f, c):
    return 1.0 / (TWO_PI * f * c)

FB_VOUT = [(0.8, 100e3, 10e3), (1.25, 22e3, 10e3), (0.6, 47e3, 10e3), (2.5, 10e3, 10e3), (0.5, 180e3, 20e3)]
FB_SOLVE_R1 = [(0.8, 3.3, 10e3), (0.6, 5.0, 10e3), (1.25, 12.0, 4.7e3)]
FB_SOLVE_R2 = [(0.8, 3.3, 100e3), (0.6, 1.8, 47e3), (1.25, 5.0, 33e3)]
FB_POWER = [(0.8, 100e3, 10e3), (1.25, 22e3, 10e3), (0.6, 1e3, 330.0)]
FB_BIAS = [(0.8, 100e3, 10e3, 50e-9, 1), (0.8, 100e3, 10e3, 50e-9, -1), (0.6, 1e6, 100e3, 1e-6, 1)]
FB_SNAP_CASES = [("r1", 0.8, 3.3, 10e3), ("r2", 0.8, 3.3, 91e3)]
FB_SNAP_SERIES = ("E24", "E96", "E192")
FB_PAIR_CASES = [(0.8, 3.3, "E24"), (0.8, 3.3, "E96"), (0.6, 5.0, "E96")]
FB_ENV = [(0.8, 100e3, 10e3, 0.01, 0.0, 0.0, 0), (0.8, 100e3, 10e3, 0.01, 0.01, 0.0, 0), (0.6, 47e3, 10e3, 0.05, 0.02, 0.0, 0),
          (0.8, 100e3, 10e3, 0.01, 0.01, 50e-9, 1), (0.8, 100e3, 10e3, 0.01, 0.01, 50e-9, -1)]
LED_CASES = [(5.0, 2.1, 1, 0.010), (3.3, 1.8, 1, 0.020), (12.0, 3.2, 3, 0.020), (24.0, 2.0, 4, 0.015), (5.0, 2.0, 1, 0.010)]
LED_SERIES = (None, "E12", "E24", "E96", "E192")
RC_CASES = [(1e3, 1e-6), (10e3, 100e-9), (4.7e3, 47e-12), (500.0, 7e-6), (100.0, 10e-12)]
RC_SOLVE_R = [(1e3, 100e-9), (159.1549430918954, 1e-6), (10e6, 10e-12)]
RC_SOLVE_C = [(1e3, 1e3), (50.0, 10e3), (2.4e6, 50.0)]
LC_CASES = [(10e-6, 100e-9), (1e-3, 1e-6), (100e-9, 10e-12), (4.7e-6, 22e-6)]
LC_SOLVE_L = [(1e6, 100e-9), (50e3, 1e-6), (13.56e6, 100e-12)]
LC_SOLVE_C = [(1e6, 10e-6), (455e3, 1e-3), (100e6, 47e-9)]
XL_CASES = [(1e3, 1e-3), (100e3, 10e-6), (50.0, 1.0), (2.4e9, 1e-9)]
XC_CASES = [(1e3, 1e-6), (100e6, 100e-12), (50.0, 100e-6), (1e6, 100e-9)]
XL_SOLVE_F = [(6.283185307179586, 1e-3), (100.0, 10e-6)]
XL_SOLVE_L = [(62.83185307179586, 1e3), (1.0, 1e6)]
XC_SOLVE_F = [(159.1549430918954, 1e-6), (1.0, 100e-12)]
XC_SOLVE_C = [(159.1549430918954, 1e3), (10.0, 1e6)]

def _circuit2_vectors():
    out = []
    S = ("S-019",)
    SS = ("S-019", "S-016")
    SB = ("S-019", "S-019b")
    for ci, (vref, r1, r2) in enumerate(FB_VOUT):
        out.append(("fb_vout_c%d_V" % ci, fb_vout(vref, r1, r2), 1e-9, S, "Vout = Vref (1 + R1/R2)"))
    for ci, (vref, t, r2) in enumerate(FB_SOLVE_R1):
        out.append(("fb_solve_r1_c%d_ohm" % ci, fb_solve_r1(vref, t, r2), 1e-9, S, "R1 = R2 (Vout/Vref - 1); exact, unsnapped"))
    for ci, (vref, t, r1) in enumerate(FB_SOLVE_R2):
        out.append(("fb_solve_r2_c%d_ohm" % ci, fb_solve_r2(vref, t, r1), 1e-9, S, "R2 = R1 / (Vout/Vref - 1); exact, unsnapped"))
    for ci, (vref, r1, r2) in enumerate(FB_POWER):
        o = fb_powers(vref, r1, r2)
        for key, unit in (("i", "A"), ("v_r1", "V"), ("v_r2", "V"), ("p_r1", "W"), ("p_r2", "W"), ("p_total", "W")):
            out.append(("fb_power_c%d_%s_%s" % (ci, key, unit), o[key], 1e-9, S, "I = Vref/R2; V(R1) = Vout - Vref; P(R1) = V(R1)^2/R1; P(R2) = Vref^2/R2; total = Vout I"))
    for ci, (vref, r1, r2, ib, sg) in enumerate(FB_BIAS):
        vb = fb_bias_vout(vref, r1, r2, ib, sg)
        out.append(("fb_bias_c%d_shift_V" % ci, sg * ib * r1, 1e-9, S, "shift = +ib R1 for current INTO the FB pin, -ib R1 out of it (KCL at the FB node)"))
        out.append(("fb_bias_c%d_vout_V" % ci, vb, 1e-9, S, "Vout = Vref (1 + R1/R2) + shift"))
        out.append(("fb_bias_c%d_ratio" % ci, (vref / r2) / ib, 1e-9, S, "divider current Vref/R2 over the bias current"))
    for ci, (kind, vref, t, other) in enumerate(FB_SNAP_CASES):
        for s in FB_SNAP_SERIES:
            for m in SNAP_MODES:
                ideal, sn, vo, ef = fb_snap(kind, vref, t, other, s, m)
                out.append(("fb_snap_c%d_%s_%s_ohm" % (ci, s, m), sn, 1e-9, SS, "solved %s snapped to %s (%s)" % (kind, s, m)))
                out.append(("fb_snap_c%d_%s_%s_vout_V" % (ci, s, m), vo, 1e-9, SS, "Vout with the snapped resistor"))
                out.append(("fb_snap_c%d_%s_%s_err_frac" % (ci, s, m), ef, 1e-9, SS, "(Vout - target)/target as a fraction"))
    for ci, (vref, t, s) in enumerate(FB_PAIR_CASES):
        for k, (r1, r2, vo, ef) in enumerate(fb_pairs(vref, t, s)):
            out.append(("fb_pair_c%d_rank%d_r1_ohm" % (ci, k), r1, 1e-9, SS, "best_pairs divider-ratio R2/(R1+R2) = Vref/Vout over %s, window 1 kohm .. 976 kohm" % s))
            out.append(("fb_pair_c%d_rank%d_r2_ohm" % (ci, k), r2, 1e-9, SS, "pair R2"))
            out.append(("fb_pair_c%d_rank%d_vout_V" % (ci, k), vo, 1e-9, SS, "Vout of the pair"))
            out.append(("fb_pair_c%d_rank%d_err_frac" % (ci, k), ef, 1e-9, SS, "(Vout - target)/target as a fraction"))
    for ci, (vref, r1, r2, tol, vt, ib, sg) in enumerate(FB_ENV):
        lo, _typ, hi = fb_envelope(vref, r1, r2, tol, vt, ib, sg)
        out.append(("fb_env_c%d_min_V" % ci, lo, 1e-9, S, "initial-tolerance corners over Vref and R1, R2 (+bias shift when ib > 0); TCR excluded"))
        out.append(("fb_env_c%d_max_V" % ci, hi, 1e-9, S, "initial-tolerance corners over Vref and R1, R2 (+bias shift when ib > 0); TCR excluded"))
    for ci, (vs, vf, n, i) in enumerate(LED_CASES):
        for s in LED_SERIES:
            tag = "none" if s is None else s
            d = led_design(vs, vf, n, i, s)
            ids = S if s is None else SS
            for key, unit in (("ideal", "ohm"), ("r", "ohm"), ("i", "A"), ("err", "frac"), ("p_r", "W"), ("p_led", "W"), ("p_leds", "W"), ("p_src", "W"), ("di_per_100mV", "A")):
                if key == "ideal" and s is not None:
                    continue
                out.append(("led_c%d_%s_%s_%s" % (ci, tag, key, unit), d[key], 1e-9, ids, "R = (Vs - N Vf)/If, snapped UP to the series; I = (Vs - N Vf)/R; P(R) = I^2 R; P(LED) = Vf I; source = Vs I"))
    for ci, (r, c) in enumerate(RC_CASES):
        out.append(("rc_c%d_tau_s" % ci, rc_tau(r, c), 1e-9, S, "tau = R C"))
        out.append(("rc_c%d_fc_Hz" % ci, rc_fc(r, c), 1e-9, S, "fc = 1/(2 pi R C)"))
    for ci, (fc, c) in enumerate(RC_SOLVE_R):
        out.append(("rc_solve_r_c%d_ohm" % ci, rc_solve_r(fc, c), 1e-9, S, "R = 1/(2 pi fc C)"))
    for ci, (fc, r) in enumerate(RC_SOLVE_C):
        out.append(("rc_solve_c_c%d_F" % ci, rc_solve_c(fc, r), 1e-9, S, "C = 1/(2 pi fc R)"))
    for ci, (l, c) in enumerate(LC_CASES):
        out.append(("lc_c%d_f0_Hz" % ci, lc_f0(l, c), 1e-9, S, "f0 = 1/(2 pi sqrt(L C))"))
        out.append(("lc_c%d_z0_ohm" % ci, lc_z0(l, c), 1e-9, SB, "sqrt(L/C) (= XL = XC at f0); S-019b UNVERIFIED naming"))
    for ci, (f0, c) in enumerate(LC_SOLVE_L):
        out.append(("lc_solve_l_c%d_H" % ci, lc_solve_l(f0, c), 1e-9, S, "L = 1/((2 pi f0)^2 C)"))
        out.append(("lc_solve_l_c%d_z0_ohm" % ci, lc_z0(lc_solve_l(f0, c), c), 1e-9, SB, "sqrt(L/C) of the solved L"))
    for ci, (f0, l) in enumerate(LC_SOLVE_C):
        out.append(("lc_solve_c_c%d_F" % ci, lc_solve_c(f0, l), 1e-9, S, "C = 1/((2 pi f0)^2 L)"))
        out.append(("lc_solve_c_c%d_z0_ohm" % ci, lc_z0(l, lc_solve_c(f0, l)), 1e-9, SB, "sqrt(L/C) of the solved C"))
    for ci, (f, l) in enumerate(XL_CASES):
        out.append(("xl_c%d_ohm" % ci, x_l(f, l), 1e-9, S, "XL = 2 pi f L (magnitude)"))
    for ci, (f, c) in enumerate(XC_CASES):
        out.append(("xc_c%d_ohm" % ci, x_c(f, c), 1e-9, S, "XC = 1/(2 pi f C) (magnitude)"))
    for ci, (x, l) in enumerate(XL_SOLVE_F):
        out.append(("xl_solve_f_c%d_Hz" % ci, x / (TWO_PI * l), 1e-9, S, "f = XL/(2 pi L)"))
    for ci, (x, f) in enumerate(XL_SOLVE_L):
        out.append(("xl_solve_l_c%d_H" % ci, x / (TWO_PI * f), 1e-9, S, "L = XL/(2 pi f)"))
    for ci, (x, c) in enumerate(XC_SOLVE_F):
        out.append(("xc_solve_f_c%d_Hz" % ci, 1.0 / (TWO_PI * x * c), 1e-9, S, "f = 1/(2 pi XC C)"))
    for ci, (x, f) in enumerate(XC_SOLVE_C):
        out.append(("xc_solve_c_c%d_F" % ci, 1.0 / (TWO_PI * x * f), 1e-9, S, "C = 1/(2 pi f XC)"))
    return out



# Pinned literals recorded from this oracle (regression pins, same policy as _CIRCUIT_PINNED).
_CIRCUIT2_PINNED = {
    'fb_vout_c0_V': 8.8,
    'fb_vout_c1_V': 4.0,
    'fb_vout_c2_V': 3.42,
    'fb_vout_c3_V': 5.0,
    'fb_vout_c4_V': 5.0,
    'fb_solve_r1_c0_ohm': 31249.999999999993,
    'fb_solve_r1_c1_ohm': 73333.33333333334,
    'fb_solve_r1_c2_ohm': 40420.0,
    'fb_solve_r2_c0_ohm': 32000.00000000001,
    'fb_solve_r2_c1_ohm': 23500.0,
    'fb_solve_r2_c2_ohm': 11000.0,
    'fb_power_c0_i_A': 8e-05,
    'fb_power_c0_v_r1_V': 8.0,
    'fb_power_c0_v_r2_V': 0.8,
    'fb_power_c0_p_r1_W': 0.00064,
    'fb_power_c0_p_r2_W': 6.400000000000001e-05,
    'fb_power_c0_p_total_W': 0.0007040000000000001,
    'fb_power_c1_i_A': 0.000125,
    'fb_power_c1_v_r1_V': 2.75,
    'fb_power_c1_v_r2_V': 1.25,
    'fb_power_c1_p_r1_W': 0.00034375,
    'fb_power_c1_p_r2_W': 0.00015625,
    'fb_power_c1_p_total_W': 0.0005,
    'fb_power_c2_i_A': 0.0018181818181818182,
    'fb_power_c2_v_r1_V': 1.818181818181818,
    'fb_power_c2_v_r2_V': 0.6,
    'fb_power_c2_p_r1_W': 0.0033057851239669408,
    'fb_power_c2_p_r2_W': 0.001090909090909091,
    'fb_power_c2_p_total_W': 0.004396694214876032,
    'fb_bias_c0_shift_V': 0.005,
    'fb_bias_c0_vout_V': 8.805000000000001,
    'fb_bias_c0_ratio': 1600.0000000000002,
    'fb_bias_c1_shift_V': -0.005,
    'fb_bias_c1_vout_V': 8.795,
    'fb_bias_c1_ratio': 1600.0000000000002,
    'fb_bias_c2_shift_V': 1.0,
    'fb_bias_c2_vout_V': 7.6,
    'fb_bias_c2_ratio': 6.0,
    'fb_snap_c0_E24_nearest_ohm': 30000.0,
    'fb_snap_c0_E24_nearest_vout_V': 3.2,
    'fb_snap_c0_E24_nearest_err_frac': -0.030303030303030196,
    'fb_snap_c0_E24_up_ohm': 33000.0,
    'fb_snap_c0_E24_up_vout_V': 3.44,
    'fb_snap_c0_E24_up_err_frac': 0.04242424242424246,
    'fb_snap_c0_E24_down_ohm': 30000.0,
    'fb_snap_c0_E24_down_vout_V': 3.2,
    'fb_snap_c0_E24_down_err_frac': -0.030303030303030196,
    'fb_snap_c0_E96_nearest_ohm': 30900.0,
    'fb_snap_c0_E96_nearest_vout_V': 3.2720000000000002,
    'fb_snap_c0_E96_nearest_err_frac': -0.008484848484848359,
    'fb_snap_c0_E96_up_ohm': 31600.0,
    'fb_snap_c0_E96_up_vout_V': 3.3280000000000003,
    'fb_snap_c0_E96_up_err_frac': 0.008484848484848628,
    'fb_snap_c0_E96_down_ohm': 30900.0,
    'fb_snap_c0_E96_down_vout_V': 3.2720000000000002,
    'fb_snap_c0_E96_down_err_frac': -0.008484848484848359,
    'fb_snap_c0_E192_nearest_ohm': 31200.0,
    'fb_snap_c0_E192_nearest_vout_V': 3.2960000000000003,
    'fb_snap_c0_E192_nearest_err_frac': -0.0012121212121210788,
    'fb_snap_c0_E192_up_ohm': 31600.0,
    'fb_snap_c0_E192_up_vout_V': 3.3280000000000003,
    'fb_snap_c0_E192_up_err_frac': 0.008484848484848628,
    'fb_snap_c0_E192_down_ohm': 31200.0,
    'fb_snap_c0_E192_down_vout_V': 3.2960000000000003,
    'fb_snap_c0_E192_down_err_frac': -0.0012121212121210788,
    'fb_snap_c1_E24_nearest_ohm': 30000.0,
    'fb_snap_c1_E24_nearest_vout_V': 3.2266666666666666,
    'fb_snap_c1_E24_nearest_err_frac': -0.0222222222222222,
    'fb_snap_c1_E24_up_ohm': 30000.0,
    'fb_snap_c1_E24_up_vout_V': 3.2266666666666666,
    'fb_snap_c1_E24_up_err_frac': -0.0222222222222222,
    'fb_snap_c1_E24_down_ohm': 27000.0,
    'fb_snap_c1_E24_down_vout_V': 3.4962962962962965,
    'fb_snap_c1_E24_down_err_frac': 0.05948372615039292,
    'fb_snap_c1_E96_nearest_ohm': 29400.0,
    'fb_snap_c1_E96_nearest_vout_V': 3.276190476190476,
    'fb_snap_c1_E96_nearest_err_frac': -0.00721500721500719,
    'fb_snap_c1_E96_up_ohm': 29400.0,
    'fb_snap_c1_E96_up_vout_V': 3.276190476190476,
    'fb_snap_c1_E96_up_err_frac': -0.00721500721500719,
    'fb_snap_c1_E96_down_ohm': 28700.0,
    'fb_snap_c1_E96_down_vout_V': 3.336585365853659,
    'fb_snap_c1_E96_down_err_frac': 0.011086474501108792,
    'fb_snap_c1_E192_nearest_ohm': 29100.0,
    'fb_snap_c1_E192_nearest_vout_V': 3.301718213058419,
    'fb_snap_c1_E192_nearest_err_frac': 0.0005206706237634055,
    'fb_snap_c1_E192_up_ohm': 29400.0,
    'fb_snap_c1_E192_up_vout_V': 3.276190476190476,
    'fb_snap_c1_E192_up_err_frac': -0.00721500721500719,
    'fb_snap_c1_E192_down_ohm': 29100.0,
    'fb_snap_c1_E192_down_vout_V': 3.301718213058419,
    'fb_snap_c1_E192_down_err_frac': 0.0005206706237634055,
    'fb_pair_c0_rank0_r1_ohm': 7500.0,
    'fb_pair_c0_rank0_r2_ohm': 2400.0,
    'fb_pair_c0_rank0_vout_V': 3.3000000000000003,
    'fb_pair_c0_rank0_err_frac': 1.345724878333523e-16,
    'fb_pair_c0_rank1_r1_ohm': 75000.0,
    'fb_pair_c0_rank1_r2_ohm': 24000.0,
    'fb_pair_c0_rank1_vout_V': 3.3000000000000003,
    'fb_pair_c0_rank1_err_frac': 1.345724878333523e-16,
    'fb_pair_c0_rank2_r1_ohm': 750000.0,
    'fb_pair_c0_rank2_r2_ohm': 240000.0,
    'fb_pair_c0_rank2_vout_V': 3.3000000000000003,
    'fb_pair_c0_rank2_err_frac': 1.345724878333523e-16,
    'fb_pair_c0_rank3_r1_ohm': 4700.0,
    'fb_pair_c0_rank3_r2_ohm': 1500.0,
    'fb_pair_c0_rank3_vout_V': 3.3066666666666666,
    'fb_pair_c0_rank3_err_frac': 0.002020202020202067,
    'fb_pair_c0_rank4_r1_ohm': 47000.0,
    'fb_pair_c0_rank4_r2_ohm': 15000.0,
    'fb_pair_c0_rank4_vout_V': 3.3066666666666666,
    'fb_pair_c0_rank4_err_frac': 0.002020202020202067,
    'fb_pair_c1_rank0_r1_ohm': 3570.0,
    'fb_pair_c1_rank0_r2_ohm': 1150.0,
    'fb_pair_c1_rank0_vout_V': 3.2834782608695647,
    'fb_pair_c1_rank0_err_frac': -0.00500658761528336,
    'fb_pair_c1_rank1_r1_ohm': 35700.0,
    'fb_pair_c1_rank1_r2_ohm': 11500.0,
    'fb_pair_c1_rank1_vout_V': 3.2834782608695647,
    'fb_pair_c1_rank1_err_frac': -0.00500658761528336,
    'fb_pair_c1_rank2_r1_ohm': 357000.0,
    'fb_pair_c1_rank2_r2_ohm': 115000.0,
    'fb_pair_c1_rank2_vout_V': 3.2834782608695647,
    'fb_pair_c1_rank2_err_frac': -0.00500658761528336,
    'fb_pair_c1_rank3_r1_ohm': 10700.0,
    'fb_pair_c1_rank3_r2_ohm': 3400.0,
    'fb_pair_c1_rank3_vout_V': 3.317647058823529,
    'fb_pair_c1_rank3_err_frac': 0.005347593582887682,
    'fb_pair_c1_rank4_r1_ohm': 107000.0,
    'fb_pair_c1_rank4_r2_ohm': 34000.0,
    'fb_pair_c1_rank4_vout_V': 3.317647058823529,
    'fb_pair_c1_rank4_err_frac': 0.005347593582887682,
    'fb_pair_c2_rank0_r1_ohm': 11000.0,
    'fb_pair_c2_rank0_r2_ohm': 1500.0,
    'fb_pair_c2_rank0_vout_V': 4.999999999999999,
    'fb_pair_c2_rank0_err_frac': -1.7763568394002506e-16,
    'fb_pair_c2_rank1_r1_ohm': 110000.0,
    'fb_pair_c2_rank1_r2_ohm': 15000.0,
    'fb_pair_c2_rank1_vout_V': 4.999999999999999,
    'fb_pair_c2_rank1_err_frac': -1.7763568394002506e-16,
    'fb_pair_c2_rank2_r1_ohm': 15400.0,
    'fb_pair_c2_rank2_r2_ohm': 2100.0,
    'fb_pair_c2_rank2_vout_V': 4.999999999999999,
    'fb_pair_c2_rank2_err_frac': -1.7763568394002506e-16,
    'fb_pair_c2_rank3_r1_ohm': 154000.0,
    'fb_pair_c2_rank3_r2_ohm': 21000.0,
    'fb_pair_c2_rank3_vout_V': 4.999999999999999,
    'fb_pair_c2_rank3_err_frac': -1.7763568394002506e-16,
    'fb_pair_c2_rank4_r1_ohm': 12100.0,
    'fb_pair_c2_rank4_r2_ohm': 1650.0,
    'fb_pair_c2_rank4_vout_V': 4.999999999999999,
    'fb_pair_c2_rank4_err_frac': -1.7763568394002506e-16,
    'fb_env_c0_min_V': 8.641584158415842,
    'fb_env_c0_max_V': 8.961616161616162,
    'fb_env_c1_min_V': 8.555168316831683,
    'fb_env_c1_max_V': 9.051232323232323,
    'fb_env_c2_min_V': 3.0884,
    'fb_env_c2_max_V': 3.7911789473684214,
    'fb_env_c3_min_V': 8.560118316831682,
    'fb_env_c3_max_V': 9.056282323232324,
    'fb_env_c4_min_V': 8.550218316831684,
    'fb_env_c4_max_V': 9.046182323232323,
    'led_c0_none_ideal_ohm': 290.0,
    'led_c0_none_r_ohm': 290.0,
    'led_c0_none_i_A': 0.01,
    'led_c0_none_err_frac': 0.0,
    'led_c0_none_p_r_W': 0.029,
    'led_c0_none_p_led_W': 0.021,
    'led_c0_none_p_leds_W': 0.021,
    'led_c0_none_p_src_W': 0.05,
    'led_c0_none_di_per_100mV_A': 0.0003448275862068966,
    'led_c0_E12_r_ohm': 330.0,
    'led_c0_E12_i_A': 0.008787878787878787,
    'led_c0_E12_err_frac': -0.1212121212121213,
    'led_c0_E12_p_r_W': 0.02548484848484848,
    'led_c0_E12_p_led_W': 0.018454545454545453,
    'led_c0_E12_p_leds_W': 0.018454545454545453,
    'led_c0_E12_p_src_W': 0.04393939393939394,
    'led_c0_E12_di_per_100mV_A': 0.00030303030303030303,
    'led_c0_E24_r_ohm': 300.0,
    'led_c0_E24_i_A': 0.009666666666666667,
    'led_c0_E24_err_frac': -0.033333333333333305,
    'led_c0_E24_p_r_W': 0.028033333333333337,
    'led_c0_E24_p_led_W': 0.020300000000000002,
    'led_c0_E24_p_leds_W': 0.020300000000000002,
    'led_c0_E24_p_src_W': 0.04833333333333334,
    'led_c0_E24_di_per_100mV_A': 0.0003333333333333334,
    'led_c0_E96_r_ohm': 294.0,
    'led_c0_E96_i_A': 0.009863945578231292,
    'led_c0_E96_err_frac': -0.013605442176870854,
    'led_c0_E96_p_r_W': 0.028605442176870742,
    'led_c0_E96_p_led_W': 0.020714285714285713,
    'led_c0_E96_p_leds_W': 0.020714285714285713,
    'led_c0_E96_p_src_W': 0.04931972789115646,
    'led_c0_E96_di_per_100mV_A': 0.00034013605442176874,
    'led_c0_E192_r_ohm': 291.0,
    'led_c0_E192_i_A': 0.009965635738831614,
    'led_c0_E192_err_frac': -0.00343642611683858,
    'led_c0_E192_p_r_W': 0.028900343642611678,
    'led_c0_E192_p_led_W': 0.02092783505154639,
    'led_c0_E192_p_leds_W': 0.02092783505154639,
    'led_c0_E192_p_src_W': 0.04982817869415807,
    'led_c0_E192_di_per_100mV_A': 0.0003436426116838488,
    'led_c1_none_ideal_ohm': 74.99999999999999,
    'led_c1_none_r_ohm': 74.99999999999999,
    'led_c1_none_i_A': 0.02,
    'led_c1_none_err_frac': 0.0,
    'led_c1_none_p_r_W': 0.029999999999999995,
    'led_c1_none_p_led_W': 0.036000000000000004,
    'led_c1_none_p_leds_W': 0.036000000000000004,
    'led_c1_none_p_src_W': 0.066,
    'led_c1_none_di_per_100mV_A': 0.0013333333333333337,
    'led_c1_E12_r_ohm': 82.0,
    'led_c1_E12_i_A': 0.018292682926829267,
    'led_c1_E12_err_frac': -0.08536585365853666,
    'led_c1_E12_p_r_W': 0.0274390243902439,
    'led_c1_E12_p_led_W': 0.032926829268292684,
    'led_c1_E12_p_leds_W': 0.032926829268292684,
    'led_c1_E12_p_src_W': 0.06036585365853658,
    'led_c1_E12_di_per_100mV_A': 0.0012195121951219512,
    'led_c1_E24_r_ohm': 75.0,
    'led_c1_E24_i_A': 0.019999999999999997,
    'led_c1_E24_err_frac': -1.734723475976807e-16,
    'led_c1_E24_p_r_W': 0.02999999999999999,
    'led_c1_E24_p_led_W': 0.036,
    'led_c1_E24_p_leds_W': 0.036,
    'led_c1_E24_p_src_W': 0.06599999999999999,
    'led_c1_E24_di_per_100mV_A': 0.0013333333333333335,
    'led_c1_E96_r_ohm': 75.0,
    'led_c1_E96_i_A': 0.019999999999999997,
    'led_c1_E96_err_frac': -1.734723475976807e-16,
    'led_c1_E96_p_r_W': 0.02999999999999999,
    'led_c1_E96_p_led_W': 0.036,
    'led_c1_E96_p_leds_W': 0.036,
    'led_c1_E96_p_src_W': 0.06599999999999999,
    'led_c1_E96_di_per_100mV_A': 0.0013333333333333335,
    'led_c1_E192_r_ohm': 75.0,
    'led_c1_E192_i_A': 0.019999999999999997,
    'led_c1_E192_err_frac': -1.734723475976807e-16,
    'led_c1_E192_p_r_W': 0.02999999999999999,
    'led_c1_E192_p_led_W': 0.036,
    'led_c1_E192_p_leds_W': 0.036,
    'led_c1_E192_p_src_W': 0.06599999999999999,
    'led_c1_E192_di_per_100mV_A': 0.0013333333333333335,
    'led_c2_none_ideal_ohm': 119.99999999999993,
    'led_c2_none_r_ohm': 119.99999999999993,
    'led_c2_none_i_A': 0.02,
    'led_c2_none_err_frac': 0.0,
    'led_c2_none_p_r_W': 0.04799999999999997,
    'led_c2_none_p_led_W': 0.064,
    'led_c2_none_p_leds_W': 0.19200000000000003,
    'led_c2_none_p_src_W': 0.24,
    'led_c2_none_di_per_100mV_A': 0.002500000000000002,
    'led_c2_E12_r_ohm': 120.0,
    'led_c2_E12_i_A': 0.019999999999999987,
    'led_c2_E12_err_frac': -6.938893903907228e-16,
    'led_c2_E12_p_r_W': 0.04799999999999994,
    'led_c2_E12_p_led_W': 0.06399999999999996,
    'led_c2_E12_p_leds_W': 0.1919999999999999,
    'led_c2_E12_p_src_W': 0.23999999999999982,
    'led_c2_E12_di_per_100mV_A': 0.0025000000000000005,
    'led_c2_E24_r_ohm': 120.0,
    'led_c2_E24_i_A': 0.019999999999999987,
    'led_c2_E24_err_frac': -6.938893903907228e-16,
    'led_c2_E24_p_r_W': 0.04799999999999994,
    'led_c2_E24_p_led_W': 0.06399999999999996,
    'led_c2_E24_p_leds_W': 0.1919999999999999,
    'led_c2_E24_p_src_W': 0.23999999999999982,
    'led_c2_E24_di_per_100mV_A': 0.0025000000000000005,
    'led_c2_E96_r_ohm': 121.0,
    'led_c2_E96_i_A': 0.01983471074380164,
    'led_c2_E96_err_frac': -0.008264462809918008,
    'led_c2_E96_p_r_W': 0.0476033057851239,
    'led_c2_E96_p_led_W': 0.06347107438016525,
    'led_c2_E96_p_leds_W': 0.19041322314049577,
    'led_c2_E96_p_src_W': 0.2380165289256197,
    'led_c2_E96_di_per_100mV_A': 0.0024793388429752068,
    'led_c2_E192_r_ohm': 120.0,
    'led_c2_E192_i_A': 0.019999999999999987,
    'led_c2_E192_err_frac': -6.938893903907228e-16,
    'led_c2_E192_p_r_W': 0.04799999999999994,
    'led_c2_E192_p_led_W': 0.06399999999999996,
    'led_c2_E192_p_leds_W': 0.1919999999999999,
    'led_c2_E192_p_src_W': 0.23999999999999982,
    'led_c2_E192_di_per_100mV_A': 0.0025000000000000005,
    'led_c3_none_ideal_ohm': 1066.6666666666667,
    'led_c3_none_r_ohm': 1066.6666666666667,
    'led_c3_none_i_A': 0.015,
    'led_c3_none_err_frac': 0.0,
    'led_c3_none_p_r_W': 0.24000000000000002,
    'led_c3_none_p_led_W': 0.03,
    'led_c3_none_p_leds_W': 0.12,
    'led_c3_none_p_src_W': 0.36,
    'led_c3_none_di_per_100mV_A': 0.000375,
    'led_c3_E12_r_ohm': 1200.0,
    'led_c3_E12_i_A': 0.013333333333333334,
    'led_c3_E12_err_frac': -0.11111111111111102,
    'led_c3_E12_p_r_W': 0.21333333333333337,
    'led_c3_E12_p_led_W': 0.02666666666666667,
    'led_c3_E12_p_leds_W': 0.10666666666666667,
    'led_c3_E12_p_src_W': 0.32,
    'led_c3_E12_di_per_100mV_A': 0.0003333333333333334,
    'led_c3_E24_r_ohm': 1100.0,
    'led_c3_E24_i_A': 0.014545454545454545,
    'led_c3_E24_err_frac': -0.03030303030303027,
    'led_c3_E24_p_r_W': 0.23272727272727273,
    'led_c3_E24_p_led_W': 0.02909090909090909,
    'led_c3_E24_p_leds_W': 0.11636363636363636,
    'led_c3_E24_p_src_W': 0.3490909090909091,
    'led_c3_E24_di_per_100mV_A': 0.00036363636363636367,
    'led_c3_E96_r_ohm': 1070.0,
    'led_c3_E96_i_A': 0.014953271028037384,
    'led_c3_E96_err_frac': -0.00311526479750771,
    'led_c3_E96_p_r_W': 0.23925233644859814,
    'led_c3_E96_p_led_W': 0.029906542056074768,
    'led_c3_E96_p_leds_W': 0.11962616822429907,
    'led_c3_E96_p_src_W': 0.3588785046728972,
    'led_c3_E96_di_per_100mV_A': 0.0003738317757009346,
    'led_c3_E192_r_ohm': 1070.0,
    'led_c3_E192_i_A': 0.014953271028037384,
    'led_c3_E192_err_frac': -0.00311526479750771,
    'led_c3_E192_p_r_W': 0.23925233644859814,
    'led_c3_E192_p_led_W': 0.029906542056074768,
    'led_c3_E192_p_leds_W': 0.11962616822429907,
    'led_c3_E192_p_src_W': 0.3588785046728972,
    'led_c3_E192_di_per_100mV_A': 0.0003738317757009346,
    'led_c4_none_ideal_ohm': 300.0,
    'led_c4_none_r_ohm': 300.0,
    'led_c4_none_i_A': 0.01,
    'led_c4_none_err_frac': 0.0,
    'led_c4_none_p_r_W': 0.030000000000000002,
    'led_c4_none_p_led_W': 0.02,
    'led_c4_none_p_leds_W': 0.02,
    'led_c4_none_p_src_W': 0.05,
    'led_c4_none_di_per_100mV_A': 0.0003333333333333334,
    'led_c4_E12_r_ohm': 330.0,
    'led_c4_E12_i_A': 0.00909090909090909,
    'led_c4_E12_err_frac': -0.09090909090909097,
    'led_c4_E12_p_r_W': 0.02727272727272727,
    'led_c4_E12_p_led_W': 0.01818181818181818,
    'led_c4_E12_p_leds_W': 0.01818181818181818,
    'led_c4_E12_p_src_W': 0.045454545454545456,
    'led_c4_E12_di_per_100mV_A': 0.00030303030303030303,
    'led_c4_E24_r_ohm': 300.0,
    'led_c4_E24_i_A': 0.01,
    'led_c4_E24_err_frac': 0.0,
    'led_c4_E24_p_r_W': 0.030000000000000002,
    'led_c4_E24_p_led_W': 0.02,
    'led_c4_E24_p_leds_W': 0.02,
    'led_c4_E24_p_src_W': 0.05,
    'led_c4_E24_di_per_100mV_A': 0.0003333333333333334,
    'led_c4_E96_r_ohm': 301.0,
    'led_c4_E96_i_A': 0.009966777408637873,
    'led_c4_E96_err_frac': -0.003322259136212709,
    'led_c4_E96_p_r_W': 0.02990033222591362,
    'led_c4_E96_p_led_W': 0.019933554817275746,
    'led_c4_E96_p_leds_W': 0.019933554817275746,
    'led_c4_E96_p_src_W': 0.04983388704318936,
    'led_c4_E96_di_per_100mV_A': 0.0003322259136212625,
    'led_c4_E192_r_ohm': 301.0,
    'led_c4_E192_i_A': 0.009966777408637873,
    'led_c4_E192_err_frac': -0.003322259136212709,
    'led_c4_E192_p_r_W': 0.02990033222591362,
    'led_c4_E192_p_led_W': 0.019933554817275746,
    'led_c4_E192_p_leds_W': 0.019933554817275746,
    'led_c4_E192_p_src_W': 0.04983388704318936,
    'led_c4_E192_di_per_100mV_A': 0.0003322259136212625,
    'rc_c0_tau_s': 0.001,
    'rc_c0_fc_Hz': 159.15494309189535,
    'rc_c1_tau_s': 0.001,
    'rc_c1_fc_Hz': 159.15494309189535,
    'rc_c2_tau_s': 2.209e-07,
    'rc_c2_fc_Hz': 720484.1244540305,
    'rc_c3_tau_s': 0.0035,
    'rc_c3_fc_Hz': 45.47284088339867,
    'rc_c4_tau_s': 9.999999999999999e-10,
    'rc_c4_fc_Hz': 159154943.09189534,
    'rc_solve_r_c0_ohm': 1591.5494309189537,
    'rc_solve_r_c1_ohm': 999.9999999999998,
    'rc_solve_r_c2_ohm': 1591.5494309189535,
    'rc_solve_c_c0_F': 1.5915494309189535e-07,
    'rc_solve_c_c1_F': 3.1830988618379064e-07,
    'rc_solve_c_c2_F': 1.3262911924324612e-09,
    'lc_c0_f0_Hz': 159154.94309189534,
    'lc_c0_z0_ohm': 10.0,
    'lc_c1_f0_Hz': 5032.921210448703,
    'lc_c1_z0_ohm': 31.622776601683796,
    'lc_c2_f0_Hz': 159154943.09189537,
    'lc_c2_z0_ohm': 100.0,
    'lc_c3_f0_Hz': 15651.640433668284,
    'lc_c3_z0_ohm': 0.4622081388685877,
    'lc_solve_l_c0_H': 2.5330295910584445e-07,
    'lc_solve_l_c0_z0_ohm': 1.5915494309189535,
    'lc_solve_l_c1_H': 1.0132118364233778e-05,
    'lc_solve_l_c1_z0_ohm': 3.1830988618379066,
    'lc_solve_l_c2_H': 1.3775928632813219e-06,
    'lc_solve_l_c2_z0_ohm': 117.37090198517356,
    'lc_solve_c_c0_F': 2.5330295910584445e-09,
    'lc_solve_c_c0_z0_ohm': 62.83185307179586,
    'lc_solve_c_c1_F': 1.223538022489286e-10,
    'lc_solve_c_c1_z0_ohm': 2858.849314766712,
    'lc_solve_c_c2_F': 5.389424661826479e-11,
    'lc_solve_c_c2_z0_ohm': 29.53097094374405,
    'xl_c0_ohm': 6.283185307179586,
    'xl_c1_ohm': 6.283185307179586,
    'xl_c2_ohm': 314.1592653589793,
    'xl_c3_ohm': 15.079644737231007,
    'xc_c0_ohm': 159.15494309189535,
    'xc_c1_ohm': 15.915494309189537,
    'xc_c2_ohm': 31.830988618379067,
    'xc_c3_ohm': 1.5915494309189535,
    'xl_solve_f_c0_Hz': 999.9999999999999,
    'xl_solve_f_c1_Hz': 1591549.4309189531,
    'xl_solve_l_c0_H': 0.01,
    'xl_solve_l_c1_H': 1.5915494309189535e-07,
    'xc_solve_f_c0_Hz': 999.9999999999998,
    'xc_solve_f_c1_Hz': 1591549430.9189532,
    'xc_solve_c_c0_F': 9.999999999999997e-07,
    'xc_solve_c_c1_F': 1.5915494309189534e-08,
}
GOLDEN.extend((n, got, _CIRCUIT2_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _circuit2_vectors())



# ---------------------------------------------------------------------------------------------------------------
# Task 9: tolerance envelope (corner analysis) and normalised sensitivities. Independent of src/.
# Corner analysis: every output below is monotone in every tolerated input, so min/max sit at corners of the tolerance box
# (brute-force product over (1 - minus, 1 + plus), or nominal -/+ amount for an absolute temperature tolerance). typ is the
# nominal evaluation. Sensitivities S = d ln(out)/d ln(in) are the ANALYTIC closed-form exponents (not differences): the
# legacy exponents 0.44 and 0.725 (S-001), the L/(w t) product form, and A = pi t (d + t) for the via barrel.
# Every geometry, tolerance and current is a TEST value, not fab data or a recommendation.
# ---------------------------------------------------------------------------------------------------------------
import itertools

def _env_corners(fn, nominal, tols):
    """fn(dict) -> dict of outputs; tols: name -> (minus, plus, 'rel' | 'abs'). Returns {output: (min, typ, max)}."""
    typ = fn(nominal)
    names = list(tols)
    lo, hi = dict(typ), dict(typ)
    for signs in itertools.product((-1, 1), repeat=len(names)):
        pt = dict(nominal)
        for n, sg in zip(names, signs):
            minus, plus, kind = tols[n]
            amt = plus if sg > 0 else -minus
            pt[n] = nominal[n] * (1.0 + amt) if kind == "rel" else nominal[n] + amt
        o = fn(pt)
        for k, v in o.items():
            lo[k] = min(lo[k], v)
            hi[k] = max(hi[k], v)
    return {k: (lo[k], typ[k], hi[k]) for k in typ}

def _env_vectors(tag, fn, nominal, tols, units, ids, note):
    out = []
    for k, (a, b, c) in _env_corners(fn, nominal, tols).items():
        for label, v in (("min", a), ("typ", b), ("max", c)):
            out.append(("env_%s_%s_%s_%s" % (tag, k, units[k], label), v, 1e-9, ids, note))
    return out

def _sens_vectors(tag, table, ids, note):
    return [("sens_%s_%s_to_%s" % (tag, o, i), v, 1e-9, ids, note) for (o, i), v in table.items()]

_TW_IDS = ("S-001", "S-003", "S-006")

# Trace width (legacy IPC-2221, S-001).
def _tw_width(n, layer):    # solve width: I [A], dT [K], t [um]
    return {"width_mil": ipc2221_width_mil(n["I"], n["dT"], layer, n["t"])}

def _tw_current(n, layer):  # solve current: w [mil], dT [K], t [um]
    return {"current_A": ipc2221_current_A(n["w"], n["dT"], layer, n["t"])}

def _tw_rise(n, layer):     # solve dT: I [A], w [mil], t [um], ambient [degC]
    dT = ipc2221_dT_C(n["I"], n["w"], layer, n["t"])
    return {"rise_K": dT, "tmax_degC": n["amb"] + dT}

# A: outer, solve width, 1 oz at 35 um; tolerances on I, dT and thickness; a 20 % width tolerance as a drawn-width allowance.
_TW9_A = dict(I=3.0, dT=20.0, t=35.0)
_TW9_A_TOL = {"I": (0.05, 0.05, "rel"), "dT": (0.1, 0.1, "rel"), "t": (0.1, 0.05, "rel")}
_TW9 = _env_vectors("tw_A_outer_width_I3_dT20_1oz", lambda n: _tw_width(n, "outer"), _TW9_A, _TW9_A_TOL,
                    {"width_mil": "mil"}, _TW_IDS, "solve width; I +-5 %, dT +-10 %, thickness -10/+5 % (TEST tolerances)")
_wA = _env_corners(lambda n: _tw_width(n, "outer"), _TW9_A, _TW9_A_TOL)["width_mil"]
_TW9 += [("env_tw_A_drawn_width_mil_%s" % lab, v / (1.0 - 0.2), 1e-9, _TW_IDS, "required width / (1 - 0.2): drawn width covering a +-20 % finished-width tolerance (TEST value)")
         for lab, v in zip(("min", "typ", "max"), _wA)]
_TW9 += _sens_vectors("tw_A_width", {("width", "current"): 1.0 / C_AREA, ("width", "deltaT"): -B_DT / C_AREA, ("width", "thickness"): -1.0},
                      ("S-001",), "closed-form exponents of A = (I/(k dT^0.44))^(1/0.725), width = A/t")
# B: inner, solve current: width 0.5 mm, dT 30, 2 oz (70 um); tolerances on width, dT and thickness.
_TW9_B = dict(w=0.5 / 0.0254, dT=30.0, t=70.0)
_TW9_B_TOL = {"w": (0.2, 0.2, "rel"), "dT": (0.05, 0.05, "rel"), "t": (0.1, 0.0, "rel")}
_TW9 += _env_vectors("tw_B_inner_current_w0.5mm_dT30_2oz", lambda n: _tw_current(n, "inner"), _TW9_B, _TW9_B_TOL,
                     {"current_A": "A"}, _TW_IDS, "solve current capacity; width +-20 %, dT +-5 %, thickness -10/+0 % (TEST tolerances)")
_TW9 += _sens_vectors("tw_B_current", {("current", "width"): C_AREA, ("current", "deltaT"): B_DT, ("current", "thickness"): C_AREA},
                      ("S-001",), "closed-form exponents of I = k dT^0.44 (w t)^0.725")
# C: outer, solve dT: I 2 A, width 1 mm, 1 oz; ambient 25 degC +-5 K for the maximum conductor temperature.
_TW9_C = dict(I=2.0, w=1.0 / 0.0254, t=35.0, amb=25.0)
_TW9_C_TOL = {"I": (0.1, 0.1, "rel"), "w": (0.2, 0.2, "rel"), "t": (0.1, 0.1, "rel"), "amb": (5.0, 5.0, "abs")}
_TW9 += _env_vectors("tw_C_outer_rise_I2_w1mm_1oz", lambda n: _tw_rise(n, "outer"), _TW9_C, _TW9_C_TOL,
                     {"rise_K": "K", "tmax_degC": "degC"}, _TW_IDS, "solve rise; I +-10 %, width +-20 %, thickness +-10 %, ambient 25 degC +-5 K (TEST tolerances)")
_TW9 += _sens_vectors("tw_C_rise", {("rise", "current"): 1.0 / B_DT, ("rise", "width"): -C_AREA / B_DT, ("rise", "thickness"): -C_AREA / B_DT},
                      ("S-001",), "closed-form exponents of dT = (I/(k A^0.725))^(1/0.44)")
# D and E: thickness tolerance from the foil-convention spread and from the S-009 finished-copper minimum (one-sided).
_conv = [copper_thickness_um(1.0, c) for c in FOIL_CONVENTIONS]
_TW9_D_TOL = {"t": ((FOIL_UM_PER_OZ - min(_conv)) / FOIL_UM_PER_OZ, max(0.0, (max(_conv) - FOIL_UM_PER_OZ) / FOIL_UM_PER_OZ), "rel")}
_TW9 += _env_vectors("tw_D_outer_width_I3_dT20_1oz_foilspread", lambda n: _tw_width(n, "outer"), _TW9_A, _TW9_D_TOL,
                     {"width_mil": "mil"}, _TW_IDS, "thickness tolerance = spread of the three S-003 conventions around 35 um (explicit user choice)")
_TW9 += [("env_tw_D_thickness_minus_fraction", _TW9_D_TOL["t"][0], 1e-9, ("S-003", "S-003d", "S-006"), "(35 - min convention)/35 at 1 oz"),
         ("env_tw_D_thickness_plus_fraction", _TW9_D_TOL["t"][1], 1e-9, ("S-003", "S-003d", "S-006"), "(max convention - 35)/35 at 1 oz; 35 um is the largest, so 0")]
_S009_INNER_1OZ_UM = 24.9   # ledger S-009 (secondhand IPC-6012 inner-layer MINIMUM, restated here; a minimum, not a typical value)
_TW9_E_TOL = {"t": (1.0 - _S009_INNER_1OZ_UM / FOIL_UM_PER_OZ, 0.0, "rel")}
_TW9 += _env_vectors("tw_E_inner_width_I3_dT20_1oz_s009", lambda n: _tw_width(n, "inner"), _TW9_A, _TW9_E_TOL,
                     {"width_mil": "mil"}, ("S-001", "S-003", "S-006", "S-009"), "thickness tolerance = thin side down to the S-009 inner 1 oz minimum 24.9 um (explicit user choice)")
_TW9 += [("env_tw_E_thickness_minus_fraction", _TW9_E_TOL["t"][0], 1e-9, ("S-009",), "1 - 24.9/35")]

# Trace resistance (S-004). nominal: L [mm], w [mm], t [um], T [degC] (the conductor temperature), I [A], rho20 [ohm.m]
def _tr9(n):
    R = trace_resistance_ohm(n["L"], n["w"], n["t"], n["T"], n.get("rho", RHO_CU_20C))
    o = {"R_ohm": R}
    if "I" in n:
        o["vdrop_V"] = n["I"] * R
        o["power_W"] = n["I"] ** 2 * R
    return o

_TR9_A = dict(L=100.0, w=0.254, t=35.0, T=85.0, I=3.0)
_TR9_A_TOL = {"L": (0.01, 0.01, "rel"), "w": (0.2, 0.2, "rel"), "t": (0.1, 0.1, "rel"), "T": (5.0, 5.0, "abs"), "I": (0.02, 0.02, "rel")}
_TR9 = _env_vectors("tr_A_L100mm_w0.254mm_t35um_T85C_I3A", _tr9, _TR9_A, _TR9_A_TOL,
                    {"R_ohm": "ohm", "vdrop_V": "V", "power_W": "W"}, ("S-004", "S-006"), "L +-1 %, w +-20 %, t +-10 %, T +-5 K, I +-2 % (TEST tolerances)")
_a85 = ALPHA_CU / (1.0 + ALPHA_CU * (85.0 - 20.0))
_TR9 += _sens_vectors("tr_A", {("R", "length"): 1.0, ("R", "width"): -1.0, ("R", "thickness"): -1.0, ("R", "temperatureK"): _a85,
                               ("vdrop", "current"): 1.0, ("vdrop", "length"): 1.0, ("power", "current"): 2.0, ("power", "width"): -1.0},
                      ("S-004",), "R = rho(T) L/(w t): unit exponents; temperature semi-log alpha/(1 + alpha (T - 20)) per K")
_TR9_B = dict(L=1000.0, w=1.0, t=70.0, T=25.0, rho=1.9e-8)
_TR9_B_TOL = {"L": (0.005, 0.005, "rel"), "w": (0.1, 0.1, "rel"), "t": (0.1, 0.0, "rel"), "T": (10.0, 10.0, "abs"), "rho": (0.05, 0.1, "rel")}
_TR9 += _env_vectors("tr_B_L1000mm_w1mm_t70um_T25C_rho1.9uohmcm", _tr9, _TR9_B, _TR9_B_TOL,
                     {"R_ohm": "ohm"}, ("S-004", "S-006"), "L +-0.5 %, w +-10 %, t -10/+0 %, T +-10 K, rho -5/+10 % (TEST tolerances; rho override S-012 unverified)")
_TR9 += _sens_vectors("tr_B", {("R", "resistivity"): 1.0, ("R", "temperatureK"): ALPHA_CU / (1.0 + ALPHA_CU * 5.0)},
                      ("S-004",), "R proportional to rho20; semi-log alpha/(1 + alpha (T - 20)) per K at 25 degC")

# Via (S-004 R(T), S-007 theta): d, L [mm], t [um], N, T [degC], I [A], rho20 override [ohm.m], k [W/m.K]
def _via9(n, N, k):
    d, t, L = n["d"] * 1e-3, n["t"] * 1e-6, n["L"] * 1e-3
    A = via_area_m2(d, t) * N
    rho = n.get("rho", RHO_CU_20C)
    R = rho * (1.0 + ALPHA_CU * (n["T"] - 20.0)) * L / A
    o = {"R_mohm": R * 1e3, "theta_KperW": L / (k * A)}
    if "I" in n:
        o["vdrop_mV"] = n["I"] * R * 1e3
        o["power_mW"] = n["I"] ** 2 * R * 1e3
    return o

_V9_A = dict(d=0.3, t=25.0, L=1.6, T=85.0, I=2.0)
_V9_A_TOL = {"d": (0.1, 0.1, "rel"), "t": (0.2, 0.1, "rel"), "L": (0.05, 0.05, "rel"), "T": (10.0, 10.0, "abs"), "I": (0.05, 0.05, "rel")}
_V9 = _env_vectors("via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A", lambda n: _via9(n, 4, 401.0), _V9_A, _V9_A_TOL,
                   {"R_mohm": "mohm", "theta_KperW": "KperW", "vdrop_mV": "mV", "power_mW": "mW"}, ("S-004", "S-007"),
                   "d +-10 %, t -20/+10 %, L +-5 %, T +-10 K, I +-5 % (TEST tolerances; k = 401)")
_dd, _tt = 0.3e-3, 25e-6
_sd = -_dd / (_dd + _tt)
_st = -(_dd + 2 * _tt) / (_dd + _tt)
_a85v = ALPHA_CU / (1.0 + ALPHA_CU * 65.0)
_V9 += _sens_vectors("via_A", {("R", "finishedHole"): _sd, ("R", "plating"): _st, ("R", "barrelLength"): 1.0, ("R", "temperatureK"): _a85v,
                               ("theta", "finishedHole"): _sd, ("theta", "plating"): _st, ("theta", "barrelLength"): 1.0, ("theta", "temperatureK"): 0.0,
                               ("vdrop", "current"): 1.0, ("power", "current"): 2.0},
                     ("S-004",), "A = pi t (d + t): d ln A / d ln d = d/(d + t), d ln A / d ln t = (d + 2t)/(d + t)")
_V9_B = dict(d=0.2, t=18.0, L=0.8, T=105.0, rho=2.0e-8)
_V9_B_TOL = {"d": (0.05, 0.05, "rel"), "t": (0.15, 0.0, "rel"), "L": (0.1, 0.1, "rel"), "rho": (0.1, 0.1, "rel"), "T": (5.0, 5.0, "abs")}
_V9 += _env_vectors("via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm", lambda n: _via9(n, 1, 401.0), _V9_B, _V9_B_TOL,
                    {"R_mohm": "mohm", "theta_KperW": "KperW"}, ("S-004", "S-007"),
                    "d +-5 %, t -15/+0 %, L +-10 %, rho +-10 %, T +-5 K (TEST tolerances; rho override S-012 unverified)")
_V9 += _sens_vectors("via_B", {("R", "resistivity"): 1.0, ("theta", "resistivity"): 0.0}, ("S-004",), "R proportional to rho20; theta independent of rho")

_ENV9 = _TW9 + _TR9 + _V9

# Pinned literals recorded from this oracle (regression pins, same policy as _VIA_PINNED).
_ENV9_PINNED = {
    'env_tw_A_outer_width_I3_dT20_1oz_width_mil_mil_min': 29.594738138017807,
    'env_tw_A_outer_width_I3_dT20_1oz_width_mil_mil_typ': 35.33873019422759,
    'env_tw_A_outer_width_I3_dT20_1oz_width_mil_mil_max': 44.77185756090238,
    'env_tw_A_drawn_width_mil_min': 36.99342267252226,
    'env_tw_A_drawn_width_mil_typ': 44.17341274278448,
    'env_tw_A_drawn_width_mil_max': 55.96482195112797,
    'sens_tw_A_width_width_to_current': 1.3793103448275863,
    'sens_tw_A_width_width_to_deltaT': -0.6068965517241379,
    'sens_tw_A_width_width_to_thickness': -1.0,
    'env_tw_B_inner_current_w0.5mm_dT30_2oz_current_A_A_min': 1.4939961664123407,
    'env_tw_B_inner_current_w0.5mm_dT30_2oz_current_A_A_typ': 1.939032270159414,
    'env_tw_B_inner_current_w0.5mm_dT30_2oz_current_A_A_max': 2.2610737695341787,
    'sens_tw_B_current_current_to_width': 0.725,
    'sens_tw_B_current_current_to_deltaT': 0.44,
    'sens_tw_B_current_current_to_thickness': 0.725,
    'env_tw_C_outer_rise_I2_w1mm_1oz_rise_K_K_min': 3.3178110306385764,
    'env_tw_C_outer_rise_I2_w1mm_1oz_rise_K_K_typ': 6.660685045364097,
    'env_tw_C_outer_rise_I2_w1mm_1oz_rise_K_K_max': 14.212494815447364,
    'env_tw_C_outer_rise_I2_w1mm_1oz_tmax_degC_degC_min': 23.317811030638577,
    'env_tw_C_outer_rise_I2_w1mm_1oz_tmax_degC_degC_typ': 31.660685045364097,
    'env_tw_C_outer_rise_I2_w1mm_1oz_tmax_degC_degC_max': 44.212494815447364,
    'sens_tw_C_rise_rise_to_current': 2.272727272727273,
    'sens_tw_C_rise_rise_to_width': -1.6477272727272727,
    'sens_tw_C_rise_rise_to_thickness': -1.6477272727272727,
    'env_tw_D_outer_width_I3_dT20_1oz_foilspread_width_mil_mil_min': 35.33873019422759,
    'env_tw_D_outer_width_I3_dT20_1oz_foilspread_width_mil_mil_typ': 35.33873019422759,
    'env_tw_D_outer_width_I3_dT20_1oz_foilspread_width_mil_mil_max': 36.070444934323874,
    'env_tw_D_thickness_minus_fraction': 0.02028571428571431,
    'env_tw_D_thickness_plus_fraction': 0.0,
    'env_tw_E_inner_width_I3_dT20_1oz_s009_width_mil_mil_min': 91.93158064743616,
    'env_tw_E_inner_width_I3_dT20_1oz_s009_width_mil_mil_typ': 91.93158064743616,
    'env_tw_E_inner_width_I3_dT20_1oz_s009_width_mil_mil_max': 129.221097295593,
    'env_tw_E_thickness_minus_fraction': 0.2885714285714286,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_R_ohm_ohm_min': 0.17975447034637912,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_R_ohm_ohm_typ': 0.24348357317404298,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_R_ohm_ohm_max': 0.34689925612746686,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_vdrop_V_V_min': 0.5284781428183546,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_vdrop_V_V_typ': 0.7304507195221289,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_vdrop_V_V_max': 1.0615117237500487,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_power_W_W_min': 1.5537257398859625,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_power_W_W_typ': 2.191352158566387,
    'env_tr_A_L100mm_w0.254mm_t35um_T85C_I3A_power_W_W_max': 3.2482258746751485,
    'sens_tr_A_R_to_length': 1.0,
    'sens_tr_A_R_to_width': -1.0,
    'sens_tr_A_R_to_thickness': -1.0,
    'sens_tr_A_R_to_temperatureK': 0.003130351666733044,
    'sens_tr_A_vdrop_to_current': 1.0,
    'sens_tr_A_vdrop_to_length': 1.0,
    'sens_tr_A_power_to_current': 2.0,
    'sens_tr_A_power_to_width': -1.0,
    'env_tr_B_L1000mm_w1mm_t70um_T25C_rho1.9uohmcm_R_ohm_ohm_min': 0.2286602715909091,
    'env_tr_B_L1000mm_w1mm_t70um_T25C_rho1.9uohmcm_R_ohm_ohm_typ': 0.2767621428571429,
    'env_tr_B_L1000mm_w1mm_t70um_T25C_rho1.9uohmcm_R_ohm_ohm_max': 0.39228774735449734,
    'sens_tr_B_R_to_resistivity': 1.0,
    'sens_tr_B_R_to_temperatureK': 0.0038542637179424318,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_R_mohm_mohm_min': 0.2579788690555161,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_R_mohm_mohm_typ': 0.33920182205575816,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_R_mohm_mohm_max': 0.5145520944034321,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_theta_KperW_KperW_min': 30.681784223444048,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_theta_KperW_KperW_typ': 39.07890411617611,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_theta_KperW_KperW_max': 57.48136219674612,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_vdrop_mV_mV_min': 0.49015985120548056,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_vdrop_mV_mV_typ': 0.6784036441115163,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_vdrop_mV_mV_max': 1.0805593982472075,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_power_mW_mW_min': 0.9313037172904132,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_power_mW_mW_typ': 1.3568072882230326,
    'env_via_A_d0.3mm_t25um_L1.6mm_N4_T85C_I2A_power_mW_mW_max': 2.2691747363191355,
    'sens_via_A_R_to_finishedHole': -0.923076923076923,
    'sens_via_A_R_to_plating': -1.0769230769230769,
    'sens_via_A_R_to_barrelLength': 1.0,
    'sens_via_A_R_to_temperatureK': 0.003130351666733044,
    'sens_via_A_theta_to_finishedHole': -0.923076923076923,
    'sens_via_A_theta_to_plating': -1.0769230769230769,
    'sens_via_A_theta_to_barrelLength': 1.0,
    'sens_via_A_theta_to_temperatureK': 0.0,
    'sens_via_A_vdrop_to_current': 1.0,
    'sens_via_A_power_to_current': 2.0,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_R_mohm_mohm_min': 1.3212205717893932,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_R_mohm_mohm_typ': 1.7314630118796572,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_R_mohm_mohm_max': 2.6558132237747634,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_theta_KperW_KperW_min': 139.26144558944333,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_theta_KperW_KperW_typ': 161.8328725504235,
    'env_via_B_d0.2mm_t18um_L0.8mm_N1_T105C_rho2uohmcm_theta_KperW_KperW_max': 222.38630891717463,
    'sens_via_B_R_to_resistivity': 1.0,
    'sens_via_B_theta_to_resistivity': 0.0,
}
GOLDEN.extend((n, got, _ENV9_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _ENV9)


# ---------------------------------------------------------------------------------------------------------------
# Trace width, RMS-equivalent pulse input (Phase 1 task 2 advanced input, PV-3). Independent of src/.
# Rectangular pulse, period much shorter than the thermal time constant (the user's declaration): I_rms = I_pk sqrt(D)
# (S-019e, VERIFIED); the legacy IPC-2221 relation (S-001, PAYWALLED) is then evaluated at I_rms. S-019f (validity of the
# mean-rise reading) is UNVERIFIED. The result is the MEAN (duty-averaged) rise, not the peak.
# ---------------------------------------------------------------------------------------------------------------
def tw_rms_A(i_pk, duty):
    return i_pk * math.sqrt(duty)

# (layer, I_pk A, duty, dT degC, oz)
TW_RMS_WIDTH_CASES = [("outer", 10, 0.25, 20, 1), ("inner", 5, 0.64, 15, 2), ("outer", 8, 0.36, 30, 0.5)]
# (layer, I_pk A, duty, width mil, oz)
TW_RMS_DT_CASES = [("outer", 8, 0.25, 40, 1), ("inner", 10, 0.36, 60, 1), ("outer", 6, 1, 30, 2)]

def _tw_rms_tag(layer, ipk, d, x, oz, xname):
    return "%s_Ipk%sA_D%s_%s%s_%soz" % (layer, _g(ipk), _g(d), xname, _g(x), _g(oz))

_TW_RMS_PINNED = {
    'trace_width_rms_current_A_Ipk10A_D0.25': 5.0,
    'trace_width_rms_width_mil_outer_Ipk10A_D0.25_dT20C_1oz': 71.49064502936493,
    'trace_width_rms_current_A_Ipk5A_D0.64': 4.0,
    'trace_width_rms_width_mil_inner_Ipk5A_D0.64_dT15C_2oz': 81.39334781696346,
    'trace_width_rms_current_A_Ipk8A_D0.36': 4.8,
    'trace_width_rms_width_mil_outer_Ipk8A_D0.36_dT30C_0.5oz': 105.67118110165315,
    'trace_width_rms_dT_C_outer_Ipk8A_D0.25_w40mil_1oz': 31.35588252680571,
    'trace_width_rms_dT_C_inner_Ipk10A_D0.36_w60mil_1oz': 195.22487196692123,
    'trace_width_rms_dT_C_outer_Ipk6A_D1_w30mil_2oz': 40.39950702142782,
}
_TW_RMS_IDS = ("S-001", "S-019e", "S-019f", "S-006", "S-003")

def _tw_rms_vectors():
    out = []
    for layer, ipk, d, dt, oz in TW_RMS_WIDTH_CASES:
        i = tw_rms_A(ipk, d)
        out.append(("trace_width_rms_current_A_Ipk%sA_D%s" % (_g(ipk), _g(d)), i, 1e-12, _TW_RMS_IDS,
                    "I_rms = I_pk sqrt(D) (S-019e)"))
        out.append(("trace_width_rms_width_mil_" + _tw_rms_tag(layer, ipk, d, dt, oz, "dT").replace("dT%s_" % _g(dt), "dT%sC_" % _g(dt)),
                    ipc2221_width_mil(i, dt, layer, FOIL_UM_PER_OZ * oz), 1e-9, _TW_RMS_IDS,
                    "legacy IPC-2221 minimum width at I_rms (mean heating); LEGACY, not an IPC-2152 result"))
    for layer, ipk, d, w, oz in TW_RMS_DT_CASES:
        i = tw_rms_A(ipk, d)
        out.append(("trace_width_rms_dT_C_" + _tw_rms_tag(layer, ipk, d, w, oz, "w").replace("w%s_" % _g(w), "w%smil_" % _g(w)),
                    ipc2221_dT_C(i, w, layer, FOIL_UM_PER_OZ * oz), 1e-9, _TW_RMS_IDS,
                    "legacy IPC-2221 MEAN temperature rise at I_rms (the peak is higher)"))
    return out

GOLDEN.extend((n, got, _TW_RMS_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _tw_rms_vectors())


# ---------------------------------------------------------------------------------------------------------------
# Phase 3 core: working-voltage waveform conversions (S-035 VERIFIED textbook relations, S-019e for the pulse). TABLE-FREE
# arithmetic only: no IEC 60664-1 or IPC-2221 table value exists anywhere in this oracle (the spacing tables are human-owned).
# The oracle does NOT use the crest-factor shortcuts (sqrt 2, sqrt 3) that src uses: it integrates the RMS DEFINITION
# V_rms = sqrt((1/T) integral v(t)^2 dt) numerically over one period (midpoint rule), then converts by ratio.
# ---------------------------------------------------------------------------------------------------------------
_WF_N = 200000

def _wf_unit(shape, k):
    """Unit-peak waveform at sample k of _WF_N over one period (midpoint)."""
    x = (k + 0.5) / _WF_N
    if shape == "sine":
        return math.sin(2.0 * math.pi * x)
    if shape == "square":
        return 1.0 if x < 0.5 else -1.0
    if shape == "triangle":
        return 4.0 * x - 1.0 if x < 0.5 else 3.0 - 4.0 * x
    if shape == "dc":
        return 1.0
    raise ValueError(shape)

def wf_rms_per_peak(shape):
    """RMS of a unit-peak waveform, from the definition (numerical integral over one period)."""
    return math.sqrt(sum(_wf_unit(shape, k) ** 2 for k in range(_WF_N)) / _WF_N)

def wf_peak_to_rms(shape, peak):
    return peak * wf_rms_per_peak(shape)

def wf_rms_to_peak(shape, rms):
    return rms / wf_rms_per_peak(shape)

def wf_dc_plus_sine_rms(vdc, vac_rms):
    vpk = vac_rms / wf_rms_per_peak("sine")
    return math.sqrt(sum((vdc + vpk * _wf_unit("sine", k)) ** 2 for k in range(_WF_N)) / _WF_N)

def wf_pulse_rms(peak, duty):
    on = int(round(duty * _WF_N))
    return math.sqrt(sum(peak * peak for _ in range(on)) / _WF_N)

_WF_PINNED = {
    'waveform_sine_peak_to_rms_V_pk100': 70.71067811865474,
    'waveform_sine_rms_to_peak_V_rms100': 141.4213562373095,
    'waveform_sine_rms_to_peak_V_rms230': 325.2691193458119,
    'waveform_square_peak_to_rms_V_pk100': 100.0,
    'waveform_square_rms_to_peak_V_rms100': 100.0,
    'waveform_triangle_peak_to_rms_V_pk100': 57.73502691896258,
    'waveform_triangle_rms_to_peak_V_rms100': 173.20508075688772,
    'waveform_dc_value_to_rms_V_dc100': 100.0,
    'waveform_dc_plus_sine_rms_V_dc120_ac30rms': 123.69316876852982,
    'waveform_dc_plus_sine_peak_V_dc120_ac30rms': 162.42640687119285,
    'waveform_pulse_rms_V_pk10_D0.36': 6.0,
}
_WF_IDS = ("S-035",)
_WF_IDS_PULSE = ("S-035", "S-019e")

def _wf_vectors():
    out = []
    n = "waveform_sine_peak_to_rms_V_pk100"
    out.append((n, wf_peak_to_rms("sine", 100.0), 1e-9, _WF_IDS, "sine: V_rms from the integral definition"))
    out.append(("waveform_sine_rms_to_peak_V_rms100", wf_rms_to_peak("sine", 100.0), 1e-9, _WF_IDS, "sine peak from RMS"))
    out.append(("waveform_sine_rms_to_peak_V_rms230", wf_rms_to_peak("sine", 230.0), 1e-9, _WF_IDS, "sine peak from RMS"))
    out.append(("waveform_square_peak_to_rms_V_pk100", wf_peak_to_rms("square", 100.0), 1e-9, _WF_IDS, "symmetric square: RMS = peak"))
    out.append(("waveform_square_rms_to_peak_V_rms100", wf_rms_to_peak("square", 100.0), 1e-9, _WF_IDS, "symmetric square"))
    out.append(("waveform_triangle_peak_to_rms_V_pk100", wf_peak_to_rms("triangle", 100.0), 1e-9, _WF_IDS, "symmetric triangle/sawtooth"))
    out.append(("waveform_triangle_rms_to_peak_V_rms100", wf_rms_to_peak("triangle", 100.0), 1e-9, _WF_IDS, "symmetric triangle/sawtooth"))
    out.append(("waveform_dc_value_to_rms_V_dc100", wf_peak_to_rms("dc", 100.0), 1e-9, _WF_IDS, "DC: RMS = peak = value"))
    out.append(("waveform_dc_plus_sine_rms_V_dc120_ac30rms", wf_dc_plus_sine_rms(120.0, 30.0), 1e-9, _WF_IDS,
                "DC plus zero-mean sine: integral of (Vdc + Vpk sin)^2"))
    out.append(("waveform_dc_plus_sine_peak_V_dc120_ac30rms", 120.0 + wf_rms_to_peak("sine", 30.0), 1e-9, _WF_IDS,
                "DC plus zero-mean sine: peak = Vdc + Vac,pk"))
    out.append(("waveform_pulse_rms_V_pk10_D0.36", wf_pulse_rms(10.0, 0.36), 1e-9, _WF_IDS_PULSE,
                "rectangular 0-to-peak pulse: integral of v^2 over one period (S-019e)"))
    return out

GOLDEN.extend((n, got, _WF_PINNED[n], tol, ids, note) for n, got, tol, ids, note in _wf_vectors())


# ---------------------------------------------------------------------------------------------------------------
# Phase 2 part A: impedance models (microstrip S-020/S-020a, stripline S-021/S-021a wide, coax S-024, elliptic S-023b,
# delay S-029/S-029a/S-029b). The oracle lives in ref_impedance.py (written from the recorded equations, independent of src/).
# ---------------------------------------------------------------------------------------------------------------
import ref_impedance
ref_impedance.self_checks()
GOLDEN.extend(ref_impedance.pinned_vectors())


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
