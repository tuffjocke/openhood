# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) and humans working on Openhood.

## What this is

Openhood is a browser app that talks to car ECUs through a KKL cable (raw K-line, KWP2000 / ISO 14230)
or an ELM327-type adapter (standard OBD-II on any protocol, CAN included), using Web Serial and Web Bluetooth. It shows live data, reads and clears fault codes and logs drives.
It is a static Next.js site hosted on GitHub Pages. There is no backend.

## Commands

```
npm install
npm run dev         # http://localhost:3000, use "Simulator" when no car is connected
npm run typecheck
npm test            # contract tests: every profile against its own simulator
npm run check       # typecheck + test + build. Run this before you say you are done.
npm run openhood -- faults --profile generic-obd2   # CLI, simulator unless --port is given (docs/cli.md)
```

**Testing on a real car:** this repo's `.mcp.json` starts Openhood's MCP server. If you have its tools
(`connect`, `read_faults`, `read_live`, `request`, `traffic`), use them to read the car yourself instead
of asking the person to copy traffic. They are read-only; `clear_faults` needs the person's yes.

## Layout

```
core/                     vehicle independent, change rarely
  profile.ts              THE CONTRACT: VehicleProfile and friends. Read this first.
  session.ts              profile.connect, polling, faults, one-at-a-time queue; talks through a Link
  link/                   kline.ts (KKL/simulator: wake-up, framing), elm327.ts (adapter text commands),
                          open.ts (pick the device, detect KKL or ELM327, check the profile allows it)
  kwp2000/frame.ts        framing, checksums, SIDs, NRCs, byte helpers (u16, be16, hex)
  transport/              webserial.ts (USB/paired Bluetooth), bluetooth.ts (BLE adapters),
                          simulated.ts (fake ECU on a K-line), simulated-elm.ts (fake ELM327, CAN or K-line)
profiles/                 one folder per vehicle/ECU, all vehicle knowledge lives here
  index.ts                registry: add new profiles here
  land-rover-td5/         reference profile: index, data, faults, fault-map, fault-explanations, keygen, simulator, README
  generic-obd2/           standard OBD-II: functional addressing, supported PIDs, DTCs, pending, freeze frame, self-tests
  shared/obd-codes.ts     official titles + our plain-language explanations of generic P0 codes
  _template/              copy this to start a new profile (not registered)
cli/                      openhood.ts (CLI), mcp.ts (MCP server on stdio, hand-written JSON-RPC),
                          runtime.ts (connection shared by both), node-serial.ts (serial port from Node)
core/safety.ts            which raw requests tools may send: read services only
components/Dashboard.tsx  the whole UI, driven by the selected profile. While running: the binnacle at the top (three
                          dials from the profile's `dials`, every other reading as a chart, grouped by colour; "Log a
                          drive" sits in the header, and asks where to save the file), the faults panel below, one ask after a real read ("Did this match your
                          car?" Yes = car report, No = test report), "Help add this car" only for unlisted cars, and
                          fault history export/import, traffic and profile details behind "More"
components/CarChooser     make, model, year (any car: unknown makes and models are typed in and tidied). Once filled
                          in, the fields fold into one line with "Change car" at the top of the step card (not in the header picker). Then next steps:
                          read it if a profile fits, else standard codes, with the add-your-car AI prompt folded away
components/VehiclePicker  the car pill in the header, opens CarChooser
components/FaultPanel     faults: one card per fault in a single centred column, most urgent first (open a card for
                          the explanation, freeze frame, AI question), pending, history. The dashboard's tool row
                          under it has More on the left and "Clear all" / "Read again" at the end. Clearing is all
                          or nothing: cars can't clear one code (OBD-II mode 04 and the Td5 clear erase everything)
components/FirstRun       landing until the first connection. Desktop is two columns: headline on the left, the
                          start box on the right. Below 900px it is one column. The live demo ("What you get":
                          the dials, one chart, one fault) sits full width underneath; below 900px it steps aside
                          once a car is picked. One step at a time: 1 the car
                          fields, 2 "Got an adapter?" (I have one / What to buy, remembered), 3 plug in and
                          "Read my car" (AI agent as a quiet link)
components/landing/       AgentButton (copies the ready-made request for a coding agent), EngineLight
components/InfoPage       shell for the plain help pages: app/adapters (short docs/hardware.md), app/disclaimer (README's)
components/Dial           round dial for the live screen: fine scale round the edge, short needle on the ring, value
                          in the middle, optional battery bar in the big dial's bottom gap
components/LiveChart      one reading as a card: name (coloured by group) and unit, value, last 30 s as a line
components/Dials          which readings get dials and which charts (dialLayout), and the row of dials, shared by
                          the live screen and the start page demo
core/history.ts           fault history: merge, export/import (stored per car in the browser)
core/adapters.ts          adapters we recommend by name, with shop searches (no affiliate links); shown on /adapters
                          as tested only when a car report names them (adapterModel)
core/add-car.ts           the add-your-car AI prompt (same text as docs/adding-a-vehicle.md, tested)
core/report.ts            "Send test report": builds a pre-filled GitHub issue link, no server
core/catalog.ts           make/model/year lookups over profiles
profiles/names.ts         allowed makes and models (official spelling), enforced by tests
profiles/car-reports.*    shared knowledge of real cars: what adapter and connection worked (added by
                          `npm run openhood -- record`, shown in CarChooser). Nothing personal: no VIN, no codes
app/                      Next.js shell + globals.css (all styling), /adapters and /disclaimer help pages,
                          layout.tsx (link preview, content security policy in production)
public/                   manifest, icons, sw.js (offline service worker, bump VERSION when its logic changes)
components/ServiceWorker  registers sw.js in production builds
tests/profiles.test.ts    contract tests, run for every registered profile automatically
tests/obd.test.ts         known-answer tests for standard OBD-II pieces
tests/history.test.ts     fault history, export/import
tests/report.test.ts      test report contents and link length
tests/add-car.test.ts     the prompt matches the docs and fills in the car
tests/elm.test.ts         ELM327 answer parsing (datasheet examples), CAN frames with headers, adapter quirks
tests/mcp.test.ts         MCP server: initialize, tools, faults over simulated ELM327, refusals
tests/safety.test.ts      read-only allowlist for raw requests
tests/car-reports.test.ts every car report is valid and has nothing personal
tests/lookup.test.ts      code lookup (used by the CLI and MCP `explain`), tidying typed car names
tests/td5.test.ts         Td5 known answers from published sources (keygen vector, frames, Nanocom values)
docs/                     adding-a-vehicle.md, hardware.md, cli.md, first-read.md (test plan for a first real
                          car), architecture.md, k-line-primer.md
```

