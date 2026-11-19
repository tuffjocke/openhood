import {
  addressedFrame,
  NegativeResponse,
  parseFrame,
  positive,
  remainingLength,
  shortFrame,
  SID,
} from "./kwp2000/frame";
import type { EcuLink, Fault, Readiness, RequestOptions, Values, VehicleProfile } from "./profile";
import { sleep, TimeoutError, type Transport } from "./transport/types";

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
  /** Group ids the ECU supports, decided after connect. */
  private activeGroups = new Set<string>();
  /** Channel keys whose only source groups are unsupported by this ECU. */
  unavailableChannels = new Set<string>();

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

  /** Send one request frame. */
  private async send(payload: number[], opts: RequestOptions) {
    const { addresses, addressMode = "physical", alwaysAddressed = false } = this.profile.link;
    const addressed = opts.addressed ?? alwaysAddressed;
    const msg = addressed
      ? addressedFrame(payload, addresses.ecu, addresses.tester, addressMode)
      : shortFrame(payload);
    this.transport.flush(); // drop late answers from earlier requests
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: msg, note: opts.note });
    await this.transport.write(msg);
  }

  /** Read one frame and return its payload, logging it. */
  private async readFrame(timeoutMs: number): Promise<Uint8Array> {
    const head = await this.transport.read(1, timeoutMs);
    const rest = await this.transport.read(remainingLength(head[0]), RESPONSE_TIMEOUT_MS);
    const raw = new Uint8Array(1 + rest.length);
    raw[0] = head[0];
    raw.set(rest, 1);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: raw });
    return parseFrame(raw).payload;
  }

  /**
   * Wait for a response to `sid`: positive (sid + 0x40) or negative (7F sid code).
   * Frames meant for other requests are ignored. "Response pending" keeps waiting.
   */
  private async awaitResponse(sid: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = performance.now() + timeoutMs;
    for (;;) {
      const left = deadline - performance.now();
      if (left <= 0) throw new TimeoutError(1, 0);
      const res = await this.readFrame(left);
      if (res[0] === positive(sid)) return res;
      if (res[0] === SID.negativeResponse && res[1] === sid) {
        if (res[2] === 0x78) continue;
        throw new NegativeResponse(res[1], res[2]);
      }
    }
  }

  /** The EcuLink handed to profile code. Only call inside exclusive(). */
  private link: EcuLink = {
    request: async (payload, opts = {}) => {
      await this.send(payload, opts);
      try {
        return await this.awaitResponse(payload[0], RESPONSE_TIMEOUT_MS);
      } finally {
        await sleep(this.profile.link.interMessageMs ?? 30);
      }
    },
    requestMany: async (payload, opts = {}) => {
      await this.send(payload, opts);
      const out: Uint8Array[] = [];
      try {
        out.push(await this.awaitResponse(payload[0], RESPONSE_TIMEOUT_MS));
        for (;;) {
          try {
            out.push(await this.awaitResponse(payload[0], opts.windowMs ?? 80));
          } catch (e) {
            if (e instanceof TimeoutError) break;
            throw e;
          }
        }
        return out;
      } finally {
        await sleep(this.profile.link.interMessageMs ?? 30);
      }
    },
  };

  async connect() {
    try {
      await this.transport.open();
      await this.exclusive(async () => {
        await this.transport.fastInit();
        await this.profile.connect(this.link, this.state);
      });
      this.decideAvailability();
      for (const id of this.profile.slowGroups ?? []) if (this.activeGroups.has(id)) await this.readGroup(id);
    } catch (e) {
      await this.transport.close();
      throw e;
    }
  }

  private decideAvailability() {
    const groups = this.profile.groups;
    this.activeGroups = new Set(groups.filter((g) => g.available?.(this.state) ?? true).map((g) => g.id));
    const supplied = new Set(groups.filter((g) => this.activeGroups.has(g.id)).flatMap((g) => g.provides ?? []));
    this.unavailableChannels = new Set(
      groups
        .filter((g) => !this.activeGroups.has(g.id))
        .flatMap((g) => g.provides ?? [])
        .filter((k) => !supplied.has(k)),
    );
  }

  /** Whether the connected ECU supports this group. */
  isActive(id: string) {
    return this.activeGroups.has(id);
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
    const schedule = this.profile.schedule.filter((id) => this.activeGroups.has(id));
    const slowGroups = (this.profile.slowGroups ?? []).filter((id) => this.activeGroups.has(id));
    if (!schedule.length) {
      onError(new Error("The ECU doesn't support any of the values this profile reads."));
      return;
    }
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

  readReadiness(): Promise<Readiness | null> {
    const r = this.profile.faults?.readiness;
    if (!r) return Promise.resolve(null);
    return this.exclusive(() => r(this.link));
  }

  readPending(): Promise<Fault[] | null> {
    const r = this.profile.faults?.readPending;
    if (!r) return Promise.resolve(null);
    return this.exclusive(() => r(this.link));
  }

  readFreezeFrame(fault: Fault): Promise<Values | null> {
    const r = this.profile.faults?.freezeFrame;
    if (!r) return Promise.resolve(null);
    return this.exclusive(() => r(this.link, fault, this.state));
  }

  readFaults(): Promise<Fault[]> {
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
