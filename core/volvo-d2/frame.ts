/**
 * Volvo's own diagnostic messages on CAN, as VIDA sends them on the S40, V50, C30 and C70 (P1) and
 * on the S60, V70, XC70, S80 and XC90 (P2). Volvo calls the protocol D2. Sources, with the frames
 * they published: profiles/volvo-d2/README.md.
 *
 * Every request is one 8-byte frame to the 29-bit CAN id 000FFFFE:
 *   C8+n, module, service, data..., padding
 * where n counts the bytes after the first (module, service and data). A6 reads a value by id,
 * AE reads trouble codes, B9 reads an identification block. Answers come from an id that depends
 * on the module and the car, and start with the module and the service + 0x40 (AE → EE), or
 * 7F, service, reason when the module refuses.
 *
 * Long answers are split over frames. The first byte of each frame:
 *   bit 7  first frame       bit 6  last frame        bit 3  always set
 *   bits 0 to 2: how many bytes in this frame count, for the first and last frames (and a frame
 *   that is both). The frames in between carry 7 bytes each and count up in bits 0 to 2.
 * From the published answers: CB (one frame, 3 bytes), 8F (first, 7), 09 (middle), 4E (last, 6).
 */

export const D2_REQUEST_ID = 0x000ffffe;

/** One request frame: C8 + length, the payload (module, service, data), zero padding to 8 bytes. */
export function d2Frame(payload: number[]): number[] {
  if (payload.length < 2 || payload.length > 7) throw new Error("A Volvo D2 request is 2 to 7 bytes.");
  const out = [0xc8 + payload.length, ...payload];
  while (out.length < 8) out.push(0);
  return out;
}

/** The payload of a request frame, or null if it isn't one. */
export function parseD2Frame(frame: ArrayLike<number>): number[] | null {
  const n = frame[0] - 0xc8;
  if (frame.length !== 8 || n < 2 || n > 7) return null;
  return Array.from(frame).slice(1, 1 + n);
}

/** Split an answer payload into frames, the way the modules do. */
export function d2AnswerFrames(payload: number[]): number[][] {
  const pad = (f: number[]) => {
    while (f.length < 8) f.push(0);
    return f;
  };
  if (payload.length <= 7) return [pad([0xc8 | payload.length, ...payload])];
  const out = [pad([0x8f, ...payload.slice(0, 7)])];
  let i = 7;
  for (let n = 1; payload.length - i > 7; n++, i += 7) out.push(pad([0x08 | (n & 7), ...payload.slice(i, i + 7)]));
  const rest = payload.slice(i);
  out.push(pad([0x48 | rest.length, ...rest]));
  return out;
}

/**
 * Put answers back together from frames as they arrived, per sender id. An answer only counts
 * once its last frame is in; a frame that doesn't follow a first frame is dropped.
 */
export function reassembleD2(frames: { id: number; data: number[] }[]): { id: number; payload: number[] }[] {
  const done: { id: number; payload: number[] }[] = [];
  const open = new Map<number, number[]>();
  for (const { id, data } of frames) {
    const b = data[0];
    if (b === undefined) continue;
    const first = (b & 0x80) !== 0;
    const last = (b & 0x40) !== 0;
    const count = first || last ? b & 0x07 : 7;
    const bytes = data.slice(1, 1 + count);
    if (first) open.set(id, []);
    const acc = open.get(id);
    if (!acc) continue;
    acc.push(...bytes);
    if (last) {
      done.push({ id, payload: acc });
      open.delete(id);
    }
  }
  return done;
}

/**
 * The trouble codes in an answer to AE 11: module, EE, 11, then two bytes per code. Volvo shows
 * them with the module's short name in front: CEM-1A51, SRS-0024.
 */
export function parseD2Codes(payload: ArrayLike<number>): string[] {
  const out: string[] = [];
  for (let i = 3; i + 1 < payload.length; i += 2) {
    const code = ((payload[i] << 8) | payload[i + 1]).toString(16).toUpperCase().padStart(4, "0");
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Where answers come from. The id differs per module and per car, so the adapter's receive filter
 * (ATCF, ATCM) is tried range by range. Each range is one seen in a published log:
 * 0040 (2010 V50, 2008 C30 engine), 0060 (2008 C30 instruments), 0080 (2002 S80, S80 ME7 engine),
 * 0100 (a CEM on the fast bus), 0120 (2009 S60 engine, 2007 XC90 CEM). An open filter would let
 * every message on the bus through, which floods the adapter (reported on the V50).
 */
export const D2_RANGES = [0x00400000, 0x00600000, 0x00800000, 0x01000000, 0x01200000];
export const D2_RANGE_MASK = 0x1fe00000;
