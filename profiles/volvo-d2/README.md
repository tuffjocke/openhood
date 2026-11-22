# Volvo, all modules (D2 on CAN)

Volvo's own trouble codes from every module that answers, on the cars where Volvo's D2
diagnostics run on CAN and reach the diagnostic socket:

| Platform | Models | Years |
| --- | --- | --- |
| P1 | S40, V50 | 2004 to 2012 |
| P1 | C30 | 2007 to 2013 |
| P1 | C70 | 2006 to 2013 |
| P2 | S60 | 2005 to 2009 |
| P2 | V70, XC70 | 2005 to 2007 |
| P2 | S80 | 2005 to 2006 |
| P2 | XC90 | 2005 to 2014 |

Years from datatransferring.com's list of cars with the P1 and P2 brake module, cut where the
P2's diagnostic relay ends (model year 2004, see below) and where the P3 cars take over (2007 S80,
2008 V70 and XC70).

A standard OBD-II scanner only gets the emissions codes from the engine and gearbox. On a 2010
V50 the engine's own list had five codes while standard mode 03 showed none (OBDb issue below).

**Read only.** Nobody has published the clear request (`AF` is named in the service list, its
bytes aren't), so the profile has no clear. Clearing stays with VIDA or another tool for now.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Requests go to 29-bit id `000FFFFE` as one 8-byte frame `C8+n, module, service, data, padding` | community, known answer | waal70blog (2009 S60), Alfaa123/Volvo-CAN-Gauge, Tigo2000/Volvo-VIDA (2008 C30), OBDb V50 issue 14 |
| Read codes `CB xx AE 11` → `xx EE 11`, then two bytes per code | community, known answer | OBDb V50 issue 14 (checked against VTool), swedespeed.com and jagrullar.se S80 ME7 logs, VIDA's own text "Read DTC Request 2 byte DTC; AE 11" quoted on jagrullar.se |
| Multi-frame answers: bit 7 first, bit 6 last, bits 0 to 2 the byte count; middle frames `09`, `0A`… carry 7 | community, known answer | OBDb V50 issue 14 (first, last, count); the S80 ME7 part-number log (`8F`, `09`, `4C`) |
| Negative answer `xx 7F service reason` | community | Matthew's Volvo site CEM log (`CC 50 7F B9 22`), OBDb V50 issue 14 |
| ELM327: `ATCAF0 ATCP00 ATSH0FFFFE ATST40`, filter `ATCF` / `ATCM` on the answer range | community | OBDb V50 issue 14 (STN-based vLinker MS) |
| `ATSP7` (CAN, 29 bit, 500 kbit/s) | guess | ELM327 datasheet; the V50 notes don't say which protocol number they used |
| Answer ranges `0040`, `0060`, `0080`, `0100`, `0120` (core/volvo-d2/frame.ts) | community | the logs below; other cars may use others |
| Codes shown as `MODULE-XXXX` | community | OBDb V50 issue 14 (matched VTool), volscan.tech, VIDA screens quoted in forums |
| Module addresses (modules.ts) | community | see Modules |
| Explanations (codes.ts) | community | Written for Openhood from xemodex.com's list of CEM codes |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · V70 2.4 2006 · faults from ECM, CEM, SRS OK (@yourname)`

## A session

```
ATE0 ATL0 ATS0 ATH1 ATSP7 ATCAF0 ATCP00 ATSH0FFFFE ATST40
ATCF00400000 ATCM1FE00000          answers from 0040xxxx
CB7AAE1100000000                    engine (petrol), read codes
00400021 8F 7A EE 11 C3 01 12 0F    first frame: 7 bytes
00400021 4E 00 89 00 02 06 0A 00    last frame: 6 bytes
                                    → ECM-C301 ECM-120F ECM-0089 ECM-0002 ECM-060A
CB58AE1100000000                    airbags
NO DATA                             not in this range: try ATCF00600000, then 0080, …
```

## Modules

Addresses seen answering, by car. On a 2002 S80 they were found by sniffing VIDA's scan on the
slow bus (hackingvolvo.blogspot.com, December 2012); on a 2010 V50 by asking on the fast bus
(OBDb issue 14).

| Module | Address | Seen on |
| --- | --- | --- |
| ECM, petrol engine (ME7) | `7A` | S80 ME7, 2008 C30 T5 |
| ECM, diesel engine | `11` | 2009 S60 2.4D, 2010 V50 D4204T |
| TCM, automatic gearbox | `6E` | VIDA sequence file quoted on Matthew's Volvo site |
| CEM, central electronics | `50` fast bus, `40` slow bus | 2010 V50, 2009 XC90, 2002 S80 |
| SRS, airbags | `58` | 2002 S80 |
| DIM, instruments | `51` | 2002 S80, 2008 C30 |
| CCM, climate | `29` | 2002 S80 (2008 C30 answered on `29` too) |
| REM, UEM, DDM, PDM, PSM | `46`, `47`, `43`, `45`, `2E` | 2002 S80 |
| SWM, steering wheel | `48` (S80), `49` (V50) | both |
| AEM, accessories | `52` | hackingvolvo.blogspot.com, January 2013 |
| ADM, diesel additive | `0B` | 2010 V50 |
| Unknown, shown as `M01` and `M30` | `01`, `30` | 2010 V50; the author guessed brakes and power steering |

A module the car doesn't have stays silent. Each silent module costs a few short waits (one per
answer range), so a full read on a car with few modules takes longer than one with many.

