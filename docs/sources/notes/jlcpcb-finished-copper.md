# JLCPCB published finished copper per layer (ledger S-019c)

Researcher: standards-researcher, 2026-10-13. Triggered by PCB-domain findings PCB-1, PCB-2, PCB-6 (`docs/validation/reports/phase-1-pcb.md`).
Method: three JLCPCB pages read through a summarizing HTML-to-text fetcher (not a browser; see R-21). Quotes below are as returned by the fetcher. This is fabricator data, not a standard, so it can only go into dated, user-editable fab profiles.

## What each page states

### 1. PCB capabilities page
URL: https://jlcpcb.com/capabilities/pcb-capabilities. No page date; footer "© 2026 JLCPCB.COM All Rights Reserved."
- Finished Outer Layer Copper: "2-layer: 1 oz / 2 oz / 2.5 oz / 3.5 oz / 4.5oz"
- Finished Outer Layer Copper: "Multi-layer: 1 oz / 2 oz"
- Finished Inner Layer Copper: "0.5 oz / 1 oz / 2 oz"
- "Finished copper weight of inner layer is 0.5oz by default."
- Average hole plating thickness: "18μm" (already in S-008/S-015)
- FAQ: "heavy copper (up to 3oz)". This conflicts with the 4.5 oz entry in the table on the same page.
- The page gives copper only in oz, with no thickness in µm or mil and no tolerance.

### 2. Multi-layer PCB standard laminated structures (stackup article)
URL: https://jlcpcb.com/help/article/multi-layer-pcb-standard-laminated-structures. "Last updated on Sep 09, 2026".
"Impedance Control Design Information", copper layer thickness:

| Label (as published) | Value (as published) | Researcher conversion (1 mil = 25.4 µm, S-006) |
|---|---|---|
| Outer Layer Finished Copper Thickness (1 oz) | 1.6 mil | 40.64 µm |
| Inner Layer Finished Copper Thickness (0.5 oz) | 0.6 mil | 15.24 µm |
| Inner Layer Finished Copper Thickness (1 oz) | 1.2 mil | 30.48 µm |

Caveat: the fetcher returned the table flattened, with the three labels first and then "1.6 mil", "0.6 mil", "1.2 mil". The pairing above is by order. Two separate fetches gave the same order, but the table cells were not seen. Confirm the pairing in a browser.

Key reminders, item 4 (short quotes):
- "The copper thickness in the laminate is the finished product copper thickness."
- "for an inner layer of 0.5 oz, the thickness provided by the supplier is 0.0175 mm"
- "an actual thickness of 0.0152 mm is more accurate."
- The page attributes the difference to loss in inner-layer treatment such as deoxidation (paraphrase).
- Consistency check (arithmetic): 0.0152 mm = 0.598 mil, which matches the 0.6 mil table value.

The page has no 2 oz value and no copper tolerance. The ±20 % on the page is for impedance, not copper.

### 3. JLCPCB Copper Weight article
URL: https://jlcpcb.com/help/article/jlcpcb-copper-weight. "Last updated on Sep 09, 2026".
- "1oz copper = copper thickness of 35 µm, which is the thickness of 1 oz of copper spread over 1 ft²."
- FR4 outer: "1oz, 2oz (standard)", with the note "Heavier options for 2-layer only"
- FR4, 2-layer only: "2.5oz, 3.5oz, 4.5oz"
- FR4 inner: "0.5oz (default), 1oz, 2oz", with the note "Availability depends on total layers and overall thickness"
- FPC: "1/3oz, 0.5oz, 1oz"
- "Always refer to the actual online order page for current availability and pricing."
- No finished/base distinction, no µm values for 0.5 oz or 2 oz, and no tolerance.

## Verified
Nothing is VERIFIED. All three pages come from one publisher, so there is no independent second source. S-019c is UNVERIFIED.

## Conflicts
1. **JLCPCB is inconsistent with itself on what "1 oz" means.** The capabilities page calls the oz option "Finished" copper. The copper-weight article sets 1 oz = 35 µm. The stackup article gives a finished 1 oz of 1.6 mil (40.64 µm) for outer layers and 1.2 mil (30.48 µm) for inner layers. Read together, "1 oz" is an order label, and finished thickness depends on the layer.
2. **Outer 1 oz vs secondhand IPC-6012.** JLCPCB's 40.64 µm is below the secondhand Class 2 external minimum of 47.9 µm (S-009, PAYWALLED). The inner values (15.24 and 30.48 µm) are above the secondhand inner minimums (11.4 and 24.9 µm). JLCPCB publishes 1.6 mil as impedance-design data and does not say what it covers, for example whether plating is included or where on the trace it is measured. Treat this as an observation, not as non-conformance. Do not call a JLCPCB default board Class 2 for outer copper.
3. **Maximum heavy copper.** The capabilities FAQ says "up to 3oz", but the table on the same page lists 4.5 oz for 2-layer boards.
4. **Effect on the app's "+37 %" outer caution and the "base + plating" estimate (PCB-2).** JLCPCB's figure is +16 % over 35 µm (40.64/35 = 1.161). The app's +37 % comes from the secondhand IPC Class 2 minimum. These are different quantities: one fabricator's design value and a standard's minimum. Do not merge them.

## Example fab profile (src/core/data/fab-profiles/jlcpcb-2026-10-06.json)
The JSON note says "1 oz is the base outer copper only; other weights and inner-layer copper are not listed here." The published pages **contradict** this:
- JLCPCB calls 1 oz "Finished Outer Layer Copper", not base copper. The stackup article gives a finished thickness of 1.6 mil for that option.
- JLCPCB publishes other weights (outer 2 oz for multilayer, up to 4.5 oz for 2-layer) and inner weights (0.5 oz default, 1 oz, 2 oz). Leaving them out of the profile is a scope choice and is not wrong. But `copperWeightsOzFt2: [1]` together with "base" misdescribes the source.
The JSON was not edited (out of scope). The owner should reword the note to say finished, and could add the per-layer finished thicknesses with S-019c as the source.

## What the user must still verify
- Re-read the stackup article table in a browser and confirm which value belongs to which label (1.6 / 0.6 / 1.2 mil).
- Ask JLCPCB, or find a published statement, whether 1.6 mil includes plating and what the copper tolerance is.
- Check whether JLCPCB publishes a finished thickness for 2 oz and for 2-layer boards. None was found on these pages.
- IPC-6012 tables (S-009) are still PAYWALLED-USER-MUST-VERIFY.
