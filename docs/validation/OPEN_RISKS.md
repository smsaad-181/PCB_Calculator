# Open Risks (human-only items)

| # | Risk | Owner | Needed to close | Status |
|---|---|---|---|---|
| R-1 | IPC-2152 data source for Mode A | Human | Provide licensed data or accept "estimate" indefinitely | OPEN |
| R-2 | IEC 60664-1 tables (edition/amendment in use) | Human | Enter + sign `verifiedBy` | OPEN |
| R-3 | IPC-2221 coefficients/validity vs current revision | Human + researcher | Check clause in licensed copy | OPEN |
| R-4 | IPC-6012 annular ring acceptance by class | Human | Check licensed copy | OPEN |
| R-5 | Fabricator stackup, trace/space, drill, plating | Human | Fill fab profile JSON | OPEN |
| R-6 | Phase 4 thermal scope (prompt truncated at section 15) | Human | Confirm scope | OPEN |
| R-7 | MCP servers and action versions currency | devops-engineer | Actions: DONE 2026-10-06 (pinned to full commit SHAs at current majors; see RUNBOOK). MCP servers: see R-16 | PARTIAL (actions closed; MCP pinning open as R-16) |

## Phase 0 carry-forward (logged 2026-10-06)

| # | Risk | Owner | Needed to close | Status |
|---|---|---|---|---|
| R-8 | IPC-2152 policy wording: the standard is charts-only, but third-party closed-form fits exist (Brooks & Adam 2015, S-011a; KiCad dev branch uses one). CLAUDE.md forbids digitizing IPC charts; whether Mode A may use a cited published third-party fit is a policy/licensing call. `ipc2152-policy` skill still says "no closed form exists" and must be reworded. | Human | Decide whether Mode A may use a cited published fit; then update skill + CLAUDE.md rule 3 | OPEN |
| R-9 | Foil thickness convention is a CONFLICT (S-003): 35 µm vs 34.8 µm vs 34.29 µm (1.35 mil). Moves widths by up to ~2.07 %. Mode A fits (S-011a) use Brooks & Adam's own table (0.5 oz = 0.65 mil, 3 oz = 3.9 mil), not oz × 1.35. | Human + researcher | Pick the default convention; verify against IPC-4562A table | OPEN |
| R-10 | Copper thermal conductivity (S-007, CONFLICT): oracle uses 385 W/m·K, which no source supports (pure Cu 401; C11000 391-394). Plated via-barrel copper not researched. | Researcher + human | Choose material class for via θ; fix oracle constant and golden vector | OPEN, must close before Phase 1 via calculator |
| R-11 | Resistivity constant: exact IACS value is 1/58 µΩ·m (1.724137…e-8); 1.7241e-8 is a rounding (S-004). Oracle and any TS constant should use 1/58e6 or label the rounding. | calc-implementer | Use exact value in Phase 1; regenerate golden vectors | OPEN, must close before Phase 1 |
| R-12 | S-050 only re-checked the k/ΔT/oz constants at pinned twc commit 308002f; Methods A-C constants not re-checked. Note (2026-10-06, C-3): twc.c has a commented-out copy of the SMPS.us website formula in `calcs_IPC2152_B`. It has exponent −0.018 where the smps.us page has −0.108, a transcription difference in twc (re-read twice at 308002f; smps.us re-read twice). Do not use that commented line for any cross-check. S-011c's "website set" is taken from the smps.us page. | Researcher | Re-read before any tests/crosscheck record | OPEN |
| R-13 | Calculators must reject zero explicitly: parseQuantity accepts "1e-400 mm" and "-0 mm" as 0 (perf m-4). Callers use guardPositiveFinite. | calc-implementer | Test in each Phase 1 calculator | OPEN |
| R-14 | Phase 1 self-heating caller must pass maxIter ≤ 50 and check `converged`/`fx` (a sign discontinuity returns ok with converged 'bracket'). Units table has no K/W or Ω·m entries (format falls back to SI exponents). | calc-implementer / units-engine-engineer | Add units + caller tests in Phase 1 | OPEN |
| R-15 | Not observed in a browser/live: error boundary rendering, offline load, Lighthouse, live Pages URL. `.nvmrc` is 22, local Node is 24: CI run not yet observed. | Human / devops | Open the PR; confirm Actions green and Pages loads | OPEN |

### Phase 0 validator conditions (calc-validator, fix cycle 2: PASS-WITH-CONDITIONS)

