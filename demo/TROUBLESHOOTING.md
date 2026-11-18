# On-site troubleshooting (fast paths)

Do not debug live for more than ~20 seconds. If the fix is not below in one
step, switch to the video fallback and keep the demo moving.

## Gateway will not start / port busy
```bash
lsof -nP -iTCP:19002 -sTCP:LISTEN
lsof -nP -iTCP:8791 -sTCP:LISTEN
lsof -nP -iTCP:18084 -sTCP:LISTEN
kill <pid>          # or ./scripts/run-demo.sh after killing stale processes
./scripts/preflight.sh
```
`preflight.sh` checks all three ports.

## "openclaw not found" or wrong Node
```bash
~/clawfence-runtime/node/bin/node -v          # want v24.22.3+
which openclaw
# run-demo auto-uses ~/clawfence-runtime/ocapp/node_modules/.bin/openclaw
```
If another Mac: `./scripts/pack-runtime.sh --check` then copy the tarball.

## Plugin not loaded
```bash
openclaw plugins list | grep clawfence
openclaw plugins install -l ./clawfence --force --accept-capabilities
openclaw clawfence status
```
`run-demo.sh` rewrites `plugins.load.paths` to the current repo path.

## Scripted model not answering
```bash
curl -s http://127.0.0.1:18084/v1/models
# if empty: restart run-demo; check /tmp/clawfence-demo-gateway.log
```
The provider baseUrl must be `http://127.0.0.1:18084/v1`; run-demo rewrites it.

## Phone cannot reach the laptop
- Are both on the same network? Venue Wi‑Fi may isolate clients.
- Use the **phone's personal hotspot**: both on it, then scan the new QR.
- iPhone: allow local-network access; disable Private Relay for the demo.
- Check the printed URL opens on the laptop: `curl -s http://<ip>:8791/api/health`.

## A card expired / nothing pending
- TTL is 60s in the demo (90s in real-demo). Re-run the task or use
  `./scripts/reset-demo.sh` then run again.
- `openclaw clawfence pending` shows what is waiting.

## Audit chain broken
```bash
openclaw clawfence verify
```
If errors: stop writing, copy `audit.jsonl` aside, and start a fresh demo home
(`CF_DEMO_HOME=/tmp/cfhome2`). Do not hand-edit the file.

## Real model is slow
- The full agent turn measured **127 s** to first card; use the scripted demo
  for the timed slot.
- Warm the model first; do not download anything on venue Wi‑Fi.

## Disk / permissions
- `df -h`; runtime is ~1.2 GB, ZIP ~9 MB.
- All demo paths live under `/tmp/cfhome` and `~/clawfence-runtime`; no admin.

## Fallback (when in doubt)
1. Kill the demo.
2. Show `proof/shots/proof-frame.png` + `arbiter-phone.png`.
3. Play the 78-second video from the phone.
4. Say: **unsafe 5 → 0, 2 taps, <0.4 ms, 26/26, stop is hash-chained.**
