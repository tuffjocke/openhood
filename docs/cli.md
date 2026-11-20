# Openhood from the command line, and for AI agents

The website does everything most people need. This is for two other jobs:

- **Letting a coding agent read the car itself** while it writes or fixes a profile, through MCP
  (Model Context Protocol). No more copying traffic back and forth.
- **Scripting**: read faults or live values from a terminal.

It runs the same code as the website (`core/` and `profiles/`), with Node's serial port library instead
of Web Serial. Run it from a clone of the repository, after `npm install`.

## No terminal: let an agent do it

On the website, open the **With an AI agent** tab and copy the message. Then:

1. Open the **Claude** or **Codex desktop app** on the computer you'll plug into the car, and start a
   new coding task. The web versions run in the cloud and can't reach your adapter.
2. Plug the adapter into the car and the computer, ignition on.
3. Paste the message. The agent downloads Openhood, installs it (asking you first), finds the adapter,
   reads the faults and explains them. It uses the commands below.

## Commands

```
npm run openhood -- profiles                 # vehicle profiles and which adapters they run on
npm run openhood -- ports                    # USB adapters, KKL cables, paired Bluetooth adapters
npm run openhood -- explain P0171            # a fault code in plain words, no car needed

npm run openhood -- faults --profile generic-obd2 --port /dev/ttyUSB0
npm run openhood -- live   --profile generic-obd2 --port COM3 --seconds 5
npm run openhood -- request --profile generic-obd2 --port /dev/ttyUSB0 "01 0C"
```

- Leave out `--port` to use the simulator, which is handy to try things first. Add `--elm can` or
  `--elm kline` to go through a simulated ELM327 adapter.
- The adapter is detected (ELM327 or KKL cable). Skip that with `--adapter elm327` or `--adapter kkl`.
- Add `--traffic` to see the raw conversation with the car afterwards.
- Bluetooth Low Energy adapters aren't supported here, only in the website. Paired classic Bluetooth
  adapters show up as serial ports.

## As an MCP server for coding agents

**Claude Code** picks it up from `.mcp.json` in the repository: start `claude` in the repo folder and
approve the "openhood" server when asked. To add it by hand, or for another folder:

```
claude mcp add openhood -- npx tsx /path/to/openhood/cli/openhood.ts mcp
```

**Other agents** (Codex, Cursor, Claude Desktop): add a stdio MCP server with the command
`npx tsx /path/to/openhood/cli/openhood.ts mcp`.

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
- `npm run openhood -- mcp --unsafe-allow-any-request` lifts the limit, for maintainers working on
  something approved in an issue. Don't use it to modify a car.
- Test with the car parked. If you test while driving, someone else drives.
