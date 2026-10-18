#!/usr/bin/env python3
"""
INDEPENDENT ORACLE for Phase 2 parts A and B (impedance models; part B = edge-coupled differential models S-022, S-022a, S-022b). Written from the equations recorded in
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


# Part B pins (coupled differential models): full-precision literals recorded from this oracle, regression pins only.
PINNED_B = {
    'diffmicrostrip_zodd_ohm_w200um_s200um_h200um_er4.5': 60.0370258688354,
    'diffmicrostrip_zeven_ohm_w200um_s200um_h200um_er4.5': 79.93914530291562,
    'diffmicrostrip_zdiff_ohm_w200um_s200um_h200um_er4.5': 120.0740517376708,
    'diffmicrostrip_zcommon_ohm_w200um_s200um_h200um_er4.5': 39.96957265145781,
    'diffmicrostrip_eeven_w200um_s200um_h200um_er4.5': 3.4562985444371335,
    'diffmicrostrip_eodd_w200um_s200um_h200um_er4.5': 2.9411821308418906,
    'diffmicrostrip_zodd_ohm_w150um_s100um_h200um_er4.5': 59.010804523794434,
    'diffmicrostrip_zeven_ohm_w150um_s100um_h200um_er4.5': 99.15389505939397,
    'diffmicrostrip_zdiff_ohm_w150um_s100um_h200um_er4.5': 118.02160904758887,
    'diffmicrostrip_zcommon_ohm_w150um_s100um_h200um_er4.5': 49.57694752969699,
    'diffmicrostrip_eeven_w150um_s100um_h200um_er4.5': 3.389989324730745,
    'diffmicrostrip_eodd_w150um_s100um_h200um_er4.5': 2.843164005050705,
    'diffmicrostrip_zodd_ohm_w100um_s50um_h100um_er3.66': 57.366733325660604,
    'diffmicrostrip_zeven_ohm_w100um_s50um_h100um_er3.66': 94.04399578917435,
    'diffmicrostrip_zdiff_ohm_w100um_s50um_h100um_er3.66': 114.73346665132121,
    'diffmicrostrip_zcommon_ohm_w100um_s50um_h100um_er3.66': 47.02199789458717,
    'diffmicrostrip_eeven_w100um_s50um_h100um_er3.66': 2.870774734513417,
    'diffmicrostrip_eodd_w100um_s50um_h100um_er3.66': 2.428270179947411,
    'diffmicrostrip_zodd_ohm_w300um_s200um_h150um_er4.2': 44.846895568891455,
    'diffmicrostrip_zeven_ohm_w300um_s200um_h150um_er4.2': 54.03746739229859,
    'diffmicrostrip_zdiff_ohm_w300um_s200um_h150um_er4.2': 89.69379113778291,
    'diffmicrostrip_zcommon_ohm_w300um_s200um_h150um_er4.2': 27.018733696149294,
    'diffmicrostrip_eeven_w300um_s200um_h150um_er4.2': 3.416387438184489,
    'diffmicrostrip_eodd_w300um_s200um_h150um_er4.2': 2.954036067896932,
    'diffmicrostrip_zodd_ohm_w50um_s50um_h500um_er4.2': 60.83585532558558,
    'diffmicrostrip_zeven_ohm_w50um_s50um_h500um_er4.2': 235.57620819039585,
    'diffmicrostrip_zdiff_ohm_w50um_s50um_h500um_er4.2': 121.67171065117115,
    'diffmicrostrip_zcommon_ohm_w50um_s50um_h500um_er4.2': 117.78810409519792,
    'diffmicrostrip_eeven_w50um_s50um_h500um_er4.2': 2.9222932798219388,
    'diffmicrostrip_eodd_w50um_s50um_h500um_er4.2': 2.605984194603142,
    'diffmicrostrip_zodd_ohm_w3000um_s300um_h300um_er4.5': 13.259068832826658,
    'diffmicrostrip_zeven_ohm_w3000um_s300um_h300um_er4.5': 15.232193372080141,
    'diffmicrostrip_zdiff_ohm_w3000um_s300um_h300um_er4.5': 26.518137665653317,
    'diffmicrostrip_zcommon_ohm_w3000um_s300um_h300um_er4.5': 7.616096686040071,
    'diffmicrostrip_eeven_w3000um_s300um_h300um_er4.5': 4.144837133465025,
    'diffmicrostrip_eodd_w3000um_s300um_h300um_er4.5': 3.716590702682813,
    'diffmicrostrip_zodd_ohm_w100um_s800um_h200um_er4.5': 92.88717963471863,
    'diffmicrostrip_zeven_ohm_w100um_s800um_h200um_er4.5': 96.38237561876811,
    'diffmicrostrip_zdiff_ohm_w100um_s800um_h200um_er4.5': 185.77435926943727,
    'diffmicrostrip_zcommon_ohm_w100um_s800um_h200um_er4.5': 48.191187809384054,
    'diffmicrostrip_eeven_w100um_s800um_h200um_er4.5': 3.193109500770157,
    'diffmicrostrip_eodd_w100um_s800um_h200um_er4.5': 3.0224084484421025,
    'diffmicrostrip_zodd_ohm_w200um_s3um_h200um_er4.2': 28.264817078527656,
    'diffmicrostrip_zeven_ohm_w200um_s3um_h200um_er4.2': 98.93648425190774,
    'diffmicrostrip_zdiff_ohm_w200um_s3um_h200um_er4.2': 56.52963415705531,
    'diffmicrostrip_zcommon_ohm_w200um_s3um_h200um_er4.2': 49.46824212595387,
    'diffmicrostrip_eeven_w200um_s3um_h200um_er4.2': 3.2130931325745173,
    'diffmicrostrip_eodd_w200um_s3um_h200um_er4.2': 2.641174685961226,
    'diffmicrostrip_zodd_ohm_w150um_s150um_h150um_er1': 102.96274900174872,
    'diffmicrostrip_zeven_ohm_w150um_s150um_h150um_er1': 148.61584829329297,
    'diffmicrostrip_zdiff_ohm_w150um_s150um_h150um_er1': 205.92549800349744,
    'diffmicrostrip_zcommon_ohm_w150um_s150um_h150um_er1': 74.30792414664649,
    'diffmicrostrip_eeven_w150um_s150um_h150um_er1': 1.0,
    'diffmicrostrip_eodd_w150um_s150um_h150um_er1': 1.0,
    'diffmicrostrip_zodd_ohm_w150um_s100um_h150um_er128': 11.385257757300362,
    'diffmicrostrip_zeven_ohm_w150um_s100um_h150um_er128': 16.40833974871391,
    'diffmicrostrip_zdiff_ohm_w150um_s100um_h150um_er128': 22.770515514600724,
    'diffmicrostrip_zcommon_ohm_w150um_s100um_h150um_er128': 8.204169874356955,
    'diffmicrostrip_eeven_w150um_s100um_h150um_er128': 89.37215445754299,
    'diffmicrostrip_eodd_w150um_s100um_h150um_er128': 69.68722758641272,
    'diffmicrostrip_zodd_ohm_w635um_s300um_h635um_er9.8': 36.97039220908754,
    'diffmicrostrip_zeven_ohm_w635um_s300um_h635um_er9.8': 59.911239963977565,
    'diffmicrostrip_zdiff_ohm_w635um_s300um_h635um_er9.8': 73.94078441817508,
    'diffmicrostrip_zcommon_ohm_w635um_s300um_h635um_er9.8': 29.955619981988782,
    'diffmicrostrip_eeven_w635um_s300um_h635um_er9.8': 7.142707102634866,
    'diffmicrostrip_eodd_w635um_s300um_h635um_er9.8': 5.7041893225266955,
    'diffmicrostrip_zodd_ohm_w120um_s150um_h100um_er3.48': 65.0404878229694,
    'diffmicrostrip_zeven_ohm_w120um_s150um_h100um_er3.48': 78.37504727806672,
    'diffmicrostrip_zdiff_ohm_w120um_s150um_h100um_er3.48': 130.0809756459388,
    'diffmicrostrip_zcommon_ohm_w120um_s150um_h100um_er3.48': 39.18752363903336,
    'diffmicrostrip_eeven_w120um_s150um_h100um_er3.48': 2.765391538445228,
    'diffmicrostrip_eodd_w120um_s150um_h100um_er3.48': 2.4342089663550874,
    'diffmicrostrip_solve_s_um_Zd100ohm_w150um_h100um_er4.2': 91.64802341290061,
    'diffmicrostrip_solve_s_um_Zd90ohm_w200um_h150um_er4.5': 63.903500409608654,
    'diffmicrostrip_solve_s_um_Zd110ohm_w120um_h100um_er3.66': 60.45679862400129,
    'diffmicrostrip_solve_s_um_Zd85ohm_w250um_h200um_er4.2': 47.573313658711506,
    'diffmicrostrip_solve_w_um_Zd100ohm_s150um_h100um_er4.2': 169.59511648336667,
    'diffmicrostrip_solve_w_um_Zd90ohm_s200um_h150um_er4.5': 283.29234719713753,
    'diffmicrostrip_solve_w_um_Zd110ohm_s120um_h100um_er3.66': 150.59583739188582,
    'diffmicrostrip_solve_w_um_Zd85ohm_s200um_h200um_er4.2': 411.535501623153,
    'diffstripline_zodd_ohm_w500um_s636.62um_b1000um_er4': 47.68459321660051,
    'diffstripline_zeven_ohm_w500um_s636.62um_b1000um_er4': 52.273195937991126,
    'diffstripline_zdiff_ohm_w500um_s636.62um_b1000um_er4': 95.36918643320102,
    'diffstripline_zcommon_ohm_w500um_s636.62um_b1000um_er4': 26.136597968995563,
    'diffstripline_zinf_ohm_w500um_s636.62um_b1000um_er4': 50.02945927533656,
    'diffstripline_zodd_ohm_w300um_s200um_b1000um_er4': 47.858290547163,
    'diffstripline_zeven_ohm_w300um_s200um_b1000um_er4': 77.81376508062841,
    'diffstripline_zdiff_ohm_w300um_s200um_b1000um_er4': 95.716581094326,
    'diffstripline_zcommon_ohm_w300um_s200um_b1000um_er4': 38.90688254031421,
    'diffstripline_zinf_ohm_w300um_s200um_b1000um_er4': 63.527746880394254,
    'diffstripline_zodd_ohm_w200um_s200um_b500um_er4.2': 48.483257028652034,
    'diffstripline_zeven_ohm_w200um_s200um_b500um_er4.2': 60.3459464352407,
    'diffstripline_zdiff_ohm_w200um_s200um_b500um_er4.2': 96.96651405730407,
    'diffstripline_zcommon_ohm_w200um_s200um_b500um_er4.2': 30.17297321762035,
    'diffstripline_zinf_ohm_w200um_s200um_b500um_er4.2': 54.62732176256636,
    'diffstripline_zodd_ohm_w150um_s150um_b600um_er3.66': 55.62563679045058,
    'diffstripline_zeven_ohm_w150um_s150um_b600um_er3.66': 86.11194531708593,
    'diffstripline_zdiff_ohm_w150um_s150um_b600um_er3.66': 111.25127358090116,
    'diffstripline_zcommon_ohm_w150um_s150um_b600um_er3.66': 43.05597265854296,
    'diffstripline_zinf_ohm_w150um_s150um_b600um_er3.66': 71.21665465983244,
    'diffstripline_zodd_ohm_w500um_s400um_b1000um_er4.5': 42.36937511531565,
    'diffstripline_zeven_ohm_w500um_s400um_b1000um_er4.5': 51.532873293041725,
    'diffstripline_zdiff_ohm_w500um_s400um_b1000um_er4.5': 84.7387502306313,
    'diffstripline_zcommon_ohm_w500um_s400um_b1000um_er4.5': 25.766436646520862,
    'diffstripline_zinf_ohm_w500um_s400um_b1000um_er4.5': 47.168226550248946,
    'diffstripline_zodd_ohm_w100um_s100um_b400um_er4.2': 51.926720284995426,
    'diffstripline_zeven_ohm_w100um_s100um_b400um_er4.2': 80.38579251725133,
    'diffstripline_zdiff_ohm_w100um_s100um_b400um_er4.2': 103.85344056999085,
    'diffstripline_zcommon_ohm_w100um_s100um_b400um_er4.2': 40.192896258625666,
    'diffstripline_zinf_ohm_w100um_s100um_b400um_er4.2': 66.48098825520484,
    'diffstripline_zodd_ohm_w250um_s2000um_b800um_er4': 62.46400639266397,
    'diffstripline_zeven_ohm_w250um_s2000um_b800um_er4': 62.48448973125145,
    'diffstripline_zdiff_ohm_w250um_s2000um_b800um_er4': 124.92801278532794,
    'diffstripline_zcommon_ohm_w250um_s2000um_b800um_er4': 31.242244865625725,
    'diffstripline_zinf_ohm_w250um_s2000um_b800um_er4': 62.474248370921764,
    'diffstripline_zodd_ohm_w400um_s50um_b1000um_er4': 32.36211389171124,
    'diffstripline_zeven_ohm_w400um_s50um_b1000um_er4': 73.04883914886678,
    'diffstripline_zdiff_ohm_w400um_s50um_b1000um_er4': 64.72422778342248,
    'diffstripline_zcommon_ohm_w400um_s50um_b1000um_er4': 36.52441957443339,
    'diffstripline_zinf_ohm_w400um_s50um_b1000um_er4': 55.976347657725086,
    'diffstripline_zodd_ohm_w150um_s1000um_b400um_er4.2': 56.291873650652235,
    'diffstripline_zeven_ohm_w150um_s1000um_b400um_er4.2': 56.30891940506602,
    'diffstripline_zdiff_ohm_w150um_s1000um_b400um_er4.2': 112.58374730130447,
    'diffstripline_zcommon_ohm_w150um_s1000um_b400um_er4.2': 28.15445970253301,
    'diffstripline_zinf_ohm_w150um_s1000um_b400um_er4.2': 56.3003968919515,
    'diffstripline_solve_s_um_Zd100ohm_w200um_b1000um_er4': 156.80906968683132,
    'diffstripline_solve_s_um_Zd90ohm_w150um_b600um_er4.2': 83.63994474672201,
    'diffstripline_solve_s_um_Zd110ohm_w300um_b800um_er3.66': 386.3299022864807,
    'diffstripline_solve_w_um_Zd100ohm_s200um_b1000um_er4': 257.85229349572154,
    'diffstripline_solve_w_um_Zd90ohm_s150um_b600um_er4.2': 231.7375138772208,
    'diffstripline_solve_w_um_Zd110ohm_s300um_b800um_er3.66': 269.3525958047048,
}
PINNED.update(PINNED_B)


# Part C pins (CPW and CPWG): full-precision literals recorded from this oracle (60-digit decimal K), regression pins only.
PINNED_C = {
    'cpw_z0_ohm_w500um_s200um_h500um_er1': 113.02151358540485,
    'cpw_eeff_w500um_s200um_h500um_er1': 1.0,
    'cpw_k_w500um_s200um_h500um_er1': 0.5555555555555556,
    'cpw_k1_w500um_s200um_h500um_er1': 0.44916121659925634,
    'cpw_z0_ohm_w500um_s200um_h500um_er12.85': 45.24582103634388,
    'cpw_eeff_w500um_s200um_h500um_er12.85': 6.239722725757477,
    'cpw_k_w500um_s200um_h500um_er12.85': 0.5555555555555556,
    'cpw_k1_w500um_s200um_h500um_er12.85': 0.44916121659925634,
    'cpw_z0_ohm_w300um_s200um_h1600um_er4.5': 79.16161633302383,
    'cpw_eeff_w300um_s200um_h1600um_er4.5': 2.7359398404753934,
    'cpw_k_w300um_s200um_h1600um_er4.5': 0.42857142857142855,
    'cpw_k1_w300um_s200um_h1600um_er4.5': 0.42177325988690245,
    'cpw_z0_ohm_w250um_s150um_h1000um_er4.2': 79.0745083132116,
    'cpw_eeff_w250um_s150um_h1000um_er4.2': 2.5795276278433983,
    'cpw_k_w250um_s150um_h1000um_er4.2': 0.45454545454545453,
    'cpw_k1_w250um_s150um_h1000um_er4.2': 0.44354836393143976,
    'cpw_z0_ohm_w100um_s100um_h200um_er3.66': 98.66396671918733,
    'cpw_eeff_w100um_s100um_h200um_er3.66': 2.2272311432833867,
    'cpw_k_w100um_s100um_h200um_er3.66': 0.3333333333333333,
    'cpw_k1_w100um_s100um_h200um_er3.66': 0.27403129960564526,
    'cpw_z0_ohm_w200um_s50um_h1600um_er4.5': 59.79356178025146,
    'cpw_eeff_w200um_s50um_h1600um_er4.5': 2.74712704592507,
    'cpw_k_w200um_s50um_h1600um_er4.5': 0.6666666666666666,
    'cpw_k1_w200um_s50um_h1600um_er4.5': 0.6653307517534144,
    'cpw_z0_ohm_w1000um_s100um_h1600um_er4.3': 48.420443104201226,
    'cpw_eeff_w1000um_s100um_h1600um_er4.3': 2.6104390796220756,
    'cpw_k_w1000um_s100um_h1600um_er4.3': 0.8333333333333334,
    'cpw_k1_w1000um_s100um_h1600um_er4.3': 0.8190132933170973,
    'cpw_z0_ohm_w150um_s500um_h800um_er4.2': 129.3693904744183,
    'cpw_eeff_w150um_s500um_h800um_er4.2': 2.5107844113786637,
    'cpw_k_w150um_s500um_h800um_er4.2': 0.13043478260869565,
    'cpw_k1_w150um_s500um_h800um_er4.2': 0.10674048572265106,
    'cpw_z0_ohm_w500um_s200um_h100000um_er4.5': 68.1546170509535,
    'cpw_eeff_w500um_s200um_h100000um_er4.5': 2.7499935443971113,
    'cpw_k_w500um_s200um_h100000um_er4.5': 0.5555555555555556,
    'cpw_k1_w500um_s200um_h100000um_er4.5': 0.5555523570888262,
    'cpw_z0_ohm_w500um_s200um_h20um_er4.5': 103.47744009194241,
    'cpw_eeff_w500um_s200um_h20um_er4.5': 1.192973744565051,
    'cpw_k_w500um_s200um_h20um_er4.5': 0.5555555555555556,
    'cpw_k1_w500um_s200um_h20um_er4.5': 1.5070172753900646e-07,
    'cpw_z0_ohm_w300um_s300um_h300um_er128': 20.796763873682504,
    'cpw_eeff_w300um_s300um_h300um_er128': 50.12921605434623,
    'cpw_k_w300um_s300um_h300um_er128': 0.3333333333333333,
    'cpw_k1_w300um_s300um_h300um_er128': 0.16615830650994654,
    'cpw_z0_ohm_w100um_s10um_h1600um_er4.5': 47.17963033654871,
    'cpw_eeff_w100um_s10um_h1600um_er4.5': 2.749552482604889,
    'cpw_k_w100um_s10um_h1600um_er4.5': 0.8333333333333334,
    'cpw_k1_w100um_s10um_h1600um_er4.5': 0.8331861236025038,
    'cpwg_z0_ohm_w500um_s200um_h500um_er1': 100.43800215362509,
    'cpwg_eeff_w500um_s200um_h500um_er1': 1.0,
    'cpwg_k3_w500um_s200um_h500um_er1': 0.7382735392946401,
    'cpwg_q_w500um_s200um_h500um_er1': 0.5556686556063107,
    'cpwg_z0_ohm_w500um_s200um_h500um_er12.85': 36.46948397460501,
    'cpwg_eeff_w500um_s200um_h500um_er12.85': 7.584673568934782,
    'cpwg_k3_w500um_s200um_h500um_er12.85': 0.7382735392946401,
    'cpwg_q_w500um_s200um_h500um_er12.85': 0.5556686556063107,
    'cpwg_z0_ohm_w300um_s200um_h200um_er4.2': 56.4952723135648,
    'cpwg_eeff_w300um_s200um_h200um_er4.2': 3.00357976646107,
    'cpwg_k3_w300um_s200um_h200um_er4.2': 0.8336518090713089,
    'cpwg_q_w300um_s200um_h200um_er4.2': 0.6261186770190843,
    'cpwg_z0_ohm_w250um_s150um_h1000um_er4.2': 77.46143355005367,
    'cpwg_eeff_w250um_s150um_h1000um_er4.2': 2.6203005282860596,
    'cpwg_k3_w250um_s150um_h1000um_er4.2': 0.47636606617529664,
    'cpwg_q_w250um_s150um_h1000um_er4.2': 0.5063439150893937,
    'cpwg_z0_ohm_w200um_s150um_h160um_er4.35': 60.807109847037516,
    'cpwg_eeff_w200um_s150um_h160um_er4.35': 3.0394255269720087,
    'cpwg_k3_w200um_s150um_h160um_er4.35': 0.7650333505149921,
    'cpwg_q_w200um_s150um_h160um_er4.35': 0.6087837393946295,
    'cpwg_z0_ohm_w150um_s100um_h100um_er3.66': 59.97141957948539,
    'cpwg_eeff_w150um_s100um_h100um_er3.66': 2.665475680870764,
    'cpwg_k3_w150um_s100um_h100um_er3.66': 0.8336518090713089,
    'cpwg_q_w150um_s100um_h100um_er3.66': 0.6261186770190843,
    'cpwg_z0_ohm_w400um_s300um_h1600um_er4.5': 80.02662493649,
    'cpwg_eeff_w400um_s300um_h1600um_er4.5': 2.7773875850683067,
    'cpwg_k3_w400um_s300um_h1600um_er4.5': 0.4261605070665631,
    'cpwg_q_w400um_s300um_h1600um_er4.5': 0.5078250243052305,
    'cpwg_z0_ohm_w500um_s200um_h100000um_er4.5': 68.15420564321526,
    'cpwg_eeff_w500um_s200um_h100000um_er4.5': 2.7500064555921306,
    'cpwg_k3_w500um_s200um_h100000um_er4.5': 0.5555619524606036,
    'cpwg_q_w500um_s200um_h100000um_er4.5': 0.5000018444548945,
    'cpwg_z0_ohm_w100um_s50um_h50um_er3.48': 52.09090838271699,
    'cpwg_eeff_w100um_s50um_h50um_er3.48': 2.6133350498029726,
    'cpwg_k3_w100um_s50um_h50um_er3.48': 0.9205842034099684,
    'cpwg_q_w100um_s50um_h50um_er3.48': 0.6505383265334567,
    'cpwg_z0_ohm_w1000um_s500um_h300um_er4.5': 34.55885209158871,
    'cpwg_eeff_w1000um_s500um_h300um_er4.5': 3.553740440687788,
    'cpwg_k3_w1000um_s500um_h300um_er4.5': 0.9894692474419606,
    'cpwg_q_w1000um_s500um_h300um_er4.5': 0.7296401259107965,
    'cpwg_z0_ohm_w300um_s300um_h300um_er128': 13.495578104354504,
    'cpwg_eeff_w300um_s300um_h300um_er128': 76.94712537276797,
    'cpwg_k3_w300um_s300um_h300um_er128': 0.667683386980107,
    'cpwg_q_w300um_s300um_h300um_er128': 0.5980088612028974,
    'cpw_solve_s_um_Z50ohm_w300um_h1600um_er4.5': 37.88147843267837,
    'cpw_solve_s_um_Z60ohm_w250um_h1000um_er4.2': 56.811427688244265,
    'cpw_solve_s_um_Z75ohm_w200um_h800um_er3.66': 82.90750766205666,
    'cpw_solve_s_um_Z40ohm_w500um_h1600um_er4.5': 24.042475367675664,
    'cpw_solve_w_um_Z50ohm_s200um_h1600um_er4.5': 1724.5522379893569,
    'cpw_solve_w_um_Z60ohm_s150um_h1000um_er4.2': 687.7773307855166,
    'cpw_solve_w_um_Z75ohm_s300um_h800um_er3.66': 804.7604049987445,
    'cpw_solve_w_um_Z40ohm_s150um_h1600um_er4.5': 3986.6708488410286,
    'cpwg_solve_s_um_Z50ohm_w300um_h200um_er4.2': 80.625486865237,
    'cpwg_solve_s_um_Z60ohm_w250um_h1000um_er4.2': 58.96424516320917,
    'cpwg_solve_s_um_Z75ohm_w200um_h800um_er3.66': 87.41915133936597,
    'cpwg_solve_s_um_Z40ohm_w400um_h1600um_er4.5': 19.75339662714937,
    'cpwg_solve_w_um_Z50ohm_s150um_h200um_er4.2': 353.8401505946634,
    'cpwg_solve_w_um_Z60ohm_s150um_h1000um_er4.2': 561.2462819486717,
    'cpwg_solve_w_um_Z75ohm_s300um_h800um_er3.66': 518.2894686575293,
    'cpwg_solve_w_um_Z40ohm_s200um_h1600um_er4.5': 2289.2141807112903,
}
PINNED.update(PINNED_C)


# Part D pins (core D: envelope, sensitivity, loss, quarter wave): full-precision literals recorded from this oracle, regression pins only.
PINNED_D = {
    'env_microstrip_A_z0_min': 44.39533260071851,
    'env_microstrip_A_z0_typ': 49.71402966781172,
    'env_microstrip_A_z0_max': 55.734928718840045,
    'env_microstrip_A_eeff_min': 3.0249898137280464,
    'env_microstrip_A_eeff_typ': 3.20703999002347,
    'env_microstrip_A_eeff_max': 3.39422773769272,
    'env_microstrip_A_delay_min': 5.801512807713292,
    'env_microstrip_A_delay_typ': 5.973535991911165,
    'env_microstrip_A_delay_max': 6.14539476567824,
    'sens_microstrip_A_z0_to_w': -0.6079826644516888,
    'sens_microstrip_A_eeff_to_w': 0.08488684200227439,
    'sens_microstrip_A_delay_to_w': 0.042443421001137197,
    'sens_microstrip_A_z0_to_h': 0.6079826644516888,
    'sens_microstrip_A_eeff_to_h': -0.08488684200227439,
    'sens_microstrip_A_delay_to_h': -0.042443421001137197,
    'sens_microstrip_A_z0_to_er': -0.448270676368288,
    'sens_microstrip_A_eeff_to_er': 0.8965413521814645,
    'sens_microstrip_A_delay_to_er': 0.4482706761462434,
    'env_microstrip_B_z0_min': 70.53160918941325,
    'env_microstrip_B_z0_typ': 75.26613765215878,
    'env_microstrip_B_z0_max': 83.26827307727281,
    'env_microstrip_B_eeff_min': 2.9280531085532395,
    'env_microstrip_B_eeff_typ': 2.967079608815158,
    'env_microstrip_B_eeff_max': 3.235682907536907,
    'env_microstrip_B_delay_min': 5.707800325308984,
    'env_microstrip_B_delay_typ': 5.745712569441438,
    'env_microstrip_B_delay_max': 6.0001523051024925,
    'sens_microstrip_B_z0_to_w': -0.47148473659854956,
    'sens_microstrip_B_eeff_to_w': 0.06348532610890399,
    'sens_microstrip_B_delay_to_w': 0.0317426632764966,
    'sens_microstrip_B_z0_to_er': -0.43497296032851895,
    'sens_microstrip_B_eeff_to_er': 0.869945920323971,
    'sens_microstrip_B_delay_to_er': 0.43497296010647435,
    'env_microstrip_T_z0_min': 43.605023498395184,
    'env_microstrip_T_z0_typ': 47.7807413868924,
    'env_microstrip_T_z0_max': 52.380361854981416,
    'env_microstrip_T_eeff_min': 3.3716945783472045,
    'env_microstrip_T_eeff_typ': 3.4165954415370616,
    'env_microstrip_T_eeff_max': 3.4612639152493214,
    'env_microstrip_T_delay_min': 6.124962172612742,
    'env_microstrip_T_delay_typ': 6.1656103587063855,
    'env_microstrip_T_delay_max': 6.205783986990302,
    'sens_microstrip_T_z0_to_w': -0.6032019834893494,
    'sens_microstrip_T_eeff_to_w': 0.08630179604513388,
    'sens_microstrip_T_delay_to_w': 0.04315089807807809,
    'sens_microstrip_T_z0_to_t': -0.007207287211676323,
    'sens_microstrip_T_eeff_to_t': 0.0010311667076041038,
    'sens_microstrip_T_delay_to_t': 0.0005155833538020519,
    'sens_microstrip_T_z0_to_h': 0.6104092704789811,
    'sens_microstrip_T_eeff_to_h': -0.08733296286376029,
    'sens_microstrip_T_delay_to_h': -0.04366648132085784,
    'env_stripline_A_z0_min': 69.78363920890229,
    'env_stripline_A_z0_typ': 76.13789681927459,
    'env_stripline_A_z0_max': 83.22350800237076,
    'env_stripline_A_eeff_min': 3.8,
    'env_stripline_A_eeff_typ': 4.0,
    'env_stripline_A_eeff_max': 4.2,
    'env_stripline_A_delay_min': 6.502361273417335,
    'env_stripline_A_delay_typ': 6.671281903963042,
    'env_stripline_A_delay_max': 6.83602972157465,
    'sens_stripline_A_z0_to_w': -0.4203718675488459,
    'sens_stripline_A_eeff_to_w': 0.0,
    'sens_stripline_A_delay_to_w': 0.0,
    'sens_stripline_A_z0_to_b': 0.4203718675488459,
    'sens_stripline_A_eeff_to_b': 0.0,
    'sens_stripline_A_delay_to_b': 0.0,
    'sens_stripline_A_z0_to_er': -0.5000000000831001,
    'sens_stripline_A_eeff_to_er': 0.9999999999441556,
    'sens_stripline_A_delay_to_er': 0.5000000000831001,
    'env_stripline_T_z0_min': 44.97306723716016,
    'env_stripline_T_z0_typ': 47.67343266844121,
    'env_stripline_T_z0_max': 50.486018775857936,
    'env_stripline_T_eeff_min': 4.0,
    'env_stripline_T_eeff_typ': 4.0,
    'env_stripline_T_eeff_max': 4.0,
    'env_stripline_T_delay_min': 6.671281903963042,
    'env_stripline_T_delay_typ': 6.671281903963042,
    'env_stripline_T_delay_max': 6.671281903963042,
    'sens_stripline_T_z0_to_w': -0.5165112349073602,
    'sens_stripline_T_eeff_to_w': 0.0,
    'sens_stripline_T_delay_to_w': 0.0,
    'sens_stripline_T_z0_to_t': -0.04137723164208655,
    'sens_stripline_T_eeff_to_t': 0.0,
    'sens_stripline_T_delay_to_t': 0.0,
    'env_coax_A_z0_min': 49.44204845644881,
    'env_coax_A_z0_typ': 51.8334311769736,
    'env_coax_A_z0_max': 54.309509362739746,
    'env_coax_A_eeff_min': 2.037,
    'env_coax_A_eeff_typ': 2.1,
    'env_coax_A_eeff_max': 2.1630000000000003,
    'env_coax_A_delay_min': 4.7607438118231284,
    'env_coax_A_delay_typ': 4.833802972518221,
    'env_coax_A_delay_max': 4.905774221510788,
    'sens_coax_A_z0_to_D': 0.798235600084626,
    'sens_coax_A_eeff_to_D': 0.0,
    'sens_coax_A_delay_to_D': 0.0,
    'sens_coax_A_z0_to_d': -0.798235600084626,
    'sens_coax_A_eeff_to_d': 0.0,
    'sens_coax_A_delay_to_d': 0.0,
    'sens_coax_A_z0_to_er': -0.4999999998610555,
    'sens_coax_A_eeff_to_er': 0.9999999999996667,
    'sens_coax_A_delay_to_er': 0.4999999999720778,
    'env_diffmicrostrip_A_zdiff_min': 108.07694242607919,
    'env_diffmicrostrip_A_zdiff_typ': 118.02160904758887,
    'env_diffmicrostrip_A_zdiff_max': 128.79010669034784,
    'env_diffmicrostrip_A_zodd_min': 54.03847121303959,
    'env_diffmicrostrip_A_zodd_typ': 59.010804523794434,
    'env_diffmicrostrip_A_zodd_max': 64.39505334517392,
    'env_diffmicrostrip_A_zeven_min': 88.94651019065338,
    'env_diffmicrostrip_A_zeven_typ': 99.15389505939397,
    'env_diffmicrostrip_A_zeven_max': 110.70410366315579,
    'env_diffmicrostrip_A_eeodd_min': 2.70472170392945,
    'env_diffmicrostrip_A_eeodd_typ': 2.843164005050705,
    'env_diffmicrostrip_A_eeodd_max': 2.9891226335340786,
    'env_diffmicrostrip_A_eeeven_min': 3.2056005464081476,
    'env_diffmicrostrip_A_eeeven_typ': 3.389989324730745,
    'env_diffmicrostrip_A_eeeven_max': 3.5791887604516415,
    'env_diffmicrostrip_A_delayodd_min': 5.4858078306540605,
    'env_diffmicrostrip_A_delayodd_typ': 5.624452497434126,
    'env_diffmicrostrip_A_delayodd_max': 5.7670160965206545,
    'env_diffmicrostrip_A_delayeven_min': 5.972195264428764,
    'env_diffmicrostrip_A_delayeven_typ': 6.141556652985325,
    'env_diffmicrostrip_A_delayeven_max': 6.310613737936271,
    'sens_diffmicrostrip_A_zdiff_to_w': -0.37056580160934505,
    'sens_diffmicrostrip_A_zodd_to_w': -0.37056580160934505,
    'sens_diffmicrostrip_A_zeven_to_w': -0.4771840611665429,
    'sens_diffmicrostrip_A_eeodd_to_w': 0.03527129299833944,
    'sens_diffmicrostrip_A_eeeven_to_w': 0.0617660326235003,
    'sens_diffmicrostrip_A_delayodd_to_w': 0.01763564649916972,
    'sens_diffmicrostrip_A_delayeven_to_w': 0.030883016256238998,
    'sens_diffmicrostrip_A_zdiff_to_s': 0.222693909540994,
    'sens_diffmicrostrip_A_zodd_to_s': 0.222693909540994,
    'sens_diffmicrostrip_A_zeven_to_s': -0.10137640505104867,
    'sens_diffmicrostrip_A_eeodd_to_s': 0.02035999358050383,
    'sens_diffmicrostrip_A_eeeven_to_s': 0.005545495507388562,
    'sens_diffmicrostrip_A_delayodd_to_s': 0.010179996734740763,
    'sens_diffmicrostrip_A_delayeven_to_s': 0.002772747809205432,
    'sens_diffmicrostrip_A_zdiff_to_h': 0.14787189206835105,
    'sens_diffmicrostrip_A_zodd_to_h': 0.14787189206835105,
    'sens_diffmicrostrip_A_zeven_to_h': 0.5785604666616808,
    'sens_diffmicrostrip_A_eeodd_to_h': -0.055631286689865576,
    'sens_diffmicrostrip_A_eeeven_to_h': -0.06731152813088886,
    'sens_diffmicrostrip_A_delayodd_to_h': -0.027815643566977393,
    'sens_diffmicrostrip_A_delayeven_to_h': -0.03365576406544443,
    'sens_diffmicrostrip_A_zdiff_to_er': -0.4159248727763061,
    'sens_diffmicrostrip_A_zodd_to_er': -0.4159248727763061,
    'sens_diffmicrostrip_A_zeven_to_er': -0.4499520467445932,
    'sens_diffmicrostrip_A_eeodd_to_er': 0.8318497463297683,
    'sens_diffmicrostrip_A_eeeven_to_er': 0.8999040941553202,
    'sens_diffmicrostrip_A_delayodd_to_er': 0.415924873109373,
    'sens_diffmicrostrip_A_delayeven_to_er': 0.4499520471886824,
    'env_diffmicrostrip_B_zdiff_min': 115.49993174344655,
    'env_diffmicrostrip_B_zdiff_typ': 120.0740517376708,
    'env_diffmicrostrip_B_zdiff_max': 129.6474397533607,
    'env_diffmicrostrip_B_zodd_min': 57.749965871723276,
    'env_diffmicrostrip_B_zodd_typ': 60.0370258688354,
    'env_diffmicrostrip_B_zodd_max': 64.82371987668034,
    'env_diffmicrostrip_B_zeven_min': 78.40601663360736,
    'env_diffmicrostrip_B_zeven_typ': 79.93914530291562,
    'env_diffmicrostrip_B_zeven_max': 86.33018567976512,
    'env_diffmicrostrip_B_eeodd_min': 2.9012148051529234,
    'env_diffmicrostrip_B_eeodd_typ': 2.9411821308418906,
    'env_diffmicrostrip_B_eeodd_max': 2.9623772745545383,
    'env_diffmicrostrip_B_eeeven_min': 3.4258802708031237,
    'env_diffmicrostrip_B_eeeven_typ': 3.4562985444371335,
    'env_diffmicrostrip_B_eeeven_max': 3.4593274210583447,
    'env_diffmicrostrip_B_delayodd_min': 5.681581483686551,
    'env_diffmicrostrip_B_delayodd_typ': 5.720582542665678,
    'env_diffmicrostrip_B_delayodd_max': 5.741157758314148,
    'env_diffmicrostrip_B_delayeven_min': 6.1739824063096265,
    'env_diffmicrostrip_B_delayeven_typ': 6.201331122594581,
    'env_diffmicrostrip_B_delayeven_max': 6.204047750419388,
    'sens_diffmicrostrip_B_zdiff_to_w': -0.4555729806852617,
    'sens_diffmicrostrip_B_zodd_to_w': -0.4555729806852617,
    'sens_diffmicrostrip_B_zeven_to_w': -0.5070071127511636,
    'sens_diffmicrostrip_B_eeodd_to_w': 0.05806069225553688,
    'sens_diffmicrostrip_B_eeeven_to_w': 0.07055215856164207,
    'sens_diffmicrostrip_B_delayodd_to_w': 0.029030346016746138,
    'sens_diffmicrostrip_B_delayeven_to_w': 0.035276079280821035,
    'sens_diffmicrostrip_B_zdiff_to_s': 0.16567168037877925,
    'sens_diffmicrostrip_B_zodd_to_s': 0.16567168037877925,
    'sens_diffmicrostrip_B_zeven_to_s': -0.10686398077835252,
    'sens_diffmicrostrip_B_eeodd_to_s': 0.03814879001685412,
    'sens_diffmicrostrip_B_eeeven_to_s': -0.00650685316755923,
    'sens_diffmicrostrip_B_delayodd_to_s': 0.01907439506393821,
    'sens_diffmicrostrip_B_delayeven_to_s': -0.003253426750313069,
    'env_diffstripline_A_zdiff_min': 88.05406098220409,
    'env_diffstripline_A_zdiff_typ': 95.716581094326,
    'env_diffstripline_A_zdiff_max': 103.83954960763691,
    'env_diffstripline_A_zodd_min': 44.027030491102046,
    'env_diffstripline_A_zodd_typ': 47.858290547163,
    'env_diffstripline_A_zodd_max': 51.919774803818456,
    'env_diffstripline_A_zeven_min': 69.29678133646647,
    'env_diffstripline_A_zeven_typ': 77.81376508062841,
    'env_diffstripline_A_zeven_max': 87.51241314430817,
    'env_diffstripline_A_eeff_min': 3.8,
    'env_diffstripline_A_eeff_typ': 4.0,
    'env_diffstripline_A_eeff_max': 4.2,
    'env_diffstripline_A_delay_min': 6.502361273417335,
    'env_diffstripline_A_delay_typ': 6.671281903963042,
    'env_diffstripline_A_delay_max': 6.83602972157465,
    'sens_diffstripline_A_zdiff_to_w': -0.30488626246689243,
    'sens_diffstripline_A_zodd_to_w': -0.30488626268893704,
    'sens_diffstripline_A_zeven_to_w': -0.4957207573450502,
    'sens_diffstripline_A_eeff_to_w': 0.0,
    'sens_diffstripline_A_delay_to_w': 0.0,
    'sens_diffstripline_A_zdiff_to_s': 0.23243878244986393,
    'sens_diffstripline_A_zodd_to_s': 0.23243878244986393,
    'sens_diffstripline_A_zeven_to_s': -0.11497149144139152,
    'sens_diffstripline_A_eeff_to_s': 0.0,
    'sens_diffstripline_A_delay_to_s': 0.0,
    'sens_diffstripline_A_zdiff_to_b': 0.07244748001702847,
    'sens_diffstripline_A_zodd_to_b': 0.07244748001702847,
    'sens_diffstripline_A_zeven_to_b': 0.6106922487864418,
    'sens_diffstripline_A_eeff_to_b': 0.0,
    'sens_diffstripline_A_delay_to_b': 0.0,
    'sens_diffstripline_A_zdiff_to_er': -0.5000000000831001,
    'sens_diffstripline_A_zodd_to_er': -0.5000000000831001,
    'sens_diffstripline_A_zeven_to_er': -0.5000000000831001,
    'sens_diffstripline_A_eeff_to_er': 0.9999999999441556,
    'sens_diffstripline_A_delay_to_er': 0.5000000000831001,
    'env_cpw_A_z0_min': 73.19720637991114,
    'env_cpw_A_z0_typ': 79.16161633302383,
    'env_cpw_A_z0_max': 85.69100244528752,
    'env_cpw_A_eeff_min': 2.619947013662751,
    'env_cpw_A_eeff_typ': 2.7359398404753934,
    'env_cpw_A_eeff_max': 2.851463893101115,
    'env_cpw_A_delay_min': 5.3991519626783715,
    'env_cpw_A_delay_typ': 5.5173758407999305,
    'env_cpw_A_delay_max': 5.632656087933848,
    'sens_cpw_A_z0_to_w': -0.2873993731964839,
    'sens_cpw_A_eeff_to_w': -0.005165960104272998,
    'sens_cpw_A_delay_to_w': -0.002582980052136499,
    'sens_cpw_A_z0_to_s': 0.2924645405932406,
    'sens_cpw_A_eeff_to_s': -0.004964374800262735,
    'sens_cpw_A_delay_to_s': -0.002482187455642519,
    'sens_cpw_A_z0_to_h': -0.005065167396756716,
    'sens_cpw_A_eeff_to_h': 0.010130335126580339,
    'sens_cpw_A_delay_to_h': 0.005065167618801321,
    'sens_cpw_A_z0_to_er': -0.40788957013061217,
    'sens_cpw_A_eeff_to_er': 0.8157791405942912,
    'sens_cpw_A_delay_to_er': 0.40788957035265677,
    'env_cpwg_A_z0_min': 50.700049281656185,
    'env_cpwg_A_z0_typ': 56.4952723135648,
    'env_cpwg_A_z0_max': 62.96761184706664,
    'env_cpwg_A_eeff_min': 2.81098099525422,
    'env_cpwg_A_eeff_typ': 3.00357976646107,
    'env_cpwg_A_eeff_max': 3.205955428973829,
    'env_cpwg_A_delay_min': 5.592529089718948,
    'env_cpwg_A_delay_typ': 5.7809455935118645,
    'env_cpwg_A_delay_max': 5.972525837326392,
    'sens_cpwg_A_z0_to_w': -0.5420482876027368,
    'sens_cpwg_A_eeff_to_w': 0.08372969939828577,
    'sens_cpwg_A_delay_to_w': 0.04186484958812058,
    'sens_cpwg_A_z0_to_s': 0.10028398511872834,
    'sens_cpwg_A_eeff_to_s': 0.06301282795717582,
    'sens_cpwg_A_delay_to_s': 0.03150641392307676,
    'sens_cpwg_A_z0_to_h': 0.4417643024840085,
    'sens_cpwg_A_eeff_to_h': -0.14674252724443929,
    'sens_cpwg_A_delay_to_h': -0.07337126373324195,
    'sens_cpwg_A_z0_to_er': -0.4377607134680364,
    'sens_cpwg_A_eeff_to_er': 0.8755214270470951,
    'sens_cpwg_A_delay_to_er': 0.4377607134680364,
    'skin_depth_um_f1e+06Hz_rhoCu': 66.08549310080564,
    'surface_resistance_mohm_f1e+06Hz_rhoCu': 0.26089506942234864,
    'skin_depth_um_f1e+09Hz_rhoCu': 2.089806784938892,
    'surface_resistance_mohm_f1e+09Hz_rhoCu': 8.250226496823718,
    'skin_depth_um_f1e+10Hz_rhoCu': 0.6608549310080564,
    'surface_resistance_mohm_f1e+10Hz_rhoCu': 26.089506942234866,
    'skin_depth_um_f1e+09Hz_rho1.9e-08': 2.1937994947148303,
    'surface_resistance_mohm_f1e+09Hz_rho1.9e-08': 8.66077325925804,
    'loss_microstrip_A_f1e+09Hz_tand0.02_ad_dBpm': 2.7494952405804702,
    'loss_microstrip_A_f1e+09Hz_tand0.02_ac_dBpm': 1.5868259635257853,
    'loss_microstrip_A_f1e+09Hz_tand0.02_total_dBpm': 4.336321204106255,
    'loss_microstrip_A_f1e+09Hz_tand0.02_total_dB_len100mm': 0.43363212041062554,
    'loss_microstrip_B_f5e+09Hz_tand0.004_ad_dBpm': 2.9446304525755522,
    'loss_microstrip_B_f5e+09Hz_tand0.004_ac_dBpm': 11.278614584443273,
    'loss_microstrip_B_f5e+09Hz_tand0.004_total_dBpm': 14.223245037018826,
    'loss_microstrip_B_f5e+09Hz_tand0.004_total_dB_len250mm': 3.5558112592547064,
    'loss_stripline_A_f2.5e+09Hz_tand0.01_ad_dBpm': 4.551069639790075,
    'loss_stripline_A_f2.5e+09Hz_tand0.01_ad_dB_len50mm': 0.22755348198950376,
    'loss_coax_A_f1e+08Hz_tand0.0003_ad_dBpm': 0.003957075884900558,
    'loss_coax_A_f1e+08Hz_tand0.0003_ac_dBpm': 0.08946122097452713,
    'loss_coax_A_f1e+08Hz_tand0.0003_total_dBpm': 0.0934182968594277,
    'loss_coax_A_f1e+08Hz_tand0.0003_total_dB_len1000mm': 0.09341829685942771,
    'loss_coax_B_f2e+09Hz_tand0.001_ad_dBpm': 0.2730641783874045,
    'loss_coax_B_f2e+09Hz_tand0.001_ac_dBpm': 0.34286124792373796,
    'loss_coax_B_f2e+09Hz_tand0.001_total_dBpm': 0.6159254263111424,
    'loss_coax_B_f2e+09Hz_tand0.001_total_dB_len300mm': 0.18477762789334273,
    'loss_diffmicrostrip_A_f3e+09Hz_tand0.015_ad_odd_dBpm': 5.756565947708891,
    'loss_diffmicrostrip_A_f3e+09Hz_tand0.015_ad_even_dBpm': 6.835924472842615,
    'loss_diffstripline_A_f1e+09Hz_tand0.01_ad_dBpm': 1.8204278559160303,
    'loss_diffstripline_A_f1e+09Hz_tand0.01_ad_dB_len100mm': 0.18204278559160303,
    'loss_cpw_A_f2e+09Hz_tand0.02_ad_dBpm': 4.912802848323813,
    'loss_cpw_A_f2e+09Hz_tand0.02_ad_dB_len80mm': 0.3930242278659051,
    'loss_cpwg_A_f4e+09Hz_tand0.018_ad_dBpm': 9.944027975776528,
    'loss_cpwg_A_f4e+09Hz_tand0.018_ad_dB_len60mm': 0.5966416785465918,
    'qw_length_mm_ee2.967_f5e+09Hz': 8.70225758365668,
    'qw_length_mm_ee3.2_f1e+09Hz': 41.89726970185942,
    'qw_length_mm_ee4.4_f2.5e+08Hz': 142.92044662049025,
    'qw_length_mm_ee1_f2.4e+09Hz': 31.228381041666665,
    'qw_freespace_length_mm_f2.5e+08Hz': 299.792458,
    'qw_freespace_length_mm_f1e+09Hz': 74.9481145,
    'qw_freespace_length_mm_f2.4e+09Hz': 31.228381041666665,
    'qw_freespace_length_mm_f5e+09Hz': 14.989622899999999,
    'qw_freq_GHz_ee2.967_L8mm': 5.438910989785425,
    'qw_freq_GHz_ee3.2_L30mm': 1.3965756567286471,
    'qw_freq_GHz_ee4.4_L150mm': 0.2382007443674837,
}
PINNED.update(PINNED_D)


def pinned_vectors():
    return [(n, got, PINNED[n], tol, ids, note) for n, got, tol, ids, note in vectors() + part_b_vectors() + part_c_vectors() + part_d_vectors()]


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


# =====================================================================================================================
# Phase 2 part B: edge-coupled differential models. Written from docs/sources/notes/impedance-models.md (S-022 Hammerstad-
# Jensen coupled microstrip as given in Steer sec. 5.6; S-022a Cohn approximate edge-coupled stripline, Caspers eq. 3.3;
# S-022b Zdiff = 2 Zodd, Zcommon = Zeven/2). Independent of src/. No published worked example exists for any of them, so every
# vector below is the recorded formula evaluated here; none of this verifies the models (S-022, S-022a stay
# PAYWALLED-USER-MUST-VERIFY).
# Interpretation recorded in the note: Z0 in Z01e = Z0/(1 - Z0 phi_e/eta0) is the AIR-FILLED single-line impedance Z01(u).
# Decision Q-1 applied: eta0 = mu0 c exact; the stripline 94.15 (as printed by Caspers) is taken as eta0/4 = 94.1826.
# =====================================================================================================================
# ---- S-022 coupled microstrip, u = w/h, g = s/h ----
def cm_psi(g):
    return 1.0 + g / 1.45 + g ** 2.09 / 3.95


def cm_alpha(g):
    return 0.5 * math.exp(-g)


def cm_m(g):
    return 0.2175 + (4.113 + (20.36 / g) ** 6) ** (-0.251) + (1.0 / 323.0) * math.log(g ** 10 / (1.0 + (g / 13.8) ** 10))


def cm_mu(u, g):
    return g * math.exp(-g) + u * (20.0 + g * g) / (10.0 + g * g)


def cm_phi(u):
    return 0.8645 * u ** 0.172


def cm_phie(u, g):
    return cm_phi(u) / (cm_psi(g) * (cm_alpha(g) * u ** cm_m(g) + (1.0 - cm_alpha(g)) * u ** (-cm_m(g))))


def cm_theta(g):
    return 1.729 + 1.175 * math.log(1.0 + 0.627 / (g + 0.327 * g ** 2.17))


def cm_beta(g):
    return (0.2306 + (1.0 / 301.8) * math.log(g ** 10 / (1.0 + (g / 3.73) ** 10))
            + (1.0 / 5.3) * math.log(1.0 + 0.646 * g ** 1.175))


def cm_n(g):
    return ((1.0 / 17.7 + math.exp(-6.424 - 0.76 * math.log(g) - (g / 0.23) ** 5))
            * math.log((10.0 + 68.3 * g * g) / (1.0 + 32.5 * g ** 3.093)))


def cm_phio(u, g):
    return cm_phie(u, g) - (cm_theta(g) / cm_psi(g)) * math.exp(cm_beta(g) * u ** cm_n(g) * math.log(u))


def cm_p(g):
    return math.exp(-0.745 * g ** 0.295) / math.cosh(g ** 0.68)


def cm_r(g, er):
    return 1.0 + 0.15 * (1.0 - math.exp(1.0 - (er - 1.0) ** 2 / 8.2) / (1.0 + g ** (-6)))


def cm_fo1(g, er):
    return 1.0 - math.exp(-0.179 * g ** 0.15 - 0.328 * g ** cm_r(g, er) / math.log(math.e + (g / 7.0) ** 2.8))


def cm_q(g):
    return math.exp(-1.366 - g)


def cm_fo(u, g, er):
    return cm_fo1(g, er) * math.exp(cm_p(g) * math.log(u) + cm_q(g) * math.sin(math.pi * math.log(u) / math.log(10.0)))


def cm_modes(u, g, er):
    """Returns dict with z0e, z0o, ee_e, ee_o (S-022) for u = w/h, g = s/h."""
    z01 = ms_z01(u)
    ab = ms_a(u) * ms_b(er)
    ee = (er + 1.0) / 2.0 + (er - 1.0) / 2.0 * (1.0 + 10.0 / cm_mu(u, g)) ** (-ab)
    eo = (er + 1.0) / 2.0 + (er - 1.0) / 2.0 * cm_fo(u, g, er) * (1.0 + 10.0 / u) ** (-ab)
    z01e = z01 / (1.0 - z01 * cm_phie(u, g) / ETA0)
    z01o = z01 / (1.0 - z01 * cm_phio(u, g) / ETA0)
    return {"z0e": z01e / math.sqrt(ee), "z0o": z01o / math.sqrt(eo), "ee_e": ee, "ee_o": eo}


def cm_zdiff(u, g, er):
    return 2.0 * cm_modes(u, g, er)["z0o"]          # S-022b


def cm_zcommon(u, g, er):
    return cm_modes(u, g, er)["z0e"] / 2.0          # S-022b


# ---- S-022a coupled stripline (Cohn approximate forms), x = w/b, y = s/b; eps_e = er (homogeneous) ----
SC_P = ETA0 / 4.0


def sc_z0e(x, y, er):
    return SC_P / math.sqrt(er) / (x + math.log(2.0) / math.pi + math.log(1.0 + math.tanh(math.pi * y / 2.0)) / math.pi)


def sc_z0o(x, y, er):
    return SC_P / math.sqrt(er) / (x + math.log(2.0) / math.pi + math.log(1.0 + 1.0 / math.tanh(math.pi * y / 2.0)) / math.pi)


def sc_zinf(x, er):
    """Weak-coupling limit s -> infinity of the same forms: denominator x + 2 ln2/pi."""
    return SC_P / math.sqrt(er) / (x + 2.0 * math.log(2.0) / math.pi)


# ---- solves (plain bisection on ln of the unknown, independent of the app's Brent) ----
def cm_solve_s(zd, u, er):
    """Spacing over h for a target Zdiff, bracket 0.01 <= g <= 5 (Zdiff increases with g there)."""
    return bisect_ln(lambda g: cm_zdiff(u, g, er) - zd, 0.01, 5.0)


def cm_solve_w(zd, g, er):
    """Width over h for a target Zdiff, bracket 0.1 <= u <= 10 (Zdiff decreases with u)."""
    return bisect_ln(lambda u: cm_zdiff(u, g, er) - zd, 0.1, 10.0)


def sc_solve_s(zd, x, er):
    return bisect_ln(lambda y: 2.0 * sc_z0o(x, y, er) - zd, 0.001, 30.0)


def sc_solve_w(zd, y, er):
    return bisect_ln(lambda x: 2.0 * sc_z0o(x, y, er) - zd, 0.05, 1e6)


# ---- case tables (mirrored by name in src/core/calculators/diff-*/calc.test.ts) ----
# coupled microstrip: (w um, s um, h um, er)
DM_CASES = [
    (200, 200, 200, 4.5),     # u = 1, g = 1: the hand-checkable case (ln u = 0 removes the messy terms)
    (150, 100, 200, 4.5), (100, 50, 100, 3.66), (300, 200, 150, 4.2), (50, 50, 500, 4.2),
    (3000, 300, 300, 4.5), (100, 800, 200, 4.5), (200, 3, 200, 4.2), (150, 150, 150, 1.0),
    (150, 100, 150, 128.0), (635, 300, 635, 9.8), (120, 150, 100, 3.48),
]
# spacing solve: (Zdiff ohm, w um, h um, er); width solve: (Zdiff ohm, s um, h um, er)
DM_SOLVE_S_CASES = [(100, 150, 100, 4.2), (90, 200, 150, 4.5), (110, 120, 100, 3.66), (85, 250, 200, 4.2)]
DM_SOLVE_W_CASES = [(100, 150, 100, 4.2), (90, 200, 150, 4.5), (110, 120, 100, 3.66), (85, 200, 200, 4.2)]
# coupled stripline: (w um, s um, b um, er)
DS_CASES = [
    (500, 636.6197723675814, 1000, 4.0),   # pi s / 2b = 1: the hand-checkable case
    (300, 200, 1000, 4.0), (200, 200, 500, 4.2), (150, 150, 600, 3.66), (500, 400, 1000, 4.5),
    (100, 100, 400, 4.2), (250, 2000, 800, 4.0), (400, 50, 1000, 4.0), (150, 1000, 400, 4.2),
]
DS_SOLVE_S_CASES = [(100, 200, 1000, 4.0), (90, 150, 600, 4.2), (110, 300, 800, 3.66)]
DS_SOLVE_W_CASES = [(100, 200, 1000, 4.0), (90, 150, 600, 4.2), (110, 300, 800, 3.66)]

DM_IDS = ("S-022", "S-022b", "S-020", "S-013", "S-029", "S-029a")
DS_IDS = ("S-022a", "S-022b", "S-021", "S-013", "S-029", "S-029a")


def _dm_tag(w, s, h, er):
    return "w%sum_s%sum_h%sum_er%s" % (_g(w), _g(s), _g(h), _g(er))


def _ds_tag(w, s, b, er):
    return "w%sum_s%sum_b%sum_er%s" % (_g(w), _g(s), _g(b), _g(er))


def part_b_vectors():
    out = []
    nm = ("H-J coupled-line static model as recorded for S-022 (Steer sec. 5.6; Z0 in Z01e/Z01o = air-filled Z01); Q-1 prefactor; "
          "tests the implementation against the recorded formula, not the paper")
    for w, s, h, er in DM_CASES:
        u, g = w / h, s / h
        t = _dm_tag(w, s, h, er)
        m = cm_modes(u, g, er)
        out.append(("diffmicrostrip_zodd_ohm_" + t, m["z0o"], RTOL, DM_IDS, nm))
        out.append(("diffmicrostrip_zeven_ohm_" + t, m["z0e"], RTOL, DM_IDS, nm))
        out.append(("diffmicrostrip_zdiff_ohm_" + t, 2.0 * m["z0o"], RTOL, DM_IDS, nm + "; Zdiff = 2 Zodd (S-022b)"))
        out.append(("diffmicrostrip_zcommon_ohm_" + t, m["z0e"] / 2.0, RTOL, DM_IDS, nm + "; Zcommon = Zeven/2 (S-022b)"))
        out.append(("diffmicrostrip_eeven_" + t, m["ee_e"], RTOL, DM_IDS, nm))
        out.append(("diffmicrostrip_eodd_" + t, m["ee_o"], RTOL, DM_IDS, nm))
    for zd, w, h, er in DM_SOLVE_S_CASES:
        g = cm_solve_s(zd, w / h, er)
        out.append(("diffmicrostrip_solve_s_um_Zd%sohm_w%sum_h%sum_er%s" % (_g(zd), _g(w), _g(h), _g(er)), g * h, 1e-9, DM_IDS,
                    "edge spacing for a target Zdiff by bisection on the S-022 analysis function, bracket 0.01 <= s/h <= 5"))
    for zd, s, h, er in DM_SOLVE_W_CASES:
        u = cm_solve_w(zd, s / h, er)
        out.append(("diffmicrostrip_solve_w_um_Zd%sohm_s%sum_h%sum_er%s" % (_g(zd), _g(s), _g(h), _g(er)), u * h, 1e-9, DM_IDS,
                    "width for a target Zdiff by bisection on the S-022 analysis function, bracket 0.1 <= w/h <= 10"))
    nc = ("Cohn approximate edge-coupled stripline as recorded for S-022a (Caspers eq. 3.3), 94.15 taken as eta0/4 (Q-1); "
          "tests the implementation against the recorded formula, not the paper")
    for w, s, b, er in DS_CASES:
        x, y = w / b, s / b
        t = _ds_tag(w, s, b, er)
        zo, ze = sc_z0o(x, y, er), sc_z0e(x, y, er)
        out.append(("diffstripline_zodd_ohm_" + t, zo, RTOL, DS_IDS, nc))
        out.append(("diffstripline_zeven_ohm_" + t, ze, RTOL, DS_IDS, nc))
        out.append(("diffstripline_zdiff_ohm_" + t, 2.0 * zo, RTOL, DS_IDS, nc + "; Zdiff = 2 Zodd (S-022b)"))
        out.append(("diffstripline_zcommon_ohm_" + t, ze / 2.0, RTOL, DS_IDS, nc + "; Zcommon = Zeven/2 (S-022b)"))
        out.append(("diffstripline_zinf_ohm_" + t, sc_zinf(x, er), RTOL, DS_IDS, nc + "; weak-coupling limit s -> infinity"))
    for zd, w, b, er in DS_SOLVE_S_CASES:
        y = sc_solve_s(zd, w / b, er)
        out.append(("diffstripline_solve_s_um_Zd%sohm_w%sum_b%sum_er%s" % (_g(zd), _g(w), _g(b), _g(er)), y * b, 1e-9, DS_IDS,
                    "edge spacing for a target Zdiff by bisection, bracket 0.001 <= s/b <= 30"))
    for zd, s, b, er in DS_SOLVE_W_CASES:
        x = sc_solve_w(zd, s / b, er)
        out.append(("diffstripline_solve_w_um_Zd%sohm_s%sum_b%sum_er%s" % (_g(zd), _g(s), _g(b), _g(er)), x * b, 1e-9, DS_IDS,
                    "width for a target Zdiff by bisection, bracket 0.05 <= w/b <= 1e6"))
    return out


def part_b_self_checks():
    """Oracle self-consistency for part B (raises AssertionError). Not a verification of any standard."""
    # u = 1, g = 1: ln u = 0, so phi_o = phi_e - theta/psi and f_o = f_o1 (hand-checkable closed pieces)
    assert abs(cm_psi(1.0) - (1.0 + 1.0 / 1.45 + 1.0 / 3.95)) < 1e-15
    assert abs(cm_phie(1.0, 1.0) - 0.8645 / cm_psi(1.0)) < 1e-15
    assert abs(cm_phio(1.0, 1.0) - (0.8645 - cm_theta(1.0)) / cm_psi(1.0)) < 1e-15
    assert abs(cm_fo(1.0, 1.0, 4.5) - cm_fo1(1.0, 4.5)) < 1e-15
    # weak coupling: Zeven and Zodd approach Z0 as g grows (inside the range where the fit is monotone and ordered)
    for er in (1.0, 2.2, 4.5, 9.8, 128.0):
        for u in (0.1, 0.5, 1.0, 3.0, 10.0):
            z0 = ms_z0(u, er)
            prev = None
            for g in (0.01, 0.03, 0.1, 0.3, 1.0, 2.0, 3.0):
                mm = cm_modes(u, g, er)
                assert mm["z0o"] < z0 < mm["z0e"], (er, u, g)
                assert prev is None or mm["z0o"] > prev, (er, u, g)
                prev = mm["z0o"]
            assert abs(cm_zdiff(u, 5.0, er) - 2.0 * z0) / (2.0 * z0) < 0.03, (er, u)
    # stripline: ordering and the exact limits
    for x in (0.05, 0.35, 0.5, 2.0):
        for y in (0.01, 0.3, 1.0, 5.0):
            assert sc_z0o(x, y, 4.0) < sc_zinf(x, 4.0) < sc_z0e(x, y, 4.0), (x, y)
        assert abs(sc_z0o(x, 40.0, 4.0) - sc_zinf(x, 4.0)) <= 1e-12 * sc_zinf(x, 4.0)
        assert abs(sc_z0e(x, 40.0, 4.0) - sc_zinf(x, 4.0)) <= 1e-12 * sc_zinf(x, 4.0)
    # pi s/(2b) = 1 closed forms (tanh 1 = 0.7615941559557649, coth 1 = 1.3130352854993313)
    z = SC_P / 2.0
    assert abs(sc_z0e(0.5, 2.0 / math.pi, 4.0) - z / (0.5 + math.log(2.0) / math.pi + math.log(1.7615941559557649) / math.pi)) < 1e-12
    assert abs(sc_z0o(0.5, 2.0 / math.pi, 4.0) - z / (0.5 + math.log(2.0) / math.pi + math.log(2.3130352854993313) / math.pi)) < 1e-12


# =====================================================================================================================
# Phase 2 part C: coplanar waveguide (CPW, S-023 conformal map with finite-substrate eps_e) and conductor-backed CPW (CPWG,
# S-023a Ghione-Naldi as transcribed in Qucs 12.10-12.13), written from docs/sources/notes/impedance-models.md only.
# Independent of src/. K by 60-digit decimal AGM; k, k1, k3 are also evaluated in 60-digit decimals, so the oracle is not limited
# by double cancellation. Decision Q-1: 30 pi = eta0/4 and 60 pi = eta0/2 (eta0 = mu0 c). Decision Q-6: conformal-map eps_e is
# the default CPW model (Steer's empirical eps_e fit, the other side of the S-023 CONFLICT, is NOT used).
# No published worked example is internally consistent (Steer 3.8.1 uses w = 500 um while stating 200 um, and its eps_e is the
# other model), so every vector is the recorded formula evaluated here. S-023 stays CONFLICT, S-023a PAYWALLED-USER-MUST-VERIFY.
# =====================================================================================================================
def _dexp(x):
    return x.exp()


def _dsinh(x):
    return (_dexp(x) - _dexp(-x)) / 2


def _dtanh(x):
    e2 = _dexp(2 * x)
    return (e2 - 1) / (e2 + 1)


def _dratio(k):
    """K'(k)/K(k) = M(1, k')/M(1, k) for a Decimal modulus 0 < k < 1 (S-023b)."""
    kp = (1 - k * k).sqrt()
    return _dagm(Decimal(1), kp) / _dagm(Decimal(1), k)


def cpw_k(w, s):
    return Decimal(w) / (Decimal(w) + 2 * Decimal(s))


def cpw_k1(w, s, h):
    a = _PI * Decimal(w) / (4 * Decimal(h))
    b = _PI * (Decimal(w) + 2 * Decimal(s)) / (4 * Decimal(h))
    return _dsinh(a) / _dsinh(b)


def cpw_k3(w, s, h):
    a = _PI * Decimal(w) / (4 * Decimal(h))
    b = _PI * (Decimal(w) + 2 * Decimal(s)) / (4 * Decimal(h))
    return _dtanh(a) / _dtanh(b)


def cpw_model(w, s, h, er):
    """S-023: returns dict(z0, ee, k, k1, rk, rk1). rk = K(k')/K(k), rk1 = K(k1')/K(k1)."""
    k, k1 = cpw_k(w, s), cpw_k1(w, s, h)
    rk, rk1 = _dratio(k), _dratio(k1)
    ee = 1.0 + (er - 1.0) / 2.0 * float(rk / rk1)
    return {"z0": (ETA0 / 4.0) / math.sqrt(ee) * float(rk), "ee": ee, "k": float(k), "k1": float(k1), "rk": float(rk), "rk1": float(rk1)}


def cpwg_model(w, s, h, er):
    """S-023a: returns dict(z0, ee, k, k3, a, b, q). a = K(k)/K(k'), b = K(k3)/K(k3')."""
    k, k3 = cpw_k(w, s), cpw_k3(w, s, h)
    a, b = 1 / _dratio(k), 1 / _dratio(k3)
    q = float(b / (a + b))
    ee = 1.0 + q * (er - 1.0)
    return {"z0": (ETA0 / 2.0) / math.sqrt(ee) / float(a + b), "ee": ee, "k": float(k), "k3": float(k3), "a": float(a), "b": float(b), "q": q}


def cpw_z0(w, s, h, er):
    return cpw_model(w, s, h, er)["z0"]


def cpwg_z0(w, s, h, er):
    return cpwg_model(w, s, h, er)["z0"]


# solves: plain bisection on ln of the unknown ratio. Gap solve over g = s/w in [0.01, 100]; width solve over x = w/s in [0.01, 100].
def cpw_solve_s(z, w, h, er, model=cpw_z0):
    return bisect_ln(lambda g: model(w, g * w, h, er) - z, 0.01, 100.0) * w


def cpw_solve_w(z, s, h, er, model=cpw_z0):
    return bisect_ln(lambda x: model(x * s, s, h, er) - z, 0.01, 100.0) * s


# CPW analysis: (w um, s um, h um, er)
CPW_CASES = [
    (500, 200, 500, 1.0),        # hand-checkable: er = 1 gives eps_e = 1 exactly, Z0 = (eta0/4) K(k')/K(k), k = 5/9
    (500, 200, 500, 12.85), (300, 200, 1600, 4.5), (250, 150, 1000, 4.2), (100, 100, 200, 3.66), (200, 50, 1600, 4.5),
    (1000, 100, 1600, 4.3), (150, 500, 800, 4.2), (500, 200, 100000, 4.5), (500, 200, 20, 4.5), (300, 300, 300, 128.0),
    (100, 10, 1600, 4.5),
]
# CPWG analysis: (w um, s um, h um, er)
CPWG_CASES = [
    (500, 200, 500, 1.0),        # er = 1: eps_e = 1 exactly, Z0 = (eta0/2) / (K(k)/K(k') + K(k3)/K(k3'))
    (500, 200, 500, 12.85), (300, 200, 200, 4.2), (250, 150, 1000, 4.2), (200, 150, 160, 4.35), (150, 100, 100, 3.66),
    (400, 300, 1600, 4.5), (500, 200, 100000, 4.5), (100, 50, 50, 3.48), (1000, 500, 300, 4.5), (300, 300, 300, 128.0),
]
# solves: (Z0 ohm, fixed um, h um, er)
CPW_SOLVE_S_CASES = [(50, 300, 1600, 4.5), (60, 250, 1000, 4.2), (75, 200, 800, 3.66), (40, 500, 1600, 4.5)]
CPW_SOLVE_W_CASES = [(50, 200, 1600, 4.5), (60, 150, 1000, 4.2), (75, 300, 800, 3.66), (40, 150, 1600, 4.5)]
CPWG_SOLVE_S_CASES = [(50, 300, 200, 4.2), (60, 250, 1000, 4.2), (75, 200, 800, 3.66), (40, 400, 1600, 4.5)]
CPWG_SOLVE_W_CASES = [(50, 150, 200, 4.2), (60, 150, 1000, 4.2), (75, 300, 800, 3.66), (40, 200, 1600, 4.5)]

CPW_IDS = ("S-023", "S-023b", "S-013", "S-029", "S-029a")
CPWG_IDS = ("S-023a", "S-023b", "S-013", "S-029", "S-029a")


def _cp_tag(w, s, h, er):
    return "w%sum_s%sum_h%sum_er%s" % (_g(w), _g(s), _g(h), _g(er))


def part_c_vectors():
    out = []
    nc = ("CPW conformal map, finite-substrate eps_e (S-023, CONFLICT: Steer's empirical eps_e is the other model, not used); "
          "eta0/4 prefactor (Q-1); K by 60-digit AGM (S-023b); tests the implementation against the recorded formula, not the paper")
    ng = ("CPWG Ghione-Naldi as transcribed in Qucs 12.10-12.13 (S-023a, PAYWALLED-USER-MUST-VERIFY), k3 with the quarter-width "
          "argument pi W/(4h) (NextPCB form NOT used); eta0/2 prefactor (Q-1); K by 60-digit AGM (S-023b); tests the implementation "
          "against the recorded formula, not the paper")
    for w, s, h, er in CPW_CASES:
        t = _cp_tag(w, s, h, er)
        m = cpw_model(w, s, h, er)
        out.append(("cpw_z0_ohm_" + t, m["z0"], RTOL, CPW_IDS, nc))
        out.append(("cpw_eeff_" + t, m["ee"], RTOL, CPW_IDS, nc))
        out.append(("cpw_k_" + t, m["k"], RTOL, CPW_IDS, nc + "; k = W/(W + 2 s)"))
        out.append(("cpw_k1_" + t, m["k1"], RTOL, CPW_IDS, nc + "; k1 = sinh(pi W/4h)/sinh(pi (W + 2 s)/4h)"))
    for w, s, h, er in CPWG_CASES:
        t = _cp_tag(w, s, h, er)
        m = cpwg_model(w, s, h, er)
        out.append(("cpwg_z0_ohm_" + t, m["z0"], RTOL, CPWG_IDS, ng))
        out.append(("cpwg_eeff_" + t, m["ee"], RTOL, CPWG_IDS, ng))
        out.append(("cpwg_k3_" + t, m["k3"], RTOL, CPWG_IDS, ng + "; k3 = tanh(pi W/4h)/tanh(pi (W + 2 s)/4h)"))
        out.append(("cpwg_q_" + t, m["q"], RTOL, CPWG_IDS, ng + "; filling factor q"))
    for z, w, h, er in CPW_SOLVE_S_CASES:
        out.append(("cpw_solve_s_um_Z%sohm_w%sum_h%sum_er%s" % (_g(z), _g(w), _g(h), _g(er)), cpw_solve_s(z, w, h, er), 1e-9, CPW_IDS,
                    "gap for a target Z0 by bisection on the S-023 analysis function, bracket 0.01 <= s/w <= 100"))
    for z, s, h, er in CPW_SOLVE_W_CASES:
        out.append(("cpw_solve_w_um_Z%sohm_s%sum_h%sum_er%s" % (_g(z), _g(s), _g(h), _g(er)), cpw_solve_w(z, s, h, er), 1e-9, CPW_IDS,
                    "width for a target Z0 by bisection on the S-023 analysis function, bracket 0.01 <= w/s <= 100"))
    for z, w, h, er in CPWG_SOLVE_S_CASES:
        out.append(("cpwg_solve_s_um_Z%sohm_w%sum_h%sum_er%s" % (_g(z), _g(w), _g(h), _g(er)), cpw_solve_s(z, w, h, er, cpwg_z0), 1e-9, CPWG_IDS,
                    "gap for a target Z0 by bisection on the S-023a analysis function, bracket 0.01 <= s/w <= 100"))
    for z, s, h, er in CPWG_SOLVE_W_CASES:
        out.append(("cpwg_solve_w_um_Z%sohm_s%sum_h%sum_er%s" % (_g(z), _g(s), _g(h), _g(er)), cpw_solve_w(z, s, h, er, cpwg_z0), 1e-9, CPWG_IDS,
                    "width for a target Z0 by bisection on the S-023a analysis function, bracket 0.01 <= w/s <= 100"))
    return out


def part_c_self_checks():
    """Oracle self-consistency for part C (raises AssertionError). Not a verification of any standard."""
    # k = 5/9: the note's researcher check gives 0.83334 (hand arithmetic, +2e-5 vs the AGM 0.833315); also the pinned K vectors of part A
    assert abs(float(1 / _dratio(Decimal(5) / Decimal(9))) - 0.83334) < 5e-5
    # er = 1: eps_e = 1 exactly for both models, so Z0 is a pure elliptic ratio
    m = cpw_model(500, 200, 500, 1.0)
    assert m["ee"] == 1.0 and abs(m["z0"] - (ETA0 / 4.0) * m["rk"]) < 1e-12
    g = cpwg_model(500, 200, 500, 1.0)
    assert g["ee"] == 1.0 and abs(g["z0"] - (ETA0 / 2.0) / (g["a"] + g["b"])) < 1e-12
    # h -> infinity: k1 -> k and k3 -> k, so CPWG -> CPW on an infinite substrate: eps_e = (er + 1)/2, same Z0
    for er in (2.2, 4.5, 12.85):
        c, d = cpw_model(500, 200, 1e7, er), cpwg_model(500, 200, 1e7, er)
        assert abs(c["ee"] - (er + 1) / 2) < 1e-6 and abs(d["ee"] - (er + 1) / 2) < 1e-6
        assert abs(c["z0"] - d["z0"]) / c["z0"] < 1e-6
    # inequality from the formulas (k3 > k and k1 < k): CPWG Z0 is below CPW Z0 for the same geometry
    for w, s, h, er in CPW_CASES + CPWG_CASES:
        assert cpwg_z0(w, s, h, er) < cpw_z0(w, s, h, er), (w, s, h, er)
    # monotone in w (down) and s (up) for both models
    for model in (cpw_z0, cpwg_z0):
        prev = None
        for w in (50, 100, 200, 400, 800):
            z = model(w, 150, 400, 4.5)
            assert prev is None or z < prev
            prev = z
        prev = None
        for s in (20, 50, 100, 200, 400, 800):
            z = model(300, s, 400, 4.5)
            assert prev is None or z > prev
            prev = z


# =====================================================================================================================
# Phase 2 core D: tolerance envelope and sensitivity (corner evaluation through the model functions above), approximate loss
# estimate (S-029d, S-029e, S-029f) and the quarter-wave helper (S-029c). Independent of src/. The loss and quarter-wave
# formulas are written here from the equations recorded in docs/sources/notes/impedance-presets-and-data.md:
#   delta = sqrt(rho / (pi f mu0)) (S-013), Rs = rho / delta
#   microstrip alpha_c = Rs / (Z0 w) Np/m (S-029f: wide strip, smooth copper; strip plus ground each about Rs/w)
#   coax R' = Rs/(2 pi) (1/a + 1/b), alpha_c = R'/(2 Z0) (S-029d, S-029f: Ellingson R' = 1/(2 pi a delta sigma) + 1/(2 pi b delta sigma))
#   alpha_d = (omega/c) tan(delta) er (ee - 1) / (2 sqrt(ee) (er - 1)) Np/m (S-029e, Steer eq. 26); er = 1 has no dielectric: 0
#   dB = 20 log10(e) x Np
#   quarter wave: L = c / (4 f sqrt(ee)); f = c / (4 L sqrt(ee)) (S-029c, derived from S-029a)
# None of this verifies a ledger row. The envelope minimum and maximum are taken over the 2^k corners of the tolerance box and the
# nominal point; each case is checked here to be monotone along every tolerated axis, so the corners hold the true extremes.
# =====================================================================================================================
import itertools

RHO_CU = 1.0 / 58e6            # S-004 (IACS), the default conductor resistivity
NP_TO_DB = 20.0 * math.log10(math.e)   # 8.685889638...


def skin_depth_m(f, rho=RHO_CU):
    return math.sqrt(rho / (math.pi * f * MU0))


def surface_resistance_ohm(f, rho=RHO_CU):
    return rho / skin_depth_m(f, rho)


def alpha_d_np_per_m(f, er, ee, tand):
    if er == 1.0:
        return 0.0
    return (2.0 * math.pi * f / C0) * tand * er * (ee - 1.0) / (2.0 * math.sqrt(ee) * (er - 1.0))


def alpha_c_microstrip_np_per_m(f, z0, w_m, rho=RHO_CU):
    return surface_resistance_ohm(f, rho) / (z0 * w_m)


def alpha_c_coax_np_per_m(f, z0, D_m, d_m, rho=RHO_CU):
    rp = surface_resistance_ohm(f, rho) / (2.0 * math.pi) * (1.0 / (d_m / 2.0) + 1.0 / (D_m / 2.0))
    return rp / (2.0 * z0)


def qw_length_m(ee, f):
    return C0 / (4.0 * f * math.sqrt(ee))


def qw_frequency_hz(ee, length_m):
    return C0 / (4.0 * length_m * math.sqrt(ee))


def _delay_ps_mm(ee):
    return delay_ps_per_mm(ee)


# ---- model closures: params in um (er dimensionless) -> dict of the outputs the calculators envelope ----
def _m_microstrip(p):
    u = p["w"] / p["h"]
    return {"z0": ms_z0(u, p["er"]), "eeff": ms_ee(u, p["er"]), "delay": _delay_ps_mm(ms_ee(u, p["er"]))}


def _m_microstrip_thickB(p):
    z, e = ms_thick_B(p["w"] / p["h"], p["t"] / p["h"], p["er"])
    return {"z0": z, "eeff": e, "delay": _delay_ps_mm(e)}


def _m_stripline(p):
    return {"z0": sl_z0(p["w"] / p["b"], p["er"]), "eeff": p["er"], "delay": _delay_ps_mm(p["er"])}


def _m_stripline_cohn(p):
    return {"z0": sl_cohn_wide(p["w"] / p["b"], p["t"] / p["b"], p["er"]), "eeff": p["er"], "delay": _delay_ps_mm(p["er"])}


def _m_coax(p):
    return {"z0": coax_z0(p["D"] / p["d"], p["er"]), "eeff": p["er"], "delay": _delay_ps_mm(p["er"])}


def _m_diffms(p):
    m = cm_modes(p["w"] / p["h"], p["s"] / p["h"], p["er"])
    return {"zdiff": 2.0 * m["z0o"], "zodd": m["z0o"], "zeven": m["z0e"], "eeodd": m["ee_o"], "eeeven": m["ee_e"],
            "delayodd": _delay_ps_mm(m["ee_o"]), "delayeven": _delay_ps_mm(m["ee_e"])}


def _m_diffsl(p):
    x, y = p["w"] / p["b"], p["s"] / p["b"]
    zo, ze = sc_z0o(x, y, p["er"]), sc_z0e(x, y, p["er"])
    return {"zdiff": 2.0 * zo, "zodd": zo, "zeven": ze, "eeff": p["er"], "delay": _delay_ps_mm(p["er"])}


def _m_cpw(p):
    m = cpw_model(p["w"], p["s"], p["h"], p["er"])
    return {"z0": m["z0"], "eeff": m["ee"], "delay": _delay_ps_mm(m["ee"])}


def _m_cpwg(p):
    m = cpwg_model(p["w"], p["s"], p["h"], p["er"])
    return {"z0": m["z0"], "eeff": m["ee"], "delay": _delay_ps_mm(m["ee"])}


# (calc, tag, model, params, {input: (minus, plus)}); tolerances are fractions of the nominal
ENV_CASES = [
    ("microstrip", "A", _m_microstrip, {"w": 300, "h": 150, "er": 4.2}, {"w": (0.1, 0.1), "h": (0.05, 0.05), "er": (0.05, 0.05)}),
    ("microstrip", "B", _m_microstrip, {"w": 600, "h": 635, "er": 4.1}, {"w": (0.2, 0.05), "er": (0.0, 0.1)}),
    ("microstrip", "T", _m_microstrip_thickB, {"w": 3150, "h": 1575, "t": 35, "er": 4.5}, {"w": (0.1, 0.1), "t": (0.1, 0.1), "h": (0.05, 0.05)}),
    ("stripline", "A", _m_stripline, {"w": 200, "b": 1000, "er": 4.0}, {"w": (0.1, 0.1), "b": (0.05, 0.05), "er": (0.05, 0.05)}),
    ("stripline", "T", _m_stripline_cohn, {"w": 500, "b": 1000, "t": 20, "er": 4.0}, {"w": (0.1, 0.1), "t": (0.1, 0.2)}),
    ("coax", "A", _m_coax, {"D": 3.5, "d": 1.0, "er": 2.1}, {"D": (0.02, 0.02), "d": (0.02, 0.02), "er": (0.03, 0.03)}),
    ("diffmicrostrip", "A", _m_diffms, {"w": 150, "s": 100, "h": 200, "er": 4.5}, {"w": (0.1, 0.1), "s": (0.1, 0.1), "h": (0.05, 0.05), "er": (0.05, 0.05)}),
    ("diffmicrostrip", "B", _m_diffms, {"w": 200, "s": 200, "h": 200, "er": 4.5}, {"w": (0.1, 0.0), "s": (0.2, 0.2)}),
    ("diffstripline", "A", _m_diffsl, {"w": 300, "s": 200, "b": 1000, "er": 4.0}, {"w": (0.1, 0.1), "s": (0.1, 0.1), "b": (0.05, 0.05), "er": (0.05, 0.05)}),
    ("cpw", "A", _m_cpw, {"w": 300, "s": 200, "h": 1600, "er": 4.5}, {"w": (0.1, 0.1), "s": (0.1, 0.1), "h": (0.05, 0.05), "er": (0.05, 0.05)}),
    ("cpwg", "A", _m_cpwg, {"w": 300, "s": 200, "h": 200, "er": 4.2}, {"w": (0.1, 0.1), "s": (0.1, 0.1), "h": (0.05, 0.05), "er": (0.05, 0.05)}),
]

ENV_IDS = {
    "microstrip": ("S-020", "S-013", "S-029", "S-029a"), "stripline": ("S-021", "S-013", "S-029", "S-029a"),
    "coax": ("S-024", "S-013", "S-029", "S-029a"), "diffmicrostrip": DM_IDS, "diffstripline": DS_IDS,
    "cpw": CPW_IDS, "cpwg": CPWG_IDS,
}
ENV_IDS_T = {"microstrip": ("S-020", "S-020a", "S-013", "S-029", "S-029a"), "stripline": ("S-021", "S-021a", "S-013", "S-029", "S-029a")}


def env_tag(calc, tag):
    return "%s_%s" % (calc, tag)


def env_extremes(model, params, tols):
    """(min, typ, max) per output over the nominal point and the 2^k corners of the tolerance box."""
    keys = [k for k, (m, p) in tols.items() if m > 0 or p > 0]
    nom = model(params)
    lo, hi = dict(nom), dict(nom)
    for signs in itertools.product((0, 1), repeat=len(keys)):
        q = dict(params)
        for k, sg in zip(keys, signs):
            m, p = tols[k]
            q[k] = params[k] * ((1.0 + p) if sg else (1.0 - m))
        v = model(q)
        for o in v:
            lo[o], hi[o] = min(lo[o], v[o]), max(hi[o], v[o])
    return lo, nom, hi


def env_sensitivity(model, params, key, output, h=1e-6):
    """d ln(output) / d ln(input), central difference in ln space, step 1e-6 (the app uses 1e-4; they agree to about 1e-8)."""
    a, b = dict(params), dict(params)
    a[key] = params[key] * (1.0 + h)
    b[key] = params[key] * (1.0 - h)
    return (math.log(model(a)[output]) - math.log(model(b)[output])) / (math.log(1.0 + h) - math.log(1.0 - h))


ENV_NOTE = ("envelope min/typ/max over the corners of the tolerance box through the oracle's own model function (recorded formula, not the paper); "
            "tolerances are TEST values; delay in ps/mm")
SENS_NOTE = "S = d ln(out)/d ln(in), central difference in ln space, step 1e-6 in the oracle (the app uses 1e-4, relative agreement about 1e-8)"

# loss cases: (calc, tag, params um (coax: mm), f Hz, tan delta, rho or None, length mm)
LOSS_CASES = [
    ("microstrip", "A", {"w": 600, "h": 635, "er": 4.1}, 1e9, 0.02, None, 100.0),
    ("microstrip", "B", {"w": 300, "h": 150, "er": 4.2}, 5e9, 0.004, 1.9e-8, 250.0),
    ("stripline", "A", {"w": 200, "b": 1000, "er": 4.0}, 2.5e9, 0.01, None, 50.0),
    ("coax", "A", {"D": 3.5, "d": 1.0, "er": 2.1}, 1e8, 0.0003, None, 1000.0),
    ("coax", "B", {"D": 4.6, "d": 1.5, "er": 2.25}, 2e9, 0.001, 2.0e-8, 300.0),
    ("diffmicrostrip", "A", {"w": 150, "s": 100, "h": 200, "er": 4.5}, 3e9, 0.015, None, 100.0),
    ("diffstripline", "A", {"w": 300, "s": 200, "b": 1000, "er": 4.0}, 1e9, 0.01, None, 100.0),
    ("cpw", "A", {"w": 300, "s": 200, "h": 1600, "er": 4.5}, 2e9, 0.02, None, 80.0),
    ("cpwg", "A", {"w": 300, "s": 200, "h": 200, "er": 4.2}, 4e9, 0.018, None, 60.0),
]
LOSS_IDS_BASE = ("S-029d", "S-029e", "S-029f", "S-013", "S-004")
QW_EE_F = [(2.967, 5e9), (3.2, 1e9), (4.4, 250e6), (1.0, 2.4e9)]
QW_EE_L = [(2.967, 8.0), (3.2, 30.0), (4.4, 150.0)]       # eps_eff, length mm
SKIN_CASES = [(1e6, None), (1e9, None), (1e10, None), (1e9, 1.9e-8)]
QW_IDS = ("S-029", "S-029a", "S-029c")
SKIN_IDS = ("S-013", "S-004")


def loss_values(calc, params, f, tand, rho):
    """Returns the dB/m values of one loss case. Conductor loss only for microstrip and coax (S-029f)."""
    r = RHO_CU if rho is None else rho
    out = {}
    if calc == "microstrip":
        u = params["w"] / params["h"]
        z0, ee, er = ms_z0(u, params["er"]), ms_ee(u, params["er"]), params["er"]
        out["ad"] = alpha_d_np_per_m(f, er, ee, tand) * NP_TO_DB
        out["ac"] = alpha_c_microstrip_np_per_m(f, z0, params["w"] * 1e-6, r) * NP_TO_DB
    elif calc == "stripline":
        er = params["er"]
        out["ad"] = alpha_d_np_per_m(f, er, er, tand) * NP_TO_DB
    elif calc == "coax":
        er = params["er"]
        z0 = coax_z0(params["D"] / params["d"], er)
        out["ad"] = alpha_d_np_per_m(f, er, er, tand) * NP_TO_DB
        out["ac"] = alpha_c_coax_np_per_m(f, z0, params["D"] * 1e-3, params["d"] * 1e-3, r) * NP_TO_DB
    elif calc == "diffmicrostrip":
        m = cm_modes(params["w"] / params["h"], params["s"] / params["h"], params["er"])
        out["ad_odd"] = alpha_d_np_per_m(f, params["er"], m["ee_o"], tand) * NP_TO_DB
        out["ad_even"] = alpha_d_np_per_m(f, params["er"], m["ee_e"], tand) * NP_TO_DB
    elif calc == "diffstripline":
        out["ad"] = alpha_d_np_per_m(f, params["er"], params["er"], tand) * NP_TO_DB
    elif calc == "cpw":
        m = cpw_model(params["w"], params["s"], params["h"], params["er"])
        out["ad"] = alpha_d_np_per_m(f, params["er"], m["ee"], tand) * NP_TO_DB
    elif calc == "cpwg":
        m = cpwg_model(params["w"], params["s"], params["h"], params["er"])
        out["ad"] = alpha_d_np_per_m(f, params["er"], m["ee"], tand) * NP_TO_DB
    return out


def _loss_tag(calc, tag, f, tand):
    return "%s_%s_f%sHz_tand%s" % (calc, tag, _g(f), _g(tand))


def part_d_vectors():
    out = []
    # ---- envelope and sensitivity ----
    for calc, tag, model, params, tols in ENV_CASES:
        ids = ENV_IDS_T[calc] if tag == "T" else ENV_IDS[calc]
        lo, nom, hi = env_extremes(model, params, tols)
        t = env_tag(calc, tag)
        for o in nom:
            out.append(("env_%s_%s_min" % (t, o), lo[o], RTOL, ids, ENV_NOTE))
            out.append(("env_%s_%s_typ" % (t, o), nom[o], RTOL, ids, ENV_NOTE))
            out.append(("env_%s_%s_max" % (t, o), hi[o], RTOL, ids, ENV_NOTE))
        for k in tols:
            for o in nom:
                s = env_sensitivity(model, params, k, o)
                out.append(("sens_%s_%s_to_%s" % (t, o, k), s, 1e-6, ids, SENS_NOTE))
    # ---- skin depth and surface resistance ----
    for f, rho in SKIN_CASES:
        t = "f%sHz_rho%s" % (_g(f), "Cu" if rho is None else _g(rho))
        out.append(("skin_depth_um_" + t, skin_depth_m(f, rho or RHO_CU) * 1e6, RTOL, SKIN_IDS, "delta = sqrt(rho/(pi f mu0)) (S-013); micrometres"))
        out.append(("surface_resistance_mohm_" + t, surface_resistance_ohm(f, rho or RHO_CU) * 1e3, RTOL, SKIN_IDS, "Rs = rho/delta (S-029f); milliohm per square"))
    # ---- loss ----
    lnote = "approximate estimate, lower bound for rough copper, no roughness, no dispersion; dB per metre; formulas recorded in S-029d/e/f"
    for calc, tag, params, f, tand, rho, length_mm in LOSS_CASES:
        v = loss_values(calc, params, f, tand, rho)
        t = _loss_tag(calc, tag, f, tand)
        for k, x in v.items():
            out.append(("loss_%s_%s_dBpm" % (t, k), x, RTOL, LOSS_IDS_BASE, lnote))
        if "ad" in v and "ac" in v:
            out.append(("loss_%s_total_dBpm" % t, v["ad"] + v["ac"], RTOL, LOSS_IDS_BASE, "alpha_d + alpha_c, dB per metre (S-029d)"))
            out.append(("loss_%s_total_dB_len%smm" % (t, _g(length_mm)), (v["ad"] + v["ac"]) * length_mm * 1e-3, RTOL, LOSS_IDS_BASE, "total dB over the length"))
        elif "ad" in v:
            out.append(("loss_%s_ad_dB_len%smm" % (t, _g(length_mm)), v["ad"] * length_mm * 1e-3, RTOL, LOSS_IDS_BASE, "dielectric dB over the length"))
    # ---- quarter wave ----
    for ee, f in QW_EE_F:
        t = "ee%s_f%sHz" % (_g(ee), _g(f))
        out.append(("qw_length_mm_" + t, qw_length_m(ee, f) * 1e3, RTOL, QW_IDS, "L = c/(4 f sqrt(ee)) (S-029c derived from S-029a); millimetres"))
    for f in sorted(set(f for _, f in QW_EE_F)):
        out.append(("qw_freespace_length_mm_f%sHz" % _g(f), C0 / (4.0 * f) * 1e3, RTOL, QW_IDS, "free-space lambda0/4 = c/(4 f), for comparison only, NOT a stub or antenna length"))
    for ee, length in QW_EE_L:
        out.append(("qw_freq_GHz_ee%s_L%smm" % (_g(ee), _g(length)), qw_frequency_hz(ee, length * 1e-3) / 1e9, RTOL, QW_IDS, "f = c/(4 L sqrt(ee)) (S-029c); GHz"))
    return out


def part_d_self_checks():
    """Oracle self-consistency for part D (raises AssertionError). Not a verification of any standard."""
    # every envelope case is monotone along each tolerated axis (so the corners hold the extremes), 9 points per axis
    for calc, tag, model, params, tols in ENV_CASES:
        for k, (m, p) in tols.items():
            if m == 0 and p == 0:
                continue
            xs = [params[k] * (1.0 - m + (m + p) * i / 8.0) for i in range(9)]
            vals = []
            for x in xs:
                q = dict(params)
                q[k] = x
                vals.append(model(q))
            for o in vals[0]:
                seq = [v[o] for v in vals]
                up = all(b >= a - 1e-12 * abs(a) for a, b in zip(seq, seq[1:]))
                dn = all(b <= a + 1e-12 * abs(a) for a, b in zip(seq, seq[1:]))
                assert up or dn, (calc, tag, k, o, seq)
    # coax closed form: S = 1/ln(D/d) for D, -1/ln(D/d) for d, -1/2 for er
    p = {"D": 3.5, "d": 1.0, "er": 2.1}
    s = 1.0 / math.log(3.5)
    assert abs(env_sensitivity(_m_coax, p, "D", "z0") - s) < 1e-9
    assert abs(env_sensitivity(_m_coax, p, "d", "z0") + s) < 1e-9
    assert abs(env_sensitivity(_m_coax, p, "er", "z0") + 0.5) < 1e-9
    # copper at 1 GHz: delta 2.08981 um and Rs 8.2502 mohm (researcher figures in S-029f)
    assert abs(skin_depth_m(1e9) * 1e6 - 2.08981) < 5e-5
    assert abs(surface_resistance_ohm(1e9) * 1e3 - 8.2502) < 5e-4
    # researcher example of S-029e: er 4.1, ee 2.9671, tan delta 0.02, 1 GHz -> 0.31655 Np/m = 2.7495 dB/m
    a = alpha_d_np_per_m(1e9, 4.1, 2.9671, 0.02)
    assert abs(a - 0.31655) < 5e-5 and abs(a * NP_TO_DB - 2.7495) < 5e-4
    # homogeneous limit: alpha_d = pi f sqrt(er) tan delta / c
    assert abs(alpha_d_np_per_m(1e9, 4.0, 4.0, 0.01) - math.pi * 1e9 * 2.0 * 0.01 / C0) < 1e-12
    # quarter wave, free space at 1 GHz: 74.948 mm
    assert abs(qw_length_m(1.0, 1e9) * 1e3 - 74.9481145) < 1e-6


if __name__ == "__main__":
    self_checks()
    part_b_self_checks()
    part_c_self_checks()
    part_d_self_checks()
    for name, got, tol, ids, note in vectors():
        print("%-70s %.17g" % (name, got))
