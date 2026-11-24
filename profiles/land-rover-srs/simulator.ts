/**
 * A pretend Discovery 2 airbag computer with the two faults from the published read
 * (61 02 90 04 90 16 00 00: codes 004 and 022). Proves self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

export function createSrsSimulator(): SimulatedEcu {
  return {
    // The real key bytes aren't published. xx 8F says ISO 14230, as the BCU on the same line sends (E5 8F).
    wakeup: { slow: [0xe5, 0x8f] },
    handle(p) {
      switch (p[0]) {
        case 0x10:
          return p[1] === 0x81 ? [0x50, 0x81] : [0x7f, 0x10, 0x12];
        case 0x21:
          if (p[1] === 0x02) return [0x61, 0x02, 0x90, 0x04, 0x90, 0x16, 0x00, 0x00];
          if (p[1] === 0x01) return [0x61, 0x01];
          return [0x7f, 0x21, 0x12];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}
