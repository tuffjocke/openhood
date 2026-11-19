/**
 * Td5 live data: channels (what the UI shows) and groups (what we ask the ECU for).
 *
 * All groups use service 0x21 readDataByLocalIdentifier. Response payload looks like
 * [0x61, localId, ...data]. Layouts and scalings are from community documentation of the
 * MSB/NNN ECU and have NOT been checked on a car yet: compare with the dash gauges and
 * the K-line traffic panel, then set confidence to "verified".
 *
 * Each group carries an `encode` used only by the simulator, kept next to `decode`
 * so the two can never drift apart.
 */
import { be16, u16 } from "@/core/kwp2000/frame";
import type { Channel, Group } from "@/core/profile";
import type { SimSnapshot } from "./simulator";

export const channels: Channel[] = [
  { key: "rpm", label: "Engine speed", unit: "rpm", decimals: 0, min: 0, max: 4500, warnAbove: 4200, confidence: "community" },
  { key: "boost", label: "Boost", unit: "bar", decimals: 2, min: -0.1, max: 1.6, warnAbove: 1.42, confidence: "community" },
  { key: "speed", label: "Road speed", unit: "km/h", decimals: 0, min: 0, max: 140, confidence: "community" },
  { key: "coolant", label: "Coolant", unit: "°C", decimals: 0, min: 0, max: 120, warnAbove: 105, confidence: "community" },
  { key: "fuelTemp", label: "Fuel", unit: "°C", decimals: 0, min: 0, max: 100, warnAbove: 80, confidence: "community" },
  { key: "airTemp", label: "Intake air", unit: "°C", decimals: 0, min: -20, max: 80, warnAbove: 60, confidence: "community" },
  { key: "maf", label: "Air mass", unit: "kg/h", decimals: 0, min: 0, max: 600, confidence: "community" },
  { key: "pedal", label: "Pedal", unit: "%", decimals: 0, min: 0, max: 100, confidence: "community" },
  { key: "battery", label: "Battery", unit: "V", decimals: 1, min: 10, max: 15, warnBelow: 12, confidence: "community" },
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
    confidence: "community",
  },
  {
    id: "speed",
    request: [0x21, 0x0d],
    decode: (r) => ({ speed: r[2] }),
    encode: (s) => [0x61, 0x0d, Math.max(0, Math.min(255, Math.round(s.speed)))],
    confidence: "community",
  },
  {
    id: "battery",
    request: [0x21, 0x10],
    decode: (r) => ({ battery: u16(r, 2) / 1000 }),
    encode: (s) => [0x61, 0x10, ...be16(s.battery * 1000), ...be16(s.battery * 1000)],
    confidence: "community",
  },
  {
    id: "temperatures",
    request: [0x21, 0x1a],
    // four pairs of [value, raw sensor]: coolant, intake air, external air, fuel
    decode: (r) => ({ coolant: fromK(u16(r, 2)), airTemp: fromK(u16(r, 6)), fuelTemp: fromK(u16(r, 14)) }),
    encode: (s) => [
      0x61, 0x1a,
      ...toK(s.coolant), ...be16(0x0400),
      ...toK(s.airTemp), ...be16(0x0400),
      ...toK(s.airTemp - 4), ...be16(0x0400),
      ...toK(s.fuelTemp), ...be16(0x0400),
    ],
    confidence: "community",
  },
  {
    id: "pedal",
    request: [0x21, 0x1b],
    decode: (r) => ({ pedal: u16(r, 2) / 100 }),
    encode: (s) => [0x61, 0x1b, ...be16(s.pedal * 100), ...be16(s.pedal * 100), ...be16(5000)],
    confidence: "community",
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
    confidence: "community",
  },
  {
    id: "ambient",
    request: [0x21, 0x23],
    decode: (r) => ({ ambientKpa: u16(r, 2) / 100 }),
    encode: (s) => [0x61, 0x23, ...be16(s.ambientKpa * 100), ...be16(0x0800)],
    confidence: "community",
  },
];
