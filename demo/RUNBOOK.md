# Claw Hack Shenzhen — on-site runbook (one page)

**Status:** Luma application approved; attending; no board owned → **phone-first demo**.
**Venue:** muShenzhen · OCT-LOFT, Nanshan. **Hack:** Fri Dec 4 10:00 → Sat Dec 5 18:30.
**Submission:** Sat **16:00** · demos/judging · winners **17:00–17:30**.
**ClawCon:** Sun Dec 6 12:30–18:00 (separate registration).

## Before you leave the hotel

- [ ] Laptop charged; phone charged; power bank + USB-C cable; phone stand.
- [ ] Repo cloned: `git clone https://github.com/tedinroc/clawfence`
- [ ] Node 24.22.1+ (`node -v`); OpenClaw 2026.11.4 installed (`openclaw --version`).
- [ ] `clawfence` plugin installed and demo run once:
      `openclaw plugins install -l ./clawfence --force --accept-capabilities`
- [ ] Video `clawfence-demo.mp4` on laptop **and** phone.
- [ ] Deck on laptop (PPTX + PDF if you export one).
- [ ] Firmware bins on laptop: `firmware/bin/*.bin`; arduino-cli + ESP32 core
      installed if you plan to flash on site.
- [ ] Luma approval email screenshot (venue check-in).

## On site — Friday

| time | action |
|---|---|
| 09:00 | Arrive, front row. Wi-Fi + power. |
| 10:00 | OpenClaw / M5Stack / Seeed workshops. Ask for the board; confirm SDK path. |
| 12:00 | Claim a table near power; set up demo home (`./clawfence/scripts/setup-demo.sh`). |
| 13:00 | Build in the open. If you got a board, flash `firmware/bin/…` and join Wi-Fi to the arbiter. |
| 15:00 | Pair with a maintainer on `before_tool_call` / `decisions.evaluate`; ask one architecture question. |
| 18:00 | Open Mic: 60 seconds, problem only. Get judge exposure. |
| evening | Record the fallback 90-second video on the actual laptop; freeze scope. |

## On site — Saturday (ship day)

| time | action |
|---|---|
| 10:00 | Final integration only. No new ideas. |
| 13:00 | **Feature freeze.** |
| 14:00 | Record 90-second fallback video; test on phone. |
| 15:00 | Submit repo + video + 3-minute demo text. |
| 16:00 | **Submission deadline.** |
| 16:30 | Rehearse the 3-minute script twice, out loud, timed. |
| 17:00 | Demos / awards. Be present; be gracious; ask the partner for a photo + intro. |
| 18:30 | Social. |

## The 3-minute demo (pause mode for live)

```bash
# terminal 1: real local model (if available) or scripted fallback
~/clawfence-runtime/mlxenv/bin/mlx_lm.server \
  --model "$HOME/.lmstudio/models/lmstudio-community/Qwen3-4B-MLX-4bit" \
  --host 127.0.0.1 --port 18085 \
  --chat-template-args '{"enable_thinking": false}'

# terminal 2: isolated gateway
HOME=/tmp/cfreal OPENCLAW_STATE_DIR=/tmp/cfreal/.ocdemo \
OPENCLAW_CONFIG_PATH=/tmp/cfreal/.ocdemo/openclaw.json \
openclaw gateway --allow-unconfigured

# terminal 3: arbiter (phone opens http://<mac-lan-ip>:8791)
node clawfence/arbiter/server.mjs --dir /tmp/clawfence-live --port 8791 --host 0.0.0.0

# pause mode: approving resumes the held call
openclaw config set plugins.entries.clawfence.config.escalation pause

# run the task
openclaw agent --session-key agent:main:live --message "<judge task>"
```

If the real model is unavailable, use `scripts/run-demo.sh` (scripted model) and
say so: "the model is scripted for reproducibility; the gateway, hooks, tools,
and audit are real."

**Beats:** 15s problem → 90s live run → 30s proof frame → 20s failure/stop → 15s upstream ask.

## Judge questions — one-liners

- **"Is this just auto mode?"** Auto reviews individual exec commands; ClawFence
  carries the task's scope across files, egress, messages, MCP.
- **"LLM judging LLM?"** The adjudicator sees only the action tuple + intent card,
  never tool output or page text. Rules do the hard blocks; the model only triages.
- **"Can I fake a grant?"** Yes if you can write the queue dir; local-operator
  trust. Grants are action-hash-bound and expire. It is a tier-0 filter, not a
  boundary.
- **"What if the model is unavailable?"** Rules still block out-of-scope writes,
  deletes, egress, secrets, privilege. The demo runs with the model disabled.
- **"Can you stop a running agent?"** Yes — the STOP button calls
  `sessions.abort`; verified aborting an active `sleep 30` run.

## If something breaks

1. Kill the demo, show `proof/shots/proof-frame.png` + `proof/shots/arbiter.png`.
2. Play the 78-second video from the phone.
3. Say the number: **unsafe 5 → 0, 2 interruptions in 14 actions, p50 <0.4 ms**.
4. Do not debug live for more than 20 seconds.

## Submission text (short)

> ClawFence — an intent firewall for OpenClaw. Derives a task-scoped intent card,
> checks every tool call, blocks out-of-scope actions, escalates only the
> ambiguous ones to a phone/Cardputer arbiter, and records every decision in a
> hash-chained audit. Real run: unsafe 5 → 0, 2 taps in 14 actions, p50 <0.4 ms;
> real Qwen3-4B local run: 5 calls, 0 interruptions, secret read blocked in 52 µs.
> Repo: https://github.com/tedinroc/clawfence
