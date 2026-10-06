# Exact conversions and AWG (S-005, S-006)

Retrieved 2026-10-06.

## S-006: VERIFIED
NIST SP 811 (2008) Appendix B.8 marks these factors as exact (boldface):
- inch → m: 2.54 E−02
- mil → m: 2.54 E−05
- ft → m: 3.048 E−01
- ft² → m²: 9.290 304 E−02
- °F → K: T/K = (t/°F + 459.67)/1.8
- Rounded (not exact) in SP 811: oz → kg 2.834 952 E−02; oz/ft² → kg/m² 3.051 517 E−01; °F interval → K 5.555 556 E−01.

1959 NBS announcement (reproduced by USMA): 1 yard = 0.9144 m and 1 lb (avdp) = 0.453 592 37 kg, both exact.
NIST OWM temperature page: K = (°F − 32)/1.8 + 273.15. This is algebraically the same as the SP 811 formula.

Derived exact values (taking oz = lb/16 as definitional):
- 1 oz = 0.028349523125 kg
- 1 oz/ft² = 0.028349523125 / 0.09290304 kg/m² = 0.305151727 kg/m², which agrees with SP 811's rounded value
- 1 °F interval = 5/9 K

## S-005: VERIFIED (definitional; both sources are NBS)
- NBS Circular 31 (3rd ed., 1914): "No. 0000 is defined as 0.4600 inch and of No. 36 as 0.0050 inch", with 38 sizes between them in geometric progression.
- NBS Handbook 100 (1966): same definition, ratio 1.1229322 (the 39th root of 92). Diameters are rounded to 0.1 mil for gauges 0000 to 44 and to 0.01 mil for gauges 45 to 56. In 1961 ASTM/ASA revised gauges 45 to 50 and extended the range to 56.
- Formula: d_n = 0.005 in × 92^((36−n)/39) = 0.127 mm × 92^((36−n)/39), with 0 → n = 0, 00 → −1, 000 → −2, 0000 → −3 (derived).
- The Circular 31 OCR prints the root index as "42". This is an OCR artifact; 92^(1/39) = 1.1229322 is consistent.
- Current ASTM B258 edition: B258-18, reapproved 2026 (DOI 10.1520/B0258-18R26), paywalled.

## User must verify
- ASTM B258-18(2026): rounding rules for nominal diameters and areas. The NBS rules may have changed. This affects tabulated values, not the formula.
- Decide whether the UI shows exact formula diameters or B258-rounded nominal diameters, and label which.
