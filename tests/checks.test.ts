/**
 * Test checks (core/checks.ts): how each standard check judges what it read, the rev pacer, and
 * the MCP tools that run them on the simulated Td5. The limits are rules of thumb; these tests pin
 * down that the wording follows them, not that a car is healthy.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handle } from "../cli/mcp";
import { Runtime } from "../cli/runtime";
import { sleep, TimeoutError } from "@/core/transport/types";
import { correlation, guideAt, standardChecks, unverifiedCheck, type CarCheck } from "@/core/checks";
import { needsTest, type CarReport } from "@/profiles/car-reports";
import { getProfile, PROFILES } from "@/profiles";

const obd = getProfile("generic-obd2")!;
const td5 = getProfile("land-rover-td5")!;
const find = (checks: CarCheck[], id: string) => checks.find((c) => c.id === id)!;
const verdicts = (c: CarCheck, series: Record<string, number[]>) => c.judge({ series }).map((f) => f.verdict);

describe("test checks", () => {
  const checks = obd.checks!;

  it("every profile with checks has unique ids, plain words and no dashes", () => {
    for (const p of PROFILES.filter((p) => p.checks)) {
      const ids = p.checks!.map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, p.id);
      for (const c of p.checks!) {
        for (const k of c.watch) assert.ok(p.channels.some((ch) => ch.key === k), `${p.id} ${c.id} watches unknown ${k}`);
        assert.ok(c.seconds >= 0 && c.seconds <= 120);
        assert.ok(!/[–—]/.test(c.title + c.ask), c.id);
      }
    }
    assert.deepEqual(td5.checks!.map((c) => c.id), ["faults", "ignition", "idle", "revs", "charging", "wiggle", "warmup", "switches"]);
  });

  it("judges idle steadiness and fuel trims", () => {
    const idle = find(checks, "idle");
    assert.deepEqual(verdicts(idle, { rpm: [790, 800, 810, 805, 795], stft: [1, -1], ltft: [2, 2] }), ["ok", "ok"]);
    assert.deepEqual(verdicts(idle, { rpm: [700, 900, 650, 950, 800], stft: [8, 9], ltft: [6, 7] }), ["look", "look"]);
    assert.deepEqual(verdicts(idle, { rpm: [0, 0, 0] }), ["unclear"]);
  });

  it("says whether readings follow the revs (the Defender's air flow did, r = 0.996)", () => {
    const revs = find(checks, "revs");
    const rpm = [800, 1500, 2500, 1600, 900, 2400, 800, 2500];
    const out = revs.judge({ series: { rpm, maf: rpm.map((r) => r / 50 + 2), throttle: [5, 5, 5, 5, 5, 5, 5, 5] } });
    assert.deepEqual(out.map((f) => f.verdict), ["ok", "look"]);
    assert.match(out[0].text, /r = 1\.00/);
    assert.deepEqual(verdicts(revs, { rpm: [800, 850, 820] }), ["unclear"], "not revved enough");
    assert.equal(correlation([1, 2, 3], [2, 4, 6])?.toFixed(2), "1.00");
    assert.equal(correlation([1, 1, 1], [2, 4, 6]), null);
  });

  it("judges charging, the resting battery and cold sensors", () => {
    const charging = find(checks, "charging");
    assert.deepEqual(verdicts(charging, { voltage: [13.6, 14.2, 14.4], rpm: [800, 820] }), ["ok"]);
    assert.deepEqual(verdicts(charging, { voltage: [12.6, 12.9], rpm: [800] }), ["look"]);
    const ignition = find(td5.checks!, "ignition");
    // The Defender in #25: 11.6 V with the ignition on, three temperatures within 1 °C at 5 °C.
    const out = ignition.judge({ series: { battery: [11.6, 11.6], coolant: [5, 5], airTemp: [5.5], fuelTemp: [4.8], rpm: [0] } });
    assert.deepEqual(out.map((f) => f.verdict), ["look", "ok"]);
    assert.deepEqual(verdicts(ignition, { battery: [12.5], coolant: [5], airTemp: [19], fuelTemp: [5], rpm: [0] }), ["ok", "look"]);
    assert.deepEqual(verdicts(ignition, { battery: [12.5], coolant: [80], airTemp: [40], fuelTemp: [30], rpm: [0] }), ["ok", "unclear"], "warm engine");
  });

  it("finds new faults in the wiggle test and checks the pedal switches", () => {
    const wiggle = find(checks, "wiggle");
    const a = { id: "P0100", code: "P0100", name: "Air flow circuit" };
    assert.deepEqual(wiggle.judge({ series: { rpm: [800, 805] }, faultsBefore: [], faultsAfter: [a] }).map((f) => f.verdict), ["look"]);
    assert.deepEqual(wiggle.judge({ series: { rpm: [800, 805] }, faultsBefore: [a], faultsAfter: [a] }).map((f) => f.verdict), ["ok"]);
    const sw = find(td5.checks!, "switches");
    assert.deepEqual(verdicts(sw, { brake: [0, 1, 1, 0], clutch: [0, 0, 0] }), ["ok", "look"]);
  });

  it("paces the rev test: up for the first half of each period, then down", () => {
    const g = find(checks, "revs").guide!;
    assert.deepEqual(guideAt(g, 0.5), { up: true, target: 2500, text: "Rev to 2,500", next: 2 });
    assert.equal(guideAt(g, 3).up, false);
    assert.equal(guideAt(g, 5.1).up, true);
  });

  it("checks the readings nobody has verified yet, against what they can sensibly be", () => {
    const check = unverifiedCheck(td5.channels)!;
    assert.ok(check.watch.includes("idleError") && !check.watch.includes("rpm"), "only the unverified ones");
    const out = check.judge({ series: { idleError: [-12, 8], fuel: [70], balance1: [1] } });
    const by = (label: string) => out.find((f) => f.text.startsWith(label))!;
    assert.equal(by("Idle speed error").verdict, "ok");
    assert.match(by("Idle speed error").text, /gauge/);
    assert.equal(by("Injected").verdict, "look", "70 mg is past the 60 mg scale");
    assert.equal(by("Pedal supply").verdict, "unclear");
    assert.equal(unverifiedCheck(td5.channels.filter((c) => c.confidence === "verified")), null);
  });

  it("asks for the test until a car has run it and every reading is verified", () => {
    const tested: CarReport = { make: "Land Rover", model: "Defender", year: 1999, profile: "land-rover-td5", adapter: "kkl", protocol: "KWP2000 fast init", result: "worked", date: "2026-11-25", checks: { idle: "ok" } };
    assert.ok(needsTest(td5, [tested]), "the Td5 still has readings to verify");
    const allVerified = { ...td5, channels: td5.channels.filter((c) => c.confidence === "verified") };
    assert.ok(needsTest(allVerified, [{ ...tested, checks: undefined }]), "nobody ran the test");
    assert.ok(!needsTest(allVerified, [tested]));
  });

  it("only uses the channels a profile gives", () => {
    assert.deepEqual(standardChecks([], {}).map((c) => c.id), ["faults"]);
    assert.deepEqual(standardChecks([], { rpm: "rpm" }).map((c) => c.id), ["faults", "idle", "wiggle"]);
  });
});

describe("test checks over MCP", () => {
  const call = async (rt: Runtime, name: string, args: Record<string, unknown> = {}) => {
    const r = (await handle(rt, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    assert.ok(!r.result.isError, r.result.content[0].text);
    return JSON.parse(r.result.content[0].text) as Record<string, unknown>;
  };

  it("lists, runs and reports the Td5's checks, showing each on the live view", async () => {
    const rt = new Runtime({ keepAlive: true });
    const shown: unknown[] = [];
    rt.watch((e) => e.type === "state" && e.state.check && shown.push(e.state.check));
    await call(rt, "connect", { profile: "land-rover-td5" });
    const list = (await call(rt, "list_checks")) as { safety: string; checks: { id: string; engineRunning: boolean }[] };
    assert.match(list.safety, /handbrake/);
    assert.ok(list.checks.findIndex((c) => c.id === "unverified") === list.checks.findIndex((c) => c.id === "idle") + 1, "unverified readings right after idle");
    assert.ok(list.checks.find((c) => c.id === "revs")?.engineRunning);

    const faults = (await call(rt, "run_check", { id: "faults" })) as { findings: { verdict: string; text: string }[] };
    assert.equal(faults.findings[0].verdict, "look", "the simulator has faults stored");
    const idle = (await call(rt, "run_check", { id: "idle", seconds: 2 })) as { findings: { verdict: string }[]; readings: { rpm: { samples: number } } };
    assert.ok(idle.readings.rpm.samples > 3, "only the groups it needs, so many samples");
    assert.ok(shown.some((c) => (c as { findings: unknown }).findings === null), "the live view saw it running");

    const report = (await call(rt, "test_report", { car: "Land Rover Defender 1999 2.5 Td5" })) as { url: string };
    const body = new URL(report.url).searchParams.get("body")!;
    assert.match(body, /\| Idle \| (OK|Look at) \|/);
    assert.match(body, /Codes left out/, "no fault codes unless the person agreed");
    assert.ok(!/Air flow/.test(body));
    assert.ok(!("carReport" in report), "the demo car never goes on the shared list");
    // A real car would be told to run the test first: the Td5 still has readings to verify.
    const inner = rt as unknown as { session: unknown; testAdvice(s: unknown): { recommended: boolean; why: string } };
    const advice = inner.testAdvice(inner.session);
    assert.equal(advice.recommended, true);
    assert.match(advice.why, /Idle speed error/);
    const withCodes = (await call(rt, "test_report", { includeFaults: true })) as { url: string };
    assert.match(new URL(withCodes.url).searchParams.get("body")!, /Air flow/);
    await call(rt, "disconnect");
  });

  // Issue #38: the engine was started during a check, the car stopped answering, and run_check never came back.
  type Inner = {
    session: { readGroup: (id: string) => Promise<unknown>; closeWaitMs: number; link: { request: () => Promise<unknown> } } | null;
    quietMs: number;
  };

  it("ends a check with connection lost when the car stops answering, and connects again for the next", async () => {
    const rt = new Runtime({ keepAlive: true });
    const inner = rt as unknown as Inner;
    inner.quietMs = 300;
    const shown: { status: string; findings: unknown }[] = [];
    rt.watch((e) => e.type === "state" && shown.push({ status: e.state.status, findings: e.state.check?.findings ?? null }));
    await call(rt, "connect", { profile: "land-rover-td5" });
    const read = inner.session!.readGroup.bind(inner.session);
    let reads = 0;
    // Answers for a moment, then no echo from the cable (what cranking did to it).
    inner.session!.readGroup = (id) => (++reads > 5 ? Promise.reject(new TimeoutError(4, 0)) : read(id));
    const t0 = performance.now();
    const idle = (await call(rt, "run_check", { id: "idle" })) as { connectionLost: boolean; findings: { verdict: string; text: string }[]; readings: { rpm?: unknown }; next: string };
    assert.ok(performance.now() - t0 < 3000, "ends soon after the car goes quiet, not after the check's 30 s");
    assert.equal(idle.connectionLost, true);
    assert.equal(idle.findings[0].verdict, "unclear");
    assert.match(idle.findings[0].text, /stopped answering/);
    assert.ok(idle.readings.rpm, "what it read before is kept");
    const last = shown[shown.length - 1];
    assert.equal(last.status, "lost", "the live view says the car is gone");
    assert.ok(last.findings, "and keeps the check on screen with what it found");

    const again = (await call(rt, "run_check", { id: "idle", seconds: 1 })) as { connectionLost?: boolean; findings: { verdict: string }[] };
    assert.ok(!again.connectionLost, "the next run_check connected again first");
    await call(rt, "disconnect");
  });

  it("never waits forever for a read that doesn't come back", async () => {
    const rt = new Runtime({ keepAlive: true });
    const inner = rt as unknown as Inner;
    inner.quietMs = 300;
    await call(rt, "connect", { profile: "land-rover-td5" });
    inner.session!.closeWaitMs = 200;
    inner.session!.link.request = () => new Promise(() => {}); // a write the cable never finishes, holding the queue
    const t0 = performance.now();
    const idle = (await call(rt, "run_check", { id: "idle" })) as { connectionLost: boolean };
    assert.equal(idle.connectionLost, true);
    await call(rt, "disconnect");
    assert.ok(performance.now() - t0 < 3000, `${Math.round(performance.now() - t0)} ms`);
  });

  it("stops a running check at once on disconnect", async () => {
    const rt = new Runtime({ keepAlive: true });
    await call(rt, "connect", { profile: "land-rover-td5" });
    const t0 = performance.now();
    const running = handle(rt, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "run_check", arguments: { id: "idle" } } });
    await sleep(200);
    await rt.disconnect();
    const r = (await running) as { result: { content: { text: string }[]; isError?: boolean } };
    assert.ok(r.result.isError);
    assert.match(r.result.content[0].text, /stopped/);
    assert.ok(performance.now() - t0 < 3000, "not after the check's 30 s");
  });
});
