# Impedance models: research summary and model selection (Phase 2, part A)

Date: 2026-10-18 (standards-researcher). Equations, quotes, sources and how each source was read are in `docs/sources/notes/impedance-models.md`, and ledger rows are S-020 … S-025 with sub-rows. Nothing here is from memory. Where no source was read, this document says "not found" or "not read".

## Mandatory banner (verbatim from `.claude/skills/impedance-models/SKILL.md`)
Show it on every impedance result:

> **"Approximate. Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data."**

Confidence is capped at **medium** for every model (skill rule). Results from rows that are not VERIFIED also carry the visible unverified badge (CLAUDE.md rule 1).

## Ledger status at a glance
| ID | Model | Status |
|---|---|---|
| S-020 | Microstrip, Hammerstad-Jensen quasi-static, zero thickness | VERIFIED |
| S-020a | Microstrip thickness correction (H-J vs Wheeler; full vs simplified procedure) | CONFLICT |
| S-020b | Microstrip dispersion, Kirschning-Jansen 1982 | PAYWALLED-USER-MUST-VERIFY |
| S-020c | Microstrip dispersion, Kobayashi 1988 | UNVERIFIED |
| S-020d | Microstrip, Wheeler-type analysis/synthesis | UNVERIFIED |
| S-021 | Symmetric stripline, zero-thickness approximation (0.441 form) + synthesis | VERIFIED |
| S-021a | Symmetric stripline, finite thickness (Cohn family) | CONFLICT |
| S-021b | Symmetric stripline, exact K(k′)/K(k) | UNVERIFIED |
| S-022 | Edge-coupled microstrip, H-J 1980 coupled lines | PAYWALLED-USER-MUST-VERIFY |
| S-022a | Edge-coupled stripline, Cohn 1955 approximate | PAYWALLED-USER-MUST-VERIFY |
| S-022b | Zdiff = 2·Zodd, Zcommon = Zeven/2 | VERIFIED |
| S-023 | CPW (no lower ground), conformal map, finite substrate | CONFLICT |
| S-023a | CPWG (conductor-backed), Ghione-Naldi | PAYWALLED-USER-MUST-VERIFY |
| S-023b | K(k) via AGM, K′(k) = K(k′) | VERIFIED |
| S-023c | Hilberg K/K′ approximation | UNVERIFIED |
| S-024 | Coax | VERIFIED |
| S-025 | IPC-2141 / IPC-D-317 legacy closed forms | PAYWALLED-USER-MUST-VERIFY |

## Model selection recommendation

### Microstrip (surface, no soldermask)
- **Implement:**
  - S-020: Hammerstad-Jensen εe(u, εr) and Z01(u), with Z0 = Z01/sqrt(εe).
  - Thickness: the H-J Δu1/Δur correction (S-020a) as an **opt-in labelled variant** until Q-2 is decided.
  - Dispersion: off by default (Q-3).
- **Status:** S-020 VERIFIED (Steer §3.5 and Janssen et al. App. D.3 agree). Thickness CONFLICT. Dispersion PAYWALLED (K-J) or UNVERIFIED (Kobayashi).
- **Stated accuracy:**
  - εe: "better than 0.2%" for 0.01 ≤ w/h ≤ 100 and 1 ≤ εr ≤ 128.
  - Z01: "better than 0.1%" for w/h < 1000 (Steer). The tighter 0.01/0.03 % claim was not confirmed.
- **Enforce:** 0.01 ≤ w/h ≤ 100, 1 ≤ εr ≤ 128, t ≥ 0, and h, w > 0. If t > 0 and the thickness variant is off, warn "zero-thickness model".
- **Flag:**
  - finite thickness (which procedure, A or B);
  - no soldermask model (none found);
  - quasi-static, no dispersion;
  - frequency. The Kobayashi range is 0.1 ≤ w/h ≤ 10 with "better than 0.6%" (Steer §4.3), but no explicit onset frequency was found in a read source. Ask a human for the warning threshold (Q-7).
- **Do not claim:** "IPC compliant"; accuracy better than the source statement; dispersion-corrected values unless S-020b or S-020c is enabled and labelled.

### Embedded (buried) microstrip
- **Not found** in any read source. The IPC-2141 embedded form and any εr′ = f(h1/h) correction were not read.
- **Recommendation:** do not offer it. Alternatively, show S-020 with a "not modelled: dielectric above trace" warning (Q-4).

### Symmetric stripline
- **Implement:**
  - S-021 zero-thickness approximation, Z0 = (30π/sqrt εr)·b/(We + 0.441b), with its We rule.
  - Width solve: bracketed root-finding on the analysis equation, seeded by the Steer synthesis (eqs. 17-18).
  - Finite thickness: offer S-021a, wide strips w/(b−t) ≥ 0.35 only, as a labelled "Cohn finite-thickness" variant once Q-5 is decided.
