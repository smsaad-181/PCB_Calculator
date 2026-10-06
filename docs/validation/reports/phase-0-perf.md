# Phase 0 perf/stability audit

Verdict: PASS-WITH-CONDITIONS (0 BLOCKER, 2 MAJOR, 6 MINOR)

Auditor: perf-stability-auditor. Read-only except this file. Scratch scripts were kept outside the repo. Node v24.13.0, Windows 11, vitest 5.0.3. Lighthouse was not available offline and was not run. No LCP/TTI numbers are claimed. No browser or Playwright run was done, so error-boundary behaviour, the runtime console and real offline loading are not verified.

## Measured numbers

Micro-benchmarks (100k calls after 2k warm-up, single run, wall-clock):

| Function | us/call |
|---|---|
| parseQuantity("10mil", LENGTH) | 0.273 |
| parseQuantity("2.2uF") | 0.262 |
| parseQuantity("abc") (error path) | 11.9 |
| fromUnit(35,"um") | 0.090 |
| toUnit | 0.076 |
| formatQuantity | 0.798 |
| mul | 0.054 |
| brent, cubic on [2,3] | 0.284 |
| bisect, cubic on [2,3] | 0.386 |

- All are far below the 1 ms closed-form target. The slowest is the parse error path at about 12 us, dominated by Error construction.
- No calculators exist yet, so the per-calculator 10k-call benchmark and the self-heating solver iteration distribution cannot be measured.

Solver iterations (brent, default xtol 1e-12, bracket [-1e3, 1e4], 2000 cubics x^3 - c*x - 5 - k):
- min 31, median 32, p99 36, max 38, 0 failures.
- Fits the SPEC bound of 50 for wide brackets with default xtol.
- Hard cases on [-10, 1e3]:
  - atan: 13 iterations (bisect 50).
  - sqrt-type singular root: 28 (bisect 50).
  - Triple root (x-1)^3: brent hits MAX_ITER at 100 and returns a failure. Bisect converges in 49. See M-1.
  - exp(x)-1e-30: bracket end overflows to a non-finite value, returned as NON_FINITE.
  - Same-sign bracket: returned as NO_BRACKET.
- Determinism: two identical brent calls give byte-identical JSON (true).
- brent with maxIter 50 on the wide cubic converged in 39 iterations.

Parse and hash stress:
- 1e6-character garbage or whitespace input to parseQuantity: 0.2 to 2.1 ms. No catastrophic regex backtracking.
- parseHash with 200k keys: 365 ms. serializeHash of the same state: 120 ms (1.9 MB string). No crash.

Bundle (dist/):
- One JS file: 22.5 KB raw, 8.79 KB gzip (`check:size` output). CSS: 2.4 KB raw, 1.06 KB gzip.
- Budget is 150 KB gzip JS, so about 5.9% used. `check:size` and `check:audit` both PASS.
- Tests: 16 files, 373 tests pass in 0.93 s.
- Coverage (run into scratch): all files 98.2% lines, 99.1% branches. units 99.5% branches, solvers 97.4% branches.

## Findings

### Never-NaN and input guards
- parseQuantity never threw across the fuzz set (0, -0, negatives, NaN, Infinity, 1e-30, 1e30, 1e308, 5e-324, strings, empty, "1e999", "0x10", "1,5mm", Devanagari digits, NUL, "NaN mm"). It returns ok:false with a typed error.
- q, fromUnit, toUnit and pow reject non-finite input with InvalidValueError.
- mul overflow throws InvalidValueError. No NaN or Infinity output was produced by any units function. formatQuantity(1e30 m) gives "1e+21 Gm" and formatQuantity(1e-30 m) gives "1e-18 pm".
- The unit-level fuzz thrown errors were all typed InvalidValueError except m-3 below. The harness fed wrong-typed values (strings, objects) to number APIs. All were caught by the `Number.isFinite` guards.

### MAJOR

**M-1. brent default `maxIter` is 100, but SPEC states the self-heating solver is at most 50 iterations.**
- Location: src/core/solvers/rootfind.ts:134 (default 100); bisect default 200 at :103.
- Behaviour:
  - Typical brent is 31 to 38 iterations at xtol 1e-12 on 1e4-wide brackets. This leaves little headroom against 50.
  - A multiple root ((x-1)^3) exhausts all 100 iterations and fails with MAX_ITER, where bisect succeeds in 49.
  - The failure is returned as a value, not a loop, so it is safe. But brent is not a strictly better choice than bisect for flat or multiple roots.
- Action: the self-heating caller must pass `maxIter: 50` explicitly and add a brent-to-bisect fallback. Add a test with a multiple-root case.
- Owner: calc-implementer (Phase 1 self-heating-solver). Phase 0 owner: test-engineer, for the multiple-root test.

**M-2. Coverage threshold and the units branch-coverage exit criterion (>=95%) are not enforced in CI or config.**
- Location: vite.config.ts:11-15 (no `thresholds`); .github/workflows/deploy.yml runs `npm test`, not `test:coverage`.
- Measured: units 99.54% branches, so the criterion is met today. The committed coverage/ directory is stale (59% lines) and misleading.
- Action: add coverage thresholds for src/core/units, run `test:coverage` in CI, and delete or ignore the stale coverage/ directory.
- Owner: devops-engineer.

### MINOR

