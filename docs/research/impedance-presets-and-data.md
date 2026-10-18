# Impedance presets, laminate data, reference cases, delay and loss (Phase 2, part B)

Date: 2026-10-18 (standards-researcher). Quotes, URLs and how each source was read are in `docs/sources/notes/impedance-presets-and-data.md`. Ledger rows: S-026 … S-026g, S-027, S-027a, S-028, S-028a, S-029, S-029a … S-029f.

**S-030 is reserved for Phase 3**, so the extra rows requested as "S-029.." are S-029 and its sub-rows S-029a … S-029f. Nothing here is from memory. Where no source was read, this document says so.

## Ledger status at a glance
| ID | Item | Status |
|---|---|---|
| S-026 | USB 2.0 HS differential target 90 Ω | VERIFIED (number as design target) |
| S-026a | USB 2.0 tolerance (±15 % vs ±10 %) | CONFLICT |
| S-026b | USB 3.x SuperSpeed (90 Ω ±7 % / ±7 Ω vs 95 Ω ±5 %) | CONFLICT |
| S-026c | LVDS 100 Ω differential target and 100 Ω termination | VERIFIED (nominal only) |
| S-026d | CAN 120 Ω cable and termination | VERIFIED (nominal only) |
| S-026e | RS-485 120 Ω cable and termination | UNVERIFIED (second source probably derived from the first) |
| S-026f | Ethernet 10/100/1000BASE-T MDI 100 Ω ±10 % | VERIFIED |
| S-026g | PCIe, HDMI, SATA, MIPI CSI, eUSB2 (single source, device-specific) | UNVERIFIED |
| S-027 | FR-4 class Dk/Df ranges and frequency dependence | UNVERIFIED (manufacturer data) |
| S-027a | JLCPCB stackup Er values | UNVERIFIED (fabricator data) |
| S-028 | Public reference cases | UNVERIFIED (pointer row) |
| S-028a | Human-run cross-check tools and their inputs/outputs | UNVERIFIED (pointer row) |
| S-029 | c = 299 792 458 m/s exactly | VERIFIED |
| S-029a | t_pd = √εe/c, vp = c/√εe, λg = λ0/√εe | VERIFIED |
| S-029b | skew = ΔL·√εe/c | UNVERIFIED (derived) |
| S-029c | λ/4 helper and antenna caveat | UNVERIFIED |
| S-029d | α ≈ R′/(2Z0) + G′Z0/2, Np→dB | VERIFIED (approximation) |
| S-029e | Dielectric loss α_d (filling-factor form) | UNVERIFIED |
| S-029f | Conductor skin-effect loss α_c ≈ Rs/(Z0·w) | UNVERIFIED |

## 1. Protocol presets: what can be offered and how to label it

Rules for every preset:
1. Every preset is an **overridable design target**. It stores: source document and revision, retrieval date, the value as printed, the tolerance as printed, and what the value applies to (PCB trace, cable, connector, termination resistor).
2. Label text: "Design target per <source>, <date>. Not a compliance statement; the interface standard was not read." No preset may produce the words "compliant"; gate rule CLAUDE.md 2.
3. Presets never change εr, Df, geometry or the stackup. They only set the target Z and tolerance band used for pass/fail colouring and width synthesis.
4. Show the mandatory banner on every result (from the `impedance-models` skill).

