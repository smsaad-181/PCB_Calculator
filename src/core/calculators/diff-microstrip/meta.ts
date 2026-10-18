import type { AccuracyClass } from '../../confidence';

/**
 * Edge-coupled microstrip pair, Hammerstad-Jensen (1980) coupled-line static model, zero strip thickness (ledger S-022,
 * PAYWALLED-USER-MUST-VERIFY), with Zdiff = 2 Zodd and Zcommon = Zeven/2 (ledger S-022b, VERIFIED).
 * Only one secondary source was read: Steer, Microwave and RF Design II §5.6 eqs. (1)-(27); the 1980 paper was NOT read
 * (paywalled), so every constant below is a transcription that a human must compare with the paper (OPEN_RISKS P2-1).
 * The single-line functions a(u), b(er) and the air-line impedance Z01(u) are the verified S-020 ones, reused from the
 * microstrip calculator. Interpretation recorded in the research note and kept here: the Z0 in Z01e = Z0/(1 - Z0 phi_e/eta0)
 * is the AIR-FILLED single-line impedance Z01(u) (the fetcher's wording was ambiguous).
 *
 * Every numeric coefficient lives in CJ below; calc.ts uses these objects and `formula` is built from them, so the formula shown
 * in the UI and the formula implemented cannot drift apart.
 *
 * Decisions applied (docs/validation/OPEN_RISKS.md, Phase 2 research decisions): Q-1 eta0 = mu0 c exact; Q-3/Q-7 dispersion
 * not modelled and says so; Q-4 symmetric surface pair only (no embedded, no broadside); Q-8 soldermask flagged.
 */

export const CJ = {
  /** phi(u) = phi.c u^phi.e */
  phi: { c: 0.8645, e: 0.172 },
  /** psi(g) = 1 + g/psi.a + g^psi.b/psi.c */
  psi: { a: 1.45, b: 2.09, c: 3.95 },
  /** alpha(g) = alpha.c exp(-g) */
  alpha: { c: 0.5 },
  /** m(g) = m.c0 + [m.k + (m.r/g)^m.rp]^m.pw + (1/m.d) ln[g^m.p/(1 + (g/m.gc)^m.p)] */
  m: { c0: 0.2175, k: 4.113, r: 20.36, rp: 6, pw: -0.251, d: 323, p: 10, gc: 13.8 },
  /** mu(u,g) = g exp(-g) + u (mu.a + g^2)/(mu.b + g^2) */
  mu: { a: 20, b: 10 },
  /** theta(g) = theta.c0 + theta.c1 ln[1 + theta.k/(g + theta.a g^theta.e)] */
  theta: { c0: 1.729, c1: 1.175, k: 0.627, a: 0.327, e: 2.17 },
  /** beta(g) = beta.c0 + (1/beta.d1) ln[g^beta.p/(1 + (g/beta.gc)^beta.p)] + (1/beta.d2) ln[1 + beta.k g^beta.e] */
  beta: { c0: 0.2306, d1: 301.8, p: 10, gc: 3.73, d2: 5.3, k: 0.646, e: 1.175 },
  /** n(g) = {1/n.d + exp[-n.c - n.l ln g - (g/n.g0)^n.p]} ln[(n.k1 + n.k2 g^2)/(1 + n.k3 g^n.e)] */
  n: { d: 17.7, c: 6.424, l: 0.76, g0: 0.23, p: 5, k1: 10, k2: 68.3, k3: 32.5, e: 3.093 },
  /** p(g) = exp(-p.a g^p.e)/cosh(g^p.h) */
  p: { a: 0.745, e: 0.295, h: 0.68 },
  /** r(g,er) = 1 + r.k {1 - exp[1 - (er-1)^2/r.d]/(1 + g^r.ge)} */
  r: { k: 0.15, d: 8.2, ge: -6 },
  /** fo1(g,er) = 1 - exp{-fo1.a g^fo1.e - fo1.b g^r/ln[e + (g/fo1.g0)^fo1.ge]} */
  fo1: { a: 0.179, e: 0.15, b: 0.328, g0: 7, ge: 2.8 },
  /** q(g) = exp(-q.a - g) */
  q: { a: 1.366 },
  /** Fe uses (1 + 10/mu)^(-a b); Fo uses (1 + 10/u)^(-a b): the 10 of S-020 eq. (9). */
  ten: 10,
} as const;

const n = (x: number): string => String(x);

