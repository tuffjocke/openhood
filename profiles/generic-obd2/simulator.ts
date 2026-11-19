/**
 * A pretend OBD-II petrol car on ISO 14230-4. Answers start communication, the supported-PID
 * bitmasks, mode 01 data from a small engine model, and modes 03/04 for trouble codes.
 */
import type { SimulatedEcu } from "@/core/profile";
import { encodeDtc } from "./dtc";
import { groups } from "./pids";

export interface SimSnapshot {
  rpm: number;
  speed: number;
  load: number;
  throttle: number;
  coolant: number;
  airTemp: number;
  maf: number;
  map: number;
  timing: number;
  stft: number;
  ltft: number;
  voltage: number;
}

/** Bitmask word for PIDs base+1 .. base+32, plus the "next block supported" bit. */
function supportWord(base: number, pids: number[], hasNext: boolean) {
  let w = 0;
  for (const p of pids) if (p > base && p <= base + 32) w |= 1 << (31 - (p - base - 1));
  if (hasNext) w |= 1; // PID base+32 = "PIDs base+33..base+64 supported"
  return [(w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff];
}

export function createObdSimulator(): SimulatedEcu {
  const pids = groups.map((g) => g.request[1]);
  // Four codes: more than fit in one frame, to exercise multi-frame reading.
  let stored = ["P0171", "P0420", "P0300", "P0442"];
  const engine = new EngineModel();

  return {
    handle(p) {
      switch (p[0]) {
        case 0x81:
          return [0xc1, 0xe9, 0x8f]; // key bytes for ISO 14230-4
        case 0x3e:
          return [0x7e];
        case 0x01: {
          const pid = p[1];
          if (pid === 0x00) return [0x41, 0x00, ...supportWord(0x00, pids, true)];
          if (pid === 0x20) return [0x41, 0x20, ...supportWord(0x20, pids, true)];
          if (pid === 0x40) return [0x41, 0x40, ...supportWord(0x40, pids, false)];
          const g = groups.find((g) => g.request[1] === pid);
          return g ? g.encode(engine.sample()) : [0x7f, 0x01, 0x12];
        }
        case 0x03: {
          if (!stored.length) return [0x43, 0, 0, 0, 0, 0, 0];
          const frames: number[][] = [];
          for (let i = 0; i < stored.length; i += 3) {
            const chunk = stored.slice(i, i + 3).flatMap(encodeDtc);
            while (chunk.length < 6) chunk.push(0);
            frames.push([0x43, ...chunk]);
          }
          return frames;
        }
        case 0x04:
          stored = [];
          return [0x44];
        default:
          return [0x7f, p[0], 0x11];
      }
    },
  };
}

const GEAR_KMH_PER_1000 = [8, 14, 21, 29, 37];

class EngineModel {
  private t0 = performance.now();
  private last = this.t0;
  private v = 0;
  private rpm = 820;
  private throttle = 0;
  private coolant = 15;
  private ltft = 2.3;

  private throttleTarget(t: number) {
    const p = t % 70;
    if (p < 8) return 0;
    if (p < 26) return 35 + 20 * Math.sin(p * 1.1);
    if (p < 50) return 14 + 4 * Math.sin(p * 0.6);
    if (p < 54) return 80;
    return 0;
  }

  sample(): SimSnapshot {
    const now = performance.now();
    const dt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const phase = t % 70;
    const n = (a: number) => (Math.random() - 0.5) * a;

    this.throttle += (this.throttleTarget(t) - this.throttle) * Math.min(1, dt * 7);
    const drag = 0.0004 * this.v * this.v + 0.5;
    const brake = phase > 60 ? 5 : 0;
    this.v = Math.max(0, this.v + (this.throttle * 0.14 - drag - brake) * dt);
    if (phase < 8) this.v = Math.max(0, this.v - 8 * dt);

    const gear = GEAR_KMH_PER_1000.findIndex((k) => (this.v / k) * 1000 <= 3200);
    const ratio = GEAR_KMH_PER_1000[gear === -1 ? 4 : gear];
    const target = this.v < 4 ? 820 + this.throttle * 20 : Math.max(900, (this.v / ratio) * 1000);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 5);

    const load = Math.min(100, 18 + this.throttle * 0.9);
    const map = 30 + (this.throttle / 100) * 68;
    this.coolant += (90 - this.coolant) * dt * 0.015;

    return {
      rpm: this.rpm + n(12),
      speed: this.v,
      load,
      throttle: this.throttle,
      coolant: this.coolant,
      airTemp: 22 + n(0.4),
      maf: (this.rpm / 1000) * (map / 100) * 14 + n(0.3),
      map: map + n(1),
      timing: 8 + (this.rpm / 1000) * 4 - this.throttle * 0.08 + n(0.5),
      stft: n(6),
      ltft: this.ltft,
      voltage: 14.1 + n(0.08),
    };
  }
}
