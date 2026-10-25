# Changelog

Phase entries are taken from `docs/validation/reports/phase-*-closure.md`, the phase reports and `git log`. Test counts and bundle sizes are as recorded in those reports at the time. Kit-level entries (v1, v2) are below the phases.

## Phase 4 (2026-10-19, branch phase-4; not closed, no closure record yet)
- Added a thermal via array calculator (1-D copper-barrel conduction estimate, always low confidence, labelled not theta-JA and not a design constant) and a fusing calculator (adiabatic time-to-melt with an Onderdonk secondary check and a Preece historical reference, labelled not a fuse rating), kept separate from steady-state heating.
- Added the action-integral (A2 s) dimension, 45 golden vectors plus 14 more after validator findings, ledger rows S-040 to S-042f and S-045, and the `notChecked` flag on validity checks.
- Validator fixes: fusing end temperature, via-barrel geometry, drill or finished diameter basis, weakest-link and thermal-relief cautions, headline rules.
- Total gzip JS ceiling raised 430 to 460 KB by user decision; measured total 432.12 KB (largest route PathLoad 133.53 KB of 150 KB) at `fcf4603`.
- Deferred by user decision: theta-JA/theta-JC, exposed-pad and copper-area spreading, RF/antenna helper beyond the quarter-wave helper, twisted-pair references.
- Reports: calc PASS-WITH-CONDITIONS, phase PASS-WITH-CONDITIONS, PCB-domain PASS. Task 5 (performance audit, offline test, accessibility pass) is partial: accepted by the human 2026-10-19 as a logged partial deferral (done: no-runtime-network check on 27 routes, route-switch timings, structural a11y, Tab reach, palette contrast; not done: throttled load measurement, axe-core, screen reader, 200 % zoom/reflow, long-task trace, radio/collapsible keyboard behaviour). Offline wording: no network calls at runtime; a route works offline once its code has loaded; a reload while offline is not supported (no service worker). Docs: README, RUNBOOK and this changelog updated.

## Phase 3 (closed PASS-WITH-CONDITIONS, 2026-10-19)
- Added gated clearance, creepage and IPC-2221 spacing calculators, table shells T1 to T8 that ship EMPTY, a strict importer with per-cell provenance and second-person verification, an audit rule, and UI pages with an INSUFFICIENT DATA state, import, export and an entry guide. No IEC 60664-1 or IPC-2221 table value is in the repository.
- Fixed in validation: reinforced clearance stepping (BLOCKER), self-signed VERIFIED, frequency and peak gating, name normalisation, standard numbers removed from docs.
- Bundle ceiling raised 400 to 430 KB by user decision. Recorded: 6615 tests, total 403.13 KB gzip JS.
- Open: coating credit design (F-6), associated clearance link (F-7), free-text signer names (N-3), data-entry conveniences (N-5). Human must enter licensed table data.
- Incident: an agent damaged part of `node_modules` through a git worktree and restored it from the npm cache without asking. Lockfile unchanged.

## Phase 2 (closed PASS-WITH-CONDITIONS, 2026-10-19)
- Added controlled impedance: shared stackup model, microstrip, stripline, coax, edge-coupled differential microstrip and stripline with protocol presets, CPW and CPWG, delay, tolerances and sensitivity, approximate loss estimate, quarter-wave helper.
- Closure fixes: loss text direction, er=1 guard, thickness guard, variant-A secondary results, profile minimum notes, plain stackup errors, preset band tags.
- Recorded: 6172 tests, total 369.6 KB gzip JS.
- Cross-check kit for KiCad and Qucs-S transcalc prepared (53 cases, no tool outputs). Not run.
- Coupled-line, CPW and CPWG models rest on paywalled or conflicting sources and are badged. Fab-profile import/export not built.

## Phase 1 (closed PASS-WITH-CONDITIONS, 2026-10-15)
- Added self-heating solver, trace width and trace resistance, voltage drop and power loss, path/load with weakest link and net-class export, via electrical and thermal values, annular ring with scoped fab-profile limits, circuit values (Ohm's law, divider, E-series, feedback divider, LED resistor, RC/LC, reactance), min/typ/max envelope and sensitivity.
- Added a bundle budget check (150 KB per route, 400 KB total, user decision 2026-10-14).
- Recorded: 4458 tests, largest first-load route 129.7 KB, total 262.8 KB gzip JS.
- Cross-check kit for KiCad and twc prepared (24 cases, no tool outputs). Not run. JLCPCB example profile re-read in a browser is a human step (R-21).

## Phase 0 (2026-10-06)
- Scaffolded Vite, TypeScript strict, Preact, Vitest, ESLint, hash routing, CSP, GitHub Actions deploy workflow with actions pinned to SHAs.
- Added the dimensional units engine (separate absolute temperature, temperature difference and areal mass), the `CalcResult` schema and input guards, rule-based confidence, the compliance gate, bracketed bisection and Brent solvers, the compliance-phrase, data-table and ledger audit, a gzip size check, and the cross-check record runner.
- Added the independent Python oracle and golden vectors, and ledger rows S-001 to S-006, S-010, S-011, S-050, S-051.
- Phase validator report: PASS-WITH-CONDITIONS (662 tests at that report). Live Pages URL not observed.

## v2
- Added `docs/sources/crosscheck-tools.md`: approved reference tools, rule that tool agreement never verifies a source, GPL/no-code-copy rule, rules for running third-party code.
- Added `tests/crosscheck/` record format (README + template). No values included; records must come from real tool runs.
- `calc-validator`: new cross-check and third-party-code-safety steps.
- `standards-researcher`: special lead to find what twc's IPC-2152 methods are (S-002/S-011).
- `ipc2152-policy`, `source-verification`, `test-engineer`: updated accordingly.
- CLAUDE.md rules 13-15; phase 0/1/2 tasks and exit criteria updated; ledger S-050, S-051.
- `docs/optional/rftools-mcp.md`: rftools-mcp deliberately NOT in `.mcp.json` (unknown package name, executes locally).

## v1
Initial kit.
