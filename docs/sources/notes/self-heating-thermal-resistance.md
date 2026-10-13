# Self-heating: thermal resistance, pulse RMS, coupled fixed point (ledger S-019d, S-019e, S-019f, S-019g)

Research pass 2026-10-13 (standards-researcher). All sources retrieved 2026-10-13. PDFs marked "read in full" were downloaded and every page was read (text layer and page images). Sources marked "summarizing fetcher" were read through an HTML-to-text summarizer, so their quotes are less reliable and are used only as support, never as the deciding source.

No standard is involved. JEDEC JESD51 (thermal test methods) is cited by onsemi but was not read; IEC/JEDEC definitions were not freely readable and are not used here.

## Scope and split

The old S-019d row bundled four claims. They have different evidence, so the row is split:

| Row | Claim | Status | Why |
|---|---|---|---|
| S-019d | Steady-state lumped thermal resistance: theta = (T_hot - T_ref) / P, so dT = theta x P; series thermal resistances add | VERIFIED | Two independent manufacturers (onsemi, Burr-Brown/TI) print it; MIT course notes support it |
| S-019e | Rectangular pulse 0 to I_pk at duty D: I_rms = I_pk x sqrt(D); average power in a constant R is D x I_pk^2 x R = I_rms^2 x R | VERIFIED | Erickson prints rms = I_pk sqrt(D); onsemi prints average power = d x P_p; MIT 6.622 and ADI AD736 print the rms-equals-equal-heating definition |
| S-019f | Validity: the temperature follows the average power only when the pulse period is much shorter than the thermal time constant; the peak rise is higher | UNVERIFIED | Only one source read in full (onsemi AND8220). The condition is stated there as a formula, not as the sentence used in the code |
| S-019g | Coupled fixed point dT = theta x I^2 x R20 x (1 + alpha (T_amb + dT - 20)); closed form dT = theta I^2 R(T_amb) / (1 - theta I^2 R20 alpha); runaway when theta I^2 R20 alpha >= 1 | UNVERIFIED (DERIVED) | No source states this equation for a conductor. It is algebra from S-019d, S-019 (P = I^2 R) and S-004 (linear R(T)). The loop-gain runaway criterion itself is stated in the bolometer literature (two independent groups), in small-signal form |

## Sources read

