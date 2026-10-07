---
name: via-and-annular-ring
description: Via electrical/thermal formulas, finished-hole vs drill definitions, via arrays, annular ring and tolerance stack-up, and the pitfalls. Use for via and drill calculators.
---
# Vias

## Drill vs finished hole (keep them distinct everywhere: inputs, labels, fab-profile fields)
- **Finished hole diameter d** is the inside diameter after plating. This is what the barrel formulas use.
- **Drill diameter** is the tool size before plating: drill ≈ d + 2·t_plating (+ the fabricator's allowance, which is fab-specific and not standardised here).
- Fabricator "hole size tolerance" is usually stated on the **finished** hole. JLCPCB: "Hole size Tolerance Through-holes: +0.13 / -0.08 mm", framed as finished hole size (S-008, UNVERIFIED). Never apply a finished-hole tolerance to the drill bit or vice versa. The example profile key `drillTolerancePlus/Minus` is misnamed for this reason (calc-validator m-8(c)); treat it as a finished-hole tolerance until it is renamed.

## Formulas
- Barrel copper area: `A = π·t·(d + t)` (annulus between d and d+2t). Do NOT use π(d−t)t.
- Resistance: `R = ρ·L/A` (L = barrel length ≈ board thickness; for blind/buried, use the span). ρ from `COPPER_RESISTIVITY_20C` (= 1/58e6 Ω·m, S-004) and `COPPER_ALPHA_20C` for temperature. Plated copper resistivity is not researched (S-012): state it as an assumption. Parallel vias: R/N (warn about current crowding and unequal sharing).
- Thermal: `θ = L/(k·A)`. Get k from `copperThermalConductivity(material)` in `src/core/data/constants.ts`; never write a number. Default material `'pure-401'` (k = 401 W/m·K, well-annealed high-purity copper at 300 K); `'c11000-391'` (391 W/m·K) is selectable. Ledger S-007 is **CONFLICT** (C11000 391–394 W/m·K; plated barrel copper not researched), so surface the returned `status` and add the returned `assumption` text. The highest k gives the lowest θ, which is the non-conservative direction for via temperature: say so in the assumptions. The 401 default still awaits the human's confirmation (R-10). The old value 385 W/m·K had no source (it matches copper's specific heat, 385 J/(kg·K)) and must not appear.
- Thermal-via-array mode adds the spreading/fill assumptions explicitly.
- Do NOT claim a universal current rating from hole size alone; state assumptions (plating, ΔT, ambient, copper connected).

## Plating thickness t
- t comes from the user or the active `FabProfile` (`holePlatingAverage`, `source: 'fab-profile'`). It is **never pre-filled** by the calculator or UI.
- Published values differ: JLCPCB "Average Hole Plating Thickness 18μm"; PCBWay 18–25 µm (both S-008, UNVERIFIED). IPC-6012 class minimums are paywalled (PAYWALLED-USER-MUST-VERIFY).
- The 25 µm in the golden vectors is a **test value only**.

## Golden (from `docs/golden-vectors.json`; read the file, do not copy numbers from here into tests)
d 0.3 mm finished, t 25 µm (test value), L 1.6 mm, k 401 W/m·K → A = 0.025525440310417067 mm², R = 1.0807338310749393 mΩ (ρ = 1/58e6), θ = 156.31561646470445 K/W (≈ 156.3 K/W).

# Annular ring
Nominal `AR = (pad − finished_hole)/2` (state whether the fab defines it against the drill or the finished hole; they differ by the plating). Worst case includes drill-position/registration tolerance, hole size tolerance, plating allowance, pad size tolerance, all from the active FabProfile. Warn when below the fab profile minimum. Acceptance criteria (e.g. breakout allowed or not by product class) come from IPC-6012 (paywalled): mark `PAYWALLED-USER-MUST-VERIFY`.
Types: PTH, NPTH (no plating), via, blind, buried, microvia (aspect-ratio warnings); use fab-profile limits only.

## Fab-profile fields must be named and unambiguous
Fabricators publish different limits for different hole types. Example (JLCPCB live page, re-read 2026-10-07 by both validators): "Via hole to Track 0.2mm", "PTH to Track 0.28mm" (0.35 mm recommended), "NPTH to Track 0.2mm". The current example profile carries one `holeToTrack` = 0.2 mm, which is the **via** value and is 0.08 mm non-conservative for PTH (calc-validator m-8(a)). Likewise JLCPCB's annular-ring figures are per layer count and copper weight (multilayer 1 oz 0.20/0.15 mm, 2 oz 0.254 mm). A calculator must read a field whose name states hole type (via / PTH / NPTH), finished vs drill, and layer count/copper weight where the fab distinguishes them; if the profile lacks that field, ask the user rather than reuse a field meant for another hole type.
