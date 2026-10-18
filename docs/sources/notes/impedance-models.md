# Impedance models (S-020 … S-025)

Phase 2 research pass, part A. Retrieved 2026-10-18 (standards-researcher).

## How the sources were read
- **No shell was available.** Nothing was downloaded into a scratch directory by me, and no Python or pdftotext ran. PDFs were fetched with WebFetch. WebFetch saved a copy in the session's tool-results directory, outside the repo. Small PDFs were then opened with the file reader, which renders every page. These are marked **"PDF, read in full"**.
- HTML pages went through a **summarizing fetcher**. I asked it to transcribe the equations exactly, and it did so from LaTeX source where the page had it. These are marked **"fetcher"**. A summarizer can drop or misplace a symbol, so check every equation against the page before golden vectors depend on it.
- **"Search snippet"** means I saw the text only in a search-engine summary. That is never a basis for a status.
- **Not read (paywalled or not retrievable):** Hammerstad & Jensen 1980 (IEEE MTT-S Digest pp. 407-409); Kirschning & Jansen 1982 (Electron. Lett. 18, 272-273); Kirschning & Jansen 1984 (coupled lines); Garg & Bahl 1979; Wheeler 1965/1977/1978; Cohn 1954 and 1955 (IRE Trans. MTT); Bates 1956; Kobayashi 1988 (IEEE T-MTT 36(8) 1246-1250); Ghione & Naldi 1983 (Electron. Lett. 19(18)); Wen 1969; Gevorgian 1995; Wadell; Pozar; Bogatin; Hall; Simons (book); IPC-2141A; IPC-D-317A.
- Also not read:
  - Atwater 1988, "Tests of microstrip dispersion formulas" (IEEE T-MTT 36(3) 619-621, doi:10.1109/22.3561). Caltech hosts it, but the scan was not text-extractable here.
  - DTIC copies of Matthaei/Young/Jones (AD0402852, AD0402930) returned HTTP 403.
  - The Univ. of Houston ECE 5317 notes returned HTTP 404.
- KiCad transcalc (GPL) was not opened. Model names attributed to it below come from search-result snippets of its doxygen pages. They are cross-check pointers only.
- Symbols: u = w/h (microstrip), g = s/h, t = strip thickness, b = ground-plane spacing (stripline), εe = effective permittivity, η0 = μ0·c ≈ 376.730 Ω (with μ0 = 4π × 10⁻⁷), K = complete elliptic integral of the first kind with modulus k (not parameter m = k²).

---

## S-020 Microstrip, Hammerstad-Jensen quasi-static (zero thickness): VERIFIED

Original: E. Hammerstad and Ø. Jensen, "Accurate Models for Microstrip Computer-Aided Design", IEEE MTT-S Int. Microwave Symp. Digest, June 1980, pp. 407-409. I did not read it (paywalled). The citation comes from the Qucs bibliography and the Semantic Scholar/SciSpace records.

Equations (Steer eq. numbers):
```
(9)  εe = (εr+1)/2 + (εr−1)/2 · (1 + 10/u)^(−a·b)
(10) a(u) = 1 + (1/49)·ln[(u⁴ + (u/52)²)/(u⁴ + 0.432)] + (1/18.7)·ln[1 + (u/18.1)³]
(11) b(εr) = 0.564 · [(εr − 0.9)/(εr + 3)]^0.053
(13) Z01 = 60 · ln[ F1/u + sqrt(1 + (2/u)²) ]          (air-filled line)
(14) F1 = 6 + (2π − 6) · exp[ −(30.666/u)^0.7528 ]
(12) Z0 = Z01 / sqrt(εe)
```
- **Source 1:** M. Steer, *Microwave and RF Design II: Transmission Lines* (NC State Univ., LibreTexts), §3.5 "Microstrip Transmission Lines", eqs. (9)-(14). Read via the fetcher, transcribed from LaTeX. https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/03%3A_Planar_Transmission_Lines/3.05%3A_Microstrip_Transmission_Lines
- **Source 2 (independent authors):** L. M. Janssen et al., "Magnetic-Field and Temperature Limits of a Kinetic-Inductance Traveling-Wave Parametric Amplifier", arXiv:2509.15043v2, Appendix D.3. Read via the fetcher, arXiv HTML. https://arxiv.org/html/2509.15043v2
  - It has the same a, b, F_u and εe forms.
  - Its Z0 is written as Z0 = η0/(2π·sqrt(εe)) · ln(F_u/u + sqrt(1 + (2/u)²)) with "η0 = 377 Ω". 377/(2π) = 60.0016, so this is numerically the same as Steer's 60.
  - It evaluates everything at the thickness-corrected u_r (see S-020a).
- Tier-4 pointer: Qucs Technical Documentation §11, eqs. 11.4-11.6 and 11.15-11.18. Its prefactor is Z_F0/(2π) = 59.958 Ω. https://qucs.sourceforge.net/tech/node75.html
- **Prefactor difference.** The prefactor is 60 (Steer), 377/(2π) (Janssen), or η0/(2π) = 59.958 with η0 = 376.730 (Qucs). The resulting Z0 differs by 0.07 %. That is far inside the stated accuracy, but golden vectors must pin one value. This is a human decision (Q-1).
- **Stated accuracy.** Quotes were taken via the fetcher.
  - Steer: εe (eq. 9) is "better than 0.2%" for 0.01 ≤ w/h ≤ 100 and 1 ≤ εr ≤ 128. Z01 (eq. 13) is "better than 0.1%" for w/h < 1000.
  - Qucs page (fetch): the εe model accuracy "is better than 0.2% at least for" (the range is in an image). On impedance: "errors at least less than those caused by physical tolerances".
  - A search-engine summary of the Qucs page claimed 0.01 % (w/h ≤ 1) and 0.03 % (w/h ≤ 1000) for Z01. I did not see this in the fetch, so it is NOT used.
  - **Minor CONFLICT on the Z01 accuracy claim:** 0.1 % (Steer) vs 0.01/0.03 % (unconfirmed). Display the conservative 0.1 %.
