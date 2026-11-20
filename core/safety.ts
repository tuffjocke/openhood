/**
 * Which raw requests a tool (the CLI, the MCP server for AI agents) may send to an ECU on its own.
 * Openhood is read-only apart from clearing faults (AGENTS.md), so raw requests are limited to
 * services that only read. Profile code isn't limited by this: a reviewed profile may unlock an
 * ECU or clear faults as part of its own connect and clear steps.
 *
 * Service ids are from SAE J1979 / ISO 15031-5 (OBD-II modes) and ISO 14230-3 (KWP2000).
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

export type Verdict = { ok: true } | { ok: false; reason: string };

export function checkReadOnly(payload: number[]): Verdict {
  const sid = payload[0];
  if (sid === undefined) return { ok: false, reason: "Empty request." };
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
