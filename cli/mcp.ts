import { createInterface } from "node:readline";
import { Runtime, UserError } from "./runtime";

/**
 * Openhood as an MCP server (Model Context Protocol) over stdio, for coding agents such as
 * Claude Code, Codex or Cursor. Newline-delimited JSON-RPC 2.0: initialize, tools/list,
 * tools/call, ping. Kept dependency-free on purpose; stdout carries only protocol messages.
 */

import { FROM_NPM, VERSION } from "./command";
import { openInBrowser, siteDir, startWatchServer } from "./watch-server";

const INSTRUCTIONS = `Openhood reads cars through a KKL cable or an ELM327 adapter, or a simulator when no car is connected.
Typical flow: list_profiles, list_ports, connect, read_faults, read_live. Use traffic to see the raw conversation.
It is read-only: request only sends read services, and clear_faults needs the person's yes (confirm: true).
Values marked confidence "guess" or "community" are not proven; compare them with the car's own dashboard
before calling them right. Remind the person to test with the car parked.
The first connect opens a live view in the person's browser, and connect returns its link (liveView): give the
link to the person once, in case no window opened, so they can watch the readings, fault codes and traffic. It only shows what you read; read_live with seconds
makes the dials move.`;

type Json = Record<string, unknown>;

interface Tool {
  name: string;
  description: string;
  inputSchema: Json;
  run: (rt: Runtime, args: Json) => Promise<unknown> | unknown;
}

const str = (description: string) => ({ type: "string", description });

export const TOOLS: Tool[] = [
  {
    name: "list_profiles",
    description: "Vehicle profiles Openhood knows, with the cars they cover and which adapters they run on.",
    inputSchema: { type: "object", properties: {} },
    run: (rt) => rt.profiles(),
  },
  {
    name: "list_ports",
    description: "Serial ports on this computer: USB adapters and KKL cables, and paired Bluetooth adapters.",
    inputSchema: { type: "object", properties: {} },
    run: (rt) => rt.ports(),
  },
  {
    name: "connect",
    description:
      "Connect to the car with a profile. Give port for real hardware (the adapter is detected), or leave it out for the simulator. Ignition must be on.",
    inputSchema: {
      type: "object",
      properties: {
        profile: str('Profile id from list_profiles, e.g. "generic-obd2".'),
        port: str("Serial port path from list_ports, e.g. /dev/ttyUSB0 or COM3. Leave out for the simulator."),
        adapter: { type: "string", enum: ["auto", "kkl", "elm327"], description: 'Default "auto": detect it.' },
        simulateElmCan: {
          type: "boolean",
          description: "Simulator only: go through a simulated ELM327 on a CAN car (true) or a K-line car (false).",
        },
      },
      required: ["profile"],
    },
    run: (rt, a) =>
      rt.connect({
        profile: String(a.profile),
        port: a.port ? String(a.port) : undefined,
        adapter: a.adapter as "auto" | "kkl" | "elm327" | undefined,
        simulateElmCan: typeof a.simulateElmCan === "boolean" ? a.simulateElmCan : undefined,
      }),
  },
  {
    name: "disconnect",
    description: "Close the connection.",
    inputSchema: { type: "object", properties: {} },
    run: (rt) => rt.disconnect(),
  },
  {
    name: "read_faults",
    description: "Stored fault codes with plain-language explanations, urgency and what to check first, plus readiness.",
    inputSchema: { type: "object", properties: { pending: { type: "boolean", description: "Also read pending codes." } } },
    run: (rt, a) => rt.faults({ pending: a.pending === true }),
  },
  {
    name: "freeze_frame",
    description: "The snapshot of sensor values the ECU saved when a fault was set, if it keeps one.",
    inputSchema: { type: "object", properties: { code: str("Fault code or id from read_faults.") }, required: ["code"] },
    run: (rt, a) => rt.freezeFrame(String(a.code)),
  },
  {
    name: "read_live",
    description: "Read every supported value once, or keep reading for some seconds and report min, max and last.",
    inputSchema: { type: "object", properties: { seconds: { type: "number", description: "0 to 30. Default 0: one pass." } } },
    run: (rt, a) => rt.live({ seconds: typeof a.seconds === "number" ? a.seconds : 0 }),
  },
  {
    name: "request",
    description:
      'Send one raw diagnostic request and get the answers, e.g. "01 0C" or "21 09". Only read services are allowed. For finding out what an ECU answers while writing a profile.',
    inputSchema: {
      type: "object",
      properties: {
        hex: str("Request payload in hex: service id then data, no header or checksum."),
        many: { type: "boolean", description: "Collect every answer (several ECUs or frames), not just the first." },
      },
      required: ["hex"],
    },
    run: (rt, a) => rt.request({ hex: String(a.hex), many: a.many === true }),
  },
  {
    name: "traffic",
    description: "The last lines of raw traffic with the car (requests, answers, wake-up), for debugging a profile.",
    inputSchema: { type: "object", properties: { last: { type: "number", description: "How many lines. Default 60." } } },
    run: (rt, a) => rt.trafficLines(typeof a.last === "number" ? a.last : 60),
  },
  {
    name: "clear_faults",
    description:
      "Clear stored fault codes. Only after the person said yes: clearing erases the codes without fixing anything and can reset readiness checks.",
    inputSchema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true." } }, required: ["confirm"] },
    run: (rt, a) => rt.clearFaults({ confirm: a.confirm === true }),
  },
  {
    name: "explain_code",
    description: "Explain a fault code in plain words, without a car. Works for standard codes like P0171.",
    inputSchema: { type: "object", properties: { code: str("e.g. P0420") }, required: ["code"] },
    run: (rt, a) => rt.explain(String(a.code)),
  },
];

