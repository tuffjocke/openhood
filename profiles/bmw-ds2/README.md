# BMW DS2 modules

Fault codes from every module that speaks BMW's DS2 on the cars of the DS2 years: 3 Series
(E36 and E46), 5 Series (E39), 7 Series (E38), X5 (E53) and Z3. A KKL cable, 9600 baud with
even parity, no wake-up. Read only.

The cars are the ones BMW Scanner 1.4 over WebUSB names as the DS2 generation. The years are the
production years of those chassis (Wikipedia), joined per model: 3 Series 1991 to 2006 (E36 and
E46), 5 Series 1996 to 2003 (E39), 7 Series 1995 to 2001 (E38), X5 2000 to 2006 (E53), Z3 1996 to
2002. Which modules a car has, and whether each speaks DS2, differs by year and equipment.

**The socket.** Older cars have a round 20-pin socket under the bonnet; the modules are on its
TxD line. Cars with an OBD socket carry the engine and gearbox on pin 7 and the body modules on
pin 8, so a cable for BMW joins 7 and 8. Without that, only the engine and gearbox answer.

**Read only.** Clearing (control 05) is named in the sources but its exact request isn't, so it is
left out for now.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Framing: address, length (whole message), control, data, XOR checksum; 9600 baud, even parity | community, known answer | E46M3-Monitoring `ds2-core` (frame.ts, transport.ts), RomRaider forum |
| Fault memory in two reads, `04 00` then `04 01` (`12 05 04 00 13`, `12 05 04 01 12`) | community, known answer | E46M3-Monitoring `ds2-mss54/requests.ts`; BMW Scanner 1.4 over WebUSB `session.js` |
| Answer status A0 done, A1 busy, A2 refused, B0, B1 | community | E46M3-Monitoring frame.ts |
| Count at the start of the answer, entry size = data length over count after dropping trailing zeros, code = first byte | community | BMW Scanner 1.4 over WebUSB `decodeFaults`, measured on one E46 (3, 10 and 14 byte entries); the author says it fits three modules |
| Module addresses (modules.ts) | community | see Modules |
| Code meanings | none yet | BMW's texts live in its SGBD files; codes show with the module's name |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · E39 528i 1999 · faults OK from DME, IKE, ZKE (@yourname)`

## Modules

| Module | Address | Backed by |
| --- | --- | --- |
| DME, engine | `12` | E46M3-Monitoring (MSS54, E46 M3) |
| EGS or SMG, gearbox | `32` | E46M3-Monitoring (SMG II) |
| ASC or DSC, traction control | `56` | E46M3-Monitoring (ASC MK20, DSC E46). On a later E46 the DSC MK60 answers KWP2000 at `29` instead and isn't read here |
| SRS, airbags | `A4` | BMW Scanner 1.4 over WebUSB (E46) |
| IKE, instruments | `80` | same |
| ZKE, body | `00` | same |
| LCM, lights | `D0` | same |
| IHKA, climate | `5B` | same |
| LEW, steering angle | `57` | same |

The immobiliser (EWS, `44`) is left out on purpose.

## Sources

- E46M3-Monitoring (MIT), `packages/ds2-core` and `packages/ds2-mss54`: https://github.com/mushitaro/E46M3-Monitoring
- BMW Scanner 1.4 over WebUSB (MIT), `web/js/protocol.js`, `web/js/session.js`, `docs/findings.md`: https://github.com/mogyiii/bmw-scanner-1.4-webusb
- RomRaider forum, "DS2 - datalogging MS41/42/43 by serial protocol" (XOR checksum): https://www.romraider.com/forum/viewtopic.php?f=42&t=11086&start=30

Only facts are used (bytes, frame layouts, addresses); no code is copied.
