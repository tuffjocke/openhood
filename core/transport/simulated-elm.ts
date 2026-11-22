import type { ElmRoute, SimulatedEcu, VehicleProfile } from "../profile";
import { d2AnswerFrames, parseD2Frame } from "../volvo-d2/frame";
import { ByteQueue, sleep, type ByteStream } from "./types";

const enc = new TextEncoder();
const dec = new TextDecoder();
const h2 = (b: number) => b.toString(16).toUpperCase().padStart(2, "0");

/**
 * A pretend ELM327 adapter in front of a profile's simulated ECU, for the demo and the tests.
 * Like the real thing with ATE0 ATS0 ATH0: answers are hex text without spaces, one line per
 * frame, CAN multi-frame answers as a byte count line then "0:", "1:" lines, then a ">" prompt.
 *
 * `can: true` pretends the car is on CAN: mode 03/07/0A answers get the count byte CAN uses and
 * are merged into one (multi-frame) answer, as ISO 15765-4 does. After ATH1 it prints whole CAN
 * frames with the sender's id (7E8), padded to 8 bytes, the way the datasheet shows them.
 *
 * The quirks are things real adapters are reported to do: `protocolNumber` overrides the ATDPN
 * answer ("0" = won't say), `ignoresHeaders` is a clone that says OK to ATH1 and changes nothing,
 * `junkAfterReset` prints rubbish in place of its name after ATZ.
 *
 * For a profile with an ELM327 route (link.elm) it plays a K-line adapter set up by hand: it only
 * answers once ATSP, ATIIA and ATSH match the route, prints "BUS INIT: ...OK" on the first request,
 * and strips headers and checksum as ATH0 does.
 *
 * For Volvo D2 (link.protocol "volvo-d2") it plays the CAN set-up a V50 owner published: it only
 * answers raw 8-byte frames once ATSP7, ATCAF0, ATCP00, ATSH0FFFFE and ATH1 are set, and only when
 * the answer's id passes the receive filter (ATCF, ATCM). Answers come split into D2 frames.
 */
export interface ElmQuirks {
  can: boolean;
  protocolNumber?: string;
  ignoresHeaders?: boolean;
  junkAfterReset?: boolean;
}

export class SimulatedElm implements ByteStream {
  private rx = new ByteQueue();
  private ecu: SimulatedEcu | null = null;
  private searched = false;
  private echo = true;
  private headers = false;
  private line = "";
  /** What a manufacturer route set: protocol, wake-up address and header. */
  private set: { sp?: string; iia?: string; sh?: string; cp?: string; caf?: string; cf?: string; cm?: string } = {};

  constructor(
    private profile: VehicleProfile,
    private opts: ElmQuirks = { can: true },
  ) {}

  async open() {}
  async close() {
    this.ecu = null;
  }
  flush() {
    this.rx.clear();
  }
  readUntil(byte: number, timeoutMs: number) {
    return this.rx.takeUntil(byte, timeoutMs);
  }
  readUntilIdle(idleMs: number, timeoutMs: number) {
    return this.rx.takeUntilIdle(idleMs, timeoutMs);
  }

  async write(bytes: Uint8Array) {
    this.line += dec.decode(bytes);
    let i: number;
    while ((i = this.line.indexOf("\r")) >= 0) {
      const cmd = this.line.slice(0, i).trim().toUpperCase().replace(/\s+/g, "");
      this.line = this.line.slice(i + 1);
      const reply = this.answer(cmd);
      await sleep(cmd.startsWith("AT") ? 2 : 15);
      this.rx.push(enc.encode((this.echo ? cmd + "\r" : "") + reply.join("\r") + "\r\r>"));
    }
  }

  private answer(cmd: string): string[] {
    if (cmd === "ATZ") {
      this.echo = true;
      this.searched = false;
      this.ecu = null;
      this.headers = false;
      this.set = {};
      return ["", this.opts.junkAfterReset ? "\u00ff\u00fe?" : "ELM327 v1.5"];
    }
    if (cmd.startsWith("ATSP")) this.set.sp = cmd.slice(4);
    if (cmd.startsWith("ATIIA")) this.set.iia = cmd.slice(5);
    if (cmd.startsWith("ATSH")) this.set.sh = cmd.slice(4);
    if (cmd.startsWith("ATCP")) this.set.cp = cmd.slice(4);
    if (cmd.startsWith("ATCAF")) this.set.caf = cmd.slice(5);
    if (cmd.startsWith("ATCF")) this.set.cf = cmd.slice(4);
    if (cmd.startsWith("ATCM")) this.set.cm = cmd.slice(4);
    if (cmd === "ATH1" || cmd === "ATH0") {
      if (!this.opts.ignoresHeaders) this.headers = cmd === "ATH1";
      return ["OK"];
    }
    if (cmd === "ATE0") {
      this.echo = false;
      return ["OK"];
    }
    if (cmd === "ATI") return ["ELM327 v1.5"];
    if (cmd === "ATDPN") return [this.opts.protocolNumber ?? (this.opts.can ? "A6" : "A5")];
    if (cmd === "ATDP") return [this.opts.can ? "AUTO, ISO 15765-4 (CAN 11/500)" : "AUTO, ISO 14230-4 (KWP FAST)"];
    if (cmd.startsWith("AT")) return ["OK"];
    if (!/^([0-9A-F]{2})+$/.test(cmd)) return ["?"];

    if (this.profile.link.protocol === "volvo-d2") return this.answerD2(cmd);
    const route = this.profile.link.elm;
    if (route) return this.answerRoute(route, cmd);

    const prefix: string[] = [];
    if (!this.searched) {
      this.searched = true;
      this.ecu = this.profile.simulator();
      prefix.push("SEARCHING...");
    }
    const payload: number[] = [];
    for (let i = 0; i < cmd.length; i += 2) payload.push(parseInt(cmd.slice(i, i + 2), 16));
    const res = this.ecu?.handle(Uint8Array.from(payload));
    if (!res) return [...prefix, "NO DATA"];
    let frames = (Array.isArray(res[0]) ? res : [res]) as number[][];
    if (this.opts.can && [0x43, 0x47, 0x4a].includes(frames[0]?.[0])) frames = [toCanDtcAnswer(frames)];
    return [...prefix, ...frames.flatMap((f) => this.print(f))];
  }

