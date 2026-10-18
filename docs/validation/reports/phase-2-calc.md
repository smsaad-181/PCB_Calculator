# Phase 2 calculations validation (calc-validator)

Date: 2026-10-18. Branch `phase-2` (head 04f1ff9). Validator: calc-validator (independent; no edits to `src/` or `tests/`).

## Verdict: PASS-WITH-CONDITIONS

There are no BLOCKER or MAJOR numeric defects. Every Phase 2 calculator reproduces the equations recorded in the ledger and notes to 1e-12 relative or better. That holds across 315 random cases, 72 edge/validity/solve cases, 27 envelope and sensitivity configurations, the asymptote-switch boundaries and all 13 orchestrator anchors. Six MINOR findings (F-1 to F-6) must be logged in `docs/validation/OPEN_RISKS.md` as conditions. Agreement with the recorded formulas says nothing about the paywalled primaries. S-020a, S-021a, S-022, S-022a, S-023 and S-023a stay as badged.

## Method (independence protocol)
1. I read SPEC, the research docs, the notes, the ledger rows S-020..S-029f and OPEN_RISKS decisions Q-1..Q-20 and P2-1..P2-35 first.
2. I re-fetched the primary secondary sources myself (WebFetch, 2026-10-18): Steer §3.5 (microstrip, losses), Steer §5.6 (coupled microstrip, all 27 equations), Santavicca et al. arXiv:2111.01006 suppl. (S1-S8), and Qucs tech. doc. §11 (eqs. 11.22-11.25 and 11.79-11.83).
3. I wrote a fresh python3 + math oracle in a scratch folder. It does not use `ref_impedance.py` or `src/`. K(k) is computed by trapezoid quadrature of the periodic integrand plus series asymptotes, a different method from the app's AGM.
4. I then drove the public `compute()` API of the seven calculators and `quarter-wave` through a scratch vitest harness and compared the results.
5. Only after that did I read implementation code: `elliptic.ts`, the `cpw-shared.ts` asymptote branches, `loss-shared.ts`, `delay-shared.ts`, `stackup/derive.ts` and `impedance-presets.ts`.
6. The scratch folders were deleted afterwards.

Prefactors are as decided: Q-1 eta0 = mu0*c, giving eta0/2pi = 59.9585 Ohm, eta0/4 = 94.1826 Ohm and eta0/2 for CPWG.

## Numeric results

### Anchors (orchestrator list), oracle vs app
| Case | Oracle (mine) | App | Rel. err |
|---|---|---|---|
| Microstrip er=1, w/h=1 | 126.423865 | 126.423865 | <1e-15 |
| Steer Ex. 2 (w 600 um, h 635 um, er 4.1): eps_eff / Z0 / Z01 | 2.9670796 / 75.266138 / 129.6475 | same | <1e-15 |
| Same, prefactor 60 (Steer page 75.3) | 75.31824 | n/a (Q-1) | 0.069 % prefactor effect, as stated |
| Wheeler 1977 (Ellingson, a different author and formula) at Ex. 2 | 75.2419 | n/a | H-J vs Wheeler 0.03 % (sanity only) |
| Stripline w/b=0.5, er=4 | 50.043878 | 50.043878 | <1e-15 |
| Coax D/d=e, er=1 | 59.958492 | 59.958492 | <1e-15 |
| Coupled microstrip w=s=h, er=4.5: Zeven / Zodd / Zdiff / eps_ee / eps_eo | 79.939145 / 60.037026 / 120.074052 / 3.456299 / 2.941182 | same | <1e-15 |
| Coupled stripline w/b=0.5, s=0.63662 mm, b=1 mm, er=4: Zeven / Zodd | 52.273194 / 47.684595 | same | <1e-15 |
| CPW W=500, s=200, h=500 um: er=1 / er=12.85 (eps_e 6.239723) | 113.021514 / 45.245821 | same | <5e-12 |
| CPWG same geometry, er=1 | 100.438002 | 100.438002 | <3e-12 |
| Quarter-wave eps_eff 2.967 at 5 GHz | 8.702258 mm | 8.702258 mm | <1e-9 |
| Coax alpha_c, 1 GHz, D/d=e, d=1 mm, rho=1/58e6 | 0.260194 dB/m | 0.260194 dB/m | <1e-12 |
| Microstrip Ex. 2 alpha_d (tan d 0.02) / alpha_c at 1 GHz | 2.749495 / 1.586826 dB/m | same | <1e-12 |
| K(1/sqrt2) | 1.8540746773 | 1.8540746773 | 1e-16 |

