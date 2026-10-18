#!/usr/bin/env python3
"""
INDEPENDENT ORACLE for Phase 2 part A (impedance models). Written from the equations recorded in
docs/sources/notes/impedance-models.md (S-020, S-020a, S-021, S-021a wide-strip form, S-023b, S-024) and
docs/sources/notes/impedance-presets-and-data.md (S-029, S-029a, S-029b). It never imports or reads src/.
Imported by ref_calcs.py, which appends these vectors to GOLDEN (and so to docs/golden-vectors.json).

These vectors test an implementation against the recorded formulas. They verify NO ledger row: the originals
(Hammerstad-Jensen 1980, Cohn 1954) were not read. A Steer worked example (R1) is the only published number.

Decisions applied (docs/validation/OPEN_RISKS.md, Phase 2 research decisions):
  Q-1  prefactor eta0/(2 pi) with eta0 = mu0 c from exact SI constants (mu0 = 4 pi 1e-7 per S-013, c per S-029);
       the stripline 30 pi is taken as eta0/4 (same decision); coax 60 is eta0/(2 pi).
  Q-2  zero-thickness H-J is the base; thickness variants A and B (S-020a, CONFLICT) are separate vectors.
"""
import math

C0 = 299792458.0              # m/s, exact (S-029)
MU0 = 4e-7 * math.pi          # H/m (S-013)
ETA0 = MU0 * C0               # ohm, 376.730313...
ZP = ETA0 / (2.0 * math.pi)   # 59.9584916... ohm (Q-1)


def _g(x):
    return format(x, "g")


# ---- S-020 microstrip, zero thickness: u = w/h ----
def ms_a(u):
    return (1.0 + (1.0 / 49.0) * math.log((u ** 4 + (u / 52.0) ** 2) / (u ** 4 + 0.432))
            + (1.0 / 18.7) * math.log(1.0 + (u / 18.1) ** 3))


def ms_b(er):
    return 0.564 * ((er - 0.9) / (er + 3.0)) ** 0.053


def ms_ee(u, er):
    return (er + 1.0) / 2.0 + (er - 1.0) / 2.0 * (1.0 + 10.0 / u) ** (-ms_a(u) * ms_b(er))


def ms_f1(u):
    return 6.0 + (2.0 * math.pi - 6.0) * math.exp(-((30.666 / u) ** 0.7528))


def ms_z01(u):
    return ZP * math.log(ms_f1(u) / u + math.sqrt(1.0 + (2.0 / u) ** 2))


def ms_z0(u, er):
    return ms_z01(u) / math.sqrt(ms_ee(u, er))


# ---- S-020a thickness (H-J form), t normalised to h (tn = t/h) ----
def ms_du1(u, tn):
    coth = 1.0 / math.tanh(math.sqrt(6.517 * u))
    return (tn / math.pi) * math.log(1.0 + 4.0 * math.e / (tn * coth ** 2))


def ms_dur(u, tn, er):
    return 0.5 * (1.0 + 1.0 / math.cosh(math.sqrt(er - 1.0))) * ms_du1(u, tn)


def ms_thick_B(u, tn, er):
    """Procedure B (Janssen App. D.3): everything at ur. Returns (z0, eps_eff)."""
    ur = u + ms_dur(u, tn, er)
    ee = ms_ee(ur, er)
    return ms_z01(ur) / math.sqrt(ee), ee


def ms_thick_A(u, tn, er):
    """Procedure A (Qucs 11.24-11.25): z0 = z01(ur)/sqrt(ee(ur)); ee(t) = ee(ur) (z01(u1)/z01(ur))^2."""
    u1 = u + ms_du1(u, tn)
    ur = u + ms_dur(u, tn, er)
    eer = ms_ee(ur, er)
    return ms_z01(ur) / math.sqrt(eer), eer * (ms_z01(u1) / ms_z01(ur)) ** 2


