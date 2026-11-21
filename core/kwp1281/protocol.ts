/**
 * KWP1281 (also written KW1281): the diagnostic protocol of Volkswagen Group cars from about 1990
 * to the early 2000s, on the K-line. Protocol facts only, no vehicle specifics.
 *
 * Sources (see THIRD_PARTY_NOTICES.md):
 *  - Blafusel.de, the best public description of the protocol (German).
 *  - KLineKWP1281Lib by domnulvlad (GPL-3.0): block titles, timings, fault and measuring block layouts,
 *    and the measuring block formulas ported below.
 *  - kwp1281_tool by Mike Naberezny (BSD-3-Clause): wake-up, sync byte and baud detection notes.
 *
 * In short: the tester sends the ECU's address at 5 baud (7 data bits, odd parity). The ECU answers
 * 0x55 (sync) and two keywords, 0x01 0x8A ("1281"). The tester confirms with the inverse of the
 * second keyword. From then on every byte is confirmed by the other side sending its inverse,
 * except the 0x03 that ends a block. A block is: length (counter + title + data + end), counter,
 * title, data, 0x03. The ECU starts by sending its identification blocks.
 */

/** Block titles. A request's title plays the part of a KWP2000 service id. */
export const TITLE = {
  /** Either side: "got it, nothing more to send". Also the keep-alive. */
  ack: 0x09,
  /** ECU: "can't do that". */
  refuse: 0x0a,
  /** Tester: end the session. */
  disconnect: 0x06,
  /** Tester: ask for the extra identification. */
  extraIdent: 0x00,
  /** Tester: read stored faults. Answered by `faults` blocks, then `ack`. */
  readFaults: 0x07,
  /** Tester: clear stored faults. Answered by `ack` (some ECUs send the fault list again). */
  clearFaults: 0x05,
  /** Tester: read a measuring block (group); data is the group number. */
  readGroup: 0x29,
  /** ECU: identification text. */
  ident: 0xf6,
  /** ECU: stored faults, 3 bytes each. */
  faults: 0xfc,
  /** ECU: a measuring block, 3 bytes per value (formula, a, b). */
  groupReading: 0xe7,
} as const;

/** The byte that ends every block. It gets no inverse back. */
export const BLOCK_END = 0x03;

/** Timings in ms, from KLineKWP1281Lib. Our timeouts are longer: browsers add USB latency. */
export const TIMING = {
  /** Before confirming the second keyword. */
  keywordConfirmMs: 40,
  /** Waiting for the sync byte after the 5-baud address. */
  syncTimeoutMs: 1000,
  /** Waiting for the first byte of an answer. */
  responseTimeoutMs: 2000,
  /** Waiting for the next byte inside a block, or for an inverse. */
  byteTimeoutMs: 150,
  /** The ECU drops the session if the tester stays quiet for long; send a keep-alive before that. */
  keepAliveMs: 400,
} as const;

/** The address byte sent at 5 baud: 7 bits plus odd parity in the top bit (engine is 0x01). */
export function addressByte(address: number) {
  const a = address & 0x7f;
  let ones = 0;
  for (let i = 0; i < 7; i++) ones += (a >> i) & 1;
  return ones % 2 === 1 ? a : a | 0x80;
}

/** The protocol number the keywords spell: 0x01 0x8A is 1281. Keyword 2 carries a parity bit. */
export const keywordProtocol = (kw1: number, kw2: number) => ((kw2 & 0x7f) << 7) | kw1;

/** One stored fault: a 16 bit code, an elaboration code (what is wrong with it), and whether it comes and goes. */
export interface StoredFault {
  code: number;
  elaboration: number;
  intermittent: boolean;
}

/**
 * Faults from the ECU's `faults` blocks (each starts with the title). FF FF 88 alone means none.
 * Each fault is code high, code low, elaboration; the top bit of the elaboration means intermittent.
 */
export function parseFaults(blocks: Uint8Array[]): StoredFault[] {
  const out: StoredFault[] = [];
  for (const b of blocks) {
    if (b[0] !== TITLE.faults) continue;
    for (let i = 1; i + 2 < b.length; i += 3) {
      const code = (b[i] << 8) | b[i + 1];
      const e = b[i + 2];
      if (code === 0xffff && e === 0x88) continue;
      out.push({ code, elaboration: e & 0x7f, intermittent: (e & 0x80) !== 0 });
    }
  }
  return out;
}

/**
 * How a fault code is shown. Codes 0x4000 to 0x7FFF are standard OBD codes (P, C, B, U);
 * everything else is a five-digit VAG code, like 00522.
 */
export function faultCodeText(code: number) {
  if (code >= 0x4000 && code <= 0x7fff) {
    const letter = "PCBU"[(code >> 12) - 4];
    const digit = ((code >> 8) & 0xf) >> 2;
    const rest = code - ((((code >> 12) << 4) | (digit << 2)) << 8);
    return `${letter}${digit}${rest.toString().padStart(3, "0")}`;
  }
  return code.toString().padStart(5, "0");
}