- **m-1. Brent reports ok:true on a sign discontinuity.**
  - Location: src/core/solvers/rootfind.ts:167-176.
  - Evidence: `brent(x<0.5 ? -1 : 1, 0, 1)` returns ok:true, x=0.49999999999909, fx=-1, 40 iterations.
  - Default ftol is 0, so there is no residual check, and callers must inspect `fx`.
  - Action: document this, or add an optional `residualCheck`. Self-heating residuals are continuous, so this is low risk.
  - Owner: calc-implementer.
- **m-2. A solver exception from `f` propagates.**
  - Location: src/core/solvers/rootfind.ts:80, 205 (the f(...) calls). Evidence: brent(() => { throw }) propagates.
  - The header says "failures are returned as values". Either wrap the calls and return NON_FINITE or CALLBACK_ERROR, or state in the docs that callbacks must not throw.
  - Owner: calc-implementer.
- **m-3. formatQuantity throws a raw RangeError for `opts.sig = NaN`.**
  - Location: src/core/units/format.ts:59.
  - `Math.max(1, NaN)` is NaN, and `toPrecision(NaN)` throws RangeError, not the typed InvalidValueError. Only reachable with a caller bug.
  - Fix: `Number.isFinite(sig) ? ... : 6`.
  - Owner: units-engine-engineer.
- **m-4. parseQuantity silently underflows and normalises -0.**
  - Location: src/core/units/parse.ts:26 (only the Infinity case is rejected).
  - "1e-400 mm" parses to ok:true with si 0. "-0 mm" parses to ok:true with si 0.
  - Rule 10 says zero must be rejected, which is a calculator-level guard. Calculators must reject si <= 0 explicitly, and a Phase 1 test must cover "1e-400 mm".
  - Owner: calc-implementer, with units-engine-engineer to consider an underflow warning.
- **m-5. parseHash and serializeHash have no size or key-count cap.**
  - Location: src/state/hash.ts:52.
  - 200k keys took 365 ms, so there is no hang. Browser URL limits bound this in practice.
  - Optionally cap at about 100 keys or 8 KB.
  - Corruption fallbacks are verified: bad percent-encoding, a version mismatch or an empty key discards state, with stateDiscarded true and no throw. `__proto__` in the route gives notfound. `__proto__` or `toString` as a state key stays an own property and Object.prototype is not polluted.
  - serializeHash accepts "NaN" or "Infinity" strings as state values. This is harmless, because state values are strings and the UI must re-parse them through parseQuantity.
  - Owner: ui-engineer.
- **m-6. CI hygiene.**
  - Location: .github/workflows/deploy.yml.
  - Actions are pinned to major tags (v4/v5/v3), not commit SHAs. No `timeout-minutes` on either job. No `concurrency` on the verify job, so PR pushes do not cancel superseded runs.
  - `.nvmrc` is 22, engines is >=22, and local Node is 24. This is consistent.
  - The oracle self-check, typecheck, lint, test, build, size and audit gates are all present. Pages upload and deploy are gated to main.
  - Dist Pages deploy was not observed, so "live Pages URL loads" is unverified here.
  - Owner: devops-engineer.

### Passed checks
- **Purity of src/core:** a grep for document, window, localStorage, Date., Math.random, performance., fetch, process., console. and globalThis in non-test src/core files found 0 matches.
- **Offline:**
  - dist/index.html uses only `./assets/...` relative URLs (base './'). The CSS has no url() or @import.
  - The only absolute URLs in the JS are 3 W3C XML namespace strings from preact (not fetched).
  - The only `fetch(` is the Vite modulepreload polyfill, `fetch(e.href)` on same-origin `<link rel=modulepreload>` hrefs. No XHR, WebSocket, sendBeacon or serviceWorker.
  - No CDN references. There is no service worker, so offline works only once the page is cached or served locally. This is acceptable for "no runtime network calls".
- **Unit cache:**
  - `prefixed` (src/core/units/units-table.ts:101) caches hits only. Misses are never stored.
  - Its upper bound is 9 prefixes times the prefixable base units, which is under 100 entries. A 200k-distinct-miss probe added no entries.
- **Code-splitting readiness:**
  - registry.ts `load: () => Promise<{default}>` uses dynamic imports, and CalcPage handles loading, failed and ready states with a cancel flag.
  - REGISTRY is empty, so no per-calculator chunk exists yet and the split cannot be verified.
  - check:size warns at 50 KB per chunk but does not assert that chunk count is greater than 1. Add that assertion once Phase 1 lands.
- **Error boundary:**
  - Code review shows one boundary per route, keyed on the route so it resets on navigation, and a second boundary per calculator. The fallback shows no stack and no number, and has a reset button.
  - Preact error-boundary behaviour was not exercised at runtime.
- **Gate and audit tooling:** `check:audit` passes (22 ledger rows, 0 data tables). The forbidden-phrase scan covers src, index.html and public, with only gate.ts and gate.test.ts allowed.

## Conditions to close
1. M-1: pass `maxIter: 50` and add a bisect fallback in the Phase 1 self-heating solver.
2. M-2: enforce coverage thresholds in CI.
3. Log m-1 to m-6 in docs/validation/OPEN_RISKS.md.
4. Run a Playwright pass of the built app for console errors, a corrupted hash and offline behaviour in a later phase. It was not done here.
