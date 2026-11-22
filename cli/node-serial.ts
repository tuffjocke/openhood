import { SerialPort } from "serialport";
import { ByteQueue, sleep, type ByteStream, type Transport } from "../core/transport/types";

/**
 * A serial port from Node (the CLI and MCP server), the counterpart of WebSerialTransport:
 * a KKL cable (BREAK for the wake-up, echo stripped) or an ELM327 adapter (echo: false).
 */
export class NodeSerialTransport implements Transport, ByteStream {
  readonly kind = "serial" as const;
  private port: SerialPort | null = null;
  private rx = new ByteQueue();

  constructor(private opts: { path: string; baudRate: number; echo?: boolean; parity?: "none" | "even" }) {}

  static async list() {
    try {
      return await SerialPort.list();
    } catch {
      return [];
    }
  }

  async open() {
    if (this.port?.isOpen) return;
    const port = new SerialPort({ path: this.opts.path, baudRate: this.opts.baudRate, parity: this.opts.parity ?? "none", autoOpen: false });
    await new Promise<void>((resolve, reject) => port.open((e) => (e ? reject(e) : resolve())));
    port.on("data", (d: Buffer) => this.rx.push(new Uint8Array(d)));
    this.port = port;
  }

  async close() {
    const port = this.port;
    this.port = null;
    if (port?.isOpen) await new Promise<void>((resolve) => port.close(() => resolve()));
  }

  private set(brk: boolean) {
    return new Promise<void>((resolve, reject) => this.port!.set({ brk }, (e) => (e ? reject(e) : resolve())));
  }

  async fastInit() {
    if (!this.port) throw new Error("Port not open");
    await this.set(false);
    await sleep(300);
    await this.set(true);
    await sleep(25);
    await this.set(false);
    await sleep(25);
    this.rx.clear();
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
    const send = (b: Uint8Array) =>
      new Promise<void>((resolve, reject) => this.port!.write(Buffer.from(b), (e) => (e ? reject(e) : this.port!.drain(() => resolve()))));
    if (interByteMs > 0) {
      for (let i = 0; i < bytes.length; i++) {
        await send(bytes.subarray(i, i + 1));
        if (i < bytes.length - 1) await sleep(interByteMs);
      }
    } else await send(bytes);
    if (this.opts.echo !== false) await this.rx.take(bytes.length, 50 + bytes.length * 2);
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
