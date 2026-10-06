# PCB Calculator Suite

Accuracy-first PCB engineering calculators (trace/current, resistance, voltage drop, path/load, vias, annular ring, circuit values, controlled impedance, spacing) with formula traceability and a phased, validator-gated build. Deployed to GitHub Pages.

## Using this kit with Claude Code
1. Unzip, `cd pcb-calc`, `git init`, create a GitHub repo, add it as `origin`.
2. In GitHub: **Settings → Pages → Source: GitHub Actions**.
3. Start Claude Code in this folder: `claude`
4. Approve the project MCP servers when prompted (see `.mcp.json`).
5. Type: `/build-phase 0`
6. After each phase Claude runs `/validate-phase N`. Read the reports in `docs/validation/reports/`.
7. Things only YOU can close are listed in `docs/validation/OPEN_RISKS.md` (paywalled IPC/IEC documents, your fabricator's stackup).

**v2:** adds cross-check policy (`docs/sources/crosscheck-tools.md`), `tests/crosscheck/` record format, a twc research lead for IPC-2152, and `docs/optional/` (rftools-mcp, webapp-testing). See `CHANGELOG.md`.

See `docs/PLAN.md` for the full plan and `docs/SPEC.md` for the product spec.

## Honest limits
Standards from IPC and IEC are paywalled. Agents can research public sources, but cannot read those documents. Anything depending on them is marked `PAYWALLED-USER-MUST-VERIFY` and the app shows an UNVERIFIED badge until you sign it off.
