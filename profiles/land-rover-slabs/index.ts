import type { Channel, EcuLink, Fault, FaultInfo, Values, VehicleProfile } from "@/core/profile";
import { NegativeResponse } from "@/core/kwp2000/frame";
import { createSlabsSimulator } from "./simulator";

/**
 * Land Rover Discovery 2 SLABS: the Wabco module that runs the ABS and the self-levelling rear
 * air suspension. KWP2000 on the K-line after a fast wake-up at address 29, no unlock. Read and
 * clear faults, rear ride height and battery. Status and sources: ./README.md
 *
 * SLABS drops the session when asked more than about once a second (discovery2-diag measured it
 * on a car), so everything here runs at that pace.
 */

/** Logged faults 21 11 and current faults 21 47: 16 bytes, one bit per fault. */
const LOGGED = 0x11;
const CURRENT = 0x47;
const BLOCK = 16;

/** Bits whose meaning a sniffed session with a dealer-type tool showed (README), in our words. */
export const SLABS_EXPLANATIONS: Record<string, FaultInfo> = {
  "SLABS-3.4": {
    title: "Right front wheel speed sensor signal too weak",
    plain: "The ABS isn't getting a clean speed signal from the right front wheel, so ABS and traction control may switch off.",
    causes: ["Dirt or rust between the sensor and its toothed ring", "A sensor pushed out of place", "A damaged sensor wire", "A failed sensor"],
    check: "Clean the sensor and push it fully home against the ring.",
    urgency: "soon",
    confidence: "community",
  },
  "SLABS-10.4": {
    title: "ABS shuttle valve switch fault",
    plain: "A switch in the ABS hydraulic unit reports an electrical fault. The ABS warning light comes on and ABS may be off.",
    causes: ["A poor connection at the ABS modulator", "Air in the brake system after work on the brakes", "A worn modulator"],
    check: "Check the connectors on the ABS modulator, then bleed the brakes if they were opened.",
    urgency: "soon",
    confidence: "community",
  },
};

/** Every set bit in a 16-byte block, as "byte.bit". */
export function slabsBits(block: ArrayLike<number>): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(BLOCK, block.length); i++)
    for (let b = 0; b < 8; b++) if (block[i] & (1 << b)) out.push(`${i}.${b}`);
  return out;
}

/** Rear ride height sensors (raw, set by calibration) and the battery as SLABS sees it. */
export const SLABS_CHANNELS: Channel[] = [
  { key: "rideLeft", label: "Ride height left", unit: "", decimals: 0, min: 0, max: 255, confidence: "community" },
  { key: "battery", label: "Battery", unit: "V", decimals: 1, min: 10, max: 15, warnBelow: 12, confidence: "community" },
  { key: "rideRight", label: "Ride height right", unit: "", decimals: 0, min: 0, max: 255, confidence: "community" },
];

/** 21 54: left and right rear height, one byte each. 61 54 91 9C 0F 0F = 145 and 156. */
export const decodeHeights = (r: ArrayLike<number>): Values => (r.length >= 4 ? { rideLeft: r[2], rideRight: r[3] } : {});
/** 21 44: a block of valve and supply voltages; data byte 12 is the battery in 1/16 V. */
export const decodeSupply = (r: ArrayLike<number>): Values => (r.length >= 15 ? { battery: r[14] / 16 } : {});

async function readFaults(ecu: EcuLink): Promise<Fault[]> {
  const faults = new Map<string, Fault>();
  for (const [lid, when] of [[CURRENT, "now"], [LOGGED, "stored"]] as const) {
    const res = await ecu.request([0x21, lid], { note: `${when} faults` });
    for (const bit of slabsBits(res.slice(2))) {
      const id = `SLABS-${bit}`;
      if (faults.has(id)) continue;
      faults.set(id, { id, code: id, name: SLABS_EXPLANATIONS[id]?.title ?? `ABS or ride height fault (byte ${bit.replace(".", ", bit ")})` });
    }
  }
  return [...faults.values()];
}

export const landRoverSlabs: VehicleProfile = {
  id: "land-rover-slabs",
  name: "Land Rover SLABS (ABS and ride height)",
  covers: "Discovery 2 · 1998 to 2004",
  vehicles: [{ make: "Land Rover", model: "Discovery 2", from: 1998, to: 2004, engine: "Any engine", system: "ABS and ride height" }],
  ecu: "Wabco SLABS: ABS and self-levelling rear suspension",
  adapters: ["kkl"],
  hardware: "A KKL cable in the diagnostic socket. Ignition on, car standing still.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "fast",
    addresses: { ecu: 0x29, tester: 0xf7 },
    // About one message a second, as the dealer tool sends: faster and SLABS drops the session.
    interMessageMs: 1000,
  },

  async connect(ecu) {
    try {
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    } catch (e) {
      if (!(e instanceof NegativeResponse && e.code === 0x10)) throw e;
      await ecu.request([0x82], { addressed: true, note: "stop old session" }).catch(() => {});
      try {
        await ecu.request([0x81], { addressed: true, note: "start communication" });
      } catch (e) {
        // SLABS only lets go after tens of seconds of silence; every try in between restarts the wait.
        if (e instanceof NegativeResponse && e.code === 0x10)
          throw new Error("The ABS module still has the last session open. Wait 30 seconds and connect again.");
        throw e;
      }
    }
    // The reference tool's first request, which also shows the session is really up.
    await ecu.request([0x1a, 0x8a], { note: "module configuration" });
  },

  // End the session so the next connect isn't refused.
  async disconnect(ecu) {
    await ecu.request([0x82], { note: "stop communication" });
  },

  // Reading these keeps the session open, so no tester present is needed. Wheel speeds and ABS
  // sensor voltages are known too, but not which wheel is which, so they aren't shown yet.
  channels: SLABS_CHANNELS,
  dials: { main: "battery", left: "rideLeft", right: "rideRight" },
  groups: [
    { id: "heights", request: [0x21, 0x54], decode: decodeHeights, confidence: "community" },
    { id: "supply", request: [0x21, 0x44], decode: decodeSupply, confidence: "community" },
  ],
  schedule: ["heights", "heights", "supply"],

  faults: {
    read: readFaults,
    async clear(ecu) {
      // SLABS writes its memory first and answers about 300 ms later.
      await ecu.request([0x14, 0xff, 0xff], { note: "clear faults", timeoutMs: 1500 });
    },
    explanations: SLABS_EXPLANATIONS,
    confidence: "community",
    safetySystem: true,
  },
  simulator: createSlabsSimulator,
};
