/**
 * TEMPLATE PROFILE. Copy this folder to /profiles/<make>-<engine-or-ecu> and fill it in.
 * Guide: docs/adding-a-vehicle.md · Full example: /profiles/land-rover-td5
 *
 * Rules:
 *  - Every number you are not sure of gets confidence "community" or "guess", never "verified".
 *  - The simulator must speak the same bytes your decoders expect (put encode next to decode).
 *  - Register the profile in /profiles/index.ts, then run `npm run check`.
 */
import { be16, u16 } from "@/core/kwp2000/frame";
import type { Channel, Group, SimulatedEcu, VehicleProfile } from "@/core/profile";

// ---------------------------------------------------------------- channels (what the UI shows)

const channels: Channel[] = [
  { key: "rpm", label: "Engine speed", unit: "rpm", decimals: 0, min: 0, max: 7000, confidence: "guess" },
  { key: "coolant", label: "Coolant", unit: "°C", decimals: 0, min: 0, max: 120, warnAbove: 105, confidence: "guess" },
];

// ---------------------------------------------------------------- groups (what we ask the ECU)

interface Snapshot {
  rpm: number;
  coolant: number;
}
type SimGroup = Group & { encode(s: Snapshot): number[] };

const groups: SimGroup[] = [
  {
    id: "rpm",
    request: [0x21, 0x01], // TODO: real local id
    decode: (r) => ({ rpm: u16(r, 2) }),
    encode: (s) => [0x61, 0x01, ...be16(s.rpm)],
    confidence: "guess",
  },
  {
    id: "coolant",
    request: [0x21, 0x02], // TODO: real local id
    decode: (r) => ({ coolant: r[2] - 40 }),
    encode: (s) => [0x61, 0x02, Math.round(s.coolant + 40)],
    confidence: "guess",
  },
];

// ---------------------------------------------------------------- simulator

function createSimulator(): SimulatedEcu {
  const t0 = performance.now();
  const snapshot = (): Snapshot => {
    const t = (performance.now() - t0) / 1000;
    return { rpm: 850 + 400 * Math.max(0, Math.sin(t / 3)), coolant: Math.min(90, 20 + t) };
  };
  return {
    handle(p) {
      if (p[0] === 0x81) return [0xc1, 0x57, 0x8f]; // startCommunication
      if (p[0] === 0x10) return [0x50]; // startDiagnosticSession
      const g = groups.find((g) => g.request.every((b, i) => p[i] === b));
      if (g) return g.encode(snapshot());
      return [0x7f, p[0], 0x11]; // service not supported
    },
  };
}

// ---------------------------------------------------------------- profile

export const templateProfile: VehicleProfile = {
  id: "template",
  name: "Template",
  covers: "Make, models · years",
  ecu: "Which ECU",
  status: "experimental",
  link: { baudRate: 10400, init: "fast", addresses: { ecu: 0x10, tester: 0xf1 } },
  async connect(ecu) {
    await ecu.request([0x81], { addressed: true, note: "start communication" });
    await ecu.request([0x10, 0x81], { note: "diagnostic session" });
    // Security access goes here if the ECU needs it for reading data.
  },
  channels,
  groups,
  schedule: ["rpm", "rpm", "coolant"],
  simulator: createSimulator,
};