- **Validity to enforce:** 0.01 ≤ u ≤ 100 and 1 ≤ εr ≤ 128 for εe. For Z01, u < 1000 (Steer). The model is quasi-static: no frequency dependence (see S-020b, S-020c).
- **Worked example (source output):** Steer §3.5 Example 2.
  - Inputs: w = 600 µm, h = 635 µm, εr = 4.1, t = 0.
  - Page results: εe ≈ 2.967, Z0,air ≈ 129.7 Ω, Z0 ≈ 75.3 Ω.
  - Researcher hand check with prefactor 60: a = 0.991179, b = 0.540674, εe = 2.96710, F1 = 6.0000003, Z01 = 129.737 Ω, Z0 = 75.318 Ω.
  - With η0/(2π) = 59.95849: Z01 = 129.649 Ω, Z0 = 75.267 Ω.
- Simple Pozar-style εe fit, from Steer §3.5 eq. (16): εe ≈ (εr+1)/2 + (εr−1)/2 · 1/sqrt(1 + 12h/w). Steer says its greatest error is 1 %. This is a single read source, so it is NOT recorded as verified. The piecewise Pozar Z0 (60·ln(8h/w + w/4h) and so on) was not read in any accessible source.

## S-020a Microstrip strip-thickness correction: CONFLICT

Hammerstad-Jensen (1980) form, with t normalized to h:
```
Δu1 = (t/π) · ln[ 1 + 4e / ( t · coth²( sqrt(6.517·u) ) ) ]
Δur = ½ · [ 1 + 1/cosh( sqrt(εr − 1) ) ] · Δu1
u1 = u + Δu1 ,  ur = u + Δur
```
- Read in Janssen et al. App. D.3 (fetcher) and in Qucs eqs. 11.22-11.23 (tier 4).
- Qucs as fetched prints "coth²(sqrt(6.517·W))" without /h. That is either a page typo or a fetcher artifact, and must use u = W/h.
- KiCad (search snippet) writes the same correction with tanh in the denominator. That is equivalent.

Wheeler (1977) form. Read in Qucs eqs. 11.19-11.20 only (tier 4, fetcher, one denominator partly garbled):
```
ΔW1/h = (t/π) · ln[ 4e / sqrt( t² + ( (1/π)/(W/t + 1.10) )² ) ]
ΔWr = ½ · ΔW1 · (1 + 1/εr)
```

How the corrected widths are used. The two read sources differ:
- **(A) Full H-J procedure** (Qucs 11.24-11.25): Z0 = Z01(ur)/sqrt(εe(ur)), and εe(t) = εe(ur) · [Z01(u1)/Z01(ur)]².
- **(B) Simplified** (Janssen D.3): εe = εe(ur) and Z0 = Z01(ur)/sqrt(εe(ur)). The [Z01(u1)/Z01(ur)]² factor is absent.

Numeric spread. Researcher arithmetic, approximate, for u = 2, t/h = 0.02222 (35 µm on 1.575 mm), εr = 4.5:
- Δur: H-J 0.02849 vs Wheeler 0.02672. This changes Z0 by about 0.05 %.
- (A) vs (B): εe lower by about 0.9 % in (A), Z0 higher by about 0.4 %.
- The (A)/(B) choice matters more than H-J vs Wheeler.

The original paper was not read: **user must check H-J 1980** for which procedure it specifies. Ellingson (below) mentions only "W′ is W adjusted for t" and gives no formula.

## S-020b Microstrip dispersion, Kirschning-Jansen (1982): PAYWALLED-USER-MUST-VERIFY

Original: M. Kirschning and R. H. Jansen, Electronics Letters 18 (1982) pp. 272-273. The citation is from a search snippet and the Qucs bibliography, and the paper was not read. I found it only in Qucs §11, eqs. 11.26-11.50 (tier 4, fetcher):
```
εe(f) = εr − (εr − εe(0)) / (1 + P(f))
P(f)  = P1·P2·[(0.1844 + P3·P4)·fn]^1.5763
P1 = 0.27488 + [0.6315 + 0.525/(1 + 0.0157·fn)^20]·u − 0.065683·exp(−8.7513·u)
P2 = 0.33622·[1 − exp(−0.03442·εr)]
P3 = 0.0363·exp(−4.6·u)·[1 − exp(−(fn/38.7)^4.97)]
P4 = 1 + 2.751·[1 − exp(−(εr/15.916)^8)]
fn = f·h   in GHz·mm
```
- The Z0(f) part, R1..R17 and Z(fn) = Z(0)·(R13/R14)^R17, was transcribed by the fetcher with one factor (R9) partly cut off. It is NOT recorded here as usable.
- Qucs quote: "is meant to have an accuracy better than 0.6% in the range" (the range is in an image). Exponents "should be restricted to numerical values less or equal 20 in order to prevent overflow".
- Atwater (1988, abstract via the Caltech record, fetcher): of seven dispersion formulas, K-J had the lowest average deviation from measurements (RMS 2.3 % to 4.1 % across formulas). The differences were "of the order of the error limits".
- KiCad microstrip (search snippet) uses K-J. That is a pointer, not a source.
- **User must check:** Electron. Lett. 18 (1982) 272-273 for P1..P4 and the εe(f) form, and the companion Z0(f) paper (Jansen & Kirschning, AEÜ 1983, not found or read) for R1..R17.