/** One value from a measuring block: the formula says how to turn the two bytes into a number. */
export interface Measurement {
  formula: number;
  a: number;
  b: number;
}

/** Split a `groupReading` block (title first) into its values. Text values with a length are skipped over. */
export function parseGroup(block: Uint8Array): Measurement[] {
  const out: Measurement[] = [];
  let i = 1;
  while (i < block.length) {
    const f = block[i];
    if (f === 0x5f || f === 0x76) {
      i += block[i + 1] + 2; // text or hex with a length byte
      continue;
    }
    if (f === 0x3f) break; // text to the end of the block
    if (f === 0xa0) {
      i += 6;
      continue;
    }
    if (i + 2 >= block.length) break;
    out.push({ formula: f, a: block[i + 1], b: block[i + 2] });
    i += 3;
  }
  return out;
}

/** What a reading is, so a profile can find it in whatever block the ECU keeps it. */
export type MeasureKind =
  | "rpm"
  | "temperature"
  | "voltage"
  | "speed"
  | "load"
  | "throttle"
  | "airflow"
  | "injection"
  | "ignition"
  | "lambda"
  | "pressure";

interface Formula {
  kind: MeasureKind;
  unit: string;
  value(a: number, b: number): number;
}

const s8 = (b: number) => (b <= 127 ? b : b - 256);

/**
 * The formulas for numeric readings an engine ECU sends, ported from KLineKWP1281Lib
 * (getMeasurementValue and getMeasurementUnits). `a` is the first byte after the formula
 * (NWb in the library), `b` the second (MWb).
 */
export const FORMULAS: Record<number, Formula> = {
  0x01: { kind: "rpm", unit: "rpm", value: (a, b) => a * b * 0.2 },
  0x02: { kind: "load", unit: "%", value: (a, b) => a * b * 0.002 },
  0x03: { kind: "throttle", unit: "°", value: (a, b) => a * b * 0.002 },
  0x04: { kind: "ignition", unit: "°", value: (a, b) => (b - 127) * a * -0.01 },
  0x05: { kind: "temperature", unit: "°C", value: (a, b) => (b - 100) * a * 0.1 },
  0x06: { kind: "voltage", unit: "V", value: (a, b) => a * b * 0.001 },
  0x07: { kind: "speed", unit: "km/h", value: (a, b) => a * b * 0.01 },
  0x0f: { kind: "injection", unit: "ms", value: (a, b) => a * b * 0.01 },
  0x12: { kind: "pressure", unit: "mbar", value: (a, b) => a * b * 0.04 },
  0x14: { kind: "lambda", unit: "%", value: (a, b) => ((b - 128) * a) / 128 },
  0x15: { kind: "voltage", unit: "V", value: (a, b) => a * b * 0.001 },
  0x16: { kind: "injection", unit: "ms", value: (a, b) => a * b * 0.001 },
  0x19: { kind: "airflow", unit: "g/s", value: (a, b) => (256 * b + a) / 180 },
  0x1a: { kind: "temperature", unit: "°C", value: (a, b) => b - a },
  0x1b: { kind: "ignition", unit: "°", value: (a, b) => (b - 128) * a * 0.01 },
  0x21: { kind: "load", unit: "%", value: (a, b) => (a === 0 ? 0 : (b / a) * 100) },
  0x2b: { kind: "voltage", unit: "V", value: (a, b) => (a * 255 + b) * 0.1 },
  0x74: { kind: "rpm", unit: "rpm", value: (a, b) => s8(a) * 256 + b },
  0x75: { kind: "temperature", unit: "°C", value: (a, b) => (b - 64) * a * 0.01 },
  0x80: { kind: "rpm", unit: "rpm", value: (a, b) => a * b },
  0x81: { kind: "load", unit: "%", value: (a, b) => (a * b) / 256 },
  0x83: { kind: "ignition", unit: "°", value: (a, b) => a * b * 0.5 - 30 },
  0x84: { kind: "throttle", unit: "°", value: (a, b) => a * b * 0.5 },
  0x85: { kind: "voltage", unit: "V", value: (a, b) => (a * b) / 256 },
  0x86: { kind: "speed", unit: "km/h", value: (a, b) => a * b },
  0x89: { kind: "injection", unit: "ms", value: (a, b) => a * b * 0.01 },
  0x8f: { kind: "ignition", unit: "°", value: (a, b) => (b - 128) * a * 0.01 },
  0x95: { kind: "temperature", unit: "°C", value: (a, b) => (b - 100) * a * 0.1 },
  0x96: { kind: "airflow", unit: "g/s", value: (a, b) => (256 * b + a) / 180 },
};

/** A reading's kind and value, or null for formulas we don't turn into numbers (text, switches). */
export function measure(m: Measurement): { kind: MeasureKind; unit: string; value: number } | null {
  const f = FORMULAS[m.formula];
  return f ? { kind: f.kind, unit: f.unit, value: f.value(m.a, m.b) } : null;
}
