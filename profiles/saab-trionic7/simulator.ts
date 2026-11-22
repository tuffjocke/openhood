/**
 * A pretend Trionic 7 with two codes stored. It answers in the layout Trionic CAN Flasher's
 * comments show (58, count, then code and status per fault); proves self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

export function createTrionic7Simulator(): SimulatedEcu {
  let codes: [number, number, number][] = [
    [0x01, 0x71, 0xe4], // P0171, running lean
    [0x19, 0x23, 0x48], // P1923, no word from the gearbox computer
  ];
  return {
    handle(p) {
      switch (p[0]) {
        case 0x81:
          return [0xc1, 0xef, 0x8f];
        case 0x3e:
          return [0x7e];
        case 0x18:
          return [0x58, codes.length, ...codes.flat()];
        case 0x14:
          codes = [];
          return [0x54, 0xff, 0xff];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}
