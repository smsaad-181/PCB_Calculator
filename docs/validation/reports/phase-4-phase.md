# Phase 4 phase-validator report: re-validation for closure (thermal via array and fusing)

- Branch `phase-4`, head `fcf4603`. Date 2026-10-19. Lens: senior engineer and standards auditor.
- This report replaces the earlier phase report (head `3420891`, PASS-WITH-CONDITIONS, M-1 to M-3, m-1 to m-9).
- No edits to `src/` or `tests/`. The only files this validator wrote are this report and a new section at the end of `docs/validation/OPEN_RISKS.md`.
- There was no `npm ci`/`npm install` and no worktree. Before and after the gates, `node_modules` was unchanged:
  - 140 entries;
  - mtime `1792390944`;
  - `.package-lock.json` sha1 `84387a03…`;
  - `package-lock.json` sha1 `5e4cfeca…`;
  - `git status --short` was empty both times.
- Inputs read:
  - `docs/phases/phase-4.md`, `docs/SPEC.md` and `docs/validation/OPEN_RISKS.md` (l.1-30 and l.556-698);
  - `README.md`, `CHANGELOG.md`, `docs/RUNBOOK.md`;
  - the reports `phase-4-calc.md`, `phase-4-pcb.md` and `phase-4-hardening.md`;
  - the diffs `3420891..fcf4603` (docs, SPEC, tools) and `2107b42..fcf4603` (all `src` changes made after the calc and pcb re-reviews);
  - LEDGER S-003d, S-003e and S-045, the `source-verification` skill, and `src/ui/styles.css`.

## Verdict: PASS-WITH-CONDITIONS. Phase 4 can close once conditions C-1 to C-3 are met.

The built scope (thermal via array and fusing) is correct where checked, honestly labelled and properly separated. Every gate passes. There is no BLOCKER.

- The earlier M-2 (scope decision) is **mostly fixed**: SPEC l.15 and `phase-4.md` now record it. The residual record drift is C-1.
- The earlier M-3 (bundle headroom) is **closed** by a user decision: the ceiling is 460 KB, the measured total is 432.12 KB, and headroom is 27.9 KB.
- The earlier M-1 (task 5, docs, reports) is **partly met**:
  - the reports and docs now exist;
  - task 5 is done only in part, and the human's own scope decision says "Final hardening (task 5) stays required by the exit criteria".

So task 5 must be recorded as a **partial deferral that the human explicitly accepts** (C-2). It must not be recorded as done.

**Closure conditions (all must be met before the closure record is written):**

| # | Condition | Owner |
|---|---|---|
| C-1 | Sync the records. This is docs only and must be in the closure commit:<br>- Close R-6 (pointing to `phase-4.md` §Scope decision).<br>- Update the PV4-1 to PV4-6 statuses: PV4-1 done except SPEC row 4; PV4-3 and PV4-4 decided; PV4-5 partial; PV4-6 structural half done by CF-5.<br>- Update the stale CF statuses: CF-1, CF-2, CF-8 and CF-13 say "UI OPEN" although P4U-11 to P4U-13 are DONE; CF-4 "source OPEN" although S-045 now exists; CF-7 is still OPEN although N-7 fixed it; CF-14 is still a decision although the 460 KB ceiling is decided; CF-15 says tests are failing although they now pass.<br>- Fix the stale lines D4-3 and l.686 ("N-4 stays with the researcher"; the ledger was corrected in `fcf4603`).<br>- Fix the "uncommitted" section headings (l.559, l.631).<br>- SPEC row 4 (l.60) still reads "Thermal estimates (confirm scope), RF/antenna helper, twisted pair/coax references, fusing".<br>- SPEC l.42 still reads "Offline capable" without the user's definition.<br>- Tick the `phase-4.md` exit-criteria boxes with evidence or a deferral note.<br>- Correct the README and CHANGELOG status lines (m-3). | orchestrator |
| C-2 | The human accepts the task 5 residuals as a logged partial deferral (PV4R-1). Otherwise they must be done before closure: throttled first-load measurement against SPEC "Load < 1 s broadband", axe-style scan (third-party code, needs approval), screen-reader check of the live regions, 200 % zoom and reflow, keyboard behaviour of the radio groups and `<details>` panels, and a long-task trace | human |
| C-3 | The human confirms the offline interpretation (PV4R-2). The recorded wording "every route works with the network cut after load" is **not met for routes never visited**: the hardening report says the lazy chunk would not load. Either the wording becomes "no runtime network calls; no cross-origin requests; a route works offline once its chunk has loaded", or the chunks get preloaded (costs bundle) | human, then orchestrator (wording) |

