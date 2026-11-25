import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handle, TOOLS } from "../cli/mcp";
import { Runtime } from "../cli/runtime";

const call = async (rt: Runtime, id: number, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handle(rt, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })) as {
    result: { content: { text: string }[]; isError?: boolean };
  };
  return { text: r.result.content[0].text, isError: !!r.result.isError };
};

describe("MCP server", () => {
  it("answers initialize and lists its tools", async () => {
    const rt = new Runtime();
    const init = (await handle(rt, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })) as {
      result: { protocolVersion: string; capabilities: { tools: object } };
    };
    assert.equal(init.result.protocolVersion, "2025-06-18");
    assert.ok(init.result.capabilities.tools);
    assert.equal(await handle(rt, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
    const list = (await handle(rt, { jsonrpc: "2.0", id: 2, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    assert.deepEqual(list.result.tools.map((t) => t.name), TOOLS.map((t) => t.name));
  });

  it("reads faults from the simulator through a simulated ELM327 on CAN", async () => {
    const rt = new Runtime();
    assert.equal((await call(rt, 3, "connect", { profile: "generic-obd2", simulateElmCan: true })).isError, false);
    const faults = JSON.parse((await call(rt, 4, "read_faults")).text) as { stored: { code: string; urgency: string }[] };
    assert.ok(faults.stored.some((f) => f.code === "P0171" && f.urgency === "soon"));
    const raw = JSON.parse((await call(rt, 5, "request", { hex: "01 0C" })).text) as { answers: string[] };
    assert.match(raw.answers[0], /^41 0C/);
    await call(rt, 6, "disconnect");
  });

  it("refuses writes and needs a yes to clear", async () => {
    const rt = new Runtime();
    await call(rt, 7, "connect", { profile: "generic-obd2" });
    const write = await call(rt, 8, "request", { hex: "2E 01 02" });
    assert.equal(write.isError, true);
    assert.match(write.text, /only sends read requests/);
    const noYes = await call(rt, 9, "clear_faults", { confirm: false });
    assert.equal(noYes.isError, true);
    const yes = JSON.parse((await call(rt, 10, "clear_faults", { confirm: true })).text) as { nowStored: string[] };
    assert.deepEqual(yes.nowStored, []);
    await call(rt, 11, "disconnect");
  });

  it("says what to do when not connected", async () => {
    const r = await call(new Runtime(), 12, "read_faults");
    assert.equal(r.isError, true);
    assert.match(r.text, /connect first/);
  });

  it("keeps a K-line session open between tool calls, and connects again if the car drops it", async () => {
    const rt = new Runtime({ keepAlive: true });
    await call(rt, 13, "connect", { profile: "land-rover-td5" });
    // Idle for a while: the server reads something by itself, but the agent's traffic leaves it out.
    await new Promise((r) => setTimeout(r, 2600));
    assert.ok(rt.trafficLines(500, { keepAlive: true }).some((l) => l.includes("(keep-alive)")), "a keep-alive was sent");
    assert.ok(!rt.trafficLines(500).some((l) => l.includes("keep-alive")), "and hidden from the agent's traffic");

    // The ECU forgets the session (a Td5 does after a few seconds of silence) and stays quiet until woken again.
    const transport = (rt as unknown as { session: { link: { transport: { ecu: unknown } } } }).session.link.transport;
    transport.ecu = null;
    const live = await call(rt, 14, "read_live");
    assert.equal(live.isError, false, live.text);
    assert.ok((JSON.parse(live.text) as { rpm?: { last: number } }).rpm, "read after connecting again");
    assert.ok(rt.trafficLines(500).some((l) => l.includes("connecting again")));
    await call(rt, 15, "disconnect");
  });

  it("tells the agent when npm has a newer openhood", async () => {
    const { isNewer } = await import("../cli/update-check");
    assert.ok(isNewer("0.1.12", "0.1.10") && isNewer("0.2.0", "0.1.12") && isNewer("1.0.0", "0.9.9"));
    assert.ok(!isNewer("0.1.10", "0.1.10") && !isNewer("0.1.9", "0.1.10"));
    const rt = new Runtime();
    rt.update = { running: "0.1.10", latest: "0.1.12" };
    const r = JSON.parse((await call(rt, 16, "connect", { profile: "generic-obd2" })).text) as { update?: { latest: string; how: string } };
    assert.equal(r.update?.latest, "0.1.12");
    assert.match(r.update!.how, /npx -y openhood@latest mcp/);
    await call(rt, 17, "disconnect");
  });
});
