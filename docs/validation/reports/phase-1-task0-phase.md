# Phase 1 task 0: phase validation report

- Validator: phase-validator (senior-engineer and standards-auditor lens). I did not edit `src/` or `tests/` and ran no state-changing git command. Outside this report, my only edit was to append the human-only items R-23 and R-24 to `docs/validation/OPEN_RISKS.md`. I changed no existing row.
- Date: 2026-10-07.
- Tree: `F:/pcb-calc/pcb-calc-kit-v2/pcb-calc`, branch `phase-1-task-0` at 5437854. That equals `origin/phase-1-task-0` (checked with `git ls-remote`).
- Scope: task 0 items (a)-(g) of `docs/phases/phase-1.md`, plus repo, CI and deploy health. The task-0 code is in commits 1981df9, d39ff98, ad003d7 ("okk", on `main`) and 5437854.
- Environment: Windows 11, Git Bash, Node v24.13.0, npm 11.6.2, Python 3.13.12. CI uses Node 22 (`.nvmrc`).
- Inputs read: CLAUDE.md, phase-1.md, OPEN_RISKS.md, plan-delta.md, phase-0-phase.md, phase-0-pcb.md, phase-1-task0-calc.md (PASS-WITH-CONDITIONS, m-1..m-10), SPEC.md, RUNBOOK.md, LEDGER.md, the skills calc-module-pattern, ipc2221-trace-width, units-dimensional-analysis and via-and-annular-ring, and every task-0 source file.

## Verdict: PASS-WITH-CONDITIONS

- **No BLOCKER.** I found no wrong number, compliance claim, purity breach, network call or hard-coded fab limit in the task-0 code. Every gate passes locally, run by me.
- **Two MAJOR findings. Neither is a code defect.** Both must be closed before Phase 1 task 1 merges:
  - V-1: the authoritative result-schema document and two skills contradict the new code.
  - V-2: `main` is red, this branch has never run in CI, and Pages is not enabled.
- **Eleven MINOR findings (V-3..V-13).**
- **I endorse the calc-validator's m-1..m-10.** I independently re-confirmed m-8(a) against the live JLCPCB page.
- **Disposition of the domain-review items:**
  - closed in core: P-1, P-3, P-5, P-6;
  - partial: P-4, P-7;
  - open, waiting on a human decision: P-2 and R-9.
  - R-11 and C-5 can be closed.
  - R-10 can be closed after one ledger edit (see §4).

## 1. Gates (run by me)

