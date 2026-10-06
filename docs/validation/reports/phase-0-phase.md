# Phase 0 phase validation report (re-run after fix cycle 3)

Validator: phase-validator (senior-engineer and standards-auditor lens). I did not edit `src/` or `tests/` and did not run git. I made one edit outside the report: I updated the status text in `docs/validation/OPEN_RISKS.md`.
Date: 2026-10-06. Tree: F:/pcb-calc/pcb-calc-kit-v2/pcb-calc (branch phase-0).
Environment: Windows 11, Git Bash, Node v24.13.0, npm 11.6.2, Python 3.13.12. CI pins Node 22 through `.nvmrc`.
This report replaces the earlier FAIL report (D-1 BLOCKER, D-2 MAJOR, D-3..D-10 MINOR).

## Verdict: PASS-WITH-CONDITIONS

- **D-1 and D-2 are fixed.** I checked them myself against the GitHub API: all five SHAs match their tags, and every action now runs on node24.
- **All local gates are green.** I ran them myself.
- **The lint purity rules fire** on every pattern listed in D-5.
- **The CSP blocks nothing in the shipped page.** A headless Chrome run with a positive control showed this.
- **No BLOCKER or MAJOR issue remains.**
- **Phase 0 is not closed yet.** The conditions in §9 still apply. The main one is the "green in Actions; live Pages URL loads" criterion, which can only be observed after a push (R-18).

Counts: 0 BLOCKER, 0 MAJOR, 5 new MINOR (D-11..D-15), plus carried items D-7, D-8 and D-10, which are partly or wholly open.

## 1. Gates I ran myself (real output)

| Gate | Result |
|---|---|
| `npm ci` | `added 207 packages, and audited 208 packages in 3s` / `found 0 vulnerabilities`, exit 0 |
| `npm run typecheck` | `tsc --noEmit`, exit 0 |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm run test:coverage` | `Test Files 27 passed (27)` / `Tests 662 passed (662)`. All files: 99.43 / 99.25 / 100 / 99.57. `core/units`: 99.62 / **99.56 branch** / 100 / 100. Exit 0 |
| `npm run build` | `dist/index.html 1.02 kB`, `dist/assets/index-BIfCE3uz.js 22.89 kB │ gzip: 9.21 kB`, `✓ built in 168ms` |
| `npm run check:size` | `check:size: total 8.94 KB gzip JS of 150.00 KB budget (1 files)` / `check:size: PASS` |
| `npm run check:audit` | `check:audit: 0 data tables audited, 23 ledger rows checked` / `check:audit: PASS` |
| `python3 tools/reference/ref_calcs.py` | 17 `OK` lines, 0 other lines, exit 0. Last line: `OK awg_20_area_mm2 got=0.517619 expected~0.517619 (tol 0.00%)` |
| `python3 tools/reference/gen_golden.py --check` | `OK docs/golden-vectors.json matches the oracle`, exit 0 |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| Overclaim grep (`compliant|certified|guaranteed|production safe|\bsafe\b`) over non-test `src` and `dist` | Only `src/core/gate.ts:77`. `dist` has none. |

## 2. Workflow (`.github/workflows/deploy.yml`): independent verification

### 2.1 SHA to tag
I queried `https://api.github.com/repos/actions/<name>/git/ref/tags/<tag>`. Every ref is `"type": "commit"`, which means a lightweight tag, so no dereferencing is needed.

| Action (line) | Pinned SHA | API SHA for tag | Match |
|---|---|---|---|
| checkout v7.0.1 (`:24`) | 3d3c42e5aac5ba805825da76410c181273ba90b1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | yes |
| setup-node v7.0.0 (`:25`) | 820762786026740c76f36085b0efc47a31fe5020 | 820762786026740c76f36085b0efc47a31fe5020 | yes |
| setup-python v7.0.0 (`:29`) | 5fda3b95a4ea91299a34e894583c3862153e4b97 | 5fda3b95a4ea91299a34e894583c3862153e4b97 | yes |
| upload-pages-artifact v5.0.0 (`:42`) | fc324d3547104276b827a68afc52ff2a11cc49c9 | fc324d3547104276b827a68afc52ff2a11cc49c9 | yes |
| deploy-pages v5.0.1 (`:63`) | 368f82528645a54fb793d4d04e342629a3f51346 | 368f82528645a54fb793d4d04e342629a3f51346 | yes |

