import { NegativeResponse } from "@/core/kwp2000/frame";
import type { VehicleProfile } from "@/core/profile";
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
  hardware: "Standard KKL cable. The OBD socket is under the dash, K-line on pin 7.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "fast",
    addresses: { ecu: 0x13, tester: 0xf7 },
    interMessageMs: 55, // 55 ms P3 needed with the engine running (TD5-Dash, see README)
    interByteMs: 5, // byte spacing used by a working ESP32 implementation; any 0 to 20 ms is valid P4
  },

  async connect(ecu) {
    try {
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    } catch (e) {
      // 7F 81 10: the ECU still has an old session open. Close it and try once more.
      if (!(e instanceof NegativeResponse && e.code === 0x10)) throw e;
      await ecu.request([0x82], { addressed: true, note: "stop old session" }).catch(() => {});
      await ecu.request([0x81], { addressed: true, note: "start communication" });
    }
    await ecu.request([0x10, 0xa0], { note: "diagnostic session" });
    const seed = await ecu.request([0x27, 0x01], { note: "request seed" });
    const key = td5Key((seed[2] << 8) | seed[3]);
    await ecu.request([0x27, 0x02, key >> 8, key & 0xff], { note: "send key" });
  },

  channels,
  groups,
  // rpm, boost and pedal three times as often as the slow stuff
  schedule: ["rpm", "manifold", "pedal", "speed", "rpm", "manifold", "pedal", "temperatures", "rpm", "manifold", "pedal", "battery"],
  slowGroups: ["ambient"],
  faults,
  simulator: createTd5Simulator,
};