- **Status:** S-021 VERIFIED (Steer §3.7 and the Ansys Lumerical script citing Pozar 3.179). S-021a CONFLICT for narrow strips and for the 94.15 vs 30π constant.
- **Stated accuracy:**
  - Zero-thickness form: none quoted in a read source.
  - Finite-thickness: "better than 1% for W/(b − t) > 0.05 and t/b < 0.025" (Steer).
  - Rogers: round-conductor narrow-strip form is "questionable when T/W exceeds 0.11".
- **Enforce:** b > t ≥ 0. For the finite-thickness variant, w/(b−t) > 0.05 and t/b < 0.025. Warn outside these.
- **Flag:** zero thickness, centered strip only, homogeneous dielectric, bonded (no air voids, per Rogers).
- **Do not claim:** exactness. S-021b (exact elliptic) is UNVERIFIED and must not be called "exact" in the UI.

### Offset (asymmetric) stripline
- **Not found.** No closed form was read.
- **Recommendation:** do not offer it, or offer it only after a human supplies a verified source (Q-4).

### Edge-coupled microstrip
- **Implement (if offered):** S-022 H-J 1980 coupled-line static model for Z0e, Z0o, εee and εeo. Then Zdiff = 2·Z0o and Zcommon = Z0e/2 (S-022b).
- **Status:** PAYWALLED-USER-MUST-VERIFY. Only one secondary was read (Steer §5.6), so the unverified badge is mandatory.
- **Stated accuracy:** "better than 1% for 0.1 ≤ u ≤ 10 and g > 0.01" (Steer).
- **Enforce:** 0.1 ≤ w/h ≤ 10, s/h > 0.01, 1 ≤ εr ≤ 128 (inherited from S-020 εe).
- **Flag:** zero thickness, no dispersion (K-J 1984 coupled not read), no soldermask, symmetric pair only. Show Zdiff = 2·Zodd as a definition, not as extra accuracy.
- **Do not claim:** protocol compliance, or Garg-Bahl or Kirschning-Jansen agreement. Neither was read.

### Edge-coupled stripline
- **Implement (if offered):** S-022a Cohn approximate forms (Caspers eq. 3.3). Label them "Cohn approximation (zero thickness)".
- **Status:** PAYWALLED-USER-MUST-VERIFY.
- **Stated accuracy:** none. The source calls it only "a good approximation".
- **Enforce:** centered pair, zero thickness. By analogy with S-021, the wide-strip assumption suggests w/b ≥ 0.35. That is my inference, not sourced; ask a human (Q-5).
- **Flag:** the exact elliptic forms (ke, ko) were not read.

### Broadside-coupled stripline (optional)
- Not researched. Do not offer it in Phase 2.

### CPW (no lower ground plane)
- **Implement:**
  - Z0 = (30π/sqrt εe)·K(k′)/K(k) with k = W/(W+2s), K by AGM (S-023b).
  - εe: the conformal-map finite-substrate form εe = 1 + ((εr−1)/2)·[K(k1)/K(k1′)]·[K(k′)/K(k)] with k1 = sinh(πW/4h)/sinh(π(W+2s)/4h). Q-6 decides between this and Steer's empirical εe.
- **Status:** S-023 CONFLICT (two εe models). S-023b VERIFIED.
- **Stated accuracy:** Steer's empirical εe is "accurate to 1.5% for h/s ≥ 1". No accuracy figure was read for the conformal-map εe.
- **Enforce:** W, s, h > 0. Warn when h < 2-3 × max(W, s) (Steer guidance) and when the finite ground width is below 3W (Steer).
- **Flag:** zero thickness (the Qucs correction is tier 4 only), no dispersion (fTE = c/(4h·sqrt(εr−1)), tier 4), coplanar grounds assumed wide.

### CPWG (conductor-backed)
- **Implement:** the S-023a Ghione-Naldi form, with k3 = tanh(πW/4h)/tanh(π(W+2s)/4h), q, εe = 1 + q(εr−1) and Z0 = (60π/sqrt εe)/(K(k)/K(k′) + K(k3)/K(k3′)).
- **Status:** PAYWALLED-USER-MUST-VERIFY, with the unverified badge.
- **Enforce:** W, s, h > 0.
- **Flag:**
  - stitching vias and the top-ground width are not modelled;
  - zero thickness;
  - NextPCB's k3 uses πw/2h with full width, a factor-2 conflict. Do not use it as a cross-check without noting this.
- **Do not claim:** via-fence or grounding adequacy.

### Coax
- **Implement:** S-024, Z0 = (η0/(2π))·sqrt(μr/εr)·ln(D/d). Use η0 = μ0·c, not the rounded 60 (Q-1).
- **Status:** VERIFIED.
- **Accuracy:** exact for the ideal TEM geometry (Steer: "Exact").
- **Enforce:** D > d > 0, εr ≥ 1.
- **Flag:** the TE11 cutoff is not computed, so warn "TEM only; higher-order modes not checked". Also eccentricity, braid and connector effects.

