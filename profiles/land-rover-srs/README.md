# Land Rover airbag (Discovery 2)

The TRW SPS airbag computer of the Discovery 2 (1998 to 2004). Reads its fault codes with a KKL
cable. Read only: no clearing, nothing is written.

## Status

Nothing here has been checked on a car by us yet. Everything comes from one source project, which
recorded a dealer-type tool reading the module on one Discovery 2 Td5 and then read it on a second
Discovery 2 itself.

| Part | Confidence | Backed by |
| --- | --- | --- |
| 5-baud wake-up at address `5B`, then ISO 14230 frames with the addresses on every frame (`82 5B F7 ...`), tester `F7` | community, sniffed on one car | ostler-pack-lr-d2 `airbag/airbag.py`, `docs/discovery-2-td5/other-modules.md` |
| Diagnostic session `10 81` → `50 81` (not the Td5's `A0`) | community, sniffed on one car | same |
| Faults `21 02` → `61 02` + `[status][code]` pairs, `00 00` padding; the code is the number the tool shows (`16` = 022) | community, sniffed on one car and read on a second | `airbag/faults.py`, `references/airbag_fault_codes.md` |
| `21 02` works without an unlock | community, one car | `references/airbag_fault_codes.md` (second car, 2026-10-04). The dealer tool unlocked first on the sniffed car |
| Code names: 008, 022, 023 | community | forum posts with Nanocom readings of Discovery 2s, collected in `references/airbag_fault_codes.md` |
| Code name: 004 (warning light circuit) | guess | matched by elimination on one car |
| Status byte: `90` | not used | seen next to "open circuit, intermittent"; other values unknown, so no state is shown |
| Code `00` (`90 00` on the second car) | not used | unexplained by the source, left out |
| Keeping the session open by reading `21 02` again | community | the one request seen working; no tester present has been seen on this module |
| Every Discovery 2 (V8 too, 1998 to 2004) has this module | guess | both cars in the source are Td5s |

Not done, on purpose:
- **Clearing** (`14` → `54`). It was seen once, after the dealer tool unlocked the module with a
  key algorithm nobody has published. An airbag light should go out by fixing the fault, not by
  clearing it.
- **Unlocking, outputs, writing the VIN.** Out of scope.
- **Identification** (part number, VIN, which airbags are fitted). The source lists the fields but
  not the bytes, and the VIN would make reports identify the car.

Tested on: nothing yet. When you test on a car, add a line here:
`- 2026-12-01 · Discovery 2 Td5 2001 · faults read OK (@yourname)`

## Connect sequence

```
5-baud wake-up at 5B (about 2 s)
← 55 KW1 KW2              key bytes (xx 8F = ISO 14230; this module's aren't published)
→ ~KW2   ← ~5B (A4)
→ 82 5B F7 10 81 65       diagnostic session 81
← 82 F7 5B 50 81 ..
→ 82 5B F7 21 02 F7       read faults
← .. F7 5B 61 02 90 04 90 16 00 00 ..   codes 004 and 022
```

## What a test should look for

- Does the wake-up at `5B` get key bytes back, and which? Put them in this README.
- Does `21 02` answer without an unlock? If it answers `7F 21 33` (security access denied), say so
  in an issue: reading is then blocked until the key algorithm is known.
- The codes the car shows next to what a Nanocom or Testbook shows for the same car. Every
  code matched to its text is one more name here.

## Sources

- openostler/ostler-pack-lr-d2 (code AGPL-3.0, vehicle data CC BY-SA 4.0), `src/d2diag/airbag/`,
  `references/airbag_fault_codes.md`, `docs/discovery-2-td5/other-modules.md`:
  https://github.com/openostler/ostler-pack-lr-d2. Only facts are used (bytes, the record layout,
  which code is which circuit); no code is copied, and the explanations are our own words.
