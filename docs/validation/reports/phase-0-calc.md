# Phase 0 calculations validation report (fix cycle 2 re-run)

Validator: calc-validator (independent, read-only on `src/` and `tests/`)
Date: 2026-10-06
Branch: phase-0 (git not run, per instructions)
Scope: re-validation of M-3 (Brent), m-A..m-G, the ledger rows touched by the researcher, the oracle and the golden vectors, and the OPEN_RISKS carry-forward.

## Verdict: PASS-WITH-CONDITIONS

M-3 is closed. `brent()` interpolates again: it takes 6 to 12 iterations on smooth problems where bisection takes 39 to 45. The header's worst-case bound (N + LAG + 1 = N + 6) held in about 8 300 random and adversarial problems with zero violations. The bound is reached exactly (N + 6) on roots of odd order 3, 5, 7 and 9 and on poles, so it is tight.

No BLOCKER or MAJOR remains. The open items are MINOR, and none produces a wrong number in Phase 0:

- m-B residual: the gate still trusts caller-chosen input names, still exports `complianceGateWith`, and the ledger mirror can be changed at runtime.
- m-C residual: the audit detector still misses many phrasings.
- m-F: one stale vector note remains.
- m-G: not addressed.
- A test doc comment states a bound that is false.
- A caller pitfall for brackets that contain 0 is not logged.

**Conditions** (the orchestrator must log these in `docs/validation/OPEN_RISKS.md` before closing the phase; today none of them is logged there):

- **C-1.** Close m-B (residual) before any calculator calls the gate.
- **C-2.** Log the m-C residual evasions as a known limitation of the backstop audit.
- **C-3.** Add the m-G note to S-011c and R-12.
- **C-4.** Add a caller rule to R-14: for strictly positive SI quantities, never use `lo = 0`; use a bracket that excludes 0.
- **C-5.** Correct the test doc comment (n-1) and the m-F vector note. These are housekeeping.

## Previous findings and disposition

| ID | Finding (origin) | Disposition in this run | Evidence |
|---|---|---|---|
| M-1 MAJOR (run 1) | Absolute 1e-12 floor gave wrong roots below about 1e-10 | **CLOSED** (in run 2; still holds) | §1c |
| M-2 MAJOR (run 1) | Gate trusted a caller `dataVerified` flag | **CLOSED** (run 2; still holds: 0 of 1 254 real-ledger requests allowed) | §2 |
| M-3 MAJOR (run 2) | `brent()` had degenerated into bisection | **CLOSED.** Interpolation is active. The N + 6 bound holds and is tight. | §1a, §1b |
| m-A (run 2) | Absolute floor applied to brackets that exclude 0 | **CLOSED.** The floor now applies only when lo ≤ 0 ≤ hi (`rootfind.ts:158-159`). 1e-15 and 1e-13 roots on brackets that exclude 0 resolve to ≤ 7.3e-13 relative. Residual behaviour on brackets that contain 0 is documented in the header but not logged for callers (C-4). | §1c |
| m-B (run 2) | Gate did not bind a standard to its ledger rows or inputs | **PARTIAL.** Each standard now requires its own rows (`STANDARD_REQUIREMENTS`, `gate.ts:26-31`) and is validated at runtime. Still open: caller-chosen input names, exported `complianceGateWith`, and an unfrozen `LEDGER` mirror. | §2 |
| m-C (run 2) | Audit phrase gaps | **PARTIAL.** It is now a rule-based detector (R1-R3) and many run-2 variants are caught. 33 of the 39 probe strings still get through, including several from the run-2 list. No false positives on the current source. | §3 |
| m-D (run 2) | AWG note attributed 0.1 mil rounding to unread B258 | **CLOSED.** It now cites Handbook 100 with a quote and says B258 was not read (`awg.ts:21-26`). Cosmetic nit: the `rangeNote` sentence "not a limit of the formula valid beyond this range" still reads awkwardly. | §4 |
| m-E (run 2, info) | Raw `{si, dim}` literals bypass `q()` | **CLOSED by convention.** `q()` and `result()` freeze. No raw literal exists in non-test `src`. The only `{ si:` constructions are in `quantity.ts:35,44,82`, and every one is frozen and validated. Structural typing still allows literals; there is no lint rule (informational). | §4 |
| m-F (run 2) | Stale oracle comment; via_theta vector UNLEDGERED | **PARTIAL.** `ref_calcs.py:16-18` now says 1.7241e-8 is a 5 s.f. rounding of 1/58e6 (good). `ref_calcs.py:96` still says "UNLEDGERED: k_Cu = 385 W/m.K has no ledger row", which is false now that S-007 exists. The note was left so that the generated JSON stays the same. Closing it is covered by R-10 ("fix oracle constant and golden vector"). | §5 |
| m-G (run 2) | twc's commented-out website formula has exponent −0.018; SMPS.us shows −0.108 | **OPEN.** `LEDGER.md:17` (S-011c) still says only that "the website set (117.555, −0.913, …) sits commented out". There is no mention of the transcription difference there or in R-12. | §5 |
| m-1 (run 1) | T below 0 K accepted | CLOSED (run 2) | – |
| m-2 (run 1) | Confidence lacked CONFLICT | CLOSED (run 2) | – |
| m-3 (run 1) | Brent comment false / MAX_ITER | CLOSED. It was superseded by M-3, which is now closed. The header is accurate (§1b). | – |
| m-4 (run 1) | Compliance grep gaps | Continued as m-C | – |
| m-5 (run 1) | 35 µm label not ledger-backed | CLOSED (Würth and Rogers in S-003) | §5 |
| m-6 (run 1) | AWG cited unread B258 | CLOSED (m-D closed too) | – |
| m-7 (run 1) | golden-vectors.json hand-assembled | CLOSED (`gen_golden.py --check` passes) | §6 |
| m-8 (run 1) | Tolerances too loose | CLOSED (1e-6 / 1e-9) | §6 |
| m-9 (run 1) | "1.7241e-8 = 1/58" | CLOSED in both the ledger and the oracle comment | §5 |
| m-10 (run 1) | S-011a 0.5 oz = 0.65 mil | CLOSED | – |
| m-11 (run 1) | S-050 not pinned | CLOSED | – |

