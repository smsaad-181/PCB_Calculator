# Phase 0 phase validation report

Validator: phase-validator (senior-engineer and standards-auditor lens). I did not edit `src/` or `tests/` and did not run git.
Date: 2026-10-06. Working tree: F:/pcb-calc/pcb-calc-kit-v2/pcb-calc (`.git/HEAD` = `refs/heads/phase-0`).
Environment: Windows 11, Git Bash, Node v24.13.0, npm 11.6.2, Python 3.13.12. CI pins Node 22 through `.nvmrc`.
Inputs read: CLAUDE.md, docs/PLAN.md, docs/SPEC.md, docs/phases/phase-0.md, docs/RUNBOOK.md, docs/validation/OPEN_RISKS.md, docs/validation/reports/phase-0-calc.md (PASS-WITH-CONDITIONS), docs/validation/reports/phase-0-perf.md, docs/sources/LEDGER.md, the skills calc-module-pattern, ipc2152-policy and github-pages-deploy, and all non-test files in `src/`.

## Verdict: FAIL

The code foundation is sound:
- Every local gate is green when I run it.
- Units branch coverage is 99.56 % and the coverage threshold is enforced.
- The ΔT and T distinction is proven by tests.
- The ledger mirror is consistent, and the About page badges every non-VERIFIED row.
- No compliance wording reaches `dist/`.

The verdict is FAIL because of one BLOCKER in the deploy pipeline (D-1): on `main`, the workflow as written will very likely fail before it deploys. A second MAJOR issue (D-2) is that every pinned action targets the Node 20 runtime, which GitHub removed from hosted runners on 2026-09-23.

Both fixes are small edits to one file, owned by devops-engineer. After the fix, a PR run on `main` (or a post-merge run) must show green Actions and a live Pages URL before exit criterion 1 can count as met. Re-run only this validator after the fix. Nothing in `src/` is affected.

Counts: 1 BLOCKER, 1 MAJOR, 8 MINOR.

## 1. Gates I ran myself (real output)

