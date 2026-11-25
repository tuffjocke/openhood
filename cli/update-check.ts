/**
 * Is a newer openhood on npm? Asked once when the MCP server starts, because npx keeps running a copy
 * it found earlier (a global install, its cache) unless the command says `@latest`. Only the version
 * number is fetched from the npm registry; nothing about the person or the car is sent. Any failure
 * (offline at the car, slow network) just means no notice.
 */
const LATEST_URL = "https://registry.npmjs.org/openhood/latest";

export async function latestVersion(timeoutMs = 2000): Promise<string | null> {
  try {
    const r = await fetch(LATEST_URL, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const v = ((await r.json()) as { version?: unknown }).version;
    return typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Whether version `a` is newer than `b` (plain x.y.z). */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}
