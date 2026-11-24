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

| Vehicle | Cars (adapter) | Reads | Status |
| --- | --- | --- | --- |
| [Standard codes](profiles/generic-obd2) | Any car with OBD-II/EOBD (ELM327, or KKL on K-line cars) | Engine, standard values | not tested on a car yet |
| [Land Rover Td5](profiles/land-rover-td5) | Defender, Discovery 2, 1998 to 2006 (KKL) | Engine | tested on a 1999 Defender |
| [Land Rover SLABS](profiles/land-rover-slabs) | Discovery 2, 1998 to 2004 (KKL) | ABS and ride height | not tested on a car yet |
| [Land Rover airbag](profiles/land-rover-srs) | Discovery 2, 1998 to 2004 (KKL) | Airbag, read only | not tested on a car yet |
| [Volvo 850, S70, V70, C70](profiles/volvo-850) | 850 1996 to 1997, S70, V70, C70 1997 to 1998 (ELM327 or KKL) | ABS, airbag, instruments | not tested on a car yet |
| [Volvo D2](profiles/volvo-d2) | S40, V50 2004 to 2012, C30, C70 2006 to 2013, S60, V70, XC70, S80, XC90 from 2005 (ELM327) | Every module, read only | not tested on a car yet |
| [Saab Trionic 7](profiles/saab-trionic7) | 9-5 1998 to 2010, 9-3 2000 to 2002 (KKL or ELM327) | Engine | not tested on a car yet |
| [Saab Trionic 8](profiles/saab-trionic8) | 9-3 2003 to 2011 (ELM327) | Engine | not tested on a car yet |
| [BMW DS2](profiles/bmw-ds2) | E36, E38, E39, E46, E53, Z3 (KKL) | Every DS2 module, read only | not tested on a car yet |
| [VW and Audi, older engines](profiles/vw-audi-kwp1281) | VW, Audi, Škoda with KWP1281, about 1991 to 2003 (KKL) | Engine | not tested on a car yet |

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
else is driving. Immobiliser, key programming and odometer functions are out of scope.

## Disclaimer

Openhood is a free, community-made hobby project, not a dealer or workshop tool. In plain words:

- **Use it at your own risk, with the car parked.** It is provided as is, without any warranty.
- **Profiles are made by volunteers**, often with AI help, and many have not been tested on a real car
  yet. Each profile's README says how sure it is.
- **Explanations are guidance, not a diagnosis.** They tell you what a code usually means and what to
  check first. Before you spend money or rely on the car being safe, ask a mechanic.
- **Clearing fault codes** only erases them. It doesn't fix anything, and it can reset the checks an
  emissions test looks at. Openhood asks before it clears.
- **Nothing personal is collected.** Everything stays in your browser. Test reports and car reports are
  only sent if you choose to, as public GitHub issues or pull requests.
- The [GPL-3.0 license](LICENSE) applies, including its sections 15 (no warranty) and 16 (limitation of
  liability).

## License

[GPL-3.0](LICENSE). You can use, change and share it; if you distribute a modified version, it must stay open.
Parts are based on other open projects: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
