# Phase 3 calculations validation (calc-validator), RE-VALIDATION

Date: 2026-10-19. Branch `phase-3`, head 5bada17. This supersedes the first report (head 2876cea, PASS-WITH-CONDITIONS, F-1 MAJOR and F-2..F-7 MINOR). Validator: calc-validator. I am independent of the implementers and made no edits to `src/` or `tests/`.

Scope of this re-run:
- the core changes in 5bada17:
  - reinforced clearance through the T7 mode `next-preferred-impulse-step`;
  - a separate T3 reinforced rule;
  - the second-person VERIFIED rule;
  - frequency gating on the T7 limit;
  - the peak-vs-impulse refusal;
  - the waveform refusal at 0 Hz;
  - S-035/S-006 citations;
  - NUL removal;
- a fresh grep of `docs/`, `src/` and `tests/` for IEC 60664-1 / IPC-2221 table numbers;
- whether the S-030f ledger edit is honest.

## Verdict: PASS-WITH-CONDITIONS

**No BLOCKER, no MAJOR and no numeric defect.**
- F-1 (MAJOR) is closed:
  - the CTI band limits, the IPC elevation breakpoint and the IPC top voltage-band boundary are gone from `docs/`;
  - OPEN_RISKS now says exactly which numbers remain (the IEC abstract scope limits and the Phase 0 trace-current fit constants).
- F-2, F-3, F-5 and F-7 are closed.
- F-6 is mostly closed. The residual is R-2.
- F-4 is unchanged (an accepted deferral, P3-6).
- Two new MINOR findings (N-1, N-2) and one residual MINOR (R-2) are conditions for OPEN_RISKS.

Every lookup and arithmetic rule I tested on my own synthetic tables matched my hand oracle exactly (relative error 0). Every refusal fired where the rules say it should.

## Method (independence protocol)
1. Before reading any implementation, I took the expected rules from:
   - `docs/phases/phase-3.md`;
   - the reworded skill `iec60664-gating`;
   - the SPEC corrections table;
   - LEDGER S-030f;
   - `notes/spacing-iec60664-ipc2221.md`;
   - the OPEN_RISKS sections "Phase 3 redaction" and "Phase 3 core fixes" (CF-1..CF-9);
   - the import help text (`src/ui/components/spacing-help.ts`, for the schema only).
2. The rules I expected:
   - reinforced clearance = T2(next series value above the required impulse) × T4;
   - a required impulse that is not in the series is refused, and the last series value is refused;
   - multiplier mode = T2(U) × m × T4;
   - with T3 populated, reinforced needs `reinforced-clearance-steady-state`, and the result is max(T2 part, T3 × m_ss) × T4;
   - with T3 empty, a peak above the impulse used for T2 is refused;
   - f > 0 needs `scope-max-frequency`, and f above that limit is refused with IEC 60664-4 named;
   - a non-DC waveform at 0 Hz is refused;
   - VERIFIED needs `verifiedBy` to be a person who did not enter or check any record.
3. I built a new scratch vitest harness in the session scratchpad, outside the repo.
   - I ran it with the repo's installed vitest and a scratch config.
   - There was no npm install, no worktree and no change to `node_modules`.
   - The harness was deleted after the run, and `git status` showed no change from me.
4. **The tables were my own fake values.** I chose them so that the "next series step" and the "next table row" give different answers:
   - T2 rows 0.7/1.3/1.9/2.6/3.4/5.1 kV → 0.17/0.31/0.47/0.83/1.29/2.03 mm (PD2 inhomogeneous), plus a homogeneous column;
   - T7 series 0.7/1.9/3.4/5.1 kV (it skips 1.3 and 2.6);
   - T3 0.6/1.2/2.4 kV → 0.21/0.44/0.95 mm;
   - T4 2500/4500 m → 1.0/1.17;
   - T1 rows 120/260 V (cat II 1.3/1.9 kV, cat III 1.9/3.4 kV);
   - T5 60/130/270/430 V → 0.41/0.77/1.63/2.71 mm (PD2 IIIa);
   - T6 groups I ≥ 77, II [55,77), IIIa [33,55), IIIb [11,33);
   - T7 m_reinf,creep 2.3, m_ss 1.7, multiplier 1.4, f_max 13 kHz;
   - T8 B1 22/47/95 V → 0.07/0.13/0.29 mm, plus a per-volt row of 0.0031 mm/V.

   None of these is, or approximates, a standard value.