| Tag | Source | Tier | How read |
|---|---|---|---|
| ON | onsemi, "How To Use Thermal Data Found in Data Sheets", AND8220/D, Rev. 1, August 2022 (© 2006), Packaging Technology Development. https://onsemi.com/pub/Collateral/AND8220-D.PDF | manufacturer application note | PDF read in full (20 pages) |
| BB | H. Biagi, Burr-Brown Application Bulletin AB-038, "Heat Sinking — TO-3 Thermal Model", August 1992; TI literature number SBOA021. https://ti.com/lit/pdf/SBOA021 | manufacturer application note | PDF read in full (2 pages) |
| MIT-U | E. M. Greitzer, Z. S. Spakovszky, I. A. Waitz, MIT 16.Unified "Thermodynamics and Propulsion" notes, §16.4 "Thermal Resistance Circuits". https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/node118.html (authors from https://web.mit.edu/16.unified/www/FALL/thermodynamics/notes/notes.html) | university course notes | summarizing fetcher (two fetches) |
| ER | R. W. Erickson, "Appendix 1: RMS Values of Commonly-Observed Converter Waveforms", draft "version 1/5/98 10:46 AM" (PDF metadata author "Erickson"); the published version is Appendix A of Erickson and Maksimović, *Fundamentals of Power Electronics*. Copy retrieved from https://u.dianyuan.com/bbs/u/39/1141871556.pdf | textbook appendix (draft) | PDF read in full (5 pages) |
| MIT-PE | D. Perreault, MIT 6.622 Power Electronics, Spring 2023, Lecture 4 "Power Factor" (scribed notes), MIT OpenCourseWare. https://live.ocw.mit.edu/courses/6-622-power-electronics-spring-2023/mit6_622_s23_lec04.pdf | university course notes | PDF read in full (5 pages) |
| ADI | Analog Devices, AD736 data sheet, Rev. I (12/12). Copy retrieved from https://www.logosfoundation.org/elektron/US_SPL_Meter/AD736.pdf (the analog.com copy timed out) | manufacturer data sheet | PDF read in full (20 pages) |
| GM | M. Galeazzi, D. McCammon, "A Microcalorimeter and Bolometer Model", arXiv:astro-ph/0304397v1, 22 Apr 2003. https://arxiv.org/pdf/astro-ph/0304397 | research paper (preprint; journal version not checked) | PDF read in full (20 pages) |
| DG | W. Deng et al., "Silicon avalanche transition edge bolometer: approaching the thermodynamic limit for uncooled long-wave infrared detection", arXiv:2609.17821v1, 15 Sep 2026. https://arxiv.org/html/2609.17821v1 | research preprint | summarizing fetcher (HTML), quotes only |
| WP | Wikipedia "Root mean square", table "In common waveforms", pulse wave row (no citation on the table). https://en.wikipedia.org/wiki/Root_mean_square | tertiary, never sufficient alone | summarizing fetcher |

Provenance caveats. ER is a 1998 draft hosted on a third-party forum, not the publisher's copy. Its title, wording and equation set match the appendix that a University of Tennessee course page (https://web.eecs.utk.edu/~dcostine/ECE482/materials/AppendixA.pdf, not retrievable: TLS certificate error) also hosts, but the published edition was not read and its equation number may differ (a search summary called it A.4 or A.5; not checked). ADI is a third-party mirror of the ADI data sheet; the analog.com URL timed out twice.

Not read / not evidence: Mastering Electronics Design "how to derive the rms value of pulse and square waveforms" (A. S. Nastase): the formula is an image the fetcher could not read. element14 community blog on PWM rms: timed out twice. MathWorks "RMS Value of Periodic Waveforms": only a numeric example (duty 1/4, "thrms = sqrt(1/4)"), no general formula. EE Power / Monolithic Power "Understanding the Theory Behind Transient Thermal Impedance": 403 / page error. Dynex AN4506: 404. RF Essentials knowledge-base pages: search snippets only.

## S-019d: thermal resistance (VERIFIED)

Verbatim:

- ON p. 2, eq. 1: "θJA = (TJ − TA) / Pd" (typeset as a fraction); definitions list: theta-JA "overall thermal resistance of device plus external system".
- ON p. 3, eq. 3: "TJ = θJA · Pd + TA".
- ON p. 2, "Steady State Data": steady state means power "has been constant for a long enough period of time that temperature changes are no longer occurring".
- ON p. 2: theta values "are true 'thermal resistances'"; "Typical units would be °C/W".
- ON p. 2 (condition): "the total power dissipated by the device flows between the two 'points'"; "there are no extraneous, parallel thermal paths".
- ON p. 4: the series sum "Ψ_Jx + Ψ_xA = ... = θJA" (eq. 7), and the example "theta−JA) is 0.6°C/W (0.4 for the device, plus 0.2 for the heatsink)".
- BB p. 1: "TJ = TA + PD • θJA" and "θJA = θJC + θCH + θHA".
- BB p. 1: "Each component of thermal resistance produces a temperature rise equal to the product of power dissipated and thermal resistance."
- BB p. 1 (caveat): "Thermal resistances can vary significantly with particular models and mounting."
- MIT-U §16.4 (summarizing fetcher): heat flow Q̇ = (T1 − T2)/R with R = L/(kA); "The resistances are in series and sum to" R = R1 + R2.

Two independent manufacturers (ON, BB) state dT = theta x P and series addition; MIT-U states the same relation in heat-transfer form. That meets the ledger's VERIFIED rule for the definition only.

What this does NOT verify:
- Any value of theta for a PCB trace. Theta stays a user input (law 'user-theta') or the legacy-calibrated value (S-001, PAYWALLED).
- That theta is constant. ON p. 3 lists airflow, neighbouring heat sources, copper thickness, area and layout as changing theta-JA, and calls datasheet theta-JA values "of limited use in a real application environment". A trace's theta also changes with temperature (convection and radiation are not linear). The calculator's constant-theta assumption is a model choice, not a sourced fact.
- ON's strict definition requires that all the heat flows between the two named points. For a trace, theta to ambient is a system value (like theta-JA), not a property of the trace.

## S-019e: rectangular pulse rms and average power (VERIFIED)

Verbatim:

- ER p. 2, "Pulsating waveform, Fig. A1.5": "rms = I_pk √D" (A1-5). Fig. A1.5 shows i(t) = I_pk from 0 to D·Ts and 0 from D·Ts to Ts. Also (A1-11) "rms = √(D1 I1² + D2 I2² + ...)".
- ON p. 11: "note also that the average power will be d*Pp, the duty cycle times the peak power".
- MIT-PE p. 1: "<P> = (1/T) ∫ I(t)² R dt = I²_RMS R" and "The RMS is the DC (current or voltage) that gives the same average power dissipation in a resistor as the time-varying waveform."
- ADI p. 10: "an ac signal of 1 V rms produces the same amount of heat in a resistor as a 1 V dc signal."
- WP (tertiary): pulse wave RMS "A1 √D".

ER and ON are independent authors. ER prints I_rms = I_pk √D. ON prints P_avg = d x P_pk; with P_pk = I_pk² R and R constant, this is the same statement (I_rms² R = D I_pk² R). MIT-PE and ADI give the definition that links them.

Conditions (from the sources' figures and definitions, stated here so the code labels them):
- The pulse is unipolar, 0 to I_pk, flat-topped (ER Fig. A1.5). A bipolar square wave ±I_pk has rms = I_pk (ER A1-3), not I_pk √D.
- R is constant over the cycle. In the calculator R depends on temperature; using one R per cycle is consistent with S-019f's assumption that the temperature ripple is small.
- D = on-time / period (ON: "the duty cycle, d, will be the ratio of t/p").

## S-019f: validity condition for using the average power (UNVERIFIED)

Verbatim (ON only):

- ON p. 10, Figure 6: "ΔTpeak = Pp · R(t,d)".
- ON p. 11, eq. 22: "R(t, d) = (1−d) · R(t) + d·R(∞)", where R(t) is the single-pulse transient thermal impedance at the on-time t and R(∞) is the steady-state value (theta).
- ON p. 11: "to calculate peak temperature rise, one must use the peak power for the pulse, not the average power."
- ON p. 11, footnote 3: "Think peak power for peak temperature".
- ON p. 17: eq. 24 gives the exact peak for an RC (Foster) model; eq. 22 is called "the more approximate formula".

Researcher reading (derived, not quoted): from eq. 22, ΔT_peak = d·P_pk·θ + (1 − d)·P_pk·Z(t_on). The first term is the average power times theta (what the calculator reports when the period is "much shorter"). The second term is the extra peak rise; it is small only when Z(t_on), the transient impedance over one on-time, is much smaller than d·θ. That happens when the on-time (and so the period) is short compared with the thermal time constants. This supports the code's condition in spirit, but:

1. Only one source (ON) was read in full. The sentence "valid when the period is much shorter than the thermal time constant" is not printed by any source read here. Status stays UNVERIFIED.
2. Even when the condition holds, the average-power result is the cycle-mean temperature rise, not the peak. ON is explicit that the peak needs the peak power. The UI should label the pulsed result "mean temperature rise (period much shorter than the thermal time constant)" and say that the peak is higher by up to (1 − D)·P_pk·Z(t_on), which the calculator does not compute because it has no transient thermal impedance for a trace.
3. "Much shorter" has no number in any source read. Any threshold the code uses is a product choice.

Candidates for a second source (not read): ON AND8219/D (cited by ON for the duty-cycle curves), Infineon or Vishay transient thermal impedance notes, and a heat-transfer textbook treatment of periodic heating of a lumped body.

## S-019g: coupled fixed point, closed form and runaway (UNVERIFIED, DERIVED)

The algebra (researcher, checked by hand):

dT = theta x P, P = I² R(T), R(T) = R20 (1 + alpha (T − 20 °C)), T = T_amb + dT.
So dT = theta I² R20 (1 + alpha (T_amb − 20)) + theta I² R20 alpha dT = theta I² R(T_amb) + k dT, with k = theta I² R20 alpha.
Hence dT (1 − k) = theta I² R(T_amb), so dT = theta I² R(T_amb) / (1 − k), a positive finite solution only for k < 1 (given R(T_amb) > 0). For k ≥ 1 there is no steady state under these assumptions.

No source read states this equation for a conductor. It is algebra from S-019d (VERIFIED), S-019 (P = I² R, VERIFIED) and S-004 (linear R(T), VERIFIED). It is therefore recorded as DERIVED and stays UNVERIFIED, as instructed.

Supporting literature for the runaway criterion (not for the closed form):

- GM p. 2, eq. 3: equilibrium "∫ G(T′)dT′ = P(T)" (from T_S to T), and "the power P depends on the value of the sensor resistance"; "In general, the system must be solved numerically." With G constant (G = 1/theta) eq. 3 reduces to dT = theta x P(T), the calculator's fixed point.
- GM p. 3, eq. 9: "∆P = −(P/T)·((R − R_L)/(R_L + R))·α∆T", with "α ≡ (T/R)(dR/dT)" (eq. 1), and "near current bias (R_L ≫ R)".
- GM p. 4: "G_eff = G + G_ETF"; "For positive feedback G_ETF is negative ... and, in the case of |G_ETF| bigger than G, the detector becomes unstable."
- DG (summarizing fetcher), Fig. 1 caption: "Thermal runaway ... occurs when V_b exceeds certain threshold" "so that the ETF loop gain ℒ = P_J·TCR/G_th is larger than 1"; TCR "= R_dc^-1 · ∂R_dc/∂T".

Researcher specialization (derived): under current bias (R_L ≫ R, a forced current I), GM's eq. 9 gives ∆P = P·(1/R)(dR/dT)·∆T, so G_ETF = −P·TCR. With P = I² R(T) and dR/dT = R20·alpha (S-004 linear law), P·TCR = I² R20 alpha, independent of T. Instability when P·TCR ≥ G = 1/theta, i.e. theta I² R20 alpha ≥ 1, which is the code's runaway condition. GM and DG are independent groups and both state the loop-gain-equals-one boundary; neither states the conductor-specific form, and DG's case is voltage bias (where a positive TCR is stabilizing, the opposite sign). GM's result is a small-signal linearization; for the linear R(T) and constant theta used here the closed form above is exact, so the two agree.

Caveats for the UI:
- The "runaway" is a property of the model (constant theta, linear R(T) with no upper limit), not a prediction that the trace will melt at exactly that current. Real theta falls as the temperature rises (convection, radiation), and copper's alpha is not constant over hundreds of kelvin. It is a "no steady state in this model" flag.
- GM defines G = dP/dT (a differential conductance) while ON/BB define theta = dT/P (a chord value). They coincide only for constant theta, which the calculator assumes.

## Conflicts

None between sources on the relations themselves. Sign convention differs between GM/DG voltage bias and the current-forced conductor (explained above); it is not a conflict.

## What the user must still verify

- S-019f: a second independent source for the pulse validity condition (period much shorter than the thermal time constant) and, ideally, a stated numeric threshold. Until then the pulsed result is UNVERIFIED and should be labelled as a mean rise.
- S-019g: optional. A textbook or paper that writes the self-heating fixed point and runaway criterion for a resistor with a positive temperature coefficient under forced current would let it move from DERIVED to sourced.
- ER: optionally confirm I_rms = I_pk √D against the published Erickson and Maksimović Appendix A (the draft copy was read).

## Consequences for the code (for the orchestrator; this researcher did not edit code)

- The self-heating calculator cites only S-019d for the whole thermal model. With S-019d now VERIFIED, its user-theta data status would rise from UNVERIFIED to VERIFIED even though the coupled fixed point (S-019g) and the pulse validity (S-019f) are not verified. The calculator should cite S-019g for every result and S-019e plus S-019f for pulsed results, so the rating stays UNVERIFIED for those parts.
- tools/reference/gen_golden.py reads statuses from LEDGER.md, so `gen_golden.py --check` will report drift for the 29 vectors that list S-019d until they are regenerated.
