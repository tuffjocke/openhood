/** Land Rover SLABS: the published sniff's fault block, and a session with a slow clear. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { PROFILES } from "@/profiles";
import { decodeHeights, decodeSupply, landRoverSlabs, slabsBits } from "@/profiles/land-rover-slabs";

describe("Land Rover SLABS", () => {
  it("finds the two faults in the sniffed 21 11 block (byte 3 bit 4, byte 10 bit 4)", () => {
    assert.deepEqual(slabsBits([0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0x10, 0, 0, 0, 0, 0]), ["3.4", "10.4"]);
  });

  it("reads the rear heights from the published 21 54 answer 91 9C 0F 0F (discovery2-diag)", () => {
    assert.deepEqual(decodeHeights([0x61, 0x54, 0x91, 0x9c, 0x0f, 0x0f]), { rideLeft: 145, rideRight: 156 });
  });

  it("reads the battery at data byte 12 of 21 44 in 1/16 V: 13.5 V running, 12.0 V off", () => {
    const block = (b: number) => [0x61, 0x44, ...new Array(12).fill(0), b, b];
    assert.deepEqual(decodeSupply(block(0xd8)), { battery: 13.5 });
    assert.deepEqual(decodeSupply(block(0xc0)), { battery: 12 });
    assert.deepEqual(decodeSupply([0x61, 0x44, 0]), {});
  });

  it("asks no more than about once a second, or SLABS drops the session", () => {
    assert.ok((landRoverSlabs.link.interMessageMs ?? 0) >= 1000);
    assert.ok(!landRoverSlabs.groups.some((g) => g.request[0] === 0x3e), "reads keep it open, no extra tester present");
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