## Method (independence protocol)

1. I started from my run-2 report, `OPEN_RISKS.md` and `LEDGER.md`.
2. I computed the closed-form oracles in Python (`math`) and from known constants:
   - root of x³−2x−5 = 2.0945514815423265
   - root of cos x − x = 0.7390851332151607
   - ln 1e6
   - √2
   - C = 1/(2π·1 GHz·50 Ω) = 3.183098861837907e-12 F
   - 1/58e6
3. Probes are plain Node 24 scripts in the session scratchpad (`scratchpad/r2/*.mts`). TypeScript types are stripped natively, and a scratch resolve hook adds the `.ts` extension. Random problems use a seeded mulberry32 (seeds 987654321 and 1234567). Nothing was written to `src/` or `tests/`.
4. I ran no third-party code. twc and SMPS evidence comes from the raw text saved in the scratchpad during run 2 (same date), re-grepped.
5. For orientation only (not counted as evidence): `npm test` (25 files, 646 tests pass), `npm run typecheck` (clean), `npm run check:audit` (PASS), `npm run build` (OK).

## 1. Root finders (`src/core/solvers/rootfind.ts`)

### 1a. M-3: interpolation is active

Rel. err. is against the closed-form oracle. Default options.

| Problem | Oracle root | bisect it / rel. err | brent it / rel. err | Run 2 brent it |
|---|---|---|---|---|
| x³−2x−5, [2,3] | 2.0945514815423265 | 39 / 5.4e-13 | **9** / 6.4e-16 | 39 |
| cos x − x, [0,1] | 0.7390851332151607 | 41 / 7.0e-14 | **9** / 1.4e-14 | 41 |
| eˣ − 1e6, [0,30] | 13.815510557964274 | 41 / 7.4e-13 | **12** / 0 | 41 |
| x − 123456789.123, [0,1e9] | 123456789.123 | 43 / 2.3e-14 | **6** / 0 (residual) | 43 |
| x² − 2, [0,2] | √2 | 41 / 4.7e-13 | **10** / 1.6e-16 | 41 |
| Xc(C) − 50 Ω @ 1 GHz, [1e-14, 1e-10] F | 3.183098861837907e-12 | 45 / 8.6e-13 | **10** / 0 (residual) | 45 |
| same, [1e-18, 1e-6] F | same | 59 / 3.6e-13 | **25** / 2.5e-13 | – |
| same, [1e-15, 1] F | same | 79 / 4.5e-14 | **45** / 2.5e-16 | – |
| x − 1, [0,10] | 1 | 44 / 3.4e-13 | **6** / 0 (residual) | 44 |

