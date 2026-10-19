# Phase 4 phase-validator report (thermal via array and fusing)

- Branch `phase-4`, head `3420891`. The working tree was clean before and after the gates; the only files this validator wrote are this report and the new section at the end of `docs/validation/OPEN_RISKS.md`.
- Date 2026-10-19. Lens: senior engineer and standards auditor. No edits to `src/` or `tests/`.
- Inputs read: `docs/phases/phase-4.md`, `docs/PLAN.md`, `docs/SPEC.md`, `CLAUDE.md`, `docs/research/phase-4-thermal-via-and-fusing.md`, `docs/sources/LEDGER.md` (S-003d, S-004, S-007, S-019d, S-040…S-044), `docs/validation/OPEN_RISKS.md` (Phase 4 core and UI sections), `README.md`, `docs/RUNBOOK.md`, `CHANGELOG.md`, `.github/workflows/deploy.yml`, and all Phase 4 code: `src/core/calculators/{thermal-via,fusing}/*`, `src/core/data/{constants,ledger,ledger-status}.ts`, `src/core/units/{dim,display,units-table}.ts`, `src/ui/calculators/{ThermalVia,Fusing}.tsx` with their `*.vm.ts` and `*.vm.test.ts`, `src/ui/components/{ValidityChecksList.tsx,view.ts}`, `src/ui/registry.ts`, `src/state/state-keys.ts`.

## Verdict: PASS-WITH-CONDITIONS (phase NOT closable yet)

The built scope (thermal via array, fusing) passes. Both calculators are correct where checked, labelled honestly, properly separated, and every gate passes. There are no BLOCKERs in the built code.

The **phase as a whole cannot close** for three reasons:
1. Exit criterion 3 is not met: final hardening (task 5) has not been done, README and RUNBOOK are not complete, and the calc-validator and pcb-domain reports for Phase 4 do not exist yet.
2. The user's scope decision is recorded in the research doc and the ledger only. The authoritative documents (SPEC, phase-4.md, OPEN_RISKS R-6) still describe the old scope.
3. Bundle headroom is 3.25 KB.

See section 9.

**Scope (user decision 2026-10-19):** only the thermal via array and fusing were built. Not built: θJA/θJC estimate, exposed-pad spreading, copper-area spreading, RF/antenna helper, twisted pair/coax references. Section 2.1 checks where each deferral is logged.

## 1. Gates (run by this validator; no `npm ci` or `npm install`, no worktree)

`node_modules` was not modified. Before and after all gates: 140 entries; `node_modules` mtime `1792390944`; `.package-lock.json` sha1 `84387a03…`; `package-lock.json` sha1 `5e4cfeca…`; `git status --short` empty. Local Node is v24.13.0 (`.nvmrc` 22; R-15).