## Most common task: add or extend a vehicle

Follow docs/adding-a-vehicle.md. In short:

1. `cp -r profiles/_template profiles/<make>-<engine-or-ecu>` (kebab-case, e.g. `bmw-m52`).
2. Fill in `vehicles` (make/model/years/engine for the picker), link settings, `hardware`, `connect`,
   channels, groups, schedule, simulator.
3. Keep each group's simulator `encode` next to its `decode` so they cannot drift.
4. Register it in `profiles/index.ts`.
5. Write the profile README (status table, connect bytes, sources).
6. `npm run check`.

## Rules

- **No vehicle specifics in `core/` or `components/`.** If the core can't express something a vehicle
  needs, extend `core/profile.ts` in a general way and update the Td5 profile and template to match.
- **Never invent protocol facts.** Byte layouts, scalings, addresses and security algorithms come
  from a source (link it in the profile README) or are marked `confidence: "guess"`.
  Only a person who tested on a real car may set `"verified"`, and the README must say on what.
- **The simulator proves self-consistency only, not correctness.** Do not describe a profile as
  working because tests pass.
- **Only real, correctly spelled makes, models and years.** `vehicles` may only use names from
  `profiles/names.ts` (official manufacturer spelling, model without engine or trim). Model years must
  be ones the car was actually sold with that engine, from a source. Don't add a new make or model to
  `names.ts` unless you are sure it exists and is spelled the official way; if unsure, ask the person.
  The tests reject unknown names.
- **Adapters.** A profile lists what it runs on in `adapters` (default `["kkl"]`). Add `"elm327"` only if
  every request is standard OBD-II; manufacturer protocols need `["kkl"]`. Contract tests run every
  profile that lists `"elm327"` through a simulated ELM327 on CAN and K-line.
- **Read-only by default.** Anything that writes to an ECU beyond clearing faults (adaptations,
  coding, flashing, maps) needs an issue and explicit maintainer approval first.
- **Car reports are facts from real cars.** Only add an entry after reading the car (`record` does it).
  Never invent one, and never put a VIN, fault codes or anything else personal in it.
- **Privacy in reports.** Test reports become public GitHub issues. Requests that identify one car
  (OBD mode 09, KWP 0x1A) are flagged `private` by the links and hidden from reports, with their answers.
  Demo (simulator) faults never go into a car's fault history. Car report notes: 160 plain characters, no links.
- **Tools stay read-only.** The CLI and MCP server only send raw requests that `core/safety.ts` allows.
  Don't widen that list to include anything that writes, unlocks or programs, or reads raw memory (0x23).
- **No backend, no database, no tracking.** Everything stays in the user's browser; sharing happens
  only when the user chooses to (export file, GitHub issue). Discuss in an issue before changing that.