All errors are within the requested 1e-12 relative tolerance. The 0.1 % closed-form tolerance is met by about 9 orders of magnitude.

The tests now assert efficiency (`rootfind.brent.test.ts:26-34`: ≤ 15 iterations and strictly fewer than bisect), so the run-2 gap in the tests is closed.

### 1b. Worst-case bound (header `rootfind.ts:20-37`)

I checked the proof by reading it:

- The bracket [b,c] never widens. An interpolation step satisfies 2p < 3·xm·q, so |d| < 0.75·|c−b|. The tol1 nudge stays inside because |xm| > tol1.
- An unforced step is taken only when w_k ≤ width0·2^(5−k), so w_{k+1} ≤ width0·2^(6−(k+1)).
- A forced bisection halves w, so the lag stays the same.
- Brent stops on w ≤ (xtol + 4eps)|b| + absTol, which is at least bisect's max(xtol, 4eps)|x| + absTol.
- Hence brent ≤ N + 6. The warm-up steps (5 forced bisections) do not change this.

The proof is sound.

Empirical check: brent iterations minus N, where N = ceil(log2(width0 / (max(xtol, 4eps)·|r| + absTol))).

| Family (300 or 400 cases each, root scale 1e-15..1e15, bracket ratio 1e-4..1e4, 20 % of brackets with the root within 1e-9 relative of one end) | max(brent − N) | avg bisect | avg brent | violations of N + 6 |
|---|---|---|---|---|
| linear | −21 | 44.6 | 6.2 | 0 |
| (x−r)(1+(x−r)²) | 6 | 44.9 | 25.5 | 0 |
| expm1(x−r) (117 overflow → NON_FINITE in both) | 2 | 44.3 | 8.6 | 0 |
| atan(x−r) + 0.3(x−r) | −18 | 44.7 | 8.4 | 0 |
| sign·\|x−r\|^k, k = 3, 5, 7, 9; and raw (x−r)³, (x−r)⁹ | **6** (tight) | 44.1–44.6 | 49.9–50.4 | 0 |
| sign·exp(−1/(x−r)²) (flat) | 5 | 15.6 | 17.1 | 0 |
| flat plateau ±1e-300 | 6 | 44.3 | 42.8 | 0 |
| step | 0 | 44.2 | 44.2 | 0 |
| atan(1e12(x−r)) (near-jump) | 0 | 44.3 | 43.1 | 0 |
| pole 1/(x−r) | 6 | 44.7 | 49.7 | 0 |
| saturating clamp ±1e-6 | 0 | 43.9 | 25.2 | 0 |
| (x−r) + 0.9\|x−r\|·sin(1/(x−r)) | 6 | 44.0 | 23.7 | 0 |
| cbrt(x−r), \|x−r\|^(1/9) (infinite slope) | −2 | 44.0–44.1 | 33.4–39.9 | 0 |
| (x/r)²⁰ − 1 | 6 | 44.2 | 18.4 | 0 |
| kinks with slope ratio 1e18 and 1e12 | −6 | 44.0–44.2 | 10.7–14.7 | 0 |
| x·e^(x/r) − r·e, ln(x/r) | −29, −30 | 43.9–44.3 | 10.8–10.9 | 0 |
| staircase | −12 | 44.2 | 26.0 | 0 |

In total about 8 300 problems gave **0 violations**. Brent was faster than bisect in 3 147 of 3 190 cases in the second set.

Other checks:

- **Extremes:** a root at 1.234e300 on [1e299, 1e301] took 6 iterations; a subnormal root 3e-310 on [1e-310, 1e-309] took 6; both are exact. A root 1 ulp above lo took 6 iterations and is exact to 2.2e-16.
- **Converged flag:** the rule is `residual` iff fx === 0 or |fx| ≤ ftol (`rootfind.ts:193,248`). It was asserted on every probe with 0 mismatches. With ftol = 0.5, both solvers return `residual` with |fx| = 0.25.
- **Hooks:** `grep process.|import.meta|debug|Date.now|Math.random` over non-test `src/core` finds nothing. The only `import.meta` hit is `import.meta.glob` in `awg.metadata.test.ts`, which is a test.

**n-1 MINOR (test doc accuracy):**

