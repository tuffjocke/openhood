/**
 * The live view: what the MCP server (cli/watch-server.ts) streams to the watch page
 * (components/Watch.tsx) while an agent reads the car. One way only, from the car to the page:
 * the page can't ask the car anything. Both sides ship in the same npm package, so they match.
 */
import type { Finding } from "./checks";
import type { Fault, Readiness, Values } from "./profile";

/** Where the page gets the stream, on the same origin it was served from. */
export const WATCH_EVENTS = "/events";
/** The page, as the MCP server's live view link points at it. */
export const WATCH_PAGE = "/watch/";

/** "lost": the car stopped answering between the agent's reads; its next read connects again. */
export type WatchStatus = "idle" | "connecting" | "connected" | "failed" | "lost";

export interface WatchState {
  status: WatchStatus;
  /** Why the last connect failed, as the agent was told. */
  error: string | null;
  /** The profile the agent connected with; the page has every profile built in. */
  profileId: string | null;
  /** "kkl", "elm327" or "simulator". */
  adapter: string | null;
  /** Channel keys this ECU doesn't support. */
  unavailable: string[];
  /** Latest value of every channel read so far, metric, as the profile gives them. */
  values: Values;
  /** null until the agent reads them. */
  faults: Fault[] | null;
  pending: Fault[] | null;
  readiness: Readiness | null;
  /** The test check the agent is running (core/checks.ts), or null. */
  check: WatchCheck | null;
}

/** A check on the live view: what the person should do, and once done, what it found. */
export interface WatchCheck {
  /** The check's id in the profile's `checks`; the page finds its pacer there. */
  id: string;
  title: string;
  ask: string;
  seconds: number;
  /** How far into the check it was when this was sent, so a page can run the pacer itself. */
  elapsedMs: number;
  /** null while it runs. */
  findings: Finding[] | null;
}

export type WatchEvent =
  /** Everything at once: when the page connects, and when the agent connects or disconnects. */
  | { type: "state"; state: WatchState; traffic: string[] }
  | { type: "values"; values: Values }
  | { type: "faults"; faults: Fault[]; pending: Fault[] | null; readiness: Readiness | null }
  | { type: "traffic"; line: string };

export const emptyWatchState = (): WatchState => ({
  status: "idle",
  error: null,
  profileId: null,
  adapter: null,
  unavailable: [],
  values: {},
  faults: null,
  pending: null,
  readiness: null,
  check: null,
});
