import { kLineLink } from "./link/kline";
import { isLink, type Link, type TrafficEvent } from "./link/types";
import type { Fault, InitResult, Readiness, Values, VehicleProfile } from "./profile";
import type { Transport } from "./transport/types";

export type { TrafficEvent };

const SLOW_EVERY = 150; // poll cycles between slow group reads

/**
 * Runs one connection to one ECU using a VehicleProfile.
 * The K-line is half duplex (and an ELM327 handles one command at a time), so every exchange
 * goes through one queue.
 */
export class Session {
  private queue: Promise<unknown> = Promise.resolve();
  private polling = false;
  private connected = false;
  readonly state: Values = {};
  /** Group ids the ECU supports, decided after connect. */
  private activeGroups = new Set<string>();
  /** Channel keys whose only source groups are unsupported by this ECU. */
  unavailableChannels = new Set<string>();
  /** Raw K-line, ELM327 or simulator. */
  readonly link: Link;

  /** Pass a Link, or a Transport for raw K-line (a KKL cable or the simulator). */
  constructor(
    readonly profile: VehicleProfile,
    linkOrTransport: Link | Transport,
    onTraffic: (e: TrafficEvent) => void = () => {},
  ) {
    this.link = isLink(linkOrTransport) ? linkOrTransport : kLineLink(profile, linkOrTransport, onTraffic);
  }

  /** How the ECU was reached. */
  get init(): InitResult {
    return this.link.init;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async connect() {
    try {
      await this.exclusive(() => this.link.open((ecu, init) => this.profile.connect(ecu, this.state, init)));
      this.connected = true;
      this.decideAvailability();
      for (const id of this.profile.slowGroups ?? []) if (this.activeGroups.has(id)) await this.readGroup(id);
    } catch (e) {
      this.connected = false;
      await this.link.close();
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

  async readGroup(id: string, opts: { note?: string } = {}): Promise<Values> {
    const g = this.profile.groups.find((g) => g.id === id);
    if (!g) throw new Error(`Profile ${this.profile.id} has no group "${id}"`);
    const res = await this.exclusive(() => this.link.request(g.requestFor?.(this.state) ?? g.request, opts));
    const v = g.decode(res, this.state);
    Object.assign(this.state, v);
    return v;
  }

  /** Poll live data until stop(). Gives up after 5 failures in a row. */
  async poll(onValues: (v: Values) => void, onError: (e: unknown) => void) {
    const schedule = this.profile.schedule.filter((id) => this.activeGroups.has(id));
    const slowGroups = (this.profile.slowGroups ?? []).filter((id) => this.activeGroups.has(id));
    if (!schedule.length) {
      // Fault readers with no live data (and no keep-alive to send) have nothing to poll.
      if (!this.profile.channels.length) return;
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

  /**
   * Send one raw request through the queue, for tools (the CLI and MCP server). Check it with
   * core/safety.ts first: profiles are reviewed, raw requests are not.
   */
  rawRequest(payload: number[], many = false): Promise<Uint8Array[]> {
    return this.exclusive(async () =>
      many ? this.link.requestMany(payload, { note: "raw request" }) : [await this.link.request(payload, { note: "raw request" })],
    );
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

  /**
   * End the session and close the link. Never waits more than `closeWaitMs` for the queue: a request
   * stuck on a cable that stopped answering must not keep the port open forever (issue #38).
   */
  async disconnect() {
    this.stop();
    const end = this.profile.disconnect;
    const ending = this.connected && end ? this.exclusive(() => end(this.link)).catch(() => {}) : this.queue;
    this.connected = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([ending.then(() => this.queue), new Promise<void>((r) => (timer = setTimeout(r, this.closeWaitMs)))]);
    clearTimeout(timer);
    await this.link.close();
  }

  /** How long disconnect waits for what's still queued before closing the link anyway. */
  closeWaitMs = 2000;
}
