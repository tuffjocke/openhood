/**
 * Registry of vehicle profiles. Add new profiles here, alphabetically by id.
 * (The _template folder is deliberately not registered.)
 */
import type { VehicleProfile } from "@/core/profile";
import { genericObd2 } from "./generic-obd2";
import { landRoverTd5 } from "./land-rover-td5";
import { volvo850Abs, volvo850Combi, volvo850Srs } from "./volvo-850";
import { volvoD2 } from "./volvo-d2";
import { saabTrionic7 } from "./saab-trionic7";
import { saabTrionic8 } from "./saab-trionic8";
import { bmwDs2 } from "./bmw-ds2";
import { landRoverSlabs } from "./land-rover-slabs";
import { vwAudiKwp1281 } from "./vw-audi-kwp1281";

export const PROFILES: VehicleProfile[] = [genericObd2, landRoverTd5, landRoverSlabs, volvo850Abs, volvo850Combi, volvo850Srs, volvoD2, saabTrionic7, saabTrionic8, bmwDs2, vwAudiKwp1281];

export const getProfile = (id: string) => PROFILES.find((p) => p.id === id);

// ---------------------------------------------------------------- code lookup

import type { FaultInfo } from "@/core/profile";
import { OBD_EXPLANATIONS, OBD_TITLES } from "./shared/obd-codes";

export interface CodeLookup {
  /** Normalised code, e.g. "P0171". */
  code: string;
  /** Official short title, if known. */
  title?: string;
  /** Plain-language explanation, if we have one. */
  info?: FaultInfo;
}

/** Codes look like P0171: a letter (P, C, B, U), then four hex digits starting 0 to 3. */
export const CODE_PATTERN = /^[PCBU][0-3][0-9A-F]{3}$/;

/** "p 0171" → "P0171". */
export const normaliseCode = (input: string) => input.replace(/[^0-9a-z]/gi, "").toUpperCase();

/** Look up a standard trouble code typed by a person. Returns null if it isn't shaped like a code. */
export function lookupCode(input: string): CodeLookup | null {
  const code = normaliseCode(input);
  if (!CODE_PATTERN.test(code)) return null;
  return { code, title: OBD_TITLES[code], info: OBD_EXPLANATIONS[code] };
}

/** A few common codes to show off the translation on the landing page. */
export const EXAMPLE_CODES = ["P0171", "P0420", "P0300", "P0442", "P0101"];