### Bulk comparison (seed 20261018, log-uniform geometry)
| Calculator | Cases | Range covered | Worst rel. err |
|---|---|---|---|
| Microstrip zero-t (S-020) | 40 | u 0.01-100, er 1-128 | 1.9e-16 |
| Microstrip H-J thickness A/B (S-020a) | 40 | t/h 0.005-0.2 | 5.0e-16 |
| Stripline (S-021) | 30 | w/b 0.05-5 | 2.2e-16 |
| Stripline cohn-wide (S-021a) | 30 | w/b >= 0.36, t/b < 0.024 | 2.2e-16 |
| Coax (S-024) | 15 | D/d 1.01-50 | 2.9e-16 |
| Coupled microstrip (S-022) | 40 | u 0.1-10, g 0.02-3 | 4.7e-16 |
| Coupled stripline (S-022a) | 30 | w/b 0.35-3, s/b 0.02-3 | 3.6e-16 |
| CPW (S-023) | 40 + 5 extreme | W/h, s/h 0.01-10; gap/h 600; W/h 400 | 5.0e-12 (my quadrature) |
| CPWG (S-023a) | 40 + 5 extreme | as CPW | 2.9e-12 (my quadrature) |

### Elliptic K, K' and asymptote branches (S-023b, P2-17)
- `ellipticK`, `ellipticKPrime` and `ellipticKRatio` agree with my quadrature or series to ≤ 5e-16 for k = 1e-300, 1e-12, 1e-8, 1e-6, 0.1, 0.5, 1/sqrt2, 5/9, 0.9, 0.999, 1-1e-12 and 1-2^-52.
- Two cases had my oracle as the limit: at k = 1e-3 my truncated series is off by 1e-11, and at k = 0.999999 my quadrature is off by 3e-13.
- The CPW small-modulus switch at k1 = 1e-8 (s/h ≈ 11.73 at W = h) is seamless: s/h = 11.6, 11.7, 11.72, 11.73, 11.74, 11.76, 11.9 all agree with the oracle to ≤ 1e-14.
- The CPWG k3' switch (W/h ≈ 24.3 at s = h) is also seamless: W/h = 24.0-24.6 agree to ≤ 2e-16.
- k1 underflow (gap/h = 600) and k3' underflow (W/h = 400) give finite, correct values.
- The note value K'(5/9) = 2.06275 is a rounding error; the correct value is 2.062819 (P2-18 confirmed).

### Solves (round trip through my oracle)
| Solve | App result | Oracle at solved geometry | Rel. err |
|---|---|---|---|
| Microstrip Z0 50, er 4.3, h 1.6 mm | w/h 1.94692744 | 49.99999999 | 2e-10 |
| Microstrip, thickness variant A, Z0 50 | w/h 1.91847053 | 50.0000000 | 2e-10 |
| Stripline Z0 50, er 4 | w/b 0.50082578 | 50.0000002 | 4e-9 (display digits) |
| Coax Z0 50, er 2.1 (solve D, and solve d) | D/d 3.34829327 | 50.0000001 | 1e-9 |
| Coupled microstrip Zdiff 100 (solve s) | g 4.3228 (WEAK_COUPLING_FIT shown) | 99.99999999 | <1e-9 |
| Coupled microstrip Zdiff 100 (solve w) | u 1.85269 | 99.9999999 | <1e-9 |
| Coupled stripline Zdiff 100 (s) / 85 (w) | s/b 0.41575 / w/b 0.50960 | 100.0000001 / 85.0000003 | <4e-9 |
| CPW / CPWG Z0 50 | W 1.7969 mm / 1.28462 mm | 50.0000153 / 50.0000048 | ≤ 3e-7 (from the 5-digit printed width) |

