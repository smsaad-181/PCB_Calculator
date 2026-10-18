# Phase 1 phase validation (FINAL)

- **Validator:** phase-validator (senior-engineer and standards-auditor lens). I did not edit `src/` or `tests/`. This report is my only repository file. Scratch files (a CDP driver script, Chrome profiles and logs) are in the session scratchpad, outside the repo.
- **Date:** 2026-10-15.
- **Tree:** `F:/pcb-calc/pcb-calc-kit-v2/pcb-calc`, branch `phase-1-task-10`, head `984cb7e`.
  - After `git fetch`, `origin/main` is `63a938e` (Merge PR #18, 2026-10-15 12:18 +0600).
  - `git log origin/main..HEAD` shows only `984cb7e` (the calc-validator report). **All Phase 1 code is already on `main`.**
- **Environment:** Windows 11, Node 24 locally. CI uses Node 22 (`.nvmrc`).
- **Read first, numerics not redone:**
  - `phase-1-calc-final.md` (PASS-WITH-CONDITIONS, F-1..F-7);
  - the interim `phase-1-calc.md`, `phase-1-phase.md` and `phase-1-pcb.md`;
  - `OPEN_RISKS.md`, `phase-1.md`, `PLAN.md` and `SPEC.md`.

## Verdict: PASS-WITH-CONDITIONS (engineering). Phase 1 can close only after the closure conditions in section 10.

- **No BLOCKER:**
  - every gate passes when I run it myself, and `test:coverage` passed 3 of 3 runs;
  - no compliance wording appears outside `gate.ts`;
  - `src/core` is pure;
  - Mode A is never substituted, and legacy output is labelled;
  - every route loads under the production CSP with zero console messages, and the pair-search worker runs under `worker-src 'self'`;
  - CI `verify` is green on `main` head `63a938e`.
- **Two MAJOR findings, both process or documentation; no wrong number:**
  - PF-1: `OPEN_RISKS.md` is incomplete and stale for phase closure.
  - PF-2: task 10's exit criterion is unmet (human-run tools), and several open items say in their own text that they must close "before Phase 1 closes".
- **Nine MINOR findings.**

## 1. Gates (run by me; exit codes read from the shell)

| Gate | Result |
|---|---|
| `npm ci` | Not run, as instructed: a `vite preview` on port 4173 locks `node_modules`. CI ran `npm ci` successfully on `63a938e` (run 38691595790, `verify` job, step "Run npm ci": success). |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`eslint .`, no findings) |
| `npm run test:coverage` ×3 (flake hunt) | exit 0 on all three runs. Each run: `Test Files 120 passed (120)`, `Tests 4420 passed (4420)`, `All files 97.54 \| 95.47 \| 98.51 \| 98.77` (statements, branches, functions, lines). The numbers are identical across runs, so I found no flaky test (PV-1 holds). The branch margin is **0.47 pp** above the 95 % floor (see PF-8). |
| `npm run build` | exit 0, `✓ built in 244ms` |
| `npm run check:size` | exit 0. `largest first-load PathLoad 127.70 KB of 150.00 KB`; `total 260.02 KB gzip JS of 400.00 KB ceiling (44 files)`; `check:size: PASS`. All 15 routes are within budget; the smallest is OhmPower at 44.33 KB. |
| `npm run check:audit` | exit 0: `2 data tables audited, 42 ledger rows checked` / `PASS` |
| `npm audit --omit=dev` | exit 0: `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | exit 0: 1334 `OK` lines, 0 `FAIL` (last line `OK trace_width_rms_dT_C_outer_Ipk6A_D1_w30mil_2oz got=40.3995`) |
| `python3 tools/reference/gen_golden.py --check` | exit 0: `OK docs/golden-vectors.json matches the oracle` |
| CI on `main` | Run 38691595790 (push, `63a938e`). `verify` succeeded: npm ci, typecheck, lint, oracle, golden check, test:coverage, build, check:size, check:audit and upload-pages-artifact all passed. `deploy` failed because Pages is disabled: the API shows `has_pages: false`, and `https://smsaad-181.github.io/PCB_Calculator/` returns 404. This is a known human action (R-26, R-18). |

