# Land Rover Td5

Engine ECU on the Td5 diesel (Defender and Discovery 2, 1998 to 2006), MSB and NNN variants.
K-line on OBD pin 7, 10400 baud, ISO 14230 fast init, ECU address `0x13`, tester `0xF7`.
Not standard OBD-II: generic scanners and ELM327 adapters don't work.

## Status

Nothing in this profile has been checked on a car by us yet. Every part below is backed by at
least one independent open project; the ones marked "known answer" are also checked byte for
byte in `tests/td5.test.ts` against values those projects published.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Fast init, `81 13 F7 81 0C`, answer `03 C1 57 8F AA` | community, known answer | Ekaitza_Itzali, SimonRafferty, TD5-Dash |
| Diagnostic session `02 10 A0 B2` → `01 50 51` | community, known answer | Ekaitza_Itzali, SimonRafferty |
| Security key (`keygen.ts`), big-endian seed and key | community, known answer (34A5 → 54D3) | td5keygen, LR4x4 ESP32 thread |
| 55 ms between messages with the engine running | community | TD5-Dash |
| `7F 81 10` = old session still open: send `82`, retry | community | TD5-Dash |
| RPM `21 09`, road speed `21 0D` | community | SimonRafferty, Nanocom log format |
| Temperatures `21 1A` (coolant, intake, ambient, fuel; 0.1 K + sensor mV) | community, known answer | Nanocom log format, SimonRafferty |
| MAP and MAF `21 1C` (MAP 0.01 kPa, MAF 0.1 kg/h at offset 4) | community, known answer | Nanocom log format, discovery2-diag (MAF proven on a car) |
| Ambient pressure `21 23` (0.01 kPa), boost = MAP − ambient | community | SimonRafferty, discotd5 |
| Battery `21 10` (mV) | community | SimonRafferty |
| Accelerator tracks `21 1B` (mV, track 1 shown) | community | SimonRafferty |
| Fault memory `21 3B` and bit names (`faults.ts`) | guess | Needs mapping, see below |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Defender 90 1999 · NNN ECU · connect + live data OK (@yourname)`

## Connect sequence

```
fast init (25 ms low, 25 ms high)
→ 81 13 F7 81 0C          start communication (addressed)
← 03 C1 57 8F AA
→ 02 10 A0 B2             diagnostic session
← 01 50 51
→ 02 27 01 2A             request seed
← 04 67 01 SH SL CS       seed, high byte first
→ 04 27 02 KH KL CS       key, high byte first (seed 34 A5 → key 54 D3)
← 02 67 02 6B             unlocked
```

Bytes are sent 5 ms apart and requests 55 ms after each answer. Continuous polling keeps the
session alive.

## Known gaps

- **Fault memory.** The request and the bit-to-name table are placeholders. Ekaitza_Itzali and
  discovery2-diag both have a fault map cross-checked against a community fault list: port it from
  there (with credit), then confirm by unplugging a sensor with the ignition on.
- **Pedal as a percentage.** The ECU reports track voltages; the conversion to percent isn't sourced
  yet, so we show track 1 in volts.
- **Not read yet:** injector balance (`21 40`, five signed cylinder trims), input switches
  (`21 1E`: brake, clutch, cruise), EGR (`21 37`) and wastegate (`21 38`) positions.
- **Avoid** `21 07`, `0A`, `0B`, `0F`, `17`, `20`, `2B`, `2C`: reported as rejected or unreliable.

## Sources

- Ekaitza_Itzali, Td5 diagnostic tool and protocol notes: https://github.com/EA2EGA/Ekaitza_Itzali
- td5keygen, key algorithm from ECU disassembly, with test vector: https://github.com/pajacobson/td5keygen
- SimonRafferty, Td5 Arduino/ESP32 diagnostics, PID list and scalings: https://github.com/SimonRafferty/Land-Rover-Td5-Arduino-Diagnostics
- LR4x4 thread on that project (byte order fix): https://lr4x4.com/topic/118782-td5-diagnostic-live-data-esp32-arduino-implementation/
- TD5-Dash, Raspberry Pi dash with a confirmed protocol document: https://github.com/JRogers83/TD5-Dash
- discovery2-diag, Discovery 2 Td5 platform, MAF proven on a car: https://github.com/Leijoma/discovery2-diag
- discotd5.com, Nanocom log format and boost definition: https://discotd5.com/scripts-and-code
