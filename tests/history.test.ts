import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildExport, combineHistories, historyKey, mergeHistory, parseExport } from "@/core/history";

const DAY = 24 * 3600 * 1000;
const t0 = new Date(2026, 10, 1, 12).getTime();

describe("fault history", () => {
  it("adds new faults and counts days, not reads", () => {
    let h = mergeHistory([], [{ id: "P0171", code: "P0171", name: "lean" }], t0);
    h = mergeHistory(h, [{ id: "P0171", code: "P0171", name: "lean" }], t0 + 1000); // same day
    assert.equal(h[0].daysSeen, 1);
    h = mergeHistory(h, [{ id: "P0171", code: "P0171", name: "lean" }], t0 + 2 * DAY);
    assert.equal(h[0].daysSeen, 2);
    assert.equal(h[0].firstSeen, t0);
    assert.equal(h[0].lastSeen, t0 + 2 * DAY);
  });

  it("tracks pending-only faults until they are confirmed", () => {
    let h = mergeHistory([], [{ id: "P0130", name: "o2" }], t0, true);
    assert.equal(h[0].pendingOnly, true);
    h = mergeHistory(h, [{ id: "P0130", name: "o2" }], t0 + DAY);
    assert.equal(h[0].pendingOnly, false);
    h = mergeHistory(h, [{ id: "P0130", name: "o2" }], t0 + 2 * DAY, true);
    assert.equal(h[0].pendingOnly, false, "once confirmed, stays confirmed");
  });

  it("sorts most recent first and does not mutate its input", () => {
    const a = mergeHistory([], [{ id: "A", name: "a" }], t0);
    const b = mergeHistory(a, [{ id: "B", name: "b" }], t0 + DAY);
    assert.deepEqual(b.map((e) => e.id), ["B", "A"]);
    assert.equal(a.length, 1);
  });

  it("makes one key per car", () => {
    assert.equal(historyKey(["land-rover-td5", "Land Rover", "Defender", 1999]), "openhood.history.land-rover-td5|Land Rover|Defender|1999");
    assert.equal(historyKey(["generic-obd2", undefined]), "openhood.history.generic-obd2");
  });

  it("combines two histories of the same car without losing anything", () => {
    const a = mergeHistory([], [{ id: "P0171", name: "lean" }], t0);
    const b = mergeHistory(mergeHistory([], [{ id: "P0171", name: "lean" }], t0 + DAY), [{ id: "P0420", name: "cat" }], t0 + 3 * DAY);
    b[1].daysSeen = 4;
    const c = combineHistories(a, b);
    const p0171 = c.find((e) => e.id === "P0171")!;
    assert.equal(p0171.firstSeen, t0);
    assert.equal(p0171.lastSeen, t0 + DAY);
    assert.equal(p0171.daysSeen, 4);
    assert.equal(c[0].id, "P0420");
  });

  it("round-trips an export and rejects other files", () => {
    const cars = { [historyKey(["generic-obd2"])]: mergeHistory([], [{ id: "P0171", code: "P0171", name: "lean" }], t0) };
    const text = JSON.stringify(buildExport(cars, new Date(t0)));
    assert.deepEqual(parseExport(text).cars, cars);
    assert.throws(() => parseExport("not json"), /isn't an Openhood/);
    assert.throws(() => parseExport(JSON.stringify({ app: "other" })), /isn't an Openhood/);
    assert.throws(() => parseExport(JSON.stringify({ ...buildExport(cars), version: 2 })), /newer version/);
    assert.throws(() => parseExport(JSON.stringify(buildExport({ "openhood.history.x": [{ id: 1 }] as never }))), /damaged/);
  });
});
