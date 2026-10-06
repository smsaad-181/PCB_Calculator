---
name: circuit-values
description: Circuit-value calculators: Ohm/power, dividers, regulator feedback, LED resistor, RC/LC, reactance, E-series nearest value and two-resistor search. Use for objective 4 (circuit values).
---
# Circuit values
- Ohm's law/power: V=IR; P=VI=I²R=V²/R (solve for any missing variable; reject inconsistent over-specification with a message).
- Divider: `Vout = Vin·R2/(R1+R2)`; show loaded divider with RL; tolerance envelope (resistor %); power per resistor.
- Regulator feedback: `Vout = Vref·(1 + R1/R2)`; Vref is user input (datasheet); solve R1 for target Vout given R2 and E-series; show resulting error %.
- LED resistor: `R = (Vs − Vf)/If`; round up to E-series; power rating with margin; warn if Vs ≤ Vf.
- RC: `τ=RC`, `fc = 1/(2πRC)`. LC: `f0 = 1/(2π√LC)`, `Z0=√(L/C)`. Reactance: `XL=2πfL`, `XC=1/(2πfC)`.
- E-series arrays E6/E12/E24/E48/E96/E192 are standardized (IEC 60063); verify values in ledger; generate E48+ from the preferred-number definition and cross-check against the published list.
- Two-resistor search: precompute sorted arrays; for series/parallel/divider targets, search pairs in a Web Worker for E96/E192; return best 5 with error % and tolerance worst-case.
- Use datasheet values only from user input; do not embed IC parameters.