## What's open

- **The slow bus.** On the P1 V50 the CEM passed requests for the slow-bus modules through from
  the fast bus. Whether that holds on every car isn't known. If the airbags, doors or instruments
  never answer, they may only be reachable on OBD pins 3 and 11 (125 kbit/s), which an ordinary
  ELM327 isn't wired to. Adapters with a switch for Ford's MS-CAN use the same pins and speed and
  might work; nobody has said so yet.
- **P2 up to model year 2004.** A relay in the CEM keeps the CAN buses off the socket until a
  K-line command opens it (Volvo's workshop manual: the relay is only on cars up to model year
  2004). Not covered.
- **Clearing.** Needs the `AF` request's bytes from a log.
- **Code meanings.** VIDA's texts can't be copied. Explanations are written one by one.

## Sources

- OBDb/Volvo-V50 issue 14, "2010 D4204T diesel: VIDA protocol notes": https://github.com/OBDb/Volvo-V50/issues/14
- Tigo2000/Volvo-VIDA (GPL-3.0), 2008 C30 T5: https://github.com/Tigo2000/Volvo-VIDA
- Alfaa123/Volvo-CAN-Gauge, Codes.txt: https://github.com/Alfaa123/Volvo-CAN-Gauge/blob/master/Codes.txt
- waal70blog, "The CAN network on a Volvo" (2009 S60 2.4D): https://waal70blog.wordpress.com/category/volvo/
- hackingvolvo.blogspot.com, "Success!" (2002 S80 module list): http://hackingvolvo.blogspot.com/2012/12/success.html
- Swedespeed, "CANBUS communication Volvo S80 ME7": https://www.swedespeed.com/threads/canbus-communication-volvo-s80-me7.138106/
- Sveriges Volvoforum, "CAN-bus i diagnosuttag": https://www.jagrullar.se/forum/viewtopic.php?t=48773&start=40
- Matthew's Volvo site, "Vida CEM swapping" (TCM sequence file, CEM logs): https://www.matthewsvolvosite.com/forums/viewtopic.php?t=85611
- martonn98/VolvoP2_CAN (bus speeds, the diagnostic relay; AGPL-3.0, facts only): https://github.com/martonn98/VolvoP2_CAN
- xemodex.com, CEM for 2005 and newer P2 cars (CEM-1A5x codes): https://xemodex.com/blog/deep-delve-central-electronic-module-cem-for-2005-p2-platform-volvos/
- datatransferring.com, Volvo BCM P1, P2 (models and years): https://www.datatransferring.com/volvobcm
- volscan.tech, why generic scanners miss Volvo codes (buses and pins): https://volscan.tech/blog/obd2-scanner-volvo-fault-codes/
- Volvo workshop manual on the diagnostic relay, via autorepairshq.com (S80 2004)

Only facts (bytes, addresses, frame layouts) are used. No code or text is copied.
