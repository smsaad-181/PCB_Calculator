# Safety spacing structure: IEC 60664 family and IPC-2221 (S-030 … S-035)

Phase 3 research pass. Retrieved 2026-10-19 (standards-researcher). Ledger rows: S-030…S-034 (umbrella pointer, kept for the gate), S-030, S-030a … S-030g, S-031, S-031a, S-032, S-033, S-033a, S-034, S-035. Inputs, tables the human must supply, data schema and open questions: `docs/research/spacing-structure-and-gating.md`.

## How the sources were read
- **No shell was available.** Nothing was downloaded into a scratch directory, nothing was installed, nothing ran.
- **No PDF was read in this pass.** WebFetch stored several PDFs outside the repo (TI SLUP421, SLUP419, SLUAAR5 PDF, ABB "Insulation withstand and altitude", the official IEC 60664-1 ed. 3 preview from VDE Verlag), but the file reader could not render them in this session (pdftoppm missing) and the summarizing fetcher saw only compressed streams. They are listed under "Not read".
- **"fetcher"**: an HTML page passed through a summarizing fetcher, asked to quote exactly. A summarizer can drop a symbol (it lost the √ in OpenStax and possibly the ≤ in TI SLYY063A). Quotes below are as the fetcher returned them.
- **"search snippet"**: seen only in a search-engine summary. Never a basis for a status.
- **STRICT rule applied:** no impulse-voltage, clearance, creepage, altitude-factor or IPC-2221 spacing value is recorded here or in any repo file. Where a public page prints such a table this note says "a public source prints a table; not recorded" and gives the URL.

### Not read
- IEC 60664-1 (any edition), IEC 60664-3, -4, -5, IEC 60112, IPC-2221B/C, UL 840, IEC 62368-1, 61010-1, 60601-1, 61558-1, 61800-5-1: paywalled, not read. Only official abstracts were read.
- Official IEC 60664-1 ed. 3.0 preview PDF (free; contains the table of contents and probably clauses 1-3): https://assets.vde-verlag.de/iec-normen/preview-pdf/info_iec60664-1%7Bed3.0%7Db.pdf . Fetched, not readable here. **The human can open it free of charge** to confirm clause and table numbers of ed. 3 (this would settle the table-number questions below without the full standard).
- TI SLUP421 and SLUP419 (Power Supply Design Seminar papers on isolation and spacing): PDF, image-based, not read.
- TI SLUAAR5 PDF: not readable; its HTML sections §1.5, §1.6, §2.2 were read by fetcher; §1.1, §1.2, §1.8, §2.1 HTML pages were not located.
- ADI "The Relation Between the Comparative Tracking Index and Working Voltage": two timeouts. Search snippet only (IEC 60950 context).
- Weidmüller, Megger, Oriental Motor, TDK-Lambda blog, Electropedia (IEV), IEC CDD: HTTP 403. ETICS decision sheet: access denied.
- ABB "Insulation withstand and altitude": PDF not readable; search snippet only.

---

## S-030 IEC 60664-1 scope and edition — VERIFIED (structure only)
- IEC webstore abstract, https://webstore.iec.ch/publication/59671 (fetcher):
  - "provides requirements for technical committees to determine clearances, creepage distances" and "criteria for solid insulation"; "includes methods of electrical testing with respect to insulation coordination".
  - Edition 3.0, 2020-05-26; corrigendum of October 2020 included.
  - Changes vs ed. 2: "addition of 1 500 V DC into tables", "new structure for Clauses 4 and 5", "addition of Annex G with a flowchart for clearances", "addition of Annex H with a flowchart for creepage distances", "update of distances altitude correction in a new Table F.10".
- SFS store, https://store.sfs.fi/en/iec-60664-1-2020amd1-2025-csv (fetcher): consolidated ed. 3.1 (2020 + AMD1:2025), May 2025; same abstract wording.
- Meaning for the app: 60664-1 is addressed to technical committees, i.e. a basic framework that product standards apply. This supports the skill's mandatory warning text.
- Caveat: two retrievals of IEC's own abstract (one origin). VERIFIED is for the structural facts above only.

