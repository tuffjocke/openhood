/**
 * Known-answer tests for the generic OBD-II pieces that follow published standards.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressedFrame, hex } from "@/core/kwp2000/frame";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { genericObd2 } from "@/profiles/generic-obd2";
import { decodeDtc, decodeDtcFrames, encodeDtc } from "@/profiles/generic-obd2/dtc";
import { pidSupported, supportKey } from "@/profiles/generic-obd2/pids";

describe("generic OBD-II", () => {
  it("builds the standard ISO 14230-4 start communication frame", () => {
    assert.equal(hex(addressedFrame([0x81], 0x33, 0xf1, "functional")), "C1 33 F1 81 66");
  });

  it("decodes trouble codes", () => {
    assert.equal(decodeDtc(0x01, 0x71), "P0171");
    assert.equal(decodeDtc(0x41, 0x23), "C0123");
    assert.equal(decodeDtc(0x92, 0x34), "B1234");
    assert.equal(decodeDtc(0xc1, 0x00), "U0100");
    for (const c of ["P0420", "P1234", "C0035", "U3FFF"]) assert.equal(decodeDtc(...encodeDtc(c)), c);
  });

  it("skips padding and duplicates across frames", () => {
    const f1 = Uint8Array.from([0x43, 0x01, 0x71, 0x04, 0x20, 0x00, 0x00]);
    const f2 = Uint8Array.from([0x43, 0x01, 0x71, 0x00, 0x00, 0x00, 0x00]);
    assert.deepEqual(decodeDtcFrames([f1, f2]), ["P0171", "P0420"]);
  });

  it("reads supported-PID bitmasks", () => {
    // BE 1F A8 13: the example from the OBD-II PIDs article
    const state = { [supportKey(0)]: 0xbe1fa813 };
    const expected = [0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x13, 0x15, 0x1c, 0x1f, 0x20];
    for (let pid = 1; pid <= 0x20; pid++) assert.equal(pidSupported(state, pid), expected.includes(pid), `PID ${pid}`);
    assert.equal(pidSupported(state, 0x42), false, "unknown block counts as unsupported");
  });

  it("reads more codes than fit in one frame", async () => {
    const s = new Session(genericObd2, new SimulatedTransport(genericObd2));
    await s.connect();
    const codes = await s.readFaults();
    assert.equal(codes.length, 4);
    assert.ok(codes[0].startsWith("P0171"));
    await s.disconnect();
  });
});