### 2.2 Currency and runtime
I checked `releases/latest` on the API (2026-10-06):

- checkout v7.0.1 (2026-07-20)
- setup-node v7.0.0 (2026-07-14)
- setup-python v7.0.0 (2026-07-20)
- upload-pages-artifact v5.0.0 (2026-04-10)
- deploy-pages v5.0.1 (2026-09-01)

**Each pin is the latest release.** I also read `action.yml` at each pinned SHA:

- checkout, setup-node, setup-python and deploy-pages: `using: node24`
- upload-pages-artifact: `using: composite`, which calls `actions/upload-artifact@bbbca2dd… # v7.0.0`

No action remains on a Node 20 major. configure-pages (latest v6.0.0) is no longer used.

### 2.3 Permissions
- **Workflow level:** `contents: read` (`:13-14`).
- **verify job:** inherits only `contents: read`. That is enough for everything it does:
  - checkout needs contents read.
  - The setup-* actions use the token only to download tool manifests.
  - The npm and python steps need no token.
  - upload-pages-artifact uploads through upload-artifact, which authenticates with the runner's `ACTIONS_RUNTIME_TOKEN`, not `GITHUB_TOKEN` scopes.
  - Nothing calls the Pages API any more.
- **deploy job:** `pages: write` and `id-token: write` only (`:52-54`). This is exactly the minimum the deploy-pages README states ("must at minimum have … `pages: write` / `id-token: write`").
- **deploy-pages needs no `actions: read`.** At the pinned SHA, `src/internal/api-client.js` finds the artifact through the artifact client's twirp `ListArtifacts` call (runtime token), not through the REST artifacts endpoint.

**D-1 is fixed.**

### 2.4 Compatibility of upload-pages-artifact v5 and deploy-pages v5
- deploy-pages v5.0.1 lists artifacts named `github-pages` and fails with "Ensure artifacts are uploaded with actions/upload-artifact@v4 or later" if none is found.
- upload-pages-artifact v5 uploads a tar named `github-pages` (its default `name`) through upload-artifact v7.0.0.
- **Both use the artifact v4+ backend, so they are compatible.** The release notes add no extra requirements:
  - deploy-pages v5.0.0: Node 24.
  - deploy-pages v5.0.1: polling backoff.
  - upload-pages-artifact v5.0.0: upload-artifact v7 and a new `include-hidden-files` input.

### 2.5 Behaviour changes that affect `dist/`
- **Dotfiles.** upload-pages-artifact v4.0.0 says "hidden files (specifically dotfiles) will not be included". v5 keeps that default (`include-hidden-files: false`, giving `tar --exclude=.[^/]*`).
- **`dist/` has no dotfiles**, and there is no `public/` directory:
  - `dist/index.html`
  - `dist/assets/index-BBp2Yhlh.css`
  - `dist/assets/index-BIfCE3uz.js`
- No `.nojekyll` file is needed, because Actions-sourced Pages do not run Jekyll. **No effect today.** If a dotfile is ever added (for example `.well-known/`), set `include-hidden-files: true`.
- **Symlinks.** The tar uses `--dereference --hard-dereference`. There are no symlinks in `dist/`.

### 2.6 Inputs of setup-node v7 and setup-python v7
`action.yml` at the pinned SHAs still declares `node-version-file`, `cache` ("npm, yarn, pnpm") and `python-version`. Release-note changes:

- setup-node v7: ESM migration, new cache outputs, removal of a dummy `NODE_AUTH_TOKEN`.
- setup-python v7: ESM migration, removal of the `pip-install` input. This workflow does not use that input.

**All inputs used are valid.** `.nvmrc` = `22` (Node 22 is still a supported LTS). Python `"3.13"` is valid.

### 2.7 Structure and logic
- **YAML parsing.** I could not parse the YAML with a library: none is installed, and installing one would be unreviewed third-party code (rule 15). By inspection:
  - The file is ASCII with 0 tabs and consistent two-space indentation.
  - The `${{ }}` plain scalars at `:22` and `:59` are legal in block context.
  - The first real parse will be GitHub's own.
