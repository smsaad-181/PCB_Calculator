# Constant-power load behind a series resistance (ledger S-019h)

Researcher: standards-researcher, 2026-10-13. Used by the voltage-drop calculator (`src/core/calculators/voltage-drop`).
No standard is involved: these are circuit relations. Status means two independent authors print the same relation; it says nothing about how a real converter behaves.

## Relations covered

Source Vs (ideal), total series path resistance R (series resistances add, S-019 (b)), load drawing a constant power P.

1. Quadratic: with V_load = P / I, KVL gives R·I² − Vs·I + P = 0 (equivalently V_load² − Vs·V_load + R·P = 0).
2. Physical root: I = (Vs − √(Vs² − 4RP)) / (2R), V_load = (Vs + √(Vs² − 4RP)) / 2 (the high-voltage, low-current root).
3. Feasibility: a real steady state exists only for P ≤ P_max = Vs² / (4R). This is the maximum power a source behind R can deliver to any load (matched load R_L = R, V_load = Vs/2).
4. Efficiency: η = P_load / P_source = V_load / Vs (for a resistive load R_L / (R + R_L)); 50 % at maximum power.
5. Information only, not computed by the calculator: the constant-power load's incremental resistance is −V²/P (negative).

## Sources read

### A. Tu, Yu, Lukic: arXiv:2211.04242v3 (PDF read in full, 7 pages)
H. Tu, H. Yu, S. Lukic (North Carolina State University), "Impact of Virtual Inertia on DC Grid Stability with Constant Power Loads", arXiv:2211.04242v3 [eess.SY], 8 Feb 2023. URL: https://arxiv.org/pdf/2211.04242 . Retrieved 2026-10-13.

- p. 2, eq. (1): droop "vref = Vn − Ki". This makes K a series resistance between the ideal voltage Vn and the load. The paper: "the droop gain can be interpreted as a virtual resistor in series with Vn".
- p. 2, eq. (6), typeset: V_ref,e = V_e = (V_n + √(V_n² − 4PK)) / 2, I_e = (V_n − V_e) / K.
  Substituting gives I_e = (V_n − √(V_n² − 4PK)) / (2K), which is the calculator's root with R = K (researcher algebra).
- p. 2, eq. (7): "P ≤ Pmax = V²n/(4K)". Quote: "commonly known as the power transfer limit via a (virtual) resistor".
- p. 2: "Ve is a monotonically decreasing function of P."
- p. 2, eq. (8): R_e = V_e²/P. Quote: "−Re is referred to as the incremental (or small-signal) impedance of the CPL".
- p. 2, eq. (9): "Re ≥ K".
- Scope: the paper sets the line resistance to zero and models the series resistance only through K. Its steady state is therefore exactly source, series R and CPL. The stability part (L, C, virtual inertia) is not used here.

### B. Liu, Su, Sun, Yuan, Han: arXiv:1711.06993 (PDF read in full, 8 pages)
Z. Liu, M. Su, Y. Sun, W. Yuan, H. Han, "Existence and Stability of Equilibrium of DC Microgrid with Constant Power Loads", arXiv:1711.06993. URL: https://arxiv.org/pdf/1711.06993 . Retrieved 2026-10-13. The version date and affiliations were not in the extracted text.

- p. 3, eq. (6): CPL "u_i i_i = −P_i". The sign is negative because of the paper's current reference direction.
- p. 3, eq. (10), single equivalent CPL: u_eq (Ȳ_LS V* + Ȳ_LL u_eq) = −P_eq.
- p. 3, eq. (11): "This system admits an equilibrium if and only if" (Ȳ_LS V*)² − 4 Ȳ_LL P_eq ≥ 0.
- p. 1, quote: "The existence of equilibrium in this system is determined by a quadratic equation with one unknown".
- p. 5, eq. (32): the negative CPL resistance r_i = −(u_i*)² / P_i.
- p. 5 (Proposition 4 proof), as read from the PDF text: the solution used has u_L* > (u_ref/2)·1. That is the high-voltage root. The extracted text there is garbled, so treat this as a reading, not a quote.
- Specialization (researcher algebra, NOT quoted): for one source Vs behind a total resistance R, take Ȳ_LS = −1/R and Ȳ_LL = 1/R. Eq. (10) becomes u² − Vs·u + R·P = 0. Eq. (11) becomes Vs²/R² − 4P/R ≥ 0, i.e. P ≤ Vs²/(4R). The paper's own Ȳ matrices include the virtual resistances K. The extracted formulas for Ȳ were partly garbled, so this specialization is my own and was not read from the paper.

### C. Tatum, Electricity and Magnetism (LibreTexts), §4.8 (summarizing fetcher, two fetches)
J. Tatum (University of Victoria), "4.8: Power Delivered to an External Resistance", Physics LibreTexts, CC BY-NC 4.0. URL: https://phys.libretexts.org/Bookshelves/Electricity_and_Magnetism/Electricity_and_Magnetism_(Tatum)/04%3A_Batteries_Resistors_and_Ohm's_Law/4.08%3A_Power_Delivered_to_an_External_Resistance . Retrieved 2026-10-13.

