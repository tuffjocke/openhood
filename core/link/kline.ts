import {
  addressedFrame,
  hex,
  iso9141Frame,
  NegativeResponse,
  parseFrame,
  parseIso9141,
  positive,
  remainingLength,
  shortFrame,
  SID,
} from "../kwp2000/frame";
import type { EcuLink, InitResult, RequestOptions, VehicleProfile } from "../profile";
import { sleep, TimeoutError, type Transport } from "../transport/types";
import { SimulatedElm } from "../transport/simulated-elm";
import { SimulatedTransport } from "../transport/simulated";
import { Ds2Link } from "./ds2";
import { ElmLink, elmModeFor } from "./elm327";
import { Kwp1281Link } from "./kwp1281";
import { identifies, type Link, type Traffic } from "./types";

const RESPONSE_TIMEOUT_MS = 300;

/** Raw K-line through a KKL cable or the simulator: fast or 5-baud wake-up, KWP2000 or ISO 9141-2 frames. */
export class KlineLink implements Link {
  init: InitResult = { kind: "fast" };
  readonly adapter: "kkl" | "simulator";

  constructor(
    private profile: VehicleProfile,
    private transport: Transport,
    private onTraffic: Traffic = () => {},
  ) {
    this.adapter = transport.kind === "simulator" ? "simulator" : "kkl";
  }

  private get iso9141() {
    return this.init.kind === "slow" && this.init.protocol === "iso9141";
  }

  async open(connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    await this.transport.open();
    const mode = this.profile.link.init;
    if (mode === "fast" || mode === "auto") {
      try {
        this.init = { kind: "fast" };
        this.note("fast init");
        await this.transport.fastInit();
        await connect(this, this.init);
        return;
      } catch (e) {
        if (mode === "fast" || !(e instanceof TimeoutError)) throw e;
        this.note("no answer to fast init, trying the 5-baud wake-up");
        await sleep(300); // bus must be idle before a new init (W5)
      }
    }
    this.init = await this.slowInit();
    await connect(this, this.init);
  }

  close() {
    return this.transport.close();
  }

