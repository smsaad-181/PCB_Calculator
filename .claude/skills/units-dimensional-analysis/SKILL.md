---
name: units-dimensional-analysis
description: Design and rules for the dimensional unit engine: SI normalization, dimension vectors, ΔT vs absolute temperature, foil weight, AWG, SI prefixes, field-aware parsing, directional display rounding and headline formatting. Use when touching units, parsing input or printing values.
---
# Units

Last synced with the code at commit 51f3f4d. If this file and `src/core/units/*` or `src/core/format-result.ts` disagree, the code wins; fix this file.

## Model
- **Representation:** `{ si: number; dim: Dim }`. `Dim` is an exponent vector over (m, kg, s, A, K, mol, cd) plus a kind tag: `'plain' | 'absTemp' | 'deltaT' | 'arealMass'`. The tag separates **absolute temperature**, **temperature difference** and **areal mass**.
- **Construction:** create values only with `q()` or the algebra functions; raw object literals bypass validation. Quantities are frozen.
- **Allowed ops:**
  - add/sub of the same dimension;
  - absT + ΔT = absT; absT − absT = ΔT; absT + absT throws;
  - mul/div combine dimensions; integer pow (not of an absolute temperature);
  - compare within the same dimension.
  - Anything else throws `DimensionError`.
- **Temperature:**
  - `K = °C + 273.15`; `°F → K = (F−32)·5/9 + 273.15`.
  - Differences: `Δ°C = ΔK`, `Δ°F = ΔK·5/9`.
  - The UI must make the user choose "temperature" vs "rise".
- **Absolute-temperature floor:** `q()` throws below 0 K. Values in [−1e-9 K, 0) are accepted **unchanged** for float noise, e.g. −459.67 °F → −5.7e-14 K. Literal tiny negatives such as "−1e-10 K" are therefore accepted on input (calc m-6, open).
- **Copper weight (oz/ft²) is areal mass:** 1 oz/ft² = 0.028349523125/0.09290304 = 0.30515173 kg/m² exactly (S-006).
  - Thickness is never a fixed factor in code. `foilThickness(weight, convention)` in `src/core/units/foil.ts` is the only sanctioned areal-mass → length path.
  - Conventions (`FOIL_CONVENTIONS`; S-003 is **CONFLICT**):
    - `'nominal-35um'` (default, `DEFAULT_FOIL_CONVENTION`): 35 µm per oz/ft², a common fabricator/laminate nominal (Würth, Rogers). 1.378 mil is just 35 µm expressed in mil; no source ties it to IPC, so never call it "the IPC convention".
    - `'nominal-1.35mil'`: 1.35 mil (34.29 µm), reported secondhand as the IPC-4562A nominal (not read).
    - `'mass-density'`: areal mass / 8890 kg/m³ (IACS density, S-003d), about 34.33 µm.
  - Spread at 1 oz is about 2.07 % (`foilSpreadPercent()`). The choice is a labelled assumption (`foilAssumptionText()`); the default awaits the human (R-9).
  - Finished copper differs far more than the conventions do (S-009 minimums; see skill `calc-module-pattern`, `copperBasisFactors`).
- **Length:** mm, mil/mils/thou (25.4 µm exactly), inch (25.4 mm exactly), µm, cm, m.
- **AWG:** diameter (mm) = 0.127·92^((36−n)/39) (S-005); area = π d²/4.
- **SI prefixes:** p n µ m k M G. `u` is accepted for µ. Case-sensitive: `m` vs `M`, and no case folding, so `5 Mil` is rejected with a "Did you mean" hint.

## Parsing (`src/core/units/parse.ts`; never throws, returns a Result)
`parseQuantity(text, expectedDim?)`: always pass the field's dimension.
- **Temperature fields:**
  - In a ΔT field, `K`, `°C`/`degC` and `°F`/`degF` mean a **rise** (°F scaled by 5/9, no offset).
  - In an absolute-temperature field, a Δ unit is rejected with a specific message.