| # | Condition | Owner | Needed to close | Status |
|---|---|---|---|---|
| C-1 | Gate residual (m-B): `complianceGateWith` is exported and accepts a caller-built ledger; mandatory input names are whatever the caller declares (`{x:true}` passes). `LEDGER` rows are now frozen (done). No calculator calls the gate in Phase 0. | calc-implementer + test-engineer | Before the FIRST gate caller (Phase 3): per-standard required-input lists, make `complianceGateWith` test-only | OPEN |
| C-2 | Audit residual (m-C): the compliance-wording check is a tripwire, not proof. 33 of 39 probe evasions pass (e.g. "IPC-2221 compliance: PASS", "satisfied IPC-2221", "ready for fabrication", "certifies", string concatenation, escapes, homoglyphs, claims split across lines). Reviewers must read result/label text in PRs. | devops-engineer / human | Accept as known limitation, or add a runtime check on rendered output in Phase 1 UI tests | OPEN (accepted for Phase 0) |
| C-3 | S-011c: twc's commented-out SMPS.us line (`twc.c:857`) has exponent −0.018 where the smps.us page shows −0.108; the ledger presents twc's line as "the website set". Record the transcription difference in S-011c and R-12. Done 2026-10-06 (standards-researcher): recorded in LEDGER S-011c, R-12 and notes/ipc2152.md. The line number is uncertain (validator 857, fetcher about 1054 or 1108); locate the line by its text. | standards-researcher | Ledger note; validator to confirm | OPEN (ledger note added, awaiting validator) |
| C-4 | Solver caller rules (extends R-14): never bracket a positive quantity starting from 0 (the absolute floor then applies and tiny roots lose accuracy: x − 1e-15 on [0,1] is 11 % off with ok:true); a `residual` result with fx = 0 can come from underflow far from the root; check `converged` and `fx`. | calc-implementer | Encode in each Phase 1 caller + test | OPEN |
| C-5 | Housekeeping: oracle note and golden-vectors.json still say the via thermal conductivity is "UNLEDGERED" although S-007 exists (fails safe; R-10). | test-engineer | Update the vector's ledger ids when R-10 is resolved | OPEN |

### Phase 0 phase-validator additions (2026-10-06, verdict FAIL pending D-1/D-2; see reports/phase-0-phase.md)

| # | Risk | Owner | Needed to close | Status |
|---|---|---|---|---|
| R-16 | `.mcp.json` launches unpinned third-party code fetched at start-up (`npx -y @playwright/mcp@latest`, `uvx mcp-server-fetch`). Kit-shipped and approved at the Claude Code prompt, but `@latest` lets reviewed code change silently (CLAUDE.md rule 15). | Human (approve) + devops-engineer (pin) | Pin exact versions, review once, re-approve | OPEN |
| R-17 | R-8 correction: the `ipc2152-policy` skill does not say "no closed form exists"; it says the standard is "believed" chart-based and itself instructs an update once a citable fit exists (S-011a now exists). `docs/SPEC.md:9` ("Closed-form relationship derived from IPC-2152: believed false") is also stale. CLAUDE.md rule 3 is still accurate as a statement about the standard itself. Wording done 2026-10-06 (standards-researcher): `ipc2152-policy` skill and SPEC.md:9 now say the standard publishes charts (S-002, paywalled), the equations are third-party fits (S-011a..e), and using a fit needs the human decision in R-8. The R-8 policy decision itself remains open. | standards-researcher (wording) + human (Mode A policy, R-8) | Update skill + SPEC.md:9 before Phase 1 task 2 starts | OPEN (wording done; awaiting validator + R-8) |
| R-18 | Phase 0 exit criterion "green in Actions; live Pages URL loads" has no evidence. The workflow defects D-1 (verify job lacks `pages: read` for configure-pages) and D-2 (all actions on Node 20 majors; Node 20 was removed from hosted runners 2026-09-23) must be fixed first. Extends R-7 and R-15. | devops-engineer, then human | D-1/D-2 fixed 2026-10-06 (configure-pages removed; actions pinned at current majors). Still needed from the human: open the PR, observe a green run, merge, confirm the deploy and that the URL loads (Settings → Pages → Source: GitHub Actions first) | OPEN (human step) |
| R-19 | The error boundary and page rendering are unit-tested only for pure logic; there is no DOM test environment. Adding `happy-dom` + `@testing-library/preact` is a new dev dependency and needs human approval (phase-validator D-8). | Human + test-engineer | Approve the dependency, then add error-boundary and useHash tests | OPEN |
