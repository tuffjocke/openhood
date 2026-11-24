# Land Rover SLABS (Discovery 2)

The Wabco SLABS module of the Discovery 2 (1998 to 2004, Td5 and V8): ABS and the
self-levelling rear air suspension in one unit. Read and clear faults, and see the rear ride
height and battery, with a KKL cable.

## Status

Nothing here has been checked on a car by us yet. The source project proved reading and clearing
on its own Discovery 2 Td5.

| Part | Confidence | Backed by |
| --- | --- | --- |
| Fast wake-up at address 29, tester F7: `81 29 F7 81 22` → `C1 57 8F`, no session or unlock | community, proven on a car by the source | ostler-pack-lr-d2 `slabs/slabs.py` (sniffed from a reference tool) |
| First request `1A 8A`, as the reference tool sends it | community | same |
| Faults `21 11` (logged) and `21 47` (current): 16 bytes, one bit per fault | community, proven on a car by the source | `slabs/faults.py` |
| Byte 3 bit 4: right front wheel speed sensor, output too low; byte 10 bit 4: shuttle valve switch, electrical | community | the source's sniff, matched against the reference tool's screen |
| Clear `14 FF FF` → `54` about 300 ms later | community, proven on a car by the source | `slabs.py` `clear_faults` |
| At most about one message a second; faster and SLABS drops the session after 15 to 20 s | community, measured on a car by the source | discovery2-diag `references/slabs_protocol.md` (the reference tool sends one a second) |
| After a session it needs about 25 s or more of silence before it answers a new wake-up; every try in between restarts the wait | community, measured on a car by the source | same |
| Rear ride height `21 54`: data byte 0 left, byte 1 right, raw (about 110 to 135 is normal, set by calibration; a fixed 0 or 255 means a broken sensor or arm) | community, proven on a car by the source | discovery2-diag `signals/slabs.json`, `slabs_protocol.md` (`91 9C 0F 0F` = 145 and 156) |
| Battery `21 44`, data byte 12, 1/16 V | community, proven on a car by the source (13.5 V running, 12.0 V off) | discovery2-diag `signals/slabs.json` |
| StopCommunication `82` on disconnect | community | ostler-pack-lr-d2 (`01 82 83` → `01 C2 C3`) |
| Wheel speeds `21 43` and ABS sensor voltages `21 50` | not shown | the bytes decode, but which wheel is which isn't confirmed (discovery2-diag) |

Every other bit shows as "ABS or ride height fault (byte n, bit m)" until someone matches it to a
fault on a car.

The readings and the polling keep the session open, so no tester present (`3E`) is sent.

SLABS stops answering as soon as the car moves, and stays silent until the ignition is turned off
and on again (discovery2-diag): read it standing still.

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Discovery 2 Td5 2001 · faults, clear and heights OK (@yourname)`

## Sources

- openostler/ostler-pack-lr-d2 (code AGPL-3.0, vehicle data CC BY-SA 4.0), `src/d2diag/slabs/`:
  https://github.com/openostler/ostler-pack-lr-d2. Only facts are used (bytes, the bit layout and
  the two known bits); no code is copied, and the explanations are our own words.
- Leijoma/discovery2-diag (MIT), `src/d2diag/signals/slabs.json`, `references/slabs_protocol.md`:
  https://github.com/Leijoma/discovery2-diag. Heights, battery, polling pace and the silence before
  a new wake-up, as facts.
