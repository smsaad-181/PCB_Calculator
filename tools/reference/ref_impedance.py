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


def pinned_vectors():
    return [(n, got, PINNED[n], tol, ids, note) for n, got, tol, ids, note in vectors() + part_b_vectors()]


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


if __name__ == "__main__":
    self_checks()
    part_b_self_checks()
    for name, got, tol, ids, note in vectors():
        print("%-70s %.17g" % (name, got))
