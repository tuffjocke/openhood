# Architecture

```
 UI (components/Dashboard.tsx)
   │  picks a VehicleProfile, shows its channels
   ▼
 Session (core/session.ts)
   │  link.open → profile.connect(ecu) → poll profile.schedule → decode → values
   │  one queue for all traffic (one request at a time)
   ▼
 Link (core/link)                         openLink() picks the device and detects which kind it is
   ├─ KlineLink   KKL cable or simulator: fast / 5-baud wake-up, KWP2000 or ISO 9141-2 frames
   │     └─ Transport: WebSerialTransport or NodeSerialTransport (CLI and MCP): fast init as 0x00 at
   │                   360 baud, strips echo. Or SimulatedTransport
   └─ ElmLink     ELM327-type adapter: hex requests as text, answers parsed back to payloads, CAN too
         └─ ByteStream: WebSerialTransport (USB, paired Bluetooth), BluetoothTransport (BLE), SimulatedElm
```

Profiles only ever see **payloads** (service id + data) through an `EcuLink`. They never deal with
framing, checksums, echo, timing or which adapter is plugged in (`ecu.init` tells them if they need to
know, for example that a CAN car formats trouble codes slightly differently). That keeps a profile small enough to read in one sitting.

## Why these choices

- **Browser + Web Serial / Web Bluetooth**: no installs, works on laptops and Android phones, easy to share.
- **Static export on GitHub Pages**: free, no server, nothing to maintain or secure.
- **Simulator per profile**: anyone can develop and test without the car, and CI can run every profile.
- **Data-shaped profiles**: most contributors know their car, not this codebase.

## Not yet supported (good first core contributions)

- KWP1281 (older VAG)
- Raw CAN for manufacturer-specific profiles on newer cars (standard OBD-II over CAN works through ELM327)
- ESP32 Wi-Fi bridge transport (would make iPhones work)