| Gate | Result (real output) |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, exit 0 |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm test` | `Test Files  172 passed (172)` / `Tests  6832 passed (6832)` |
| Phase 4 files only (fusing, thermal-via core and vm tests, `tests/ledger-sync.test.ts`, `tests/audit.test.ts`) | `Test Files  6 passed (6)` / `Tests  318 passed (318)`; perf: thermal-via `10 000 computes within a 5 s total budget 106ms`, fusing `... 206ms` (about 11 µs and 21 µs per compute, well under SPEC's 1 ms) |
| `npm run build` | `✓ built in 342ms` |
| `npm run check:size` | `largest first-load PathLoad 133.31 KB of 150.00 KB`; `total 426.75 KB gzip JS of 430.00 KB ceiling (76 files)`; `check:size: PASS`. Fusing 58.53 KB, ThermalVia 54.77 KB |
| `npm run check:audit` | `10 data tables audited, 105 ledger rows checked`; `check:audit: PASS` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | exit 0, 2057 `OK` lines, no failure lines; 45 `thermalvia_*`/`fusing_*` lines, e.g. `OK   fusing_K_c385_A2s_per_m4 got=5.05124e+16 expected~5.05124e+16` |
| `python3 tools/reference/gen_golden.py --check` | `OK   docs/golden-vectors.json matches the oracle` |

Hand checks by this validator (independent arithmetic):
- **Fusing case 1** (0.254 mm × 35 µm, Ta 20 °C, c 385, I 10 A): K = 8890·385·58e6/0.00393 = 5.0512e16 A²·s/m⁴; β20 = 234.45 °C; ln(1319.07/254.45) = 1.6455; I²t = (8.89e-9)²·5.0512e16·1.6455 = 6.57 A²s; t = 0.0657 s. This matches the test `case 1` and the research sanity value.
- **Onderdonk** with 1083 °C and square mils reduces to I = 0.186·A/√t, consistent with the published 0.188 form.
- **Thermal via** (d 0.3 mm, t 25 µm, L 1.6 mm, k 401): A = π·25e-6·325e-6 = 2.5525e-8 m²; θ = 156.3 K/W. This matches the test and the pre-existing via golden.

## 2. Exit criteria (`docs/phases/phase-4.md`)

| Criterion | Status | Evidence |
|---|---|---|
| θJA never presented as a design constant | **MET** | No θJA value or input anywhere: `grep -rniE "theta-?JA\|θ ?JA\|junction" src` finds only negations. Core: warning `NOT_THETA_JA` is always emitted (`thermal-via/calc.ts` l.47-48, 149). `RECOMMENDATION` says "not a design constant and not a package metric". The title contains "not a design constant" (`meta.ts` l.19). UI: `STATUS_LINES` "Not theta-JA and not a design constant." is shown with or without a result (`ThermalVia.tsx` l.78-86). The callout is headed "Not theta-JA, not theta-JC". The live region says "not theta-JA". Tests: `thermal-via/calc.test.ts` "always shows the ... not-theta-JA statements", "the method, primary label and recommendation say estimate / not a design constant"; `thermal-via.vm.test.ts` "prints the array resistance with the 1-D lower-bound and not-theta-JA statements always present". Ledger S-040 is VERIFIED for the qualitative caveat only, with no number. |
| Fusing and heating clearly separated | **MET** | Own core module with its own meta and ledger ids. Test `'fusing does not import from self-heating (separate calculators)'` greps the sources. It has its own registry category "Fusing (short pulse to melting; not steady-state heating)" (`registry.ts`). The page notice "A different question from steady-state heating" links to `#/calc/self-heating` (`Fusing.tsx` l.102-107; test `'fusing is separated from steady-state heating with a link to the self-heating page'`). The core warning `IPC_SCOPE_PAYWALLED` states that IPC methods address steady-state heating and are not used. The fusing output contains no "rating", "safe current" or "fuse rating" claim (test l.282 and the vm page-source test). Minor: no reverse link from the self-heating page (m-8). |
| Final validator reports PASS and RUNBOOK/README complete | **NOT MET** | (a) When the gates ran, `docs/validation/reports/` had no `phase-4-calc.md` or `phase-4-pcb.md`. A `phase-4-pcb.md` appeared (untracked) while this report was being written; it was not read here. `phase-4-calc.md` is still absent. (b) README.md (19 lines) lists the calculators as "trace/current, resistance, voltage drop, path/load, vias, annular ring, circuit values, controlled impedance, spacing". Thermal via and fusing are missing, and there is no per-calculator limits section. RUNBOOK has no offline, accessibility or performance procedure. See section 8 for the full task 5 gap list. |

### 2.1 Tasks and scope deferrals

| Task (phase-4.md) | Status | Logged where |
|---|---|---|
| 1. Thermal estimates, low confidence, assumptions shown | **Partly built (thermal via only), as decided.** Confidence is always low (P4-1). The assumptions list barrel-only conduction, finished hole, plating source, k choice, fill and N vias. Board size and airflow do not apply to a 1-D barrel model, and the page says spreading, package, solder and airflow are not modelled | θJA/θJC, exposed pad and spreading: research doc l.4; OPEN_RISKS "Phase 4 core … Deferred" (l.592: "an exposed-pad or theta-JA calculator (out of scope by user decision)", "a spreading model (new research pass needed)") |
| 2. RF/antenna helper with free-space vs guided warning | **Deferred by user.** Partly covered by Phase 2: `quarter-wave.ts` (S-029c) computes free-space and guided λ/4, carries the antenna warning and computes no antenna length (Q-18, P2-31) | Research doc l.4; LEDGER S-043…S-044 placeholder. **Not in OPEN_RISKS** (M-2) |
| 3. Twisted pair, coax references | **Deferred by user.** Coax impedance exists from Phase 2 (`coax/`, X-01 cross-check). Twisted pair: nothing (only presets S-026d/e quote 120 Ω cable values) | Research doc l.4; LEDGER S-043…S-044. **Not in OPEN_RISKS** (M-2) |
| 4. Fusing, separate from steady-state heating | **Built**, see section 2 | — |
| 5. Final hardening (performance audit, offline test, accessibility pass, docs) | **NOT DONE** (user-confirmed: next step) | Section 8 lists exactly what is missing |

