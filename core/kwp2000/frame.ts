/**
 * KWP2000 (ISO 14230) framing. Vehicle independent.
 *
 * Frame:  [format] ([target] [source]) [payload ...] [checksum]
 *  - format with bit 7 set: addressed header, payload length in the low 6 bits
 *  - format without it:     the byte is just the payload length (no addresses)
 *  - checksum:              sum of all previous bytes, mod 256
 *
 * "payload" everywhere in this codebase means service id + data, e.g. [0x21, 0x09].
 */

export function checksum(bytes: ArrayLike<number>, len = bytes.length) {
  let s = 0;
  for (let i = 0; i < len; i++) s = (s + bytes[i]) & 0xff;
  return s;
}

export interface Addresses {
  /** ECU address, e.g. 0x13 for the Td5 engine ECU. */
  ecu: number;
  /** Our (tester) address, usually 0xF1 or 0xF7. */
  tester: number;
}

/** Short frame: [len] [payload...] [cs] */
export function shortFrame(payload: ArrayLike<number>): Uint8Array {
  const out = [payload.length, ...Array.from(payload)];
  out.push(checksum(out));
  return Uint8Array.from(out);
}

/**
 * Addressed frame: [0x80|len] [target] [source] [payload...] [cs] with physical addressing (one ECU),
 * or [0xC0|len] ... with functional addressing (every ECU that serves that function, e.g. 0x33 = OBD).
 */
export function addressedFrame(
  payload: ArrayLike<number>,
  target: number,
  source: number,
  mode: "physical" | "functional" = "physical",
  /** Added to the length in the format byte (see VehicleProfile.link.lengthOffset). */
  lengthOffset = 0,
): Uint8Array {
  const out = [(mode === "functional" ? 0xc0 : 0x80) | (payload.length + lengthOffset), target, source, ...Array.from(payload)];
  out.push(checksum(out));
  return Uint8Array.from(out);
}

/**
 * ISO 9141-2 (OBD over K-line with 5-baud init) frames: [0x68, 0x6A, tester, payload..., cs] out,
 * [0x48, 0x6B, ecu, payload..., cs] back. No length byte: frames are separated by silence.
 */
export function iso9141Frame(payload: ArrayLike<number>, tester: number): Uint8Array {
  const out = [0x68, 0x6a, tester, ...Array.from(payload)];
  out.push(checksum(out));
  return Uint8Array.from(out);
}

export function iso9141Response(payload: ArrayLike<number>, ecu: number): Uint8Array {
  const out = [0x48, 0x6b, ecu, ...Array.from(payload)];
  out.push(checksum(out));
  return Uint8Array.from(out);
}

export function parseIso9141(raw: Uint8Array): Frame {
  if (raw.length < 5 || checksum(raw, raw.length - 1) !== raw[raw.length - 1]) {
    throw new Error(`Bad ISO 9141 frame ${hex(raw)}`);
  }
  return { raw, addressed: true, payload: raw.subarray(3, raw.length - 1) };
}

/** How many bytes follow the first (format) byte of a frame. */
export function remainingLength(format: number) {
  return format & 0x80 ? (format & 0x3f) + 3 : format + 1;
}

export interface Frame {
  raw: Uint8Array;
  addressed: boolean;
  /** Service id + data, without header or checksum. */
  payload: Uint8Array;
}

export function parseFrame(raw: Uint8Array): Frame {
  if (checksum(raw, raw.length - 1) !== raw[raw.length - 1]) {
    throw new Error(`Bad checksum in ${hex(raw)}`);
  }
  const addressed = (raw[0] & 0x80) !== 0;
  return { raw, addressed, payload: raw.subarray(addressed ? 3 : 1, raw.length - 1) };
}

/** Standard KWP2000 service ids. Profiles may use others. */
export const SID = {
  startDiagnosticSession: 0x10,
  ecuReset: 0x11,
  clearDiagnosticInfo: 0x14,
  readDtcByStatus: 0x18,
  readEcuId: 0x1a,
  readDataByLocalId: 0x21,
  /** OBD-II (SAE J1979) modes travel as KWP2000 service ids too. */
  obdCurrentData: 0x01,
  obdReadDtcs: 0x03,
  obdClearDtcs: 0x04,
  securityAccess: 0x27,
  testerPresent: 0x3e,
  startCommunication: 0x81,
  stopCommunication: 0x82,
  negativeResponse: 0x7f,
} as const;

/** A positive response SID is the request SID + 0x40. */
export const positive = (sid: number) => sid + 0x40;

export const NRC: Record<number, string> = {
  0x10: "general reject",
  0x11: "service not supported",
  0x12: "sub-function not supported",
  0x21: "busy, repeat request",
  0x22: "conditions not correct",
  0x31: "request out of range",
  0x33: "security access denied",
  0x35: "invalid key",
  0x36: "exceeded number of attempts",
  0x37: "required time delay not expired",
  0x78: "response pending",
};

export class NegativeResponse extends Error {
  constructor(public service: number, public code: number) {
    super(`ECU refused service 0x${h2(service)}: ${NRC[code] ?? "code 0x" + h2(code)}`);
  }
}

export const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
export const hex = (b: ArrayLike<number>) => Array.from(b, h2).join(" ");
/** Big-endian unsigned 16 bit at index i. */
export const u16 = (d: ArrayLike<number>, i: number) => (d[i] << 8) | d[i + 1];
/** Big-endian signed 16 bit at index i. */
export const s16 = (d: ArrayLike<number>, i: number) => {
  const v = u16(d, i);
  return v & 0x8000 ? v - 0x10000 : v;
};
/** Number to two big-endian bytes (clamped to 0..65535). */
export const be16 = (v: number) => {
  const n = Math.max(0, Math.min(0xffff, Math.round(v)));
  return [(n >> 8) & 0xff, n & 0xff];
};
