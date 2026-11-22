/**
 * Volvo D2 on CAN: known answers from frames published by Volvo owners (see
 * profiles/volvo-d2/README.md), and a session through the pretend ELM327.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { ElmLink } from "@/core/link/elm327";
import { checkReadOnly } from "@/core/safety";
import { Session } from "@/core/session";
import { SimulatedElm } from "@/core/transport/simulated-elm";
import { SimulatedTransport } from "@/core/transport/simulated";
import { d2AnswerFrames, d2Frame, parseD2Codes, reassembleD2 } from "@/core/volvo-d2/frame";
import { PROFILES } from "@/profiles";
import { volvoD2 } from "@/profiles/volvo-d2";

const frames = (id: number, rows: number[][]) => rows.map((data) => ({ id, data }));

describe("Volvo D2", () => {
  it("builds the read-codes request an S80 ME7 log shows: CB 7A AE 11 00 00 00 00", () => {
    assert.deepEqual(d2Frame([0x7a, 0xae, 0x11]), [0xcb, 0x7a, 0xae, 0x11, 0, 0, 0, 0]);
    assert.deepEqual(d2Frame([0x7a, 0xa6, 0x12, 0x9d, 0x01]), [0xcd, 0x7a, 0xa6, 0x12, 0x9d, 0x01, 0, 0]);
  });

  it("reads five codes over two frames, as on a 2010 V50 engine", () => {
    const [m] = reassembleD2(
      frames(0x00400021, [
        [0x8f, 0x11, 0xee, 0x11, 0xc3, 0x01, 0x12, 0x0f],
        [0x4e, 0x00, 0x89, 0x00, 0x02, 0x06, 0x0a, 0x00],
      ]),
    );
    assert.equal(m.id, 0x00400021);
    assert.deepEqual(parseD2Codes(m.payload), ["C301", "120F", "0089", "0002", "060A"]);
  });

  it("reads two codes in one frame (jagrullar.se, ME7 engine) and none from a module without faults (V50)", () => {
    const [two] = reassembleD2(frames(0x00800021, [[0xcf, 0x7a, 0xee, 0x11, 0x91, 0x2a, 0x26, 0x1a]]));
    assert.deepEqual(parseD2Codes(two.payload), ["912A", "261A"]);
    const [none] = reassembleD2(frames(0x00400101, [[0xcb, 0x30, 0xee, 0x11, 0x48, 0x07, 0xa7, 0xaf]]));
    assert.deepEqual(none.payload, [0x30, 0xee, 0x11]);
    assert.deepEqual(parseD2Codes(none.payload), []);
  });

  it("puts a three-frame answer back together and splits it the same way (S80 ME7 part number)", () => {
    const published = [
      [0x8f, 0x7a, 0xf9, 0xf0, 0x00, 0x09, 0x47, 0x07],
      [0x09, 0x38, 0x20, 0x20, 0x41, 0x09, 0x49, 0x78],
      [0x4c, 0x03, 0x20, 0x20, 0x41, 0x00, 0x00, 0x00],
    ];
    const [m] = reassembleD2(frames(0x00800021, published));
    // VIDA shows this as "0009470738 A" and "09497803 A".
    assert.deepEqual(m.payload.slice(3, 11), [0x00, 0x09, 0x47, 0x07, 0x38, 0x20, 0x20, 0x41]);
    assert.deepEqual(m.payload.slice(11), [0x09, 0x49, 0x78, 0x03, 0x20, 0x20, 0x41]);
    assert.deepEqual(d2AnswerFrames(m.payload), published);
  });

  it("keeps two modules' answers apart and drops an answer whose last frame never came", () => {
    const got = reassembleD2([
      { id: 1, data: [0x8f, 0x11, 0xee, 0x11, 1, 2, 3, 4] },
      { id: 2, data: [0xcb, 0x50, 0xee, 0x11, 0, 0, 0, 0] },
    ]);
    assert.deepEqual(got, [{ id: 2, payload: [0x50, 0xee, 0x11] }]);
  });

  it("sets up the ELM327 as published, finds each module's answer range, and reads every module", async () => {
    const sent: string[] = [];
    const link = new ElmLink(new SimulatedElm(volvoD2), (e) => e.dir === "tx" && e.text && sent.push(e.text), "volvo-d2");
    const s = new Session(volvoD2, link);
    await s.connect();
    assert.equal(s.init.kind, "adapter");
    const faults = await s.readFaults();
    assert.deepEqual(faults.map((f) => f.id), ["CEM-1A51", "SRS-0024", "SRS-00B2"]);
    assert.match(faults[0].name, /can't reach the airbag/);
    for (const c of ["ATSP7", "ATCAF0", "ATCP00", "ATSH0FFFFE", "ATH1", "CB7AAE1100000000", "CB58AE1100000000"]) assert.ok(sent.includes(c), c);
    // The engine answers in the 0120 range, the airbags in the 0080 range.
    assert.ok(sent.includes("ATCF01200000") && sent.includes("ATCF00800000"));
    // The engine answered on 7A, so the diesel address 11 isn't asked.
    assert.ok(!sent.includes("CB11AE1100000000"));
    await s.disconnect();
  });

  it("runs as the demo with no adapter, marked as the demo", async () => {
    const s = new Session(volvoD2, new SimulatedTransport(volvoD2));
    await s.connect();
    assert.equal(s.link.adapter, "simulator");
    assert.equal((await s.readFaults()).length, 3);
    await s.disconnect();
  });

  it("says so when no module answers", async () => {
    const silent = { ...volvoD2, simulator: () => ({ handle: () => null }) };
    const s = new Session(silent, new ElmLink(new SimulatedElm(silent), undefined, "volvo-d2"));
    await s.connect();
    await assert.rejects(s.readFaults(), /No module answered/);
    await s.disconnect();
  });

  it("only lets tools send read services", () => {
    assert.ok(checkReadOnly([0x58, 0xae, 0x11], "volvo-d2").ok);
    assert.ok(checkReadOnly([0x7a, 0xb9, 0xf0], "volvo-d2").ok);
    for (const p of [[0x58, 0xaf, 0x11], [0x40, 0xa3, 0x30], [0x40, 0xbb, 0, 0], [0x40, 0xa7, 0, 0], [0x40, 0xb8, 0]])
      assert.equal(checkReadOnly(p, "volvo-d2").ok, false, p.map((b) => b.toString(16)).join(" "));
  });

  it("is offered for 2004 and newer cars, and the 850 profiles for the old ones", () => {
    assert.deepEqual(matches(PROFILES, "Volvo", "V70", 2006).map((m) => m.profile.id), ["volvo-d2"]);
    assert.ok(!matches(PROFILES, "Volvo", "V70", 1998).some((m) => m.profile.id === "volvo-d2"));
    assert.equal(matches(PROFILES, "Volvo", "V70", 2003).length, 0);
    assert.ok(matches(PROFILES, "Volvo", "XC90", 2010).some((m) => m.system === "All modules"));
  });
});
