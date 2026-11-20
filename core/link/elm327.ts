import { hex, NegativeResponse, positive, SID } from "../kwp2000/frame";
import type { EcuLink, InitResult, RequestOptions } from "../profile";
import { TimeoutError, type ByteStream } from "../transport/types";
import { identifies, type Link, type Traffic } from "./types";

/**
 * An ELM327-compatible adapter (ELM327, OBDLink/STN, and the many clones), over USB or Bluetooth.
 * The adapter wakes the car and handles every OBD protocol, CAN included. We send hex requests as
 * text ("0100") and read text answers until the ">" prompt. Reference: the ELM327 datasheet
 * (Elm Electronics), sections on AT commands, protocols and multiline responses.
 *
 * Only standard OBD-II requests make sense through it: profiles opt in with adapters: ["elm327"].
 */

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
  readonly adapter = "elm327" as const;
  init: InitResult = { kind: "adapter", can: false, protocol: "" };
  /** The adapter's own name, e.g. "ELM327 v1.5". */
  version = "";
  /** True once the adapter is printing CAN frames with their sender (ATH1). See parseElmCanFrames. */
  private headers = false;

  constructor(
    private stream: ByteStream,
    private onTraffic: Traffic = () => {},
  ) {}

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

  close() {
    return this.stream.close();
  }

  private async ask(payload: number[], opts: RequestOptions): Promise<Uint8Array[]> {
    const lines = await this.command(hex(Uint8Array.from(payload)).replace(/\s/g, ""), 3000, opts.note, identifies(payload));
    const sid = payload[0];
    const answers = this.headers ? parseElmCanFrames(lines) : parseElmResponse(lines);
    const ok = answers.filter((r) => r[0] === positive(sid));
    if (ok.length) return ok;
    const neg = answers.find((r) => r[0] === SID.negativeResponse && r[1] === sid && r[2] !== 0x78);
    if (neg) throw new NegativeResponse(neg[1], neg[2]);
    throw new TimeoutError(0, 0, "No answer from the car for this request.");
  }

  async request(payload: number[], opts: RequestOptions = {}) {
    return (await this.ask(payload, opts))[0];
  }

  requestMany(payload: number[], opts: RequestOptions & { windowMs?: number } = {}) {
    return this.ask(payload, opts);
  }
}
