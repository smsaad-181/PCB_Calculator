# Phase 3 phase-validator report (safety spacing)

- Branch `phase-3`, head `2876cea` (working tree clean apart from an untracked `tools/reference/validator_scratch/` not made by this validator)
- Date 2026-10-19. Lens: senior engineer + standards auditor. No edits to `src/` or `tests/`.
- Inputs read: `docs/phases/phase-3.md`, `docs/PLAN.md`, `CLAUDE.md`, `docs/SPEC.md`, `.claude/skills/iec60664-gating/SKILL.md`, `docs/sources/LEDGER.md` (S-030…S-035), `docs/validation/OPEN_RISKS.md`, Phase 3 code (`src/core/spacing/*`, `src/core/calculators/{clearance,creepage,ipc-spacing}/*`, `src/core/data/iec60664/*.json`, `src/core/data/ipc2221-spacing.json`, `src/state/spacing-store.ts`, `src/ui/components/Spacing*.tsx`, the three pages and view-models), `tools/audit-lib.mjs`, `.github/workflows/deploy.yml`.

## Verdict: PASS-WITH-CONDITIONS

The code does what the phase allows when the human has no licensed copies: the full gated logic and UI ship with EMPTY tables and every page ends in INSUFFICIENT DATA. There are no BLOCKERs. Two MAJOR items and several MINOR ones are listed in section 9. This verdict does not close the phase: the calc-validator report `phase-3-calc.md` did not exist when this review ran, and the pcb-domain report is also still to come.

**Accepted deferral, stated openly:** PLAN.md (line 6) says Phase 3 runs "only after the human enters and verifies licensed tables". `phase-3.md` gives a fallback for when that is not possible: "build the full gated UI/logic with empty tables and an INSUFFICIENT DATA state, and stop". The user took that fallback (Q-31, OPEN_RISKS P3-1). As a result:
- No numeric clearance, creepage or IPC spacing can be produced.
- The exit criterion "Human has signed `verifiedBy` for any table shipped without banner" is met only **vacuously**: all eight shipped tables are `bannerRequired: true`, `status: PAYWALLED-USER-MUST-VERIFY`, `entered: false`.
- The numeric part of Phase 3 is deferred to the human (P3-1) and is NOT done.

This report treats that as an accepted deferral, not as a completed criterion.

## 1. Gates (run by this validator)

`npm ci` could not run on this workstation. It failed with `EPERM ... unlink ...\@rolldown\binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node` because a running node process (the `vite preview` on :4173) holds that native binding open. npm ci had already removed most of `node_modules`. I restored it with `npm install --no-audit --no-fund`, then ran `git checkout -- package-lock.json` (see M-4). The tree was clean again before any gate ran. CI uses a fresh runner with `npm ci` and is not affected.

| Gate | Result (real output) |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, exit 0 |
| `npm run lint` | `eslint .`, exit 0 |
| `npm test` | `Test Files  168 passed (168)` / `Tests  6559 passed (6559)` |
| `npm run test:coverage` | 168/6559 passed; `All files | 97.77 | 95.68 | 98.64 | 98.85` |
| Phase 3 files only (clearance, creepage, ipc-spacing, spacing/, gate, spacing.vm, spacing.source, spacing-store, audit) | `Test Files  12 passed (12)` / `Tests  521 passed (521)` |
| `npm run build` | `✓ built in 349ms` |
| `npm run check:size` | `largest first-load PathLoad 131.34 KB of 150.00 KB`; `total 399.16 KB gzip JS of 400.00 KB ceiling (72 files)`; `check:size: PASS`. Spacing routes: Clearance 67.58, Creepage 67.54, IpcSpacing 65.86 KB |
| `npm run check:audit` | `10 data tables audited, 92 ledger rows checked`; `check:audit: PASS` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | exit 0, 2012 `OK` lines, no failures |
| `python3 tools/reference/gen_golden.py --check` | `OK   docs/golden-vectors.json matches the oracle` |

## 2. Exit criteria (docs/phases/phase-3.md)

