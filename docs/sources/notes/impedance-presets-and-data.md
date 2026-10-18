# Impedance presets, laminate data, reference cases, delay and loss (S-026 … S-029f)

Phase 2 research pass, part B. Retrieved 2026-10-18 (standards-researcher). Model selection and human decisions are in `docs/research/impedance-presets-and-data.md`; ledger rows are S-026 … S-026g, S-027, S-027a, S-028, S-028a, S-029, S-029a … S-029f.

S-030 is reserved for Phase 3, so every extra Phase 2 row is a sub-row of S-029.

## How the sources were read
- **No shell was available.** Nothing was downloaded into a scratch directory by me, and no Python or pdftotext ran.
- **"PDF, read in full"**: WebFetch fetched the PDF and stored a copy in the session's tool-results directory, outside the repo. I then opened it with the file reader, which renders every page as text plus image. Every page was seen.
- **"fetcher"**: an HTML page passed through a summarizing fetcher. I asked it to quote exactly. A summarizer can drop or alter a symbol, so check before a golden vector depends on it.
- **"search snippet"**: seen only in a search-engine summary. Never a basis for a status.
- **Not read (paywalled, too large, or not retrievable):**
  - USB 2.0 specification. A third-party copy (pjrc.com/tmp/usb20.pdf, 5.7 MB) was fetched, but the file reader returned no page text for it. The USB-IF text is free to download; the clause was not identified here.
  - USB 3.x specifications, IEEE 802.3, ISO 11898-2, TIA-485-A, TIA/EIA-644, HDMI, PCIe, MIPI D-PHY: paywalled or member-only, not read.
  - ADI AN-960 "RS-485/RS-422 Circuit Implementation Guide": two timeouts and one ECONNREFUSED. ADI/Maxim "Guidelines for Proper Wiring of an RS-485 Network": three timeouts.
  - TI SNLA187 "LVDS Owner's Manual" (3.2 MB): fetched, not opened (size).
  - All About Circuits loss article: HTTP 403.
  - Nan Ya NP-155F datasheet: no readable copy found.
  - Pozar, Bogatin, Wadell, Johnson & Graham: not read.

---

## S-026 Protocol impedance presets

General finding: every value below is a **design target taken from an application note or layout guide**, not from the interface standard itself. Several notes say what "the specification" requires, but none of the specifications was read. A preset may therefore only say "design target per <source>", never "compliant".

### S-026 USB 2.0 high-speed DP/DM: 90 Ω differential target — VERIFIED (number only)
- TI SPRAAR7J "High-Speed Interface Layout Guidelines" (Nov 2018, rev. Feb 2023), Appendix A, Tables A-1 … A-8. PDF, read in full. https://www.ti.com/lit/an/spraar7j/spraar7j.pdf
  - Quote (Table A-1): "USB2.0 DP/DM pair differential impedance 81 90 99 Ω" (MIN TYP MAX).
  - Same row in every table A-1 to A-8 (AM335x, AM57xx, KeyStone II, AM65xx, AM64x, AM62x, AM62Ax).
  - Single-ended or common-mode row: "40.5 45 49.5 Ω". Table A-1 calls it "common-mode impedance", Table A-2 "single-ended impedance": a labelling inconsistency inside TI's own note.
  - Scope: PCB trace, device-specific SoC layout parameter.
- NXP AN13462 "PTN3222 layout guidelines", Rev. 1.0, 13 Dec 2021, §2.5 and Table 2. PDF, read in full. https://www.nxp.com/docs/en/application-note/AN13462.pdf
  - Quote: "USB2.0 specification specifies 90 Ω ± 15 %".
  - Table 2 "USB2.0 electrical specification": "PCB trace differential impedance" 90 ohm, tolerance 15%.
  - Same note: eUSB2 "85 Ω ±15 %", and it recommends routing 85 Ω for both. That is a device-specific choice.
- Prolific AN-27220901 "PL2731 PCB Layout Guide", Rev. 1.0, 27 Sep 2022, §2. PDF, read in full. https://www.prolific.com.tw/wp-content/uploads/2025/07/AN-27220901_PL2731-PCB-Layout-Guide_EN_V1.0.pdf
  - Quote: "differential impedance of 90±15% ohms".
- Status: three independent manufacturers agree on 90 Ω differential as the PCB trace target. **VERIFIED for the number as a design target.** It is not a compliance statement. The USB 2.0 text itself was not read.

