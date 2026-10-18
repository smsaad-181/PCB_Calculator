# Phase 2 phase validation (phase-validator)

- **Validator:** phase-validator (senior-engineer and standards-auditor lens). I did not edit `src/` or `tests/`. Repository files I wrote: this report, plus one appended section in `docs/validation/OPEN_RISKS.md` (human-only items). My scratch scripts (CDP driver, PDF text probe, Chrome profile) are in the session scratchpad, outside the repo.
- **Date:** 2026-10-18.
- **Tree:** `F:/pcb-calc/pcb-calc-kit-v2/pcb-calc`, branch `phase-2`, head `a782ced`, which equals `origin/phase-2`.
  - `git log origin/main..HEAD` shows 16 commits (178 files, +40 098 / −92).
  - `origin/main` is still `63a938e` (the Phase 1 merge). **Phase 2 is not on `main`**, so validate-before-merge (CF-16 / R-26) was honoured for this phase.
  - No Phase 2 PR is open. The only open PRs are from Dependabot: typescript 7.0.2 and setup-node 7.1.0.
- **Read first, numerics not redone:** `phase-2-calc.md` (PASS-WITH-CONDITIONS, F-1..F-6), `phase-1-closure.md`, `phase-1-phase-final.md`, `OPEN_RISKS.md` (Q-1..Q-20, P2-1..P2-35), `phase-2.md`, `PLAN.md` and `SPEC.md`.

## Verdict: PASS-WITH-CONDITIONS (engineering). Phase 2 cannot formally close yet: see section 10.

- **No BLOCKER:**
  - Every gate passes when I run it, and `test:coverage` passed 3 of 3 runs.
  - No compliance wording appears outside `gate.ts`, and `src/core` is pure.
  - Mode A/B is untouched (one comment-only change in `trace-width/meta.ts`).
  - All seven impedance pages show the mandatory banner in the result, error and needs-input states, under the production CSP with zero console messages.
  - The stackup is kept out of the URL, and session storage access is guarded.
- **Two MAJOR findings, both process:**
  - PV2-1: the task 7 / exit criterion 2 cross-check is not met. It needs a human to run the tools.
  - PV2-2: `OPEN_RISKS.md` is not complete enough for closure. calc F-1..F-6 are not logged, the task 1 fab-profile import/export is neither built nor logged as deferred, and there is no Phase 2 row carrying task 7.
- **Six MINOR findings.**

## 1. Gates (run by me; exit codes read from the shell)

