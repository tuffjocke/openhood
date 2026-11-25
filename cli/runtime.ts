import { hex } from "../core/kwp2000/frame";
import { ElmLink, elmModeFor } from "../core/link/elm327";
import { kLineLink } from "../core/link/kline";
import { detectAdapter } from "../core/link/open";
import type { Link, TrafficEvent } from "../core/link/types";
import type { AdapterKind, Fault, Readiness, Values, VehicleProfile } from "../core/profile";
import { emptyWatchState, type WatchEvent, type WatchState } from "../core/watch";
import { checkReadOnly } from "../core/safety";
import { Session } from "../core/session";
import { SimulatedTransport } from "../core/transport/simulated";
import { SimulatedElm } from "../core/transport/simulated-elm";
import { TimeoutError } from "../core/transport/types";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { carReportUrl } from "../core/report";
import { CMD } from "./command";
import { getProfile, lookupCode, PROFILES } from "../profiles";
import type { CarReport } from "../profiles/car-reports";
import { VEHICLE_NAMES } from "../profiles/names";
import { NodeSerialTransport } from "./node-serial";

const TRAFFIC_LINES = 500;
/** Idle time before the MCP server reads something to keep a K-line session open. ISO 14230's P3max is 5 s; a Td5 drops sooner. */
const KEEP_ALIVE_MS = 1000;
const KEEP_ALIVE_NOTE = "keep-alive";

export interface ConnectOptions {
  /** Profile id, e.g. "generic-obd2" or "land-rover-td5". */
  profile: string;
  /** Serial port path, e.g. /dev/ttyUSB0 or COM3. Leave out to use the simulator. */
  port?: string;
  /** "auto" (default) detects the adapter. */
  adapter?: "auto" | AdapterKind;
  /** Simulator only: pretend to be an ELM327 on a CAN car (true) or a K-line car (false). Default: KKL simulator. */
  simulateElmCan?: boolean;
}

/** Thrown for things the person or agent should fix; the message is meant to be shown as is. */
export class UserError extends Error {}

/**
 * One Openhood connection for the command line and the MCP server. Every method returns plain
 * data, so it can be printed or sent to an AI agent as JSON.
 */
export class Runtime {
  private session: Session | null = null;
  /** How the agent last connected, to connect the same way again when the car drops the session. */
  private lastConnect: ConnectOptions | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Tool calls in progress; the keep-alive waits for none. */
  private calls = 0;
  private keepAliveMisses = 0;
  private traffic: TrafficEvent[] = [];
  /** What the live view shows (core/watch.ts), and who is watching. */
  private view: WatchState = emptyWatchState();
  private watchers = new Set<(e: WatchEvent) => void>();
  /** The live view's link, once the MCP server has started it; `connect` hands it to the agent. */
  liveView?: string;

  /**
   * `unsafe` lets raw requests through without the read-only check. Never the default.
   * `keepAlive` (the MCP server): between tool calls, read something about once a second so a
   * K-line session stays open, and if the car drops it anyway, connect again once by itself.
   */
  constructor(private opts: { unsafe?: boolean; keepAlive?: boolean } = {}) {}

  private log = (e: TrafficEvent) => {
    this.traffic.push(e);
    if (this.traffic.length > TRAFFIC_LINES) this.traffic.shift();
    if (this.watchers.size) this.emit({ type: "traffic", line: trafficLine(e) });
  };

  /** A live view page is open. */
  get watching() {
    return this.watchers.size > 0;
  }

  /** Follow what this runtime reads. Starts with everything so far; returns a function to stop. */
  watch(fn: (e: WatchEvent) => void) {
    this.watchers.add(fn);
    fn(this.stateEvent());
    return () => void this.watchers.delete(fn);
  }

  private stateEvent(): WatchEvent {
    return { type: "state", state: structuredClone(this.view), traffic: this.trafficLines(TRAFFIC_LINES, { keepAlive: true }) };
  }

  private emit(e: WatchEvent) {
    for (const fn of this.watchers) {
      try {
        fn(e);
      } catch {} // a watcher that went away must not break the agent's call
    }
  }

  private setView(v: Partial<WatchState>) {
    this.view = { ...this.view, ...v };
    this.emit(this.stateEvent());
  }

