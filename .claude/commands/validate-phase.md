---
description: Run the independent validators for a phase in order (calc → phase → pcb). Usage: /validate-phase <0-4>
argument-hint: <phase number 0-4>
---
Run validation for **Phase $ARGUMENTS**. Validators are independent and read-only on source code.

1. Invoke `calc-validator` for phase $ARGUMENTS. It must research sources on the web, recompute with `tools/reference/ref_calcs.py`/scratch scripts, and write `docs/validation/reports/phase-$ARGUMENTS-calc.md`.
2. Invoke `phase-validator`. Writes `phase-$ARGUMENTS-phase.md`.
3. Invoke `pcb-domain-reviewer`. Writes `phase-$ARGUMENTS-pcb.md`.
4. Read the three reports. Produce a consolidated table: verdict per validator, BLOCKER/MAJOR/MINOR counts, and the list of defects with owner agents.
5. If any FAIL or BLOCKER/MAJOR exists: assign fixes to the owner agents, then re-run only the validators whose findings were affected. Do not argue with validators or edit their reports.
6. A phase passes only when all three report PASS or PASS-WITH-CONDITIONS and every condition is in `docs/validation/OPEN_RISKS.md`.