  /** 5-baud init: address at 5 baud, ECU answers 0x55 + two key bytes, we confirm with ~KB2. */
  private async slowInit(): Promise<InitResult> {
    const address = this.profile.link.slowInitAddress ?? 0x33;
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: Uint8Array.of(address), note: "5-baud wake-up (takes 2 s)" });
    await this.transport.fiveBaud(address);
    const sync = await this.transport.read(1, 400); // W1: up to 300 ms
    if (sync[0] !== 0x55) throw new Error(`Expected sync byte 55 after the 5-baud wake-up, got ${hex(sync)}`);
    const kb = await this.transport.read(2, 100);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: Uint8Array.of(sync[0], kb[0], kb[1]), note: "sync + key bytes" });
    await sleep(30); // W4: 25 to 50 ms
    const confirm = Uint8Array.of(~kb[1] & 0xff);
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: confirm, note: "confirm key byte" });
    await this.transport.write(confirm);
    // ISO ECUs answer with the inverted address. Not every protocol says so, so don't insist on it.
    const ack = await this.transport.read(1, 100).catch(() => new Uint8Array(0));
    if (ack.length) this.onTraffic({ t: performance.now(), dir: "rx", bytes: ack, note: "ECU ready" });
    await sleep(this.profile.link.interMessageMs ?? 55);
    const iso9141 = kb[0] === kb[1] && (kb[0] === 0x08 || kb[0] === 0x94);
    return { kind: "slow", keyBytes: [kb[0], kb[1]], protocol: iso9141 ? "iso9141" : "kwp2000" };
  }

  private note(text: string) {
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), note: text });
  }

  /** Send one request frame. */
  private async send(payload: number[], opts: RequestOptions) {
    const { addresses, addressMode = "physical", alwaysAddressed = false } = this.profile.link;
    const addressed = opts.addressed ?? alwaysAddressed;
    const msg = this.iso9141
      ? iso9141Frame(payload, addresses.tester)
      : addressed
        ? addressedFrame(payload, addresses.ecu, addresses.tester, addressMode, this.profile.link.lengthOffset)
        : shortFrame(payload);
    this.transport.flush(); // drop late answers from earlier requests
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: msg, note: opts.note, private: identifies(payload) });
    await this.transport.write(msg, this.profile.link.interByteMs);
  }

  /** Read one frame and return its payload, logging it. */
  private async readFrame(timeoutMs: number): Promise<Uint8Array> {
    if (this.iso9141) {
      // No length byte: a frame ends when the line goes quiet (P1 max 20 ms between bytes).
      const raw = await this.transport.readUntilIdle(20, timeoutMs);
      this.onTraffic({ t: performance.now(), dir: "rx", bytes: raw });
      return parseIso9141(raw).payload;
    }
    const head = await this.transport.read(1, timeoutMs);
    const offset = head[0] & 0x80 ? (this.profile.link.lengthOffset ?? 0) : 0;
    const rest = await this.transport.read(remainingLength(head[0]) - offset, RESPONSE_TIMEOUT_MS);
    const raw = new Uint8Array(1 + rest.length);
    raw[0] = head[0];
    raw.set(rest, 1);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: raw });
    return parseFrame(raw).payload;
  }

  /**
   * Wait for a response to `sid`: positive (sid + 0x40) or negative (7F sid code).
   * Frames meant for other requests are ignored. "Response pending" keeps waiting.
   */
  private async awaitResponse(sid: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const left = deadline - performance.now();
      if (left <= 0) throw new TimeoutError(1, 0);
      const res = await this.readFrame(left);
      if (res[0] === positive(sid)) return res;
      if (res[0] === SID.negativeResponse && res[1] === sid) {
        if (res[2] === 0x78) continue;
        throw new NegativeResponse(res[1], res[2]);
      }
    }
  }

  async request(payload: number[], opts: RequestOptions = {}) {
    await this.send(payload, opts);
    try {
      return await this.awaitResponse(payload[0], RESPONSE_TIMEOUT_MS);
    } finally {
      await sleep(this.profile.link.interMessageMs ?? 30);
    }
  }

  async requestMany(payload: number[], opts: RequestOptions & { windowMs?: number } = {}) {
    await this.send(payload, opts);
    const out: Uint8Array[] = [];
    try {
      out.push(await this.awaitResponse(payload[0], RESPONSE_TIMEOUT_MS));
      for (;;) {
        try {
          out.push(await this.awaitResponse(payload[0], opts.windowMs ?? 80));
        } catch (e) {
          if (e instanceof TimeoutError) break;
          throw e;
        }
      }
      return out;
    } finally {
      await sleep(this.profile.link.interMessageMs ?? 30);
    }
  }
}

/** The right raw K-line link for a profile: KWP1281 (core/link/kwp1281) or KWP2000 / ISO 9141-2. */
export function kLineLink(profile: VehicleProfile, transport: Transport, onTraffic?: Traffic): Link {
  // Volvo D2 and GMLAN are on CAN, so there is no K-line to simulate: the demo is a pretend ELM327 instead.
  if (profile.link.protocol === "volvo-d2" || profile.link.protocol === "gmlan") {
    if (!(transport instanceof SimulatedTransport)) throw new Error(`${profile.name} needs an ELM327 adapter, not a KKL cable.`);
    return new ElmLink(new SimulatedElm(profile), onTraffic, elmModeFor(profile), { demo: true });
  }
  if (profile.link.protocol === "ds2") return new Ds2Link(transport, onTraffic);
  return profile.link.protocol === "kwp1281"
    ? new Kwp1281Link(profile, transport, onTraffic)
    : new KlineLink(profile, transport, onTraffic);
}