### S-026a USB 2.0 tolerance — CONFLICT
- ±15 % (NXP, attributed to the USB 2.0 specification; Prolific).
- 81 … 99 Ω, i.e. ±10 % (TI SPRAAR7J, device layout tables).
- Spread: ±15 % allows 76.5 … 103.5 Ω; ±10 % allows 81 … 99 Ω.
- Researcher reading, not a quote: TI's narrower band is a stricter device recommendation, not necessarily a different reading of the spec. Do not pick. Human decision Q-10.
- User must check: the USB 2.0 specification (USB-IF, free download), chapter 7 electrical, for the differential characteristic impedance requirement and whether it applies to the cable, the PCB, or both. Clause not identified here.

### S-026b USB 3.x SuperSpeed TX/RX pairs — CONFLICT
- TI SPRAAR7J Tables A-2, A-3 (AM57xx, KeyStone II): "SuperSpeed SSRX or SSTX pair differential impedance 83.7 90 96.3 Ω". That is 90 Ω ±7 %.
- TI SPRAAR7J Tables A-5, A-6 (AM65xx, AM64x): "90.25 95 99.75 Ω". That is 95 Ω ±5 %.
- Prolific AN-27220901 §1: "routed with differential impedance of 90±7 ohms". That is ±7 Ω (83 … 97 Ω), not ±7 %.
- Spread: target 90 Ω vs 95 Ω (5.6 %); tolerance ±7 % vs ±7 Ω vs ±5 %.
- The USB 3.x specifications were not read. A search snippet (billauer.se blog, tier 5) attributes ±7 Ω to a USB 3.0 spec section; not used.
- Status CONFLICT. Offer only as "90 Ω (TI AM57x / Prolific) or 95 Ω (TI AM65x/AM64x)", user picks (Q-11).

### S-026c LVDS: 100 Ω differential target and 100 Ω termination — VERIFIED (nominal only)
- TI SLLA014A "Low-Voltage Differential Signaling (LVDS) Design Notes" (2000; PDF dated 2001-03-26). PDF, read in full. https://www.ti.com/lit/pdf/SLLA014
  - Quotes: "maintain a controlled differential impedance near 100 Ω" (PCB traces longer than 2 cm); "differential characteristic impedance should be 90 Ω to 130 Ω" (interconnect, at any cut point); Figure 4 termination "RT, 100 Ω, ± 5%".
  - It names TIA/EIA-644 but does not quote it.
- National Semiconductor AN-971 "An Overview of LVDS Technology" (S. Huq, J. Goldie, July 1998), now TI SNLA165. PDF, read in full. https://www.ti.com/lit/an/snla165/snla165.pdf
  - Quotes: "Typically this is between 100Ω–120Ω and is matched to the actual cable"; "single 100Ω termination between the driver outputs".
- National AN-1035 "PCB Design Guidelines for LVDS Technology" (S. Huq, Aug 1996). PDF, read in full (copy on hep.ucl.ac.uk). https://www.hep.ucl.ac.uk/~mp/ELECTRONICS/LVDS_PCBs_App_note_AN-1035.pdf
  - Quote: "require a termination resistor with a range of 90Ω to 120Ω"; recommends ±1 % resistors.
- Independence: TI SLLA014A (TI, 2000) and the National notes (1996/98) had different authors and companies; TI acquired National later (2011). AN-971 and AN-1035 share an author and are not independent of each other.
- Status: 100 Ω nominal **VERIFIED as a design target**. Ranges differ (interconnect 90–130 Ω TI; termination 90–120 Ω National; cable 100–120 Ω National). These are cable and termination ranges, not a PCB trace tolerance. No public PCB tolerance found. TIA/EIA-644 not read.

### S-026d CAN (ISO 11898-2 high-speed): 120 Ω cable and termination — VERIFIED (nominal only)
- TI SLLA270 "Controller Area Network Physical Layer Requirements" (S. Corrigan, Jan 2008), §4. PDF, read in full. https://www.ti.com/lit/an/slla270/slla270.pdf
  - Quotes: "twisted-pair with a 120-Ω characteristic impedance (ZO)"; "terminated at both ends with 120-Ω resistors"; "1/4 W 5% tolerance resistors are generally acceptable".
  - Split termination: "two ~60 Ω ±1% termination resistors".
  - Connectors "should have a characteristic impedance matching that of the bus line".
- Microchip AN228 "A CAN Physical Layer Discussion" (P. Richards, DS00228A, 2002, "Preliminary"). PDF, read in full (copy on cs.hs-rm.de). https://www.cs.hs-rm.de/~kaiser/1313_canacademy/Microchip_AN228_A%20CAN%20Physical%20Layer%20Discussion.pdf
  - Quotes: "requires 120Ω (nominal) terminating resistors at each end of the bus"; "nominal characteristic line impedance of 120Ω".
