# Phase 1 phase validation (interim): tasks 0-3 and circuit values slice 1

- **Validator:** phase-validator, with a senior-engineer and standards-auditor lens.
- **Edits:** I did not edit `src/` or `tests/`. My only edits are this report and an appended section of human-only items at the end of `docs/validation/OPEN_RISKS.md`; I changed no existing row.
- **Date:** 2026-10-11.
- **Tree:** `F:/pcb-calc/pcb-calc-kit-v2/pcb-calc`, branch `phase-1-task-3`, head `67ac40d`.
  - That is the same commit as `origin/phase-1-task-3` and `refs/pull/4/head` (`git ls-remote`).
  - PR #4 was **already merged** to `main` as `fe12593` at 2026-10-11T07:42Z.
- **This is an interim review, not phase closure.** Tasks 4-10 of `docs/phases/phase-1.md` are not built.
- **In scope:**
  - task 0 (foundation, closed earlier with conditions);
  - task 1, copper converter;
  - task 2, trace width (Mode B legacy);
  - task 3, trace resistance;
  - task 8 slice 1: Ohm/power, resistor divider, and the E-series library and page.
- **Environment:** Windows 11, Git Bash, Node v24.13.0, npm 11.6.2, Python 3.13.12. CI uses Node 22 (`.nvmrc`).
- **Inputs read:**
  - CLAUDE.md, `phase-1.md`, `plan-delta.md`, SPEC.md, RUNBOOK.md, LEDGER.md and OPEN_RISKS.md;
  - `reports/phase-1-calc.md` (PASS-WITH-CONDITIONS, F-1..F-4). I did not redo its numerics;
  - every calculator's `meta.ts`, `trace-width/calc.ts`, the registry, `CalcPage`, `ResultsPanel`, `TraceWidth.tsx`, `useCalcState`, `state/hash.ts`, `vite.config.ts`, `index.html`, `deploy.yml`, `dependabot.yml` and `.mcp.json`.

## Verdict: PASS-WITH-CONDITIONS (interim)

- **No BLOCKER.** I found none of the following in the code built so far:
  - a wrong number (the calc-validator matched 69 cases to 1 ppm);
  - a compliance claim;
  - a Mode A/B substitution;
  - a purity breach in `src/core`;
  - a runtime network call;
  - a hard-coded fab limit;
  - an unsafe HTML sink.
- **CI:** CI on this exact head is green on Linux. The PR #4 `pull_request` run for 67ac40d concluded `success`. On `main`, the `verify` job is green and only `deploy` fails, because Pages is not enabled (a known user action).
- **Two MAJOR findings:**
  - PV-1: `test:coverage` fails locally on a wall-clock assertion in 2 of 3 runs.
  - PV-2: `OPEN_RISKS.md` has not been updated since before task 1 was built.
- **Eight MINOR findings:** PV-3..PV-10.
- **Calc-validator conditions:** I endorse F-1..F-4 from the calc-validator report.

## 1. Gates (run by me, real output)

