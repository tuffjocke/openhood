import { NegativeResponse } from "@/core/kwp2000/frame";
import { measure, parseGroup, TITLE, type MeasureKind } from "@/core/kwp1281/protocol";
import type { Channel, Group, Values, VehicleProfile } from "@/core/profile";
import { clearFaults, EXPLANATIONS, readFaults } from "./faults";
import { createVagSimulator } from "./simulator";

/**
 * VW Group engine ECUs that speak KWP1281: most Volkswagen, Audi, SEAT and Škoda engines from about
 * 1990 to 2001, some later. Status and sources: ./README.md
 *
 * KWP1281 readings come in numbered measuring blocks, and every value says what it is (its formula:
 * rpm, temperature, volts...). Which block holds what differs from engine to engine, so `connect`
 * reads the first blocks and remembers where it found each kind of reading. That is why the
 * groups below build their request from what connect stored.
 */

/** Blocks read at connect to find the readings. Engine ECUs keep the basics in the first few. */
const SEARCH_BLOCKS = [1, 2, 3, 4, 5, 6, 7, 8];

interface Wanted {
  key: string;
  kind: MeasureKind;
  /** Extra test for kinds that cover several readings (a voltage can be the battery or a sensor). */
  accept?(value: number): boolean;
}

const WANTED: Wanted[] = [
  { key: "rpm", kind: "rpm" },
  { key: "speed", kind: "speed" },
  // The first temperature an engine ECU lists is usually coolant, not always (see README).
  { key: "coolant", kind: "temperature" },
  // Sensor voltages read under 5 V; the supply reads about 12 to 14.
  { key: "voltage", kind: "voltage", accept: (v) => v > 9 && v < 17 },
  { key: "load", kind: "load" },
  { key: "throttle", kind: "throttle" },
  { key: "airflow", kind: "airflow" },
  { key: "injection", kind: "injection" },
  { key: "ignition", kind: "ignition" },
  { key: "lambda", kind: "lambda" },
];

const at = (key: string) => ({ block: `${key}Block`, slot: `${key}Slot` });

/** Every wanted reading found in this block, by the slots connect stored. */
function decodeBlock(block: number, res: Uint8Array, state: Readonly<Values>): Values {
  const values = parseGroup(res);
  const out: Values = {};
  for (const w of WANTED) {
    const k = at(w.key);
    if (state[k.block] !== block) continue;
    const m = values[state[k.slot]];
    const r = m && measure(m);
    if (r && r.kind === w.kind) out[w.key] = r.value;
  }
  return out;
}

const groups: Group[] = WANTED.map((w) => ({
  id: w.key,
  request: [TITLE.readGroup, 1],
  requestFor: (s) => [TITLE.readGroup, s[at(w.key).block] ?? 1],
  available: (s) => (s[at(w.key).block] ?? 0) > 0,
  provides: [w.key],
  decode: (res, s) => decodeBlock(s[at(w.key).block] ?? 1, res, s),
  confidence: "community",
}));

const channel = (c: Omit<Channel, "confidence"> & { confidence?: Channel["confidence"] }): Channel => ({
  confidence: "community",
  ...c,
});

const channels: Channel[] = [
  channel({ key: "rpm", label: "Engine speed", unit: "rpm", decimals: 0, min: 0, max: 7000, group: "engine" }),
  channel({ key: "speed", label: "Road speed", unit: "km/h", decimals: 0, min: 0, max: 240 }),
  channel({ key: "coolant", label: "Coolant", unit: "°C", decimals: 0, min: -40, max: 130, warnAbove: 110, group: "engine", confidence: "guess" }),
  channel({ key: "voltage", label: "Battery", unit: "V", decimals: 1, min: 10, max: 16, warnBelow: 11.8 }),
  channel({ key: "load", label: "Engine load", unit: "%", decimals: 0, min: 0, max: 100, group: "engine" }),
  channel({ key: "throttle", label: "Throttle", unit: "°", decimals: 0, min: 0, max: 90, group: "air" }),
  channel({ key: "airflow", label: "Air flow", unit: "g/s", decimals: 1, min: 0, max: 150, group: "air" }),
  channel({ key: "injection", label: "Injection time", unit: "ms", decimals: 1, min: 0, max: 20, group: "fuel" }),
  channel({ key: "ignition", label: "Ignition timing", unit: "°", decimals: 0, min: -20, max: 50, group: "engine" }),
  channel({ key: "lambda", label: "Mixture correction", unit: "%", decimals: 1, min: -25, max: 25, group: "fuel" }),
];

