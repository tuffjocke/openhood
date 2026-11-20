import type { EcuLink, InitResult } from "../profile";

export interface TrafficEvent {
  t: number;
  dir: "tx" | "rx";
  bytes: Uint8Array;
  note?: string;
  /** Text sent to or received from an ELM327 adapter, shown instead of bytes. */
  text?: string;
}

export type Traffic = (e: TrafficEvent) => void;

/**
 * Everything between the session and the car: wake-up, framing and request matching.
 *  - KlineLink: a KKL cable (or the simulator), raw KWP2000 / ISO 9141-2 frames.
 *  - ElmLink: an ELM327-type adapter, text commands.
 * The session only sees EcuLink, so profiles never know which one is in use.
 */
export interface Link extends EcuLink {
  readonly adapter: "kkl" | "elm327" | "simulator";
  /** Open the connection, wake the ECU and run the profile's connect with the result. */
  open(connect: (ecu: EcuLink, init: InitResult) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

export const isLink = (x: object): x is Link => "open" in x && "requestMany" in x && "adapter" in x;
