/** Land Rover Discovery 2 airbag: the published fault reads, the request frame, a session. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import type { TrafficEvent } from "@/core/link/types";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { PROFILES } from "@/profiles";
import { landRoverSrs, parseSrsFaults } from "@/profiles/land-rover-srs";

describe("Land Rover airbag (Discovery 2)", () => {
  it("reads the published answer 61 02 90 04 90 16 00 00 as codes 004 and 022", () => {
    const faults = parseSrsFaults([0x61, 0x02, 0x90, 0x04, 0x90, 0x16, 0x00, 0x00]);
    assert.deepEqual(faults.map((f) => f.id), ["SRS-004", "SRS-022"]);
    assert.match(faults[1].name, /seat belt tensioner/);
  });

  it("leaves out the unexplained 90 00 record from the second car (61 02 90 04 90 00)", () => {
    assert.deepEqual(parseSrsFaults([0x61, 0x02, 0x90, 0x04, 0x90, 0x00]).map((f) => f.id), ["SRS-004"]);
  });

  it("names codes no source explains by their number", () => {
    assert.deepEqual(parseSrsFaults([0x61, 0x02, 0x90, 0x0c]), [{ id: "SRS-012", code: "SRS-012", name: "Airbag fault 012" }]);
  });

  it("wakes the module at 5B, opens session 81 and sends the read as 82 5B F7 21 02 F7", async () => {
    const log: TrafficEvent[] = [];
    const s = new Session(landRoverSrs, new SimulatedTransport(landRoverSrs), (e) => log.push(e));
    await s.connect();
    assert.equal(s.init?.kind, "slow");
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["SRS-004", "SRS-022"]);
    const sent = log.filter((e) => e.dir === "tx").map((e) => Array.from(e.bytes));
    assert.ok(sent.some((b) => b.join() === [0x82, 0x5b, 0xf7, 0x10, 0x81, 0x65].join()), "session request");
    assert.ok(sent.some((b) => b.join() === [0x82, 0x5b, 0xf7, 0x21, 0x02, 0xf7].join()), "fault read");
    await s.disconnect();
  });

  it("only reads: no clearing", () => {
    assert.equal(landRoverSrs.faults?.clear, undefined);
    assert.equal(landRoverSrs.faults?.safetySystem, true);
  });

  it("is offered next to the engine and SLABS for a Discovery 2", () => {
    const ids = matches(PROFILES, "Land Rover", "Discovery 2", 2002).map((m) => m.profile.id);
    for (const id of ["land-rover-td5", "land-rover-slabs", "land-rover-srs"]) assert.ok(ids.includes(id), id);
  });
});
