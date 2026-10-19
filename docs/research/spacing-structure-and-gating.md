# Safety spacing: structure, inputs, tables the human must supply, and gating (Phase 3)

Research step for Phase 3 (standards-researcher, 2026-10-19). Sources, quotes and conflicts: `docs/sources/notes/spacing-iec60664-ipc2221.md`; ledger rows S-030 … S-035 (plus the umbrella pointer row S-030…S-034 that the gate requires).

**Ground rules this document follows**
- No IEC or IPC standard was read. Every structural statement below carries the ledger id that supports it and that row's status.
- No numeric table value (impulse voltage, clearance mm, creepage mm, altitude factor, IPC-2221 spacing mm/mil, voltage band boundaries) is written here. All of those come from the human, from licensed copies, through the data files proposed in §5.
- Where a structural detail is only in the skill text (from memory) and was not found in a public source, it is marked **[unconfirmed]** and appears as a question for the human.
- Phase 3 prerequisite (`docs/phases/phase-3.md`): if the human has no licensed copies, the gated UI and logic are built with **empty tables** and an **INSUFFICIENT DATA** state, and Phase 3 stops there.

---

## 1. What the public sources establish (structure)

| Topic | Structure | Ledger | Status |
|---|---|---|---|
| Scope and role | IEC 60664-1 gives requirements for technical committees to determine clearances, creepage distances and solid-insulation criteria. It is a framework that product standards apply, not a product standard. Ed. 3.0 (2020), consolidated ed. 3.1 (2020 + AMD1:2025). Ed. 3 added Annex G (clearance flowchart), Annex H (creepage flowchart) and a new altitude table F.10 | S-030 | VERIFIED |
| Scope limits | Voltage, frequency and altitude limits stated in the abstract | S-030a | PAYWALLED-USER-MUST-VERIFY |
| Clearance | Dimensioned to withstand the required impulse withstand voltage. For mains-connected equipment this is the rated impulse voltage, read from a table by overvoltage category and supply voltage. Corrected for altitude above the scope altitude. Working voltage for clearance is taken as a peak value | S-030b, S-030c, S-032 | UNVERIFIED / CONFLICT / PAYWALLED |
| Creepage | From the long-term RMS voltage, pollution degree and material group, read from a table. Not from voltage alone | S-030b, S-030d, S-030e | UNVERIFIED / VERIFIED (PD structure) / PAYWALLED |
| Creepage vs clearance | Creepage cannot be less than the associated clearance; the design distance is the larger of the two | S-030b | UNVERIFIED |
| Pollution degrees | Four degrees, 1 to 4, describing the micro-environment (meanings in the note) | S-030d | VERIFIED (structure only) |
| Overvoltage categories | Four categories, I to IV. The meaning of II and III differs between sources | S-030c | CONFLICT |
| Material groups | I, II, IIIa, IIIb, defined by CTI bands (IEC 60112, solution A) | S-030e | PAYWALLED-USER-MUST-VERIFY |
| Insulation types | Functional, basic, supplementary, double, reinforced. Reinforced creepage = a multiple of basic; reinforced clearance follows a different rule (a higher impulse step), per one manufacturer source | S-030f | PAYWALLED-USER-MUST-VERIFY |
| Printed boards and coatings | IEC 60664-3 coating/potting/moulding (type 1 and type 2) can reduce distances. IEC 60664-5 (spacings of 2 mm or less, PWBs) is listed as withdrawn. The 60664-1 creepage table reportedly has printed-wiring columns for pollution degrees 1 and 2 only | S-030g | PAYWALLED-USER-MUST-VERIFY |
| High frequency | IEC 60664-4 (ed. 2.0, 2005) is used only together with Part 1 or Part 5 and covers frequencies above Part 1's limit. Its values apply directly to basic insulation | S-031, S-031a | VERIFIED (structure) / PAYWALLED (numbers) |
| Altitude | A clearance multiplier above the scope altitude. Table location changed by edition (A.2 vs F.10). No source read explicitly excludes creepage; one HV-domain lead suggests creepage correction exists elsewhere | S-032 | PAYWALLED-USER-MUST-VERIFY |
| IPC-2221 spacing | Table 6-1: rows are voltage bands (DC or AC peak) plus a per-volt increment row above the top band. Columns: bare-board B-codes (internal; external uncoated below/above an elevation breakpoint; external with coating) and assembly A-codes (conformal-coated assembly; component leads uncoated/coated). The column set differs between Rev B and Rev C and between sources | S-033 | PAYWALLED-USER-MUST-VERIFY |
| IPC vs IEC | IPC-2221 has no pollution-degree, material-group or overvoltage-category input. Blogs call it a functional, not a safety, requirement | S-033a | UNVERIFIED |
| Product standards | 62368-1, 61010-1, 60601-1, 61558-1 (60950-1 withdrawn 2020-12-20), UL 840 as an alternative where referenced; also 61800-5-1, 60335-1, 60947-1 | S-034 | UNVERIFIED |
| Waveforms | RMS definition; sine peak = √2 × RMS; square RMS = peak; triangle RMS = peak/√3; DC RMS = DC | S-035 | VERIFIED |

