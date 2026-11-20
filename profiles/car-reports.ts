/**
 * What people found when they read their car with Openhood: the project's growing knowledge of
 * which cars work, with which adapter and connection. Added by `npm run openhood -- record`
 * (usually run by an AI agent for the person) and sent in as a pull request.
 *
 * Deliberately nothing personal: no VIN, no fault codes, no location. tests/car-reports.test.ts
 * checks every entry: names from profiles/names.ts, a known profile, a real-looking year.
 */
import type { AdapterKind } from "@/core/profile";
import data from "./car-reports.json";

export interface CarReport {
  make: string;
  model: string;
  year: number;
  engine?: string;
  /** Profile used, e.g. "generic-obd2". */
  profile: string;
  adapter: AdapterKind;
  /** The connection as reported, e.g. "ISO 15765-4 (CAN 11/500)" or "KWP2000 fast init". */
  protocol: string;
  /** "worked": connected and read faults. "partly": connected, something failed. "failed": no connection. */
  result: "worked" | "partly" | "failed";
  /** How many of the profile's values the car answered. */
  values?: number;
  /** YYYY-MM-DD */
  date: string;
  notes?: string;
}

export const CAR_REPORTS = data as CarReport[];

/** Reports for a car: same make and model, within two model years. Closest years first. */
export function reportsFor(make: string, model: string, year: number, all: CarReport[] = CAR_REPORTS): CarReport[] {
  const m = model.trim().toLowerCase();
  return all
    .filter((r) => r.make === make && r.model.toLowerCase() === m && Math.abs(r.year - year) <= 2)
    .sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year));
}

/** One plain line for the website, e.g. "Read by 3 people (2002 to 2004), with an ELM327 adapter." */
export function summarise(reports: CarReport[]): string | null {
  if (!reports.length) return null;
  const worked = reports.filter((r) => r.result === "worked");
  const years = reports.map((r) => r.year);
  const span = Math.min(...years) === Math.max(...years) ? `${years[0]}` : `${Math.min(...years)} to ${Math.max(...years)}`;
  const adapters = [...new Set(worked.map((r) => (r.adapter === "elm327" ? "an ELM327 adapter" : "a KKL cable")))];
  const who = (n: number) => (n === 1 ? "1 person" : `${n} people`);
  if (!worked.length) return `${who(reports.length)} tried this car (${span}) and couldn't connect yet.`;
  return `Read by ${who(worked.length)} (${span})${adapters.length ? `, with ${adapters.join(" or ")}` : ""}.${
    worked.length < reports.length ? ` ${reports.length - worked.length} more had trouble.` : ""
  }`;
}
