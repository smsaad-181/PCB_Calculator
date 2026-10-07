---
name: calc-module-pattern
description: Standard file layout, CalcResult schema, validation, confidence, and metadata pattern for every calculator in src/core/calculators. Use when adding or modifying any calculator.
---
# Calculator module pattern

Layout per calculator `src/core/calculators/<name>/`:
- `meta.ts`: id, title, method, reference+edition, formula (string + LaTeX-free plain), ledger IDs, validity ranges, accuracy class (`'exact'|'analytical'|'empirical'|'estimate'`), list of toleranced inputs, list of safety-relevant inputs.
- `calc.ts`: pure `compute(inputs: Inputs): CalcOutcome` (`Result<CalcResult, CalcError>`). Inputs are `Quantity`.
- `guards.ts`: domain validation returning typed errors (`CalcError`, codes `INVALID_INPUT | OUT_OF_DOMAIN | DIMENSION | NO_CONVERGENCE | INTERNAL`).
- `calc.test.ts`: golden + property tests (written first, from `docs/golden-vectors.json`).

## CalcResult (source of truth: `src/core/result.ts`)
If this block and `result.ts` ever disagree, `result.ts` wins; fix this block.
```ts
type InputSource = 'user' | 'default' | 'fab-profile' | 'preset';
type WarningSeverity = 'info' | 'caution' | 'warning' | 'critical';

interface CalcInput { name: string; value: Quantity; source: InputSource; sourceDetail?: string }
interface CalcWarning { severity: WarningSeverity; message: string; code?: string }

interface DesignValue {
  name: string;
  direction: 'max-limit' | 'min-requirement';
  calculated: Quantity;      // the calculated thermal/electrical limit
  recommended: Quantity;     // = calculated x derating.factor (checked to 1e-12 relative)
  derating: { factor: number; rationale: string };
}
interface Envelope { name: string; min: Quantity; typ: Quantity; max: Quantity; toleranceInputs: string[] }

interface CalcResult {
  method: string;            // e.g. "IPC-2221 legacy (KiCad-compatible)"
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;           // same string rendered in UI
  inputs: CalcInput[];       // every input, with provenance
  assumptions: string[];
  steps: { label: string; expr: string; value: Quantity }[];
  results: { name: string; value: Quantity; role: 'primary' | 'secondary' }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: CalcWarning[];
  confidence: { level: 'high' | 'medium' | 'low'; reasons: string[]; score: number };
  recommendation: string;
  dataStatus: 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
  designValue?: DesignValue;
  envelope?: Envelope[];
  fabProfile?: { id: string; fabricator: string; profileDate: string; status: DataStatus };
  limitingElement?: { id: string; name: string; reason: string };
}
```
There is no `defaulted` boolean any more: provenance is `inputs[].source`. Use `sourceDetail` to say which default, profile or preset (e.g. the fab profile id and field name).

## dataStatus
`dataStatus` comes from the ledger rows the calculator uses (`reference.ledgerIds`). Use `src/core/data-status.ts`; do not hand-write the mapping:
- `dataStatusForLedgerIds(ids)` returns the worst status over the ids (throws on an empty list or an unknown id; an empty list is never "VERIFIED").
- `dataStatusFromLedger(status)` maps one row: `VERIFIED` -> `'VERIFIED'`, `UNVERIFIED` -> `'UNVERIFIED'`, `PAYWALLED-USER-MUST-VERIFY` -> `'PAYWALLED'`, `CONFLICT` -> `'CONFLICT'` (sources disagree; the UI shows the badge and the calculator states which value it chose and why).
Any status other than `VERIFIED` adds to the confidence score and renders a visible badge.

## Confidence (source of truth: `src/core/confidence.ts`, rule text `CONFIDENCE_RULE_TEXT`)
Call `rateConfidence(factors)`; never compute a level by hand. Show `CONFIDENCE_RULE_TEXT`, never paraphrase it in code. Summary of the current rule:
- score = 2 x (inputs outside the validity range) + 1 x (defaulted assumptions, **uncapped**) + 2 x (`safetyRelevantDefaults`, e.g. max temperature, derating) + accuracy class (exact 0, analytical 0, empirical 1, estimate 2) + data status (VERIFIED 0, UNVERIFIED 1, PAYWALLED 2, CONFLICT 2).
- score 0 = high; 1-2 = medium; 3 or more = low.
- **Any input outside the validity range forces `low`** regardless of score.
- The UI must never show the level without `reasons` and `score`.
- Build `defaultedAssumptions` from `defaultedInputNames(inputs)` (every input whose `source` is not `'user'`), plus any defaulted non-input assumption. Open condition (calc-validator m-5): the relationship between `defaultedAssumptions` and `safetyRelevantDefaults` (disjoint or not) is not yet fixed; until it is, keep them disjoint, deduplicate, and add a test that `defaultedInputNames(inputs)` is a subset of `defaultedAssumptions` union `safetyRelevantDefaults`.

## Helpers in `result.ts`
- `guardPositiveFinite(name, qty)` / `guardPositiveFiniteNumber(name, n)`: reject NaN, ±Infinity, zero and negatives with a clear message. The parser lets `0`, `-0` and underflow (`1e-400 mm`) through as 0, so every calculator must call these (R-13).
- `defaultedInputNames(inputs)`: names of non-user inputs, in order.
- `highestWarningSeverity(warnings)`: `info < caution < warning < critical`, or `null`. Every warning must set `severity`.
- `checkDesignValue(dv)`: `max-limit` factor must be finite and in (0, 1]; `min-requirement` factor must be finite and >= 1; calculated and recommended finite, same dimension; non-empty rationale; recommended = calculated x factor. Open condition (m-2, before task 2): do not derate an absolute temperature (offset scale) multiplicatively; derate a temperature as a ΔT margin, and only derate positive values.
- `checkEnvelope(e)`: finite, same dimension, min <= typ <= max.
- `assertNoNonFinite(result)`: throws on a non-finite Quantity in inputs, steps, results, designValue, envelope. It does **not** yet check `derating.factor` or `confidence.score`, and it does not run `checkDesignValue`/`checkEnvelope` (m-4): call both checks yourself before returning.

## Rules
- Pure, deterministic, no I/O. Return errors as values (`Result<T,E>`), never NaN.
- Always separate the "calculated thermal/electrical limit" (`designValue.calculated`) from the "recommended engineering design value" (`designValue.recommended`), with a stated derating factor and rationale.
- Fab limits come only from the active `FabProfile` (`src/core/fab/profile.ts`); set `fabProfile` in the result and `source: 'fab-profile'` with `sourceDetail` naming the profile field. Never hard-code or pre-fill a fab number.
- Report the governing segment/element in `limitingElement` when a result is set by one part of a path.
- Constants come from `src/core/data/constants.ts` (each tagged with a ledger id). Foil thickness comes from `foilThickness()` with the selected convention (default `DEFAULT_FOIL_CONVENTION`); add `foilAssumptionText()` to `assumptions`. The foil convention is a **labelled assumption** with a stated spread (about 2.07 % at 1 oz), not a data conflict to be silently resolved. How it counts in confidence (one defaulted assumption vs CONFLICT data) is pending the human decision R-9 / P-2.
- Never emit compliance wording ("compliant", "production safe", etc.); only `src/core/gate.ts` may.
- Provide min/typ/max envelope support by exposing the list of toleranced inputs in `meta.ts` and filling `envelope[]`.
