/**
 * Td5 live data: channels (what the UI shows) and groups (what we ask the ECU for).
 *
 * All groups use service 0x21 readDataByLocalIdentifier. Response payload looks like
 * [0x61, localId, ...data]. All values are big-endian. Each layout below is backed by at least
 * one open project or a Nanocom log format (sources in README.md), and was checked against the
 * raw bytes on a 1999 Defender with the engine idling (GitHub issue #1, tests/td5.test.ts).
 *
 * Each group carries an `encode` used only by the simulator, kept next to `decode`
 * so the two can never drift apart.
 */
import { be16, u16 } from "@/core/kwp2000/frame";
import type { Channel, Group } from "@/core/profile";
import type { SimSnapshot } from "./simulator";

export const channels: Channel[] = [
  { key: "rpm", label: "Engine speed", unit: "rpm", decimals: 0, min: 0, max: 4500, warnAbove: 4200, confidence: "verified" },
  { key: "boost", label: "Boost", unit: "bar", decimals: 2, min: -0.1, max: 1.6, warnAbove: 1.42, group: "air", confidence: "verified" },
  { key: "speed", label: "Road speed", unit: "km/h", decimals: 0, min: 0, max: 140, confidence: "verified" },
  { key: "coolant", label: "Coolant", unit: "°C", decimals: 0, min: 0, max: 120, warnAbove: 105, confidence: "verified" },
  { key: "fuelTemp", label: "Fuel", unit: "°C", decimals: 0, min: 0, max: 100, warnAbove: 80, group: "fuel", confidence: "verified" },
  { key: "airTemp", label: "Intake air", unit: "°C", decimals: 0, min: -20, max: 80, warnAbove: 60, group: "air", confidence: "verified" },
  { key: "maf", label: "Air mass", unit: "kg/h", decimals: 0, min: 0, max: 600, group: "air", confidence: "verified" },
  { key: "pedal", label: "Pedal sensor", unit: "V", decimals: 2, min: 0, max: 5, group: "engine", confidence: "verified" },
  { key: "battery", label: "Battery", unit: "V", decimals: 1, min: 10, max: 15, warnBelow: 12, confidence: "verified" },
];

type SimGroup = Group & { encode(s: SimSnapshot): number[] };

/** Temperatures are sent in 0.1 kelvin. */
const toK = (c: number) => be16(c * 10 + 2732);
const fromK = (raw: number) => (raw - 2732) / 10;

export const groups: SimGroup[] = [
  {
    id: "rpm",
    request: [0x21, 0x09],
    decode: (r) => ({ rpm: u16(r, 2) }),
    encode: (s) => [0x61, 0x09, ...be16(s.rpm)],
    confidence: "verified",
  },
  {
    id: "speed",
    request: [0x21, 0x0d],
    decode: (r) => ({ speed: r[2] }),
    encode: (s) => [0x61, 0x0d, Math.max(0, Math.min(255, Math.round(s.speed)))],
    confidence: "verified",
  },
  {
    id: "battery",
    request: [0x21, 0x10],
    decode: (r) => ({ battery: u16(r, 2) / 1000 }),
    encode: (s) => [0x61, 0x10, ...be16(s.battery * 1000), ...be16(s.battery * 1000)],
    confidence: "verified",
  },
  {
    id: "temperatures",
    request: [0x21, 0x1a],
    // four pairs of [value, raw sensor mV]: coolant, intake air, external air, fuel. External air
    // reads -50 °C at 5000 mV when no sensor is fitted (early Defenders), so it isn't shown.
    decode: (r) => ({ coolant: fromK(u16(r, 2)), airTemp: fromK(u16(r, 6)), fuelTemp: fromK(u16(r, 14)) }),
    encode: (s) => [
      0x61, 0x1a,
      ...toK(s.coolant), ...be16(0x0400),
      ...toK(s.airTemp), ...be16(0x0400),
      ...toK(s.airTemp - 4), ...be16(0x0400),
      ...toK(s.fuelTemp), ...be16(0x0400),
    ],
    confidence: "verified",
  },
  {
    id: "pedal",
    request: [0x21, 0x1b],
    // accelerator tracks 1 to 4 and the 5 V supply, in mV; we show track 1 in volts
    decode: (r) => ({ pedal: u16(r, 2) / 1000 }),
    encode: (s) => {
      const v = 500 + s.pedal * 40; // simulator only: about 0.5 V released to 4.5 V floored
      return [0x61, 0x1b, ...be16(v), ...be16(5000 - v), ...be16(v / 2), ...be16(2500 - v / 2), ...be16(5000)];
    },
    confidence: "verified",
  },
  {
    id: "manifold",
    request: [0x21, 0x1c],
    // [MAP (0.01 kPa), raw, MAF (0.1 kg/h), raw]; boost needs ambient from the "ambient" group
    decode: (r, state) => ({
      boost: (u16(r, 2) / 100 - (state.ambientKpa ?? 101.3)) / 100,
      maf: u16(r, 6) / 10,
    }),
    encode: (s) => [0x61, 0x1c, ...be16(s.mapKpa * 100), ...be16(0x0800), ...be16(s.maf * 10), ...be16(0x0800)],
    confidence: "verified",
  },
  {
    id: "ambient",
    request: [0x21, 0x23],
    decode: (r) => ({ ambientKpa: u16(r, 2) / 100 }),
    encode: (s) => [0x61, 0x23, ...be16(s.ambientKpa * 100), ...be16(0x0800)],
    confidence: "verified",
  },
];