- Status: two manufacturers agree. **VERIFIED as a nominal cable/termination target**, secondhand from ISO 11898. Neither gives a cable impedance tolerance. ISO 11898-2 not read: the user must check its bus-line characteristic impedance and terminating-resistor ranges.
- Domain note (both sources): CAN is a terminated twisted-pair bus. The PCB part is usually short; it is not a tight PCB controlled-impedance interface. Offer it as a termination/cable preset.

### S-026e RS-485: 120 Ω cable and termination — UNVERIFIED
- TI SLLA272D "The RS-485 Design Guide" (T. Kugelstadt, Feb 2008, rev. May 2021), §5, §6. PDF, read in full. https://www.ti.com/lit/an/slla272d/slla272d.pdf
  - Quotes: "characteristic impedance of 120" (the extracted text renders Ω as "W"); "RS-485 standard recommends cables with Z0 = 120"; "commonly terminated with 120-Ω resistors, one at each cable end".
- Renesas R15AN0014EU0100 "RS-485 Design Guide", Rev. 1.00, 12 Sep 2023, §5, §6. PDF, read in full. https://renesas.com/en/document/apn/rs-485-design-guide-application-note
  - Quotes: "twisted pair cable with a characteristic impedance of 120Ω"; "usually terminated with 120Ω resistors, one at each end".
- Why UNVERIFIED: the Renesas text follows the TI guide very closely, including the 60 Ω split termination with "1% precision" vs "20%", the Z′ > 0.4·Z0 rule and the "5.25" node-spacing equation. It is probably derived from TI. Independence is therefore doubtful.
- A third source was not retrievable (ADI AN-960, ADI/Maxim wiring article). A search snippet of the ADI article says the standard "recommends, but does not specifically dictate" 120 Ω. Not used.
- TIA-485-A not read. Same domain note as CAN: termination/cable preset, not tight PCB controlled impedance. Human decision Q-12.

### S-026f Ethernet 10/100/1000BASE-T MDI: 100 Ω ±10 % differential — VERIFIED
- TI SNLA387 "Ethernet PHY PCB Design Layout Checklist" (L. Woodahl, June 2021). PDF, read in full. https://www.ti.com/lit/pdf/snla387
  - Quote: "a 100 Ohm differential with a +/- 10% control".
  - It adds that MDI impedance "may need to be adjusted to match the impedance of the cable". MII single-ended: "50 Ohms +/- 10%".
- Renesas R19AN0014ED0102 "Industrial Ethernet PHY, Layout recommendations and design rules" (uPD60610/11), Rev. 1.2, 1 July 2013, §3.1. PDF, read in full. https://renesas.com/ja/document/apn/industrial-ethernet-phy-r19an0014ed0102-rev102
  - Quote: "differential impedance of 100Ω±10% and with an impedance of 50Ω related to GND".
  - Scope: 10BASE-T/100BASE-TX only, PHY to transformer to RJ45.
- Status: target and tolerance agree. **VERIFIED as a design target** (PCB trace, PHY to magnetics to connector). 1000BASE-T is covered by TI only. IEEE 802.3 not read.
- A search snippet shows a Microchip MCU datasheet recommending 100 Ω ±5 %. Not read, not used.

### S-026g Optional presets (PCIe, HDMI, SATA, MIPI CSI-2/D-PHY, eUSB2) — UNVERIFIED
Single public source for each, from TI SPRAAR7J Appendix A (PDF, read in full), plus NXP AN13462 for eUSB2:

| Interface | Value (MIN TYP MAX) | TI table | Note |
|---|---|---|---|
| PCIe RX/TX differential | 90 100 110 Ω | A-2, A-3, A-4 | AM57xx, KeyStone II |
| PCIe RX/TX differential | 90.25 95 99.75 Ω | A-5, A-6 | AM65xx, AM64x: **device-dependent conflict** (100 vs 95 Ω) |
| PCIe single-ended | 51 60 69 Ω | A-2 … A-4 | |
| SATA differential | 85 100 115 Ω | A-2, A-3 | |
| HDMI TMDS differential | 90 100 110 Ω | A-2 | |
| SGMII differential | 90.25 95 99.75 Ω | A-5 | |
| MIPI CSI differential | 85 100 115 Ω | A-7, A-8 | footnote: pairs "must be loosely coupled" |
| MIPI CSI single-ended | 50 Ω typ | A-7, A-8 | |
| eUSB2 PCB differential | 85 Ω, ±15 % | NXP AN13462 Table 1 | attributed by NXP to the eUSB2 spec |

DisplayPort: no value found in a read source (TI SPRACP4 was seen only as a search result). Do not offer these presets as "standard" values; at most "TI <device family> layout guideline". Q-14.

---

## S-027 FR-4 class laminate data — UNVERIFIED (manufacturer and fabricator published)

