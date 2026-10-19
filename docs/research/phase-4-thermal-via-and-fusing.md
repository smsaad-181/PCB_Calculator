# Phase 4 research: thermal via array estimate and fusing

Status: research only (standards-researcher, 2026-10-19). No code. Ledger rows: S-040, S-041, S-041a-d, S-042, S-042a-f. Source notes: `docs/sources/notes/thermal-via-and-fusing.md`.
Scope (user decision 2026-10-19): (1) thermal via array estimate, (2) fusing (Onderdonk / Preece). Fusing is strictly separate from steady-state heating. NOT in scope: θJA/θJC, exposed-pad spreading, RF/antenna, twisted pair/coax.
Every number below is from a ledger row or is marked "researcher arithmetic". Nothing is from memory.

---

## Part A: thermal via array estimate

### A.1 Recommended model (one-dimensional conduction, labelled as a lower bound)
Calculator id proposal: `thermal-via-array`, separate from the existing `via` calculator but reusing its barrel geometry (same formula, S-041).

| Step | Equation | Ledger | Status |
|---|---|---|---|
| Barrel area | A_b = π·t·(d + t) | S-041 | VERIFIED |
| Barrel resistance | θ_b = L / (k_Cu·A_b) | S-041 (k: S-007) | VERIFIED formula; k CONFLICT |
| Core (fill) area | A_c = π·d²/4 | S-041a | UNVERIFIED (derived) |
| Core resistance | θ_c = L / (k_fill·A_c) (only when a fill is declared) | S-041a | UNVERIFIED (derived) |
| One via | θ_via = θ_b (unfilled), or 1/(1/θ_b + 1/θ_c) (filled) | S-041, S-041a | as above |
| Array | θ_array = θ_via / N | S-041b | VERIFIED (ideal relation) |
| Optional rise | ΔT_vias = θ_array·P (P = heat the user says flows through the vias) | S-019d | VERIFIED definition |

Symbols and SI units: d = FINISHED (inside) hole diameter [m]; t = barrel plating thickness [m]; L = barrel length [m] (board thickness for a through via, span for blind/buried); k_Cu, k_fill [W/(m·K)]; N = via count [1]; P [W]; θ [K/W]; ΔT [K, temperature DIFFERENCE dimension].
Drill input (if offered): A_b = π·t·(D − t), D = drill diameter = d + 2t. Never accept "hole size" without saying finished or drill (skill via-and-annular-ring).

### A.2 Inputs and defaults policy
| Input | Source of value | Default |
|---|---|---|
| d (finished hole) | user | none |
| t (plating) | user or active fab profile `holePlatingAverage` (S-015, S-019m: JLCPCB publishes an AVERAGE, not a minimum) | none, never pre-filled |
| L | user | none (board thickness is not assumed) |
| N | user (integer ≥ 1) | none |
| k_Cu | `copperThermalConductivity(material)` (S-007) | the existing default material with its CONFLICT status and assumption text (decision R-10 / Q-51) |
| fill | user choice: none / filled | none (must choose) |
| k_fill | user, from the fill-material datasheet | none: there is NO researched fill value (S-041a) |
| P | user, optional | none |
| pitch, pad size | user, optional, geometry checks only | none |
| fab hole-to-hole limit | fab profile only (S-019k), never code | none |

### A.3 Outputs
θ_b, θ_c (if filled), θ_via, θ_array, and ΔT_vias if P is given. Label: "Via-array conduction estimate (1-D, barrel and fill only). Lower bound on the real thermal resistance."

### A.4 Validity checks and warning rules
Always shown:
1. "One-dimensional estimate. It covers conduction along the barrels (and fill) only. It excludes spreading in the pads and planes, the package, solder, interface and convection. Published FEA found the 1-D model UNDERESTIMATES the thermal resistance (Guenin 2004: by up to 27 % in his case). So the real resistance is higher." (S-041c)
2. "The heat needs somewhere to go. A via array without a receiving copper area or plane has little effect (Brooks & Adam 2024). Sources disagree on how useful thermal vias are." (S-041c, CONFLICT)
3. "Copper thermal conductivity of plated barrels was not found; the value used is bulk copper (S-007, S-041d). A higher k gives a lower θ, which is the non-conservative side." (existing S-007 wording)
4. "θ/N assumes every via sees the same top and bottom temperature. More vias give diminishing returns." (S-041b, S-041c)
5. "This is not θJA or θJC. Package thermal metrics from JEDEC test boards are not design constants." (S-040)

