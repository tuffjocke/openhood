/**
 * A pretend Td5. Needs the same wake-up, session and key as the real ECU, then
 * answers live data from a small engine model driving an 80 s loop:
 * idle, pull away through the gears, cruise, overtake, coast down.
 */
import type { SimulatedEcu } from "@/core/profile";
import { groups } from "./data";
import { encodeFaults, READ_FAULTS } from "./faults";
import { td5Key } from "./keygen";

export interface SimSnapshot {
  rpm: number;
  speed: number;
  pedal: number;
  mapKpa: number;
  ambientKpa: number;
  maf: number;
  coolant: number;
  fuelTemp: number;
  airTemp: number;
  battery: number;
}

export function createTd5Simulator(): SimulatedEcu {
  let session = false;
  let unlocked = false;
  let seed = 0;
  // Faults like those read on a real Discovery 2 Td5 (discovery2-diag): air flow circuit active
  // and logged low, inlet air temperature logged high, and EGR vacuum logged low.
  const faults = new Set(["4.6", "0.6", "3.0", "0.2"]);
  const engine = new EngineModel();
  const neg = (sid: number, code: number) => [0x7f, sid, code];
  const is = (p: Uint8Array, req: number[]) => req.every((b, i) => p[i] === b);

  return {
    handle(p) {
      const sid = p[0];
      switch (sid) {
        case 0x81: // startCommunication
          return [0xc1, 0x57, 0x8f];
        case 0x10: // startDiagnosticSession
          session = true;
          return [0x50];
        case 0x3e: // testerPresent
          return [0x7e];
        case 0x27: // securityAccess
          if (!session) return neg(sid, 0x22);
          if (p[1] === 0x01) {
            seed = (Math.random() * 0xffff) | 0;
            return [0x67, 0x01, seed >> 8, seed & 0xff];
          }
          if (p[1] === 0x02) {
            if (((p[2] << 8) | p[3]) !== td5Key(seed)) return neg(sid, 0x35);
            unlocked = true;
            return [0x67, 0x02];
          }
          return neg(sid, 0x12);
        case 0x21: {
          if (!unlocked) return neg(sid, 0x33);
          if (is(p, READ_FAULTS)) return encodeFaults(faults);
          const g = groups.find((g) => is(p, g.request));
          return g ? g.encode(engine.sample()) : neg(sid, 0x31);
        }
        case 0x31: // startRoutine: 31 DD + 18 zeros clears the fault memory
          if (!unlocked) return neg(sid, 0x33);
          if (p[1] !== 0xdd) return neg(sid, 0x12);
          faults.clear();
          return [0x71, 0xdd];
        default:
          return neg(sid, 0x11);
      }
    },
  };
}

const GEAR_KMH_PER_1000 = [7.6, 13.4, 20.5, 28.4, 37.2];
const AMBIENT = 100.8;

class EngineModel {
  private t0 = performance.now();
  private last = this.t0;
  private v = 0;
  private rpm = 780;
  private mapKpa = AMBIENT;
  private pedal = 0;
  private coolant = 18;
  private fuelTemp = 12;

  private pedalTarget(t: number) {
    const p = t % 80;
    if (p < 10) return 0; // idle
    if (p < 32) return 55 + 25 * Math.sin(p * 1.3); // pulling away
    if (p < 58) return 24 + 6 * Math.sin(p * 0.7); // cruise
    if (p < 62) return 85; // overtake
    return 0; // coast down
  }

  sample(): SimSnapshot {
    const now = performance.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const phase = t % 80;

    this.pedal += (this.pedalTarget(t) - this.pedal) * Math.min(1, dt * 6);

    const drive = this.pedal * 0.09;
    const drag = 0.00055 * this.v * this.v + 0.6;
    const brake = phase > 66 ? 6 : 0;
    this.v = Math.max(0, this.v + (drive - drag - brake) * dt);
    if (phase < 10) this.v = Math.max(0, this.v - 8 * dt);

    const gear = GEAR_KMH_PER_1000.findIndex((k) => (this.v / k) * 1000 <= 2700);
    const ratio = GEAR_KMH_PER_1000[gear === -1 ? 4 : gear];
    const target = this.v < 4 ? 780 + this.pedal * 12 : Math.max(800, (this.v / ratio) * 1000);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 5);

    const load = this.pedal / 100;
    const spool = Math.max(0, Math.min(1, (this.rpm - 1300) / 1300));
    this.mapKpa += (AMBIENT + 142 * load * spool - this.mapKpa) * Math.min(1, dt * 2.2);

    this.coolant += (88 - this.coolant) * dt * 0.012 * (1 + load);
    this.fuelTemp += (46 - this.fuelTemp) * dt * 0.004;

    const n = (a: number) => (Math.random() - 0.5) * a;
    return {
      rpm: this.rpm + n(14),
      speed: this.v,
      pedal: this.pedal,
      mapKpa: this.mapKpa + n(0.6),
      ambientKpa: AMBIENT,
      maf: (this.rpm / 1000) * 34 * (this.mapKpa / AMBIENT) + n(2),
      coolant: this.coolant,
      fuelTemp: this.fuelTemp,
      airTemp: 16 + (this.mapKpa - AMBIENT) * 0.18 + n(0.2),
      battery: 14.05 + n(0.06),
    };
  }
}