I used no `npx`. I killed no process except the headless Chrome instances I started myself.

## 2. Exit criteria (`docs/phases/phase-1.md`)

| Criterion | Evidence | Status |
|---|---|---|
| Every calculator returns full `CalcResult`; the UI shows a quick answer plus details | 14 core calculators run `assertCalcResult`. The calc-final report confirms this for every new calculator. All 15 pages render in Chrome: `h1` plus an Inputs section, with no error-boundary text. **Exception:** the E-series page returns no `CalcResult` (`src/ui/calculators/e-series.vm.ts:2`, "no CalcResult ... shows no confidence rating"). SPEC still says "Every calculator returns it", with no exception recorded (PF-3). | Met, except the E-series page (MINOR, PF-3) |
| Golden vectors and property tests pass; the oracle agrees | 1334 oracle OK lines; golden `--check` OK; 4420 tests. `fc.assert` appears in all 14 calculator folders (from 3 in self-heating to 13 in trace-resistance). The calc-final report recomputed about 110 cases independently, all within 1e-9 relative except one solver case within its stated 1e-6 tolerance. | Met |
| Mode A/B never mixed; legacy labelled; no compliance wording outside the gate | See section 4. | Met |
| Self-heating: convergence ≤ 50 iterations; runaway case handled | `self-heating/meta.ts:43` has `maxIterations: 50`. The test asserts `s.iterations` `toBeLessThanOrEqual(50)` (`self-heating/*.test.ts:235`). There are 14 runaway assertions. The calc-final report shows k ≥ 1 returns THERMAL_RUNAWAY with no numbers. Residual: calc F-2 (the runaway code is also used when k < 1 but the root lies above the search limit). | Met (F-2 MINOR) |
| Performance: closed-form < 1 ms (benchmarked); fuzz gives no NaN or throw | Timing tests exist in 13 of 14 calculator folders. **`annular-ring` has none** (no `performance.now` or 10 000-run budget found; PF-6). Every folder has fuzz tests. | Met, except the annular-ring benchmark (MINOR) |
| Three validator reports PASS or PASS-WITH-CONDITIONS | calc: `phase-1-calc-final.md`, PASS-WITH-CONDITIONS. phase: this report. pcb: the final report is not written yet. | Pending the pcb-domain-reviewer |

## 3. Tasks 0-10: built or deferred, and whether each deferral is logged

| Task | Built (evidence) | Deferred | Deferral logged? |
|---|---|---|---|
| 0 Foundation | Closed with conditions on 2026-10-07 (task-0 reports). Residual G/m rows are in OPEN_RISKS. | n/a | yes |
| 1 Copper converter | `copper-converter/`; finished-copper caution (S-009), status PAYWALLED (F-3 fixed). The page renders. | none | n/a |
| 2 Trace width | Mode B legacy, with the RMS pulse input (S-019e VERIFIED, S-019f UNVERIFIED), ambient, the informational maximum-temperature check, layer count with the fab-minimum note, and envelope. | Mode A (gated by R-8; the guard rejects it and the UI disables it). Adjacent plane and cooling are "not modelled". | Plane and cooling: yes (`phase-1.md` task 2 status text). **Mode A: only implicitly** through R-1 and R-8. `phase-1.md` task 2 still lists Mode A side by side as required, with no "deferred" note (PF-4). |
| 3 Trace resistance | R(T), ρ and α overrides, skin-effect warning | none | n/a |
| 4 Self-heating | `self-heating/`: user θ or legacy-calibrated θ; Brent solver with ≤ 50 iterations; runaway handling | none | n/a |
| 5 Voltage drop | All four relations; over-specification is rejected (exactly one load quantity, T5-2) | "two given" semantics | yes (T5-2 NOTED) |
| 6 Path/load | Weakest link, net-class export, elements trace, via, connector, pad, spoke and user | **Parallel branches; temperature coupling inside the path** (warns SELF_HEATING_NOT_COUPLED) | **Only in the skill text** (`.claude/skills/path-load-calculator/SKILL.md:10-11`). Not in `phase-1.md` or OPEN_RISKS (PF-4). |
| 7 Via and annular ring | `via/` (array, thermal θ); `annular-ring/` (worst-case stack-up from scoped profile limits, with no fallback) | none. Residuals: R-10 confirmation, T7-1, R-21 | yes |
| 8 Circuit values | Ohm, divider, feedback, LED, RC/LC, reactance, E-series nearest and pair search in a **Web Worker** (`src/workers/pair-search.worker.ts`; observed running, see section 7) | none | n/a |
| 9 Envelope and sensitivity | Trace width, trace resistance and via (core plus UI) | none | n/a |
| 10 Cross-check X-01/X-03 | Kit only: 4 records with 24 cases, adapters, runner and worksheet `docs/validation/crosscheck-phase1.md`. **All `toolOutputs` are null.** | The tool runs are waiting on the human. | Stated in the worksheet, but **no OPEN_RISKS row** (PF-1, PF-2). Task 10's own exit criterion ("every disagreement classified") is unmet. |
| Research add-ons (solve-for-any, named bounds, formula panel, Reset, internal-layer caveat) | The interim report confirmed these. The new pages have formula and steps panels (the calc-final report checked steps). | none | n/a |