- Unreachable targets are refused with a stated reachable range: microstrip 1, 300 and 1000 Ohm, stripline 200 Ohm, coupled microstrip Zdiff 140 and 170 at w/h 2, and CPWG 50 Ohm at W 1 mm, h 0.2 mm.
- Giving both width and target is refused.

### Validity behaviour
| Input | Behaviour | Assessment |
|---|---|---|
| u = 0.005 or 150 (microstrip) | Result shown, OUT_OF_RANGE, failed check, confidence low | OK (confidence lowered) |
| u = 1500 | Refused (beyond the u < 1000 Z01 statement) | OK |
| er = 0.5 | Refused | OK |
| er = 200 | Shown, low | OK |
| w = 0, h < 0, NaN, Infinity, width given as a time | Refused | OK |
| Microstrip t given, model none | ZERO_THICKNESS_MODEL, confidence unchanged | OK |
| Stripline w/b < 0.05 | Low, check failed | OK |
| cohn-wide with t/b = 0.03 | Low | OK |
| cohn-wide with w/b < 0.35 | Refused | OK |
| cohn-wide with t ≥ b | Refused | OK |
| Coax D ≤ d | Refused | OK |
| Coupled microstrip g = 0.005 | Low | OK |
| Coupled microstrip g > 3 | WEAK_COUPLING_FIT | OK |
| Coupled microstrip u outside 0.1-10 | Low | OK |
| Coupled stripline w/b < 0.05 | Low | OK |
| Coupled stripline w/b < 0.35 | NARROW_STRIP_FORM caution | OK |
| Coupled pairs or CPW given t | FINITE_THICKNESS_NOT_MODELLED | OK |
| CPW h < 2·max(W, s) | Low | OK |
| H-J thickness variant with t = 2h or t = 2w | Accepted, no range check | **F-3** |

### H-J coupled fit at large s/h (P2-9)
- I scanned u ∈ {0.1, 0.3, 1, 3, 10} × er ∈ {2, 4.5, 10}. In g, Zodd first decreases at g ≥ 8.4 and Zeven first increases at g ≥ 10.2.
- Zdiff/2Z0 crosses 1 at g ≈ 7.5-10, for example u = 1, er = 4.5: 0.9867 at g = 5 and 1.0018 at g = 15.
- So the WEAK_COUPLING_FIT warning at s/h > 3 and the s/h ≤ 5 solve bracket are conservative and appropriate.

### Envelope and sensitivity
- I ran 9 calculators/variants × 3 tolerance sets: ±10 %, asymmetric +5/−15 % and ±1 % on every allowed input.
- Envelope min and max equal my brute-force 2^n corner extremes to 1e-9. No interior extreme exceeded the corners on a 5-point-per-axis grid.
- Every sensitivity matches my central difference (h = 1e-6) to 1e-4. Examples:
  - Coax S(D) = +0.798236 = 1/ln 3.5, S(d) = −0.798236, S(er) = −0.5.
  - Coupled microstrip Zdiff: S(w) −0.5392, S(s) +0.1190, S(h) +0.4203, S(er) −0.4284.
  - CPW: S(W) −0.2796, S(gap) +0.2882, S(h) −0.0087, S(er) −0.4053.
- A fab-profile `tol-sym` width tolerance (±0.02 mm absolute, synthetic entry on the JLCPCB profile, multilayer/outer) gives envelope 46.3817..52.3946 Ohm. That equals the oracle Z0 at w = 0.18 mm and 0.22 mm exactly.
- Other scopes give TOLERANCE_NOT_PUBLISHED with no cross-scope fallback. This is correct.

