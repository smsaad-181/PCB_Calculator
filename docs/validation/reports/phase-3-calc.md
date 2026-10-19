# Phase 3 calculations validation (calc-validator)

Date: 2026-10-19. Branch `phase-3`, head 2876cea. Validator: calc-validator. I am independent of the implementers and made no edits to `src/` or `tests/`.

Scope:
- waveform peak/RMS conversions (S-035);
- arithmetic of the gated spacing calculators (clearance, creepage, IPC spacing), run on validator-made synthetic tables only;
- whether ledger rows S-030..S-035 state their status honestly;
- whether any IEC 60664-1 / IPC-2221 numeric table value is present in the repository.

## Verdict: PASS-WITH-CONDITIONS

**There is no BLOCKER and no numeric defect.**
- Every conversion and every lookup/arithmetic rule matched my independent oracle exactly. Relative error is 0 in all comparable cases.
- The table shells are empty. `src/` and `tests/` contain no IEC 60664-1 or IPC-2221 table value.

**One non-numeric MAJOR (F-1) must be resolved before the phase closes.** The repository-wide claim "Nothing numeric from IEC 60664-1 or IPC-2221 exists anywhere in the repository" (OPEN_RISKS, Phase 3 core section) is not true for `docs/`. Values from those standards' tables or headings appear in:
- the ledger;
- the source notes;
- the KiCad research doc.

They come from public secondary pages, not from memory, and nothing in `src/` reads them. Either way, the statement and the phase rule disagree with the repository.

Six MINOR findings (F-2..F-7) go to OPEN_RISKS as conditions.

## Method (independence protocol)
1. Before reading any implementation, I read:
   - `docs/phases/phase-3.md`;
   - skill `iec60664-gating`;
   - `docs/research/spacing-structure-and-gating.md`;
   - ledger rows S-030..S-035.
2. From those I derived the expected rules:
   - sine V_pk = √2·V_rms; symmetric square V_pk = V_rms; triangle V_pk = √3·V_rms; DC equal;
   - DC+sine: V_rms = √(V_dc² + V_ac,rms²) and V_pk = V_dc + √2·V_ac,rms;
   - pulse: V_rms = V_pk·√D;
   - lookup: next-higher row, first row below the table, refusal above it, no interpolation unless the table says so;
   - clearance = max(T2, T3) × T4(altitude);
   - creepage = max(T5 × k_reinf, associated clearance), with no altitude term;
   - IPC: next-higher band, or above the top band, top + (V − V_top)·k_per-volt;
   - the reinforced rule comes only from T7.
3. I wrote a fresh python3 + math oracle (`tools/reference/validator_scratch/phase3_oracle.py`, deleted afterwards). Its RMS figures come from numerical integration of the RMS definition, not from crest-factor constants. It agrees with closed form to ≤ 5e-11 (midpoint rule, N = 2e5).
4. I drove the public APIs (`voltageFromWaveform`, `dcPlusSine`, `pulseRms`, `resolveVoltage`, and `compute()` of clearance, creepage and ipc-spacing) through a scratch vitest harness.
   - The harness used **my own synthetic tables**, built through `parseSpacingTable`/`makeTableSet`. I chose arbitrary round values. They were neither the repo's synthetic values nor standard values, and the harness was deleted afterwards.
   - The repo's own installed vitest was used; no third-party code was fetched.
5. Only after that did I read `waveform.ts`, `tables.ts` (lookup, parser), `gating.ts`, the three `calc.ts`/`guards.ts` files and the spacing view-models.
6. Repo suite for this phase: `src/core/spacing`, the three calculators and `tests/audit.test.ts` give 8 files and 394 tests, all passing.

## Numeric results

