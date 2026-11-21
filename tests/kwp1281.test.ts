/**
 * KWP1281 (VW Group) known answers from the sources in core/kwp1281/protocol.ts, and a full
 * session against the simulated ECU, byte by byte.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addressByte,
  faultCodeText,
  keywordProtocol,
  measure,
  parseFaults,
  parseGroup,
  TITLE,
} from "@/core/kwp1281/protocol";
import { Kwp1281Link, WrongProtocolError } from "@/core/link/kwp1281";
import type { TrafficEvent } from "@/core/link/types";
import type { VehicleProfile } from "@/core/profile";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { vwAudiKwp1281 } from "@/profiles/vw-audi-kwp1281";

describe("KWP1281 protocol", () => {
  it("sends the address with odd parity in the top bit", () => {
    assert.equal(addressByte(0x01), 0x01); // engine: one bit set, already odd
    assert.equal(addressByte(0x17), 0x97); // instruments: four bits set, parity bit added
    assert.equal(addressByte(0x03), 0x83);
  });

  it("reads 1281 from the keywords 01 8A, with or without the parity bit", () => {
    assert.equal(keywordProtocol(0x01, 0x8a), 1281);
    assert.equal(keywordProtocol(0x01, 0x0a), 1281); // seen on blafusel.de with a plain UART
  });

  it("shows VAG codes as five digits and OBD codes as P codes", () => {
    assert.equal(faultCodeText(522), "00522");
    assert.equal(faultCodeText(0x412c), "P0300"); // VAG 16684
    assert.equal(faultCodeText(0x463a), "P1570"); // P1 codes: the second digit comes from bits 10 and 11
  });

  it("reads faults, skipping the 'no faults' marker", () => {
    const none = parseFaults([Uint8Array.of(TITLE.faults, 0xff, 0xff, 0x88)]);
    assert.deepEqual(none, []);
    const two = parseFaults([Uint8Array.of(TITLE.faults, 0x02, 0x0a, 0x1f, 0x41, 0x2c, 0xa5)]);
    assert.deepEqual(two, [
      { code: 522, elaboration: 0x1f, intermittent: false },
      { code: 0x412c, elaboration: 0x25, intermittent: true },
    ]);
  });

  it("turns measuring block values into numbers by their formula", () => {
    const block = Uint8Array.of(TITLE.groupReading, 0x01, 0xc8, 0x15, 0x05, 0x0a, 0xbc, 0x06, 0x64, 0x8a, 0x10, 0xff, 0x24);
    const [rpm, temp, volts, sw] = parseGroup(block).map(measure);
    assert.deepEqual(rpm, { kind: "rpm", unit: "rpm", value: 840 }); // 200 * 21 * 0.2
    assert.deepEqual(temp, { kind: "temperature", unit: "°C", value: 88 }); // (188 - 100) * 10 * 0.1
    assert.equal(volts?.kind, "voltage");
    assert.ok(Math.abs((volts?.value ?? 0) - 13.8) < 1e-9); // 100 * 138 * 0.001
    assert.equal(sw, null); // switch positions aren't a number
  });

  it("skips text values that carry their own length", () => {
    const block = Uint8Array.of(TITLE.groupReading, 0x5f, 0x02, 0x41, 0x42, 0x01, 0xc8, 0x15);
    assert.deepEqual(parseGroup(block), [{ formula: 0x01, a: 0xc8, b: 0x15 }]);
  });
});

describe("KWP1281 session against the simulator", () => {
  it("wakes the engine, finds its readings and reads, clears and rereads faults", async () => {
    const log: TrafficEvent[] = [];
    const s = new Session(vwAudiKwp1281, new SimulatedTransport(vwAudiKwp1281), (e) => log.push(e));
    await s.connect();
    assert.equal(s.init.kind, "slow");
    assert.ok(s.init.kind === "slow" && s.init.protocol === "kwp1281" && s.init.ident[0] === "OPENHOOD SIM");
    // The simulator keeps rpm in block 1 and road speed in block 5.
    assert.equal(s.state.rpmBlock, 1);
    assert.equal(s.state.speedBlock, 5);
    const v = await s.readGroup("rpm");
    assert.ok(v.rpm > 500 && v.coolant !== undefined, "block 1 brings rpm and coolant together");
    const faults = await s.readFaults();
    assert.deepEqual(faults.map((f) => f.id), ["00522", "P0300"]);
    assert.equal(faults[0].name, "Engine Coolant Temperature Sensor (G62)");
    assert.equal(faults[1].state, "faulty, comes and goes");
    await s.clearFaults();
    assert.deepEqual(await s.readFaults(), []);
    await s.disconnect();
    // Every block we sent ended with 03 and had a counter.
    for (const e of log.filter((e) => e.dir === "tx" && e.bytes.length > 3)) assert.equal(e.bytes[e.bytes.length - 1], 0x03);
  });

  it("reads a fault list that spans several blocks", async () => {
    const many: VehicleProfile = {
      ...vwAudiKwp1281,
      simulator: () => {
        const base = vwAudiKwp1281.simulator();
        return {
          ...base,
          handle: (p) =>
            p[0] === TITLE.readFaults
              ? [
                  [TITLE.faults, 0x02, 0x01, 0x03, 0x02, 0x03, 0x03, 0x02, 0x06, 0x03, 0x02, 0x07, 0x03],
                  [TITLE.faults, 0x02, 0x0a, 0x1f],
                ]
              : base.handle(p),
        };
      },
    };
    const s = new Session(many, new SimulatedTransport(many));
    await s.connect();
    assert.deepEqual((await s.readFaults()).map((f) => f.id), ["00513", "00515", "00518", "00519", "00522"]);
    await s.disconnect();
  });

  it("says so when the engine speaks KWP2000 instead", async () => {
    const newer: VehicleProfile = {
      ...vwAudiKwp1281,
      simulator: () => ({ ...vwAudiKwp1281.simulator(), wakeup: { slow: [0xe9, 0x8f] } }),
    };
    const link = new Kwp1281Link(newer, new SimulatedTransport(newer));
    await assert.rejects(link.open(async () => {}), WrongProtocolError);
    await link.close();
  });
});
