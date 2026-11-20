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
