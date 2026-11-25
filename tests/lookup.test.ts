import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { faultSearchQuery } from "@/core/fault-search";
import { EXAMPLE_CODES, getProfile, lookupCode, normaliseCode } from "@/profiles";

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

describe("typed car names", () => {
  it("tidies what people type without breaking real names", async () => {
    const { tidyName } = await import("@/core/catalog");
    assert.equal(tidyName("  golf "), "Golf");
    assert.equal(tidyName("v70"), "V70");
    assert.equal(tidyName("grand   cherokee"), "Grand Cherokee");
    assert.equal(tidyName("i30"), "i30");
    assert.equal(tidyName("e-tron"), "e-tron");
    assert.equal(tidyName("CR-V"), "CR-V");
  });
});

describe("Search the web", () => {
  const td5 = getProfile("land-rover-td5")!;
  const obd = getProfile("generic-obd2")!;

  it("describes the fault, not just the code", () => {
    assert.equal(
      faultSearchQuery("Land Rover Defender 1999 2.5 Td5 diesel", { id: "td5-4.6", code: "4-7", name: "Air flow circuit (Logged Low)" }, td5),
      "Land Rover Defender 2.5 Td5 diesel 4-7 Air flow circuit Low",
    );
    assert.equal(faultSearchQuery("Volvo V70 2003", { id: "P0171", code: "P0171", name: "System too lean (Bank 1)" }, obd), "Volvo V70 P0171 System too lean Bank 1");
  });

  it("names the engine when the car isn't chosen, and nothing for standard codes", () => {
    assert.equal(faultSearchQuery("", { id: "td5-25.0", code: "26-1", name: "Road speed missing (Current)" }, td5), "Land Rover Td5 26-1 Road speed missing");
    assert.equal(faultSearchQuery("", { id: "P0300", code: "P0300", name: "Random/multiple cylinder misfire detected" }, obd), "P0300 Random/multiple cylinder misfire detected");
  });
});
