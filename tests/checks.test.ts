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
import {
  advanceSteps,
  askOf,
  correlation,
  standardChecks,
  stepCount,
  stepCue,
  stepsDone,
  unverifiedCheck,
  type CarCheck,
  type StepProgress,
} from "@/core/checks";
import { SV } from "@/core/i18n/sv";
import { carName, mergeRuns, parseTestHistory, runsFor, saveCheck, testHistoryFile, type TestRun } from "@/core/test-history";
import type { WatchState } from "@/core/watch";
import { deleteRuns, loadRuns } from "../cli/test-history";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
        for (const s of c.steps ?? []) assert.ok(c.watch.includes(s.channel), `${p.id} ${c.id} has a step on ${s.channel}, which it doesn't watch`);
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

  /** Feed readings (seconds into the check, values) through a check's steps. */
  const walk = (c: CarCheck, readings: [number, Record<string, number>][]) => {
    let p: StepProgress = { at: 0, since: null };
    for (const [t, v] of readings) p = advanceSteps(c, p, v, t);
    return p;
  };

  it("paces the rev test by the revs themselves, not a clock (#47)", () => {
    const revs = find(checks, "revs");
    assert.equal(stepCount(revs), 8, "four revs, up and down");
    const start = stepCue(revs, { at: 0, since: null })!;
    assert.deepEqual([start.say, start.target, start.round, start.rounds], ["Rev up", 2500, 1, 4]);
    // However long it takes: idling for 10 s still says rev up.
    assert.equal(walk(revs, [[0, { rpm: 800 }], [10, { rpm: 820 }]]).at, 0);
    // Up to 2,450 counts as up, then let go until it's back near idle.
    let p = walk(revs, [[0, { rpm: 800 }], [1, { rpm: 1800 }], [2, { rpm: 2450 }]]);
    assert.equal(stepCue(revs, p)!.say, "Let go");
    p = advanceSteps(revs, p, { rpm: 1900 }, 3);
    assert.equal(p.at, 1, "not back yet");
    p = advanceSteps(revs, p, { rpm: 900 }, 4);
    assert.deepEqual([stepCue(revs, p)!.say, stepCue(revs, p)!.round], ["Rev up", 2]);
    assert.equal(advanceSteps(revs, p, { maf: 40 }, 5), p, "a reading without rpm changes nothing");
    // Four revs and it's done, as soon as the fourth is back down.
    const four = Array.from({ length: 4 }, (_, i): [number, Record<string, number>][] => [[i * 3 + 1, { rpm: 2500 }], [i * 3 + 2, { rpm: 850 }]]).flat();
    const end = walk(revs, four);
    assert.ok(stepsDone(revs, end));
    assert.equal(stepCue(revs, end), null);
  });

  it("guides the pedal switches one action at a time, holding each pedal 3 s (#47)", () => {
    const sw = find(td5.checks!, "switches");
    const say = (p: StepProgress) => stepCue(sw, p)?.say;
    let p = walk(sw, [[0, { brake: 0, clutch: 0 }]]);
    assert.equal(say(p), "Press the brake pedal");
    p = advanceSteps(sw, p, { brake: 1, clutch: 0 }, 1);
    assert.deepEqual([p.at, p.since], [0, 1], "pressed: the 3 s hold starts counting");
    assert.equal(stepCue(sw, p)!.hold, 3);
    p = advanceSteps(sw, p, { brake: 0, clutch: 0 }, 2);
    assert.deepEqual([p.at, p.since], [0, null], "let go too soon: press it again");
    p = walk(sw, [[0, { brake: 1 }], [1.5, { brake: 1 }], [3, { brake: 1 }]]);
    assert.equal(say(p), "Let go of it");
    p = advanceSteps(sw, p, { brake: 0, clutch: 0 }, 4);
    assert.equal(say(p), "Now press the clutch pedal");
    p = advanceSteps(sw, p, { brake: 1, clutch: 0 }, 5);
    assert.equal(say(p), "Now press the clutch pedal", "the brake again doesn't count for the clutch");
    p = walk(sw, [[0, { brake: 1 }], [3, { brake: 1 }], [4, { brake: 0 }], [5, { clutch: 1 }], [8, { clutch: 1 }], [9, { clutch: 0 }]]);
    assert.ok(stepsDone(sw, p), "both pedals pressed and let go");
  });

  it("names the part to wiggle: a stored fault's, else the connection by the hardware (#47)", () => {
    const wiggle = find(checks, "wiggle");
    assert.match(askOf(wiggle, { adapter: "kkl", faults: [] }), /KKL cable's connector where it plugs into the car/);
    assert.match(askOf(wiggle, { adapter: "elm327", faults: null }), /the adapter where it plugs into the car/);
    const maf = { id: "P0100", code: "P0100", name: "Air flow circuit" };
    const named = askOf(wiggle, { adapter: "kkl", faults: [maf], faultName: () => "Air flow sensor (P0100)" });
    assert.match(named, /the stored fault names: Air flow sensor \(P0100\)\./);
    assert.ok(!/KKL/.test(named));
    assert.equal(askOf(wiggle), wiggle.ask, "without a car, the general wording");
  });

  it("has Swedish for every step a check shows", () => {
    for (const p of PROFILES.filter((p) => p.checks))
      for (const c of p.checks!) for (const s of c.steps ?? []) assert.ok(s.say in SV, `${p.id} ${c.id}: "${s.say}"`);
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

  it("shows one step at a time on the live view and ends a check with steps after the last (#47)", async () => {
    const rt = new Runtime({ keepAlive: true });
    const cues: (string | undefined)[] = [];
    rt.watch((e) => e.type === "state" && e.state.check && !e.state.check.findings && cues.push(e.state.check.step?.say));
    await call(rt, "connect", { profile: "land-rover-td5" });
    const list = (await call(rt, "list_checks")) as { checks: { id: string; steps?: number; ask: string }[] };
    assert.equal(list.checks.find((c) => c.id === "revs")?.steps, 8);
    assert.match(list.checks.find((c) => c.id === "wiggle")!.ask, /connector where it plugs into the car|stored fault/);
    const revs = (await call(rt, "run_check", { id: "revs", seconds: 1 })) as { steps: { done: number; of: number } };
    assert.equal(revs.steps.of, 8);
    assert.equal(cues[0], "Rev up", "the first step is on screen as the check starts");
    // A person pressing the brake, letting go, then the clutch: the check ends after the last step.
    const inner = rt as unknown as { session: { readGroup: (id: string) => Promise<Record<string, number>> } };
    let n = 0;
    const pedals = [{ brake: 1 }, { brake: 1 }, { brake: 0 }, { clutch: 1 }, { clutch: 1 }, { clutch: 0 }];
    const at = [0, 4, 4.1, 4.2, 8.2, 8.3];
    const t0 = performance.now();
    inner.session.readGroup = async () => {
      // Each reading arrives when the person's timing says, so the 3 s holds take real time: keep them short here.
      const i = Math.min(n++, pedals.length - 1);
      await sleep(Math.max(0, at[i] * 100 - (performance.now() - t0)));
      return { brake: 0, clutch: 0, ...pedals[i] };
    };
    const hold = (rt as unknown as { checksFor: (s: unknown) => CarCheck[] }).checksFor(inner.session).find((c) => c.id === "switches")!;
    for (const s of hold.steps!) if (s.hold) s.hold = 0.3; // the profile's 3 s, scaled down for the test
    try {
      const sw = (await call(rt, "run_check", { id: "switches" })) as { steps: { done: number; of: number }; findings: { verdict: string }[] };
      assert.deepEqual(sw.steps, { done: 4, of: 4 });
      assert.deepEqual(sw.findings.map((f) => f.verdict), ["ok", "ok"]);
      assert.ok(performance.now() - t0 < 5000, "ended after the last step, not the 40 s limit");
      assert.ok(cues.includes("Now press the clutch pedal"));
    } finally {
      for (const s of hold.steps!) if (s.hold) s.hold = 3;
    }
    await call(rt, "disconnect");
  });

  it("keeps the checks done when connecting again to the same car (#47)", async () => {
    const rt = new Runtime({ keepAlive: true });
    await call(rt, "connect", { profile: "land-rover-td5" });
    await call(rt, "run_check", { id: "faults" });
    await call(rt, "run_check", { id: "idle", seconds: 1 });
    // The key went off for the engine-off checks; the agent connects again.
    const again = (await call(rt, "connect", { profile: "land-rover-td5" })) as { checksKept?: string[] };
    assert.deepEqual(again.checksKept, ["faults", "idle"]);
    const list = (await call(rt, "list_checks")) as { checks: { id: string; done: boolean }[] };
    assert.ok(list.checks.find((c) => c.id === "idle")?.done);
    const report = (await call(rt, "test_report", {})) as { results: { id: string }[] };
    assert.deepEqual(report.results.map((r) => r.id), ["faults", "idle"]);
    // Another car starts over.
    const other = (await call(rt, "connect", { profile: "generic-obd2" })) as { checksKept?: string[] };
    assert.equal(other.checksKept, undefined);
    assert.ok(!((await call(rt, "list_checks")) as { checks: { done: boolean }[] }).checks.some((c) => c.done));
    await call(rt, "disconnect");
  });

  it("saves each test run on this computer, under the person's name for the car, and deletes it (#47)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openhood-history-"));
    const file = join(dir, ".openhood", "test-history.json");
    const rt = new Runtime({ keepAlive: true, history: file });
    const inner = rt as unknown as { session: { link: { adapter: string } } };
    const real = () => (inner.session.link.adapter = "kkl"); // the simulator's runs are never saved; pretend a cable
    await call(rt, "connect", { profile: "land-rover-td5", car: "My Defender" });
    await call(rt, "run_check", { id: "faults" });
    assert.ok(!existsSync(file), "nothing saved for the demo car");
    real();
    await call(rt, "run_check", { id: "faults" });
    await call(rt, "run_check", { id: "idle", seconds: 1 });
    await call(rt, "run_check", { id: "idle", seconds: 1 }); // run again: replaces the first
    let runs = loadRuns(file);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].car, "My Defender");
    assert.equal(runs[0].profile, "land-rover-td5");
    assert.deepEqual(runs[0].checks.map((c) => c.id), ["faults", "idle"]);
    assert.ok(runs[0].checks[1].readings.rpm.max > 0, "key readings: min, max, last");
    assert.ok(!JSON.stringify(runs).includes("samples"));
    assert.equal((statSync(file).mode & 0o777).toString(8), "600", "only this user can read it");

    // Another day: a new run, and the earlier one is there to compare with, on the live view too.
    await call(rt, "connect", { profile: "generic-obd2" });
    let shown: WatchState | null = null;
    rt.watch((e) => e.type === "state" && (shown = e.state));
    await call(rt, "connect", { profile: "land-rover-td5", car: "my defender" });
    real();
    const later = (await call(rt, "run_check", { id: "idle", seconds: 1 })) as { findings: unknown[] };
    assert.ok(later.findings.length);
    runs = loadRuns(file);
    assert.equal(runs.length, 2);
    assert.deepEqual(runsFor(runs, "land-rover-td5", "My Defender").map((r) => r.checks.length), [1, 2], "newest first");
    const view = shown as WatchState | null;
    assert.equal(view?.history?.saving, true);
    assert.equal(view?.history?.runs.length, 1, "the earlier run, not today's");
    const history = (await call(rt, "test_history")) as { runs: unknown[]; where: string };
    assert.equal(history.runs.length, 2);
    assert.match(history.where, /this computer only/);

    assert.throws(() => carName("SALLDHMF7XA123456"), /VIN/);
    assert.equal(carName("  My <b>Defender</b>  "), "My b Defender b");
    assert.equal(deleteRuns(file), 2);
    assert.ok(!existsSync(file));
    await call(rt, "disconnect");
    rmSync(dir, { recursive: true, force: true });
  });

  it("merges and checks test history files", () => {
    const run: TestRun = { id: "a", date: "2026-11-27T10:00:00.000Z", car: null, profile: "generic-obd2", adapter: "elm327", checks: [] };
    const check = { id: "idle", title: "Idle", at: run.date, findings: [{ verdict: "ok" as const, text: "Idle steady." }], readings: {} };
    const one = saveCheck([], run, check);
    assert.equal(one[0].checks.length, 1);
    const merged = mergeRuns([{ ...run, checks: [] }], one);
    assert.equal(merged[0].checks.length, 1, "keeps the copy with more checks");
    assert.deepEqual(parseTestHistory(JSON.stringify(testHistoryFile(merged))).runs, merged);
    assert.throws(() => parseTestHistory('{"app":"openhood","kind":"fault-history"}'), /isn't an Openhood test history/);
    assert.throws(() => parseTestHistory(JSON.stringify({ ...testHistoryFile([{ ...run, checks: [{ ...check, findings: [{ verdict: "bad" }] }] } as unknown as TestRun]) })), /damaged/);
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
