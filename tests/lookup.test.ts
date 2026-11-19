import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXAMPLE_CODES, lookupCode, normaliseCode } from "@/profiles";

describe("code lookup", () => {
  it("accepts the ways people type codes", () => {
    for (const s of ["P0171", "p0171", " P 0171 ", "p-0171"]) assert.equal(normaliseCode(s), "P0171");
  });

  it("explains known codes and recognises unknown ones", () => {
    assert.equal(lookupCode("p0171")?.info?.urgency, "soon");
    const unknown = lookupCode("P1234");
    assert.ok(unknown && !unknown.info, "manufacturer code: shaped right, no explanation");
    assert.equal(lookupCode("hello"), null);
    assert.equal(lookupCode("P4171"), null, "second character must be 0 to 3");
  });

  it("only shows examples we can explain", () => {
    for (const c of EXAMPLE_CODES) assert.ok(lookupCode(c)?.info, c);
  });
});
