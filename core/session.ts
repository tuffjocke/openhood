import { addressedFrame, NegativeResponse, parseFrame, remainingLength, shortFrame, SID } from "./kwp2000/frame";
import type { EcuLink, Values, VehicleProfile } from "./profile";
import { sleep, type Transport } from "./transport/types";

export interface TrafficEvent {
  t: number;
  dir: "tx" | "rx";
  bytes: Uint8Array;
  note?: string;
}

const RESPONSE_TIMEOUT_MS = 300;
const SLOW_EVERY = 150; // poll cycles between slow group reads

/**
 * Runs one connection to one ECU using a VehicleProfile.
 * The K-line is half duplex, so every exchange goes through one queue.
 */
export class Session {
  private queue: Promise<unknown> = Promise.resolve();
  private polling = false;
  readonly state: Values = {};

  constructor(
    readonly profile: VehicleProfile,
    private transport: Transport,
    private onTraffic: (e: TrafficEvent) => void = () => {},
  ) {}

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  /** The EcuLink handed to profile code. Only call inside exclusive(). */
  private link: EcuLink = {
    request: async (payload, opts = {}) => {
      const { addresses, interMessageMs = 30 } = this.profile.link;
      const msg = opts.addressed ? addressedFrame(payload, addresses.ecu, addresses.tester) : shortFrame(payload);
      this.onTraffic({ t: performance.now(), dir: "tx", bytes: msg, note: opts.note });
      await this.transport.write(msg);

      for (;;) {
        const head = await this.transport.read(1, RESPONSE_TIMEOUT_MS);
        const rest = await this.transport.read(remainingLength(head[0]), RESPONSE_TIMEOUT_MS);
        const raw = new Uint8Array(1 + rest.length);
        raw[0] = head[0];
        raw.set(rest, 1);
        this.onTraffic({ t: performance.now(), dir: "rx", bytes: raw });
        const { payload: res } = parseFrame(raw);

        if (res[0] === SID.negativeResponse) {
          if (res[2] === 0x78) continue; // response pending, keep listening
          await sleep(interMessageMs);
          throw new NegativeResponse(res[1], res[2]);
        }
        await sleep(interMessageMs);
        return res;
      }
    },
  };

  async connect() {
    try {
      await this.transport.open();
      await this.exclusive(async () => {
        await this.transport.fastInit();
        await this.profile.connect(this.link);
      });
      for (const id of this.profile.slowGroups ?? []) await this.readGroup(id);
    } catch (e) {
      await this.transport.close();
      throw e;
    }
  }

  async readGroup(id: string): Promise<Values> {
    const g = this.profile.groups.find((g) => g.id === id);
    if (!g) throw new Error(`Profile ${this.profile.id} has no group "${id}"`);
    const res = await this.exclusive(() => this.link.request(g.request));
    const v = g.decode(res, this.state);
    Object.assign(this.state, v);
    return v;
  }

  /** Poll live data until stop(). Gives up after 5 failures in a row. */
  async poll(onValues: (v: Values) => void, onError: (e: unknown) => void) {
    const { schedule, slowGroups = [] } = this.profile;
    this.polling = true;
    let i = 0;
    let misses = 0;
    while (this.polling) {
      const slow = slowGroups.length && i % SLOW_EVERY === SLOW_EVERY - 1;
      const id = slow ? slowGroups[(i / SLOW_EVERY) % slowGroups.length | 0] : schedule[i % schedule.length];
      i++;
      try {
        onValues(await this.readGroup(id));
        misses = 0;
      } catch (e) {
        if (++misses >= 5) {
          this.polling = false;
          onError(e);
          return;
        }
      }
    }
  }

  stop() {
    this.polling = false;
  }

  readFaults(): Promise<string[]> {
    const f = this.profile.faults;
    if (!f) return Promise.resolve([]);
    return this.exclusive(() => f.read(this.link));
  }

  async clearFaults() {
    const f = this.profile.faults;
    if (!f?.clear) throw new Error("This profile cannot clear faults");
    await this.exclusive(() => f.clear!(this.link));
  }

  async disconnect() {
    this.stop();
    await this.queue;
    await this.transport.close();
  }
}
