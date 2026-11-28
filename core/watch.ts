/**
 * The live view: what the MCP server (cli/watch-server.ts) streams to the watch page
 * (components/Watch.tsx) while an agent reads the car, and the few commands the page may send back
 * to run Openhood's test from the page itself (issue #37): run a check, skip it, stop it, reconnect.
 * All read-only, like the checks. Both sides ship in the same npm package, so they match.
 */
import type { Finding, StepCue, Verdict } from "./checks";
import type { TestRun } from "./test-history";
import type { Fault, Readiness, Values } from "./profile";

/** Where the page gets the stream, on the same origin it was served from. */
export const WATCH_EVENTS = "/events";
/** Where the page posts a WatchCommand, with the stream's token in this header. */
export const WATCH_COMMAND = "/command";
export const TOKEN_HEADER = "X-Openhood-Token";
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
  /** The test check running or last run (core/checks.ts), or null. */
  check: WatchCheck | null;
  /** Openhood's test for the connected car: every step and how it went. null before connecting. */
  test: WatchTest | null;
  /** Why the page's last command didn't go through, in plain words. */
  notice: string | null;
  /** Earlier test runs of this car, saved on this computer (core/test-history.ts). null before connecting. */
  history: WatchHistory | null;
}

export interface WatchHistory {
  /** Off when started with --no-history. */
  saving: boolean;
  /** The car's earlier runs, newest first, not the one going on now. */
  runs: TestRun[];
}

/** The steps of Openhood's test, in order, as list_checks gives them to an agent. */
export interface WatchTest {
  /** Said before the first check with the engine running. */
  safety: string;
  steps: WatchStep[];
  /** Once every step has run or been skipped: the test report as a GitHub issue link, without fault codes. */
  reportUrl?: string;
}

export interface WatchStep {
  id: string;
  title: string;
  ask: string;
  seconds: number;
  engineRunning: boolean;
  /** The worst finding of its last run, "skipped", or null before it has run. */
  result: Verdict | "skipped" | null;
}

/** What the page may ask for. Nothing else: no raw requests, no clearing, nothing that writes. */
export type WatchCommand = { action: "run"; id: string } | { action: "skip"; id: string } | { action: "stop" } | { action: "reconnect" };

/** A check on the live view: what the person should do, and once done, what it found. */
export interface WatchCheck {
  /** The check's id in the profile's `checks`; the page finds its pacer there. */
  id: string;
  title: string;
  ask: string;
  seconds: number;
  /** How far into the check it was when this was sent, so a page can run the pacer itself. */
  elapsedMs: number;
  /** For a check with steps: the one thing to do now, as the car's readings move it on. null once they're done. */
  step?: StepCue | null;
  /** null while it runs. */
  findings: Finding[] | null;
}

export type WatchEvent =
  /** Everything at once: when the page connects, and when the agent connects or disconnects. */
  | { type: "state"; state: WatchState; traffic: string[] }
  | { type: "values"; values: Values }
  | { type: "faults"; faults: Fault[]; pending: Fault[] | null; readiness: Readiness | null }
  | { type: "traffic"; line: string }
  /** First on every stream: the token the page sends with its commands. Only a page that can read the stream has it. */
  | { type: "control"; token: string };

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
  test: null,
  notice: null,
  history: null,
});

/** Check that something posted to the live view is a WatchCommand, and nothing more. */
export function parseCommand(v: unknown): WatchCommand | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === "string" && /^[a-z0-9-]{1,40}$/.test(o.id) ? o.id : null;
  if ((o.action === "run" || o.action === "skip") && id) return { action: o.action, id };
  if (o.action === "stop" || o.action === "reconnect") return { action: o.action };
  return null;
}