---

## 2. Inputs

"Mandatory" means: if missing, the calculator shows **"Insufficient inputs: <list>"** and no number (skill `iec60664-gating`; exit criterion "each missing mandatory input blocks output"). No mandatory input has a default. An input that is mandatory only under a condition is marked (cond.).

### 2.1 Gated clearance calculator (IEC 60664-1 method)

| # | Input | Type / unit | Mandatory | Notes |
|---|---|---|---|---|
| C1 | Data set (standard edition) | choice among the loaded `iec60664` data files | yes | Every result names the edition. Empty data set → INSUFFICIENT DATA |
| C2 | Insulation type | functional / basic / supplementary / reinforced (double = basic + supplementary) | yes | Reinforced rule comes from the data file's rule record (S-030f), never hard-coded |
| C3 | How the impulse requirement is set | (a) mains-connected: derive from table T1, or (b) user enters the required impulse withstand voltage (for example from the product standard) | yes | Exactly one route |
| C4 | Nominal supply voltage and system kind | V; AC (single-phase / three-phase, line-to-neutral or line-to-line as the table requires) or DC | yes (cond. route a) | Row key of T1. How a nominal system voltage maps to the T1 row is [unconfirmed]; Q-36 |
| C5 | Overvoltage category | I / II / III / IV | yes (cond. route a) | S-030c is CONFLICT: show the category names only, with a note that the product standard decides |
| C6 | Required impulse withstand voltage | kV, 1.2/50 µs impulse | yes (cond. route b) | User-entered; labelled "user-supplied" |
| C7 | Pollution degree (micro-environment at this gap) | 1 / 2 / 3 / 4 | yes | S-030d. Whether clearance depends on it is [unconfirmed] (skill says yes; not found publicly); keep it mandatory so the table can use it if the edition does |
| C8 | Field condition | inhomogeneous / homogeneous | [unconfirmed] yes if T2 has this key | Not found in public sources; Q-37. If T2 has the key, no default |
| C9 | Altitude | m above sea level | yes | Above the scope altitude, multiply by T4 (clearance only, S-032). Above T4's range: refuse |
| C10 | Working voltage (peak, or recurring peak) | V | yes | Needed for the scope check (S-030a) and, if the edition has a steady-state/recurring-peak clearance case, for T3 (Q-38). Entered directly or derived per §3.3 |
| C11 | Fundamental frequency of the working voltage | Hz (DC = 0) | yes | Above the Part 1 frequency limit (S-031a): no number, show the IEC 60664-4 warning |
| C12 | Coating credit | none / type 1 / type 2 (IEC 60664-3) | optional, default none | Only selectable if the data file carries a human-verified 60664-3 rule. Soldermask is never a coating credit (app policy) |

### 2.2 Gated creepage calculator (IEC 60664-1 method)

| # | Input | Type / unit | Mandatory | Notes |
|---|---|---|---|---|
| R1 | Data set (standard edition) | as C1 | yes | |
| R2 | Insulation type | as C2 | yes | Reinforced multiplier from the data file's rule record only |
| R3 | RMS working voltage | V (DC: the DC value) | yes | Entered directly or derived per §3.3 from a declared waveform |
| R4 | Pollution degree | 1 / 2 / 3 / 4 | yes | |
| R5 | Material group, or CTI of the insulating surface | I / II / IIIa / IIIb, or CTI in V (IEC 60112 solution A) | yes | CTI → group uses the human-verified definitions table T6 (S-030e). No default group, even if the standard has one (Q-39) |
| R6 | Surface kind | printed wiring material / other | yes if T5 distinguishes it | Printed-wiring columns reportedly exist only for PD 1 and 2 (S-030g, unread) |
| R7 | Fundamental frequency | Hz | yes | As C11 |
| R8 | Associated clearance | mm, from the clearance calculator in the same session, or user-entered | yes | Needed to enforce creepage ≥ clearance (S-030b). Without it: no creepage result, or a result flagged "creepage-vs-clearance check not done". Q-40 |
| R9 | Coating credit | as C12 | optional, default none | |
| R10 | Grooves, slots, ribs | none / present | optional | Warning only, unless a verified width/depth rule is in the data file (phase-3 task 5) |

