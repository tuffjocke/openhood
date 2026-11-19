# Generic OBD-II

The standard emissions diagnostics every OBD-II / EOBD car has to support, over the K-line:
ISO 14230-4 (KWP2000, fast or 5-baud init) and ISO 9141-2 (5-baud init). Shows standard values only: nothing
manufacturer specific, and no ABS, airbag or body modules.

Which cars: K-line cars with OBD-II. In Europe EOBD became mandatory for petrol cars from about
2001 and diesels from about 2004; in the US OBD-II from 1996. Cars that use CAN (pins 6 and 14)
won't answer. Check pin 7 in the OBD socket
(see [hardware](../../docs/hardware.md)).

## How it talks

- Tries **fast init** first: then everything is sent with a functional header to address `0x33`
  from tester `0xF1`, and `C1 33 F1 81 66` starts communication.
- If nothing answers, it sends `0x33` at **5 baud** (about 2 seconds). The ECU answers `55` and two
  key bytes: `08 08` or `94 94` means ISO 9141-2 (frames `68 6A F1 ...`, answers `48 6B ...`,
  separated by silence), anything ending in `8F` means ISO 14230 with the same frames as fast init.
- No session or security needed.
- `01 00`, `01 20`, `01 40` return bitmasks of supported PIDs. Values the car doesn't support
  show as "n/a" and aren't polled.
- 55 ms between messages (P3 minimum for both standards).

## Status

| Part | Confidence | Notes |
| --- | --- | --- |
| Framing, addressing, init | community | ISO 14230-4, widely implemented |
| Mode 01 formulas | community | Published standard formulas |
| Trouble codes (03/04) | community | Code format standard, descriptions for common P0 codes only |
| 5-baud init, ISO 9141-2 framing | community | Bit-banged from the browser at 200 ms per bit |
| Pending codes (07), freeze frame (02), self-tests (01 01) | community | Standard services |

Tested on: nothing yet. Add a line when you do:
`- 2026-12-01 · VW Golf 1.6 2003 · connect, live data, codes OK (@yourname)`

## Sources

- OBD-II PIDs, formulas and DTC format: https://en.wikipedia.org/wiki/OBD-II_PIDs
- SAE J1979 (diagnostic modes and PIDs), SAE J2012 (trouble code definitions), ISO 14230-4
  (KWP2000 for emissions diagnostics). Standards are paywalled; the Wikipedia page summarises them.
