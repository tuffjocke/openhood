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
import type { EcuLink } from "@/core/profile";

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

/**
 * Descriptions of common generic (P0) codes from SAE J2012. Manufacturer codes (P1xxx etc.)
 * are shown as the bare code. Add more as needed, with a source.
 */
export const DESCRIPTIONS: Record<string, string> = {
  P0100: "Mass air flow circuit",
  P0101: "Mass air flow range/performance",
  P0102: "Mass air flow circuit low",
  P0103: "Mass air flow circuit high",
  P0110: "Intake air temperature circuit",
  P0115: "Coolant temperature circuit",
  P0120: "Throttle position sensor circuit",
  P0130: "O2 sensor circuit, bank 1 sensor 1",
  P0171: "System too lean, bank 1",
  P0172: "System too rich, bank 1",
  P0174: "System too lean, bank 2",
  P0175: "System too rich, bank 2",
  P0300: "Random or multiple cylinder misfire",
  P0301: "Cylinder 1 misfire",
  P0302: "Cylinder 2 misfire",
  P0303: "Cylinder 3 misfire",
  P0304: "Cylinder 4 misfire",
  P0305: "Cylinder 5 misfire",
  P0306: "Cylinder 6 misfire",
  P0325: "Knock sensor 1 circuit",
  P0335: "Crankshaft position sensor circuit",
  P0340: "Camshaft position sensor circuit",
  P0401: "EGR flow insufficient",
  P0420: "Catalyst efficiency below threshold, bank 1",
  P0430: "Catalyst efficiency below threshold, bank 2",
  P0442: "Evaporative system small leak",
  P0455: "Evaporative system large leak",
  P0500: "Vehicle speed sensor",
  P0505: "Idle control system",
  P0562: "System voltage low",
  P0563: "System voltage high",
};

export const describe = (code: string) => (DESCRIPTIONS[code] ? `${code} ${DESCRIPTIONS[code]}` : code);

export const faults = {
  read: async (ecu: EcuLink) => decodeDtcFrames(await ecu.requestMany([0x03], { note: "read trouble codes" })).map(describe),
  clear: async (ecu: EcuLink) => {
    await ecu.request([0x04], { note: "clear trouble codes" });
  },
  confidence: "community" as const,
};
