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
  /**
   * What the reading is about, which sets its colour in the live charts:
   * "air" going in (blue), the "engine" itself (yellow), "fuel" (green). Leave out for anything else.
   */
  group?: ChannelGroup;
  confidence: Confidence;
}

export type ChannelGroup = "air" | "engine" | "fuel";

/**
 * Which readings get a round dial on the live screen. Everything else gets a chart below.
 * `main` is the big one in the middle, `left` and `right` sit either side, `battery` is a bar
 * inside the big dial. Each is a channel key. Default: the first three channels, no battery bar.
 */
export interface Dials {
  main: string;
  left?: string;
  right?: string;
  battery?: string;
}

export interface Group {
  /** Unique within the profile, e.g. "rpm" or "temperatures". */
  id: string;
  /** Request payload (service id + data), e.g. [0x21, 0x09]. */
  request: number[];
  /**
   * Optional: build the request from what `connect` found instead, for ECUs that say at connect
   * where they keep a reading (KWP1281 measuring blocks). Used in place of `request` when given.
   */
  requestFor?(state: Readonly<Values>): number[];
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

/** One stored fault as the ECU reports it. */
export interface Fault {
  /** Stable key, used to look up `explanations`. For OBD codes: the code, e.g. "P0171". */
  id: string;
  /** Code to show, if the ECU uses codes ("P0171"). Omit for ECUs that only report named faults. */
  code?: string;
  /** Short name to show when there is no explanation: the official title or the profile's own name. */
  name: string;
  /** Plain-language state, if the ECU reports one: "active now", "stored". Faults that share an
   *  explanation are shown as one row with their states listed. */
  state?: string;
}

/**
 * How urgent a fault is, as guidance for a non-mechanic:
 *  - "ok":   fine to keep driving, fix when convenient
 *  - "soon": drive gently, get it fixed soon
 *  - "now":  risk of damage or unsafe: stop or go straight to a garage
 */
export type Urgency = "ok" | "soon" | "now";

/** A plain-language explanation of a fault, written for people who aren't mechanics. */
export interface FaultInfo {
  /** Everyday title: "Engine is getting too much air or too little fuel". */
  title: string;
  /** One or two sentences: what it means and what happens if you ignore it. */
  plain: string;
  /** Common causes, most likely first. */
  causes: string[];
  /** The first, cheapest thing to check. */
  check?: string;
  urgency: Urgency;
  confidence: Confidence;
}

/** Emissions self-test status (OBD "readiness monitors"). */
export interface Readiness {
  /** Engine warning light on. */
  milOn: boolean;
  /** Each supported self-test and whether it has finished since the last clear. */
  monitors: { name: string; complete: boolean }[];
}

/**
 * How the link to the ECU was set up.
 *  - "fast" / "slow": a KKL cable woke the ECU on the K-line. After slow init the key bytes tell
 *    which protocol it speaks. A KWP1281 ECU then sends its identification text (`ident`): part
 *    number and engine, not personal, but the coding line can be per car, so keep it to the profile.
 *  - "adapter": an ELM327-type adapter set up the link itself. `can` is true on CAN cars (most cars
 *    from 2008 on), where some OBD answers differ slightly (mode 03 starts with a count byte).
 *    `protocol` is the adapter's own description, for the traffic log.
 */
export type InitResult =
  | { kind: "fast" }
  | { kind: "slow"; keyBytes: [number, number]; protocol: "iso9141" | "kwp2000" }
  | { kind: "slow"; keyBytes: [number, number]; protocol: "kwp1281"; ident: string[] }
  | { kind: "adapter"; can: boolean; protocol: string };

/**
 * The hardware between the browser and the car:
 *  - "kkl": a plain USB K-line cable. Raw access, needed for manufacturer protocols. Pre-CAN cars only.
 *  - "elm327": an ELM327-compatible adapter (USB or Bluetooth). Speaks standard OBD-II on every
 *    protocol, CAN included, but can't do most manufacturer-specific K-line sessions.
 */
export type AdapterKind = "kkl" | "elm327";

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
  /** How the link was set up. Lets profile code handle CAN and K-line differences. */
  readonly init: InitResult;
}

export interface RequestOptions {
  /** Send with an address header. Default: link.alwaysAddressed. */
  addressed?: boolean;
  /** Shown next to the request in the traffic log. */
  note?: string;
}

export interface SimulatedEcu {
  /**
   * Which wake-ups this ECU answers. Default: fast init only.
   * `slow` gives the two key bytes it sends after a 5-baud init
   * (08 08 or 94 94 = ISO 9141-2, xx 8F = ISO 14230).
   */
  wakeup?: { fast?: boolean; slow?: [number, number] };
  /**
   * Answer one request payload with a response payload, or null for silence.
   * Return [0x7F, sid, code] for a negative response.
   * Return an array of payloads to answer with several frames (e.g. several ECUs answering).
   */
  handle(payload: Uint8Array): number[] | number[][] | null;
}