# ---- S-021 symmetric stripline, zero thickness (x = w/b) ----
def sl_z0(x, er):
    we = x - (0.35 - x) ** 2 if x < 0.35 else x
    return (ETA0 / 4.0) / math.sqrt(er) / (we + 0.441)


# ---- S-021a wide-strip finite-thickness form (Steer eqs 1-4, w/b >= 0.35), tn = t/b ----
def sl_cohn_wide(x, tn, er):
    cf = (2.0 / math.pi) * math.log(1.0 / (1.0 - tn) + 1.0) - (tn / math.pi) * math.log(1.0 / (1.0 - tn) ** 2 - 1.0)
    return (ETA0 / 4.0) / math.sqrt(er) * (1.0 - tn) / (x + cf)


# ---- S-024 coax ----
def coax_z0(ratio, er):
    return ZP / math.sqrt(er) * math.log(ratio)


def coax_ratio(z0, er):
    return math.exp(z0 * math.sqrt(er) / ZP)


# ---- S-023b complete elliptic integral of the first kind, modulus k ----
def agm(a, g):
    for _ in range(60):
        if abs(a - g) <= 1e-16 * a:
            break
        a, g = (a + g) / 2.0, math.sqrt(a * g)
    return (a + g) / 2.0


# K and K' are evaluated with 60-digit decimal arithmetic (DLMF 19.8.5 and 19.2.9, written out here), then rounded to a float,
# so the oracle value is not limited by double cancellation near k = 0 or k = 1.
from decimal import Decimal, getcontext
getcontext().prec = 60
_PI = Decimal("3.14159265358979323846264338327950288419716939937510582097494")


def _dagm(a, g):
    for _ in range(80):
        if abs(a - g) <= Decimal(10) ** -55 * a:
            break
        a, g = (a + g) / 2, (a * g).sqrt()
    return (a + g) / 2


def ell_k(k):
    d = Decimal(k)
    return float(_PI / (2 * _dagm(Decimal(1), (1 - d * d).sqrt())))


def ell_kprime(k):
    d = Decimal(k)
    kp = (1 - d * d).sqrt()
    return float(_PI / (2 * _dagm(Decimal(1), (1 - kp * kp).sqrt())))


def ell_k_quad(k, n=200000):
    """Independent check: composite Simpson on the integral definition (DLMF 19.2.8 form)."""
    h = (math.pi / 2.0) / n
    s = 0.0
    for i in range(n + 1):
        th = i * h
        f = 1.0 / math.sqrt(1.0 - (k * math.sin(th)) ** 2)
        s += f * (1 if i in (0, n) else (4 if i % 2 else 2))
    return s * h / 3.0


# ---- S-029a delay, wavelength; S-029b skew ----
def delay_ps_per_mm(ee):
    return math.sqrt(ee) / C0 * 1e12 * 1e-3


def lam_g_mm(ee, f):
    return C0 / f / math.sqrt(ee) * 1e3


def skew_ps(dl_mm, ee):
    return dl_mm * 1e-3 * math.sqrt(ee) / C0 * 1e12


# ---- root finding (independent of the app's Brent): plain bisection on ln(u), many iterations ----
def bisect_ln(f, lo, hi, iters=300):
    a, b = math.log(lo), math.log(hi)
    fa = f(math.exp(a))
    for _ in range(iters):
        m = 0.5 * (a + b)
        fm = f(math.exp(m))
        if (fm > 0) == (fa > 0):
            a, fa = m, fm
        else:
            b = m
    return math.exp(0.5 * (a + b))


def ms_solve_u(z, er, variant=None, tn=None):
    if variant is None:
        return bisect_ln(lambda u: ms_z0(u, er) - z, 0.01, 100.0)
    fn = ms_thick_A if variant == "A" else ms_thick_B
    return bisect_ln(lambda u: fn(u, tn, er)[0] - z, 0.01, 100.0)


def sl_solve_x(z, er, lo=0.05, hi=1000.0):
    return bisect_ln(lambda x: sl_z0(x, er) - z, lo, hi)