| Criterion | Status | Evidence |
|---|---|---|
| Gating tests: each missing mandatory input blocks output | MET | `src/core/calculators/clearance/calc.test.ts`: `it.each(REQUIRED)('missing %s blocks the output and is listed')`, `'property: removing any non-empty subset of the mandatory inputs always blocks the output'`, `'null and blank values count as missing'`, `'inputs are checked before tables'`. The same set exists in `creepage/calc.test.ts` (l.187, 195, 222) and `ipc-spacing/calc.test.ts`. UI: `spacing.vm.test.ts` `'each missing clearance input blocks the output'`, `'creepage: each missing mandatory input blocks the output'`. Core message: `Insufficient inputs: <list>` (`gating.ts insufficientInputs`). No mandatory input has a default (guards, `CALCULATOR_STATE_KEYS` test `'empty or default state writes nothing'`). |
| Altitude affects clearance only; creepage ≥ clearance enforced | MET (logic; only synthetic data exists) | Clearance multiplies by the T4 factor (`clearance/calc.ts` step 6). Tests: `'altitude multiplies the clearance by the T4 factor'`, `'a higher altitude never lowers the clearance'`. Creepage ignores altitude and says so: `ALTITUDE_NOT_USED`, test `'property: altitude never changes creepage'`. Floor `creepage = max(creepage, associatedClearance)` (`creepage/calc.ts` l.121-133), with `associatedClearance` mandatory (Q-40). Tests: `'creepage below the associated clearance is raised to it'`, `'property: creepage is never below the associated clearance'`. |
| Human has signed `verifiedBy` for any table shipped without banner | VACUOUSLY MET / DEFERRED | No table ships without the banner. All 8 shells have `"bannerRequired": true` and `"verifiedBy": ""`. The audit rule (`tools/audit-lib.mjs` l.135-138) fails the build otherwise and is run in CI (`deploy.yml` `npm run check:audit`). The signing itself is P3-1 (human). |
| Three validator reports PASS/PASS-WITH-CONDITIONS | NOT YET MET | `docs/validation/reports/` has no `phase-3-calc.md` or `phase-3-pcb.md` at the time of this review. This report is the second of three. |

Tasks 1-5:
- **Task 1 (schema + audit).** Met. `pcb-calc/safety-table@1` has `source, edition, entered, enteredBy/Date, verifiedBy/Date, bannerRequired`, per-cell provenance, and `checkedBy/Date` on every record. Two independent enforcers exist: the importer (`tables.ts` l.838-848: VERIFIED needs signer, date, banner off and every record checked; non-VERIFIED needs banner on; signer without VERIFIED is refused) and the build audit (`audit-lib.mjs`, fixture `tests/fixtures/.../spacing-bad/.../T2.json`, `tests/audit.test.ts`).
- **Task 2.** Met. Clearance and creepage follow the skill's structure, and the IPC method is separate and labelled `IPC-2221 conductor spacing (design guideline; not a safety insulation assessment)`.
- **Task 3.** Met. There is no number without the mandatory inputs. Entered-but-unverified data produces a red `UNVERIFIED` banner (severity critical) and the `indicative only` prefix on the result name, note and recommendation. Tests: `'ENTERED_UNVERIFIED data: red UNVERIFIED banner...'` and `'one unverified table among verified ones makes the whole result indicative only'`.
- **Task 4.** Met, see section 4.
- **Task 5.** Met conservatively. Grooves, slots and ribs are **never** credited, even when a verified rule exists; only a warning is shown (`creepage/calc.ts` l.167-172). This is stricter than the task asks and is logged as accepted deferral P3-6.

## 3. Spec traceability (SPEC.md for Phase 3)

| Requirement | Code | Test | Gap |
|---|---|---|---|
| SPEC §roadmap row 3: IPC-2221 spacing; IEC 60664-1 clearance & creepage with gating (human-verified tables) | `src/core/calculators/{clearance,creepage,ipc-spacing}`, `src/core/spacing/{gating,tables,waveform}.ts` | calc tests listed in section 2; `tables.test.ts`, `tables.edge.test.ts`, `waveform.test.ts` | Tables empty (P3-1, human) |
| SPEC l.11: altitude → clearance only | clearance step 6; creepage `ALTITUDE_NOT_USED` | property tests above | none |
| SPEC l.11: frequency > ~30 kHz → IEC 60664-4 warning | `gating.ts checkScope`: refuses above a **T7-recorded** limit and names IEC 60664-4. With no T7 record it gives the generic `HF_NOT_CHECKED` warning for any f > 0 | `'frequency above the T7 limit gives no number and names IEC 60664-4'`, `'with no recorded limit a generic "not checked" warning appears...'` | No 30 kHz literal in code, on purpose (S-031a is PAYWALLED). Gap m-6: while tables are empty, the HF warning never reaches the user, because the scope check runs after the empty-table refusal. Only the field help text mentions it |
| Result schema (`CalcResult`) | `assertCalcResult` in every `build()` | `result.schema.test.ts`; per-calc tests | none |
| Rule-based confidence | `spacingConfidence` → `rateConfidence`. Unverified gives accuracy class `estimate`; signed gives `analytical`; PAYWALLED data status keeps it below high | `'VERIFIED data (human signed): ... still PAYWALLED and never high'` | none |
| Bundle ≤150 KB/route, ≤400 KB total | `tools/check-size.mjs` | gate output above | 0.84 KB headroom (M-1) |
| Inputs guarded (NaN/Inf/zero/negative) | `gating.ts readQuantity`; unit-slip windows labelled as plausibility checks, not standard limits | `'bad %s is an error value'`, `'property: random garbage in any field never throws'` | none |

