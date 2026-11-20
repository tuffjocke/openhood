import type { AdapterKind, VehicleProfile } from "../profile";
import { BluetoothTransport } from "../transport/bluetooth";
import { SimulatedTransport } from "../transport/simulated";
import { sleep } from "../transport/types";
import { WebSerialTransport } from "../transport/webserial";
import { ElmLink } from "./elm327";
import { KlineLink } from "./kline";
import type { Link, Traffic } from "./types";

/** How the person connects: a serial device (USB or paired Bluetooth), a BLE adapter, or the demo. */
export type ConnectVia = "serial" | "bluetooth" | "simulator";

/** Raised when the adapter found can't run the chosen car's profile. Its message is for people. */
export class WrongAdapterError extends Error {}

const ELM_BAUDS = [38400, 115200, 9600];
const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Work out what's on the other end of a serial port without asking the person:
 *  - an ELM327 answers "ATI" with its name, at one of a few baud rates;
 *  - a KKL cable on a car with the ignition on sends every byte straight back (the K-line echo);
 *  - silence is most likely a KKL cable whose car is off, or a cable not plugged in.
 */
export async function detectAdapter(
  port: SerialPort,
  onTraffic: Traffic,
): Promise<{ kind: AdapterKind; baudRate: number } | null> {
  const probe = enc.encode("ATI\r");
  for (const baudRate of ELM_BAUDS) {
    const t = new WebSerialTransport({ baudRate, echo: false, port });
    await t.open();
    try {
      await sleep(100);
      t.flush();
      onTraffic({ t: performance.now(), dir: "tx", bytes: new Uint8Array(0), text: "ATI", note: `is it an ELM327? (${baudRate} baud)` });
      await t.write(probe);
      let got: Uint8Array = new Uint8Array(0);
      try {
        got = await t.readUntilIdle(80, 700);
      } catch {}
      const text = dec.decode(got);
      if (/ELM|STN|OBDLINK/i.test(text)) return { kind: "elm327", baudRate };
      if (got.length === probe.length && got.every((b, i) => b === probe[i])) return { kind: "kkl", baudRate };
    } finally {
      await t.close();
    }
  }
  return null;
}

/**
 * Open the link for a profile: ask for the device, find out what it is, and check the
 * profile can run on it. Must start from a click (the browser's device picker needs one).
 */
export async function openLink(profile: VehicleProfile, via: ConnectVia, onTraffic: Traffic): Promise<Link> {
  const allowed = profile.adapters ?? ["kkl"];
  if (via === "simulator") return new KlineLink(profile, new SimulatedTransport(profile), onTraffic);

  if (via === "bluetooth") {
    if (!allowed.includes("elm327")) throw new WrongAdapterError(needsKkl(profile));
    return new ElmLink(new BluetoothTransport(), onTraffic);
  }

  const port = await WebSerialTransport.choosePort();
  const found = await detectAdapter(port, onTraffic);
  if (found?.kind === "elm327") {
    if (!allowed.includes("elm327")) throw new WrongAdapterError(needsKkl(profile));
    return new ElmLink(new WebSerialTransport({ baudRate: found.baudRate, echo: false, port }), onTraffic);
  }
  // A KKL cable, or nothing answered yet: try the K-line, which is all a silent cable can be.
  if (!allowed.includes("kkl"))
    throw new WrongAdapterError(
      "This looks like a plain KKL cable, or the adapter didn't answer. This car needs an ELM327-type adapter.",
    );
  return new KlineLink(profile, new WebSerialTransport({ baudRate: profile.link.baudRate, port }), onTraffic);
}

const needsKkl = (p: VehicleProfile) =>
  `${p.name} needs a KKL cable. ELM327 adapters can't do its manufacturer-specific connection.`;