Conditional:
- t from a fab profile: "fabricator AVERAGE plating; thin spots are thinner" (S-019m).
- Filled: "fill assumed void-free and in full contact with the barrel; via-in-pad caps not modelled" (S-041a).
- Geometry check (only if pitch and pad size given): if pitch − (d + 2t) is smaller than the fab profile's hole-to-hole limit, show an error that names the profile field. If N vias at that pitch do not fit the pad, warn. Pure geometry, no physics.
- Plausibility (engineering ranges, not from a standard; mark as such): d, t, L > 0; t < d (else "check finished vs drill"); L/d aspect ratio above the fab profile's limit if one exists (JLCPCB publishes none, S-019m).
- Input guards per CLAUDE.md rule 10.

### A.5 Confidence rules (rule-based)
- Accuracy class: `estimate`.
- Never `high`: S-041c says the model is a lower bound and S-007 is CONFLICT.
- `medium` only if every input is user-supplied, there is no fill (or k_fill is user-supplied), and plating is user-entered (not a fab average).
- `low` if plating comes from a fab average, or if the geometry check could not run.
- Data status = worst of S-041, S-041b, S-007, S-041c, plus S-041a when filled. That gives CONFLICT, which renders the badge.

---

## Part B: fusing (separate calculator)

### B.1 Placement
Calculator id proposal: `fusing`. Own meta, own ledger ids, own page. It must not import from or feed `self-heating` (skill self-heating-solver). The self-heating page may link to it with one sentence: "Fault and fusing currents are a different question; see Fusing."

### B.2 Recommended models
Show two results side by side and a third only as a historical reference (decision Q-53):

**B.2.1 Adiabatic heating to the melting point (DERIVED; recommended primary, constants visible)** (S-042a)
I²·t = A²·K·ln[(Tm + β20)/(Ta + β20)], with K = D·c/(ρ20·α20) and β20 = 1/α20 − 20 °C.
- A: conductor cross-section [m²] (trace: width × FINISHED thickness; wire: π·d²/4).
- D: density [kg/m³], S-003d (8890, VERIFIED).
- c: specific heat [J/(kg·K)], S-042d (CONFLICT: 383.48 at 293 K vs 386 at 20 °C; 385.00 at 300 K).
- ρ20 = 1/58e6 Ω·m and α20 = 0.00393 K⁻¹, S-004 (VERIFIED). These give β20 = 234.45 °C.
- Tm: S-042c, 1084.62 °C (VERIFIED, pure copper).
- Ta: initial conductor temperature [°C]; user input.
- Solve for t given I, or for I given t. Both are closed form, so no iteration is needed.
- Researcher arithmetic, as a sanity check (NOT a golden vector): K = 5.0512 × 10¹⁶ A²·s/m⁴ (c = 385). For A = 0.254 mm × 35 µm = 8.89 × 10⁻⁹ m², I = 10 A, Ta = 20 °C: t = 0.0657 s.

**B.2.2 Onderdonk (attributed, origin unknown)** (S-042, UNVERIFIED)
I = A_cmil·√( log10[(Tm − Ta)/(234 + Ta) + 1] / (33·t) ), A_cmil in circular mils, t in s, temperatures in °C.
SI form for the implementation (researcher arithmetic): I²·t / A² = log10[(Tm + 234)/(Ta + 234)] / (33 × (5.06707 × 10⁻¹⁰)²) = 1.18025 × 10¹⁷ × log10[...] A²·s/m⁴. Convert only at the boundary; store 33, 234 and the cmil definition (S-006) as the source constants, not the merged number.
Same example: t = 0.0667 s (1.6 % above B.2.1).

**B.2.3 Preece (historical reference only)** (S-042b, VERIFIED form)
I = 10244·d^1.5, d in inches (wire diameter). No time, wire in still air. For a trace, the app may show only an "equivalent round wire of the same area" value, d = √(4A/π), labelled as an extrapolation. Same example: 2.78 A (researcher arithmetic). Recommendation: show only in an expandable "historical formulas" panel, or omit it (Q-58).