## S-030a Numeric scope limits — PAYWALLED-USER-MUST-VERIFY
- Same two pages: "equipment having a rated voltage up to AC 1 000 V or DC 1 500 V connected to low-voltage supply systems"; "This document applies to frequencies up to 30 kHz."; "It applies to equipment for use up to 2 000 m above sea level and provides guidance for use at higher altitudes."
- Numeric, so PAYWALLED per the Phase 3 orchestrator rule, although read verbatim in the official abstract. Use only as out-of-scope warnings.
- Human: clause 1 (Scope) of the edition in use.

## S-030b Determination structure — UNVERIFIED
- TI SLUAAR5, "Circuit Board Insulation Design According to IEC60664 for Motor Drive Application", Aug 2023, §2.2 (fetcher), https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-B1A84E91-DDEE-4C92-A54D-03C5F8DE95DD :
  - "Clearances shall be dimensioned to withstand the required impulse withstand voltage"
  - "Table F.1 of IEC60664-1 defines the rated impulse voltage according to each working voltage"
  - "The rated working voltage for clearance (CL) is the peak value"; "the working voltage for creepage (CR) is the RMS value"
  - "Table F.4 of IEC60664-1 defines the creepage distances for functional, basic insulation"
  - "select the maximum value between clearance and creepage as the insulation distance"
  - Creepage at least clearance is quoted from IEC 61800-5-1: "when the creepage distance is less than clearance determined by impulse voltage" it is increased.
  - PCB: "put the values into PCB design tool as the constrain rules"; its Table 2-4 gives separate inner- and outer-layer creepage values (a public source prints a table; not recorded).
- PTR Hartmann, "Clearance and creepage distances" (EN 60664-1:2007 / VDE 0110-1) (fetcher), https://ptr-hartmann.com/know-how/connection-technology/approvals-standards/clearance-and-creepage-distances :
  - Clearance "is the shortest distance in air between two conductive parts"; dimensioned for the required impulse withstand voltage; for mains-connected equipment that is the rated impulse voltage.
  - Creepage based on the long-term r.m.s. voltage (working voltage, rated insulation voltage or rated voltage); pollution degree enters through the creepage table.
  - "A creepage distance cannot be less than the associated clearance".
  - Tables are linked as separate downloads (a public source prints tables; not recorded).
- Agreement: clearance from impulse withstand voltage; creepage from RMS voltage + pollution degree (+ material group per S-030e sources); creepage not less than clearance; result is the larger.
- Not found in any public source read: pollution degree as a clearance input (the skill says it is), homogeneous vs inhomogeneous field cases, steady-state/recurring peak voltage clearance case, temporary overvoltage, the micro-environment vs macro-environment rule. **Needs the licensed copy.**
- Table-number warning: TI's F.1, F.2, F.4, A.2 numbering looks like ed. 2 (2007) numbering; the ed. 3 abstract names a "new Table F.10" for altitude. Do not hard-code any table number; store it per edition in the data file.

## S-030c Overvoltage categories — CONFLICT
- PTR Hartmann (EN 60664-1:2007) (fetcher), https://www.ptr-hartmann.com/know-how/connection-technology/approvals-standards/overvoltage-categories-i-v/ :
  - I: "equipment for connection to circuits in which measures are taken to limit transient overvoltages"
  - II: "energy-consuming equipment to be supplied from the fixed installation."
  - III: "equipment in fixed installations and for cases where the reliability and the availability" (are subject to special requirements)
  - IV: "is for use at the origin of the installation."
  - No impulse table on the page; linked as download (not recorded).
- TI SLUAAR5 §1.6 (fetcher), https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-CA381ACB-0C47-449F-A22F-89998F3A6223 :
  - I: "applies to equipment connected to a circuit where measures have been taken to reduce transient overvoltage to a low level"
  - II: "applies between the circuits not directly supplied by mains or the environment"
  - III: "applies to the circuits directly supplied by mains or the environment"
  - IV: "applies to equipment permanently connected at the origin of an installation"
- Conflict: II and III mean different things in the two sources (installation-equipment meaning vs circuit-position meaning from drive practice). Do not pick. The app should show the category names only and ask the user to choose per their product standard.
- Search snippets (not read): Broadcom regulatory guide and Recom match PTR; Recom wrongly attributes the categories to IEC 60204-1. IEV 426-04-48 "overvoltage category: numeral defining a transient overvoltage condition", with IEC 63508 CDD citing "IEC 60664-1:2020, clause 3.1.20" (snippet only).
- A public source prints the rated impulse voltage table by category and supply voltage (search snippets mention TDK-Lambda and Recom tables, which disagree with each other on one cell); not recorded.

