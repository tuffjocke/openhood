/**
 * A pretend Volvo keyword D3 B0 module. Answers the keep-alive, reads and clears faults. The
 * starting faults are picks from each module's code table, chosen to show common problems.
 */
import type { SimulatedEcu } from "@/core/profile";

const START_FAULTS: Record<string, number[]> = {
  "volvo-850-abs": [0x11, 0x72], // left front sensor unsteady (ABS-321), ABS unit hardware fault (ABS-431)
  "volvo-850-srs": [0x03], // driver's airbag open (SRS-212)
  "volvo-850-combi": [0x02], // no road speed signal (CI-221)
};

export function createD3b0Simulator(id: string): SimulatedEcu {
  let faults = [...(START_FAULTS[id] ?? [])];
  return {
    wakeup: { slow: [0xd3, 0xb0] },
    handle(p) {
      switch (p[0]) {
        case 0xa1: // keep-alive
          return [0xe1];
        case 0xae: // read faults
          return [0xee, p[1], ...(faults.length ? faults : [0xff])];
        case 0xaf: // clear faults
          faults = [];
          return [0xef, p[1]];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}