### Delay, wavelength, skew, quarter-wave, loss
- Delay is held as s/m: Ex. 2 gives 5.745713e-9 s/m = 5.7457 ps/mm. `formatDelayPerLength` uses ×1e9 for ps/mm and ×1e12×0.0254 for ps/in, which is dimensionally correct.
- Delay and skew carry bound `prediction` and round up. The skew for 1 mm mismatch at eps_e 2.9671 is 5.7457 ps.
- λg at 1 GHz (Ex. 2) = 0.174043 m = c/(f√eps_e).
- Quarter-wave:
  - Length mode inverts correctly: 8.7022576 mm gives 5.0000 GHz.
  - eps_eff < 1 is refused.
  - Giving both frequency and length is refused.
  - λ0/4 is shown labelled.
- Loss:
  - Homogeneous lines (stripline er 4) give α_d = π f √er tanδ/c = 3.640856 dB/m, exactly as computed.
  - CPW, CPWG, coupled and coax α_d all match the filling-factor form.
  - Coax α_c uses R' = Rs/(2π)(1/a + 1/b), giving 0.282901 dB/m at D/d 3.5, er 2.1. This matches.
  - The 3δ check fires at 1 MHz for t = 35 µm (δ = 66.1 µm) and for a coax inner radius of 5 µm.
  - Loss without a tanδ source, without a frequency, with tanδ ≥ 1, or with ρ = 1e-5 is refused.
  - Exception: **F-2** (er = 1).

### Confidence, banner and data status
| Case | Confidence | Data status |
|---|---|---|
| Microstrip, stripline (VERIFIED, no loss) | medium, score 2 | — |
| Coax | medium, score 1 | — |
| Thickness variants | low | CONFLICT |
| Coupled pairs | low, score 4 | PAYWALLED |
| CPW | low, score 3 (5 out of range) | CONFLICT |
| CPWG | low, score 3 | PAYWALLED |
| Any calculator with loss | low | UNVERIFIED |
| Quarter-wave | medium, score 1 | UNVERIFIED |

- Nothing reaches high (P2-6).
- The mandatory banner is in `recommendation`, verbatim, on every result of all seven impedance calculators.
- Quarter-wave carries its own stub caveat instead. It is not an impedance result, so this is informational.

### Stackup and presets
- Stackup derive (code read after testing):
  - Microstrip h is the sum of dielectrics to the nearest copper.
  - Stripline b = h_above + t + h_below.
  - Mixed er and off-centre strips are refused.
  - Provenance is always "user-entered, unverified".
- Presets match the ledger:
  - USB 2.0: 90 Ohm VERIFIED (S-026), with both ±15 % and ±10 % offered, labelled CONFLICT, and no default (Q-10).
  - Ethernet: 100 Ω ±10 % (S-026f).
  - LVDS: 100 Ohm nominal, no tolerance invented. The ranges are shown as information.
  - CAN (VERIFIED) and RS-485 (UNVERIFIED) are termination notes, and comparing against them is refused.
  - USB 3.x and the single-source PCIe/HDMI/SATA/SGMII/MIPI/eUSB2 presets are absent (Q-11, Q-14).
- Audit `LEDGER_ID_RE = /(?<![A-Za-z0-9])S-\d{3}[a-z]?/g` no longer matches inside "RS-485" (P2-2).
- `scopedLimits` `traceWidth` and `traceSpace` accept `tol-sym` as a length (5e-6..5e-3 m).

## Cross-check records (policy `docs/sources/crosscheck-tools.md`)
- 53 cases in 7 files: X-01 coax 4, cpw 7, diff 7, microstrip 15, stripline 8; X-02 qucs-cpw 5, qucs-microstrip 7.
- **All `toolOutputs` are null, so every case is "not yet obtained"** (a human-run external dependency). No record looks typed from memory or copied from the app.
- The tolerance reasons are stated before any run and can be derived for microstrip (0.5 %), coax (0.2 %) and stripline (1 %).
- I checked the CPW 2 %/3 % allowance: conformal-map vs Steer-fit eps_e differ by −1.11 %, −2.20 %, −1.35 % and +1.38 % at the four record geometries. All are inside the 3 %.
- The coupled and CPWG records say correctly that they cannot verify S-022, S-022a or S-023a. Their 3 % is an a-priori screen.
- The stripline 1 % misses one term; see **F-4**.