Recording gaps: OPEN_RISKS **R-6** ("Phase 4 thermal scope … Confirm scope") is still `OPEN` although the user decided on 2026-10-19. `docs/SPEC.md` l.15 still says "Phase 4 scope to be confirmed by the human", and its scope row 4 (l.60) still lists RF/antenna, twisted pair/coax and thermal estimates. `docs/phases/phase-4.md` is unchanged, and the repo-layout list in SPEC (l.66-80) does not name `thermal-via` or `fusing` (M-2).

## 3. Spec traceability (SPEC.md and phase-4.md, for the built scope)

| Requirement | Code | Test | Gap |
|---|---|---|---|
| Fusing (Onderdonk/Preece), SPEC row 4 | `fusing/calc.ts`: adiabatic primary (S-042a), Onderdonk secondary with ratio (S-042), Preece historical in a collapsed panel (S-042b) | `fusing/calc.test.ts` golden cases 1-4, properties, Preece-area-only | none |
| Thermal estimates, labelled low confidence, assumptions shown | `thermal-via/calc.ts` warnings ONE_D_ESTIMATE, RECEIVING_COPPER_CONFLICT, BULK_COPPER_K, IDEAL_PARALLEL, NOT_THETA_JA; static "Estimate, low confidence" | `'CONFLICT data status, never high, with reasons, for every case'`, vm "always visible" tests | Spreading, exposed pad, θJA: deferred |
| `CalcResult` schema | Both `build()` run `assertCalcResult` before returning | per-calc property tests "assertCalcResult holds" | none |
| Rule-based confidence | `rateConfidence` / `confidenceFactorsFromInputs`; fusing counts the defaulted specific heat and a nominal copper basis as a safety-relevant default | `'specific heat default ... lowers confidence'`, `'CONFLICT data status ... low'` | P4-1 (always low); see m-1 for a second, structural cause |
| Units: separate dimensions, convert at UI only | `DIM.ACTION_INTEGRAL` (A²·s) added with unit spellings and display; Ta is `ABS_TEMPERATURE`, β20 is `TEMPERATURE_DIFFERENCE`, ΔT of the via is `mul(θ, P)` → temperature difference | `'steps use the units engine with the right dimensions (temperatures absolute, beta20 a difference)'`, `'dimensions: ... temperature DIFFERENCE for the rise, never an absolute temperature'` | The local K dimension (A²·s/m⁴) has no unit-table entry. The UI prints it from SI (P4U-3): acceptable |
| Input guards (NaN/Inf/zero/negative) | `guardQuantity` on every quantity; count integer ≥ 1; Ta < melting point and above the linear-model floor; exactly one geometry and one pulse input; no melting point override | `guards` describe blocks in both calc tests; vm `'invalid input never gives a number'` | none |
| Fab limits never hard-coded | Plating is required and never pre-filled; `platingSource: 'fab-profile-average'` is a flag only; `toleranceInputs: []`; no hole-to-hole limit | `'meta lists the ledger rows ... no hard-coded fab limit'` | Hole-to-hole check (S-019k) deferred (P4U-10) |
| Tests first (oracle) | `ref_calcs.py` +172 lines and 45 golden vectors in commit `f196259`, the same commit as the code | `gen_golden.py --check` OK | Order within the commit cannot be shown from git; the implementer's log states it |
| Closed-form calc < 1 ms | about 11 µs and 21 µs per compute | perf tests | none |
| Bundle ≤ 150 KB/route, ≤ 430 KB total | check-size | gate output | 3.25 KB total headroom (M-3) |
| Accessibility: keyboard, labels, contrast | labelled fields, `aria-describedby`, live regions, `role="note"`, `<details>` for Preece | vm "page source" tests (labelled inputs, live region, no raw HTML) | No browser or axe pass (task 5) |
| Offline, no runtime network | No `fetch`/XHR in `src`. Built `dist` contains only the Vite same-origin modulepreload `fetch(e.href)`. CSP `connect-src 'none'`. No external URL in `dist/index.html` | `csp-plugin.test.ts` | No offline load test and no service worker (by design, RUNBOOK). See section 8 |

