import { kLineLink } from "./link/kline";
import { isLink, type Link, type TrafficEvent } from "./link/types";
import type { EcuLink, Fault, InitResult, Readiness, Values, VehicleProfile } from "./profile";
import { NO_ECHO, TimeoutError, WRITE_STUCK, type Transport } from "./transport/types";

export type { TrafficEvent };

const SLOW_EVERY = 150; // poll cycles between slow group reads
/** Reads missed in a row before polling gives up. */
const GIVE_UP_AFTER = 5;
/** Reads missed in a row before a session that can be woken again (Session.canWake) is woken. */
const WAKE_AFTER = 2;
/** Wake-ups tried, one after the other, before giving up on a car that has gone quiet. */
const WAKES = 2;

/**
 * The car answered on this session, then stopped (the cable still echoes, so it's the car's side).
 * `reason` is the last error.
 */
export class StoppedAnswering extends Error {
  constructor(readonly reason: unknown) {
    super("The car stopped answering.");
  }
}

/** A timeout from the car, not from the cable or computer side. */
const carWentQuiet = (e: unknown) => e instanceof TimeoutError && e.message !== NO_ECHO && e.message !== WRITE_STUCK;

/**
 * Runs one connection to one ECU using a VehicleProfile.
 * The K-line is half duplex (and an ELM327 handles one command at a time), so every exchange
 * goes through one queue.
 */
export class Session {
  private queue: Promise<unknown> = Promise.resolve();
  /** Counts up on every poll() and stop(): a poll loop runs while it is still its own number. */
  private run = 0;
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
    private onTraffic: (e: TrafficEvent) => void = () => {},
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

  /** The profile's connect, run on the link with this session's state. */
  private start = (ecu: EcuLink, init: InitResult) => this.profile.connect(ecu, this.state, init);

  async connect() {
    await this.connectWith(() => this.link.open(this.start));
  }

  private async connectWith(open: () => Promise<void>) {
    try {
      await this.exclusive(open);
      this.connected = true;
      this.decideAvailability();
      for (const id of this.profile.slowGroups ?? []) if (this.activeGroups.has(id)) await this.readGroup(id);
    } catch (e) {
      this.connected = false;
      await this.link.close();
      throw e;
    }
  }

  /**
   * A K-line session the ECU ends when it hears nothing for a while, and that the wake-up starts
   * again (KWP2000 or ISO 9141-2 through a KKL cable or the simulator). Adapters keep their own.
   */
  get canWake() {
    return !!this.link.wakeAgain;
  }

  private note(text: string) {
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), note: text });
  }

  /** End the old session if the profile does (the ECU may not hear it), then the wake-up and connect again. */
  private async again(open: () => Promise<void>) {
    const end = this.profile.disconnect;
    if (end) await end(this.link).catch(() => {});
    await open();
  }

  /**
   * Wake an ECU that has ended its session, on the link already open, and log in again (the profile's
   * connect). Only where `canWake`. Noted in the traffic.
   */
  async wake() {
    const wake = this.link.wakeAgain?.bind(this.link);
    if (!wake) throw new Error("This connection can't wake the car again.");
    this.note("the car stopped answering, waking it again");
    await this.exclusive(() => this.again(() => wake(this.start)));
  }

  /**
   * Connect again on the same link, for a person's Reconnect after the car stopped answering: stop
   * polling, end the old session, then connect as before. No new device to pick.
   */
  async reconnect() {
    this.stop();
    this.note("connecting again");
    const wake = this.link.wakeAgain?.bind(this.link);
    await this.connectWith(() => this.again(() => (wake ? wake(this.start) : this.link.open(this.start))));
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

  /**
   * Poll live data until stop(). Gives up after 5 failures in a row. Where the session can be woken
   * again (`canWake`), 2 misses in a row wake the ECU instead (#46): a K-line ECU that has ended its
   * session ignores everything until it gets the wake-up again. If that doesn't bring it back, it gives
   * up, with StoppedAnswering when the car had answered before.
   */
  async poll(onValues: (v: Values) => void, onError: (e: unknown) => void) {
    const schedule = this.profile.schedule.filter((id) => this.activeGroups.has(id));
    const slowGroups = (this.profile.slowGroups ?? []).filter((id) => this.activeGroups.has(id));
    if (!schedule.length) {
      // Fault readers with no live data (and no keep-alive to send) have nothing to poll.
      if (!this.profile.channels.length) return;
      onError(new Error("The ECU doesn't support any of the values this profile reads."));
      return;
    }
    const run = ++this.run;
    let i = 0;
    let misses = 0;
    /** A read worked on this poll. */
    let read = false;
    /** Woken since the last read that worked: another miss means waking doesn't help. */
    let woke = false;
    while (this.run === run) {
      const slow = slowGroups.length && i % SLOW_EVERY === SLOW_EVERY - 1;
      const id = slow ? slowGroups[(i / SLOW_EVERY) % slowGroups.length | 0] : schedule[i % schedule.length];
      i++;
      try {
        onValues(await this.readGroup(id));
        misses = 0;
        read = true;
        woke = false;
      } catch (e) {
        if (this.run !== run) return; // stopped meanwhile
        misses++;
        if (this.canWake) {
          if (misses < WAKE_AFTER) continue;
          if (!woke) {
            woke = true;
            misses = 0;
            if (await this.tryWakes(run)) continue;
            if (this.run !== run) return;
          }
        } else if (misses < GIVE_UP_AFTER) continue;
        this.run++;
        onError(read && carWentQuiet(e) ? new StoppedAnswering(e) : e);
        return;
      }
    }
  }

  /** Up to WAKES wake-ups, one after the other. True once the ECU has answered one and logged in again. */
  private async tryWakes(run: number) {
    for (let n = 0; n < WAKES && this.run === run; n++) {
      try {
        await this.wake();
        return true;
      } catch {}
    }
    return false;
  }

  stop() {
    this.run++;
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
