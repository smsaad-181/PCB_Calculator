# Phase 0 — Foundations

## Research first (ledger)
S-001 IPC-2221 coefficients/validity · S-002 IPC-2152 nature (chart vs equation) · S-003 oz→µm convention (1.378 mil) & density · S-004 copper ρ, α · S-005 AWG formula · S-006 SI/unit exact conversions (mil, inch, °F)

## Tasks (in order)
1. Scaffold Vite + TS strict + Preact + Vitest + fast-check + ESLint. Scripts: `dev build preview typecheck lint test check:size check:audit`. `vite.config.ts` base `./`. Hash routing.
2. `src/core/units`: dimensions, Quantity, conversions, parse/format, ΔT vs T, foil weight, AWG. Property tests.
3. `src/core/result.ts` (CalcResult), `confidence.ts` (rule-based), `gate.ts` (compliance gate), error types.
4. `src/core/solvers`: bracketed root finder (bisection + Brent), with iteration/residual reporting.
5. Data audit + compliance-phrase grep as `npm run check:audit`.
6. `check:size` script enforcing the gzip budget.
7. Minimal app shell: home, calculator registry, error boundary, UNVERIFIED badge component, about page listing standards with edition and status.
8. CI: confirm `.github/workflows/deploy.yml` works; document in `docs/RUNBOOK.md`.
9. Ledger rows S-001…S-006 researched and statuses recorded. Also research S-002/S-011 using the `twc` lead (see `standards-researcher`).
10. Build `tests/crosscheck.test.ts` runner for `tests/crosscheck/*.json` (skips `_*` files and null outputs; reports counts).

## Exit criteria
- [ ] All gates green locally and in Actions; live Pages URL loads
- [ ] Units: ≥ 95 % branch coverage, property tests pass, ΔT/T distinction proven by tests
- [ ] Oracle self-check passes in CI
- [ ] Ledger S-001..S-006 have a status; any non-VERIFIED shown as UNVERIFIED in the app
- [ ] `calc-validator`, `phase-validator`, `pcb-domain-reviewer` reports PASS/PASS-WITH-CONDITIONS
