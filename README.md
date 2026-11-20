# Openhood

Read your car's fault codes in plain words, in the browser. Plug in a €20 to €40 adapter, read
live data and faults. No installs, no dealer tools.

**[Open the app](https://tuffjocke.github.io/openhood/)** · try the Simulator, no car needed

- Live data with 60 second traces
- Fault codes in plain language, with urgency, freeze frames, pending codes and history
- Fault history export and import (kept in your browser, no account)
- Log a drive to CSV at 10 Hz
- Works with ELM327-type adapters (USB or Bluetooth, any OBD-II car, CAN included) and KKL cables
  (raw K-line, for manufacturer-specific profiles). Openhood detects which one you plugged in
- Raw traffic view for reverse engineering
- One-click test reports to GitHub, with the traffic log included
- A shared list of which cars work with which adapter ([profiles/car-reports.json](profiles/car-reports.json)),
  built from real reads, shown in the app when you pick your car
- A command line and an MCP server, so coding agents can read the car while they write a profile
  ([docs/cli.md](docs/cli.md)), read-only
- Works on laptops (Chrome, Edge) and Android phones (Chrome 148+)
- Install it as an app and use it offline, handy in a garage with no signal

## Supported vehicles

| Vehicle | ECU | Status |
| --- | --- | --- |
| [Standard codes](profiles/generic-obd2) (any car with OBD-II/EOBD; ELM327 adapter, or KKL on K-line cars) | Engine, standard values | experimental, not yet tested on a car |
| [Land Rover Td5](profiles/land-rover-td5) (Defender, Discovery 2, 1998 to 2006) | Engine | experimental, not yet tested on a car |

Your car isn't here? [Add it](docs/adding-a-vehicle.md), no coding experience needed if you can chat with an AI.

## Install as an app

Open the app in Chrome or Edge and choose **Install** in the address bar (on Android: menu → **Add to
Home screen**). After the first visit it works offline, simulator included.

## Hardware

For most cars: a "dumb" **KKL cable** (VAG-COM KKL 409.1) with an **FTDI FT232RL** chip, about €20,
plus a USB-A to USB-C adapter if you need one. Not an ELM327.
Some cars need an adapter: see **[Which cable do I need?](docs/hardware.md)**, and the vehicle's profile.

## Development

```
npm install
npm run dev      # http://localhost:3000
npm run check    # typecheck, contract tests, build
```

Built to be extended with AI coding agents: start with [AGENTS.md](AGENTS.md).
In Claude Code, `/add-vehicle <make engine>` scaffolds a new profile.

- [Adding a vehicle](docs/adding-a-vehicle.md)
- [Architecture](docs/architecture.md)
- [K-line in five minutes](docs/k-line-primer.md)

## Safety

Openhood is read-only apart from clearing fault codes. Don't use it while driving unless someone
else is driving. Use at your own risk: see the [license](LICENSE).
Immobiliser, key programming and odometer functions are out of scope.

## License

[GPL-3.0](LICENSE). You can use, change and share it; if you distribute a modified version, it must stay open.
Parts are based on other open projects: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
