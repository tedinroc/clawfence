# On-site build checklist (what changes during the event)

The core is rehearsed before Dec 4; these are the **on-site commits** that make
the submission honest and adaptable.

## 1. Judge-chosen task (software)

The scripted demo is data-driven. Copy the example and edit the steps:

```bash
cp scenarios/judge-task.example.json scenarios/judge-task.json
$EDITOR scenarios/judge-task.json
CF_SCENARIO=scenarios/judge-task.json ./scripts/run-demo.sh
```

Schema:

```json
{
  "id": "judge-task",
  "user_prompt": "the task the judge asks for",
  "final_text": "what the agent says at the end",
  "steps": [
    { "tool": "exec",  "args": { "command": "ls ~/Downloads", "title": "List" } },
    { "tool": "read",  "args": { "path": "~/Downloads/notes.md" } },
    { "tool": "write", "args": { "path": "~/Downloads/summary.md", "content": "..." } }
  ]
}
```

Keep one benign step, one ambiguous step (delete/message/egress), and one blocked
step (secret/out-of-scope) so the arbiter has something to show. Re-run
`node scripts/eval.mjs` after changing anything in `lib/`.

Verified end-to-end on 2026-11-17: the example scenario ran 3 tools (2 `exec`, 1
`write`), all `IN_SCOPE`, and returned its final text. See
`clawfence/proof/judge-scenario.json`.

## 2. Board (if M5Stack allocates one)

```bash
./firmware/flash.sh cores3 /dev/cu.usbmodemXXXX     # or cardputer
```

Then, on the board's Wi-Fi config, set the arbiter base to the laptop LAN IP
(printed by `run-demo.sh`). If no board: phone-first, no firmware claim.

## 3. Re-run evidence on the venue laptop

```bash
./scripts/preflight.sh
node --test test/core.test.mjs
node scripts/eval.mjs
node scripts/bench.mjs 200
openclaw clawfence verify
```

Commit the venue run; the commit timestamp is the on-site proof.

## 4. Record the fallback

```bash
./scripts/capture-demo.sh
# screen-record the 78-90s fallback on this laptop; copy to phone
```

## 5. Freeze at 13:00 Saturday

No new features after freeze. Only record, submit, rehearse the 3-minute demo.