- **Copper-weight (areal-mass) field:**
  - Bare `oz` means oz/ft². Without a field, bare `oz` is rejected as ambiguous.
  - **Fractions are refused with the decimal spelling**: "1/2 oz", "½ oz", "1 1/2 oz" → "Fractions are not accepted in copper weight: write 0.5 oz" (or 1.5 oz).
- **Component codes** (`4k7`, `4R7`, `R47`, `4M7`, `4n7`, `4u7`, `4p7`) are accepted only in the matching resistance, capacitance or inductance field. Without a field the message names the field needed.
- **Upper-case K in a resistance field** ("4K7", "10K", "10 KΩ") is rejected: "upper-case K means kelvin, not kilo. Write kilo with a lower-case k".
- **Bare SI prefix** (number + prefix letter, no base unit, e.g. "35u", "1.5k"):
  - Never accepted without a field (the message asks for the unit).
  - **Refused, with field-specific examples**, in length, area, resistivity, current density, per-kelvin, thermal resistance, thermal conductivity, areal mass, dimensionless, ΔT, absolute temperature, mass and time fields (`BARE_PREFIX_EXAMPLES`), e.g. "10 M" in a length field → "Write the unit, e.g. 10 mm, 10 um, 10 mil".
  - Accepted only in single-named-unit plain fields: resistance, capacitance, inductance, current, voltage, power, frequency.
  - In a resistance field, "m" is milliohm; it gets a warning from the detailed parser (see below).
  - Do not advertise bare-prefix input as a convenience.
- **Compound units:** mil², in², mm², K/W and °C/W (thermal resistance), W/(m·K), /K and ppm/K, %, ppm, A/m², A/cm², A/mm², Ω·m and µΩ·cm, Ohm/ohms/Ω.
- **Locale:** `.` is the only decimal separator. Decimal commas (`1,5`), a 3-digit comma group (`1,000` → "ambiguous ... remove the thousands separator, or use '.'") and space/thin-space grouping (`1 000`) are rejected with a message, never reinterpreted.
- **Errors:**
  - Unknown units get a "Did you mean" hint within one edit, restricted to the field. Otherwise the message lists the units accepted in the field.
  - A wrong dimension also lists the accepted units.
- **Zero, `-0` and underflow** (`1e-400 mm`) parse to 0 by design. Calculators must guard (R-13).

`parseQuantityDetailed(text, expectedDim?)` accepts exactly what `parseQuantity` accepts and returns the same value, plus `warnings: string[]`. Warnings never change validity. Current plausibility warnings:
- capacitance "MF"/"M": megafarad, while older parts mean µF;
- capacitance "mF"/"m": millifarad;
- resistance "m": milliohm;
- voltage ≥ 1 kV;
- length > 1 m;
- current > 1000 A;
- resistivity outside 1e-9 to 1e-3 Ω·m.

Use it for every user input field so the warnings reach the UI.

`parseFraction(text)` is for duty cycle, efficiency and ratios.
- It accepts "50%" or "0.5" and returns a plain number in (0, 1].
- A bare number above 1 is rejected as ambiguous ("write 50% or 0.5"). So are ≤ 0 and > 100 %.
- Use it, not `parseQuantity` with a dimensionless field, wherever the value is a fraction (calc m-10f).

`describeParsed(value, expectedDim?, prefs?)` is the parsed echo shown next to an input, e.g. "= 0.254 mm (length)", "= 10 Δ°C (temperature rise)", "= 4.7 kΩ (resistance)".
- It prints with `formatFor` at **nearest** and fab resolution.
- Known weaknesses:
  - Dimensionless values always echo as a percent, so εr 4.5 → "450 % (ratio)" (G4-a).
  - Thin copper echoes in mm ("17.5 um" → "= 0.017 mm"), until per-role units arrive (G4-c).

