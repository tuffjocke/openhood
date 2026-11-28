# Testing a car

A fault read alone says little. These short checks, done with the car parked, tell much more: whether
the sensors agree, whether the idle is steady, whether a sensor with a stored fault still follows the
revs, whether the alternator keeps up. Every check is read-only: it reads faults and live values and
never changes anything in the car.

The easiest way is to let an AI agent run them with Openhood's MCP server (see [cli.md](cli.md)). It
walks you through one check at a time. You can also run them yourself on the live view in your browser,
with an agent or with `npx -y openhood@latest watch` and no agent at all: it lists the steps, says what to
do, and has Start, Stop, Skip and Reconnect. While a check runs, the live view shows only that
check: what to do, the time left and the check's readings on the same dials and charts as the live screen.

Where you do something, it shows one action at a time and moves on when the car's readings show it
was done, not on a clock. In the rev test it says "Rev up" until the revs reach about 2,500 (a yellow
mark on the rpm dial), then "Let go" until they're back near idle, and counts the revs ("2 of 4"); it
ends after the fourth. For the Td5's pedal switches it says "Press the brake pedal", counts 3 seconds
while you hold it, then "Let go of it", then the same for the clutch, and ends once both are seen.
Each such check has a time limit in case something goes wrong.

If the car stops answering, for example because the key went off between checks, connecting again to
the same car (same profile and port) keeps the checks already done.

## When

First, on any car Openhood isn't proven on yet: when no car has run the test with its profile, or the
profile has readings nobody has verified on a car. The MCP server's `connect` says so (`test.recommended`
and why), and the agent should offer the test before anything else. One check, "Readings not verified
yet", reads exactly those values with the engine idling and asks you whether the car's own gauges agree:
your answers are what let a reading be marked verified. The results can go on the shared list of cars
(`checks` in profiles/car-reports.json), so the next person with that car knows it has been tested.

## Safety first

For every check with the engine running:

- Parked outdoors, or with the garage door open. Exhaust fumes kill.
- Handbrake on, gearbox in neutral (or P).
- Hands, hair, sleeves and the adapter's cable away from the fan and the belts.
- Nobody in front of the car.

Start the engine before you tell the agent you're ready, not during the check. Cranking dips the
battery voltage, and some cars or cables stop answering for a moment. If that happens, the check
ends and says the car stopped answering; the next check connects again by itself.

## The checks

| Check | What you do | What it shows |
| --- | --- | --- |
| Faults | ignition on, nothing else | stored faults, each explained; some are normal on some cars |
| Ignition on, engine off | nothing for 10 s, best after the car has stood for hours | battery at rest; temperature sensors agree on a cold engine |
| Idle | start the engine, hands off for 30 s | idle steadiness; fuel trims on OBD-II cars |
| Rev test | rev to about 2,500 rpm and back to idle, four times (the live view follows the revs and counts them) | readings like air flow follow the revs: a sensor that follows the revs but has a stored fault points at its plug |
| Charging under load | headlights, heater fan on full and heated rear screen, 20 s | the alternator keeps the voltage up |
| Wiggle test | for 30 s, gently wiggle the plug and wiring of the part a stored fault names; with none stored, the KKL cable's connector (or the adapter) where it plugs into the car | new faults, a stumbling idle or a car that stops answering mean a loose contact |
| Warm-up | idle from cold for 90 s, again later | the coolant temperature rises |
| Readings not verified yet | idle 15 s, watch the car's own gauges | each unverified reading against what it can sensibly be, and your gauges |
| The car's own | e.g. Td5: press the brake, hold it, let go, then the clutch | the pedal switches work |

Each finding is **OK**, **look at** or **unclear** (the check couldn't tell, for example the engine was
warm when it needed to be cold), with one plain sentence. The limits are general workshop rules of
thumb, not a manufacturer's figures: "look at" means worth a look, not a diagnosis.

At the end the agent can make a public test report: a ready-made GitHub issue with each finding, so
others with the same car know what to expect. Fault codes are left out unless you agree.

## Your car's history

Each test run is saved on your own computer, so a later run can be compared with the last one (the
cold-engine check redone another day, say). It is never uploaded or sent anywhere.

- The command line and the MCP server keep it in `~/.openhood/test-history.json`, readable by you only:
  the date, each check's findings and its key readings (lowest, highest, last). Nothing that identifies
  the car or you: no VIN, no registration. The car is saved under a name you choose ("My Defender",
  `connect`'s `car`, or `watch --car`) with its profile. Demo (simulator) runs are never saved.
- The live view shows earlier runs of the same car under "Earlier tests", and after a check what it
  found last time.
- `npx -y openhood@latest history` lists them, `--export file.json` saves a copy, `--delete` deletes it
  all. Start `mcp` or `watch` with `--no-history` to stop saving.
- The website can show them too: import the exported file under More, Import. They stay in that
  browser only, with Export and Delete all next to them.
- Sharing stays separate: a test report or car report only goes to GitHub when you ask.

## For agents

MCP tools: `list_checks` (the steps for the connected car, with the safety note), `run_check` with an id
(reads for the check's time, up to 120 s; pass `seconds` for a quicker look; a check with steps ends
after its last step and says how many were done), `test_report` (findings and the issue link;
`includeFaults` only with the person's yes; with `make`, `model` and `year` also `carReport`, a link
adding the car to the shared list as tested), `test_history` (earlier runs saved on this computer).
Tell the person what to do in plain words, wait until they say they're ready, then run the check, and
explain each finding before the next one. The server keeps the session open between checks, and a
`connect` to the same profile and port keeps the checks done (`checksKept`). Ask the person for a name
for the car and pass it to `connect` as `car`.

## For profile authors

A profile lists its checks in `checks` (`core/checks.ts`), usually `standardChecks(channels, { rpm,
battery, coolant, temperatures, followRevs, trims })` with its own channel keys, plus checks of its own
(see `profiles/land-rover-td5/checks.ts`). A profile without checks gets the faults and a short reading
of everything. Only list a reading in `followRevs` if it should really rise with the revs with no load:
a turbo's boost doesn't.

Where the person does something the car can see, give the check `steps`: each one says what to do
in a few words and which of the check's `watch` channels shows it done (`above` or `below` a value,
optionally held for `hold` seconds, with a `target` to mark on its dial), and `rounds` repeats them.
`seconds` is then the time limit. Add the Swedish for each `say` to core/i18n/sv.ts (a test checks).
`askFor` words a check for the car's hardware and stored faults, and `lost` says what a car that stops
answering during the check means.