## S-020c Microstrip dispersion, Kobayashi (1988): UNVERIFIED

Original: M. Kobayashi, "A Dispersion Formula Satisfying Recent Requirements in Microstrip CAD", IEEE T-MTT 36(8) (1988) 1246-1250. The citation is from scikit-rf docs and Qucs (search snippet), and the paper was not read. Steer §4.3 eqs. (1)-(7), read via the fetcher:
```
εe(f) = εr − (εr − εe(0)) / (1 + (f/f50)^m)                 [Steer writes f_a for f50]
f50   = f_TM0 / (0.75 + (0.75 − 0.332/εr^1.73)·u)
f_TM0 = 47.746e6 / (h·sqrt(εr − εe(0))) · arctan( εr·sqrt((εe(0) − 1)/(εr − εe(0))) )   [h in m, f in Hz]
m  = m0·mc  (m = 2.32 if m0·mc > 2.32)
m0 = 1 + 1/(1 + sqrt(u)) + 0.32·(1 + sqrt(u))^(−3)
mc = 1 + (1.4/(1 + u))·[0.15 − 0.235·exp(−0.45·f/f50)]  for u ≤ 0.7 ;  mc = 1 for u > 0.7
Z0(f) = Z0(0)·sqrt(εe(0))/sqrt(εe(f))          [Steer eq. 7; NOT part of Kobayashi's paper as far as read]
```
- Steer: "The accuracy of the equations is better than 0.6% for 0.1≤w/h≤10, 1≤εr≤128". Steer names no author on the page; the attribution to Kobayashi is mine, by matching the constants with the Qucs eqs. 11.54-11.58 transcription.
- Qucs (tier 4) shows the same structure, but its f50 line is truncated.
- Only one tier-2 source was read, so the status stays UNVERIFIED.
- The Z0(f) relation in Steer eq. 7 is one of several conflicting impedance-dispersion conventions. Qucs lists Getsinger, H-J and K-J variants, which differ.

## S-020d Microstrip, Wheeler-type closed forms (analysis and synthesis): UNVERIFIED

- **Analysis (Wheeler 1977).** From Ellingson, *Electromagnetics Vol. 1* (VT Publishing; LibreTexts §3.11 "Microstrip Line"), read via the fetcher:
  `Z0 ≈ 42.4/sqrt(εr+1) · ln{ 1 + (4h/W′)·[ Φ + sqrt( Φ² + ((1 + 1/εr)/2)·π² ) ] }` with `Φ = ((14 + 8/εr)/11)·(4h/W′)`.
  - W′ is W adjusted for thickness, and W′ ≈ W when t ≪ W, h.
  - Ellingson calls it "widely-accepted and broadly-applicable". No accuracy figure was quoted by the fetcher.
  - Example: FR-4 with h ≈ 1.575 mm and εr ≈ 4.5. "h/W ≈ 1/2 gives Z0 ≈ 50 Ω, so W ≈ 3.15 mm".
  - Researcher hand check: 48.08 Ω at W = 3.15 mm. H-J (S-020) gives 48.23 Ω at the same geometry, a 0.3 % spread.
  - URL: https://phys.libretexts.org/Bookshelves/Electricity_and_Magnetism/Book%3A_Electromagnetics_I_(Ellingson)/03%3A_Transmission_Lines/3.11%3A_Microstrip_Line
- **Synthesis.** From Steer §3.6 eqs. (1)-(6), read via the fetcher. The constants are those of Wheeler's synthesis, but no author name was visible.
  - High impedance, Z0 > (44 − 2εr) Ω:
    - w/h = [exp(H′)/8 − 1/(4·exp(H′))]^(−1)
    - H′ = Z0·sqrt(2(εr+1))/119.9 + ½·((εr−1)/(εr+1))·(ln(π/2) + (1/εr)·ln(4/π))
  - Low impedance:
    - w/h = (2/π)[(d−1) − ln(2d−1)] + ((εr−1)/(π·εr))·[ln(d−1) + 0.293 − 0.517/εr]
    - d = 59.95·π²/(Z0·sqrt(εr))
  - The εe formulas, as transcribed by the fetcher and not checked against the page:
    - Eq. (3): εe = ((εr+1)/2)·[1 + (29.98/Z0)·(2/(εr+1))^(1/2)·((εr−1)/(εr+1))·(ln(π/2) + (1/εr)·ln(4/π))]²
    - Eq. (6): εe = εr / (0.96 + εr·(0.109 − 0.004·εr)·[log(10 + Z0) − 1]). The log base is not stated.
    - Steer says they are accurate to 1 % for 8 < εr < 12 per his ref [24]. Outside that range they lose accuracy, and FR-4 (εr ≈ 4) is outside it.
  - Example 3.6.1: Z0 = 75 Ω, εr = 5.6, h = 500 µm gives H′ = 2.445, w/h = 0.704, εe = 3.82. Steer's text uses the threshold "(44 − εr)" in the example but "(44 − 2εr)" in the formulas. That is an internal page inconsistency.
- The analysis and synthesis come from two different sources and are not the same equation, so the status stays UNVERIFIED.
- Recommended use: an initial guess for the bracketed solver only.

## S-021 Symmetric stripline, zero-thickness closed-form approximation (Pozar 3.179 form): VERIFIED

