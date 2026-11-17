# ClawFence architecture

## 1. The gap

OpenClaw has two ways to keep an agent safe today:

- **Static policy** (`tools.allow`, exec allowlists, permission modes) — coarse,
  defined before the task, and blind to what the task actually authorises.
- **Per-call approval** — precise but exhausting, which is why auto mode exists.

Neither answers the question the task implies: *what did I authorise, and which
actions stay inside that?* ClawFence adds that layer at `before_tool_call`.

## 2. Components

```
┌───────────────────────────── OpenClaw Gateway ─────────────────────────────┐
│  agent run                                                                  │
│    │ before_agent_run: derive intent card from the user prompt             │
│    │                                                                       │
│    └─ tool call ──► before_tool_call                                       │
│                       ├─ extractAction()  → typed action tuple             │
│                       ├─ decideAction()   → allow / block / escalate       │
│                       ├─ decisions.evaluate() (optional, ambiguous only)    │
│                       ├─ requireApproval() or queue request                │
│                       └─ audit.append()   → hash-chained JSONL             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                     shared queue dir (pending/, grants.json, audit.jsonl)
                                    │
┌───────────────────────────────┐   │   ┌──────────────────────────────────────┐
│ arbiter/server.mjs (phone/desk)│───┘   │ physical device / ESP32             │
│  GET /api/state                │       │  GET /api/device/pending             │
│  POST /api/decide              │       │  POST /api/decide                    │
└───────────────────────────────┘       └──────────────────────────────────────┘
```

### Why a file-backed queue instead of the Gateway approval RPC?

The arbiter must work when the Gateway's approval routes are unavailable and
when the human surface is a cheap MCU with no device identity. The queue is the
contract: the plugin writes pending requests; the arbiter resolves them and
writes a short-lived grant. The Gateway still owns the tool call; the plugin
checks the grant on retry. The design is deliberately boring, inspectable, and
crash-safe (atomic rename writes).

Native `requireApproval` is also implemented (`escalation: "native"`). It uses
the Gateway's own approval UI and is the path we would recommend once the
hardware arbiter can register as an approval-capable client.

## 3. Intent card

```json
{
  "version": 1,
  "goal": "Tidy my Downloads folder…",
  "effects": ["read", "write", "networkRead"],
  "allowed": {
    "read_paths": ["…/Downloads", "…/workspace"],
    "write_paths": ["…/Downloads"],
    "delete_paths": [],
    "domains": [],
    "recipients": [],
    "spend_cap_usd": 0
  },
  "unknowns": [],
  "hash": "…"
}
```

Derivation is intentionally conservative:

- named directories (`Downloads`, `桌面`, `Documents`, …) and explicit paths/quoted
  files become read targets;
- write scope is granted only when the task has a write/clean/tidy verb and a
  named target; otherwise it defaults to the agent workspace;
- delete scope requires an explicit delete verb and a named target;
- egress domains and recipients come from the prompt, never from tool output;
- `unknowns` records under-specified authority (e.g. "delete" with no target).

Reads outside the scope are allowed by default so the agent can still inspect
system state; secrets are always blocked. `workspaceOnlyReads: true` tightens
this.

## 4. Action tuple

| tool family | extraction |
|---|---|
| `exec` / `bash` / `process` | split into command segments; classify binaries, redirections, URLs, file args, privilege, destructive verbs |
| `apply_patch` | parse `*** Add/Update/Delete File` and `*** Move to` headers |
| `read` / `write` / `edit` / `delete` / `move` | path + destination |
| `browser` / `web_fetch` | URL, method, body; network read vs write |
| `message` | recipient(s) |
| MCP / plugin tools | recursive scan for paths, URLs, secret references; effects `unknown` → escalate |

The extraction is lexical, not a shell sandbox. It is a **triage input**, not an
authorisation proof. The plugin also uses the host's `derivedPaths` hint when
present.

## 5. Adjudication order

1. Observe mode → allow + log.
2. No/empty intent → reads allowed; mutating actions escalate.
3. Privilege, payment, secret material → block/escalate.
4. Unknown tool contract → escalate.
5. Delete outside scope → block; delete in a named/safe location but not explicit → escalate.
6. Write outside scope (except workspace/state/temp) → block.
7. Network write without intent authority or named domain → block.
8. External / unclear message recipient → escalate.
9. Optional decision-model assist for remaining escalations.
10. Matching one-action grant → allow.

Fail-closed: a hook error blocks the tool; a missing approval route blocks the
call; an expired request never authorises.

## 6. Audit

Every record includes `prev_hash`; the record hash is SHA-256 over canonical JSON
of the record without `hash`. `openclaw clawfence verify` recomputes the chain and
reports mismatches. The head hash is a compact proof artifact for a demo or a
receipt.

## 7. Limits

- No sandbox: the plugin sees what the model asked for, not what the binary does
  after `sh -c`.
- No OS isolation: a hostile plugin or a compromised host bypasses it.
- No cryptographic presence: the arbiter approves over an authenticated local
  channel, not a hardware attestation.
- Decision models are estimates; the thresholds are configurable and should be
  calibrated per deployment.

These limits are why the pitch calls it a **tier-0 intent filter**.
