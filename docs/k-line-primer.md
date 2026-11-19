# K-line in five minutes

- One wire (OBD pin 7, sometimes also pin 15 "L-line"), 12 V idle high, half duplex.
  You hear your own bytes back (echo).
- Usually 10400 baud, 8N1.
- The ECU sleeps until woken:
  - **Fast init** (ISO 14230): pull the line low 25 ms, release 25 ms, then send StartCommunication.
  - **5-baud init** (ISO 9141): send the ECU address at 5 baud, read a sync byte and key bytes.
- Messages are KWP2000 frames: a format/length byte, optional target and source addresses,
  the payload (service id + data) and a sum checksum.
- A positive response has SID + 0x40 (request `21` → response `61`).
  A negative response is `7F <sid> <code>`, e.g. `7F 27 35` = invalid key.
- Common services: `10` session, `27` security, `21` read by local id, `14` clear faults,
  `18` read faults by status, `3E` tester present.
- Timing: the ECU answers within P2 (~25 ms); wait P3 (≥ ~25 ms) before the next request;
  say something at least every few seconds or the ECU goes back to sleep.
