# PCB Calculator Suite — Project Memory

You are building a **professional PCB engineering calculator suite**, deployed to **GitHub Pages via GitHub Actions**.
Priorities, in order: **(1) engineering correctness, (2) traceability, (3) unit consistency, (4) safety, (5) speed & stability, (6) looks.**

## How to start
Run `/build-phase 0`. Then `/build-phase 1`, and so on. Never skip a phase gate. Read `docs/PLAN.md` first.

## Non-negotiable rules
1. **Never state a standard or constant from memory as fact.** Every constant, coefficient, table value, and formula needs an entry in `docs/sources/LEDGER.md` (source, edition, URL/citation, status). Status is one of `VERIFIED`, `UNVERIFIED`, `PAYWALLED-USER-MUST-VERIFY`. Unverified values render a visible badge in the UI.
2. **Never write "IPC compliant", "IEC compliant", or "production safe"** except through `src/core/gate.ts`, which requires all mandatory inputs and `verified: true` data. A test greps the codebase for these phrases.
3. **IPC-2152 is chart/data based, not a closed form** (verify this claim first, see ledger item S-002). Mode A is labelled **"IPC-2152-informed estimate"** until a verified data source exists. Never digitize IPC charts (copyright).
4. **Legacy IPC-2221 / KiCad-compatible mode is always labelled "legacy"** and never silently substituted for Mode A.
5. **`src/core` is pure TypeScript.** No DOM, no network, no globals, no `Date.now()`/`Math.random()` without an injected seed. Everything is deterministic and unit-testable.
6. **Units:** all internal values are SI `Quantity` objects with a dimension. Dimensions are separate for: length, absolute temperature, **temperature difference (ΔT, no offset)**, areal mass (oz/ft² foil weight), current, voltage, resistance, etc. Mixed-dimension arithmetic throws. Convert only at the UI boundary.
7. **Every calculator returns the standard `CalcResult`** (see `docs/SPEC.md` §Result schema): method, reference+edition, formula, inputs+units, assumptions, steps, results, validityChecks, warnings, confidence, recommendation.
8. **Confidence is rule-based**, not a vibe: inputs-in-validity-range, count of defaulted assumptions, method accuracy class.
9. **Fab limits are never hard-coded.** They live in user-editable, date-stamped fab profiles.
10. **Inputs are guarded:** reject NaN/±Infinity/zero/negative with a clear message. Never emit a numeric result from invalid input.
11. **Tests first for math.** Write the golden-vector/property test from `docs/golden-vectors.json` and `tools/reference/ref_calcs.py` *before* the implementation.
12. **No runtime network dependencies.** App works offline.
13. Do not copy KiCad, Qucs-S, twc or other GPL source. Use them only as numerical cross-checks (`docs/sources/crosscheck-tools.md`); implement from published papers/textbooks.
14. **Tool agreement is not verification.** Cross-check records in `tests/crosscheck/` can reveal bugs, never upgrade a ledger row to VERIFIED.
15. **Never run third-party code** (npx, pip install, cloned repos) without explicit human approval after reading it. Do not add unreviewed MCP servers to `.mcp.json`.

## Definition of done for any task
`npm run typecheck && npm run lint && npm test && npm run build && npm run check:size` all pass, and for phase ends: the validators have run and written reports with verdict `PASS`.

## Validation workflow (mandatory at the end of every phase)
Run in this order, via the `/validate-phase N` command:
1. `calc-validator` — independent numeric recomputation + source research (`docs/validation/reports/phase-N-calc.md`)
2. `phase-validator` — requirements, standards, stability, deployment (`.../phase-N-phase.md`)
3. `pcb-domain-reviewer` — practicing PCB designer lens (`.../phase-N-pcb.md`)
Any `FAIL` or `BLOCKER` → fix → re-validate. A phase is closed only when all three say `PASS` or `PASS-WITH-CONDITIONS` and the conditions are logged in `docs/validation/OPEN_RISKS.md`.
**Validators must be independent:** they may not edit `src/` or `tests/`. They read, research, recompute, and report.

## Agents (see `.claude/agents/`)
`standards-researcher`, `units-engine-engineer`, `calc-implementer`, `ui-engineer`, `test-engineer`, `devops-engineer`, `perf-stability-auditor`, `calc-validator`, `phase-validator`, `pcb-domain-reviewer`.

## Skills (see `.claude/skills/`)
`source-verification`, `calc-module-pattern`, `units-dimensional-analysis`, `golden-vector-testing`, `ipc2221-trace-width`, `ipc2152-policy`, `self-heating-solver`, `via-and-annular-ring`, `impedance-models`, `iec60664-gating`, `circuit-values`, `github-pages-deploy`, `path-load-calculator`.

## Tools
- `docs/sources/crosscheck-tools.md` and `tests/crosscheck/` — approved reference tools and recorded outputs.
- `tools/reference/ref_calcs.py` — independent Python oracle (validators use it; implementers must not copy from it into src or vice-versa).
- MCP servers in `.mcp.json` (context7 for library docs, playwright for UI checks, fetch for source pages). Claude Code's built-in WebSearch/WebFetch are used for research.

## Style
TypeScript strict, no `any`. Small pure functions. Formula metadata sits next to the code and is rendered into the UI, so displayed and implemented formulas cannot drift. Conventional commits. One phase = one branch/PR.