## 4. CLAUDE.md non-negotiables 1-15

| Rule | Evidence | Status |
|---|---|---|
| 1 Ledger for every constant | `check:audit` PASS on 42 rows. Every `S-nnn` id referenced in `src` (45 distinct, S-001..S-051) exists in `LEDGER.md` (my loop: 0 missing). The new calculators' literals are either ledger-tagged or labelled as engineering defaults or plausibility ranges in `meta.ts`, for example self-heating `defaults.ambientC 25`, "Engineering default 25 °C, not from a standard" (`self-heating/calc.ts:268`), and voltage-drop NEAR_MAX 0.99. µ0 moved to `constants.ts` with S-013 (PV-8 fixed). | Met |
| 2 Compliance wording only via `gate.ts` | `grep -rniE "compliant\|complian\|production.safe\|certif\|guarantee\|fab-ready\|ready for fab" src` (excluding tests): the only claim-capable hit is `src/core/gate.ts:77`. All other hits are negations or advice ("Not a compliance certification", `App.tsx:64`; "does not certify", `About.tsx:10`; "use the thinnest value your fabricator guarantees"; "not guaranteed extremes"). `complianceGate` has no caller. The calc-final claim audit agrees. C-2 (tripwire, not proof) is still open. | Met |
| 3 IPC-2152 labelled as an estimate; no digitizing | Mode A disabled; no chart data in the repo | Met (R-8 open) |
| 4 Legacy labelled, never substituted | Trace width "(legacy IPC-2221)" in the `h1` (observed). Path-load net-class text: "LEGACY IPC-2221 method (ledger S-001, PAYWALLED), not IPC-2152". Self-heating's legacy-calibrated θ is labelled "calibrated from the legacy IPC-2221 fit (an extrapolation…)". | Met |
| 5 `src/core` pure | A grep of `src/core` (excluding tests) for `Date.now\|Math.random\|window.\|document.\|navigator.\|globalThis\|localStorage\|fetch(\|XMLHttpRequest` and for preact, ui or state imports finds nothing. The one `new Date(ms)` (`core/fab/parse-util.ts:27`) validates a calendar date from a parsed string and is deterministic; "today" is injected (`fab-profile-banner.ts:1`). The mutable caches in trace-width and the copper converter were removed (PV-8). | Met |
| 6 Units | ΔT is separate from absolute T, and every crossing is a DIMENSION error (calc-final pitfalls table). Conversion happens only at the boundaries. | Met (F-6 cosmetic) |
| 7 Standard `CalcResult` | See exit criterion 1 | Met, except E-series (PF-3) |
| 8 Rule-based confidence | `confidence.ts`. The calc-final report confirms "any validity failure forces low". T5-1 is open. | Met |
| 9 Fab limits never hard-coded | Limits come only from `src/core/data/fab-profiles/jlcpcb-2026-10-13.json` (plus `template.json`). The UI imports it as an opt-in choice: `fab-profile-choice.ts:1` says "Nothing is pre-selected", and the label is "JLCPCB example profile (UNVERIFIED)". There is no scope fallback. I found no fab literal in calculator code. There is no in-app profile editor or import, so "user-editable" means "none / my own values" plus editing the JSON (MINOR, PF-9). | Met |
| 10 Input guards | About 60 guard cases are rejected (calc-final). Bare numbers are refused. | Met |
| 11 Tests first | Cannot be shown from history: tests and code land in the same commits. | Not verifiable |
| 12 No runtime network | CSP `connect-src 'none'`; no fetch in `src`; zero network-related console messages in the browser run | Met |
| 13 No GPL code copied | The cross-check kit uses values only; the worksheet forbids committing tool source | Met (no evidence of copying) |
| 14 Tool agreement is not verification | All cross-check outputs are null; no ledger row was promoted (calc-final) | Met |
| 15 No third-party code without approval | No `npx` (I used none). `.mcp.json` is still unpinned (R-16, open). | Met (R-16 open) |

