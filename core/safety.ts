/**
 * Which raw requests a tool (the CLI, the MCP server for AI agents) may send to an ECU on its own.
 * Openhood is read-only apart from clearing faults (AGENTS.md), so raw requests are limited to
 * services that only read. Profile code isn't limited by this: a reviewed profile may unlock an
 * ECU or clear faults as part of its own connect and clear steps.
 *
 * Service ids are from SAE J1979 / ISO 15031-5 (OBD-II modes) and ISO 14230-3 (KWP2000).
 * KWP1281 (VW Group) uses different numbers for different things, so it has its own list: there,
 * 0x05 clears faults and 0x10, 0x22 and 0x2A change coding and adaptation.
 */

/** OBD-II modes that read: live data, freeze frame, stored/pending/permanent codes, test results, vehicle info. */
const OBD_READ = new Set([0x01, 0x02, 0x03, 0x05, 0x06, 0x07, 0x09, 0x0a]);

/** KWP2000 services that read, plus link housekeeping. */
const KWP_READ = new Set([
  0x81, // startCommunication
  0x82, // stopCommunication
  0x3e, // testerPresent
  0x17, // readStatusOfDiagnosticTroubleCodes
  0x18, // readDiagnosticTroubleCodesByStatus
  0x1a, // readEcuIdentification
  0x21, // readDataByLocalIdentifier
  0x22, // readDataByCommonIdentifier
]);
// Not here on purpose: 0x23 readMemoryByAddress. Raw ECU memory can hold immobiliser and key data,
// which is out of scope for Openhood (AGENTS.md).

/** Diagnostic sessions that don't open programming: default (0x81) and extended diagnostics (0x89, 0x92). */
const SAFE_SESSIONS = new Set([0x81, 0x89, 0x92]);

/** KWP1281 block titles that only read: identification, faults, measuring blocks, and the ack. */
const KWP1281_READ = new Set([
  0x00, // extra identification
  0x07, // read faults
  0x09, // ack (next block, keep-alive)
  0x12, // read group 0
  0x29, // read group
]);

/**
 * Volvo D2 services that read (requests are module, service, data): keep-alive A1, values by id
 * A6, freeze frames AC and AD, trouble codes AE, identification blocks B9. Service names from the
 * list in profiles/volvo-d2/README.md.
 */
const D2_READ = new Set([0xa1, 0xa6, 0xac, 0xad, 0xae, 0xb9]);

/**
 * GMLAN (Saab, Opel) services that read: readDiagnosticInformation A9 (trouble codes), returnToNormal
 * 20, readDataByIdentifier 1A, readDataByParameterIdentifier 22, testerPresent 3E, plus the standard
 * OBD-II read modes.
 */
const GMLAN_READ = new Set([0xa9, 0x20, 0x1a, 0x22, 0x3e]);

/**
 * BMW DS2 controls that read (requests are module address, control, data): identification 00,
 * fault memory 04, shadow fault memory 14. Not 06: raw module memory.
 */
const DS2_READ = new Set([0x00, 0x04, 0x14]);

export type Verdict = { ok: true } | { ok: false; reason: string };

export function checkReadOnly(payload: number[], protocol: "kwp2000" | "kwp1281" | "volvo-d2" | "gmlan" | "ds2" = "kwp2000"): Verdict {
  const sid = payload[0];
  if (sid === undefined) return { ok: false, reason: "Empty request." };
  if (protocol === "ds2") {
    const control = payload[1];
    if (control !== undefined && DS2_READ.has(control)) return { ok: true };
    if (control === 0x06) return { ok: false, reason: "Reading raw module memory is not allowed: it can hold immobiliser and key data." };
    return { ok: false, reason: "A DS2 request is a module address, then a read (00, 04, 14). Openhood only sends read requests." };
  }
  if (protocol === "gmlan") {
    if (GMLAN_READ.has(sid) || OBD_READ.has(sid)) return { ok: true };
    return { ok: false, reason: `Request ${sid.toString(16).toUpperCase().padStart(2, "0")} isn't a read. Openhood only sends read requests.` };
  }
  if (protocol === "volvo-d2") {
    const service = payload[1];
    if (service !== undefined && D2_READ.has(service)) return { ok: true };
    if (service === 0xaf) return { ok: false, reason: "Clearing faults isn't supported for this car yet." };
    if (service === 0xa7 || service === 0xbb)
      return { ok: false, reason: "Reading raw module memory is not allowed: it can hold immobiliser and key data." };
    return { ok: false, reason: "A Volvo D2 request is a module address, then a read service (A6, AE, B9). Openhood only sends read requests." };
  }
  if (protocol === "kwp1281") {
    if (KWP1281_READ.has(sid)) return { ok: true };
    if (sid === 0x05) return { ok: false, reason: "Clearing faults has its own tool, with a confirmation." };
    return {
      ok: false,
      reason: `Block title 0x${sid.toString(16).padStart(2, "0")} isn't a read. Openhood only sends read requests.`,
    };
  }
  if (OBD_READ.has(sid) || KWP_READ.has(sid)) return { ok: true };
  if (sid === 0x10) {
    return SAFE_SESSIONS.has(payload[1])
      ? { ok: true }
      : { ok: false, reason: "Only the default and extended diagnostic sessions are allowed, not programming." };
  }
  if (sid === 0x04 || sid === 0x14) return { ok: false, reason: "Clearing faults has its own tool, with a confirmation." };
  if (sid === 0x23) return { ok: false, reason: "Reading raw ECU memory is not allowed: it can hold immobiliser and key data." };
  if (sid === 0x27) return { ok: false, reason: "Security access is done by the profile's connect step, not by raw requests." };
  return {
    ok: false,
    reason: `Service 0x${sid.toString(16).padStart(2, "0")} can change things in the ECU. Openhood only sends read requests.`,
  };
}
