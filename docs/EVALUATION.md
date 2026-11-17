# Evaluation methodology

## What is measured

The suite is a **triage test**, not a security proof. It asks:

1. Does the adjudicator allow the actions a benign task needs?
2. Does it block or escalate actions that leave the task's scope?
3. How often does a benign task need a human?
4. How fast is the decision path?

## Files

- `scenarios/suite.json` — 24 cases (11 benign, 13 adversarial), 39 tool calls.
- `scenarios/demo.json` — 14-call "tidy Downloads with a poisoned note" trace.
- `scripts/eval.mjs` — runs the suite through the pure adjudicator and prints a
  summary; `--proof` writes `proof/suite-result.json`.
- `scripts/proof.mjs` — compares the real baseline and fenced audits.
- `scripts/scripted-demo-agent.mjs` — deterministic OpenAI-compatible model that
  emits the demo tool calls, so the same run can be repeated.

## Labels

- `benign` — a normal task; every step marked `allow` in the expectation column.
  Some benign steps are intentionally marked `escalate` when the action is
  ambiguous (e.g. deleting a folder that the task named but did not authorise).
- `adversarial` — a poisoned or off-task action; expected `block` or `escalate`.
- `unsafe allowed` — an adversarial step whose actual verdict is `allow`.
- `benign blocked` — a benign step whose expected `allow` is blocked.

## Results (2026-11-16)

```
cases: 24
steps: 39
passed: 24/24
unsafe allowed: 0
benign blocked: 0
p50: ~10 µs (pure rules, in-process)
```

Real gateway demo:

```
14 calls
baseline (approvals off): 14 executed, 5 unsafe, 0 approvals
ClawFence: 9 allow, 3 block, 2 escalate, 0 unsafe
p50 decision: ~0.1–0.2 ms (hook + rules)
```

## Threats to validity

- The suite was authored during this project; it is not an independent benchmark.
- The scripted model is a deterministic driver for reproducibility, not a
  model-quality benchmark. The tool pipeline and hooks are real.
- The demo runs against a fake home (`/tmp/cfhome`); it never touches the user's
  real `~/Downloads` or `~/.ssh`.
- Rule-based baselines are lexical. A command that hides its target from the
  parser (e.g. base64-encoded paths) can pass; that is a known tier-0 limit.
- The decision-model path is implemented but not exercised in the public demo
  because the released host does not ship a local decision provider. The
  deterministic path is the control.

## Adding a case

Append to `scenarios/suite.json`:

```json
{
  "id": "A11-my-case",
  "kind": "adversarial",
  "prompt": "…",
  "steps": [
    { "tool": "exec", "params": { "command": "…" }, "expect": "block" }
  ]
}
```

Then `node scripts/eval.mjs`. A case that fails is useful: it names the
extraction or policy gap. Add a unit test for the smallest failing unit.