- **Triggers and gating:**
  - On `pull_request`, `github.ref` is `refs/pull/N/merge`, so the upload (`:43`) and the deploy job (`:49`) are skipped.
  - On `push`/`workflow_dispatch` on main, `deploy` runs `needs: verify`.
- **Gate order matches RUNBOOK.**
- **Concurrency:** main runs are not cancelled mid-run, and the `pages` group never cancels a running deployment. Correct.
- **Rollback is documented** (`RUNBOOK.md:39-44`).

## 3. Exit criteria (docs/phases/phase-0.md)

| Criterion | Status | Evidence |
|---|---|---|
| All gates green locally | MET | §1 |
| Green in Actions; live Pages URL loads | **NOT OBSERVABLE HERE: condition (R-18)** | The workflow is now sound by inspection and API checks (§2). No CI run or Pages URL was observable. |
| Units ≥ 95 % branch, property tests, ΔT/T proof | MET | 99.56 % branch for `core/units`. The threshold is enforced in `vite.config.ts` (`'src/core/units/**': { branches: 95 }`). Property and ΔT tests are unchanged and pass (662/662). |
| Oracle self-check in CI | MET in config | `deploy.yml` steps run `ref_calcs.py` and `gen_golden.py --check`. Both pass locally. |
| Ledger S-001..S-006 have a status; non-VERIFIED shown UNVERIFIED | MET | Rendered `#/about` under the CSP: S-001/S-002 "⚠ UNVERIFIED (paywalled, you must verify)", S-003 "⚠ UNVERIFIED (sources conflict)", S-004/S-005/S-006 "VERIFIED". S-007 is badged "sources conflict". |
| Validator reports | PARTIAL | calc: PASS-WITH-CONDITIONS. phase: this report. pcb: not present in `docs/validation/reports/`. |

## 4. ESLint purity rules (D-5)

I sent a probe to ESLint on stdin with `--stdin-filename src/core/probe.ts`. No file was written to `src/`, and `ls src/core/probe.ts` reports that the file does not exist.

**Every intended rule fired**, as errors:

- the `preact` import, and imports from `../ui/` and `../state/`
- `Date.now`, `Math.random` and `new Date()`
- `document`, `fetch`, `window` and `globalThis.fetch`
- `process`, `performance` (plus `performance.now`) and `self`
- `XMLHttpRequest` and `WebSocket`
- `crypto` (plus `getRandomValues`)
- `setTimeout`, `location` and `localStorage`
- `any`

**D-5 is closed** for every item it listed.

These residual patterns were **not** flagged (now D-12):

- `Date()` called without `new` (reads the clock)
- `new Intl.DateTimeFormat().format()` (reads the clock)
- `(globalThis as …).Date.now()`
- `globalThis['fetch']` (computed access)
- `console.log`, `queueMicrotask`, `requestAnimationFrame`

A grep of non-test `src/core` for `\bDate\(|Intl\.|console\.|requestAnimationFrame|queueMicrotask|globalThis` finds **0 matches**, so nothing uses these today.

## 5. Spec, skill and ledger wording (D-3, D-6)

**Wording is consistent across the spec, the skills, the ledger and CLAUDE.md rule 3:**

- **`docs/SPEC.md:9`** now says:
  - The standard "is reported to present charts plus correction factors", with S-002 PAYWALLED.
  - Published closed-form *fits* exist (S-011a..e, UNVERIFIED/CONFLICT).
  - Mode A stays "IPC-2152-informed estimate".
  - Fit use is the human decision R-8.
  - The text matches LEDGER S-002 and S-011a..e.
- **`.claude/skills/ipc2152-policy/SKILL.md`** says the same thing:
  - It explicitly retires "no closed form exists".
  - It forbids shipping a fit before R-8 is decided and forbids digitizing.
  - It keeps "Never label results IPC-2152 compliant" as a prohibition.
  - Its S-011a equation (215.3 · I² · W^−1.15 · Th^−1.0) and its S-011c CONFLICT note (−0.018 vs −0.108) match `LEDGER.md:15,17`.
- **CLAUDE.md rule 3** ("chart/data based, not a closed form … Mode A labelled IPC-2152-informed estimate") is consistent as a statement about the standard.

**D-3 is closed.**

