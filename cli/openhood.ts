/**
 * Openhood on the command line, and as an MCP server for coding agents.
 *
 *   npm run openhood -- <command> [options]
 *
 * Commands:
 *   profiles                         vehicle profiles and the adapters they run on
 *   ports                            serial ports (adapters, cables, paired Bluetooth)
 *   explain <code>                   a fault code in plain words, no car needed
 *   faults  --profile <id> [car]     read fault codes
 *   live    --profile <id> [car] [--seconds 5]
 *   request --profile <id> [car] <hex>   one read-only raw request, e.g. "01 0C"
 *   record  --profile <id> --port <path> --make <make> --model <model> --year <year>
 *           [--adapter-model "Vgate iCar Pro 2S"] [--engine ..] [--notes ..]
 *                                    read the car and add what worked to profiles/car-reports.json
 *   mcp [--unsafe-allow-any-request] run as an MCP server on stdio
 *
 * [car] is --port <path> for real hardware (adapter detected, or --adapter kkl|elm327),
 * or nothing for the simulator (--elm can|kline to simulate an ELM327).
 */
import { serve } from "./mcp";
import { recordCar, Runtime, UserError, type ConnectOptions } from "./runtime";

function parse(argv: string[]) {
  const flags: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) flags[a.slice(2)] = argv[++i];
      else flags[a.slice(2)] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}

const USAGE = `Usage: npm run openhood -- <profiles | ports | explain <code> | faults | live | request <hex> | record | mcp> [options]
  --profile <id>   e.g. generic-obd2 (see "profiles")
  --port <path>    real hardware, e.g. /dev/ttyUSB0 or COM3; leave out for the simulator
  --adapter kkl|elm327   skip detection
  --elm can|kline  simulator: go through a simulated ELM327
  --seconds <n>    live: keep reading for n seconds
  --make, --model, --year, --engine, --notes   record: the car, names as in profiles/names.ts`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const { flags, rest } = parse(args);
  if (command === "mcp") return serve({ unsafe: flags["unsafe-allow-any-request"] === true });

  const rt = new Runtime();
  const print = (x: unknown) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));
  const connectOpts = (): ConnectOptions => {
    if (typeof flags.profile !== "string") throw new UserError("Add --profile <id>. See: npm run openhood -- profiles");
    return {
      profile: flags.profile,
      port: typeof flags.port === "string" ? flags.port : undefined,
      adapter: flags.adapter === "kkl" || flags.adapter === "elm327" ? flags.adapter : "auto",
      simulateElmCan: flags.elm === "can" ? true : flags.elm === "kline" ? false : undefined,
    };
  };

  try {
    switch (command) {
      case "profiles":
        return print(rt.profiles());
      case "ports":
        return print(await rt.ports());
      case "explain":
        return print(rt.explain(rest[0] ?? ""));
      case "record": {
        const str = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
        if (!str("make") || !str("model") || !str("year")) throw new UserError("record needs --make, --model and --year.");
        const r = await recordCar(rt, { ...connectOpts(), make: str("make")!, model: str("model")!, year: Number(str("year")), engine: str("engine"), adapterModel: str("adapter-model"), notes: str("notes") });
        print(r);
        console.error("Added to profiles/car-reports.json. Send it in with a pull request so others with this car know what works.");
        return;
      }
      case "faults":
      case "live":
      case "request": {
        print(await rt.connect(connectOpts()));
        if (command === "faults") print(await rt.faults({ pending: true }));
        if (command === "live") print(await rt.live({ seconds: Number(flags.seconds ?? 0) }));
        if (command === "request") print(await rt.request({ hex: rest.join(" "), many: flags.many === true }));
        if (flags.traffic) print(rt.trafficLines(200).join("\n"));
        await rt.disconnect();
        return;
      }
      default:
        console.error(USAGE);
        process.exitCode = command ? 1 : 0;
    }
  } catch (e) {
    console.error(e instanceof UserError ? e.message : e);
    if (!(e instanceof UserError)) console.error("\nRecent traffic:\n" + rt.trafficLines(20).join("\n"));
    await rt.disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

void main();
