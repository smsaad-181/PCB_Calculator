# Basic circuit relations (ledger S-019, S-019b)

Research pass 2026-10-11 (standards-researcher). All URLs retrieved 2026-10-11 with an HTML-to-text fetcher. PDFs could not be text-extracted. Some typeset equations came through the fetcher's rendering, so check them in a browser before quoting them in the UI.

## Scope

These are definitional and textbook relations. **No standard is involved**: there is no IPC/IEC clause and no edition to check. "VERIFIED" here means that two independent authors print the same relation. It does not mean that a real component behaves this way. Every relation assumes ideal components.

E-series preferred values are a separate row (S-016, PAYWALLED-USER-MUST-VERIFY). This row does not cover them.

## Sources used (independent authors)

| Tag | Source | Tier |
|---|---|---|
| OS | OpenStax, *University Physics Vol. 2* (Ling, Sanny, Moebs; 2016), §9.4, 9.5, 10.2, 10.5, 15.2, 15.5 | open textbook |
| FD | J. M. Fiore, *DC Electrical Circuit Analysis: A Practical Approach* (LibreTexts) | open textbook |
| FO | J. M. Fiore, *Operational Amplifiers and Linear ICs: Theory and Application* (LibreTexts) §1.3, §8.3, §11.6 | open textbook |
| FS | J. M. Fiore, *Semiconductor Devices: Theory and Application* (LibreTexts) §2.5 | open textbook |
| K | T. R. Kuphaldt, *Lessons in Electric Circuits* Vol. I–III (LibreTexts Workforce) | open textbook |
| UMD | T. O'Haver, Univ. of Maryland Chem 498C, loaded voltage divider model page (no author line on the page; inferred from the URL) | university page |
| SN | W. McAllister, spinningnumbers.org, "Voltage divider design" | educational site |
| EDN | W. Rewinkel, EDN Design Idea, 2005-06-05, "Adjust your regulator below 1V without a sub-bandgap reference" | trade press |
| SF | SparkFun, "Series and Parallel Circuits" | vendor tutorial |
| DK | D. Klipstein, "LEDs 101" | blog |
| IMX | imperix TN125, "LLC converter operation with resistive load" | manufacturer note |
| HMC | R. Wang, Harvey Mudd E84 notes, "Steady State Solution and Resonance" | university page |
| WP | Wikipedia "RC circuit", "LC circuit" | tertiary, never sufficient alone |

Fiore's books are by one author, so FD/FO/FS together count as **one** source. Each relation also has a source by another author.

## Per-relation result

| Relation | Sources | Status |
|---|---|---|
| (a) V = I·R | OS §9.4 "V=IR"; FD Eq. 3.3 "V = I × R"; K I §2.1 "E = IR" | VERIFIED (S-019) |
| (a) P = V·I = I²R = V²/R | OS §9.5 "P=I²R=V²/R" and "…=IV"; K I §2.4 "P = I²R ; P = IE ; P = E²/R"; FD Eq. 2.7 "P = I × V" | VERIFIED (S-019) |
| (b) R_series = ΣR | OS §10.2; FD Eq. 3.2; K I §5.2 | VERIFIED (S-019) |
| (b) 1/R_par = Σ1/R | OS §10.2 R_P = (Σ1/R_i)⁻¹; FD Eq. 4.3; K I §5.3 | VERIFIED (S-019) |
| (b) R1‖R2 = R1R2/(R1+R2) | FD Eq. 4.4; SF "product over sum". OS and K print the reciprocal form, which is algebraically identical | VERIFIED (S-019) |
| (c) Vout = Vin·R2/(R1+R2) | K I §6.1 "ERn = ETotal (Rn / RTotal)"; FD Ex. 3.7.1 "V_b = E R2/R_T"; SN | VERIFIED (S-019) |
| (c) loaded: R2 → R2‖RL | UMD "R2eff=1/(1/RL+1/R2)", "Eout=Ein*R2eff/(R2eff+R1)"; SN | VERIFIED (S-019) |
| (d) Vout = Vref·(1 + R1/R2) | FO Eq. 8.3 "V_load = V_zener (R2 + R3)/R3"; EDN Eq. 1 "Vout = Vref1* (Rf2/Rf1+1)"; supported by K III §8.5 "AV = (R2/R1) + 1" | VERIFIED (S-019), see naming caveat |
| (e) R = (Vs − Vf)/If | FS Ex. 2.5.2 "I = (E−V_LED)/R" (same equation, solved for I); DK | VERIFIED (S-019) |
| (f) τ = RC | OS §10.5 "τ = RC"; K I §16.4; WP | VERIFIED (S-019) |
| (f) f_c = 1/(2πRC) | FO §1.3 "f_c = 1/(2πRC)", "break point occurs when X_c equals R"; WP; K II §9.2 (formula is an image; cut-off at 70.7 %; worked value 45.473 Hz = 1/(2π·500 Ω·7 µF), recomputed 45.4728 Hz) | VERIFIED (S-019) |
| (f) f0 = 1/(2π√(LC)) | OS §15.5 Ex. 15.4 f0 = (1/2π)√(1/LC); K II §6.2 | VERIFIED (S-019) |
| (f) Z0 = √(L/C) | IMX names √(Lr/Cr) "characteristic impedance"; HMC uses √(L/C) inside Q but does not name it; WP X_L0 = X_C0 = √(L/C) | **UNVERIFIED (S-019b)** |
| (g) X_L = 2πfL, X_C = 1/(2πfC) | K II §3.2, §4.2 (2πf forms); OS §15.2 (ωL, 1/(ωC)) with ω0 = 2πf0 in §15.5 | VERIFIED (S-019) |

