/**
 * The website's serial transport, on a fake Web Serial port that echoes like a KKL cable and is as
 * strict as Chrome: close() refuses while a stream is locked, open() refuses an open port.
 * Fast init is one 0x00 byte at 360 baud, then the port is back at the link's baud rate (issue #1).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WebSerialTransport } from "../core/transport/webserial";

class FakePort {
  opens: number[] = [];
  /** Bytes written, with the baud rate they went out at. */
  written: { baudRate: number; bytes: number[] }[] = [];
  breaks: boolean[] = [];
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  private baudRate = 0;

  constructor(private refuse360 = false) {}

  async open(o: { baudRate: number }) {
    if (this.readable) throw new DOMException("The port is already open.", "InvalidStateError");
    this.opens.push(o.baudRate);
    if (this.refuse360 && o.baudRate === 360) throw new DOMException("Failed to open serial port.", "NetworkError");
    this.baudRate = o.baudRate;
    let echo: ReadableStreamDefaultController<Uint8Array> | undefined;
    this.readable = new ReadableStream<Uint8Array>({ start: (c) => void (echo = c) });
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push({ baudRate: this.baudRate, bytes: [...chunk] });
        echo?.enqueue(chunk.slice()); // the K-line echo
      },
    });
  }

  async close() {
    if (this.readable?.locked || this.writable?.locked) throw new TypeError("Cannot close a locked stream");
    this.readable = null;
    this.writable = null;
  }

  async setSignals(s: { break?: boolean }) {
    if (s.break !== undefined) this.breaks.push(s.break);
  }
}

const transport = (port: FakePort) => new WebSerialTransport({ baudRate: 10400, port: port as unknown as SerialPort });

describe("Web Serial fast init", () => {
  it("sends one 0x00 at 360 baud, then reopens at the link's baud rate", async () => {
    const port = new FakePort();
    const t = transport(port);
    await t.open();
    const how = await t.fastInit();
    assert.match(String(how), /^0x00 at 360 baud, reopen \d+ ms, (echo after \d+ ms|no echo), then high \d+ ms$/, "says how it woke the car");
    assert.deepEqual(port.opens, [10400, 360, 10400]);
    assert.deepEqual(port.written, [{ baudRate: 360, bytes: [0x00] }]);
    assert.deepEqual(port.breaks, [false], "no BREAK pulse, only the idle line");

    // The read loop follows the port across reopens: the echo of a frame arrives and is stripped.
    await t.write(Uint8Array.of(0x81, 0x13, 0xf7, 0x81, 0x0c));
    assert.deepEqual(port.written.at(-1), { baudRate: 10400, bytes: [0x81, 0x13, 0xf7, 0x81, 0x0c] });
    assert.equal(await t.read(1, 20).catch(() => "nothing"), "nothing");
    await t.close();
    assert.equal(port.readable, null, "closed cleanly");
  });

  it("falls back to BREAK when the cable can't open at 360 baud", async () => {
    const port = new FakePort(true);
    const t = transport(port);
    await t.open();
    const how = await t.fastInit();
    assert.match(String(how), /^BREAK, the cable didn't open at 360 baud/, "says it fell back to BREAK");
    assert.deepEqual(port.opens, [10400, 360, 10400]);
    assert.equal(port.written.length, 0, "BREAK sends no bytes");
    assert.deepEqual(port.breaks, [false, true, false]);
    await t.write(Uint8Array.of(0x81, 0x13, 0xf7, 0x81, 0x0c));
    assert.equal(port.written.at(-1)?.baudRate, 10400);
    await t.close();
  });
});