| Preset | Target (applies to) | Tolerance offered | Ledger | Suggested label |
|---|---|---|---|---|
| USB 2.0 HS (DP/DM) | 90 Ω differential, PCB trace | user picks: ±15 % (NXP AN13462 "USB2.0 specification specifies", Prolific) or ±10 % (TI SPRAAR7J device tables); no default until Q-10 | S-026 VERIFIED; S-026a CONFLICT | "90 Ω diff. design target (TI, NXP, Prolific app notes). Tolerance sources disagree." |
| USB 3.x SuperSpeed | 90 Ω (TI AM57x/KeyStone II; Prolific) **or** 95 Ω (TI AM65x/AM64x), PCB trace | as printed by the chosen source: ±7 % / ±7 Ω / ±5 % | S-026b CONFLICT | "Device-specific: check your SoC/PHY layout guide." Offer only if Q-11 says yes |
| LVDS | 100 Ω differential PCB trace; 100 Ω termination resistor | no PCB tolerance published; show TI interconnect band 90–130 Ω and National termination 90–120 Ω as information | S-026c VERIFIED (nominal) | "100 Ω nominal (TI SLLA014A, National AN-971/AN-1035). TIA/EIA-644 not read." |
| CAN (HS, ISO 11898-2) | 120 Ω cable Z0 and 120 Ω termination at each bus end | none published in read sources | S-026d VERIFIED (nominal) | "Termination/cable preset, not a PCB controlled-impedance requirement." |
| RS-485 | 120 Ω cable Z0 and 120 Ω termination at each end | none | S-026e UNVERIFIED | same wording as CAN, plus the unverified badge |
| Ethernet 10/100/1000BASE-T MDI | 100 Ω differential, PCB PHY to magnetics to RJ45 (Renesas also 50 Ω to GND) | ±10 % (both sources) | S-026f VERIFIED | "100 Ω ±10 % design target (TI SNLA387, Renesas R19AN0014). IEEE 802.3 not read." |
| PCIe / HDMI / SATA / MIPI CSI / eUSB2 (optional) | see note S-026g table | as printed | S-026g UNVERIFIED | Offer only as "TI <family> guideline" with the device family named, if Q-14 says yes |

What must **not** be offered:
- A universal "USB 3 = 90 Ω ±7 %" or "PCIe = 85 Ω". No read source gives PCIe 85 Ω: TI prints 100 Ω or 95 Ω, device-dependent.
- DisplayPort: no value read.
- CAN or RS-485 as tight PCB impedance targets. Both read sources treat them as cable and termination values.

## 2. Laminate data (S-027, S-027a)

Findings:
- No single "FR-4 εr" exists. The read sources span 3.8 … 5.3 for Dk and 0.002 … 0.025 for Df, depending on product, resin content and frequency.
  - Isola 370HR: 4.24 at 100 MHz to 3.92 at 10 GHz; Df 0.0150 to 0.0250.
  - Shengyi S1000-2M: 4.49 or 4.6 at 1 GHz, 4.9 at 1 MHz (two data sheet versions disagree); Dk falls with resin content.
  - National AN-1035: FR-4 4.1–5.3.
  - TI SLLA323: 4.1–4.5.
- Laminate Dk depends on glass style, because resin content differs. JLCPCB uses 7628 4.4, 2116 4.16, 3313 4.1, 1080 3.91, core 4.6, all without a stated frequency or Df.
- A datasheet "process" Dk may not be the right modelling value. Rogers RO4350B: process 3.48 ± 0.05 at 10 GHz vs design Dk 3.66 for 8–40 GHz.

Policy (required by the task, recorded here for the implementer):
1. **The app must never pre-fill εr or Df.** The user either types them or picks a preset.
2. Every material preset carries: source, product, data sheet revision, test frequency, test method, resin content or glass style where given, and retrieval date. It is shown with the UNVERIFIED badge (S-027 / S-027a).
3. Every material preset shows the line "The fabricator's stackup εr is what matters; confirm with your fabricator."
4. Where a source gives several frequencies (Isola), store the table. Do not interpolate silently: either use the value at the nearest listed frequency with a note, or interpolate with a visible "interpolated" assumption (Q-15).
5. Candidate presets (Q-15):
   - "JLCPCB stackup, retrieved 2026-10-18" per glass style;
   - "Isola 370HR @ 1 GHz" and "@ 10 GHz";
   - "Shengyi S1000-2M @ 1 GHz (US sheet rv1-2/17)";
   - "Rogers RO4350B design Dk 3.66".
   Each needs a dated browser re-read before shipping.

## 3. Delay, wavelength, skew, quarter-wave (S-029 … S-029c)

- c is exact (S-029). Use c = 299 792 458 m/s, never 3e8, 0.0118 in/ps or 85 ps/in.
  - App-note constants differ from exact: TI 85 ps/in is +0.32 %; National 0.0118 in/ps is +0.02 %. Show them as cross-check differences only (Q-16).
