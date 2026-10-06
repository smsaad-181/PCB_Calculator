# Original master prompt (from the user, as received; text ends mid-section 15)

> **Where this conflicts with `SPEC.md` or `CLAUDE.md`, those win.** Known corrections are listed in `SPEC.md` §Corrections to the original prompt.

Build a professional **PCB Engineering Calculator Suite** for PCB designers, electronics engineers, hardware engineers, students, and manufacturing engineers.

The application must prioritize **engineering correctness, traceability of formulas, unit consistency, manufacturer-specific constraints, and safety** over visual complexity.

Do not present a calculated value as "IPC compliant", "IEC compliant", or "production safe" unless the calculation actually satisfies the applicable standard and all required parameters have been provided.

Every calculator must identify: Calculation method; Standard/reference; Formula; Inputs; Units; Assumptions; Calculation steps; Result; Engineering recommendation; Warning/limitation; Confidence level where appropriate.

## 1. REFERENCE AND STANDARDS HIERARCHY
Primary references: KiCad PCB Calculator documentation/source; IPC-2221C; IPC-2152; IPC-7351; IPC-2222; IPC-2223; IPC-2228; IPC-2231; IEC 60664-1:2020+AMD1:2025; Applicable JESD thermal standards; Component manufacturer datasheets/application notes; PCB manufacturer published fabrication capabilities.
Do not treat all standards as interchangeable: IPC-2152 → current-carrying capability methodology; IPC-2221C → generic PCB design requirements; IPC-7351 → SMT land-pattern design; IEC 60664-1 → insulation coordination; Manufacturer datasheet → actual component limits; PCB fabricator stackup/capability → final impedance and manufacturing constraints. Where a standard is obsolete, superseded, or no longer maintained, clearly label it.

## 2. UNIT ENGINE
Support: mm, mil, inch, µm, cm, m, oz/ft² copper, AWG, mm², °C, °F, A, mA, V, mV, W, mW, Ω, kΩ, MΩ, pF, nF, µF, pH, nH, µH, mH, GHz, MHz, kHz, Hz. Provide automatic conversion and internal SI-unit normalization. Never mix units internally.

## 3. TRACE WIDTH / CURRENT CAPACITY
Mode A — IPC-2152-based. Inputs: current, required temperature rise, external/internal layer, copper thickness, trace width or target current, copper weight, optional board construction information. Outputs: required trace width, current capacity, temperature rise, resistance, voltage drop, power loss.
Mode B — Legacy IPC-2221/KiCad-compatible, for compatibility/reference comparison only. The interface must clearly state it is the legacy method. Do not silently substitute one method for another.
Advanced trace calculation: continuous current, peak current, duty cycle, ambient temperature, maximum conductor temperature, copper thickness, trace length, external/internal layer, adjacent copper/plane information, cooling condition. Display both **Calculated thermal limit** and **Recommended engineering design value**. Do not claim that temperature-rise calculation alone proves PCB reliability.

## 4. TRACE RESISTANCE
R = ρL/A, with temperature-dependent copper resistance. Inputs: length, width, copper thickness, copper conductivity/resistivity, temperature. Outputs: cross-sectional area, resistance, voltage drop, power dissipation, resistance at operating temperature. Allow copper conductivity to be customized.

## 5. VOLTAGE DROP / POWER LOSS
V = IR; P = I²R; P = V²/R; P = VI. Inputs: current, voltage, resistance, trace dimensions, cable dimensions, connector resistance. Outputs: resistance, voltage drop, percentage voltage drop, load voltage, power loss.

## 6. COPPER WEIGHT / THICKNESS
Convert 0.5, 1, 1.5, 2, 3, 4 oz and custom to µm, mm, mil. Display **Nominal copper thickness** and **Finished-copper caution** because fabrication can make finished copper differ from nominal foil. Never assume "1 oz" means an exact finished trace thickness.

## 7. VIA CALCULATOR
Inputs: finished hole diameter, drill diameter, pad diameter, annular ring, copper plating thickness, via barrel length, PCB thickness, applied current, number of parallel vias, thermal condition. Outputs: barrel cross-sectional area, via resistance, voltage drop, power loss, estimated current capability, number of vias required, equivalent parallel resistance. Separate modes: electrical via, thermal via, high-current via-array, thermal-via-array. Do not claim a universal via current rating from hole diameter alone.

## 8. ANNULAR RING / DRILL CALCULATOR
Annular Ring = (Pad Diameter − Finished Hole Diameter) / 2. Support PTH, NPTH, via, blind, buried, microvia. Inputs: drill tolerance, plating allowance, hole tolerance, pad diameter, fabricator capability. Outputs: minimum, nominal, worst-case annular ring, manufacturing warning.

## 9. PCB CLEARANCE CALCULATOR
Two separate methods: IPC spacing reference; IEC 60664-1 insulation coordination. Inputs: working voltage, AC RMS, AC peak, DC, repetitive peak where applicable, transient/impulse voltage, overvoltage category, pollution degree, material group/CTI, altitude, insulation type (functional, basic, supplementary, reinforced). Outputs: required clearance, recommended clearance, required creepage, recommended creepage, altitude correction, warning when additional product standards may apply. Never calculate creepage from voltage alone. Indicate that IEC 60664-1 is an insulation-coordination framework and product-specific standards may impose additional requirements.

## 10. CREEPAGE CALCULATOR
Dedicated. Inputs: working voltage, pollution degree, material group, CTI, overvoltage category, insulation type, altitude, frequency. Outputs: minimum creepage, recommended creepage, clearance comparison, required safety margin. Special handling for grooves, slots, ribs, surface paths where supported. Do not treat soldermask as automatically equivalent to conformal coating.

## 11. CONTROLLED IMPEDANCE
Single-ended microstrip; single-ended stripline; edge-coupled differential microstrip; edge-coupled differential stripline; coplanar waveguide; CPW with ground; coaxial reference. Inputs: target impedance, trace width, spacing, copper thickness, dielectric height, dielectric constant, loss tangent/Df, frequency, soldermask, reference-plane configuration. Outputs: characteristic impedance, differential impedance, trace width, spacing, propagation delay, approximate effective dielectric constant. Presets 50, 75, 90, 100 Ω and custom. Use analytical equations appropriate to the geometry. Label results approximate. Include: **Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data.**

## 12. DIFFERENTIAL PAIR
USB, USB 3.x, LVDS, CAN, RS-485, Ethernet, generic. Calculate differential impedance, trace width, pair spacing, propagation delay, length, length mismatch. Do not invent a universal impedance value for a protocol. Protocol presets with manual override.

## 13. RF / TRANSMISSION LINE
Wavelength, quarter-wave, half-wave, electrical length, guided wavelength, effective dielectric constant. Inputs: frequency, PCB dielectric constant, stackup, trace geometry. For PCB antennas, distinguish **free-space wavelength** from **guided/effective wavelength** and include an antenna-design warning. Do not present λ/4 as a final production antenna dimension without accounting for geometry, substrate, ground plane and end effects.

## 14. TRANSMISSION-LINE CALCULATOR
Models for microstrip, stripline, coupled microstrip, CPW, CPWG, coax, twisted pair. Provide impedance, propagation velocity, delay, electrical length, loss estimate where supported. Document the mathematical model used for every topology.

## 15. PCB THERMAL CALCULATOR
Provide engineering estimates for: trace heating
[TEXT ENDS HERE in the original. Phase 4 must define the rest: via/exposed-pad thermal, component θJA/θJC estimates, copper-area spreading. Ask the human to confirm scope before building.]
