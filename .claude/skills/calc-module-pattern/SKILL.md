---
name: calc-module-pattern
description: Standard file layout, CalcResult schema, validation, confidence, and metadata pattern for every calculator in src/core/calculators. Use when adding or modifying any calculator.
---
# Calculator module pattern

Last synced with the code at commit 51f3f4d (after 571a9b8). If this file and `src/core/result.ts`, `confidence.ts`, `data-status.ts` or `data/constants.ts` ever disagree, the code wins; fix this file.

## Reference implementation: `src/core/calculators/copper-converter/`
Copy its layout and habits.
- `meta.ts`: one `meta` object with `id`, `title`, `method`, `reference {standard, edition, ledgerIds}`, `formula` (plain text), `ledgerIds`, `validity` (plausibility ranges), `accuracyClass` (`'exact' | 'analytical' | 'empirical' | 'estimate'`) and `toleranceInputs`. Add safety-relevant input names here when the calculator has any.
- `guards.ts`: `validate(raw: unknown): Result<ValidInputs, CalcError>`.
  - It checks the shape, the dimension (`DIMENSION`), and NaN / ±Infinity / zero / negative (`INVALID_INPUT`).
  - It checks enums (`layer` must be exactly `'outer'` or `'inner'` and is never defaulted) and cross-field rules (exactly one of weight or thickness; plating is outer only).
  - Unit-slip limits return `OUT_OF_DOMAIN` (plating above 200 µm).
  - It never throws.
- `calc.ts`: `compute(inputs: Inputs): CalcOutcome` (`Result<CalcResult, CalcError>`).
  - It wraps the whole build in `try/catch`, so it **never throws**; errors are values.
  - It ends with `assertCalcResult(result)`. If that fails it returns `{ok:false, error:{code:'INTERNAL'}}` and never a malformed result.
  - Results use `meta.formula`, `meta.method` and `meta.reference` directly. The displayed formula and the implemented formula therefore come from one string and cannot drift.
  - Static data (convention spread, `dataStatus`) is computed once at module load.
