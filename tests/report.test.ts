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
    assert.match(body, /\| Engine speed \| 812 rpm \| community \|/);
    assert.match(body, /02 21 09 2C/);
    assert.ok(!/[–—]/.test(title + body), "no en or em dashes");
  });

  it("keeps the link short enough for GitHub", () => {
    const url = reportUrl(base);
    assert.ok(url.startsWith("https://github.com/tuffjocke/openhood/issues/new?"));
    assert.ok(url.length <= 7500, `url is ${url.length} chars`);
  });
});