```
Z0 = (30π/sqrt(εr)) · b / (We + 0.441·b)        [0.441 ≈ 2·ln2/π = 0.44127]
We/b = w/b − (0.35 − w/b)²   for w/b < 0.35 ;   We/b = w/b  for w/b ≥ 0.35
Synthesis:  w/b = x  for sqrt(εr)·Z0 ≤ 120 Ω ;  w/b = 0.85 − sqrt(0.6 − x)  for sqrt(εr)·Z0 > 120 Ω
            x = 30π/(sqrt(εr)·Z0) − 0.441
```
- **Source 1:** Steer §3.7 "Stripline", eqs. (5), (6), (17), (18). Read via the fetcher. https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/03%3A_Planar_Transmission_Lines/3.07%3A_Stripline
- **Source 2:** Ansys Lumerical script `stripline_Z0.lsf` (Ansys Optics knowledge-base attachment 360056053574). Read via the fetcher. https://optics.ansys.com/hc/en-us/article_attachments/360056053574
  - Its comments cite "equation 3.179a" and "3.179b" (Pozar) and state that it "assumes 0 strip thickness".
  - Same analysis formula. Its branch condition is coded as `W/b >= 0`, a bug in the script; the formula text is still the same.
  - It does not contain the synthesis.
- The synthesis rests on Steer only. That is acceptable as a solver seed; final values come from analysis plus a bracketed solve.
- **Accuracy:** neither source quotes one for the zero-thickness form. Pozar's commonly cited "about 1 % of exact" was not read, so none is stated.
- **Worked example:** Steer Example 1 (w = 0.5 mm, b = 1 mm, εr = 5.6, t = 0) is reported by the fetcher as 42.77 Ω. The formula gives 42.32 Ω (researcher arithmetic). **Do not use it as a golden vector** until a human reads the page; the discrepancy may be a page error or a fetcher error.
  - Researcher hand value: w/b = 0.5, εr = 4 gives Z0 = 47.1239/0.94127 = 50.064 Ω with 2·ln2/π. With 0.441 it is 50.079 Ω.

## S-021a Symmetric stripline with finite strip thickness (Cohn 1954/1955 family): CONFLICT

- **Source 1:** Rogers Corp., "Line Widths for Various Characteristic Impedances of Centered Stripline Devices in a Variety of RT/duroid High Frequency Laminates", Publication #92-311, Revised 1641 060223. **PDF, read in full**, 2 pp. https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/electrical-design-data/line-widths-for-various-characteristic-impedance-of-center-stripline-devices-in-rt-duroid-laminates.pdf
  - It cites S. B. Cohn, "Characteristic Impedance of the Shielded-Strip Transmission Line", IRE Trans MTT (July 1954) pp. 52-57; S. B. Cohn, "Problems in Strip Transmission Lines", IRE Trans MTT (March 1955); and J. F. White, "Semiconductor Control" (Artech House, 1977) pp. 521-2.
  - B = 2D + T, A = W/(B−T).
  - Narrow strips (A < 0.35), quoted as printed:
    - Z0 = 60·ln(4B/[πW·Y])/sqrt(εr)
    - Y = (1 + T[1 + ln(4π/X) + 0.51π·X²]/[Wπ])/2
    - X = T/W
    - "The function for Y is according to J.F. White, rather than the chart provided by Cohn. Accuracy is questionable when T/W exceeds 0.11"
  - Wide strips (A ≥ 0.35):
    - Z0 = 94.15/[sqrt(εr)·{CF + W/(B−T)}]
    - CF = [2X·ln(X+1) − (X−1)·ln(X²−1)]/π
    - X = B/(B−T)
  - Rogers states the two branches are discontinuous at A = 0.35. Its tables use "a weighted average" for 0.3 < A < 0.4, and it does not give the weights.
  - Validity: bonded, homogeneous, centered strip only. Clamped assemblies with air voids read lower.
- **Source 2:** Steer §3.7 eqs. (1)-(4), read via the fetcher:
  - Z0 = (30π/sqrt(εr)) · (1 − t/b)/(We/b + Cf)
  - We/b = w/b − (0.35 − w/b)²/(1 + 12t/b) for w/b < 0.35, else w/b
  - Cf = (2/π)·ln[1/(1 − t/b) + 1] − (t/(πb))·ln[1/(1 − t/b)² − 1]
  - Steer: "The accuracy of these formulas is better than 1% for W/(b − t) > 0.05 and t/b < 0.025."
- **Agreement (wide strips):** Steer's Cf/(1 − t/b) equals Rogers' CF algebraically. Researcher check for b = 1, t = 0.02: 0.477587 vs 0.477584. So the wide-strip formulas are the same except for the constant, **30π = 94.248 (Steer) vs 94.15 (Rogers)**, which is 0.10 %.
  - Example: b = 1, t = 0.02, w = 0.5, εr = 4 gives Steer 47.706 Ω and Rogers 47.657 Ω.
- **CONFLICT (narrow strips):** Steer uses an effective-width correction, while Rogers/Cohn uses an equivalent round conductor.
  - Example: b = 1, t = 0.02, w = 0.2, εr = 4 gives Steer 71.06 Ω and Rogers (Y as printed) 71.20 Ω, a 0.2 % spread.
  - The Rogers Y expression places 0.51πX² inside the T/(Wπ) factor. The parenthesization must be confirmed against Cohn/White.
  - A version with 0.51πX² outside gives 70.81 Ω (researcher arithmetic). I did not see that form in any read source, so it is only a flag.
- **User must check:** Cohn 1954 (narrow-strip equivalent diameter and the wide-strip fringing formula) and White 1977 pp. 521-2.

## S-021b Symmetric stripline, exact zero-thickness conformal map: UNVERIFIED