- `calc.test.ts`: golden vectors from `docs/golden-vectors.json` written first. It also has property tests, error-value tests (each bad input returns an error and does not throw), a compliance-wording grep, and a performance sanity test (10 000 computes < 1 s, i.e. 100 µs each, 10x tighter than the SPEC's 1 ms so it survives coverage instrumentation).
- **Plausibility ranges are validity checks, not standards.** The converter pushes `validityChecks[]` entries ("weight in common range 0.25-10 oz/ft2", detail says "not a standard"). On failure it also pushes a structured `outOfRange` entry `{name, value, bound}`, which forces confidence low.
- Error codes: `INVALID_INPUT | OUT_OF_DOMAIN | DIMENSION | NO_CONVERGENCE | INTERNAL`.

## CalcResult (source of truth: `src/core/result.ts`)
```ts
type InputSource = 'user' | 'default' | 'fab-profile' | 'preset';
type WarningSeverity = 'info' | 'caution' | 'warning' | 'critical';
type Bound = 'min-requirement' | 'max-capacity' | 'nominal' | 'prediction';
type DesignDirection = 'max-limit' | 'min-requirement';
type ElementKind = 'trace' | 'via' | 'pad' | 'connector' | 'spoke' | 'pour-neck' | 'other';

interface CalcInput { name: string; value: Quantity; source: InputSource; sourceDetail?: string }
interface CalcWarning { severity: WarningSeverity; message: string; code?: string }

interface DesignValue {
  name: string;
  direction: DesignDirection;
  calculated: Quantity;          // the calculated thermal/electrical limit
  recommended: Quantity;         // = calculated x derating.factor (1e-12 relative)
  derating: { factor: number; rationale: string };
  allowNonPositive?: boolean;    // waives ONLY the positivity rule, where <= 0 is meaningful
}
interface Envelope { name: string; min: Quantity; typ: Quantity; max: Quantity; toleranceInputs: string[] }

interface ElementResult {        // one element of a current path
  id: string; name: string; kind: ElementKind;
  load: Quantity; limit: Quantity;
  utilisation: number;           // load / limit; > 1 means over the limit
  margin: Quantity;              // limit - load; negative when over
}
interface CopperBasis {
  layer: 'outer' | 'inner';      // required, never defaulted
  basis: 'nominal' | 'finished' | 'measured';
  thickness: Quantity;           // finite length > 0
  source: string;                // non-empty
  weightOzFt2?: number;          // set when the basis came from a foil weight (drives per-weight text)
}
interface CalcExport { id: string; kind: 'net-class'; values: Record<string, Quantity>; note: string }

interface CalcResult {
  method: string;
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;               // same string rendered in the UI (from meta.ts)
  inputs: CalcInput[];           // every input, with provenance
  assumptions: string[];
  steps: { label: string; expr: string; value: Quantity }[];
  results: { name: string; value: Quantity; role: 'primary' | 'secondary'; bound: Bound }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: CalcWarning[];
  confidence: { level: 'high' | 'medium' | 'low'; reasons: string[]; score: number };
  recommendation: string;
  dataStatus: 'VERIFIED' | 'UNVERIFIED' | 'PAYWALLED' | 'CONFLICT';
  designValues: DesignValue[];   // array, required (may be empty)
  envelope?: Envelope[];
  fabProfile?: { id: string; fabricator: string; profileDate: string; status: DataStatus;
                 ageDays: number;  // whole days, profile date to evaluation date (injected, never Date.now())
                 stale: boolean }; // must equal ageDays > FAB_PROFILE_MAX_AGE_DAYS (365)
  elements?: ElementResult[];
  limitingElement?: { id: string; name: string; reason: string };
  copperBasis?: CopperBasis;
  exports?: CalcExport[];
}
```
- There is no `defaulted` boolean: provenance is `inputs[].source`, with `sourceDetail` naming the default, profile field or preset.
- **`results[].bound` is required.** It says what the number means. `min-requirement` and `prediction` round up when printed, `max-capacity` rounds down, and `nominal` rounds to nearest. Every headline is printed through `src/core/format-result.ts` (see skill `units-dimensional-analysis`).
- **`designValues[]` direction rules (`checkDesignValue`):**
  - `max-limit`: factor finite and in (0, 1].
  - `min-requirement`: factor finite and >= 1.
  - `calculated` and `recommended` must be finite and of the same dimension, with `recommended = calculated x factor`.
  - The rationale must not be empty.
  - **Absolute temperatures are rejected**: derate a temperature as a ΔT margin.
  - `calculated <= 0` is rejected unless `allowNonPositive: true`.
  - `boundForDesignDirection` / `designDirectionForBound` in `format-result.ts` map the two vocabularies: `max-limit` <-> `max-capacity`.
- **`elements[]` (`checkElements`, reports every problem by element id):**
  - Each element needs a non-empty, unique id and a known kind.
  - Load, limit and margin must be finite and of the same dimension, with the limit > 0.
  - `utilisation = load/limit` and `margin = limit - load` must hold (1e-9 relative).
  - Over-limit elements are valid.
  - `rankElements(es)` sorts by utilisation descending, ties by id ascending, and returns a new array.
  - When elements are present, `limitingElement.id` must be the top-ranked id.
- **`copperBasis` (`checkCopperBasis`):** the layer must be outer or inner, the basis must be one of the three kinds, the thickness must be a finite length > 0, and the source must not be empty.
- `exports` values are checked only for finiteness today (no dimension, sign or bound check: G3-c open).

## `assertCalcResult(result)`: the full schema check
It never throws: it returns `Result<CalcResult, string[]>` with every problem listed. It enforces:
1. Every Quantity is finite: inputs, steps, results, designValues (calculated and recommended), envelope, elements (load, limit, margin), `copperBasis.thickness` and every export value.
2. Every result has a `bound` from the four allowed values.
3. `confidence.score` is finite. `confidence.level` is high, medium or low. `dataStatus` is one of the four (the ledger spelling `PAYWALLED-USER-MUST-VERIFY` is rejected here).
4. Every design value passes `checkDesignValue`, every envelope passes `checkEnvelope` (finite, same dimension, min <= typ <= max), the elements pass `checkElements`, and the copper basis passes `checkCopperBasis`.
5. Every warning severity is known.
6. Elements present ⇒ `limitingElement` is present and is the top-ranked element.
7. The fab profile:
   - `ageDays` is a non-negative integer and `stale` is a boolean equal to `ageDays > 365`.
   - A stale profile cannot rate `high`.
   - A non-VERIFIED profile status forces a non-VERIFIED `dataStatus`.
8. Any `validityChecks[].ok === false` ⇒ level `low`.
9. The level matches the score: 0 high, 1-2 medium, >= 3 low. The one exception is `low` forced by a failed validity check.
10. Non-high levels have non-empty `reasons`.
11. At least one result has role `primary`. The message says "exactly one", but two primaries are not rejected today.
12. No `min-requirement` result is negative, except temperatures (absolute and ΔT).

Not enforced yet: `fabProfile.status` spelling; empty `ledgerIds` with VERIFIED; copper-basis magnitude; envelope `typ` tied to a result; export dimension, sign and bound (G3-c, G3-e).

**Rule: every calculator's tests run `assertCalcResult` on EVERY output they obtain**, golden, property and edge cases alike. Follow the `ok()` helper in `copper-converter/calc.test.ts`. The calculator also calls it before returning.

`assertNoNonFinite(result)` is the throwing finiteness-only variant. It covers every Quantity above plus the derating factors and `confidence.score`. Prefer `assertCalcResult`.

## dataStatus (`src/core/data-status.ts`; never hand-map)
- `dataStatusForLedgerIds(ids, ledger = LEDGER, opts?: { exclude?: string[] })` returns the worst status over the ids.
  - It throws `DataStatusError` on an empty list, on an unknown id (excluded ids must exist too), and when every id is excluded. Nothing is ever silently rated VERIFIED.
- `dataStatusFromLedger(status)` maps one row; `PAYWALLED-USER-MUST-VERIFY` becomes `'PAYWALLED'`. `worstDataStatus` breaks weight ties CONFLICT > PAYWALLED > UNVERIFIED > VERIFIED.
- **Foil convention exclusion.** `FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE` (`['S-003']`, `data/constants.ts`) holds the foil-convention CONFLICT row. That row is shown as its own labelled assumption, so copper calculators must pass `{ exclude: FOIL_LEDGER_IDS_EXCLUDED_FROM_CONFIDENCE }`, as the converter does.
- The exclusion is opt-in per call (G2-c open). Forgetting it rates every copper result CONFLICT. That fails safe, but it is wrong.
- Any status other than VERIFIED adds to the score and renders a badge.

## Confidence (`src/core/confidence.ts`, rule text `CONFIDENCE_RULE_TEXT`)
Call `rateConfidence(factors)`; never compute a level by hand. Show `CONFIDENCE_RULE_TEXT` and never paraphrase it in code.
- **Score:**
  - 2 x out-of-range inputs
  - \+ 1 x ordinary defaulted assumptions (uncapped)
  - \+ 2 x safety-relevant defaults
  - \+ accuracy class: exact 0, analytical 0, empirical 1, estimate 2
  - \+ data status: VERIFIED 0, UNVERIFIED 1, PAYWALLED 2, CONFLICT 2
- **Level:** score 0 is high, 1-2 medium, >= 3 low. Any out-of-range input forces low.
- A name listed as both defaulted and safety-relevant counts once, at the safety weight.
- An unknown data status throws `ConfidenceInputError`, so a NaN score is impossible.
- **Out-of-range entries:** use the structured form `{name, value, bound}`, which prints as "current = 40 A (allowed: ≤ 35 A)". A bare string is printed as the whole reason.
- **`confidenceFactorsFromInputs({inputs, safetyRelevant?, outOfRange?, accuracyClass, dataStatus})`** builds the factors from `inputs[].source`, so a calculator cannot default an input and still rate high.
  - `default` and `preset` count as defaulted.
  - `user` and `fab-profile` do not.
  - `safetyRelevant` names inputs whose defaulting bears on safety. Each name must be an input, and a fab-profile input cannot be named (both throw `ConfidenceInputError`).
  - The returned `defaultedAssumptions` and `safetyRelevantDefaults` are **disjoint**.
  - `defaultedInputNames(inputs)` in `result.ts` uses the same rule (default/preset only; fab-profile excluded), so the two helpers agree.
  - A fab-profile value is instead reflected through `fabProfile.status` / `dataStatus` and staleness (`assertCalcResult` rule 7).
  - `provenanceNames(inputs)` groups non-user names by source for display.
- **Copper basis:** `copperBasisFactors(basis)` returns no ordinary defaults and, **only for a `nominal` basis**, one safety-relevant default.
  - The text is per layer and per weight. It comes from `finishedVsNominal()` in `data/finished-copper.ts`: S-009 secondhand IPC-6012 minimums, inner and outer Class 2, for 0.5, 1 and 2 oz.
  - It gives the signed percent against the nominal used and the non-conservative direction.
  - Weights without a figure get a generic "finished thickness unknown" text.
  - A `finished` or `measured` basis adds nothing.
  - Build the basis with `copperBasisFromFoil(layer, weight, convention)`; it sets `basis: 'nominal'` and `weightOzFt2`.
  - Merge the copper factors with the input-derived factors before calling `rateConfidence`.
- **Known gap (G2-d):** categorical choices (layer, foil convention, k material, Mode A/B) have no provenance field. In the converter a defaulted convention appears only in `assumptions` ("Convention not chosen; default ... used") and is **not counted** in the score. Do not rely on this staying so; the fix is pending.
- The UI must never show a level without its `reasons` and `score`.

## Other helpers in `result.ts`
- `guardPositiveFinite(name, qty)` / `guardPositiveFiniteNumber(name, n)` reject NaN, ±Infinity, zero and negatives. The parser lets `0`, `-0` and underflow through, so every calculator must guard (R-13). Alternatively write a calculator-specific `guardQuantity` as in the converter.
- `highestWarningSeverity(warnings)` orders `info < caution < warning < critical`, or returns `null`.
- `FAB_PROFILE_MAX_AGE_DAYS = 365`.

## Rules
- Pure, deterministic, no I/O, no `Date.now()`; `fabProfile.ageDays`/`stale` come from `fabProfileAgeDays(profile, today)` / `fabProfileStale(profile, today)` in `src/core/fab/profile.ts` with `today` injected by the caller. Return errors as values, never NaN, never throw out of `compute`.
- Keep the "calculated thermal/electrical limit" (`designValues[].calculated`) separate from the "recommended engineering design value" (`designValues[].recommended`), with a stated factor and rationale.
- Fab limits come only from the active `FabProfile` (`src/core/fab/profile.ts`). Set `fabProfile` in the result (with `ageDays`/`stale`), `source: 'fab-profile'` and a `sourceDetail` naming the profile field. Never hard-code or pre-fill a fab number.
- Report path elements in `elements[]` and set `limitingElement` from `rankElements(...)[0]`.
- Constants come from `src/core/data/constants.ts` (each tagged with a ledger id). Foil thickness comes from `foilThickness()` with the selected convention (default `DEFAULT_FOIL_CONVENTION`, R-9 human decision pending). State the convention and its spread (about 2.07 % at 1 oz, `foilSpreadPercent()`) in `assumptions`, e.g. via `foilAssumptionText()`. Set `copperBasis` with the required `layer`.
- Never emit compliance wording ("compliant", "production safe", etc.); only `src/core/gate.ts` may.
- Envelope: list toleranced inputs in `meta.ts` and fill `envelope[]`.
- Each calculator's tests: golden vectors, `assertCalcResult` on every output, zero/negative/NaN/Infinity/underflow inputs return error values without throwing, and a performance bound.
