# JLCPCB published fab limits with scope (gate G-6; ledger S-019i..S-019m)

Researcher: standards-researcher. Retrieved 2026-10-13.
Pages:
- JLCPCB PCB capabilities, https://jlcpcb.com/capabilities/pcb-capabilities (no revision or "last updated" text; footer "© 2026 JLCPCB.COM"; one dated remark "LDI equipment upgraded in June 2025").
- JLCPCB help, "Difference and Tolerance Explanation Between Via and Pad Holes in PCB", https://jlcpcb.com/help/article/difference-and-tolerance-explanation-between-via-and-pad-holes ("Last updated on Apr 24, 2025").
- Checked, not used: JLCPCB blog "Annular Rings in PCB Design" (updated Sep 09, 2026), no JLCPCB-specific numbers; jlc3dp.com user Q&A (not JLCPCB).

Read method: WebFetch (summarizing fetcher), not a browser. The capabilities page was fetched six times with narrow prompts; values agreed across fetches. The fetcher reported the page as complete (no truncation). Quotes are what the fetcher returned as verbatim. Re-read in a browser before any value is used (R-21).

## What was recorded
- S-019i holes and tolerances: drill diameter per layer count (1-layer 0.3 mm, 2-layer and multilayer 0.15 mm, 0.1 mm conditional), via 0.15/0.25 mm (preferred via hole 0.2 mm), min non-plated hole 0.50 mm, through-hole tolerance +0.13/−0.08 mm stated as finished hole size by its example, press-fit ±0.05 mm, slots plated +0.13/−0.08 and non-plated ±0.2 mm, position ±0.075 mm.
- S-019j annular ring: "PTH annular ring" 2-layer 1 oz 0.25 rec / 0.18 abs; multilayer 1 oz 0.20 / 0.15; 2 oz 0.254 mm (both); NPTH pad ring 0.45 mm. No via ring row; via pad must be 0.1 mm (0.15 preferred) larger than the via hole.
- S-019k clearances: via hole to track 0.2, PTH to track 0.28 min / 0.35 rec, NPTH to track 0.2, inner via hole to copper 0.2, inner PTH pad hole to copper 0.3, via/pad hole-to-hole 0.2/0.45, pad to track (1 oz) 0.1 (BGA 0.09 local), SMD pad to pad 0.15, copper to routed edge 0.2, V-cut 0.4 mm.
- S-019l trace/space per copper weight and layer count; track ±20 %; impedance ±10 % (±5 % on request).
- S-019m average hole plating 18 µm; plugged vias ≤ 0.5 mm; via-in-pad 0.15–0.55 mm, default from 6 layers.

## Conflicts and cautions
- The help article (2025-04-24) says, per the fetcher's paraphrase, that only through-hole vias are offered; the capabilities page lists laser blind and mechanical buried vias. Different dates, same publisher; the capabilities page is taken as current. Not resolved.
- "PTH annular ring" headline "≧0.20mm" sits above both absolute minimums in the same row (0.18, 0.15). Use only the scoped sub-values.
- mm and mil trace figures are not equal (3.5 mil = 0.0889 mm vs 0.09 mm). Store both as published; check against the larger.
- "Average" plating 18 µm is not a minimum. No minimum is published.
- Vias have no hole tolerance ("not controlled"). Round NPTH holes have no published tolerance.
- FAQ on the same page says thickness "0.4 mm to 3.2 mm"; table says "0.4 – 4.5 mm". Not used.
- Earlier docs/research/jlcpcb.md §4c called the PTH ring a "via annular ring" and recorded one "hole to track" of 0.2 mm; both corrected in place on 2026-10-13.

## Not published (must be shown as "not published", never defaulted)
Minimum hole plating; aspect ratio; pad size tolerance; layer-to-layer registration; etch compensation; tented/untented via row; tolerance of round NPTH holes; via hole tolerance; drill-bit oversize over finished hole; whether ring and hole-to-track are measured from the finished or drilled hole; 1-layer PTH ring; inner vs outer split of trace minima and hole-to-track rows (except the two "Inner layer" rows); pad to track at 2 oz; ring for 2.5 to 4.5 oz.

## What the user must still verify
- Re-read every value in a browser on the capabilities page (and note the date), because all reads were through a summarizing fetcher.
- Ask JLCPCB (or check the DFM tool) whether "Drill Diameter", "via hole size" and the annular ring refer to the designed finished hole or the drill bit.
- If a minimum barrel plating is needed for a worst-case via check, it must come from the user's fabricator or IPC-6012 (S-015, PAYWALLED-USER-MUST-VERIFY), not from the 18 µm average.
- Status stays UNVERIFIED for all five rows: one publisher, no independent source can exist for a fabricator's own process limits. That is a property of the data, not a gap in research.
