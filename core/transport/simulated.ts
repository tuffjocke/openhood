import { addressedFrame, iso9141Response, parseFrame, parseIso9141, shortFrame } from "../kwp2000/frame";
import type { SimulatedEcu, VehicleProfile } from "../profile";
import { ds2Frame, parseDs2Frame } from "../link/ds2";
import { SimulatedKwp1281 } from "./simulated-kwp1281";
import { ByteQueue, sleep, type Transport } from "./types";

/** For tests of a car that goes quiet: by default the simulated ECU always answers. */
export interface SimulatedOptions {
  /** Requests answered after each wake-up; then the ECU ends its session and ignores everything until woken again. */
  dropAfter?: number;
  /** Once it has gone quiet, ignore wake-ups too: a car that stays silent. */
  staysQuiet?: boolean;
}

/**
 * A K-line with a profile's simulated ECU on the other end.
 * Handles framing and timing; the profile's simulator only sees payloads.
 */
export class SimulatedTransport implements Transport {
  readonly kind = "simulator" as const;
  private rx = new ByteQueue();
  private ecu: SimulatedEcu | null = null;

  /** Requests answered since the last wake-up, and whether the ECU has gone quiet (SimulatedOptions). */
  private answered = 0;
  private quiet = false;

  constructor(
    private profile: VehicleProfile,
    private opts: SimulatedOptions = {},
  ) {}

  /** A wake-up the ECU ignores: it has gone quiet for good (staysQuiet). */
  private deaf() {
    this.answered = 0;
    return this.quiet && !!this.opts.staysQuiet;
  }

  async open() {}

  async close() {
    this.ecu = null;
    this.kwp1281 = null;
  }

  /** During a 5-baud handshake: the key byte we expect back inverted, and the address to ack. */
  private handshake: { kb2: number; address: number } | null = null;

  async fastInit() {
    await sleep(50);
    if (this.deaf()) return void (this.ecu = null);
    const ecu = this.profile.simulator(); // a fresh ECU on every wake-up
    this.kwp1281 = null;
    this.ecu = ecu.wakeup?.fast === false ? null : ecu;
  }

  /** A KWP1281 ECU, which confirms every byte, is simulated byte by byte. */
  private kwp1281: SimulatedKwp1281 | null = null;

  async fiveBaud(address: number) {
    await sleep(50); // the real thing takes 2 s; no need to wait in development
    const ecu = this.profile.simulator();
    this.ecu = null;
    this.kwp1281 = null;
    if (this.deaf()) return;
    const kb = ecu.wakeup?.slow;
    if (!kb) return; // doesn't do slow init: silence
    if (this.profile.link.protocol === "kwp1281") {
      this.kwp1281 = new SimulatedKwp1281(ecu, kb, this.rx);
      return;
    }
    this.handshake = { kb2: kb[1], address };
    this.pending = ecu;
    setTimeout(() => this.rx.push(Uint8Array.of(0x55)), 20);
    setTimeout(() => this.rx.push(Uint8Array.of(kb[0], kb[1])), 30);
  }
  private pending: SimulatedEcu | null = null;

  readUntilIdle(idleMs: number, timeoutMs: number) {
    return this.rx.takeUntilIdle(idleMs, timeoutMs);
  }

  async write(bytes: Uint8Array) {
    // BMW DS2: no wake-up, every module always listening, answers from its own address.
    if (this.profile.link.protocol === "ds2") {
      const req = parseDs2Frame(bytes);
      if (!req) return;
      this.ecu ??= this.profile.simulator();
      const res = this.ecu.handle(Uint8Array.from(req));
      if (res) setTimeout(() => this.rx.push(ds2Frame(res as number[])), 8 + Math.random() * 12);
      return;
    }
    if (this.kwp1281) {
      for (const b of bytes) this.kwp1281.onByte(b);
      return;
    }
    if (this.handshake && bytes.length === 1) {
      if (bytes[0] === (~this.handshake.kb2 & 0xff)) {
        const ack = ~this.handshake.address & 0xff;
        this.ecu = this.pending;
        setTimeout(() => this.rx.push(Uint8Array.of(ack)), 10);
      }
      this.handshake = null;
      return;
    }
    if (!this.ecu) return; // asleep: silence, the session will time out
    if (this.opts.dropAfter !== undefined && ++this.answered > this.opts.dropAfter) {
      this.ecu = null; // ended its session: silence until the next wake-up
      this.quiet = true;
      return;
    }
    const iso = bytes[0] === 0x68;
    const req = iso ? parseIso9141(bytes) : parseFrame(bytes);
    const res = this.ecu.handle(req.payload);
    if (!res) return;
    const frames = (Array.isArray(res[0]) ? res : [res]) as number[][];
    const { ecu, tester } = this.profile.link.addresses;
    // A real ECU answers within P2 (~25 ms); extra frames follow after a gap (P2 min 25 ms).
    frames.forEach((payload, i) => {
      const reply = iso
        ? iso9141Response(payload, 0x10)
        : req.addressed
          ? addressedFrame(payload, tester, ecu, "physical", this.profile.link.lengthOffset)
          : shortFrame(payload);
      setTimeout(() => this.rx.push(reply), 8 + Math.random() * 12 + i * 35);
    });
  }

  read(n: number, timeoutMs: number) {
    return this.rx.take(n, timeoutMs);
  }

  flush() {
    this.rx.clear();
  }
}