def sl_cohn_solve_x(z, tn, er):
    return bisect_ln(lambda x: sl_cohn_wide(x, tn, er) - z, 0.35, 1000.0)


# ---- case tables (mirrored by name in src/core/calculators/*/calc.test.ts) ----
# microstrip: (w um, h um, er)
MS_CASES = [
    (600, 635, 4.1),        # R1: Steer Example 2 (published eps_e ~ 2.967, Z0 ~ 75.3 ohm with prefactor 60)
    (3150, 1575, 4.5), (300, 150, 4.2), (100, 200, 3.66), (1000, 200, 2.2), (6350, 635, 9.8),
    (10, 1000, 4.5), (100000, 1000, 4.5), (635, 635, 1.0), (500, 500, 128.0), (250, 1000, 4.4), (1500, 300, 3.48),
]
# thickness variants: (w um, h um, t um, er)
MS_THICK_CASES = [(3150, 1575, 35, 4.5), (150, 100, 18, 4.2), (400, 200, 35, 3.66), (2000, 200, 70, 4.5)]
# width solve: (Z0 ohm, h um, er)
MS_SOLVE_CASES = [(50, 200, 4.2), (75, 635, 4.1), (50, 1575, 4.5), (100, 300, 3.48), (30, 500, 4.5)]
# width solve with the thickness variant: (Z0 ohm, h um, t um, er)
MS_SOLVE_THICK_CASES = [(50, 200, 35, 4.2), (60, 300, 18, 4.5)]
# stripline: (w um, b um, er)
SL_CASES = [(500, 1000, 4.0), (200, 1000, 4.0), (100, 500, 4.2), (1500, 1000, 3.66), (50, 1000, 4.0),
            (300, 1000, 4.5), (350, 1000, 4.0), (5000, 1000, 4.0)]
# stripline wide-strip finite thickness: (w um, b um, t um, er)
SL_COHN_CASES = [(500, 1000, 20, 4.0), (900, 800, 18, 4.2), (400, 500, 17.5, 3.66), (350, 1000, 20, 4.0)]
# stripline width solve: (Z0 ohm, b um, er)
SL_SOLVE_CASES = [(50, 500, 4.2), (50, 1000, 4.0), (75, 600, 4.5), (30, 400, 3.66)]
SL_COHN_SOLVE_CASES = [(50, 800, 18, 4.2), (40, 600, 17.5, 4.0)]
# coax: (D mm, d mm, er)
COAX_CASES = [(2.718281828459045, 1.0, 1.0), (3.5, 1.0, 2.1), (4.6, 1.5, 2.25), (9.0, 2.7, 1.0), (7.25, 2.0, 2.2)]
COAX_SOLVE_CASES = [(50, 1.0, 2.1), (75, 0.5, 2.25)]
ELL_K_VALUES = [0.001, 0.1, 0.3, 0.5, 5.0 / 9.0, 0.7071067811865476, 0.9, 0.99, 0.999999]
# delay: (eps_eff, f Hz, delta length mm)
DELAY_CASES = [(2.967, 5e9, 10.0), (3.2, 1e9, 2.5), (4.4, 250e6, 100.0), (1.0, 10e9, 1.0)]

MS_IDS = ("S-020", "S-013", "S-029", "S-029a")
MS_THICK_IDS = ("S-020", "S-020a", "S-013", "S-029", "S-029a")
SL_IDS = ("S-021", "S-013", "S-029", "S-029a")
SL_COHN_IDS = ("S-021", "S-021a", "S-013", "S-029", "S-029a")
COAX_IDS = ("S-024", "S-013", "S-029", "S-029a")
ELL_IDS = ("S-023b",)
DELAY_IDS = ("S-029", "S-029a", "S-029b")

RTOL = 1e-9


def _ms_tag(w, h, er):
    return "w%sum_h%sum_er%s" % (_g(w), _g(h), _g(er))


