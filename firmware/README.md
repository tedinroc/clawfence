# Hardware arbiter

The arbiter daemon exposes a tiny HTTP/JSON surface (`docs/ARBITER_API.md`). The
browser UI already runs on a phone; this folder is the on-site port to a partner
board.

## M5Stack CoreS3

`arduino/clawfence_arbiter/clawfence_arbiter.ino` — Wi-Fi poll + CoreS3 side
buttons (A = deny, B = approve once). Libraries: **M5Unified**, **ArduinoJson**.

Build (on the event laptop):

1. Install the ESP32 core (`esp32:esp32` 3.x) and the two libraries.
2. Select **M5Stack CoreS3** (or the board M5Stack provides).
3. Set `WIFI_SSID`, `WIFI_PASS`, `ARBITER_BASE` (the Mac/phone LAN IP), optionally
   `ARBITER_TOKEN`.
4. Flash and open the serial monitor.

This sketch is a **reference**, not a hardware-validated build. Verify the
M5Unified API on the exact board; for Cardputer-Adv, swap the two button reads
for the keyboard (`Y`/Enter = approve, `N`/Esc = deny) and keep the HTTP half.

## Why HTTP polling instead of a Gateway node

The device is an approval surface, not a Gateway node. It needs one GET and one
POST, no device identity, no WebSocket, no pairing. That keeps the on-site port
to an afternoon and lets a phone use the same daemon.

## Security

- Bind the daemon to loopback unless the device is on a trusted LAN.
- On a LAN, set `--token` and put the token in the sketch.
- The device can only approve or deny; it cannot read the audit log or run tools.