export const vwAudiKwp1281: VehicleProfile = {
  id: "vw-audi-kwp1281",
  name: "VW and Audi, older engines",
  covers: "Volkswagen, Audi and Škoda with a KWP1281 engine computer · about 1991 to 2003",
  // Years: cars reported reading their engine over KWP1281 in the blafusel.de list (see README).
  // Not every engine in these years uses KWP1281; connect says so when the ECU speaks KWP2000.
  vehicles: [
    { make: "Audi", model: "80", from: 1991, to: 1995, engine: "KWP1281 engine computer" },
    { make: "Audi", model: "A3", from: 1997, to: 2001, engine: "KWP1281 engine computer" },
    { make: "Audi", model: "A4", from: 1995, to: 2000, engine: "KWP1281 engine computer" },
    { make: "Audi", model: "A6", from: 1995, to: 2001, engine: "KWP1281 engine computer" },
    { make: "Volkswagen", model: "Golf", from: 1991, to: 2003, engine: "KWP1281 engine computer" },
    { make: "Volkswagen", model: "Passat", from: 1994, to: 2000, engine: "KWP1281 engine computer" },
    { make: "Volkswagen", model: "Polo", from: 1995, to: 2003, engine: "KWP1281 engine computer" },
    { make: "Škoda", model: "Octavia", from: 1998, to: 2001, engine: "KWP1281 engine computer" },
  ],
  ecu: "Engine computer (address 01)",
  // VW Group's own K-line protocol: an ELM327 can't do it.
  adapters: ["kkl"],
  hardware: "A KKL cable (often sold as a VAG-COM cable) into the diagnostic socket, then into your computer.",
  status: "experimental",

  link: {
    protocol: "kwp1281",
    baudRate: 10400,
    // Some engine computers only answer at 9600 (blafusel.de reports, see README).
    altBaudRates: [9600],
    init: "slow",
    slowInitAddress: 0x01,
    addresses: { ecu: 0x01, tester: 0xf1 },
  },

  async connect(ecu, state) {
    for (const n of SEARCH_BLOCKS) {
      let res: Uint8Array;
      try {
        res = await ecu.request([TITLE.readGroup, n], { note: `what is in block ${n}?` });
      } catch (e) {
        if (e instanceof NegativeResponse) continue; // the ECU has no such block
        throw e;
      }
      if (res[0] !== TITLE.groupReading) continue;
      parseGroup(res).forEach((m, slot) => {
        const r = measure(m);
        if (!r) return;
        for (const w of WANTED) {
          const k = at(w.key);
          if (state[k.block] || r.kind !== w.kind || (w.accept && !w.accept(r.value))) continue;
          state[k.block] = n;
          state[k.slot] = slot;
          break;
        }
      });
    }
  },

  channels,
  dials: { main: "rpm", left: "speed", right: "coolant", battery: "voltage" },
  groups,
  // Each read brings every reading in its block, so readings that share a block update together.
  schedule: ["rpm", "load", "speed", "rpm", "throttle", "airflow", "rpm", "injection", "ignition", "rpm", "lambda", "coolant", "voltage"],
  faults: {
    read: readFaults,
    clear: clearFaults,
    explanations: EXPLANATIONS,
    confidence: "community",
  },
  simulator: createVagSimulator,
  notes:
    "Readings are found at connect by their KWP1281 formula, so this works across engines without a block table per engine. " +
    "Coolant is the first temperature found, a guess until checked on real cars.",
};
