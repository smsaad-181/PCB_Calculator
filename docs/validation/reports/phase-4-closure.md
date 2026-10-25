# Phase 4 closure record (2026-10-25)

**Result: Phase 4 closed as PASS-WITH-CONDITIONS** (orchestrator record; the three validators are the authorities).

| Validator | Report | Verdict |
|---|---|---|
| calc-validator | `phase-4-calc.md` | PASS-WITH-CONDITIONS |
| pcb-domain-reviewer | `phase-4-pcb.md` (re-review) | PASS |
| phase-validator | `phase-4-phase.md` | PASS-WITH-CONDITIONS (C-1 records, done; C-2 and C-3 human, decided) |

## What Phase 4 delivers (and does not)
Thermal-via array calculator (1-D conduction estimate, not θJA) and a fusing calculator (adiabatic time to melting, optional end temperature, Onderdonk secondary, Preece historical reference; never a fuse rating or safe current). Both always land at low confidence by the rule-based score (estimate class plus CONFLICT rows); the user accepted this (P4-1). Deferred scope is listed in `docs/phases/phase-4.md` and OPEN_RISKS: θJA/θJC, exposed-pad spreading, RF helper, twisted pair/coax references, fab-profile hand-off, export, series thermal-path builder, plane-connection input, parallel vias and drill basis in the fusing via, tolerance inputs.

## Human decisions
- Task 5 hardening accepted as a logged partial deferral (H4-1).
- Offline means no runtime network only; a route works once its code has loaded; reload while offline is unsupported (H4-2).
- Total bundle ceiling raised 430 to 460 KB; per-route 150 KB unchanged.
- Scope: thermal via array plus fusing.

## Findings status
Validator findings were fixed in 2107b42 and fcf4603 (fusing end temperature, via-barrel geometry, drill/finished basis, weakest-link and thermal-relief cautions, notChecked flag, headline rules, wording). m-6: the fcf4603 src changes were reviewed only by the phase validator; no numbers changed. Records reconciliation (C-1) done in this commit.

## Gate evidence (orchestrator, branch phase-4)
typecheck, lint, test:coverage (172 files, 6906 tests; branches 95.76 %), build, check:size (432.12 KB of 460; largest route about 133.5 KB of 150), check:audit (106 ledger rows), ref_calcs.py (0 FAIL), gen_golden.py --check: all pass.

## Not covered (stated plainly)
CI on the Ubuntu runner and live GitHub Pages have not been observed. Hardening is partial (no throttled broadband run, no axe-core, no screen-reader or 200 % zoom check; see `phase-4-hardening.md`). No Phase 4 result has been compared with a measurement or a third-party tool; the specific-heat default (Q-54), the S-045 source tier, the IPC fusing text (Q-56) and the via-in-pad tenting conflict need human verification. 77 Phase 1/2 cross-check cases have not been run.
