import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADD_CAR_PROMPT, addCarPrompt, requestCarUrl } from "@/core/add-car";

describe("add your car prompt", () => {
  it("matches the copy in docs/adding-a-vehicle.md", () => {
    const doc = readFileSync(new URL("../docs/adding-a-vehicle.md", import.meta.url), "utf8");
    assert.ok(doc.includes(ADD_CAR_PROMPT), "docs/adding-a-vehicle.md and core/add-car.ts have drifted apart");
  });

  it("fills in the car", () => {
    const p = addCarPrompt({ make: "Volvo", model: "V70", year: 2003 });
    assert.ok(p.endsWith("My car is: Volvo V70, model year 2003. Ask me for the engine if you need it."));
  });

  it("links a pre-filled request", () => {
    const u = new URL(requestCarUrl({ make: "Škoda", model: "Octavia", year: 2004 }));
    assert.equal(u.searchParams.get("title"), "Add Škoda Octavia 2004");
    assert.equal(u.searchParams.get("template"), "new-vehicle.md");
  });
});