## 5. Source ledger spot-checks (retrieved 2026-10-15, by me)

| Row | Source checked | Finding |
|---|---|---|
| S-019l / S-019j / S-019k (JLCPCB example profile) | https://jlcpcb.com/capabilities/pcb-capabilities (fetched through a summarizing fetcher, so R-21 still applies) | Matches the ledger. 1 oz track/space "0.10 / 0.10 mm (4 / 4 mil)" for 1-2 layers and "0.09 / 0.09 mm (3.5 / 3.5 mil)" for multilayer; 2 oz "0.16" (2-layer) and "0.15" (multilayer). PTH ring: 2-layer 1 oz "Recommended 0.25 … absolute minimum 0.18", multilayer 1 oz "0.20 … 0.15", 2 oz "0.254 mm or above". NPTH "≧0.45mm". PTH hole "+0.13 / -0.08 mm". Track tolerance "±20%". UNVERIFIED stays correct (single publisher; T7-1 and R-21 open). |
| S-013 (µ0) | NIST CODATA, https://physics.nist.gov/cgi-bin/cuu/Value?mu0 | µ0 = 1.256 637 061 27 × 10⁻⁶ N A⁻² (CODATA 2022), u_r 1.6e-10. This matches the ledger's CODATA 2022 figure and its stated < 1e-9 effect of using 4π×10⁻⁷. |
| S-016 (E-series) | https://en.wikipedia.org/wiki/E_series_of_preferred_numbers | E12, E24 and E96 (1.00-1.50) lists match the ledger. The eight E24 values that differ from the calculated ones (2.7 3.0 3.3 3.6 3.9 4.3 4.7 8.2) are consistent. The source is tertiary; PAYWALLED stays correct (R-27). |
| S-004 (IACS) | https://en.wikipedia.org/wiki/International_Annealed_Copper_Standard | "0.15328 ohm (meter, gram) at 20 °C" and "exactly 58×10⁶ S/m at 20 °C" match the ledger. That page does not state α or ρ in Ω·m; those rest on the ledger's NBS Circular 31 quote. VERIFIED stands on the primary source. |
| S-019e (I_rms = I_pk·√D) | Search: masteringelectronicsdesign.com (derivation from the RMS integral, duty D = t₁/T); element14 blog ("A·√d"); MathWorks RMS example (25 % duty measured 0.5007 vs √0.25) | Consistent. VERIFIED is appropriate for a definitional identity. |

No stale or unsupported row affects shipped numbers. S-001, S-010, S-009, S-016 and S-015 correctly remain PAYWALLED.

## 6. Architecture

- **Result schema:** `assertCalcResult` runs in every core calculator (interim report; calc-final confirms it for the new ones).
- **Compliance wording:** only in `gate.ts`.
- **Mode separation:** path-load ratings come only from the legacy IPC-2221 relation at the user's allowed rise, and are labelled so. No Mode A code path exists.
- **Units:** SI `Quantity` throughout; the legacy fit converts to mil² and Δ°C only at the equation.