## Source table
| Claim | URL (retrieved 2026-10-18 by me) | Status |
|---|---|---|
| H-J microstrip eqs. 9-14, accuracy 0.2 % / 0.1 %, Ex. 2 (2.967, 129.7, 75.3) | https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/03%3A_Planar_Transmission_Lines/3.05%3A_Microstrip_Transmission_Lines | Re-read; matches note and code. S-020 VERIFIED stands (Steer + Janssen) |
| Steer eq. 26 α_d; eqs. 20-23 conductor loss including the ground term eq. 22 | same | Re-read; eq. 22 is relevant to F-1 |
| Coupled microstrip H-J, eqs. 1-27, "better than 1% for 0.1 ≤ u ≤ 10 and g > 0.01"; Z01e uses the air-filled Z0(u) (Eq. 3.5.13) | https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/05%3A_Coupled_Lines_and_Applications/5.06%3A_Formulas_for_Impedance_of_Coupled_Microstrip_Lines | Re-read; every constant matches the note and code. Answers P2-12 in part (secondary only). S-022 PAYWALLED stands: I found no second source (searched) |
| CPW conformal map (S1-S5); conductor-backed tanh modulus (S6) with s = half-width | https://arxiv.org/html/2111.01006 | Re-read. S6 supports the πW/4h argument convention but is a partial-capacitance model, not Ghione-Naldi (see F-6) |
| Qucs thickness procedure (11.22-11.25), α_c = R/(Z W)·K_r·K_i, K_i = exp(−1.2 (Z/Z_F0)^0.7) | https://qucs.sourceforge.net/tech/node75.html | Tier 4; confirms procedure A as recorded. K_i relevant to F-1 |
| Wheeler 1977 microstrip (independent sanity, not verification) | https://phys.libretexts.org/Bookshelves/Electricity_and_Magnetism/Book%3A_Electromagnetics_I_(Ellingson)/03%3A_Transmission_Lines/3.11%3A_Microstrip_Line (formula as recorded in the note; not re-fetched) | H-J vs Wheeler within 0.0-1.0 % over u 0.1-10, er 2.2-10 |

Ledger honesty audit:
- S-020, S-021, S-022b, S-023b, S-024, S-029, S-029a and S-029d are VERIFIED with two different authors each. For S-020 and S-021 both secondaries transcribe the same primary (H-J and Pozar respectively). That is normal, but it is not two independent derivations.
- CONFLICT and PAYWALLED statuses are correct where code uses the row: S-020a, S-021a, S-022, S-022a, S-023 and S-023a.
- I found no equation in the computing code without a row. The Wheeler synthesis (S-020d) is used only as a solver seed. Coax R' is recorded in the S-029f notes and its second-source cell.

