/**
 * A pretend 2005 to 2007 Volvo with an engine, an automatic gearbox, the central electronics,
 * airbags and instruments. Each module answers from its own CAN id, in two different ranges, so
 * the link's range search gets exercised. The ids come from published logs, though from different
 * cars; this proves self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

const MODULES: Record<number, { id: number; faults: number[] }> = {
  0x7a: { id: 0x01200021, faults: [] }, // engine (2009 S60's engine id)
  0x6e: { id: 0x01200081, faults: [] }, // gearbox
  0x50: { id: 0x01000003, faults: [0x1a51] }, // central electronics on the fast bus: can't reach the airbags
  0x58: { id: 0x00802001, faults: [0x0024, 0x00b2] }, // airbags (2002 S80's id)
  0x51: { id: 0x00800009, faults: [] }, // instruments (2002 S80's id)
};

export function createD2Simulator(): SimulatedEcu {
  const faults = new Map(Object.entries(MODULES).map(([a, m]) => [Number(a), [...m.faults]]));
  return {
    responseId: (req) => MODULES[req[0]]?.id ?? 0,
    handle(p) {
      const [module, service] = p;
      const codes = faults.get(module);
      if (!codes) return null; // not in this car
      switch (service) {
        case 0xa1: // keep-alive
          return [module, 0xe1];
        case 0xae:
          if (p[2] !== 0x11) return [module, 0x7f, 0xae, 0x12];
          return [module, 0xee, 0x11, ...codes.flatMap((c) => [c >> 8, c & 0xff])];
        default:
          return [module, 0x7f, service, 0x11];
      }
    },
  };
}