## 4. Standards honesty

- **gate.ts.** Untouched in Phase 3: `git diff 2932a51..HEAD -- src/core/gate.ts` is empty, and its last change is `eb0c328` (Phase 1/2). It still denies IEC 60664-1 because `STANDARD_REQUIREMENTS['IEC 60664-1'] = ['S-030…S-034']` and that pointer row is `PAYWALLED-USER-MUST-VERIFY` (`ledger-status.ts` l.83). `gate.test.ts` l.72/122/130 cover this. No spacing calculator calls the gate or emits conformance wording. Fragility (m-3): the gate depends on an umbrella pointer id, not on the real sub-rows (already P3-2).
- **Forbidden phrases.** `grep -rniE "compliant|certified|guaranteed|production safe|is safe|meets (iec|ipc)|conforms?"` over `src` (non-test, excluding gate.ts) finds only "conformal" (coating, mapping) and one "not guaranteed extremes" (tolerance). Neither is a claim. `tables.ts` was grepped separately with `-a` because grep treats it as binary (m-2); it is clean. Tests: `'no compliance wording in any output (fragment-assembled patterns)'` in all three calcs, and `spacing.source.test.ts` `'the page never types a forbidden claim'`.
- **Product-standard banner, verbatim and always visible.** `gating.ts` `PRODUCT_STANDARD_BANNER` is identical, character for character, to the skill sentence. The UI imports it, never retypes it (`spacing-common.vm.ts` l.7/51; test `'banner wording is imported from the core, never retyped'`). `SpacingBanners` renders it unconditionally and is placed above the form on all three pages (`Clearance.tsx` l.44, `Creepage.tsx` l.46, `IpcSpacing.tsx` l.51), outside any state branch. Tests: `'banners are on the needs-input state'`, `'every error state still carries the banners'`, `'no UNVERIFIED banner and no prefix, but the product banner stays'`.
- **Soldermask is not coating.** `SOLDERMASK_NOTE` is always shown. Coating credit needs a user selection AND a VERIFIED T7 `coating-credit` record (`coatingDecision`). Declaring solder mask adds a note only. Tests: `'solder mask is never a coating credit'`, `'solder mask earns no credit: declaring it changes nothing but a note'`. On the IPC page, the `permanent-polymer-or-solder-mask` option only selects the IPC Table 6-1 column, and the page says so (test `'the IPC page adds that its coating choice only selects a table column'`). The Rev C B4 wording conflict is recorded in S-033.
- **Legacy / estimate labels (Phase 1 items).** Unchanged by Phase 3, and the existing tests still pass.

## 5. Source ledger: spot-checks (web, 2026-10-19)

