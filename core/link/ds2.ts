/**
 * BMW DS2 on the K-line: no wake-up, 9600 baud with even parity, and every message is
 *   address, length, control (or status), data..., XOR of all bytes before it
 * where length counts the whole message. A module answers from its own address, with status A0
 * when it did what was asked (A1 busy, A2 refused, B0 bad parameter, B1 can't do it now).
 * Sources: profiles/bmw-ds2/README.md.
 *
 * Profiles send [address, control, ...data] and get back [status, ...data] when the status is A0.
 * Any other status throws NegativeResponse(control, status).
 */
import { NegativeResponse, hex } from "../kwp2000/frame";
import type { EcuLink, InitResult, RequestOptions } from "../profile";
import { TimeoutError, sleep, type Transport } from "../transport/types";
import type { Link, Traffic } from "./types";

export const DS2_OK = 0xa0;

export function ds2Checksum(bytes: ArrayLike<number>): number {
  let x = 0;
  for (let i = 0; i < bytes.length; i++) x ^= bytes[i];
  return x;
}

/** [address, control, ...data] as one DS2 message. */
export function ds2Frame(payload: number[]): Uint8Array {
  const [address, ...rest] = payload;
  const f = [address, rest.length + 3, ...rest];
  return Uint8Array.from([...f, ds2Checksum(f)]);
}

/** A whole DS2 message back to [address, control or status, ...data], or null if it doesn't add up. */
export function parseDs2Frame(f: ArrayLike<number>): number[] | null {
  if (f.length < 4 || f[1] !== f.length || ds2Checksum(f) !== 0) return null;
  return [f[0], ...Array.from(f).slice(2, -1)];
}

export class Ds2Link implements Link {
  readonly adapter: "kkl" | "simulator";
  readonly init: InitResult = { kind: "fast" };
  private busy: Promise<unknown> = Promise.resolve();

  constructor(
    private transport: Transport,
    private onTraffic: Traffic = () => {},
  ) {
    this.adapter = transport.kind === "simulator" ? "simulator" : "kkl";
  }

  async open(connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    await this.transport.open();
    await connect(this, this.init);
  }

  close() {
    return this.transport.close();
  }

  request(payload: number[], opts: RequestOptions = {}): Promise<Uint8Array> {
    const run = this.busy.then(() => this.exchange(payload, opts));
    this.busy = run.catch(() => undefined);
    return run;
  }

  async requestMany(payload: number[], opts: RequestOptions = {}) {
    return [await this.request(payload, opts)];
  }

  private async exchange(payload: number[], opts: RequestOptions): Promise<Uint8Array> {
    const out = ds2Frame(payload);
    this.transport.flush();
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: out, note: opts.note });
    await this.transport.write(out);
    let head: Uint8Array;
    try {
      head = await this.transport.read(2, 300);
    } catch (e) {
      if (e instanceof TimeoutError) throw new TimeoutError(0, 0, "No answer from this module.");
      throw e;
    }
    if (head[0] !== payload[0] || head[1] < 4) throw new Error(`Unexpected DS2 answer start ${hex(head)} from ${hex([payload[0]])}.`);
    const rest = await this.transport.read(head[1] - 2, 500);
    const whole = Uint8Array.from([...head, ...rest]);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: whole });
    const parsed = parseDs2Frame(whole);
    if (!parsed) throw new Error(`The DS2 answer's checksum doesn't add up: ${hex(whole)}`);
    await sleep(20);
    const [, status, ...data] = parsed;
    if (status !== DS2_OK) throw new NegativeResponse(payload[1], status);
    return Uint8Array.from([status, ...data]);
  }
}