### Waveform conversions (S-035). Oracle = integral definition
| Case | Kind | Oracle (peak, rms) V | App (peak, rms) V | Rel. err |
|---|---|---|---|---|
| sine, rms 230 | golden | 325.2691193458119, 230 | 325.2691193458119, 230 | 0 |
| sine, peak 100 | golden | 100, 70.71067811865474 | same | 0 |
| triangle, peak 100 / rms 100 | golden | 57.73502691896258 / 173.2050807568877 | same | 0 |
| symmetric square, rms 100 | golden | 100, 100 | same | 0 |
| DC 100 | golden | 100, 100 | same | 0 |
| DC 120 + sine 30 rms | golden | 162.42640687119285, 123.69316876852982 | same | 0 |
| pulse 10 V, D = 0.36 | golden | rms 6 | 6 | 0 |
| sine rms 1e-3 V / 1e8 V | boundary | 1.41421e-3 / 1.41421e8 | same | 0 |
| sine rms 1e308 V | out-of-range | finite peak 1.414e308, or reject | finite 1.414e308 (overflow guard present, not triggered) | n/a |
| rms 0, −1, NaN, ±Inf; shape "sawtooth"; duty 0; peak < rms | degenerate | reject | INVALID_INPUT for each | n/a |
| 60 random cases (LCG seed 20261019, 4 shapes × both bases, 1e-2..1e7 V) | random | | | worst 0 |

`ref_calcs.py` pinned waveform vectors (11) agree with my oracle to ≤ 5e-11. The triangle case is limited by midpoint-rule resolution.

### Clearance (synthetic T2 rows 0.5/1/2/4/8 kV → 0.11/0.22/0.44/0.88/1.76 mm; T4 rows 2000/3000/5000 m → 1.0/1.1/1.3; validator values, not from any standard)
| Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|
| 2.5 kV, 1500 m (next-higher row 4 kV, below the first T4 row) | golden | 0.88 mm | 0.00088 m | 0 |
| 2.0 kV exact, 2000 m exact | golden | 0.44 mm | 0.44 mm | 0 |
| 2.5 kV, 2001 m (T4 next-higher row 3000) | golden | 0.968 mm | 0.968 mm | 0 |
| 0.3 kV (below the first row), 0 m | boundary | 0.11 mm | 0.11 mm | 0 |
| 8.0 kV exact (top row) | boundary | 1.76 mm | 1.76 mm | 0 |
| altitude −400 m | boundary | 0.88 mm (first T4 row) | 0.88 mm | 0 |
| 8.1 kV; altitude 6000 m | out-of-range | refuse | OUT_OF_SCOPE "OUT OF TABLE RANGE" | n/a |
| reinforced, T7 `next-higher-row`, 2.5 kV | golden | 1.76 mm (one row above 4 kV) | 1.76 mm | 0 |
| reinforced, 8.0 kV (no row above) | out-of-range | refuse | OUT_OF_SCOPE | n/a |
| reinforced, T7 `multiplier` 1.5, 2500 m | golden | 0.88·1.5·1.1 = 1.452 mm | 1.452 mm | 0 |
| reinforced, T7 without the rule | gating | refuse | INSUFFICIENT_DATA | n/a |
| impulse 0 V; altitude NaN | degenerate | reject | INVALID_INPUT | n/a |
| altitude missing | gating | "Insufficient inputs: altitude" | same | n/a |
| both impulse routes given | gating | reject | INVALID_INPUT | n/a |
| f = 2000 Hz > T7 limit 1000 Hz | out-of-scope | refuse, name IEC 60664-4 | refused, message names IEC 60664-4 (S-031) | n/a |
| all tables empty (shipped) | gating | INSUFFICIENT DATA | INSUFFICIENT_DATA | n/a |
| unverified data | claim | "indicative only" + UNVERIFIED | name "indicative only: minimum clearance"; warnings UNVERIFIED_TABLE_DATA, PRODUCT_STANDARD, PAYWALLED_TABLE_DATA, SOLDERMASK_NOT_COATING, SCOPE_NOT_CHECKED, T3_NOT_ENTERED | n/a |

