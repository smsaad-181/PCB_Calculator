# Product Spec (authoritative)

User objectives: **(1) PCB routing calculations, (2) trace calculations, (3) load calculations, (4) circuit values.** Plus fast, stable, GitHub Pages deployment.
Full original feature list: `MASTER_PROMPT_ORIGINAL.md`. This file corrects and tightens it.

## Corrections to the original prompt
| Original | Correction |
|---|---|
| "Closed-form relationship derived from IPC-2152" | Partly right. **The standard:** IPC-2152 (2009) is reported to present charts plus correction factors, and no secondary source reports a printed closed-form equation (ledger S-002, `PAYWALLED-USER-MUST-VERIFY`: nobody here has read the standard). **Third-party fits:** published closed-form *fits* to IPC-2152 chart data do exist. Examples are Brooks & Adam 2015 (S-011a) and others (S-011b..e), all `UNVERIFIED` or `CONFLICT`. Mode A stays labelled **"IPC-2152-informed estimate"** because any equation is a third-party fit, not the standard (see skill `ipc2152-policy`). Open policy question: may Mode A use a cited published fit? Never digitize the charts ourselves. Human decision, see `docs/validation/OPEN_RISKS.md` R-8. |
| °C/°F, oz/ft² as plain units | Separate dimensions: absolute temperature, ΔT, areal mass. |
| Altitude/frequency applied to creepage | Altitude → clearance only. Frequency > ~30 kHz → IEC 60664-4 warning. |
| IPC-2221C is the only IPC reference | Add IPC-6012 (acceptance), IPC-2141 (impedance, legacy), IPC-4562 (foil), IEC 60664-4, IEC 60063 (E-series). |
| Confidence level (subjective) | Rule-based (`confidence.ts`). |
| Fabricator capabilities implied | User-editable, date-stamped fab profiles only. |
| Section 15 truncated | Phase 4 scope to be confirmed by the human. |

## Result schema
The source of truth is `src/core/result.ts` (`CalcResult`). Skill `calc-module-pattern` documents it and must be kept in step. Every calculator returns it. Besides method, reference, formula, steps, validity checks and recommendation, it carries:
- **`results[]`** with a role and a required **`bound`**: `min-requirement`, `max-capacity`, `nominal` or `prediction`. The bound sets the print direction.
- **Per-input provenance** (`inputs[].source`: user / default / fab-profile / preset).
- **Warnings** with a severity (info / caution / warning / critical).
- **`designValues[]`:** each separates the calculated limit from the recommended design value with a stated derating. `max-limit` factors are in (0, 1], `min-requirement` factors are ≥ 1, and absolute temperatures cannot be derated.
- **`envelope[]`:** min/typ/max.
- **`fabProfile`:** with `ageDays` and `stale`; stale means older than 365 days.
- **`elements[]`:** path elements with utilisation and margin. `limitingElement` is the top element of `rankElements`.
- **`copperBasis`:** layer (required), nominal/finished/measured basis, thickness and source.
- **`exports[]`:** net-class values.
- **`dataStatus`:** derived from the ledger via `src/core/data-status.ts`. Copper calculators exclude the separately shown foil-convention row S-003.

`assertCalcResult` checks the whole schema and returns every problem without throwing. It also ties confidence to validity checks, score, reasons and fab-profile status. Every calculator runs it before returning, and its tests run it on every output.

Confidence is rule-based (`src/core/confidence.ts`, `CONFIDENCE_RULE_TEXT`). It returns a level, reasons and a numeric score:
- Factors are built from `inputs[].source` by `confidenceFactorsFromInputs`. Default and preset inputs count as defaulted; fab-profile inputs do not.
- Any out-of-range input or failed validity check forces "low".
- Defaulted assumptions are uncapped. Safety-relevant defaults weigh double, including a nominal (not finished) copper basis.

The reference calculator is `src/core/calculators/copper-converter/`. The UI shows the **quick answer first**, with details on expand, and never shows a confidence level without its reasons and score.

## Non-functional requirements
- Closed-form calc < 1 ms; self-heating solver ≤ 50 iterations; envelope via corners (≤ 6 inputs) else Monte Carlo (5-10k samples) in a Web Worker.
- Bundle ≤ 150 KB gzip JS total, code-split per calculator. Load < 1 s broadband.
- Offline capable. No runtime network calls. Hash-routed. State in URL hash (schema-versioned).
- Per-calculator error boundary. Input guards. Never display NaN.
- **Headline formatting:** every headline number is printed through `src/core/format-result.ts`. This covers results, design values, margins and utilisation. The four helpers are `formatResult`, `formatDesignValue`, `formatMargin` and `formatUtilisation`.
  - The rounding direction comes from the result's `bound`. Minimums and predictions round up, capacities and margins round down, and utilisation rounds up.
  - `accuracyClass` is required, and there is no `'nearest'` override.
  - Geometry prints as mm and mil, each rounded from SI at fab resolution.
  - Direct `formatFor`/`formatDual` is only for input echoes and non-headline text.
  - Comparisons use SI values, never printed strings.
- Every input shows its parsed echo (`describeParsed`) and parse warnings (`parseQuantityDetailed`). Fraction inputs use `parseFraction`.
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
src/core/{units,solvers,calculators,data,fab}  src/workers  src/ui  src/state
tests/  tools/reference/  docs/  .claude/  .github/
```
- `src/core/result.ts`: CalcResult, guards, design-value, envelope, element and copper-basis checks, `rankElements`, `assertCalcResult`.
- `src/core/confidence.ts`: rule-based confidence and `confidenceFactorsFromInputs`.
- `src/core/data-status.ts`: ledger status → dataStatus, with an `exclude` option.
- `src/core/format-result.ts`: bound-aware headline formatters.
- `src/core/gate.ts`: the only place compliance wording may come from.
- `src/core/units`: dimensions, quantities, field-aware parser (detailed warnings, fractions, parsed echo), directional display formatting and `formatDual`, foil conventions, AWG.
- `src/core/calculators/copper-converter/`: `meta.ts`, `guards.ts`, `calc.ts` and `calc.test.ts`. This is the reference calculator layout.
- `src/core/data`:
  - `constants.ts`: ledger-tagged physical constants; the foil/k assumptions; `copperBasisFromFoil`, `copperBasisFactors` and `FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE`.
  - `finished-copper.ts`: S-009 secondhand IPC-6012 finished-copper minimums by layer and weight, plus `finishedVsNominal`.
  - `ledger.ts` (mirror of `docs/sources/LEDGER.md`: ids and statuses, test-enforced, plus short item text shown on the About page), `fab-profiles/*.json` (date-stamped example and template fab profiles; data only, never imported by production code as defaults).
- `src/core/fab`: `profile.ts` (`FabProfile` type, validator with no defaults, staleness).
