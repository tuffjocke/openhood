# Saab Trionic 7

The engine computer of the four-cylinder petrol Saab 9-5 (1998 to 2010) and 9-3 (2000 to 2002),
including Saab's own P1 codes. Standard KWP2000 on the K-line (OBD pin 7), through a KKL cable or
an ELM327.

Years from the Trionic article's model list (Wikipedia; also quoted on saabnet.com): "1st
Generation 9-3 2000 to 2002 - T7", "1st Generation 9-5 1998-2010 4Cyl - T7". The 1999 9-3 used
Trionic 5 (the Viggen used T7, but it is a trim of the 9-3 and can't be told apart in the
chooser), and the diesels and the 9-5 V6 aren't covered.

## Status

Nothing here has been checked on a car by us yet.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Fast wake-up, engine address 11, tester F1 | community | Trionic CAN Flasher, `KWP/ELM327Device.cs`: `ATSP5`, `ATSH8011F1` |
| Read codes `18 02` → `58`, count, then code hi, lo, status per fault | community, known answer | Trionic CAN Flasher, `KWP/KWPHandler.cs` `ReadDTCCodes`, with an example answer (six codes) |
| Clear `14 FF FF` | community | Trionic CAN Flasher, `ClearDTCCodes` (the answer isn't checked there either) |
| Tester present `3E` | community | Trionic CAN Flasher, `KWPHandler.cs` |
| P1908, P1923 meanings | community | Saab WIS, Trionic T7 bus communication (instrument cluster or gearbox computer missing) |

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · 9-5 2.3t 2002 · faults OK with a KKL cable (@yourname)`

Trionic CAN Flasher can also reach the T7 over CAN with Saab's own wrapping (ids 220/238 to start,
240/258 for requests and answers, 266 to acknowledge each answer row). That route isn't used: the
K-line works with both kinds of adapter.

## A session

```
fast init, 81 → C1 EF 8F
18 02 → 58 06 06 05 E4 12 31 48 12 30 E8 15 30 E1 16 06 E8 14 60 41
        P0605 P1231 P1230 P1530 P1606 P1460 (the source's example)
```

## Sources

- Trionic CAN Flasher (mattiasclaesson/Trionic), `TrionicCANLib/KWP/KWPHandler.cs`,
  `KWPCANDevice.cs`, `ELM327Device.cs`: https://github.com/mattiasclaesson/Trionic. The repository
  has no licence file, so only facts are used, no code.
- Wikipedia, Trionic: https://en.wikipedia.org/wiki/Trionic
- Saab WIS, 9-5 1999 Trionic V6 bus communication (codes for missing modules):
  https://saabwisonline.com/9-5-9600/1999/2-engine/trionic-v6-obdii/technical-description/bus-communication
