# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) and humans working on Openhood.

## What this is

Openhood is a browser app that talks to car ECUs over a K-line cable (KWP2000 / ISO 14230)
using the Web Serial API. It shows live data, reads and clears fault codes and logs drives.
It is a static Next.js site hosted on GitHub Pages. There is no backend.

## Commands

```
npm install
npm run dev         # http://localhost:3000, use "Simulator" when no car is connected
npm run typecheck
npm test            # contract tests: every profile against its own simulator
npm run check       # typecheck + test + build. Run this before you say you are done.
```

## Layout

```
core/                     vehicle independent, change rarely
  profile.ts              THE CONTRACT: VehicleProfile and friends. Read this first.
  session.ts              wake-up, profile.connect, polling, faults, half-duplex queue
  kwp2000/frame.ts        framing, checksums, SIDs, NRCs, byte helpers (u16, be16, hex)
  transport/              webserial.ts (real cable), simulated.ts (profile's fake ECU)
profiles/                 one folder per vehicle/ECU, all vehicle knowledge lives here
  index.ts                registry: add new profiles here
  land-rover-td5/         reference profile: index, data, faults, keygen, simulator, README
  generic-obd2/           standard OBD-II: functional addressing, supported PIDs, DTCs, pending, freeze frame, self-tests
  shared/obd-codes.ts     official titles + our plain-language explanations of generic P0 codes
  _template/              copy this to start a new profile (not registered)
components/Dashboard.tsx  the whole UI, driven by the selected profile
components/VehiclePicker  make → model → year picker, built from every profile's `vehicles`
components/FaultPanel     faults: explanations, urgency, freeze frames, pending, history, self-tests, clear warning
core/history.ts           fault history merge logic (stored per car in the browser)
core/catalog.ts           make/model/year lookups over profiles
profiles/names.ts         allowed makes and models (official spelling), enforced by tests
app/                      Next.js shell + globals.css (all styling)
tests/profiles.test.ts    contract tests, run for every registered profile automatically
tests/obd.test.ts         known-answer tests for standard OBD-II pieces
tests/history.test.ts     fault history
docs/                     adding-a-vehicle.md, hardware.md, architecture.md, k-line-primer.md
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
- **Read-only by default.** Anything that writes to an ECU beyond clearing faults (adaptations,
  coding, flashing, maps) needs an issue and explicit maintainer approval first.
- **Out of scope:** immobiliser, key programming, odometer changes, emissions defeat. Do not add them.
- Every profile must have a working simulator. The app and tests must work with no hardware.
- TypeScript strict, no `any`. No new runtime dependencies without a good reason.
- UI style: quiet instrument look. Plain CSS in `app/globals.css`, CSS variables for colour,
  IBM Plex Sans/Mono, hairline rules, no shadows, no gradients, no rounded cards, one accent
  colour (`--signal`) used only for live/warning states. Must work on a phone and in night mode.
- Writing: plain English, no em or en dashes in UI text.
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
- Fast init is timed with JS timers (BREAK for 25 ms). Jitter of a few ms is normal.
- Web Serial needs a user gesture and works in Chrome/Edge desktop and Chrome 148+ Android. Not Safari.
- The app is a static export with `basePath` from `BASE_PATH` (set to `/openhood` in CI). Use relative
  imports and Next APIs, never hard-coded absolute asset paths.
