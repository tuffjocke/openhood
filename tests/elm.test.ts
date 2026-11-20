import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdapterError, ElmLink, isCanProtocol, parseElmCanFrames, parseElmResponse } from "@/core/link/elm327";
import type { TrafficEvent } from "@/core/link/types";
import { Session } from "@/core/session";
import { SimulatedElm, type ElmQuirks } from "@/core/transport/simulated-elm";
import { genericObd2 } from "@/profiles/generic-obd2";
import { decodeDtcFrames } from "@/profiles/generic-obd2/dtc";

const bytes = (r: Uint8Array[]) => r.map((x) => Array.from(x));

describe("ELM327 answers", () => {
  it("reads one line per ECU, with or without spaces", () => {
    assert.deepEqual(bytes(parseElmResponse(["SEARCHING...", "41 00 BE 3F A8 13", "4100983B0011"])), [
      [0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13],
      [0x41, 0x00, 0x98, 0x3b, 0x00, 0x11],
    ]);
  });

  it("joins a CAN multi-frame answer and drops the padding", () => {
    // A 20-byte mode 09 answer, laid out the way the ELM327 datasheet shows multiline answers.
    const r = parseElmResponse(["014", "0: 49 02 01 31 44 34", "1: 47 50 30 30 52 35 35", "2: 42 31 32 33 34 35 36"]);
    assert.equal(r.length, 1);
    assert.equal(r[0].length, 0x14);
    assert.deepEqual(Array.from(r[0].slice(0, 6)), [0x49, 0x02, 0x01, 0x31, 0x44, 0x34]);
  });

  it("treats NO DATA as no answer and words the errors", () => {
    assert.deepEqual(parseElmResponse(["NO DATA"]), []);
    assert.throws(() => parseElmResponse(["UNABLE TO CONNECT"]), AdapterError);
    assert.throws(() => parseElmResponse(["BUS INIT: ...ERROR"]), /wake the car/);
    assert.throws(() => parseElmResponse(["?"]), /didn't understand/);
  });

  it("ignores the bus init line on K-line cars", () => {
    assert.deepEqual(bytes(parseElmResponse(["BUS INIT: ...OK", "41 0C 1A F8"])), [[0x41, 0x0c, 0x1a, 0xf8]]);
  });

  it("tells CAN protocols apart", () => {
    for (const d of ["6", "A6", "7", "A9", "A"]) assert.equal(isCanProtocol(d), true, d);
    for (const d of ["1", "A3", "A5", "5", ""]) assert.equal(isCanProtocol(d), false, d);
  });
});

describe("trouble codes on CAN", () => {
  it("skips the count byte CAN puts after the SID", () => {
    const frame = Uint8Array.of(0x43, 0x02, 0x01, 0x71, 0x04, 0x20);
    assert.deepEqual(decodeDtcFrames([frame], true), ["P0171", "P0420"]);
    // The same bytes read as K-line would misread the count as a code.
    assert.notDeepEqual(decodeDtcFrames([frame], false), ["P0171", "P0420"]);
  });
});

/**
 * Answers printed in the ELM327 datasheet (Elm Electronics, "Interpreting Trouble Codes" and
 * "Multiline Responses"). These are the adapter maker's own examples, not our simulator's.
 */
describe("answers from the ELM327 datasheet", () => {
  const text = (r: Uint8Array, from: number) => String.fromCharCode(...r.slice(from));

  it("reads one stored code on an older car", () => {
    assert.deepEqual(decodeDtcFrames(parseElmResponse(["43 01 33 00 00 00 00"]), false), ["P0133"]);
  });

  it("reads two ECUs answering the same request", () => {
    assert.equal(parseElmResponse(["41 00 BE 3E B8 11", "41 00 80 10 80 00"]).length, 2);
  });

  it("reads a VIN sent as five numbered lines (older protocols)", () => {
    const r = parseElmResponse(["49 02 01 00 00 00 31", "49 02 02 44 34 47 50", "49 02 03 30 30 52 35", "49 02 04 35 42 31 32", "49 02 05 33 34 35 36"]);
    assert.equal(r.length, 5);
    assert.equal(r.map((f) => text(f, 3).replace(/\0/g, "")).join(""), "1D4GP00R55B123456");
  });

  it("reads the same VIN as one CAN multi-frame answer", () => {
    const [r] = parseElmResponse(["014", "0: 49 02 01 31 44 34", "1: 47 50 30 30 52 35 35", "2: 42 31 32 33 34 35 36"]);
    assert.equal(text(r, 3), "1D4GP00R55B123456");
  });

  it("keeps two ECUs apart when their long answers interleave (headers on)", () => {
    const r = parseElmCanFrames([
      "7E8 10 13 49 04 01 35 36 30",
      "7E8 21 32 38 39 34 39 41 43",
      "7E9 10 13 49 04 01 35 36 30",
      "7E8 22 00 00 00 00 00 00 31",
      "7E9 21 32 38 39 35 34 41 43",
      "7E9 22 00 00 00 00 00 00 00",
    ]);
    assert.equal(r.length, 2);
    assert.deepEqual(r.map((a) => a.length), [0x13, 0x13]);
    assert.equal(text(r[0], 3).replace(/\0/g, ""), "56028949AC");
    assert.equal(text(r[1], 3).replace(/\0/g, ""), "56028954AC");
  });
});

describe("CAN frames with headers", () => {
  it("reads single frames, spaces on or off, padded or not, engine first", () => {
    assert.deepEqual(bytes(parseElmCanFrames(["7E9 06 41 00 98 18 80 01", "7E8064100BE3FA813AA"])), [
      [0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13],
      [0x41, 0x00, 0x98, 0x18, 0x80, 0x01],
    ]);
  });

  it("reads 29-bit ids", () => {
    assert.deepEqual(bytes(parseElmCanFrames(["18 DA F1 10 06 41 00 BE 3F A8 13"])), [[0x41, 0x00, 0xbe, 0x3f, 0xa8, 0x13]]);
  });

  it("drops a long answer with frames missing, and lines that aren't CAN frames", () => {
    assert.deepEqual(parseElmCanFrames(["7E8 10 13 49 04 01 35 36 30", "7E8 21 32 38 39 34 39 41 43"]), []);
    assert.deepEqual(parseElmCanFrames(["48 6B 10 41 00 BE 3E B8 11 FA", "4100BE3FA813"]), []);
    assert.throws(() => parseElmCanFrames(["CAN ERROR"]), AdapterError);
  });
});

describe("adapter quirks", () => {
  const read = async (quirks: ElmQuirks) => {
    const sent: string[] = [];
    const link = new ElmLink(new SimulatedElm(genericObd2, quirks), (e: TrafficEvent) => {
      if (e.dir === "tx" && e.text) sent.push(e.text);
    });
    const s = new Session(genericObd2, link);
    await s.connect();
    const codes = (await s.readFaults()).map((f) => f.code);
    const init = link.init;
    await s.disconnect();
    return { codes, init, sent };
  };

  it("uses headers on CAN and not on older protocols", async () => {
    const can = await read({ can: true });
    assert.equal(can.codes.length, 4);
    assert.equal(can.sent.lastIndexOf("ATH1") > can.sent.lastIndexOf("ATH0"), true);
    const kline = await read({ can: false });
    assert.deepEqual(kline.codes, can.codes);
    assert.equal(kline.sent.includes("ATH1"), false);
  });

  it("works out CAN from the answer when the adapter won't name the protocol", async () => {
    const can = await read({ can: true, protocolNumber: "0" });
    assert.equal(can.init.kind === "adapter" && can.init.can, true);
    assert.equal(can.codes.length, 4);
    const kline = await read({ can: false, protocolNumber: "0" });
    assert.equal(kline.init.kind === "adapter" && kline.init.can, false);
    assert.equal(kline.codes.length, 4);
  });

  it("falls back when a clone ignores the headers command", async () => {
    const r = await read({ can: true, ignoresHeaders: true });
    assert.equal(r.init.kind === "adapter" && r.init.can, true);
    assert.equal(r.codes.length, 4);
  });

  it("asks for the name again when the reset answer is junk", async () => {
    const r = await read({ can: true, junkAfterReset: true });
    assert.equal(r.sent.includes("ATI"), true);
    assert.equal(r.codes.length, 4);
  });
});
