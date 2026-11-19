/**
 * Td5 fault memory.
 *
 * Read:  `21 3B` → `61 3B` + a 35-byte block, one bit per fault (fault-map.ts).
 * Clear: StartRoutine `31 DD` + 18 zero bytes → `71 DD`. The answer can take ~300 ms.
 *
 * Both are confirmed by a sniffed session in Ekaitza_Itzali (Read_Faults_and_clear.log) and by
 * discovery2-diag reading and clearing the block on a real Discovery 2 Td5. See README.md.
 */
import type { EcuLink, Fault, FaultInfo } from "@/core/profile";
import { explainTd5Fault, splitStatus, STATUS } from "./fault-explanations";
import { BLOCK_LENGTH, TD5_FAULT_MAP } from "./fault-map";

export const READ_FAULTS = [0x21, 0x3b];
export const CLEAR_FAULTS = [0x31, 0xdd, ...new Array(18).fill(0)];

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function decodeFaults(res: Uint8Array): Fault[] {
  const block = res.subarray(2, 2 + BLOCK_LENGTH); // ignore anything trailing the block
  const out: Fault[] = [];
  block.forEach((byte, offset) => {
    for (let bit = 0; bit < 8; bit++) {
      if (!(byte & (1 << bit))) continue;
      const key = `${offset}.${bit}`;
      const name = TD5_FAULT_MAP[key] ?? `unknown fault (byte ${offset}, bit ${bit})`;
      const { status } = splitStatus(name);
      out.push({ id: `td5-${key}`, name: capitalise(name), state: status ? STATUS[status] : undefined });
    }
  });
  return out;
}

/** For the simulator: a block with the given "offset.bit" keys set. */
export function encodeFaults(active: Iterable<string>): number[] {
  const block = new Array(BLOCK_LENGTH).fill(0);
  for (const key of active) {
    const [offset, bit] = key.split(".").map(Number);
    block[offset] |= 1 << bit;
  }
  return [0x61, 0x3b, ...block];
}

/** Explanations for every named bit, keyed by fault id. */
export const explanations: Record<string, FaultInfo> = Object.fromEntries(
  Object.entries(TD5_FAULT_MAP).flatMap(([key, name]) => {
    const info = explainTd5Fault(name);
    return info ? [[`td5-${key}`, info]] : [];
  }),
);

export const faults = {
  read: async (ecu: EcuLink) => decodeFaults(await ecu.request(READ_FAULTS, { note: "read faults" })),
  clear: async (ecu: EcuLink) => {
    await ecu.request(CLEAR_FAULTS, { note: "clear faults" });
  },
  explanations,
  confidence: "community" as const,
};
