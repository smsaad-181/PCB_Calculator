# Runbook

## One-time GitHub Pages setup
1. Push the repo to GitHub.
2. Settings -> Pages -> Build and deployment -> **Source: GitHub Actions** (not "Deploy from a branch").
3. Settings -> Environments -> `github-pages`: leave the default (deploys from `main` only is recommended).
4. Merge to `main`; the workflow `.github/workflows/deploy.yml` deploys. The URL is shown on the deploy job.
5. Optional custom domain: set it in Settings → Pages. A `CNAME` file in `public/` is ignored when Pages is deployed from an Actions workflow.

## Pipeline (`.github/workflows/deploy.yml`)
- Pull requests and pushes to `main` run the `verify` job (no deploy permissions); a push to any other branch runs nothing until a PR is opened. The `deploy` job runs only on `main`, after `verify` passes.
- Gate order in `verify`; any failure stops the pipeline:

| Order | Gate | Command | What it checks |
|---|---|---|---|
| 1 | Install | `npm ci` | Clean install from the committed lockfile, Node version from `.nvmrc` |
| 2 | Typecheck | `npm run typecheck` | `tsc --noEmit`, strict |
| 3 | Lint | `npm run lint` | ESLint, including the `src/core` purity rules (no DOM/network/clock/random) |
| 4 | Oracle | `python3 tools/reference/ref_calcs.py` | Independent Python reference vectors; exits non-zero on any mismatch |
| 5 | Golden check | `python3 tools/reference/gen_golden.py --check` | Committed golden vectors match the generator output |
| 6 | Test | `npm run test:coverage` | Vitest unit, golden-vector, property and audit tests, with coverage |
| 7 | Build | `npm run build` | Vite production build (`base: './'`, hash routing) |
| 8 | Size | `npm run check:size` | First-load gzip JS per calculator route <= 150 KB and total gzip JS in `dist/` <= 460 KB (docs/SPEC.md; user decisions 2026-10-14 and 2026-10-19); lists routes largest first; warns if one chunk > 50 KB |
| 9 | Audit | `npm run check:audit` | Forbidden compliance phrases only in `src/core/gate.ts` / `gate.test.ts`; every JSON data table has source, edition, ledgerIds, status, verifiedBy (and bannerRequired when not VERIFIED; fab profiles also profileDate + fabricator); every LEDGER.md row has a valid status; every `S-nnn` referenced in `src/` exists in the ledger |

- Pages artifact upload (`upload-pages-artifact`) happens in `verify` only on `main`, after all gates.

## Running the gates locally (Windows and Linux)
```
npm ci
npm run typecheck && npm run lint
python3 tools/reference/ref_calcs.py     # on Windows use: python tools/reference/ref_calcs.py  (or: py -3 ...)
python3 tools/reference/gen_golden.py --check
npm run test:coverage && npm run build && npm run check:size && npm run check:audit
```
Node: CI uses the version in `.nvmrc` (22). Local development here uses Node 24 (v24.13.0 in the Phase 4 validation). Both are supported (`engines` >=22).
On Windows, `python3` is often the Microsoft Store stub and does nothing useful; use `python` or `py -3`. CI (Linux) uses `python3`. Use Git Bash or PowerShell; the npm scripts are shell-agnostic.

## Definition of done (every task)
```
npm run typecheck && npm run lint && npm test && npm run build && npm run check:size
npm run check:audit
python3 tools/reference/ref_calcs.py          # Windows: python or py -3
python3 tools/reference/gen_golden.py --check
```
CI runs `npm run test:coverage` instead of `npm test`. At the end of a phase the three validators must also have written reports (`/validate-phase N`) with no FAIL or BLOCKER.

## Dev server and local preview
- `npm run dev` starts the Vite dev server.
- `npm run build` then `npm run preview` serves `dist/`. The repo convention is `http://localhost:4173/`, kept running on the latest build so the human can check pages. Rebuild before relying on it: preview serves whatever is in `dist/`.
- **Stop the preview before `npm ci`.** On Windows the running preview holds files in `node_modules` and `npm ci` fails. Stop preview, run `npm ci`, rebuild, restart preview.

## Performance, offline and accessibility checks
Status as of Phase 4: **no script or test for any of the three is stored in the repo.** They are manual. One scripted Playwright run against :4173 was recorded in `docs/validation/reports/phase-4-hardening.md` (orchestrator, not an independent validator; scripts not kept): 27 routes visited with same-origin requests only, slowest route switch 375 ms, structural accessibility checks passed, and what was NOT done is listed there (throttled load, contrast, screen reader, axe-core which is third-party code needing approval). The other perf report is `phase-0-perf.md`.
- **Performance.** Automated: the unit tests carry wall-clock bounds on compute time (for example 10 000 computes within 5 s for thermal via and fusing) and `npm run check:size` enforces the bundle budget. Manual: first load against the SPEC "Load < 1 s", route-switch timing and long tasks, using the browser performance tools on `dist` served at :4173.
- **Offline.** User decision 2026-10-19: the requirement is NO RUNTIME NETWORK only. Wording: no network calls at runtime; a route works offline once its code has loaded; a reload while offline is not supported (no service worker). A route whose lazy chunk was never loaded is not expected to work offline. Automated parts: no network API in `src` (lint purity rules), CSP `connect-src 'none'` (`tests/csp-plugin.test.ts`). Manual: load the built site, visit the routes while online, then go offline in the browser tools and revisit them.
- **Accessibility.** Automated: source-scan tests for labels and live regions, and a contrast test that exists only for the circuit-value styles (`circuit-choices.test.ts`; the other pages have none). Manual: keyboard walk-through, an axe-style scan, contrast and screen-reader checks of the newest pages (OPEN_RISKS P4U-17).

