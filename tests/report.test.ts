import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReport, reportUrl, type ReportInput } from "@/core/report";
import { landRoverTd5 } from "@/profiles/land-rover-td5";

const base: ReportInput = {
  vehicle: "Land Rover Defender 1999 2.5 Td5 diesel",
  profile: landRoverTd5,
  source: "serial",
  status: "error",
  error: "No answer from the ECU.",
  readsPerSecond: 0,
  values: { rpm: 812 },
  faults: null,
  traffic: Array.from({ length: 300 }, (_, i) => ({ t: i * 30, dir: i % 2 ? "rx" : "tx", bytes: Uint8Array.from([0x02, 0x21, 0x09, 0x2c]) }) as const),
  userAgent: "Chrome test",
};

describe("test report", () => {
  it("says what happened and includes the traffic", () => {
    const { title, body } = buildReport(base);
    assert.match(title, /Land Rover Defender 1999.*land-rover-td5.*failed/);
    assert.match(body, /\*\*Result:\*\* failed: No answer from the ECU\./);
    assert.match(body, /\| Engine speed \| 812 rpm \| verified \|/);
    assert.match(body, /02 21 09 2C/);
    assert.ok(!/[–—]/.test(title + body), "no en or em dashes");
  });

  it("keeps the link short enough for GitHub", () => {
    const url = reportUrl(base);
    assert.ok(url.startsWith("https://github.com/tuffjocke/openhood/issues/new?"));
    assert.ok(url.length <= 7500, `url is ${url.length} chars`);
  });

  it("hides traffic that identifies the car", () => {
    const vin = Uint8Array.from([0x49, 0x02, 0x01, 0x57, 0x56, 0x57]);
    const { body } = buildReport({
      ...base,
      traffic: [
        { t: 0, dir: "tx", bytes: Uint8Array.of(0x09, 0x02), private: true },
        { t: 10, dir: "rx", bytes: vin },
        { t: 20, dir: "tx", bytes: Uint8Array.of(0x01, 0x0c) },
        { t: 30, dir: "rx", bytes: Uint8Array.of(0x41, 0x0c, 0x0c, 0xbe) },
      ],
    });
    assert.doesNotMatch(body, /49 02 01 57/);
    assert.equal(body.match(/hidden: identifies the car/g)?.length, 2);
    assert.match(body, /41 0C 0C BE/);
  });
});
