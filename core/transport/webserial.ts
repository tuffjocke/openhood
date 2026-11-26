import { bounded, ByteQueue, sleep, takeEcho, WRITE_STUCK, writeLimitMs, type ByteStream, type Transport } from "./types";

/** Bluetooth classic serial (SPP), used by many ELM327 adapters once paired with the computer. */
const SPP = "00001101-0000-1000-8000-00805f9b34fb";

/**
 * A serial port through the Web Serial API: a "dumb" KKL cable (FTDI FT232 or similar), or an
 * ELM327 adapter over USB or paired Bluetooth (then use echo: false and the adapter's baud rate).
 * Works in Chrome/Edge on desktop and in Chrome 148+ on Android.
 *
 * Two quirks of K-line cables handled here:
 *  - Fast init is one 0x00 byte at 360 baud (25 ms K-line low), BREAK if the cable can't do 360.
 *  - K-line is a single wire, so every byte we send is echoed back. We strip it.
 */
export class WebSerialTransport implements Transport, ByteStream {
  readonly kind = "serial" as const;
  private port: SerialPort | null;
  private opened = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private rx = new ByteQueue();
  private reading = false;
  private pumping: Promise<void> = Promise.resolve();
  /** Bytes from the cable since the port was last opened, and what went wrong reading it: said in the wake-up line (#21). */
  private received = 0;
  private readErrors: string[] = [];

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
    this.received = 0;
    this.readErrors = [];
    this.pumping = this.pump();
  }

  private async pump() {
    while (this.reading) {
      const readable = this.port?.readable;
      if (!readable) {
        // Gone for good (the device went away): nothing more will come.
        if (this.reading) this.readError("the browser stopped reading the port");
        return;
      }
      this.reader = readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.received += value.length;
            this.rx.push(value);
          }
        }
      } catch (e) {
        // Framing errors during fast init are normal; keep reading, and keep them for the wake-up line.
        if (this.reading) this.readError(e instanceof Error ? e.name : String(e));
        await sleep(1); // never spin, should errors come one after another
      } finally {
        this.reader.releaseLock();
      }
    }
  }

  private readError(what: string) {
    if (this.readErrors.length < 5) this.readErrors.push(what);
  }

  /** What came from the cable since the port was opened, for the traffic: "0 bytes from the cable, read errors: BreakError". */
  private heard() {
    return `${this.received} bytes from the cable${this.readErrors.length ? `, read errors: ${this.readErrors.join(", ")}` : ""}`;
  }

  async close() {
    this.reading = false;
    try {
      await this.reader?.cancel();
    } catch {}
    // Wait for the read loop to let go of the stream before closing the port. Not a fixed wait: on
    // the reopen after the fast init pulse every ms counts.
    await Promise.race([this.pumping, sleep(100)]);
    try {
      await this.port?.close();
    } catch {}
    this.opened = false;
  }

  /**
   * ISO 14230 fast init: K-line low 25 ms, then high.
   *
   * The low pulse is one 0x00 byte at 360 baud: start bit + 8 zero bits = 25.0 ms, timed by the
   * cable's UART instead of JS timers. BREAK timed with timers ran long on macOS and a Td5 never
   * woke; the 360-baud byte woke it first time (issue #1, found with the CLI, which does the same).
   * Web Serial can't change speed on an open port, so it is reopened at 360 baud and back.
   * A cable that can't open at 360 baud gets the BREAK pulse instead.
   */
  async fastInit() {
    if (!this.port) throw new Error("Port not open");
    const baudRate = this.opts.baudRate;
    // Bus must be idle (high) for at least 300 ms before the pulse.
    await this.port.setSignals({ break: false });
    await sleep(300);
    const t0 = performance.now();
    try {
      await this.setBaudRate(360);
    } catch (e) {
      await this.setBaudRate(baudRate);
      const why = e instanceof Error ? e.message : String(e);
      return `BREAK, the cable didn't open at 360 baud (${why}); ${await this.breakInit()}`;
    }
    const reopen = performance.now() - t0;
    let echo = true;
    let sent = 0;
    let lowEnd = 0;
    let heard360 = "";
    try {
      this.rx.clear();
      sent = performance.now();
      await this.send(Uint8Array.of(0x00));
      // The echo comes back once the byte is on the line, so the low pulse is over. No echo: wait it out.
      await this.rx.take(1, 150).catch(() => ((echo = false), sleep(30)));
      lowEnd = performance.now();
      heard360 = this.heard();
    } finally {
      await this.setBaudRate(baudRate);
    }
    await sleep(20); // high (TiniH): reopening already took a few ms; TD5-Dash waits 75 ms on a Td5
    this.rx.clear();
    const ms = (n: number) => `${Math.round(n)} ms`;
    // The pulse itself is the UART's 25 ms; "echo after" includes the cable's USB latency.
    // No echo: say whether anything came from the cable at all, and how reading it went (#21).
    return `0x00 at 360 baud, reopen ${ms(reopen)}, ${echo ? `echo after ${ms(lowEnd - sent)}` : `no echo (${heard360})`}, then high ${ms(performance.now() - lowEnd)}`;
  }

  /** Fast init by holding BREAK for 25 ms with JS timers: runs a few ms long on macOS. */
  private async breakInit() {
    const t0 = performance.now();
    await this.port!.setSignals({ break: true });
    await sleep(25);
    const t1 = performance.now();
    await this.port!.setSignals({ break: false });
    await sleep(25);
    this.rx.clear();
    return `low about ${Math.round(t1 - t0)} ms`;
  }

  /** Send bytes as they are, without waiting for the echo. */
  private async send(bytes: Uint8Array) {
    if (!this.port?.writable) throw new Error("Port not open");
    const w = this.port.writable.getWriter();
    try {
      await bounded(w.write(bytes), writeLimitMs(bytes.length), WRITE_STUCK);
    } finally {
      w.releaseLock();
    }
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
      // A cable that stops taking data must not hold the page forever (#38).
      if (interByteMs > 0) {
        for (let i = 0; i < bytes.length; i++) {
          await bounded(w.write(bytes.subarray(i, i + 1)), writeLimitMs(1), WRITE_STUCK);
          if (i < bytes.length - 1) await sleep(interByteMs);
        }
      } else {
        await bounded(w.write(bytes), writeLimitMs(bytes.length), WRITE_STUCK);
      }
    } finally {
      w.releaseLock();
    }
    if (this.opts.echo !== false) await takeEcho(this.rx, bytes.length);
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
