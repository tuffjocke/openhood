import { hex, NegativeResponse, positive, SID } from "../kwp2000/frame";
import type { EcuLink, InitResult, RequestOptions } from "../profile";
import { TimeoutError, type ByteStream } from "../transport/types";
import type { Link, Traffic } from "./types";

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
 * Turn the lines an ELM327 printed for one request into response payloads.
 * Handles one line per answer (several ECUs answering) and CAN multi-frame answers,
 * which the adapter prints as a byte count line ("014") then "0:", "1:", ... lines.
 * Expects headers off (ATH0). Spaces may be on or off.
 */
export function parseElmResponse(lines: string[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let multi: { count: number; bytes: number[] } | null = null;
  const finish = () => {
    if (multi) out.push(Uint8Array.from(multi.bytes.slice(0, multi.count)));
    multi = null;
  };
  for (const raw of lines) {
    const line = raw.trim().toUpperCase();
    if (!line || line === "SEARCHING..." || /^BUS INIT:?\s*(\.\.\.)?\s*(OK)?$/.test(line)) continue;
    if (line === "NO DATA") continue;
    for (const [re, msg] of ERRORS) if (re.test(line)) throw new AdapterError(msg);
    const compact = line.replace(/\s+/g, "");
    const part = /^([0-9A-F]):([0-9A-F]*)$/.exec(compact);
    if (/^[0-9A-F]{3}$/.test(compact)) {
      finish();
      multi = { count: parseInt(compact, 16), bytes: [] };
    } else if (part && multi) {
      for (let i = 0; i + 1 < part[2].length; i += 2) multi.bytes.push(parseInt(part[2].slice(i, i + 2), 16));
    } else if (/^([0-9A-F]{2})+$/.test(compact)) {
      finish();
      const bytes: number[] = [];
      for (let i = 0; i < compact.length; i += 2) bytes.push(parseInt(compact.slice(i, i + 2), 16));
      out.push(Uint8Array.from(bytes));
    }
    // Anything else (a stray echo, a version string) is ignored.
  }
  finish();
  return out;
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

  constructor(
    private stream: ByteStream,
    private onTraffic: Traffic = () => {},
  ) {}

  /** Send one line, return the lines printed before the ">" prompt. */
  async command(cmd: string, timeoutMs = 2000, note?: string): Promise<string[]> {
    this.stream.flush();
    this.onTraffic({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), text: cmd, note });
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
    const id = await this.command("ATZ", 4000, "reset adapter");
    this.version = id.find((l) => /ELM|STN|OBDLINK/i.test(l)) ?? "";
    if (!this.version) throw new AdapterError("This doesn't look like an ELM327 adapter.");
    // Echo off, no linefeeds, no spaces, no headers, adaptive timing, automatic protocol.
    for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATAT1", "ATSP0"]) await this.command(c);
    // The first OBD request makes the adapter search for the car's protocol (up to ~10 s).
    const first = parseElmResponse(await this.command("0100", 15000, "find the car's protocol"));
    if (!first.some((r) => r[0] === 0x41)) throw new TimeoutError(0, 0, "The car didn't answer the adapter. Is the ignition on?");
    const dpn = (await this.command("ATDPN"))[0] ?? "";
    const desc = (await this.command("ATDP"))[0] ?? "";
    this.init = { kind: "adapter", can: isCanProtocol(dpn), protocol: desc.replace(/^AUTO,\s*/i, "") };
    await connect(this, this.init);
  }

  close() {
    return this.stream.close();
  }

  private async ask(payload: number[], opts: RequestOptions): Promise<Uint8Array[]> {
    const lines = await this.command(hex(Uint8Array.from(payload)).replace(/\s/g, ""), 3000, opts.note);
    const sid = payload[0];
    const answers = parseElmResponse(lines);
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
