import { basicChecks, ENGINE_SAFETY, unverifiedCheck, type CarCheck, type Finding, type Verdict } from "../core/checks";
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
import { carReportUrl, checkReportUrl } from "../core/report";
import { CMD } from "./command";
import { getProfile, lookupCode, PROFILES } from "../profiles";
import { needsTest, type CarReport } from "../profiles/car-reports";
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
  /** When the check on the live view started (performance.now()), while it runs. */
  private checkStarted = 0;
  /** The last result of each check run on this connection, for test_report. */
  private results = new Map<string, { title: string; findings: Finding[] }>();
  private traffic: TrafficEvent[] = [];
  /** What the live view shows (core/watch.ts), and who is watching. */
  private view: WatchState = emptyWatchState();
  private watchers = new Set<(e: WatchEvent) => void>();
  /** The live view's link, once the MCP server has started it; `connect` hands it to the agent. */
  liveView?: string;
  /** Set by the MCP server when npm has a newer openhood than this one; `connect` tells the agent. */
  update?: { running: string; latest: string };

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
    const state = structuredClone(this.view);
    // A page that opens mid-check picks up the pacer where it is.
    if (state.check && !state.check.findings) state.check.elapsedMs = performance.now() - this.checkStarted;
    return { type: "state", state, traffic: this.trafficLines(TRAFFIC_LINES, { keepAlive: true }) };
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
      if (!again) this.results.clear();
      this.lastConnect = o;
      this.keepAliveMisses = 0;
      this.setView({ status: "connected", adapter: link.adapter, unavailable: [...s.unavailableChannels], values: { ...this.view.values, ...this.shownValues(s.state) } });
      this.startKeepAlive();
      return {
        profile: profile.id,
        connectedThrough: link.adapter,
        init: s.init,
        unavailableChannels: [...s.unavailableChannels],
        ...(o.port ? { test: this.testAdvice(s) } : {}),
        ...(this.update
          ? {
              update: {
                ...this.update,
                how: "This is an older openhood. Tell the person, and offer to switch: change the MCP server's command to npx -y openhood@latest mcp (Claude Code: claude mcp remove openhood, then claude mcp add openhood -- npx -y openhood@latest mcp) and start a new session. Reading the car works meanwhile.",
              },
            }
          : {}),
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

  /**
   * Read the ECU's groups over and over for `seconds` (at least once each), and return every value
   * seen, in order. With `keys`, after the first round only the groups that gave one of them are
   * read, so a check samples its readings as fast as the line allows.
   */
  private async sample(s: Session, seconds: number, keys?: string[]) {
    let ids = [...new Set(s.profile.schedule)].filter((id) => s.isActive(id));
    const end = performance.now() + seconds * 1000;
    const seen: Record<string, number[]> = {};
    let first = true;
    do {
      const useful: string[] = [];
      for (const id of ids) {
        const got = await s.readGroup(id);
        this.gotValues(got);
        for (const [k, v] of Object.entries(got)) (seen[k] ??= []).push(v);
        if (!keys || Object.keys(got).some((k) => keys.includes(k))) useful.push(id);
      }
      if (first && keys && useful.length) ids = useful;
      first = false;
    } while (performance.now() < end);
    return seen;
  }

  private async readLive(s: Session, seconds: number) {
    const seen = await this.sample(s, Math.min(Math.max(seconds, 0), 30));
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

  /** The profile's checks, with the readings not verified yet checked right after idle (or at the end). */
  /**
   * Whether this car should get Openhood's test before anything else: when no car has run it with
   * this profile yet, or the profile has readings nobody has verified on a car. That's how readings
   * get verified, so it comes first.
   */
  private testAdvice(s: Session) {
    if (!needsTest(s.profile)) return { recommended: false };
    const unverified = s.profile.channels.filter((c) => c.confidence !== "verified" && !s.unavailableChannels.has(c.key)).map((c) => c.label);
    const tested = !needsTest({ ...s.profile, channels: [] });
    return {
      recommended: true,
      why: [
        tested ? "" : "No car has run Openhood's test with this profile yet.",
        unverified.length ? `${unverified.length} readings aren't verified on a car yet: ${unverified.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      next: "Before anything else, ask the person whether they have about ten minutes with the car parked, then call list_checks and go through the checks one at a time. Finish with test_report, with make, model and year.",
    };
  }

  private checksFor(s: Session): CarCheck[] {
    const own = s.profile.checks ?? basicChecks(s.profile.channels.map((c) => c.key));
    const open = unverifiedCheck(s.profile.channels.filter((c) => !s.unavailableChannels.has(c.key)));
    if (!open) return own;
    const at = own.findIndex((c) => c.id === "idle");
    return at < 0 ? [...own, open] : [...own.slice(0, at + 1), open, ...own.slice(at + 1)];
  }

  /** The test steps for the connected car, in order, with what to tell the person before each. */
  listChecks() {
    const s = this.s;
    return {
      how: "One check at a time: tell the person what to do in plain words (and the safety note first when the engine runs), wait until they say they're ready, then run_check. Explain each finding. The live view shows the check and, for the rev test, when to rev. Finish with test_report.",
      safety: ENGINE_SAFETY,
      checks: this.checksFor(s).map((c) => ({ id: c.id, title: c.title, ask: c.ask, seconds: c.seconds, engineRunning: !!c.engineRunning, done: this.results.has(c.id) })),
    };
  }

  /** Run one check: read faults and live values as it says, judge them, show it on the live view. */
  runCheck(id: string, o: { seconds?: number } = {}) {
    const check = this.checksFor(this.s).find((c) => c.id === id);
    if (!check) throw new UserError(`No check "${id}". Known: ${this.checksFor(this.s).map((c) => c.id).join(", ")}.`);
    return this.use(async (s) => {
      // Shorter on request (a quick look, tests), never longer than the check says.
      const seconds = Math.min(Math.max(o.seconds ?? check.seconds, 0), check.seconds, 120);
      this.checkStarted = performance.now();
      this.setView({ check: { id: check.id, title: check.title, ask: check.ask, seconds, elapsedMs: 0, findings: null } });
      try {
        const faultsBefore = check.faults ? await s.readFaults() : undefined;
        if (faultsBefore) this.gotFaults(faultsBefore, this.view.pending, this.view.readiness);
        const watch = check.watch.filter((k) => !s.unavailableChannels.has(k));
        const seen = seconds > 0 && watch.length ? await this.sample(s, seconds, watch) : {};
        const faultsAfter = check.faults && seconds > 0 ? await s.readFaults() : undefined;
        if (faultsAfter) this.gotFaults(faultsAfter, this.view.pending, this.view.readiness);
        const series = Object.fromEntries(watch.filter((k) => seen[k]).map((k) => [k, seen[k]]));
        const findings = check.judge({ series, faultsBefore, faultsAfter });
        this.results.set(check.id, { title: check.title, findings });
        this.setView({ check: { ...this.view.check!, findings } });
        const readings: Record<string, unknown> = {};
        for (const c of s.profile.channels) {
          const v = series[c.key];
          if (!v) continue;
          const r = (x: number) => Number(x.toFixed(c.decimals));
          readings[c.key] = { label: c.label, unit: c.unit, min: r(Math.min(...v)), max: r(Math.max(...v)), last: r(v[v.length - 1]), samples: v.length };
        }
        return { id: check.id, title: check.title, findings, readings };
      } catch (e) {
        this.setView({ check: null });
        throw e;
      }
    });
  }

  /**
   * What the checks found, as a public test report: a ready-made GitHub issue link. Fault codes only
   * with `includeFaults` (ask the person first); never the VIN, which Openhood doesn't read.
   */
  testReport(o: { car?: string; make?: string; model?: string; year?: number; engine?: string; adapterModel?: string; includeFaults?: boolean }) {
    const s = this.s;
    if (!this.results.size) throw new UserError("No checks run yet. Run them with run_check first.");
    const order = this.checksFor(s).map((c) => c.id);
    const results = [...this.results.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([id, r]) => ({ id, ...r, findings: o.includeFaults || (id !== "faults" && id !== "wiggle") ? r.findings : r.findings.map(hideCodes) }));
    const protocol = s.init.kind === "adapter" ? s.init.protocol || "ELM327" : s.init.kind === "fast" ? "KWP2000 fast init" : `5-baud init, ${s.init.protocol}`;
    const car = o.car ?? ([o.make, o.model, o.year, o.engine].filter(Boolean).join(" ") || undefined);
    const url = checkReportUrl({ car, adapterModel: o.adapterModel, profile: s.profile, connection: protocol, results });
    // The shared car list learns this car has been tested: each check's worst finding, nothing personal.
    const worst = (f: Finding[]): Verdict => (f.some((x) => x.verdict === "look") ? "look" : f.some((x) => x.verdict === "unclear") ? "unclear" : "ok");
    const real = s.link.adapter === "kkl" || s.link.adapter === "elm327";
    const carReport =
      real && o.make && o.model && o.year
        ? carReportUrl({
            make: o.make,
            model: o.model,
            year: o.year,
            ...(o.engine ? { engine: o.engine } : {}),
            profile: s.profile.id,
            date: new Date().toISOString().slice(0, 10),
            adapter: s.link.adapter,
            ...(o.adapterModel ? { adapterModel: o.adapterModel } : {}),
            protocol,
            result: "worked",
            checks: Object.fromEntries(results.map((r) => [r.id, worst(r.findings)])),
          })
        : undefined;
    return { results, url, ...(carReport ? { carReport } : {}) };
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

/** A finding about faults without the codes and names: how many, and whether it was fine. */
const hideCodes = (f: Finding): Finding =>
  f.verdict === "ok" ? f : { ...f, text: f.text.replace(/:.*$/, ". (Codes left out of the report.)") };

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
