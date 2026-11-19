/**
 * Registry of vehicle profiles. Add new profiles here, alphabetically by id.
 * (The _template folder is deliberately not registered.)
 */
import type { VehicleProfile } from "@/core/profile";
import { genericObd2 } from "./generic-obd2";
import { landRoverTd5 } from "./land-rover-td5";

export const PROFILES: VehicleProfile[] = [genericObd2, landRoverTd5];

export const getProfile = (id: string) => PROFILES.find((p) => p.id === id);
