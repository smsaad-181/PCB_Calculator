# Phase 2 PCB domain review (pcb-domain-reviewer)

- **Reviewer:** pcb-domain-reviewer. I reviewed as a practising PCB, signal-integrity and RF layout designer.
- **Date:** 2026-10-18. **Branch:** `phase-2`, head `f9d761e`.
- **Edits:** I did not edit `src/` or `tests/`. This report is my only repository file. My scratch scripts are a dump-dom driver and a CDP driver, both Node built-ins only, and they lived in the session scratchpad. They have been deleted.
- **Read first, not redone:**
  - `phase-2-calc.md` (F-1..F-6);
  - `phase-2-phase.md` (PV2-1..PV2-8);
  - `phase-1-pcb-final.md` (my standard);
  - `OPEN_RISKS.md` (Q-1..Q-20, P2-1..P2-35, PV2 rows);
  - `docs/research/impedance-*.md`, `crosscheck-impedance.md`, `PLAN.md`.
- **Method:**
  - I used the production build on `http://localhost:4173/`. Playwright MCP was not available to this agent.
  - Each scenario is one shared-link hash rendered with headless Chrome `--dump-dom`, so every scenario also exercises the URL workflow.
  - I drove the stackup editor (JSON import, signal-layer pick, "use derived values") with a CDP script, and closed the browser with `Browser.close`. I killed no process and installed nothing.
  - I hand-checked every key number.

## Verdict: PASS-WITH-CONDITIONS

There is no BLOCKER.
- Every number I recomputed is right for the stated model.
- Every impedance result carries the "verify with the fabricator's stackup / field solver / TDR" banner.
- er, the er source and the loss tangent source have no defaults and gate the result.
- Unit slips are refused.
- The antenna misuse case is handled properly.

As a first-pass sizing tool for a controlled-impedance stackup conversation with the fab, I would use it today.

I would **not** yet let a junior engineer paste its numbers into CAD without supervision. The default answers lean one way, and the page says so only in words: zero-thickness copper and no soldermask both make the real board come out *lower* in impedance than shown. In addition:
- one short tag reads as a pass when the tolerance corners say otherwise;
- the copyable net-class text loses the stackup it belongs to;
- a solved 0.044 mm spacing is offered as a starting value with no manufacturability flag.

Findings: 5 MAJOR and 14 MINOR.
- PCB2-1 to PCB2-4 are small fixes. **I require them before Phase 2 closes.**
- PCB2-5 (asymmetric stripline dead end) may be deferred only with a human acceptance row in OPEN_RISKS, and its message fix is still required now.

## Scenario battery (rendered results)