- Z0 = (30π/sqrt(εr)) · K(k′)/K(k), with k = sech(πw/2b) and k′ = tanh(πw/2b).
- This form was seen only in a search snippet of the Univ. of Houston ECE 5317 notes, credited to Bates (1956). The PDF returned 404 when fetched.
- It is NOT read, so it must not be implemented as verified.
- It would be the exact reference against which S-021 is a curve fit.

## Offset (asymmetric) stripline: not found

- Caspers (CERN, below) shows only an offset-stripline figure from Howe, and Steer §3.7 says formulas exist (ref [27]) without giving them.
- No closed form was read. Flag "not supported" or "approximate only", or ask a human.

---

## S-022 Edge-coupled microstrip, Hammerstad-Jensen (1980) coupled-line model: PAYWALLED-USER-MUST-VERIFY

Only one secondary source was read: Steer, *Microwave and RF Design II*, §5.6 "Formulas for Impedance of Coupled Microstrip Lines", eqs. (1)-(27), via the fetcher. https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/05%3A_Coupled_Lines_and_Applications/5.06%3A_Formulas_for_Impedance_of_Coupled_Microstrip_Lines

```
u = w/h, g = s/h ; Z0(u), a(u), b(εr) as S-020 (single-line, air value Z0 = Z01 used in (3),(15))
Z0e = Z01e/sqrt(εee),  Z01e = Z0/(1 − Z0·φe/η0)
φe = φ(u) / ( ψ(g)·{ α(g)·u^m(g) + [1 − α(g)]·u^(−m(g)) } )
εee = (εr+1)/2 + (εr−1)/2 · Fe ,  Fe = [1 + 10/μ(u,g)]^(−a(u)·b(εr))
φ(u) = 0.8645·u^0.172
ψ(g) = 1 + g/1.45 + g^2.09/3.95
α(g) = 0.5·exp(−g)
m(g) = 0.2175 + [4.113 + (20.36/g)^6]^(−0.251) + (1/323)·ln[g^10/(1 + (g/13.8)^10)]
μ(u,g) = g·exp(−g) + u·(20 + g²)/(10 + g²)
Z0o = Z01o/sqrt(εeo),  Z01o = Z0/(1 − Z0·φo/η0)
εeo = (εr+1)/2 + (εr−1)/2 · Fo ,  Fo = fo·(1 + 10/u)^(−a(u)·b(εr))
φo = φe − (θ(g)/ψ(g))·exp[β(g)·u^n(g)·ln(u)]
θ(g) = 1.729 + 1.175·ln(1 + 0.627/(g + 0.327·g^2.17))
β(g) = 0.2306 + (1/301.8)·ln[g^10/(1 + (g/3.73)^10)] + (1/5.3)·ln(1 + 0.646·g^1.175)
n(g) = {1/17.7 + exp[−6.424 − 0.76·ln(g) − (g/0.23)^5]}·ln[(10 + 68.3·g²)/(1 + 32.5·g^3.093)]
fo = fo1(g,εr)·exp[p(g)·ln(u) + q(g)·sin(π·ln(u)/ln(10))]
p(g) = exp(−0.745·g^0.295)/cosh(g^0.68)
fo1 = 1 − exp{ −0.179·g^0.15 − 0.328·g^r(g,εr)/ln[e + (g/7)^2.8] }
r(g,εr) = 1 + 0.15·{1 − exp[1 − (εr−1)²/8.2]/(1 + g^(−6))}
q(g) = exp(−1.366 − g)
```
- Steer: "accurate to better than 1% for 0.1 ≤ u ≤ 10 and g > 0.01". The page's references section was not retrieved.
- Steer eq. (3) needs Z0 to be the **air-filled** single-line impedance Z01(u) from S-020 eq. (13). The page refers to "Eq. (3.5.13)", which is the Z01 equation. The fetcher's statement that this is "the single-line impedance" is ambiguous, so it must be confirmed.
- **Not read:** Kirschning & Jansen 1984 (coupled-line dispersion and the more accurate static model) and Garg & Bahl 1979 (coupled-microstrip closed forms). Their constants could not be compared.
  - The CONFLICT requested between K-J and Garg-Bahl therefore cannot be quantified. The status of both is "not read".
  - KiCad coupled_microstrip (search snippet) cites both H-J and K-J. Pointer only.
- Zero thickness, no dispersion, no soldermask. No source example was found.
- **User must check:** H-J 1980 for every coupled-line constant above, especially m(g), n(g), θ(g), β(g), fo1 and r(g,εr). These are easy to mis-transcribe.

## S-022a Edge-coupled stripline, Cohn (1955) approximate even/odd forms: PAYWALLED-USER-MUST-VERIFY

Source read: F. Caspers, "RF engineering basic concepts: S-parameters", CERN Accelerator School, arXiv:1201.2346, eq. (3.3). **PDF, read in full.** https://arxiv.org/pdf/1201.2346
```
Z0,even = (1/sqrt(εr)) · 94.15 Ω / ( w/b + ln2/π + (1/π)·ln(1 + tanh(πs/2b)) )
Z0,odd  = (1/sqrt(εr)) · 94.15 Ω / ( w/b + ln2/π + (1/π)·ln(1 + coth(πs/2b)) )
```
- Caspers cites H. Howe, *Stripline Circuit Design* (Artech, 1982) as ref [5], and says these are "a good approximation" and the basis of "the Cohn nomographs". No range is stated.
- As s → ∞, the denominators tend to w/b + 2·ln2/π, which is consistent with S-021 (constant 94.15 vs 30π).
- The exact Cohn 1955 elliptic forms (ke = tanh(πw/2b)·tanh(π(w+s)/2b), ko = tanh(πw/2b)·coth(π(w+s)/2b)) were NOT read in any source.
- Only one secondary was read and the primary (Cohn 1955, IRE T-MTT) is paywalled.

