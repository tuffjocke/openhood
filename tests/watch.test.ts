/**
 * The MCP server's live view (cli/watch-server.ts): it streams what the runtime reads, serves the
 * site, takes the page's test commands, and stays private (127.0.0.1, its own Host only, no way out
 * of the site folder, commands only from its own page with the stream's token, all read-only).
 * Also `openhood watch` (cli/watch-car.ts), the same page without an agent.
 */
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Runtime } from "../cli/runtime";
import { watchCar } from "../cli/watch-car";
import { browserCommand, startWatchServer, type WatchServer } from "../cli/watch-server";
import type { WatchEvent } from "../core/watch";

/** A raw HTTP request, so the test can set Host and send paths fetch would tidy up. */
function get(port: number, path: string, o: { method?: string; host?: string } = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: o.method ?? "GET", headers: { host: o.host ?? `127.0.0.1:${port}` } }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

/** Post a command the way the page does, or with any part of that missing or wrong. */
function post(port: number, body: string, o: { origin?: string | null; token?: string | null; type?: string } = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, "content-type": o.type ?? "application/json" };
    const origin = o.origin === undefined ? `http://127.0.0.1:${port}` : o.origin;
    if (origin) headers.origin = origin;
    if (o.token) headers["x-openhood-token"] = o.token;
    const req = request({ host: "127.0.0.1", port, path: "/command", method: "POST", headers }, (res) => {
      let text = "";
      res.on("data", (d) => (text += d));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** Read the event stream and hand out events as they come. */
async function stream(url: string) {
  const ac = new AbortController();
  const res = await fetch(url, { signal: ac.signal });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  assert.equal(res.headers.get("access-control-allow-origin"), null, "no other website may read it");
  const reader = res.body!.getReader();
  const queue: WatchEvent[] = [];
  let buf = "";
  /** The next event matching `ok`, skipping the rest. */
  async function next(ok: (e: WatchEvent) => boolean = () => true): Promise<WatchEvent> {
    for (;;) {
      const i = queue.findIndex(ok);
      if (i >= 0) return queue.splice(0, i + 1).at(-1)!;
      queue.length = 0;
      const { value, done } = await reader.read();
      if (done) throw new Error("stream ended");
      buf += new TextDecoder().decode(value);
      const parts = buf.split("\n\n");
      buf = parts.pop()!;
      for (const p of parts) if (p.startsWith("data: ")) queue.push(JSON.parse(p.slice(6)) as WatchEvent);
    }
  }
  return { next, close: () => ac.abort() };
}

describe("live view", () => {
  const rt = new Runtime();
  let view: WatchServer;
  let port: number;

  before(async () => {
    const dir = mkdtempSync(join(tmpdir(), "openhood-site-"));
    mkdirSync(join(dir, "watch"));
    writeFileSync(join(dir, "watch", "index.html"), "<p>watch page</p>");
    view = await startWatchServer(rt, { dir, port: 48_700 });
    port = Number(new URL(view.url).port);
    rt.liveView = view.url;
  });
  after(async () => {
    await rt.disconnect();
    await view.close();
  });

  it("serves the page on 127.0.0.1 and sends / to it", async () => {
    assert.match(view.url, /^http:\/\/127\.0\.0\.1:487\d\d\/watch\/$/);
    const page = await get(port, "/watch/");
    assert.equal(page.status, 200);
    assert.match(page.body, /watch page/);
    assert.equal((await get(port, "/")).headers.location, "/watch/");
    assert.equal((await get(port, "/watch")).headers.location, "/watch/");
  });

  it("takes nothing but test commands, and answers nobody else", async () => {
    assert.equal((await get(port, "/events", { method: "POST" })).status, 405);
    assert.equal((await get(port, "/events", { host: "evil.example" })).status, 403, "DNS rebinding: another name for this address");
    assert.equal((await get(port, "/events", { host: `evil.example:${port}` })).status, 403);
    assert.equal((await get(port, "/watch/", { host: `localhost:${port}` })).status, 200);
    for (const path of ["/../package.json", "/..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/package.json", "/watch/..%5c..%5cpackage.json"])
      assert.equal((await get(port, path)).status, 404, path);
  });

  it("streams what the agent reads: connect, values, faults, disconnect", async () => {
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const first = await s.next((e) => e.type === "state");
    assert.ok(first.type === "state" && first.state.status === "idle", "starts with the state so far");

    const answer = await rt.connect({ profile: "land-rover-td5" });
    assert.equal(answer.liveView, view.url, "connect hands the agent the link");
    assert.ok((await s.next((e) => e.type === "state" && e.state.status === "connecting")).type === "state");
    const live = await s.next((e) => e.type === "state" && e.state.status === "connected");
    assert.ok(live.type === "state" && live.state.profileId === "land-rover-td5" && live.state.adapter === "simulator");
    assert.ok(live.type === "state" && live.traffic.some((l) => l.includes("81 13 F7 81 0C")), "traffic so far");

    await rt.live();
    const values = await s.next((e) => e.type === "values" && "rpm" in e.values);
    assert.ok(values.type === "values" && values.values.rpm > 0);
    assert.ok(values.type === "values" && !("ambientKpa" in values.values), "only the profile's channels, not its working state");
    assert.ok((await s.next((e) => e.type === "traffic")).type === "traffic");

    await rt.faults();
    const faults = await s.next((e) => e.type === "faults");
    assert.ok(faults.type === "faults" && faults.faults.length > 0);

    await rt.disconnect();
    const idle = await s.next((e) => e.type === "state");
    assert.ok(idle.type === "state" && idle.state.status === "idle" && idle.state.faults?.length, "what was read stays on the page");
    s.close();
  });

  it("takes test commands only from its own page, with the stream's token", async () => {
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const control = await s.next();
    assert.ok(control.type === "control" && /^[0-9a-f]{32}$/.test(control.token), "the token comes first, on the stream only");
    const token = control.token;
    const run = JSON.stringify({ action: "run", id: "faults" });
    assert.equal((await post(port, run, { token, origin: null })).status, 403, "no Origin: not a page");
    assert.equal((await post(port, run, { token, origin: "https://evil.example" })).status, 403, "another website");
    assert.equal((await post(port, run, { token: null })).status, 403, "no token");
    assert.equal((await post(port, run, { token: "0".repeat(32) })).status, 403, "wrong token");
    assert.equal((await post(port, run, { token, type: "text/plain" })).status, 415, "a form or a beacon can't send JSON");
    for (const bad of ["{", JSON.stringify({ action: "clear" }), JSON.stringify({ action: "run", id: "../x" }), JSON.stringify({ action: "request", hex: "14 FF 00" })])
      assert.equal((await post(port, bad, { token })).status, 400, bad);
    assert.equal((await post(port, run, { token })).status, 409, "not connected yet");
    s.close();
  });

  it("runs Openhood's test from the page: start, findings, skip, stop, reconnect", async () => {
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const control = await s.next();
    const token = control.type === "control" ? control.token : "";
    const send = (c: object) => post(port, JSON.stringify(c), { token });
    await rt.connect({ profile: "land-rover-td5" });
    const ready = await s.next((e) => e.type === "state" && e.state.status === "connected");
    assert.ok(ready.type === "state" && ready.state.test?.steps[0].id === "faults" && ready.state.test.steps.every((x) => x.result === null), "the steps, none done");
    assert.match(ready.type === "state" ? ready.state.test!.safety : "", /handbrake/);

    assert.equal((await send({ action: "run", id: "faults" })).status, 202, "answers at once");
    const done = await s.next((e) => e.type === "state" && !!e.state.check?.findings);
    assert.ok(done.type === "state" && done.state.test?.steps[0].result === "look", "the simulator has faults stored");
    assert.equal((rt.listChecks().checks[0] as { done: boolean }).done, true, "the agent sees it done too");

    assert.equal((await send({ action: "skip", id: "ignition" })).status, 202);
    const skipped = await s.next((e) => e.type === "state" && e.state.test?.steps[1].result === "skipped");
    assert.ok(skipped.type === "state");

    assert.equal((await send({ action: "run", id: "idle" })).status, 202);
    await s.next((e) => e.type === "state" && e.state.check?.id === "idle" && !e.state.check.findings);
    assert.equal((await send({ action: "run", id: "revs" })).status, 409, "one check at a time");
    assert.throws(() => rt.runCheck("revs"), /already running/, "for the agent too");
    assert.equal((await send({ action: "stop" })).status, 202);
    const stopped = await s.next((e) => e.type === "state" && e.state.check === null);
    assert.ok(stopped.type === "state" && stopped.state.test?.steps.find((x) => x.id === "idle")?.result === null, "a stopped check isn't done");

    assert.equal((await send({ action: "reconnect" })).status, 202);
    await s.next((e) => e.type === "state" && e.state.status === "connecting");
    const back = await s.next((e) => e.type === "state" && e.state.status === "connected");
    assert.ok(back.type === "state" && back.state.test?.steps[0].result === "look", "results survive a reconnect");
    s.close();
    await rt.disconnect();
  });

  it("knows how to open the browser on each platform", () => {
    const url = "http://127.0.0.1:4848/watch/";
    assert.deepEqual(browserCommand("darwin", url), ["open", [url]]);
    assert.deepEqual(browserCommand("linux", url), ["xdg-open", [url]]);
    assert.deepEqual(browserCommand("win32", url), ["cmd", ["/c", "start", '""', url]], "an empty title, or start takes the url as one");
  });

  it("starts a late page with everything read so far", async () => {
    await rt.connect({ profile: "land-rover-td5" });
    await rt.live();
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const first = await s.next((e) => e.type === "state");
    assert.ok(first.type === "state" && first.state.status === "connected" && first.state.values.rpm !== undefined);
    s.close();
    await rt.disconnect();
  });
});

describe("openhood watch", () => {
  it("shows the car without an agent: connects, reads faults and values, stops on Ctrl+C", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openhood-site-"));
    const rt = new Runtime({ keepAlive: true });
    const stop = new AbortController();
    const seen: WatchEvent["type"][] = [];
    let status = "";
    rt.watch((e) => {
      seen.push(e.type);
      if (e.type === "state") status = e.state.status;
      if (e.type === "values") stop.abort(); // a reading reached the page: enough
    });
    const said: string[] = [];
    await watchCar(rt, { profile: "land-rover-td5" }, { dir, open: false, signal: stop.signal, say: (l) => said.push(l) });
    assert.match(said[0], /^Live view: http:\/\/127\.0\.0\.1:\d+\/watch\/$/);
    assert.ok(said.some((l) => l.startsWith("Connected")));
    assert.ok(seen.includes("faults") && seen.includes("values"));
    assert.equal(status, "idle", "disconnected at the end");
  });

  it("says how to build the page in a clone", async () => {
    const car = watchCar(new Runtime(), { profile: "land-rover-td5" }, { dir: join(tmpdir(), "openhood-no-site"), open: false, signal: new AbortController().signal, say: () => {} });
    await assert.rejects(car, /npm run build:npm/);
  });
});