| # | Scenario (link inputs) | App result | My check / public data | Designer comment |
|---|---|---|---|---|
| 1 | 50 Ω microstrip, 2-layer 1.6 mm FR-4 (h 1.51 mm after copper), er 4.4 "JLC stackup page", t 35 µm, width solve | **2.89 mm (113.77 mil)**, medium. Zero-t model; t "NOT used" caution. Variant A: 2.845 mm | Typical 2.8-3.1 mm for er 4.3-4.5. JLC lists FR-4 2-layer Dk 4.5 [1] | Realistic. On a 1.6 mm board the thickness effect is small (−1 % in Z0; variant A at 2.89 mm gives 49.5 Ω). The banner is in the headline, in a callout and in the recommendation. |
| 1b | 4-layer outer: h 0.2104 mm (7628 prepreg, er 4.4 [1]), 50 Ω | 0.403 mm zero-t. Variant B with t 35 µm: 0.372 mm | Fab calculators typically land at ~0.34-0.37 mm with mask | **Drawing the default 0.403 mm with 35 µm copper gives 47.8 Ω** (variant A), −4.4 % before soldermask. With LPI mask (commonly a few %, see PCB2-2) the board lands near 45-46 Ω, at the edge of a ±10 % fab band [1] before any process spread. The page says only "a real trace … has a lower Z0" (PCB2-2). |
| 1c | Same, via stackup editor with soldermask layer above L1 | h 210.4 µm, t 35 µm, er 4.4 derived; note "Soldermask … lowers Z0 slightly"; result still 0.403 mm, medium | — | The editor knows about the copper and the mask, yet the default result uses neither, and the wording differs between pages ("slightly" vs "somewhat") (PCB2-2). |
| 2 | USB 2.0 90 Ω preset, diff microstrip, w 0.2 mm, h 0.2104 mm, er 4.4, spacing solve, no tolerance | **s = 0.044 mm (1.72 mil)**, low; PAYWALLED S-022 warning; Zodd 45, Zeven 94.7, Z0 72.8 Ω | Math consistent: IPC-style coupling estimate 2·72.8·(1−0.48e^(−0.96·0.207)) ≈ 88 Ω. JLC minimum spacing is 0.09 mm multilayer [1] | **Unbuildable. No flag.** The bundled JLC profile already holds the minimum spacing (Phase 1 net-class uses it), but nothing compares the solved value with it (PCB2-4). The net-class copy box is offered for this value. |
| 2b | USB preset, Zdiff mode, w 0.3 / s 0.15 mm, tol ±10 % chosen, kw/ks/kh 10 %, ke 5 % | Zdiff 96.6 Ω; statement "7.35 % above … within ±10 % (81-99 Ω)"; tag **[within the stated +/-10 % band]**; tolerance corners **85.2 … 109 Ω** | — | **calc F-5 confirmed live.** The tag says "within" next to an envelope that exceeds 99 Ω (PCB2-1). The USB tolerance choice works; there is no default, and the CONFLICT label is clear. |
| 2c | Confidence/labelling on the USB pair | "low ●○○ score 4" with reasons: unverified stackup, empirical, PAYWALLED | — | Honest, and the page still gives a usable width/spacing. A designer reads "low" as "wrong", though the H-J coupled fit is what every fab calculator uses and fab spread dominates (PCB2-11). |
| 3 | Ethernet 100 Ω (±10 % tol) diff microstrip, s 0.2 mm, width solve | w 0.307 mm (12.09 mil), low | Coupling estimate ≈ 97 Ω at that w: consistent | Plausible. |
| 3b | LVDS 100 Ω diff stripline, b 0.5 mm, s 0.2 mm, er 4.2, width solve | w 0.186 mm (7.31 mil), Zodd 50, isolated Z0 56.6 Ω; "no PCB tolerance published … none assumed" | Typical 6-8 mil inner pair | Good: no invented tolerance. |
| 4 | Quarter-wave, ee 3.33, 2.4 GHz | λg/4 **17.113 mm** (673.74 mil); λ0/4 31.228 mm labelled "comparison only"; Important box **"This is not an antenna length"**; end-effect direction stated correctly (physical stub shorter) | c/(4·2.4e9·√3.33) = 17.11 mm | Very good misuse handling. eps_eff must be retyped from the impedance page; there is no hand-off link (PCB2-15). |
| 5 | CPWG 50 Ω, gap 0.15 mm, h 0.2104 mm, er 4.4, t 35 µm, 2.4 GHz, width solve | W 0.355 mm, low; cautions: Ghione-Naldi PAYWALLED, dispersion (frequency named), mask, t not used, **stitching vias not modelled** ("unstitched … top grounds float and change Z0"), ground width ≥ 3W not checked | Typical 0.33-0.36 mm on 7628 | Clear. Via pitch guidance (λg/10-λg/20 rules) is absent, but none is sourced, so absent is correct. |
| 5b | CPW (no lower ground), h 1.51 mm, gap 0.15 mm, 50 Ω | W 1.303 mm; **OUTSIDE RANGE h/max(W,s) = 1.16 < 2**, low; MODEL_CONFLICT | — | A designer who picks CPW on a 2-layer board with a bottom pour gets the wrong structure. The h help text says "no lower ground plane in this model". Adequate. |
| 6 | Coax D 2.95 mm, d 0.9 mm, er 2.25 (RG-58 style) | 47.45 Ω, medium; TEM-only caution | 59.9585/1.5·ln 3.278 = 47.46 Ω | Correct. The standing assumption reads "nominal user-entered **stackup (er, h, t)**", and the banner mentions the PCB manufacturer's stackup for a cable (PCB2-9). |
| 7 | Loss, 100 mm, 2.4 GHz, w 2.89 mm, h 1.51 mm, er 4.4, tanδ 0.02 | αd 7.22 dB/m, αc 0.77 dB/m, total **0.80 dB**; skin depth 1.349 µm; "t > 3δ not checked (no t)" | αd = 27.29·(4.4/√3.33)·(2.33/3.4)·0.02/0.1249 m = 7.22 dB/m; Rs = 12.78 mΩ, Rs/(Z0w) = 0.768 dB/m | Numbers right, and the order of magnitude matches measured FR-4 (~1 dB/100 mm at 2.4 GHz). The wording problems are F-1 and the label repeated 7 times (PCB2-10). |
| 8 | Tolerance corners, microstrip ±10 % w, h, er | 42.2 / 49.9 / 58.8 Ω; text "an arithmetic range … not a statistical range and not a verdict on the design"; sensitivities as exponents with plain-English reading | Calc report confirmed corners | Understandable, not presented as a guarantee. Good. In solve mode the envelope sits at the solved geometry and is labelled so. |
| 9a | Stackup editor: 6-layer-style stack, L3 core 200 µm er 4.6 above / prepreg 200 µm er 4.4 below | "cannot be used for a stripline here: … different er; an inhomogeneous stripline is not offered." | — | Correct refusal, but a dead end (PCB2-5). Real fab stackups almost always mix core and prepreg Dk (JLC lists 4.4 / 4.16 / 4.1 for prepregs alone [1]). |
| 9b | Offset strip, 200 µm above / 300 µm below | "offset stripline not offered … (differ by 33.33 %, **symmetry tolerance 1e-7 %**)" | — | A 0.5 % thickness mismatch is refused too: the tolerance is float noise and is not exposed in the UI. The "1e-7 %" means nothing to a designer (PCB2-5). |
| 9c | Microstrip on inner L3 | "embedded microstrip not offered (no verified source); use the stripline model for a centred inner layer" | — | Clear. |
| 10a | Misuse: `w=10`, `h=62` (no unit), `er=4.4 at 1GHz` | "Missing unit in "10"", "Missing unit in "62"", "Enter relative permittivity as a plain number"; no result | — | Unit discipline is excellent; mil/mm confusion is blocked. |
| 10b | Misuse: no er source | No result; "Enter the source of er … it is required" | — | Good prompt. The er help text gives the 3.8-5.3 FR-4 spread and says it varies with frequency, so it does not pick a value. This is the right nudge. |
| 10c | Misuse: diff pair s/h 4.28 | Caution "Weak coupling … found by a scan, not a sourced limit … use Zdiff of about 2·Z0 = 118.38 ohm" | — | Clear and actionable. |
| 10d | Misuse: microstrip at 25 GHz on 0.21 mm FR-4 | Same dispersion caution as at DC ("frequency entered: 25 GHz"); confidence medium unchanged | — | Honest but not specific (PCB2-12). |
| 10e | Misuse: H-J variant A with t = 2 mm on h = 1 mm | 52.4 Ω returned, no range flag | — | calc F-3 confirmed. |