| Gate | Result |
|---|---|
| `npm ci` | Not run, as instructed: a `vite preview` on port 4173 holds files. |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run test:coverage` ×3 (flake hunt) | exit 0 on all three runs. Each run: `Test Files 155 passed (155)`, `Tests 6077 passed (6077)`. Branch coverage was **95.50 / 95.52 / 95.54 %**; statements 97.62-97.63, functions 98.81, lines 98.8. No test failed. The branch figure varies between runs, so property-test seeds reach different branches, and the margin is 0.50 pp at the low run (PV2-7). |
| `npm run build` | exit 0 (`built in 311ms`) |
| `npm run check:size` | exit 0. `largest first-load PathLoad 134.73 KB of 150.00 KB`; `total 364.26 KB gzip JS of 400.00 KB ceiling (65 files)`; `check:size: PASS`. Headroom is about 36 KB (P2-35 WATCH). |
| `npm run check:audit` | exit 0: `2 data tables audited, 77 ledger rows checked` / `PASS` |
| `npm audit --omit=dev` | exit 0: `found 0 vulnerabilities` |
| `python3 tools/reference/ref_calcs.py` | exit 0: 2001 `OK`, 0 `FAIL` (last: `OK qw_freq_GHz_ee4.4_L150mm got=0.238201`) |
| `python3 tools/reference/gen_golden.py --check` | exit 0: `OK docs/golden-vectors.json matches the oracle` |

I used no `npx` and killed no process except the headless Chrome I started myself.

## 2. Exit criteria (`docs/phases/phase-2.md`)

| Criterion | Evidence | Status |
|---|---|---|
| Each model's validity range enforced, with out-of-range warning | The calc report's validity table covers every calculator: u, er, w/b, g, D ≤ d, cohn-wide t/b and w/b, CPW h ≥ 2·max(W,s), and coupled g > 3. Out of range means the result is shown with OUT_OF_RANGE, a failed check and low confidence; impossible input is refused. The UI shows failed checks with `RANGE_HINT` (`ImpedanceCommon.tsx`). Where a source gives no range (S-022a, S-023a), none is invented, and the inferred thresholds are labelled as such (section 5). **Gap:** the H-J thickness variants have no t/h or t/w check (calc F-3). | Met, except calc F-3 (MINOR, not logged: PV2-2) |
| Differences from reference tools documented and within model accuracy or explained | `docs/validation/crosscheck-impedance.md` line 3: "NO tool has been run. Every `toolOutputs` value ... is `null`". The kit has 53 cases (X-01 KiCad, X-02 Qucs-S). X-04 rf-tool and X-06 have no human approval (Q-19, rule 15). Tolerances are stated in advance; calc F-4 asks for the stripline tolerance to be widened. | **NOT MET.** The kit is ready, but there are no outputs, so no difference is documented. This waits on the human (PV2-1). |
| "Verify with fab stackup/TDR" banner on every impedance result | Core: `IMPEDANCE_BANNER` is placed in `recommendation` by `impedance-shared.ts:276` for all seven calculators (calc report: "verbatim, on every result"). UI: `ImpedanceResults` renders the banner as a callout in the `ok` state and in the error and needs-input states (`ImpedanceCommon.tsx:165-201`). That component is used by Microstrip, Stripline, Coax, `DiffPage` (both diff routes) and `CoplanarPage` (CPW, CPWG). Browser check (section 9): the banner text is present on all 7 routes with a valid input, on 3 error states (microstrip w=0, CPWG W<0, coax D<d) and on 2 needs-input states. Quarter-wave, not an impedance result, shows it as well, together with its stub/antenna caveat. Net-class copy text also carries it (`impedance.vm.ts:264`, `diff.vm.ts:186`, `coplanar.vm.ts:164`). | **Met** |
| Three validator reports PASS / PASS-WITH-CONDITIONS | calc: `phase-2-calc.md`, PASS-WITH-CONDITIONS. phase: this report, PASS-WITH-CONDITIONS. pcb: not yet written. | Pending the pcb-domain-reviewer |

## 3. Tasks 1-7: built or deferred, and whether each deferral is logged

| Task | Built (evidence) | Deferred / gap | Logged? |
|---|---|---|---|
| 1. Stackup model, editor, fab-profile import/export (JSON) | **Model:** `src/core/stackup/` (`types`, `guards`, `derive`, `json`), covering layers, er, Df, h, copper and soldermask (stored, not modelled: Q-8). **Editor:** `StackupEditor.tsx` on Microstrip, Stripline, diff and coplanar pages. **Stackup JSON:** export plus paste import, with `maxTextLength 200_000`, `maxLayers 64`, an exact `schemaVersion` match and a top-key whitelist (`guards.ts:16-29`, `json.ts:81-106`). Provenance is always "user-entered, unverified". | **Fab-profile import/export (JSON) is not built.** `fab-profile-choice.ts` only loads the bundled JLCPCB JSON, and no user import/export path exists in `src/`. Coplanar-aware derive is missing (P2-20). | Fab-profile import/export: **NOT logged as a Phase 2 deferral.** The only related row is the Phase 1 line "in-app fab-profile editor" deferral (line 240, CF-15). PV2-2. P2-20 is logged. |
| 2. Models; elliptic K by AGM; bracketed width/spacing solvers | All seven calculators; `src/core/math/elliptic.ts` (S-023b, DLMF re-checked by me, section 6). Solves round-trip in the calc report, and unreachable targets are refused with a stated range. Embedded/offset/broadside structures are not offered (Q-4). IPC-2141 (S-025, PAYWALLED) is not implemented. | IPC-2141 legacy mode (the skill says "implement only as labelled legacy") | Partly. Q-4 is logged; the decision to omit IPC-2141 is not stated explicitly (MINOR, PV2-5). |
| 3. Delay, eps_eff, guided wavelength, skew; quarter-wave with antenna warning | `delay-shared.ts`, `quarter-wave.ts`. Browser: every impedance page shows ps/mm, skew and guided wavelength when inputs are given. The quarter-wave page shows the antenna caveat and does not compute an antenna length (Q-18, P2-31). | Core prints the delay envelope in raw SI (P2-34) | Yes |
| 4. Differential calculators with overridable, sourced presets | `diff-microstrip`, `diff-stripline`, `impedance-presets.ts`. A preset only fills the editable target field or compares against it (`diff-presets.vm.ts:22`). Sources and status match the ledger (calc report): USB 2.0 with no default tolerance (Q-10); USB 3.x and single-source presets absent (Q-11, Q-14); CAN and RS-485 as notes only. | Preset band tag can read as a pass (calc F-5) | F-5 not logged (PV2-2) |
| 5. Tolerance envelope (corners ≤ 6 inputs, else Monte Carlo worker) and sensitivity | `impedance-envelope.ts` reuses the Phase 1 `sensitivity.ts` / `tolerance-shared.ts`. Browser: tolerance-corner range and sensitivity render with `kw=10%`. Calc report: corners match brute force to 1e-9. | Monte Carlo worker not built. P2-27: at most 4 toleranced inputs, so the more-than-6 branch can never be reached. The SPEC requirement is met vacuously. | Yes (P2-27) |
| 6. Loss estimate labelled approximate | `loss-shared.ts`. Every loss result is labelled "approximate estimate, lower bound for rough copper..." Conductor loss exists only for microstrip and coax (P2-22). | Conductor loss for the other geometries; roughness; rho(T) | Yes (P2-22, P2-32). The direction-of-bias text is wrong (calc F-1, not logged). Er = 1 gives zero loss (calc F-2, not logged). |
| 7. Cross-check records (X-01, X-02, X-04, X-06) and `crosscheck-impedance.md` | Kit: 53 cases in 7 files under `tests/crosscheck/`, plus the worksheet with step-by-step human instructions. All outputs are null. | Tool runs (human); X-04/X-06 not approved (Q-19) | Q-19 is logged. **No Phase 2 row** says that task 7 / exit criterion 2 is open and owned by the human, unlike the Phase 1 "Task 10 carried" record (PV2-1, PV2-2). |

## 4. CLAUDE.md non-negotiables

| # | Check | Result |
|---|---|---|
| 1 | Constants in the ledger | `check:audit` passes with 77 rows. Rows S-020..S-029f exist with statuses; spot checks are in section 6. Semantic completeness is in section 5. |
| 2 | Compliance wording only in `gate.ts` | `grep -i "compliant\|production safe\|certified\|guarantee"` over `src` (excluding tests and `gate.ts`): only negations or benign uses ("not a guarantee", "not guaranteed extremes", "a minimum guarantee" rounding label, fabricator "guarantees"). Phase 2 code uses only "not a compliance statement" (`diff-presets.vm.ts:139`). Pass. |
| 3/4 | IPC-2152 Mode A / legacy labelling | Untouched in Phase 2. The diff vs `main` in trace-width is one comment-only line ("worst-case" → "tolerance-corner"). Pass. |
| 5 | `src/core` pure | Grep for `Date.now`, `Math.random`, `window.`, `document.`, `fetch(`, storage, `globalThis` and preact in non-test `src/core`: no hits. The two `new Date(` hits are in `eseries.ts` (a comment) and `fab/parse-util.ts:27`, which is deterministic date parsing from Phase 1. Pass. |
| 6 | Units | Delay is held in s/m, and `formatDelayPerLength` converts at the boundary (calc report). Every new input is a `Quantity` with a dimension; a width given as a time is refused (calc report). Pass. |
| 7/8 | CalcResult; rule-based confidence | `assertCalcResult` runs on every output (calc report). `result.ts` gained only an optional `note`. Confidence: nothing reaches high (P2-6). Paywalled and conflicting models rate low by rule (P2-8, P2-14). Pass. |
| 9 | Fab limits only in profiles | The impedance tolerance comes only from a profile `tol-sym` entry at the exact scope, otherwise "not published" (P2-29). No hard-coded fab number. Pass. |
| 10 | Guards | Every new calculator folder has NaN/Infinity tests. The browser showed refusals for w=0, W<0 and D<d with clear messages, and no NaN or Infinity on any page. tan d ≥ 1 and the resistivity window are refused, with text saying "a unit-slip guard, not a standard" (`impedance-shared.ts:143`). Pass. |
| 11 | Tests first / oracle | 2001 oracle vectors; golden check OK. |
| 12 | No runtime network | CSP `connect-src 'none'; worker-src 'self'` (`vite.config.ts:6`), unchanged since `main`. Pages load with zero console messages. Pass. |
| 13 | No GPL code | KiCad and Qucs appear in `src` only as citations in meta/notes text: the Qucs technical documentation (equations, tier 4) and "KiCad's citation". No code-like copies; the algorithms (AGM, `expm1`-based tanh/sinh ratios) are independent. Pass. |
| 14 | Tool agreement ≠ verification | No ledger row has been upgraded from cross-check (all outputs are null). Pass. |
| 15 | No third-party code run | rf-tool and rftools-mcp are not approved (Q-19). I ran only node, python3 stdlib and system Chrome. Pass. |
| — | Never digitize charts | No chart data in the Phase 2 code. Pass. |

## 5. Ledger semantic completeness and inferred thresholds

| Constant / rule | Where | Ledger / labelling |
|---|---|---|
| H-J microstrip and coupled-line constants (`diff-microstrip/meta.ts:27-35`, e.g. 0.2175, 4.113, 20.36) | code | S-020, S-022 formula cells ("exactly as in the note"); calc report: "every constant matches" Steer §5.6 |
| 0.441 effective-width term (stripline) | code | S-021 formula (Pozar 3.179 form) |
| CPW conformal forms; CPWG Ghione-Naldi (Qucs transcription) | `cpw-shared.ts` | S-023 CONFLICT, S-023a PAYWALLED; badges shown in the browser |
| h ≥ 2·max(W,s), caution below 3 | `cpw/meta.ts:30-32` | Sourced: Steer "two or three times" (S-023), P2-16 |
| s/h > 3 WEAK_COUPLING_FIT, solve bracket s/h ≤ 5 | `diff-microstrip/meta.ts:82` | **Inference.** The warning text says "found by a scan, not a sourced limit"; P2-9 NOTED; the calc report finds it conservative. |
| w/b < 0.35 narrow-strip caution (coupled stripline) | `diff-stripline/meta.ts:43` | **Inference.** The text says unsourced; P2-10 DEFAULT. |
| t > 3 delta | `loss-shared.ts:30` | S-029f (Qucs, microstrip). For coax it is applied by analogy, and the check text says it is not a sourced coax limit (P2-24). |
| Small-modulus switch k < 1e-8 | `cpw-shared.ts:38` | Numerical, not physical; P2-17 |
| Resistivity window 1e-9..1e-6 ohm m; tan d < 1 | `loss-shared.ts:31-34` | Unit-slip guards; the message says "not a standard"; P2-25 |
| Coax R' = Rs/(2 pi)(1/a + 1/b) | loss | S-029f notes and second-source cell (calc report) |

I found no unlabelled inferred threshold. The thickness-variant range (calc F-3) is missing rather than invented.

## 6. Source spot-checks (fetched by me 2026-10-18)

| Row | Claim | What I found | Result |
|---|---|---|---|
| S-023b | AGM a(n+1) = (a+g)/2, g(n+1) = sqrt(a g); K(k) = pi/(2 M(1,k')) | DLMF §19.8 (https://dlmf.nist.gov/19.8): eq. 19.8.1 as stated; eq. 19.8.5 "K(k) = π/(2M(1,k′)), −∞ < k² < 1" | Confirmed |
| S-029 | c = 299 792 458 m/s, exact, CODATA 2022 | NIST (https://physics.nist.gov/cgi-bin/cuu/Value?c): "299 792 458 m s-1", uncertainty exact, 2022 CODATA | Confirmed |
| S-024 | Z0 = (eta0/2pi) sqrt(mur/er) ln(b/a), "Exact" (Steer §2.8 eq. 1) | Steer page: same equation, written "= 60 ..." and labelled "Exact. See derivation in Section 2.9." The app uses eta0/2pi from exact SI constants (Q-1, 0.07 % below 60) | Confirmed; Q-1 choice disclosed |
| S-026 / S-026a | USB 2.0 90 Ω differential; tolerance conflicts (±15 % vs ±10 %) | I could not read the TI SPRAAR7J PDF text (glyph-encoded streams; the fetcher could not extract it). Independent search: Renesas RZ/A1 and RZ/T1 app notes give 90 Ω ±15 %; Renesas RZ/A2M gives ±10 % | 90 Ω corroborated by a different vendor. Tolerance conflict confirmed, so S-026a CONFLICT and no default (Q-10) are justified. The TI quote itself is not re-verified by me. |
| S-026c | LVDS 100 Ω nominal (TI SLLA014A) | SLLA014 text not extractable (same encoding). TI DS90LV031A/DS90LV048A datasheets: "matched differential impedance of about 100 Ω"; SN65LVDS180: termination within 10 % | 100 Ω nominal corroborated by TI datasheets. The SLLA014 "90-130 Ω" and "±5 %" quotes are not re-verified by me (the app shows them only as information and invents no tolerance) |

Stale or unsupported rows: none found. The calc report already re-read S-020, S-022, S-023/S-023a and S-029d/e/f.

## 7. Stability and security

- **Error boundary:** `App.tsx:49` wraps every route (keyed). Browser: no boundary text on 14 loads.
- **URL state:**
  - `HASH_SCHEMA_VERSION = 1`, `MAX_HASH_LENGTH 8192`, `MAX_STATE_KEYS 64`.
  - Every Phase 2 key is declared with a description and a cap for each route: `microstrip`, `stripline`, `coax`, `diff-*`, `cpw`, `cpwg`, `quarter-wave` (`hash.ts:406-560`), including kw, kh, ks, ke, kt, ko, ki, td, ds, rho, pw, ps, lc, ls, cw and gs.
  - The **stackup is not in the URL** (`hash.ts:406-407`; only derived scalars and a gs note of 200 characters or fewer).
- **sessionStorage:** access is wrapped in try/catch (`StackupEditor.tsx:40-46`), and `loadStored`/`saveStored` use try/catch with a version tag (`stackup.vm.ts:302-325`). The import textarea has no `maxLength`, but the core rejects more than 200 000 characters before parsing (`json.ts:81`).
- **Worker/CSP:** unchanged (`worker-src 'self'`, `connect-src 'none'`). Phase 2 adds no worker. No `innerHTML` or `dangerouslySetInnerHTML` in `src`.
- **Download:** a Blob URL that is revoked after the click; no network.
- `npm audit --omit=dev`: 0 vulnerabilities.

## 8. Deployment and docs currency

- **Workflow:** `.github/workflows/deploy.yml` is unchanged in Phase 2. Every action is SHA-pinned. Latest releases per the GitHub API today:

  | Action | Pinned | Latest |
  |---|---|---|
  | checkout | v7.0.1 | v7.0.1 |
  | setup-node | v7.0.0 | v7.1.0 (the Dependabot PR is open; CF-15) |
  | setup-python | v7.0.0 | v7.0.0 |
  | upload-pages-artifact | v5.0.0 | v5.0.0 |
  | deploy-pages | v5.0.1 | v5.0.1 |

- **Pages:** the API reports `"has_pages": false`. This is still a human action (R-18 / CF-16). Base `'./'` is unchanged.
- **SPEC:** the repo layout (`SPEC.md:65-81`) does not list `src/core/stackup` or `src/core/math`, the Phase 2 calculators, or the shared modules (`impedance-shared`, `loss-shared`, `delay-shared`, `cpw-shared`, `diff-shared`, `impedance-envelope`). RUNBOOK has no Phase 2 or impedance mention (PV2-4).
- **Skill `impedance-models`** is stale against the decisions:
  - It still lists Kirschning-Jansen dispersion and an IPC-2141 legacy mode as candidates. Q-3 rejects the first, and the second is not built.
  - It gives coax as "60/√εr" (Q-1 uses eta0/2pi).
  - It has no "not offered" list (Q-4) and no mention of the AGM small-modulus branch or the inference labelling (PV2-5).
- **OPEN_RISKS:** see PV2-2.

## 9. Browser check (headless Chrome via CDP, Node built-ins only, production build on :4173)

Port 4173 is up and serves the current build (`index-DfU4-5y3.js`, identical to `dist`), with the production CSP meta present. Each route was loaded via `about:blank` and then the link. I took two snapshots per route (polling until the Result section rendered, then again after 600 ms), so the lazy chunk had loaded.

| Route (link) | Headline shown | Banner | Console |
|---|---|---|---|
| microstrip w=600 um h=635 um er=4.1 | Z0 75.3 Ω, confidence medium | yes | 0 messages |
| stripline w=0.5 mm b=1 mm er=4 | Z0 50 Ω, medium | yes | 0 |
| coax od=4 mm id=1 mm er=2.25 | Z0 55.41 Ω (= 59.9585/1.5·ln 4), medium | yes | 0 |
| diff-microstrip w=s=h=1 mm er=4.5 | Zdiff 120 Ω, low | yes | 0 |
| diff-stripline w=0.5 mm b=1 mm s=636.62 um er=4 | Zdiff 95.4 Ω (2 × 47.68), low | yes | 0 |
| cpw w=500 um s=200 um h=500 um er=1 | Z0 113 Ω, low | yes | 0 |
| cpwg same | Z0 100.4 Ω, low | yes | 0 |
| quarter-wave ee=2.967 f=5 GHz | λg/4 8.702 mm (342.61 mil), medium, antenna caveat present | yes | 0 |
| microstrip w=0 (error) | "width is zero; it must be a finite number greater than zero" | yes | 0 |
| microstrip, no inputs (needs-input) | Asks for w, h, er and the er source (no default) | yes | 0 |
| cpwg W=−1 mm (error) | "width is negative ..." | yes | 0 |
| diff-stripline, no inputs | Needs-input list | yes | 0 |
| coax D<d (error) | "outerDiameter must be larger than innerDiameter" | yes | 0 |
| microstrip + kw=10 %, f, l, dl | ps/mm, skew, guided wavelength, tolerance-corner range and sensitivity all present | yes | 0 |

- All headline values agree with the calc report's anchors.
- Data badges (CONFLICT, PAYWALLED, UNVERIFIED) appear as expected for each model.
- I took no visual, contrast or keyboard pass (CF-17 still open).

## 10. Defects

| # | Severity | Finding | Evidence | Owner |
|---|---|---|---|---|
| PV2-1 | MAJOR (human gate) | Exit criterion 2 / task 7 not met: there are no reference-tool outputs, so no difference is documented or classified | `crosscheck-impedance.md:3` "NO tool has been run"; 53 cases, all `toolOutputs` null. The Phase 1 task 10 kit (24 cases) is also still unrun. | human (run KiCad / Qucs-S transcalc per the worksheet), then calc-validator classifies |
| PV2-2 | MAJOR (process) | `OPEN_RISKS.md` is incomplete for closure: (a) calc F-1..F-6 are not logged (`phase-2-calc.md` requires it); (b) the task 1 "fab-profile import/export (JSON)" is neither built nor logged as a Phase 2 deferral; (c) there is no Phase 2 row carrying the task 7 exit criterion as a human-owned open item (Q-19 covers only tool approval) | grep of `OPEN_RISKS.md` for F-1/F-6, "fab-profile import" and "crosscheck-impedance" finds nothing for Phase 2; `fab-profile-choice.ts` loads only the bundled JSON | orchestrator (log); ui-engineer + calc-implementer (build the fab-profile import/export, or record a human-accepted deferral) |
| PV2-3 | MINOR | Home page shows the category "Routing: Coming in phase 2." at Phase 2 end. `CATEGORIES` has `routing` (phase 2) with no entries; the impedance pages sit under "Impedance and delay". | `registry.ts:14`, `Home.tsx:17-18` | ui-engineer |
| PV2-4 | MINOR (doc) | SPEC repo layout does not list `src/core/stackup`, `src/core/math` or the Phase 2 shared modules; RUNBOOK has no Phase 2 content (for example the cross-check run procedure pointer) | `SPEC.md:65-81`; grep of RUNBOOK | orchestrator |
| PV2-5 | MINOR (doc) | Skill `impedance-models` is stale: it lists Kirschning-Jansen dispersion and an IPC-2141 legacy mode (rejected by Q-3; not built) and coax as 60/√εr (Q-1 uses eta0/2pi). It has no not-offered list (Q-4) and no note on inference labelling. The decision not to build IPC-2141 legacy mode (S-025) is not logged explicitly. | `.claude/skills/impedance-models/SKILL.md:8-13` | standards-researcher / orchestrator |
| PV2-6 | MINOR | The stackup import textarea has no `maxLength` (the core guard at 200 000 characters still rejects before parse), and the stored draft is parsed without a size check | `StackupEditor.tsx:304`; `stackup.vm.ts:302-312` | ui-engineer |
| PV2-7 | MINOR | Branch coverage varies between runs (95.50-95.54 %) with a 0.50 pp margin over the 95 % floor. CF-14 is still open, and `src/state` and the view-models are still outside coverage per CF-14. | Three `test:coverage` runs | test-engineer |
| PV2-8 | MINOR (carry) | Pages still disabled (`has_pages: false`); setup-node one minor version behind (Dependabot PR open); Phase 2 has no PR yet | GitHub API | human + devops-engineer |

The calc findings F-1..F-6 (MINOR) are endorsed as conditions, not repeated here.

## Can Phase 2 close?

Not yet. The engineering is sound, so the verdict is PASS-WITH-CONDITIONS. Closure needs:
1. PV2-2 fixed: log F-1..F-6, a Phase 2 task 7 carry row and the fab-profile import/export decision in `OPEN_RISKS.md`.
2. Either the human runs the cross-check tools (PV2-1), or the human explicitly accepts carrying exit criterion 2 forward, as was done for Phase 1 task 10. Until one of these happens, the exit criterion stays unmet and the closure record must say so plainly.
3. The pcb-domain-reviewer report returns PASS or PASS-WITH-CONDITIONS.
