import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyKey, mergeHistory } from "@/core/history";

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
});
