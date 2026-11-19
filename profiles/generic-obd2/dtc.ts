/**
 * OBD-II trouble codes. Mode 03 reads stored codes, mode 04 clears them.
 *
 * On K-line each response frame is [0x43, code1hi, code1lo, code2hi, code2lo, code3hi, code3lo],
 * padded with 00 00. Several frames come back when there are more than three codes or more
 * than one ECU answers, so we use requestMany.
 *
 * Code bytes: top 2 bits = letter (P, C, B, U), next 2 bits = first digit, then 3 hex digits.
 * E.g. 01 71 -> P0171.
 */
import type { EcuLink, Fault } from "@/core/profile";
import { OBD_EXPLANATIONS, OBD_TITLES } from "../shared/obd-codes";
import { readFreezeFrame } from "./freeze";
import { readReadiness } from "./readiness";

const LETTERS = ["P", "C", "B", "U"];

export function decodeDtc(hi: number, lo: number): string {
  return (
    LETTERS[hi >> 6] +
    ((hi >> 4) & 0x3).toString() +
    (hi & 0xf).toString(16).toUpperCase() +
    lo.toString(16).toUpperCase().padStart(2, "0")
  );
}

export function encodeDtc(code: string): [number, number] {
  const letter = LETTERS.indexOf(code[0]);
  const n = parseInt(code.slice(1), 16);
  return [(letter << 6) | ((n >> 12) << 4) | ((n >> 8) & 0xf), n & 0xff];
}

export function decodeDtcFrames(frames: Uint8Array[]): string[] {
  const codes: string[] = [];
  for (const f of frames) {
    for (let i = 1; i + 1 < f.length; i += 2) {
      if (f[i] === 0 && f[i + 1] === 0) continue;
      const code = decodeDtc(f[i], f[i + 1]);
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

const toFault = (code: string): Fault => ({ id: code, code, name: OBD_TITLES[code] ?? "No description yet" });

export const faults = {
  read: async (ecu: EcuLink): Promise<Fault[]> =>
    decodeDtcFrames(await ecu.requestMany([0x03], { note: "read trouble codes" })).map(toFault),
  /** Mode 07: same frame format as mode 03, with response SID 0x47. */
  readPending: async (ecu: EcuLink): Promise<Fault[]> =>
    decodeDtcFrames(await ecu.requestMany([0x07], { note: "read pending codes" })).map(toFault),
  freezeFrame: readFreezeFrame,
  clear: async (ecu: EcuLink) => {
    await ecu.request([0x04], { note: "clear trouble codes" });
  },
  explanations: OBD_EXPLANATIONS,
  clearResetsReadiness: true,
  readiness: readReadiness,
  confidence: "community" as const,
};