The human items carried forward do not block closure. They stay OPEN in OPEN_RISKS:
- P4-1/P4U-7: confidence is always low;
- Q-54: the specific heat default;
- Q-56: the IPC scope reading;
- P4U-17: the human browser pass;
- V-13/R-15: CI and live Pages not observed;
- D4-1: setup-node pin;
- PV4-2: permanent deferral of θJA/θJC, spreading, RF/antenna and twisted pair.

## 1. Gates (run by this validator)

| Gate | Result (real output) |
|---|---|
| `npm run typecheck` | `tsc --noEmit`, no output, exit 0 |
| `npm run lint` | `eslint .`, exit 0, no findings |
| `npm test` | `Test Files  172 passed (172)` / `Tests  6906 passed (6906)` (was 6832 at `3420891`) |
| `npm run build` | `✓ built in 332ms` |
| `npm run check:size` | `largest first-load PathLoad 133.53 KB of 150.00 KB`; `total 432.12 KB gzip JS of 460.00 KB ceiling (76 files)`; `check:size: PASS`. Fusing 62.06 KB, ThermalVia 56.61 KB first load |
| `npm run check:audit` | `10 data tables audited, 106 ledger rows checked`; `check:audit: PASS` |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `python tools/reference/ref_calcs.py` (Windows; `python3` is the Store stub) | exit 0; 2071 `OK` lines, 0 other lines; 59 `thermalvia_*`/`fusing_*` lines (45 + 14, matching the CHANGELOG) |
| `python tools/reference/gen_golden.py --check` | `OK   docs/golden-vectors.json matches the oracle` |

Local Node is v24.13.0 and `.nvmrc` is 22 (R-15).

The built bundle was checked for network use:
- `dist/index.html` has CSP `connect-src 'none'`.
- The only absolute URLs in `dist` are `http://www.w3.org` (SVG namespace, 7×) and `https://jlcpcb.com` (fab-profile source text). Neither is fetched.
- There is no `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource` in non-test `src`.

## 2. Exit criteria (`docs/phases/phase-4.md`)

| Criterion | Status | Evidence |
|---|---|---|
| θJA never presented as a design constant | **MET** | Unchanged from the earlier report §2 (warning `NOT_THETA_JA` is always on; title and status lines say so; tests). `fcf4603` added no θJA value. The `phase-4.md` box is still unticked (C-1) |
| Fusing and heating clearly separated | **MET** | As before, plus the reverse link now exists. The self-heating page links to `#/calc/fusing` (`SelfHeating.tsx`, `self-heating.vm.ts`, test in `self-heating.vm.test.ts`; pcb re-review m-7 FIXED). The over-10 s headline now says "Outside this model: beyond 10 s, heat loss to the board and air dominates … use the trace self-heating calculator" (`fusing.vm.ts` `NOT_MEANINGFUL_TEXT`) |
| Final validator reports PASS and RUNBOOK/README complete | **MET WITH CONDITIONS** | Reports: `phase-4-calc.md` PASS-WITH-CONDITIONS (head `2107b42`), `phase-4-pcb.md` **PASS** (head `2107b42`), this report PASS-WITH-CONDITIONS. Under CLAUDE.md, PASS-WITH-CONDITIONS closes a phase once the conditions are logged. README (85 lines) and RUNBOOK (99 lines) cover the features, the deferrals, the no-compliance policy, the budget, deployment, honest validation status, preview on :4173, manual perf/offline/a11y procedures, data flows, the ledger workflow, agent safety rules, the V-13 runner note and rollback. Residual inaccuracies are m-3. Task 5 is partial (§2.1) |

### 2.1 Task 5 (final hardening): partial; it must be recorded as a partial deferral

The evidence is `docs/validation/reports/phase-4-hardening.md`. That report was written by the orchestrator: scripted Playwright against :4173, with the scripts not kept. It is **not independent**, and this validator has no browser tool to repeat it. What I could corroborate is marked "(validator)".

