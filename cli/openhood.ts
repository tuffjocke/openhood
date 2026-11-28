/**
 * Openhood on the command line, and as an MCP server for coding agents.
 *
 *   npx -y openhood@latest <command> [options]          from the npm package
 *   npm run openhood -- <command> [options]   in a clone of the repository
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
 *                                    (from npm: prints a link to send it in instead)
 *   watch   --profile <id> [car] [--no-open] [--car "My Defender"] [--no-history]
 *                                    the live view in the browser, no agent needed: reads until Ctrl+C
 *   mcp [--unsafe-allow-any-request] run as an MCP server on stdio (the flag only in a clone),
 *       [--no-watch] [--no-open]     with a live view at http://127.0.0.1:4848/watch/, opened at the first connect
 *       [--no-update-check]          and a check at start that npm has no newer openhood
 *       [--no-history]               and no saving of test runs
 *   history [--export <file>] [--delete] [--json]
 *                                    the test runs saved on this computer (~/.openhood/test-history.json)
 *
 * [car] is --port <path> for real hardware (adapter detected, or --adapter kkl|elm327),
 * or nothing for the simulator (--elm can|kline to simulate an ELM327).
 */
import { CMD, FROM_NPM } from "./command";
import { serve } from "./mcp";
import { recordCar, Runtime, UserError, type ConnectOptions } from "./runtime";
import { defaultHistoryPath, deleteRuns, loadRuns } from "./test-history";
import { testHistoryFile, worstOf, type TestRun } from "../core/test-history";
import { writeFileSync } from "node:fs";
import { watchCar } from "./watch-car";
import { siteDir } from "./watch-server";

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

const USAGE = `Usage: ${CMD} <profiles | ports | explain <code> | faults | live | request <hex> | record | watch | mcp | history> [options]
  --profile <id>   e.g. generic-obd2 (see "profiles")
  --port <path>    real hardware, e.g. /dev/ttyUSB0 or COM3; leave out for the simulator
  --adapter kkl|elm327   skip detection
  --elm can|kline  simulator: go through a simulated ELM327
  --seconds <n>    live: keep reading for n seconds
  --no-watch       mcp: no live view in the browser
  --no-open        watch, mcp: don't open the live view in the browser by itself
  --no-update-check  mcp: don't ask npm whether a newer openhood is out
  --car <name>     watch: your name for the car in its test history, e.g. "My Defender" (never a VIN)
  --no-history     watch, mcp: don't save test runs on this computer
  --export <file>, --delete, --json   history: save a copy, delete it all, or print it whole
  --make, --model, --year, --engine, --notes   record: the car, names as in profiles/names.ts`;

/** `history`: the test runs saved on this computer, one line each, or exported, or deleted. */
function history(flags: Record<string, string | true>) {
  const path = defaultHistoryPath();
  if (flags.delete === true) {
    const n = deleteRuns(path);
    return console.log(n ? `Deleted the test history (${n} ${n === 1 ? "run" : "runs"}).` : "There was no test history to delete.");
  }
  let runs: TestRun[];
  try {
    runs = loadRuns(path);
  } catch (e) {
    throw new UserError(`${(e as Error).message} Delete it with: ${CMD} history --delete`);
  }
  if (typeof flags.export === "string") {
    writeFileSync(flags.export, JSON.stringify(testHistoryFile(runs), null, 2) + "\n");
    return console.log(`Saved ${runs.length} ${runs.length === 1 ? "run" : "runs"} to ${flags.export}. The website imports it under More, Import.`);
  }
  if (flags.json === true) return console.log(JSON.stringify(testHistoryFile(runs), null, 2));
  if (!runs.length) return console.log("No test runs saved yet. Saved on this computer only, when you run Openhood's test.");
  console.log(`Saved on this computer only (${path}):\n`);
  for (const r of runs) {
    const checks = r.checks.map((c) => `${c.title} ${{ ok: "OK", look: "look at", unclear: "unclear" }[worstOf(c.findings)]}`).join(", ");
    console.log(`${r.date.slice(0, 16).replace("T", " ")}  ${r.car ?? r.profile}${r.car ? ` (${r.profile})` : ""}\n  ${checks}`);
  }
  console.log(`\nDelete it all with: ${CMD} history --delete`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const { flags, rest } = parse(args);
  if (command === "mcp") {
    const unsafe = flags["unsafe-allow-any-request"] === true;
    // Lifting the read-only limit is for maintainers working in a clone, never for the published package.
    if (unsafe && FROM_NPM)
      throw new UserError("--unsafe-allow-any-request isn't available in the npm package. Use a clone of the repository.");
    return serve({
      unsafe,
      watch: flags["no-watch"] !== true,
      open: flags["no-open"] !== true,
      updateCheck: flags["no-update-check"] !== true,
      history: flags["no-history"] === true ? undefined : defaultHistoryPath(),
    });
  }

  // watch keeps one connection for a long time: keep its session open and connect again if it drops.
  // It runs Openhood's test from the page, so it saves the runs too, unless told not to.
  const saveTests = command === "watch" && flags["no-history"] !== true;
  const rt = new Runtime({ keepAlive: command === "watch", history: saveTests ? defaultHistoryPath() : undefined });
  const print = (x: unknown) => console.log(typeof x === "string" ? x : JSON.stringify(x, null, 2));
  const connectOpts = (): ConnectOptions => {
    if (typeof flags.profile !== "string") throw new UserError(`Add --profile <id>. See: ${CMD} profiles`);
    return {
      profile: flags.profile,
      port: typeof flags.port === "string" ? flags.port : undefined,
      adapter: flags.adapter === "kkl" || flags.adapter === "elm327" ? flags.adapter : "auto",
      simulateElmCan: flags.elm === "can" ? true : flags.elm === "kline" ? false : undefined,
      car: typeof flags.car === "string" ? flags.car : undefined,
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
      case "history":
        return history(flags);
      case "record": {
        const str = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);
        if (!str("make") || !str("model") || !str("year")) throw new UserError("record needs --make, --model and --year.");
        const r = await recordCar(rt, { ...connectOpts(), make: str("make")!, model: str("model")!, year: Number(str("year")), engine: str("engine"), adapterModel: str("adapter-model"), notes: str("notes") });
        print(r.report);
        console.error(
          r.saved
            ? "Added to profiles/car-reports.json. Send it in with a pull request so others with this car know what works."
            : `Send it in so others with this car know what works (needs a GitHub account):\n${r.sendUrl}`,
        );
        return;
      }
      case "watch": {
        const stop = new AbortController();
        process.once("SIGINT", () => {
          console.error("Stopping…");
          stop.abort();
          process.once("SIGINT", () => process.exit(130)); // a second Ctrl+C doesn't wait
        });
        await watchCar(rt, connectOpts(), { dir: siteDir(FROM_NPM), open: flags["no-open"] !== true, signal: stop.signal, say: (l) => console.error(l) });
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
