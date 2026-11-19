/**
 * Warning light and emissions self-tests: mode 01 PID 01 ("monitor status since DTCs cleared").
 * Response [0x41, 0x01, A, B, C, D]:
 *   A bit 7    engine warning light (MIL) on; bits 0 to 6 number of stored codes
 *   B bits 0-2 misfire / fuel system / components test available
 *   B bit 3    0 = petrol (spark), 1 = diesel (compression)
 *   B bits 4-6 the same three tests incomplete
 *   C          engine-type specific tests available (bit per test)
 *   D          the same tests incomplete
 * Source: https://en.wikipedia.org/wiki/OBD-II_PIDs (Service 01 PID 01). Confidence: community.
 */
import type { EcuLink, Readiness } from "@/core/profile";

const COMMON = ["Misfire", "Fuel system", "Components"];
const SPARK = ["Catalytic converter", "Heated catalyst", "Fuel vapour system", "Secondary air", "", "Oxygen sensors", "Oxygen sensor heaters", "EGR / variable valve timing"];
const DIESEL = ["Hydrocarbon catalyst", "NOx treatment", "", "Boost pressure", "", "Exhaust gas sensor", "Particulate filter", "EGR / variable valve timing"];

export function decodeReadiness(res: Uint8Array): Readiness {
  const [a, b, cAvail, dIncomplete] = [res[2], res[3], res[4], res[5]];
  const monitors: Readiness["monitors"] = [];
  COMMON.forEach((name, i) => {
    if (b & (1 << i)) monitors.push({ name, complete: !(b & (1 << (i + 4))) });
  });
  const names = b & 0x08 ? DIESEL : SPARK;
  names.forEach((name, i) => {
    if (name && cAvail & (1 << i)) monitors.push({ name, complete: !(dIncomplete & (1 << i)) });
  });
  return { milOn: (a & 0x80) !== 0, monitors };
}

export async function readReadiness(ecu: EcuLink): Promise<Readiness> {
  return decodeReadiness(await ecu.request([0x01, 0x01], { note: "warning light and self-tests" }));
}