## Conflicts and caveats

1. **Resistor naming in the feedback divider (d).** The names do not mean the same thing in every source. Fiore's generic regulator uses R2 for the top resistor and R3 for the bottom one. Fiore's LM317 formula is "V_out = 1.25 V(1 + R2/R1) + I_adj R2", with R1 = 240 Ω as the **bottom** resistor. Kuphaldt's non-inverting gain names the top resistor R2. EDN uses Rf2 and Rf1. Our row defines R1 = top (Vout to FB) and R2 = bottom (FB to ground). This matches common DC/DC datasheet usage, but it is the reverse of the LM317 convention. The UI must show the schematic position of each resistor. It must not rely on the labels alone.
2. **Feedback-divider error terms.** The ideal relation leaves out FB/ADJ pin current (I_adj·R_top in the LM317 form), error-amplifier offset and Vref tolerance. It holds only in regulation. Vref is always a user input.
3. **LED Vf is not constant.** Vf depends on If, junction temperature and production bin. R = (Vs − Vf)/If gives a nominal resistor only. The resulting current is approximate.
4. **Loaded divider** assumes an ideal source (zero source resistance) and a resistive load.
5. **f vs ω.** OpenStax writes reactances in ω. Kuphaldt writes them in 2πf. They are the same relation with ω = 2πf, but unit handling must keep the factor 2π.
6. **Kuphaldt's f_c formula is an image.** Its exact text could not be read. Agreement is shown by the page's definition (X_C = R, 70.7 %) and its worked number. Fiore (text) and Wikipedia (tertiary) print the formula.
7. **Z0 = √(L/C)** for a lumped tank is a different quantity from the transmission-line Z0 = √(L′/C′), where L′ and C′ are per unit length. It must not be presented as a line impedance; that belongs to Phase 2 (S-020…S-028).

## Validity notes (for CalcResult.validityChecks / assumptions)

- All relations: ideal, linear, time-invariant components; no tolerance, tempco or parasitics.
- (a)–(e): DC / steady state.
- (f)–(g): sinusoidal steady state, ideal R, L, C (no ESR, ESL, self-resonance or saturation). f_c is the −3 dB point of a single unloaded first-order RC section. f0 is the undamped natural frequency.

## What the user must still verify

- Nothing paywalled. Optional: check the OpenStax and Fiore equations in a browser, because they came through a fetcher.
- S-019b: find a second textbook that names √(L/C) "characteristic impedance" of a lumped LC. Candidates that could not be extracted here: F. Caspers, "RF Basics I and II", CERN Accelerator School, arXiv:1302.5264, and the MIT 6.622 (2023) lecture PDF. Until then, label the result "√(L/C) (= X_L = X_C at f0)".