## Defects
| # | Severity | Finding | Reproduction | Expected vs actual | Owner |
|---|---|---|---|---|---|
| F-1 | MINOR | The microstrip conductor-loss warning (CONDUCTOR_LOSS_WIDE_STRIP, `loss-shared.ts`) says Rs/(Z0 w) is "optimistic for narrow traces". Both refinements the researcher recorded point the other way for smooth copper. Qucs eq. 11.82 gives K_i = exp(−1.2(Z/Z_F0)^0.7) < 1: 0.747 at 50 Ohm and 0.678 at 75 Ohm, falling as Z rises (narrower traces). Steer eq. 22 gives the ground term as Rs/w·u/(u+5.8+0.03/u), not Rs/w. The estimate is therefore 1.3-1.75× higher than those forms at typical geometries. It is conservative, but the stated direction of bias is wrong (roughness can still make real loss higher, as the text also says). | w 600 µm, h 635 µm, er 4.1, 1 GHz, ρ 1/58e6 | App α_c 1.5868 dB/m. Qucs-form with K_i (K_r = 1): 1.0758 dB/m. Steer eq. 21-23 structure: 0.9040 dB/m | standards-researcher (S-029f note), calc-implementer (warning text) |
| F-2 | MINOR | er = 1 with tanδ > 0 silently gives α_d = 0 in all seven calculators. This is by design (`loss-shared.ts` treats er = 1 as no dielectric), but it is discontinuous with er just above 1 and with the homogeneous limit. The input is contradictory and should be refused or warned. | Microstrip w = h = 1 mm, 1 GHz, tanδ 0.02 | er = 1 gives 0, but er = 1.000001 gives 1.212 dB/m. Stripline or coax at er = 1 gives 0, but π f tanδ/c gives 1.821 dB/m | calc-implementer |
| F-3 | MINOR | The microstrip H-J thickness variants (A/B) have no range check on t/h or t/w. t = 2h and t = 2w are accepted with only the CONFLICT warning. No range is recorded in the ledger, so do not invent one. A refusal at t ≥ h, or a "thickness outside any recorded use of the correction" caution, is needed. | w = h = 1 mm, t = 2 mm, procedure A | 54.34 Ohm returned without a range flag | calc-implementer / standards-researcher |
| F-4 | MINOR | The cross-check stripline Z0 tolerance (1 %) leaves out the spread between the 0.441 zero-thickness fit (S-021) and the zero-thickness conformal-map form (S-021b, UNVERIFIED). By my numerical evaluation that spread is −1.16 % at w/b = 0.25 (case kicad-sl-er4.5-wb0.25-t0), −1.14 % at 0.35 and +1.34 % at 0.10. The Caspers coupled-stripline form vs the exact Cohn elliptic forms reaches −2.3 % in Zodd at w/b 0.35, s/b 0.1. A miss of about 1.2 % against a tool using an elliptic model is a model difference, not our bug. Also, the app should not suggest better than about 1.5 % for S-021. It currently states that no accuracy is quoted, which is honest. | n/a | n/a | test-engineer (tolerance note); calc-validator at classification |
| F-5 | MINOR | The preset band tag "within/outside the stated ±x % band" (`diff-presets.vm.ts`) compares only the nominal Zdiff of a PAYWALLED model. The envelope and the model's 1 % accuracy are ignored. The core statement carries the UNVERIFIED and disclaimer text, but the short tag can read as a pass. | Any Zdiff within 1 % of a band edge | Expected: the tag says "nominal model value" or shows the envelope against the band | ui-engineer |
| F-6 | MINOR (doc) | The S-023a note and research should record that Santavicca's conductor-backed formulation corroborates only the tanh argument convention. It is not a second source for Ghione-Naldi: the air capacitance keeps K(k)/K(k') with no K(k3) term. The status PAYWALLED is unchanged and correct. | n/a | n/a | standards-researcher |

Informational:
- The note's claim that A and B differ by "about 0.4 %" in Z0 is wrong as recorded. Z0 is identical in both and only eps_e differs, confirmed in Qucs 11.24-11.25. P2-4 already says this.
- The quarter-wave result has no impedance banner but has its own field-solver caveat.

## What I could NOT verify
- The paywalled primaries (P2-1): Hammerstad-Jensen 1980 (S-020, S-020a, S-022 constants and procedure A/B), Cohn 1954/1955 and White 1977 (S-021a, S-022a), Ghione-Naldi 1983 (S-023a), Kirschning-Jansen, IPC-2141A and the interface standards (USB, IEEE 802.3, ISO 11898-2, TIA-485/644). I found no free second source for the H-J coupled-line constants.
- The zero-thickness conformal-map stripline and the exact Cohn coupled forms that I used for F-4 are my own evaluations of forms the ledger records as UNVERIFIED or not read. They are a sanity reference, not a verified source.
- External tool outputs (KiCad, Qucs-S): all null, awaiting a human run.
- The surface-roughness and current-crowding behaviour of real conductor loss: no tier-2 source was read.
- I did not inspect the UI pages in a browser. The scope here was core numbers; UI is with phase-validator and pcb-domain-reviewer.
