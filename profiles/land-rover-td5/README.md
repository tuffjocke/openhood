# Land Rover Td5

Engine ECU on the Td5 diesel (Defender and Discovery 2, 1998 to 2006).
K-line on OBD pin 7, 10400 baud, ISO 14230 fast init, ECU address `0x13`.

## Status

| Part | Confidence | How to verify |
| --- | --- | --- |
| Fast init + start communication | community | ECU answers `C1 ...` in the traffic log |
| Diagnostic session `10 A0` | community | ECU answers `50` |
| Security key (`keygen.ts`) | community | ECU answers `67 02`, not `7F 27 35` |
| Live data layouts (`data.ts`) | community | Compare rpm and coolant with the dash |
| Fault bit names (`faults.ts`) | guess | Unplug a sensor, read, see which bit sets |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Defender 90 1999 · NNN ECU · connect + live data OK (@yourname)`

## Connect sequence

```
fast init (25 ms low, 25 ms high)
→ 81 13 F7 81 0C          start communication (addressed)
← 83 F7 13 C1 57 8F ..
→ 02 10 A0 B2             diagnostic session
← 01 50 51
→ 02 27 01 2A             request seed
← 04 67 01 SS SS CS
→ 04 27 02 KK KK CS       send key
← 02 67 02 6B
```

## Sources

Community knowledge from Td5 forums and open-source Td5 tools. Add links here when you
confirm something against a specific source.