| Source | Product | Dk (εr) | Df (tan δ) | Test frequency / method | Read |
|---|---|---|---|---|---|
| Isola 370HR data sheet, Rev. B, "Last Updated September 14, 2018" (copy hosted by Epec) | 370HR (Tg 180 °C FR-4) | 4.24 @100 MHz; 4.17 @1 GHz; 4.04 @2 GHz; 3.92 @5 GHz; 3.92 @10 GHz | 0.0150 @100 MHz; 0.0161 @1 GHz; 0.0210 @2 GHz; 0.0250 @5 GHz; 0.0250 @10 GHz | IPC-TM-650 2.5.5.3, 2.5.5.9, Bereskin stripline, 2.5.5.5; resin content not stated | PDF, read in full. https://www.epectec.com/downloads/Isola-370HR-Data-Sheet.pdf |
| Shengyi S1000-2M (US data sheet "S-USA-S1000-2M-rv1-2/17", copy hosted by MCL) | S1000-2M | 4.49 @1 GHz; 4.9 @1 MHz ("SPDR at 56% RC") | 0.016 @1 GHz; 0.015 @1 MHz | IPC-TM-650 2.5.5.9 | PDF, read in full. https://www.mclpcb.com/wp-content/uploads/2021/05/Shengyi-S1000-2M-DS.pdf |
| Shengyi S1000-2M/S1000-2MB (undated Shengyi sheet, copy hosted by a-contract.ru) | same product | 4.6 @1 GHz; 4.9 @1 MHz (spec ≤5.4) | 0.018 @1 GHz; 0.009 @1 MHz (spec ≤0.035) | C-24/23/50, "Specimen thickness: 1.6mm" | PDF, read in full. https://a-contract.ru/fileadmin/datasheets/base-material/S1000-2M.pdf |
| Rogers RO4000 data sheet, "Revised 1592 080322 PUB# 92-004" (2022) | RO4350B (not FR-4) | process 3.48 ± 0.05 @10 GHz/23 °C; **design 3.66** (8 to 40 GHz) | 0.0037 @10 GHz; 0.0031 @2.5 GHz | IPC-TM-650 2.5.5.5 clamped stripline; design Dk by "Differential Phase Length Method" | PDF, read in full. https://www.rogerscorp.com/-/media/project/rogerscorp/documents/advanced-electronics-solutions/english/data-sheets/ro4000-laminates-ro4003c-and-ro4350b---data-sheet.pdf |
| National AN-1035 (1996), Table I, "(Source: DesignSuperCon '95)" | "Epoxy/Glass (FR-4)" | 4.1 – 5.3 | 0.002 – 0.02 | not stated | PDF, read in full |
| TI SLLA323 "SN65LVCP114 Guidelines for Skew Compensation" (Jan 2012) | FR-4 | "between 4.1 and 4.5" | not stated | not stated | PDF, read in full. https://www.ti.com/lit/pdf/slla323 |

Frequency and composition dependence (quotes and readings):
- Isola 370HR: Dk falls 7.5 % from 100 MHz to 10 GHz (4.24 → 3.92). Df rises 67 % (0.0150 → 0.0250). Researcher arithmetic.
- Shengyi graph "Dk and Df relationship with RC under high frequency", 1.1 to 15 (GHz assumed; the axis label says only "Frequency"): Dk falls as resin content rises. The curves run from about 4.7-4.8 at 43 % RC to about 3.8-3.9 at 72 % RC. These are readings of a vendor graph, approximate, **not digitized data**. Do not use them as numbers.
- Shengyi prepreg table: resin content 7628 "44±3" %, 2116 "53±3" %, 1080 "67±3" %, 106 "73±3" %. This is consistent with JLCPCB giving 7628 a higher Er (4.4) than 1080 (3.91) (S-027a). That consistency is an observation, not a verification.
- TI SPRAAR7J §2.1: glass weave "Ɛr is approximately 6" and epoxy "Ɛr is approximately 3", which causes intra-pair skew (fiber-weave effect).
- National AN-1035: "Within a single FR-4 PCB a 10% variation of Er is not uncommon". It also says PCB manufacturers specify Er and Tanδ and to ensure "your PCB manufacturer provides this data".
- Rogers: the design Dk (3.66) differs from the process Dk (3.48 ± 0.05) by 5 %. "The design Dk value decreases by about 0.1 as the core thickness decreases from 0.020” to 0.004”". So **a datasheet Dk is not automatically the value to use in an impedance model**.

CONFLICT inside one product: Shengyi S1000-2M, two data sheets: Dk @1 GHz 4.49 vs 4.6 (2.4 %), Df @1 GHz 0.016 vs 0.018, Df @1 MHz 0.015 vs 0.009. Different revisions and conditions (SPDR at 56 % RC vs 1.6 mm specimen). Do not average.