### B.3 Inputs and defaults policy
| Input | Default |
|---|---|
| Geometry (trace width + finished thickness, or area, or wire diameter) | none. If the thickness comes from copper weight, the S-003 convention (CONFLICT) and S-009 finished-copper caution must show. |
| Current I and time t (enter one, solve the other) | none |
| Ta (initial temperature) | none: required (Q-60). Note: it is the conductor temperature at the start of the fault, not room ambient, if the trace already carries load. |
| Tm | 1084.62 °C from S-042c, shown with its source; user may override (for example a solder joint or a lower failure temperature, Q-59) |
| c | from S-042d, user-selectable between the sourced values; default per Q-54 |
| D, ρ20, α20 | S-003d, S-004 constants (not editable unless the human asks) |

### B.4 Outputs
- Primary: "Adiabatic time to reach the copper melting point" (s) or "Adiabatic current to reach it in t" (A).
- Secondary: Onderdonk value and the ratio to the primary.
- Never call any output a "fusing rating", "fuse rating", "safe current" or "overload rating".

### B.5 Validity and warning rules
Always shown:
1. "Adiabatic: no heat loss to the board, air or copper connections. On a PCB the board starts cooling the trace within about 1–1.5 s, and simulated trace fusing currents were 1.5 to 6 times the Onderdonk value (Brooks & Adam, one author group)." (S-042e, UNVERIFIED)
2. "Time to REACH the melting point, not time to open: the heat of fusion is excluded. A trace can also fail earlier (delamination, necks, voids) or survive longer." (S-042, S-042a, S-042e)
3. "Not a fuse rating and not a safe overload limit. Use a rated fuse or protection device when protection is required." (S-042e)
4. "Constant specific heat and linear resistance up to the melting point; real copper's specific heat rises about 32 % between 300 K and 1300 K (one source), so this estimate errs short." (S-042d)
5. "IPC trace-current methods address steady-state heating; they are not used here." (S-042f, PAYWALLED)

Conditional (thresholds are PRODUCT CHOICES based on S-042e, not sourced limits; Q-57):
- t > 1 s: warning "beyond the 1.0–1.5 s range where the authors found Onderdonk applies to boards".
- t > 10 s: strong warning, confidence `low`, or refusal (Q-57) "beyond the usual stated validity even for wires in air".
- Ta ≥ Tm: reject.
- Thickness derived from copper weight: show the S-003 / S-009 notes ("thinner finished copper fuses sooner").
- Very short pulses: "assumes uniform current density; skin effect and inductive current distribution are not modelled". No numeric threshold is sourced. Do not invent one.
- Preece selected: "1880s round-wire experiments, no time term; not a PCB model".

### B.6 Units pitfalls (implementation and tests)
1. Circular mils vs square mils: 1 cmil = (π/4) mil² (S-006 arithmetic). Mixing them shifts I by a factor of 4/π = 1.273 (or t by 1.621).
2. log10, not ln, in Onderdonk. ln in the physics form.
3. "234 + Ta", not "234 − Ta"; 33·t sits UNDER the square root (published mis-transcriptions exist, S-042).
4. Temperatures in °C inside the log terms (absolute-temperature quantity converted to °C at the boundary). (Tm − Ta) is a temperature DIFFERENCE, but Ta + 234 is an offset temperature. Keep the dimensions honest in the units engine.
5. Preece a = 10244 needs d in inches. In mm the constant is 80.02 (researcher arithmetic). Never mix them.
6. Brooks' "t = 0.0346·(A/I)²" is THEIR derived constant in mil² at 20 °C / 1083 °C. It is not Onderdonk's (0.0351). Do not use it as the Onderdonk check.
7. The current is the actual conductor current. For a non-rectangular pulse the relevant quantity is ∫i²dt (I²t), not I_rms × an arbitrary time. Offer an I²t input only if the human wants it (Q-61).

### B.7 Confidence rules
- Accuracy class: `estimate` (or a new `order-of-magnitude` class if the human prefers, Q-53).
- Never `high`. S-042, S-042a and S-042e are UNVERIFIED and S-042d is CONFLICT.
- `medium` only if t ≤ 1 s, every input is user-supplied, and the thickness is entered as finished copper (not converted from oz).
- `low` otherwise, and always when t > 1 s or Preece is shown.
- Data status = worst of the cited rows. That gives CONFLICT (S-042d), so the badge always shows.

---