def vectors():
    out = []
    note_ms = ("H-J zero-thickness quasi-static (S-020); prefactor eta0/(2 pi) with eta0 = mu0 c (Q-1); "
               "tests the implementation against the recorded formula, not the paper")
    for w, h, er in MS_CASES:
        u = w / h
        tag = _ms_tag(w, h, er)
        out.append(("microstrip_z0_ohm_" + tag, ms_z0(u, er), RTOL, MS_IDS, note_ms))
        out.append(("microstrip_eeff_" + tag, ms_ee(u, er), RTOL, MS_IDS, note_ms))
        out.append(("microstrip_z01_ohm_" + tag, ms_z01(u), RTOL, MS_IDS, note_ms + "; air-filled line impedance"))
    for w, h, t, er in MS_THICK_CASES:
        u, tn = w / h, t / h
        tag = _ms_tag(w, h, er) + "_t%sum" % _g(t)
        zb, eb = ms_thick_B(u, tn, er)
        za, ea = ms_thick_A(u, tn, er)
        nb = "H-J thickness variant, procedure B (Janssen D.3), S-020a CONFLICT; oracle arithmetic only"
        na = "H-J thickness variant, procedure A (Qucs 11.24-11.25), S-020a CONFLICT; oracle arithmetic only"
        out.append(("microstrip_thickB_z0_ohm_" + tag, zb, RTOL, MS_THICK_IDS, nb))
        out.append(("microstrip_thickB_eeff_" + tag, eb, RTOL, MS_THICK_IDS, nb))
        out.append(("microstrip_thickA_z0_ohm_" + tag, za, RTOL, MS_THICK_IDS, na))
        out.append(("microstrip_thickA_eeff_" + tag, ea, RTOL, MS_THICK_IDS, na))
        out.append(("microstrip_thick_dur_over_h_" + tag, ms_dur(u, tn, er), RTOL, MS_THICK_IDS, "delta u_r (H-J form), S-020a"))
    for z, h, er in MS_SOLVE_CASES:
        u = ms_solve_u(z, er)
        out.append(("microstrip_solve_w_um_Z%sohm_h%sum_er%s" % (_g(z), _g(h), _g(er)), u * h, 1e-9, MS_IDS,
                    "width for a target Z0 by bisection on the S-020 analysis function"))
    for z, h, t, er in MS_SOLVE_THICK_CASES:
        for v in ("A", "B"):
            u = ms_solve_u(z, er, v, t / h)
            out.append(("microstrip_solve_thick%s_w_um_Z%sohm_h%sum_t%sum_er%s" % (v, _g(z), _g(h), _g(t), _g(er)), u * h, 1e-9,
                        MS_THICK_IDS, "width for a target Z0, thickness variant %s (S-020a CONFLICT)" % v))
    for w, b, er in SL_CASES:
        out.append(("stripline_z0_ohm_w%sum_b%sum_er%s" % (_g(w), _g(b), _g(er)), sl_z0(w / b, er), RTOL, SL_IDS,
                    "zero-thickness symmetric stripline (S-021), 30 pi taken as eta0/4 (Q-1)"))
    for w, b, t, er in SL_COHN_CASES:
        out.append(("stripline_cohnwide_z0_ohm_w%sum_b%sum_t%sum_er%s" % (_g(w), _g(b), _g(t), _g(er)),
                    sl_cohn_wide(w / b, t / b, er), RTOL, SL_COHN_IDS,
                    "wide-strip finite-thickness form (Steer eqs 1-4; S-021a CONFLICT for narrow strips, wide only here)"))
    for z, b, er in SL_SOLVE_CASES:
        out.append(("stripline_solve_w_um_Z%sohm_b%sum_er%s" % (_g(z), _g(b), _g(er)), sl_solve_x(z, er) * b, 1e-9, SL_IDS,
                    "width for a target Z0 by bisection on the S-021 analysis function"))
    for z, b, t, er in [(c[0], c[1], c[2], c[3]) for c in SL_COHN_SOLVE_CASES]:
        out.append(("stripline_cohnwide_solve_w_um_Z%sohm_b%sum_t%sum_er%s" % (_g(z), _g(b), _g(t), _g(er)),
                    sl_cohn_solve_x(z, t / b, er) * b, 1e-9, SL_COHN_IDS, "width for a target Z0, wide-strip finite-thickness form"))
    for D, d, er in COAX_CASES:
        out.append(("coax_z0_ohm_D%smm_d%smm_er%s" % (_g(D), _g(d), _g(er)), coax_z0(D / d, er), RTOL, COAX_IDS,
                    "Z0 = eta0/(2 pi) ln(D/d)/sqrt(er) (S-024); D/d = e, er = 1 gives eta0/(2 pi)"))
    for z, d, er in COAX_SOLVE_CASES:
        out.append(("coax_solve_D_mm_Z%sohm_d%smm_er%s" % (_g(z), _g(d), _g(er)), coax_ratio(z, er) * d, RTOL, COAX_IDS,
                    "outer diameter for a target Z0 (closed-form inverse of S-024)"))
    for k in ELL_K_VALUES:
        out.append(("elliptic_K_k%s" % _g(k), ell_k(k), 1e-13, ELL_IDS, "K(k) by AGM, modulus k (S-023b, DLMF 19.8.5)"))
        out.append(("elliptic_Kprime_k%s" % _g(k), ell_kprime(k), 1e-13, ELL_IDS, "K'(k) = K(sqrt(1 - k^2)) (S-023b, DLMF 19.2.9)"))
    for ee, f, dl in DELAY_CASES:
        out.append(("delay_ps_per_mm_ee%s" % _g(ee), delay_ps_per_mm(ee), RTOL, DELAY_IDS[:2], "t_pd = sqrt(eps_eff)/c, c exact (S-029, S-029a)"))
        out.append(("guided_wavelength_mm_ee%s_f%sHz" % (_g(ee), _g(f)), lam_g_mm(ee, f), RTOL, DELAY_IDS[:2], "lambda_g = c/(f sqrt(eps_eff)) (S-029a)"))
        out.append(("skew_ps_dL%smm_ee%s" % (_g(dl), _g(ee)), skew_ps(dl, ee), RTOL, DELAY_IDS, "skew = dL sqrt(eps_eff)/c (S-029b, derived, UNVERIFIED)"))
    return out