## S-030d Pollution degrees — VERIFIED (structure only)
- TI SLUAAR5 §1.5 Table 1-1 "Degree of Pollution" (fetcher), https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-AFE3363E-6BA4-48E1-8DA3-77C872B39A5B :
  - 1: "No pollution or only dry, non-conductive pollution occurs. The pollution has no influence."
  - 2: "Normally, only non-conductive pollution occurs." "Occasionally, however, a temporary conductivity caused by condensation is to be expected, when the EE is out of operation."
  - 3: "Conductive pollution or dry non-conductive pollution occurs which becomes conductive due to condensation"
  - 4: "The pollution generates persistent conductivity caused, for example, by conductive dust or rain or snow"
- PTR Hartmann, "Pollution degrees" (EN 60664-1:2007) (fetcher), https://www.ptr-hartmann.com/know-how/connection-technology/materials/pollution-levels : PD1 identical wording; PD2 "Only non-conductive pollution occurs except that occasionally a temporary conductivity" (caused by condensation); PD3 "Conductive pollution occurs or dry non-conductive pollution occurs which becomes conductive due to condensation"; PD4 "Continuous conductivity occurs due to conductive dust, rain or wet conditions."
- VERIFIED for: four degrees, numbered 1-4, with these meanings. Not verified: exact normative text, which degree applies to an inner layer or a coated surface (a forum post claims inner layers are PD1; tier 5, not used), whether a default exists.

## S-030e Material groups and CTI — PAYWALLED-USER-MUST-VERIFY
- Definitional bands (not a spacing table), as printed by PTR Hartmann (EN 60664-1:2007) and In Compliance (MacArthur, June 2025, Table 1):
  - I: 600 ≤ CTI
  - II: 400 ≤ CTI < 600
  - IIIa: 175 ≤ CTI < 400
  - IIIb: 100 ≤ CTI < 175
- PTR: CTI "determined in accordance with IEC 60112 using solution A"; "materials are classified into four groups according to their CTI values".
- TI SLYY063A (fetcher): "IEC 60664-1 classifies materials into four material groups according to their CTI values"; same band numbers but rendered "600 V < CTI", "400 V < CTI < 600 V" etc. Likely the fetcher dropped ≤; recorded as a minor discrepancy in boundary inclusivity.
- TI SLYY063A: "CTI plays a major role in determining the minimum creepage"; "A minimum creepage is required for a given working voltage".
- In Compliance: inorganic materials such as glass and ceramics that do not track do not require creepage distances (UL 61010-1 context; not used).
- Lead not confirmed: one search snippet says IIIb is the default when CTI is unknown. Needs the licensed copy.

## S-030f Insulation types and reinforced rules — PAYWALLED-USER-MUST-VERIFY
- TI SLUAAR5 §2.2: "The insulation type includes basic, functional and reinforced insulation."; "Creepage distance for reinforced insulation shall be twice the creepage distance for basic insulation."; "clearances of reinforced insulation shall be dimensioned as specified in Table F.2." A search snippet of the same paper: reinforced clearance uses the next higher impulse voltage step.
- IEC 60664-4 abstract: "The dimensioning values directly apply for basic insulation;" "for reinforced insulation additional requirements apply according to Part 1."
- No second tier 1-3 source read for the factor or the step rule. The skill says "reinforced doubles basic requirements"; per TI that is the creepage rule, while clearance follows a different rule. **Do not implement either rule until the human confirms the clause text.** Supplementary and double insulation definitions: not found in a readable public source.

