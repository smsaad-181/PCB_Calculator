---
description: Build one phase end to end (research → tests → implementation → gates → validation). Usage: /build-phase <0-4>
argument-hint: <phase number 0-4>
---
You are the orchestrator for **Phase $ARGUMENTS** of the PCB Calculator Suite.

1. Read `CLAUDE.md`, `docs/PLAN.md`, `docs/SPEC.md`, `docs/phases/phase-$ARGUMENTS.md`, `docs/sources/LEDGER.md`, `docs/validation/OPEN_RISKS.md`.
2. Confirm the previous phase has three PASS/PASS-WITH-CONDITIONS reports in `docs/validation/reports/`. If not, stop and say so (Phase 0 has no predecessor).
3. Create branch `phase-$ARGUMENTS`.
4. **Research step:** delegate to `standards-researcher` for every ledger item listed under "Research first" in the phase doc. Do not proceed to code that depends on an item until it is VERIFIED or explicitly accepted as UNVERIFIED (with UI badge).
5. **Build step:** work through the task list in the phase doc in order. For each task: tests first (`test-engineer`), then implementation (`units-engine-engineer` / `calc-implementer` / `ui-engineer` / `devops-engineer` as appropriate). Commit after each green task with a conventional commit message.
6. Run the full gate: `npm run typecheck && npm run lint && npm test && npm run build && npm run check:size && npm run check:audit && python3 tools/reference/ref_calcs.py`. Fix until green. Never disable a check.
7. Run `perf-stability-auditor` for the phase.
8. Run `/validate-phase $ARGUMENTS`. Fix every BLOCKER/MAJOR, re-run validators. Maximum 3 fix cycles; after that, stop and report to the human.
9. Update `docs/validation/OPEN_RISKS.md`, tick the phase exit criteria in the phase doc, and summarize: what was built, test counts, validator verdicts, open risks, what the human must do.
10. Do not merge or push to `main` yourself; tell the human to review the PR.
