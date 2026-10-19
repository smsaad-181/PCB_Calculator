---
name: impedance-models
description: Analytical transmission-line models for microstrip, stripline, differential pairs, CPW/CPWG, coax as built in Phase 2: which models exist, their ledger status, what is NOT offered, defaults, accuracy classes and the mandatory fabricator-stackup banner. Use when touching Phase 2 routing calculators.
---
# Impedance models (as built, Phase 2)

Source of truth for equations: `docs/sources/notes/impedance-models.md`; model selection and decided defaults: `docs/research/impedance-models.md` and `docs/validation/OPEN_RISKS.md` ('Phase 2 research decisions' Q-1..Q-20). Never implement or change an equation without a ledger row.

## Offered models and status
| Calculator (`src/core/calculators/`) | Model | Ledger | Status |
|---|---|---|---|
| `microstrip` | Hammerstad-Jensen zero thickness (eta0/2pi prefactor); opt-in thickness variants A/B | S-020, S-020a | VERIFIED; variants CONFLICT |
| `stripline` | symmetric, 0.441 form; opt-in cohn-wide (w/b >= 0.35) | S-021, S-021a | VERIFIED; variant CONFLICT |
| `coax` | (eta0/2pi) sqrt(mur/er) ln(D/d), TEM only | S-024 | VERIFIED |
| `diff-microstrip`, `diff-stripline` | edge-coupled even/odd, Zdiff = 2 Zodd | S-022, S-022a, S-022b | PAYWALLED primaries (confidence LOW by the rule); S-022b VERIFIED |
| `cpw`, `cpwg` | conformal map, K(k) by AGM; CPWG Ghione-Naldi form | S-023, S-023a, S-023b | CONFLICT / PAYWALLED / VERIFIED |
| `quarter-wave` | lambda_g/4 = c/(4 f sqrt(eps_eff)), stubs only | S-029c | UNVERIFIED |
Delay, guided wavelength, skew: S-029, S-029a (VERIFIED), S-029b (UNVERIFIED, shown in dataStatus, not in the confidence score). Loss: S-029d (VERIFIED approximation), S-029e, S-029f (UNVERIFIED): dielectric for all, conductor only for microstrip and coax (others say 'conductor loss not modelled for this geometry'); roughness and dispersion not modelled; label is the single `LOSS_LABEL` (an approximate estimate, not a bound; for smooth copper Rs/(Z0 w) overestimates, roughness raises real loss).

## NOT offered (decisions; do not add without a new decision and ledger rows)
Embedded/coated microstrip, offset and broadside stripline, differential CPW/CPWG, microstrip dispersion (Kirschning-Jansen S-020b PAYWALLED, Kobayashi S-020c UNVERIFIED), IPC-2141 legacy (S-025 PAYWALLED), thickness correction for coupled/CPW models, USB 3.x and single-source presets, rf-tool/rftools-mcp cross-checks (unapproved, rule 15), Monte Carlo envelope (> 6 toleranced inputs cannot occur: at most 4), fab-profile JSON import/export (only the bundled profile; deferred), conductor loss for stripline/coupled/coplanar.

## Rules
- Inputs: er has NO default and the UI requires a source note; tan delta likewise; never pre-fill laminate data. The stackup is never part of the URL.
- Hard errors only for undefined/impossible input (NaN, non-positive, er < 1, D <= d, t >= h for the microstrip variants (geometric guard), er = 1 with loss requested); range failures lower confidence with an OUT_OF_RANGE warning. Thresholds not from a source (s/h = 3 weak coupling, w/b = 0.35, 3 delta by analogy) are labelled inferences.
- Confidence: rule-based; one standing 'nominal stackup not verified with the fabricator' assumption, so never 'high'; CONFLICT/PAYWALLED rows make results low.
- Solves (width, spacing, gap, diameter) use bracketed Brent with exact end points; unreachable target = OUT_OF_DOMAIN stating the reachable range.
- Envelope/sensitivity: Phase 1 machinery (`sensitivity.ts`, `tolerance-shared.ts`) through `impedance-envelope.ts`; no default tolerance; 'tolerance corners', never 'worst case'. Fab-profile tolerance and minimum notes use exact-scope `lookupLimit` only.
- Outputs print through `format-result`; delay in ps/mm and ps/in (core note).
- **Mandatory banner (shared constant `IMPEDANCE_BANNER`, never retyped):** "Approximate. Final controlled impedance must be verified against the PCB manufacturer's actual stackup and, where required, field-solver/TDR data." on every impedance result including error and needs-input states.
- Quarter-wave: stubs only; the exact sentence 'free-space lambda/4 is not the guided lambda/4 and no antenna length is computed here' is always shown; no antenna mode.
- Cross-check: `tests/crosscheck/X-01-*`, `X-02-*` and `docs/validation/crosscheck-impedance.md` (human runs the tools; outputs null until then; agreement never verifies a ledger row).
