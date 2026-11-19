/**
 * Fault memory: read with 0x21 0x3B (a bit field), clear with service 0x14.
 *
 * Confidence: guess. The bit-to-name table is a placeholder of commonly reported Td5
 * faults. To map it: provoke a known fault on the car (e.g. unplug the fuel temp
 * sensor with ignition on), read, see which bit sets, fix the table, mark verified.
 */
import type { EcuLink, Fault } from "@/core/profile";

export const FAULT_BITS = [
  "Coolant temperature sensor",
  "Fuel temperature sensor",
  "Intake air temperature sensor",
  "MAP sensor",
  "MAF sensor",
  "Pedal track 1",
  "Pedal track 2",
  "Pedal tracks disagree",
  "Injector 1 circuit",
  "Injector 2 circuit",
  "Injector 3 circuit",
  "Injector 4 circuit",
  "Injector 5 circuit",
  "Turbo over-boost",
  "EGR valve",
  "Battery voltage low",
  "Road speed signal",
  "Fuel pump relay",
  "Glow plug relay",
  "Immobiliser code",
];

export const READ_FAULTS = [0x21, 0x3b];
export const CLEAR_FAULTS = [0x14, 0x31, 0x31];

export function decodeFaults(res: Uint8Array): Fault[] {
  return FAULT_BITS.flatMap((name, i) =>
    (res[2 + (i >> 3)] ?? 0) & (1 << (i & 7)) ? [{ id: `td5-bit-${i}`, name }] : [],
  );
}

export function encodeFaults(active: Set<number>): number[] {
  const bytes = new Array(Math.ceil(FAULT_BITS.length / 8)).fill(0);
  active.forEach((i) => (bytes[i >> 3] |= 1 << (i & 7)));
  return [0x61, 0x3b, ...bytes];
}

export const faults = {
  read: async (ecu: EcuLink) => decodeFaults(await ecu.request(READ_FAULTS, { note: "read faults" })),
  clear: async (ecu: EcuLink) => {
    await ecu.request(CLEAR_FAULTS, { note: "clear faults" });
  },
  confidence: "guess" as const,
};