## S-022b Differential and common-mode definitions: VERIFIED

- Zdiff = 2·Zodd and Zcommon = Zeven/2.
- **Source 1:** Polar Instruments AP157, "Considering odd and even mode impedance" (undated), read via the fetcher: "Zdiff is twice the value of the odd mode impedance"; "Even mode is twice the common mode value". https://www.polarinstruments.com/support/cits/AP157.html
- **Source 2:** Sonnet Software help, "Using Even and Odd Mode Parameters" (© 2021), read via the fetcher: "Zdiff = 2*Zodd"; "Zcommon = Zeven/2". https://www.sonnetsoftware.com/support/help-18/Sonnet_Suites/UsingEvenandOddModeParameters1.html
- These are exact definitions for a symmetric pair. They make Zdiff exactly as accurate as the Zodd model (S-022 or S-022a), no better.
- A Tektronix note (search snippet only) warns that tools use different definitions. Label the outputs explicitly.

---

## S-023 CPW without a lower ground plane (conformal mapping, finite substrate): CONFLICT

```
k  = W/(W + 2s)          [W = centre-strip width, s = gap]   k′ = sqrt(1 − k²)
Z0 = (30π/sqrt(εe)) · K(k′)/K(k)
εe (finite substrate h, conformal map):  εe = 1 + ((εr − 1)/2) · [K(k1)/K(k1′)] · [K(k′)/K(k)]
k1 = sinh(πW/(4h)) / sinh(π(W + 2s)/(4h))
infinite substrate:  εe = (εr + 1)/2
```
- **Z0 relation and k:**
  - Steer §3.8 "Co-Planar Waveguide", eqs. (2)-(4), via the fetcher. https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/03%3A_Planar_Transmission_Lines/3.08%3A_Co-Planar_Waveguide
  - Santavicca et al., Appl. Phys. Lett. 119, 252601 (2021), arXiv:2111.01006, supplementary eq. (S1): C = 4ε0·εe·K(k)/K(k′) with k = s/(s+g), where s is the strip **half-width**. Read via the fetcher, arXiv HTML. https://arxiv.org/html/2111.01006
  - With L = εe/(C·c²), this gives Z0 = (η0/4)/sqrt(εe) · K(k′)/K(k). η0/4 ≈ 94.2 ≈ 30π, so it matches Steer. That last step is researcher algebra.
- **Finite-substrate εe:** Santavicca eqs. (S2), (S3), (S5), with k1 = sinh(πs/2h1)/sinh(π(s+g)/2h1). That is identical to the k1 above with s = W/2. They use it for a two-layer stack.
  - Qucs §12 eqs. 12.8-12.9 (tier 4) gives the same.
  - Primary (Gevorgian et al. 1995; Wen 1969; Ghione & Naldi) not read.
- **CONFLICT:** Steer gives a different, empirical εe instead of the conformal map, his eq. (1):
  - εe = 0.5(εr + 1)·{tanh[1.785·log(h/s) + 1.75] + (k·s/h)·[0.04 − 0.7k + 0.01(1 − 0.1εr)(0.25 + k)]}
  - The log base is not stated. log10 reproduces his example.
  - Steer: "accurate to 1.5% for h/s ≥ 1". His ref [28] was not visible.
  - So there are two different εe models. Pick one per Q-6.
- Steer validity guidance: substrate thickness "two or three times greater than both the strip width w and the metal separation s". Finite ground width: "very close to those of CPW if w1 ≥ 3w".
- **Thickness correction:** Qucs §12 eqs. 12.14-12.18 (tier 4; 12.18 truncated):
  - Δ = (1.25t/π)(1 + ln(4πW/t)), We = W + Δ, se = s − Δ.
  - Single tier-4 source, so this is NOT usable as verified. Flag "zero thickness assumed".
- **Dispersion:** Qucs §12 eqs. 12.19-12.24 (Frankel and Gevorgian, tier 4, partly truncated), "better than 5%" for 0.1 ≤ W/h ≤ 5, 0.1 ≤ W/s ≤ 5, 1.5 ≤ εr ≤ 50, 0 ≤ f/fTE ≤ 10, with fTE = c/(4h·sqrt(εr − 1)). NOT usable as verified.
  - Use fTE only as a flag threshold: "dispersion not modelled; above roughly fTE/10, verify by field solver" (Q-7).
- **Worked example (source output):** Steer Example 3.8.1.
  - Page: h = 500 µm, s = 200 µm, εr = 12.85, k = 500/900 = 0.556, empirical εe ≈ 6.28, K(k)/K′(k) ≈ 0.833 (Hilberg), Z0 ≈ 45.1 Ω.
  - The page states w = 200 µm but computes with w = 500 µm, an internal inconsistency. Use k = 5/9 directly.
  - Researcher check: Hilberg gives 0.83334. Z0 = 94.2478/sqrt(6.28)/0.83334 = 45.13 Ω.

## S-023a Conductor-backed CPW (CPWG, finite substrate, lower ground): PAYWALLED-USER-MUST-VERIFY