### Creepage (synthetic T5 rows 50/100/250/500 V → 0.3/0.6/1.5/3.0 mm; T7 reinforced multiplier 2)
| Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|
| 240 V rms, clearance 0.88 mm | golden | 1.5 mm | 1.5 mm | 0 |
| 240 V, clearance 2.0 mm (floor applies) | golden | 2.0 mm | 2.0 mm (+ CREEPAGE_RAISED_TO_CLEARANCE) | 0 |
| reinforced 240 V, clearance 0.5 mm | golden | 1.5·2 = 3.0 mm | 3.0 mm | 0 |
| 50 V exact; 10 V (below the first row) | boundary | 0.3 mm | 0.3 mm | 0 |
| sine peak 353.5533905932738 V → rms 250.0000000000 (float) | boundary | exact row 250, 1.5 mm (not 3.0) | 1.5 mm | 0 |
| sine peak 240·√2 | golden (waveform route) | 1.5 mm | 1.5 mm | 0 |
| 600 V | out-of-range | refuse | OUT_OF_SCOPE | n/a |
| altitude 0 / 5000 / 99999 m | altitude must not matter | 1.5 mm for all | 1.5 mm for all | 0 |
| rms 0 V; materialGroup + CTI both | degenerate | reject | INVALID_INPUT | n/a |
| no associated clearance; peak only (no rms, no waveform) | gating | Insufficient inputs | `associatedClearance`; `workingVoltageRms` | n/a |
| reinforced with T7 lacking the multiplier | gating | refuse | INSUFFICIENT_DATA | n/a |

### IPC spacing (synthetic T8 rows 15/30/50/100 V; B1 internal, B2/B3 external uncoated below/above breakpoint 4000 m; per-volt 0.005 mm/V, or 0.2 mil/V in set B)
| Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|
| internal 25 V | golden | 0.1 mm | 0.1 mm | 0 |
| internal 150 V (per-volt extension) | golden | 1.5 + 50·0.005 = 1.75 mm | 1.75 mm | 0 |
| internal 150 V, per-volt in mil/V | golden (units) | 1.5 + 50·0.2·0.0254 = 1.754 mm | 1.754 mm | 0 |
| external uncoated 40 V, 1000 m → B2 | golden | 1.2 mm | 1.2 mm | 0 |
| external uncoated 40 V, 4000 m (at the breakpoint) → B3 | boundary | 1.8 mm ("above", conservative) | 1.8 mm | 0 |
| 15.0001 V (just above a row) | boundary | next row, 0.1 mm | 0.1 mm | 0 |
| 100 V exact (top row) | boundary | 1.5 mm | 1.5 mm | 0 |
| sine 100 V rms declared → 141.42 V peak | golden | 1.5 + 41.421·0.005 = 1.70711 mm | 1.7071068 mm | 0 |
| rms only, no waveform | gating | "Insufficient inputs: voltagePeak" (no peak inferred) | same | n/a |
| external uncoated, no elevation | gating | Insufficient inputs: elevation | same | n/a |
| vacuum with no vacuum column; coated with no column | gating | INSUFFICIENT DATA | INSUFFICIENT_DATA | n/a |
| 0 V | degenerate | reject | INVALID_INPUT | n/a |

### Sensitivity (±1 %, ±10 % around a row boundary)
| Input | ×0.90 | ×0.99 | ×1.00 | ×1.01 | ×1.10 | Direction |
|---|---|---|---|---|---|---|
| impulse around 2 kV → clearance mm | 0.44 | 0.44 | 0.44 | 0.88 | 0.88 | non-decreasing step ✓ |
| altitude around 3000 m → clearance mm (2.5 kV) | 0.968 | 0.968 | 0.968 | 1.144 | 1.144 | non-decreasing step ✓ |
| rms around 250 V → creepage mm | 1.5 | 1.5 | 1.5 | 3.0 | 3.0 | non-decreasing step ✓ |
| peak around 150 V → IPC mm (extension) | 1.675 | 1.7425 | 1.75 | 1.7575 | 1.825 | linear, slope = per-volt ✓ |

These calculators are step lookups, so a ±1 % input change can produce a full row step. The spacing results have no sensitivity readout, which is correct for a step function; the steps list names the matched row.

