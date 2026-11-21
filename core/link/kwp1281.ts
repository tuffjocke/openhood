import { hex, NegativeResponse } from "../kwp2000/frame";
import { addressByte, BLOCK_END, keywordProtocol, TIMING, TITLE } from "../kwp1281/protocol";
import type { EcuLink, InitResult, RequestOptions, VehicleProfile } from "../profile";
import { sleep, TimeoutError, type Transport } from "../transport/types";
import type { Link, Traffic } from "./types";

/** Raised when the ECU wakes up but speaks another protocol. Its message is for people. */
export class WrongProtocolError extends Error {}

/**
 * VW Group's KWP1281 over a KKL cable (or the simulator). Every byte is confirmed by the other side
 * sending its inverse, so blocks go one byte at a time. The ECU expects to hear from us often:
 * when the session has nothing to ask, this sends keep-alive blocks itself.
 *
 * Requests are [title, ...data] and answers [title, ...data], see core/kwp1281/protocol.ts.
 */
export class Kwp1281Link implements Link {
  init: InitResult = { kind: "slow", keyBytes: [0, 0], protocol: "kwp1281", ident: [] };
  readonly adapter: "kkl" | "simulator";
  private counter = 0;
  /** One exchange at a time, including our own keep-alives. */
  private lock: Promise<unknown> = Promise.resolve();
  private keepAlive: ReturnType<typeof setTimeout> | null = null;
  private open_ = false;

  constructor(
    private profile: VehicleProfile,
    private transport: Transport,
    private onTraffic: Traffic = () => {},
  ) {
    this.adapter = transport.kind === "simulator" ? "simulator" : "kkl";
  }

  async open(connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    await this.transport.open();
    const { baudRate, altBaudRates = [], slowInitAddress = 0x01 } = this.profile.link;
    const rates = [baudRate, ...altBaudRates];
    let last: unknown = null;
    for (let i = 0; i < rates.length; i++) {
      if (i > 0) {
        if (!this.transport.setBaudRate) break;
        await this.transport.setBaudRate(rates[i]);
        await sleep(300); // the ECU needs a quiet line before the next wake-up
      }
      try {
        await this.wake(slowInitAddress, rates[i]);
        last = null;
        break;
      } catch (e) {
        if (!(e instanceof TimeoutError) && !(e instanceof SyncError)) throw e;
        last = e;
      }
    }
    if (last) throw last instanceof SyncError ? new TimeoutError(1, 0, last.message) : last;
    this.open_ = true;
    const ident = await this.readIdent();
    this.init = { kind: "slow", keyBytes: (this.init as { keyBytes: [number, number] }).keyBytes, protocol: "kwp1281", ident };
    await connect(this, this.init);
    this.armKeepAlive();
  }