| Part | Done | Not done | Assessment |
|---|---|---|---|
| Performance audit | Route switches for 27 routes (slowest 375 ms); loopback cold load (DCL 12-17 ms, FCP 32-52 ms, which the report itself says is meaningless for the SPEC target); bundle budgets (validator: 432.12/460 KB, largest route 133.53/150 KB); compute time from unit tests (µs) | Throttled broadband first load against SPEC "Load < 1 s"; long-task trace; no `perf-stability-auditor` report since Phase 0 | **Partial.** The SPEC load target has never been measured |
| Offline test | 27 routes, same-origin requests only, no console errors; after cutting the network, navigation to 4 already-visited routes worked. (validator) CSP `connect-src 'none'`, no network API in `src`, no cross-origin URL fetched in `dist` | Unvisited lazy routes while offline (reported to fail); reload while offline (not required by the user decision) | **Met for "no runtime network calls".** The recorded wording "every route works with the network cut after load" is not met for unvisited routes (C-3) |
| Accessibility pass | Structural checks on 27 routes (one h1, `main`, every control labelled, button names, img alt); 40 Tab presses on Fusing reached 12 stops with no trap. (validator) WCAG contrast computed from `src/ui/styles.css` variables: all text pairs ≥ 4.5:1 in both schemes (light: fg/bg 16.91, muted/card 7.42, link/card 6.96, warn-fg/warn-bg 10.28, err-fg/err-bg 10.44, focus/card 4.74; dark: muted/warn-bg 6.16 lowest). Input borders use `--muted` (8.04:1). `--border` (1.68:1 light) is used only for decorative card and table rules | axe-style scan (needs approval: third-party code); screen reader; 200 % zoom/reflow; radio-group and `<details>` keyboard behaviour; contrast of rendered pages (my check is palette-level only and does not cover opacity or overrides) | **Partial** |
| Docs | README, RUNBOOK, CHANGELOG written | Status lines inaccurate (m-3) | **Met with fixes** (C-1) |

**Conclusion.** Task 5 is not done in full. It is adequately bounded: everything not done is listed explicitly in the hardening report, in RUNBOOK §Performance/offline/accessibility and in OPEN_RISKS D4-2 and "Phase 4 hardening". Because the human made task 5 a required part of the exit criteria, the residuals need the human's explicit acceptance as a partial deferral (C-2, PV4R-1). Agents cannot close it themselves.

### 2.2 Scope deferrals

These are logged in `phase-4.md` §Scope decision, SPEC l.15, README §What is not built, CHANGELOG, OPEN_RISKS PV4-2 and the LEDGER placeholder S-043…S-044 (now 9 cells; the earlier m-5 is fixed).

Residual: SPEC row 4 (l.60) and R-6 are not updated (C-1).

## 3. Spec traceability (built scope; changes since `3420891`)

The table in the earlier report §3 still holds. The new behaviour was traced as follows:

| Requirement / change | Code | Test | Gap |
|---|---|---|---|
| Not-checked validity item (earlier m-1) | `result.ts` l.141-142 `notChecked?`; l.522 excludes it from the low-forcing rule; the UI reads the flag (`fusing.vm.ts` `notCheckedChecks`) and the name regex is removed (grep of non-test `src/ui` for `IPC scope for fusing/` is empty) | `result.schema.test.ts` (+33 lines); fusing vm tests | none |
| Ledger ids cited in text (earlier m-3) | thermal-via `meta.ts` ids include S-015, S-019m and now S-045; fusing cites S-009, S-015, S-019m | ledger-sync, `check:audit` (106 rows) | none |
| Density basis (earlier m-4) | fusing assumption cites S-003d (IACS) and S-003e (CONFLICT) as a reference not used | fusing calc tests | none |
| End-temperature time thresholds (calc N-5) | `fusing/calc.ts` `SUB_MS_END_TIME`, `OVER_1S_END_TIME`, `OVER_10S_END_TIME`, `END_TEMP_NEAR_START` (5 K, `meta.endNearStartKelvin`, labelled a product choice); pinned in `fusing.vm.ts` `pinWarningCodes` | `fusing/calc.test.ts` (+57), `fusing.vm.test.ts` (+64) | Not re-reviewed by calc or pcb (both at `2107b42`); see m-6 |
| Relief callout (pcb m-N6), thermal-relief text (calc N-2) | `thermal-via/calc.ts` `RELIEF_TEXT` (no "dominate", cites S-045, "size of the effect is unknown"); `thermal-via.vm.ts` `reliefCallout`; `ThermalVia.tsx` l.57 `underHeadline` | `thermal-via.vm.test.ts` (+24) | none |
| End-temperature headline (pcb m-N4) | `fusing.vm.ts` `endTempHeadline` (label "your value, not checked"; 1 s/10 s cue from `meta.timeWarnings`); `ResultsPanel` `aboveHeadline` | `fusing.vm.test.ts` | none |
| Bundle ≤ 150 KB/route, ≤ 460 KB total | `tools/check-size.mjs` `TOTAL_BUDGET = 460 * 1024`; SPEC l.41 | gate | none (decided) |
| Load < 1 s broadband (SPEC l.41) | none | none | **Never measured** (C-2) |
| Offline capable (SPEC l.42) | CSP, no network API | `csp-plugin.test.ts` | Wording vs behaviour (C-3) |

