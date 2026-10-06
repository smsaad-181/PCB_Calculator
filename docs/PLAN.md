# Final Plan (summary)

1. **Foundations first**: units engine, result schema, confidence, compliance gate, CI/CD. Empty app deployed to Pages.
2. **Phase 1 = daily-driver** (objectives 2, 3, 4): trace, resistance, drop, path/load with weakest link, vias, annular ring, circuit values.
3. **Phase 2 = routing** (objective 1): impedance family, delay, skew, stackup editor.
4. **Phase 3 = safety spacing**: only after the human enters and verifies licensed tables.
5. **Phase 4 = extras**.

## Quality system
- Research before code (`standards-researcher` → ledger).
- Tests before code (golden vectors from an independent Python oracle).
- Three independent validators at the end of every phase: `calc-validator`, `phase-validator`, `pcb-domain-reviewer`. Validators cannot edit source.
- CI blocks deploy unless typecheck, lint, tests, build, size budget, audit, and oracle self-check pass.

## Human-only items
See `docs/validation/OPEN_RISKS.md`.

## Process
`/build-phase N` → agents build → `/validate-phase N` → fix cycles (max 3) → human reviews PR → merge to `main` → Pages deploy.
