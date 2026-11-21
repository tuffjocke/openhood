import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkReadOnly } from "@/core/safety";

describe("read-only requests for tools", () => {
  it("allows reading", () => {
    for (const p of [[0x01, 0x0c], [0x03], [0x07], [0x09, 0x02], [0x21, 0x09], [0x1a, 0x80], [0x10, 0x89], [0x3e]])
      assert.equal(checkReadOnly(p).ok, true, p.join(" "));
  });

  it("refuses anything that writes, unlocks, programs or clears", () => {
    for (const p of [[0x04], [0x14, 0xff, 0x00], [0x2e, 0x01], [0x3b, 0x01], [0x31, 0xdd], [0x27, 0x01], [0x10, 0x85], [0x34], [0x3d], [0x23, 0x00, 0x10, 0x00, 0x10], [0x11, 0x01], []])
      assert.equal(checkReadOnly(p).ok, false, p.join(" "));
  });

  it("uses KWP1281's own numbers for VW Group cars", () => {
    for (const p of [[0x29, 0x01], [0x07], [0x09], [0x00], [0x12]]) assert.equal(checkReadOnly(p, "kwp1281").ok, true, p.join(" "));
    // 0x05 clears faults, 0x10 recodes, 0x22 and 0x2A change adaptation, 0x03 reads raw memory, 0x04 runs actuators.
    for (const p of [[0x05], [0x10, 0x00], [0x22, 0x01], [0x2a, 0x01], [0x03], [0x04], [0x21, 0x01], [0x2b]])
      assert.equal(checkReadOnly(p, "kwp1281").ok, false, p.join(" "));
  });
});