```
k  = W/(W + 2s) ,  k3 = tanh(πW/(4h)) / tanh(π(W + 2s)/(4h))
q  = [K(k3)/K(k3′)] / ( K(k)/K(k′) + K(k3)/K(k3′) )
εe = 1 + q·(εr − 1)
Z0 = (60π/sqrt(εe)) · 1 / ( K(k)/K(k′) + K(k3)/K(k3′) )
```
- Primary: G. Ghione and C. Naldi, "Parameters of coplanar waveguides with lower ground plane", Electronics Letters 19(18), 1983. The title comes from the NextPCB page and the KiCad doxygen snippet; the paper was not read.
- Read only in Qucs §12 eqs. 12.10-12.13 (tier 4, fetcher).
- Also in US Patent 7,202,765 (search snippet only): "k3 = tanh(πa/2h)/tanh(πb/2h)" with a = W/2, b = W/2 + s, which is the same thing.
- **CONFLICT in a tertiary source:** the NextPCB calculator (search snippet) writes k3 = tanh(πw/2h)/tanh(π(w+2s)/2h) with full width w. That is a factor 2 in the argument compared with Qucs, KiCad and the patent. It is probably a page error, or w there means the half-width. Do NOT use NextPCB.
- The model assumes the top coplanar grounds extend far enough and are stitched by vias. No via-fence effect is included.
- **User must check:** Ghione & Naldi 1983, eq. (8) per KiCad's citation.

## S-023b Complete elliptic integral K(k) via the AGM, and K′: VERIFIED

```
AGM:  a0 = 1, g0 = k′ = sqrt(1 − k²);  a_{n+1} = (a_n + g_n)/2,  g_{n+1} = sqrt(a_n·g_n)  → M(1, k′)
K(k)  = π / (2·M(1, k′))          (DLMF 19.8.5, valid for −∞ < k² < 1)
K′(k) = K(k′)                     (DLMF 19.2.9, real 0 < k < 1)
```
- **Source 1:** NIST DLMF §19.8, eqs. 19.8.1 and 19.8.5; §19.2, eq. 19.2.9. Version 1.2.8, release 2026-09-15. Read via the fetcher.
  - "convergence of cn to 0 and of an and gn to M(a0,g0) is quadratic"
  - https://dlmf.nist.gov/19.8 ; https://dlmf.nist.gov/19.2
- **Source 2:** E. W. Weisstein, MathWorld, "Arithmetic-Geometric Mean", eq. (8): agm(a,b) = (a+b)·π / (4·K((a−b)/(a+b))). Also "Complete Elliptic Integral of the First Kind": k′ = sqrt(1−k²) and K′(k) = K(k′) in eq. (15), with the parameter convention m = k². Read via the fetcher.
  - https://mathworld.wolfram.com/Arithmetic-GeometricMean.html ; https://mathworld.wolfram.com/CompleteEllipticIntegraloftheFirstKind.html
- **Equivalence (researcher algebra):** set a = 1, b = k′ and apply the descending Landen transformation K((1−k′)/(1+k′)) = ((1+k′)/2)·K(k). MathWorld eq. (8) then becomes M(1,k′) = π/(2K(k)), which is DLMF 19.8.5. The forms differ but are mathematically identical.
- **Convention trap:** many libraries take m = k². Ours uses the modulus k.
- **Hand check (researcher):** K(1/sqrt 2) = π/(2·0.84721308) = 1.854075. The closed form Γ(1/4)²/(4·sqrt π) = 1.8540747 was not read in a source this pass.
- **Ratio forms for CPW:** K(k′)/K(k) with k′ = sqrt(1 − k²). Compute both K values with the AGM. As k → 1, use M(1, k′) with k′ computed as sqrt((1−k)(1+k)) to avoid cancellation (numerical advice, not sourced).

## S-023c Hilberg-type closed approximation of K/K′: UNVERIFIED

- Steer §3.8 eq. (5), as transcribed by the fetcher (Steer cites ref [30], not visible):
  - K(k)/K′(k) ≈ (1/π)·ln[2(1 + sqrt k)/(1 − sqrt k)] for "0 ≤ k ≤ 0.707"
  - K′(k)/K(k) ≈ (1/π)·ln[2(1 + sqrt k′)/(1 − sqrt k′)] for "0.707 < k ≤ 1"
- Qucs §12 eqs. 12.4-12.5 (tier 4) give:
  - K(k)/K′(k) = π / ln[2(1 + sqrt k′)/(1 − sqrt k′)] for 0 ≤ k ≤ 1/sqrt 2
  - K(k)/K′(k) = (1/π)·ln[2(1 + sqrt k)/(1 − sqrt k)] for 1/sqrt 2 ≤ k ≤ 1
- **CONFLICT on branch ranges:** the formula shapes are the same, but the **ranges are swapped** between the two transcriptions. The Qucs assignment is the conventional one: the sqrt(k) form is the one that diverges correctly as k → 1.
- Steer's example uses the sqrt(k) branch at k = 5/9 and gets 0.833. Close to k = 1/sqrt 2 both branches are accurate, so the example cannot discriminate.
  - Researcher AGM check: K(5/9) = 1.71897, K(k′) = 2.06275, ratio 0.83334.
  - Away from 1/sqrt 2 the swapped assignment is wrong. Researcher arithmetic:
    - k = 0.1: the sqrt(k) form gives 0.4291, the AGM 0.4261 (0.7 % error), and the conventional branch 0.42610.
    - k = 0.01: the sqrt(k) form gives 0.2845, against the AGM (K′ ≈ ln(4/k)) of about 0.2622 (8.5 % error).
- Qucs accuracy claim: "close to" 1e-5 (citing Collin), with 3e-6 claimed by Gupta.
- **Recommendation:** use the AGM (S-023b), not Hilberg. Hilberg is useful only as a cross-check.

---

## S-024 Coaxial line: VERIFIED

