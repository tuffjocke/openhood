import type { EcuLink, Fault, FaultInfo, VehicleProfile } from "@/core/profile";
import { NegativeResponse } from "@/core/kwp2000/frame";
import { createSlabsSimulator } from "./simulator";

/**
 * Land Rover Discovery 2 SLABS: the Wabco module that runs the ABS and the self-levelling rear
 * air suspension. KWP2000 on the K-line after a fast wake-up at address 29, no unlock. Read and
 * clear faults. Status and sources: ./README.md
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
    interMessageMs: 55,
  },

  async connect(ecu) {
    try {
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    } catch (e) {
      if (!(e instanceof NegativeResponse && e.code === 0x10)) throw e;
      await ecu.request([0x82], { addressed: true, note: "stop old session" }).catch(() => {});
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    }
    // The reference tool's first request, which also shows the session is really up.
    await ecu.request([0x1a, 0x8a], { note: "module configuration" });
  },

  // No live readings yet: the tester present message keeps the session open.
  channels: [],
  groups: [{ id: "keep-alive", request: [0x3e], decode: () => ({}), confidence: "community" }],
  schedule: ["keep-alive"],

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
