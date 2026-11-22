import type { EcuLink, Fault, VehicleMatch, VehicleProfile } from "@/core/profile";
import { NegativeResponse } from "@/core/kwp2000/frame";
import { TimeoutError } from "@/core/transport/types";
import { DS2_MODULES } from "./modules";
import { createDs2Simulator } from "./simulator";

/**
 * BMWs of the DS2 years (E36, E38, E39, E46, E53, Z3): fault codes from every DS2 module that
 * answers, with a KKL cable. Read only. Status and sources: ./README.md
 *
 * Late cars moved some modules (the engine on some E46s, DSC MK60) to KWP2000; those don't answer
 * DS2 and are skipped. Their engine codes are still readable as standard OBD-II.
 */

const READ_FAULTS = 0x04;

/**
 * The entries of a fault memory answer: [A0, count, entries...]. The entry size differs per module
 * and isn't stated in the answer, so it is the data length over the count, after dropping trailing
 * zero padding; the code is each entry's first byte. Fitted to three modules on one E46 (README).
 */
export function parseDs2Faults(answer: ArrayLike<number>): number[] {
  const count = answer[1] ?? 0;
  if (!count) return [];
  let end = answer.length;
  while (end > 2 && answer[end - 1] === 0) end--;
  const data = Array.from(answer).slice(2, end);
  const size = Math.floor(data.length / count);
  if (size < 1) return [];
  const out: number[] = [];
  for (let i = 0; i < count && (i + 1) * size <= data.length; i++) {
    const code = data[i * size];
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export async function readDs2Faults(ecu: EcuLink): Promise<Fault[]> {
  const out: Fault[] = [];
  let answered = 0;
  for (const m of DS2_MODULES) {
    try {
      // Page 0 says how many faults there are, page 1 holds them (E46M3-Monitoring, BMW Scanner 1.4 over WebUSB).
      const head = await ecu.request([m.address, READ_FAULTS, 0x00], { note: `${m.short} fault count` });
      answered++;
      if (!head[1]) continue;
      const page = await ecu.request([m.address, READ_FAULTS, 0x01], { note: `${m.short} faults` });
      for (const c of parseDs2Faults(page)) {
        const code = `${m.short}-${c.toString(16).toUpperCase().padStart(2, "0")}`;
        out.push({ id: code, code, name: `${m.name}: BMW fault ${c.toString(16).toUpperCase().padStart(2, "0")}` });
      }
    } catch (e) {
      if (e instanceof TimeoutError) continue;
      if (e instanceof NegativeResponse) {
        answered++;
        continue;
      }
      throw e;
    }
  }
  if (!answered) throw new TimeoutError(0, 0, "No module answered. Is the ignition on, and is the cable in the right socket?");
  return out;
}

const CARS: Omit<VehicleMatch, "engine" | "system">[] = [
  { make: "BMW", model: "3 Series", from: 1991, to: 2006 },
  { make: "BMW", model: "5 Series", from: 1996, to: 2003 },
  { make: "BMW", model: "7 Series", from: 1995, to: 2001 },
  { make: "BMW", model: "X5", from: 2000, to: 2006 },
  { make: "BMW", model: "Z3", from: 1996, to: 2002 },
];

export const bmwDs2: VehicleProfile = {
  id: "bmw-ds2",
  name: "BMW DS2 modules",
  covers: "3 Series (E36, E46), 5 Series (E39), 7 Series (E38), X5 (E53), Z3 · 1991 to 2006",
  vehicles: CARS.map((c) => ({ ...c, engine: "Any engine", system: "All modules" })),
  ecu: "Every DS2 module that answers: engine, gearbox, traction control, airbags, instruments, body and more",
  adapters: ["kkl"],
  hardware:
    "A KKL cable. On cars with the round 20-pin socket under the bonnet, use a 20-pin to OBD adapter. In the OBD socket, pins 7 and 8 must be joined to reach the body modules.",
  status: "experimental",

  link: {
    baudRate: 9600,
    parity: "even",
    protocol: "ds2",
    init: "fast",
    addresses: { ecu: 0x12, tester: 0xf1 },
  },

  async connect() {},

  // No live readings yet. One group so the contract holds; it never polls.
  channels: [],
  groups: [{ id: "none", request: [0x12, 0x00], decode: () => ({}), available: () => false, confidence: "guess" }],
  schedule: ["none"],

  faults: {
    read: readDs2Faults,
    confidence: "community",
  },
  simulator: createDs2Simulator,
};