## Part C: open questions for the human (Q-50 …)
- **Q-50** Thermal via scope: conduction-only estimate as in A.1 (recommended), or should Phase 4 attempt any spreading model? No spreading formula was read or adopted; the literature forms (Lee/Yovanovich type) would need a new research pass.
- **Q-51** Copper k for barrels: keep the S-007 default (pure 401 W/m·K, non-conservative) for thermal vias, switch the via-array default to C11000 391, or force a choice? Plated-barrel k was not found (S-041d).
- **Q-52** Fill conductivity: user-only input (recommended), or should a researcher collect fill-material datasheet values (they would be single-manufacturer, UNVERIFIED)?
- **Q-53** Fusing primary result: derived adiabatic (S-042a, constants traceable) as primary with Onderdonk as a secondary cross-check (recommended), or Onderdonk as primary because it is the familiar name?
- **Q-54** Specific heat default (S-042d CONFLICT): 383.48 J/(kg·K) at 293 K (PPPL), 386 at 20 °C (HyperPhysics), or 385.00 at 300 K (PPPL, matches Brooks & Adam)? Or force a choice?
- **Q-55** Cite IEC 60364-5-54 Annex A's adiabatic form directly? It is paywalled; you would need to read it.
- **Q-56** Please check the IPC-2152 (2009) scope clause and IPC-2221B/C §6.2 for any statement on fusing or short-time currents (S-042f).
- **Q-57** Time limits for fusing results: warn above 1 s and refuse above 10 s? Or warn only? These are product choices based on S-042e (one author group).
- **Q-58** Preece: show it in a "historical formulas" panel, or leave it out? It has no time term and models a round wire in air.
- **Q-59** Melting point: use 1084.62 °C (ITS-90, S-042c) with an override field (recommended)? Every fusing source uses 1083 °C; the difference is 0.08 % in the log term.
- **Q-60** Initial temperature Ta: required input with no default (recommended), or the self-heating calculator's 25 °C default flagged as "defaulted"?
- **Q-61** Accept an I²t (action integral) input for non-rectangular fault pulses? This is the same physics (S-042a), with no new source needed.

## Part D: conflicts between sources (recorded, not resolved)
1. Onderdonk 0.02166 vs Brooks & Adam derived 0.0213 A²·s/cmil² (1.6 %). (S-042)
2. Melting point 1084.62 °C (ITS-90) vs 1083 °C in all fusing sources. (S-042c)
3. Specific heat at 20 °C: 383.48 vs 386 J/(kg·K). (S-042d)
4. Preece year 1884 vs 1888; area constant 12277 vs 12278.9. (S-042b)
5. Usefulness of thermal vias: app notes vs Brooks & Adam 2024. (S-041c, CONFLICT)
6. Via barrel area forms mixed up in the wild: π·d·t (+8.3 % θ), drill form with a finished hole (+18 % θ). (S-041)
7. Plated copper k: 401.6 (Pulsonix, unsourced) vs about 385 (Brooks & Adam) vs S-007; TI prints 4 (typo). (S-041d)
8. Onderdonk mis-transcriptions: the 33 dropped, 234 − Ta, 33·t outside the root. (S-042)
9. (2026-10-19 follow-up) Brooks & Adam 2015's printed constants (ρ20 1.75e-8, D 8900) give 0.0210, not their stated 0.0213. Their 0.0213 matches our 1/58e6 and 8890. Do not tune toward theirs. (S-042)
10. (2026-10-19 follow-up) Via-in-pad solder wicking: TI (small open holes, top mask open and bottom covered; SLOA122 reportedly unmasked) vs MACOM S2083 (mask over vias, reported by the PCB reviewer, not confirmed) vs Qorvo/JLCPCB (tent, plug or fill) vs Cirrus (leave bare). This is a DFM caution, not a constant. See notes §4.

## Part E: status summary
- VERIFIED: S-040 (caveat text only), S-041 (barrel formula), S-041b (ideal θ/N), S-042b (Preece form and constant), S-042c (melting point), S-045 (thermal-relief caveat text only, no number; added 2026-10-19).
- Reference only, not used in code: pure-copper density 8933 kg/m³ at 293 K (PPPL), recorded in the S-003d notes. The code keeps 8890 (IACS). Laminate Tg/Td end temperatures are user inputs from the laminate datasheet; the ledger holds no value.
- UNVERIFIED: S-041a (filled via, derived), S-041d (plated k, not found), S-042 (Onderdonk form), S-042a (adiabatic, derived), S-042e (PCB validity, one author group), S-043…S-044 (out of scope placeholder).
- CONFLICT: S-041c (1-D limits and via usefulness), S-042d (specific heat).
- PAYWALLED-USER-MUST-VERIFY: S-042f (IPC scope for fusing).
- S-014 is superseded by S-042… (kept, still UNVERIFIED).
