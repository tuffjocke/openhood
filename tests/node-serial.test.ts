/**
 * The Node serial transport's fast init, on serialport's mock port (which echoes like a KKL cable):
 * the 25 ms low pulse is one 0x00 byte at 360 baud, then the port is back at the link's baud rate.
 * A Td5 on macOS woke this way and not with BREAK (issue #1).
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { SerialPortMock } from "serialport";
import { NodeSerialTransport, type Port } from "../cli/node-serial";

const PATH = "/dev/tty.kkl";
const MockBinding = SerialPortMock.binding;

/** Hands out mock ports and remembers each one with the baud rate it was opened at. */
class MockTransport extends NodeSerialTransport {
  opened: { baudRate: number; port: SerialPortMock }[] = [];
  constructor(private refuse360 = false) {
    super({ path: PATH, baudRate: 10400 });
  }
  protected createPort(o: { path: string; baudRate: number; parity: "none" | "even" }): Port {
    // A cable that can't do 360 baud: opening fails, like a driver that refuses the rate.
    const path = this.refuse360 && o.baudRate === 360 ? "/dev/missing" : o.path;
    const port = new SerialPortMock({ ...o, path, autoOpen: false });
    this.opened.push({ baudRate: o.baudRate, port });
    return port;
  }
}

const written = (p: SerialPortMock) => [...(p.port?.recording ?? [])];

describe("Node serial fast init", () => {
  afterEach(() => MockBinding.reset());

  it("sends one 0x00 at 360 baud, then reopens at the link's baud rate", async () => {
    MockBinding.createPort(PATH, { echo: true, record: true });
    const t = new MockTransport();
    await t.open();
    assert.match(String(await t.fastInit()), /^0x00 at 360 baud/);
    assert.deepEqual(
      t.opened.map((o) => o.baudRate),
      [10400, 360, 10400],
    );
    const [, slow, link] = t.opened;
    assert.deepEqual(written(slow.port), [0x00], "the 360-baud port sent exactly the wake-up byte");
    assert.equal(slow.port.isOpen, false);
    assert.equal(link.port.isOpen, true);
    await t.write(Uint8Array.of(0x81, 0x13, 0xf7, 0x81, 0x0c));
    assert.deepEqual(written(link.port), [0x81, 0x13, 0xf7, 0x81, 0x0c], "after the wake-up, frames go out at 10400");
    assert.deepEqual(await t.read(1, 20).catch(() => "nothing"), "nothing", "the echo was stripped");
    await t.close();
  });

  it("falls back to BREAK when the cable can't open at 360 baud", async () => {
    MockBinding.createPort(PATH, { echo: true, record: true });
    const t = new MockTransport(true);
    await t.open();
    await t.fastInit();
    assert.deepEqual(
      t.opened.map((o) => o.baudRate),
      [10400, 360, 10400],
    );
    const link = t.opened[2].port;
    assert.equal(link.isOpen, true);
    assert.deepEqual(written(link), [], "BREAK sends no bytes");
    await t.close();
  });
});
