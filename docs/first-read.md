# First read on a real car

A one-page plan for the first time Openhood meets a real car. Nothing here has been proven on real
hardware yet, so expect something to fail. The goal is that it fails usefully: with the traffic saved,
so it can be fixed the same day.

Openhood only reads. Nothing below changes anything in the car.

## Before the adapter arrives (10 minutes, at your desk)

Do this now so the laptop is sorted before you sit in the car.

1. Install [Node.js](https://nodejs.org) 20 or newer.
2. Get Openhood and install it:

   ```
   git clone https://github.com/tuffjocke/openhood
   cd openhood
   npm install
   ```

3. Read the demo car. No adapter needed:

   ```
   npm run openhood -- faults --profile generic-obd2
   ```

   **Good:** it prints made-up codes such as P0171 and P0420, each with a plain-words explanation.

4. Open the website in Chrome or Edge on the same laptop and press **Try a demo car**.

   **Good:** live readings move and fault cards show.

No terminal? Skip 1 to 3. Open the Claude or Codex desktop app, and paste the message from
**Or let an AI agent read it** on the website when you are in the car.

## In the car

Laptop charged. Engine off, ignition on (dashboard lights lit). Adapter in the socket under the
dashboard, near your knee.

Work down this list and stop at the first step that fails.

| Step | Do this | Good looks like |
| --- | --- | --- |
| 1 | `npm run openhood -- ports` | Your adapter is in the list. Note its name, like `COM3` or `/dev/ttyUSB0`. |
| 2 | `npm run openhood -- faults --profile <profile> --port <name> --traffic` | It says what it connected through, then lists stored codes, or none. |
| 3 | `npm run openhood -- live --profile <profile> --port <name> --seconds 10` | Numbers that make sense: battery near 12 V, coolant near outside temperature on a cold engine, 0 rpm. |
| 4 | Start the engine, run step 3 again | About 700 to 900 rpm at idle, battery 13.5 to 14.5 V. |
| 5 | Website: pick the car, **Read my car** | The same codes and readings as steps 2 to 4. |
| 6 | Website: answer **Did this match your car?** | Yes adds the car to the shared list. No sends a test report. |

Which `<profile>`:

- Land Rover Td5 (Defender, Discovery 2) with a KKL cable: `land-rover-td5`
- Any other car, with an ELM327-type adapter: `generic-obd2`

## If a step fails

Don't retry more than twice. Save what happened and move on:

```
npm run openhood -- faults --profile <profile> --port <name> --traffic > first-read.txt 2>&1
```

Then send `first-read.txt` together with:

- the car (make, model, year, engine) and the exact adapter (brand and model, or the listing you bought)
- which step failed and what the screen said
- whether the ignition was on and the engine running

The traffic has no VIN in it: Openhood hides the requests that identify one car.

What the usual failures mean:

| You see | Most likely |
| --- | --- |
| Adapter not in `ports` | Driver missing (FTDI or CH340 for USB), or a Bluetooth adapter that isn't paired yet. |
| "The adapter didn't answer" | Wrong port picked, or a low-energy Bluetooth adapter (those only work on the website). |
| "The car didn't answer the adapter. Is the ignition on?" | Ignition off, adapter not pushed fully home, or a car older than OBD-II. |
| "needs a KKL cable" | An ELM327 adapter on a car that needs the plain cable (the Td5). |
| Codes read, live numbers look wrong | A decoding bug in the profile. The traffic file shows exactly where. |

## After a good read

- Add the car to the shared list: answer **Yes** on the website, or run `record` (see [cli.md](cli.md)).
- Mark what was confirmed in the profile README, and on which car. Only a person who tested on a real
  car may set a value to `verified`.
