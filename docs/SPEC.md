# Product Spec (authoritative)

User objectives: **(1) PCB routing calculations, (2) trace calculations, (3) load calculations, (4) circuit values.** Plus fast, stable, GitHub Pages deployment.
Full original feature list: `MASTER_PROMPT_ORIGINAL.md`. This file corrects and tightens it.

## Corrections to the original prompt
| Original | Correction |
|---|---|
| "Closed-form relationship derived from IPC-2152" | Believed false (ledger S-002 to verify). Mode A = "IPC-2152-informed estimate" (see skill `ipc2152-policy`). |
| °C/°F, oz/ft² as plain units | Separate dimensions: absolute temperature, ΔT, areal mass. |
| Altitude/frequency applied to creepage | Altitude → clearance only. Frequency > ~30 kHz → IEC 60664-4 warning. |
| IPC-2221C is the only IPC reference | Add IPC-6012 (acceptance), IPC-2141 (impedance, legacy), IPC-4562 (foil), IEC 60664-4, IEC 60063 (E-series). |
| Confidence level (subjective) | Rule-based (`confidence.ts`). |
| Fabricator capabilities implied | User-editable, date-stamped fab profiles only. |
| Section 15 truncated | Phase 4 scope to be confirmed by the human. |

## Result schema
See skill `calc-module-pattern` (`CalcResult`). Every calculator returns it. UI shows **quick answer first**, details on expand.

## Non-functional requirements
- Closed-form calc < 1 ms; self-heating solver ≤ 50 iterations; envelope via corners (≤ 6 inputs) else Monte Carlo (5-10k samples) in a Web Worker.
- Bundle ≤ 150 KB gzip JS total, code-split per calculator. Load < 1 s broadband.
- Offline capable. No runtime network calls. Hash-routed. State in URL hash (schema-versioned).
- Per-calculator error boundary. Input guards. Never display NaN.
- Accessibility: keyboard operable, labels, contrast.

## Scope by phase
| Phase | Scope |
|---|---|
| 0 | Foundations: project scaffold, units, result schema, confidence, gate, CI/CD, empty deployed app |
| 1 | Copper converter; trace width/current (Mode B legacy + Mode A estimate); trace resistance with self-heating & skin warning; voltage drop/power; **path/load calculator**; via (electrical); annular ring; circuit values |
| 2 | Impedance (microstrip, stripline, differential, CPW/CPWG, coax), delay/skew, guided wavelength, stackup editor, tolerance envelope, protocol presets |
| 3 | IPC-2221 spacing; IEC 60664-1 clearance & creepage with gating (human-verified tables) |
| 4 | Thermal estimates (confirm scope), RF/antenna helper, twisted pair/coax references, fusing (Onderdonk/Preece) |

## Tech stack
Vite, TypeScript strict, Preact, Vitest, fast-check, ESLint. `src/core` pure. Python 3 for the independent oracle only (not shipped).

## Repo layout
```
src/core/{units,solvers,calculators,data}  src/workers  src/ui  src/state
tests/  tools/reference/  docs/  .claude/  .github/
```
