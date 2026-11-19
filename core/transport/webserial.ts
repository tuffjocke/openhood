import { ByteQueue, sleep, type Transport } from "./types";

/**
 * Talks to a "dumb" KKL cable (FTDI FT232 or similar) through the Web Serial API.
 * Works in Chrome/Edge on desktop and in Chrome 148+ on Android.
 *
 * Two quirks of K-line cables handled here:
 *  - Fast init is done by holding the TX line in BREAK (= K-line low).
 *  - K-line is a single wire, so every byte we send is echoed back. We strip it.
 */
export class WebSerialTransport implements Transport {
  readonly kind = "serial" as const;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private rx = new ByteQueue();
  private reading = false;

  constructor(private opts: { baudRate: number; echo?: boolean }) {}

  static supported() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async open() {
    // Must be called from a user gesture (a click).
    this.port = await navigator.serial.requestPort();
    await this.port.open({
      baudRate: this.opts.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      bufferSize: 4096,
    });
    this.reading = true;
    void this.pump();
  }

  private async pump() {
    while (this.reading && this.port?.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.rx.push(value);
        }
      } catch {
        // Framing errors during fast init are normal; keep reading.
      } finally {
        this.reader.releaseLock();
      }
    }
  }

  async close() {
    this.reading = false;
    try {
      await this.reader?.cancel();
    } catch {}
    try {
      await this.port?.close();
    } catch {}
    this.port = null;
  }

  async fastInit() {
    if (!this.port) throw new Error("Port not open");
    // Bus must be idle (high) for at least 300 ms before the pulse.
    await this.port.setSignals({ break: false });
    await sleep(300);
    await this.port.setSignals({ break: true });
    await sleep(25);
    await this.port.setSignals({ break: false });
    await sleep(25);
    this.rx.clear();
  }

  async write(bytes: Uint8Array) {
    if (!this.port?.writable) throw new Error("Port not open");
    const w = this.port.writable.getWriter();
    try {
      await w.write(bytes);
    } finally {
      w.releaseLock();
    }
    if (this.opts.echo !== false) {
      // ~1 ms per byte at 10400 baud, plus slack.
      await this.rx.take(bytes.length, 50 + bytes.length * 2);
    }
  }

  read(n: number, timeoutMs: number) {
    return this.rx.take(n, timeoutMs);
  }

  flush() {
    this.rx.clear();
  }
}
