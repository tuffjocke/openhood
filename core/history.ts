/**
 * Fault history: which faults a car has shown, and when. Kept in the browser only.
 * Pure functions here; components/Dashboard.tsx does the storing.
 */
import type { Fault } from "./profile";

export interface HistoryEntry {
  id: string;
  code?: string;
  name: string;
  /** Unix ms. */
  firstSeen: number;
  lastSeen: number;
  /** Number of different days it was seen: a better signal than reads, which repeat. */
  daysSeen: number;
  /** Only ever seen as pending, never confirmed. */
  pendingOnly: boolean;
}

const day = (t: number) => new Date(t).toDateString();

/** Add the faults read just now to the history. Returns a new array, most recently seen first. */
export function mergeHistory(prev: HistoryEntry[], faults: Fault[], now: number, pending = false): HistoryEntry[] {
  const byId = new Map(prev.map((e) => [e.id, { ...e }]));
  for (const f of faults) {
    const e = byId.get(f.id);
    if (!e) {
      byId.set(f.id, { id: f.id, code: f.code, name: f.name, firstSeen: now, lastSeen: now, daysSeen: 1, pendingOnly: pending });
      continue;
    }
    if (day(e.lastSeen) !== day(now)) e.daysSeen++;
    e.lastSeen = now;
    e.name = f.name;
    if (!pending) e.pendingOnly = false;
  }
  return [...byId.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** One storage key per car, so two cars in the same browser don't mix. */
export function historyKey(parts: (string | number | undefined)[]): string {
  return "openhood.history." + parts.filter((p) => p !== undefined && p !== "").join("|");
}

/** Combine two histories of the same car (e.g. from an import). Keeps the widest picture of each fault. */
export function combineHistories(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map(a.map((e) => [e.id, { ...e }]));
  for (const e of b) {
    const cur = byId.get(e.id);
    if (!cur) {
      byId.set(e.id, { ...e });
      continue;
    }
    cur.firstSeen = Math.min(cur.firstSeen, e.firstSeen);
    if (e.lastSeen > cur.lastSeen) {
      cur.lastSeen = e.lastSeen;
      cur.name = e.name;
    }
    cur.daysSeen = Math.max(cur.daysSeen, e.daysSeen);
    cur.pendingOnly = cur.pendingOnly && e.pendingOnly;
  }
  return [...byId.values()].sort((x, y) => y.lastSeen - x.lastSeen);
}

/** The export file: every car's history from this browser. */
export interface HistoryExport {
  app: "openhood";
  kind: "fault-history";
  version: 1;
  exportedAt: string;
  /** Storage key (see historyKey) → entries. */
  cars: Record<string, HistoryEntry[]>;
}

export function buildExport(cars: Record<string, HistoryEntry[]>, now = new Date()): HistoryExport {
  return { app: "openhood", kind: "fault-history", version: 1, exportedAt: now.toISOString(), cars };
}

const isEntry = (e: unknown): e is HistoryEntry => {
  const x = e as HistoryEntry;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.firstSeen === "number" &&
    typeof x.lastSeen === "number" &&
    typeof x.daysSeen === "number" &&
    typeof x.pendingOnly === "boolean" &&
    (x.code === undefined || typeof x.code === "string")
  );
};

/** Parse and check an export file. Throws a readable error for anything else. */
export function parseExport(text: string): HistoryExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't an Openhood history export.");
  }
  const d = data as HistoryExport;
  if (d?.app !== "openhood" || d.kind !== "fault-history" || typeof d.cars !== "object" || !d.cars) {
    throw new Error("That file isn't an Openhood history export.");
  }
  if (d.version !== 1) throw new Error("This export is from a newer version of Openhood.");
  for (const [key, entries] of Object.entries(d.cars)) {
    if (!key.startsWith("openhood.history.") || !Array.isArray(entries) || !entries.every(isEntry)) {
      throw new Error("The history file is damaged.");
    }
  }
  return d;
}
