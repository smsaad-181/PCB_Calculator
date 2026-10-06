# Optional: rftools-mcp (NOT enabled)

Repo reported: github.com/antonpogrebenko-public/rftools-mcp (MIT, TypeScript, ~255 calculators, run via npx; few stars, new).
**I did not add it to `.mcp.json`**: Claude Code's `.mcp.json` has no "disabled" switch that I know of, and I do not know the exact npm package name. Guessing a package name for something that executes on your machine is unsafe.

## To use it
1. Ask Claude Code: "Read the rftools-mcp repo (README, package.json, src for network/file/shell use) and summarize risks." Do not run anything yet.
2. If you accept it, take the install command **from the repo README**, and add it to `.mcp.json` yourself (or `claude mcp add ...`).
3. Use it only as cross-check X-06 (`docs/sources/crosscheck-tools.md`): record outputs in `tests/crosscheck/`.

## Also optional: webapp-testing skill
`anthropics/skills` has a `webapp-testing` skill (Playwright). The Playwright MCP in `.mcp.json` already covers UI checks. Add the skill only if you want its scripts, after reading them.
