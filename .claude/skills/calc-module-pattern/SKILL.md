---
name: calc-module-pattern
description: Standard file layout, CalcResult schema, validation, confidence, and metadata pattern for every calculator in src/core/calculators. Use when adding or modifying any calculator.
---
# Calculator module pattern

Layout per calculator `src/core/calculators/<name>/`:
- `meta.ts`: id, title, method, reference+edition, formula (string + LaTeX-free plain), ledger IDs, validity ranges, accuracy class.
- `calc.ts`: pure `compute(inputs: Inputs): CalcResult`. Inputs are `Quantity`.
- `guards.ts`: domain validation returning typed errors.
- `calc.test.ts`: golden + property tests.

## CalcResult
```ts
interface CalcResult {
  method: string;            // e.g. "IPC-2221 legacy (KiCad-compatible)"
  reference: { standard: string; edition: string; ledgerIds: string[] };
  formula: string;           // same string rendered in UI
  inputs: { name: string; value: Quantity; defaulted: boolean }[];
  assumptions: string[];
  steps: { label: string; expr: string; value: Quantity }[];
  results: { name: string; value: Quantity; role: 'primary'|'secondary' }[];
  validityChecks: { name: string; ok: boolean; detail: string }[];
  warnings: string[];
  confidence: { level: 'high'|'medium'|'low'; reasons: string[] };
  recommendation: string;    // "Calculated limit" vs "Recommended design value" are separate
  dataStatus: 'VERIFIED'|'UNVERIFIED'|'PAYWALLED'|'CONFLICT';
}
```
`dataStatus` comes from the ledger rows the calculator uses (`reference.ledgerIds`). Map ledger statuses with `dataStatusFromLedger` in `src/core/data-status.ts`. Do not hand-write the mapping:
- `VERIFIED` -> `'VERIFIED'`
- `UNVERIFIED` -> `'UNVERIFIED'`
- `PAYWALLED-USER-MUST-VERIFY` -> `'PAYWALLED'`
- `CONFLICT` -> `'CONFLICT'` (sources disagree; the UI must show the badge and the calculator must state which value it chose and why).
Any status other than `VERIFIED` downgrades confidence (rule (d) below) and renders a visible badge.
## Rules
- Pure, deterministic, no I/O. Return errors as values (`Result<T,E>`), never NaN.
- Confidence from `src/core/confidence.ts`: downgrade for each (a) out-of-range input, (b) defaulted assumption, (c) low-accuracy method class, (d) non-VERIFIED data.
- Always separate "calculated thermal/electrical limit" from "recommended engineering design value" (apply a stated derating).
- Never emit compliance wording; only `gate.ts` may.
- Provide min/typ/max envelope support by exposing the list of toleranced inputs in `meta.ts`.