/** Handle one JSON-RPC message. Returns the reply, or null for notifications. Exported for tests. */
export async function handle(rt: Runtime, msg: Json): Promise<Json | null> {
  const id = msg.id as string | number | undefined;
  const method = String(msg.method ?? "");
  const params = (msg.params ?? {}) as Json;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  if (id === undefined) return null; // notifications/initialized and friends need no answer

  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "openhood", version: VERSION },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool ${String(params.name)}` } };
      try {
        const result = await tool.run(rt, (params.arguments ?? {}) as Json);
        return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (e) {
        // Tool failures are results the agent can read and act on, not protocol errors.
        const text = e instanceof UserError ? e.message : `${e instanceof Error ? e.message : String(e)}\n\nRecent traffic:\n${rt.trafficLines(20).join("\n")}`;
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

export async function serve(opts: { unsafe?: boolean; watch?: boolean; open?: boolean }) {
  const rt = new Runtime({ unsafe: opts.unsafe });
  if (opts.unsafe) console.error("openhood: raw requests are NOT limited to read services (--unsafe-allow-any-request).");
  if (opts.watch !== false) {
    // The live view is a nice extra: if it can't start, the agent still gets every tool.
    try {
      const view = await startWatchServer(rt, { dir: siteDir(FROM_NPM) });
      rt.liveView = view.url;
      console.error(`openhood: live view at ${view.url}`);
    } catch (e) {
      console.error(`openhood: no live view (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  // The live view pops up the first time the agent connects to a car, not when the server starts:
  // agents start their MCP servers with every session, car or not. Once per run, and not if a page is open.
  let opened = opts.open === false;
  const send = (m: Json) => process.stdout.write(JSON.stringify(m) + "\n");
  const lines = createInterface({ input: process.stdin });
  // One message at a time, in order: the car can only do one thing at a time anyway.
  let chain = Promise.resolve();
  lines.on("line", (line) => {
    if (!line.trim()) return;
    chain = chain.then(async () => {
      let msg: Json;
      try {
        msg = JSON.parse(line) as Json;
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }
      if (!opened && rt.liveView && msg.method === "tools/call" && (msg.params as Json | undefined)?.name === "connect") {
        opened = true;
        if (!rt.watching) openInBrowser(rt.liveView);
      }
      const out = await handle(rt, msg);
      if (out) send(out);
    });
  });
  lines.on("close", () => void chain.then(() => rt.disconnect()).then(() => process.exit(0)));
}
