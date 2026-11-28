/**
 * Where the CLI and MCP server keep the test history (core/test-history.ts): one file in the
 * user's own folder, ~/.openhood/test-history.json, readable by that user only. Never sent anywhere.
 * `openhood history` lists, exports and deletes it; `--no-history` stops saving.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseTestHistory, testHistoryFile, type TestRun } from "../core/test-history";

export const defaultHistoryPath = () => join(homedir(), ".openhood", "test-history.json");

/** Every saved run, or none if there is no file yet. Throws for a damaged file. */
export function loadRuns(path: string): TestRun[] {
  if (!existsSync(path)) return [];
  return parseTestHistory(readFileSync(path, "utf8")).runs;
}

export function saveRuns(path: string, runs: TestRun[]) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(testHistoryFile(runs), null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // also for a file made before
  } catch {}
}

/** Delete the whole history. Returns how many runs it had. */
export function deleteRuns(path: string): number {
  let n = 0;
  try {
    n = loadRuns(path).length;
  } catch {}
  rmSync(path, { force: true });
  return n;
}