## 4. Standards honesty

- **Forbidden phrases.** `grep -rniE "compliant|certified|guarantee|production safe|\bsafe\b|meets (iec|ipc)|conforms?"` over the Phase 4 sources (non-test) finds only negations: "not a safe overload limit", "never a safe current", "no result is rounded toward a presumed safe side". There is no positive claim. The repo phrase audit (`tests/audit.test.ts`) passes. `gate.ts` is untouched by Phase 4 (`git diff cd13672..HEAD --stat` does not list it), and neither calculator calls it.
- **Not a fuse rating.** The recommendation, the always-on `NOT_A_RATING` callout, the static status line and every primary result label say "estimate, not a fuse rating". The 1 s and 10 s thresholds are worded "product choices, not sourced limits" (S-042e is one author group). They are warnings, not refusals.
- **IPC scope for fusing** (S-042f, PAYWALLED). The core makes no IPC statement and keeps a validity check that is not passed. The UI shows it as "Not checked, needs your copy of the standard", counted separately from failures. Honest, but see m-1 on how it is modelled.
- **Legacy / estimate labels** (Phase 1). Unchanged; the existing tests pass.
- **Thermal via.** Labelled a 1-D lower bound everywhere. The S-041c CONFLICT (app notes vs Brooks & Adam on via usefulness) is shown without taking a side. k has no default (S-007 CONFLICT, non-conservative direction stated). Fill k has no built-in value.

## 5. Source ledger: Phase 4 rows and spot-checks

**Honesty of S-040…S-042f (13 rows).** The statuses match the evidence recorded in each row:
- VERIFIED: S-040 (caveat only, no number), S-041 (formula only, k excluded), S-041b (ideal relation only), S-042b (form and constant, primary not read), S-042c.
- UNVERIFIED: S-041a (derived), S-041d (not found), S-042 (one readable source), S-042a (derived), S-042e (one author group).
- CONFLICT: S-041c, S-042d.
- PAYWALLED-USER-MUST-VERIFY: S-042f.

No DERIVED row is marked VERIFIED. **Ledger sync:** `ledger-status.ts` and `ledger.ts` carry all 14 ids (13 rows plus the S-043…S-044 placeholder) with the same statuses. `tests/ledger-sync.test.ts` "every markdown row is present in ledger.ts with the same status" passes, and `check:audit` checks 105 rows.

Every Phase 4 constant appears in the ledger:

| Constant | Code | Ledger |
|---|---|---|
| 8890 kg/m³ | `COPPER_DENSITY_KG_M3` | S-003d |
| 1084.62 °C | `COPPER_MELTING_POINT_C` | S-042c |
| 383.48, 385.00, 386 J/(kg·K) | `CP_TABLE` | S-042d |
| 33, 234 | `ONDERDONK_*` | S-042 |
| 10244 | `PREECE_COPPER_A_INCH` | S-042b |
| circular mil | `CIRCULAR_MIL_M2` | S-006 |
| 401 and 391 W/(m·K) | `copperThermalConductivity` | S-007 |
| 1/58e6 Ω·m, 0.00393 /K | `COPPER_RESISTIVITY_20C`, `COPPER_ALPHA_20C` | S-004 |

Web spot-checks (2026-10-19):

