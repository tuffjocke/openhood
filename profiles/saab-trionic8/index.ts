import type { EcuLink, Fault, VehicleProfile } from "@/core/profile";
import { decodeDtc } from "../generic-obd2/dtc";
import { OBD_EXPLANATIONS, OBD_TITLES } from "../shared/obd-codes";
import { TRIONIC7_EXPLANATIONS } from "../saab-trionic7";
import { createTrionic8Simulator } from "./simulator";

/**
 * Saab Trionic 8 engine computer: the four-cylinder 9-3 from 2003 to 2011. GM's own diagnostics
 * (GMLAN) on CAN, through an ELM327, the way Trionic CAN Flasher asks for the codes: requests to
 * 7E0, each stored code as its own frame from 5E8. Gets Saab's own codes as well as the standard
 * ones. Status and sources: ./README.md
 */

/** GMLAN initiateDiagnosticOperation 10 02 → 50, as Trionic CAN Flasher starts before reading. */
const START = [0x10, 0x02];
/** readDiagnosticInformation, readStatusOfDTCByStatusMask, mask 12 (current and history codes). */
const READ_CODES = [0xa9, 0x81, 0x12];
/** returnToNormalMode 20, sent after reading. */
const BACK_TO_NORMAL = [0x20];

/**
 * The codes in the answer frames: each 5E8 frame is 81, code hi, code lo, failure type, status;
 * the list ends with a frame of 81 then zeros.
 */
export function parseTrionic8Codes(frames: Uint8Array[]): string[] {
  const out: string[] = [];
  for (const f of frames) {
    if (f[0] !== 0x81 || f.length < 5) continue;
    if (f[1] === 0 && f[2] === 0 && f[3] === 0) break;
    const code = decodeDtc(f[1], f[2]);
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

async function readFaults(ecu: EcuLink): Promise<Fault[]> {
  await ecu.request(START, { note: "start" });
  let frames: Uint8Array[];
  try {
    frames = await ecu.requestMany(READ_CODES, { note: "read codes" });
  } finally {
    await ecu.requestMany(BACK_TO_NORMAL, { note: "back to normal" }).catch(() => undefined);
  }
  const negative = frames.find((f) => f[0] === 0x7f && f[1] === 0xa9 && f[2] !== 0x78);
  if (negative) throw new Error(`The engine computer refused to list its codes (${negative[2].toString(16).toUpperCase()}).`);
  return parseTrionic8Codes(frames).map((code) => ({
    id: code,
    code,
    name: TRIONIC7_EXPLANATIONS[code]?.title ?? OBD_TITLES[code] ?? `Saab engine code ${code}`,
  }));
}

export const saabTrionic8: VehicleProfile = {
  id: "saab-trionic8",
  name: "Saab Trionic 8",
  covers: "9-3 · 2003 to 2011, four-cylinder turbo petrol",
  vehicles: [{ make: "Saab", model: "9-3", from: 2003, to: 2011, engine: "1.8t or 2.0 turbo petrol (Trionic 8)" }],
  ecu: "Trionic 8 engine computer",
  // CAN only, so an ELM327 type adapter.
  adapters: ["elm327"],
  hardware: "An ELM327 adapter in the diagnostic socket.",
  status: "experimental",

  link: {
    baudRate: 38400,
    protocol: "gmlan",
    init: "fast",
    addresses: { ecu: 0x7e0, tester: 0xf1 },
    // Requests to 7E0; answers from 7E8 and, for the codes, 5E8. Mask 5FF lets both through.
    can: { request: 0x7e0, filter: 0x5e8, mask: 0x5ff, waitMs: 500 },
  },

  async connect() {},

  // No live readings yet. One group so the contract holds; it never polls.
  channels: [],
  groups: [{ id: "none", request: [0x3e], decode: () => ({}), available: () => false, confidence: "guess" }],
  schedule: ["none"],

  faults: {
    read: readFaults,
    async clear(ecu) {
      // Standard OBD-II clear (mode 04), as Trionic CAN Flasher clears a T8.
      await ecu.request([0x04], { note: "clear codes" });
    },
    explanations: { ...OBD_EXPLANATIONS, ...TRIONIC7_EXPLANATIONS },
    confidence: "community",
  },
  simulator: createTrionic8Simulator,
};
