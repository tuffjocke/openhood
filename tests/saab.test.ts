/**
 * Saab Trionic 7 and 8: known answers from the examples in Trionic CAN Flasher's source
 * (profiles/saab-trionic7/README.md), and sessions through the pretend ELM327.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches } from "@/core/catalog";
import { ElmLink, elmModeFor } from "@/core/link/elm327";
import { checkReadOnly } from "@/core/safety";
import { Session } from "@/core/session";
import { SimulatedElm } from "@/core/transport/simulated-elm";
import { PROFILES } from "@/profiles";
import { parseTrionic7Codes, saabTrionic7 } from "@/profiles/saab-trionic7";
import { parseTrionic8Codes, saabTrionic8 } from "@/profiles/saab-trionic8";

const sentBy = (sent: string[]) => (e: { dir: string; text?: string }) => {
  if (e.dir === "tx" && e.text) sent.push(e.text);
};

describe("Saab Trionic 7", () => {
  it("reads the six codes in Trionic CAN Flasher's example answer", () => {
    const answer = Uint8Array.from([0x58, 0x06, 0x06, 0x05, 0xe4, 0x12, 0x31, 0x48, 0x12, 0x30, 0xe8, 0x15, 0x30, 0xe1, 0x16, 0x06, 0xe8, 0x14, 0x60, 0x41]);
    assert.deepEqual(parseTrionic7Codes([answer]), ["P0605", "P1231", "P1230", "P1530", "P1606", "P1460"]);
    assert.deepEqual(parseTrionic7Codes([Uint8Array.from([0x58, 0x00])]), []);
  });

  it("goes through an ELM327 as Trionic CAN Flasher does: ATSP5, header 80+n 11 F1, then 18 02", async () => {
    const sent: string[] = [];
    const s = new Session(saabTrionic7, new ElmLink(new SimulatedElm(saabTrionic7, { can: false }), sentBy(sent), elmModeFor(saabTrionic7)));
    await s.connect();
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["P0171", "P1923"]);
    for (const c of ["ATSP5", "ATSH8211F1", "1802"]) assert.ok(sent.includes(c), c);
    await s.clearFaults();
    assert.deepEqual(await s.readFaults(), []);
    await s.disconnect();
  });
});

describe("Saab Trionic 8", () => {
  it("reads codes from 5E8 frames as Trionic CAN Flasher shows them, and stops at the end frame", () => {
    const f = (...b: number[]) => Uint8Array.from(b);
    const frames = [f(0x7f, 0xa9, 0x78), f(0x81, 0x07, 0x03, 0x00, 0x7f, 0, 0, 0), f(0x81, 0xe1, 0x03, 0x00, 0x2a, 0, 0, 0), f(0x81, 0, 0, 0, 0, 0, 0, 0), f(0x81, 0x01, 0x71, 0, 0, 0, 0, 0)];
    // E1 03 is the source's own example for U2103.
    assert.deepEqual(parseTrionic8Codes(frames), ["P0703", "U2103"]);
  });

  it("sets up the ELM327 for raw CAN and reads past response pending", async () => {
    const sent: string[] = [];
    const s = new Session(saabTrionic8, new ElmLink(new SimulatedElm(saabTrionic8), sentBy(sent), elmModeFor(saabTrionic8)));
    await s.connect();
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["P0703", "P0171"]);
    for (const c of ["ATSP6", "ATCAF0", "ATSH7E0", "ATCF5E8", "ATCM5FF", "0210020000000000", "03A9811200000000", "0120000000000000"])
      assert.ok(sent.includes(c), c);
    await s.clearFaults();
    assert.deepEqual(await s.readFaults(), []);
    await s.disconnect();
  });

  it("only lets tools send read services", () => {
    assert.ok(checkReadOnly([0xa9, 0x81, 0x12], "gmlan").ok);
    assert.ok(checkReadOnly([0x03], "gmlan").ok);
    for (const p of [[0x27, 0x01], [0x34, 0], [0x3b, 0x90], [0x04], [0x10, 0x02]]) assert.equal(checkReadOnly(p, "gmlan").ok, false, String(p));
  });
});

describe("Saab in the car chooser", () => {
  it("offers Trionic 7 for the 9-5 and older 9-3, Trionic 8 for the newer 9-3", () => {
    const ids = (model: string, year: number) => matches(PROFILES, "Saab", model, year).map((m) => m.profile.id);
    assert.deepEqual(ids("9-5", 2004), ["saab-trionic7"]);
    assert.deepEqual(ids("9-3", 2001), ["saab-trionic7"]);
    assert.deepEqual(ids("9-3", 2007), ["saab-trionic8"]);
    assert.deepEqual(ids("9-3", 1999), []);
  });
});
