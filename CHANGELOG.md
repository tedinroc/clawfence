# Changelog

## 0.1.0 — 2026-11-16

First prototype for Claw Hack Shenzhen.

- Intent card derived from the user's task (`lib/intent.js`)
- Typed action extraction for exec, patches, files, network, messages, MCP tools (`lib/action.js`)
- Deterministic scope adjudicator with optional `api.runtime.decisions.evaluate` assist (`lib/decide.js`)
- Queue mode (`before_tool_call` block + one-action grant) and native `requireApproval` mode
- Hash-chained JSONL audit (`lib/audit.js`)
- Phone/desktop arbiter with a device API (`arbiter/server.mjs`)
- 20-scenario evaluation suite (10 benign / 10 adversarial) and reproducible baseline/fence capture
- Plugin Inspector: PASS, 0 warnings