- **Where:** `src/core/solvers/rootfind.brent.test.ts:7-8` says "Contract B (worst case: brent iterations <= bisect iterations + 10 for any bracketed problem)". This is false.
- **Counterexample:** f(x) = sign(x−r)·exp(−1/(x−r)²) with r = 7.491460636794426 on [−289.33170397668533, 19.520851126641848]:
  - bisect: 7 iterations (residual, after fx underflows to 0)
  - brent: 18 iterations
  - so brent = bisect + 11. N = 46, so the header bound N + 6 holds.
- **Context:** the assertion itself (line 121) is limited to odd-power families and passes. The header (`rootfind.ts:34-37`) correctly says that a bound relative to the actual bisect count cannot be proven.
- **Fix:** change the comment to "brent ≤ N + 6 (proven); ≤ bisect + 10 observed on odd-power families".
- **Owner:** test-engineer.

**Info (for R-14):** the same flat function shows that converged `residual` can be reached far from the root when f underflows. For root 0.371, both solvers return x ≈ 0.3507 with fx = 0, which is 5 % away. This is correct by the stated rule, but callers must not treat `residual` as proof of accuracy for functions that can underflow.

### 1c. m-A: tiny roots and roots at 0

| Root / f | Bracket | bisect rel. err (it) | brent rel. err (it) |
|---|---|---|---|
| x − 1e-15 | [1e-18, 1] | 7.3e-13 (90) | 0 (6) |
| x − 1e-15 | [5e-16, 1e6] | 1.1e-13 (110) | 0 (6) |
| x − 1e-15 | [1e-300, 1] | 3.1e-13 (90) | 0 (6) |
| 1/x − 1/r, r = 1e-15 | [1e-18, 1] | – | 0 (56) |
| 1/x − 1/r, r = 1e-15 | [5e-16, 1e6] | – | 3.5e-14 (77) |
| x − 1e-13 | [1e-18, 1] / [1e-300, 1] | 3.7e-13 / 2.1e-13 | 1.3e-16 (7) |
| 1/x − 1/r, r = 1e-13 | [5e-14, 1e6] | – | 3.8e-16 (70) |
| x − 2e-14 | [−1, −1e-20] (negative, excludes 0) | – | 1.6e-16 (7) |

All are ≤ 1e-9 relative (requirement met; in fact ≤ 7.3e-13).

Roots at 0 inside the bracket:

- x, x³ and sin x + x³ on [−1, 3]: x = 0 exactly, 2 iterations, `residual`.
- [−1e-20, 3e-20]: |x| ≤ 1.6e-35 (bisect, 51 iterations) or 1.5e-36 (brent, 6), `bracket`.
- [−1e300, 1e300] with x + 1e-200: bisect returns −8.9e284 (= floor 4eps·1e300, as documented); brent returns 0.
- x³ on ±1e300 overflows: NON_FINITE in both (correct).
- All terminate sensibly.

**Residual (C-4):** when the bracket contains 0, the floor still limits accuracy for tiny roots. x − 1e-15 on [0, 1] gives bisect 8.9e-16 (**11 %**, ok:true, `bracket`). Brent happens to hit it exactly. This is documented in the header (`rootfind.ts:13-17`) and in the `xtol` doc, so it is not a defect. But a Phase 1/2 caller solving a positive SI quantity with `lo = 0` would get a silently inaccurate result. Add the rule to R-14: positive quantities use a bracket that excludes 0, e.g. [tiny > 0, hi].

## 2. Compliance gate (m-B)

### 2a. Real ledger (`complianceGate`)

I ran a cross-product of 1 254 requests:

- 19 standard values: the 4 valid ones; case and whitespace variants; a non-breaking hyphen; `__proto__`, `constructor`, `toString`, `hasOwnProperty`; `''`, `null`, `undefined`, `123`, `{}`, `['IPC-2221']`, `MIL-STD-275`.
- 6 mandatoryInputs shapes: `{x:true}`, `{x:1}`, `{x:'yes'}`, an inherited-only prototype key, `{__proto__:{x:true}}`, and others.
- 11 id sets: all ledger ids, duplicated ids, the exact required ids, a wrong-standard id (S-006), case and whitespace variants, a comma string instead of an array, `S-030...S-034` with ASCII dots, `__proto__`, and the IPC-6012 placeholder.

