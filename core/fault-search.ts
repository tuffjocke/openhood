import type { Fault, VehicleProfile } from "./profile";

/** Words that say when a fault was seen, not what it is: they only narrow a web search. */
const STATE_WORDS = /\b(logged|current|active|stored|intermittent)\b/gi;

/**
 * What "Search the web" asks for: the car, the code and the fault's official name, so a search
 * finds forum threads and fixes, not just pages that list the code. A manufacturer's own code
 * ("4-7") means nothing on its own. The year is left out: posts about a fault seldom say it.
 * "(Logged Low)" becomes "Low"; "(Bank 1)" becomes "Bank 1".
 */
export function faultSearchQuery(vehicle: string, fault: Fault, profile: VehicleProfile): string {
  const car = (vehicle.replace(/\b(19|20)\d\d\b/g, "") || (profile.generic ? "" : profile.name)).trim();
  const name = fault.name
    .replace(/\(([^)]*)\)/g, (_, inner: string) => inner.replace(STATE_WORDS, ""))
    .replace(/\s+/g, " ")
    .trim();
  return [car, fault.code, name].filter(Boolean).join(" ").replace(/\s+/g, " ");
}

export const faultSearchUrl = (vehicle: string, fault: Fault, profile: VehicleProfile) =>
  `https://www.google.com/search?q=${encodeURIComponent(faultSearchQuery(vehicle, fault, profile))}`;
