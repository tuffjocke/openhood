/**
 * DS2 modules Openhood asks, by address. Each one answered in a published log or is named in an
 * open source DS2 tool's module table (README, "Modules"). The immobiliser (EWS, 44) is left out
 * on purpose. A module the car doesn't have stays silent and is skipped.
 */
export interface Ds2Module {
  /** BMW's short name, put in front of its codes: ZKE-0B. */
  short: string;
  name: string;
  address: number;
}

export const DS2_MODULES: Ds2Module[] = [
  { short: "DME", name: "Engine", address: 0x12 },
  { short: "EGS", name: "Gearbox (automatic or SMG)", address: 0x32 },
  { short: "ASC", name: "Traction control (ASC or DSC)", address: 0x56 },
  { short: "SRS", name: "Airbags", address: 0xa4 },
  { short: "IKE", name: "Instruments", address: 0x80 },
  { short: "ZKE", name: "Body electronics, doors and locking", address: 0x00 },
  { short: "LCM", name: "Lights", address: 0xd0 },
  { short: "IHKA", name: "Climate control", address: 0x5b },
  { short: "LEW", name: "Steering angle sensor", address: 0x57 },
];
