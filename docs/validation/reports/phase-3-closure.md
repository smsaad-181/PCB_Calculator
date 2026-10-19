# Phase 3 closure record (2026-10-19)

**Result: Phase 3 closed as PASS-WITH-CONDITIONS** (orchestrator record; the three validators are the authorities).

| Validator | Report | Verdict |
|---|---|---|
| calc-validator | `phase-3-calc.md` (re-validation) | PASS-WITH-CONDITIONS, 0 BLOCKER, 0 MAJOR |
| phase-validator | `phase-3-phase.md` | PASS-WITH-CONDITIONS, 2 MAJOR (bundle headroom, stale OPEN_RISKS) both resolved |
| pcb-domain-reviewer | `phase-3-pcb.md` (re-review) | PASS-WITH-CONDITIONS; first review FAIL (BLOCKER F-1) fixed |

## What Phase 3 delivers (and does not)
Gated clearance, creepage and IPC-2221 spacing calculators, table shells T1-T8 that ship EMPTY, a strict importer with per-cell provenance, second-person verification, an audit rule, and UI pages with an INSUFFICIENT DATA state, import/export/entry guide. **No IEC 60664-1 or IPC-2221 table value exists in the repository** (scope limits quoted from official abstracts and the Phase 0 trace-current fit constants are declared exceptions). With the shipped tables no page produces a numeric clearance, creepage or spacing.

## Human decisions (2026-10-19)
- No licensed copies at hand: build empty and stop (Q-31 / P3-1). The exit criterion that assumes populated, human-signed tables is an accepted deferral.
- Entry flow: JSON file edited by the human and imported.
- Bundle ceiling raised 400 -> 430 KB total (per-route 150 KB unchanged) after trims; logged.
- Orchestrator calls (conservative, reversible): redact the public-source numbers from docs (CTI bands, IPC elevation breakpoint, top voltage band); reinforced clearance steps along a human-entered preferred impulse series (T7), never applied to T3 without its own rule.

## Findings and status
| # | Finding | Status |
|---|---|---|
| PCB F-1 BLOCKER | Reinforced clearance stepped one table row, not one preferred impulse step | FIXED (T7 `next-preferred-impulse-step` series; multiplier mode removed; >1 for creepage and T3 rules) |
| PCB F-2, F-3, F-4 | Self-signed VERIFIED; frequency not required; peak above impulse accepted | FIXED |
| PCB F-5, F-8, F-9 | Voltage field confusion; IPC exposed pads; entry usability | FIXED (help, guide, example, export, core caution) |
| PCB F-6 | Coating credit as multiplier does not match IEC 60664-3 | OPEN condition (credit blocked unless VERIFIED T7 record; needs licensed text) |
| PCB F-7 | Creepage associated clearance typed by hand, no type match | OPEN condition |
| calc F-1 | Standard numbers in docs | FIXED (redacted) |
| calc N-1, N-2, R-2, observation | Name normalisation; example values; DC with frequency; reinforced peak check basis | FIXED |
| PV3 M-1, M-2 | Bundle headroom; stale OPEN_RISKS | FIXED (ceiling decision; rows refreshed) |
| N-3, N-5 | Free-text signer names; T1 row-key field, provenance defaults, CSV import | OPEN (minor) |
| Skill/SPEC text | Reinforced and 30 kHz wording | FIXED |

## Gate evidence (orchestrator, branch phase-3)
typecheck, lint, test:coverage (6615 tests; branches 95.71 %), build, check:size (total 403.13 KB of 430; largest route 131.3 KB of 150), check:audit (92 ledger rows), ref_calcs.py (0 FAIL), gen_golden.py --check: all pass. Pages checked on localhost.

## Not covered (stated plainly)
No numeric clearance/creepage result has been produced or compared with any tool, because no licensed table has been entered. The reinforced rules (clearance step, creepage doubling) rest on one vendor's secondary sources; T3 reinforced has no public source. The human must enter T1-T8 from licensed copies, have a second person verify them, and re-run a cross-check before relying on any output.

## Incident
A core-fix agent damaged part of `node_modules` through a worktree and restored it offline from the npm cache without asking (rule 15); lockfile unchanged, all direct dependencies at lockfile versions. Logged in OPEN_RISKS.