## Decisions on the calc findings

- **F-5 (preset band tag reads as a pass): raised to MAJOR (PCB2-1). Required.** The tag must not say "within" by itself. Acceptable fixes:
  - (a) tag `nominal model value within ±10 %`, with a second tag `tolerance corners 85.2-109 Ω exceed the band` whenever an envelope exists; or
  - (b) drop the tag and keep only the statement.

  Both must add one line: "the fabricator's own impedance tolerance and the model accuracy are not included". A nominal 7 % off target should also read as poorly centred: a designer wants the nominal on target and the band left for the fab.
- **F-1 (conductor-loss bias direction wrong): MINOR, fix before close (text only).** Say that Rs/(Z0·w) is a conservative wide-strip form for *smooth* copper: refined forms (Qucs K_i, Steer eq. 22) are lower. Roughness (not modelled) can raise real loss above it. Delete "optimistic for narrow traces".
- **F-2 (er = 1 with tanδ > 0 gives zero dielectric loss): MINOR, condition.** Refuse, or warn "er = 1 means no dielectric; tanδ ignored". Harmless in practice but contradictory.
- **F-3 (H-J thickness variant accepts t ≥ h, t ≥ w): MINOR, condition.** Heavy copper over thin prepreg (3 oz over 0.1 mm, t/h ≈ 1) is a real case. Without a recorded range, add a caution "t/h or t/w beyond any recorded use of the correction" at t ≥ h or t ≥ w. Do not invent a limit.
- F-4 and F-6: no domain impact, as the calc report says.

