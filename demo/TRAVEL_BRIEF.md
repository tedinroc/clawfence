# Shenzhen travel brief (for Dec 3–7, 2026)

**Status:** Luma approved, attending. No board owned → phone-first demo.
**Venue:** muShenzhen · OCT-LOFT (华侨城创意文化园), Nanshan, Shenzhen.
**Dates:** Claw Hack Fri Dec 4 10:00 → Sat Dec 5 18:30; ClawCon Sun Dec 6
12:30–18:00 (separate registration).

> This is research, not a booking. Confirm your passport/city before purchasing.
> Prices move; use refundable fares/hotels until the approval email and visa are
> in hand.

## Hotels (walkable to OCT-LOFT)

| hotel | distance / note | rough price |
|---|---|---|
| **GLEETOUR HOTEL SHENZHEN OCT-LOFT** (深圳华侨城创意文化园嘉途酒店) | inside OCT-LOFT B1, <100 m to the park; opened 2025; 9.3 rating; gym/laundry | ~TWD 2,600+/night (check Dec dates) |
| **Cityinn Oct Loft** (城市客栈创意园店) | ~0.1 km; simpler/budget; 7.9 rating | lower |
| **Hotel Indigo Shenzhen OCT** (IHG) | ~0.3 km; full-service | higher |

Recommendation: book **GLEETOUR** (or Cityinn as budget fallback) for **Dec 3–6**
(3 nights; checkout Dec 7 if returning that day). The venue is inside the park;
the exact room/check-in details come from the Luma approval email.

- Trip.com: <https://tw.trip.com/hotels/detail/?cityEnName=Shenzhen&cityId=30&hotelId=127061379>
- Nearby list: <https://www.hotels-in-shenzhen.com/en/near-oct-1660466/>

## Flights (assuming Taipei departure)

- **TPE → SZX** direct, ~1h50; China Airlines, EVA Air, China Southern.
- Dec 3 out, Dec 7 back is the safe pattern (event ends Dec 6 evening).
- Seen fares: China Southern promo from ~TWD 5,970; China Airlines/EVA ~TWD 11,600–11,900 round trip (economy, before taxes/fees). Book refundable if the 台胞證 is not yet in hand.
- Airline pages:
  - <https://flights.china-airlines.com/en-tw/flights-from-taipei-to-shenzhen>
  - <https://flights.evaair.com/en/flights-from-taipei-to-shenzhen>
- If coming from the US/elsewhere: SZX via HKG/SZX; check the **240-hour
  visa-free transit** rules and carry an onward ticket. Do not rely on it until
  the airline/port confirms.

## Airport → OCT-LOFT

- SZX Bao'an → OCT-LOFT: taxi/DiDi ~35–45 min, ~¥80–120; or Metro 11 → 1 to
  侨城东 (about 50–60 min). The GLEETOUR hotel is ~880 m from 侨城东 station.
- HKG → Shekou ferry → metro/taxi; more moving parts with luggage.

## Passport / visa

- **Taiwan passport:** 5-year 台胞證 via a Taiwan agency (~7 working days;
  express ~4). Backup: one-time 落地簽 at Shekou Cruise Terminal (~30 min,
  RMB 50–100, 3-month stay; first-time applicants may be free).
- **US/other passport:** confirm China visa or 240-hour transit eligibility
  before booking; carry printed approval email, hotel booking, return ticket.
- Carry the Luma approval email (printed + phone screenshot).

## Money / connectivity / power

- Alipay/WeChat Pay can link international cards but not everywhere; carry
  **RMB cash** (¥500–1,000) for taxis/incidentals.
- eSIM or HK-roaming SIM often routes around mainland blocks; test it before
  relying on GitHub/npm at the venue. Assume **no downloads on site**.
- China power: 220 V, Type A/C/I. Laptop/phone chargers are usually 100–240 V;
  bring a **Type A/C adapter** and a power strip.
- Weather early December: roughly 15–22 °C; layers + light rain jacket.

## Packing list

- Laptop + charger; phone + charger; **phone stand**; USB-C cables; power bank.
- Type A/C plug adapter; power strip.
- Passport/台胞證 + approval email + hotel/flight confirmations.
- RMB cash; travel insurance; basic meds.
- Printed one-pager + runbook (or PDFs on phone).
- Optional: M5Stack board if allocated at the venue; USB-C data cable.

## What to do first on arrival

1. Check in, test hotel Wi-Fi and phone hotspot.
2. Run `./clawfence/scripts/preflight.sh` on the laptop.
3. Start `./scripts/run-demo.sh`; open the printed
   `http://<LAN-IP>:8791/?simple=1` on the phone.
4. Sleep; arrive at the venue 09:00.