5. Only after that did I read:
   - `signedBySelf` and `nextPreferredImpulseStep` (`tables.ts`);
   - `requiredDataError`, `scopeTable`, `waveformFrequencyError`, `withWaveformRow` and `squareRmsWarning` (`gating.ts`);
   - the waveform diff.
6. Repo suite: spacing core, the three calculators, `spacing.vm.test.ts`, `tests/audit.test.ts` and `tests/ledger-sync.test.ts` give 10 files and 509 tests, all passing. `node tools/check-audit.mjs` passes (10 data tables, 92 ledger rows).

## Numeric results (oracle = hand arithmetic on my fake tables; altitude 100 m → first T4 row, factor 1.0, unless stated)

### Clearance
| # | Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| C1 | basic, 2.0 kV → next row 2.6 | golden | 0.83 mm | 0.83 | 0 |
| C2 | reinforced 1.9 kV → series step 3.4 (a row step would give 2.6 → 0.83) | golden | 1.29 mm | 1.29 | 0 |
| C5 | reinforced 0.7 kV → 1.9; 3000 m → factor 1.17 | golden | 0.5499 mm | 0.5499 | 0 |
| C15a | category II, supply 230 V → T1 row 260 → 1.9 kV; reinforced → 3.4 | golden | 1.29 mm | 1.29 | 0 |
| C16 / C16b | multiplier 1.4, 2.0 kV (0 m / 3000 m) | golden | 1.162 / 1.35954 mm | same | 0 |
| C17 | homogeneous column, 2.0 kV | golden | 0.747 mm | 0.747 | 0 |
| C18 | reinforced 3.4 → 5.1 (top T2 row) | boundary | 2.03 mm | 2.03 | 0 |
| C22 | series entered in V instead of kV | units | 1.29 mm | 1.29 | 0 |
| C24 | impulse 1900·(1+1e-15) V; 0.7·1e3 V | float boundary | treated as a series value | yes (relative tolerance 1e-12) | 0 |
| C6b | basic, peak 1900 V = impulse 1.9 kV | boundary | allowed, 0.47 mm | 0.47 | 0 |
| C8 | basic, T3 populated, peak 1000 V, impulse 1.3 kV | golden | max(0.44, 0.31) = 0.44 mm | 0.44 | 0 |
| C10a | reinforced, T3 and m_ss 1.7, peak 1000 V | golden | max(1.29, 0.748) = 1.29 mm | 1.29 | 0 |
| C10b | same, peak 2000 V | golden | 0.95·1.7 = 1.615 mm | 1.615 | 0 |
| C10c | same, 3000 m | golden | 1.615·1.17 = 1.88955 mm | 1.88955 | 0 |
| C3 / C15b / E5 | reinforced, impulse not in the series (2.0 kV; 1.3 kV via T1; 0.5 kV below the series) | gating | refuse | INSUFFICIENT DATA "not a value of the preferred impulse series" | n/a |
| C4 | reinforced 5.1 kV (last series value) | out-of-range | refuse | OUT OF TABLE RANGE | n/a |
| C19 | series step 6.0 kV above the last T2 row | out-of-range | refuse | OUT OF TABLE RANGE (T2) | n/a |
| C6a / C6c / C13f | basic, T3 empty, peak 2500 V / 1901 V / sine 1500 V rms (2121.3 V peak) above the impulse | out-of-scope | refuse | OUT_OF_DOMAIN, field workingVoltagePeak, names T3 | n/a |
| C7b | reinforced, T3 empty, peak 3500 V > stepped 3.4 kV | out-of-scope | refuse | refused | n/a |
| C9 | reinforced, T3 populated, no steady-state rule | gating | refuse | INSUFFICIENT DATA names `reinforced-clearance-steady-state` | n/a |
| C10d | basic, peak 2500 V above the last T3 row | out-of-range | refuse | OUT OF TABLE RANGE (T3) | n/a |
| C11a / C11f | f = 5 kHz, T7 without `scope-max-frequency` / no T7 at all | gating | refuse | INSUFFICIENT DATA names the rule | n/a |
| C11b / C11c | f = 5 kHz / 13 kHz exact, limit 13 kHz | boundary | allowed | 0.83 mm | 0 |
| C11d | f = 20 kHz > 13 kHz | out-of-scope | refuse, name 60664-4 | refused, names IEC 60664-4 (S-031) | n/a |
| C11e | basic, f = 0, no T7 | gating | allowed (T7 not needed) | 0.83 mm, SCOPE_NOT_CHECKED | 0 |
| C12 / C12b | shipped empty tables, f = 5 kHz / 0 | gating | INSUFFICIENT DATA, with T7 listed only when f > 0 | as expected | n/a |
| C13a | sine, f = 0 | degenerate | reject | INVALID_INPUT "0 Hz means DC" | n/a |
| C13b | DC waveform, f = 0 | golden | allowed, S-035 cited | allowed, S-035 in ledgerIds | 0 |
| C13e | square stated by rms | warning | SQUARE_RMS_UNIPOLAR | present | n/a |
| C20 / C21 / C23 | T7 series not strictly increasing; series plus `value`; old mode `next-higher-row` | degenerate | reject the table | rejected with clear messages | n/a |
| E1 / E2 / E3 | T7 of another edition: basic f = 0 / basic f = 5 kHz / reinforced | gating | allowed / refuse / refuse | as expected | n/a |
| E6 | supplementary 2.0 kV | assumption | basic lookup, 0.83 mm | 0.83 | 0 |

