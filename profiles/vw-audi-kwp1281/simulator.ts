/**
 * A pretend VW Group engine ECU on KWP1281. The byte-by-byte part of the protocol is simulated by
 * the core (core/transport/simulated-kwp1281.ts); this only answers blocks.
 *
 * The measuring block layout here is made up for the demo and the tests. Real ECUs keep readings
 * in different blocks, which is why the profile looks for them at connect instead of assuming.
 * The identification text is made up too, so it can't be mistaken for a real part number.
 */
import type { SimulatedEcu } from "@/core/profile";
import { TITLE } from "@/core/kwp1281/protocol";

const text = (s: string) => [TITLE.ident, ...Array.from(s, (c) => c.charCodeAt(0))];

/** A measuring block value: formula, then the two bytes it turns into a number. */
type Value = [number, number, number];
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

// Each encoder is the inverse of the matching formula in core/kwp1281/protocol.ts.
const rpm = (v: number): Value => [0x01, 200, clampByte(v / 40)]; // a * b * 0.2
const temp = (v: number): Value => [0x05, 10, clampByte(v + 100)]; // (b - 100) * a * 0.1
const lambda = (v: number): Value => [0x14, 128, clampByte(v + 128)]; // (b - 128) * a / 128
const load = (v: number): Value => [0x21, 200, clampByte(v * 2)]; // b / a * 100
const injection = (v: number): Value => [0x0f, 10, clampByte(v * 10)]; // a * b * 0.01
const airflow = (v: number): Value => {
  const raw = Math.round(v * 180); // (256 * b + a) / 180
  return [0x19, raw & 0xff, (raw >> 8) & 0xff];
};
const throttle = (v: number): Value => [0x03, 250, clampByte(v * 2)]; // a * b * 0.002
const ignition = (v: number): Value => [0x04, 100, clampByte(127 - v)]; // (b - 127) * a * -0.01
const volts = (v: number): Value => [0x06, 100, clampByte(v * 10)]; // a * b * 0.001
const speed = (v: number): Value => [0x07, 100, clampByte(v)]; // a * b * 0.01
const switches: Value = [0x10, 0xff, 0x24];

export function createVagSimulator(): SimulatedEcu {
  // Faults to show: a coolant sensor with a bad plug, and misfires now and then.
  let faults: number[][] = [
    [0x02, 0x0a, 0x1f], // 00522, open or shorted to ground
    [0x41, 0x2c, 0x80 | 0x25], // P0300, faulty, comes and goes
  ];
  const engine = new EngineModel();

  const group = (n: number): number[] | null => {
    const e = engine.tick();
    const blocks: Record<number, Value[]> = {
      1: [rpm(e.rpm), temp(e.coolant), lambda(e.lambda), switches],
      2: [rpm(e.rpm), load(e.load), injection(e.injection), airflow(e.airflow)],
      3: [rpm(e.rpm), airflow(e.airflow), throttle(e.throttle), ignition(e.ignition)],
      4: [rpm(e.rpm), volts(e.battery), temp(e.coolant), temp(e.intake)],
      5: [rpm(e.rpm), load(e.load), speed(e.speed), switches],
    };
    const b = blocks[n];
    return b ? [TITLE.groupReading, ...b.flat()] : null;
  };

  return {
    wakeup: { slow: [0x01, 0x8a] },
    handle(p) {
      if (!p.length) return [text("OPENHOOD SIM "), text("1.8 R4 DEMO  "), text("0000")];
      switch (p[0]) {
        case TITLE.readGroup:
          return group(p[1]) ?? [TITLE.refuse];
        case TITLE.readFaults: {
          if (!faults.length) return [[TITLE.faults, 0xff, 0xff, 0x88]];
          const out: number[][] = [];
          for (let i = 0; i < faults.length; i += 4) out.push([TITLE.faults, ...faults.slice(i, i + 4).flat()]);
          return out;
        }
        case TITLE.clearFaults:
          faults = [];
          return [TITLE.ack];
        default:
          return [TITLE.refuse];
      }
    },
  };
}

/** A small petrol engine on a loop: idle, pull away through the gears, cruise, slow down. */
class EngineModel {
  private t0 = performance.now();
  private rpm = 850;
  private speed = 0;
  private gear = 1;
  private coolant = 84;

  tick() {
    const t = ((performance.now() - this.t0) / 1000) % 60;
    const throttle = t < 8 ? 0 : t < 30 ? 35 + 20 * Math.sin(t / 3) : t < 45 ? 12 : 0;
    const ratio = [0, 120, 68, 46, 35, 28][this.gear];
    if (throttle > 0) {
      this.speed = Math.min(150, this.speed + throttle * 0.02);
      if (this.speed * ratio > 3200 && this.gear < 5) this.gear++;
    } else {
      this.speed = Math.max(0, this.speed - 0.6);
      if (this.speed * ratio < 1300 && this.gear > 1) this.gear--;
    }
    const target = this.speed < 3 ? 850 + 15 * Math.sin(t * 3) : Math.max(850, this.speed * ratio);
    this.rpm += (target - this.rpm) * 0.3;
    this.coolant += (88 + throttle * 0.05 - this.coolant) * 0.02;
    const load = 15 + throttle * 1.2;
    return {
      rpm: this.rpm,
      speed: this.speed,
      coolant: this.coolant,
      intake: 24,
      throttle: 2 + throttle,
      load,
      injection: 2 + load * 0.08,
      airflow: 3 + (this.rpm / 1000) * load * 0.25,
      ignition: 12 + throttle * 0.2,
      lambda: 2 * Math.sin(t),
      battery: 13.9 + 0.3 * Math.min(1, this.rpm / 2200),
    };
  }
}
