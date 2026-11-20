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
  covers: "Most cars with OBD-II or EOBD: petrol from about 2001 and diesel from about 2004 in Europe, 1996 in the US",
  vehicles: [],
  generic: true,
  ecu: "Engine (standard OBD values)",
  hardware:
    "An ELM327-type adapter (USB or Bluetooth) works on any of these cars. A KKL cable also works on cars from before about 2008. Some cars take a few seconds to answer; that's normal.",
  // Only standard OBD-II requests, so an ELM327 can run it, on CAN too. A KKL cable covers K-line cars.
  adapters: ["elm327", "kkl"],
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
  dials: { main: "speed", left: "rpm", right: "coolant", battery: "voltage" },
  groups,
  schedule: ["rpm", "speed", "throttle", "load", "rpm", "speed", "map", "maf", "rpm", "speed", "throttle", "load", "rpm", "stft", "coolant", "timing", "airTemp", "ltft", "voltage"],
  faults,
  simulator: () => createObdSimulator(),
};
