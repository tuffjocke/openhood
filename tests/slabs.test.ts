/** Land Rover SLABS: the published sniff's fault block, and a session with a slow clear. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { PROFILES } from "@/profiles";
import { landRoverSlabs, slabsBits } from "@/profiles/land-rover-slabs";

describe("Land Rover SLABS", () => {
  it("finds the two faults in the sniffed 21 11 block (byte 3 bit 4, byte 10 bit 4)", () => {
    assert.deepEqual(slabsBits([0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0x10, 0, 0, 0, 0, 0]), ["3.4", "10.4"]);
  });

  it("reads current and stored faults once each, then clears", async () => {
    const s = new Session(landRoverSlabs, new SimulatedTransport(landRoverSlabs));
    await s.connect();
    const faults = await s.readFaults();
    assert.deepEqual(faults.map((f) => f.id), ["SLABS-3.4", "SLABS-10.4"]);
    assert.match(faults[0].name, /wheel speed sensor/);
    await s.clearFaults();
    assert.deepEqual(await s.readFaults(), []);
    await s.disconnect();
  });

  it("is offered next to the Td5 engine for a Discovery 2", () => {
    const ids = matches(PROFILES, "Land Rover", "Discovery 2", 2002).map((m) => m.profile.id);
    assert.ok(ids.includes("land-rover-td5") && ids.includes("land-rover-slabs"));
  });
});