## Updating fab profiles and spacing tables
- **Fab profile.** There is no profile import in the UI (deferred, PV2-1b). The bundled profile is `src/core/data/fab-profiles/jlcpcb-2026-10-13.json`; a blank `template.json` shows the format (limits in `scopedLimits`, each with scope, ledger row, quote and `retrievedOn`). Fab limits are never hard-coded in code. A new or changed profile is a data change: set `profileDate` to the day you read the fabricator page, keep `status` UNVERIFIED until checked, and run `npm run check:audit` (it requires source, edition, ledgerIds, status, verifiedBy, profileDate and fabricator). Profiles older than the staleness rule show a stale banner.
- **Spacing tables T1 to T8** ship empty. Flow: download the blank template from the spacing page's table panel, fill it from your licensed copies of the standards, import the JSON in the same panel, review the status panel. Imported data stays in the browser (local storage key `pcb-calc/spacing-tables-draft@1`) and never goes into the URL hash. The importer is the only validator. Per-cell provenance is required.
- **Second-person verification.** A table can reach VERIFIED only if the file names a `verifiedBy` person who differs from every `enteredBy` and `checkedBy` name (compared with case, spaces and Unicode forms normalised). This does not prove two real people (OPEN_RISKS N-3). Re-run a cross-check with real values before relying on any output.
- Do not paste standard table values into docs, tests or ledger notes. The audit and the Phase 3 redaction policy forbid it.

## Regenerating golden vectors
`docs/golden-vectors.json` is generated, never hand edited. Add or change the independent case in `tools/reference/ref_calcs.py` first (tests first, no copying between oracle and `src`), then `python3 tools/reference/gen_golden.py` to write the file, and `python3 tools/reference/gen_golden.py --check` to confirm. Statuses are read from `docs/sources/LEDGER.md`. A failing golden vector is never fixed by loosening tolerance (see Other).

## Ledger workflow
Every constant, coefficient, table value and formula needs a row in `docs/sources/LEDGER.md` (source, edition, URL or citation, status: `VERIFIED`, `UNVERIFIED`, `PAYWALLED-USER-MUST-VERIFY`, `CONFLICT`). Mirror the id and status in `src/core/data/ledger.ts` and `ledger-status.ts`; `tests/ledger-sync.test.ts` and `npm run check:audit` fail on a mismatch or an unknown `S-nnn` in `src/`. A derived value is not VERIFIED. Tool agreement never upgrades a row (CLAUDE.md rule 14).

## Agent safety rules (incident rule)
- Never use git worktrees and never link into `node_modules`. In Phase 3 a core-fix agent damaged part of `node_modules` through a worktree and restored it from the npm cache without asking (OPEN_RISKS, Phase 3 closure record).
- Agents never run `npm install` or `npm ci`, and never run third-party code (npx, pip install, cloned repos) without explicit human approval (CLAUDE.md rule 15). The human runs `npm ci`, after stopping preview.

## Rollback
1. Identify the bad commit on `main` (`git log`).
2. `git revert <bad-commit>` (use `-m 1` for a merge commit), push via a PR or directly to `main` per branch rules.
3. The pipeline re-runs all gates and redeploys the previous good content. Do not skip gates to go faster.
4. Fast alternative: Actions tab -> a previous successful "CI and Deploy" run on `main` -> "Re-run all jobs" redeploys that commit's build. Note this redeploys that old commit's artifact only if the run is still within artifact retention; prefer the revert so `main` matches what is live.
5. Record the incident and cause in `CHANGELOG.md` / `docs/validation/OPEN_RISKS.md` if it exposes a missing gate.

## Service worker
No service worker is shipped. If one is ever added it must have a versioned precache and an update prompt; if any stale-cache risk appears, remove it rather than patch around it. Stale-cache complaints: hard-reload, then check whether a service worker was registered.

## Action versions (OPEN_RISKS R-7)
Actions are pinned to full commit SHAs with the tag in a trailing comment. Pins were set against the actions/* releases on 2026-10-06: checkout v7.0.1, setup-node v7.0.0, setup-python v7.0.0, upload-pages-artifact v5.0.0, deploy-pages v5.0.1.

**Last review 2026-10-19** (Phase 4 phase-validator, GitHub releases pages): checkout, upload-pages-artifact and deploy-pages were current. setup-node v7.1.0 was released 08 Oct and is not yet pinned, because its commit SHA is not recorded in the repository (m-7, OPEN_RISKS). Next review: when the Pages workflow first runs, and then monthly or when a Dependabot PR appears.

**Runner note (V-13).** `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19. No CI run on that image has been observed. On the first run, check that Node 22, Python 3.13 and `npm ci` behave as before. To isolate a runner problem, pin `runs-on` to the previous image in a PR and record the cause.

`configure-pages` is deliberately not used: it needs Pages read permission, and its outputs are unused because the build uses `base: './'`.

To bump a pin: look up the commit SHA of the new release tag (the repo's Releases/Tags page, or `git ls-remote https://github.com/actions/<name> refs/tags/<tag>*`; for annotated tags use the dereferenced `^{}` commit), replace the SHA in `.github/workflows/deploy.yml`, and update the trailing tag comment. Dependabot `github-actions` PRs do this weekly; they go through the same gates.

## Other
- **Dependency updates:** Dependabot PRs go through the same gates.
- **Failing golden vector:** do not loosen tolerance. Run `/recheck-calcs`, resolve against ledger sources.
