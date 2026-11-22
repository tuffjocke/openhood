/**
 * A pretend E46 with an engine, airbags, instruments and body module. Answers come in the layout
 * the README describes; the entry sizes (3 and 14 bytes) are the ones BMW Scanner 1.4 over WebUSB
 * measured on its car. Proves self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

const OK = 0xa0;

const MODULES: Record<number, { size: number; faults: number[] }> = {
  0x12: { size: 3, faults: [] },
  0xa4: { size: 3, faults: [0x06] },
  0x80: { size: 14, faults: [0x1c, 0x2a] },
  0x00: { size: 3, faults: [] },
};

export function createDs2Simulator(): SimulatedEcu {
  return {
    handle(p) {
      const [address, control, arg] = p;
      const m = MODULES[address];
      if (!m) return null;
      if (control === 0x00) return [address, OK, 0x01, 0x23, 0x45];
      if (control !== 0x04) return [address, 0xa2];
      const n = m.faults.length;
      if (arg === 0x00) return [address, OK, n, 0, 0, 0];
      const entries = m.faults.flatMap((c) => [c, ...Array.from({ length: m.size - 1 }, (_, i) => (i === 1 ? 0x44 : i === m.size - 2 ? 0x01 : 0))]);
      return [address, OK, n, ...entries, 0, 0];
    },
  };
}