## 7. Stability and security

- **Input guards:** see rule 10.
- **URL state:**
  - `MAX_HASH_LENGTH` 8192 and `MAX_STATE_KEYS` 64 (`src/state/hash.ts:5-6`).
  - `MAX_FIELD_CHARS` 40 (`src/ui/components/view.ts:28`) is used by **every** `*.vm.ts`: `grep -L` returned no file without it.
  - `v=1` with migration and a discard banner.
- **Error boundaries:** `ErrorBoundary.tsx` is used in `App.tsx` and `CalcPage.tsx`. The browser run showed no boundary text on any route. Rendering after a thrown error is still not DOM-tested (R-19, open).
- **CSP:** the built `dist/index.html` has `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; base-uri 'none'; form-action 'none'`. There is no `blob:`, `unsafe-inline` or `unsafe-eval`. The worker is a separate same-origin chunk (`dist/assets/pair-search.worker-*.js`).
- **Unsafe HTML:** a grep of `src` (excluding tests) for `innerHTML\|dangerouslySetInnerHTML\|eval(\|new Function` finds nothing.
- **Browser check:** the Playwright MCP was not loadable here (no ToolSearch). Instead I used local Chrome headless against the running `http://localhost:4173/`, which served the `dist` I had just rebuilt.
  - **Pass 1** (`--dump-dom`, stderr logging): every route rendered its `h1`. I calibrated the logging with a probe page and confirmed it captures `INFO:CONSOLE` CSP-violation lines. The app routes produced **0** CONSOLE lines; the only stderr lines were Chrome extension-registry noise.
  - **Pass 2** (my own CDP driver; Node built-in WebSocket, nothing installed; `Runtime`, `Log` and `exceptionThrown` events captured): `#/`, `#/about`, all 15 calculators from `src/ui/registry.ts` and `#/calc/nope` ("Not found"). **Every route: `msgs: []`.**
  - **Worker:** `#/calc/e-series?v=1&pt=47.3k&ps=E192&pk=series` attached a `worker` target. The page then showed "Two-resistor search: 5 best pairs. Best is R1 2 kΩ and R2 45.3 kΩ, giving 47.3 kΩ, error 0 %", with 0 console messages. So the worker runs under `worker-src 'self'`.
  - **Harness note, not a defect:** when I issued `Page.navigate` (a hash-only change) and then `Page.reload` immediately, the old route sometimes reloaded. Same-document navigation with no reload went to the correct route every time (trace-width → trace-resistance → self-heating → via → home), as did a fresh load of each route.
- **Offline:** no runtime network (CSP and code). A real-device offline load was not observed (R-15).
- **Flake hunt:** 3 of 3 coverage runs green with identical counts.
- **Secrets:** none found. `npm audit --omit=dev`: 0 vulnerabilities.
- **Coverage scope:** still `src/core/**` only (`vite.config.ts:31`), so `src/state` and the view models (the URL-input surface) are tested but not coverage-gated (PV-10 open; PF-8).

## 8. Deployment

- **Workflow** (`.github/workflows/deploy.yml`):
  - `verify` runs on PRs and on pushes to `main` and executes every gate.
  - `deploy` runs only on `main`, with `pages: write` and `id-token: write`.
- **Pinned actions.** Each is pinned to a full SHA. I confirmed through the GitHub API that the tags resolve to the pinned SHAs: checkout v7.0.1 → `3d3c42e…`; setup-node v7.0.0 → `8207627…`; deploy-pages v5.0.1 → `368f825…`.
- **Latest releases (API, 2026-10-15):**

  | Action | Pinned | Latest | Status |
  |---|---|---|---|
  | checkout | v7.0.1 | v7.0.1 | current |
  | setup-python | v7.0.0 | v7.0.0 | current |
  | upload-pages-artifact | v5.0.0 | v5.0.0 | current |
  | deploy-pages | v5.0.1 | v5.0.1 | current |
  | setup-node | v7.0.0 | v7.1.0 | minor bump; Dependabot `github-actions` covers it |