## S-030g Printed boards and coatings — PAYWALLED-USER-MUST-VERIFY
- IEC 60664-3:2016 abstract, https://webstore.iec.ch/publication/26148 (fetcher): ed. 3.0, 2016-11-04. "applies to assemblies protected against pollution by the use of coating, potting or moulding," "thus allowing a reduction of clearance and creepage distances as described in IEC 60664-1."; "type 1 protection improves the microenvironment of the parts under the protection;" "type 2 protection is considered to be similar to solid insulation."
- Search snippets (iTeh/EVS, not read): also "applies to all kinds of protected printed boards, including the surface of inner layers of multi-layer boards"; "refers only to permanent protection".
- IEC 60664-5 (Standard Norge page, fetcher), https://online.standard.no/en/iec-60664-5-2003-ed1 : "Specifies the dimensioning of clearances and creepage distances for spacings equal to or less than 2 mm."; printed wiring boards and equivalent constructions; "can only be used as an entirety"; ed. 1 withdrawn 2007-07-30, revised by ed. 2 (2007), also marked withdrawn. Whether its content moved into 60664-1 ed. 3: not found.
- IEC 60664-1 creepage table printed-wiring columns: only a search snippet of an ETICS decision on IEC 60947-1 (printed-circuit distances for PD1 and PD2, and for PD2 not for material group IIIb; otherwise the general table applies). Not read; needs the licensed copy.
- Soldermask: no source read says soldermask counts as a 60664-3 coating. IPC-2221C reportedly renames B4 to "solder mask" (Altium, S-033), which is an IPC spacing column, not an IEC 60664 coating credit. Keep "soldermask is not conformal coating" as app policy.

## S-031 IEC 60664-4 — VERIFIED (structure only)
- IEC webstore, https://webstore.iec.ch/en/publication/2804 (fetcher): ed. 2.0, 2005-09-15, stability date 2027, history empty, no newer edition. "can only be used together with IEC 60664-1 or with IEC 60664-5"; extends the frequency limit of Part 1 or Part 5; "It is applicable for the dimensioning of clearances, creepage distances and solid insulation"; basic vs reinforced as in S-030f. Major change: "inclusion of more recent information about the withstand characteristics of insulation at high-frequency voltage stress".
- EVS, https://www.evs.ee/en/iec-60664-4-2005 (fetcher): same wording; "Has the status of a basic safety publication in accordance with IEC Guide 104."
- Use: frequency above the Part 1 limit means the app shows the IEC 60664-4 warning and gives no Part 1 number.

## S-031a Frequency boundaries — PAYWALLED-USER-MUST-VERIFY
- Part 1: "This document applies to frequencies up to 30 kHz." (IEC and SFS abstracts.)
- Part 4: "periodic voltages with a fundamental frequency above 30 kHz and up to 10 MHz"; "Applies to equipment for use up to 2 000 m above sea level having a rated voltage up to a.c. 1 000 V." (IEC and EVS abstracts.)
- Above 10 MHz neither abstract covers the case. The skill wording "about 30 kHz" should become "above the Part 1 frequency limit stated in its scope (S-031a)".

## S-032 Altitude correction — PAYWALLED-USER-MUST-VERIFY
- IEC 60664-1 ed. 3 abstract: "update of distances altitude correction in a new Table F.10"; scope "provides guidance for use at higher altitudes".
- TI SLUAAR5 §2.2: "When the product or circuit board requires higher altitude than 2000 m, be sure to consider altitude correction factors"; Table A.2 "gives the multiplication factors for air clearance" (fetcher paraphrase of the table reference).
- PTR Hartmann clearance page: correction factors for heights above 2 000 m, given for clearance.
- Agreement: a multiplicative correction applies to clearance above the scope altitude.
- Conflict on location/values by edition: Table A.2 (ed. 2 numbering) vs new Table F.10 (ed. 3; "update of distances", so values may differ).
- "Never creepage": no source read states the exclusion explicitly; TI and PTR simply apply it to clearance. Counter-lead (search snippet only, HV context): ABB "Insulation withstand and altitude" recommends altitude correction of creepage for AC above a lower altitude, doubtful for hydrophobic materials. Different domain (likely high-voltage switchgear), not read. The app may implement "altitude scales clearance only" as the 60664-1 structure, labelled PAYWALLED, until the human confirms.
- Public sources print altitude factor tables; not recorded.