Status UNVERIFIED: these are product data from single publishers. They are not constants, and "typical FR-4 εr" is not a single value (spread 3.8 … 5.3 across the read sources). **The fabricator's stackup εr (S-027a) is what matters for a given board.** The app must never pre-fill εr or Df unless the user picks a preset that is labelled with its source, product, frequency and date.

## S-027a JLCPCB stackup dielectric values — UNVERIFIED (fabricator published)
- JLCPCB "impedance" stackup page (fetcher, 2026-10-18). https://jlcpcb.com/impedance
  - Prepreg "Dielectric constant": 7628 4.4; 3313 4.1; 1080 3.91; 2116 4.16. "Core dielectric constant" 4.6. "Coating Dielectric CEr" 3.8.
  - Fetcher answer: the page states "no test frequency and no Df for any material" and no test method.
- Same values as recorded on 2026-10-06 in `docs/research/jlcpcb.md` §4a. That file also has: core/prepreg material Nan Ya NP-155F (4–8 L), SYTECH S1000-2M (10+ L); 2-layer Er 4.5 on the capabilities page; "The values provided above are for reference only."
- Status: single publisher, no frequency. Use only in a dated, user-selectable "JLCPCB stackup (retrieved <date>)" preset.
- Cross-observation: JLCPCB lists S1000-2M for 10+ layers. The Shengyi sheets give Dk 4.49 / 4.6 at 1 GHz for the laminate, while JLC uses 3.91 … 4.6 by glass style. The difference is consistent with resin-content dependence. This is an observation; nothing is verified by it.

---

## S-028 Public reference cases for cross-check — UNVERIFIED (pointer row)
Each case is a published output from one source. A case tests our implementation against that source's arithmetic; it verifies no model. Researcher recomputation (my arithmetic, not the source's) is given where I did it.

| # | Case | Inputs | Published output | Source | Researcher recheck / caveat |
|---|---|---|---|---|---|
| R1 | Microstrip H-J (S-020) | w 600 µm, h 635 µm, εr 4.1, t 0 | εe ≈ 2.967, Z0,air ≈ 129.7 Ω, Z0 ≈ 75.3 Ω | Steer §3.5 Example 2 (fetcher; part A) | 2.96710 / 129.737 / 75.318 Ω with prefactor 60 (part A) |
| R2 | Propagation constant from εe (S-029, S-029a) | εe 2.967, f 5 GHz | γ = j180.5 /m | Steer §3.5 Example 2 (fetcher) | ω·√εe/c = 104.7922 × 1.722498 = 180.504 rad/m; λg = 2π/β = 34.809 mm; delay 5.74566 ps/mm |
| R3 | Microstrip synthesis seed (S-020d) | Z0 75 Ω, εr 5.6, h 500 µm | w/h 0.704, εe 3.82 | Steer §3.6 Example 3.6.1 (part A) | seed test only |
| R4 | CPW K/K′ and Z0 (S-023, S-023c) | k = 5/9, εe 6.28 given | K/K′ ≈ 0.833, Z0 ≈ 45.1 Ω | Steer §3.8 Example 3.8.1 (part A) | page geometry inconsistent; use k directly |
| R5 | IPC-2141 microstrip (S-025) | W 8, H 5, T 1.4 mil, εr 4.1 | "≈ 50Ω" | Freescale AN2536 (part A) | 49.80 Ω with ln |
| R6 | IPC-2141 stripline (S-025) | W 9, b 24, T 1.4 mil, εr 4.1 | "≈ 50Ω" | AN2536 (part A) | 49.44 Ω with ln |
| R7 | IPC-2141 microstrip (S-025) | t 1.4, w 12.0, h 8.1 mil, Er 4.5 | "a 50Ω impedance" | National AN-1035 (PDF, read in full) | **53.05 Ω** with ln: 87/√5.91 × ln(48.438/11.0) = 35.787 × 1.48239. 6 % above the published 50 Ω. Do not use as a golden vector |
| R8 | Wheeler-type microstrip, FR-4 | h 1.575 mm, εr 4.5 | "h/W ≈ 1/2 gives Z0 ≈ 50 Ω, so W ≈ 3.15 mm" | Ellingson Vol. 1 §3.11 (fetcher; part A) | rough "≈" only; H-J gives 48.23 Ω at u = 2 (part A) |
| R9 | Skew to length (S-029b) | tPD = 85·√(0.475·3.66 + 0.67) ps/in; skew 49.6 ps | 0.376 in; 376.001 mil; 9.550 mm | TI SLLA323 Table 3 (PDF, read in full) | tPD = 131.914 ps/in; 49.6/131.914 = 0.376001 in. Uses TI's 85 ps/in, not the exact 84.728 (S-029a) |
| R10 | Free-space and "guided" λ at 868 MHz (antenna caveat, S-029c) | εr 4.4, 1.6 mm FR-4, w 1.5 mm | λ0 = 34.5 cm; λE = 0.75 × λ0; L = λE/4 ≈ 6.2 cm | EnOcean AN102 "Antenna Basics", 25 June 2026 (PDF, read in full) | λ0 = 34.538 cm; 0.75 × 34.538/4 = **6.48 cm, not 6.2 cm**: internal inconsistency (4.5 %). Do not use as a vector; use only for the warning |
| R11 | Dielectric loss (S-029e) | — | none found | — | No published numeric example of α_d was read. Test against the formula only |
| R12 | Coax (S-024) | — | none found | — | part A: no source example read |

