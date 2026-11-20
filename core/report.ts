/**
 * Builds a test report as a pre-filled GitHub issue. No server: the browser just opens a link.
 * Reports are public, so include nothing personal (we never read the VIN).
 */
import { hex } from "./kwp2000/frame";
import type { Fault, Values, VehicleProfile } from "./profile";
import type { TrafficEvent } from "./session";

export const REPO_URL = "https://github.com/tuffjocke/openhood";
/** Stay well under the URL length browsers and GitHub accept. */
const MAX_URL = 7500;

export interface ReportInput {
  vehicle: string;
  profile: VehicleProfile;
  source: "serial" | "bluetooth" | "simulator" | null;
  /** What was found on the other end, and the protocol it used, once connected. */
  adapter?: string;
  status: string;
  error: string | null;
  readsPerSecond: number;
  values: Values;
  faults: Fault[] | null;
  traffic: TrafficEvent[];
  userAgent: string;
}

function trafficLines(traffic: TrafficEvent[]) {
  return traffic.map(
    (e) => `${(e.t / 1000).toFixed(3).padStart(9)} ${e.dir === "tx" ? "->" : "<-"} ${e.text ?? hex(e.bytes)}${e.note ? `  ${e.note}` : ""}`,
  );
}

export function buildReport(r: ReportInput, trafficLimit = 40): { title: string; body: string } {
  const p = r.profile;
  const outcome = r.error ? "failed" : r.status === "live" ? "connected" : r.status;
  const title = `Test report: ${r.vehicle || p.name} (${p.id}) ${outcome}`;
  const values = p.channels
    .filter((c) => r.values[c.key] !== undefined)
    .map((c) => `| ${c.label} | ${r.values[c.key].toFixed(c.decimals)} ${c.unit} | ${c.confidence} |`);
  const lines = trafficLines(r.traffic.slice(-trafficLimit));

  const body = [
    "<!-- Fill in the two questions at the bottom, then press Submit. This report is public. -->",
    "",
    `**Vehicle:** ${r.vehicle || "(not listed)"}`,
    `**Profile:** \`${p.id}\` (${p.status})`,
    `**Connected with:** ${r.adapter ?? (r.source === "serial" ? "USB or paired Bluetooth" : r.source === "bluetooth" ? "Bluetooth adapter" : r.source === "simulator" ? "simulator" : "nothing yet")}`,
    `**Result:** ${outcome}${r.error ? `: ${r.error}` : ""}${r.status === "live" ? `, ${r.readsPerSecond.toFixed(0)} reads/s` : ""}`,
    `**Cable:** (brand / chip, e.g. FT232RL)`,
    `**Browser:** ${r.userAgent}`,
    "",
    values.length ? "**Values at the time of the report**\n\n| Channel | Value | Confidence |\n| --- | --- | --- |\n" + values.join("\n") : "",
    "",
    r.faults ? `**Faults read:** ${r.faults.length ? r.faults.map((f) => f.code ?? f.name).join(", ") : "none"}` : "",
    "",
    `**Traffic** (last ${lines.length} lines)`,
    "",
    "```",
    ...lines,
    "```",
    "",
    "**Do the values match the dashboard gauges?**",
    "",
    "",
    "**Anything else that worked or didn't?**",
    "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return { title, body };
}

/** A link that opens a new GitHub issue with the report filled in, trimming traffic until it fits. */
export function reportUrl(r: ReportInput): string {
  for (let limit = 40; limit >= 0; limit -= 10) {
    const { title, body } = buildReport(r, limit);
    const url = `${REPO_URL}/issues/new?labels=test-report&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    if (url.length <= MAX_URL || limit === 0) return url;
  }
  return `${REPO_URL}/issues/new`;
}

/**
 * "Add my car to the shared list" from the website: a GitHub issue holding one entry for
 * profiles/car-reports.json, for a maintainer (or an agent) to add. Nothing personal in it.
 */
export function carReportUrl(entry: Record<string, unknown>): string {
  const title = `Car report: ${entry.make} ${entry.model} ${entry.year}, ${entry.result}`;
  const body = [
    "Adding this car to profiles/car-reports.json, so others with the same car know what works.",
    "",
    "```json",
    JSON.stringify(entry, null, 2),
    "```",
    "",
    "Anything to add (engine, what didn't work)?",
    "",
  ].join("\n");
  const q = new URLSearchParams({ title, body, labels: "car-report" });
  return `${REPO_URL}/issues/new?${q}`;
}
