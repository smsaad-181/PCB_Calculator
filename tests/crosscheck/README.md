# Cross-check records

One JSON file per tool and topic. A runner test (built in Phase 0, `tests/crosscheck.test.ts`) loads every `*.json` here whose name does not start with `_`, recomputes with our calculators, and compares within the stated tolerance. With no records the runner passes and prints "0 cross-check records".

## Record format (see `_template.json`)
```
{
  "tool": "KiCad pcb_calculator",
  "toolId": "X-01",
  "toolVersion": "<exact version or commit hash>",
  "retrieved": "YYYY-MM-DD",
  "obtainedBy": "human | agent",
  "method": "how the numbers were produced (GUI screenshot path, command line, source reading)",
  "cases": [
    {
      "id": "kicad-trace-1A-dT10-ext",
      "calculator": "trace-width-ipc2221",
      "inputs": { "current_A": 1, "deltaT_K": 10, "copper_oz": 1, "layer": "external" },
      "toolOutputs": { "width_mm": null },
      "compare": [ { "output": "width_mm", "relTol": 0.02, "why": "KiCad rounds / uses different oz→µm constant" } ]
    }
  ]
}
```
## Rules
- `toolOutputs` values must be copied from a real tool run. **Never type numbers from memory or from our own app.** `null` means "not yet obtained"; the runner skips null cases and reports them.
- Tolerances need a stated reason. Never widen one to make a test pass.
- Records never contain third-party source code.
- A passing record does not verify a ledger row (see `docs/sources/crosscheck-tools.md`).