| Gate | Result |
|---|---|
| `npm ci` | `added 207 packages, and audited 208 packages in 5s` / `found 0 vulnerabilities`, exit 0 |
| `npm run typecheck` | `tsc --noEmit`, exit 0 |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm run test:coverage` | `Test Files 38 passed (38)` / `Tests 1087 passed (1087)`. Statements 97.96 %, Branches 97.71 %, Functions 97.41 %, Lines 99.23 %. Thresholds: 95 global and `src/core/units/**` branches 95 (units measured 97.47). Exit 0 |
| `npm run build` | `dist/assets/index-BBKAI62h.js 25.79 kB │ gzip: 10.46 kB`, css 3.51 kB, `✓ built in 139ms` |
| `npm run check:size` | `check:size: total 10.15 KB gzip JS of 150.00 KB budget (1 files)` / `PASS` (Phase 0: 8.94 KB) |
| `npm run check:audit` | `check:audit: 2 data tables audited, 24 ledger rows checked` / `PASS` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | 18 `OK` lines, exit 0. Includes the new `foil_spread_pct_1oz got=2.07057` |
| `python3 tools/reference/gen_golden.py --check` | `OK docs/golden-vectors.json matches the oracle`, exit 0 |
| Runtime dependencies | `package.json` is unchanged since 7d58f4b. `dependencies` is still only `preact ^11.0.0`. No new runtime or dev dependency. |

Coverage notes:
- The coverage scope is `src/core/**` only, so `src/state/hash.ts`, the main P-5 file, is outside it. Its tests do run.
- `src/core/fab/profile.ts` has 76.92 % function coverage. `unknownLedgerIds` (`profile.ts:198-201`) is not executed by any test. See V-8.

## 2. Task 0 items vs code, tests and domain-review findings

| Item | Implementation | Tests | Maps to | Status |
|---|---|---|---|---|
| (a) Confidence | `src/core/confidence.ts:61-94`: out-of-range forces `low` (`:93`); defaults uncapped (`:54`); `safetyRelevantDefaults` weight 2; `score` returned; `CONFIDENCE_RULE_TEXT` states the rule | `confidence.test.ts`, `confidence.rule-text.test.ts`, `confidence.regression.test.ts`. The calc-validator enumerated all 1 440 factor combinations. | P-1 | **Closed in core.** The UI half ("never render a level without reasons and score") cannot be checked yet, because no calculator page exists. The calc-validator's m-5 (safety/default sets not linked to `inputs[].source`) remains open. |
| (b) Parser and units | `src/core/units/parse.ts`: field-aware ΔT `:23-29,160-170`; bare `oz` → oz/ft² in an areal-mass field `:165`; component codes `:16,134-158`; decimal comma and space grouping rejected with a message `:101-127`; "Did you mean" and accepted-unit hints `:44-98`. `units-table.ts`: `mils`/`thou`, `Ohm`/`ohms`, `mil2`, `in2`, K/W, °C/W, W/(m·K), /K, ppm/K, %, ppm, A/m², A/cm², A/mm², resistivity `Ω·m` / `µΩ·cm` | `parse.fields.test.ts`, `units.compound.test.ts`, `locale.test.ts`; the calc-validator fuzzed 40 000 strings | P-3; R-14 (units half) | **Closed** for the task-0 list. The units half of R-14 is closed (K/W and Ω·m parse and display). m-1 (a bare prefix in compound fields, e.g. `1.72 u` resistivity, gives 1.72 µΩ·m, 100× off if the user means µΩ·cm) must close before task 2/3. |
| (c) Display | `src/core/units/display.ts`: `DisplayPrefs` mm/mil/µm, °C/K/°F, mm²/mil²; `unit` per-field override `:137`; `sigFigsFor` exact 6 / analytical 4 / empirical 3 / estimate 2 `:20-31`; engineering prefixes with rollover | `display.test.ts`, `locale.test.ts` | P-4 | **Partial.** Delivered: units and significant figures by accuracy class. Missing: dual mm + mil headline, rounding *up* for minimum widths (P-4 "rounded up to the fab grid"), and absolute-temperature precision (calc m-3). The "per-field" part works only through the `unit` option; prefs are global. |
| (d) Shared links | `src/state/hash.ts`: `DISCARD_BANNER_TEXT` and reasons `:31-46`; list encoding `:53-72`; migration registry `:82-123`; reserved keys `fc`, `fp`, `mode`, `u` `:133-150`. `src/ui/components/DiscardBanner.tsx`, `App.tsx:45-48` | `hash.discard/list/migrate/reserved.test.ts`. **I observed it in a real browser**: headless Chrome against `vite preview` of the built `dist`. `#/calc/trace-width?v=2&…` shows "Could not load the shared settings from this link; showing defaults. The link was made with a different or unknown settings version." A corrupt `%E0%A4%A` shows the corrupt-encoding reason. `mode=Z` shows `Ignored "mode": unrecognised value.` A valid `v=1` link shows no banner. | P-5; domain m-1 (badge wording, `UnverifiedBadge.tsx:8-18`) and m-2 (stacked About cards, `styles.css:44-52`) | **Closed in code.** Residuals: V-7 (reserved keys do not match core types) and calc m-10(b). I did not check the m-2 layout at 360 px in this run. |
| (e) `CalcResult` | `src/core/result.ts:14-65`: `InputSource` provenance, `CalcWarning.severity`, `DesignValue` (calculated vs recommended + derating), `Envelope[]`, `fabProfile`, `limitingElement`; `checkDesignValue`, `checkEnvelope`, `defaultedInputNames`, `highestWarningSeverity` | `result.test.ts` | P-6 | **Closed**, with residuals: calc m-2 (derating an absolute temperature), m-4 (`assertNoNonFinite` misses the factor and score), and V-6 (no margin on `limitingElement`, only one design value, no sensitivity drivers). |
| (f) `FabProfile` | `src/core/fab/profile.ts`: validator with no defaults (`:6-9`; the template parses with `limits: {}`); `bannerRequired` forced unless VERIFIED; `verifiedBy` required for VERIFIED; strict dates; injected `today`. JSON: `src/core/data/fab-profiles/template.json`, `jlcpcb-2026-10-06.json` (UNVERIFIED, `bannerRequired: true`, S-008) | `profile.test.ts`; `check:audit` audits both JSON files | P-7; rule 9 | **Partial.** Type, validator and examples exist. Missing from the P-7 field list: finished copper per layer type, trace/space per copper weight and layer, aspect ratio, solder mask, NPTH tolerance. This is acceptable as a first cut, but it must be extended before task 7 (via/annular ring). Calc m-8 and m-9 are open. |
| (g) Constants | `src/core/data/constants.ts`: `COPPER_RESISTIVITY_20C = 1/58e6` `:11` [S-004]; `COPPER_ALPHA_20C = 0.00393` `:13` [S-004]; `copperThermalConductivity('pure-401' \| 'c11000-391')` returns value + ledger id + status + assumption text `:39-51` [S-007]; `DEFAULT_FOIL_CONVENTION = 'nominal-35um'` `:53`; `foilSpreadPercent()` = 2.0706 %; `foilAssumptionText()` | `constants.test.ts`; golden vectors regenerated; the oracle agrees | R-9, R-10, R-11, C-5; P-2 | **R-11 closed. C-5 closed.** No `UNLEDGERED` remains in any vector. The only remaining occurrence is the legend sentence in the generated note. **R-10: the code is done**, but the ledger text is stale (V-4). **R-9 / P-2: implemented as a labelled default** that shows the spread. Two human decisions are still open: (1) the default itself; (2) whether a defaulted foil convention counts as one defaulted assumption rather than CONFLICT data (`foil.ts:30` still reports S-003 CONFLICT, which will cap every copper-dependent result at "medium" or worse). |
| Unit/locale test class | `src/core/units/locale.test.ts`: ΔT in °F, °C vs K as rise, decimal comma, mil↔mm↔µm↔in round trips (property), imperial/metric parity | 15+ cases, property tests | plan-delta item 7 | **Done** |

## 3. CLAUDE.md non-negotiables on the new code

| Rule | Evidence | Result |
|---|---|---|
| 1. Ledger tags | `1/58e6`, `0.00393` → S-004 (`constants.ts:10-13`). `401` and `391` → S-007 (both values appear in the row: 4.01 W/cm·K and Aurubis 391). `MIL_M = INCH_M/1000` → S-006 (`units-table.ts:26`). `mil2` and `in2` are tagged S-006 (`:65-66`). The 35 µm, 1.35 mil and 8890 kg/m³ conventions → S-003 / S-003d (`foil.ts`). JLCPCB values → `ledgerIds: ["S-008"]` in the JSON. `%`, `ppm`, A/cm² and the K/W family are SI definitions (no ledger needed). `check:audit` confirms every `S-nnn` cited in `src/` exists. | **Met.** Stale wording: V-4. |
| 2. Compliance wording | `grep -rniE "compliant\|compliance\|certif\|guarantee\|production[ -]safe\|fab-ready\|\bsafe\b"` over non-test `src/`: the only positive claim is `gate.ts:77`. Everything else is a negation (App footer, About, Home), the gate's own name and comment, or `hash.ts:37` "too long to be safe to load", which is about link parsing, not a design claim. In `dist/`: only the three negations and that hash sentence. The `gate.ts:77` label is tree-shaken out. | **Met** |
| 5. Core purity | `grep` over non-test `src/core` for `Date.` / `new Date` / `Math.random` / `performance` / `globalThis` / `window` / `document` / `fetch` / `console`: only `fab/profile.ts:74-75` (`Date.UTC(y, mo-1, d)` and `new Date(ms)` with an explicit argument). These are pure calendar arithmetic. "Today" is injected as a string parameter (`fabProfileAgeDays(profile, today)`, `:185`), so no clock is read. The lint rule `NewExpression[callee.name='Date'][arguments.length=0]` would catch `new Date()`. `display.ts` uses only `toPrecision` and the units table. No module state is mutated except the existing bounded prefix cache. | **Met** |
| 6. Units | New dimensions `CURRENT_DENSITY` and `THERMAL_CONDUCTIVITY` (`dim.ts:42-43`). ΔT aliasing applies only when the field is ΔT (`parse.ts:162`). An absolute field rejects Δ units with a specific message (`:222-227`). `°C/W` maps to K/W (a ΔT-based quantity, correct). | **Met.** Residual: calc m-1 (bare prefix on compound units). |
| 7. Schema | `result.ts:48-65` is a superset of the old shape. **But** `docs/SPEC.md:18` delegates the result schema to `.claude/skills/calc-module-pattern/SKILL.md`, which still shows `inputs[].defaulted: boolean`, `warnings: string[]` and `confidence` without `score`. | **Not met in the docs** (V-1) |
| 8. Rule-based confidence | Formula and text in `confidence.ts:42-58`; calc-validator exhaustive check | **Met** |
| 9. No hard-coded fab limits | `grep -rn "jlcpcb\|fab-profiles"` over `src`, `tools`, `tests`: the JLCPCB JSON is read only by `profile.test.ts` (via `import.meta.glob`) and `audit-lib.mjs`. No production module imports it, and none of its numbers appear in the bundle. The template has empty limits. | **Met** |
| 10. Guards | The parser rejects NaN, ±Infinity, overflow, commas and lookalikes, and never throws (fuzzed by the calc-validator). The FabProfile validator rejects ≤ 0 and non-finite values. Zero and underflow (`1e-400 mm`, `-0 mm`) still parse to 0 by design (R-13: calculators must call `guardPositiveFinite`). | **Met for task 0.** R-13 stays open. |
| 12. No runtime network | The only `fetch(` in `dist/assets/index-BBKAI62h.js` is Vite's modulepreload polyfill. It fires only for `<link rel=modulepreload>`, which the page does not have, and CSP `connect-src 'none'` blocks it in any case. The only URLs are the w3.org namespace strings. `index.html` loads only `./assets/*`. No `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` anywhere in `src/`. Banner notes are rendered as JSX text. | **Met** |

Performance (scratch harness under Node 24 type stripping, calling `src` read-only; 50 000 iterations after a warm-up):
- `parseQuantity`: 0.35-0.49 µs per call on success paths. Error paths are 16-18 µs ("1,5 mm" 16.0 µs, "5 Mil" 18.3 µs), because they construct an `Error`.
- `formatFor`: 0.22-0.54 µs.
- The worst case is 18.3 µs, about 55× under the 1 ms budget.

## 4. Docs consistency

| Document | Finding | Action |
|---|---|---|
| `docs/SPEC.md:18` + `calc-module-pattern` skill | The authoritative schema pointer leads to the old `CalcResult` (V-1) | Update the skill to `result.ts` as it is now, or inline the schema in SPEC |
| `via-and-annular-ring` skill | "k_Cu ≈ 385 W/m·K", golden "θ ≈ 163 K/W". The ledger, oracle and code now use 401 → 156.3 K/W. "t 25 µm" is not marked as a test value that must not be pre-filled (domain m-10) | Update (V-1) |
| `ipc2221-trace-width` skill | `width_mil = A / (oz · 1.378)` hard-wires the 35 µm convention (domain m-9). It must call `foilThickness()` with the selected convention or a finished thickness. | Update before task 2 (V-3) |
| `units-dimensional-analysis` skill | Calls 1.378 mil "the IPC convention". The ledger reports IPC-4562A as 1.35 mil (S-003c, secondhand; I re-fetched the Siemens page today: "1 oz. 1.35 mils (34.3 μm)", "nominal thicknesses, per IPC-4562A"). "Parsing is forgiving ('35u')" invites the bare-prefix problem in calc m-1. | Update (V-3) |
| `docs/SPEC.md:41` | Repo layout lacks `src/core/fab` | Minor (V-12) |
| `docs/RUNBOOK.md` Pipeline | Says "Pull requests and pushes run the `verify` job". `deploy.yml` triggers `push` only for `main`, so a pushed feature branch without a PR gets no CI run. That is why `phase-1-task-0` has none. | Correct the text (V-9) |
| `docs/sources/LEDGER.md:21` (S-007 item "(oracle uses 385 W/m·K for via θ)", value "none chosen") and `src/core/data/ledger.ts:24` ("oracle 385 unsourced"; this string ships in `dist` on the About page) | Stale. The S-007 row should record the chosen default (401, pure copper, with C11000 391 selectable) and drop the 385 remark. | V-4 |
| `docs/validation/OPEN_RISKS.md` | **Should be closed:** R-11 (exact 1/58e6 in TS and the oracle); C-5 (via_theta cites S-007). **Closable after V-4 and a human confirmation of the 401 default:** R-10. **Partly closed:** R-14 (units half done; the solver caller rules remain); R-7 is unchanged. **Should move from DEFERRED to "implemented, residuals …":** P-1, P-3, P-5, P-6 (closed in core); P-4 and P-7 (partial). **Stays open on a human decision:** P-2 and R-9. **P-m:** domain m-1, m-2 and m-7 are done (badge wording, stacked cards, decimal-comma message); m-3, m-4, m-5, m-6, m-8, m-9, m-10 and m-11 are open. **Add:** the calc-validator m-1..m-10 conditions. **No change:** R-13 and R-15 remain open; I did not touch R-18. | Orchestrator/standards-researcher (V-5). I appended only R-23 and R-24 (human-only). |

## 5. Git, CI and deploy health (public GitHub API, 2026-10-07)

- **Branches:** `main` is at ad003d7 and `phase-1-task-0` at 5437854. **No pull requests exist** (`/pulls?state=all` returns 0).
- **Workflow runs:** `total_count: 3`, all on `main` at ad003d7. **No run exists for `phase-1-task-0`.** The workflow does not trigger on non-main pushes, and no PR is open.
  1. `37456230762` "CI and Deploy", push, main: **failure**.
     - Job `verify` steps: Set up job, checkout, setup-node, setup-python and `npm ci` succeeded. **`npm run typecheck` failed.** Lint through upload-pages-artifact were skipped. Job `deploy` was skipped.
     - Check-run annotations (11) explain the failure:
       - `src/core/result.test.ts:7 Module '"./result"' has no exported member 'checkDesignValue'`;
       - `src/core/fab/profile.test.ts:5,6 Cannot find module './profile'`;
       - `src/core/data/constants.test.ts:11 Cannot find module './constants'`;
       - `constants.test.ts:52-57 Property 'THERMAL_CONDUCTIVITY' does not exist`;
       - two implicit-any errors that follow from the missing modules;
       - a notice that `ubuntu-latest` migrates to Ubuntu 26 from 2026-10-19.
     - **Why:** commit ad003d7 "okk" (pushed directly to `main` by the human) contains the task-0 *tests* written before their implementations: `constants.test.ts`, `profile.test.ts`, `display.test.ts`, `parse.fields.test.ts`, `units.compound.test.ts`, `locale.test.ts` and `result.test.ts`. The implementations exist only in 5437854 on `phase-1-task-0`. `tsconfig` typechecks test files, so `tsc` fails before any test runs.
  2. `37456232052` Dependabot "npm_and_yarn in /.": **failure**. Step "Run Dependabot" failed. The only annotation is "Dependabot encountered an error performing the update … The updater encountered one or more errors" with a link to `/network/updates/1612853557`. The job-log endpoint returns **403** (write access required), so **I could not observe the cause.**
     - Likely cause (inference, not observed): `npm outdated` lists exactly one update, `typescript 6.0.3 → 7.0.2` (a major). The latest `typescript-eslint` (8.71.1) declares the peer dependency `typescript ">=4.8.4 <6.1.0"` (`npm view`, registry metadata only). The update would therefore break peer resolution.
     - Suggested fix: an `ignore` rule for `typescript` semver-major in `.github/dependabot.yml` until typescript-eslint supports 7. The human should read the log on the Dependabot tab to confirm.
  3. `37456231970` Dependabot github_actions: success (no action updates; all five pins are still the latest releases: checkout v7.0.1, setup-node v7.0.0, setup-python v7.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1).
- **Pages:** `GET /repos/smsaad-181/PCB_Calculator` returns `has_pages: false`. `/pages` returns 404, and so does `https://smsaad-181.github.io/PCB_Calculator/`. **Pages is not enabled**, so even a green `main` run would fail at `deploy-pages`.
- **What is needed for green and deployed** (human steps; no gh CLI here):
  1. Settings → Pages → Source: **GitHub Actions**.
  2. Open a PR `phase-1-task-0 → main` (https://github.com/smsaad-181/PCB_Calculator/pull/new/phase-1-task-0). The `pull_request` trigger runs `verify` on Node 22 (`.nvmrc`), which has not yet been observed for this tree.
  3. When it is green, merge. The push to `main` runs `verify`, uploads the artifact and deploys.
  4. Confirm that the deploy job URL loads.

  This closes the red `main` and R-18. Merging before all three task-0 validators report is a process choice for the orchestrator and the human. `main` is red now in any case.

## 6. Source spot-check (my own fetches, 2026-10-07; raw HTML or text via curl, grepped verbatim)

| Ledger row | Source | Verbatim evidence | Finding |
|---|---|---|---|
| S-004 ρ | NBS Handbook 100 OCR (archive.org) | "conductivity it is an exact whole number, viz, … 58 meter/ohm-mm2 at 20 °C" | 1/58e6 is justified |
| S-004 α | same | "the temperature coefficient, 0.00393 per …"; "of standard copper to be 0.00393 at 20 °C" | confirmed |
| S-007 k | PPPL cu.html | "Thermal Conductivity, @ 0 - 100 C : 401 W/m-K"; table row "300 … 401.00 385.00" (385 is the *specific heat* column) | 401 is supported. The old 385 matches c_p, not k. |
| S-006 | NIST SP 811 App. B.8 | "mil (0.001 in) … meter (m) 2.54 E-05"; "ounce (avoirdupois) per square foot … kilogram per square meter … 3.05…" | confirmed |
| S-008 | jlcpcb.com/capabilities/pcb-capabilities | "Average Hole Plating Thickness 18μm"; "Hole size Tolerance Through-holes: +0.13 / -0.08 mm … (Finished hole size"; "Hole Position Tolerance ±0.075 mm"; "**Via hole to Track 0.2mm PTH to Track 0.28mm 0.35mm is recommended, minimum 0.28mm**" | Confirms calc m-8(a): the profile's single `holeToTrack 0.2 mm` is the via value. For PTH it is 0.08 mm non-conservative. Row stays UNVERIFIED. |
| S-003c | Siemens EDA blog 2025-08-13 | "1 oz. 1.35 mils (34.3 μm)"; "nominal thicknesses, per IPC-4562A" | Confirmed as a secondhand report; IPC-4562A not read |
| Actions | `api.github.com/repos/actions/*/releases/latest` | tags listed in §5 | All pins are current |

## 7. Findings

### BLOCKER
None.

### MAJOR

**V-1. The authoritative result schema and two skills contradict the new code.**
- Where:
  - `docs/SPEC.md:18` ("See skill `calc-module-pattern`");
  - `.claude/skills/calc-module-pattern/SKILL.md` (CalcResult block: `inputs[].defaulted: boolean`, `warnings: string[]`, `confidence` without `score`; no `designValue`, `envelope`, `fabProfile` or `limitingElement`);
  - `.claude/skills/via-and-annular-ring/SKILL.md` ("k_Cu ≈ 385 W/m·K", golden "θ ≈ 163 K/W"; code and oracle give 156.3 K/W at k = 401).
- Why MAJOR now: task 0 exists so the foundation is fixed before calculators are written, and the calc-implementer builds task 1 from these skills. The compiler would catch the type mismatch. It would not catch the 385 constant or the 163 K/W golden value, nor the missing instruction to fill provenance, severity and the design value.
- Fix:
  - replace the skill's CalcResult block with the current `result.ts` interface;
  - add rules: use `defaultedInputNames` for the confidence factors, call `checkDesignValue`/`checkEnvelope`, and set `severity` on every warning;
  - fix the via skill (k from `copperThermalConductivity()`, golden from `docs/golden-vectors.json`, plating never pre-filled).
- Owner: calc-implementer (skill text), with an orchestrator review.
- **Close before task 1 starts.**

**V-2. `main` is red, this branch has never run in CI, and Pages is not enabled.**
- Evidence: see §5. The run `37456230762` typecheck failed (11 annotations). There is no run and no PR for `phase-1-task-0`. `has_pages: false`.
- Effect:
  - the default branch fails its gate;
  - the Phase 0 exit criterion "green in Actions; live Pages URL loads" (R-18) is still without evidence;
  - task 0 has never been typechecked on Node 22.
- Fix: the human steps 1-4 in §5. Also stop pushing directly to `main`: CLAUDE.md says "one phase = one branch/PR" and "conventional commits", and the "okk" commit broke both.
- Owner: human, then devops-engineer to confirm the run.
- Logged as R-23.

### MINOR

**V-3. The units and IPC-2221 skills hard-code or mis-attribute the foil constant.**
- Where: `ipc2221-trace-width/SKILL.md` (`oz · 1.378`); `units-dimensional-analysis/SKILL.md` ("IPC convention 1 oz ≈ 1.378 mil"; "35u" forgiving parse).
- Fix: route through `foilThickness()`; attribute 35 µm as a fabricator nominal and 1.35 mil as the reported IPC-4562A value; reference calc m-1.
- Owner: standards-researcher.
- Before task 2.

**V-4. The ledger text for S-007 is stale and ships in the bundle.**
- Where: `docs/sources/LEDGER.md:21` (item "(oracle uses 385 …)", value "none chosen"); `src/core/data/ledger.ts:24` ("oracle 385 unsourced", rendered on About and present in `dist`).
- Fix: record "default 401 (pure, 300 K); C11000 391 selectable; plated barrel copper not researched" and keep CONFLICT. The `ledger-sync` test keeps both in step.
- Owner: standards-researcher (markdown) + calc-implementer (`ledger.ts`).

**V-5. `OPEN_RISKS.md` statuses no longer match the code.**
- R-11 and C-5 are still OPEN; R-10 is OPEN; P-1..P-7 are still "DEFERRED"; R-14 does not record that its units half is done; the calc-validator conditions m-1..m-10 are not logged.
- Exact list in §4.
- Owner: orchestrator.

**V-6. `CalcResult` residuals against P-6.**
- Where: `result.ts:61-64`.
- `limitingElement` has no `margin`, which P-6(e) asked for: "segment id, margin, reason".
- `designValue` is a single object, so a calculator with two derated outputs (e.g. width and current) cannot carry both.
- `Envelope` lists `toleranceInputs` but has no sensitivity-driver ranking, which P-6(b) and task 9 need.
- Owner: calc-implementer, before task 6 (path/load) and task 9.

**V-7. The shared-link reserved keys do not match the core types.**
- Where: `hash.ts:133-149`.
- `fc` is a µm-per-oz number limited to 30-40. It cannot name the `mass-density` or `nominal-1.35mil` convention (`FoilConvention`, `foil.ts:7`); it can only approximate them by a constant.
- `u` is `metric | imperial`, while `DisplayPrefs` (`display.ts:8-12`) has independent length (mm/mil/µm), temperature (C/K/F) and area settings. A link therefore cannot reproduce, for example, mm with °F.
- P-5 asked that a link reproduce the result.
- Fix: encode `fc` as the convention id plus an optional constant, and encode `DisplayPrefs` fields directly.
- Owner: ui-engineer + units-engine-engineer, before the first calculator page.

**V-8. Coverage blind spots.**
- `vite.config.ts` coverage `include: ['src/core/**/*.ts']`, so `src/state/hash.ts` (P-5 logic) is unmeasured.
- `profile.ts` functions are at 76.92 %; `unknownLedgerIds` (`:198-201`) is never executed.
- Fix: add `src/state/**` to coverage; add a test for `unknownLedgerIds`.
- Owner: test-engineer.

**V-9. The RUNBOOK describes CI triggers wrongly.**
- Where: `docs/RUNBOOK.md`, Pipeline, first bullet ("Pull requests and pushes run the `verify` job").
- `deploy.yml:8-11` runs on push to `main`, `pull_request` and `workflow_dispatch` only. A pushed branch without a PR gets no CI.
- Fix: correct the text, or add `push: branches: ['**']` if branch CI is wanted.
- Owner: devops-engineer.

**V-10. The Dependabot npm update fails.**
- §5. The cause is not observable without write access. The likely cause is TypeScript 7 against the typescript-eslint peer range `<6.1.0`.
- Fix: the human reads the log. If confirmed, add `ignore: [{dependency-name: typescript, update-types: ["version-update:semver-major"]}]` to `.github/dependabot.yml`.
- Owner: human (log) + devops-engineer.
- Logged as R-24.

**V-11. `AccuracyClass` is declared twice.**
- Where: `src/core/confidence.ts:1` and `src/core/units/display.ts:17`.
- The two can drift, and significant figures and confidence would then disagree on the classes.
- Fix: `display.ts` imports the type from `confidence.ts`, or both import it from a shared module.
- Owner: units-engine-engineer.

**V-12. SPEC layout is out of date.**
- `docs/SPEC.md:41` lacks `src/core/fab` and `src/core/data/fab-profiles`.
- Owner: orchestrator.

**V-13. The `ubuntu-latest` image changes on 2026-10-19.**
- The CI annotation says `ubuntu-latest` migrates to Ubuntu 26 from 2026-10-19. This is low risk: Node is pinned by `.nvmrc` and Python 3.13 by setup-python.
- Fix: either pin `ubuntu-24.04` until a run on 26 is observed, or accept the change and watch the first run after 2026-10-19.
- Owner: devops-engineer.

**Calc-validator conditions.** I endorse m-1..m-10 of `phase-1-task0-calc.md` without change, with the deadlines stated there:
- m-1 and m-3 before task 2/3;
- m-2 before task 2;
- m-8(a) re-confirmed by me today.

## 8. Closure conditions for task 0

1. **V-1 fixed.** `calc-module-pattern` and `via-and-annular-ring` match `result.ts`, the golden vectors and `constants.ts`. This must be done before task 1 starts.
2. **V-2 fixed (human).**
   - Pages source is set to GitHub Actions.
   - A PR is open for `phase-1-task-0` and its `verify` job is observed green on Node 22.
   - The PR is merged, `main` goes green, and the deploy URL loads.
   - Record the run ids in R-18 / R-23.
3. **V-4 and V-5 done.** The ledger S-007 text is corrected and `OPEN_RISKS.md` is updated per §4, including the calc m-1..m-10 conditions.
4. **Human decisions recorded:**
   - R-9 / P-2: the 35 µm default, and whether a defaulted foil convention counts as an assumption or as CONFLICT data;
   - confirmation of the 401 W/m·K default (R-10);
   - the P-1..P-7 deferral confirmation that is still pending from Phase 0.
5. **Remaining MINORs** (V-3, V-6..V-13 and calc m-1..m-10) are logged in `OPEN_RISKS.md` with the deadline task named. These do not block closure of task 0.

## What I could not observe

- **Dependabot npm job log.** The API returns 403; the cause in V-10 is an inference.
- **CI on this branch.** No run exists. Node 22 behaviour for the task-0 tree is unobserved.
- **Live Pages.** It is not enabled.
- **UI checks not done this run:**
  - layout at 360 px (domain m-2 fix);
  - keyboard focus after "Dismiss";
  - screen-reader announcement of `role="status"`.

  I observed only the banner text in headless Chrome against `vite preview`, which I stopped afterwards.
- **UI rendering of confidence reasons and score.** No calculator exists yet.
- **Standards (paywalled, not read):** IPC-4562A, IPC-6012, IPC-2221 and IPC-2152.
