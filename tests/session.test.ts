/**
 * The session waking a K-line ECU that has ended its session (#46), on a simulated ECU that answers a
 * few requests and then goes quiet until it gets the wake-up again.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ElmLink, elmModeFor } from "@/core/link/elm327";
import { Session, StoppedAnswering, type TrafficEvent } from "@/core/session";
import { SimulatedElm } from "@/core/transport/simulated-elm";
import { SimulatedTransport, type SimulatedOptions } from "@/core/transport/simulated";
import { TimeoutError } from "@/core/transport/types";
import { getProfile } from "@/profiles";

const td5 = getProfile("land-rover-td5")!;
const WAKING = "the car stopped answering, waking it again";

function session(opts: SimulatedOptions) {
  const traffic: TrafficEvent[] = [];
  const s = new Session(td5, new SimulatedTransport(td5, opts), (e) => traffic.push(e));
  const notes = (text: string) => traffic.filter((e) => e.note === text).length;
  const fastInits = () => traffic.filter((e) => e.note?.startsWith("fast init")).length;
  return { s, traffic, notes, fastInits };
}

describe("session waking a quiet K-line ECU (#46)", () => {
  it("wakes the ECU again and carries on reading, more than once", async () => {
    const { s, notes, fastInits } = session({ dropAfter: 10 });
    assert.equal(s.canWake, true);
    await s.connect();
    let reads = 0;
    let error: unknown = null;
    await s.poll(
      () => {
        if (++reads >= 12) s.stop();
      },
      (e) => (error = e),
    );
    await s.disconnect();
    assert.equal(error, null);
    assert.equal(reads, 12);
    // 10 answers a wake-up: 4 to log in (and 1 slow group after the first), the rest readings.
    assert.equal(notes(WAKING), 2);
    assert.equal(fastInits(), 3);
  });

  it("gives up cleanly when the ECU stays quiet, saying it had answered", async () => {
    const { s, notes, fastInits } = session({ dropAfter: 10, staysQuiet: true });
    await s.connect();
    let reads = 0;
    const errors: unknown[] = [];
    await s.poll(
      () => reads++,
      (e) => errors.push(e),
    );
    assert.equal(reads, 5);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof StoppedAnswering);
    assert.ok((errors[0] as StoppedAnswering).reason instanceof TimeoutError);
    // Two wake-ups, one after the other, then no more.
    assert.equal(notes(WAKING), 2);
    assert.equal(fastInits(), 3);
    await s.disconnect();
  });

  it("stops without an error when stopped while the ECU is quiet", async () => {
    const { s } = session({ dropAfter: 6, staysQuiet: true });
    await s.connect();
    let error: unknown = null;
    const polling = s.poll(
      () => {},
      (e) => (error = e),
    );
    setTimeout(() => s.stop(), 400);
    await polling;
    assert.equal(error, null);
    await s.disconnect();
  });

  it("connects again on the same link for Reconnect", async () => {
    const { s, notes, fastInits } = session({});
    await s.connect();
    await s.readGroup("rpm");
    await s.reconnect();
    assert.equal(notes("connecting again"), 1);
    assert.equal(fastInits(), 2);
    assert.ok("rpm" in (await s.readGroup("rpm")));
    await s.disconnect();
  });

  it("leaves adapters alone: an ELM327 keeps its own session", () => {
    const obd = getProfile("generic-obd2")!;
    const s = new Session(obd, new ElmLink(new SimulatedElm(obd), () => {}, elmModeFor(obd)));
    assert.equal(s.canWake, false);
  });
});
