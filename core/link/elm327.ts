import { hex, NegativeResponse, positive, SID } from "../kwp2000/frame";
import type { CanRaw, EcuLink, ElmRoute, InitResult, RequestOptions, VehicleProfile } from "../profile";
import { D2_RANGE_MASK, D2_RANGES, d2Frame, reassembleD2 } from "../volvo-d2/frame";
import { TimeoutError, type ByteStream } from "../transport/types";
import { identifies, type Link, type Traffic } from "./types";

/**
 * An ELM327-compatible adapter (ELM327, OBDLink/STN, and the many clones), over USB or Bluetooth.
 * The adapter wakes the car and handles every OBD protocol, CAN included. We send hex requests as
 * text ("0100") and read text answers until the ">" prompt. Reference: the ELM327 datasheet
 * (Elm Electronics), sections on AT commands, protocols and multiline responses.
 *
 * Standard OBD-II by default: profiles opt in with adapters: ["elm327"]. A profile can also give an
 * ElmRoute (link.elm) for a manufacturer K-line protocol: the adapter is then set to that protocol,
 * wake-up address and headers instead of searching for OBD-II. Or "volvo-d2": Volvo's own messages
 * on CAN (core/volvo-d2), sent as raw frames.
 */

/** What an ELM327 needs to know about a profile's protocol: a K-line route, Volvo D2, or nothing (OBD-II). */
export type ElmMode = ElmRoute | "volvo-d2" | { can: CanRaw } | undefined;
export const elmModeFor = (p: VehicleProfile): ElmMode =>
  p.link.protocol === "volvo-d2" ? "volvo-d2" : p.link.protocol === "gmlan" && p.link.can ? { can: p.link.can } : p.link.elm;

const PROMPT = 0x3e; // ">"
const enc = new TextEncoder();
const dec = new TextDecoder();

/** Thrown for adapter error words other than NO DATA. */
export class AdapterError extends Error {}

const ERRORS: [RegExp, string][] = [
  [/UNABLE TO CONNECT/, "The adapter couldn't find the car's diagnostic connection. Is the ignition on?"],
  [/BUS INIT:.*ERROR/, "The adapter couldn't wake the car. Is the ignition on?"],
  [/CAN ERROR|BUS ERROR|FB ERROR|DATA ERROR|<RX ERROR/, "The adapter reported a connection error with the car."],
  [/BUFFER FULL/, "The adapter's buffer overflowed. A better adapter or a lower polling rate may help."],
  [/LV RESET/, "The adapter restarted because the car's voltage dropped."],
  [/STOPPED/, "The adapter stopped the request."],
  [/^\?$/, "The adapter didn't understand the request."],
  [/^ERROR$/, "The adapter reported an error."],
];

/**
 * Drop the adapter's chatter, raise its error words, and return what's left without spaces.
 * A line that still isn't data (a stray echo, a version string) is left for the parsers to ignore.
 */
function dataLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim().toUpperCase();
    if (!line || line === "OK" || line === "SEARCHING..." || /^BUS INIT:?\s*(\.\.\.)?\s*(OK)?$/.test(line)) continue;
    if (line === "NO DATA") continue;
    for (const [re, msg] of ERRORS) if (re.test(line)) throw new AdapterError(msg);
    out.push(line.replace(/\s+/g, ""));
  }
  return out;
}

const hexBytes = (text: string) => {
  const bytes: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) bytes.push(parseInt(text.slice(i, i + 2), 16));
  return bytes;
};

/**
 * Turn the lines an ELM327 printed for one request into response payloads, with headers off (ATH0).
 * Handles one line per answer (several ECUs answering) and CAN multi-frame answers,
 * which the adapter prints as a byte count line ("014") then "0:", "1:", ... lines.
 * Spaces may be on or off.
 *
 * Limit, from the datasheet's own example: when two ECUs send multi-frame answers at the same
 * time, their numbered lines interleave and can't be told apart without headers. That is why
 * ElmLink turns headers on for CAN cars and uses parseElmCanFrames instead.
 */
