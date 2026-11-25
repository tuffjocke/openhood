import { existsSync } from "node:fs";
import { sleep } from "../core/transport/types";
import { CMD, FROM_NPM } from "./command";
import { UserError, type ConnectOptions, type Runtime } from "./runtime";
import { openInBrowser, startWatchServer } from "./watch-server";

/** How long each read lasts before checking for Ctrl+C, and the wait before trying a silent car again. */
const READ_SECONDS = 2;
const RETRY_MS = 5000;

/**
 * `openhood watch`: the live view without an agent or MCP setup. Opens the page, connects, reads
 * the faults once, then keeps reading live values until `signal` aborts (Ctrl+C). A car that stops
 * answering is connected again every few seconds; a port that can't be opened ends it.
 */
export async function watchCar(
  rt: Runtime,
  car: ConnectOptions,
  o: { dir: string; open: boolean; signal: AbortSignal; say: (line: string) => void },
) {
  if (!existsSync(o.dir))
    throw new UserError(FROM_NPM ? "This copy of openhood has no live view page." : `No live view page yet: run "npm run build:npm" once, then ${CMD} watch again.`);
  const view = await startWatchServer(rt, { dir: o.dir });
  rt.liveView = view.url;
  o.say(`Live view: ${view.url}`);
  if (o.open) openInBrowser(view.url);
  let connected = false;
  try {
    while (!o.signal.aborted) {
      try {
        if (!connected) {
          await rt.connect(car);
          connected = true;
          o.say("Connected. Reading until you press Ctrl+C.");
          await rt.faults({ pending: true });
        }
        await rt.live({ seconds: READ_SECONDS });
      } catch (e) {
        if (e instanceof UserError) throw e;
        const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
        if (/cannot open|no such file|permission denied|access denied|port not open|resource busy/i.test(msg))
          throw new UserError(`Couldn't open ${car.port}: ${msg}. Is another program using it? Check the port with: ${CMD} ports`);
        o.say(`${connected ? "Lost the car" : "No answer"} (${msg}). Trying again in ${RETRY_MS / 1000} s.`);
        connected = false;
        await rt.disconnect().catch(() => {});
        await Promise.race([sleep(RETRY_MS), new Promise((r) => o.signal.addEventListener("abort", r, { once: true }))]);
      }
    }
  } finally {
    // StopCommunication, so the next connect isn't refused (a Td5 keeps an open session).
    await rt.disconnect().catch(() => {});
    await view.close();
  }
}
