import { NegativeResponse } from "@/core/kwp2000/frame";
import type { VehicleProfile } from "@/core/profile";
import { checks } from "./checks";
import { channels, groups } from "./data";
import { faults } from "./faults";
import { td5Key } from "./keygen";
import { createTd5Simulator } from "./simulator";

/**
 * Land Rover Td5 engine ECU. Reference profile: copy its shape for new vehicles.
 * Status and sources: ./README.md
 */
export const landRoverTd5: VehicleProfile = {
  id: "land-rover-td5",
  name: "Land Rover Td5",
  covers: "Defender, Discovery 2 · 1998 to 2006",
  vehicles: [
    { make: "Land Rover", model: "Defender", from: 1998, to: 2006, engine: "2.5 Td5 diesel" },
    { make: "Land Rover", model: "Discovery 2", from: 1998, to: 2004, engine: "2.5 Td5 diesel" },
  ],
  ecu: "Engine ECU (MSB / NNN)",
  // Land Rover's own K-line session and security unlock: an ELM327 can't do these.
  adapters: ["kkl"],
  hardware: "Into the diagnostic socket under the dashboard, below the steering wheel, then into your computer or phone.",
  status: "tested",

  link: {
    baudRate: 10400,
    init: "fast",
    addresses: { ecu: 0x13, tester: 0xf7 },
    interMessageMs: 55, // 55 ms P3 needed with the engine running (TD5-Dash, see README)
    interByteMs: 5, // byte spacing used by a working ESP32 implementation; any 0 to 20 ms is valid P4
  },

  async connect(ecu) {
    const oldSession = (e: unknown) => e instanceof NegativeResponse && e.code === 0x10;
    try {
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    } catch (e) {
      // 7F 81 10: the ECU still has an old session open. Close it with the short, unaddressed
      // StopCommunication `01 82 83` (the addressed one is refused, see README) and try once more.
      if (!oldSession(e)) throw e;
      await ecu.request([0x82], { note: "stop old session" }).catch(() => {});
      try {
        await ecu.request([0x81], { addressed: true, note: "start communication" });
      } catch (e) {
        // Each refused start keeps the old session alive, so retrying at once can't work.
        if (oldSession(e)) throw new Error("The engine ECU still has the last session open. Wait 15 seconds and connect again.");
        throw e;
      }
    }
    await ecu.request([0x10, 0xa0], { note: "diagnostic session" });
    const seed = await ecu.request([0x27, 0x01], { note: "request seed" });
    const key = td5Key((seed[2] << 8) | seed[3]);
    await ecu.request([0x27, 0x02, key >> 8, key & 0xff], { note: "send key" });
  },

  // End the session so the next connect isn't refused with 7F 81 10.
  async disconnect(ecu) {
    await ecu.request([0x82], { note: "stop communication" });
  },

  channels,
  dials: { main: "speed", left: "rpm", right: "coolant", battery: "battery" },
  groups,
  // rpm, boost and pedal three times as often as the slow stuff
  schedule: [
    "rpm", "manifold", "pedal", "speed", "fuelling",
    "rpm", "manifold", "pedal", "temperatures", "idle",
    "rpm", "manifold", "pedal", "battery", "ambient", "balance", "switches",
  ],
  slowGroups: ["ambient"],
  faults,
  checks,
  simulator: createTd5Simulator,
};
