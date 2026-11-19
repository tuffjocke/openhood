/**
 * Freeze frame: mode 02. When a code is set, the ECU stores one snapshot of mode 01 values.
 * Request [0x02, pid, frame], response [0x42, pid, frame, A, B, ...]: data starts at index 3.
 * PID 0x02 in mode 02 returns the code that caused the snapshot (00 00 = no snapshot).
 * Most cars store only frame 0, for the first code that turned on the engine light.
 * Source: https://en.wikipedia.org/wiki/OBD-II_PIDs (Service 02). Confidence: community.
 */
import { NegativeResponse } from "@/core/kwp2000/frame";
import type { EcuLink, Fault, Values } from "@/core/profile";
import { TimeoutError } from "@/core/transport/types";
import { decodeDtc } from "./dtc";
import { groups, pidSupported } from "./pids";

/** Values worth showing from a snapshot, in display order. */
const SNAPSHOT_KEYS = ["rpm", "speed", "coolant", "load", "throttle", "map", "maf", "stft", "ltft", "airTemp"];

/** Turn a mode 02 response into the same shape as mode 01, so the mode 01 decoders can be reused. */
export function asMode01(res: Uint8Array): Uint8Array {
  return Uint8Array.from([0x41, res[1], ...res.subarray(3)]);
}

export async function readFreezeFrame(ecu: EcuLink, fault: Fault, state: Readonly<Values>): Promise<Values | null> {
  if (!fault.code) return null;
  let cause: Uint8Array;
  try {
    cause = await ecu.request([0x02, 0x02, 0x00], { note: "freeze frame: which code" });
  } catch (e) {
    if (e instanceof NegativeResponse || e instanceof TimeoutError) return null;
    throw e;
  }
  const code = cause[3] || cause[4] ? decodeDtc(cause[3], cause[4]) : null;
  if (code !== fault.code) return null;

  const out: Values = {};
  for (const key of SNAPSHOT_KEYS) {
    const g = groups.find((g) => g.id === key);
    if (!g || !pidSupported(state, g.request[1])) continue;
    try {
      const res = await ecu.request([0x02, g.request[1], 0x00], { note: `freeze frame: ${key}` });
      Object.assign(out, g.decode(asMode01(res), state));
    } catch (e) {
      if (!(e instanceof NegativeResponse || e instanceof TimeoutError)) throw e;
    }
  }
  return Object.keys(out).length ? out : null;
}
