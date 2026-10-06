---
name: source-verification
description: Rules for researching and recording authentic sources for formulas, constants, and standards, including how to handle paywalled IPC/IEC documents. Use whenever a constant, coefficient, table, or standard clause is introduced or questioned.
---
# Source verification

## Source tiers
1. Standard text or official excerpt (IPC, IEC, JEDEC)
2. Peer-reviewed paper or established textbook (Hammerstad & Jensen, Cohn, Wadell, Pozar, Bogatin: confirm each citation exists before using)
3. Manufacturer / fabricator documentation and application notes
4. Open-source implementations (KiCad docs) for **cross-check only**; never copy GPL source
5. Forums/blogs: leads only, never sufficient

## Ledger row format (`docs/sources/LEDGER.md`)
`ID | Item | Value/Formula | Source (title, edition/year, section) | URL | Retrieved | Second source | Status | Notes`
Status: `VERIFIED` (two independent sources agree, at least one tier 1-3), `UNVERIFIED`, `PAYWALLED-USER-MUST-VERIFY`, `CONFLICT`.

## Rules
- Never invent citations, DOIs, pages, or URLs. "Not found" is an acceptable answer.
- Never claim to have read a paywalled standard. State which clause/table the human must check.
- Quote at most a short phrase; otherwise paraphrase and give the equation.
- When sources disagree, record `CONFLICT` and both values. Do not average.
- Every constant in code must trace to a ledger ID in a code comment: `// LEDGER:S-001`.
- Re-verify on edition changes (IPC-2221 revision, IEC 60664-1 amendment).

## Cross-check tools are not sources
KiCad, Qucs-S, twc, rftools-mcp and web calculators can reveal bugs in our implementation but cannot verify a formula: they may share the same approximation. See `docs/sources/crosscheck-tools.md`. Agreement never moves a row to `VERIFIED`. Use their outputs as numbers (recorded in `tests/crosscheck/`), never their code.