  /** Values of the profile's channels only, without the profile's own working state. */
  private shownValues(v: Values): Values {
    const out: Values = {};
    for (const c of this.s.profile.channels) if (v[c.key] !== undefined) out[c.key] = v[c.key];
    return out;
  }

  private gotValues(v: Values) {
    const shown = this.shownValues(v);
    if (!Object.keys(shown).length) return;
    Object.assign(this.view.values, shown);
    this.emit({ type: "values", values: shown });
  }

  private gotFaults(faults: Fault[], pending: Fault[] | null, readiness: Readiness | null) {
    this.view = { ...this.view, faults, pending, readiness };
    this.emit({ type: "faults", faults, pending, readiness });
  }

  private get s(): Session {
    if (!this.session) throw new UserError("Not connected. Call connect first.");
    return this.session;
  }

  /**
   * Run a tool call on the car. With keepAlive, a timeout on a session the car has dropped
   * connects again and runs the call once more; a request the car just doesn't answer doesn't.
   */
  private async use<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    if (!this.session) throw new UserError("Not connected. Call connect first.");
    this.calls++;
    this.stopKeepAlive();
    try {
      if (this.opts.keepAlive && this.view.status === "lost") await this.reconnect();
      try {
        return await fn(this.s);
      } catch (e) {
        if (!this.opts.keepAlive || !(e instanceof TimeoutError) || (await this.answers(this.s))) throw e;
        await this.reconnect();
        return await fn(this.s);
      }
    } finally {
      this.calls--;
      this.startKeepAlive();
    }
  }

  /** A K-line session that ends when nothing is sent for a few seconds (KWP2000). KWP1281 links keep themselves alive, DS2 has no session, adapters keep their own. */
  private needsKeepAlive(s: Session) {
    return !!this.opts.keepAlive && s.init.kind !== "adapter" && (s.profile.link.protocol ?? "kwp2000") === "kwp2000";
  }

  /** The cheapest thing to read: the first group in the profile's schedule the ECU supports. */
  private keepAliveGroup(s: Session) {
    return s.profile.schedule.find((id) => s.isActive(id));
  }

  /** Whether the car still answers on this session. */
  private async answers(s: Session) {
    const id = this.keepAliveGroup(s);
    if (!id) return false;
    try {
      this.gotValues(await s.readGroup(id, { note: KEEP_ALIVE_NOTE }));
      return true;
    } catch {
      return false;
    }
  }

  private startKeepAlive() {
    this.stopKeepAlive();
    const s = this.session;
    if (!s || this.calls || this.view.status !== "connected" || !this.needsKeepAlive(s)) return;
    this.idleTimer = setTimeout(() => void this.keepAlive(s), KEEP_ALIVE_MS);
    this.idleTimer.unref?.(); // never what keeps the process running
  }

  private stopKeepAlive() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private async keepAlive(s: Session) {
    this.idleTimer = null;
    if (this.session !== s || this.calls) return;
    if (await this.answers(s)) this.keepAliveMisses = 0;
    else if (this.session === s && ++this.keepAliveMisses >= 3) {
      // The live view says so; the next tool call connects again.
      this.setView({ status: "lost", error: "The car stopped answering." });
      return;
    }
    this.startKeepAlive();
  }

  /** Connect again the way the agent last did, keeping the traffic and what was read. */
  private async reconnect() {
    const o = this.lastConnect;
    if (!o) throw new UserError("Not connected. Call connect first.");
    this.log({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), note: "the car dropped the session, connecting again" });
    await this.connect(o, { again: true });
  }

  profiles() {
    return PROFILES.map((p) => ({
      id: p.id,
      name: p.name,
      covers: p.covers,
      adapters: p.adapters ?? ["kkl"],
      status: p.status,
      vehicles: p.vehicles.map((v) => `${v.make} ${v.model} ${v.from} to ${v.to}, ${v.engine}`),
    }));
  }

  async ports() {
    return (await NodeSerialTransport.list()).map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      vendorId: p.vendorId,
      productId: p.productId,
    }));
  }

  explain(code: string) {
    const r = lookupCode(code);
    if (!r) throw new UserError(`"${code}" doesn't look like a fault code (a letter P, C, B or U and four digits).`);
    return { code: r.code, title: r.title ?? null, explanation: r.info ?? null };
  }

  async connect(o: ConnectOptions, { again = false } = {}) {
    await this.drop();
    this.lastConnect = null;
    const profile = getProfile(o.profile);
    if (!profile) throw new UserError(`No profile "${o.profile}". Known: ${PROFILES.map((p) => p.id).join(", ")}.`);
    if (!again) this.traffic = [];
    this.setView(again ? { status: "connecting", error: null } : { ...emptyWatchState(), status: "connecting", profileId: profile.id });
    try {
      const link = await this.openLink(profile, o);
      const s = new Session(profile, link, this.log);
      await s.connect();
      this.session = s;
      this.lastConnect = o;
      this.keepAliveMisses = 0;
      this.setView({ status: "connected", adapter: link.adapter, unavailable: [...s.unavailableChannels], values: { ...this.view.values, ...this.shownValues(s.state) } });
      this.startKeepAlive();
      return {
        profile: profile.id,
        connectedThrough: link.adapter,
        init: s.init,
        unavailableChannels: [...s.unavailableChannels],
        ...(this.liveView ? { liveView: this.liveView } : {}),
      };
    } catch (e) {
      this.setView({ status: "failed", error: (e instanceof Error ? e.message : String(e)).split("\n")[0] });
      throw e;
    }
  }

  private async openLink(profile: VehicleProfile, o: ConnectOptions): Promise<Link> {
    const allowed = profile.adapters ?? ["kkl"];
    if (!o.port) {
      if (o.simulateElmCan === undefined) return kLineLink(profile, new SimulatedTransport(profile), this.log);
      if (!allowed.includes("elm327")) throw new UserError(`${profile.name} can't run through an ELM327 adapter.`);
      return new ElmLink(new SimulatedElm(profile, { can: o.simulateElmCan }), this.log, elmModeFor(profile));
    }
    const path = o.port;
    let kind = o.adapter && o.adapter !== "auto" ? o.adapter : undefined;
    let baudRate = profile.link.baudRate;
    if (!kind && !allowed.includes("elm327")) kind = "kkl"; // nothing to detect, and no probe text on the K-line
    if (!kind) {
      const found = await detectAdapter((b) => new NodeSerialTransport({ path, baudRate: b, echo: false }), this.log);
      kind = found?.kind ?? "kkl";
      if (found) baudRate = found.baudRate;
    } else if (kind === "elm327") baudRate = 38400;
    if (!allowed.includes(kind))
      throw new UserError(`${profile.name} needs ${allowed.includes("kkl") ? "a KKL cable" : "an ELM327-type adapter"}, but this is ${kind === "kkl" ? "a KKL cable (or nothing answered)" : "an ELM327 adapter"}.`);
    return kind === "elm327"
      ? new ElmLink(new NodeSerialTransport({ path, baudRate, echo: false }), this.log, elmModeFor(profile))
      : kLineLink(profile, new NodeSerialTransport({ path, baudRate: profile.link.baudRate, parity: profile.link.parity }), this.log);
  }

  async disconnect() {
    this.lastConnect = null;
    await this.drop();
    return { connected: false };
  }

  private async drop() {
    this.stopKeepAlive();
    const s = this.session;
    this.session = null;
    if (s) {
      await s.disconnect();
      // What was read stays on the live view; only the status changes.
      this.setView({ status: "idle" });
    }
  }

  private describeFault(f: Fault) {
    const info = this.s.profile.faults?.explanations?.[f.id];
    return {
      id: f.id,
      code: f.code ?? null,
      name: f.name,
      state: f.state ?? null,
      title: info?.title ?? null,
      plain: info?.plain ?? null,
      causes: info?.causes ?? [],
      check: info?.check ?? null,
      urgency: info?.urgency ?? null,
    };
  }

  faults(o: { pending?: boolean } = {}) {
    return this.use(async (s) => {
      const stored = await s.readFaults();
      const out: Record<string, unknown> = { stored: stored.map((f) => this.describeFault(f)) };
      const pending = o.pending ? ((await s.readPending()) ?? []) : null;
      if (pending) out.pending = pending.map((f) => this.describeFault(f));
      const readiness = await s.readReadiness();
      if (readiness) out.readiness = readiness;
      this.gotFaults(stored, pending, readiness);
      return out;
    });
  }

  freezeFrame(code: string) {
    return this.use(async (s) => {
      const fault = (await s.readFaults()).find((f) => f.code === code || f.id === code);
      if (!fault) throw new UserError(`${code} isn't stored right now.`);
      const values = await s.readFreezeFrame(fault);
      return { code, snapshot: values ? this.labelled(values) : null };
    });
  }

  private labelled(values: Record<string, number>) {
    const out: Record<string, { value: number; unit: string; label: string }> = {};
    for (const c of this.s.profile.channels)
      if (values[c.key] !== undefined) out[c.key] = { label: c.label, unit: c.unit, value: Number(values[c.key].toFixed(c.decimals)) };
    return out;
  }

  /** Read every supported group once, or keep reading for `seconds` and report min, max and last. */
  live(o: { seconds?: number } = {}) {
    return this.use((s) => this.readLive(s, o.seconds ?? 0));
  }

  private async readLive(s: Session, seconds: number) {
    const ids = [...new Set(s.profile.schedule)].filter((id) => s.isActive(id));
    const end = performance.now() + Math.min(Math.max(seconds, 0), 30) * 1000;
    const seen: Record<string, number[]> = {};
    do {
      for (const id of ids) {
        const got = await s.readGroup(id);
        this.gotValues(got);
        for (const [k, v] of Object.entries(got)) (seen[k] ??= []).push(v);
      }
    } while (performance.now() < end);
    const out: Record<string, unknown> = {};
    for (const c of s.profile.channels) {
      const v = seen[c.key];
      if (!v) {
        if (s.unavailableChannels.has(c.key)) out[c.key] = { label: c.label, unavailable: true };
        continue;
      }
      const r = (x: number) => Number(x.toFixed(c.decimals));
      out[c.key] = { label: c.label, unit: c.unit, last: r(v[v.length - 1]), min: r(Math.min(...v)), max: r(Math.max(...v)), samples: v.length, confidence: c.confidence };
    }
    return out;
  }

  /** Send one raw request. Read-only requests only, unless started with the unsafe flag. */
  async request(o: { hex: string; many?: boolean }) {
    const payload = parseHex(o.hex);
    const verdict = checkReadOnly(payload, this.s.profile.link.protocol);
    if (!verdict.ok && !this.opts.unsafe) throw new UserError(`Refused: ${verdict.reason}`);
    const answers = await this.use((s) => s.rawRequest(payload, o.many));
    return { request: hex(payload), answers: answers.map((a) => hex(a)) };
  }

  /** Clear stored faults. Needs `confirm: true`; tells the caller what clearing does and doesn't do. */
  async clearFaults(o: { confirm?: boolean }) {
    if (o.confirm !== true)
      throw new UserError(
        "Clearing only erases the codes, it doesn't fix anything, and it can reset the emissions readiness checks. Ask the person first, then call again with confirm: true.",
      );
    // Not repeated after a reconnect: a clear that timed out may still have gone through.
    const s = this.s;
    this.calls++;
    this.stopKeepAlive();
    try {
      await s.clearFaults();
    } finally {
      this.calls--;
      this.startKeepAlive();
    }
    return this.use(async (s) => {
      const now = await s.readFaults();
      this.gotFaults(now, null, await s.readReadiness());
      return { cleared: true, nowStored: now.map((f) => f.code ?? f.id) };
    });
  }

  /** The last lines of traffic. Keep-alive reads are left out unless asked for: they'd crowd out the rest. */
  trafficLines(last = 60, { keepAlive = false } = {}) {
    let skip = false;
    const shown = keepAlive
      ? this.traffic
      : this.traffic.filter((e) => {
          if (e.dir === "tx") skip = e.note === KEEP_ALIVE_NOTE;
          return !skip;
        });
    return shown.slice(-last).map(trafficLine);
  }
}