- Delay t_pd = √εe/c, phase velocity c/√εe, guided wavelength λ0/√εe. All three use the εe of the selected model (S-020 etc.) and inherit its badge.
- Skew = |ΔL|·t_pd. Derived (UNVERIFIED). Warn:
  - both traces must have the same εe (same layer and structure);
  - fiber weave adds skew that the formula cannot see (TI SPRAAR7J §2.1);
  - microstrip and stripline segments must be summed separately.
- Quarter-wave helper: output λ0/4 and λg/4 **for a transmission-line stub only**. For antennas, show a warning and no length. EnOcean AN102 uses a 0.75 factor (εe ≈ 1.78) that is unlike any microstrip εe, and its own example is inconsistent (6.48 vs 6.2 cm). Warning text proposal: "λ/4 from free space or from a line εe is not an antenna length. Geometry, substrate, ground plane size, enclosure and end effects decide resonance; tune by measurement."

## 4. Approximate loss estimate (S-029d … S-029f)
Recommended content, all labelled **"approximate"** with the unverified badge where applicable:
- Total α ≈ α_c + α_d (Np/m), shown in dB/m and dB/in with 8.685890 dB/Np (S-029d).
- Dielectric: α_d = (ω/c)·tanδ·εr(εe−1)/(2√εe(εr−1)) (Steer eq. 26).
  - Homogeneous lines (stripline, coax): α_d = π f √εr tanδ / c.
  - Researcher shortcut: 2.312 dB/in per (GHz·tanδ·√εr) for a homogeneous line.
  - tanδ and εr must be the values at the analysis frequency. No accuracy figure was found in any read source.
- Conductor: α_c ≈ Rs/(Z0·w) with Rs = √(π f μ0 ρ(T)), from S-013 and S-004.
  - Assumes a wide strip, smooth copper, t > 3δ, and no current crowding.
  - Roughness (Hammerstad K_r) and current distribution (K_i) are tier 4 only (Qucs). Do not include them unless Q-17 decides so.
  - The result is optimistic for narrow traces and rough foil.
- Show inputs used: f, tanδ at f, εr at f, ρ and temperature, w, Z0, εe.

## 5. Worked reference cases (for test-first work)
Use only cases whose published output is consistent with its own inputs. Golden vectors for the others come from the oracle. Full table with sources: note S-028.

