/**
 * The "add your car with an AI" message, shown in the app and in docs/adding-a-vehicle.md.
 * tests/add-car.test.ts checks that the two copies stay identical.
 */

const REPO = "https://github.com/tuffjocke/openhood";

export const ADD_CAR_PROMPT = `You are helping me add my car to Openhood, an open-source browser app for car diagnostics:
https://github.com/tuffjocke/openhood

I am not a programmer. Guide me one small step at a time, wait for me to say it worked before
the next step, and explain things in plain words. If I paste an error, help me fix it.

The plan:
0. Help me check that my car has a K-line and which cable I need, using
   https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md
1. Help me install what I need: Node.js (LTS), GitHub Desktop with a free GitHub account,
   and an AI coding agent that can work with files on my computer (Claude Code or OpenAI Codex).
   If you are already such an agent running on my computer, skip what is already done.
2. Help me fork the Openhood repository on GitHub, clone my fork with GitHub Desktop,
   and open it in the coding agent.
3. In the coding agent, the work is: read AGENTS.md and docs/adding-a-vehicle.md, research what is
   publicly known about talking to my car's engine ECU over K-line (show me the sources),
   create a new profile with a simulator following the rules in AGENTS.md, and run
   \`npm run check\` until it passes. If you are not the coding agent yourself, give me the exact
   message to paste into it.
4. Help me start the app (\`npm run dev\`), open it in Chrome, pick my car and try the Simulator.
5. Help me test on the real car with my adapter or KKL cable, car parked, ignition on. If you are a
   coding agent with Openhood's MCP server (the repo's .mcp.json starts it), use its tools to connect,
   read and send read-only requests yourself. Otherwise I press Connect in the app, paste you the
   "Traffic with the car" and tell you what I see, and we fix it together. Only mark values as
   verified when they match my dashboard, and note my car in the profile README.
6. Help me commit, push and open a pull request with GitHub Desktop, with a short summary of
   what was tested.

Rules: use only official make and model names from profiles/names.ts and real model years.
Never make up protocol details. Say clearly what is sourced, what is a guess and what
I need to check on the car. Stay read-only: nothing that writes to the ECU, and nothing to do
with immobilisers, keys or odometers. Remind me to test with the car parked.

My car is:`;

export interface CarDetails {
  make: string;
  model: string;
  year: number;
}

export const carName = (c: CarDetails) => `${c.make} ${c.model} ${c.year}`;

/** The message with the person's car already filled in. */
export function addCarPrompt(c: CarDetails): string {
  return `${ADD_CAR_PROMPT} ${c.make} ${c.model}, model year ${c.year}. Ask me for the engine if you need it.`;
}

/** A pre-filled "request a vehicle" issue, for people who'd rather just tell us. */
export function requestCarUrl(c: CarDetails): string {
  const q = new URLSearchParams({ template: "new-vehicle.md", title: `Add ${carName(c)}` });
  return `${REPO}/issues/new?${q}`;
}

/**
 * The message for the "With an AI agent" track: a coding agent on the person's own computer
 * (Claude or Codex desktop app) sets Openhood up and reads the car, so the person never needs
 * a terminal. Uses the CLI, which works without registering the MCP server.
 */
export function readCarPrompt(car: string): string {
  return `Help me read my car's fault codes with Openhood, an open-source car diagnostics tool:
https://github.com/tuffjocke/openhood

I am not a programmer. Do the technical steps yourself, one at a time, and tell me in plain words what you're doing. Ask me before installing anything.

1. Get Openhood onto this computer: clone the repository (or download it as a ZIP if Git is missing) into a folder, then run npm install. If Node.js is missing, help me install the LTS version.
2. My adapter is plugged into the car and this computer, and the ignition is on. Find it with: npm run openhood -- ports
3. Pick the profile for my car from: npm run openhood -- profiles (use generic-obd2 if my car isn't listed). Then read the faults with: npm run openhood -- faults --profile <id> --port <port>
4. Explain each fault in plain words: what's wrong, how urgent it is, and what to check first. If it fails, look at the error, try again with --traffic, and help me fix it (ignition on, plug pushed in, right adapter).

5. Add my car to Openhood's shared knowledge, so others with the same car know what works: npm run openhood -- record --profile <id> --port <port> --make <make> --model <model> --year <year> --adapter-model "<what my adapter is sold as, ask me>". It only stores the car, the adapter, the connection and whether it worked: no VIN, no fault codes. If my model is missing from profiles/names.ts, add it with the manufacturer's official spelling (ask me if unsure). Then offer to send it in as a pull request on GitHub, and help me do it if I say yes.

Rules: read only. Never clear codes or send anything that changes the car without asking me first. See docs/cli.md in the repository for the commands.

My car is ${car || "(ask me which car it is)"}.`;
}
