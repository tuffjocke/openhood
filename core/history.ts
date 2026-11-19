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
