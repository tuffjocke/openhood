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
});