# Full-precision literals recorded from this oracle (regression pins, like the other oracle blocks). They catch any change to
# the constants or formulas above; they are NOT independent verification of any standard.
PINNED = {
    'microstrip_z0_ohm_w600um_h635um_er4.1': 75.26613765215878,
    'microstrip_eeff_w600um_h635um_er4.1': 2.967079608815158,
    'microstrip_z01_ohm_w600um_h635um_er4.1': 129.64752483459557,
    'microstrip_z0_ohm_w3150um_h1575um_er4.5': 48.1950904490501,
    'microstrip_eeff_w3150um_h1575um_er4.5': 3.412374676493385,
    'microstrip_z01_ohm_w3150um_h1575um_er4.5': 89.02893021120876,
    'microstrip_z0_ohm_w300um_h150um_er4.2': 49.71402966781172,
    'microstrip_eeff_w300um_h150um_er4.2': 3.20703999002347,
    'microstrip_z01_ohm_w300um_h150um_er4.2': 89.02893021120876,
    'microstrip_z0_ohm_w100um_h200um_er3.66': 103.24802091943532,
    'microstrip_eeff_w100um_h200um_er3.66': 2.6067937974494937,
    'microstrip_z01_ohm_w100um_h200um_er3.66': 166.69979864321255,
    'microstrip_z0_ohm_w1000um_h200um_er2.2': 35.47002128891467,
    'microstrip_eeff_w1000um_h200um_er2.2': 1.9371646158271196,
    'microstrip_z01_ohm_w1000um_h200um_er2.2': 49.36790673593956,
    'microstrip_z0_ohm_w6350um_h635um_er9.8': 10.01968115857528,
    'microstrip_eeff_w6350um_h635um_er9.8': 8.388977432224959,
    'microstrip_z01_ohm_w6350um_h635um_er9.8': 29.020735493414215,
    'microstrip_z0_ohm_w10um_h1000um_er4.5': 235.73996101862164,
    'microstrip_eeff_w10um_h1000um_er4.5': 2.8905984241485423,
    'microstrip_z01_ohm_w10um_h1000um_er4.5': 400.79942349146137,
    'microstrip_z0_ohm_w100000um_h1000um_er4.5': 1.7238182643168702,
    'microstrip_eeff_w100000um_h1000um_er4.5': 4.388395730278428,
    'microstrip_z01_ohm_w100000um_h1000um_er4.5': 3.6111403650510066,
    'microstrip_z0_ohm_w635um_h635um_er1': 126.42386513518308,
    'microstrip_eeff_w635um_h635um_er1': 1.0,
    'microstrip_z01_ohm_w635um_h635um_er1': 126.42386513518308,
    'microstrip_z0_ohm_w500um_h500um_er128': 14.036620400708804,
    'microstrip_eeff_w500um_h500um_er128': 81.12094797341341,
    'microstrip_z01_ohm_w500um_h500um_er128': 126.42386513518308,
    'microstrip_z0_ohm_w250um_h1000um_er4.4': 120.53250103800275,
    'microstrip_eeff_w250um_h1000um_er4.4': 2.975575537297684,
    'microstrip_z01_ohm_w250um_h1000um_er4.4': 207.91683620707826,
    'microstrip_z0_ohm_w1500um_h300um_er3.48': 28.856554337034602,
    'microstrip_eeff_w1500um_h300um_er3.48': 2.9268501070468873,
    'microstrip_z01_ohm_w1500um_h300um_er3.48': 49.36790673593956,
    'microstrip_thickB_z0_ohm_w3150um_h1575um_er4.5_t35um': 47.7807413868924,
    'microstrip_thickB_eeff_w3150um_h1575um_er4.5_t35um': 3.4165954415370616,
    'microstrip_thickA_z0_ohm_w3150um_h1575um_er4.5_t35um': 47.7807413868924,
    'microstrip_thickA_eeff_w3150um_h1575um_er4.5_t35um': 3.3874994139059647,
    'microstrip_thick_dur_over_h_w3150um_h1575um_er4.5_t35um': 0.028488772034121503,
    'microstrip_thickB_z0_ohm_w150um_h100um_er4.2_t18um': 55.57511669063431,
    'microstrip_thickB_eeff_w150um_h100um_er4.2_t18um': 3.1571903212729038,
    'microstrip_thickA_z0_ohm_w150um_h100um_er4.2_t18um': 55.57511669063431,
    'microstrip_thickA_eeff_w150um_h100um_er4.2_t18um': 3.0023254162060815,
    'microstrip_thick_dur_over_h_w150um_h100um_er4.2_t18um': 0.15603248592439423,
    'microstrip_thickB_z0_ohm_w400um_h200um_er3.66_t35um': 50.43760016120148,
    'microstrip_thickB_eeff_w400um_h200um_er3.66_t35um': 2.854702232404576,
    'microstrip_thickA_z0_ohm_w400um_h200um_er3.66_t35um': 50.43760016120148,
    'microstrip_thickA_eeff_w400um_h200um_er3.66_t35um': 2.7479688527870674,
    'microstrip_thick_dur_over_h_w400um_h200um_er3.66_t35um': 0.15887359869968143,
    'microstrip_thickB_z0_ohm_w2000um_h200um_er4.5_t70um': 14.300174248228435,
    'microstrip_thickB_eeff_w2000um_h200um_er4.5_t70um': 3.9556146624609516,
    'microstrip_thickA_z0_ohm_w2000um_h200um_er4.5_t70um': 14.300174248228435,
    'microstrip_thickA_eeff_w2000um_h200um_er4.5_t70um': 3.8721246552066493,
    'microstrip_thick_dur_over_h_w2000um_h200um_er4.5_t70um': 0.2512879389160148,
    'microstrip_solve_w_um_Z50ohm_h200um_er4.2': 396.23870711311974,
    'microstrip_solve_w_um_Z75ohm_h635um_er4.1': 604.5185290207519,
    'microstrip_solve_w_um_Z50ohm_h1575um_er4.5': 2963.840755675808,
    'microstrip_solve_w_um_Z100ohm_h300um_er3.48': 172.32503723209703,
    'microstrip_solve_w_um_Z30ohm_h500um_er4.5': 2024.5008929683754,
    'microstrip_solve_thickA_w_um_Z50ohm_h200um_t35um_er4.2': 365.667722671276,
    'microstrip_solve_thickB_w_um_Z50ohm_h200um_t35um_er4.2': 365.667722671276,
    'microstrip_solve_thickA_w_um_Z60ohm_h300um_t18um_er4.5': 390.22336423533443,
    'microstrip_solve_thickB_w_um_Z60ohm_h300um_t18um_er4.5': 390.22336423533443,
    'stripline_z0_ohm_w500um_b1000um_er4': 50.043877983763366,
    'stripline_z0_ohm_w200um_b1000um_er4': 76.13789681927459,
    'stripline_z0_ohm_w100um_b500um_er4.2': 74.30297906007794,
    'stripline_z0_ohm_w1500um_b1000um_er3.66': 25.363226351587137,
    'stripline_z0_ohm_w50um_b1000um_er4': 117.43463636588861,
    'stripline_z0_ohm_w300um_b1000um_er4.5': 60.11928669089411,
    'stripline_z0_ohm_w350um_b1000um_er4': 59.53386748763759,
    'stripline_z0_ohm_w5000um_b1000um_er4': 8.654896008586903,
    'stripline_cohnwide_z0_ohm_w500um_b1000um_t20um_er4': 47.67343266844121,
    'stripline_cohnwide_z0_ohm_w900um_b800um_t18um_er4.2': 28.155297551391662,
    'stripline_cohnwide_z0_ohm_w400um_b500um_t17.5um_er3.66': 37.064380710827606,
    'stripline_cohnwide_z0_ohm_w350um_b1000um_t20um_er4': 56.41515036445015,
    'stripline_solve_w_um_Z50ohm_b500um_er4.2': 239.06392548658215,
    'stripline_solve_w_um_Z50ohm_b1000um_er4': 500.8257836544264,
    'stripline_solve_w_um_Z75ohm_b600um_er4.5': 107.94384404897046,
    'stripline_solve_w_um_Z30ohm_b400um_er3.66': 480.00029797907507,
    'stripline_cohnwide_solve_w_um_Z50ohm_b800um_t18um_er4.2': 342.3410313732332,
    'stripline_cohnwide_solve_w_um_Z40ohm_b600um_t17.5um_er4': 399.7282011690093,
    'coax_z0_ohm_D2.71828mm_d1mm_er1': 59.9584916,
    'coax_z0_ohm_D3.5mm_d1mm_er2.1': 51.8334311769736,
    'coax_z0_ohm_D4.6mm_d1.5mm_er2.25': 44.79263851709233,
    'coax_z0_ohm_D9mm_d2.7mm_er1': 72.18839327480508,
    'coax_z0_ohm_D7.25mm_d2mm_er2.2': 52.06023049532594,
    'coax_solve_D_mm_Z50ohm_d1mm_er2.1': 3.3482932658452524,
    'coax_solve_D_mm_Z75ohm_d0.5mm_er2.25': 3.2646444353993624,
    'elliptic_K_k0.001': 1.5707967194941992,
    'elliptic_Kprime_k0.001': 8.29405146361544,
    'elliptic_K_k0.1': 1.574745561517356,
    'elliptic_Kprime_k0.1': 3.6956373629898747,
    'elliptic_K_k0.3': 1.6080486199305128,
    'elliptic_Kprime_k0.3': 2.627773332084344,
    'elliptic_K_k0.5': 1.685750354812596,
    'elliptic_Kprime_k0.5': 2.1565156474996434,
    'elliptic_K_k0.555556': 1.7189786665597662,
    'elliptic_Kprime_k0.555556': 2.0628185603686044,
    'elliptic_K_k0.707107': 1.8540746773013719,
    'elliptic_Kprime_k0.707107': 1.8540746773013719,
    'elliptic_K_k0.9': 2.2805491384227703,
    'elliptic_Kprime_k0.9': 1.654616667522527,
    'elliptic_K_k0.99': 3.356600523361192,
    'elliptic_Kprime_k0.99': 1.5786997420390116,
    'elliptic_K_k0.999999': 7.947479773547967,
    'elliptic_Kprime_k0.999999': 1.570797112193551,
    'delay_ps_per_mm_ee2.967': 5.745635488186738,
    'guided_wavelength_mm_ee2.967_f5e+09Hz': 34.80903033462672,
    'skew_ps_dL10mm_ee2.967': 57.45635488186739,
    'delay_ps_per_mm_ee3.2': 5.966975933730233,
    'guided_wavelength_mm_ee3.2_f1e+09Hz': 167.58907880743766,
    'skew_ps_dL2.5mm_ee3.2': 14.917439834325586,
    'delay_ps_per_mm_ee4.4': 6.996899489513853,
    'guided_wavelength_mm_ee4.4_f2.5e+08Hz': 571.6817864819609,
    'skew_ps_dL100mm_ee4.4': 699.6899489513854,
    'delay_ps_per_mm_ee1': 3.335640951981521,
    'guided_wavelength_mm_ee1_f1e+10Hz': 29.979245799999998,
    'skew_ps_dL1mm_ee1': 3.335640951981521,
}