Result: **allowed: 0 of 1 254.** Today every standard is denied with the real ledger:

- S-001 and S-010 are PAYWALLED.
- S-002 is PAYWALLED.
- S-030…S-034 is PAYWALLED.
- IPC-6012 has no ledger row.

`STANDARD_REQUIREMENTS` is deep-frozen. Reassigning a key, truncating an array or adding a key all throw TypeError.

### 2b. Ways to an allowed label

| Route | Result |
|---|---|
| `complianceGateWith(fakeLedger all VERIFIED, {standard, mandatoryInputs:{x:true}, ids = required})` | allowed for IPC-2221, IPC-2152 and IEC 60664-1; IPC-6012 needs a placeholder row marked VERIFIED |
| Runtime mutation of the exported mirror: `(LEDGER[0] as any).status = 'VERIFIED'` plus the S-010 row, then `complianceGate(...)` | **allowed:** "IPC-2221 compliant (per verified data: S-001, S-010)". `Object.isFrozen(LEDGER)` is false and the rows are not frozen. |

Both routes need a ledger row set marked VERIFIED, so the claim "the only way to an allowed label is a VERIFIED row set" is literally true. However, the row set does not have to be *the real ledger*.

### m-B residual MINOR (pre-caller condition C-1)

- `src/core/gate.ts:15,36-37`: mandatory inputs are whatever names the caller declares. `{x:true}` passes. There is no per-standard required-input list, and at runtime `{x:1}` and `{x:'yes'}` count as provided.
- `src/core/gate.ts:35`: `complianceGateWith` is still exported and takes any ledger. Only `gate.test.ts` imports it today, but nothing enforces that.
- `src/core/data/ledger.ts:15`: `LEDGER` and its rows are not frozen. They are readonly only at compile time.
- **Exposure today:** nil. No caller exists, and the gate is absent from `dist`.
- **Fix:**
  - `Object.freeze` each row and the array.
  - Add a per-standard required-input list to `STANDARD_REQUIREMENTS`.
  - Either un-export `complianceGateWith` (export a test-only seam) or add an audit rule that only `gate.test.ts` may import it.
- **Owner:** calc-implementer; test-engineer.

### 2c. Grep of src and dist

- **`src`:** the only "compliant" outside tests is `gate.ts:77` (the allowed label). The other hits are "compliance" in `gate.ts:33` and in the disclaimers `App.tsx:57`, `About.tsx:10` and `Home.tsx:8`.
- **`dist/` after `npm run build`** (`index-B_18STYb.js`, 22.84 kB): no "compliant", "fab-ready", "production safe" or "production ready". The only matches are the disclaimers "does not certify compliance", "Nothing here certifies a design" and "Not a compliance certification".

## 3. Audit detector (m-C, `tools/audit-lib.mjs:19-37`)

`scanForbiddenPhrases(repo root)` returns `[]`, so there are **no false positives on the current src text**. Caught: "IPC-2221 compliant", "IPC‑2221 compliant" (U+2011), "production safe", "fab-ready", and the R1/R2/R3 test list.

**Still evades the detector** (33 of 39 probes; `scratchpad/r2/au.mjs`, `esc.mjs`):

- **"compliance" as a status noun** (R1 deliberately skips "compliance"): "IPC-2221 compliance: PASS", "Compliance: OK (IPC-2221)", "IEC 60664-1 conformance: yes", "conformity with IEC 60664-1 confirmed", "conforming to IEC 60664-1".
- **Verb forms outside R3:** "satisfied IPC-2221", "IPC-2221 Satisfied", "met IPC-2221", "meeting IPC-2221 limits", "OK per IPC-2221", "IPC-2221: OK", "IPC-2221 ✔", "within IPC-2221 limits".
- **Double negation that the negation exemption treats as negated:** "never non-compliant", "not non-compliant", "no non-conformances found".
- **Other word forms:** "certifies the design", "certification: passed", "UL listed", "DFM approved", "approved", "guarantee of safety", "guarantees safe operation".
- **Readiness wording outside R2:** "ready for fabrication", "ready for production", "safe for production", "safe to fabricate", "production-grade", "manufacturable as-is". Several of these were already listed in run 2.
- **Construction tricks:** `' compl' + 'iant'`, `String.fromCharCode(...)`, the source escape `compliant`, a Cyrillic homoglyph "сompliant", a zero-width space "com​pliant".
- **Splitting across lines** defeats R3 (verb on one line, IPC token on the next).

