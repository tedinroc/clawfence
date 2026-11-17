# Final artifact audit (2026-11-16 22:55 PT; re-audited 2026-11-17 09:17 PT)

| artifact | check | result |
|---|---|---|
| Repo | clean, pushed | `main...origin/main` clean |
| Release v0.1.0 | assets present | deck.pdf, deck.pptx, demo.mp4, one-pager.pdf, runbook.pdf |
| Deck PDF | pages / size | **10 pages, 960×540 pt (16:9)** |
| One-pager PDF | pages | **1 page** |
| Runbook PDF | pages / size | **2 pages, A4 (595×842 pt)** |
| Demo video | duration / size | **78.2 s / 1.87 MB** |
| Firmware | CoreS3 + Cardputer | both `.bin` ~1.1 MB, compile-verified |
| CI | latest runs | **success** (tests + suite + bench + manifests) |
| Links | repo / release / Luma / ClawCon | all HTTP **200** |
| Attendance | Luma status | **approved**; attending Dec 4–5; no board → phone-first |
| Travel brief | hotel/flight/visa research | `TRAVEL_BRIEF.md` (no bookings made) |
| Application | required fields drafted | Q1/Q2/Q9; user-specific `[city]` and Chinese handle remain |
| Test suite | 18 unit / 26 scenarios | 18/18, 26/26, 0/15 unsafe, 0/11 benign blocked |
| Plugin Inspector | package | **PASS, 0 warnings** |
| Fresh-profile install | clone → `plugins install -l --accept-capabilities` | **PASS**, `clawfence status` works |
| Benchmark | 15,000 decisions | p50 82 µs, p95 219 µs, 0 mismatches |
| Dress rehearsal | real Qwen3-4B | gateway 2.93 s, card 6.42 s, approve→done 2.14 s, secret block 1.55 s |
| Real demo caveat | full agent turn | **127 s** to first card; scripted demo is the timed slot |

## User-owned blockers

1. Luma application (needs the user's account and personal details); **deadline 11/25**.
2. ClawCon registration.
3. Travel documents / flight / hotel.
4. ClawHub publish (device-flow login).
5. Physical attendance at muShenzhen, Dec 4–5.

Everything else is built, tested, packaged, and linked.

## Round-50 re-audit (2026-11-17T17:17Z)

- repo clean, CI **success**
- release assets: 5 (deck PDF/PPTX, video, one-pager, runbook)
- PDF pages: deck 10, one-pager 1, runbook 2
- video: 78.2 s
- Luma: Claw Hack 54 spots left; ClawCon 816; no judge/prize details published
