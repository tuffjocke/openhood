# VW and Audi, older engines (KWP1281)

Engine computers of Volkswagen Group cars that speak KWP1281, VW's own K-line protocol: most
Volkswagen, Audi, SEAT and Škoda engines from about 1990 to 2001, and some later ones. K-line on
OBD pin 7, a plain KKL cable (the classic "VAG-COM" cable), address `0x01`, 10400 baud with 9600 as
a fallback. ELM327 adapters can't speak KWP1281.

The protocol itself lives in `core/kwp1281/protocol.ts` and `core/link/kwp1281.ts`, because other
VW Group modules (instruments, ABS, airbag) use it too. This folder is only the engine.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Wake-up: address `01` at 5 baud (7 bits, odd parity), sync `55`, keywords `01 8A`, confirm `75` | community, known answer | Blafusel.de, KLineKWP1281Lib, kwp1281_tool |
| Every byte confirmed by its inverse, except the block end `03` | community | Blafusel.de, KLineKWP1281Lib |
| Block layout: length, counter, title, data, `03` | community, known answer | Blafusel.de, KLineKWP1281Lib |
| Identification blocks (`F6`) after waking, each confirmed with `09` | community | KLineKWP1281Lib |
| Keep-alive: `09` both ways when there's nothing to ask | community | KLineKWP1281Lib |
| Read faults `07` → `FC` blocks (3 bytes per fault), then `09`; `FF FF 88` = none | community, known answer | KLineKWP1281Lib, blafusel.de forum |
| Fault codes `4000` to `7FFF` are OBD codes (`41 2C` → P0300) | community | KLineKWP1281Lib |
| Elaboration: low 7 bits what's wrong, top bit "comes and goes" | community | KLineKWP1281Lib |
| Clear faults `05` → `09` (some ECUs send the list again) | community | KLineKWP1281Lib, blafusel.de forum |
| Measuring block `29 nn` → `E7`, 3 bytes per value: formula, a, b | community, known answer | KLineKWP1281Lib |
| Formulas for rpm, temperature, volts, speed, load, throttle, air flow, injection, ignition, mixture | community, known answer | KLineKWP1281Lib (ported) |
| Finding readings by formula in blocks 1 to 8 at connect | guess | Our approach: block layouts differ by engine |
| Coolant is the first temperature found | guess | Usual on petrol Motronic engines, not on every engine |
| Some engine computers only answer at 9600 baud | community | blafusel.de car list (Golf IV, Polo 9N) |
| Fault names (`names.ts`) | community | KLineKWP1281Lib (generated) |
| Plain-language explanations (`faults.ts`) | community | Written for Openhood |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Golf 1998 1.6 AFT · connect + faults OK (@yourname)`

Things to watch on a first real read:
- The confirmation timing. The ECU expects each inverse within a few tens of ms. A USB serial
  adapter adds latency (FTDI cables wait up to 16 ms by default). If blocks fail part way, that's the
  first suspect.
- Which blocks the readings come from. The traffic log shows "what is in block n?" at connect.
- Whether the coolant guess is right for that engine.

## Wake-up and a session

```
5 baud: 01                      engine computer (odd parity: 01)
← 55 01 8A                      sync, keywords "1281"
→ 75                            inverse of 8A
← 0F 01 F6 <12 chars> 03        identification, every byte confirmed by its inverse
→ 03 02 09 03                   got it (each byte confirmed, 03 isn't)
   ... more identification, then the ECU sends 03 nn 09 03
→ 04 nn 29 01 03                read measuring block 1
← 0F nn E7 01 C8 15 05 0A BC ... 03
→ 03 nn 07 03                   read faults
← 09 nn FC 02 0A 1F 41 2C A5 03 two faults: 00522, P0300 (comes and goes)
→ 03 nn 09 03                   next
← 03 nn 09 03                   no more
→ 03 nn 06 03                   end
```

## Which cars

Years in `vehicles` come from cars whose owners reported reading the engine over KWP1281 in the
blafusel.de scanned-car list (https://blafusel.de/obd/obd2_scanned.php): Audi 80 (1991 to 1995),
A3 (1997 to 2001), A4 (1995 to 2000), A6 (1995 to 2001), Golf (1991 to 2003), Passat (1994 to
2000), Polo (1995 to 2003) and Škoda Octavia (1998 to 2001). Engines changed to KWP2000 at
different times, so a car in these years can still have the newer protocol. Openhood then says so
and suggests reading standard codes instead.

## Sources

- Blafusel.de, KW1281 protocol description and forum (German): https://www.blafusel.de
- KLineKWP1281Lib by domnulvlad, GPL-3.0: https://github.com/domnulvlad/KLineKWP1281Lib
  (titles, timings, fault and measuring block formats, formulas and fault names ported)
- kwp1281_tool by Mike Naberezny, BSD-3-Clause:
  https://github.com/mnaberez/vwradio/tree/main/kwp1281_tool (wake-up and baud notes, facts only)
