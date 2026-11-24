/**
 * The MCP server's live view (cli/watch-server.ts): it streams what the runtime reads, serves the
 * site, and stays read-only and private (127.0.0.1, its own Host only, no way out of the site folder).
 */
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Runtime } from "../cli/runtime";
import { startWatchServer, type WatchServer } from "../cli/watch-server";
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

  it("is read-only and answers nobody else", async () => {
    assert.equal((await get(port, "/events", { method: "POST" })).status, 405);
    assert.equal((await get(port, "/events", { host: "evil.example" })).status, 403, "DNS rebinding: another name for this address");
    assert.equal((await get(port, "/events", { host: `evil.example:${port}` })).status, 403);
    assert.equal((await get(port, "/watch/", { host: `localhost:${port}` })).status, 200);
    for (const path of ["/../package.json", "/..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/package.json", "/watch/..%5c..%5cpackage.json"])
      assert.equal((await get(port, path)).status, 404, path);
  });

  it("streams what the agent reads: connect, values, faults, disconnect", async () => {
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const first = await s.next();
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

  it("starts a late page with everything read so far", async () => {
    await rt.connect({ profile: "land-rover-td5" });
    await rt.live();
    const s = await stream(`http://127.0.0.1:${port}/events`);
    const first = await s.next();
    assert.ok(first.type === "state" && first.state.status === "connected" && first.state.values.rpm !== undefined);
    s.close();
    await rt.disconnect();
  });
});
