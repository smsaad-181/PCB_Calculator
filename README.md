# PCB Calculator Suite

Accuracy-first PCB engineering calculators with formula traceability, a source ledger, and a phased, validator-gated build. It is a static, hash-routed web app deployed to GitHub Pages. It has no runtime network calls.

Every constant and formula has a row in `docs/sources/LEDGER.md`. Results that depend on unverified, conflicting or paywalled data show a visible badge. Treat every number as an estimate to check against your fabricator and your standards, not as a sign-off.

## What is in the app

Statuses below come from the validation reports in `docs/validation/reports/`. Each calculator page shows its method, formula, inputs, assumptions, steps, validity checks, warnings, confidence and the reasons for it.

- **Trace width and current.** IPC-2221 style, always labelled "legacy". Mode A is labelled "IPC-2152-informed estimate". IPC-2152 is chart based and the charts are not digitised.
- **Self-heating.** Solver with resistance coupled to temperature, and a user-supplied thermal resistance.
- **Trace resistance, voltage drop and power loss, path/load** (weakest link, per-element limits, net-class export).
- **Vias and annular ring.** Via electrical and thermal values and annular ring, with fab-profile limits.
- **Circuit values.** Ohm's law, resistor divider, E-series search, feedback divider, LED resistor, RC/LC, reactance.
- **Copper converter** (foil weight and thickness).
- **Controlled impedance.** Microstrip, stripline, coax, edge-coupled differential pairs, CPW and CPWG, tolerances and sensitivity, an approximate loss estimate and a quarter-wave helper. Several models rest on paywalled or conflicting sources and are badged.
- **Thermal via array (Phase 4).** A 1-D copper-barrel conduction estimate. Low confidence. It is not theta-JA and not a design constant, and it usually, but not always, underestimates the real thermal resistance.
- **Fusing (Phase 4).** An adiabatic time-to-melt estimate with an Onderdonk secondary check. Low confidence. It is not a fuse rating and not a safe current, and it is separate from steady-state heating.
- **Spacing (Phase 3).** Clearance, creepage and IPC spacing pages. **The data tables ship EMPTY.** No IEC 60664-1 or IPC-2221 table value is in this repository. Until you import values from your own licensed copies, every spacing page shows INSUFFICIENT DATA and produces no number. See the RUNBOOK for the import flow.

## What is not built (deferred)

Decided by the user on 2026-10-19 and logged in `docs/validation/OPEN_RISKS.md`:

- theta-JA and theta-JC estimates
- exposed-pad and copper-area spreading models
- RF/antenna helper (only the Phase 2 quarter-wave helper exists, which computes no antenna length)
- twisted-pair references (coax impedance exists from Phase 2)
- spacing carry-over features: coating credit as designed (F-6), a link from the creepage page to the clearance result (F-7), a T1 row-key definition field, table-level provenance defaults and a CSV importer (N-5), and a net-class style export of spacing results
- fab-profile import/export in the UI (only the bundled JLCPCB example profile and a blank template exist)
- thermal-via items: hole-to-hole check, series thermal path, fill material table, tolerance envelope

## No compliance claims

The app never says "IPC compliant", "IEC compliant" or "production safe". Those phrases are allowed only in `src/core/gate.ts`, which needs every mandatory input and verified data. `npm run check:audit` and a test grep the codebase for them.

## Run locally

Use npm scripts only.

```
npm ci
npm run dev        # development server
npm run build
npm run preview    # serves dist; the repo convention is http://localhost:4173
npm run typecheck
npm run lint
npm test
npm run check:size
npm run check:audit
```

The Python reference oracle and golden-vector check are run in CI and are listed in `docs/RUNBOOK.md`, which also has the full definition-of-done list. Node is pinned in `.nvmrc` (22).

## Bundle budget

Both limits are user decisions and are enforced by `npm run check:size`:

- 150 KB gzip first-load JS per calculator route.
- 460 KB gzip JS in total. History: 400 KB (2026-10-14), 430 KB (2026-10-19, Phase 3), 460 KB (2026-10-19, Phase 4).

## Deployment

`.github/workflows/deploy.yml`: pull requests run the gates only. A push to `main` deploys to GitHub Pages only after every gate passes. **The repository owner must enable Pages** (Settings, Pages, Source: GitHub Actions). Until then the deploy job cannot publish. The live URL has not been observed by any agent (R-15 in `docs/validation/OPEN_RISKS.md`). Rollback is in `docs/RUNBOOK.md`.

## Validation status (honest)

- Phases 0 to 3 are closed as PASS-WITH-CONDITIONS. Phase 4 has calc, phase and PCB-domain reports (all PASS-WITH-CONDITIONS); there is no Phase 4 closure record yet, and task 5 (performance audit, offline test, accessibility pass) is not done. Conditions and open decisions are in `docs/validation/OPEN_RISKS.md`.
- **Tool cross-checks have not been run.** 77 cases are prepared (24 for KiCad and twc, 53 for KiCad and Qucs-S transcalc); all tool outputs are null. Tool agreement would not verify a source anyway.
- IPC and IEC standards are paywalled and have not been read by this project. Anything depending on them is marked `PAYWALLED-USER-MUST-VERIFY` or `UNVERIFIED`.
- No spacing result has ever been produced or compared with any tool, because no licensed table has been entered.
- No agent has checked the pages in a real browser with a keyboard or screen reader. The human checks pages on localhost:4173 (P4U-17).
- CI on the Ubuntu 26 runner and the live Pages URL have not been observed (V-13, R-15).

## Using this kit with Claude Code

1. Unzip, `cd pcb-calc`, `git init`, create a GitHub repo, add it as `origin`.
2. In GitHub: Settings, Pages, Source: GitHub Actions.
3. Start Claude Code in this folder: `claude`. Approve the project MCP servers (see `.mcp.json`).
4. `/build-phase N`, then `/validate-phase N`. Read the reports in `docs/validation/reports/`.
5. Things only you can close are in `docs/validation/OPEN_RISKS.md` (paywalled IPC/IEC documents, your fabricator's stackup, spacing table data).

See `docs/PLAN.md` for the plan, `docs/SPEC.md` for the product spec, and `CHANGELOG.md`.