Not found: any public field-solver result (2D/3D solver output) with stated geometry. Sierra Circuits' and Polar's calculators were not read (reference-systems survey only mentions them). The Rogers stripline note (Pub. 92-311, re-read 2026-10-18, 2 pp.) no longer contains its tables; it only gives formulas and says tables can be generated from them.

## S-028a Human-run cross-check tools: what each exposes — UNVERIFIED (pointer row)
Read from public docs and READMEs only; no code read, nothing run.
- **X-01 KiCad PCB Calculator, "TransLine" tab.** KiCad 9.0 docs (fetcher; "KiCad 9.0.9", doc rev 152cd19e). https://docs.kicad.org/9.0/en/pcb_calculator/pcb_calculator.html
  - Line types: "Microstrip line", "Coplanar wave guide", "Coplanar wave guide with ground plane", "Rectangular waveguide", "Coaxial line", "Coupled microstrip line", "Stripline", "Twisted pair".
  - Models cited: microstrip "H. A. Atwater ... Microwave Journal, Nov. 1989"; coupled microstrip adds Kirschning-Jansen 1984, Jansen 1978, March 1981. Says the tool is "heavilly based on" Transcalc and the models are frequency-dependent.
  - Field names are not in the doc text. A human records them from the app. KiCad master adds coupled stripline and a soldermask cover correction (tier 4; `docs/research/kicad-pcb-calculator.md`).
- **X-02 Qucs(-S) transcalc.** `qucstrans(1)` man page (fetcher). https://linux.die.net/man/1/qucstrans
  - "Microstrip, Rectangular Waveguide, Coaxial Line, Coplanar and Coupled Microstrips"; analysis and synthesis.
  - Field names and output list are not in the man page. Qucs-S-specific docs were not found.
- **X-04 rf-tool** (README, fetcher). https://github.com/ErikBuer/rf-tool
  - `pcb.microstripImpedanceHJ(h, w, e_r)`, `pcb.effectiveStripWidthHJ(h, w, t, e_r)`, `pcb.shieldedMicrostripImpedanceHJ(h, w, t, a, b, e_r)`, `pcb.microstripImpedanceYa(h, w, e_r, f)` (Yamashita), `pcb.microstripImpedanceKJ(h, w, e_r, f)` (Kirschning-Jansen).
  - Install `pip install rf-tool`. Running it needs human approval (CLAUDE.md rule 15). No stripline, coupled or loss functions in the README.
- **X-06 rftools-mcp** (README, fetcher). https://github.com/antonpogrebenko-public/rftools-mcp
  - Lists microstrip (Hammerstad-Jensen named), edge-coupled, offset, dual and broadside stripline variants, "Differential pair", "Coplanar waveguide (CPW/GCPW)". A coax calculator appears only in release notes.
  - Inputs and outputs are not in the README; it points to a `get_calculator_schema` tool and rftools.io.
  - Runs via `npx -y rftools-mcp`. Not approved and not in `.mcp.json`. Its network behaviour was not reviewed.
- **JLCPCB impedance calculator** (from `docs/research/jlcpcb.md`, 2026-10-06; not re-read).
  - Width synthesis only, tied to JLC stackup templates. Inputs: layers, thickness, copper weights, target impedance, trace spacing, trace-to-copper gap, signal layer, reference layers.
  - No user εr, Df, frequency or roughness input. Output: width (printed to 0.01 mil) plus a ranked stackup list.
  - Useful only as a human check of "our width on JLC stackup X vs JLC's width".
- **X-07 university calculators** (Clemson, Missouri S&T): manual spot checks, `obtainedBy: human`, not re-read here.

---

