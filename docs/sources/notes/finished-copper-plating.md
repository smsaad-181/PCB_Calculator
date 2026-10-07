# Finished copper and via barrel plating (S-009, S-015)

Retrieved 2026-10-07. IPC-6012 was not read (paywalled). All IPC numbers below are secondhand.

## Verified (secondary agreement only)
Two fabricators agree, within rounding, on the IPC-6012 minimum finished copper for 1 oz:
- NCAB FAQ: inner "1 oz. 24.9um"; external Class 2 "1 oz. 47.9um"; Class 3 "1 oz. 52.9um". Also ½ oz (11.4 / 33.4 / 38.4) and 2 oz (55.7 / 78.7 / 83.7).
- Epec blog: inner 25 µm, external 48 µm (Classes 1 and 2), 53 µm (Class 3). Epec cites IPC-6012 tables 3-13 (internal) and 3-14 (external); the revision is not stated.

These are minimums. They are not typical values.

Hole-wall copper (secondary sources):
- JLCPCB blog citing IPC-6012F: Class 2 average 20 µm, minimum 18 µm. Class 3 average 25 µm, minimum 20 µm.
- Venture Mfg: Class 2 20 µm, Class 3 25 µm average. No thin-area values.

Fabricator data, for fab profiles only:
- JLCPCB average hole plating: 18 µm.
- PCBWay through hole: 18–25 µm (normal process); 30–50 µm and > 50 µm as special options.

## Derived observation (not quoted)
Every NCAB value fits this pattern: 0.9 × IPC-4562 nominal foil, minus a processing allowance, plus a minimum plating of 20 µm (Class 2) or 25 µm (Class 3).
- 1 oz: 0.9 × 34.3 = 30.9 µm. Inner 30.9 − 6 = 24.9 µm. Outer Class 2 30.9 − 3 + 20 = 47.9 µm.

This indirectly supports the 34.3 µm convention in S-003(c), and it explains the Class 3 minus Class 2 difference of 5 µm. It is an inference, not a source.

## Conflicts and flags
- JLCPCB's published 18 µm average is below the secondhand Class 2 average of 20 µm. Never imply that a default JLCPCB board meets Class 2 barrel copper.
- The thin-area minimums (18/20 µm) have a single source (JLCPCB blog), which is not independent of the JLCPCB fab data.

## User must verify (IPC-6012, current revision F)
- The internal-layer finished copper table and the "external conductor thickness after plating" table. Epec numbers them 3-13 and 3-14; confirm the numbers in your revision.
- The surface and hole copper plating minimum table: average and thin-area values for Class 1/2/3, and the separate values for blind/buried vias and microvias.
