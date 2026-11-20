import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AdapterError, isCanProtocol, parseElmResponse } from "@/core/link/elm327";
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
