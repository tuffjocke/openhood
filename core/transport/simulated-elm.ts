import type { SimulatedEcu, VehicleProfile } from "../profile";
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
 * are merged into one (multi-frame) answer, as ISO 15765-4 does.
 */
export class SimulatedElm implements ByteStream {
  private rx = new ByteQueue();
  private ecu: SimulatedEcu | null = null;
  private searched = false;
  private echo = true;
  private line = "";

  constructor(
    private profile: VehicleProfile,
    private opts: { can: boolean } = { can: true },
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
      return ["", "ELM327 v1.5"];
    }
    if (cmd === "ATE0") {
      this.echo = false;
      return ["OK"];
    }
    if (cmd === "ATI") return ["ELM327 v1.5"];
    if (cmd === "ATDPN") return [this.opts.can ? "A6" : "A5"];
    if (cmd === "ATDP") return [this.opts.can ? "AUTO, ISO 15765-4 (CAN 11/500)" : "AUTO, ISO 14230-4 (KWP FAST)"];
    if (cmd.startsWith("AT")) return ["OK"];
    if (!/^([0-9A-F]{2})+$/.test(cmd)) return ["?"];

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
    return [...prefix, ...frames.flatMap((f) => (this.opts.can && f.length > 7 ? multiFrame(f) : [f.map(h2).join("")]))];
  }
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
