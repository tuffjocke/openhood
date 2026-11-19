/**
 * Registry of vehicle profiles. Add new profiles here, alphabetically by id.
 * (The _template folder is deliberately not registered.)
 */
import type { VehicleProfile } from "@/core/profile";
import { landRoverTd5 } from "./land-rover-td5";

export const PROFILES: VehicleProfile[] = [landRoverTd5];

export const getProfile = (id: string) => PROFILES.find((p) => p.id === id);
