# Submission text (ready to paste)

Use the version that fits the field. Links:
- Repo: https://github.com/tedinroc/clawfence
- Release (deck/video/one-pager/runbook): https://github.com/tedinroc/clawfence/releases/tag/v0.1.0

## 50 words (EN)

ClawFence is an intent firewall for OpenClaw. It derives a task-scoped intent
card, checks every tool call against it, blocks out-of-scope writes/deletes/
egress/secrets, and pauses only ambiguous actions for a phone arbiter. Real run:
unsafe 5 → 0 with 2 interruptions in 14 calls; hash-chained audit. MIT, one hook.

## 150 words (EN)

OpenClaw agents can do anything you ask — and that is the problem. Approvals get
exhausting, so people turn them off; then one poisoned file can delete Documents
or POST an SSH key. ClawFence adds the missing layer: a machine-checkable
**intent card** derived from the task (paths, domains, recipients, effect
classes, spend cap). A `before_tool_call` hook turns every call into an action
tuple; deterministic rules block out-of-scope writes, deletes, egress, secrets
and privilege, while an optional decision model only triages genuine ambiguity.
Ambiguous actions are **held**, not guessed: a phone/Cardputer arbiter shows the
task, tool, target and reason; approve resumes the exact call, deny blocks it,
STOP aborts the run via `sessions.abort`. Every decision is hash-chained.
Measured: 14 calls → 9 allow / 3 block / 2 escalate, **unsafe 5 → 0**, p50
sub-0.3 ms; 26/26 scenarios; real local Qwen3-4B verified. Repo + 78-second demo
in the release.

## 中文 150 字

OpenClaw 什麼都能做，這就是問題：審批太累，大家關掉；然後一個被注入的檔案就能
刪掉 Documents、或把 SSH key POST 出去。ClawFence 補上缺的那一層：從任務推出一張
可機器檢查的**意圖卡**（路徑、網域、收件人、效果類別、花費上限）。
`before_tool_call` 把每個工具呼叫變成動作 tuple；規則先擋越界寫入、刪除、外傳、
secret 與提權，模糊的才交給決策模型分診。真正模糊的動作會被**暫停**，在手機/
Cardputer 仲裁器上顯示任務、工具、目標與理由：approve 續跑、deny 封鎖、STOP 用
`sessions.abort` 中止整個 run。每個決定都進 hash chain。實測：14 個呼叫 →
9 allow / 3 block / 2 escalate、**不安全 5 → 0**、p50 <0.3 ms；26/26 情境；真本機
Qwen3-4B 驗證。repo 與 78 秒 demo 在 release。

## Demo instructions (for the submission form)

> Run `openclaw plugins install -l ./clawfence --force --accept-capabilities`,
> then `./scripts/run-demo.sh`; scan the printed QR with the phone. Approve/deny
> the two cards. The repo README has the full setup.

## Open Mic (60 seconds)

> "I want my agent to tidy Downloads without asking me 14 times. So I turned
> approvals off — and one poisoned file tried to archive Documents, read an SSH
> key, and message a stranger. ClawFence reads the task into an intent card,
> checks every tool call, blocks the clear violations, and pauses only the two
> ambiguous ones for a tap on my phone. Unsafe five to zero, two interruptions,
> sub-0.3 milliseconds, hash-chained. One hook. Repo's on the slide."

## 30-second stranger test (Claw Cafe)

1. Hand them the phone. Say: "This card is an action my agent wants to take.
   Read the task, the action, and the reason."
2. "Press **DENY** if it's not what the task asked for; **APPROVE** if it is."
3. After the tap: "That decision is now in a hash-chained audit. The agent
   can't work around a deny; STOP would kill the whole run."
4. Ask: "Would you have wanted to see this for every action, or only this one?"
5. Write down their answer; it is the best demo feedback you will get.

## On-site work to mention (honesty)

- The core hook, intent card, pause/stop, firmware and eval were rehearsed
  before the event.
- On site we add: port the arbiter to the allocated board (if any), integrate
  one judge-chosen task, and re-run the 26-scenario suite on the venue laptop.
- Commit timestamps show the on-site changes.
