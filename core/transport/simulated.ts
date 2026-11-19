import { addressedFrame, parseFrame, shortFrame } from "../kwp2000/frame";
import type { SimulatedEcu, VehicleProfile } from "../profile";
import { ByteQueue, sleep, type Transport } from "./types";

/**
 * A K-line with a profile's simulated ECU on the other end.
 * Handles framing and timing; the profile's simulator only sees payloads.
 */
export class SimulatedTransport implements Transport {
  readonly kind = "simulator" as const;
  private rx = new ByteQueue();
  private ecu: SimulatedEcu | null = null;

  constructor(private profile: VehicleProfile) {}

  async open() {}

  async close() {
    this.ecu = null;
  }

  async fastInit() {
    await sleep(50);
    this.ecu = this.profile.simulator(); // a fresh ECU on every wake-up
  }

  async write(bytes: Uint8Array) {
    if (!this.ecu) return; // asleep: silence, the session will time out
    const req = parseFrame(bytes);
    const res = this.ecu.handle(req.payload);
    if (!res) return;
    const frames = (Array.isArray(res[0]) ? res : [res]) as number[][];
    const { ecu, tester } = this.profile.link.addresses;
    // A real ECU answers within P2 (~25 ms); extra frames follow a little later.
    frames.forEach((payload, i) => {
      const reply = req.addressed ? addressedFrame(payload, tester, ecu) : shortFrame(payload);
      setTimeout(() => this.rx.push(reply), 8 + Math.random() * 12 + i * 15);
    });
  }

  read(n: number, timeoutMs: number) {
    return this.rx.take(n, timeoutMs);
  }

  flush() {
    this.rx.clear();
  }
}