### IPC-2141 legacy mode
- **Implement:** the S-025 microstrip and stripline forms with natural log, labelled **"legacy approximation (IPC-2141 / IPC-D-317 form, secondhand)"**. Never substitute them for S-020 or S-021.
- **Status:** PAYWALLED-USER-MUST-VERIFY.
- **Enforce:** none verified. The commonly quoted 0.1 < w/h < 2.0 and εr < 15 are tier 5 only. Show "validity range not verified".
- **Flag:** the H vs b definition. Stripline H is the plane-to-plane spacing in the AN2536 example.

## What can be implemented from VERIFIED sources today
- S-020: microstrip H-J εe and Z0, zero thickness, quasi-static.
- S-021: stripline zero-thickness approximation (analysis). The synthesis is a seed only (single source).
- S-022b: Zdiff and Zcommon definitions, applied to a model that is itself badged.
- S-023b: K(k) by AGM and K′ = K(k′). This applies to the elliptic-integral routine, not to the CPW εe model.
- S-024: coax.
- Derived quantities from the skill: delay = sqrt(εe)/c and λg = λ0/sqrt(εe). These are definitional and still need a ledger row if a new constant is introduced. c is exact (SI).

## What must stay UNVERIFIED-labelled
S-020a thickness, S-020b and S-020c dispersion, S-020d Wheeler, S-021a finite-thickness stripline, S-021b exact stripline, S-022 coupled microstrip, S-022a coupled stripline, S-023 CPW εe, S-023a CPWG, S-023c Hilberg, and S-025 IPC-2141.

## Test-first worked examples (source outputs only)
| Model | Inputs | Published output | Source | Note |
|---|---|---|---|---|
| S-020 | w = 600 µm, h = 635 µm, εr = 4.1, t = 0 | εe ≈ 2.967, Z0,air ≈ 129.7 Ω, Z0 ≈ 75.3 Ω | Steer §3.5 Example 2 | Prefactor 60. With η0/2π, Z0 = 75.267 Ω (researcher) |
| S-020d | Z0 = 75 Ω, εr = 5.6, h = 500 µm | H′ = 2.445, w/h = 0.704, εe = 3.82 | Steer §3.6 Example 3.6.1 | Synthesis seed test only |
| S-023 Z0 relation + S-023c | k = 5/9, εe = 6.28 (given) | K/K′ ≈ 0.833, Z0 ≈ 45.1 Ω | Steer §3.8 Example 3.8.1 | Page geometry inconsistent (w = 200 vs 500 µm); use k directly |
| S-025 microstrip | W = 8, H = 5, T = 1.4 mil, εr = 4.1 | "≈ 50Ω" | AN2536 eq. 4 | Recomputed with ln: 49.80 Ω |
| S-025 stripline | W = 9, b = 24, T = 1.4 mil, εr = 4.1 | "≈ 50Ω" | AN2536 eq. 6 | Recomputed with ln: 49.44 Ω |

- **No published example was found** for S-021 (Steer Example 1 is disputed), S-021a, S-022, S-022a, S-023a or S-024.
- For those, the test engineer must use oracle vectors computed from the ledger formula. Such vectors test implementation against formula and do not verify the model.
- AGM hand check: K(1/sqrt 2) = 1.854075 (researcher arithmetic; the closed form was not read).

## Questions needing a human decision
- **Q-1:** Prefactor: 60 (Steer) or η0/(2π) with η0 = μ0·c = 376.730 Ω? This affects S-020, S-024 and the 94.15 vs 30π choice in S-021a/S-022a. A spread of 0.07 to 0.1 % must be pinned for golden vectors.
- **Q-2:** Microstrip thickness: full H-J procedure (A) or simplified (B)? H-J or Wheeler Δw? A spread of about 0.4 % in Z0 and 0.9 % in εe at u = 2 is enough for the choice to matter. The paper is paywalled.
- **Q-3:** Dispersion: offer it at all in Phase 2? If yes, use Kobayashi (one open source, 0.6 %) or Kirschning-Jansen (paywalled, the community default, best in Atwater 1988)?
- **Q-4:** Topologies with no read source (embedded microstrip, offset stripline, broadside-coupled): omit them, or obtain sources first?
- **Q-5:** Stripline finite thickness: accept the Cohn wide-strip form (formula agreement up to the constant) and refuse narrow strips, or show both narrow-strip variants? Also, the edge-coupled stripline range.
- **Q-6:** CPW εe: conformal map (S-023) or Steer's empirical fit? I recommend the conformal map because it shares K with Z0, but only one tier-2 source was read for it.
- **Q-7:** The frequency at which to warn "dispersion not modelled". No onset threshold was found in a read source.
- **Q-8:** Soldermask: no model was found. Flag only, or research a source in part B?
- **Q-9:** Is Steer (an NC State open textbook on LibreTexts) acceptable as a tier-2 "established textbook" for VERIFIED rows? I treated it as tier 2.
