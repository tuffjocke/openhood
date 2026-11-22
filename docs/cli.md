# Openhood from the command line, and for AI agents

The website does everything most people need. This is for two other jobs:

- **Letting a coding agent read the car itself** while it writes or fixes a profile, through MCP
  (Model Context Protocol). No more copying traffic back and forth.
- **Scripting**: read faults or live values from a terminal.

It runs the same code as the website (`core/` and `profiles/`), with Node's serial port library instead
of Web Serial. Two ways to run it:

- **From npm**, nothing to install but Node.js: `npx openhood <command>`. The package is one file with
  every car profile in it, plus serialport, about 4 MB in all.
- **From a clone** of the repository, after `npm install`: `npm run openhood -- <command>`. Use this
  when you work on a profile; `record` then writes into the repository's list of cars.

The examples below use `npx openhood`; in a clone, write `npm run openhood --` instead.

## No terminal: let an agent do it

On the website, pick your car and press **Or let an AI agent read it** to copy the message. Then:

1. Open the **Claude** or **Codex desktop app** on the computer you'll plug into the car, and start a
   new coding task. The web versions run in the cloud and can't reach your adapter.
2. Plug the adapter into the car and the computer, ignition on.
3. Paste the message. The agent checks Node.js is there (asking you before installing it), finds the
   adapter, reads the faults and explains them. It uses the commands below through `npx`.

## Commands

First time on a real car? Follow [first-read.md](first-read.md).

```
npx openhood profiles                 # vehicle profiles and which adapters they run on
npx openhood ports                    # USB adapters, KKL cables, paired Bluetooth adapters
npx openhood explain P0171            # a fault code in plain words, no car needed

npx openhood faults --profile generic-obd2 --port /dev/ttyUSB0
npx openhood live   --profile generic-obd2 --port COM3 --seconds 5
npx openhood request --profile generic-obd2 --port /dev/ttyUSB0 "01 0C"

# read the car and share what worked (from npm: prints a link to a ready-made GitHub issue;
# in a clone: adds it to profiles/car-reports.json for a pull request)
npx openhood record --profile generic-obd2 --port /dev/ttyUSB0 --make Volvo --model V70 --year 2003 \
  --adapter-model "Vgate iCar Pro 2S"
```

## The shared list of cars

`profiles/car-reports.json` is Openhood's growing knowledge of real cars: make, model, year, which
adapter and connection worked, and whether faults could be read. The website shows it when someone
picks the same car ("Read by 3 people (2002 to 2004), with an ELM327 adapter").

- `record` makes an entry after reading the car, including when it couldn't connect, since that's
  useful too. From npm it prints a link to a pre-filled GitHub issue; in a clone it adds the entry to
  the file, to send in as a pull request.
- People using the website get an "Add your car to the shared list" link after a read, which opens a
  pre-filled GitHub issue instead.
- Nothing personal goes in: no VIN, no fault codes. Makes and models must be in `profiles/names.ts`
  with the official spelling; `record` says so if a model is missing. Tests check every entry.

- Leave out `--port` to use the simulator, which is handy to try things first. Add `--elm can` or
  `--elm kline` to go through a simulated ELM327 adapter.
- The adapter is detected (ELM327 or KKL cable). Skip that with `--adapter elm327` or `--adapter kkl`.
- Add `--traffic` to see the raw conversation with the car afterwards.
- Bluetooth Low Energy adapters aren't supported here, only in the website. Paired classic Bluetooth
  adapters show up as serial ports.

## As an MCP server for coding agents

Any agent (Claude Code, Claude Desktop, Codex, Cursor): add a stdio MCP server running
`npx -y openhood mcp`. For Claude Code:

```
claude mcp add openhood -- npx -y openhood mcp
```

In a clone of the repository, Claude Code also picks it up from `.mcp.json` (the clone's own code):
start `claude` in the repo folder and approve the "openhood" server when asked.

The agent gets these tools:

| Tool | What it does |
| --- | --- |
| `list_profiles`, `list_ports` | What it can connect with |
| `connect`, `disconnect` | A profile on a port, or the simulator |
| `read_faults` | Fault codes with plain explanations, urgency, readiness, optionally pending |
| `freeze_frame` | The snapshot saved with a fault |
| `read_live` | Every value once, or min, max and last over a few seconds |
| `request` | One raw read request, e.g. `21 09`, and the answers |
| `traffic` | The last lines of raw traffic |
| `clear_faults` | Clear codes, only with `confirm: true` after the person said yes |
| `explain_code` | A code in plain words, no car needed |

## Safety

- **Read-only, enforced.** `request` only sends services that read (standard OBD-II modes and the
  KWP2000 read services, see `core/safety.ts`). Writing, security access, programming sessions and
  clearing are refused. Clearing has its own tool that needs a confirmation.
- Profile code is not limited by this: a reviewed profile may unlock its ECU in `connect`.
- `npm run openhood -- mcp --unsafe-allow-any-request` lifts the limit, only in a clone: the npm package refuses the flag, for maintainers working on
  something approved in an issue. Don't use it to modify a car.
- Test with the car parked. If you test while driving, someone else drives.
