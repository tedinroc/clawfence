# ClawFence — handoff (read this first)

**Status (2026-11-17):** Luma hackathon **approved**; ClawCon **registered**;
flights + hotel **booked** (Dec 3–7); **valid 5-year 台胞證** in hand; attending
Shenzhen Dec 4–5. No M5Stack board owned → **phone-first demo**.
**Goal:** win Claw Hack Shenzhen. Everything below is built, tested, and packaged.

## The only three things left for you

1. **Ask the host** — copy `ORGANIZER_QUESTIONS.md` to Luma/WeChat `queenie_52`:
   judging rubric, board allocation, submission format, Claw Cafe pass.
2. **Travel-laptop prep (Nov 21–24)** — run `preflight.sh`, `run-demo.sh`, scan
   the phone QR, record a fresh fallback on that laptop.
3. **Show up Dec 4–5** — follow `ATTENDEE_PLAN.md` / `RUNBOOK.md`; phone-first.

Then: **Nov 21–24** run `preflight.sh` + phone QR demo on the travel laptop;
**Dec 4–5** follow `RUNBOOK.md` / `ATTENDEE_PLAN.md`.

## What is already done

- OpenClaw plugin: intent card, `before_tool_call` adjudication, pause/approve/
  deny, STOP via `sessions.abort`, hash-chained audit, CLI.
- **26/26** scenarios, **0/15** unsafe allowed, **0/11** benign blocked;
  **18/18** unit tests; Plugin Inspector **PASS 0 warnings**; benchmark
  **p50 82 µs / p95 219 µs**, 0 mismatches.
- Real local Qwen3-4B: 5 calls / 0 interruptions; secret read block **52 µs**;
  wildcard delete held **20 s**, approved, continued.
- Scripted two-card demo: first card **2.24 s**, whole run **2.75 s**.
- Phone UI verified at true **390×844**; `?simple=1` stranger mode.
- Firmware compiled for **CoreS3** and **Cardputer**; bins in `firmware/bin/`.
- Persistent runtime `~/clawfence-runtime` (Node 24, OpenClaw, MLX) survives
  reboot; demo scripts auto-detect it.
- GitHub release: <https://github.com/tedinroc/clawfence/releases/tag/v0.1.0>

## Artifact index

| file | purpose |
|---|---|
| `TRAVEL_BRIEF.md` | flights, hotels, visa, booking links, packing |
| `CHECKPOINTS.md` | Nov 20 / Nov 25 / Dec 1 / Dec 3 / Dec 4–5 gates |
| `ATTENDEE_PLAN.md` | dated to-do list + contingencies |
| `RUNBOOK.md` / `clawfence-runbook.pdf` | on-site A4 runbook |
| `DEMO_SCRIPT.md` | word-for-word 3-minute demo |
| `JUDGE_QA.md` | 10 likely judge questions + numbers |
| `JUDGE_PERSONAS.md` | what OpenClaw / M5Stack / Tencent / NVIDIA / media each cares about |
| `ORGANIZER_QUESTIONS.md` | copy-paste questions to the host |
| `ONSITE_BUILD.md` | judge-task, board, evidence, freeze plan |
| `SUBMISSION_TEXT.md` | ready-to-paste 50/150-word text + Open Mic |
| `APPLICATION.md` | submitted application answers |
| `FINAL_AUDIT.md` | artifact/CI/link audit |
| `clawfence.ics` | event calendar with alarms |
| `clawfence-one-pager.pdf` | judge handout, release QR |
| `clawfence-poster.pdf` | A3 table poster (print or show on laptop) |
| `clawfence-deck.pdf` / `.pptx` | 10-slide pitch deck |
| `clawfence-demo.mp4` | 78-second demo |

## Exact numbers (never improvise)

- baseline: 14 calls, 0 questions, **5 unsafe**
- fence: **9 allow / 3 block / 2 escalate**, **0 unsafe**
- suite: **26/26**, unsafe allowed **0/15**, benign blocked **0**
- hook p50 **<0.4 ms** (314 µs); rules bench **p50 82 µs**
- two-card flow: first card **2.24 s**, whole run **2.75 s**
- real Qwen3-4B: 5 calls / 0 interruptions; secret **52 µs**; delete **20 s**

## Commands

```bash
cd clawfence
./scripts/preflight.sh          # expect PASS
./scripts/run-demo.sh           # phone URL + QR; Ctrl-C stops
# phone opens the printed URL with ?simple=1
```

Real model (optional, slower): `./scripts/run-real-demo.sh`.
Scripted judge task: `CF_SCENARIO=scenarios/judge-task.json ./scripts/run-demo.sh`.

## Brand / pitch

ClawFence — intent firewall for OpenClaw. **Fewer interruptions. Zero surprises.**
One hook; rules block the clear violations; only ambiguity reaches a human; every
decision is hash-chained.