- Eq. 4.8.1: P = I²R = E²R/(R + r)².
- Quote: "the power delivered reaches a maximum of E²/(4R) when R = r". The page writes 4R; with R = r this is E²/(4r). Both fetches agree on the 4R wording.
- The page's heading "1.87 Ω or 0.134 Ω" answers a problem whose text was not on the fetched page. It is not used.

### D. Stolp, University of Utah ECE 2210 notes (PDF read in full, 10 pages)
A. Stolp, "ECE 2210 Lectures 5 & 6 notes: Thévenin & Norton Equivalent Circuits" (dated 1/28/06, 9/2/09; examples 1/23/03, 1/6/13). URL: https://my.ece.utah.edu/~ece2210/Lect05_06.pdf . Retrieved 2026-10-13.

- p. 5: "Maximum power transfer happens when: R_L = R_S".
- p. 5, "What about efficiency?": P_L(R_L)/P_S(R_L) = I²·R_L / (I²·(R_S + R_L)) = R_L/(R_S + R_L).
- p. 5: "The bigger R_L is, the higher the efficiency."
- p. 7, Ex. 2(e), "What is the maximum power transfer?": V_Th = 3 V, R_L = R_Th = 750 Ω, V_L = V_Th/2, P_L = V_L²/R_L = 3 mW. Check: 3²/(4 × 750) = 0.003 W. So this is Vs²/(4R) in equivalent form.
- p. 4: the table of P_L against R_L peaks at 1.875 W at R_L = 30 Ω = R_Th (V_Th = 15 V). Check: 15²/(4 × 30) = 1.875 W.

### E. Fiore, DC Electrical Circuit Analysis (LibreTexts), §6.6 (summarizing fetcher)
J. M. Fiore (Mohawk Valley CC), "6.6: Maximum Power Transfer Theorem", CC BY-NC-SA. URL: https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/DC_Electrical_Circuit_Analysis_-_A_Practical_Approach_(Fiore)/06%3A_Analysis_Theorems_and_Techniques/6.6%3A_Maximum_Power_Transfer_Theorem . Retrieved 2026-10-13.

- Quote: "Maximum load power will be achieved when the load resistance is equal to the internal resistance".
- Quote: "efficiency at maximum load power is only 50%".
- Quote: "only half of all generated power goes to the load".
- The equations are normalized only (E = 1 V, R_i = 1 Ω: P = R/(R² + 2R + 1)). This page does NOT print the general E²/(4R) form. It supports the matched-load condition and the efficiency definition only.

### Read but not used
- T. R. Kuphaldt, Lessons in Electric Circuits Vol. I §10.12 (Workforce LibreTexts). The equations are images. The example gives "39.2 watts" at 0.8 Ω, but the Thévenin voltage is not on that page. URL: https://workforce.libretexts.org/Bookshelves/Electronics_Technology/Circuitry/Book%3A_I_Direct_Current_(DC)/10%3A_DC_Network_Analysis/10.12%3A_Maximum_Power_Transfer_Theorem
- Search-engine summaries and tutoring sites (Vedantu, albert.io, etc.) were not used.

## Verdict

S-019h = VERIFIED.

- Constant-power quadratic and feasibility bound: two independent author groups (A and B).
  - A prints the root and P_max = Vn²/(4K) explicitly.
  - B prints the scalar quadratic and its discriminant condition. The specialization to a single R is my algebra.
- Vs²/(4R) as the maximum power transfer: A explicitly, C (textbook) explicitly, and D in an equivalent worked form.
- Efficiency as P_load/P_source: D prints it, and E states 50 % at matched load.
- Independence: A and B are different authors, institutions and years, and neither cites the other.
- Tier: A and B are arXiv preprints. Journal versions were not checked. No textbook was found that prints the constant-power-load quadratic itself.

## Not sourced (researcher algebra, labelled as such)
- I = 2P / (Vs + √(Vs² − 4RP)) is the same root, rationalized (multiply by the conjugate). It avoids cancellation when 4RP ≪ Vs². That is a numerical choice, not a source statement.
- η = V_load / Vs follows from P_load = V_load·I and P_source = Vs·I with the same series current.

## Conflicts
None. Tatum's "E²/(4R) when R = r" uses R where r would be clearer. That is a notation point, not a conflict.

## Validity and caveats for the calculator
- Ideal DC source: any source resistance must be included in R.
- R is the resistance at the solved state. Trace R(T) uses the user's conductor temperature; the voltage-drop calculator does not couple self-heating (that is S-019g).
- The CPL is ideal: P is independent of V over the whole range. Real converters stop behaving as constant power below their minimum input voltage (UVLO, dropout). P is the converter's INPUT power; converter efficiency is not included.
- P_max is a mathematical existence limit at V_load = Vs/2. Practical converters drop out long before it. It is not a design margin.
- Steady state only. A (eq. 13 and its HIL tests) and B (Section V) show that an existing equilibrium can still be UNSTABLE: a negative incremental resistance together with an input LC filter, and bus capacitance below a threshold. The calculator does not assess this; a UI note is advisable.

## What the user must still verify
Nothing paywalled. Optional: check the journal versions of A and B if a peer-reviewed citation is preferred over arXiv.
