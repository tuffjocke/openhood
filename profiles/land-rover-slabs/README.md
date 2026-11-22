# Land Rover SLABS (Discovery 2)

The Wabco SLABS module of the Discovery 2 (1998 to 2004, Td5 and V8): ABS and the
self-levelling rear air suspension in one unit. Read and clear faults with a KKL cable.

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
| Keep-alive `3E` → `7E` | community | same |

Every other bit shows as "ABS or ride height fault (byte n, bit m)" until someone matches it to a
fault on a car.

The module stops answering above roughly 8 to 20 km/h, says the source: read it standing still.

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Discovery 2 Td5 2001 · faults and clear OK (@yourname)`

## Sources

- openostler/ostler-pack-lr-d2 (code AGPL-3.0, vehicle data CC BY-SA 4.0), `src/d2diag/slabs/`:
  https://github.com/openostler/ostler-pack-lr-d2. Only facts are used (bytes, the bit layout and
  the two known bits); no code is copied, and the explanations are our own words.