**Assessment:** MINOR. The detector is a backstop; the primary control is the gate plus review. The policy note at `audit-lib.mjs:18` (prefer false positives) is the right direction. Cheap improvements:

- flag `\bcompl(?:iance|y)\b` and `\bconform(?:ance|ity|ing)?\b` when an IPC/IEC token is on the line
- treat "non-" after a negation as not negated
- add `satisfied|met|meeting|certifies|certification|listed|guarantee[sd]?`
- add "ready for (fabrication|production)" and "safe (for production|to fabricate)"
- reject non-ASCII letters and `\u` escapes inside identifiers or strings near these words

Log the remaining evasions as a known limitation (C-2). Owner: devops-engineer, test-engineer.

## 4. AWG notes and Quantity (m-D, m-E)

- `awg.ts:21-26`:
  - `source` reads "NBS Circular 31 (1914) and NBS Handbook 100 (1966); ASTM B258 (paywalled) not read, not used as the source".
  - `precisionNote` quotes Handbook 100: "to the nearest tenth of a mil for gages 0000 through 44" and says "ASTM B258 is paywalled and was not read".
  - This matches the ledger (S-005). **Closed.**
- `quantity.ts`:
  - `q()` (`:42-45`) and `result()` (`:31-36`) return `Object.freeze`d objects; `abs` (`:82`) also freezes.
  - `grep "{ *si *:"` in non-test `src`: only those three lines.
  - Test-only literals (`result.test.ts:9`, `coverage.test.ts:70`) are intentional negative fixtures.
  - **Closed** (informational: no lint rule enforces it).

## 5. Ledger and oracle comments (m-F, m-G, S-003/S-004/S-007)

