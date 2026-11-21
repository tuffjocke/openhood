# Volvo 850, S70, V70 and C70 (keyword D3 B0)

The modules on the 1996 to 1997 Volvo 850 and the 1997 to 1998 S70, V70 and C70 that standard
OBD-II scanners can't reach. They speak Volvo's keyword D3 B0 protocol (KWPD3B0) on the K-line at
10400 baud. Three profiles share this folder:

| Profile | Module | Address |
| --- | --- | --- |
| `volvo-850-abs` | ABS and traction control | `01` |
| `volvo-850-srs` | Airbag computer (SRS) | `58` |
| `volvo-850-combi` | Instrument cluster (COMBI) | `51` |

The engine is read with standard codes (`generic-obd2`); the car chooser offers it next to these.
None of them has live data yet: nobody has published what these modules' `A5` readings mean.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| 5-baud wake-up at the module's address, keywords `D3 B0`, confirm `4F` | community | jonesrh.info (850 and SVC70 mileage pages) |
| Frames: format byte, target, source `13`, data, checksum | community, known answer | jonesrh.info, matthewsvolvosite.com |
| Format byte counts one more than the data (`82 51 13 A1 87`: one data byte) | community, known answer | jonesrh.info: `ATSH 83` before 2-byte requests, `84` before 3-byte ones; `85 13 51 EE 01 02 05 DF` |
| Keep-alive `A1` → `E1` | community | matthewsvolvosite.com, jonesrh.info interpreter |
| Read faults `AE 01` → `EE 01`, one raw code per byte, `FF` = none | community, known answer | jonesrh.info interpreter, stonis-world.com copy of jonesrh's code list |
| Clear faults `AF 01` → `EF 01` | community | jonesrh.info interpreter |
| Module addresses `01`, `58`, `51` | community | jonesrh.info scan page |
| ELM327 set-up: `ATSP 3`, `ATIIA`, `ATTA 13`, `ATWM 82 xx 13 A1`, `ATSH` per length | community, known answer | jonesrh.info, matthewsvolvosite.com |
| Raw code → Volvo code tables (`codes.ts`) | community | jonesrh's list of interpreted KWPD3B0 codes, a best effort by its own account |
| Whether the module sends the inverted address after the wake-up | guess | Usual for ISO 9141 wake-ups; the link doesn't insist on it |
| Plain-language explanations (`codes.ts`) | community | Written for Openhood |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · 850 GLT 1997 · ABS · connect + faults OK (@yourname)`

## A session

```
5 baud: 01                      ABS module
← 55 D3 B0                      sync, keywords
→ 4F                            inverse of B0
→ 82 01 13 A1 37                keep-alive (format 82 = one data byte)
← 82 13 01 E1 77
→ 83 01 13 AE 01 46             read faults
← 85 13 01 EE 01 11 72 ..       two faults: ABS-321, ABS-431
→ 83 01 13 AF 01 47             clear faults
← 83 13 01 EF 01 ..
```

## ELM327 adapters

jonesrh reads these modules with an ordinary ELM327, and so does Openhood (`link.elm`): `ATSP 3`
(ISO 9141, 5-baud wake-up), `ATIIA 01` (the module's address), `ATTA 13`, `ATWM 82 01 13 A1` (the
adapter keeps the module awake itself), then `ATSH 83 01 13` before a two-byte request like `AE01`.
The header changes with the request's length because of the format byte. A KKL cable works too.

## Which cars

jonesrh.info covers the '96 to '97 850 and the '97 to '98 S70, V70 and C70 (and the V70 XC, which
Volvo didn't call XC70 yet). Earlier 850s use other diagnostics and are not covered.

## Sources

- jonesrh.info Volvo 850 OBDII portal, scan commands, mileage pages and KWPD3B0 interpreter:
  https://jonesrh.info/volvo850/
- jonesrh's explanation of the keep-alive frame on Matthew's Volvo Site:
  https://www.matthewsvolvosite.com/forums/viewtopic.php?t=56686
- Copy of jonesrh's list of interpreted KWPD3B0 codes: https://www.stonis-world.com/850_DTC.html

No licence is given for these, so only facts (bytes, addresses, code numbers) are used; no code or
text is copied.