## S-033 IPC-2221 Table 6-1 structure — PAYWALLED-USER-MUST-VERIFY
- Altair PollEx help "IPC Material" (fetcher), https://help.altair.com/pollex/topics/pollex/verification/dfe_ipc_material_r.htm : section 6.3 "Electrical Clearance", Table 6-1; row header "Voltage Between Conductors (DC or AC Peaks)", ten voltage-band rows, the last row a per-volt increment ("(per volt) table values must be added to the" top-band value). Column headings verbatim:
  - "B1 - Internal Conductors"
  - "B2 - External Conductors, uncoated, sea level to [elevation breakpoint]"
  - "B3 - External Conductors, Uncoated, Over [elevation breakpoint]"
  - (The heading text prints the elevation breakpoint value; it is deliberately replaced here by "[elevation breakpoint]" so that no number from the table enters the repo. The human enters it as table metadata.)
  - "B4 - External Conductors, with Permanent Polymer Coating (Any Elevation)"
  - "A5 - External Conductors, with Conformal Coating Over Assembly (Any Elevation)"
  - "A6 - External Component Lead/Termination, Uncoated"
  - "A7 - External Component Lead/Termination, with Conformal Coating (Any Elevation)"
  - Grouping: B1-B4 "Bare Board", A5-A7 "Assembly".
- Altium, Z. Peterson (2020, updated 2025-09-09) (fetcher, text partly jumbled), https://resources.altium.com/p/using-an-ipc-2221-calculator-for-high-voltage-design : caption "IPC-2221B conductor spacing requirements"; A6 with the sea-level-to-breakpoint qualifier; an "A8" column (uncoated leads over the breakpoint or in vacuum) in its reading; Rev C: new B5 column for coated external conductors at any elevation or in vacuum; "solder mask" replaces "permanent polymer coating" for B4; vacuum called out (B3 heading "Over [elevation breakpoint] or in a Vacuum"); the above-top-band per-volt step differs from Rev B; altitude guidance changed.
- Third reading, from the Phase 1 note `docs/sources/notes/ipc2221.md` (KiCad master source comments, tier 4, citing "IPC2221C Dec 2023"): 8 categories, B4 "permanent polymer coating", B5 "conformal coating", A6 "component lead with conformal coating", A7/A8 uncoated leads below/above the breakpoint or vacuum. This disagrees with Altium's Rev C reading (B4 "solder mask"; B5 coated external conductors at any elevation or vacuum).
- Conflicts: column set (A6 qualifier; A8; B5) and the B4 wording differ by source and edition. The app must take the column list from the human-entered table, not hard-code it.
- Both pages print the spacing values, band boundaries and the elevation breakpoint; not recorded.

## S-033a IPC-2221 vs IEC 60664 — UNVERIFIED
- P. McGaw, "Creepage and Clearance", 2023-02-21 (fetcher): "IPC 2221 is a functional requirement, not a safety requirement."
- S. Chavez, Siemens EDA blog, 2025-04-29 (fetcher): IEC 60664-1 covers "insulation coordination, creepage, and clearance based on pollution degrees and material groups"; UL 796 "Governs safety of PCBs for UL certification."
- Search snippets: pcbsync/atlaspcb say Table 6-1 is for functional insulation and a certifier will not accept it as a safety table; one blog claims IPC-2221 creepage follows IEC material groups (conflicts with the S-033 headings; not used).
- Structural observation (from S-033 headings and S-030b): IPC has no pollution degree, material group or overvoltage category input; IEC has no "coated assembly" column but a separate coating standard (60664-3).