### Creepage
| # | Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| K1 | basic 250 V rms → row 270 | golden | 1.63 mm | 1.63 | 0 |
| K2 | reinforced, m = 2.3 | golden | 3.749 mm | 3.749 | 0 |
| K3 | CTI 40 → IIIa | golden | 1.63 mm | 1.63 | 0 |
| K3b | CTI 55 (lower bound of II, inclusive) → II, no II column | boundary | refuse | INSUFFICIENT DATA (no column for II) | n/a |
| K7 | associated clearance 2 mm | golden | 2.0 mm, raised to clearance | 2.0, CREEPAGE_RAISED_TO_CLEARANCE | 0 |
| K8 | altitude 9000 m | altitude must not matter | 1.63 mm | 1.63, ALTITUDE_NOT_USED | 0 |
| K6 | sine peak 353.553 V, f = 50 Hz → rms 250 | golden | 1.63 mm, S-035 cited | same | 0 |
| K5 | sine, f = 0 | degenerate | reject | INVALID_INPUT | n/a |
| K4 / K4b | f = 5 kHz with no limit / f = 20 kHz over the limit | gating | refuse | refused | n/a |
| E4 | reinforced, no creepage rule | gating | refuse | INSUFFICIENT DATA | n/a |
| K9 | basic, f = 0, no T7 | golden | 1.63 mm | 1.63 | 0 |

### IPC spacing
| # | Case | Kind | Oracle | App | Rel. err |
|---|---|---|---|---|---|
| I1 | internal 60 V → row 95 | golden | 0.29 mm | 0.29 | 0 |
| I3 | 95 V exact (top row) | boundary | 0.29 mm | 0.29 | 0 |
| I2 | 150 V, per-volt extension | golden | 0.29 + 55·0.0031 = 0.4605 mm | 0.4605 | 0 |
| I4 | sine 100 V rms → 141.421 V peak | golden | 0.29 + 46.421·0.0031 = 0.433906 mm | 0.4339062 | 0 |
| I5 | rms only, no waveform | gating | Insufficient inputs: voltagePeak | same | n/a |
| all | ledger ids | traceability | S-006 cited; S-035 when a waveform is used | yes | n/a |

### Second-person VERIFIED rule (CF-3)
| # | Case | Expected | App |
|---|---|---|---|
| V1 | verifiedBy equals the table's enteredBy | refuse | refused |
| V2 | verifiedBy equals a cell's checkedBy | refuse | refused |
| V5 | verifiedBy equals a T7 rule's checkedBy | refuse | refused |
| V6 | verifiedBy equals the T8 elevation-breakpoint enteredBy | refuse | refused |
| V4 | self-signed table inside an imported bundle | refuse | refused, names the table |
| V3 | a genuine third person | accept | accepted, VERIFIED |
| V1b | `"  val   ENTERER "` against `"Val Enterer"` (extra inner spaces) | refuse (the rule says "ignoring case and spaces") | **ACCEPTED**, see N-1 |

### Sensitivity
These are step functions; see the first report (table unchanged). The new step rule moves the result only at series values. Between series values reinforced is refused, so no non-conservative intermediate-row step can occur (C2 versus a row step: 1.29 against 0.83 mm).

