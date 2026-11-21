/**
 * Units people read readings in. Profiles always work in metric (km/h, °C); this turns a channel
 * and its values into what the person is used to, only for showing and logging.
 *
 *  - metric: km/h, °C
 *  - uk: mph, °C
 *  - us: mph, °F
 */
import type { Channel, Values, VehicleProfile } from "./profile";

export type Units = "metric" | "uk" | "us";

export const UNITS: Units[] = ["metric", "uk", "us"];

/** How each choice reads in the unit switch. */
export const UNIT_NAMES: Record<Units, string> = { metric: "km/h, °C", uk: "mph, °C", us: "mph, °F" };

/** A guess from the browser language's region: the US uses mph and °F, the UK mph and °C. */
export function unitsFor(locale: string): Units {
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  if (region === "US" || region === "LR" || region === "MM") return "us";
  if (region === "GB") return "uk";
  return "metric";
}

interface Conversion {
  unit: string;
  to(v: number): number;
}

const KMH_TO_MPH: Conversion = { unit: "mph", to: (v) => v * 0.621371 };
const C_TO_F: Conversion = { unit: "°F", to: (v) => v * 1.8 + 32 };

function conversion(unit: string, units: Units): Conversion | null {
  if (unit === "km/h" && units !== "metric") return KMH_TO_MPH;
  if (unit === "°C" && units === "us") return C_TO_F;
  return null;
}

/** A channel as shown: unit, range and limits converted. */
export function channelIn(c: Channel, units: Units): Channel {
  const k = conversion(c.unit, units);
  if (!k) return c;
  const round = (v: number) => Math.round(k.to(v));
  return {
    ...c,
    unit: k.unit,
    min: round(c.min),
    max: round(c.max),
    ...(c.warnAbove !== undefined ? { warnAbove: k.to(c.warnAbove) } : {}),
    ...(c.warnBelow !== undefined ? { warnBelow: k.to(c.warnBelow) } : {}),
  };
}

/** The profile with its channels as shown. Everything else is untouched. */
export function profileIn(p: VehicleProfile, units: Units): VehicleProfile {
  if (units === "metric") return p;
  return { ...p, channels: p.channels.map((c) => channelIn(c, units)) };
}

/** Turn metric values into shown ones, for the channels of this profile. */
export function valuesIn(p: VehicleProfile, v: Values, units: Units): Values {
  if (units === "metric") return v;
  const out: Values = {};
  for (const [key, val] of Object.entries(v)) {
    const c = p.channels.find((ch) => ch.key === key);
    const k = c && conversion(c.unit, units);
    out[key] = k ? k.to(val) : val;
  }
  return out;
}