## 4. Standards honesty and claim audit

- **Forbidden phrases in Phase 4 sources** (`compliant|certified|guarantee|production safe|\bsafe\b|conforms?`, non-test files of fusing, thermal-via and both pages): every hit is a negation ("not a fuse rating and not a safe overload limit", "never a safe current", "no result is rounded toward a presumed safe side"). `gate.ts` is untouched by Phase 4. The repo phrase audit passes.
- **README / CHANGELOG / RUNBOOK** (grep for `accessib|offline|validated|compliant|certified|guarantee|safe|verified against|meets|conform`). There are **no overclaims**:
  - No "accessible", "offline capable", "validated against standards" or "compliant".
  - README l.3 says "no runtime network calls", which is true.
  - README l.19 says "not a fuse rating and not a safe current".
  - README l.36 states the no-compliance policy.
  - README l.71 says IPC/IEC were not read.
  - The inaccuracies found all **understate** the work (m-3).
- **New text in `fcf4603`.**
  - `RISE_TEXT` and `RELIEF_TEXT` are now qualified ("usually a lower bound … not assured"; "size of the effect is unknown").
  - The end-time thresholds are labelled "product choices, not sourced limits".
  - `NOT_MEANINGFUL_TEXT` no longer says "would not fuse".
  - The thermal-via `DIAMETER_HELP` names Eurocircuits "finished + 0.1 mm … one fab practice, not a standard, and no allowance is built in". The claim is correct (web check below), but it has no ledger row (m-4).

## 5. Source ledger: sync and spot-checks

- **Sync.** `tests/ledger-sync.test.ts` passes inside the full run, and `check:audit` checks 106 rows (105 before, plus S-045).
- **S-045 status.** S-045 is VERIFIED for a caveat only.
  - The skill rule is "two independent sources agree, at least one tier 1-3". TI (tier 3) together with LearnEMC (tier 5) or JLCPCB (tier 3 or 5) satisfies the rule as written.
  - The ledger itself says the row must be downgraded if the human rules that two tier 1-3 sources are needed. That human ruling is **not in OPEN_RISKS** (m-5, logged now as PV4R-4).

Web spot-checks (2026-10-19, all through WebFetch):