Altitude is **not** a creepage input. If the user has entered an altitude for clearance, the creepage panel shows "altitude does not change creepage in IEC 60664-1 (S-032, PAYWALLED)" and nothing else.

### 2.3 IPC-2221 spacing method (separate, labelled)

| # | Input | Type / unit | Mandatory | Notes |
|---|---|---|---|---|
| P1 | Data set | IPC-2221B or IPC-2221C Table 6-1, as entered | yes | Column list comes from the data file (column set differs by edition, S-033) |
| P2 | Voltage between conductors | V, DC or AC peak | yes | AC RMS input is converted only with a declared waveform (§3.3) |
| P3 | Conductor location | internal / external | yes | |
| P4 | Conductor kind | bare-board conductor / component lead or termination | yes (cond. external) | |
| P5 | Coating state | uncoated / coating classes offered by the edition (permanent polymer coating or solder mask; conformal coating over assembly) | yes (cond. external) | Labels exactly as the edition's headings |
| P6 | Elevation | m, or "below / above the breakpoint", or vacuum (Rev C) | yes (cond. external uncoated) | Breakpoint value from the data file |

The IPC result is always labelled "IPC-2221 conductor spacing (design guideline; not a safety insulation assessment)" and never replaces the IEC calculators (S-033a, app policy).

---

## 3. What the app can compute without any table number

