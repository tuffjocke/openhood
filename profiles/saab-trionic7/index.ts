import type { EcuLink, Fault, FaultInfo, VehicleProfile } from "@/core/profile";
import { decodeDtc } from "../generic-obd2/dtc";
import { OBD_EXPLANATIONS, OBD_TITLES } from "../shared/obd-codes";
import { createTrionic7Simulator } from "./simulator";

/**
 * Saab Trionic 7 engine computer: the four-cylinder 9-5 (1998 to 2010) and 9-3 (2000 to 2002).
 * Plain KWP2000 on the K-line, fast wake-up, engine at address 11, tester F1, the way Trionic CAN
 * Flasher reaches it through an ELM327 (ATSP5, ATSH 80 11 F1). Gets Saab's own P1 codes as well
 * as the standard ones. Status and sources: ./README.md
 */

/** Read trouble codes by status, as Trionic CAN Flasher asks: 18 02 → 58, count, then code hi, lo, status. */
const READ_CODES = [0x18, 0x02];
/** Clear all, as Trionic CAN Flasher sends it: 14 FF FF → 54. */
const CLEAR_CODES = [0x14, 0xff, 0xff];

/** Saab codes whose meaning a public source states, in our own words (README). */
export const TRIONIC7_EXPLANATIONS: Record<string, FaultInfo> = {
  P1908: {
    title: "The engine computer can't hear the instrument cluster",
    plain: "The instruments stopped talking to the engine computer over the car's network. Gauges or warnings may act up.",
    causes: ["A low or weak battery", "A poor connection at the instrument cluster", "A damaged network wire"],
    check: "Charge the battery fully, then read the codes again.",
    urgency: "soon",
    confidence: "community",
  },
  P1923: {
    title: "The engine computer can't hear the automatic gearbox computer",
    plain: "The gearbox computer stopped talking to the engine computer. The gearbox may go into a safe mode with fewer gears.",
    causes: ["A blown fuse or poor connection at the gearbox computer", "A low or weak battery", "A damaged network wire"],
    check: "Check the gearbox computer's fuse, then read the codes again.",
    urgency: "soon",
    confidence: "community",
  },
};

/** All codes from every answer: 58, count, then three bytes per code (two for the code, one status). */
export function parseTrionic7Codes(answers: Uint8Array[]): string[] {
  const out: string[] = [];
  for (const a of answers) {
    if (a[0] !== 0x58) continue;
    for (let i = 2; i + 1 < a.length; i += 3) {
      const code = decodeDtc(a[i], a[i + 1]);
      if (code !== "P0000" && !out.includes(code)) out.push(code);
    }
  }
  return out;
}

async function readFaults(ecu: EcuLink): Promise<Fault[]> {
  const answers = await ecu.requestMany(READ_CODES, { note: "read codes" });
  return parseTrionic7Codes(answers).map((code) => ({
    id: code,
    code,
    name: TRIONIC7_EXPLANATIONS[code]?.title ?? OBD_TITLES[code] ?? `Saab engine code ${code}`,
  }));
}

export const saabTrionic7: VehicleProfile = {
  id: "saab-trionic7",
  name: "Saab Trionic 7",
  covers: "9-5 · 1998 to 2010, 9-3 · 2000 to 2002, four-cylinder petrol",
  vehicles: [
    { make: "Saab", model: "9-5", from: 1998, to: 2010, engine: "2.0 or 2.3 turbo petrol (Trionic 7)" },
    { make: "Saab", model: "9-3", from: 2000, to: 2002, engine: "2.0 or 2.3 turbo petrol (Trionic 7)" },
  ],
  ecu: "Trionic 7 engine computer",
  adapters: ["kkl", "elm327"],
  hardware: "A KKL cable or an ELM327 adapter in the diagnostic socket.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "fast",
    addresses: { ecu: 0x11, tester: 0xf1 },
    alwaysAddressed: true,
    interMessageMs: 250,
    elm: {
      protocol: 5,
      header: (n) => [0x80 + n, 0x11, 0xf1],
    },
  },

  async connect(ecu, _state, init) {
    // On a KKL cable we start the conversation ourselves; an ELM327 does it on the first request.
    if (init.kind !== "adapter") await ecu.request([0x81], { note: "start communication" });
  },

  // No live readings yet: only the tester present message that keeps the session open.
  channels: [],
  groups: [
    {
      id: "keep-alive",
      request: [0x3e],
      decode: () => ({}),
      confidence: "community",
    },
  ],
  schedule: ["keep-alive"],

  faults: {
    read: readFaults,
    async clear(ecu) {
      await ecu.request(CLEAR_CODES, { note: "clear codes" });
    },
    explanations: { ...OBD_EXPLANATIONS, ...TRIONIC7_EXPLANATIONS },
    confidence: "community",
  },
  simulator: createTrionic7Simulator,
};