| Row / claim | Ledger or code claim | Finding | Result |
|---|---|---|---|
| S-045 (TI THS3095 datasheet) | "do not use the typical web or spoke via connection methodology"; "Web connections have a high thermal resistance"; complete connection around the circumference | [TI document viewer](https://ti.com/document-viewer/THS3095/datasheet/GUID-264019F5-1035-4577-8A67-69D99B217A95): all three quotes found verbatim | Confirmed |
| S-045 (LearnEMC) | "Thermal reliefs are intended to aid in the soldering process." / "They prevent the planes from pulling too much heat away…"; inductance remark is electrical | [learnemc.com/qotw-230424](https://learnemc.com/qotw-230424): both quotes verbatim; "thermal reliefs add negligible inductance compared to the overall connection inductance" | Confirmed, including the ledger's caution about the inductance sentence |
| S-045 (JLCPCB, calc N-4 correction) | "1 to 3 milliohms per pad" (per pad, not per spoke); exposed pads stay solid | [jlcpcb.com/blog/thermal-relief-pad-design](https://jlcpcb.com/blog/thermal-relief-pad-design): "A four-spoke relief with 0.25 mm (10 mil) arms lands around 1 to 3 milliohms per pad"; "Tabs and exposed pads stay solid…"; "Set it to direct connect explicitly" | Confirmed; the N-4 correction is right |
| S-003d | IACS density 8.89 g/cm³ at 20 °C (NBS Circular 31) | [archive.org OCR](https://archive.org/stream/copperwiretables31unituoft/copperwiretables31unituoft_djvu.txt): "8.89 grams per cm³ at 20° C" (one OCR instance reads "8.8g") | Confirmed |
| S-003e | 8.935 g/cm³ at STP (LANL) vs 8.96 (RSC), CONFLICT | [LANL copper](https://www.lanl.gov/science-engineering/periodic-table/element/copper): "8.935 g/cm³ at STP" | Confirmed; CONFLICT is the honest status |
| S-042e | "1.5 to 6.0 times larger than Onderdonk"; a plane 12 mil below adds about 33 % to over 100 % fusing time | [PCD&F 2015-09](https://www.pcdandf.com/pcdesign/index.php/magazine/10293-pcb-design-1509): both statements confirmed; it also says a plane on the underside "had no effect" | Confirmed; UNVERIFIED (one author group) stays correct |
| UI `DIAMETER_HELP` (no ledger row) | Eurocircuits reads hole sizes as finished and drills plated holes finished + 0.1 mm | [Eurocircuits drilled holes](https://www.eurocircuits.com/pcb-design-guidelines-drilled-holes/): "Tool lists … ALWAYS set as the finished hole sizes (ENDSIZE)"; "TOOLSIZE = ENDSIZE + 0.100mm (4mil)" for PTH | Correct, but **not in the ledger** (m-4) |

There are no stale rows. The earlier spot-checks (S-040, S-041b/c, S-042, S-042b, S-042c, S-042d) stand.

## 6. Architecture

- Unchanged and still sound: `src/core` has no DOM, network or clock imports (lint purity rules pass), both calculators run `assertCalcResult`, and compliance wording appears only in `gate.ts`.
- `fcf4603` adds `endNearStartKelvin` to fusing `meta` as a labelled product choice. The UI reads the time thresholds from `meta.timeWarnings`, so there is no duplicated number.
- The UI recognises the end-time row by its result name (`TIME_END_NAME`), and the relief warning by its code. Code-based matching is fine. The name-based match is fragile, in the same way as the earlier m-1, but it only affects a hint (INFO, no action needed now).

## 7. Stability and security

- Unchanged: guards on every input, no raw HTML (`innerHTML`/`dangerouslySetInnerHTML` absent from non-test `src`), state keys documented, per-route error boundary, `npm audit --omit=dev` 0 vulnerabilities, no new dependencies, no secrets.
- `END_TEMP_NEAR_START` is a caution only. The result is still computed from validated inputs.

## 8. Deployment

- `deploy.yml` is unchanged in Phase 4. Base `./`. Actions are pinned by SHA. Rollback is documented (RUNBOOK §Rollback).
- Action check today: [actions/setup-node releases](https://github.com/actions/setup-node/releases) lists v7.1.0 (08 Oct, "Latest"). The pin is still v7.0.0 (D4-1; m-7).
- V-13 (Ubuntu 26 runner) and R-15 (live Pages) are not observed. The RUNBOOK documents both.

## 9. Status of the earlier findings

| Earlier | Status now |
|---|---|
| M-1 task 5, docs, reports | Reports and docs done. Task 5 partial: **C-2** |
| M-2 scope in authoritative docs | SPEC l.15 and `phase-4.md` fixed. R-6, SPEC row 4 and PV4-1 are stale: **C-1** |
| M-3 bundle headroom | **Closed** (user decision 460 KB; 27.9 KB headroom) |
| m-1 notChecked | Fixed (CF-5, P4U-2) |
| m-2 "uncommitted" labels / Owner columns | Owner and Status columns now exist in P4U and CF. The "uncommitted" headings remain (C-1) |
| m-3 ledger ids in text | Fixed (CF-6, N-2) |
| m-4 density basis | Fixed (CF-7/N-7) |
| m-5 malformed placeholder row | Fixed (9 cells) |
| m-6 P4-1 confidence always low | Human, OPEN (carried) |
| m-7 setup-node | OPEN (D4-1) |
| m-8 reverse link | Fixed |
| m-9 V-13 / R-15 | OPEN (carried) |

## 10. Findings

| # | Severity | Finding | Evidence | Owner |
|---|---|---|---|---|
| M-1 | MAJOR (closure condition C-2) | Task 5 is partial. The SPEC "Load < 1 s broadband" target has never been measured. There has been no axe scan, screen-reader check, zoom/reflow check, radio or `<details>` keyboard check, or long-task trace. The hardening evidence is the orchestrator's (not independent; scripts not kept). Task 5 was made required by the human, so only the human can accept the residuals as a deferral | `phase-4-hardening.md` "Not done"; `phase-4.md` §Scope decision "stays required"; §2.1 | human (accept, PV4R-1); perf-stability-auditor / ui-engineer if not accepted |
| m-1 | MINOR (closure condition C-1) | Records out of sync:<br>- R-6 is still OPEN (l.10).<br>- PV4-1 to PV4-6 are all OPEN although partly done or decided.<br>- CF-1, CF-2, CF-4, CF-7, CF-8, CF-13, CF-14 and CF-15 have stale statuses.<br>- D4-3 is stale, and l.686 says N-4 is still open.<br>- The "uncommitted" headings remain (l.559, l.631).<br>- SPEC row 4 (l.60) still shows the old scope, and SPEC l.42 lacks the offline definition.<br>- The `phase-4.md` boxes are unticked | `OPEN_RISKS.md` l.10, 559, 622-651, 666, 686; `SPEC.md` l.42, l.60; `phase-4.md` l.17-19 | orchestrator |
| m-2 | MINOR (closure condition C-3) | The offline decision is recorded as "every route works with the network cut after load" (OPEN_RISKS l.654, RUNBOOK l.56). The hardening report says unvisited lazy routes do not load offline. The behaviour honestly meets "no runtime network calls", but the recorded sentence overstates it | `phase-4-hardening.md` l.8; RUNBOOK l.56 | human (confirm wording) + orchestrator |
| m-3 | MINOR | README and CHANGELOG status lines are inaccurate. They understate, and none overclaims:<br>- "calc, phase and PCB-domain reports (all PASS-WITH-CONDITIONS)": the pcb report is **PASS**.<br>- "task 5 … is not done": it is partial (hardening report).<br>- "No agent has checked the pages in a real browser with a keyboard": the orchestrator's Playwright run pressed Tab on Fusing.<br>- CHANGELOG total 431.00 KB: measured now 432.12 KB.<br>- RUNBOOK l.57 "a contrast test": it exists only for the circuit-value styles (`circuit-choices.test.ts` l.204) | README l.69, l.73; CHANGELOG l.9, l.11; RUNBOOK l.57 | orchestrator |
| m-4 | MINOR | `thermal-via.vm.ts` `DIAMETER_HELP` states a sourced fab practice (Eurocircuits, finished + 0.1 mm) with no ledger row (CLAUDE.md rule 1). The claim is correct (web check §5) and no calculation uses it | `thermal-via.vm.ts` `DIAMETER_HELP`; `grep -i eurocircuits docs/sources` is empty | standards-researcher (row, e.g. S-019n or a note under S-015) |
| m-5 | MINOR | S-045 VERIFIED depends on an open human ruling on whether a fabricator blog is tier 3 or tier 5. The ruling is recorded only inside the ledger note, not in OPEN_RISKS | LEDGER S-045 notes; calc report condition 5 | human (PV4R-4) |
| m-6 | MINOR (process) | The `src` changes in `fcf4603` (calc N-1, N-2, N-3, N-5, N-6, N-7; pcb m-N1 to m-N4 and m-N6) came after the calc and pcb re-reviews (both at `2107b42`). This validator reviewed the diff: text is qualified, the new warnings are labelled product choices and no number changed. Tests (6906) and the oracle pass. The closure record should state that these follow-ups were checked by the phase-validator only | `git diff 2107b42..fcf4603 -- src` | orchestrator (closure record) |
| m-7 | MINOR (carried) | setup-node v7.1.0 not pinned | D4-1; GitHub releases | devops-engineer / Dependabot |
| m-8 | MINOR (carried, human) | P4-1/P4U-7 confidence always low; Q-54; Q-56; P4U-17; V-13/R-15; PV4-2 permanent deferral | OPEN_RISKS | human |

Human-only items from this re-validation are appended to `docs/validation/OPEN_RISKS.md` under "Phase 4 phase-validator re-validation" (PV4R-1 to PV4R-4).

## 11. Can Phase 4 close?

**Yes, once C-1 to C-3 are met.**
- C-1 is a docs-only sync in the closure commit.
- C-2 and C-3 are two human confirmations: accept the task 5 residuals as a partial deferral, and the offline wording.

No re-run of the validators is needed for these conditions, because they change no code or numbers. If the human does not accept C-2, the task 5 residuals must be done and this report re-run.
