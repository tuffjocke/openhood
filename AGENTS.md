# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) and humans working on Openhood.

## What this is

Openhood is a browser app that talks to car ECUs through a KKL cable (raw K-line: KWP2000 / ISO 14230, or VW's KWP1281)
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
npm run build:npm   # the npm package `openhood` (CLI + MCP server, one file) into dist/npm
```

**Testing on a real car:** this repo's `.mcp.json` starts Openhood's MCP server. If you have its tools
(`connect`, `read_faults`, `read_live`, `request`, `traffic`), use them to read the car yourself instead
of asking the person to copy traffic. They are read-only; `clear_faults` needs the person's yes.

## Layout

```
core/                     vehicle independent, change rarely
  profile.ts              THE CONTRACT: VehicleProfile and friends. Read this first.
  session.ts              profile.connect, polling, faults, one-at-a-time queue; talks through a Link
  link/                   kline.ts (KKL/simulator: wake-up, framing; kLineLink picks it or KWP1281),
                          kwp1281.ts (VW Group: every byte confirmed, keep-alive), ds2.ts (BMW), elm327.ts (adapter text
                          commands), open.ts (pick the device, detect KKL or ELM327, check the profile allows it)
  kwp2000/frame.ts        framing, checksums, SIDs, NRCs, byte helpers (u16, be16, hex)
  volvo-d2/frame.ts       Volvo D2 on CAN: request frames to 000FFFFE, multi-frame answers, codes, answer ranges
  kwp1281/protocol.ts     KWP1281 block titles, timings, fault codes, measuring block formulas
  transport/              webserial.ts (USB/paired Bluetooth), bluetooth.ts (BLE adapters),
                          simulated.ts (fake ECU on a K-line), simulated-kwp1281.ts (its KWP1281 byte handshake),
                          simulated-elm.ts (fake ELM327, CAN or K-line)
profiles/                 one folder per vehicle/ECU, all vehicle knowledge lives here
  index.ts                registry: add new profiles here
  land-rover-td5/         reference profile: index, data, faults, fault-map, fault-explanations, keygen, simulator, README
  generic-obd2/           standard OBD-II: functional addressing, supported PIDs, DTCs, pending, freeze frame, self-tests
  vw-audi-kwp1281/        older VW Group engines: finds readings by formula at connect, VAG fault names and explanations
  volvo-850/              850, S70, V70, C70 ABS, airbag and instruments (keyword D3 B0): three profiles, faults only
  volvo-d2/               S40, V50, C30, C70 and 2005+ S60, V70, XC70, S80, XC90: every module's codes (Volvo D2 on
                          CAN, ELM327 only), read only
  saab-trionic7/          9-5 1998 to 2010 and 9-3 2000 to 2002 engine (KWP2000 on the K-line, KKL or ELM327)
  saab-trionic8/          9-3 2003 to 2011 engine (GMLAN on CAN, ELM327 only, raw frames via `link.can`)
  land-rover-slabs/       Discovery 2 ABS and ride height (Wabco SLABS, KWP2000, KKL): one bit per fault, rear
                          heights and battery, polled once a second (faster and SLABS drops the session)
  land-rover-srs/         Discovery 2 airbag (TRW SPS, 5-baud wake-up at 5B, addressed frames, KKL): read only
  bmw-ds2/                E36, E38, E39, E46, E53, Z3: every DS2 module's codes (KKL only, 9600 8E1), read only
  shared/obd-codes.ts     official titles + our plain-language explanations of generic P0 codes
  _template/              copy this to start a new profile (not registered)