### Known-pitfall checklist (Phase 3 items)
| Pitfall | Status |
|---|---|
| Creepage never derived from voltage alone (needs PD, material group, surface, table) | ✓ all mandatory, no defaults |
| Altitude factor applied to clearance only | ✓ (K10: altitude has no effect on creepage; clearance × T4) |
| Creepage ≥ clearance | ✓ max(creepage, associated clearance), with a warning |
| Reinforced rule only from T7 | ✓ no constant in code; a missing record means INSUFFICIENT DATA |
| No interpolation by default | ✓ next-higher row; linear only with `interpolation: "linear"` plus a non-empty `interpolationSource` |
| Clearance uses peak, creepage uses RMS, IPC uses DC/AC peak | ✓ (TI SLUAAR5 quotes below) |
| Peak never inferred from RMS without a declared waveform | ✓ (P6, K12) |
| mil ↔ mm exact (S-006) | ✓ 25.4e-6 m/mil, including mil/V |
| Per-volt extension uses (V − V_top) | ✓ (Altair PollEx: per-volt values "must be added"; the excess voltage is multiplied) |

## Cross-checks
`tests/crosscheck/` has no spacing record. X-03-twc-ipc2221 covers trace width, not spacing. A numeric cross-check against a reference tool needs real table values, which the repository must not contain. Status: **not yet obtained / not applicable** until the human enters licensed tables.

## Source table (re-fetched by me, 2026-10-19)
| Claim | URL | What I read | Ledger status | My assessment |
|---|---|---|---|---|
| RMS definition; sine V_rms = V0/√2 | https://openstax.org/books/university-physics-volume-2/pages/15-4-power-in-an-ac-circuit | "By definition" I_rms = √(i²_ave), with i²_ave = (1/T)∫₀ᵀ i² dt; "I_rms = I₀/√2", "V_rms = V₀/√2" (radical garbled by the fetcher) | S-035 VERIFIED | Honest |
| sine 0.707, square crest factor 1, triangle/sawtooth 0.577, "only for pure forms" | Kuphaldt LibreTexts §1.3 (URL in S-035) | Verbatim quotes as in the ledger. The square-wave text does not say "symmetric"; it says "the peak is the same as the RMS and average values", which holds only for a bipolar symmetric square. The app's label "Symmetric square" is the correct reading | S-035 VERIFIED | Honest. Two independent tier-2 sources. The DC+AC line is derived algebra (my integral oracle confirms it) |
| IEC 60664-1 scope, ed. 3.0 2020-05-26, Annex G/H, Table F.10 | https://webstore.iec.ch/publication/59671 | Verbatim, as the ledger states | S-030 VERIFIED (structure) | Honest |
| Scope limits AC 1 000 V / DC 1 500 V, 30 kHz, 2 000 m | same | Verbatim | S-030a PAYWALLED | Conservative (abstract verbatim, clause 1 unread). Acceptable |
| Clearance from impulse withstand; clearance working voltage = peak; creepage = RMS; reinforced creepage "twice" basic; reinforced clearance "as specified in Table F.2"; creepage raised to clearance; final distance = max | https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-B1A84E91-DDEE-4C92-A54D-03C5F8DE95DD | Verbatim quotes. No statement on interpolation | S-030b UNVERIFIED, S-030f PAYWALLED | Honest |
| Creepage ≥ associated clearance; creepage from long-term RMS; altitude factors for clearance (nothing said about creepage) | https://ptr-hartmann.com/know-how/connection-technology/approvals-standards/clearance-and-creepage-distances | Verbatim; cites EN 60664-1:2007 | S-030b, S-032 | Honest. "Altitude does not scale creepage" is correctly left unconfirmed (S-032, Q-43) |
| IEC 60664-4 scope above 30 kHz up to 10 MHz, only with Part 1/5, values apply to basic insulation | https://webstore.iec.ch/en/publication/2804 | Verbatim | S-031 VERIFIED, S-031a PAYWALLED | Honest |
| IPC-2221 Table 6-1 headings; per-volt "must be added" for the excess over the top band | https://help.altair.com/pollex/topics/pollex/verification/dfe_ipc_material_r.htm | Heading texts B1..A7; per-volt term multiplies only the voltage above the top band | S-033 PAYWALLED | Honest. Supports the app's extension formula structure |
| S-030c CONFLICT, S-030d VERIFIED (structure), S-030e PAYWALLED, S-033a / S-034 UNVERIFIED | ledger URLs | Not re-fetched beyond the above | as listed | Plausible and conservative. S-030d VERIFIED rests on two manufacturer (tier-3) pages for definitions only, and the app shows no default degree, so this is acceptable |

