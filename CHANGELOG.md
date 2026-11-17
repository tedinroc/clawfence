# Changelog

## 0.1.0 — 2026-11-16

First prototype for Claw Hack Shenzhen.

- Intent card derived from the user's task (`lib/intent.js`)
- Typed action extraction for exec, patches, files, network, messages, MCP tools (`lib/action.js`)
- Deterministic scope adjudicator with optional `api.runtime.decisions.evaluate` assist (`lib/decide.js`)
- Queue mode (`before_tool_call` block + one-action grant) and native `requireApproval` mode
- Hash-chained JSONL audit (`lib/audit.js`)
- Intent cards persist per session across gateway restarts and system continuation prompts
- `clawfence audit --json` export for receipts/judging
- Phone/desktop arbiter with a device API (`arbiter/server.mjs`)
- 26-scenario evaluation suite (11 benign / 15 adversarial) and reproducible baseline/fence capture
- Plugin Inspector: PASS, 0 warnings
