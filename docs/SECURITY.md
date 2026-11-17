# ClawFence security model

## What ClawFence is

A **tier-0 intent filter**: a fast, local, explainable check between the model's
tool call and the task's granted scope. It reduces accidental and injected
out-of-scope actions and makes the remaining ones visible and approvable.

## What it is not

- **Not a sandbox.** It does not confine a process. A command that passes triage
  can do anything the operating-system user can do.
- **Not a security boundary against a compromised host or a malicious plugin.**
  Plugin code runs with host trust; an attacker who can edit the plugin, the
  queue, or the gateway config can bypass ClawFence.
- **Not a cryptographic presence proof.** The arbiter is an authenticated local
  HTTP surface. A stolen browser session or local process can approve.
- **Not a guarantee that the decision model is correct.** Model probabilities are
  estimates; the deterministic rules are the primary control.

## Threat model

| adversary | mitigated? | notes |
|---|---|---|
| Prompt injection in a downloaded file/web page | **partly** | the adjudicator never sees untrusted text; action scope is checked against the user's task. A semantically plausible but out-of-scope action can still be blocked. |
| A model that misunderstands the task | **partly** | out-of-scope writes/deletes/egress are blocked; the human sees the ambiguous ones. |
| A malicious skill that asks for credentials | **yes for tool calls** | `SECRET_ACCESS` blocks reads/writes of known secret paths. |
| A malicious plugin with host access | **no** | it can disable the plugin or edit the queue. |
| A local user forging `grants.json` | **no** | the queue is local-operator trust. Use filesystem permissions. |
| Network attacker on the arbiter | **partly** | bind loopback by default; if LAN, set `--token` and use a trusted network. |
| Approval phishing | **partly** | approval cards show tool, action, target, scope, and task; a message cannot self-approve. |

## Deployment guidance

- Run the gateway and arbiter as the same unprivileged user.
- Keep `queueDir` mode `0700`; it contains action metadata and grants.
- Do not expose the arbiter to the public internet. If a device needs LAN access,
  use `--host 0.0.0.0 --token <random>` and a trusted VLAN.
- Treat `allow-always` grants as sensitive; they are scoped to the action hash and
  session for a short TTL.
- Review `openclaw clawfence audit` after long autonomous runs.
- Keep OpenClaw's own sandbox and exec approvals enabled. ClawFence is additive.

## Incident response

1. `openclaw clawfence pending` — inspect anything waiting.
2. `openclaw clawfence audit --limit 200` — look for `block` / `escalate` codes.
3. `openclaw clawfence verify` — check the audit chain.
4. Stop the gateway if a run is actively harmful; ClawFence does not have a
   hard kill switch for an already-running process.
5. Rotate any credential that was read or transmitted.

## Reporting

This is a hackathon prototype. Open an issue in the project repository with a
reproduction; do not include live secrets.