`src/core/data/ledger-status.ts` matches `LEDGER.md` for every S-030..S-035 row, including the umbrella pointer. The compliance gate still denies IEC 60664-1 because the umbrella row is PAYWALLED. No spacing source or UI text contains "compliant", "certified", "production safe" or "fab-ready". The VERIFIED-data recommendation says only "lookups from user-entered tables signed off by <name> … the product standard may require more".

## "No numeric table value in the repository" check
- **Shells:** confirmed empty. All 8 shells (`src/core/data/iec60664/T1..T7`, `src/core/data/ipc2221-spacing.json`) have status PAYWALLED-USER-MUST-VERIFY, `entered: false`, and 0 rows, columns, cells, groups and rules, with no breakpoint.
- **`src/` and `tests/`:** confirmed clean.
  - I scanned for the characteristic impulse, altitude, per-volt, breakpoint and scope figures. Every hit is an input in a test, a unit-slip window, or the repo's synthetic data (fake round values: T1 1..5 kV, T4 1/2/3, T8 0.25 mm/V, breakpoint 3000 m, CTI 0/20/50/90).
  - No scope limit (30 kHz, 1 000 V, 1 500 V, 2 000 m) is in code. Scope limits are T7 records only.
- **`docs/`:** NOT clean (finding F-1). See the defects list.

## Defects

### F-1. MAJOR (policy/claim honesty, non-numeric): IEC 60664-1 / IPC-2221 numeric values are present in `docs/`, and OPEN_RISKS states the opposite
- **Where:**
  - `docs/sources/LEDGER.md` S-030e and `docs/sources/notes/spacing-iec60664-ipc2221.md` lines 82-85 hold the four CTI band limits of the material groups. These are the complete content of human-owned table T6.
  - `docs/sources/LEDGER.md` S-010 (notes column) and `docs/sources/notes/ipc2221.md` lines 34-40 hold the IPC-2221 elevation breakpoint in metres. This is the content of T8 `elevationBreakpoint`, which the research doc says must come "from the data file".
  - `docs/research/kicad-pcb-calculator.md` C-K14, line 98 and E1 hold the IPC top voltage-band boundary used for the per-volt extension. The research doc §1 lists "voltage band boundaries" among the values that must not be written.
- **Context:** none of these is a spacing distance, impulse voltage or altitude factor. All came from public secondary pages (PTR Hartmann, In Compliance, KiCad source), not from memory. All are labelled PAYWALLED or tier-4. Nothing in `src/` reads them.
- **Problem:** OPEN_RISKS ("Phase 3 core") says "Nothing numeric from IEC 60664-1 or IPC-2221 exists anywhere in the repository". The phase-3 ledger header says "STRICT: no numeric … table value is recorded anywhere in this ledger". Both are untrue as written.
- **Expected:** either (a) redact these values from the docs and replace them with "see licensed copy", or (b) have the human record an explicit exception for publicly printed definitional/heading facts, and correct the OPEN_RISKS sentence.
- **Owner:** standards-researcher (redaction or wording); human (exception decision).

### F-2. MINOR: one `reinforced-clearance` rule record is applied to both T2 (impulse) and T3 (steady-state/recurring peak)
- **Repro:** reinforced insulation with T3 populated. `stepUp` is passed to both lookups (`clearance/calc.ts` lines 115 and 131).
- **Problem:** the standard's reinforced rule for the steady-state case may differ from the impulse case. This is paywalled, and I cannot verify it.
- **Suggested fix:** separate rule ids (`reinforced-clearance-impulse`, `reinforced-clearance-steady-state`), or refuse reinforced with T3 populated until the human records how T3 is treated.
- **Owner:** calc-implementer, with the human for the rule text.

