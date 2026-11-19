# Adding your car

You don't need to know how to code. If you can chat with an AI, you can add your car.
The AI writes the code; you bring the car, the cable and some patience.

There are two ways to help, pick one:

- **[Just tell us about your car](#option-1-just-tell-us)**: 5 minutes, no setup.
- **[Add it yourself with an AI](#option-2-add-it-yourself-with-an-ai)**: an evening, and you'll be the first to use it.

---

## Option 1: Just tell us

[Open a "new vehicle" issue](https://github.com/tuffjocke/openhood/issues/new?template=new-vehicle.md)
and fill in what you know: the car, the year, the engine, and links to any forum threads or
tools that talk to it. Someone may pick it up, and you can test it when it's ready.

---

## Option 2: Add it yourself with an AI

### What you need

- A computer (Windows, Mac or Linux) with **Chrome** or **Edge**
- A **KKL cable** with an FTDI chip (see the [README](../README.md#hardware)), for testing on the car
- An AI coding agent: **[Claude Code](https://claude.com/claude-code)** or **[OpenAI Codex](https://openai.com/codex)**.
  These are like ChatGPT, but they can read and change files on your computer and run the app.
  A regular chat window can't do that, which is why you need one of these.

### 1. Install the tools (once)

1. **[Node.js](https://nodejs.org)**: download the LTS version and install it with the default options.
2. **[GitHub Desktop](https://desktop.github.com)**: install it and sign in with a free GitHub account.
3. **Claude Code or Codex**: follow the install guide on their website.

### 2. Get your own copy of Openhood

1. Go to [github.com/tuffjocke/openhood](https://github.com/tuffjocke/openhood) and click **Fork**
   (top right). This makes your own copy that you're free to change.
2. In GitHub Desktop: **File → Clone repository**, pick `openhood` from the list, click **Clone**.
3. Click **Repository → Open in Terminal** (Mac: Terminal, Windows: Command Prompt).
4. In that window, type `claude` (or `codex`) and press Enter. You're now chatting with an agent
   that can see the project.

### 3. Ask the AI to add your car

Copy this, change the car details, and paste it in:

> I want to add my car to Openhood. It's a **1997 BMW 328i with the M52 engine** (Siemens MS41 ECU).
> Read AGENTS.md and docs/adding-a-vehicle.md first, then:
> 1. Install what's needed and check the app runs.
> 2. Research what's publicly known about talking to this ECU over K-line. Show me your sources.
> 3. Create a new profile for it, following the rules in AGENTS.md, with a simulator.
> 4. Run `npm run check` until it passes.
> 5. Explain in plain words what you're sure of, what you guessed, and what I need to check on the car.
> I'm not a programmer, so explain things simply.

In Claude Code you can also just type `/add-vehicle BMW 328i M52` and it does the same.

Let it work. It will ask before doing some things: read what it wants to do, and say yes if it
makes sense. If you don't understand something, ask it: *"What does that mean?"* is a perfectly good
question.

### 4. Try it without the car

Ask the AI: *"Start the app so I can try it."* It runs `npm run dev` and gives you a link,
usually http://localhost:3000. Open it in Chrome, pick your car in the menu at the top, and click
**Simulator**. You should see numbers moving. This only proves the code hangs together, not that
it's right for your car.

### 5. Try it on the car

1. Take the laptop to the car. Start the app the same way.
2. Plug the cable into the OBD socket (usually under the dashboard, driver's side) and the laptop.
3. Ignition **on**. The engine can be off or running.
4. Pick your car, click **Connect cable**, choose the cable in the popup.
5. Open **K-line traffic** at the bottom of the page. That's the raw conversation with the car.

It probably won't be perfect the first time. That's normal and it's how everyone does it:

- **Copy the K-line traffic** (select it, copy) and paste it to the AI with what you saw:
  > It says "No answer from the ECU". Here's the traffic: ...
  > The rpm shows 3200 at idle, the dash says about 800.
- The AI changes the profile, you click **Disconnect** and **Connect cable** again, and repeat.
- When a value matches your dashboard (coolant, rpm, speed), tell the AI:
  *"rpm and coolant match the dash now, mark them verified and note my car in the README."*

Safety: test parked. If you test while driving, someone else drives.

### 6. Share it

1. Ask the AI: *"Run npm run check, then summarise the changes for a pull request."*
2. In GitHub Desktop, write a short summary (bottom left), click **Commit to main**, then **Push origin**.
3. Click **Create Pull Request**. GitHub opens in the browser. Paste the AI's summary, say which car
   you tested on, include a few lines of K-line traffic, and submit.

The maintainer reviews it, may ask a question or two, and merges it. A few minutes later your car
is in the app for everyone.

### If you get stuck

- Ask the AI first: paste the exact error message.
- Still stuck? [Open an issue](https://github.com/tuffjocke/openhood/issues/new) and paste what you
  asked, what happened and the K-line traffic. Nobody will mind beginner questions.

---

## Reference (for developers and AI agents)

A vehicle is one folder in `/profiles` implementing `VehicleProfile` from `core/profile.ts`.
No changes to `core/` or `components/` are needed.

1. `cp -r profiles/_template profiles/<make>-<engine-or-ecu>`, kebab-case, `id` = folder name.
2. Set `name`, `covers`, `ecu`, `link` (baud, init, addresses) and `connect` (session, security).
3. **Channels**: what the UI shows (label, unit, decimals, min/max, optional `warnAbove`/`warnBelow`).
4. **Groups**: one per request. `decode(res, state)` gets the response payload including the
   positive SID (`[0x61, localId, ...data]`, data at index 2). `state` holds earlier values.
5. `encode` next to every `decode`, and a **simulator** whose `handle` answers the same requests.
6. **Schedule**: repeat fast groups to poll them more often. `slowGroups` for rarely changing values.
7. Optional **faults** with `read` and `clear`.
8. Register in `profiles/index.ts`, write the profile README, run `npm run check`.

### Confidence levels

- `verified`: checked on a real car, and the README says which car.
- `community`: from a source (linked in the README), not yet checked.
- `guess`: placeholder.

### Reading the traffic log

| You see | It means |
| --- | --- |
| Nothing after start communication | Wrong init, address or baud rate, ignition off, or wrong cable |
| `7F xx 33` | Security access needed first |
| `7F 27 35` | Wrong key: the security algorithm is off |
| `7F xx 11` / `12` / `31` | ECU doesn't know that request |
| Values off by a constant factor | Scaling wrong in `decode` |