def pinned_vectors():
    return [(n, got, PINNED[n], tol, ids, note) for n, got, tol, ids, note in vectors()]


def self_checks():
    """Oracle self-consistency (raises AssertionError). Not a verification of any standard."""
    # K by AGM against composite-Simpson quadrature of the defining integral (independent algorithm)
    for k in (0.1, 0.5, 5.0 / 9.0, 0.9):
        assert abs(ell_k(k) - ell_k_quad(k)) <= 1e-12 * ell_k(k), k
    # K(1/sqrt 2) = Gamma(1/4)^2 / (4 sqrt pi) (NIST DLMF 19.6.1 special value)
    assert abs(ell_k(math.sqrt(0.5)) - math.gamma(0.25) ** 2 / (4.0 * math.sqrt(math.pi))) <= 1e-14 * 1.854
    # Steer Example 2 (published eps_e ~ 2.967, Z0,air ~ 129.7, Z0 ~ 75.3 with prefactor 60): ours within the 0.07 % prefactor spread
    u = 600.0 / 635.0
    assert abs(ms_ee(u, 4.1) - 2.967) < 5e-4
    assert abs(ms_z0(u, 4.1) - 75.3) / 75.3 < 2e-3
    # procedure A and B give the same Z0 (algebra: z01(u1)/sqrt(ee(t)) = z01(ur)/sqrt(ee(ur)))
    za, ea = ms_thick_A(2.0, 0.02222, 4.5)
    zb, eb = ms_thick_B(2.0, 0.02222, 4.5)
    assert za == zb and ea < eb
    # D/d = e, er = 1 gives eta0/(2 pi)
    assert abs(coax_z0(math.e, 1.0) - ZP) <= 1e-12 * ZP
    # stripline thickness form tends to the zero-thickness form as t -> 0
    assert abs(sl_cohn_wide(0.5, 1e-9, 4.0) - sl_z0(0.5, 4.0)) / sl_z0(0.5, 4.0) < 1e-3  # 0.441 vs 2 ln2/pi


if __name__ == "__main__":
    self_checks()
    for name, got, tol, ids, note in vectors():
        print("%-70s %.17g" % (name, got))
