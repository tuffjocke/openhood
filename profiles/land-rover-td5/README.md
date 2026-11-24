# Land Rover Td5

Engine ECU on the Td5 diesel (Defender and Discovery 2, 1998 to 2006), MSB and NNN variants.
K-line on OBD pin 7, 10400 baud, ISO 14230 fast init, ECU address `0x13`, tester `0xF7`.
Not standard OBD-II: generic scanners and ELM327 adapters don't work.

## Status

Connect, unlock, fault read and the live values marked verified have been checked on a 1999 Defender (below).
Every part is also backed by at least one independent open project; the ones marked "known
answer" are checked byte for byte in `tests/td5.test.ts` against published values or the car's frames.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Fast init, `81 13 F7 81 0C`, answer `03 C1 57 8F AA` | verified, known answer | Ekaitza_Itzali, SimonRafferty, TD5-Dash |
| Diagnostic session `02 10 A0 B2` → `01 50 51` | verified, known answer | Ekaitza_Itzali, SimonRafferty |
| Security key (`keygen.ts`), big-endian seed and key | verified, known answer (34A5 → 54D3, 8972 → 4511 on the car) | td5keygen, LR4x4 ESP32 thread |
| 55 ms between messages with the engine running | community | TD5-Dash |
| `7F 81 10` = old session still open: send `01 82 83`, retry | community | TD5-Dash (§7, §11); the addressed `81 13 F7 82 0D` is refused (`7F 82 10`) on the car |
| StopCommunication `01 82 83` on disconnect | community | TD5-Dash |
| RPM `21 09`, road speed `21 0D` | verified | SimonRafferty, Nanocom log format |
| Temperatures `21 1A` (coolant, intake, ambient, fuel; 0.1 K + sensor mV) | verified, known answer | Nanocom log format, SimonRafferty |
| MAP and MAF `21 1C` (MAP 0.01 kPa, MAF 0.1 kg/h at offset 4) | verified, known answer | Nanocom log format, discovery2-diag (MAF proven on a car) |
| Ambient pressure `21 23` (0.01 kPa), boost = MAP − ambient, also shown as air pressure | verified | SimonRafferty, discotd5 |
| Idle speed error `21 21` (signed rpm, target minus actual) | community | discovery2-diag (`rpm_error`), Ekaitza_Itzali (`get_rpm_error`), SimonRafferty |
| Injected fuel per stroke `21 1D`, data offset 6 (0.01 mg), shown as "Injected" | community | discovery2-diag (`injection_qty`, marked proven there); the rest of the block isn't read |
| Cylinder balance `21 40`: five signed numbers, cylinders 1 to 5, no unit published | community | discovery2-diag (`balance_1..5`, marked proven on a Discovery 2 NNN; its notes say BinOwl_Td5Gauge reads it the same way). Not read on an MSB ECU yet |
| Battery `21 10` (mV) | verified | SimonRafferty |
| Accelerator tracks `21 1B` (mV, track 1 shown) | verified | SimonRafferty |
| Pedal 5 V supply in `21 1B` | not shown | the layout differs by ECU: discovery2-diag's NNN has it at data offset 6, the 1999 Defender (MSB) answered `03 63 10 50 13 88 00 00 13 A3`, 0 at offset 6 |
| Fault memory `21 3B`: 35-byte block, one bit per fault | verified, known answer | Ekaitza_Itzali sniffed trace, discovery2-diag (read on a car) |
| Fault names, 210 bits (`fault-map.ts`) | community | discovery2-diag, cross-checked with Ekaitza_Itzali and a reference tool |
| Nanocom codes: byte + 1, bit + 1 (`13.5` = `14-6`) | community | Ekaitza_Itzali (`fault_code_GG_SS`), TD5-Dash (`dtc_lookup.py`) |
| A/C fan, A/C clutch, tacho and gearbox/ABS open load (bytes 9 and 13) are normal on a Defender | community, seen on the car | TD5-Dash (`_DEFENDER_EXPECTED`) |
| Clear faults `31 DD` + 18 zeros → `71 DD` | community, known answer | Ekaitza_Itzali sniffed trace, discovery2-diag (cleared on a car) |
| Plain-language explanations (`fault-explanations.ts`) | community | Written for Openhood, grouped by fault family |