## S-029 Speed of light in vacuum, c = 299 792 458 m/s exactly — VERIFIED
- NIST CODATA (fetcher): "299 792 458 m s-1", standard uncertainty "(exact)", 2022 CODATA. https://physics.nist.gov/cgi-bin/cuu/Value?c
- BIPM, SI base unit metre (fetcher): "fixed numerical value of the speed of light in vacuum c to be 299 792 458". https://www.bipm.org/en/si-base-units/metre
- Derived (researcher arithmetic): 1/c = 3.335641 ps/mm = 84.72798 ps/in (with 1 in = 25.4 mm exactly, S-006).

## S-029a Delay, phase velocity, effective permittivity, guided wavelength — VERIFIED
- Steer §3.5 (fetcher): eq. (6) "√εe = c/vp"; unnumbered "λg = λ0/√εe"; eq. (5) vp = 1/√(LC) = c·√(Cair/C).
- National AN-1035 eq. (1) (PDF, read in full): "√Er = C/V", "C = 0.0118 in/ps (Speed of light)". Homogeneous form, Er in place of εe.
  - "microstrip has a delay of 147 ps/in (FR-4) and stripline has a delay of 188 ps/in (FR-4)".
  - Researcher: these imply εe ≈ 3.01 (microstrip) and εr ≈ 4.92 (stripline). 1/C = 84.75 ps/in vs exact 84.728 (0.02 %).
- TI SLLA323 Figs. 3-4 (PDF, read in full): "tPD (microstrip) = 85 √(0.475εr + 0.67)", "tPD (stripline) = 85 √εr" (ps/in).
  - 85 ps/in is c rounded (+0.32 % vs 84.728). 0.475εr + 0.67 is an empirical εe for microstrip; it is not the H-J εe of S-020. Researcher arithmetic: at εr 3.66 it gives εe 2.4085.
- Relations to implement: t_pd = √εe / c (s/m); vp = c/√εe; λg = λ0/√εe = c/(f·√εe).
- Minor CONFLICT (constant only): 85 vs 84.728 ps/in. Use exact c (S-029); show app-note values only as cross-checks.

## S-029b Skew from length mismatch — UNVERIFIED (derived)
- Relation: skew = |ΔL| · t_pd = |ΔL| · √εe / c. Inverse: ΔL = skew · c / √εe. Both lines must have the same εe.
- One worked source: TI SLLA323 Table 3 (R9). Every other read source states skew budgets in length (TI SPRAAR7J "Skew within any USB3/SATA/PCIe/HDMI differential pair 5 Mils"; NXP AN13462 converts 500 ps to a 50 mil match "Subtracting the transmitter output driver skew") without printing the relation.
- DERIVED from S-029a, like S-019g; status stays UNVERIFIED. Caveats from sources:
  - Fiber-weave skew (TI SPRAAR7J §2.1) is not captured by a single εe.
  - Microstrip vs stripline segments have different t_pd (AN-1035 147 vs 188 ps/in), so a mixed-layer pair needs per-segment sums.

## S-029c Quarter-wave helper and antenna caveat — UNVERIFIED
- Transmission-line stub: L(λ/4) = λg/4 = c/(4·f·√εe). Derived from S-029a; no read source prints it as a helper.
- Antenna caveat, EnOcean AN102 (PDF, read in full):
  - "guided wavelength ... can be taken as λE = 0.75 × λ0". Note: 0.75 corresponds to εe ≈ 1.78 (researcher). That is far from a microstrip εe on FR-4 (≈ 3 to 3.4), so the antenna "guided" factor is a different quantity from the S-020 εe.
  - "initial trace length should be made somewhat longer ... typically by about 25%" for tuning.
  - The ground plane "should extend at least a quarter wavelength around the feed point".
  - "Conductive or dielectric materials near the antenna" require measuring under real conditions.
  - Internal inconsistency: its λE/4 = 6.48 cm by its own numbers vs the printed "≈ 6.2 cm".
- Second source: TI SWRA161/AN058 search snippet only ("ground plane acts as the second quarter-wave element"). Not read.
- Conclusion: show λ0/4 and λg/4 for a transmission-line stub. For an antenna, show only a warning ("geometry, substrate, ground plane, enclosure and end effects decide the length; tune by measurement"), never an antenna length.

## S-029d Low-loss attenuation α ≈ R′/(2Z0) + G′Z0/2 — VERIFIED (as an approximation)
- Steer §3.5 eq. (23) (fetcher): "αc = (Rstrip + Rground)/(2Z0)", with Rstrip = ρ/(wt) = Rs/w (eq. 21) and a ground-plane term (eq. 22, "for 0.1 ≤ w/h ≤ 10", a low-frequency value).
- Ellingson, Electromagnetics Vol. 2, §7.3 "Attenuation in Coaxial Cable" (fetcher). https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electro-Optics/Book%3A_Electromagnetics_II_(Ellingson)/07%3A_Transmission_Lines_Redux/7.03%3A_Attenuation_in_Coaxial_Cable
  - α = αR + αG, αR ≈ K_R·R′/Z0, αG ≈ K_G·G′Z0, with K_R = K_G = 1/2 "fitted numerically to the exact result". So α ≈ R′/(2Z0) + G′Z0/2.
  - Fetcher note: the page's concluding sentence swaps the αR and αG labels; the derivation is as above.
