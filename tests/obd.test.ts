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
import { decodeReadiness } from "@/profiles/generic-obd2/readiness";
import { asMode01 } from "@/profiles/generic-obd2/freeze";
import { createObdSimulator, type ObdFlavour } from "@/profiles/generic-obd2/simulator";
import { iso9141Frame, iso9141Response } from "@/core/kwp2000/frame";
import type { TrafficEvent } from "@/core/session";
import { OBD_EXPLANATIONS, OBD_TITLES } from "@/profiles/shared/obd-codes";

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
    assert.equal(codes[0].code, "P0171");
    assert.equal(codes[0].name, "System too lean, bank 1");
    await s.disconnect();
  });

  it("decodes the warning light and self-tests", () => {
    // MIL on, 2 codes; petrol; misfire+fuel+components available, fuel incomplete;
    // catalyst + O2 sensor available, O2 sensor incomplete
    const r = decodeReadiness(Uint8Array.from([0x41, 0x01, 0x82, 0x27, 0x21, 0x20]));
    assert.equal(r.milOn, true);
    assert.deepEqual(r.monitors, [
      { name: "Misfire", complete: true },
      { name: "Fuel system", complete: false },
      { name: "Components", complete: true },
      { name: "Catalytic converter", complete: true },
      { name: "Oxygen sensors", complete: false },
    ]);
  });

  it("resets self-tests when codes are cleared", async () => {
    const s = new Session(genericObd2, new SimulatedTransport(genericObd2));
    await s.connect();
    assert.equal((await s.readReadiness())?.milOn, true);
    await s.clearFaults();
    const r = await s.readReadiness();
    assert.equal(r?.milOn, false);
    assert.ok(r?.monitors.some((m) => !m.complete));
    await s.disconnect();
  });
});

describe("pending codes and freeze frames", () => {
  it("reshapes a mode 02 answer for the mode 01 decoders", () => {
    assert.deepEqual([...asMode01(Uint8Array.from([0x42, 0x0c, 0x00, 0x26, 0x48]))], [0x41, 0x0c, 0x26, 0x48]);
  });

  it("reads pending codes and the snapshot for the code that set it", async () => {
    const s = new Session(genericObd2, new SimulatedTransport(genericObd2));
    await s.connect();
    const pending = await s.readPending();
    assert.deepEqual(pending?.map((f) => f.code), ["P0130"]);
    const [p0171, p0420] = await s.readFaults();
    const ff = await s.readFreezeFrame(p0171);
    assert.equal(ff?.rpm, 2450);
    assert.equal(ff?.coolant, 34);
    assert.equal(await s.readFreezeFrame(p0420), null, "no snapshot for other codes");
    await s.clearFaults();
    assert.deepEqual(await s.readPending(), []);
    assert.equal(await s.readFreezeFrame(p0171), null, "clearing removes the snapshot");
    await s.disconnect();
  });
});

describe("wake-up and framing", () => {
  it("builds ISO 9141-2 frames", () => {
    assert.equal(hex(iso9141Frame([0x01, 0x0c], 0xf1)), "68 6A F1 01 0C D0");
    assert.equal(hex(iso9141Response([0x41, 0x0c, 0x1a, 0xf8], 0x10)), "48 6B 10 41 0C 1A F8 22");
  });

  const flavours: [ObdFlavour, string, string][] = [
    ["kwp-fast", "fast", "C2 33 F1 01 0C F3"],
    ["kwp-slow", "kwp2000", "C2 33 F1 01 0C F3"],
    ["iso9141", "iso9141", "68 6A F1 01 0C D0"],
  ];
  for (const [flavour, expected, rpmRequest] of flavours) {
    it(`connects to a ${flavour} car and reads live data`, async () => {
      const profile = { ...genericObd2, simulator: () => createObdSimulator(flavour) };
      const log: TrafficEvent[] = [];
      const s = new Session(profile, new SimulatedTransport(profile), (e) => log.push(e));
      await s.connect();
      assert.equal(s.init.kind === "fast" ? "fast" : s.init.protocol, expected);
      const v = await s.readGroup("rpm");
      assert.ok(v.rpm > 500 && v.rpm < 7000, `rpm ${v.rpm}`);
      assert.ok(log.some((e) => hex(e.bytes) === rpmRequest), "rpm request uses the right framing");
      const codes = await s.readFaults();
      assert.equal(codes.length, 4, "multi-frame fault read works in every framing");
      await s.disconnect();
    });
  }
});

describe("plain-language code explanations", () => {
  it("explains every code that has an official title", () => {
    for (const code of Object.keys(OBD_TITLES)) assert.ok(OBD_EXPLANATIONS[code], `no explanation for ${code}`);
  });

  it("follows the writing guide", () => {
    for (const [code, e] of Object.entries(OBD_EXPLANATIONS)) {
      assert.match(code, /^[PCBU][0-3][0-9A-F]{3}$/);
      assert.ok(e.title.length <= 70, `${code} title too long`);
      assert.ok(e.causes.length >= 2 && e.causes.length <= 4, `${code} needs 2 to 4 causes`);
      for (const text of [e.title, e.plain, e.check ?? "", ...e.causes])
        assert.ok(!/[\u2013\u2014]/.test(text), `${code} uses an en or em dash`);
    }
  });
});