cli/                      openhood.ts (CLI), mcp.ts (MCP server on stdio, hand-written JSON-RPC),
                          runtime.ts (connection shared by both), node-serial.ts (serial port from Node),
                          command.ts (`npx -y openhood@latest` or `npm run openhood --` in messages)
                          watch-server.ts (the MCP server's live view on 127.0.0.1: the site and an event stream)
                          watch-car.ts (`openhood watch`: the same live view with no agent, reads until Ctrl+C)
core/checks.ts            test checks (#25): what the person does, what to read, how to judge it; standardChecks
                          builds the usual set from a profile's channel keys. Profiles list theirs in `checks`; the
                          MCP tools list_checks, run_check, test_report run them, the live view shows only the running
                          check on the live screen's own dials and charts. It comes first on cars Openhood isn't proven
                          on (`needsTest` in profiles/car-reports.ts: no test run, or readings not verified): `connect`
                          recommends it and the AI hand-off asks for it. "Readings not verified yet" is added to every
                          profile with such readings, and is how they get verified
core/watch.ts             what the live view streams (state, values, faults, traffic): one way, car to page
components/Watch          the live view page (app/watch): what an agent reads, no header, the same dense layout, read-only
scripts/build-npm.mjs     bundles the CLI with esbuild into the npm package `openhood` (dist/npm): one file with
                          every profile, only serialport at runtime. Agents and people run `npx -y openhood@latest ...`;
                          .github/workflows/npm.yml stages it when package.json's version is new on npm (bump the
                          version, push to main), and a maintainer approves it with 2FA on npmjs.com
core/safety.ts            which raw requests tools may send: read services only
components/Dashboard.tsx  the whole UI, driven by the selected profile. While running it is dense like the MCP live view
                          (`.shell.dense`, shared CSS): a slim header row (none in the demo), then the binnacle on the
                          left (the engine lamp centred in its top edge when there are faults; in the demo a text "‹ Back"
                          and "Log a drive" sit in its top corners, for a real car "Log a drive" is in the
                          header and asks where to save the file; three dials from the profile's `dials`, every
                          other reading as a chart, its name coloured by group, no colour key) and beside it (`.live-side`,
                          stacked under 900px) the faults panel, one ask after a real read ("Did this match your
                          car?" Yes = car report, No = test report), "Help add this car" only for unlisted cars, and
                          fault history export/import, traffic and profile details behind "More". A real car moving faster than walking
                          pace gets one line, "Moving. Let a passenger watch the screen."; the readings stay
components/CarChooser     make, model, year (any car: unknown makes and models are typed in and tidied). Several
                          engines: "Which engine?". Profiles for other parts (`system`: ABS, airbag): "What to read?",
                          with standard engine codes offered next to them. Once filled
                          in, the fields fold into one line with "Change car" at the top of the step card (not in the header picker). Then next steps:
                          read it if a profile fits, else standard codes, with the add-your-car AI prompt folded away
components/VehiclePicker  the car pill in the header, opens CarChooser
components/FaultPanel     faults: one card per fault in a single centred column, most urgent first (open a card for
                          the explanation, freeze frame, AI question), pending, history. The dashboard's tool row
                          under it has More on the left and "Clear all" / "Read again" at the end. Clearing is all
                          or nothing: cars can't clear one code (OBD-II mode 04 and the Td5 clear erase everything)
components/FirstRun       landing until the first connection, like a product page: black and light full-width
                          sections take turns, each light or dark section with one giant word (readable, never covered)
                          and the thing itself under it. Black hero: headline, line and start box stacked and centred, then the
                          demo car's live dials with callouts. Then "Last 30 seconds" (one chart per group),
                          "Faults" (the demo's fault, opened) and "Any car". Black parts swap the colour tokens,
                          so components need no dark styles of their own. The start page only asks for the car,
                          then "Continue" goes to /read (app/read, same Dashboard with page="read"): the car line
                          with "Change car", then one step at a time in one card, each with a drawing
                          (components/landing/Art): "You need a KKL cable" (or ELM327: "I have a USB one" /
                          "I have a Bluetooth one") with Buy on Amazon, remembered; then "Plug it in. Turn the key
                          to II." and one Start button that reads the car. If a real read goes wrong (no answer,
                          lost, no faults or readings back), the card (or a box beside the faults) offers one
                          button, AgentButton: pick the AI app once (Claude, Codex, Cursor, remembered) and it opens
                          with the message typed in, or copy it for another AI. No vendor is the default. The
                          message says what failed and asks the agent to find out why with the MCP server. On a
                          phone it goes to the share sheet with what happened and the traffic, for any AI app to
                          explain. The start page warns before the car is picked when the browser can't read a car.
                          /read
                          without a saved car goes back to the start page
components/landing/       AgentButton (opens the AI desktop app with the ready-made request), Art, EngineLight
components/InfoPage       shell for the plain help pages: app/adapters (short docs/hardware.md), app/disclaimer (README's)
components/Dial           round dial for the live screen: fine scale round the edge, short needle on the ring, value
                          in the middle, optional battery bar in the big dial's bottom gap
components/LiveChart      one reading as a card: name (coloured by group) and unit, value, last 30 s as a line
components/Dials          which readings get dials and which charts (dialLayout), and the row of dials, shared by
                          the live screen and the start page demo
core/i18n/                English and Swedish without a library: t("English text") looks the text up in sv.ts and
                          falls back to English, {name} for values. components/useLang picks from the browser
                          (switch in the footer). Wrap new UI text in t() and add its Swedish: tests/i18n.test.ts
                          checks every key. Fault explanations, the help pages and the AI prompts are English for now
core/units.ts             km/h and °C, mph and °C (UK) or mph and °F (US): converts channels and values for showing and
                          logging only; profiles stay metric. components/useUnits picks from the browser's region,
                          and the footer has the switch
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
tests/units.test.ts       unit guess and conversions
tests/i18n.test.ts        every t() text has Swedish, no dashes
tests/npm.test.ts         the npm package builds and runs on its own
tests/node-serial.test.ts CLI serial transport on serialport's mock: fast init as 0x00 at 360 baud, BREAK fallback
tests/webserial.test.ts   website serial transport on a strict fake Web Serial port: the same fast init, reopening
tests/checks.test.ts      test checks: how each judges its readings, the rev pacer, the MCP tools on the Td5
tests/watch.test.ts       the live view: streams connect, values, faults; read-only, own Host only, no way out
tests/kwp1281.test.ts     KWP1281 known answers (parity, keywords, codes, formulas) and a session byte by byte
tests/volvo.test.ts       Volvo keyword D3 B0 known answers (published frames) and a session
tests/slabs.test.ts       Land Rover SLABS fault bits (published sniff) and a session
tests/srs.test.ts         Land Rover Discovery 2 airbag: published fault reads, the request frames, a session
tests/bmw.test.ts         BMW DS2 frames (E46M3-Monitoring's FS_LESEN), fault entry splitting, a session
tests/saab.test.ts        Saab Trionic 7 and 8 known answers (Trionic CAN Flasher's examples) and sessions
tests/volvo-d2.test.ts    Volvo D2 on CAN known answers (published frames) and a session through the ELM327
docs/                     adding-a-vehicle.md, hardware.md, cli.md, first-read.md (test plan for a first real
                          car), testing-a-car.md (the checks), architecture.md, k-line-primer.md
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
- **Adapters.** A profile lists what it runs on in `adapters` (default `["kkl"]`), the recommended one first.
  Add `"elm327"` if every request is standard OBD-II, or if the profile gives `link.elm`: the protocol,
  wake-up address, headers and keep-alive an ELM327 needs for a manufacturer K-line protocol, from a
  source. KWP1281 and anything with a security unlock need `["kkl"]`. Contract tests run every profile
  that lists `"elm327"` through a simulated ELM327 (which only answers when set up the way `link.elm` says).
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
  The one outside request: the MCP server from npm asks registry.npmjs.org for openhood's latest version
  number at start (`cli/update-check.ts`, nothing sent, `--no-update-check`). Commands use `npx -y openhood@latest`.
- **Out of scope:** immobiliser, key programming, odometer changes, emissions defeat. Do not add them.
- Every profile must have a working simulator. The app and tests must work with no hardware.
- TypeScript strict, no `any`. No new runtime dependencies without a good reason.
- UI style: for petrol heads, minimal and Scandinavian. A Nordic workshop with a digital dash on the bench.
  Plain CSS in `app/globals.css` using its tokens: birch paper, granite ink, tonal surfaces (no hairline
  boxes, no shadows, no gradients). Live readings sit in a deep-black binnacle: round dials with an orange
  needle (`--needle`) and numbers that run yellow, white, orange along the scale (`components/Dial.tsx`) and line charts (`components/LiveChart.tsx`). Chart colour says what a
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
- Writing: plain English (and Swedish in core/i18n/sv.ts), no em or en dashes in UI text. As few words as possible: petrol heads don't
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
- KKL cables echo every byte sent; `WebSerialTransport` strips it. The simulator has no echo. No echo at all is
  `NO_ECHO` (core/transport/types.ts): the cable or computer side, not the car; echo but no answer is the car. Without
  an echo, the website's fast init line says how many bytes came from the cable and any read errors (#21).
- `EcuLink.init` says how the link was set up. On an ELM327 it is `{ kind: "adapter", can }`; on CAN some
  OBD answers differ (mode 03/07 start with a count byte). Profiles handle that, not the link.
- The ELM327 link starts with headers off. On CAN it turns headers on (ATH1) and puts long answers back
  together per ECU (`parseElmCanFrames`), engine first, because two ECUs answering at once can't be told
  apart otherwise. Older protocols stay headers off. Profiles just get payloads. Its timeouts carry a plain
  message for people.
- Fast init is one 0x00 byte at 360 baud, so the UART times the 25 ms low pulse: the port is reopened at 360
  baud and back (`core/transport/webserial.ts`, `cli/node-serial.ts`). BREAK timed with JS timers ran 28 to 35 ms
  on macOS and a Td5 never woke (issue #1); it is only the fallback for a cable that can't open at 360 baud.
- KWP1281 (`link.protocol: "kwp1281"`): requests are [block title, ...data] and answers start with the ECU's
  title (`[0x29, 1]` → `[0xE7, ...]`). `requestMany` confirms each answer until the ECU sends its ack (fault
  lists). The link sends keep-alives itself when idle. Titles mean different things than KWP2000 service ids,
  so `core/safety.ts` checks them with their own list. A group can build its request from state (`requestFor`)
  for ECUs that say at connect where readings live.
- `link.elm` makes the ELM327 link skip the OBD-II search: it sets ATSP, ATIIA, ATTA and ATWM once and an ATSH
  header for each request length, then answers come back with headers stripped (ATH0) as usual.
- Volvo's keyword D3 B0 is ISO 14230 framing with `lengthOffset: 1` (the format byte counts one more than the
  data) after a 5-baud wake-up. Profiles with no live data have `channels: []` and a keep-alive group; the
  dashboard then shows no binnacle and the start page demo uses standard OBD-II instead.
- Volvo D2 (`link.protocol: "volvo-d2"`) runs on CAN through an ELM327 only. Requests are [module, service, ...]
  and answers start with the module: [0x58, 0xAE, 0x11] → [0x58, 0xEE, 0x11, ...codes]. The ELM327 link sends
  raw frames (ATCAF0) and tries answer ranges with ATCF/ATCM until the module answers. With no K-line to
  simulate, the demo for such a profile is ElmLink over SimulatedElm, with adapter "simulator".
- GMLAN (`link.protocol: "gmlan"`, Saab Trionic 8) runs on CAN through an ELM327 only, set up by `link.can`: raw
  frames (ATCAF0) to one id, answers from that id + 8 come back unwrapped, frames from other ids (like 5E8 code
  frames) come back as their 8 raw bytes. Its simulator answers either a payload or frames as [id, ...bytes].
- BMW DS2 (`link.protocol: "ds2"`, `link.parity: "even"`) has no wake-up and no tester address: requests are
  [module address, control, ...data], answers [status, ...data] with A0 for done; other statuses throw
  NegativeResponse. Every module listens on the same line, so a profile asks them one by one.
- `link.init` can be "fast", "slow" (5-baud, about 2 s) or "auto" (fast, then slow). After a slow init
  the session switches to ISO 9141-2 framing when the key bytes say so (08 08 / 94 94): frames have no
  length byte and are split by silence. Profiles never see framing; `connect` gets the InitResult.
- Help for people lives on the site (/adapters, /disclaimer), not on GitHub. Use `next/link` for them.
  The start page comes back from the Openhood wordmark, and by itself after the demo.
- A KKL-only profile is not probed for an ELM327 before connecting (no stray bytes on the K-line); the
  probe only runs if the car stays silent, to say "wrong adapter".
- Web Serial needs a user gesture and works in Chrome/Edge desktop and Chrome 148+ Android. Not Safari.
- The MCP server (`Runtime` with `keepAlive`) reads the profile's first scheduled group after 1 s without a tool
  call on a KWP2000 K-line session, so ECUs like the Td5 don't end it, and on a timeout checks the car still answers;
  if not, it connects again once and repeats the call (never a clear, never a check: a check whose car goes quiet for
  5 s ends with `connectionLost`, the live view says "lost", and the next call connects again). Nothing may wait forever:
  cable writes and closes have time limits, `Session.disconnect` closes the link after 2 s even if a request is stuck,
  and a cancelled call or `disconnect` stops a running check at once instead of queueing behind it (#38). Keep-alive lines are noted "keep-alive" and left
  out of the `traffic` tool. `openhood watch` does the same; the CLI's one-shot commands don't.
- The MCP server's live view (`cli/watch-server.ts`) serves `dist/npm/site`: the site built at the root with
  `NEXT_PUBLIC_OPENHOOD_LOCAL=1` (no service worker) by `npm run build:npm`, shipped in the npm package. It
  stays on 127.0.0.1, GET only, answers its own Host only and sends no CORS headers. Nothing on the watch page
  may talk to the car: it only shows what the runtime emits (`Runtime.watch`). `serve` opens it in the browser at
  the first `connect` (once, not if a page is open, never at start), `--no-open` keeps it closed.
- The app is a static export with `basePath` from `BASE_PATH` (set to `/openhood` in CI). Use relative
  imports and Next APIs, never hard-coded absolute asset paths.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
