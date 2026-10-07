# E-series preferred values (S-016)

Retrieved 2026-10-07. IEC 60063:2015 (3rd ed.) was not read: status PAYWALLED-USER-MUST-VERIFY. The full lists are in the S-016 ledger row.

## Cross-check, element by element
| Series | Sources compared | Result |
|---|---|---|
| E24 | Wikipedia, electronics-notes.com, Engineering ToolBox, Wevolver | All 24 values identical in all four |
| E96 | Wikipedia, electronics-notes.com | 95 of 96 agree; see discrepancy below |
| E48 | Wikipedia | Equals every second E96 value |
| E192 | Wikipedia only | Single source |

**Discrepancy, E96 position 33 (n = 32).** electronics-notes prints 2.16, and a second fetch confirmed it. Its own E48 table, Wikipedia, and the formula (10^(32/96) = 2.1544) all give 2.15. This is a typo on electronics-notes, and the ledger uses 2.15.

## Rule
Nominal value ≈ 10^(n/N), rounded to 2 s.f. for E3–E24 and 3 s.f. for E48–E192, with these published exceptions (per Wikipedia):
- E24, n = 10–16 and 22: official values 2.7 3.0 3.3 3.6 3.9 4.3 4.7 8.2, where the formula gives 2.6 2.9 3.2 3.5 3.8 4.2 4.6 8.3.
- E192, n = 185: official 9.20, where the formula gives 9.19.

Two further points:
- E3 is every second E6 value; it is not the rounded formula.
- E-series are not the ISO 3 Renard series.

## Still to do
- Manufacturer PDFs were found but not extractable here: Vishay doc 31001 and ROHM "List of nominal resistance values". Re-check against one of them in a browser.
- Oracle: recompute all E48/E96/E192 values from the formula, and assert that n = 185 in E192 is the only exception.
- User: check the IEC 60063:2015 tables.