const trafficLine = (e: TrafficEvent) => `${(e.t / 1000).toFixed(3)} ${e.dir === "tx" ? "->" : "<-"} ${e.text ?? hex(e.bytes)}${e.note ? `  (${e.note})` : ""}`;

const REPORTS_FILE = new URL("../profiles/car-reports.json", import.meta.url);

export interface RecordOptions extends ConnectOptions {
  make: string;
  model: string;
  year: number;
  engine?: string;
  /** What the adapter is sold as, e.g. "Vgate iCar Pro 2S". */
  adapterModel?: string;
  notes?: string;
}

/**
 * Connect, read, and add what was found to profiles/car-reports.json: make, model, year, adapter,
 * connection and whether it worked. Nothing personal (no VIN, no fault codes). A failed connection
 * is recorded too, since that's knowledge as well.
 */
export async function recordCar(
  rt: Runtime,
  o: RecordOptions,
): Promise<{ report: CarReport; saved: boolean; sendUrl: string }> {
  // In a clone of the repository the report goes into the file, ready for a pull request. Run from
  // the npm package there is no file to add to: the person sends it in with a pre-filled issue.
  const inRepo = existsSync(REPORTS_FILE);
  if (inRepo && !(o.make in VEHICLE_NAMES))
    throw new UserError(`"${o.make}" isn't in profiles/names.ts. Use the official make name: ${Object.keys(VEHICLE_NAMES).join(", ")}.`);
  if (inRepo && !VEHICLE_NAMES[o.make].includes(o.model))
    throw new UserError(
      `"${o.model}" isn't in profiles/names.ts under ${o.make} yet. Add it there with the manufacturer's official spelling, model only (no engine or trim), alphabetically. If you aren't sure of the spelling, ask the person.`,
    );
  if (!Number.isInteger(o.year) || o.year < 1980 || o.year > new Date().getFullYear() + 1) throw new UserError(`${o.year} isn't a model year.`);
  if (!o.port) throw new UserError("Recording needs the real car: add --port.");

  const plain = (t: string) => t.replace(/[^\p{L}\p{N} .,:;()'\/+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const base = { make: o.make, model: o.model, year: o.year, ...(o.engine ? { engine: o.engine } : {}), profile: o.profile, date: new Date().toISOString().slice(0, 10) };
  let report: CarReport;
  try {
    const c = await rt.connect(o);
    const init = c.init;
    const protocol = init.kind === "adapter" ? init.protocol || "unknown" : init.kind === "fast" ? "KWP2000 fast init" : `5-baud init, ${init.protocol}`;
    const adapter = c.connectedThrough === "elm327" ? "elm327" : "kkl";
    let result: CarReport["result"] = "worked";
    let values = 0;
    try {
      await rt.faults();
      values = Object.values(await rt.live()).filter((v) => !(v as { unavailable?: boolean }).unavailable).length;
    } catch {
      result = "partly";
    }
    const model = o.adapterModel?.replace(/[^\p{L}\p{N} .+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    report = { ...base, adapter, ...(model ? { adapterModel: model } : {}), protocol, result, values, ...(o.notes ? { notes: plain(o.notes) } : {}) };
  } catch (e) {
    if (e instanceof UserError) throw e;
    // A port that won't open says nothing about the car: don't record it.
    if (/cannot open|no such file|permission denied|access denied|port not open/i.test(String(e)))
      throw new UserError(`Couldn't open ${o.port}: ${e instanceof Error ? e.message : String(e)}. Check the port with: ${CMD} ports`);
    const why = (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 120);
    report = { ...base, adapter: o.adapter === "kkl" ? "kkl" : "elm327", protocol: "none", result: "failed", notes: plain(o.notes ? `${o.notes} (${why})` : why) };
  } finally {
    await rt.disconnect();
  }
  const sendUrl = carReportUrl(report as unknown as Record<string, unknown>);
  if (!inRepo) return { report, saved: false, sendUrl };
  const all = JSON.parse(readFileSync(REPORTS_FILE, "utf8")) as CarReport[];
  all.push(report);
  writeFileSync(REPORTS_FILE, JSON.stringify(all, null, 2) + "\n");
  return { report, saved: true, sendUrl };
}

export function parseHex(text: string): number[] {
  const clean = text.replace(/0x/gi, "").replace(/[\s,]/g, "");
  if (!clean || !/^([0-9a-f]{2})+$/i.test(clean)) throw new UserError(`"${text}" isn't hex bytes, e.g. "01 0C" or "210A".`);
  return clean.match(/../g)!.map((b) => parseInt(b, 16));
}
