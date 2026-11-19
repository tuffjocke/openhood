/**
 * Known answers for the Td5 profile, from published sources (see profiles/land-rover-td5/README.md).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hex, shortFrame, addressedFrame } from "@/core/kwp2000/frame";
import { td5Key } from "@/profiles/land-rover-td5/keygen";
import { groups } from "@/profiles/land-rover-td5/data";

describe("Land Rover Td5", () => {
  it("computes the key from td5keygen's published example", () => {
    assert.equal(td5Key(0x34a5), 0x54d3);
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
