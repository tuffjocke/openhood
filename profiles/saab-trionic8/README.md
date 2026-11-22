# Saab Trionic 8

The engine computer of the four-cylinder turbo petrol Saab 9-3 from 2003 to 2011, including
Saab's own codes. GM's diagnostics (GMLAN) on the fast CAN bus, through an ELM327.

Years from the Trionic article's model list (Wikipedia; also quoted on saabnet.com): "2nd
Generation 9-3 2003 to 2011 4cyl - T8". The V6 and diesels use other engine computers and aren't
covered. The 1.8i (non-turbo) isn't a Trionic 8 either; it shows up in the chooser as a 9-3 all the
same, so its owner should pick standard codes.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Requests to 7E0, answers from 7E8, code frames from 5E8 | community | Trionic CAN Flasher, `Trionic8.cs` (`FilterIdECU`, `ReadDTC`) |
| Start `10 02` → `50`, after reading `20` | community | `StartSession10`, `Send0120` |
| Read codes `A9 81 12` (status mask 12: current and history) | community, known answer | `ReadDTC`, with the example frame `5E8 81 07 03 00 7F` |
| A first answer of `7F A9 78` (response pending) before the codes | community | `ReadDTC` |
| One code per frame: 81, hi, lo, failure type, status; ends with 81 then zeros | community, known answer | `addDTC`, `GetDtcDescription` (example `E1 03` = U2103) |
| Clear with standard OBD-II mode 04 | community | `ClearDTCCodes` (sent to 7DF there; to 7E0 here) |
| ELM327: `ATSP6`, `ATCAF0`, `ATSH7E0`, headers on | community | `CAN/CANELM327Device.cs` |
| Filter `ATCF5E8`, `ATCM5FF` to let 5E8 and 7E8 through | guess | Openhood's choice: the two ids differ in one bit |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · 9-3 2.0t 2006 · faults OK (@yourname)`

## A session

```
ATE0 ATL0 ATS0 ATH1 ATSP6 ATCAF0 ATSH7E0 ATCF5E8 ATCM5FF ATST7D
0210020000000000   → 7E8 01 50
03A9811200000000   → 7E8 03 7F A9 78                 response pending
                   → 5E8 81 07 03 00 7F 00 00 00     P0703
                   → 5E8 81 00 00 00 00 00 00 00     end of list
0120000000000000   → 7E8 01 60
```

## Sources

- Trionic CAN Flasher (mattiasclaesson/Trionic), `TrionicCANLib/Trionic8.cs` and
  `CAN/CANELM327Device.cs`: https://github.com/mattiasclaesson/Trionic. The repository has no
  licence file, so only facts are used, no code.
- Wikipedia, Trionic: https://en.wikipedia.org/wiki/Trionic
