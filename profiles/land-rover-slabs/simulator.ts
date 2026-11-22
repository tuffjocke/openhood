/**
 * A pretend SLABS with the two faults from the published sniff (21 11 with byte 3 bit 4 and
 * byte 10 bit 4 set), one of them current. Proves self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

export function createSlabsSimulator(): SimulatedEcu {
  let logged = [0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0x10, 0, 0, 0, 0, 0];
  let current = [0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return {
    handle(p) {
      switch (p[0]) {
        case 0x81:
          return [0xc1, 0x57, 0x8f];
        case 0x82:
          return [0xc2];
        case 0x1a:
          return [0x5a, p[1], 0x53, 0x4c, 0x41, 0x42, 0x53];
        case 0x3e:
          return [0x7e];
        case 0x21:
          if (p[1] === 0x11) return [0x61, 0x11, ...logged];
          if (p[1] === 0x47) return [0x61, 0x47, ...current];
          return [0x7f, 0x21, 0x12];
        case 0x14:
          logged = logged.map(() => 0);
          current = current.map(() => 0);
          return [0x54, 0xff, 0xff];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}