## Closure of earlier findings
| Id | Was | Now | Evidence |
|---|---|---|---|
| F-1 MAJOR | standard numbers in `docs/`; OPEN_RISKS claim false | **CLOSED** | Grep finds no CTI band limits, IPC elevation breakpoint, IPC band boundaries, impulse table, clearance/creepage cells or altitude factors in `docs/`, `src/` or `tests/`. The ledger header and the OPEN_RISKS Phase 3 core sentence now name exactly what remains: S-030a/S-031a scope limits quoted from official IEC abstracts, and S-001/S-010 trace-current fit constants. Both are honest. |
| F-2 MINOR | one reinforced rule for T2 and T3 | CLOSED | C9, C10a-c |
| F-3 MINOR | row step ≠ impulse step | CLOSED | `next-preferred-impulse-step` with a human-entered series; the old mode is rejected (C2, C3, C23) |
| F-4 MINOR | coating credit as a multiplier | OPEN (accepted deferral P3-6/CF-8). Now `appliesTo` and the description "user-stated rule; may not match your standard" are in place | not retested numerically (needs VERIFIED T7) |
| F-5 MINOR | S-035 / S-006 not cited | CLOSED | C13b, K6, I1, I4 |
| F-6 MINOR | waveform/frequency mismatch, unipolar square | MOSTLY CLOSED | 0 Hz refusal and SQUARE_RMS_UNIPOLAR in place. Residual R-2 below |
| F-7 MINOR | raw NUL bytes | CLOSED | byte scan of `src/ tests/ docs/ tools/`: no NUL except `__pycache__/*.pyc` (binary, not source) |

## Grep for standard table numbers (2026-10-19, head 5bada17)
I searched `docs/`, `src/`, `tests/`, `tools/` and `.claude/` (excluding `node_modules`/`dist`) for:
- the IPC elevation breakpoint (metres and feet forms);
- CTI comparisons and CTI-adjacent band numbers;
- IPC band-range strings and "> top band" forms;
- impulse-voltage figures next to "impulse/OVC/overvoltage";
- altitude-factor-like decimals;
- the scope figures.

Results:
- **Shells:** all 8 are still empty: status PAYWALLED-USER-MUST-VERIFY, `entered: false`, 0 rows/columns/cells/groups/rules, no breakpoint, `verifiedBy` blank.
- **`src/` and `tests/`:** clean.
  - The numbers added in 5bada17 are synthetic (fake series 1/2/4/5 kV, 0 Hz cases).
  - Two UI input-format examples in `src/state/state-key-docs.ts` coincide with standard-looking figures. They are a sample impulse entry ("2.5 kV") and a sample CTI entry ("400 V"). They are examples of the text format the user types, not table records, and no code reads them as data. INFO only (see N-2).
- **`docs/`:**
  - The remaining figures are the scope limits quoted from IEC abstracts. They appear in the ledger, the notes and the phase-3-phase report, and are documented as deliberate.
  - The KiCad help quote "frequencies higher than 30kHz" is the same scope figure.
  - Inputs in cross-check plans and earlier validation scenarios are also present (for example "230 V RMS, OVC II, PD2, MG IIIa, 2000 m" in E1/I1, and scenario impulses in phase-3-pcb).
  - None of these is a table value.

## Ledger honesty: S-030f (re-fetched by me, 2026-10-19)
| Claim in S-030f | URL | What I read | Status | Assessment |
|---|---|---|---|---|
| Reinforced clearance: Table F.2 "corresponding to the rated impulse voltage but one step higher in the preferred series of values than that specified for basic insulation" | https://www.ti.com/document-viewer/lit/html/SLUAAR5/GUID-B1A84E91-DDEE-4C92-A54D-03C5F8DE95DD | Verbatim, as quoted in the ledger. The page also prints worked impulse and clearance numbers; I did not record them | PAYWALLED-USER-MUST-VERIFY | Honest. "Re-read 2026-10-19 by fetcher; previously search snippet only" is accurate |
| Reinforced creepage "twice the creepage distance for basic insulation" | same | Verbatim | same | Honest |
| No public rule for reinforced T3 (steady-state / recurring peak / temporary overvoltage) | same, plus AMC1411 | SLUAAR5 says nothing on these for reinforced | same | Honest |
| AMC1411 (SBASAB3 §8.2.2.1): clearance "taken from the line corresponding to the next higher impulse voltage rating"; creepage "doubled for reinforced isolation"; "The value must be doubled for reinforced isolation" concerns the temporary overvoltage compared with the device rating, not a clearance table | https://ti.com/document-viewer/lit/html/SBASAB3/GUID-E226C2E8-2871-425C-A26D-C554E661C8A1 | Confirmed: the doubled value is the temporary overvoltage, then checked against the device's VIOTM | same | Honest. The correction to the pcb report's reading is right. "Same publisher, not independent" is correctly stated |
| Status unchanged; one publisher; "do not implement except from a human-entered T7 record" | n/a | The code takes the step only from the T7 `series` (no series in code) | PAYWALLED | Status is right: one publisher (two TI documents), numeric rule, standard not read |