export function parseElmResponse(lines: string[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let multi: { count: number; bytes: number[] } | null = null;
  const finish = () => {
    if (multi) out.push(Uint8Array.from(multi.bytes.slice(0, multi.count)));
    multi = null;
  };
  for (const compact of dataLines(lines)) {
    const part = /^([0-9A-F]):([0-9A-F]*)$/.exec(compact);
    if (/^[0-9A-F]{3}$/.test(compact)) {
      finish();
      multi = { count: parseInt(compact, 16), bytes: [] };
    } else if (part && multi) {
      (multi as { bytes: number[] }).bytes.push(...hexBytes(part[2]));
    } else if (/^([0-9A-F]{2})+$/.test(compact)) {
      finish();
      out.push(Uint8Array.from(hexBytes(compact)));
    }
  }
  finish();
  return out;
}

/**
 * The same job with headers on (ATH1), for CAN cars. Every line is one CAN frame: the sender's
 * id (3 hex digits, or 8 on 29-bit CAN), then up to 8 bytes that start with the ISO 15765-2
 * frame type: 0L single frame of L bytes, 1L LL first frame of a long answer, 2N the frames
 * that follow, 3x flow control (ours, ignored). Long answers are put back together per sender,
 * so two ECUs answering at once can't get mixed up. Answers come back ordered by sender id,
 * which puts the engine (7E8) first. An answer with frames missing is dropped.
 */
export function parseElmCanFrames(lines: string[]): Uint8Array[] {
  const done: { id: number; bytes: number[] }[] = [];
  const open = new Map<number, { count: number; bytes: number[] }>();
  for (const compact of dataLines(lines)) {
    if (!/^[0-9A-F]+$/.test(compact)) continue;
    const idLength = compact.length % 2 ? 3 : 8;
    if (compact.length < idLength + 2) continue;
    const id = parseInt(compact.slice(0, idLength), 16);
    const data = hexBytes(compact.slice(idLength));
    const type = data[0] >> 4;
    if (type === 0) {
      const count = data[0] & 0x0f;
      if (count >= 1 && data.length > count) done.push({ id, bytes: data.slice(1, 1 + count) });
    } else if (type === 1 && data.length >= 2) {
      open.set(id, { count: ((data[0] & 0x0f) << 8) | data[1], bytes: data.slice(2) });
    } else if (type === 2) {
      open.get(id)?.bytes.push(...data.slice(1));
    }
  }
  for (const [id, m] of open) if (m.bytes.length >= m.count) done.push({ id, bytes: m.bytes.slice(0, m.count) });
  return done.sort((a, b) => a.id - b.id).map((m) => Uint8Array.from(m.bytes));
}

/**
 * CAN protocols are 6 to 9 (and A to C for user CAN) in the ELM327's protocol numbering.
 * ATDPN prints the number, with a leading "A" when it was found automatically: "A6".
 */
export function isCanProtocol(dpn: string): boolean {
  const d = dpn.trim().toUpperCase();
  const n = d.length === 2 && d[0] === "A" ? d[1] : d;
  return /^[6-9A-C]$/.test(n);
}

export class ElmLink implements Link {
  /** "simulator" when this is the demo: a pretend adapter in front of a pretend car. */
  readonly adapter: "elm327" | "simulator";
  init: InitResult = { kind: "adapter", can: false, protocol: "" };
  /** The adapter's own name, e.g. "ELM327 v1.5". */
  version = "";
  /** True once the adapter is printing CAN frames with their sender (ATH1). See parseElmCanFrames. */
  private headers = false;
  /** The header last set with ATSH, for a manufacturer route. */
  private header = "";
  /** The first request of a manufacturer route wakes the ECU, which takes a few seconds. */
  private woken = false;
  private route?: ElmRoute;
  private d2: boolean;
  private raw?: CanRaw;
  /** Volvo D2: the receive filter set now, and the answer ranges that worked, most recent first. */
  private filter = -1;
  private worked: number[] = [];

  constructor(
    private stream: ByteStream,
    private onTraffic: Traffic = () => {},
    mode?: ElmMode,
    opts: { demo?: boolean } = {},
  ) {
    this.d2 = mode === "volvo-d2";
    this.raw = typeof mode === "object" && "can" in mode ? mode.can : undefined;
    this.route = mode === "volvo-d2" || this.raw ? undefined : (mode as ElmRoute | undefined);
    this.adapter = opts.demo ? "simulator" : "elm327";
  }

  /** Send one line, return the lines printed before the ">" prompt. */
  async command(cmd: string, timeoutMs = 2000, note?: string, priv = false): Promise<string[]> {
    this.stream.flush();
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), text: cmd, note, private: priv });
    await this.stream.write(enc.encode(cmd + "\r"));
    let raw: Uint8Array;
    try {
      raw = await this.stream.readUntil(PROMPT, timeoutMs);
    } catch (e) {
      if (e instanceof TimeoutError) throw new TimeoutError(0, 0, "The adapter didn't answer.");
      throw e;
    }
    const text = dec.decode(raw).replace(/>$/, "");
    const lines = text
      .split(/[\r\n]+/)
      .map((l) => l.replace(/\0/g, "").trim())
      .filter((l) => l && l !== cmd);
    this.onTraffic({ t: performance.now(), dir: "rx", bytes: new Uint8Array(0), text: lines.join(" | ") });
    return lines;
  }

  async open(connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    await this.stream.open();
    this.headers = false;
    const name = (lines: string[]) => lines.find((l) => /ELM|STN|OBDLINK/i.test(l)) ?? "";
    this.version = name(await this.command("ATZ", 4000, "reset adapter"));
    // Some adapters print junk right after a reset. Ask for the name once more before giving up.
    if (!this.version) this.version = name(await this.command("ATI", 2000, "adapter name"));
    if (!this.version) throw new AdapterError("This doesn't look like an ELM327 adapter.");
    if (this.route) return this.openRoute(this.route, connect);
    if (this.d2) return this.openD2(connect);
    if (this.raw) return this.openRaw(this.raw, connect);
    // Echo off, no linefeeds, no spaces, no headers, adaptive timing, automatic protocol.
    for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.command(c);
    // The first OBD request makes the adapter search for the car's protocol (up to ~10 s).
    const first = parseElmResponse(await this.command("0100", 15000, "find the car's protocol"));
    if (!first.some((r) => r[0] === 0x41)) throw new TimeoutError(0, 0, "The car didn't answer the adapter. Is the ignition on?");
    const dpn = (await this.command("ATDPN"))[0] ?? "";
    let can = isCanProtocol(dpn);
    // On CAN, ask for headers so answers from several ECUs can be told apart. Some adapters
    // don't say which protocol they found ("0"), and some clones ignore ATH1, so go by what the
    // car's answer looks like with headers on: only CAN frames parse as CAN frames.
    if (can || !/^A?[1-9A-C]$/i.test(dpn.trim())) {
      await this.command("ATH1");
      const framed = parseElmCanFrames(await this.command("0100", 5000, "check the answer format"));
      this.headers = framed.some((r) => r[0] === 0x41);
      if (this.headers) can = true;
      else await this.command("ATH0");
    }
    const desc = (await this.command("ATDP"))[0] ?? "";
    this.init = { kind: "adapter", can, protocol: desc.replace(/^AUTO,\s*/i, "") };
    await connect(this, this.init);
  }

  /** A manufacturer protocol: fixed protocol, wake-up address and keep-alive; headers per request. */
  private async openRoute(r: ElmRoute, connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    const h = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
    const cmds = ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", `ATSP${r.protocol}`];
    if (r.initAddress !== undefined) cmds.push(`ATIIA${h(r.initAddress)}`);
    if (r.testerAddress !== undefined) cmds.push(`ATTA${h(r.testerAddress)}`);
    if (r.keepAlive) cmds.push(`ATWM${[...r.header(r.keepAlive.length), ...r.keepAlive].map(h).join("")}`);
    for (const c of cmds) await this.command(c);
    this.header = "";
    this.woken = false;
    const names = { 3: "ISO 9141-2, 5-baud wake-up", 4: "ISO 14230, 5-baud wake-up", 5: "ISO 14230, fast wake-up" };
    this.init = { kind: "adapter", can: false, protocol: names[r.protocol] };
    await connect(this, this.init);
  }

  /**
   * Volvo D2 on the fast CAN bus (OBD pins 6 and 14): ISO 15765-4 CAN with 29-bit ids at 500 kbit/s
   * (ATSP7), raw frames without the ISO-TP byte (ATCAF0), sent to 000FFFFE (ATCP00, ATSH0FFFFE),
   * headers on to see who answered, and a short wait for absent modules (ATST40, about 256 ms).
   * The settings are the ones a 2010 V50 owner published (README).
   */
  private async openD2(connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    for (const c of ["ATE0", "ATL0", "ATS0", "ATH1", "ATSP7", "ATCAF0", "ATCP00", "ATSH0FFFFE", "ATST40"]) await this.command(c);
    this.filter = -1;
    this.worked = [];
    this.init = { kind: "adapter", can: true, protocol: "Volvo D2, CAN 29 bit 500 kbit/s" };
    await connect(this, this.init);
  }

  /**
   * Raw CAN: ISO 15765-4 CAN with 11-bit ids at 500 kbit/s (ATSP6), formatting off (ATCAF0) so
   * frames go out and come in as they are, headers on to see who answered. As Trionic CAN Flasher
   * drives an ELM327 for the Saab Trionic 8.
   */
  private async openRaw(c: CanRaw, connect: (ecu: EcuLink, init: InitResult) => Promise<void>) {
    const h = (n: number, w: number) => n.toString(16).toUpperCase().padStart(w, "0");
    const st = Math.min(0xff, Math.max(1, Math.round((c.waitMs ?? 200) / 4)));
    for (const cmd of ["ATE0", "ATL0", "ATS0", "ATH1", "ATSP6", "ATCAF0", `ATSH${h(c.request, 3)}`, `ATCF${h(c.filter, 3)}`, `ATCM${h(c.mask, 3)}`, `ATST${h(st, 2)}`])
      await this.command(cmd);
    this.init = { kind: "adapter", can: true, protocol: "CAN 11 bit 500 kbit/s, raw frames" };
    await connect(this, this.init);
  }

  /** Every frame that answered one raw request: single frames from the answer id unwrapped, others raw. */
  private async askRaw(c: CanRaw, payload: number[], opts: RequestOptions): Promise<Uint8Array[]> {
    if (payload.length > 7) throw new Error("A raw CAN request is at most 7 bytes.");
    const frame = [payload.length, ...payload];
    while (frame.length < 8) frame.push(0);
    const lines = await this.command(frame.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(""), 5000, opts.note);
    const out: Uint8Array[] = [];
    for (const l of dataLines(lines)) {
      if (!/^[0-9A-F]{5,19}$/.test(l)) continue;
      const id = parseInt(l.slice(0, 3), 16);
      const data = hexBytes(l.slice(3));
      if (id === c.request + 8) {
        const n = data[0] & 0x0f;
        if (data[0] >> 4 === 0 && n > 0) out.push(Uint8Array.from(data.slice(1, 1 + n)));
      } else out.push(Uint8Array.from(data));
    }
    return out;
  }

  /** The first positive answer to a raw request; waits past "response pending". */
  private async requestRaw(c: CanRaw, payload: number[], opts: RequestOptions): Promise<Uint8Array> {
    const sid = payload[0];
    for (const a of await this.askRaw(c, payload, opts)) {
      if (a[0] === sid + 0x40) return a;
      if (a[0] === 0x7f && a[1] === sid && a[2] !== 0x78) throw new NegativeResponse(sid, a[2]);
    }
    throw new TimeoutError(0, 0, "No answer from the engine computer. Is the ignition on?");
  }

  /** One D2 request: try the answer ranges that worked first, then the rest. */
  private async askD2(payload: number[], opts: RequestOptions): Promise<Uint8Array> {
    const h8 = (n: number) => n.toString(16).toUpperCase().padStart(8, "0");
    const order = [...this.worked, ...D2_RANGES.filter((r) => !this.worked.includes(r))];
    const [module, service] = payload;
    for (const range of order) {
      if (range !== this.filter) {
        await this.command(`ATCF${h8(range)}`);
        await this.command(`ATCM${h8(D2_RANGE_MASK)}`);
        this.filter = range;
      }
      const lines = await this.command(d2Frame(payload).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(""), 3000, opts.note);
      const frames = dataLines(lines)
        .filter((l) => /^[0-9A-F]{10,24}$/.test(l))
        .map((l) => ({ id: parseInt(l.slice(0, 8), 16), data: hexBytes(l.slice(8)) }));
      for (const { payload: res } of reassembleD2(frames)) {
        if (res[0] !== module) continue;
        if (res[1] === service + 0x40) {
          this.worked = [range, ...this.worked.filter((r) => r !== range)];
          return Uint8Array.from(res);
        }
        if (res[1] === 0x7f && res[2] === service) throw new NegativeResponse(service, res[3]);
      }
    }
    throw new TimeoutError(0, 0, "No answer from this module.");
  }

  close() {
    return this.stream.close();
  }

  private async ask(payload: number[], opts: RequestOptions): Promise<Uint8Array[]> {
    if (this.route) {
      const header = this.route.header(payload.length).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join("");
      if (header !== this.header) {
        await this.command(`ATSH${header}`);
        this.header = header;
      }
    }
    const timeout = this.route && !this.woken ? 10000 : 3000;
    this.woken = true;
    const lines = await this.command(hex(Uint8Array.from(payload)).replace(/\s/g, ""), timeout, opts.note, identifies(payload));
    const sid = payload[0];
    const answers = this.headers ? parseElmCanFrames(lines) : parseElmResponse(lines);
    const ok = answers.filter((r) => r[0] === positive(sid));
    if (ok.length) return ok;
    const neg = answers.find((r) => r[0] === SID.negativeResponse && r[1] === sid && r[2] !== 0x78);
    if (neg) throw new NegativeResponse(neg[1], neg[2]);
    throw new TimeoutError(0, 0, "No answer from the car for this request.");
  }

  async request(payload: number[], opts: RequestOptions = {}) {
    if (this.d2) return this.askD2(payload, opts);
    if (this.raw) return this.requestRaw(this.raw, payload, opts);
    return (await this.ask(payload, opts))[0];
  }

  async requestMany(payload: number[], opts: RequestOptions & { windowMs?: number } = {}) {
    if (this.d2) return [await this.askD2(payload, opts)];
    if (this.raw) return this.askRaw(this.raw, payload, opts);
    return this.ask(payload, opts);
  }
}