### F-3. MINOR: "next-higher-row" for reinforced clearance means the next T2 row, not necessarily the next rated-impulse step
- **Problem:** the two are the same only if the T2 rows the human enters are exactly the preferred impulse series. If T2 has intermediate rows, the step-up is smaller than "next impulse step" (non-conservative).
- **Suggested fix:**
  - state in the import help and in the rule's assumption text that `next-higher-row` steps one T2 row; and/or
  - add a mode that steps in the T1 cell series.
- **Owner:** calc-implementer / ui-engineer.

### F-4. MINOR: the coating credit is modelled as a distance multiplier ≤ 1
- **Problem:** IEC 60664-3 as described publicly (S-030g) works differently. Type 1 "improves the microenvironment", i.e. a different pollution-degree column, and type 2 is "similar to solid insulation". A single factor cannot express "use the PD1 column". The credit is applied only when the user selects it AND T7 is VERIFIED, so there is no numeric risk today.
- **Suggested fix:** model type 1 as a pollution-degree substitution before any human enters a coating record (already partly logged as P3-6).
- **Owner:** calc-implementer.

### F-5. MINOR: traceability gap, S-035 not cited when a declared waveform is used
- **Repro:** clearance, creepage or IPC with `waveform` set.
- **Problem:** `reference.ledgerIds` lacks S-035. The IPC result also lacks S-006 (mil/mm and mil/V conversion). The input `sourceDetail` says "from the declared … waveform", but the ledger id is missing.
- **Suggested fix:** append S-035 when `voltageHow === 'waveform'`.
- **Owner:** calc-implementer.

### F-6. MINOR: no consistency check between the declared waveform and the frequency, and no unipolar-square hint
- **Problems:**
  - `shape: 'sine'` with `frequency: 0` is accepted and treated as DC for the T7 voltage-scope rule (peak used against the DC limit).
  - `shape: 'dc'` with f > 0 is also accepted.
  - A unipolar 0..V square (gate drive) declared as "Symmetric square" from an RMS value gives peak = RMS. The true peak is √2·RMS, so this is non-conservative for the clearance/IPC working voltage. The "Symmetric" label mitigates this.
- **Suggested fix:** warn on a shape/frequency mismatch, and add a hint "for unipolar pulses enter peak and RMS directly".
- **Owner:** calc-implementer / ui-engineer.

### F-7. MINOR (hygiene): `src/core/spacing/tables.ts` contains two raw NUL bytes inside template literals (lines 1047 and 1091, the cell-map key separator)
- **Problems:**
  - `grep` treats the file as binary ("Binary file matches"), which hampers review and audit greps. Git still diffs it as text because the NUL is beyond the first 8 KB.
  - Keys containing `\u0000` (legal in JSON) could collide in theory.
- **Suggested fix:** use the escape `'\u0000'` in source, or a `Map<string, Map<string, Cell>>`.
- **Owner:** calc-implementer.

### Not defects, noted
- `dcPlusSine` and `pulseRms` are correct (verified above) but are not wired to any calculator or UI. `dcPlusSine` rejects V_dc ≤ 0 with a clear message, so it never produces a wrong number.
- Functional and supplementary insulation use the basic lookup. This is stated as an assumption and is conservative.
- At the IPC elevation breakpoint the "above" column is used. This is conservative and stated.
- `npm run check:size` reports a BLOCKER (bundle total). This is logged by the UI work and outside calculation scope; the phase-validator owns it.

## What I could NOT verify
- Any IEC 60664-1, IEC 60664-3/-4 or IPC-2221 table value, clause text, or rule:
  - reinforced rules (S-030f);
  - interpolation permission (Q-41);
  - whether altitude correction excludes creepage (S-032 / Q-43);
  - the T1 row-key semantics (Q-36);
  - the IPC column set per revision (S-033).

  All of these are paywalled. I read only the official abstracts and manufacturer/tool pages listed above.
- The correctness of any human-entered table. None exists yet (P3-1), so the exit criterion "Human has signed verifiedBy" is vacuous.
- A numeric cross-check against a reference tool (for example the KiCad IEC 60664 panel). It needs real table values, and those must not enter the repository.
- The UI rendering of banners, which I checked only in view-model code, not in a browser.

Validator scratch files (`tools/reference/validator_scratch/`) were deleted after the run.