  /** 5-baud address, then sync byte and keywords, then confirm keyword 2. */
  private async wake(address: number, baud: number) {
    const a = addressByte(address);
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: Uint8Array.of(a), note: `5-baud wake-up at ${baud} baud (takes 2 s)` });
    await this.transport.fiveBaud(a);
    const sync = await this.transport.read(1, TIMING.syncTimeoutMs);
    if (sync[0] !== 0x55) throw new SyncError(`Expected sync byte 55 after the wake-up, got ${hex(sync)}`);
    const kw = await this.transport.read(2, TIMING.syncTimeoutMs);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: Uint8Array.of(0x55, kw[0], kw[1]), note: "sync + keywords" });
    const protocol = keywordProtocol(kw[0], kw[1]);
    this.init = { kind: "slow", keyBytes: [kw[0], kw[1]], protocol: "kwp1281", ident: [] };
    if (protocol !== 1281) {
      throw new WrongProtocolError(
        kw[1] === 0x8f || kw[1] === 0x0f
          ? "This engine computer speaks the newer KWP2000, not KWP1281. Try reading standard codes instead."
          : `This engine computer answered with protocol ${protocol}, not KWP1281.`,
      );
    }
    await sleep(TIMING.keywordConfirmMs);
    await this.transport.write(Uint8Array.of(~kw[1] & 0xff));
  }

  /** After waking, the ECU sends identification blocks until it has nothing more; we confirm each. */
  private async readIdent(): Promise<string[]> {
    const ident: string[] = [];
    for (let i = 0; i < 12; i++) {
      const b = await this.receive(TIMING.responseTimeoutMs, i === 0);
      if (b[0] !== TITLE.ident) break;
      // Top bit of the first character says more identification exists; it isn't part of the text.
      ident.push(String.fromCharCode(...Array.from(b.subarray(1), (c, j) => (j === 0 ? c & 0x7f : c))).trim());
      await this.send([TITLE.ack], { note: "got it" });
    }
    return ident.filter(Boolean);
  }

  close() {
    if (this.keepAlive) clearTimeout(this.keepAlive);
    this.keepAlive = null;
    const wasOpen = this.open_;
    this.open_ = false;
    return this.locked(async () => {
      if (wasOpen) {
        try {
          await this.send([TITLE.disconnect], { note: "end session" });
        } catch {}
      }
      await this.transport.close();
    });
  }

  request(payload: number[], opts: RequestOptions = {}) {
    return this.locked(async () => {
      await this.send(payload, opts);
      const res = await this.receive(TIMING.responseTimeoutMs);
      if (res[0] === TITLE.refuse) throw new NegativeResponse(payload[0], TITLE.refuse);
      return res;
    });
  }

  /** Send, then keep confirming answers until the ECU says it has nothing more (fault lists span blocks). */
  requestMany(payload: number[], opts: RequestOptions = {}) {
    return this.locked(async () => {
      await this.send(payload, opts);
      const out: Uint8Array[] = [];
      for (let i = 0; i < 32; i++) {
        const res = await this.receive(TIMING.responseTimeoutMs);
        if (res[0] === TITLE.refuse) throw new NegativeResponse(payload[0], TITLE.refuse);
        if (res[0] === TITLE.ack) return out.length ? out : [res];
        out.push(res);
        await this.send([TITLE.ack], { note: "got it, next" });
      }
      return out;
    });
  }

  /** Run one exchange at a time, and push the next keep-alive back. */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    if (this.keepAlive) clearTimeout(this.keepAlive);
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    void run.finally(() => this.armKeepAlive()).catch(() => {});
    return run;
  }

  private armKeepAlive() {
    if (!this.open_) return;
    if (this.keepAlive) clearTimeout(this.keepAlive);
    this.keepAlive = setTimeout(() => {
      this.keepAlive = null;
      if (!this.open_) return;
      void this.locked(async () => {
        await this.send([TITLE.ack], { note: "keep-alive" });
        await this.receive(TIMING.responseTimeoutMs);
      }).catch(() => {});
    }, TIMING.keepAliveMs);
  }

  /** Send one block, a byte at a time, checking each inverse. */
  private async send(payload: number[], opts: RequestOptions) {
    this.counter = (this.counter + 1) & 0xff;
    const bytes = [payload.length + 2, this.counter, ...payload];
    this.transport.flush();
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: Uint8Array.of(...bytes, BLOCK_END), note: opts.note });
    for (const b of bytes) {
      await this.transport.write(Uint8Array.of(b));
      const inv = await this.transport.read(1, TIMING.byteTimeoutMs);
      if (inv[0] !== (~b & 0xff)) throw new Error(`The ECU didn't confirm byte ${hex([b])} (got ${hex(inv)})`);
    }
    await this.transport.write(Uint8Array.of(BLOCK_END));
  }

  /**
   * Receive one block, confirming each byte. Returns [title, ...data].
   * Right after waking, the ECU may send its sync byte and keywords once more; `mayResync` handles that.
   */
  private async receive(timeoutMs: number, mayResync = false): Promise<Uint8Array> {
    let len = (await this.transport.read(1, timeoutMs))[0];
    if (mayResync && len === 0x55) {
      const kw = await this.transport.read(2, TIMING.byteTimeoutMs);
      await sleep(TIMING.keywordConfirmMs);
      await this.transport.write(Uint8Array.of(~kw[1] & 0xff));
      len = (await this.transport.read(1, timeoutMs))[0];
    }
    await this.confirm(len);
    const counter = await this.byte();
    this.counter = counter;
    const body: number[] = [];
    for (let i = 0; i < len - 2; i++) body.push(await this.byte());
    const end = (await this.transport.read(1, TIMING.byteTimeoutMs))[0];
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: Uint8Array.of(len, counter, ...body, end) });
    if (end !== BLOCK_END) throw new Error(`Block didn't end with 03 (got ${hex([end])})`);
    return Uint8Array.from(body);
  }

  private async byte() {
    const b = (await this.transport.read(1, TIMING.byteTimeoutMs))[0];
    await this.confirm(b);
    return b;
  }

  private confirm(b: number) {
    return this.transport.write(Uint8Array.of(~b & 0xff));
  }
}

class SyncError extends Error {}
