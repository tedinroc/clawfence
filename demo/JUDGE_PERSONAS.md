# Judge personas — what to say to each

## OpenClaw core team (Vincent / maintainers)
**Cares about:** one-hook fit, upstreamable design, tests, no forked runtime.
**Say:** "One `before_tool_call` hook; rules own hard blocks; decision model is
optional and sees only the tuple. 26/26 suite, 20 unit tests, CI green; the
intent-card format can be consumed by NemoClaw/OpenShell instead of competing."
**Show:** `index.js` hook registration, `docs/UPSTREAM.md`, `clawfence verify`.
**Avoid:** claiming you should merge it into core; ask what shape they'd accept.

## M5Stack / Seeed hardware
**Cares about:** physical interaction, board use, real sensing/feedback.
**Say:** "The phone is the physical surface today; the CoreS3/Cardputer firmware
is compiled and in the repo. I applied for a board but did not own one; if you
allocate one, I'll flash it now and demo the same tap on hardware."
**Show:** `firmware/bin/*.bin`, `firmware/README.md`, the phone card with STOP.
**Avoid:** pretending a hardware demo ran if no board was allocated.

## Tencent (Claw Cafe host)
**Cares about:** safety at scale, deployment, local/edge models, ecosystem.
**Say:** "Local-first: rules in-process, optional local model; no tool output or
page text reaches the adjudicator, so prompt injection has no channel. The same
provider config points at an on-prem/DGX endpoint. Intent cards are portable
policy artifacts, not a new platform."
**Show:** local Qwen3-4B proof, `docs/REAL-MODEL.md` DGX section, audit receipt.
**Avoid:** over-indexing on a single cloud vendor; stay model-agnostic.

## NVIDIA / local-model bar
**Cares about:** local inference, open-weight models, latency.
**Say:** "Rules p50 82 µs; hook p50 <0.4 ms. The model path is optional; if the
DGX Spark token bar exposes an OpenAI-compatible endpoint, I can point at it in
one config and keep the same demo."
**Show:** `proof/bench.json`, `proof/real-model.json`, DGX config snippet.

## sspai / media
**Cares about:** a story a non-expert can retell, visuals, a human moment.
**Say:** "14 actions, 5 unsafe, 0 questions. With the fence: 9 run, 3 blocked, 2
taps, 0 unsafe. The phone shows the task, action, and reason; one tap resumes or
blocks; STOP kills the run."
**Show:** one-pager, 78s video, stranger-mode phone card.
**Avoid:** a 10-minute architecture lecture.

## Partner award strategy
- **OpenClaw core:** strongest fit (plugin + upstream path).
- **M5Stack/Seeed:** conditional on board allocation; phone fallback is honest.
- **Tencent/NVIDIA:** local-first security narrative.
- **Media:** the 5→0 / 2 taps story.

## If asked "what would make this win?"
> "A board on Friday so the physical tail is real, and one judge-chosen task to
> integrate on site. The software evidence is already there."