- **Out of scope:** immobiliser, key programming, odometer changes, emissions defeat. Do not add them.
- Every profile must have a working simulator. The app and tests must work with no hardware.
- TypeScript strict, no `any`. No new runtime dependencies without a good reason.
- UI style: for petrol heads, minimal and Scandinavian. A Nordic workshop with a digital dash on the bench.
  Plain CSS in `app/globals.css` using its tokens: birch paper, granite ink, tonal surfaces (no hairline
  boxes, no shadows, no gradients). Live readings sit in a deep-black binnacle: round dials with a yellow
  needle (`components/Dial.tsx`) and line charts (`components/LiveChart.tsx`). Chart colour says what a
  reading is about: `--air` blue, `--engine` yellow, `--fuel` green (a channel's `group`). Status colours
  are the same in the binnacle and on the fault cards: `--alarm` red for "fix now" and past a limit,
  `--sign` yellow for "fix soon" and "look at this", `--ok` green for "fine to drive" and a charging
  battery. Falu red (`--falu`) is only for buttons that stop something. Familjen Grotesk for text, Barlow Condensed for numbers, both self-hosted. Sentence-case labels,
  no all-caps. Must work on a phone and in dark mode (follows the system setting).
- One step at a time: each screen asks one thing and has one main button. Don't show what isn't
  needed for that step. Ask for contributions only at the moment they apply (after a read, after a
  failure, after reading an unlisted car), never up front.
- Hierarchy: one type scale (h1, section h2, verdict 22, body 16, small 14) and one primary action per
  screen. New things on the start page go into the existing order (car, adapter, plug in, then the demo)
  or behind a link, not in a new box of their own.
- `app/globals.css` is ordered by component, in the order things appear on screen (its header lists the
  sections). Change the rule that already styles an element, or add one next to it. Never append an
  override block at the end of the file, and delete a component's styles when you delete the component.
- Writing: plain English, no em or en dashes in UI text. As few words as possible: petrol heads don't
  like reading. No line of text unless it's needed; details go behind a link.
- **Credit and licences.** Code or data ported from another project must be compatible with GPL-3.0
  (MIT, BSD, Apache, GPL) and get an entry in THIRD_PARTY_NOTICES.md. A project with no licence may
  only be used for facts (bytes, scalings), never copied code.
- **Fault explanations are for non-mechanics.** Follow the writing guide at the top of
  `profiles/shared/obd-codes.ts`: everyday title, one or two sentences, 2 to 4 causes (most common first),
  one first check, honest urgency. Write them yourself; never copy text from code lists or manuals.

## Gotchas

- The K-line is half duplex. All ECU traffic goes through `Session.exclusive`. Profile code gets an
  `EcuLink` and must not touch the transport directly.
- `EcuLink.request` waits for the response matching the request's SID and ignores other frames.
  Use `requestMany` when several frames answer (functional requests, more than three DTCs).
- Groups the ECU doesn't support: give them `available(state)` and `provides`. They are skipped
  when polling and their channels show "n/a". `connect` can write to `state` to decide this.
- Response payloads include the positive SID: for request `[0x21, 0x09]` the response is
  `[0x61, 0x09, ...data]`, so data starts at index 2.
- KKL cables echo every byte sent; `WebSerialTransport` strips it. The simulator has no echo.
- `EcuLink.init` says how the link was set up. On an ELM327 it is `{ kind: "adapter", can }`; on CAN some
  OBD answers differ (mode 03/07 start with a count byte). Profiles handle that, not the link.
- The ELM327 link starts with headers off. On CAN it turns headers on (ATH1) and puts long answers back
  together per ECU (`parseElmCanFrames`), engine first, because two ECUs answering at once can't be told
  apart otherwise. Older protocols stay headers off. Profiles just get payloads. Its timeouts carry a plain
  message for people.
- Fast init is timed with JS timers (BREAK for 25 ms). Jitter of a few ms is normal.
- `link.init` can be "fast", "slow" (5-baud, about 2 s) or "auto" (fast, then slow). After a slow init
  the session switches to ISO 9141-2 framing when the key bytes say so (08 08 / 94 94): frames have no
  length byte and are split by silence. Profiles never see framing; `connect` gets the InitResult.
- Help for people lives on the site (/adapters, /disclaimer), not on GitHub. Use `next/link` for them.
  The start page comes back from the Openhood wordmark, and by itself after the demo.
- A KKL-only profile is not probed for an ELM327 before connecting (no stray bytes on the K-line); the
  probe only runs if the car stays silent, to say "wrong adapter".
- Web Serial needs a user gesture and works in Chrome/Edge desktop and Chrome 148+ Android. Not Safari.
- The app is a static export with `basePath` from `BASE_PATH` (set to `/openhood` in CI). Use relative
  imports and Next APIs, never hard-coded absolute asset paths.
