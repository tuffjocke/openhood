/**
 * BMW DS2: framing known answers from E46M3-Monitoring's FS_LESEN frames, the fault layout rule
 * from BMW Scanner 1.4 over WebUSB, and a session against the simulator.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { ds2Frame, parseDs2Frame } from "@/core/link/ds2";
import { checkReadOnly } from "@/core/safety";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { PROFILES } from "@/profiles";
import { bmwDs2, parseDs2Faults } from "@/profiles/bmw-ds2";

describe("BMW DS2", () => {
  it("builds the fault memory requests E46M3-Monitoring lists: 12 05 04 00 13 and 12 05 04 01 12", () => {
    assert.deepEqual(Array.from(ds2Frame([0x12, 0x04, 0x00])), [0x12, 0x05, 0x04, 0x00, 0x13]);
    assert.deepEqual(Array.from(ds2Frame([0x12, 0x04, 0x01])), [0x12, 0x05, 0x04, 0x01, 0x12]);
    assert.deepEqual(Array.from(ds2Frame([0x46, 0x00])), [0x46, 0x04, 0x00, 0x42]);
    assert.deepEqual(parseDs2Frame([0x12, 0x05, 0x04, 0x00, 0x13]), [0x12, 0x04, 0x00]);
    assert.equal(parseDs2Frame([0x12, 0x05, 0x04, 0x00, 0x14]), null, "a bad checksum is refused");
  });

  it("splits fault entries by the answer's own size, as measured on an E46 (3 and 14 bytes, zero padding)", () => {
    // Steering angle sensor style: three entries of three bytes, then six zeros of padding.
    assert.deepEqual(parseDs2Faults([0xa0, 3, 0x0b, 0x00, 0xaf, 0x1c, 0x44, 0x01, 0x20, 0x00, 0x30, 0, 0, 0, 0, 0, 0]), [0x0b, 0x1c, 0x20]);
    const fourteen = (c: number) => [c, 0, 0x44, ...Array(10).fill(0), 0x01];
    assert.deepEqual(parseDs2Faults([0xa0, 2, ...fourteen(0x1c), ...fourteen(0x2a)]), [0x1c, 0x2a]);
    assert.deepEqual(parseDs2Faults([0xa0, 0]), []);
  });

  it("reads every module that answers and skips the rest", async () => {
    const s = new Session(bmwDs2, new SimulatedTransport(bmwDs2));
    await s.connect();
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["SRS-06", "IKE-1C", "IKE-2A"]);
    await s.disconnect();
  });

  it("only lets tools read, never raw memory", () => {
    assert.ok(checkReadOnly([0x12, 0x04, 0x01], "ds2").ok);
    for (const p of [[0x12, 0x05], [0x12, 0x06, 0, 0], [0x12, 0x07], [0x44, 0x90]]) assert.equal(checkReadOnly(p, "ds2").ok, false, String(p));
  });

  it("is offered for the DS2 years", () => {
    assert.ok(matches(PROFILES, "BMW", "3 Series", 2001).some((m) => m.profile.id === "bmw-ds2"));
    assert.equal(matches(PROFILES, "BMW", "5 Series", 2005).length, 0);
  });
});