- **Base path and rollback:** `base: './'` with hash routing. RUNBOOK §Rollback exists, and the RUNBOOK CI wording is now correct (line 11; PV-6 text fixed).
- **Dependabot:** npm and github-actions, weekly. There is no `ignore` for typescript semver-major, so R-24 is still open.
- **Pages:** not enabled (`has_pages: false`, 404). This is a human action (R-26, R-18).
- **Lockfile:** the `package-lock.json` header still says `"version": "1.0.0"`, `"license": "ISC"` (PV-5, open).

## 9. Docs currency

- **SPEC:**
  - The bundle rule (150 KB per route, 400 KB total) matches `check:size` and RUNBOOK line 23.
  - The repo layout is current.
  - Gap: no E-series `CalcResult` exception (PF-3).
- **Skills:**
  - `calc-module-pattern` was updated in `3548582`, with task 9.
  - `path-load-calculator` matches the code: element kinds, one current basis, and the deferrals for parallel branches and coupling.
  - `self-heating-solver` (unchanged since Phase 0) is consistent with the code: bracketed, 50 iterations, 1e-6, runaway when there is no root in [0, ΔT_max]. Its runaway rule is exactly what calc F-2 calls over-broad, so fixing F-2 needs a skill edit too.
  - `circuit-values` is consistent: worker search, best 5, LED rounds up.
  - `via-and-annular-ring` and `units-dimensional-analysis` were last synced 2026-10-07. I saw no contradiction in the spot reading, but I did not re-verify them line by line against the task 7 profile restructure (PF-9).
- **OPEN_RISKS:** see PF-1.

## 10. Findings

| # | Severity | Finding and evidence | Owner |
|---|---|---|---|
| PF-1 | MAJOR | **OPEN_RISKS is not ready for closure.** CLAUDE.md: "closed only when … conditions are logged in OPEN_RISKS". (a) calc-final **F-1..F-7 are not logged** (the report was written today). (b) Task 10 has **no row**: its exit criterion is unmet, waiting on the human. (c) The path-load deferrals (parallel branches, path temperature coupling) and the **Mode A deferral for Phase 1** are not rows. (d) Stale statuses: PV-4 and PV-9 read OPEN, but a worker exists, the pages use `useCalcState`, interim F-4 is done (the "Nearest means the smallest difference in ohms…" text is shown on the page) and PCB-12 is done (`dropNoisePairs`); PCB-5 and PCB-7 read "UI IN PROGRESS" though the divider UI has rated-voltage and load-tolerance fields; R-26 does not record that PR #17/#18 merged to `main` before the phase and pcb validators. (e) This report's PF items must be added. | orchestrator |
| PF-2 | MAJOR (human gate) | **Some items block closure by their own text.** **R-9:** "The human decision is still needed before Phase 1 closes (rule 1)". **R-10:** "Must close before the Phase 1 via calculator"; the via calculator shipped with R-10 still "pending human confirmation". **Task 10:** 0 of 24 cross-check cases obtained. Phase 1 cannot honestly be called closed until the human (i) decides R-9, (ii) confirms R-10, and (iii) supplies the X-01/X-03 outputs **or** explicitly accepts carrying task 10 into Phase 2 as a logged condition. | Human (then orchestrator) |
| PF-3 | MINOR | **E-series page has no `CalcResult` (PV-4a still open).** The worker part is done. SPEC says "Every calculator returns it", and exit criterion 1 says "Every calculator". Either record a "lookup utility" exception in SPEC and `calc-module-pattern`, or wrap the result. | orchestrator / calc-implementer |
| PF-4 | MINOR | **Deferrals are not recorded in `phase-1.md`.** Task 2 still demands "Mode A estimate (… side-by-side)" with no deferred note. Task 6's parallel branches and path coupling are deferred only in skill text. | orchestrator |
| PF-5 | MINOR (process) | **R-26 recurred.** PR #17 (`3413fda`) and PR #18 (`c06c05e`) reached `main` (`63a938e`, 12:18 today) before the phase and pcb validators finished. No harm so far: no BLOCKER was found, and Pages is disabled, so nothing deployed. Once Pages is enabled, each merge deploys. The human decision is still pending. | Human |
| PF-6 | MINOR | **`annular-ring` has no timing benchmark**, against the exit criterion "closed-form < 1 ms (benchmarked)". The other 13 calculator folders have one. | test-engineer |
| PF-7 | MINOR | **Calc-final F-1..F-7 endorsed** as written: margin float noise prints −0.001 mm; THERMAL_RUNAWAY for k < 1; PULSE_PERIOD text claims a value not shown; constant-power message precision; via α with a ρ override; K→°C noise; FB bias solve. None is in the unsafe direction. F-2 also needs the `self-heating-solver` skill reworded. | calc-implementer, units-engine-engineer, pcb-domain-reviewer (F-7) |
| PF-8 | MINOR | **Coverage headroom and scope.** The branch margin is 0.47 pp (95.47 vs 95), so a small untested branch in core will turn CI red. Coverage still excludes `src/state` and `src/ui` (PV-10 / V-8 open). | test-engineer |
| PF-9 | MINOR | **Housekeeping still open:** PV-5 (lockfile header); R-24 (Dependabot typescript ignore); setup-node v7.1.0 available; R-16 (MCP unpinned); R-19 (no DOM test for the error boundary). Rule 9: there is no in-app fab-profile editor or import; "user-editable" is met only by "none / my own values" or by editing the JSON. Confirm this is acceptable or schedule the editor (T7-3 mentions a future editor). The via and units skills were not re-synced after the task 7 profile restructure; spot-check them. | devops-engineer, human, ui-engineer, orchestrator |