## Findings

| # | Severity | Finding | Evidence | Fix | Owner |
|---|---|---|---|---|---|
| PCB2-1 | **MAJOR** (required) | The preset band tag "[within the stated +/-10 % band]" compares only the nominal value of a PAYWALLED model. It sits beside tolerance corners that leave the band (calc F-5). | Scenario 2b: nominal 96.6 Ω, corners 85.2-109 Ω, band 81-99 Ω, tag "within" | As decided above. Also offer the band comparison in **solve** mode against the envelope at the solved geometry: that is the readout a designer actually wants. Today the tolerance select has no effect in spacing/width solve. | ui-engineer |
| PCB2-2 | **MAJOR** (required, part deferrable) | The default answer has a one-directional, unquantified bias on outer layers. The zero-thickness model (default, VERIFIED, medium) ignores t; soldermask is not modelled. Both make the real Z0 lower. On a typical 4-layer outer layer the two together are of the order of the fab's ±10 % band. The page states the direction only ("somewhat lower", "slightly"). The stackup derive knows t and the mask and still feeds the zero-t model. | 1b: 0.403 mm drawn with 35 µm copper gives 47.8 Ω (−4.4 %) by variant A. Mask: secondary sources quote 1-3 Ω on 50 Ω and fabricator empirical factors of ~0.94-0.96 [2][3][4] (not verified, not primary). 1c: editor note "lowers Z0 slightly". | **Now:** (a) when t is entered with the zero-t model, show the variant-A Z0 at the same geometry as a labelled CONFLICT side value ("thickness effect at this geometry ≈ −2.2 Ω (−4.4 %), S-020a CONFLICT"), so the magnitude is visible without changing the headline; (b) make the mask wording identical everywhere and say "can be several percent; not quantified here; ask the fabricator for a coated-microstrip value". **Deferrable (log):** research a sourced coated-microstrip model or magnitude (Polar AP176 / AP169 [2], IPC paper [3]). | calc-implementer (a), ui-engineer (b), standards-researcher (research) |
| PCB2-3 | **MAJOR** (required) | The net-class copy text drops its basis. The microstrip copy is only "Trace width for the target Z0: 2.89 mm (113.77 mil)" plus the banner: no h, er, er source, t, model/variant, mask status, ledger status or date. The diff and coplanar copies add the model status but no stackup. A width without its stackup is the classic controlled-impedance error: the fab changes the prepreg and the CAD width stays. Phase 1's net-class export set this standard (basis, status, age on every value). | `impedance.vm.ts` `startingValueText`; `diff.vm.ts` `netClassText` | Add to every copy text: target, h or b, er + source, t + basis, model (+ variant, CONFLICT/PAYWALLED status), "soldermask not modelled", geometry source note, and the date (injected `today`, as for fab profiles). | ui-engineer |
| PCB2-4 | **MAJOR** (required) | A solved width, spacing or gap is not checked against any fabricator minimum. 0.044 mm (1.72 mil) spacing is presented with a copy box. The bundled profile already carries the minimum trace and space (used by the Phase 1 net class). | Scenario 2; grep shows `traceSpace`/`traceWidth` used only for `tol-sym` in Phase 2 | With a profile chosen: compare at the exact scope and show "below the fabricator minimum (0.09 mm, JLCPCB example, UNVERIFIED, date)". Without a profile: a note "compare with your fabricator's minimum trace/space; none chosen". No hard-coded limit (rule 9). In the diff pages, suggest solving for width at a buildable spacing. | calc-implementer + ui-engineer |
| PCB2-5 | **MAJOR** (deferral allowed with human acceptance; message fix required) | Inner-layer controlled impedance on 6+ layer boards is mostly offset stripline with mixed core/prepreg Dk. The editor refuses both, at 1e-9 tolerance, and offers no next step. Q-4 (user scope decision) excludes offset stripline, so the gap itself is accepted scope. The dead end is not. | 9a, 9b; `derive.ts:45-46` (`SAME_ER_REL`, `DEFAULT_SYMMETRY_TOL` = 1e-9, not exposed) | **Now:** replace "symmetry tolerance 1e-7 %" with plain text. Say "most multilayer inner layers are asymmetric. This page cannot model that. Use the fabricator's field-solver result, or enter b and an er by hand as a rough symmetric approximation (labelled)". **Log:** offset/dual stripline and mixed-Dk handling as a Phase 4 candidate, with human acceptance in OPEN_RISKS. | ui-engineer / calc-implementer; human (acceptance) |
| PCB2-6 | MINOR | calc F-1 text direction (see decisions) | `loss-shared.ts` CONDUCTOR_LOSS_WIDE_STRIP | As above | calc-implementer, standards-researcher |
| PCB2-7 | MINOR | calc F-2 and F-3 (see decisions) | 10e | As above | calc-implementer |
| PCB2-8 | MINOR | Data-panel wording for papers: the S-022 summary row reads "UNVERIFIED ⚠ Not checked against the standard (paywalled): compare with your licensed copy", while the row is PAYWALLED and is a 1980 journal paper, not a standard. The microstrip reference list shows "S-013: Skin depth. edition not yet confirmed. Status: VERIFIED" for μ0 in a lossless Z0 calculation. | 2, 1 | Show the row's real status. Use "primary paper not read" wording for non-standards. Give S-013 a display name such as "μ0 (via skin-depth row)" or split the row. | ui-engineer, standards-researcher |
| PCB2-9 | MINOR | The coax standing assumption reads "stackup (er, h, t) not verified against the fabricator", and the banner speaks of the PCB manufacturer's stackup. | 6 | Coax wording: "cable dimensions and dielectric not verified against the cable datasheet; connector and launch not modelled". | calc-implementer |
| PCB2-10 | MINOR | The loss label "approximate estimate, lower bound for rough copper, no roughness, no dispersion" is repeated on all 7 rows. The "lower bound" claim applies only to the conductor term and is in tension with F-1. | 7 | Show the label once, in the block heading. Say "real loss is usually higher: roughness, Df at frequency, radiation, connectors and vias are not included". | ui-engineer |
| PCB2-11 | MINOR | "Confidence low" on every coupled, CPW and CPWG result reads as "wrong" to a rushed engineer. It actually means the primary paper is unread and the stackup is unverified. | 2c | Add one plain-language line under low confidence: "Low here means source status and an unverified stackup, not a known arithmetic error; the fab tolerance (often ±10 %) usually dominates." | ui-engineer |
| PCB2-12 | MINOR | The dispersion caution is identical at 10 MHz and 25 GHz. No threshold is sourced (Q-7). That is correct, but it gives no sense of scale. | 10d | Without inventing a limit, show a dimensionless electrical-size readout when f is given (h/λg and w/λg) and say "the larger these are, the more the quasi-static value drifts". | calc-implementer |
| PCB2-13 | MINOR | The "Plain text to copy" help says "The solved width" when the spacing (or gap) was solved. | 2 | Use mode-dependent wording. | ui-engineer |
| PCB2-14 | MINOR | The stackup JSON has no date and no fab-stackup reference/revision field. An exported stackup cannot record which fab quote or table revision it matched. | `json.ts` TOP_KEYS | Add optional `date` and `fabReference` fields (user-entered, echoed in the geometry source note). | calc-implementer + ui-engineer |
| PCB2-15 | MINOR | There is no hand-off from an impedance result to the quarter-wave page (eps_eff retyped), and no inverse skew helper (allowed length mismatch for a ps budget). Both are daily routing tasks. | 4 | Add a "use this eps_eff in the quarter-wave helper" link (hash only), and a mismatch-from-skew-budget readout next to skew. | ui-engineer |
| PCB2-16 | MINOR | In spacing/width solve mode the preset tolerance select shows "No tolerance chosen" even when the link carries a valid `tl`, and it has no effect. | 2 vs 2b | Either hide the select in solve mode with a note, or use it per PCB2-1. | ui-engineer |
| PCB2-17 | MINOR (scope log) | Missing for daily routing: embedded/coated microstrip, offset/dual and broadside stripline (Q-4), differential CPWG, via/launch impedance, and a crosstalk or spacing estimator. | — | Log as Phase 4 candidates. | orchestrator |
| PCB2-18 | MINOR (endorse) | Calc F-4/F-6 and phase PV2-1..PV2-8 stand. In particular the cross-check kit (PV2-1) is unrun. Until a human runs KiCad/Qucs-S transcalc, no external tool has confirmed any number. | `crosscheck-impedance.md` | As in those reports. | human |
| PCB2-19 | MINOR | The etch trapezoid, finished vs nominal outer copper and the glass-weave caveat are present but buried in "Details → Assumptions" (fibre weave appears only in the skew note). | 1 | Add a short "Not modelled, and which way it moves Z0" list next to the result: mask ↓, finite t ↓, etch trapezoid ↑, roughness (loss ↑), Dk at frequency (±). | ui-engineer |