Tested on (add a line when you test on a car):
- 2026-11-24 · Defender 1999 · early MSB ECU, EU2 · VAG-COM KKL 409.1 (FTDI) on macOS · connect, unlock,
  fault read and all live values at idle OK; clearing not tried (@tuffjocke, GitHub issue #1)

## Connect sequence

```
fast init (25 ms low, 25 ms high; sent as one 0x00 byte at 360 baud)
→ 81 13 F7 81 0C          start communication (addressed)
← 03 C1 57 8F AA
→ 02 10 A0 B2             diagnostic session
← 01 50 51
→ 02 27 01 2A             request seed
← 04 67 01 SH SL CS       seed, high byte first
→ 04 27 02 KH KL CS       key, high byte first (seed 34 A5 → key 54 D3)
← 02 67 02 6B             unlocked
→ 02 21 3B 5E             read fault memory
← 25 61 3B <35 bytes> CS
→ 14 31 DD 00×18 22       clear fault memory
← 02 71 DD 50             (can take ~300 ms)
```

Bytes are sent 5 ms apart and requests 55 ms after each answer. Continuous polling keeps the
session alive. On disconnect we send `01 82 83` (StopCommunication). If a session is still open,
the ECU refuses `81` with `7F 81 10`, and every refused start keeps the old session alive: after
`01 82 83` and one retry, stay silent for about 15 s before connecting again.

**Fast init on macOS:** a serial BREAK never woke the ECU (each BREAK call takes 3 to 5 ms; 15 to
25 ms waits were tried). One `0x00` byte at 360 baud (start bit + 8 zero bits = 25.0 ms) works, so
the CLI's `NodeSerialTransport` does that. The browser still uses BREAK (not tried on a car yet).

## Known gaps

- **Unnamed bits** `15.6`, `23.7`, `25.5` (Nanocom 16-7, 24-8, 26-6) are set on an early MSB Defender
  and named by no source. A Nanocom or Testbook reading of that car would name them.
- `14.1` and `15.1` are both "high speed crank (Logged)" in every source.
- **External air temperature** (`21 1A`, third pair) reads -50 °C at 5000 mV when no sensor is fitted
  (early Defender), so it isn't shown.
- **Pedal as a percentage.** The ECU reports track voltages; the conversion to percent isn't sourced
  yet, so we show track 1 in volts.
- **Not tried on a car yet:** idle speed error (`21 21`) and fuel per stroke (`21 1D`). A car that
  refuses either one leaves that chart empty; the other readings carry on.
- **Not read yet:** injector balance (`21 40`, five signed cylinder trims), input switches
  (`21 1E`: brake, clutch, cruise), EGR (`21 37`) and wastegate (`21 38`) positions.
  Ekaitza_Itzali's sign handling for `21 40` and `21 21` subtracts 65537, one off: use 65536.
- **Avoid** `21 07`, `0A`, `0B`, `0F`, `17`, `20`, `2B`, `2C`: reported as rejected or unreliable.

## Sources

- Ekaitza_Itzali, Td5 diagnostic tool and protocol notes: https://github.com/EA2EGA/Ekaitza_Itzali
- td5keygen, key algorithm from ECU disassembly, with test vector: https://github.com/pajacobson/td5keygen
- SimonRafferty, Td5 Arduino/ESP32 diagnostics, PID list and scalings: https://github.com/SimonRafferty/Land-Rover-Td5-Arduino-Diagnostics
- LR4x4 thread on that project (byte order fix): https://lr4x4.com/topic/118782-td5-diagnostic-live-data-esp32-arduino-implementation/
- TD5-Dash, Raspberry Pi dash with a confirmed protocol document: https://github.com/JRogers83/TD5-Dash
- discovery2-diag, Discovery 2 Td5 platform, MAF proven on a car: https://github.com/Leijoma/discovery2-diag
- discotd5.com, Nanocom log format and boost definition: https://discotd5.com/scripts-and-code
- Ekaitza_Itzali sniffed sessions (Sniffing/…/Read_Faults_and_clear.log): fault read, clear, second key pair (021C → 4043)

Licences and notices: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
