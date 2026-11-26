import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommand, TOKEN_HEADER, WATCH_COMMAND, WATCH_EVENTS, WATCH_PAGE } from "../core/watch";
import { UserError, type Runtime } from "./runtime";

/**
 * The live view: a web server on this computer only (127.0.0.1) that shows what the MCP server
 * reads, while an agent works. It serves the website's static build, one event stream of
 * readings, faults and traffic (core/watch.ts), and takes the page's few test commands (run, skip
 * or stop a check, reconnect: all read-only, issue #37). It answers only requests addressed to
 * itself (the Host header), so another website can't reach it through a DNS trick, and sends no
 * CORS headers, so other websites can't read the stream. A command needs this page's own Origin,
 * a JSON body (which another site can't send without asking first, and it isn't answered) and the
 * token that only the stream hands out.
 */

export const WATCH_PORT = 4848;
const TRIES = 10; // 4848 to 4857, for a second agent on the same computer
const HEARTBEAT_MS = 15_000;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export interface WatchServer {
  url: string;
  close(): Promise<void>;
}

/** Start the live view for `rt`, serving the site in `dir`. Tries the next port if one is taken. */
export async function startWatchServer(rt: Runtime, o: { dir: string; port?: number }): Promise<WatchServer> {
  const first = o.port ?? WATCH_PORT;
  for (let port = first; port < first + TRIES; port++) {
    const token = randomBytes(16).toString("hex");
    const server = createServer((req, res) => handle(rt, o.dir, port, token, req, res));
    try {
      await listen(server, port);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EADDRINUSE" && port + 1 < first + TRIES) continue;
      throw e;
    }
    // Open event streams would keep close() waiting forever.
    const close = () => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve())));
    return { url: `http://127.0.0.1:${port}${WATCH_PAGE}`, close };
  }
  throw new Error("No free port for the live view");
}

function listen(server: Server, port: number) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => (server.off("error", reject), resolve()));
  });
}

/** The command that opens `url` in the person's default browser on this platform. */
export function browserCommand(platform: NodeJS.Platform, url: string): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  if (platform === "win32") return ["cmd", ["/c", "start", '""', url]]; // the empty title keeps start from eating the url
  return ["xdg-open", [url]];
}

/** Open the live view in the browser. Best effort: no browser (a server, SSH) just means no window. */
export function openInBrowser(url: string) {
  try {
    const [cmd, args] = browserCommand(process.platform, url);
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, windowsVerbatimArguments: process.platform === "win32" });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

/** The site the live view serves: next to the bundle in the npm package, the same build in a clone. */
export function siteDir(fromNpm: boolean) {
  return fileURLToPath(new URL(fromNpm ? "./site/" : "../dist/npm/site/", import.meta.url));
}

function handle(rt: Runtime, dir: string, port: number, token: string, req: IncomingMessage, res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const host = req.headers.host ?? "";
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return plain(res, 403, "Open the live view at the link the agent gave you.");
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    return plain(res, 400, "Bad address.");
  }
  if (req.method === "POST" && path === WATCH_COMMAND) return command(rt, port, token, req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return plain(res, 405, "The live view only takes test commands.");
  if (path === WATCH_EVENTS) return events(rt, token, req, res);
  if (path === "/") return redirect(res, WATCH_PAGE);
  return file(dir, path, res);
}

function events(rt: Runtime, token: string, req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
  res.write(`data: ${JSON.stringify({ type: "control", token })}\n\n`);
  const stop = rt.watch((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
  const beat = setInterval(() => res.write(": still here\n\n"), HEARTBEAT_MS);
  req.on("close", () => (clearInterval(beat), stop()));
}

/** One test command from the page: only from this page (Origin), as JSON, with the stream's token. */
function command(rt: Runtime, port: number, token: string, req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) return plain(res, 403, "Only the live view page can send commands.");
  if (req.headers[TOKEN_HEADER.toLowerCase()] !== token) return plain(res, 403, "Reload the live view.");
  if (!/^application\/json\b/.test(req.headers["content-type"] ?? "")) return plain(res, 415, "Send JSON.");
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (d: string) => {
    body += d;
    if (body.length > 1024) req.destroy(); // a command is a few words
  });
  req.on("end", () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return plain(res, 400, "Not a command.");
    }
    const c = parseCommand(parsed);
    if (!c) return plain(res, 400, "Not a command.");
    try {
      rt.command(c);
      res.writeHead(202, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      plain(res, e instanceof UserError ? 409 : 500, e instanceof Error ? e.message : String(e));
    }
  });
}

function file(dir: string, path: string, res: ServerResponse) {
  const root = normalize(dir.endsWith(sep) ? dir : dir + sep);
  let p = normalize(join(root, path));
  if (!p.startsWith(root)) return plain(res, 404, "Not found.");
  if (existsSync(p) && statSync(p).isDirectory()) {
    // The site is built with trailing slashes: /watch/ is watch/index.html.
    if (!path.endsWith("/")) return redirect(res, `${path}/`);
    p = join(p, "index.html");
  }
  if (!existsSync(p)) {
    if (path === WATCH_PAGE && !existsSync(root))
      return plain(res, 404, "The live view page isn't built. In a clone of the repository, run: npm run build:npm");
    return plain(res, 404, "Not found.");
  }
  const type = TYPES[extname(p)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": type.startsWith("text/html") ? "no-store" : "max-age=3600" });
  res.end(readFileSync(p));
}

function redirect(res: ServerResponse, to: string) {
  // Only within this server: "//host" would send the browser elsewhere.
  if (!to.startsWith("/") || to.startsWith("//")) return plain(res, 404, "Not found.");
  res.writeHead(302, { Location: to });
  res.end();
}

function plain(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text + "\n");
}