| Row | Check | Result |
|---|---|---|
| S-004 | Recomputed: 1/58e6 = 1.724137931034483e-8. (1.7241e-8 − 1/58e6)/(1/58e6) = −2.2000e-5. 0.15328/8.89e6 vs 1/58e6 = +2.6997e-5. 8.89/58 = 0.1532759. | The row's "exact 1/58 µΩ·m; 1.7241e-8 is 5 s.f. rounding (low by 2.2e-5); 0.15328 derived and rounded (+2.7e-5)" is correct. `ref_calcs.py:16-18` comment is correct. |
| S-007 | Row text (pure 401 at 300 K from HPL ±2 %; C11000 391 Aurubis vs 394 Bikar; HyperPhysics 385 with an inconsistent cal column, 0.99 × 419 ≈ 414.8; plated Cu not researched; "do not average") | Matches my run-2 re-fetch of HyperPhysics and PPPL. CONFLICT is justified. 385 is unsupported (R-10). |
| S-003 | Würth "35 µm / 1 oz/ft²", "17.5 µm / ½ oz/ft²" (inner-layer "Final Copper Thickness", V1.0, undated); Rogers RO4835 "1/2 oz. (18µm)", "1 oz. (35µm)" (Revised 1686 092425, #92-160) | Matches my run-2 pdftotext extracts (`scratchpad/wurth.txt`, `rogers.txt`). CONFLICT is justified. |
| m-F | `ref_calcs.py:94-96` | The comment now cites S-007 (CONFLICT), but the vector note still says "has no ledger row" and `golden-vectors.json:115-116` reports `UNLEDGERED`. The text is false but fails safe: UNLEDGERED is not displayed as verified. Tracked by R-10. Owner: test-engineer. |
| m-G | `twc.c:857` (raw, pinned 308002f): commented line `... * pow(ip->current.val, 0.84 * pow(ip->temp_rise.val, -0.018) + 1.159)`. Saved smps.us HTML: `i<sup>0.84×∆T<sup>-0.108</sup>+1.159</sup>`. | **Needs a ledger note.** S-011c (`LEDGER.md:17`) presents twc's commented line as "the website set". The website exponent is −0.108, not −0.018, so anyone building an X-03 cross-check from twc's comment would use a wrong exponent. Add to S-011c: "twc.c:857's commented website formula has I-exponent term 0.84·ΔT^−0.018 (transcription differs from smps.us −0.108)". Mirror it in R-12. Owner: standards-researcher. MINOR. |

## 6. Oracle and golden vectors

- `python3 tools/reference/ref_calcs.py`: 17/17 OK, exit 0.
- `python3 tools/reference/gen_golden.py --check`: "OK docs/golden-vectors.json matches the oracle", exit 0.
- There were no formula or constant changes since run 2, so the run-2 bit-equality and the foil-swap sensitivity (2.07 % shift caught at rel_tol 1e-6) still apply.

## 7. Sensitivity and cross-checks

- **Sensitivity:** Phase 0 has no calculator outputs and no sensitivity readout. Nothing to compare.
- **Cross-checks:** `tests/crosscheck/` has no records apart from the template. There are 0 records, none fabricated and none "not yet obtained".

## 8. OPEN_RISKS R-8..R-15 review

| Risk | Accurate? | Note |
|---|---|---|
| R-8 IPC-2152 policy | yes | – |
| R-9 foil convention | yes | – |
| R-10 k_Cu 385 | yes | Also covers the m-F vector note ("fix oracle constant and golden vector"). |
| R-11 1/58e6 | yes | The oracle still uses 1.7241e-8, which is consistent with "before Phase 1". |
| R-12 twc constants | **incomplete** | Does not mention the m-G transcription difference (C-3). |
| R-13 zero rejection | yes | – |
| R-14 solver caller rules | **incomplete** | Missing: (a) do not bracket positive quantities from 0 (C-4); (b) `residual` with fx === 0 can come from underflow far from the root (§1b info). The "maxIter ≤ 50" advice is still fine: brent ≤ N + 6, and typical Phase 1 brackets give N ≈ 40–45, so at most 51 in the worst case on multiple roots. Recommend maxIter ≥ N + 6, or 60. |
| R-15 deployment | yes (outside my scope) | – |
| — | **silent gaps** | m-B residual (C-1) and m-C residual evasions (C-2) are not logged anywhere. |

## 9. Defect summary

| ID | Sev. | File:line | Summary | Owner |
|---|---|---|---|---|
| m-B (residual) | MINOR, pre-caller | `src/core/gate.ts:15,35-37`; `src/core/data/ledger.ts:15` | Caller-chosen input names; exported `complianceGateWith` accepts any ledger; `LEDGER` rows are mutable at runtime (mutation produced "IPC-2221 compliant"). | calc-implementer, test-engineer |
| m-C (residual) | MINOR | `tools/audit-lib.mjs:19-23` | 33 of 39 evasion probes get through (§3). No false positives. | devops-engineer, test-engineer |
| m-G | MINOR | `docs/sources/LEDGER.md:17` (S-011c), OPEN_RISKS R-12 | twc's commented "website" exponent −0.018 vs smps.us −0.108 is not recorded. | standards-researcher |
| m-F (residual) | MINOR | `tools/reference/ref_calcs.py:96`; `docs/golden-vectors.json:115-116` | via_theta note "has no ledger row" is false (S-007 exists); tracked by R-10. | test-engineer |
| n-1 | MINOR | `src/core/solvers/rootfind.brent.test.ts:7-8` | Claims brent ≤ bisect + 10 "for any bracketed problem"; counterexample gives +11 (§1b). | test-engineer |
| n-2 | MINOR (logging) | `docs/validation/OPEN_RISKS.md` R-14 | Missing the caller rules for brackets containing 0 and underflow residuals. | calc-implementer (to log) |
| m-D nit | cosmetic | `src/core/units/awg.ts:26` | "not a limit of the formula valid beyond this range": add "which is". | units-engine-engineer |

There are no BLOCKER or MAJOR findings. No numeric result in the Phase 0 scope is wrong.

## What I could NOT verify

- IPC-2221B/C, IPC-2152, IPC-4562A, IPC-6012, ASTM B258-18, IEC 60664-1 and IEC 60028 are paywalled. None was read, and nothing here claims otherwise.
- Ho, Powell & Liley (1972), Aurubis, Bikar and Würth/Rogers were not re-fetched in this run. I rely on the run-2 extracts saved in the scratchpad, from the same date.
- smps.us was not re-fetched today. The run-2 HTML snapshot (same date) was re-grepped.
- No third-party tool was run. twc evidence is static reading of raw source at pinned commit 308002f.
- The proof of the Brent bound assumes exact arithmetic. The floating-point check is empirical (about 8 300 problems, 0 violations), not a proof.
- Lint, coverage, bundle size, CI and Pages status belong to the phase-validator.
