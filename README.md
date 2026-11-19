# Openhood

Browser-based diagnostics for K-line era cars. Plug in a €20 cable, read live data and faults.
No installs, no dealer tools.

**[Open the app](https://tuffjocke.github.io/openhood/)** · try the Simulator, no car needed

- Live data with 60 second traces
- Read and clear fault memory
- Log a drive to CSV at 10 Hz
- Raw K-line traffic view for reverse engineering
- Works on laptops (Chrome, Edge) and Android phones (Chrome 148+)

## Supported vehicles

| Vehicle | ECU | Status |
| --- | --- | --- |
| [Generic OBD-II](profiles/generic-obd2) (most K-line cars with OBD-II/EOBD, fast init) | Engine, standard values | experimental, not yet tested on a car |
| [Land Rover Td5](profiles/land-rover-td5) (Defender, Discovery 2, 1998 to 2006) | Engine | experimental, not yet tested on a car |

Your car isn't here? [Add it](docs/adding-a-vehicle.md), no coding experience needed if you can chat with an AI.

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