- Np to dB: 20·log10(e) = 8.685890 dB/Np. Researcher arithmetic; no read source printed it.
- Validity: R′ ≪ ωL′, G′ ≪ ωC′ (Ellingson Vol. 1 §3.9, fetcher), TEM or quasi-TEM, uniform line.

## S-029e Dielectric loss α_d — UNVERIFIED (filling-factor form single tier-2 source)
- Steer §3.5 eq. (26) (fetcher): "αd = (ω/c)(tanδ) εr(εe−1) / (2√εe (εr−1)) Np/m"; "This formula can be used with any TEM transmission line". Filling factor q from εe = 1 + q(εr − 1) (eq. 17).
- Qucs tech. doc. §11 eq. 11.79 (tier 4, fetcher, middle of the expression truncated): same factors, written with π/λ0.
- Homogeneous limit (εe = εr): α_d = π·f·√εr·tanδ / c Np/m. Agrees with Ellingson Vol. 2 §7.3 αG ≈ (η0/2)·σs/√εr once σs = ωε0εr·tanδ is substituted. That substitution is the standard loss-tangent definition, researcher algebra.
- dB per inch shortcut (researcher arithmetic): π × 8.685890 × 0.0254 / 0.299792458 = **2.3120** dB/in per (GHz · tanδ · √εr). A search snippet credits Bogatin and All About Circuits with "2.3"/"2.32"; neither was read.
- Researcher example (not a source output): εr 4.1, εe 2.96710, tanδ 0.02, 1 GHz gives α_d = 0.31655 Np/m = 2.7495 dB/m = 0.069838 dB/in.
- Validity and caveats:
  - quasi-TEM;
  - tanδ and εr must be taken at the analysis frequency (S-027 shows both vary with frequency);
  - no source stated an accuracy.

## S-029f Conductor (skin-effect) loss estimate — UNVERIFIED
- Surface resistance Rs = ρ/δ = √(π f μ0 ρ). From S-013 (δ, VERIFIED) by definition. Qucs eq. 11.81 prints it (tier 4).
- Microstrip, wide strip, smooth copper, current confined to about one skin depth: α_c ≈ Rs/(Z0·w) Np/m (strip plus ground, each about Rs/w).
  - Sources: Steer eqs. (21)-(23) give the structure, but explicitly at low frequency, with "R_strip and R_ground will increase at higher frequencies ... next chapter" (not read).
  - Qucs eq. 11.80 α_c = R□/(Z_L·W)·K_r·K_i (tier 4), with the Hammerstad roughness factor K_r = 1 + (2/π)·arctan(1.4(Δ/δ)²) and current-distribution factor K_i = exp(−1.2 (Z_L/Z_F0)^0.7). Qucs says K_i is good "provided that the strip thickness exceeds three skin depths".
- Ellingson Vol. 2 §7.3 gives the coax analogue R′ = 1/(2πaδσ) + 1/(2πbδσ). Assumptions: δ ≪ a and δ ≪ outer conductor thickness.
- Researcher example: copper ρ = 1/58e6 Ω·m, 1 GHz: δ = 2.08981 µm (S-013), Rs = 8.2502 mΩ.
- Status UNVERIFIED: the high-frequency microstrip form rests on tier 4 plus a low-frequency tier-2 structure.
- Validity: t > 3δ, smooth copper (roughness not modelled unless Q-17 accepts the tier-4 K_r), no current crowding (K_i = 1 is optimistic for narrow strips), no ground-plane loss refinement.

---

## What the user must still verify (paywalled or not read)
1. USB 2.0 specification (USB-IF, free): the differential characteristic impedance requirement in chapter 7, and whether it applies to cable or PCB (S-026, S-026a).
2. USB 3.2 specification: the SuperSpeed differential impedance target and tolerance (S-026b).
3. TIA/EIA-644-A: whether it states any interconnect impedance (S-026c).
4. ISO 11898-2: bus-line characteristic impedance range and terminating resistor range (S-026d).
5. TIA-485-A: the cable impedance recommendation, i.e. whether 120 Ω is required or recommended (S-026e).
6. IEEE 802.3 clauses 14, 25 and 40 (MDI): any PCB or channel impedance statements (S-026f).
7. Laminate data: re-read each preset's datasheet revision before shipping it; values change by revision (S-027 Shengyi conflict).