| Gate | Result |
|---|---|
| `npm ci` | **Not completed locally.** It failed with `npm error code EPERM ... unlink '...node_modules\@rolldown\binding-win32-x64-msvc\rolldown-binding.win32-x64-msvc.node'`. A leftover `vite preview --port 4173` process (PID 12088, not started by me) holds that file open; I did not kill it. I restored `node_modules` with `npm install` from the lockfile. `npm ls --depth=0` shows exactly the locked versions: preact 11.0.0, vite 8.3.3, vitest 5.0.3, typescript 6.0.3 and the others. `npm install` rewrote the lockfile header (PV-5), so I reverted that with `git checkout -- package-lock.json`. Evidence that `npm ci` itself works: CI ran it on 67ac40d (PR #4 run) with `success`. |
| `npm run typecheck` | `tsc --noEmit`, exit 0 |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm run test:coverage` | **Flaky (PV-1).** Run 1: `Tests 1 failed \| 2835 passed (2836)`, with `AssertionError: expected 1.4529443333333327 to be less than 1` at `src/ui/calculators/resistor-divider.vm.test.ts:288`, exit 1. Run 2: same test, `expected 1.110685666666667 to be less than 1`, exit 1. Run 3: `Test Files 76 passed (76)` / `Tests 2836 passed (2836)`, coverage `All files 98.05 \| 96.77 \| 98.54 \| 98.87` (statements, branches, functions, lines) and `core/units 98.32 \| 96.33 \| 100 \| 99.31`, above the thresholds (95, and units branches 95), exit 0. |
| `npm test` (no coverage) | `Test Files 76 passed (76)` / `Tests 2836 passed (2836)`, exit 0 |
| `npm run build` | `✓ 88 modules transformed`, `✓ built in 241ms`. Largest chunks: `index-Bc9A6aer.js 37.09 kB │ gzip: 13.96 kB` and `TraceWidth-bVBY816g.js 33.17 kB │ gzip: 10.95 kB` |
| `npm run check:size` | `check:size: total 78.67 KB gzip JS of 150.00 KB budget (13 files)` / `check:size: PASS` |
| `npm run check:audit` | `check:audit: 2 data tables audited, 31 ledger rows checked` / `check:audit: PASS` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | 471 `OK` lines, 0 `FAIL`, exit 0. Examples: `OK ipc2221_ext_1A_dT10_width_mil got=11.8262`, `OK trace_resistance_ohm_L100mm_w0.254mm_t35um_T25C got=0.197752`, `OK skin_depth_um_10MHz got=20.8981` |
| `python3 tools/reference/gen_golden.py --check` | `OK   docs/golden-vectors.json matches the oracle`, exit 0 |
| Dependencies | `git diff b13c3e8..HEAD -- package.json .github src/core/gate.ts` is empty. No new runtime or dev dependency, no workflow change, and no change to the gate. |

## 2. Requirements coverage (built tasks only)

| Requirement (`phase-1.md`) | Evidence | Status |
|---|---|---|
| T0 (a)-(g) foundation | Closed with conditions on 2026-10-07 (`reports/phase-1-task0-*.md`). Gates G-1..G-4 are closed in core. G-5 (UI) is now implemented: in headless Chrome the trace-width page shows "Confidence: low", "score 9; 0 is best" and the rule text, and every page has a parsed echo field (`QuantityField` with `echoPrefs`). | Met. The risk-log status is stale (PV-2). |
| T1 copper converter and finished-copper caution | `src/core/calculators/copper-converter/`. The page rendered "35 µm (1.38 mil)" with confidence medium, score 2. The OUTER_FINISHES_THICKER caution uses S-009. | Met (calc F-2, F-3) |
| T2 Mode B legacy, exact formula, labelled | `trace-width/meta.ts` method "IPC-2221 legacy (KiCad-compatible)" and constants 0.048/0.024/0.44/0.725 (S-001). The page shows "Method: IPC-2221 legacy (Mode B)" and the LEGACY_METHOD caution. Rendered "0.301 mm (11.83 mil)" for 1 A, 10 °C rise, 1 oz outer. | Met |
| T2 Mode A estimate, side by side | Not built. It is blocked by the R-8 human decision. `guards.ts:65` rejects mode A ("never substituted"). The UI shows "IPC-2152-informed estimate" disabled, and a `mode=A` link produces a visible notice (observed). | Deferred and correctly gated (R-8) |
| T2 advanced: continuous/peak/duty (RMS), length, adjacent plane, cooling | Ambient, max conductor temperature, layer, margin and derating are present. Peak/duty RMS, adjacent plane and cooling are absent; the current help text says "Continuous (DC or RMS)". | **Not built and not tracked (PV-3)** |
| T3 trace resistance with R(T), override, skin-effect warning | `trace-resistance/` with `rho` and `al` overrides that are never prefilled and carry status UNVERIFIED. `SKIN_EFFECT` and `FREQUENCY_RANGE` warnings. Rendered "197.8 mΩ". | Met |
| T8 slice: Ohm/power, divider, E-series nearest and two-resistor search | `ohm-power/` and `resistor-divider/` (E-series snapping, tolerance corners). `core/eseries.ts` has `nearest` and `bestPairs`. Pages render: "50 mA / 250 mW"; "26.1 kΩ" for 12 V → 3.3 V with E96. | Partly met. The E-series result has no `CalcResult` (PV-4). The search is not in a worker (PV-4). Feedback, LED, RC/LC and reactance are still to build. |
| Research add-ons: solve-for-any, exact bound named, model and accuracy class, formula panel, Reset | Trace width solves width, current or rise. Each validity check names its bound ("up to 35 A", "Plausibility range ... not a standard"). `ResultsPanel` has `FormulaPanel`, `StepsList` and `InputsProvenance`. All six pages have `ResetButton`. The internal-layer caveat (INNER_K_CONSERVATIVE, S-018) is present. | Met (E-series has no formula panel; PV-4) |

**Exit criteria (interim check):**
- **Full `CalcResult` and quick answer with details:** met for 5 of 6 pages. The E-series page is the exception (PV-4).
- **Golden vectors and the oracle:** met.
- **Mode A/B never mixed, legacy labelled, no compliance wording:** met.
- **Self-heating:** not built (task 4).
- **Closed-form < 1 ms:** each core calculator has a 10 000-run test bounded at 1 s total. A UI-level < 1 ms test is the flaky one (PV-1).
- **Fuzz:** `fc.assert` appears in every calculator test (copper 9, ohm 6, divider 8, resistance 12, width 9, eseries 6).
- **Validators:** this report.

## 3. Spec traceability gaps
- **SPEC §Result schema, "Every calculator returns it":** `ESeries` returns plain library results. The exception is stated only in a code comment, `src/ui/calculators/e-series.vm.ts:2` ("no CalcResult ... shows no confidence rating"). See PV-4.
- **SPEC NFR, "Monte Carlo ... in a Web Worker" and task 8, "two-resistor search in worker":** `src/workers/` is empty. `eseries.test.ts:499` says "the Web Worker wrapper comes later". See PV-4.
- **SPEC NFR, headline formatting:** met. Headlines print through `format-result` with direction: width rounds up to "0.301 mm" and capacity rounds down to "1.46 A", as the calc-validator confirmed.

## 4. Standards honesty
- **Overclaiming grep.** I searched `src` (excluding tests) for `compliant|complian|production.safe|certif|guarantee|fab-ready|ready for fab|\bsafe\b`. The only claim-capable hit is `src/core/gate.ts:77`. The other hits are negations ("Not a compliance certification", `App.tsx:64`; "does not certify", `About.tsx:10`; "Nothing here certifies", `Home.tsx:8`) or code comments. `complianceGate` has no caller outside `gate.ts`.
- **Legacy labelling.** The legacy mode is labelled "legacy" in the method, title, registry entry ("(legacy IPC-2221)"), page intro ("it is not an IPC-2152 analysis") and the mandatory caution. Mode A is labelled "IPC-2152-informed estimate" and cannot be selected.
- **Data status is honest.** Trace-width confidence is always low because S-001 and S-010 are PAYWALLED. The UNVERIFIED pill and the PAYWALLED-USER-MUST-VERIFY badge are visible in the rendered DOM. Divider results become PAYWALLED when snapped (S-016).
- **Plausibility ranges are labelled.** The Ohm/power and divider ranges are labelled "Plausibility range for board-level circuits, not a standard" (rendered). The trace-resistance ranges are labelled as engineering ranges in `meta.ts`.
- **Residual:** calc F-3. The copper converter's overall status reads VERIFIED while a caution rests on S-009, which is PAYWALLED. The caution text does say it is secondhand.

## 5. Source ledger: spot-checks (retrieved 2026-10-11)

Every numeric constant I found in `src/core` maps to a ledger row:

| Constant | Ledger row |
|---|---|
| ρ = 1/58e6, α = 0.00393 | S-004 |
| μ0 = 4π×10⁻⁷ (`trace-resistance/calc.ts:49`) | S-013 |
| k 0.048/0.024 and exponents 0.44/0.725 | S-001 |
| Chart ranges | S-010 |
| 8890 kg/m³ | S-003d |
| Foil conventions | S-003 |
| Finished-copper minimums | S-009 |
| E-series tables | S-016 |
| Circuit relations | S-019 |

`check:audit` confirms that every `S-nnn` referenced in `src` exists in the ledger.

| Row | What I checked | Finding |
|---|---|---|
| S-006 | NIST SP 811 App. B.8 (nist.gov) | Confirmed. inch "2.54 E-02", mil "2.54 E-05" and ft² "9.290 304 E-02" are boldface (exact). oz/ft² "3.051 517 E-01" is not bold (rounded). lb "4.535 924 E-01" is not bold. °F is "T/K = (t/°F + 459.67)/1.8" with exact constants. This matches the ledger text, which takes lb as exact from the 1959 announcement. |
| S-009 | NCAB FAQ (ncabgroup.com) | Confirmed: inner ½/1/2 oz 11.4/24.9/55.7 µm; external Class 2 33.4/47.9/78.7 µm; Class 3 38.4/52.9/83.7 µm; "IPC-6012 detailed the acceptable minimum thickness". The status PAYWALLED-USER-MUST-VERIFY is correct (secondhand). |
| S-019 (a) | OpenStax University Physics 2, §9.5 | Confirmed: "P = IV" and "P = I^2 R = V^2/R". VERIFIED is appropriate for textbook definitions. |
| S-013 | Ness Engineering skin-depth page | Confirmed: μ0 "1.2566E-6 H/m"; copper 6.61E-3 cm at 1 MHz, 2.09E-3 cm at 10 MHz and 2.09E-4 cm at 1 GHz. These match the ledger's 66.09/20.90/2.090 µm to 3 s.f. |
| S-010 | Web search | The main range (0-35 A, ≤ 400 mil / 10.16 mm, 10-100 °C, 0.5-3 oz) is repeated by NinjaCalc, which is secondary. I could not find KiCad's separate **17.5 A internal** limit in a search. It stays a tier-4 claim, consistent with the noted CONFLICT and with calc F-1. PAYWALLED status is correct. |

No stale or unsupported row affects shipped code. S-016 (IEC 60063) and S-001/S-010 (IPC-2221) still need the human with the licensed copies; see OPEN_RISKS R-3 and the new R-27.

## 6. Architecture
- **Purity.** The ESLint core-purity rule is active (`eslint.config.js:22-36`). A grep of `src/core` (excluding tests) for window, document, navigator, globalThis, localStorage, console and imports from preact, ui or state finds nothing.
- **Determinism.** No `Date.now` or `Math.random` anywhere in `src`.
- **Units.** Internal values are SI `Quantity`. The legacy fit converts to mil² and Δ°C only at the equation (`trace-width/calc.ts:131-146`). An absolute temperature passed as ΔT is a DIMENSION error (calc report).
- **Result schema.** Every core calculator calls `assertCalcResult` before returning (for example `trace-width/calc.ts:381`) and never throws (`compute` wraps it). The E-series library is the exception (PV-4).
- **Compliance wording** comes only from `gate.ts`.
- **Minor (PV-8).** `trace-width/calc.ts:50` keeps a module-level mutable `BASIS_CACHE` Map in core. It is bounded and returns copies, so it is deterministic, but it is mutable global state under rule 5. μ0 is a local literal in `trace-resistance/calc.ts:49` rather than a ledger-tagged constant in `data/constants.ts`.

## 7. Stability and security
- **Input guards.** Each calculator has `guards.ts` and a `guards.test.ts`. The calc-validator confirmed that zero, negative, NaN, ∞, over-specified and wrong-dimension inputs are rejected. Bare numbers without a unit are refused ("Missing unit in "100"", rendered).
- **URL-state caps:**
  - `MAX_HASH_LENGTH` 8192 and `MAX_STATE_KEYS` 64 are checked before decoding (`hash.ts:271-276`).
  - Every field is capped at `MAX_FIELD_CHARS` 40 on read (`*.vm.ts fromHashState`) and on write.
  - Reserved keys are validated.
  - Observed in the browser: a 9000-character link shows "too long to be safe to load".
- **Error boundary.** `CalcPage` wraps each calculator in a keyed `ErrorBoundary`, and a lazy-load failure shows a message. The rendering is still not DOM-tested (R-19, open).
- **State versioning.** `v=1`, with a migration registry and a discard banner.
- **CSP and safe HTML:**
  - The built `dist/index.html` carries `default-src 'none'; script-src 'self'; style-src 'self'; ... connect-src 'none'`.
  - The built JS has no `style=` attribute.
  - `src` has no `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `fetch` (the only matches are test assertions forbidding them).
  - **Runtime check (closes the D-15 condition for now):** I loaded six code-split calculator routes from the built app in headless Chrome. They render with the CSP active, and Chrome logged no CSP violation. An injected `w=<img src=x onerror=alert(1)>` link rendered no `<img>` element and showed the "not recognised" notice.
- **Secrets and network.** No secrets. No runtime network: `connect-src 'none'`, and no fetch in the code.
- **Third-party code (rule 15).** No `npx`, `pip` or `uvx` in the workflow, tools or scripts. I used no `npx` at all. `.mcp.json` is unchanged and still unpinned (R-16, open).
- **Dependency audit.** `npm audit --omit=dev` reports 0 vulnerabilities.

## 8. Deployment
- **Workflow.** `deploy.yml`: `contents: read` at the top. `verify` runs on PRs and on pushes to `main`, executing every gate. The deploy job needs `pages: write` and `id-token: write`, runs on `main` only, and is in the `github-pages` environment. Actions are pinned to SHAs.
- **Base path and routing.** `base: './'` with hash routing, so the app works under the `/PCB_Calculator/` sub-path.
- **Live status:**
  - Repo `smsaad-181/PCB_Calculator` is public with `has_pages: false`, and `https://smsaad-181.github.io/PCB_Calculator/` returns 404.
  - `main` run 38122273756 (fe12593): `verify` success, `deploy` failure. That is the expected result while Pages is disabled.
  - R-23's text ("main is red at typecheck") is now out of date (PV-2).
- **Action versions** (release pages, 2026-10-11):

  | Action | Pinned | Latest | Note |
  |---|---|---|---|
  | checkout | v7.0.1 | v7.0.1 | current |
  | setup-python | v7.0.0 | v7.0.0 | current |
  | upload-pages-artifact | v5.0.0 | v5.0.0 | current |
  | deploy-pages | v5.0.1 | v5.0.1 | current |
  | setup-node | v7.0.0 | v7.1.0 (2026-10-08) | minor bump only, which Dependabot `github-actions` will propose; not a defect |

- **Rollback** is documented in RUNBOOK §Rollback. The RUNBOOK still says "Pull requests and pushes run the verify job" (V-9, open; PV-6).

## 9. Findings

| # | Severity | Finding and evidence | Owner |
|---|---|---|---|
| PV-1 | MAJOR | **`npm run test:coverage` is flaky.** `src/ui/calculators/resistor-divider.vm.test.ts:282-289` asserts a mean wall-clock time below 1 ms per `computeView` (E192 snap plus tolerance corners) under V8 coverage instrumentation. It failed 2 of 3 runs here (1.453 ms and 1.111 ms) and passed in plain `npm test` and in CI. The same pattern exists in `copper-converter.vm.test.ts:300` (< 2 ms) and `hash.regression.test.ts:44` (< 100 ms). A definition-of-done gate that fails at random erodes trust in red CI. **Fix:** use a total budget with headroom, like the core tests (N runs < 1 s), or move timing to a benchmark that is not run under coverage. | test-engineer |
| PV-2 | MAJOR | **`docs/validation/OPEN_RISKS.md` is not current.** It was last changed in 54ca676 (DOC-1), before tasks 1-3 and slice 1. Specific gaps: (a) calc F-1..F-4 are not logged; (b) G-5 still reads OPEN although the UI shows reasons, score, parsed echo and the partial-ignore banner (observed); (c) G4-c reads OPEN although 84a18f5 implements the µm thickness headline; (d) R-23 says `main` fails typecheck, but `main` `verify` is now green and only `deploy` fails (Pages disabled); (e) R-13 does not record that per-calculator zero/underflow guard tests exist; (f) nothing records that PR #3 and PR #4 were merged to `main` before validation (PV-7). | orchestrator |
| PV-3 | MINOR | **Task 2 advanced inputs are neither built nor tracked.** The missing inputs are peak/duty (RMS), adjacent plane (qualitative) and cooling (`phase-1.md` task 2). Nothing lists them as deferred, so they could be dropped silently. Mode A is correctly deferred under R-8. | orchestrator, calc-implementer |
| PV-4 | MINOR | **The E-series page departs from the result contract.** (a) It returns no `CalcResult`: no confidence and no formula panel (`e-series.vm.ts:2`), against CLAUDE.md rule 7 and exit criterion 1. It does show the S-016 PAYWALLED badge. (b) `bestPairs` runs on the main thread, while task 8 and the SPEC say a worker; `src/workers/` is empty. (c) The meaning of "nearest" is not shown in the UI (calc F-4). **Fix:** either record a "lookup utility" exception in SPEC and `calc-module-pattern`, or wrap the result; then add the worker or document the bound (E192 × 3 decades ≈ 332k pairs). | orchestrator, calc-implementer, ui-engineer |
| PV-5 | MINOR | **`package-lock.json` root header is stale.** It says `"version": "1.0.0"` and `"license": "ISC"`, and has no `engines`, while `package.json` says `0.0.0`, has no license and has `engines >=22`. Any `npm install` rewrites it (seen here, then reverted). `npm ci` tolerates the mismatch, but the lockfile does not reflect the manifest. | devops-engineer |
| PV-6 | MINOR | **RUNBOOK is inaccurate.** It says "Pull requests and pushes run the `verify` job", but only `main` pushes and PRs do (V-9 has been open since 2026-10-07). Its action-version list is dated 2026-10-06; setup-node v7.1.0 is now available. | devops-engineer |
| PV-7 | MINOR (process) | **Code reached `main` before this validation.** PR #3 and PR #4 (task 3 and circuit slice 1) were merged to `main` before the phase and pcb validators ran on 67ac40d. Once Pages is enabled, `main` deploys automatically, so code that has not been through the validators would go live. `phase-1-calc.md` is untracked. **Needs a decision:** either accept per-task merges to `main` with validation at phase end, or validate before each merge. | human, orchestrator |
| PV-8 | MINOR | **Core global state and a local constant.** `trace-width/calc.ts:50` holds a module-level mutable `BASIS_CACHE` in core (rule 5, "no globals"; bounded and deterministic, so low risk). μ0 is a local literal (`trace-resistance/calc.ts:49`) and is not in `data/constants.ts` with its S-013 tag. | calc-implementer |
| PV-9 | MINOR | **Duplicated hash-state logic.** `TraceWidth.tsx`, `TraceResistance.tsx` and `CopperConverter.tsx` copy the logic of `useCalcState` inline (hash read, rAF write and hashchange handling) instead of using the hook. Three copies of security-relevant input handling can drift apart. | ui-engineer |
| PV-10 | MINOR | **Coverage does not gate `src/state` or `src/ui`.** Coverage is limited to `src/core/**` (V-8, open). `state/hash.ts` and the view-model `fromHashState` validators, which are the URL-input attack surface, are tested but not coverage-gated. | test-engineer |
| (calc) F-1..F-4 | MINOR | I endorse all four as written in `phase-1-calc.md`: no caution for inner-layer currents above 17.5 A; `thicknessBasis` silently ignored; S-009 status not visible on the copper converter; the "nearest" metric not stated. | as in that report |

**Conditions to keep this PASS-WITH-CONDITIONS:**
- Before the next task merges: fix PV-1 and PV-2.
- Before phase closure: close or explicitly accept PV-3..PV-10 and F-1..F-4.

## 10. What I could not verify
- `npm ci` on this machine, because of the file lock described in §1. CI evidence substitutes.
- The IPC-2221B/C, IEC 60063 and IPC-6012 texts (paywalled), and KiCad's 17.5 A internal limit.
- Error-boundary rendering after a thrown render error. There is no DOM test environment (R-19).
- Lighthouse and accessibility audits, and offline load on a real device.
- Test-first ordering (rule 11). Tests and implementations land in the same commits, so the history cannot show which came first.
