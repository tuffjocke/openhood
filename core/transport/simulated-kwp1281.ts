import { BLOCK_END, TITLE } from "../kwp1281/protocol";
import type { SimulatedEcu } from "../profile";
import type { ByteQueue } from "./types";

/**
 * The ECU side of KWP1281, byte by byte, for a profile's simulator. The profile only sees blocks:
 * `handle([title, ...data])` returns one block or several, and `handle([])` gives the identification
 * blocks sent after waking. Several blocks go out one per confirmation, then an ack.
 */
export class SimulatedKwp1281 {
  /** What the ECU is doing with the line right now. */
  private phase: "confirm-keyword" | "sending" | "listening" = "confirm-keyword";
  private outgoing: number[][] = [];
  /** The block being sent and how far along it is. */
  private sending: number[] = [];
  private at = 0;
  /** The block being received from the tester. */
  private incoming: number[] = [];
  private counter = 0;

  constructor(
    private ecu: SimulatedEcu,
    private kw: [number, number],
    private rx: ByteQueue,
  ) {
    setTimeout(() => rx.push(Uint8Array.of(0x55)), 20);
    setTimeout(() => rx.push(Uint8Array.of(kw[0], kw[1])), 30);
  }

  private push(b: number) {
    setTimeout(() => this.rx.push(Uint8Array.of(b)), 1);
  }

  /** A byte from the tester. */
  onByte(b: number) {
    if (this.phase === "confirm-keyword") {
      if (b !== (~this.kw[1] & 0xff)) return;
      this.outgoing = blocks(this.ecu.handle(new Uint8Array(0)));
      this.next();
      return;
    }
    if (this.phase === "sending") {
      // The tester confirms each byte we send with its inverse.
      if (b !== (~this.sending[this.at] & 0xff)) return;
      this.at++;
      if (this.at < this.sending.length) this.push(this.sending[this.at]);
      else {
        this.push(BLOCK_END);
        this.phase = "listening";
      }
      return;
    }
    // Listening: confirm every byte but the end.
    this.incoming.push(b);
    const len = this.incoming[0];
    if (this.incoming.length <= len) {
      this.push(~b & 0xff);
      return;
    }
    if (b !== BLOCK_END) return;
    const block = this.incoming.slice(2, len); // title and data
    this.counter = this.incoming[1];
    this.incoming = [];
    this.answer(block);
  }

  private answer(block: number[]) {
    const title = block[0];
    if (title === TITLE.disconnect) return; // asleep again: silence
    if (title === TITLE.ack) {
      // Next block of a longer answer, or ack when there's nothing more.
      if (!this.outgoing.length) this.outgoing = [[TITLE.ack]];
    } else {
      const res = this.ecu.handle(Uint8Array.from(block));
      this.outgoing = res ? blocks(res) : [[TITLE.refuse]];
    }
    setTimeout(() => this.next(), 5);
  }

  private next() {
    const block = this.outgoing.shift() ?? [TITLE.ack];
    this.counter = (this.counter + 1) & 0xff;
    this.sending = [block.length + 2, this.counter, ...block];
    this.at = 0;
    this.phase = "sending";
    this.push(this.sending[0]);
  }
}

const blocks = (res: number[] | number[][] | null): number[][] =>
  !res ? [] : Array.isArray(res[0]) ? (res as number[][]) : [res as number[]];