| Row | Claim in ledger | Finding | Result |
|---|---|---|---|
| S-030a | IEC 60664-1 scope: up to AC 1000 V / DC 1500 V, up to 30 kHz, up to 2000 m | Confirmed by publisher abstracts: [SFS](https://store.sfs.fi/en/iec-60664-1-2020), [EVS](https://www.evs.ee/en/iec-60664-1-2020), [UNE](https://www.en.une.org/encuentra-tu-norma/busca-tu-norma/iec?c=59671) | Consistent; PAYWALLED status correct (numeric) |
| S-030 | Ed. 3.0 2020; consolidated ed. 3.1 = 2020+AMD1:2025 | VDE preview lists [IEC 60664-1 ed3.1](https://www.vde-verlag.de/iec-normen/preview-pdf/info_iec60664-1{ed3.1}en.pdf) | Consistent, not stale |
| S-031 / S-031a | IEC 60664-4:2005: f > 30 kHz up to 10 MHz; only with Part 1 or Part 5 | Confirmed: [IEC webstore 2804](https://webstore.iec.ch/publication/2804), [EVS](https://www.evs.ee/en/iec-60664-4-2005) | Consistent |
| S-030e | Material groups I ≥600; II 400-<600; IIIa 175-<400; IIIb 100-<175 | Confirmed: [PTR Hartmann](https://ptr-hartmann.com/know-how/connection-technology/materials/insulation-material-groups), [In Compliance](https://incompliancemag.com/material-group-selection-and-how-it-affects-spacings/). TI uses strict `<` at the boundary, as the ledger notes. [Wikipedia](https://en.wikipedia.org/wiki/Comparative_Tracking_Index) says unknown CTI → IIIb, which the ledger already lists as an open human question | Consistent; PAYWALLED correct |
| S-030f | Reinforced: creepage twice basic; clearance from Table F.2 (next higher impulse step) | [TI SLUAAR5](https://www.ti.com/lit/pdf/sluaar5) secondary reading: clearance from the next-higher impulse row, while doubling applies to creepage. A calculator tool ([viox](https://tools.viox.com/clearance-creepage-calculator/)) states creepage = 2 × basic | Consistent with ledger. **Shows the skill text "reinforced doubles basic" is wrong for clearance** (m-1) |
| S-033 | IPC-2221 Table 6-1: B1-B4, A5-A7, peak-voltage bands, per-volt increment above the top band | [Altair Pollex help](https://help.altair.com/pollex/topics/pollex/verification/dfe_ipc_material_r.htm), [Altium](https://resources.altium.com/p/using-an-ipc-2221-calculator-for-high-voltage-design) | Structure consistent; no values entered (correct) |
| S-034 | IEC 62368-1:2023 ed. 4.0, 2023-05-26 | Confirmed: [IEC webstore 69308](https://webstore.iec.ch/publication/69308). Note: webstore stability date 2026, so a new edition may appear soon (watch item m-7) | Consistent |
| S-035 | Sine rms = pk/√2; square crest 1; triangle pk/√3 | Textbook identities; oracle `ref_calcs.py` waveform vectors pass | Consistent |

Constants in code: there is no IEC or IPC numeric value anywhere. The only engineering constants are √2 and √3 (S-035, VERIFIED textbook). Plausibility windows (altitude −500…100 000 m, frequency ≤1e12 Hz, voltage/length windows) are labelled in code as unit-slip checks, "not a standard limit". `MAX_IMPORT_CHARS` is a safety cap, not an engineering constant. No unsupported or stale rows found.

## 6. Architecture

- `src/core` purity: grep for `document|window|fetch|localStorage|Date.now|Math.random` in non-test `src/core` finds no use. The importer takes `today` by injection. Tables are deep-frozen, `VERIFIED` is derived, never stored (`dataStateOf` needs `PARSED` membership plus signatures plus every record checked), and hand-built tables or sets are refused.
- Units: inputs are `Quantity` with dimension checks (`readQuantity` → `DIMENSION` error). The table units are converted through `unitFactorSi`, so no units are mixed.
- Result schema: `assertCalcResult` runs on every result. Compliance wording appears only in `gate.ts`.
- Synthetic test tables (`synthetic-tables.testutil.ts`) are never imported by shipped code (`spacing.source.test.ts`).

## 7. Stability and security

- Input guards: NaN/±Inf/zero/negative are refused with field-level messages, garbage-input property tests pass, and `compute()` never throws (try/catch → `INTERNAL`).
- Importer: a 524 288-character cap is checked before `JSON.parse`. Strict schema, unknown keys rejected, string-length and array limits, future dates refused (injected `today`). The UI textarea has `maxLength={MAX_IMPORT_CHARS}`, the file picker uses `FileReader` on a user action only, and files larger than 4 bytes × cap are refused before reading (test l.450).
- No network: `spacing.source.test.ts` forbids `fetch/XMLHttpRequest/WebSocket/sendBeacon/EventSource`, and the CSP in `index.html` has `connect-src 'none'`.
- localStorage draft: key `pcb-calc/spacing-tables-draft@1` (versioned). It is re-validated through the importer on load; an invalid draft is discarded with a plain notice, and storage failures are caught. Imported tables never enter the URL hash (test `'imported tables are never part of the link'`).
- XSS: no `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` in `src`. User-imported strings (names, sources, clause text) are rendered as JSX text only.
- Dependencies: `npm audit --omit=dev` reports 0 vulnerabilities. No new runtime dependency (package.json unchanged in Phase 3).
- Design note, not a defect: an imported file can claim VERIFIED with any signer name, and the app passes that claim on. This is the intended human exit path, and the panel says so (UI3-1, human decision).

## 8. Deployment

`deploy.yml`, `vite.config.ts` and `package.json` are unchanged since Phase 2 (`git diff 2932a51..HEAD --stat` is empty for them). CI runs typecheck, lint, oracle, `gen_golden --check`, coverage, build, `check:size` and `check:audit`, and actions are SHA-pinned. `base: './'` is relative, so the Pages sub-path works. The local preview at :4173 serves the rebuilt `index-CFZGycfA.js` (HTTP 200). The rollback procedure is in `docs/RUNBOOK.md`. Action currency was checked in Phase 2 and is carried by PV2-8 (setup-node 7.1.0 available, Pages enablement and PR still human).

## 9. Defects and conditions

| # | Severity | Finding | Evidence | Owner |
|---|---|---|---|---|
| M-1 | MAJOR (condition) | Bundle total 399.16 of 400 KB, only 0.84 KB headroom. Any Phase 4 page or ledger growth will fail `check:size` in CI. Per-route is fine (max 131.34/150). | `check:size` output, section 1 | devops-engineer + human (budget decision or a further split before Phase 4 starts) |
| M-2 | MAJOR (doc accuracy) | OPEN_RISKS is stale and misleads the human. (a) The "BLOCKER (bundle budget)" paragraph still says `check:size FAILS ... 410.94 KB`, but it now passes at 399.16 after the state-key and ledger-status split in 2876cea, and nothing records how it was resolved. (b) P3-4 still reads "No UI, no import UI ... OPEN (deferred)", but the UI and import shipped in 2876cea. (c) CP-2 headroom figures are out of date. | `OPEN_RISKS.md` l.435, l.471, l.422 against the gate output | orchestrator (update rows; this validator only appended its own section) |
| C-1 | Condition | Exit criterion 4 is not yet met: `phase-3-calc.md` and `phase-3-pcb.md` are absent. | `ls docs/validation/reports` | orchestrator (run calc-validator and pcb-domain-reviewer) |
| m-1 | MINOR | Skill `iec60664-gating` is stale (P3-5, confirmed). "reinforced doubles basic" is wrong for clearance: secondary sources say reinforced clearance is the next-higher impulse row, and doubling applies to creepage. "about 30 kHz" is supported by the official abstract (S-031a), but the code takes the limit only from a user-entered T7 record, and the skill does not say so. The code is correct and the skill is the stale part. SPEC l.11 "> ~30 kHz" should likewise say "limit from T7 / S-031a". | skill text against S-030f, S-031a and web checks | orchestrator |
| m-2 | MINOR | `src/core/spacing/tables.ts` contains two raw NUL bytes (l.1047, l.1091, template-literal key separators). grep then treats the file as binary and skips it in text searches, so a human or CI grep for forbidden phrases would silently miss it. Use the escape `\u0000` or another separator. | `node` scan: lines 1047, 1091 contain U+0000 | calc-implementer |
| m-3 | MINOR | The gate for IEC 60664-1 depends on the umbrella pointer id `S-030…S-034`, not on the real sub-rows. It denies today, but verifying the sub-rows will not change it, and the pointer row could be flipped on its own. | `gate.ts` l.29, LEDGER l.117 (already P3-2) | calc-implementer (when P3-2 is decided) |
| m-4 | MINOR | `package-lock.json` root metadata does not match `package.json`: lock has `version 1.0.0`, `license ISC` and no `engines`; package.json has `0.0.0` and `engines.node >=22`. `npm install` rewrites it. `npm ci` still passes because the dependency sets match. | `git diff` after `npm install` (reverted) | devops-engineer |
| m-5 | MINOR (accepted) | Grooves, slots and ribs are never credited, even when a verified rule exists. This is stricter than Task 5 and logged as P3-6. | `creepage/calc.ts` l.167 | human (P3-6) |
| m-6 | MINOR | While tables are empty, an entered frequency above 30 kHz produces no IEC 60664-4 warning in the result panel. The scope check runs after the INSUFFICIENT DATA refusal, so only the field help text mentions it. A designer probing an SMPS node gets no visible flag. | `clearance/calc.ts` steps 1-2 order; `gating.ts checkScope` | ui-engineer / calc-implementer |
| m-7 | MINOR (watch) | The IEC 62368-1:2023 webstore stability date is 2026, so a new edition may make S-034 stale. | IEC webstore 69308 | standards-researcher |
| m-8 | MINOR (process) | Local `npm ci` cannot run while `vite preview` on :4173 is running (EPERM on the rolldown native binding), and npm ci deletes `node_modules` before failing. Stop the preview before `npm ci`, or use the RUNBOOK to note it. | section 1 | devops-engineer |

No BLOCKER. The empty-tables deferral (P3-1) is accepted and visible, not hidden.
