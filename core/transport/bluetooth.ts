import { ByteQueue, type ByteStream } from "./types";

/**
 * A Bluetooth Low Energy OBD adapter through Web Bluetooth (Chrome on desktop and Android).
 * These adapters run ELM327 firmware behind a "serial over BLE" service: one characteristic we
 * write commands to, one that notifies us with the answers. Makers use different service ids,
 * so we ask for the common ones and pick the characteristics by what they can do.
 *
 * The ids below are the ones used by widely sold adapters and BLE serial modules, as listed by
 * open-source OBD apps. Not yet tried on real hardware by this project.
 */
const SERVICES: BluetoothServiceUUID[] = [
  0xfff0, // many ELM327 BLE clones
  0xffe0, // HM-10 style serial modules
  0x18f0, // some OBD adapters
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Vgate iCar Pro BLE and similar
];

export class BluetoothTransport implements ByteStream {
  private device: BluetoothDevice | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private rx = new ByteQueue();

  static supported() {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  async open() {
    if (this.tx) return;
    // Must be called from a user gesture (a click). Shows every nearby BLE device; the person picks theirs.
    this.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    const gatt = await this.device.gatt?.connect();
    if (!gatt) throw new Error("Couldn't connect to the Bluetooth adapter.");
    let notify: BluetoothRemoteGATTCharacteristic | null = null;
    for (const id of SERVICES) {
      let service: BluetoothRemoteGATTService;
      try {
        service = await gatt.getPrimaryService(id);
      } catch {
        continue;
      }
      for (const c of await service.getCharacteristics()) {
        if (!notify && (c.properties.notify || c.properties.indicate)) notify = c;
        if (!this.tx && (c.properties.write || c.properties.writeWithoutResponse)) this.tx = c;
      }
      if (notify && this.tx) break;
      notify = null;
      this.tx = null;
    }
    if (!notify || !this.tx) {
      gatt.disconnect();
      throw new Error("This Bluetooth device doesn't look like an OBD adapter.");
    }
    notify.addEventListener("characteristicvaluechanged", (e) => {
      const v = (e.target as BluetoothRemoteGATTCharacteristic).value;
      if (v) this.rx.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    });
    await notify.startNotifications();
  }

  async close() {
    this.device?.gatt?.disconnect();
    this.tx = null;
  }

  async write(bytes: Uint8Array) {
    if (!this.tx) throw new Error("Bluetooth adapter not connected");
    // BLE packets are small: send in 20-byte pieces, which every adapter accepts.
    for (let i = 0; i < bytes.length; i += 20) {
      const part = bytes.slice(i, i + 20);
      if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(part);
      else await this.tx.writeValueWithResponse(part);
    }
  }

  readUntil(byte: number, timeoutMs: number) {
    return this.rx.takeUntil(byte, timeoutMs);
  }

  readUntilIdle(idleMs: number, timeoutMs: number) {
    return this.rx.takeUntilIdle(idleMs, timeoutMs);
  }

  flush() {
    this.rx.clear();
  }
}
