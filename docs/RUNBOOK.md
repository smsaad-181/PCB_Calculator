# Runbook

## One-time GitHub Pages setup
1. Push the repo to GitHub.
2. Settings -> Pages -> Build and deployment -> **Source: GitHub Actions** (not "Deploy from a branch").
3. Settings -> Environments -> `github-pages`: leave the default (deploys from `main` only is recommended).
4. Merge to `main`; the workflow `.github/workflows/deploy.yml` deploys. The URL is shown on the deploy job.
5. Optional custom domain: add a `CNAME` file in `public/`.

## Pipeline (`.github/workflows/deploy.yml`)
- Pull requests and pushes run the `verify` job only (no deploy permissions). The `deploy` job runs only on `main`, after `verify` passes.
- Gate order in `verify`; any failure stops the pipeline:

| Order | Gate | Command | What it checks |
|---|---|---|---|
| 1 | Install | `npm ci` | Clean install from the committed lockfile, Node version from `.nvmrc` |
| 2 | Typecheck | `npm run typecheck` | `tsc --noEmit`, strict |
| 3 | Lint | `npm run lint` | ESLint, including the `src/core` purity rules (no DOM/network/clock/random) |
| 4 | Oracle | `python3 tools/reference/ref_calcs.py` | Independent Python reference vectors; exits non-zero on any mismatch |
| 5 | Test | `npm test` | Vitest unit, golden-vector, property and audit tests |
| 6 | Build | `npm run build` | Vite production build (`base: './'`, hash routing) |
| 7 | Size | `npm run check:size` | Total gzip JS in `dist/` <= 150 KB (docs/SPEC.md); warns if one chunk > 50 KB |
| 8 | Audit | `npm run check:audit` | Forbidden compliance phrases only in `src/core/gate.ts` / `gate.test.ts`; every JSON data table has source, edition, ledgerIds, status, verifiedBy (and bannerRequired when not VERIFIED; fab profiles also profileDate + fabricator); every LEDGER.md row has a valid status; every `S-nnn` referenced in `src/` exists in the ledger |

- Pages artifact upload (`configure-pages`, `upload-pages-artifact`) happens in `verify` only on `main`, after all gates.

## Running the gates locally (Windows and Linux)
```
npm ci
npm run typecheck && npm run lint
python3 tools/reference/ref_calcs.py     # on Windows use: python tools/reference/ref_calcs.py  (or: py -3 ...)
npm test && npm run build && npm run check:size && npm run check:audit
```
On Windows, `python3` is often the Microsoft Store stub and does nothing useful; use `python` or `py -3`. CI (Linux) uses `python3`. Use Git Bash or PowerShell; the npm scripts are shell-agnostic.

## Rollback
1. Identify the bad commit on `main` (`git log`).
2. `git revert <bad-commit>` (use `-m 1` for a merge commit), push via a PR or directly to `main` per branch rules.
3. The pipeline re-runs all gates and redeploys the previous good content. Do not skip gates to go faster.
4. Fast alternative: Actions tab -> a previous successful "CI and Deploy" run on `main` -> "Re-run all jobs" redeploys that commit's build. Note this redeploys that old commit's artifact only if the run is still within artifact retention; prefer the revert so `main` matches what is live.
5. Record the incident and cause in `CHANGELOG.md` / `docs/validation/OPEN_RISKS.md` if it exposes a missing gate.

## Service worker
No service worker is shipped. If one is ever added it must have a versioned precache and an update prompt; if any stale-cache risk appears, remove it rather than patch around it. Stale-cache complaints: hard-reload, then check whether a service worker was registered.

## Action versions (OPEN_RISKS R-7)
Action versions in the workflow (`actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`) are **not yet verified as current and not SHA-pinned**. Before first production deploy: check each action's GitHub releases page, update to current majors, pin to full commit SHAs (with a version comment), and close R-7.

## Other
- **Dependency updates:** Dependabot PRs go through the same gates.
- **Failing golden vector:** do not loosen tolerance. Run `/recheck-calcs`, resolve against ledger sources.
