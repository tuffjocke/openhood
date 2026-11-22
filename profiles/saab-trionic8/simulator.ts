/**
 * A pretend Trionic 8 with two codes stored. It answers the way Trionic CAN Flasher's comments
 * show: "response pending" from 7E8, then one 5E8 frame per code and an end frame. Proves
 * self-consistency only.
 */
import type { SimulatedEcu } from "@/core/profile";

const ANSWER = 0x7e8;
const CODES = 0x5e8;

export function createTrionic8Simulator(): SimulatedEcu {
  let codes: [number, number, number, number][] = [
    [0x07, 0x03, 0x00, 0x7f], // P0703, the example frame in Trionic CAN Flasher
    [0x01, 0x71, 0x00, 0x2a], // P0171, running lean
  ];
  return {
    handle(p) {
      switch (p[0]) {
        case 0x10:
          return [0x50];
        case 0x20:
          return [0x60];
        case 0x3e:
          return [0x7e];
        case 0xa9:
          return [
            [ANSWER, 0x03, 0x7f, 0xa9, 0x78],
            ...codes.map((c) => [CODES, 0x81, ...c, 0, 0, 0]),
            [CODES, 0x81, 0, 0, 0, 0, 0, 0, 0],
          ];
        case 0x04:
          codes = [];
          return [0x44];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}