| # | Use as | Case | Expected (source) | Status |
|---|---|---|---|---|
| R1 | golden vector (tolerance per Q-1 prefactor) | Microstrip w 600 µm, h 635 µm, εr 4.1 | εe ≈ 2.967, Z0 ≈ 75.3 Ω (Steer §3.5 Ex. 2) | usable |
| R2 | golden vector | εe 2.967, 5 GHz | β = 180.5 rad/m (Steer); λg 34.809 mm, t_pd 5.7457 ps/mm (researcher) | usable |
| R3 | solver-seed test | Z0 75 Ω, εr 5.6, h 500 µm | w/h 0.704, εe 3.82 (Steer §3.6) | seed only |
| R4 | elliptic ratio test | k 5/9 | K/K′ ≈ 0.833 (Steer §3.8) | usable with k only |
| R5, R6 | legacy mode tests | AN2536 microstrip and stripline | ≈ 50 Ω (49.80, 49.44 with ln) | usable as "≈" |
| R7 | **do not use** | AN-1035 microstrip 12/8.1/1.4 mil, Er 4.5 | "50Ω" printed; formula gives 53.05 Ω | inconsistent |
| R8 | sanity only | Ellingson FR-4 h 1.575 mm, εr 4.5, W ≈ 3.15 mm | "≈ 50 Ω" (H-J 48.23 Ω) | rough |
| R9 | skew test (with the source's own 85 ps/in model) | εr 3.66, skew 49.6 ps | 376.001 mil (TI SLLA323) | usable to test the conversion only |
| R10 | **do not use** | EnOcean 868 MHz monopole | "≈ 6.2 cm" printed vs 6.48 cm from its own numbers | inconsistent; warning text only |

No public field-solver result with stated geometry was found. Field-solver cross-checks therefore remain a human task (Q-19).

## 6. Human-run cross-checks: what is available (S-028a)
For a later worksheet like `docs/validation/crosscheck-phase1.md`:

| Tool | What it can check | Inputs exposed | Outputs | Notes |
|---|---|---|---|---|
| X-01 KiCad TransLine (9.0.9 docs) | microstrip, CPW, CPWG, coax, coupled microstrip, stripline, twisted pair, rectangular waveguide | substrate, frequency, physical dimensions (field names not in the docs; record from the app) | Z0 / Zodd / Zeven, electrical length, εeff and losses (from app; not in docs) | microstrip cites Atwater 1989 and coupled microstrip cites Kirschning-Jansen 1984. Frequency-dependent models, so compare at a low frequency (e.g. 1 MHz) for quasi-static cases. Record the version |
| X-02 Qucs(-S) transcalc | microstrip, rectangular waveguide, coax, coplanar, coupled microstrip; analysis and synthesis | per dialog (not documented in the man page) | per dialog | the Qucs tech. doc is the formula reference (tier 4) |
| X-04 rf-tool (Python, `pip install rf-tool`) | microstrip only: H-J static, H-J effective width, shielded microstrip, Yamashita and K-J dispersion | h, w, t, e_r, f, enclosure a/b | Z, w_eff | needs human approval to install and run (rule 15) |
| X-06 rftools-mcp (optional) | microstrip (H-J), stripline variants, differential pair, CPW/GCPW | via `get_calculator_schema` | not in README | `npx -y rftools-mcp`; not approved; network behaviour not reviewed |
| JLCPCB impedance calculator (web) | width synthesis on JLC stackup templates only | layers, thickness, copper, target Z, spacing, gap, layer, reference layers | width, ranked stackups | no εr, Df or frequency input; compare "our width on stackup X" only |
| X-07 university calculators | spot checks | per page | per page | `obtainedBy: human` |

## 7. Questions needing a human decision
- **Q-10:** USB 2.0 tolerance. Default ±15 % (NXP and Prolific, attributed to the spec), ±10 % (TI device tables), or no default (user must pick)? Recommendation: no default; show both with sources.
- **Q-11:** USB 3.x. Offer at all? If yes, as two labelled variants (90 Ω TI AM57x/Prolific; 95 Ω TI AM65x/AM64x)? Or leave it to user entry with a pointer to the SoC guide?
- **Q-12:** RS-485. Accept TI SLLA272D + Renesas R15AN0014 as two sources (the Renesas text appears derived from TI), keep UNVERIFIED, or ask someone to read ADI AN-960 in a browser?
- **Q-13:** CAN and RS-485. Show them in the impedance calculator as "termination/cable" presets, or only in a separate termination helper, or not at all?
- **Q-14:** Optional single-source presets (PCIe, HDMI, SATA, MIPI CSI, eUSB2) from TI SPRAAR7J and NXP AN13462. Offer them with device-family labels, or omit them in Phase 2?
- **Q-15:** Material presets. Which to ship (JLCPCB stackup, Isola 370HR, Shengyi S1000-2M, RO4350B design Dk)? Single value at a stated frequency, or the frequency table with labelled interpolation? Which Shengyi sheet revision?
- **Q-16:** Delay constant. Confirm exact c (S-029) everywhere. App-note constants (85 ps/in, 0.0118 in/ps) appear only as cross-check notes.
- **Q-17:** Loss estimate scope. Smooth-copper α_c plus α_d only (recommended), or also the tier-4 Hammerstad roughness K_r and current factor K_i with a "tier-4 source" badge? Also decide whether S-029e (one tier-2 source) may drive a displayed number with the unverified badge.
- **Q-18:** Quarter-wave helper. Confirm "transmission-line stub only, antenna = warning without a length".
- **Q-19:** Cross-checks. Which tools will a human run for Phase 2 (X-01, X-02; X-04 needs pip approval; X-06 needs npx approval)? Is any field solver available to the human (none public found)? Is the JLCPCB web calculator acceptable as a human reference for the JLC stackup case?
- **Q-20:** Golden vectors from published examples. Promote R1, R2, R4, R5, R6 and R9 (tolerances chosen before running); exclude R7 and R10 (internally inconsistent) and R8 (approximate only). Agree?
