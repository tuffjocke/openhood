/**
 * Make / model / year lookups over the registered profiles, for the vehicle picker.
 * Vehicle independent: it only reads each profile's `vehicles` list.
 */
import type { VehicleProfile } from "./profile";

export interface Match {
  profile: VehicleProfile;
  engine: string;
}

const sortAlpha = (a: string, b: string) => a.localeCompare(b);

export function makes(profiles: VehicleProfile[]): string[] {
  return [...new Set(profiles.flatMap((p) => p.vehicles.map((v) => v.make)))].sort(sortAlpha);
}

export function models(profiles: VehicleProfile[], make: string): string[] {
  return [
    ...new Set(profiles.flatMap((p) => p.vehicles.filter((v) => v.make === make).map((v) => v.model))),
  ].sort(sortAlpha);
}

/** Newest first. */
export function years(profiles: VehicleProfile[], make: string, model: string): number[] {
  const set = new Set<number>();
  for (const p of profiles)
    for (const v of p.vehicles)
      if (v.make === make && v.model === model) for (let y = v.from; y <= v.to; y++) set.add(y);
  return [...set].sort((a, b) => b - a);
}

export function matches(profiles: VehicleProfile[], make: string, model: string, year: number): Match[] {
  return profiles.flatMap((p) =>
    p.vehicles
      .filter((v) => v.make === make && v.model === model && year >= v.from && year <= v.to)
      .map((v) => ({ profile: p, engine: v.engine })),
  );
}

export const genericProfile = (profiles: VehicleProfile[]) => profiles.find((p) => p.generic);

/** Every make a person can pick: the allowed names plus any a profile uses. */
export function allMakes(profiles: VehicleProfile[], names: Record<string, string[]>): string[] {
  return [...new Set([...Object.keys(names), ...makes(profiles)])].sort(sortAlpha);
}

/** Known models for a make, from the allowed names and the profiles. Empty means "type it in". */
export function allModels(profiles: VehicleProfile[], names: Record<string, string[]>, make: string): string[] {
  return [...new Set([...(names[make] ?? []), ...models(profiles, make)])].sort(sortAlpha);
}
