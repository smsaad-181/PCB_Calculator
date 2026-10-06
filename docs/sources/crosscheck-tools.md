# Cross-check tools policy

Cross-check tools are **other people's calculators** used to catch implementation errors in ours. They are NOT sources of truth.

## The two rules
1. **Agreement proves nothing about the physics.** If KiCad, twc and our app all use the same approximation, they agree and may all be wrong. A cross-check can find a bug in our code. It can never move a ledger row to `VERIFIED`. Only primary sources (standard, paper, textbook, fabricator document) can.
2. **Use values, not code.** GPL tools (KiCad, Qucs-S, twc, rf-tool) are read for formulas and run for outputs. Their source is never copied, translated, or pasted into `src/`. We record the numbers they produced. (Not legal advice. If in doubt, ask a lawyer.)

## Approved reference tools (all unverified by us until the ledger says otherwise)
Licenses for X-01 to X-05 checked against each repo's license file on 2026-10-06 (ledger S-051, `notes/crosscheck-licenses.md`).

| ID | Tool | License (S-051) | Use |
|---|---|---|---|
| X-01 | KiCad `pcb_calculator` (GUI or source `pcb_calculator/`) | GPL-3.0-or-later | Trace width, impedance, vias. Human runs GUI and records outputs; agents may read the formulas. **Version matters:** 9.0 stable uses IPC-2221; the master branch uses the Brooks & Adam IPC-2152 fit (ledger S-011a/b). Record the KiCad version. |
| X-02 | Qucs-S transcalc | GPL-2.0 | Microstrip/stripline/CPW impedance |
| X-03 | `ymic9963/twc` | GPL-3.0 | IPC-2221 and its IPC-2152 methods. Research done (ledger S-050): its three IPC-2152 methods are curve fits copied from NinjaCalc (A), SMPS.us (B) and Sierra Circuits (C), not equations from the standard. |
| X-04 | `ErikBuer/rf-tool` | GPL-3.0 | Hammerstad-Jensen incl. frequency effects |
| X-05 | `osaether/weeks` | MIT | Partial inductance (Weeks 1979) |
| X-06 | `rftools-mcp` (optional, see `docs/optional/rftools-mcp.md`) | MIT (verify) | Second opinion on RF/impedance/Ohm results. New, few users. |
| X-07 | University EMC web calculators (Clemson PCB-TL, Missouri S&T) | n/a | Manual spot checks only. Not reproducible, mark `obtainedBy: human`. |

Rejected: repos with no license or a missing repository (e.g. das-dias/pcb_impedance_calculator, ethan-hub26/embedcalc-mcp), KiCad board-design tools, Diode `pcb` toolchain skills.

## Safety rules for running third-party code
- Never run `npx`, `pip install`, `cargo`, `git clone && make`, or any third-party code without the human's explicit approval in this session.
- Before approval the agent must have read the code it wants to run and summarized what it does (network calls, file writes, shell execution).
- Do not install third-party code into this repo. Use a scratch directory outside the repo (e.g. `/tmp`).
- MCP servers launched through `npx` run with the user's permissions. They stay out of `.mcp.json` until reviewed.

## Recording cross-check values
Files live in `tests/crosscheck/<tool-id>-<topic>.json`, format in `tests/crosscheck/README.md`. Each record states tool, version/commit, date, who obtained it, exact inputs, exact outputs, tolerance and the reason for that tolerance.

## Interpreting disagreement
| Situation | Action |
|---|---|
| Our app ≠ tool, tool = oracle | Our bug likely. Owner: `calc-implementer`. |
| Our app = oracle ≠ tool | Tool uses a different model or constant. Document cause (e.g. different oz→µm). No code change. |
| App = oracle = tool | Implementation consistent. Physics still needs a primary source. |
| All three differ | Escalate to `standards-researcher`; ledger row → `CONFLICT`. |
