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

/** What went wrong when the website tried to read the car, for the agent to pick up from. */
export interface ReadProblem {
  /** What the person saw, in the site's words. */
  message: string;
  /** The profile the site read with. */
  profile: string;
  /** How it connected, when it got that far ("ELM327 adapter, ISO 15765-4 (CAN 11/500)"). */
  adapter?: string;
  /** The last traffic with the car, with anything that identifies it hidden (core/report.ts). */
  traffic?: string[];
}

/**
 * The demo car (the simulator, no adapter) also failed in this browser: then it's likely the
 * browser or Openhood itself, not the car or the adapter. Cut so the prompt still fits a link.
 */
function demoLine(demoFailed?: string): string {
  if (!demoFailed) return "";
  const said = demoFailed.length > 200 ? `${demoFailed.slice(0, 197)}...` : demoFailed;
  return `\nThe website's demo car also failed to start in this browser. It runs a simulated car in the page, with no adapter, so the cause is more likely the browser or Openhood itself than the car. It said: "${said}" Put that in any issue too.\n`;
}

/**
 * For an AI app on a phone, picked from the share sheet: it can't reach the adapter or run
 * anything, so it gets what happened and the traffic, and explains it.
 */
export function explainProblemPrompt(car: string, problem: ReadProblem, demoFailed?: string): string {
  const traffic = problem.traffic?.length ? `\n\nLast traffic with the car (-> sent, <- answered):\n${problem.traffic.join("\n")}` : "";
  return `I tried to read my car's fault codes with Openhood (${REPO}), a free fault code reader in the browser, and it went wrong.

Car: ${car || "(not given)"}
Openhood profile: ${problem.profile}${problem.adapter ? `\nConnected through: ${problem.adapter}` : ""}
What it said: "${problem.message}"${traffic}
${demoLine(demoFailed)}
I am not a mechanic or a programmer. In plain words: what most likely went wrong, and what should I try first (the adapter, the plug, the ignition, a setting)? If it looks like a problem in Openhood itself, help me write a short GitHub issue about it, or a comment on an open issue at ${REPO}/issues if one is about the same problem.`;
}

/**
 * The message behind "Ask Claude": a coding agent on the person's own computer (Claude or Codex
 * desktop app) sets Openhood up and reads the car, so the person never needs a terminal. Uses the
 * CLI, which works without registering the MCP server.
 *
 * `untried`: Openhood isn't proven on this car (profiles/car-reports.ts `needsTest`). The agent is then
 * asked to run Openhood's test with the person first, through the MCP server.
 * `problem`: the website tried and failed. The agent is asked to find out why with the MCP server.
 * `demoFailed`: what the demo car said when it failed to start in this browser.
 */
export function readCarPrompt(car: string, untried = false, problem?: ReadProblem, demoFailed?: string): string {
  // The end of the website's traffic, cut to fit a link (Claude Code takes up to 5,000 characters).
  const lines = problem?.traffic?.slice(-12).map((l) => (l.length > 90 ? `${l.slice(0, 87)}...` : l)) ?? [];
  const traffic = lines.length ? `\nThe website's last traffic with the car (-> sent, <- answered):\n${lines.join("\n")}\n` : "";
  const failed = problem
    ? `
I already tried reading it on the Openhood website and it went wrong. The site read it with the profile ${problem.profile}${problem.adapter ? ` through: ${problem.adapter}` : ""}. It said: "${problem.message}"
${traffic}Find out why. Openhood has an MCP server (command: npx -y openhood@latest mcp) with tools to connect, read faults and live data, and see the raw traffic: add it if you can (an MCP server added now only loads in a new session), otherwise use the commands with --traffic. Start with that profile. Work out whether it's the adapter, the plug, the ignition or the profile, tell me in plain words what to do, and offer to send what you found in as a GitHub issue. If the adapter's port is busy, ask me to close the Openhood page in the browser.
`
    : "";
  const first = untried && !problem
    ? `
Openhood isn't proven on this car yet: nobody has run its test on one, or some of its readings aren't verified. So before the fault codes, run Openhood's test with me. It takes about ten minutes with the car parked, tells much more than the codes, and is how those readings get verified. It needs Openhood's MCP server (command: npx -y openhood@latest mcp; one added now only loads in a new session): connect with it and follow what connect says (list_checks, then run_check one check at a time, then test_report). Its live view in my browser shows me what to do during each check. If something fails, or the car answers things the profile doesn't show yet, find out why using the profile's README and its sources in the repository, and offer to send what you found in as a GitHub issue.
`
    : "";
  return `Help me read my car's fault codes with Openhood, an open-source car diagnostics tool:
https://github.com/tuffjocke/openhood

I am not a programmer. Do the technical steps yourself, one at a time, and tell me in plain words what you're doing. Ask me before installing anything.

1. Openhood runs with Node.js. If it's missing, help me install the LTS version. Nothing else needs installing: each command below fetches Openhood by itself (about 4 MB). If npx says the openhood package isn't found, clone the repository instead, run npm install, and use "npm run openhood --" wherever it says "npx -y openhood@latest".
2. My adapter is plugged into the car and this computer, and the ignition is on. Find it with: npx -y openhood@latest ports
3. Pick the profile for my car from: npx -y openhood@latest profiles (use generic-obd2 if my car isn't listed). Then read the faults with: npx -y openhood@latest faults --profile <id> --port <port>
4. Explain each fault in plain words: what's wrong, how urgent it is, and what to check first. If it fails, look at the error, try again with --traffic, and help me fix it (ignition on, plug pushed in, right adapter).

5. Add my car to Openhood's shared knowledge, so others with the same car know what works: npx -y openhood@latest record --profile <id> --port <port> --make <make> --model <model> --year <year> --adapter-model "<what my adapter is sold as, ask me>". It only keeps the car, the adapter, the connection and whether it worked: no VIN, no fault codes. It prints a link to a ready-made GitHub issue: give it to me and help me send it if I want to (it needs a GitHub account).

${failed}${first}${demoLine(demoFailed)}
Rules: read only. Never clear codes or send anything that changes the car without asking me first. The commands are described in docs/cli.md in the repository. Before a new GitHub issue, look at the open ones (${REPO}/issues): if one is about the same problem, like the website not reading a car the commands read, add what you found to it as a comment instead.

My car is ${car || "(ask me which car it is)"}.`;
}
