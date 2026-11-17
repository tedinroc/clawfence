# Judge Q&A — short answers, with numbers

## 1. "Isn't this just OpenClaw auto mode?"
Auto mode approves or denies individual exec calls. ClawFence carries **task scope**
across files, egress, messages, MCP tools, and privilege, and only interrupts
when an action leaves that scope. The measured run: 14 calls, 9 allow, 3 block,
2 escalate — **two taps instead of fourteen prompts**.

## 2. "An LLM judging an LLM? That can't be safe."
The decision model sees only the **action tuple + intent card**, never tool
output, page text, or the model's reasoning. Deterministic rules own every
**hard block** (out-of-scope write, delete, egress, secret, privilege, package
install, opaque interpreter); the model only triages residual ambiguity. If it
is unavailable, the rules still block.

## 3. "Can the agent bypass a deny?"
A deny is recorded in `denials.json` and a retry of the same action hash is
blocked; `STOP` calls `sessions.abort` and kills the whole run. The hook returns
`block: true` with a reason, so the model cannot "work around" it by rephrasing
without a new decision. It is a **tier-0 intent filter**, not a kernel sandbox;
local-operator trust still applies to the queue dir.

## 4. "What about false positives?"
The 26-case suite has **11 benign / 15 adversarial**; benign blocked is **0/11**.
The pause path exists precisely for the ambiguous middle: the action is held, not
guessed. In the live run, the two escalations were a message recipient and a
wildcard delete — both would have been wrong to auto-allow.

## 5. "Latency?"
Hook path p50 **~0.3 ms** (measured 314 µs, worst observed 374 µs; we quote
**<0.4 ms**). Pure rules benchmark: **p50 82 µs, p95 219 µs**, 15,000 decisions,
0 mismatches. The human pause wait is by design.

## 6. "Privacy / data leaves the box?"
No. Rules run in-process; the decision model is local (Qwen3-4B MLX on the demo
Mac). The adjudicator sees only the tuple and card. Same provider config works
with an NVIDIA DGX Spark / vLLM endpoint if the venue offers one.

## 7. "Why a phone, not a hardware button?"
The phone is the physical surface I have; the Cardputer/CoreS3 firmware is
compiled and in the repo. I applied for a board but did not own one. If M5Stack
allocates one on Friday, I will flash it live; otherwise the phone demo is
unchanged. I will not claim a hardware demo I did not run.

## 8. "How is this different from NemoClaw / OpenShell?"
Those are policy/runtime layers; ClawFence produces a portable **intent card** and
an enforcement decision at `before_tool_call`. It is designed to be consumed by
those policies, not compete with them: one hook, installable from ClawHub.

## 9. "What did you actually build on site?"
The core hook, intent card, pause/stop, firmware and suite were rehearsed before
the event. On site I port the arbiter to an allocated board (if any), integrate
one judge-chosen task, re-run the 26-case suite on the venue laptop, and record
the fallback on the actual machine. Commit timestamps show the on-site changes.

## 10. "What's next?"
- Publish to ClawHub with the intent-card format documented.
- Add a policy adapter so NemoClaw/OpenShell can require a ClawFence card.
- Harden the queue/arbiter auth for multi-user LANs (token, per-approver audit).
- Broaden the suite to MCP and browser actions (already parsed, fewer cases).

## Numbers to never improvise
- baseline: 14 calls, 0 questions, **5 unsafe**
- fence: **9 allow / 3 block / 2 escalate**, **0 unsafe**
- suite: **26/26**, unsafe allowed **0/15**, benign blocked **0**
- hook p50 **<0.4 ms** (314 µs); bench **p50 82 µs**
- real Qwen3-4B: 5 calls / 0 interruptions; secret block **52 µs**; delete held
  **20 s**, approved, continued