`ledger-sync.test.ts` passes, so `ledger-status.ts` still matches LEDGER.md. The compliance gate is unchanged and still denies IEC 60664-1. No spacing text claims compliance.

## Defects / conditions

### N-1. MINOR: the second-person name check does not ignore inner spaces, although its message and help say it does
- **Repro:** a T4 table with `enteredBy: "Val Enterer"`, cells checked by "Other Checker", status VERIFIED, `verifiedBy: "  val   ENTERER "`.
- **Expected:** refused, because the help says "different (ignoring case and spaces)" and the error says "names compared ignoring case and spaces".
- **Actual:** accepted as VERIFIED. `normName` is `trim().toLowerCase()` (`src/core/spacing/tables.ts`, near `signedBySelf`), and `tools/audit-lib.mjs` lines 112-114 do the same. Inner whitespace, non-breaking spaces and Unicode case variants are not normalised.
- **Risk:** low. The check guards against an honest mistake, not deliberate evasion. The wording overstates it, though.
- **Fix:** either normalise (`normalize('NFKC')`, collapse or strip all whitespace, then lowercase) in both places, or change the wording to "ignoring case and leading/trailing spaces".
- **Owner:** calc-implementer (core and audit-lib), ui-engineer (help text).

### N-2. INFO/MINOR: input-format examples resemble standard figures
- **Where:** `src/state/state-key-docs.ts:432` (`"2.5 kV"` impulse) and `:447` (`"400 V"` CTI).
- **Why it matters:** these are format examples, not data. A reader could still take them as typical values, and the repository rule is to keep standard-looking figures out.
- **Suggested fix:** neutral examples such as "1.23 kV" and "123 V".
- **Owner:** ui-engineer.

### R-2. MINOR (residual of F-6): a DC waveform with frequency > 0 is accepted silently
- **Repro:** clearance with `waveform {shape: 'dc', basis: 'peak', value: 230 V}` and frequency 50 Hz (C13c). Result 0.83 mm, no warning.
- **Impact:** the result is numerically the same, but the frequency still drives the T7 scope check, so contradictory inputs pass without comment. The 0 Hz case is refused; this case is not.
- **Suggested fix:** a warning (or a refusal for symmetry), for example "DC declared but frequency > 0".
- **Owner:** calc-implementer.

### Observations (not defects)
- **CF-5 peak comparison for reinforced (C7):** with T3 empty, the peak working voltage is compared with the stepped impulse value (3.4 kV), not with the basic one (1.9 kV). A 2.5 kV peak is therefore accepted for reinforced, while the same input with basic insulation is refused. This is a sanity check, not a standard rule, and T3_NOT_ENTERED (confidence low) is shown. The reinforced steady-state requirement stays unchecked until T3 and its rule are entered. Acceptable as documented, but the pcb-domain-reviewer may want the basic impulse used for this check.
- **Error code:** "INSUFFICIENT DATA" and "OUT OF TABLE RANGE" refusals carry the code `OUT_OF_DOMAIN`, with the state named in the message. The UI distinguishes them by message prefix. This is unchanged from before and consistent.
- **Bundle ceiling:** raised to 430 KB by a logged user decision (SPEC). This is outside calculation scope.
- **Cross-checks:** `tests/crosscheck/` still has no spacing record. One needs real table values, which must not enter the repository. Status: not yet obtained / not applicable.

## What I could NOT verify
- Any IEC 60664-1/-3/-4 or IPC-2221 clause text, table value or rule. This includes the preferred impulse series itself, the reinforced rule for T3, interpolation permission and altitude versus creepage. All of these are paywalled, and I read only the TI pages and official abstracts listed above.
- That `next-preferred-impulse-step` is the standard's own wording. Only TI (two documents from one publisher) states it.
- The correctness of any human-entered table. None exists yet (P3-1), so "Human has signed verifiedBy" is still vacuous.
- The UI rendering of the new help panel and banners. I checked only the help text source, not a browser.

Validator scratch files were kept in the session scratchpad only and deleted after the run. No repository file other than this report was written by me.