## What I would trust today

- **Number realism.** Every scenario landed where experience and fab calculators put it:
  - 2.89 mm on 1.6 mm FR-4;
  - ~0.37-0.40 mm on 7628 prepreg;
  - 6.7-8.1 mil inner strip in b 0.45 mm;
  - 0.36 mm CPWG;
  - 47.5 Ω RG-58-style coax;
  - 0.8 dB / 100 mm at 2.4 GHz.

  No number would embarrass me in design review *as a model value*.
- **Required-input gating.**
  - er and its source have no default, and the help text gives the 3.8-5.3 FR-4 spread.
  - The loss tangent and its source have no default.
  - Preset tolerances have no default.
  - Unit-less lengths are refused.
- **Misuse guards.**
  - The antenna box on the quarter-wave page.
  - The weak-coupling caution with a usable fallback.
  - The CPW/CPWG validity checks.
  - The embedded-microstrip refusal.
  - Stitching vias and ground width flagged as not modelled.
  - The tolerance corners described as arithmetic, not a guarantee.
- **Traceability.** Every result shows method, edition, formula, steps, assumptions and per-row ledger status. The S-020a CONFLICT badge is understandable, because the variant select and the caution both explain it.

## Does Phase 2 meet objective 1 (routing)?

**Yes, for scope.** The impedance family (microstrip, stripline, coax, edge-coupled pairs, CPW, CPWG), delay, skew, guided wavelength, quarter-wave, tolerance corners, sensitivity, loss estimate and the stackup editor are all present and correct for their models.