/** One make/model/year range a profile works with. Shown in the vehicle picker. */
export interface VehicleMatch {
  make: string;
  model: string;
  /** First and last model year, inclusive. */
  from: number;
  to: number;
  /** Engine or variant, to tell profiles apart for the same car: "2.5 Td5 diesel". */
  engine: string;
  /**
   * For profiles that read something other than the engine: what they read, in a few words
   * ("ABS brakes", "Airbag"). The car chooser then asks which one, and offers standard engine codes too.
   */
  system?: string;
}

export interface VehicleProfile {
  /** Folder name, kebab-case: "land-rover-td5". */
  id: string;
  /** Shown in the picker: "Land Rover Td5". */
  name: string;
  /** Which vehicles and years in one line: "Defender, Discovery 2 · 1998 to 2006". */
  covers: string;
  /**
   * The cars this profile is for, used by the make/model/year picker.
   * Leave empty only for a generic profile (see `generic`).
   */
  vehicles: VehicleMatch[];
  /** A catch-all profile offered for cars that aren't listed (generic OBD-II). */
  generic?: boolean;
  /** Which ECU this talks to: "Engine ECU (MSB/NNN)". */
  ecu: string;
  /**
   * What cable or adapter this car needs, in one or two plain sentences. Shown before connecting.
   * Default if omitted: the standard KKL cable (docs/hardware.md).
   */
  hardware?: string;
  /**
   * Which adapters can run this profile, the recommended one first. Default ["kkl"].
   * Only list "elm327" if the profile uses nothing but standard OBD-II requests.
   */
  adapters?: AdapterKind[];
  /** Overall maturity. Keep "experimental" until it has been used on a real car. */
  status: "experimental" | "tested";

  link: {
    baudRate: number;
    /**
     * Which K-line protocol. Default "kwp2000" (ISO 14230, or ISO 9141-2 when the key bytes say so).
     * "kwp1281": VW Group's older protocol, every byte confirmed by the other side (core/kwp1281).
     * Needs init "slow". Requests are a block title and its data, e.g. [0x29, 1] reads group 1,
     * and answers start with the ECU's block title, e.g. [0xE7, ...].
     */
    protocol?: "kwp2000" | "kwp1281";
    /** Other speeds to try if the ECU doesn't answer the wake-up at `baudRate` (some KWP1281 ECUs use 9600). */
    altBaudRates?: number[];
    /**
     * How to wake the ECU:
     *  - "fast": ISO 14230 fast init (25 ms pulse)
     *  - "slow": 5-baud init (ISO 9141-2, or ISO 14230 with slow init), see slowInitAddress
     *  - "auto": try fast, fall back to slow if the ECU doesn't answer
     */
    init: "fast" | "slow" | "auto";
    /** Address sent at 5 baud for slow init. Default 0x33 (OBD-II). */
    slowInitAddress?: number;
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
    /** Gap between bytes we send (KWP2000 P4, 0 to 20 ms). Default 0: send the frame in one go. */
    interByteMs?: number;
    /**
     * Added to the data length in an addressed frame's format byte, both ways. Default 0 (ISO 14230).
     * Volvo's keyword D3 B0 protocol counts one more than the data: `82 51 13 A1 87` carries one byte.
     */
    lengthOffset?: number;
  };

  /**
   * Wake-up is done by the core. This runs right after: start session, unlock, etc.
   * `state` is writable here: store anything groups need later (e.g. supported PID bitmasks).
   */
  connect(ecu: EcuLink, state: Values, init: InitResult): Promise<void>;

  channels: Channel[];
  /** The round dials on the live screen. See Dials. */
  dials?: Dials;
  groups: Group[];
  /** Order in which groups are polled, repeated forever. Repeat fast ones to poll them more often. */
  schedule: string[];
  /** Groups read once after connect and then every ~30 s (e.g. ambient pressure). */
  slowGroups?: string[];

  faults?: {
    read(ecu: EcuLink): Promise<Fault[]>;
    clear?(ecu: EcuLink): Promise<void>;
    /** Plain-language explanations by Fault.id. Faults without one show their name only. */
    explanations?: Record<string, FaultInfo>;
    /** Clearing also resets emissions self-tests (true for OBD-II cars). Shown as a warning. */
    clearResetsReadiness?: boolean;
    /** Optional: read the warning light and emissions self-test status. */
    readiness?(ecu: EcuLink): Promise<Readiness>;
    /** Optional: faults the ECU has noticed but not yet confirmed (no warning light yet). */
    readPending?(ecu: EcuLink): Promise<Fault[]>;
    /**
     * Optional: the snapshot the ECU stored when this fault was set (rpm, speed, temperature...).
     * Values use the profile's channel keys. Return null if there is no snapshot for this fault.
     */
    freezeFrame?(ecu: EcuLink, fault: Fault, state: Readonly<Values>): Promise<Values | null>;
    confidence: Confidence;
  };

  /** A fake ECU for development and tests. Required: every profile must run without a car. */
  simulator(): SimulatedEcu;

  /** Anything a contributor should know. Shown nowhere in the UI, read by humans and agents. */
  notes?: string;
}
