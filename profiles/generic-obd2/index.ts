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
  name: "Standard codes (any car)",
  covers: "Most K-line cars with OBD-II or EOBD, roughly 2001 to 2008 in Europe",
  vehicles: [],
  generic: true,
  ecu: "Engine (standard OBD values)",
  hardware:
    "Into the diagnostic socket under the dashboard, then into your computer or phone. Some cars take a few seconds to answer; that's normal.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "auto", // ISO 14230 fast init, then 5-baud (ISO 9141-2 or ISO 14230 slow init)
    slowInitAddress: 0x33,
    addresses: { ecu: 0x33, tester: 0xf1 },
    addressMode: "functional",
    alwaysAddressed: true,
    interMessageMs: 55, // ISO 14230-4 P3 minimum
  },

  async connect(ecu, state, init) {
    // After a 5-baud init the link is already up; only fast init needs StartCommunication.
    if (init.kind === "fast") await ecu.request([0x81], { note: "start communication" });
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
  simulator: () => createObdSimulator(),
};