```
Z0 = (η0/(2π)) · sqrt(μr/εr) · ln(b/a)  ≈ (60/sqrt(εr)) · ln(D/d)   (μr = 1; b/a = D/d, radii or diameters)
```
- **Source 1:** Steer §2.8 "Two-Conductor Transmission Lines", eq. (1), labelled "Exact". Read via the fetcher. https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_II_-_Transmission_Lines_(Steer)/02%3A_Transmission_Lines/2.08%3A_Two-Conductor_Transmission_Lines
- **Source 2:** A. Ferendeci, Univ. of Cincinnati EE-611 "TEM modes in Coaxial Lines" supplementary notes. **PDF, read in full**, 3 pp. It derives Zc = (1/(2π))·η·ln(b/a) ≈ (60/sqrt εr)·ln(b/a). https://homepages.uc.edu/~ferendam/Courses/EE_611/TEM/Coax.pdf
- **Validity:** TEM, lossless, homogeneous isotropic dielectric, concentric round conductors, frequency below the first higher-order (TE11) mode cutoff.
  - The TE11 cutoff formula was not researched, so it is not stated.
  - 60 is a rounding of η0/(2π) = 59.958 (0.07 %).
- Example:
  - Zhejiang Univ. ECE 329 lecture 39 (search snippet only): εr = 9/4 with b/a ≈ 3.6 gives about 50 Ω.
  - Researcher: 40·ln(3.6) = 51.24 Ω.
  - No read source gave a numeric example. Hand-computable: εr = 1, D/d = e gives 59.958 Ω (η0/2π).

## S-025 IPC-2141 / IPC-D-317 legacy closed forms: PAYWALLED-USER-MUST-VERIFY

```
Microstrip:          Z0 = 87/sqrt(εr + 1.41) · ln( 5.98·H / (0.8·W + T) )      [H = dielectric height]
Symmetric stripline: Z0 = 60/sqrt(εr) · ln( 4·H / (0.67·π·(0.8·W + T)) )      [H = plane-to-plane spacing b, per the example]
```
- Source read: Freescale (NXP) AN2536, "High Speed Layout Design Guidelines", Rev. 2, 04/2006, eqs. 3-6, pp. 3-5. **PDF, read in full.** https://www.nxp.com/docs/en/application-note/AN2536.pdf
- **The note writes "log"**, but its own examples need the natural log.
  - Microstrip: W = 8 mil, H = 5 mil, T = 1.4 mil, εr = 4.1, stated as "≈ 50Ω". Researcher arithmetic: ln gives 49.80 Ω and log10 gives 21.6 Ω.
  - Stripline: W = 9 mil, H = 24 mil, T = 1.4 mil, εr = 4.1, stated as "≈ 50Ω". Researcher arithmetic: ln gives 49.44 Ω.
- **Definition conflict:** AN2536 Figure 1 defines H as "height between trace and reference plane" for both layouts. The stripline example only reaches 50 Ω if H = 24 mil is the full plane-to-plane spacing. Implement with b = plane spacing and label it.
- AN2536 also gives delay for microstrip, TPD = 85·sqrt(0.475εr + 0.67) ps/in, and for stripline, 85·sqrt(εr) ps/in. Legacy, single source.
- AN2536 cites Johnson & Graham, *High-Speed Digital Design* (1993), which was not read. It does not cite IPC.
- **Second source:** Intel AN 958 "Board Design Guidelines", microstrip and stripline impedance pages, seen via search snippets only (the page fetch redirected to 404).
  - It uses the same equations and the same 50 Ω examples, the stripline one being W = 9, H = 24, T = 1.4, εr = 4.1.
  - The Altera Stratix II handbook copy (404) is the same company lineage, so it is not independent.
- IPC-2141A (2004) was not read. A search snippet says it is purchase-only.
- Validity ranges 0.1 < w/h < 2.0 and εr < 15 come from one MCP tool description (tier 5) and are NOT verified. The stripline w/b < 0.35 and t/b < 0.25 limits were not found in any read source.
- **User must check** in IPC-2141A:
  - (a) the printed equations and the meaning of H and b;
  - (b) the stated validity ranges;
  - (c) whether the embedded-microstrip and offset-stripline forms (not researched here) are given.
- Must always be labelled "legacy approximation".

---

## Cross-check tools (pointers only; no code read or copied)

From search-result snippets of KiCad doxygen pages, GPL, not opened:
- KiCad microstrip: Hammerstad-Jensen with thickness correction and Kirschning-Jansen dispersion.
- coupled_microstrip: cites H-J and Kirschning-Jansen.
- coplanar: cites Ghione & Naldi 1983 eq. (8) for the backed k3.
- coupled_stripline: cites Cohn 1955.

Qucs-S transcalc shares this lineage.

None of this is verification (CLAUDE.md rule 14). Agreement with KiCad or Qucs on H-J or K-J is expected and proves nothing about the paper.

## Open items the user must verify
1. H-J 1980: all S-020 and S-022 constants; which thickness procedure (S-020a A or B) the paper specifies; the prefactor (60 vs η0/2π).
2. Kirschning-Jansen 1982 (εe dispersion) and Jansen-Kirschning 1983 (Z0 dispersion): every constant.
3. Cohn 1954: the narrow-strip equivalent-diameter parenthesization (S-021a) and the 94.15 constant.
4. Ghione & Naldi 1983 eq. (8): the CPWG k3 argument convention (S-023a).
5. IPC-2141A: the equations, the H/b definition and the validity ranges (S-025).
6. Steer §3.7 Example 1 (42.77 Ω vs computed 42.32 Ω) and Steer §3.8 Hilberg branch ranges: read the pages in a browser.
