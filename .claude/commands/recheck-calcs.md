---
description: Quick independent numeric re-validation after any change to calculator math.
---
Invoke `calc-validator` in "quick mode": run `python3 tools/reference/ref_calcs.py`, run `npm test`, recompute every golden vector independently, and report only disagreements with expected vs actual and the owner agent. Write `docs/validation/reports/recheck-<date>.md`.
