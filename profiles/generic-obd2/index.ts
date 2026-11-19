import { u16 } from "@/core/kwp2000/frame";
import type { VehicleProfile } from "@/core/profile";
import { faults } from "./dtc";
import { channels, groups, pidSupported, supportKey } from "./pids";
import { createObdSimulator } from "./simulator";

/**
 * Generic OBD-II / EOBD over ISO 14230-4 (KWP2000 on K-line, fast init).
 * Standard values only: works on any car that speaks this flavour of OBD-II,
 * but shows nothing manufacturer specific. Status and sources: ./README.md
 */
export const genericObd2: VehicleProfile = {
  id: "generic-obd2",
  name: "Generic OBD-II",
  covers: "Most K-line cars with OBD-II or EOBD, roughly 2001 to 2008 in Europe",
  vehicles: [],
  generic: true,
  ecu: "Engine (standard OBD values)",
  hardware:
    "Standard KKL cable. Only cars using ISO 14230 fast init for now; cars that need the 5-baud wake-up (ISO 9141-2) won't answer yet.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "fast",
    addresses: { ecu: 0x33, tester: 0xf1 },
    addressMode: "functional",
    alwaysAddressed: true,
    interMessageMs: 55, // ISO 14230-4 P3 minimum
  },

  async connect(ecu, state) {
    await ecu.request([0x81], { note: "start communication" });
    // Ask which PIDs exist, block by block (00 → 01..20, 20 → 21..40, 40 → 41..60).
    for (const base of [0x00, 0x20, 0x40]) {
      if (base > 0 && !pidSupported(state, base)) break;
      const res = await ecu.request([0x01, base], { note: `supported PIDs ${base.toString(16).padStart(2, "0")}` });
      state[supportKey(base)] = ((u16(res, 2) << 16) | u16(res, 4)) >>> 0;
    }
  },

  channels,
  groups,
  schedule: ["rpm", "speed", "throttle", "load", "rpm", "speed", "map", "maf", "rpm", "speed", "throttle", "load", "rpm", "stft", "coolant", "timing", "airTemp", "ltft", "voltage"],
  faults,
  simulator: createObdSimulator,
};
