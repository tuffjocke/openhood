/**
 * OBD-II mode 01 ("current data") parameters, SAE J1979.
 * Request [0x01, pid], response [0x41, pid, A, B, ...]: data bytes start at index 2.
 * Formulas are the published standard ones (see README for sources).
 *
 * Each group carries an `encode` used only by the simulator, kept next to `decode`.
 */
import { be16 } from "@/core/kwp2000/frame";
import type { Channel, Group, Values } from "@/core/profile";
import type { SimSnapshot } from "./simulator";

export const channels: Channel[] = [
  { key: "rpm", label: "Engine speed", unit: "rpm", decimals: 0, min: 0, max: 7000, confidence: "community" },
  { key: "speed", label: "Road speed", unit: "km/h", decimals: 0, min: 0, max: 200, confidence: "community" },
  { key: "load", label: "Engine load", unit: "%", decimals: 0, min: 0, max: 100, group: "engine", confidence: "community" },
  { key: "throttle", label: "Throttle", unit: "%", decimals: 0, min: 0, max: 100, group: "air", confidence: "community" },
  { key: "coolant", label: "Coolant", unit: "°C", decimals: 0, min: -20, max: 120, warnAbove: 108, confidence: "community" },
  { key: "airTemp", label: "Intake air", unit: "°C", decimals: 0, min: -20, max: 80, warnAbove: 60, group: "air", confidence: "community" },
  { key: "maf", label: "Air flow", unit: "g/s", decimals: 1, min: 0, max: 150, group: "air", confidence: "community" },
  { key: "map", label: "Manifold pressure", unit: "kPa", decimals: 0, min: 0, max: 250, group: "air", confidence: "community" },
  { key: "timing", label: "Timing advance", unit: "°", decimals: 1, min: -10, max: 50, group: "engine", confidence: "community" },
  { key: "stft", label: "Short fuel trim", unit: "%", decimals: 1, min: -25, max: 25, group: "fuel", confidence: "community" },
  { key: "ltft", label: "Long fuel trim", unit: "%", decimals: 1, min: -25, max: 25, group: "fuel", confidence: "community" },
  { key: "voltage", label: "Module voltage", unit: "V", decimals: 1, min: 10, max: 15, warnBelow: 12, confidence: "community" },
];

/** Is `pid` set in the supported-PID bitmasks that connect() stored in state? */
export function pidSupported(state: Readonly<Values>, pid: number): boolean {
  const base = Math.floor((pid - 1) / 32) * 32;
  const word = state[supportKey(base)];
  if (word === undefined) return false;
  return ((word >>> (31 - ((pid - 1) % 32))) & 1) === 1;
}

export const supportKey = (base: number) => `pidSupport${base.toString(16).padStart(2, "0")}`;

type SimGroup = Group & { encode(s: SimSnapshot): number[] };

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const trimDecode = (a: number) => ((a - 128) * 100) / 128;
const trimEncode = (pct: number) => byte((pct * 128) / 100 + 128);

/** One group per PID: key, pid, decode from data bytes, encode to data bytes. */
function pid(
  key: string,
  id: number,
  decode: (d: Uint8Array) => number,
  encode: (s: SimSnapshot) => number[],
): SimGroup {
  return {
    id: key,
    request: [0x01, id],
    provides: [key],
    available: (state) => pidSupported(state, id),
    decode: (r) => ({ [key]: decode(r.subarray(2)) }),
    encode: (s) => [0x41, id, ...encode(s)],
    confidence: "community",
  };
}

export const groups: SimGroup[] = [
  pid("load", 0x04, (d) => (d[0] * 100) / 255, (s) => [byte((s.load * 255) / 100)]),
  pid("coolant", 0x05, (d) => d[0] - 40, (s) => [byte(s.coolant + 40)]),
  pid("stft", 0x06, (d) => trimDecode(d[0]), (s) => [trimEncode(s.stft)]),
  pid("ltft", 0x07, (d) => trimDecode(d[0]), (s) => [trimEncode(s.ltft)]),
  pid("map", 0x0b, (d) => d[0], (s) => [byte(s.map)]),
  pid("rpm", 0x0c, (d) => ((d[0] << 8) | d[1]) / 4, (s) => be16(s.rpm * 4)),
  pid("speed", 0x0d, (d) => d[0], (s) => [byte(s.speed)]),
  pid("timing", 0x0e, (d) => d[0] / 2 - 64, (s) => [byte((s.timing + 64) * 2)]),
  pid("airTemp", 0x0f, (d) => d[0] - 40, (s) => [byte(s.airTemp + 40)]),
  pid("maf", 0x10, (d) => ((d[0] << 8) | d[1]) / 100, (s) => be16(s.maf * 100)),
  pid("throttle", 0x11, (d) => (d[0] * 100) / 255, (s) => [byte((s.throttle * 255) / 100)]),
  pid("voltage", 0x42, (d) => ((d[0] << 8) | d[1]) / 1000, (s) => be16(s.voltage * 1000)),
];
