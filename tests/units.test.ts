import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { channelIn, profileIn, unitsFor, valuesIn } from "@/core/units";
import { genericObd2 } from "@/profiles/generic-obd2";

describe("units", () => {
  it("guesses from the browser's region", () => {
    assert.equal(unitsFor("en-US"), "us");
    assert.equal(unitsFor("en-GB"), "uk");
    assert.equal(unitsFor("sv-SE"), "metric");
    assert.equal(unitsFor("en"), "metric");
  });

  it("converts speed to mph in the UK and US, and temperature to °F only in the US", () => {
    const speed = genericObd2.channels.find((c) => c.unit === "km/h")!;
    const temp = genericObd2.channels.find((c) => c.unit === "°C")!;
    assert.equal(channelIn(speed, "uk").unit, "mph");
    assert.equal(channelIn(temp, "uk").unit, "°C");
    assert.equal(channelIn(temp, "us").unit, "°F");
    assert.equal(channelIn(speed, "us").max, Math.round(speed.max * 0.621371));
    const v = valuesIn(genericObd2, { [speed.key]: 100, [temp.key]: 90 }, "us");
    assert.ok(Math.abs(v[speed.key] - 62.1371) < 1e-6);
    assert.equal(v[temp.key], 194);
  });

  it("leaves metric and other units alone", () => {
    assert.equal(profileIn(genericObd2, "metric"), genericObd2);
    const rpm = genericObd2.channels.find((c) => c.unit === "rpm")!;
    assert.equal(channelIn(rpm, "us"), rpm);
  });
});
