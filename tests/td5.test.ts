/**
 * Known answers for the Td5 profile, from published sources (see profiles/land-rover-td5/README.md).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hex, shortFrame, addressedFrame } from "@/core/kwp2000/frame";
import { td5Key } from "@/profiles/land-rover-td5/keygen";
import { groups } from "@/profiles/land-rover-td5/data";
import { CLEAR_FAULTS, decodeFaults, explanations } from "@/profiles/land-rover-td5/faults";
import { TD5_FAULT_MAP } from "@/profiles/land-rover-td5/fault-map";

describe("Land Rover Td5", () => {
  it("computes the key from td5keygen's published example and a sniffed session", () => {
    assert.equal(td5Key(0x34a5), 0x54d3); // td5keygen README
    assert.equal(td5Key(0x021c), 0x4043); // Ekaitza_Itzali Read_Faults_and_clear.log
    assert.equal(td5Key(0x8972), 0x4511); // a 1999 Defender (GitHub issue #1)
  });

  it("builds the sniffed fault clear request byte for byte", () => {
    // Ekaitza_Itzali Read_Faults_and_clear.log: 14 31 DD 00*18 22, answered 02 71 DD 50
    assert.equal(hex(shortFrame(CLEAR_FAULTS)), "14 31 DD " + "00 ".repeat(18) + "22");
  });

  it("decodes the sniffed fault block", () => {
    // Same log: 25 61 3B C0 C0 00 07 80 87 00 00 70 1D 00 00 00 FF 00 CF 00 8F 00 00 38 01 00 80 00 28 00 00 ...
    const raw = "613bc0c0000780870000701d000000ff00cf008f00003801008000280000000000000000";
    const res = Uint8Array.from(raw.match(/../g)!.map((h) => parseInt(h, 16)));
    const names = decodeFaults(res).map((f) => f.name);
    assert.ok(names.includes("Air flow circuit (Logged Low)"), names.join("; "));
    assert.ok(names.includes("Manifold pressure circuit (Logged Low)"));
    assert.ok(names.length > 20, "a bench ECU with sensors unplugged reports many faults");
  });

  it("has 210 named bits and explains the common ones in plain words", () => {
    assert.equal(Object.keys(TD5_FAULT_MAP).length, 210);
    const explained = Object.keys(explanations).length;
    assert.ok(explained >= 180, `only ${explained} of 210 explained`);
    for (const e of Object.values(explanations)) {
      assert.ok(e.causes.length >= 2 && e.causes.length <= 4);
      for (const t of [e.title, e.plain, e.check ?? "", ...e.causes]) assert.ok(!/[\u2013\u2014]/.test(t), t);
    }
    assert.equal(explanations["td5-4.6"].title, "Problem with the air flow sensor");
    const raw = Uint8Array.from([0x61, 0x3b, 0, 0, 0, 0, 0x40, ...new Array(30).fill(0)]);
    assert.deepEqual(decodeFaults(raw).map((f) => f.state), ["active now"]);
  });

  it("builds the published request frames byte for byte", () => {
    assert.equal(hex(addressedFrame([0x81], 0x13, 0xf7)), "81 13 F7 81 0C");
    assert.equal(hex(shortFrame([0x10, 0xa0])), "02 10 A0 B2");
    assert.equal(hex(shortFrame([0x27, 0x01])), "02 27 01 2A");
    assert.equal(hex(shortFrame([0x27, 0x02, 0x54, 0xd3])), "04 27 02 54 D3 54");
  });

  it("decodes values the way a Nanocom log reports them", () => {
    const temps = groups.find((g) => g.id === "temperatures")!;
    // Nanocom log: ECT 3523 (0.1 K) = 79.1 °C, IAT 3311 = 57.9 °C
    const r = Uint8Array.from([0x61, 0x1a, 0x0d, 0xc3, 0x03, 0x04, 0x0c, 0xef, 0x05, 0x1d, 0, 0, 0, 0, 0x0b, 0x9b, 0, 0]);
    const v = temps.decode(r, {});
    assert.equal(v.coolant.toFixed(1), "79.1");
    assert.equal(v.airTemp.toFixed(1), "57.9");
    const manifold = groups.find((g) => g.id === "manifold")!;
    // MAP 10143 (0.01 kPa) at ambient 101.43 kPa = no boost; MAF 478 (0.1 kg/h) = 47.8 kg/h at idle
    const m = manifold.decode(Uint8Array.from([0x61, 0x1c, 0x27, 0x9f, 0x27, 0xae, 0x01, 0xde, 0, 0]), { ambientKpa: 101.43 });
    assert.equal(m.boost.toFixed(2), "0.00");
    assert.equal(m.maf.toFixed(1), "47.8");
  });

  it("decodes idle speed error and fuel per stroke as discovery2-diag does", () => {
    const at = (h: string) => Uint8Array.from(h.split(" ").map((b) => parseInt(b, 16)));
    const idle = groups.find((g) => g.id === "idle")!;
    assert.equal(idle.decode(at("61 21 FF F6"), {}).idleError, -10); // signed: 0xFFF6 is 10 rpm over target
    assert.equal(idle.decode(at("61 21 00 0C"), {}).idleError, 12);
    const fuelling = groups.find((g) => g.id === "fuelling")!;
    // 0x0348 = 840 → 8.40 mg per stroke at data offset 6
    const r = at("61 1D 00 00 00 00 00 00 03 48 00 00 00 00 00 00 00 00 00 00");
    assert.equal(fuelling.decode(r, {}).fuel.toFixed(2), "8.40");
    assert.deepEqual(fuelling.decode(at("61 1D 00 00"), {}), {}); // too short: nothing, not garbage
  });

  // Read on a 1999 Defender, engine idling, about 0 °C outside (GitHub issue #1).
  const frame = (h: string) => Uint8Array.from(h.split(" ").map((b) => parseInt(b, 16)));
  const decode = (id: string, h: string, state = {}) => groups.find((g) => g.id === id)!.decode(frame(h), state);

  it("decodes the live data read on a real Defender", () => {
    assert.equal(decode("rpm", "61 09 02 F1").rpm, 753);
    assert.equal(decode("speed", "61 0D 00").speed, 0);
    assert.equal(decode("battery", "61 10 38 18 38 74").battery.toFixed(1), "14.4");
    assert.equal(decode("pedal", "61 1B 03 63 10 50 13 88 00 00 13 A3").pedal.toFixed(2), "0.87");
    const ambient = decode("ambient", "61 23 26 C6 26 FD");
    assert.equal(ambient.ambientKpa.toFixed(2), "99.26");
    const m = decode("manifold", "61 1C 26 AB 26 E2 02 BD 08 96", ambient);
    assert.equal(m.boost.toFixed(2), "-0.00");
    assert.equal(m.maf.toFixed(1), "70.1");
    const t = decode("temperatures", "61 1A 0B DF 09 5A 0A B0 0E DF 08 B8 13 88 0B 76 0B 48");
    // 30.7, 0.4 and 20.3 °C (the issue says 30.8, 0.5 and 20.3: it took 273.15 K), shown whole
    assert.deepEqual([t.coolant, t.airTemp, t.fuelTemp].map((c) => Math.round(c)), [31, 0, 20]);
  });

  it("numbers faults the way a Nanocom does and calls a Defender's unwired outputs normal", () => {
    const res = frame(
      "61 3B 00 00 40 00 00 00 00 00 00 1D 00 00 00 1D 00 40 00 00 00 00 00 00 00 80 00 20 00 00 00 00 00 00 00 00 00",
    );
    const faults = decodeFaults(res);
    const code = (id: string) => faults.find((f) => f.id === id)?.code;
    assert.equal(code("td5-13.0"), "14-1"); // air conditioning fan drive open load (Current)
    assert.equal(code("td5-15.6"), "16-7"); // unnamed in every source
    assert.equal(faults.length, 12);
    for (const key of ["9.0", "9.2", "9.3", "9.4", "13.0", "13.2", "13.3", "13.4"]) {
      const e = explanations[`td5-${key}`];
      assert.equal(e.urgency, "ok", key);
      assert.match(e.plain, /Defender/, key);
    }
    assert.equal(explanations["td5-23.6"].title, "Problem reported by the automatic gearbox");
  });
});