## S-034 Product standards (list only) — UNVERIFIED
- IEC 62368-1:2023, ed. 4.0, 2023-05-26, TC 108 (IEC webstore, fetcher): "IEC 62368-1:2023 is a product safety standard that classifies energy sources"; "provides guidance on the application of, and requirements for, those safeguards." https://webstore.iec.ch/publication/69308
- IEC 61010-1:2010+AMD1:2016, ed. 3.1, 2017-01-10 (IEC webstore, fetcher): "specifies general safety requirements for the following types of electrical equipment and their accessories": "Electrical test and measurement equipment", "Electrical industrial process-control equipment", "Electrical laboratory equipment". https://webstore.iec.ch/en/publication/59769
- IEC 60601-1:2005+A1:2012+A2:2020, ed. 3.2, 2020-08-20 (IEC webstore, fetcher): "contains requirements concerning basic safety and essential performance"; "Where particular standards exist, this standard should not be used alone." https://webstore.iec.ch/en/publication/67497
- IEC 61558-1:2017, ed. 3.0 (GenormA EN IEC 61558-1:2019 page, fetcher): "IEC 61558-1:2017 deals with safety aspects of transformers, reactors, power supply units and combinations thereof". https://genorma.com/en/standards/en-iec-61558-1-2019
- IEC 60950-1 (Intertek, fetcher): "December 20, 2020 was the date when IEC/UL/CSA 60950‐1 and IEC/UL/CSA 60065 was formally withdrawn."; "replaced by IEC 62368-1". https://w3prep.intertek.com/ict/iec-60950
- UL 840 (search snippet only; GlobalSpec 403): "Insulation Coordination Including Clearances and Creepage Distances for Electrical Equipment"; may be used as an alternate to end-product spacings only where the product standard references it. Edition not confirmed.
- Also seen, not researched: IEC 61800-5-1 (adjustable speed drives; source of TI's creepage-vs-clearance rule), IEC 60335-1 (household appliances, clause 29 per McGaw), IEC 60947-1 (LV switchgear), IPC-9592 (power conversion devices, per Altium), UL 796 (printed wiring boards, per Siemens blog).

## S-035 Waveform relations — VERIFIED
- OpenStax University Physics Vol. 2 §15.4 (fetcher): rms defined as the square root of the time average of i²(t), v²(t) over one period T; with i(t) = I0 sin(ωt − φ), v(t) = V0 sin ωt: I_rms = I0/√2, V_rms = V0/√2 (the fetcher's extraction showed "12I0", radical lost).
- Kuphaldt, Lessons in Electric Circuits Vol. II §1.3 (LibreTexts, fetcher): "For a sine wave, the RMS value is approximately 0.707 of its peak value."; "Sinusoidal waveforms have an RMS value of 0.707 (the reciprocal of the square root of 2)."; "The crest factor of an AC waveform is the ratio of its peak (crest) to its RMS value."; "Square-shaped waveforms always have crest and form factors equal to 1"; "Triangle- and sawtooth-shaped waveforms have RMS values of 0.577 (the reciprocal of square root of 3)."; these "hold true only for pure forms of these waveshapes."
- Derived (researcher algebra from the definition, not separately sourced): DC: RMS = |V_dc|; DC plus a periodic AC component with zero mean: V_rms = sqrt(V_dc² + V_ac,rms²); peak = V_dc + V_ac,pk for a symmetric AC component.
- Which quantity the standard wants for clearance vs creepage is S-030b, not this row.

---

## Conflicts summary
1. Overvoltage categories II/III meaning: PTR (installation equipment) vs TI SLUAAR5 (circuit position). S-030c CONFLICT.
2. Table numbering by edition: TI cites F.1/F.2/F.4/A.2 (ed. 2 style); IEC ed. 3 abstract names a new Table F.10 for altitude. S-030b, S-032.
3. Altitude and creepage: 60664-1 secondary sources apply altitude to clearance only; an ABB HV note (snippet) recommends creepage correction. S-032.
4. IPC-2221 column set by source/edition (A6 qualifier, A8, Rev C B5, B4 wording). S-033.
5. CTI boundary inclusivity rendering (TI vs PTR/In Compliance). S-030e.
6. Creepage-not-less-than-clearance: PTR attributes it to 60664-1 (2007); TI quotes it from IEC 61800-5-1. S-030b.

## What the human must still verify (licensed copies)
- IEC 60664-1 (edition in use): Scope; terms (clearance, creepage distance, working voltage, recurring peak, rated impulse voltage, pollution degree, micro-environment, overvoltage category, insulation types); clearance clause (impulse, steady-state/recurring peak, temporary overvoltage, field condition A/B, pollution-degree minima); creepage clause (RMS, pollution degree, material group, printed wiring columns, interpolation rule, creepage not less than clearance); reinforced insulation rules for clearance and creepage; altitude clause and table (F.10 in ed. 3); Annex G and H flowcharts; rated impulse voltage table; clearance table; creepage table; material-group definitions.
- IEC 60664-3 if any coating credit is wanted; IEC 60664-4 if anything above the Part 1 frequency limit is wanted (the app should only warn).
- IPC-2221B §6.3 Table 6-1 or IPC-2221C Table 6-1: column headings, voltage bands, cells, per-volt rule, notes.
- The product standard that governs the user's product (it may change every one of the above).
