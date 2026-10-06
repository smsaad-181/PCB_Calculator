# Cross-check tool licenses (S-051)

Retrieved 2026-10-06 from each repository's license file. This is not legal advice.

| Tool | License file | Finding |
|---|---|---|
| KiCad | https://gitlab.com/kicad/code/kicad/-/raw/master/LICENSE.README (and LICENSE = GPLv3 text) | "GPLv3 or later" for the majority of the code; third-party parts under compatible licenses (Apache 2.0, MIT, BSD, LGPL, MPL 2.0, ...) |
| Qucs-S | https://raw.githubusercontent.com/ra3xdh/qucs_s/master/COPYING | GNU GPL Version 2, June 1991. File headers were not checked for "or later". |
| twc (ymic9963) | https://raw.githubusercontent.com/ymic9963/twc/main/LICENSE | GNU GPL Version 3, 29 June 2007 |
| rf-tool (ErikBuer) | https://raw.githubusercontent.com/ErikBuer/rf-tool/master/LICENSE | GNU GPL Version 3, 29 June 2007 |
| weeks (osaether) | https://raw.githubusercontent.com/osaether/weeks/master/LICENSE | MIT License, "Copyright (c) 2026 Ole Sæther"; implements Weeks et al., IBM J. Res. Dev. 23(6), Nov 1979 (citation as given in the README, not independently checked) |

All five match the earlier third-party scan.

Other findings:
- NinjaCalc (gbmhunter/NinjaCalc), the source of twc's Method A, is deprecated. The fetcher showed no license for it, so treat it as unlicensed: read only, values only.
- KiCad version matters. The master branch replaced the IPC-2221 track-width formula with the Brooks & Adam IPC-2152 fit; 9.0 stable docs still say IPC-2221. Record the KiCad version in every X-01 cross-check record.
