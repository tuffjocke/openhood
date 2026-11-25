/**
 * A transport moves raw bytes between the app and the car.
 * It knows nothing about any vehicle.
 *
 * Implementations:
 *  - WebSerialTransport  a real KKL cable through the Web Serial API
 *  - SimulatedTransport  a fake ECU from a vehicle profile, in memory
 */
export interface Transport {
  readonly kind: "serial" | "simulator";
  open(): Promise<void>;
  close(): Promise<void>;
  /**
   * ISO 14230 fast init: K-line low 25 ms, high 25 ms. May return a few words on how the line was
   * woken and how long each part took, for the traffic log ("0x00 at 360 baud, low 25 ms, high 61 ms").
   */
  fastInit(): Promise<string | void>;
  /**
   * Send one address byte at 5 baud (ISO 9141 / ISO 14230 slow init): start bit, 8 data bits
   * LSB first, stop bit, 200 ms each. The rest of the handshake (sync byte, key bytes) is done
   * by the session with normal reads and writes.
   */
  fiveBaud(address: number): Promise<void>;
  /**
   * Send bytes. `interByteMs` > 0 sends them one at a time with that gap (KWP2000 P4),
   * for ECUs that drop bytes sent back to back.
   */
  write(bytes: Uint8Array, interByteMs?: number): Promise<void>;
  /** Resolve with exactly `n` bytes, or reject after `timeoutMs`. */
  read(n: number, timeoutMs: number): Promise<Uint8Array>;
  /**
   * Read one frame delimited by silence (ISO 9141-2 frames have no length byte): wait up to
   * `timeoutMs` for the first byte, then collect until the line has been quiet for `idleMs`.
   */
  readUntilIdle(idleMs: number, timeoutMs: number): Promise<Uint8Array>;
  /** Drop anything sitting in the receive buffer. */
  flush(): void;
  /** Change the line speed, for ECUs that answer at another rate. Optional: not every transport can. */
  setBaudRate?(baudRate: number): Promise<void>;
}

/**
 * A plain two-way byte pipe, for adapters that speak text (ELM327): a serial port with the
 * adapter's own baud rate, a Bluetooth adapter, or the simulated adapter.
 */
export interface ByteStream {
  open(): Promise<void>;
  close(): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  /** Resolve with everything up to and including `byte`, or reject after `timeoutMs`. */
  readUntil(byte: number, timeoutMs: number): Promise<Uint8Array>;
  /** Wait up to `timeoutMs` for anything, then collect until quiet for `idleMs`. */
  readUntilIdle(idleMs: number, timeoutMs: number): Promise<Uint8Array>;
  flush(): void;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Byte queue shared by transports. Bytes are pushed in as they arrive,
 * readers wait until enough are available.
 */
export class ByteQueue {
  private buf: number[] = [];
  private waiters: Array<() => void> = [];

  push(bytes: Uint8Array) {
    for (const b of bytes) this.buf.push(b);
    const w = this.waiters;
    this.waiters = [];
    w.forEach((fn) => fn());
  }

  clear() {
    this.buf = [];
  }

  /** Resolve when new bytes arrive or after `ms`, whichever comes first. */
  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      this.waiters.push(() => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  async takeUntilIdle(idleMs: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = performance.now() + timeoutMs;
    while (!this.buf.length) {
      const left = deadline - performance.now();
      if (left <= 0) throw new TimeoutError(1, 0);
      await this.wait(left);
    }
    for (;;) {
      const before = this.buf.length;
      await this.wait(idleMs);
      if (this.buf.length === before) break;
    }
    return Uint8Array.from(this.buf.splice(0, this.buf.length));
  }

  async takeUntil(byte: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const i = this.buf.indexOf(byte);
      if (i >= 0) return Uint8Array.from(this.buf.splice(0, i + 1));
      const left = deadline - performance.now();
      if (left <= 0) throw new TimeoutError(1, 0);
      await this.wait(left);
    }
  }

  async take(n: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = performance.now() + timeoutMs;
    while (this.buf.length < n) {
      const left = deadline - performance.now();
      if (left <= 0) throw new TimeoutError(n, this.buf.length);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    return Uint8Array.from(this.buf.splice(0, n));
  }
}

export class TimeoutError extends Error {
  constructor(wanted: number, got: number, message?: string) {
    super(message ?? `K-line timeout: wanted ${wanted} bytes, got ${got}`);
  }
}
