# Upstream proposal: an intent card for `before_tool_call`

**Status:** plugin-first prototype. This document is the case for a core capability,
not a request to merge a large feature.

## The gap

OpenClaw's tool policy is **static** (`tools.allow`, exec allowlists, permission
modes) and its approval flow is **per-call**. Neither carries the task's own
authority. Auto mode exists because per-call approval is exhausting; turning it
off is how a prompt-injected action becomes a destructive one.

A small, typed **intent card** at the start of a run would give every hook, policy
plugin, and harness a shared contract:

```json
{
  "goal": "tidy Downloads",
  "allowed": {
    "read_paths": ["~/Downloads", "<workspace>"],
    "write_paths": ["~/Downloads"],
    "delete_paths": [],
    "domains": [],
    "recipients": [],
    "spend_cap_usd": 0
  },
  "effects": ["read", "write", "networkRead"],
  "expires_at": "…",
  "hash": "…"
}
```

## Minimal core surface

1. **Derive once per user turn.** A core helper turns the prompt into a card
   (conservative defaults; unclear authority stays out). Plugins can override
   derivation through a registration point.
2. **Expose it to `before_tool_call`.** The hook context gains
   `ctx.intentCard` (and `ctx.intentHash`). No new global service.
3. **Let hooks decide.** `block` and `requireApproval` already exist. The card
   gives them evidence they do not have today; no new authority is granted.
4. **Record it.** `session.tool` / audit events carry `intentHash` so a decision
   can be replayed against the contract that produced it.

## Why this is small

- One derivation function, one typed schema, one context field.
- No model call required. The deterministic derivation is enough for the
  first version; a decision model can refine ambiguity later.
- No change to tool execution, sandbox, or approvals. Hooks and policy plugins
  already have the decision semantics.

## Security position

- The card is **advisory evidence**, not an authorization token. A malicious
  plugin can ignore it; the host must not treat its presence as proof.
- Derivation must never read tool output or untrusted page text.
- The card should be visible in the transcript/audit so a human can correct it.
- Fail-closed defaults: no card means "mutating action needs a human", not "allow".

## What the prototype already proves

- A `before_tool_call` hook can implement this end-to-end today (ClawFence).
- A real OpenClaw run with a poisoned file: 14 calls, 5 unsafe; with the card
  9 auto-allowed, 3 blocked, 2 escalated, 0 unsafe, p50 <0.4 ms.
- The same schema is portable enough that NemoClaw/OpenShell policies could
  consume it instead of re-implementing scope.

## Ask

At Claw Hack: pair with a maintainer on the smallest version of this —
`ctx.intentCard` + a documented derivation helper — and ship the rest as a plugin.
If the core team prefers plugin-only, ClawFence stays a plugin and publishes
the schema as a shared artifact.