**Conditions to keep PASS-WITH-CONDITIONS and to close Phase 1:**
1. The orchestrator fixes PF-1 and PF-4: log calc F-1..F-7, task 10, the deferrals and the PF rows, and refresh the stale statuses.
2. The human acts on PF-2: R-9 decision, R-10 confirmation, and task 10 outputs or explicit acceptance of the carry-over.
3. The pcb-domain-reviewer's final report is PASS or PASS-WITH-CONDITIONS.
4. PF-3, PF-5 and PF-6..PF-9 are logged with owners. They do not block closure.

**Can Phase 1 close?** On engineering evidence, yes: there is no defect that changes a number in the unsafe direction, and all gates are green locally and in CI. Formally, **not yet**. Closure waits on conditions 1-3. Condition 1 is about an hour of orchestrator work. Condition 2 needs the human.

## 11. What I could not verify

- `npm ci` locally (file lock); CI evidence substitutes.
- Rendering through the Playwright MCP (not available); Chrome headless and CDP were used instead. I did no visual, layout, accessibility or mobile-width check.
- Error-boundary behaviour after a thrown render error (R-19).
- Offline load on a real device, Lighthouse, and the live Pages URL (disabled).
- Paywalled texts: IPC-2221B/C, IPC-6012, IPC-2152, IEC 60063.
- The JLCPCB page outside a summarizing fetcher (R-21).
- Test-first ordering (rule 11).

## Sources (retrieved 2026-10-15)
- https://jlcpcb.com/capabilities/pcb-capabilities
- https://physics.nist.gov/cgi-bin/cuu/Value?mu0
- https://en.wikipedia.org/wiki/E_series_of_preferred_numbers
- https://en.wikipedia.org/wiki/International_Annealed_Copper_Standard
- https://masteringelectronicsdesign.com/how-to-derive-the-rms-value-of-pulse-and-square-waveforms/
- https://community.element14.com/technologies/power-management/b/blog/posts/how-to-compute-the-average-versus-the-rms-value-of-a-pwm-waveform
- https://in.mathworks.com/help/signal/ug/rms-value-of-periodic-waveforms.html
- GitHub REST API: `repos/smsaad-181/PCB_Calculator`, `actions/runs/38691595790/jobs`, `repos/actions/*/releases/latest`, `git/ref/tags/*`
