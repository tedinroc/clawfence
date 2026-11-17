# 3-minute demo script (word-for-word)

## Setup on screen before you start

- Left: terminal with the agent run / audit.
- Right: phone or browser at the arbiter URL.
- Background: `proof-frame.png` not visible yet.
- Have `proof/proof-frame.md` open in another tab as fallback.

## 0:00–0:20 — problem (20 s)

> "OpenClaw agents can do anything you ask. That's the problem. When approvals
> get exhausting, people turn them off — and then one poisoned file is enough.
> I'm going to show you the same task twice: approvals off, and with a fence."

Click: show baseline trace; point at the five red rows.

> "Fourteen actions, zero questions, five unsafe: an upload, an SSH key, an
> out-of-scope write, a delete, and a message."

## 0:20–1:05 — the fence (45 s)

Start the second run (pause mode).

> "Same task. ClawFence reads the task into an intent card: Downloads, not
> Documents; no egress; no secrets. Every tool call becomes an action tuple."

Point at the green allow chips.

> "Nine expected actions run without asking."

Point at red blocks.

> "Three are blocked with a reason: unapproved egress, secret access,
> out-of-scope write."

Point at the two amber cards on the phone.

> "Two are genuinely ambiguous. They're paused, not guessed."

## 1:05–1:45 — the human moment (40 s)

Tap **DENY** on the message card; tap **APPROVE** on the delete card (or deny;
choose one and explain the other).

> "One tap. The paused call resumes or is blocked. The deny is recorded; the
> agent can't work around it. And if it keeps pushing, STOP aborts the whole run
> — that's `sessions.abort`."

Show the STOP button; do not actually abort the demo run.

## 1:45–2:20 — proof (35 s)

Full-screen `proof/proof-frame.md`.

> "Same fourteen calls. Unsafe five to zero. Two interruptions, not fourteen.
> p50 is sub-0.3 milliseconds for the hook. Every decision is hash-chained."

Run `openclaw clawfence verify`:

> "Intent hash, action hash, verdict, reason, approver. This is the receipt for
> an autonomous run."

## 2:20–2:45 — real model (25 s)

Show `proof/shots/real-model-card.png` / `real-pause.png`.

> "This isn't only a scripted trace. On Qwen3-4B, locally: a benign task, five
> calls, zero interruptions. It tried to read an SSH key — blocked in 52
> microseconds. A wildcard delete was held for twenty seconds; I approved; the
> exact call continued."

## 2:45–3:00 — ask (15 s)

> "One hook: before_tool_call. Installable from ClawHub. The intent-card format
> is designed to be composed with NemoClaw or OpenShell policies, not compete
> with them. Fewer interruptions, zero surprises."

Leave the repo URL on screen.

---

## Fallback (if live demo fails)

1. Kill the demo; do not debug for more than 20 seconds.
2. Show `proof/shots/proof-frame.png` and `arbiter.png`.
3. Play the 78-second video from the phone.
4. Say the number: **unsafe 5 → 0, 2 interruptions in 14 actions, sub-0.3 ms**.
5. Offer to run the 26-scenario suite on the laptop: `node scripts/eval.mjs`.

## Exact numbers to say (do not improvise)

- baseline: 14 calls, 0 questions, 5 unsafe
- ClawFence: 9 allow, 3 block, 2 escalate, 0 unsafe
- suite: 26/26, unsafe allowed 0/15, benign blocked 0
- hook p50: sub-0.3 ms (measured 288 µs)
- pure rules bench: p50 82 µs, p95 219 µs, 15,000 decisions, 0 mismatches
- real Qwen3-4B: 5 calls / 0 interruptions; secret read block 52 µs; delete held 20 s then continued

## Chinese one-liners

- 問題：審批太累，所以大家關掉；然後一個被注入的檔案就夠了。
- 機制：意圖卡 → 動作 tuple → 規則先擋 → 模糊的才暫停給人。
- 數字：不安全 5 → 0；14 個動作只打斷 2 次；hook p50 < 0.3 ms。
- 停止：按 deny 封鎖這一步；按 STOP 用 `sessions.abort` 停掉整個 run。