**D-6:**
- `src/core/data-status.ts` provides `dataStatusFromLedger`. It is exhaustive (a `never` check), maps `PAYWALLED-USER-MUST-VERIFY` to `PAYWALLED`, and keeps `CONFLICT`.
- `worstDataStatus` and `dataStatusForLedgerIds` throw on an empty list or an unknown id rather than defaulting to VERIFIED.
- The calc-module-pattern skill now includes `CONFLICT` and tells callers to use the function (`SKILL.md:27-34`).
- `data-status.test.ts` exists and passes.

**D-6 is closed.**

## 6. CSP (D-9)

**The policy** is in `dist/index.html`, as the first child of `<head>` and before `<meta charset>` (charset still sits within the first 1024 bytes):

`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'`

It is injected at build time only (`vite.config.ts` `cspPlugin`, `apply: 'build'`) and tested in `tests/csp-plugin.test.ts`.

**Static scan of `dist/assets/index-BIfCE3uz.js`:** 0 `eval(`, 0 `new Function`/`Function(`, 0 `setAttribute("style"`, 0 `import(`, 0 Worker/blob:/wasm, and no `https://` URLs.

- **`http://` hits:** only the W3C namespace strings.
- **`cssText` (2) and `innerHTML` (2):** inside Preact's style and `dangerouslySetInnerHTML` paths. `src/**/*.tsx` uses neither `style` props nor `dangerouslySetInnerHTML`.
- **`fetch(` (1):** Vite's modulepreload polyfill. It runs only for `<link rel=modulepreload>` elements, and the HTML has none.
- **Assets:** the favicon is a `data:` SVG (allowed by `img-src data:`), and the script and CSS are same-origin `./assets/…`.

**Runtime check:** I served `dist/` under the sub-path `/pcb-calc/` and loaded it in headless Chrome with console logging. I ran a positive control first, and then the real routes.

- **Positive control:** a copy of the page with an inline `<script>` and a `style=` attribute. It logged both `"Executing inline script violates … 'script-src 'self''"` and `"Applying inline style violates … 'style-src 'self''"`, which shows that violations are captured.
- **Real routes, all with zero CSP or console messages:**
  - Home
  - `#/about`
  - `#/calc/%E0%A4?v=9&x=%ZZ` ("Page not found")
  - `#/calc/nonexistent` ("We could not find that calculator")
- **Server log:** only index, JS and CSS requests. **No `/favicon.ico` request any more.**

**D-9 is closed.** One limit remains: `frame-ancestors` cannot be set from a meta tag and Pages cannot set headers, so clickjacking protection is not possible on Pages (part of D-15).

## 7. Disposition of the previous defects

| # | Previous sev | Disposition | Evidence |
|---|---|---|---|
| D-1 | BLOCKER | **CLOSED** | configure-pages has been removed. The verify job needs no Pages permission (§2.3). |
| D-2 | MAJOR | **CLOSED** | All actions are at their latest releases on node24 and SHA-pinned. The SHAs were checked against the API (§2.1-2.2). |
| D-3 | MINOR | **CLOSED** | §5 |
| D-4 | MINOR | **CLOSED** | `RUNBOOK.md:14-24` matches CI order and commands (test:coverage and gen_golden included). The local recipe at `:29-35` matches. `:37` still calls `python3` "often" a Store stub on Windows. That is hedged, so I accept it. |
| D-5 | MINOR | **CLOSED** (residuals moved to D-12) | §4 |
| D-6 | MINOR | **CLOSED** | §5 |
| D-7 | MINOR | **OPEN by design** (human approval) | `.mcp.json:7-13` is unchanged (`@playwright/mcp@latest`, `uvx mcp-server-fetch`). Logged as R-16. |
| D-8 | MINOR | **OPEN by design** (human approval) | There is still no DOM test environment. Logged as R-19. My headless run rendered the routes but did not trigger the error boundary. |
| D-9 | MINOR | **CLOSED** | §6 |
| D-10 | MINOR | **PARTIAL** | C-3 is confirmed and can close: `LEDGER.md:17` (S-011c) records twc's −0.018 vs smps.us −0.108, with a re-read and the commit. C-5 is still open: `tools/reference/ref_calcs.py:96` still says `"UNLEDGERED: k_Cu = 385 W/m.K has no ledger row"`, although the comment at `:94` cites S-007. This is logged as C-5 and R-10 (to close before the Phase 1 via calculator). |

