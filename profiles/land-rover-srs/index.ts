import type { Fault, FaultInfo, VehicleProfile } from "@/core/profile";
import { createSrsSimulator } from "./simulator";

/**
 * Land Rover Discovery 2 airbag computer (TRW SPS 2A). KWP2000 on the K-line after a 5-baud
 * wake-up at address 5B, with the address on every frame, then diagnostic session 81. Reads fault
 * codes only: clearing needs an unlock nobody has published, and it is a safety system anyway.
 * Status and sources: ./README.md
 */

const SESSION = [0x10, 0x81];
/** Fault memory: 61 02, then [status, code] pairs. The code is the number a Nanocom shows (0x16 = 022). */
const READ_FAULTS = [0x21, 0x02];

const MAY_NOT_WORK = "It may not work in a crash, and the airbag light stays on.";
const GARAGE = "Leave airbag parts to a garage: they can go off when handled wrong.";

/** The codes a source names, in our own words. Every other code shows as its number. */
export const SRS_EXPLANATIONS: Record<string, FaultInfo> = {
  "SRS-004": {
    title: "Airbag warning light wiring is broken",
    plain: "The airbag computer can't light the airbag warning light, so the light can't warn you of other airbag faults.",
    causes: ["Blown airbag warning bulb in the instruments", "Loose plug behind the instruments", "Broken wire to the instruments"],
    check: "Turn the key: the airbag light should come on for a few seconds, then go out.",
    urgency: "soon",
    // Matched to the code by elimination on one car (README).
    confidence: "guess",
  },
  "SRS-008": {
    title: "Driver's airbag is disconnected",
    plain: `The airbag computer sees a break in the wiring to the airbag in the steering wheel. ${MAY_NOT_WORK}`,
    causes: ["Worn clock spring behind the steering wheel (common)", "Loose plug behind the steering wheel airbag", "The airbag itself"],
    check: GARAGE,
    urgency: "soon",
    confidence: "community",
  },
  "SRS-022": {
    title: "Left front seat belt tensioner is disconnected",
    plain: `The airbag computer sees a break in the wiring to the tensioner on the left front seat belt. ${MAY_NOT_WORK}`,
    causes: ["Corroded or loose yellow plug under the left front seat (common)", "Wire pulled by the seat moving", "The tensioner itself"],
    check: GARAGE,
    urgency: "soon",
    confidence: "community",
  },
  "SRS-023": {
    title: "Right front seat belt tensioner wiring is shorted",
    plain: `The wiring to the tensioner on the right front seat belt touches the car's body somewhere. ${MAY_NOT_WORK}`,
    causes: ["Wire chafed under the right front seat", "Damaged yellow plug under the seat", "The tensioner itself"],
    check: GARAGE,
    urgency: "soon",
    confidence: "community",
  },
};

/**
 * Faults from a 21 02 answer: 61 02, then [status, code] pairs. 00 00 is padding. A code of 00 is
 * left out: a second car sent 90 00 next to a real fault and no source says what it means. The
 * status byte isn't decoded beyond one example (90), so no state is shown.
 */
export function parseSrsFaults(res: ArrayLike<number>): Fault[] {
  const out: Fault[] = [];
  for (let i = 2; i + 1 < res.length; i += 2) {
    const code = res[i + 1];
    if (code === 0) continue;
    const id = `SRS-${String(code).padStart(3, "0")}`;
    if (out.some((f) => f.id === id)) continue;
    out.push({ id, code: id, name: SRS_EXPLANATIONS[id]?.title ?? `Airbag fault ${id.slice(4)}` });
  }
  return out;
}

export const landRoverSrs: VehicleProfile = {
  id: "land-rover-srs",
  name: "Land Rover airbag (Discovery 2)",
  covers: "Discovery 2 · 1998 to 2004",
  vehicles: [{ make: "Land Rover", model: "Discovery 2", from: 1998, to: 2004, engine: "Any engine", system: "Airbag" }],
  ecu: "TRW SPS airbag computer (address 5B)",
  adapters: ["kkl"],
  hardware: "A KKL cable in the diagnostic socket. Ignition on.",
  status: "experimental",

  link: {
    baudRate: 10400,
    init: "slow",
    slowInitAddress: 0x5b,
    addresses: { ecu: 0x5b, tester: 0xf7 },
    // Unlike the Td5 and SLABS, every frame carries the addresses: 82 5B F7 21 02 ...
    alwaysAddressed: true,
    // Nothing live to poll, only the fault read that keeps the session open: no need to hurry.
    interMessageMs: 1000,
  },

  async connect(ecu) {
    await ecu.request(SESSION, { note: "diagnostic session" });
  },

  // No live readings: the module has none. Reading the faults again keeps the session open; it
  // is the one request seen working on two cars (no tester present has been seen on this module).
  channels: [],
  groups: [{ id: "keep-alive", request: READ_FAULTS, decode: () => ({}), confidence: "community" }],
  schedule: ["keep-alive"],

  faults: {
    async read(ecu) {
      return parseSrsFaults(await ecu.request(READ_FAULTS, { note: "read faults" }));
    },
    explanations: SRS_EXPLANATIONS,
    confidence: "community",
    safetySystem: true,
  },
  simulator: createSrsSimulator,
};
