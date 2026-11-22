import type { EcuLink, Fault, VehicleMatch, VehicleProfile } from "@/core/profile";
import { ABS_CODES, COMBI_CODES, SRS_CODES, type ModuleCodes } from "./codes";
import { createD3b0Simulator } from "./simulator";

/**
 * Volvo 850 (1996 to 1997) and S70, V70 and C70 (1997 to 1998): the modules standard OBD-II
 * scanners can't reach, over Volvo's keyword D3 B0 protocol (KWPD3B0). The engine is read with
 * standard codes; these profiles read the ABS, the airbag computer and the instrument cluster.
 * Status and sources: ./README.md
 *
 * KWPD3B0 is a K-line protocol much like ISO 14230: 5-baud wake-up at the module's address,
 * keywords D3 B0, then frames with a format byte, target, source (13 for the tester), data and a
 * checksum. Two differences: the format byte counts one more than the data (lengthOffset), and
 * answers to a service s start with s + 0x40, like KWP2000.
 */

/** Requests, from jonesrh's KWPD3B0 pages. */
const D3B0 = {
  keepAlive: [0xa1],
  readFaults: [0xae, 0x01],
  clearFaults: [0xaf, 0x01],
};

const YEARS: Omit<VehicleMatch, "engine" | "system">[] = [
  { make: "Volvo", model: "850", from: 1996, to: 1997 },
  { make: "Volvo", model: "S70", from: 1997, to: 1998 },
  { make: "Volvo", model: "V70", from: 1997, to: 1998 },
  { make: "Volvo", model: "C70", from: 1997, to: 1998 },
];

/** Faults from an AE 01 answer: EE 01, then one raw code per byte. FF alone means none. */
export function parseD3b0Faults(res: Uint8Array, codes: ModuleCodes, prefix: string): Fault[] {
  const out: Fault[] = [];
  for (const raw of res.subarray(2)) {
    if (raw === 0xff) continue;
    const code = codes.raw[raw];
    const id = code ?? `${prefix} raw ${raw.toString(16).toUpperCase().padStart(2, "0")}`;
    if (out.some((f) => f.id === id)) continue;
    out.push({ id, code: code ?? id, name: codes.explanations[code ?? ""]?.title ?? `${prefix} fault` });
  }
  return out;
}

function d3b0Profile(o: {
  id: string;
  name: string;
  system: string;
  prefix: string;
  address: number;
  ecu: string;
  codes: ModuleCodes;
  /** Brakes or airbag: clearing hides the warning light until the fault is found again. */
  safetySystem?: boolean;
}): VehicleProfile {
  return {
    id: o.id,
    name: o.name,
    covers: `850 · 1996 to 1997, S70, V70, C70 · 1997 to 1998`,
    vehicles: YEARS.map((y) => ({ ...y, engine: "Any engine", system: o.system })),
    ecu: o.ecu,
    // Most people own an ELM327, which carries this protocol when set up by hand (link.elm, from
    // jonesrh's command sequence). A KKL cable works too.
    adapters: ["elm327", "kkl"],
    hardware: "An ELM327 adapter or a KKL cable in the diagnostic socket.",
    status: "experimental",

    link: {
      baudRate: 10400,
      init: "slow",
      slowInitAddress: o.address,
      addresses: { ecu: o.address, tester: 0x13 },
      alwaysAddressed: true,
      lengthOffset: 1,
      // There is no live data to poll yet, only the keep-alive: no need to send it flat out.
      interMessageMs: 250,
      // Through an ELM327, as jonesrh does it: ISO 9141 with a 5-baud wake-up at the module's
      // address (ATSP 3, ATIIA), tester 13 (ATTA 13), a header per request length (ATSH 83 01 13
      // before AE01) and the adapter repeating the keep-alive itself (ATWM 82 01 13 A1).
      elm: {
        protocol: 3,
        initAddress: o.address,
        testerAddress: 0x13,
        header: (n) => [0x81 + n, o.address, 0x13],
        keepAlive: D3B0.keepAlive,
      },
    },

    async connect(ecu) {
      await ecu.request(D3B0.keepAlive, { note: "hello" });
    },

    // No live readings yet: nobody has published what these modules' A5 data means.
    channels: [],
    groups: [
      {
        id: "alive",
        request: D3B0.keepAlive,
        decode: () => ({}),
        confidence: "community",
      },
    ],
    schedule: ["alive"],

    faults: {
      async read(ecu: EcuLink) {
        const res = await ecu.request(D3B0.readFaults, { note: "read faults" });
        return parseD3b0Faults(res, o.codes, o.prefix);
      },
      async clear(ecu: EcuLink) {
        await ecu.request(D3B0.clearFaults, { note: "clear faults" });
      },
      explanations: o.codes.explanations,
      confidence: "community",
      ...(o.safetySystem ? { safetySystem: true } : {}),
    },
    simulator: () => createD3b0Simulator(o.id),
  };
}

export const volvo850Abs = d3b0Profile({
  id: "volvo-850-abs",
  name: "Volvo 850, S70, V70 ABS",
  system: "ABS brakes",
  prefix: "ABS",
  address: 0x01,
  ecu: "ABS and traction control unit (address 01)",
  codes: ABS_CODES,
  safetySystem: true,
});

export const volvo850Srs = d3b0Profile({
  id: "volvo-850-srs",
  name: "Volvo 850, S70, V70 airbag",
  system: "Airbag",
  prefix: "SRS",
  address: 0x58,
  ecu: "Airbag computer, SRS (address 58)",
  codes: SRS_CODES,
  safetySystem: true,
});

export const volvo850Combi = d3b0Profile({
  id: "volvo-850-combi",
  name: "Volvo 850, S70, V70 instruments",
  system: "Instruments",
  prefix: "CI",
  address: 0x51,
  ecu: "Instrument cluster, COMBI (address 51)",
  codes: COMBI_CODES,
});