  /** A manufacturer protocol through the adapter: only answers when it was set up the way the route says. */
  private answerRoute(route: ElmRoute, cmd: string): string[] {
    const payload: number[] = [];
    for (let i = 0; i < cmd.length; i += 2) payload.push(parseInt(cmd.slice(i, i + 2), 16));
    const want = route.header(payload.length).map(h2).join("");
    const iia = route.initAddress === undefined ? undefined : h2(route.initAddress);
    if (this.set.sp !== String(route.protocol) || this.set.iia !== iia || this.set.sh !== want) return ["NO DATA"];
    const prefix: string[] = [];
    if (!this.searched) {
      this.searched = true;
      this.ecu = this.profile.simulator();
      prefix.push("BUS INIT: ...OK");
    }
    const res = this.ecu?.handle(Uint8Array.from(payload));
    if (!res) return [...prefix, "NO DATA"];
    const frames = (Array.isArray(res[0]) ? res : [res]) as number[][];
    return [...prefix, ...frames.map((f) => f.map(h2).join(""))];
  }

  /** Volvo D2: one raw request frame in, the module's answer frames out, with their CAN id. */
  private answerD2(cmd: string): string[] {
    const { sp, caf, cp, sh, cf, cm } = this.set;
    if (sp !== "7" || caf !== "0" || cp !== "00" || sh !== "0FFFFE" || !this.headers) return ["NO DATA"];
    const bytes: number[] = [];
    for (let i = 0; i < cmd.length; i += 2) bytes.push(parseInt(cmd.slice(i, i + 2), 16));
    const payload = parseD2Frame(bytes);
    if (!payload) return ["NO DATA"];
    this.ecu ??= this.profile.simulator();
    const req = Uint8Array.from(payload);
    const res = this.ecu.handle(req);
    if (!res) return ["NO DATA"];
    const id = this.ecu.responseId?.(req) ?? 0x00400000;
    const mask = cm === undefined ? 0 : parseInt(cm, 16);
    if (cf !== undefined && ((id & mask) >>> 0) !== ((parseInt(cf, 16) & mask) >>> 0)) return ["NO DATA"];
    const flat = (Array.isArray(res[0]) ? (res as number[][]).flat() : res) as number[];
    return d2AnswerFrames(flat).map((f) => id.toString(16).toUpperCase().padStart(8, "0") + f.map(h2).join(""));
  }

  private print(f: number[]): string[] {
    if (!this.opts.can) return [this.headers ? legacyFrame(f) : f.map(h2).join("")];
    if (this.headers) return canFrames(f);
    return f.length > 7 ? multiFrame(f) : [f.map(h2).join("")];
  }
}

/** A K-line or J1850 answer with headers on: three header bytes, the data, a checksum byte. */
const legacyFrame = (f: number[]) => [0x48, 0x6b, 0x10, ...f, 0x00].map(h2).join("");

/** ISO 15765-2 frames from the engine ECU (7E8) with headers on, each padded to 8 bytes. */
function canFrames(f: number[]): string[] {
  const line = (bytes: number[]) => {
    while (bytes.length < 8) bytes.push(0);
    return "7E8" + bytes.map(h2).join("");
  };
  if (f.length <= 7) return [line([f.length, ...f])];
  const out = [line([0x10 | (f.length >> 8), f.length & 0xff, ...f.slice(0, 6)])];
  for (let i = 6, n = 1; i < f.length; i += 7, n++) out.push(line([0x20 | (n % 16), ...f.slice(i, i + 7)]));
  return out;
}

/** K-line trouble code frames (three codes each, zero padded) to one CAN answer: SID, count, codes. */
function toCanDtcAnswer(frames: number[][]): number[] {
  const codes: number[] = [];
  for (const f of frames)
    for (let i = 1; i + 1 < f.length; i += 2) if (f[i] || f[i + 1]) codes.push(f[i], f[i + 1]);
  return [frames[0][0], codes.length / 2, ...codes];
}

/** How an ELM327 prints an ISO-TP multi-frame answer with headers off: "014", "0:...", "1:...". */
function multiFrame(f: number[]): string[] {
  const out = [f.length.toString(16).toUpperCase().padStart(3, "0")];
  let n = 0;
  for (let i = 0; i < f.length; n++) {
    const size = n === 0 ? 6 : 7;
    const chunk = f.slice(i, i + size);
    while (chunk.length < size) chunk.push(0); // padding, cut off again by the byte count
    out.push(`${(n % 16).toString(16).toUpperCase()}:${chunk.map(h2).join("")}`);
    i += size;
  }
  return out;
}
