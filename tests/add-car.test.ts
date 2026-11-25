import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ADD_CAR_PROMPT, addCarPrompt, explainProblemPrompt, readCarPrompt, requestCarUrl } from "@/core/add-car";

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

  it("gives the agent working commands and the car", () => {
    const p = readCarPrompt("1999 Land Rover Defender");
    for (const cmd of ["npx -y openhood ports", "npx -y openhood profiles", "npx -y openhood faults --profile", "npx -y openhood record"])
      assert.ok(p.includes(cmd), cmd);
    assert.ok(p.endsWith("My car is 1999 Land Rover Defender."));
    assert.ok(readCarPrompt("").includes("ask me which car"));
    assert.ok(!readCarPrompt("1997 Volvo 850").includes("MCP server"));
    assert.ok(readCarPrompt("1997 Volvo 850", true).includes("MCP server"), "unproven cars ask the agent to dig in");
    assert.ok(readCarPrompt("1997 Volvo 850", true).includes("run Openhood's test with me"), "with the test first");
  });

  it("hands over what went wrong on the website", () => {
    const p = readCarPrompt("2002 Land Rover Defender", true, { message: "The car didn't answer.", profile: "land-rover-td5" });
    assert.ok(p.includes(`It said: "The car didn't answer."`));
    assert.ok(p.includes("the profile land-rover-td5"));
    assert.ok(p.includes("npx -y openhood mcp"));
    assert.ok(!p.includes("run Openhood's test with me"), "one ask to dig in, not two");
    // Claude Code links take up to 5,000 characters; the desktop app more.
    assert.ok(p.length < 5000, `${p.length} characters`);

    // The traffic shows how the website woke the car, cut to fit the link.
    const long = readCarPrompt("1999 Land Rover Defender", false, {
      message: "The car didn't answer.",
      profile: "land-rover-td5",
      traffic: [...Array.from({ length: 30 }, () => "  0.100  <-  " + "00 ".repeat(40)), "  0.400  ->  fast init: 0x00 at 360 baud, reopen 40 ms, echo after 30 ms, then high 300 ms"],
    });
    assert.ok(long.includes("fast init: 0x00 at 360 baud"));
    assert.ok(long.length < 5000, `${long.length} characters`);
  });

  it("gives a phone AI what happened and the traffic, no commands", () => {
    const p = explainProblemPrompt("2006 Volvo V70", {
      message: "No answer from the car.",
      profile: "generic-obd2",
      adapter: "ELM327 adapter, ISO 15765-4",
      traffic: ["    0.120 -> 0100", "    1.120 <- NO DATA"],
    });
    assert.ok(p.includes(`What it said: "No answer from the car."`));
    assert.ok(p.includes("<- NO DATA"));
    assert.ok(p.includes("Connected through: ELM327 adapter"));
    assert.ok(!p.includes("npx"), "a phone can't run commands");
  });
});
