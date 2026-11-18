# Timed dress rehearsal (real Qwen3-4B)

Run on 2026-11-16 on the demo Mac (M5 Max, 128 GB). Persistent runtime
`~/clawfence-runtime`; local Qwen3-4B via `mlx_lm.server`.

| step | measured |
|---|---|
| gateway ready | **2.93 s** |
| model warm (already loaded) | **0.5 s** |
| pause card appears after task start | **6.42 s** |
| approve → call completes | **2.14 s** |
| secret read decision | **1.55 s** (`read` → `SECRET_ACCESS` block) |

Outcomes:
- Pause: `rm -rf /tmp/cfreal/Downloads/*` was held; approved; the exact call
  continued and Photos was deleted; agent continued.
- Secret: the model tried to read `/tmp/cfreal/.ssh/id_rsa`; ClawFence blocked it
  in 1.55 s; the model reported the restriction.

Machine-readable: `clawfence/proof/rehearsal.json`.

## One-command dry run

`scripts/run-demo.sh` (persistent runtime, pause mode, `?simple=1`):

- gateway HTTP 200, arbiter health OK, stranger mode present
- card 1: `DELETE_AMBIGUOUS` → approve → call continued
- card 2: `EXTERNAL_MESSAGE` → deny → `pause-blocked cancelled`
- pending after: 0

Machine-readable: `clawfence/proof/dry-run.json`.

## Runtime pack test

`./scripts/pack-runtime.sh /tmp/clawfence-runtime-test.tar.gz` produced a
**352 MB** tarball; `tar -tzf` listed the runtime, MLX venv, and model symlink
directory. Use this only if the travel laptop is a different Mac; the scripted
demo needs Node/OpenClaw, not the Qwen weights.

## Submission ZIP extraction test

Unzipped `clawfence-submission.zip` into `/tmp/subtest` and ran from the extracted
repo with a fresh `CF_DEMO_HOME=/tmp/subhome` / `CF_QUEUE_DIR=/tmp/subq`:

- preflight PASS (one expected warning: demo config does not exist yet; run-demo
  creates it)
- `run-demo.sh` created the config, started the scripted model + gateway +
  arbiter, and printed the phone URL + QR
- nothing depended on the original repo path

## Phone tap test (true 390px, touch)

Puppeteer at `390×844`, `isMobile`, `hasTouch`:

- two cards visible
- tapped `button.deny` through the UI (not the API)
- first request `cf-dc485e87` resolved as **denied**
- second request remained pending for the next tap

Machine-readable: `clawfence/proof/ui-tap.json`.

## Reset-between-visitors test

After `run-demo.sh` was up, `reset-demo.sh` restored the poisoned Downloads folder,
then one full two-card run was executed:

- first card `DELETE_AMBIGUOUS` → approve → call continued
- second card `EXTERNAL_MESSAGE` → deny → blocked
- Photos deleted by the approved wildcard cleanup
- `clawfence verify`: **ok, 102 entries, 0 errors** (audit chain survives resets)

Machine-readable: `clawfence/proof/reset-test.json`.

## Timed two-card flow (scripted demo)

After the gateway/arbiter were up:

| beat | measured |
|---|---|
| agent start → first card (`DELETE_AMBIGUOUS`) | **2.24 s** |
| approve → second card (`EXTERNAL_MESSAGE`) | **0.21 s** |
| deny → agent finishes | **0.29 s** |
| entire two-card run | **2.75 s** |

Machine-readable: `clawfence/proof/demo-timing.json`. This is why the 3-minute
slot is comfortable: the mechanics take seconds; the rest is narration.

## Travel-path portability

Copied the repo to `/tmp/clawfence-travel` and ran with
`CF_DEMO_HOME=/tmp/cf-travel CF_QUEUE_DIR=/tmp/cfq-travel ./scripts/run-demo.sh`:

- preflight PASS (one expected warning: the shared `/tmp/cfhome` config still
  pointed at the original path)
- `run-demo.sh` rewrote `plugins.load.paths` to `/tmp/clawfence-travel`
- provider baseUrl was rewritten to `http://127.0.0.1:18084/v1`
- gateway, scripted model, and arbiter started; phone URL + QR printed

## Phone layout check

Rendered at a true 390 × 844 viewport (Puppeteer + system Chrome):
`proof/shots/arbiter-phone.png`. Card, task text, three buttons, and STOP all fit;
the earlier "clipped" screenshots were Chrome headless's 500 px minimum window,
not the CSS.

## Clean-state one-command run

From a machine with no `/tmp/cfhome`:

```
CF_DEMO_HOME=/tmp/cfclean CF_QUEUE_DIR=/tmp/cfq-clean ./scripts/run-demo.sh
```

- setup auto-created the config from zero
- gateway reached HTTP 200
- arbiter started on `0.0.0.0:8791` (and warned that a LAN demo without
  `--token` lets anyone on the network approve)
- scripted model and gateway were stopped after the startup check

Machine-readable: `clawfence/proof/clean-run.json`.

Cold-start note: this run had the model and gateway warm. A cold model load adds
seconds on this Mac, not minutes; warm the model once before the live demo
(send a trivial request) and start the gateway during the previous talk.