## Display (`src/core/units/display.ts`)
`formatFor(q, { prefs?, accuracyClass?, unit?, round? })` converts at the UI boundary only.
- **Prefs:** `DisplayPrefs = { length: 'mm'|'mil'|'um', temperature: 'C'|'K'|'F', area: 'mm2'|'mil2' }`. The default `DEFAULT_DISPLAY_PREFS` is mm / °C / mm². `unit` overrides the prefs per field.
- **Engineering prefixes,** with roll-over, for Ω, Ω·m, A, V, W, Hz, F, H, s and g (mass stops at grams). ΔT prints with Δ and no offset.
- **Fixed decimals (fab resolution)** for geometry and temperatures, regardless of accuracy class:
  - length: mm 3, mil 2, µm 1 decimals;
  - area: mm² 4, mil² 2;
  - absolute temperature and ΔT: 1 decimal (°C, °F, K).
- **Every other dimension** uses significant figures from `sigFigsFor(accuracyClass)`: exact 6, analytical 4, empirical 3, estimate 2. Without a class it uses 6.
- **Direction:** `RoundDirection = 'up' | 'down' | 'nearest'` (default `'nearest'`).
  - `'up'` never prints below the SI value; `'down'` never above it (toward ±∞).
  - This also holds across prefix roll-over ("999.6 mA" min → "1 A") and on grid values: a value on the grid is parsed back and stepped if needed.
- `roundDirectionFor(bound)`: `min-requirement` → up, `prediction` → up, `max-capacity` → down, `nominal` → nearest.
- **Absolute-zero clamp:** near 0 K, a nearest or down print that would read below 0 K is clamped to absolute zero in the display unit (e.g. "-273.15 °C", "-459.67 °F").
- `formatDual(q, { prefs?, round?, accuracyClass? })`:
  - Length prints as "<mm> (<mil>)" and area as "<mm²> (<mil²>)". **Each half is rounded from the SI value independently**, never mil from rounded mm.
  - Other dimensions fall through to `formatFor`.
- **Errors and gaps:**
  - `formatFor` throws `InvalidValueError` on non-finite input.
  - Lengths ≥ about 1.8e305 m also throw, and huge lengths print very long digit strings (G1-e, unreachable in practice).
  - K prints with 1 decimal, so 298.15 K echoes as "298.1 K" (G1-d).
  - DENSITY has no display rule (calc m-7).
- Never store display units. Conversion happens only at the UI boundary.

## HEADLINE numbers: only through `src/core/format-result.ts`
Every result, design value, margin or utilisation shown to the user goes through these helpers. They take **no `round` override** (no way to ask for `'nearest'`) and **`accuracyClass` is required**, so safe rounding is not opt-in. `formatFor`/`formatDual` directly are for input echoes and non-headline text only.
- `formatResult({value, bound}, {accuracyClass, prefs?})` uses the direction from `roundDirectionFor(bound)`. Length and area print dual (mm and mil).
- `formatDesignValue(dv, 'calculated' | 'recommended', opts)` gets its direction from `dv.direction`, via `boundForDesignDirection`: `max-limit` → `max-capacity` → down; `min-requirement` → up.
- `formatMargin(element, opts)`:
  - It always rounds down (pessimistic).
  - It adds an explicit `+` on non-negative margins and appends "(over limit)" when the margin is negative.
  - Open (G1-c): the mm and mil halves of a dual print can still disagree near zero, and the `+` sits only in front of the mm half.
- `formatUtilisation(u)`:
  - Percent with one decimal, rounded **up**.
  - A utilisation below 1 never prints as 100 % or more; decimals are added instead.
  - Throws on non-finite input.
- `HEADLINE_FORMATTERS` lists the four, for tests.
- Comparisons and pass/fail use SI values, never printed strings.

## Tests
Cover the following:
- round trips, associativity, mil↔mm exactness;
- °C/ΔT offsets;
- locale rejection, bare-prefix refusal per field, fraction and K hints;
- directional property tests: no printed minimum below its SI value, no printed capacity above it;
- every directional print re-parses.