| Row | Ledger claim | Finding | Result |
|---|---|---|---|
| S-042c | Cu freezing point 1357.77 K = 1084.62 °C (ITS-90) | [NIST ITS-90 Overview](https://its90.nist.gov/Overview): "the freezing point of Cu at 1357.77 K (1084.62 ° C)" | Confirmed, VERIFIED correct |
| S-042b / S-042f | Preece I = a·d^1.5, a = 10244 for copper, d in inches; fusing "outside the scope of IPC-2152" | [PCD&F 2015-06-29](https://www.pcdandf.com/pcdesign/index.php/editorial/menu-features/10179-pcb-design-1507): "d is the diameter of the wire in inches; a is a constant (10244 for copper)", "found in his third paper (1888)"; area form 12277·A^(3/4); "falls outside the scope of IPC-2152"; 234 + Ta derived from 1/0.00393 − 20. The constant 33 is in an image on that page and was not readable | Confirmed. S-042b VERIFIED is right. S-042f is correctly PAYWALLED: the source is secondhand |
| S-042 | Onderdonk 33·(I/A)²·t = log10[(Tm − Ta)/(234 + Ta) + 1], A in cmil | Web search: calculator pages reproduce the same log10 form with 33 and 234; no source explains 33; origin is Stauffacher 1928 (GE Review). Validator arithmetic: the form reduces to the published 0.188·A/√t (A in mil²) within 1 % | Consistent. UNVERIFIED (origin unknown) is the honest status |
| S-041b / S-041c | θ_array = θ_unit/N; 1-D underestimates θ by up to 27 % | [Electronics Cooling 2004-08](https://www.electronics-cooling.com/2004/08/thermal-vias-a-packaging-engineers-best-friend/): "The total resistance is equal to the resistance for a unit cell divided by the total number of vias"; "as high as 27% for 9 through 16 vias. Worse, the calculation underestimates the thermal resistance" | Confirmed, verbatim |
| S-042d / S-007 | c = 383.48 (293 K), 385.00 (300 K); k = 401 W/(m·K) at 300 K | [PPPL pure copper](https://aries.pppl.gov/LIB/PROPS/PANOS/cu.html): 383.48 and 385.00 J/kg-K; 401.00 W/m-K at 300 K; melting point "1083 C" (older value, noted in S-042c). **Also lists density 8933 kg/m³ at 293 K (8.96 g/cm³ general)** | c and k confirmed. Density see m-4 |
| S-040 | θJA depends on the test board and environment; "predictions cannot be expected to be accurate for different environmental conditions" | [Electronics Cooling 2019-11](https://www.electronics-cooling.com/2019/11/jedec-thermal-standards-developing-a-common-understanding/): quote confirmed; 1S2P about half of 1S0P (the ledger correctly keeps that number out of the app) | Confirmed, VERIFIED (caveat only) correct |

Stale or unsupported entries:
- The S-043…S-044 placeholder row has 5 cells against a 9-column header, so the status sits in the URL column (m-5, shape inherited from the Phase 0 placeholder).
- The S-003d density is a wire-table convention, not pure-copper density; its use in fusing is not stated as such (m-4).
- No row is stale.

## 6. Architecture

- `src/core/calculators/{fusing,thermal-via}` import only from core: no `preact`, no DOM, no `fetch`, and no `Date.now`/`Math.random` outside tests (grep, empty).
- Results use the standard schema. Both modules wrap `build` in try/catch, map overflow to `OUT_OF_DOMAIN` and never return Infinity (tests "overflow ... is an OUT_OF_DOMAIN error value").
- Compliance wording appears only in `gate.ts`, which Phase 4 did not touch.
- Units are not mixed at the quantity level. The fusing log term adds a Celsius scalar and β20 (a difference) as plain numbers after `toUnit(…, 'degC')`. This is the published derivation's arithmetic, done after leaving the units engine; the steps re-express both with the correct dimensions.
- UI view-models hold no engineering math. The only number formatting outside `format-result.ts` is the K step `toExponential(4)`, a step and not a headline (P4U-3).
- **Coupling note (m-1).** The fusing UI recognises the not-checked IPC item by a regex on the check **name** (`/^IPC scope for fusing/`). The core has no `notChecked` field.

## 7. Stability and security

- **Guards.** Every quantity goes through `guardQuantity`. Enumerations are checked with `hasOwnProperty` (so `"__proto__"` and `"toString"` are refused). Hash loading uses `hasOwnProperty`, refuses over-long fields, and turns unknown values into blanks plus a notice. Test `'hostile text is just text'`.
- **No raw HTML.** `grep innerHTML|dangerouslySetInnerHTML src` (non-test) is empty, and a vm page-source test asserts "no raw HTML".
- **State.** Ten new state keys are documented in `state-key-docs.ts` (`WRITTEN_KEYS` test "writes only documented keys"). No schema-version bump is needed for new calculator ids.
- **Error boundary.** Per-route boundary unchanged; both pages are lazy routes.
- **Dependencies.** `npm audit --omit=dev`: 0 vulnerabilities. No new dependencies (package.json unchanged).
- **Secrets.** None found.

## 8. Deployment, and exactly what task 5 still needs

**Deployment.**
- `deploy.yml` is unchanged in Phase 4. It runs typecheck, lint, the oracle, the golden check, coverage, build, size and audit, then the Pages artifact.
- Base `./` (vite.config.ts l.22). Actions are pinned by SHA.
- Action release check (GitHub releases pages, 2026-10-19):
  - checkout v7.0.1 (latest)
  - setup-node pinned v7.0.0; **v7.1.0 released 08 Oct** (m-7)
  - deploy-pages v5.0.1 (latest)
- Rollback is documented (RUNBOOK §Rollback).
- V-13: `ubuntu-latest` moves to Ubuntu 26 from today; no CI run has been observed (R-15).

**Task 5, what is missing (not done by this validator, as instructed):**

1. **Performance audit.** The only perf report is `phase-0-perf.md`. No `perf-stability-auditor` report exists for Phases 1-4. Missing items:
   - measured first load on throttled broadband against the SPEC "Load < 1 s", e.g. a Lighthouse or Playwright trace of the built `dist` on :4173;
   - route-switch timings for the heaviest routes (PathLoad 133 KB, Fusing, ThermalVia);
   - a check that no long task above 50 ms occurs on input;
   - a review of the 3.25 KB bundle headroom, with either a trim plan or a human ceiling decision (M-3);
   - a record in `docs/validation/reports/phase-4-perf.md`.
2. **Offline test.** Nothing tests that the app works offline. R-15 ("offline load ... not observed") is still OPEN. Missing items:
   - a Playwright (or manual, recorded) run that loads the built site, sets the context offline, navigates every route including lazy chunks, and confirms no network request beyond same-origin assets (CSP `connect-src 'none'` already blocks runtime calls);
   - a human decision on what "offline capable" (SPEC l.42) means. With no service worker (RUNBOOK §Service worker), a cold reload while offline fails. Either accept "no runtime network after load" and write that in SPEC, or add a versioned-precache service worker (bundle and stale-cache risk).
3. **Accessibility pass.** No browser, axe or keyboard pass has been run on any page. The Phase 3 and Phase 4 UI logs say "not verified in a real browser". Missing items:
   - an axe (or equivalent) scan of every route;
   - keyboard-only walk-through of the form controls, `<details>` panels, radio groups and reset;
   - contrast check of the `.notice`, `.validity-count` and badge colours;
   - screen-reader check of the live regions on the Fusing and ThermalVia pages;
   - results recorded in a report.
4. **Docs.**
   - README: list thermal via and fusing, with one honest line each ("1-D lower bound, not θJA", "adiabatic estimate, not a fuse rating"); state what was deferred (θJA/θJC, exposed pad and spreading, RF/antenna beyond the quarter-wave helper, twisted pair); link OPEN_RISKS human items.
   - RUNBOOK: add how to run the perf, offline and accessibility checks; the local preview on :4173; the Ubuntu 26 runner note (V-13); refresh the action-version date.
   - CHANGELOG: it has only kit-level `v1`/`v2` entries and no phase entries.
   - SPEC: record the Phase 4 scope decision (M-2).
   - phase-4.md: mark criteria and deferrals.
5. **Remaining validators.** `/validate-phase 4` still needs `phase-4-calc.md` (calc-validator, which should run first) and `phase-4-pcb.md`, then a closure record.

## 9. Findings

| # | Severity | Finding | Evidence | Owner |
|---|---|---|---|---|
| M-1 | MAJOR | Exit criterion 3 not met: task 5 not done; README and RUNBOOK incomplete; Phase 4 calc and pcb reports absent | Section 2, section 8; `ls docs/validation/reports` | perf-stability-auditor, test-engineer, ui-engineer, devops-engineer; orchestrator for the reports |
| M-2 | MAJOR | Scope decision not recorded in the authoritative documents. R-6 is still OPEN; SPEC l.15 and row 4 (l.60) are unchanged; phase-4.md is unchanged; the RF/antenna and twisted pair/coax deferrals are not in OPEN_RISKS (only in the research doc and the S-043…S-044 placeholder). Traceability is priority 2 | `OPEN_RISKS.md` l.10, `SPEC.md` l.15/60, `phase-4.md` | orchestrator (docs only) |
| M-3 | MAJOR | Bundle headroom 3.25 KB (426.75 of 430 KB). Any task 5 UI change (accessibility fixes, offline notice, SW registration) is likely to fail `check:size` in CI | `check:size` output | human (ceiling decision) + devops-engineer / ui-engineer (trim) |
| m-1 | MINOR | The paywalled IPC fusing item is modelled as `ok:false`. `assertCalcResult` (`result.ts` l.521-525) forces confidence to low whenever any check fails, so fusing confidence is capped at low regardless of the rule score: changing the P4-1 weights alone could never raise it. Generic consumers of `!c.ok` would count it as a failure. The UI identifies it by a name regex | `fusing/calc.ts` l.208-212; `fusing.vm.ts` l.395, 507 | calc-implementer (add a core `notChecked` flag to validity checks, excluded from the low-forcing rule; keep the UI on the flag, not the name) |
| m-2 | MINOR | OPEN_RISKS Phase 4 sections say "uncommitted" but are committed (`f196259`, `3420891`). The P4-* and P4U-* tables have no Owner or Status columns, so human items are not separable | OPEN_RISKS l.559, l.594 | orchestrator |
| m-3 | MINOR | Warning and assumption text cites ledger rows that are not in `reference.ledgerIds`, so they get no badge or data-status contribution: S-019m and S-015 (thermal via plating text) and S-009 (fusing `THICKNESS_NOMINAL`). S-003 is excluded on purpose (foil policy) | `thermal-via/calc.ts` l.50, l.162; `fusing/calc.ts` l.66; `meta.ts` ledgerIds | calc-implementer |
| m-4 | MINOR | Fusing uses the IACS wire-table density 8890 kg/m³ (S-003d) with pure-copper specific heat (PPPL). PPPL lists 8933 kg/m³ at 293 K, 0.5 % higher. The time scales with D, so 8890 gives a slightly shorter time. The fusing assumptions do not state that the density is the IACS convention or give the spread | `constants.ts`; PPPL page | standards-researcher (note in S-003d or S-042a) + calc-implementer (assumption text) |
| m-5 | MINOR | The S-043…S-044 placeholder ledger row has 5 cells against a 9-column header (status in the URL column). Sync passes, but the row is malformed | `LEDGER.md` l.160 | standards-researcher |
| m-6 | MINOR | P4-1: confidence is permanently low for both calculators (estimate 2 + CONFLICT 2). Honest, but the "medium" in the research doc is unreachable. Needs a human acknowledgement | OPEN_RISKS P4-1 | human |
| m-7 | MINOR | `actions/setup-node` is pinned at v7.0.0; v7.1.0 was released 08 Oct. RUNBOOK's version check is dated 2026-10-06 | GitHub releases page | devops-engineer (or Dependabot) |
| m-8 | MINOR | One-way separation link: the self-heating page does not point to fusing for short pulses (P4U-1) | `Fusing.tsx` l.107; no reverse link | ui-engineer (costs bundle; see M-3) |
| m-9 | MINOR | CI not yet observed on Ubuntu 26 (V-13, effective today), and the live Pages URL is not observed (R-15) | OPEN_RISKS V-13, R-15 | human + devops-engineer |

Human-only items are added to `docs/validation/OPEN_RISKS.md` under "Phase 4 phase-validator".