| Gate | Result line |
|---|---|
| `npm ci` | `added 207 packages, and audited 208 packages in 3s` … `found 0 vulnerabilities` |
| `npm run typecheck` | `tsc --noEmit`, exit 0, no output |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm test` | `Test Files 25 passed (25)` / `Tests 646 passed (646)` |
| `npm run build` | `dist/assets/index-BIfCE3uz.js 22.89 kB │ gzip: 9.21 kB`; `✓ built in 140ms` |
| `npm run check:size` | `check:size: total 8.94 KB gzip JS of 150.00 KB budget (1 files)` / `check:size: PASS` |
| `npm run check:audit` | `check:audit: 0 data tables audited, 23 ledger rows checked` / `check:audit: PASS` |
| `python3 tools/reference/ref_calcs.py` | 17 `OK` lines and no other lines, exit 0 (last line `OK awg_20_area_mm2 got=0.517619 expected~0.517619`) |
| `python3 tools/reference/gen_golden.py --check` | `OK docs/golden-vectors.json matches the oracle` |
| `npm run test:coverage` | All files: Stmts 99.4 / Branch 99.22 / Funcs 100 / Lines 99.54. `core/units` Branch 99.56. Exit 0. |
| Threshold enforcement probe (`vitest run --coverage --coverage.thresholds.branches=99.9`) | `ERROR: Coverage for branches (99.22%) does not meet global threshold (99.9%)`, exit 1. The thresholds really do fail the run. |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| Cross-check runner (`tests/crosscheck.test.ts`) | prints `0 cross-check records`. Only `_template.json` exists, and it is skipped. No fabricated records. |

## 2. Exit criteria (docs/phases/phase-0.md)

| Criterion | Status | Evidence |
|---|---|---|
| All gates green locally | MET | §1 |
| All gates green in Actions; live Pages URL loads | **NOT MET (no evidence; D-1 predicts failure)** | No CI run or Pages URL was observable from here. The deploy path is defective (D-1, D-2). |
| Units ≥ 95 % branch coverage | MET | 99.56 % (`npm run test:coverage`). Enforced by `vite.config.ts:23-25` (`'src/core/units/**': { branches: 95 }`), and CI runs `test:coverage` (`deploy.yml:34`). |
| Property tests pass | MET | `src/core/units/properties.test.ts` has 54 `fc.assert`/`fc.property` uses. All tests pass. |
| ΔT/T distinction proven by tests | MET | `algebra.test.ts:151` "temperature vs temperature difference (proof)": "a 10 delta-degC rise is 18 delta-degF (NOT 50)", "10 degC absolute is 50 degF", "absolute and difference quantities of equal si value are different dims". Also `abs-temp.regression.test.ts:43-53`. Implementation: `dim.ts` kinds `absTemp`/`deltaT`; `quantity.ts:124-144` (T+T throws, T−T gives ΔT). |
| Oracle self-check in CI | MET in config, not observed | `deploy.yml:30-32` runs `ref_calcs.py` and `gen_golden.py --check`. |
| Ledger S-001..S-006 have a status; non-VERIFIED shown UNVERIFIED in the app | MET | See §5. Rendered About page: `S-001 … ⚠ UNVERIFIED (paywalled, you must verify)`, `S-003 … ⚠ UNVERIFIED (sources conflict)`, `S-004/S-005/S-006 … VERIFIED`. |
| Validators' reports PASS/PASS-WITH-CONDITIONS | NOT MET | calc: PASS-WITH-CONDITIONS. phase: this report, FAIL. pcb: not yet written when this report was written. |

## 3. Phase 0 tasks 1-10

| # | Task | Status | Evidence |
|---|---|---|---|
| 1 | Scaffold, scripts, base `./`, hash routing | Done | `package.json` has the scripts dev, build, preview, typecheck, lint, test, test:coverage, check:size and check:audit. `vite.config.ts:5` `base: './'`. `src/state/hash.ts` plus `useHash.ts` handle routing. Headless Chrome render of `dist/` served under the sub-path `/pcb-calc/` loads index, JS and CSS with relative URLs. |
| 2 | Units, Quantity, conversions, parse/format, ΔT vs T, foil, AWG, property tests | Done | `src/core/units/*`. Coverage is in §1. |
| 3 | result.ts, confidence.ts, gate.ts, errors | Done | `result.ts:13-26` matches the calc-module-pattern schema, with `CONFLICT` added (see D-6). `confidence.ts` is rule-based with published weights and `CONFIDENCE_RULE_TEXT`. `gate.ts` reads statuses from the frozen ledger. |
| 4 | Bracketed solvers | Done | `src/core/solvers/rootfind.ts`. Validated numerically by calc-validator (M-3 closed). |
| 5 | check:audit | Done | `tools/audit-lib.mjs`, tested in `tests/audit.test.ts`. Residual detector gaps are logged as C-2. |
| 6 | check:size | Done | `tools/check-size.mjs` (150 KB gzip budget from SPEC). |
| 7 | App shell: registry, ErrorBoundary, UNVERIFIED badge, About | Done (ErrorBoundary not exercised, D-8) | `src/ui/registry.ts` (empty REGISTRY, dynamic `load`). `components/ErrorBoundary.tsx` is per route (`App.tsx:48`, keyed) and per calculator (`CalcPage.tsx`). `components/UnverifiedBadge.tsx`. `pages/About.tsx` maps `LEDGER`. |
| 8 | CI workflow and RUNBOOK | Done with defects | `.github/workflows/deploy.yml` (D-1, D-2) and `docs/RUNBOOK.md` (D-4). Rollback is documented (`RUNBOOK.md:36-41`). |
| 9 | Ledger S-001..S-006 plus the twc lead (S-002/S-011/S-050) | Done | `docs/sources/LEDGER.md`. I spot-checked these rows (§5). |
| 10 | Cross-check runner | Done | `tests/crosscheck.test.ts`, `tests/crosscheck/runner.ts`, `adapters.ts` (empty). It skips `_*` files and null outputs and prints counts. A real value with no adapter fails by design. |

## 4. CLAUDE.md non-negotiables

- **Rule 1 (ledger for every constant). PASS.** I scanned all non-test `src/` for numeric literals. Every physical or standards constant carries a ledger tag:
  - `units-table.ts:21-25`: `INCH_M 0.0254`, `FOOT_M 0.3048`, `OUNCE_KG 0.028349523125`, `OZ_PER_FT2_KG_M2`, `KELVIN_AT_0C 273.15` are all `[S-006]`.
  - `mil = INCH_M/1000`, the `°F` 5/9 and −32 factors, and `Δ°F` 5/9 are in `ledgerIds: S006`.
  - `oz/ft2` is tagged `S006_S003`.
  - `foil.ts`: 35 (µm/oz) is tagged S-003; 1.35 (mil/oz) is tagged S-003 and labelled "unverified, secondhand"; 8890 kg/m³ is tagged S-003 plus S-003d. "1.378 mil" appears only as the display equivalent of 35 µm, tagged S-003.
  - `awg.ts:43`: 0.127e-3, 92, 36 and 39 sit under `AWG_FORMULA` (S-005, with the status read from the ledger).
  - No IPC k/exponent constant exists in `src` yet. 25.4e-6 never appears as a raw literal; it is `INCH_M/1000`.
  - The remaining literals are SI-prefix and metric definitions (`cm` 1e-2, `mm2` 1e-6, `PREFIX_SCALE`), solver tolerances, confidence weights (product rules published in `CONFIDENCE_RULE_TEXT`), and hash DoS caps. None of these is a standards constant. SI prefixes have no ledger row, which I accept as definitional (BIPM).
- **Rule 2 (compliance wording only via gate.ts). PASS.**
  - In `src`, the only claim string is `gate.ts:77` (`' compliant (per verified data: '`).
  - UI strings are negations: `App.tsx:57` "Not a compliance certification", `About.tsx:10` "does not certify compliance", `Home.tsx:8` "Nothing here certifies a design".
  - `dist/` contains no "compliant", "certified", "guaranteed" or "production safe". gate.ts has no caller and is tree-shaken out.
  - The detector's evasion gaps are already logged as C-2.
- **Rule 3 (IPC-2152). PASS for code.** There is no Mode A code yet. The doc wording is discussed under D-3.
- **Rule 4 (legacy label).** Not applicable yet: there is no IPC-2221 calculator. The gate's IPC-2221 requirement rows (S-001, S-010) are PAYWALLED, so a "compliant" label is impossible today.
- **Rule 5 (core purity). PASS, with a lint gap (D-5).**
  - A grep over non-test `src/core` for `document|window|navigator|localStorage|fetch|XMLHttpRequest|WebSocket|process.|performance.|Date.|new Date|Math.random|console.|globalThis|self.|setTimeout|crypto` found **0 matches**.
  - A lint probe (stdin as `src/core/probe.ts`) fired 10 errors: preact import, `../ui` import, `Date.now`, `Math.random`, `new Date()`, `document`, `fetch`, `window`, `globalThis.fetch`, `any`.
  - The same probe did NOT fire on `process.env`, `performance.now()`, `self.location` or `XMLHttpRequest`.
- **Rule 6 (units). PASS.**
  - The `kind` tag separates `absTemp`, `deltaT` and `arealMass`.
  - Mixed-dimension add, sub and compare throw `DimensionError`.
  - An areal mass reaches a length only through `foilThickness()`.
  - K^1 products are typed as ΔT (`quantity.ts:160-165`).
- **Rule 7 (CalcResult). PASS (schema present; no calculator yet).** `result.ts:13-26` has every field listed in calc-module-pattern. The status vocabulary drifts (D-6).
- **Rule 8 (rule-based confidence). PASS.** `confidence.ts` scores out-of-range inputs, defaulted assumptions, accuracy class and data status, with explicit weights and reasons. It is tested in `confidence.test.ts` and `confidence.regression.test.ts`.
- **Rule 9 (no hard-coded fab limits). PASS.** `src` contains no fab limit. The audit enforces `profileDate` and `fabricator` on fab profiles (fixture `fab-missing`). `data/` holds only `.gitkeep`.
- **Rule 10 (input guards). PASS at foundation level.**
  - `guardPositiveFinite` and `guardPositiveFiniteNumber` (`result.ts:46-54`) reject NaN, ±Infinity, 0 and negatives, with property tests.
  - `q()`, `fromUnit` and the algebra operations reject non-finite values.
  - `parseQuantity` never throws.
  - The zero-underflow caveat for callers is logged as R-13.
- **Rule 12 (no runtime network). PASS.**
  - `dist/` is `index.html`, one JS file and one CSS file, all referenced as `./assets/...`.
  - The only `fetch(` is Vite's modulepreload polyfill, which fetches same-origin `<link rel=modulepreload>` hrefs (none exist).
  - The only absolute URLs are the W3C namespace strings in Preact.
  - There is no service worker.
  - In the headless run, the server log shows only same-origin requests (index, JS, CSS, and Chrome's automatic `/favicon.ico`, which returned 404).
- **Rule 13/14/15 (third-party code). PASS for agent conduct, with MINOR D-7 on `.mcp.json`.**
  - twc was read as text at a pinned commit and never run. I did the same: I fetched `twc.h` and `twc.c` raw text only.
  - `tests/crosscheck/` contains no records.
  - `.mcp.json` launches `npx -y @playwright/mcp@latest` and `uvx mcp-server-fetch`, both unpinned. These were shipped by the kit, not added by an agent (CHANGELOG v2 discusses `.mcp.json` contents). Claude Code prompts the human before running them (README step 4), so I do not count this as an agent rule-15 violation. The trouble is `@latest`: the code that runs can change after the human reviewed it. Logged as D-7 and R-16.

## 5. Source ledger: mirror consistency and my own spot-checks

Mirror: `src/core/data/ledger.ts` (23 rows, frozen) matches `docs/sources/LEDGER.md`. `tests/ledger-sync.test.ts` passes, and the audit counts 23 rows. Status vocabulary in all three (markdown, TS, audit): VERIFIED, UNVERIFIED, PAYWALLED-USER-MUST-VERIFY, CONFLICT.

| Row | Ledger status | In-app (About, rendered) |
|---|---|---|
| S-001 | PAYWALLED-USER-MUST-VERIFY | ⚠ UNVERIFIED (paywalled, you must verify) |
| S-002 | PAYWALLED-USER-MUST-VERIFY | ⚠ UNVERIFIED (paywalled, you must verify) |
| S-003 | CONFLICT | ⚠ UNVERIFIED (sources conflict) |
| S-004 | VERIFIED | VERIFIED |
| S-005 | VERIFIED | VERIFIED |
| S-006 | VERIFIED | VERIFIED |

My independent spot-checks, all retrieved 2026-10-06:

1. **S-006 (NIST SP 811 App. B.8).**
   - Found, with the exact (boldface) factors marked: mil 2.54 E-05 (exact), inch 2.54 E-02 (exact), foot 3.048 E-01 (exact), ft² 9.290 304 E-02 (exact), oz/ft² 3.051 517 E-01 (rounded), °F formula (t/°F + 459.67)/1.8.
   - Matches the ledger and `units-table.ts`. CONFIRMED.
   - https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8
2. **S-004 and S-003d (NBS Handbook 100, archive.org OCR).** I downloaded the 345 535-byte OCR text and grepped it. It says: "The fundamental quantities in the international definitions are: the conductivity, 58 meter/ohm-mm2; the density, 8.89 grams/cm[3]; and the temperature coefficient, 0.00393 per °C; all at 20 °C". It also says the conductivity "is an exact whole number". CONFIRMED.
   - https://archive.org/stream/copperwiretables100unit/copperwiretables100unit_djvu.txt
3. **S-005 (same OCR).**
   - "No. 0000 is defined as 0.4600 inch and of No. 36 as 0.0050 inch. There are 38 sizes between".
   - "…=1.122 932 2".
   - Rounding "to the nearest tenth of a mil for gages 0000 through 44".
   - CONFIRMED. The formula in `awg.ts` matches.
4. **S-001 (CircuitCalculator).** CONFIRMED as a secondary source, so PAYWALLED-USER-MUST-VERIFY is the correct status. The page says:
   - "based on a curve fit to IPC-2221 (formerly IPC-D-275)"
   - internal k = 0.024 and external k = 0.048, with b = 0.44 and c = 0.725
   - "Thickness[oz]*1.378[mils/oz]"
   - limits "up to 35 Amps, up to 0.4 inches … 10 to 100 degrees C … 0.5 to 3 ounces"
   - SMPS.us independently shows the same K and exponents.
5. **S-002 (Altium, Peterson).** Quote: "there is no explicit formula that can be used to calculate the expected temperature rise in a PCB trace". The same article reproduces the SMPS.us fit. This supports the ledger's split: the standard is charts-only, and third-party fits exist. CONFIRMED.
6. **S-050 and S-011c (twc at pinned commit 308002f, raw text).**
   - `twc.h:23-24` `k_INT 0.024f` / `k_EXT 0.048f`.
   - `twc.h:66` `CONV_OZFT2_TO_MIL(x) ((x) * 1.378)`.
   - `twc.c:858` uses `110.515 … -0.871 … 0.803 … 0.868 … -0.102 … 1.129`.
   - `twc.c:857` (commented out) has `117.555 … -0.913 … 1.15 … 0.84 * pow(ΔT, -0.018) + 1.159`. SMPS.us shows `∆T^-0.108`.
   - This confirms calc-validator's m-G finding. Condition C-3 (record the difference in S-011c) is still OPEN: `LEDGER.md` S-011c does not yet mention it.

No stale or unsupported entries were found among the rows I checked. As already logged, S-007 (385 W/m·K) has no supporting source (R-10). The "Golden-vector log" first bullet ("rows stay UNVERIFIED") is a dated historical entry, superseded by the following bullet. It is not an error.

## 6. Deployment

| Item | Finding |
|---|---|
| Triggers and gating | `push: [main]`, `pull_request`, `workflow_dispatch`. Upload is gated on `github.ref == 'refs/heads/main'` (`deploy.yml:38-42`), and the `deploy` job has `needs: verify` plus the same `if` (`:45-46`). Correct. |
| Job order | npm ci → typecheck → lint → oracle → gen_golden --check → test:coverage → build → size → audit → configure-pages → upload. Correct order. |
| Permissions | Workflow level is `contents: read` (`:9-10`). The deploy job has `pages: write` and `id-token: write` (`:49-51`). **The verify job runs `configure-pages` without `pages: read` → D-1.** |
| Concurrency and timeouts | verify: `ci-${{ github.ref }}`, cancels only off main, 15 min. deploy: group `pages`, `cancel-in-progress: false`, 10 min. Good. |
| Action versions | All behind and all Node 20 → D-2. |
| `.nvmrc` 22 vs `engines >=22` | Consistent. The CI Node (22) differs from the local Node (24). Vite 8 supports both. |
| Lockfile | `package-lock.json` exists, is not ignored, and is present in `.git/index` (inspected without running git). |
| Base path and routing | `base: './'` and hash routing. **Observed:** I served `dist/` under the sub-path `/pcb-calc/` with Python `http.server`, and headless Chrome rendered Home, `#/about` (ledger table with badges), `#/calc/nonexistent` ("We could not find that calculator"), a corrupt hash `#/calc/%E0%A4?v=9&x=%ZZ` ("Page not found", no crash) and `#/__proto__` ("Page not found"). `vite preview` served index, JS and CSS with HTTP 200. |
| Service worker | None (`RUNBOOK.md:43-44`, and none in `dist`). |
| Rollback | Documented (`RUNBOOK.md:36-41`). |
| Dependabot | `.github/dependabot.yml` covers npm and github-actions weekly. It has not yet raised the action bumps, because no remote run exists. |

Console errors: Chrome's stderr log showed only a browser-level HKLM registry warning and no page errors. Headless `--dump-dom` logging does not reliably capture page `console.*`, so treat this as weak evidence.

## 7. Stability and security

- **Error boundary:** one per route (keyed on the route, so it resets on navigation) and one per calculator. The fallback shows no number and no stack. **Not exercised at runtime:** REGISTRY is empty and there is no DOM test environment (D-8).
- **Hash corruption:** handled. There are 11 hash tests, including regression tests (`hash.regression.test.ts`). Caps are 8192 characters and 64 keys. State is versioned with `v=1` and discarded on a mismatch. Observed in the browser as above.
- **Never NaN:** `assertNoNonFinite` (`result.ts:57`) exists, and the units and solvers return typed errors (perf report fuzz). There is no calculator output yet to observe.
- **Secrets:** none. `.gitignore` covers `.env*`.
- **Safe HTML:** there is no `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` in `src`. The only `innerHTML` in `dist` is Preact's internal `dangerouslySetInnerHTML` support, which is unused. There is no CSP (D-9).
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. The only runtime dependency is `preact ^11`.

## 8. Doc consistency (the ipc2152-policy question)

- **CLAUDE.md rule 3**, "IPC-2152 is chart/data based, not a closed form": this is consistent with the ledger *as a statement about the standard*. S-002 has 3 secondary sources and stays PAYWALLED. No change is needed now.
- **`.claude/skills/ipc2152-policy/SKILL.md`** does not say "no closed form exists", although R-8 says it does. It says IPC-2152 is "believed to be chart/data based … not a published closed-form". It also contains an explicit instruction: "If a published, citable equation or fit exists, update this skill and the ledger rather than keeping the claim above." The ledger was updated (S-011a..e) but the skill was not. The skill's own rules ("any equation used is a third-party curve fit; cite its origin; show its fit range") already fit the S-011a situation, so nothing in the skill is unsafe.
- **`docs/SPEC.md:9`** is the stale line. It marks the prompt's claim "Closed-form relationship derived from IPC-2152" as "Believed false". The ledger now shows that closed-form fits derived from IPC-2152 data are published (Brooks & Adam 2015).

**My judgment:** acceptable as R-8 for Phase 0 closure, because no Mode A code exists. Two changes are needed:
- The SPEC.md:9 and skill updates must land before Phase 1 task 2 (Mode A) starts.
- R-8 must be corrected: it misquotes the skill and omits SPEC.md:9.

This is D-3 (MINOR).

## 9. Defects

| # | Sev | Finding | Evidence | Owner |
|---|---|---|---|---|
| D-1 | **BLOCKER** | The `verify` job runs `actions/configure-pages` with a token that has no Pages permission, so on `main` it will very likely fail with "Get Pages site failed". Upload and deploy would then never run, so exit criterion 1 cannot be met. | `deploy.yml:9-10` sets `permissions: contents: read` for the workflow, and verify has no job-level override, so `pages: none`. `deploy.yml:38-39` runs `configure-pages@v5` inside verify. GitHub docs, "Permissions required for GitHub Apps" → "Repository permissions for Pages": `GET /repos/{owner}/{repo}/pages` needs **read**. configure-pages `src/api-client.js:38-51` calls `getPagesSite` first and throws when `enablement` is false, which is the default per `action.yml`. Anonymous `GET /repos/octocat/octocat.github.io/pages` returns 404, so the endpoint needs authentication. **Inferred from docs and source, not observed in a CI run.** | devops-engineer. Fix: add `permissions: { contents: read, pages: read }` to `verify`, or drop `configure-pages` (with `base: './'` its outputs are unused). |
| D-2 | MAJOR | All six actions are pinned to majors whose runtime is Node 20. GitHub made Node 24 the runner default on 2026-06-16 and removed Node 20 on 2026-09-23. They are also not SHA-pinned (R-7). | Each pinned `action.yml` at its tag: checkout@v4 `node20`, setup-node@v4 `node20`, setup-python@v5 `node20`, configure-pages@v5 `node20`, upload-pages-artifact@v3 composite using `upload-artifact@v4`, deploy-pages@v4 `node20`. Current majors from the release pages: checkout **v7** (node24), setup-node **v7** (node24), setup-python **v7** (node24), configure-pages **v6** (node24), upload-pages-artifact **v5** (uses upload-artifact v7.0.0), deploy-pages **v5** (node24). The dates in the release-page summaries were garbled by the fetcher, but the majors and runtimes come from the raw `action.yml` files. GitHub changelog 2025-09-19 (with later updates): "Beginning on June 16th, 2026, runners will begin using Node24 by default"; removal updated to "September 23rd, 2026". | devops-engineer. Bump to the current majors, pin full SHAs with a version comment, update `RUNBOOK.md:46-47`, close R-7. Do not adopt `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`. |
| D-3 | MINOR | `.claude/skills/ipc2152-policy/SKILL.md` and `docs/SPEC.md:9` are stale against S-002/S-011a. R-8 misquotes the skill. | §8 | standards-researcher (wording). Human decides the Mode A policy (R-8). |
| D-4 | MINOR | The RUNBOOK gate table does not match CI. It lists `npm test` where CI runs `npm run test:coverage` with thresholds. It omits `gen_golden.py --check`. The local recipe at `RUNBOOK.md:28-33` omits both. Its Windows note says `python3` is usually a store stub, but `python3` works on this machine. | `RUNBOOK.md:14-23,28-34` vs `deploy.yml:30-34` | devops-engineer |
| D-5 | MINOR | The ESLint purity rules for `src/core` do not catch `process`, `performance`, `self`, `XMLHttpRequest`, `WebSocket`, `console` or `crypto`. A probe confirmed 4 of these are not flagged. There is no current usage (the grep is clean). | `eslint.config.js:5,19-38`, plus the probe in §4 | devops-engineer |
| D-6 | MINOR | The status vocabulary is split. The ledger uses `PAYWALLED-USER-MUST-VERIFY` (`data/ledger.ts:3`) and `DataStatus` uses `PAYWALLED` (`confidence.ts:2`), with no mapping function. The calc-module-pattern skill's `dataStatus` type lacks `CONFLICT`. Phase 1 callers could map inconsistently, for example by dropping CONFLICT. | `confidence.ts:2`, `data/ledger.ts:3`, `.claude/skills/calc-module-pattern/SKILL.md` (CalcResult block) | units-engine-engineer or calc-implementer (add a single `ledgerToDataStatus()` with tests). standards-researcher updates the skill. |
| D-7 | MINOR | `.mcp.json` runs unpinned third-party packages fetched at launch (`npx -y @playwright/mcp@latest`, `uvx mcp-server-fetch`). This was kit-shipped and human-approved at the prompt, but `@latest` means the reviewed code can change silently. | `.mcp.json:7-13` | Human (approve pinned versions), devops-engineer (pin). Logged as R-16. |
| D-8 | MINOR | The error boundary has never been exercised. There is no DOM test environment, and REGISTRY is empty, so there is no failing child to render. | `src/ui/components/ErrorBoundary.tsx`; no test imports it | test-engineer (Phase 1: a render test, or a Playwright pass once a calculator exists) |
| D-9 | MINOR | There is no Content-Security-Policy. GitHub Pages cannot set headers, so a `<meta http-equiv>` CSP (`default-src 'self'`) would be the only option. There is also no favicon, so every load makes a 404 request to `/favicon.ico`. | `index.html` | ui-engineer or devops-engineer |
| D-10 | MINOR | Conditions C-3 and C-5 from calc-validator are still open in the files. S-011c does not record the −0.018 vs −0.108 transcription difference, and `ref_calcs.py:96` still says "UNLEDGERED". | `LEDGER.md` (S-011c row); `tools/reference/ref_calcs.py:96`; `twc.c:857` vs smps.us | standards-researcher, test-engineer (already logged as C-3 and C-5) |

## 10. What I could not verify

- **A GitHub Actions run and the live Pages URL.** No remote is reachable from here and git was not run. D-1 is inferred from GitHub's permission table and from the configure-pages source, not from a failed run.
- **Page-level console errors.** Headless `--dump-dom` logging is not a reliable console capture. I saw no errors, but I am not claiming there are none. Playwright MCP tools were not available to this agent.
- **Error-boundary rendering, real offline behaviour (load, then disconnect), Lighthouse and accessibility.** None were run.
- **Commit state.** I confirmed that tracked files appear in `.git/index`, but not that the working tree is committed.
- **The contents of IPC-2221B/C, IPC-2152, IPC-4562A and ASTM B258.** These are paywalled. Rows depending on them are correctly not VERIFIED.

## 11. Conditions to close Phase 0

1. Fix D-1 and D-2, then re-run this validator.
2. Observe a green `verify` run on the PR, then a green `deploy` after merge, and load the live URL (R-15).
3. Log D-3 through D-10 in OPEN_RISKS, or fix them. I added R-16 (D-7) and R-17 (D-3 correction).
4. pcb-domain-reviewer report.

Sources:
- [GitHub changelog: Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [GitHub Docs: Permissions required for GitHub Apps (Pages)](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [GitHub REST: Pages endpoints](https://docs.github.com/en/rest/pages/pages)
- Releases: [checkout](https://github.com/actions/checkout/releases), [setup-node](https://github.com/actions/setup-node/releases), [setup-python](https://github.com/actions/setup-python/releases), [configure-pages](https://github.com/actions/configure-pages/releases), [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases), [deploy-pages](https://github.com/actions/deploy-pages/releases)
- [NIST SP 811 Appendix B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8)
- [NBS Handbook 100 OCR (archive.org)](https://archive.org/stream/copperwiretables100unit/copperwiretables100unit_djvu.txt)
- [CircuitCalculator PCB trace width](https://circuitcalculator.com/wordpress/2006/01/31/pcb-trace-width-calculator/)
- [SMPS.us PCB calculator](https://www.smps.us/pcb-calculator.html)
- [Altium: Using an IPC-2152 calculator](https://resources.altium.com/p/using-ipc-2152-calculator-designing-standards)
- [twc at commit 308002f](https://github.com/ymic9963/twc/tree/308002ff79933fda6a9fb5aa86b889f76c7aedba)
