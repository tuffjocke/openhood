/**
 * The modules Openhood asks for trouble codes, by their D2 address. Every address here was seen
 * answering in a published log (README, "Modules"). Some modules have a different address on
 * different cars (the engine is 7A on petrol ME7 cars and 11 on the diesels; the steering wheel
 * module is 48 on a 2002 S80 and 49 on a 2010 V50), so a module can list more than one: the
 * first that answers wins.
 *
 * Two addresses answered on a 2010 V50 without anyone being sure what they are (01, maybe the
 * brakes, and 30, maybe the power steering). They are shown by number, not by a guessed name.
 */
export interface D2Module {
  /** Volvo's short name, put in front of its codes: CEM-1A51. */
  short: string;
  /** What it is, in plain words. */
  name: string;
  addresses: number[];
  /** Brakes or airbag: clearing would hide the warning light. */
  safety?: boolean;
}

export const D2_MODULES: D2Module[] = [
  { short: "ECM", name: "Engine", addresses: [0x7a, 0x11] },
  { short: "TCM", name: "Automatic gearbox", addresses: [0x6e] },
  { short: "M01", name: "Module 01, maybe the brakes", addresses: [0x01], safety: true },
  { short: "CEM", name: "Central electronics", addresses: [0x50, 0x40] },
  { short: "SRS", name: "Airbags", addresses: [0x58], safety: true },
  { short: "DIM", name: "Instruments", addresses: [0x51] },
  { short: "CCM", name: "Climate control", addresses: [0x29] },
  { short: "REM", name: "Rear electronics", addresses: [0x46] },
  { short: "UEM", name: "Roof electronics", addresses: [0x47] },
  { short: "DDM", name: "Driver's door", addresses: [0x43] },
  { short: "PDM", name: "Passenger door", addresses: [0x45] },
  { short: "PSM", name: "Power seat", addresses: [0x2e] },
  { short: "SWM", name: "Steering wheel buttons", addresses: [0x48, 0x49] },
  { short: "AEM", name: "Accessory module", addresses: [0x52] },
  { short: "ADM", name: "Diesel fuel additive", addresses: [0x0b] },
  { short: "M30", name: "Module 30, maybe the power steering", addresses: [0x30] },
];