## 8. New findings

| # | Sev | Finding | Evidence | Owner |
|---|---|---|---|---|
| D-11 | MINOR | `RUNBOOK.md:8` says "Optional custom domain: add a `CNAME` file in `public/`". For Actions-sourced Pages this does nothing. | GitHub Docs, "Managing a custom domain…": "If you are publishing from a custom GitHub Actions workflow, no `CNAME` file is created, and any existing `CNAME` file is ignored and is not required." The custom domain is set in Settings → Pages. | devops-engineer |
| D-12 | MINOR | The core purity lint has residual gaps (§4). There is no current usage. Also, `eslint.config.js:34,48` use `property: '*'`. ESLint's `no-restricted-properties` documents no wildcard, so these two entries are redundant. They are harmless, because `window` and `process` are already restricted globals (`:5-6`). | Probe output in §4. | devops-engineer |
| D-13 | MINOR | `OPEN_RISKS.md` R-8 still says "`ipc2152-policy` skill still says 'no closed form exists' and must be reworded". That contradicts R-17 and the current skill (`SKILL.md:9,24`). The open part of R-8 is the policy decision only. | `docs/validation/OPEN_RISKS.md:17` | standards-researcher |
| D-14 | MINOR (advisory) | `setup-node` runs with `cache: npm` (`deploy.yml:28`) in the job that builds the production Pages artifact. The setup-node v7 README recommends disabling caching "for workflows with elevated privileges". The risk here is low: the job has `contents: read` only, PR caches are ref-scoped, and `npm ci` checks lockfile integrity hashes. Either accept this explicitly in the RUNBOOK or drop the cache. | setup-node README at the pinned SHA, lines 27-28 and 207 | devops-engineer / human |
| D-15 | MINOR (forward) | The CSP has only been exercised with a single bundle. Phase 1 adds per-calculator code splitting (`registry.ts` dynamic `load`), which brings in Vite's preload helper and dynamic `import()`. These are allowed by `script-src 'self'` in principle, but the CSP runtime check must be repeated with real chunks. `frame-ancestors` is unavailable on Pages (meta-only CSP). | §6 | ui-engineer (Phase 1) |

## 9. Conditions for closing Phase 0
1. **R-18 (human).** Open the PR and observe a green `verify` run. After merge, observe a green `deploy` run and load the live URL. Pages Source must be set to "GitHub Actions" first. Until then, exit criterion 1 is unmet.
2. **pcb-domain-reviewer report.** `phase-0-pcb.md` does not yet exist.
3. **R-16 (D-7) and R-19 (D-8)** stay open pending human approval. They are acceptable for Phase 0 closure, because no calculator exists yet. R-19 must be closed before the first calculator UI ships.
4. **D-11..D-15 and C-5** are logged in OPEN_RISKS (R-20). None of them blocks.

## 10. What I could not observe
- **A GitHub Actions run, GitHub's own YAML parse, and the deployed Pages URL.** Everything in §2 comes from API, `action.yml`, README and release-note evidence, not from an executed run.
- **Playwright.** I did not have it. I used headless Chrome `--dump-dom` with `--enable-logging`, and the positive control shows it captures CSP violations. I did not reproduce the orchestrator's Playwright session.
- **Error-boundary rendering, offline behaviour after load, Lighthouse and accessibility.**
- **Commit state** (no git).

Sources:
- GitHub API tag refs: `https://api.github.com/repos/actions/{checkout,setup-node,setup-python,upload-pages-artifact,deploy-pages}/git/ref/tags/<tag>` (2026-10-06)
- [actions/upload-pages-artifact releases (v4.0.0 dotfiles, v5.0.0)](https://github.com/actions/upload-pages-artifact/releases)
- [actions/deploy-pages README, permissions and compatibility](https://github.com/actions/deploy-pages)
- [actions/setup-node v7.0.0 release](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [actions/setup-python v7.0.0 release](https://github.com/actions/setup-python/releases/tag/v7.0.0)
- [actions/checkout releases](https://github.com/actions/checkout/releases)
- [GitHub Docs: Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
