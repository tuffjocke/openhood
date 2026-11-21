/**
 * Volvo keyword D3 B0 known answers, from frames published on jonesrh.info (see
 * profiles/volvo-850/README.md), and a session against the simulator.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { addressedFrame, checksum } from "@/core/kwp2000/frame";
import type { TrafficEvent } from "@/core/link/types";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { ElmLink } from "@/core/link/elm327";
import { SimulatedElm } from "@/core/transport/simulated-elm";
import { PROFILES } from "@/profiles";
import { parseD3b0Faults, volvo850Abs, volvo850Combi } from "@/profiles/volvo-850";
import { COMBI_CODES } from "@/profiles/volvo-850/codes";

describe("Volvo keyword D3 B0", () => {
  it("builds the keep-alive exactly as an ELM327 sends it: 82 51 13 A1 87", () => {
    assert.deepEqual(Array.from(addressedFrame([0xa1], 0x51, 0x13, "physical", 1)), [0x82, 0x51, 0x13, 0xa1, 0x87]);
  });

  it("reads a published fault answer: 85 13 51 EE 01 02 05 DF", () => {
    const raw = Uint8Array.of(0x85, 0x13, 0x51, 0xee, 0x01, 0x02, 0x05, 0xdf);
    assert.equal(checksum(raw, raw.length - 1), 0xdf);
    const faults = parseD3b0Faults(raw.subarray(3, 7), COMBI_CODES, "CI");
    assert.deepEqual(faults.map((f) => f.id), ["CI-221", "CI-113"]);
  });

  it("treats FF as no faults", () => {
    assert.deepEqual(parseD3b0Faults(Uint8Array.of(0xee, 0x01, 0xff), COMBI_CODES, "CI"), []);
  });

  it("wakes the module, reads and clears its faults", async () => {
    const log: TrafficEvent[] = [];
    const s = new Session(volvo850Abs, new SimulatedTransport(volvo850Abs), (e) => log.push(e));
    await s.connect();
    assert.deepEqual(s.init, { kind: "slow", keyBytes: [0xd3, 0xb0], protocol: "kwp2000" });
    const hello = log.find((e) => e.dir === "tx" && e.bytes.length === 5);
    assert.deepEqual(Array.from(hello!.bytes), [0x82, 0x01, 0x13, 0xa1, 0x37]); // jonesrh: "82 01 13 A1 37"
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["ABS-321", "ABS-431"]);
    await s.clearFaults();
    assert.deepEqual(await s.readFaults(), []);
    await s.disconnect();
  });

  it("is offered as a choice for the car, by what it reads", () => {
    const found = matches(PROFILES, "Volvo", "850", 1997);
    assert.deepEqual(found.map((m) => m.system).sort(), ["ABS brakes", "Airbag", "Instruments"]);
    assert.equal(matches(PROFILES, "Volvo", "850", 1995).length, 0);
    assert.ok(volvo850Combi.faults?.explanations?.["CI-221"]);
  });

  it("sets up an ELM327 the way jonesrh does: ATSP 3, ATIIA 01, ATWM 82 01 13 A1, ATSH 83 01 13, AE01", async () => {
    const sent: string[] = [];
    const link = new ElmLink(new SimulatedElm(volvo850Abs, { can: false }), (e) => e.dir === "tx" && e.text && sent.push(e.text), volvo850Abs.link.elm);
    const s = new Session(volvo850Abs, link);
    await s.connect();
    const faults = await s.readFaults();
    assert.deepEqual(faults.map((f) => f.id), ["ABS-321", "ABS-431"]);
    for (const c of ["ATSP3", "ATIIA01", "ATTA13", "ATWM820113A1", "ATSH820113", "ATSH830113", "AE01"]) assert.ok(sent.includes(c), c);
    assert.ok(sent.indexOf("ATSH830113") < sent.indexOf("AE01"), "the header for two data bytes comes before AE01");
    await s.disconnect();
  });
});
