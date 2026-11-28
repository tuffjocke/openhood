/**
 * Test history (issue #47): each run of Openhood's test, kept on the person's own computer only, so
 * a later run can be compared with the last one. The CLI and MCP server keep it in a file in the
 * user's folder (cli/test-history.ts); the website keeps imported runs in browser storage, like the
 * fault history (core/history.ts). Nothing that identifies the car or the person: the car is saved
 * under a name the person chooses ("My Defender") with its profile, never a VIN or registration.
 * Pure functions here.
 */
import type { Finding, Verdict } from "./checks";

/** One reading over a check, as run_check returns it. */
export interface SavedReading {
  label: string;
  unit: string;
  min: number;
  max: number;
  last: number;
}

export interface SavedCheck {
  id: string;
  title: string;
  /** ISO date and time it ran. */
  at: string;
  findings: Finding[];
  readings: Record<string, SavedReading>;
}

export interface TestRun {
  /** Random, to tell runs apart and merge imports. */
  id: string;
  /** ISO date and time the first check ran. */
  date: string;
  /** The name the person chose for the car, or null. */
  car: string | null;
  profile: string;
  /** "kkl" or "elm327". */
  adapter: string;
  /** In the order they last ran; a check run again replaces its earlier result. */
  checks: SavedCheck[];
}

export interface TestHistoryFile {
  app: "openhood";
  kind: "test-history";
  version: 1;
  runs: TestRun[];
}

/** Where the website keeps imported runs in browser storage, every car together. */
export const TESTS_STORAGE = "openhood.tests";

/** Enough for years of tests; the oldest go first. */
export const MAX_RUNS = 200;

export const testHistoryFile = (runs: TestRun[]): TestHistoryFile => ({ app: "openhood", kind: "test-history", version: 1, runs });

/** Add or replace one check's result in its run, adding the run if it's new. Newest run first. */
export function saveCheck(runs: TestRun[], run: Omit<TestRun, "checks">, check: SavedCheck): TestRun[] {
  const old = runs.find((r) => r.id === run.id);
  const next: TestRun = { ...run, checks: [...(old?.checks ?? []).filter((c) => c.id !== check.id), check] };
  return [next, ...runs.filter((r) => r.id !== run.id)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_RUNS);
}

/** This car's runs, newest first: the same profile and, when the person named the car, the same name. */
export function runsFor(runs: TestRun[], profile: string, car: string | null = null): TestRun[] {
  const name = car?.toLowerCase();
  return runs.filter((r) => r.profile === profile && (!name || r.car?.toLowerCase() === name)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Combine two histories (an import), one copy of each run, the one with more checks. */
export function mergeRuns(a: TestRun[], b: TestRun[]): TestRun[] {
  const byId = new Map(a.map((r) => [r.id, r]));
  for (const r of b) if ((byId.get(r.id)?.checks.length ?? -1) < r.checks.length) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => y.date.localeCompare(x.date)).slice(0, MAX_RUNS);
}

/** The worst finding: what a check's dot shows. */
export const worstOf = (f: Finding[]): Verdict => (f.some((x) => x.verdict === "look") ? "look" : f.some((x) => x.verdict === "unclear") ? "unclear" : "ok");

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

/**
 * The car's name as the person gave it, tidied: plain letters, numbers and a few signs, at most 40.
 * null for nothing. Throws for what looks like a VIN: that identifies the car.
 */
export function carName(text: string | undefined | null): string | null {
  const name = (text ?? "").replace(/[^\p{L}\p{N} .,'()+-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return null;
  if (VIN.test(name.replace(/\s/g, ""))) throw new Error("That looks like a VIN. Give the car a name instead, like \"My Defender\": the history never keeps anything that identifies the car.");
  return name;
}

const isFinding = (f: unknown): f is Finding => {
  const x = f as Finding;
  return !!x && (x.verdict === "ok" || x.verdict === "look" || x.verdict === "unclear") && typeof x.text === "string";
};

const isReading = (v: unknown): v is SavedReading => {
  const x = v as SavedReading;
  return !!x && typeof x.label === "string" && typeof x.unit === "string" && [x.min, x.max, x.last].every((n) => typeof n === "number");
};

const isCheck = (c: unknown): c is SavedCheck => {
  const x = c as SavedCheck;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.at === "string" &&
    Array.isArray(x.findings) &&
    x.findings.every(isFinding) &&
    !!x.readings &&
    typeof x.readings === "object" &&
    Object.values(x.readings).every(isReading)
  );
};

const isRun = (r: unknown): r is TestRun => {
  const x = r as TestRun;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.date === "string" &&
    (x.car === null || typeof x.car === "string") &&
    typeof x.profile === "string" &&
    typeof x.adapter === "string" &&
    Array.isArray(x.checks) &&
    x.checks.every(isCheck)
  );
};

/** Parse and check a test history file. Throws a readable error for anything else. */
export function parseTestHistory(text: string): TestHistoryFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't an Openhood test history.");
  }
  const d = data as TestHistoryFile;
  if (d?.app !== "openhood" || d.kind !== "test-history" || !Array.isArray(d.runs)) throw new Error("That file isn't an Openhood test history.");
  if (d.version !== 1) throw new Error("This test history is from a newer version of Openhood.");
  if (!d.runs.every(isRun)) throw new Error("The test history file is damaged.");
  return d;
}
