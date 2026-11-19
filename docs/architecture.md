# Architecture

```
 UI (components/Dashboard.tsx)
   │  picks a VehicleProfile, shows its channels
   ▼
 Session (core/session.ts)
   │  wake-up → profile.connect(link) → poll profile.schedule → decode → values
   │  one queue for all traffic (K-line is half duplex)
   ▼
 Framing (core/kwp2000/frame.ts)
   │  payload ⇄ [format][addr][payload][checksum]
   ▼
 Transport (core/transport)
   ├─ WebSerialTransport   real KKL cable, BREAK for fast init, strips echo
   └─ SimulatedTransport   profile.simulator() on the other end
```

Profiles only ever see **payloads** (service id + data) through an `EcuLink`. They never deal with
framing, checksums, echo or timing. That keeps a profile small enough to read in one sitting.

## Why these choices

- **Browser + Web Serial**: no installs, works on laptops and Android phones, easy to share.
- **Static export on GitHub Pages**: free, no server, nothing to maintain or secure.
- **Simulator per profile**: anyone can develop and test without the car, and CI can run every profile.
- **Data-shaped profiles**: most contributors know their car, not this codebase.

## Not yet supported (good first core contributions)

- 5-baud slow init (ISO 9141-2, KWP2000 slow init): unlocks generic OBD-II on many more cars
- KWP1281 (older VAG)
- CAN / ISO 15765 (needs different hardware)
- ESP32 Wi-Fi bridge transport (would make iPhones work)