For daily routing work it is a sound **first-pass sizing and what-if tool**. It is not yet a source of CAD net-class values. That needs PCB2-1 to PCB2-4. Multilayer inner-layer work remains limited by PCB2-5.

**Conditions for closing Phase 2:**
1. Fix PCB2-1, PCB2-2(a, b), PCB2-3, PCB2-4 and the PCB2-5 message, plus the F-1 text.
2. Log PCB2-5 (the offset/mixed-Dk gap, with human acceptance), PCB2-2 research and PCB2-6..PCB2-19 in `OPEN_RISKS.md`.
3. The PV2-1 cross-check stays a human-owned open item.

## Sources (retrieved 2026-10-18)

1. JLCPCB PCB capabilities: min trace/space 0.10/0.10 mm 2-layer, 0.09/0.09 mm multilayer; impedance tolerance ±10 %; 7628 Dk 4.4, 3313 4.1, 2116 4.16, 2-layer 4.5. https://jlcpcb.com/capabilities/pcb-capabilities. Also the JLCPCB impedance calculator guide: https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator
2. Polar Instruments AP176 "Enhanced modelling of solder mask coatings with the Si8000m" (https://polarinstruments.com/support/cits/AP176.html) and AP169 on mask thickness between traces (https://www.polarinstruments.com/support/cits/AP169.html). Qualitative: no coated-vs-uncoated figure on the page.
3. He and Tang, IPC technical paper on coated microstrip (https://www.electronics.org/system/files/technical_resource/E39%26Rongyao%20Tang.pdf). The PDF text could not be extracted. The "0.94-0.96 empirical factor" is from a search summary only and is **not verified by me**.
4. RF Essentials knowledge base (1-3 Ω on 50 Ω, secondary, unverified): https://rfessentials.com/rf-knowledge-base/what-is-the-effect-of-solder-mask-on-the-impedance-and-loss-of-a-microstrip-line/. Also Signal Consulting note on mask and 100 Ω pairs: https://www.sigcon.com/Pubs/news/5_2.htm

Sources 2-4 support only "a few percent, direction down". They are listed to justify asking for a magnitude, not as data for the app.
