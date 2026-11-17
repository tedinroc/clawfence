# ClawFence — attendee plan (approved)

**Status (2026-11-17):** Luma application **approved**, attending Shenzhen Dec 4–5.
**Hardware:** no M5Stack board owned; rely on venue allocation, **phone-first demo**.

## Dates (PT / CST)

| PT | CST | event |
|---|---|---|
| Dec 3 | Dec 4 | travel / arrive |
| Dec 3 18:00 | Dec 4 10:00 | Claw Hack doors + workshops |
| Dec 4 01:00 | Dec 4 17:00 | Day 1 hacking + Open Mic |
| Dec 4 18:00 | Dec 5 10:00 | Day 2 build |
| Dec 5 00:00 | Dec 5 16:00 | **submission** |
| Dec 5 01:00–01:30 | Dec 5 17:00–17:30 | **winners** |
| Dec 5 20:30 | Dec 6 12:30 | ClawCon (separate registration) |

## To-do by date

### Nov 17–20
- [x] ClawCon registered (2026-11-17).
- [ ] Confirm the approval email contains the venue/check-in details; screenshot it.
- [ ] Book refundable flight + hotel near OCT-LOFT, Nanshan (**Dec 3–7, 4 nights**).
      Flights: Dec 3 CZ3088 13:40→15:50 or CI527 15:25→17:25; Dec 7 CZ3087
      10:30→12:25 (or afternoon). See `TRAVEL_BRIEF.md`.
      Recommended hotel: **GLEETOUR HOTEL SHENZHEN OCT-LOFT** (inside the park,
      <100 m); budget fallback: **Cityinn Oct Loft**. Details:
      `TRAVEL_BRIEF.md`.
- [ ] Taiwan passport: confirm the 5-year 台胞證 (agency ≈7 working days; express
      ≈4; first-time free through 2027-12-31). Backup: one-time 台胞證 at
      **SZX Bao'an T3** (0755-23459289) or Shekou; ~30 min, ¥40.
- [ ] Flights: TPE→SZX Dec 3, back Dec 7 (direct, refundable). See `TRAVEL_BRIEF.md`.

### Nov 21–24
- [ ] Decide which laptop to bring. If **this Mac**: runtime is preinstalled at
      `~/clawfence-runtime`; run `./clawfence/scripts/preflight.sh`.
      If another Mac: install Node 24 + OpenClaw before travel (no venue Wi-Fi
      dependency).
- [ ] Run the phone-only demo once: `./scripts/run-demo.sh`; scan the printed QR
      (or open the printed `http://<LAN-IP>:8791/?simple=1`) on the phone.
- [ ] Record a fresh 78-second fallback on the travel laptop; copy to phone.
- [ ] Print the one-pager + runbook (or keep PDFs on phone).

### Nov 25
- [ ] Application deadline — **already approved**; no action needed.
- [ ] Optional: publish ClawFence to ClawHub (`clawhub login --device`).

### Dec 1–3
- [ ] Pack: laptop, charger, phone, phone stand, USB-C cables, power bank,
      USB-A/C adapter, passport/台胞證, approval email, hotel booking, RMB cash.
- [ ] `preflight.sh` PASS on the travel laptop; start `run-demo.sh` once.
- [ ] Travel to Shenzhen; arrive Dec 3 evening.

### Dec 4 (event Day 1)
- [ ] 09:00 arrive, front row, Wi-Fi + power.
- [ ] 10:00 OpenClaw / M5Stack / Seeed workshops. **Ask for a board** (script
      below); if allocated, take it but do not port until the phone demo works.
- [ ] 12:00 set up at a table: `run-demo.sh`, phone URL, proof frame.
- [ ] 13:00 build in the open; pair with a maintainer on `before_tool_call` /
      decision models.
- [ ] 18:00 Open Mic: 60 seconds, problem only.
- [ ] Evening: record fallback on the actual laptop; freeze scope.

### Dec 5 (ship day)
- [ ] 10:00 final integration only.
- [ ] 13:00 **feature freeze**.
- [ ] 14:00 record 90-second fallback; test on phone.
- [ ] 15:00 submit repo + video + demo text.
- [ ] 16:00 **deadline**.
- [ ] 16:30 rehearse 3 minutes twice, out loud, timed.
- [ ] 17:00 demos/awards; be present, be gracious, ask the partner for a photo + intro.
- [ ] 18:30 social.

### Dec 6
- [ ] ClawCon 12:30–18:00; bring laptop for the Clinic, one-pager for the stall.
- [ ] Ask for follow-up intros; offer the repo/release link.

## Hardware request script (at the M5Stack/Seeed table)

> "Hi — I'm the ClawFence entry (intent firewall for OpenClaw). I applied for a
> Cardputer-Adv or CoreS3 as the physical arbiter. If one is available, I'll
> flash my compiled firmware and demo a tap-to-approve; if not, my phone arbiter
> is the fallback and the software demo is unchanged. Could I get on the
> allocation list?"

中文：

> 你好，我是 ClawFence（OpenClaw 的意圖防火牆）的參賽者。我申請了
> Cardputer-Adv 或 CoreS3 當實體仲裁器；如果有板子，我會燒我已經編譯好的
> firmware demo 一鍵批准；如果沒有，手機仲裁器是備案，軟體 demo 不受影響。
> 請問可以排進 allocation 嗎？

## Phone-first demo (primary)

```bash
cd clawfence
./scripts/run-demo.sh          # prints Gateway + Phone URL
# phone opens: http://<LAN-IP>:8791/?simple=1
```

- Stranger mode: one card, task/tool/target/reason, three big buttons.
- If the board arrives: `./firmware/flash.sh cores3 /dev/cu.usbmodemXXXX`
  (or `cardputer`), then join the same Wi-Fi and set `ARBITER_BASE` to the
  laptop LAN IP.

## Contingencies

| failure | response |
|---|---|
| no board allocated | phone arbiter; say "software track with a phone as the physical surface" |
| venue Wi-Fi blocks GitHub/npm | pre-installed runtime; scripted model; no downloads on site |
| laptop model won't start | play the 78-second video from the phone; show proof frame |
| phone can't reach laptop (venue AP isolation) | **use the phone's personal hotspot**: Mac joins the hotspot, phone stays on it; `run-demo.sh` prints the hotspot LAN IP. Avoid venue Wi-Fi for the device link. |
| demo run fails | freeze, show `proof/shots/proof-frame.png` + `arbiter.png`, say the numbers |
| approval delayed/venue issue | contact the Luma host with the approval email |

## What not to do

- Do not spend Day 1 porting hardware before the phone demo is rehearsed.
- Do not add new features after 13:00 Saturday.
- Do not claim a hardware demo if no board is allocated; the phone is the honest
  physical tail.