| Item | How | Ledger / status |
|---|---|---|
| 3.1 Final distance = max(clearance, creepage) and the "creepage ≥ clearance" enforcement | When both are known; raise creepage to clearance and say so | S-030b UNVERIFIED (badge) |
| 3.2 Routing of altitude to clearance only | UI/logic routing, no number | S-032 PAYWALLED (badge) |
| 3.3 Working-voltage conversions | Sine: V_pk = √2 V_rms. Square: V_pk = V_rms. Triangle/sawtooth: V_pk = √3 V_rms. DC: V_rms = V_pk = V_dc. DC + zero-mean periodic AC: V_rms = sqrt(V_dc² + V_ac,rms²), V_pk = V_dc + V_ac,pk. Only when the user declares the waveform; otherwise the user enters both peak and RMS | S-035 VERIFIED; the DC+AC line is derived from the definition |
| 3.4 Scope checks | Voltage, frequency and altitude outside the stated scope → refuse with a named reason | S-030a, S-031a PAYWALLED (the limits themselves come from the data file's scope record, not code) |
| 3.5 IEC 60664-4 warning | Frequency above the Part 1 limit → no Part 1 number, warning naming 60664-4 | S-031 VERIFIED (structure) |
| 3.6 Reinforced insulation | Apply the data file's rule record (for example "creepage multiplier = k", "clearance: use the next impulse step") only if the human entered and verified that rule text. Never a code constant | S-030f PAYWALLED |
| 3.7 IPC per-volt extension above the top band | spacing = top-band value + (V − V_top) × per-volt increment, all three from the data file | S-033 PAYWALLED (structure from tool docs: per-volt values "must be added") |
| 3.8 Interpolation between table rows | Only as the data file's `interpolation` field allows ("none, use the next higher row" as default; "linear" only if the human records that the clause permits it). Q-41 | not sourced; app policy |
| 3.9 Unit conversion mm ↔ mil | 1 mil = 25.4 µm exactly | S-006 VERIFIED |
| 3.10 Product-standard warning, soldermask ≠ conformal coating, grooves warning | Always shown text | app policy; S-034 list UNVERIFIED |

---

## 4. Data tables the human must supply

Each table is one JSON file (schema in §5), shipped **empty** until the human enters it. Clause and table numbers below are as reported by secondary sources and **must be confirmed in the edition in use**: TI SLUAAR5 uses ed. 2-style numbers, and the ed. 3 abstract names a new Table F.10. The free official ed. 3 preview (URL in the note) shows the ed. 3 table of contents.

| ID | Table | Row keys | Column keys | Cell unit | Where to read (confirm numbering) | Editions |
|---|---|---|---|---|---|---|
| T1 | Rated impulse voltage | nominal supply voltage (as the table defines it: line-to-neutral derived from the nominal AC or DC system) | overvoltage category I–IV | kV (1.2/50 µs) | IEC 60664-1 Annex F, rated impulse voltage table (TI calls it Table F.1), plus any companion table that maps nominal systems to the row key | ed. 2 (2007), ed. 3 (2020), ed. 3.1 (2020+A1:2025) |
| T2 | Clearances to withstand transient overvoltages | required impulse withstand voltage, kV | [unconfirmed] field condition (inhomogeneous/homogeneous) × pollution degree | mm, at or below the scope altitude | IEC 60664-1 Annex F clearance table (TI: Table F.2) | same |
| T3 | Clearances for steady-state / recurring peak / temporary overvoltages | peak voltage, kV | [unconfirmed] field condition | mm | IEC 60664-1 Annex F, if the edition has it (Q-38) | same |
| T4 | Altitude correction | altitude, m (or air pressure) | — | dimensionless multiplier for clearance | ed. 3: Table F.10 (IEC abstract); ed. 2: Table A.2 (TI) | ed. 2 and ed. 3 differ ("update of distances") |
| T5 | Creepage distances to avoid tracking failure (basic insulation) | RMS working voltage, V | pollution degree × material group, plus printed-wiring-material columns where the edition has them | mm | IEC 60664-1 Annex F creepage table (TI: Table F.4; number may differ in ed. 3) | same |
| T6 | Material-group definitions | material group I, II, IIIa, IIIb | CTI lower bound, upper bound, bound inclusivity | V (CTI) | IEC 60664-1 material-group clause (defined by CTI per IEC 60112, solution A) | same |
| T7 | Rule records (not a grid): reinforced insulation for clearance and for creepage; creepage not less than clearance; interpolation permission; scope limits (voltage, frequency, altitude); pollution degree applicability of printed-wiring columns; coating credit (60664-3) if wanted; groove/rib widths if wanted | — | — | rule text + parameters | IEC 60664-1 clauses for each rule; IEC 60664-3 | same |
| T8 | IPC-2221 Table 6-1 Electrical Conductor Spacing | voltage band (DC or AC peak), V, plus the per-volt row | column code as printed (B1…B4/B5, A5/A6…A7/A8 per edition) with its heading text | mm (and the printed mil value if the table prints both; store as printed, do not convert) | IPC-2221B §6.3 Table 6-1, or IPC-2221C Table 6-1 | IPC-2221B (2012), IPC-2221C (2023-12) |

Not in scope for Phase 3 unless the human asks: IEC 60664-4 tables, IEC 60664-3 test-based reductions beyond a simple rule, product-standard tables (62368-1, 61010-1, 60601-1 have their own spacing tables; S-034).

---

## 5. Proposed data schema

Location: `src/core/data/iec60664/<table>.<edition>.json` and `src/core/data/ipc2221-spacing/<edition>.json`. Shipped empty. Compatible with the existing audit (`tools/audit-lib.mjs` `validateTable`: `source`, `edition`, `ledgerIds`, `status`, `verifiedBy`, `bannerRequired`).

```json
{
  "schema": "pcb-calc/safety-table@1",
  "table": "T5-creepage-basic",
  "standard": "IEC 60664-1",
  "source": "IEC 60664-1 (licensed copy held by the user; not read by agents)",
  "edition": "",
  "clause": "",
  "tableNumber": "",
  "ledgerIds": ["S-030b", "S-030d", "S-030e"],
  "status": "PAYWALLED-USER-MUST-VERIFY",
  "entered": { "by": "", "date": "", "method": "" },
  "verifiedBy": "",
  "verifiedDate": "",
  "bannerRequired": true,
  "units": { "row": "V_rms", "cell": "mm" },
  "rowKeys": [],
  "columnKeys": [],
  "interpolation": "none-next-higher-row",
  "notes": [],
  "cells": []
}
```

Per-cell provenance (one entry per non-empty cell; cells absent = no data, never zero):

```json
{ "row": "<row key as printed>", "col": "<column key as printed>", "value": null,
  "printed": "<the text exactly as printed, e.g. with footnote marks>",
  "page": "", "enteredBy": "", "enteredDate": "", "checkedBy": "", "checkedDate": "" }
```

Rules the Phase 3 implementation and audit should enforce (proposals for the implementer and devops; nothing implemented here):
1. Empty `cells` → the calculator returns INSUFFICIENT DATA naming the table, never a number.
2. `bannerRequired` may be `false` only if `status` is `VERIFIED` **and** `verifiedBy` and `verifiedDate` are non-empty **and** every cell has `checkedBy`. Today's audit checks only "non-VERIFIED requires bannerRequired: true" and "VERIFIED requires non-empty verifiedBy"; the per-cell check is a new audit rule (skill: "Build fails if a safety table without verifiedBy lacks bannerRequired: true").
3. A table whose `edition` differs from the edition selected in C1/R1/P1 is never used.
4. Agents never fill `cells`, `rowKeys`, `columnKeys` with numbers. The human enters them (Q-33 for the workflow).
5. `rowKeys` and `columnKeys` are stored as printed (strings), with a parsed numeric form added only by the human-entry tool, so the band boundaries stay traceable.
6. `T7` rule records use `{ "rule": "reinforced-creepage-multiplier", "value": null, "clauseText": "", "clause": "" }` style entries, same provenance fields.
7. The gate (`src/core/gate.ts`) today requires the umbrella id `S-030…S-034`. Proposed code follow-up: require S-030, S-030a … S-030g, S-031, S-031a, S-032 (and S-033/S-033a for the IPC method) individually, so that one VERIFIED sub-row can never stand for the rest.

---

## 6. Open questions for the human

- **Q-30 Edition in use.** IEC 60664-1 ed. 2 (2007), ed. 3.0 (2020) or ed. 3.1 (2020 + AMD1:2025)? IPC-2221B (2012) or IPC-2221C (2023)? Table numbers and at least the altitude table differ by edition.
- **Q-31 Licensed copies at hand.** Do you have the licensed IEC 60664-1 and IPC-2221 (Table 6-1) now? If not, Phase 3 ships empty tables with INSUFFICIENT DATA and stops (phase-3 prerequisite).
- **Q-32 Product standard in play.** Which product standard governs your products (62368-1, 61010-1, 60601-1, 61558-1, 61800-5-1, 60335-1, other)? It may set its own tables, impulse levels or overvoltage-category meanings (S-030c conflict) and override 60664-1.
- **Q-33 Table-entry workflow.** Which do you prefer: (a) you type the cells into the JSON files and sign `verifiedBy`; (b) an in-app entry form that writes the JSON with per-cell provenance and a second-person check; (c) you send the values to an agent session that only transcribes what you dictate, with your sign-off per cell? (Agents must not enter values from memory under any option.)
- **Q-34 Overvoltage category meaning.** S-030c sources disagree on what II and III mean. Which definition does your product standard use? Until answered, the UI shows category names only.
- **Q-35 Reinforced insulation.** Confirm the rule text for clearance (next impulse step?) and creepage (multiplier?) in your edition (S-030f).
- **Q-36 Supply-voltage row key.** How does your edition map a nominal system (for example 230/400 V three-phase, DC bus) to the T1 row (line-to-neutral derivation table)?
- **Q-37 Field condition.** Does the clearance table have inhomogeneous/homogeneous columns and a pollution-degree dependence? If yes, should "inhomogeneous" be forced (conservative) or left as a mandatory input?
- **Q-38 Steady-state / recurring-peak clearance.** Does the edition have a second clearance table for steady-state or recurring peak voltages that must also be checked?
- **Q-39 Unknown CTI.** Does your edition assign a default material group when CTI is unknown? The app will still require an explicit choice; the answer decides the hint text.
- **Q-40 Creepage without clearance.** May the creepage calculator run without an associated clearance (result flagged), or must it refuse?
- **Q-41 Interpolation.** Does your edition permit linear interpolation in the creepage table (and the clearance table)? Default without an answer: next higher row.
- **Q-42 Coating and printed-wiring columns.** Do you want IEC 60664-3 coating credit at all in Phase 3? Which pollution degrees do your boards' printed-wiring columns cover?
- **Q-43 Altitude and creepage.** Confirm that your edition (and product standard) apply altitude correction to clearance only (S-032 counter-lead from HV practice).

---

## 7. Status summary for the orchestrator

- VERIFIED (structure only): S-030 (scope/role/edition), S-030d (pollution degree meanings), S-031 (60664-4 applicability), S-035 (waveform relations).
- CONFLICT: S-030c (overvoltage category II/III meanings).
- UNVERIFIED: S-030b (dependency structure), S-033a (IPC vs IEC), S-034 (product standards list).
- PAYWALLED-USER-MUST-VERIFY: umbrella S-030…S-034, S-030a, S-030e, S-030f, S-030g, S-031a, S-032, S-033.
- Nothing here lets the gate allow IEC 60664-1 labels: the umbrella row stays PAYWALLED until the human verifies every sub-row.