export const meta = {
  id: 'diff-microstrip',
  title: 'Edge-coupled differential microstrip (surface pair)',
  method:
    'Hammerstad-Jensen coupled-line static model for an edge-coupled microstrip pair, zero strip thickness, no dispersion, no soldermask; Zdiff = 2 Zodd (ledger S-022 PAYWALLED-USER-MUST-VERIFY)',
  reference: {
    standard: 'Hammerstad and Jensen, Accurate Models for Microstrip Computer-Aided Design (1980), coupled lines, as given in Steer, Microwave and RF Design II §5.6; Zdiff = 2 Zodd, Zcommon = Zeven/2 per Polar Instruments AP157 and Sonnet help',
    edition: 'H-J 1980 not read (paywalled); one secondary source (Steer §5.6) retrieved 2026-10-18; ledger S-022, S-022b',
    ledgerIds: ['S-022', 'S-022b', 'S-020', 'S-013', 'S-029', 'S-029a'],
  },
  formula:
    `u = w/h, g = s/h; Z0e = Z01e/√εee, Z01e = Z01/(1 − Z01·φe/η0); Z0o = Z01o/√εeo, Z01o = Z01/(1 − Z01·φo/η0); Z01(u) = air-line impedance of S-020; ` +
    `εee = (εr+1)/2 + (εr−1)/2·[1 + ${n(CJ.ten)}/μ]^(−a·b); εeo = (εr+1)/2 + (εr−1)/2·fo·[1 + ${n(CJ.ten)}/u]^(−a·b), a(u) and b(εr) as S-020; ` +
    `φ(u) = ${n(CJ.phi.c)}·u^${n(CJ.phi.e)}; ψ(g) = 1 + g/${n(CJ.psi.a)} + g^${n(CJ.psi.b)}/${n(CJ.psi.c)}; α(g) = ${n(CJ.alpha.c)}·exp(−g); ` +
    `m(g) = ${n(CJ.m.c0)} + [${n(CJ.m.k)} + (${n(CJ.m.r)}/g)^${n(CJ.m.rp)}]^${n(CJ.m.pw)} + (1/${n(CJ.m.d)})·ln[g^${n(CJ.m.p)}/(1 + (g/${n(CJ.m.gc)})^${n(CJ.m.p)})]; ` +
    `μ(u,g) = g·exp(−g) + u·(${n(CJ.mu.a)} + g²)/(${n(CJ.mu.b)} + g²); φe = φ(u)/(ψ(g)·{α(g)·u^m(g) + [1 − α(g)]·u^(−m(g))}); ` +
    `θ(g) = ${n(CJ.theta.c0)} + ${n(CJ.theta.c1)}·ln[1 + ${n(CJ.theta.k)}/(g + ${n(CJ.theta.a)}·g^${n(CJ.theta.e)})]; ` +
    `β(g) = ${n(CJ.beta.c0)} + (1/${n(CJ.beta.d1)})·ln[g^${n(CJ.beta.p)}/(1 + (g/${n(CJ.beta.gc)})^${n(CJ.beta.p)})] + (1/${n(CJ.beta.d2)})·ln(1 + ${n(CJ.beta.k)}·g^${n(CJ.beta.e)}); ` +
    `n(g) = {1/${n(CJ.n.d)} + exp[−${n(CJ.n.c)} − ${n(CJ.n.l)}·ln g − (g/${n(CJ.n.g0)})^${n(CJ.n.p)}]}·ln[(${n(CJ.n.k1)} + ${n(CJ.n.k2)}·g²)/(1 + ${n(CJ.n.k3)}·g^${n(CJ.n.e)})]; ` +
    `φo = φe − (θ(g)/ψ(g))·exp[β(g)·u^n(g)·ln u]; fo = fo1(g,εr)·exp[p(g)·ln u + q(g)·sin(π·ln u/ln 10)]; ` +
    `p(g) = exp(−${n(CJ.p.a)}·g^${n(CJ.p.e)})/cosh(g^${n(CJ.p.h)}); fo1 = 1 − exp{−${n(CJ.fo1.a)}·g^${n(CJ.fo1.e)} − ${n(CJ.fo1.b)}·g^r/ln[e + (g/${n(CJ.fo1.g0)})^${n(CJ.fo1.ge)}]}; ` +
    `r(g,εr) = 1 + ${n(CJ.r.k)}·{1 − exp[1 − (εr−1)²/${n(CJ.r.d)}]/(1 + g^(${n(CJ.r.ge)}))}; q(g) = exp(−${n(CJ.q.a)} − g); ` +
    'Zdiff = 2·Z0o; Zcommon = Z0e/2 (S-022b); η0 = μ0·c (exact SI constants, decision Q-1); delay = √εe/c per mode; λg = λ0/√εe',
  ledgerIds: ['S-022', 'S-022b', 'S-020', 'S-013', 'S-029', 'S-029a', 'S-029b', 'S-029d', 'S-029e', 'S-029f', 'S-004'],
  validity: {
    /** S-022 (Steer): "accurate to better than 1% for 0.1 <= u <= 10 and g > 0.01"; er range inherited from S-020 (1 to 128). */
    uRange: [0.1, 10] as readonly [number, number],
    gMin: 0.01,
    erRange: [1, 128] as readonly [number, number],
    /** Spacing solve bracket 0.01 <= s/h <= 5: Zdiff is monotone increasing there (scan, oracle self-check); beyond about 6 the fit is not monotone. */
    gSolveRange: [0.01, 5] as readonly [number, number],
    /** Above this s/h the fit resolution can exceed the remaining coupling (Zodd < Z0 < Zeven no longer assured): caution only. */
    gWeakCoupling: 3,
  },
  accuracyClass: 'empirical' as AccuracyClass,
  /** Keys of the optional `tolerances` input (core D); none has a default value. */
  toleranceInputs: ['width', 'edgeSpacing', 'height', 'er'] as string[],
} as const;
