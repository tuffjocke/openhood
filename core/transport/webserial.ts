import { ByteQueue, sleep, type ByteStream, type Transport } from "./types";

/** Bluetooth classic serial (SPP), used by many ELM327 adapters once paired with the computer. */
const SPP = "00001101-0000-1000-8000-00805f9b34fb";

/**
 * A serial port through the Web Serial API: a "dumb" KKL cable (FTDI FT232 or similar), or an
 * ELM327 adapter over USB or paired Bluetooth (then use echo: false and the adapter's baud rate).
 * Works in Chrome/Edge on desktop and in Chrome 148+ on Android.
 *
 * Two quirks of K-line cables handled here:
 *  - Fast init is done by holding the TX line in BREAK (= K-line low).
 *  - K-line is a single wire, so every byte we send is echoed back. We strip it.
 */
export class WebSerialTransport implements Transport, ByteStream {
  readonly kind = "serial" as const;
  private port: SerialPort | null;
  private opened = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private rx = new ByteQueue();
  private reading = false;

  /** Pass a port already chosen by the person, or let open() ask for one. */
  constructor(private opts: { baudRate: number; echo?: boolean; port?: SerialPort; parity?: "none" | "even" }) {
    this.port = opts.port ?? null;
  }

  static supported() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  /** Ask the person to pick a USB or paired Bluetooth serial device. Needs a click. */
  static choosePort() {
    return navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
  }

  async open() {
    if (this.opened) return;
    this.port ??= await WebSerialTransport.choosePort();
    await this.port.open({
      baudRate: this.opts.baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: this.opts.parity ?? "none",
      bufferSize: 4096,
    });
    this.opened = true;
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
    // Wait for the read loop to let go of the stream before closing the port.
    await sleep(20);
    try {
      await this.port?.close();
    } catch {}
    this.opened = false;
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

  async fiveBaud(address: number) {
    if (!this.port) throw new Error("Port not open");
    const set = (high: boolean) => this.port!.setSignals({ break: !high }); // BREAK = line low = 0
    await set(true);
    await sleep(300); // bus idle (W5)
    const bits = [0, ...Array.from({ length: 8 }, (_, i) => (address >> i) & 1), 1]; // start, data, stop
    const t0 = performance.now();
    for (let i = 0; i < bits.length; i++) {
      await set(bits[i] === 1);
      // Aim at absolute bit edges so timer jitter doesn't add up over 2 seconds.
      await sleep(Math.max(0, t0 + (i + 1) * 200 - performance.now()));
    }
    this.rx.clear(); // drop junk the UART may have seen while we were bit-banging
  }

  readUntilIdle(idleMs: number, timeoutMs: number) {
    return this.rx.takeUntilIdle(idleMs, timeoutMs);
  }

  async write(bytes: Uint8Array, interByteMs = 0) {
    if (!this.port?.writable) throw new Error("Port not open");
    const w = this.port.writable.getWriter();
    try {
      if (interByteMs > 0) {
        for (let i = 0; i < bytes.length; i++) {
          await w.write(bytes.subarray(i, i + 1));
          if (i < bytes.length - 1) await sleep(interByteMs);
        }
      } else {
        await w.write(bytes);
      }
    } finally {
      w.releaseLock();
    }
    if (this.opts.echo !== false) {
      // ~1 ms per byte at 10400 baud, plus slack.
      await this.rx.take(bytes.length, 50 + bytes.length * 2);
    }
  }

  readUntil(byte: number, timeoutMs: number) {
    return this.rx.takeUntil(byte, timeoutMs);
  }

  read(n: number, timeoutMs: number) {
    return this.rx.take(n, timeoutMs);
  }

  flush() {
    this.rx.clear();
  }

  /** Web Serial can't change speed on an open port, so close and open it again. */
  async setBaudRate(baudRate: number) {
    await this.close();
    this.opts = { ...this.opts, baudRate };
    await this.open();
  }
}
