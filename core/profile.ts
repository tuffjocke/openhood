/**
 * THE CONTRACT. Every supported vehicle is one VehicleProfile in /profiles.
 * The core (transports, framing, session, UI) never contains vehicle specifics.
 *
 * To add a vehicle, copy /profiles/_template and read docs/adding-a-vehicle.md.
 */
import type { Addresses } from "./kwp2000/frame";

/** Decoded values by key. Keys not listed in `channels` are kept but not shown (e.g. ambient pressure). */
export type Values = Record<string, number>;

/**
 * How trustworthy a piece of the profile is.
 *  - "verified":   checked on a real vehicle (say how in `notes` or the profile README)
 *  - "community":  from forums, docs or other projects, not yet checked by us
 *  - "guess":      placeholder, expect it to be wrong
 */
export type Confidence = "verified" | "community" | "guess";

export interface Channel {
  /** Key in Values, e.g. "rpm". Use camelCase. */
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** Fixed range for the sparkline. */
  min: number;
  max: number;
  /** Highlight when the value goes above this. */
  warnAbove?: number;
  /** Highlight when the value goes below this. */
  warnBelow?: number;
  confidence: Confidence;
}

export interface Group {
  /** Unique within the profile, e.g. "rpm" or "temperatures". */
  id: string;
  /** Request payload (service id + data), e.g. [0x21, 0x09]. */
  request: number[];
  /**
   * Optional: is this group supported by the connected ECU? Checked once after connect,
   * using whatever `connect` stored in state (e.g. OBD "supported PIDs" bitmasks).
   * Unavailable groups are skipped when polling. Default: always available.
   */
  available?(state: Readonly<Values>): boolean;
  /** Channel keys this group produces. Lets the UI mark channels "n/a" when the group is unavailable. */
  provides?: string[];
  /**
   * Turn the response payload into values.
   * `res` is the full response payload including the positive SID, e.g. [0x61, 0x09, 0x03, 0x1F].
   * `state` holds every value decoded so far (read-only), for values that depend on others.
   */
  decode(res: Uint8Array, state: Readonly<Values>): Values;
  confidence: Confidence;
}

/** What a profile gets to talk to the ECU with. */
export interface EcuLink {
  /**
   * Send a request payload, wait for the positive response payload.
   * Throws NegativeResponse if the ECU refuses, TimeoutError if it says nothing.
   * Handles "response pending" (0x78) and the inter-message delay for you.
   */
  request(payload: number[], opts?: RequestOptions): Promise<Uint8Array>;
  /**
   * Like request, but keeps listening after the first answer and returns every matching response
   * frame (several ECUs answering a functional request, or one answer split over frames).
   * Stops after `windowMs` of silence (default 80 ms).
   */
  requestMany(payload: number[], opts?: RequestOptions & { windowMs?: number }): Promise<Uint8Array[]>;
}

export interface RequestOptions {
  /** Send with an address header. Default: link.alwaysAddressed. */
  addressed?: boolean;
  /** Shown next to the request in the traffic log. */
  note?: string;
}

export interface SimulatedEcu {
  /**
   * Answer one request payload with a response payload, or null for silence.
   * Return [0x7F, sid, code] for a negative response.
   * Return an array of payloads to answer with several frames (e.g. several ECUs answering).
   */
  handle(payload: Uint8Array): number[] | number[][] | null;
}

export interface VehicleProfile {
  /** Folder name, kebab-case: "land-rover-td5". */
  id: string;
  /** Shown in the picker: "Land Rover Td5". */
  name: string;
  /** Which vehicles and years: "Defender, Discovery 2 · 1998 to 2006". */
  covers: string;
  /** Which ECU this talks to: "Engine ECU (MSB/NNN)". */
  ecu: string;
  /**
   * What cable or adapter this car needs, in one or two plain sentences. Shown before connecting.
   * Default if omitted: the standard KKL cable (docs/hardware.md).
   */
  hardware?: string;
  /** Overall maturity. Keep "experimental" until it has been used on a real car. */
  status: "experimental" | "tested";

  link: {
    baudRate: number;
    /** Only "fast" (ISO 14230 fast init) is implemented so far. */
    init: "fast";
    addresses: Addresses;
    /**
     * "physical" (default): talk to one ECU at addresses.ecu (header 0x80).
     * "functional": broadcast to a function address such as 0x33 for OBD-II (header 0xC0).
     */
    addressMode?: "physical" | "functional";
    /** Put an address header on every request, not only where `addressed: true`. OBD-II needs this. */
    alwaysAddressed?: boolean;
    /** Delay after each response before the next request (KWP2000 P3). Default 30 ms. */
    interMessageMs?: number;
  };

  /**
   * Wake-up is done by the core. This runs right after: start session, unlock, etc.
   * `state` is writable here: store anything groups need later (e.g. supported PID bitmasks).
   */
  connect(ecu: EcuLink, state: Values): Promise<void>;

  channels: Channel[];
  groups: Group[];
  /** Order in which groups are polled, repeated forever. Repeat fast ones to poll them more often. */
  schedule: string[];
  /** Groups read once after connect and then every ~30 s (e.g. ambient pressure). */
  slowGroups?: string[];

  faults?: {
    read(ecu: EcuLink): Promise<string[]>;
    clear?(ecu: EcuLink): Promise<void>;
    confidence: Confidence;
  };

  /** A fake ECU for development and tests. Required: every profile must run without a car. */
  simulator(): SimulatedEcu;

  /** Anything a contributor should know. Shown nowhere in the UI, read by humans and agents. */
  notes?: string;
}
