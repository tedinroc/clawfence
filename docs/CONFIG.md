# Configuration reference

All keys live under `plugins.entries.clawfence.config` in `openclaw.json`.
`openclaw config set <key> <value>` is the easiest path.

| key | type | default | description |
|---|---|---|---|
| `mode` | `"observe" \| "enforce"` | `enforce` | Observe logs the verdict and lets the call run (use for a baseline). Enforce blocks/escalates. |
| `escalation` | `"queue" \| "pause" \| "native" \| "off"` | `queue` | Queue: write a pending request and block; the arbiter grants a retry. **Pause: hold the tool call open until the arbiter decides; approve and the original call continues, deny/timeout blocks it.** Native: return OpenClaw `requireApproval`; needs an approval-capable surface (Control UI or a connected approval client) — a headless CLI run fails closed as "approval unavailable". Off: block ambiguous actions without a human route. |
| `semantic` | boolean | `false` | Call the configured decision model (`api.runtime.decisions.evaluate`) for residual escalations. If unavailable, the deterministic verdict stands. |
| `approvalTtlMs` | integer | `120000` | Lifetime of a pending approval. Capped by the host for native approvals. |
| `grantTtlMs` | integer | `600000` | Default lifetime of an `allow-always` grant. A one-time approval is short-lived (5 minutes) and bound to the action hash. |
| `queueDir` | string | `<stateDir>/clawfence` | Shared queue directory. Must be writable by the gateway and the arbiter. |
| `auditPath` | string | `<queueDir>/audit.jsonl` | Hash-chained audit log. |
| `workspaceOnlyReads` | boolean | `false` | Escalate reads outside the task's read scope instead of allowing them. |
| `maxReadPathScan` | integer | `4096` | Reserved. |

Operator-only hook settings:

```json
{
  "plugins": {
    "entries": {
      "clawfence": {
        "enabled": true,
        "hooks": { "allowConversationAccess": true },
        "config": { "mode": "enforce", "escalation": "queue" }
      }
    }
  }
}
```

`hooks.allowConversationAccess` is required for a non-bundled plugin to receive
`before_agent_run`, which is where the intent card comes from. Without it the
plugin still protects mutating actions (it has no intent, so it escalates them),
but it cannot derive the task scope.

## Arbiter flags

```
node arbiter/server.mjs --dir /tmp/clawfence --host 127.0.0.1 --port 8790 [--token <secret>]
```

| flag | default | meaning |
|---|---|---|
| `--dir` | `$OPENCLAW_STATE_DIR/clawfence` | queue directory |
| `--host` | `127.0.0.1` | bind address; use `0.0.0.0` only on a trusted LAN |
| `--port` | `8787` | HTTP port |
| `--token` | `$CLAWFENCE_ARBITER_TOKEN` | optional bearer token for all routes |

Device endpoints:

- `GET /api/device/pending` — compact pending list
- `POST /api/decide` — `{ "id": "...", "decision": "allow-once|allow-always|deny", "approver": "..." }`
- `GET /api/health` — liveness, no state

## Decision-model path

When `semantic: true` and the owning agent has a `decisionModel`, ClawFence calls
`api.runtime.decisions.evaluate` with two boolean questions (`matches_task`,
`safe`) over the structured action and the intent card. It only runs after the
deterministic rules return `escalate`, and it cannot override a `block`.

Providers: TypeSafe Jev/Kev, Gemini Decisions, OpenAI Platform Decisions, ONNX
(local, when the host ships the V2 contract), Rerank, and others documented in
OpenClaw's decision-model guide.

## Environment

- `OPENCLAW_STATE_DIR` — used to resolve the default queue directory.
- `CLAWFENCE_QUEUE_DIR` — arbiter default queue directory.
- `CLAWFENCE_ARBITER_TOKEN` — arbiter bearer token.
