import type { EcuLink, Fault, VehicleMatch, VehicleProfile } from "@/core/profile";
import { NegativeResponse } from "@/core/kwp2000/frame";
import { TimeoutError } from "@/core/transport/types";
import { parseD2Codes } from "@/core/volvo-d2/frame";
import { D2_EXPLANATIONS } from "./codes";
import { D2_MODULES } from "./modules";
import { createD2Simulator } from "./simulator";

/**
 * Volvo's own trouble codes from every module that answers, on the cars that speak Volvo D2 on
 * CAN: the S40, V50, C30 and C70 (P1), and the S60, V70, XC70, S80 and XC90 (P2) from model year
 * 2005. Standard OBD-II scanners only see the engine and gearbox's emissions codes; this asks
 * each module with Volvo's own read-codes service, AE 11, the way VIDA does.
 * Status and sources: ./README.md
 *
 * Read only for now: nobody has published the clear request, so clearing is left out. P2 cars up
 * to model year 2004 keep the CAN buses off the diagnostic socket behind a relay in the CEM and
 * aren't covered. From 2007 the new S80, V70 and XC70 (P3) use another protocol.
 */

/** Model years with D2 on CAN, from the README's sources. */
const CARS: Omit<VehicleMatch, "engine" | "system">[] = [
  { make: "Volvo", model: "S40", from: 2004, to: 2012 },
  { make: "Volvo", model: "V50", from: 2004, to: 2012 },
  { make: "Volvo", model: "C30", from: 2007, to: 2013 },
  { make: "Volvo", model: "C70", from: 2006, to: 2013 },
  { make: "Volvo", model: "S60", from: 2005, to: 2009 },
  { make: "Volvo", model: "V70", from: 2005, to: 2007 },
  { make: "Volvo", model: "XC70", from: 2005, to: 2007 },
  { make: "Volvo", model: "S80", from: 2005, to: 2006 },
  { make: "Volvo", model: "XC90", from: 2005, to: 2014 },
];

/** Read trouble codes, from the published logs: CB, module, AE, 11. */
const READ_CODES = 0xae;
const STORED = 0x11;

/** Ask every module in turn. Modules the car doesn't have stay silent and are skipped. */
export async function readD2Faults(ecu: EcuLink): Promise<Fault[]> {
  const out: Fault[] = [];
  let answered = 0;
  for (const m of D2_MODULES) {
    for (const address of m.addresses) {
      let res: Uint8Array;
      try {
        res = await ecu.request([address, READ_CODES, STORED], { note: `${m.short} codes` });
      } catch (e) {
        if (e instanceof TimeoutError) continue;
        if (e instanceof NegativeResponse) {
          answered++;
          break;
        }
        throw e;
      }
      answered++;
      for (const code of parseD2Codes(res)) {
        const id = `${m.short}-${code}`;
        out.push({ id, code: id, name: D2_EXPLANATIONS[id]?.title ?? `${m.name}: Volvo code ${code}` });
      }
      break;
    }
  }
  if (!answered) throw new TimeoutError(0, 0, "No module answered. Is the ignition on?");
  return out;
}

export const volvoD2: VehicleProfile = {
  id: "volvo-d2",
  name: "Volvo all modules",
  covers: "S40, V50 · 2004 to 2012, C30, C70 · 2006 to 2013, S60, V70, XC70, S80, XC90 · from 2005",
  vehicles: CARS.map((c) => ({ ...c, engine: "Any engine", system: "All modules" })),
  ecu: "Every module that answers on the fast CAN bus: engine, gearbox, central electronics, airbags and more",
  // CAN only, so an ELM327 type adapter. A KKL cable can't reach it.
  adapters: ["elm327"],
  hardware: "An ELM327 adapter in the diagnostic socket.",
  status: "experimental",

  link: {
    baudRate: 38400,
    protocol: "volvo-d2",
    init: "fast",
    addresses: { ecu: 0x50, tester: 0xf1 },
  },

  async connect() {},

  // No live readings yet. One group so the contract holds; it never polls.
  channels: [],
  groups: [
    {
      id: "none",
      request: [0x50, 0xa1],
      decode: () => ({}),
      available: () => false,
      confidence: "guess",
    },
  ],
  schedule: ["none"],

  faults: {
    read: readD2Faults,
    explanations: D2_EXPLANATIONS,
    confidence: "community",
  },
  simulator: createD2Simulator,
};
