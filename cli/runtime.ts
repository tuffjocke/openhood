import { hex } from "../core/kwp2000/frame";
import { ElmLink } from "../core/link/elm327";
import { KlineLink } from "../core/link/kline";
import { detectAdapter } from "../core/link/open";
import type { Link, TrafficEvent } from "../core/link/types";
import type { AdapterKind, Fault, VehicleProfile } from "../core/profile";
import { checkReadOnly } from "../core/safety";
import { Session } from "../core/session";
import { SimulatedTransport } from "../core/transport/simulated";
import { SimulatedElm } from "../core/transport/simulated-elm";
import { getProfile, lookupCode, PROFILES } from "../profiles";
import { NodeSerialTransport } from "./node-serial";

const TRAFFIC_LINES = 500;

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
  private traffic: TrafficEvent[] = [];

  /** `unsafe` lets raw requests through without the read-only check. Never the default. */
  constructor(private opts: { unsafe?: boolean } = {}) {}

  private log = (e: TrafficEvent) => {
    this.traffic.push(e);
    if (this.traffic.length > TRAFFIC_LINES) this.traffic.shift();
  };

  private get s(): Session {
    if (!this.session) throw new UserError("Not connected. Call connect first.");
    return this.session;
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

  async connect(o: ConnectOptions) {
    await this.disconnect();
    const profile = getProfile(o.profile);
    if (!profile) throw new UserError(`No profile "${o.profile}". Known: ${PROFILES.map((p) => p.id).join(", ")}.`);
    this.traffic = [];
    const link = await this.openLink(profile, o);
    const s = new Session(profile, link, this.log);
    await s.connect();
    this.session = s;
    return {
      profile: profile.id,
      connectedThrough: link.adapter,
      init: s.init,
      unavailableChannels: [...s.unavailableChannels],
    };
  }

  private async openLink(profile: VehicleProfile, o: ConnectOptions): Promise<Link> {
    const allowed = profile.adapters ?? ["kkl"];
    if (!o.port) {
      if (o.simulateElmCan === undefined) return new KlineLink(profile, new SimulatedTransport(profile), this.log);
      if (!allowed.includes("elm327")) throw new UserError(`${profile.name} can't run through an ELM327 adapter.`);
      return new ElmLink(new SimulatedElm(profile, { can: o.simulateElmCan }), this.log);
    }
    const path = o.port;
    let kind = o.adapter && o.adapter !== "auto" ? o.adapter : undefined;
    let baudRate = profile.link.baudRate;
    if (!kind) {
      const found = await detectAdapter((b) => new NodeSerialTransport({ path, baudRate: b, echo: false }), this.log);
      kind = found?.kind ?? "kkl";
      if (found) baudRate = found.baudRate;
    } else if (kind === "elm327") baudRate = 38400;
    if (!allowed.includes(kind))
      throw new UserError(`${profile.name} needs ${allowed.includes("kkl") ? "a KKL cable" : "an ELM327-type adapter"}, but this is ${kind === "kkl" ? "a KKL cable (or nothing answered)" : "an ELM327 adapter"}.`);
    return kind === "elm327"
      ? new ElmLink(new NodeSerialTransport({ path, baudRate, echo: false }), this.log)
      : new KlineLink(profile, new NodeSerialTransport({ path, baudRate: profile.link.baudRate }), this.log);
  }

  async disconnect() {
    const s = this.session;
    this.session = null;
    if (s) await s.disconnect();
    return { connected: false };
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

  async faults(o: { pending?: boolean } = {}) {
    const stored = await this.s.readFaults();
    const out: Record<string, unknown> = { stored: stored.map((f) => this.describeFault(f)) };
    if (o.pending) out.pending = ((await this.s.readPending()) ?? []).map((f) => this.describeFault(f));
    const readiness = await this.s.readReadiness();
    if (readiness) out.readiness = readiness;
    return out;
  }

  async freezeFrame(code: string) {
    const fault = (await this.s.readFaults()).find((f) => f.code === code || f.id === code);
    if (!fault) throw new UserError(`${code} isn't stored right now.`);
    const values = await this.s.readFreezeFrame(fault);
    return { code, snapshot: values ? this.labelled(values) : null };
  }

  private labelled(values: Record<string, number>) {
    const out: Record<string, { value: number; unit: string; label: string }> = {};
    for (const c of this.s.profile.channels)
      if (values[c.key] !== undefined) out[c.key] = { label: c.label, unit: c.unit, value: Number(values[c.key].toFixed(c.decimals)) };
    return out;
  }

  /** Read every supported group once, or keep reading for `seconds` and report min, max and last. */
  async live(o: { seconds?: number } = {}) {
    const s = this.s;
    const ids = [...new Set(s.profile.schedule)].filter((id) => s.isActive(id));
    const end = performance.now() + Math.min(Math.max(o.seconds ?? 0, 0), 30) * 1000;
    const seen: Record<string, number[]> = {};
    do {
      for (const id of ids) for (const [k, v] of Object.entries(await s.readGroup(id))) (seen[k] ??= []).push(v);
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
    const verdict = checkReadOnly(payload);
    if (!verdict.ok && !this.opts.unsafe) throw new UserError(`Refused: ${verdict.reason}`);
    const answers = await this.s.rawRequest(payload, o.many);
    return { request: hex(payload), answers: answers.map((a) => hex(a)) };
  }

  /** Clear stored faults. Needs `confirm: true`; tells the caller what clearing does and doesn't do. */
  async clearFaults(o: { confirm?: boolean }) {
    if (o.confirm !== true)
      throw new UserError(
        "Clearing only erases the codes, it doesn't fix anything, and it can reset the emissions readiness checks. Ask the person first, then call again with confirm: true.",
      );
    await this.s.clearFaults();
    return { cleared: true, nowStored: (await this.s.readFaults()).map((f) => f.code ?? f.id) };
  }

  trafficLines(last = 60) {
    return this.traffic.slice(-last).map(
      (e) => `${(e.t / 1000).toFixed(3)} ${e.dir === "tx" ? "->" : "<-"} ${e.text ?? hex(e.bytes)}${e.note ? `  (${e.note})` : ""}`,
    );
  }
}

export function parseHex(text: string): number[] {
  const clean = text.replace(/0x/gi, "").replace(/[\s,]/g, "");
  if (!clean || !/^([0-9a-f]{2})+$/i.test(clean)) throw new UserError(`"${text}" isn't hex bytes, e.g. "01 0C" or "210A".`);
  return clean.match(/../g)!.map((b) => parseInt(b, 16));
}
