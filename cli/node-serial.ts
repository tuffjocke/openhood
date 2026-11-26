import { SerialPort } from "serialport";
import { bounded, ByteQueue, sleep, takeEcho, WRITE_STUCK, writeLimitMs, type ByteStream, type Transport } from "../core/transport/types";

/** What the transport uses of a serial port, so tests can hand it serialport's mock. */
export type Port = Pick<SerialPort, "isOpen" | "open" | "close" | "write" | "drain" | "set" | "update" | "on">;

/**
 * A serial port from Node (the CLI and MCP server), the counterpart of WebSerialTransport:
 * a KKL cable (fast init as a 0x00 byte at 360 baud, 5-baud init with BREAK, echo stripped) or an
 * ELM327 adapter (echo: false).
 */
export class NodeSerialTransport implements Transport, ByteStream {
  readonly kind = "serial" as const;
  private port: Port | null = null;
  private rx = new ByteQueue();

  constructor(private opts: { path: string; baudRate: number; echo?: boolean; parity?: "none" | "even" }) {}

  static async list() {
    try {
      return await SerialPort.list();
    } catch {
      return [];
    }
  }

  /** The port itself; tests swap in serialport's mock. */
  protected createPort(o: { path: string; baudRate: number; parity: "none" | "even" }): Port {
    return new SerialPort({ ...o, autoOpen: false });
  }

  async open() {
    if (this.port?.isOpen) return;
    const port = this.createPort({ path: this.opts.path, baudRate: this.opts.baudRate, parity: this.opts.parity ?? "none" });
    await new Promise<void>((resolve, reject) => port.open((e) => (e ? reject(e) : resolve())));
    port.on("data", (d: Buffer) => this.rx.push(new Uint8Array(d)));
    this.port = port;
  }

  async close() {
    const port = this.port;
    this.port = null;
    // A cable that went away may never call back: give up waiting after a second.
    if (port?.isOpen) await bounded(new Promise<void>((resolve) => port.close(() => resolve())), 1000, "close").catch(() => {});
  }

  private set(brk: boolean) {
    return new Promise<void>((resolve, reject) => this.port!.set({ brk }, (e) => (e ? reject(e) : resolve())));
  }

  /**
   * ISO 14230 fast init: K-line low 25 ms, then high.
   *
   * The low pulse is one 0x00 byte at 360 baud: start bit + 8 zero bits = 25.0 ms, timed by the
   * cable's UART instead of JS timers. BREAK timed with timers came out 28 to 35 ms on macOS (each
   * set() takes 3 to 5 ms), and a Td5 ignored it at every length tried, 17 to 31 ms; the 360-baud
   * byte woke it first time (issue #1). The port is reopened at 360 baud because macOS refuses
   * port.update() to it. A cable that can't open at 360 baud gets the BREAK pulse instead.
   */
  async fastInit() {
    if (!this.port) throw new Error("Port not open");
    const baudRate = this.opts.baudRate;
    await sleep(300); // bus idle (W5)
    const t0 = performance.now();
    try {
      await this.reopen(360);
    } catch (e) {
      await this.reopen(baudRate);
      const why = e instanceof Error ? e.message : String(e);
      return `BREAK, the cable didn't open at 360 baud (${why}); ${await this.breakInit()}`;
    }
    const reopen = performance.now() - t0;
    let echo = true;
    let sent = 0;
    let lowEnd = 0;
    try {
      this.rx.clear();
      sent = performance.now();
      await this.send(Uint8Array.of(0x00));
      // The echo comes back once the byte is on the line, so the low pulse is over. No echo: wait it out.
      await this.rx.take(1, 150).catch(() => ((echo = false), sleep(30)));
      lowEnd = performance.now();
    } finally {
      await this.reopen(baudRate);
    }
    await sleep(20); // high (TiniH): reopening already took a few ms; TD5-Dash waits 75 ms on a Td5
    this.rx.clear();
    const ms = (n: number) => `${Math.round(n)} ms`;
    // The same words as the website's (core/transport/webserial.ts), so the two can be compared.
    return `0x00 at 360 baud, reopen ${ms(reopen)}, ${echo ? `echo after ${ms(lowEnd - sent)}` : "no echo"}, then high ${ms(performance.now() - lowEnd)}`;
  }

  /** Fast init by holding BREAK for 25 ms with JS timers: a few ms long on macOS. */
  private async breakInit() {
    const t0 = performance.now();
    await this.set(true);
    await sleep(25);
    const t1 = performance.now();
    await this.set(false);
    await sleep(25);
    this.rx.clear();
    return `low about ${Math.round(t1 - t0)} ms`;
  }

  private async reopen(baudRate: number) {
    await this.close();
    this.opts = { ...this.opts, baudRate };
    await this.open();
  }

  /**
   * Write and wait until the bytes are out. A cable that stops taking data (its car side browned out
   * while cranking, or it was pulled) never finishes the write: fail it, so nothing waits forever (#38).
   */
  private send(bytes: Uint8Array) {
    const port = this.port!;
    const out = new Promise<void>((resolve, reject) => port.write(Buffer.from(bytes), (e) => (e ? reject(e) : port.drain(() => resolve()))));
    return bounded(out, writeLimitMs(bytes.length), WRITE_STUCK);
  }

  async fiveBaud(address: number) {
    if (!this.port) throw new Error("Port not open");
    await this.set(false);
    await sleep(300);
    const bits = [0, ...Array.from({ length: 8 }, (_, i) => (address >> i) & 1), 1];
    const t0 = performance.now();
    for (let i = 0; i < bits.length; i++) {
      await this.set(bits[i] === 0); // BREAK = line low = 0
      await sleep(Math.max(0, t0 + (i + 1) * 200 - performance.now()));
    }
    this.rx.clear();
  }

  async write(bytes: Uint8Array, interByteMs = 0) {
    if (!this.port) throw new Error("Port not open");
    if (interByteMs > 0) {
      for (let i = 0; i < bytes.length; i++) {
        await this.send(bytes.subarray(i, i + 1));
        if (i < bytes.length - 1) await sleep(interByteMs);
      }
    } else await this.send(bytes);
    if (this.opts.echo !== false) await takeEcho(this.rx, bytes.length);
  }

  read(n: number, timeoutMs: number) {
    return this.rx.take(n, timeoutMs);
  }

  setBaudRate(baudRate: number) {
    this.opts = { ...this.opts, baudRate };
    return new Promise<void>((resolve, reject) => this.port!.update({ baudRate }, (e) => (e ? reject(e) : resolve())));
  }
  readUntil(byte: number, timeoutMs: number) {
    return this.rx.takeUntil(byte, timeoutMs);
  }
  readUntilIdle(idleMs: number, timeoutMs: number) {
    return this.rx.takeUntilIdle(idleMs, timeoutMs);
  }
  flush() {
    this.rx.clear();
  }
}
