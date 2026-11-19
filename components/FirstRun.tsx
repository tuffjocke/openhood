"use client";

import type { VehicleProfile } from "@/core/profile";

const CABLE_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md";

/** Shown instead of the empty gauges until the first connection: three steps and one clear action. */
export function FirstRun({
  vehicle,
  profile,
  serialOk,
  connecting,
  onChangeCar,
  onConnect,
  onSimulator,
}: {
  vehicle: string;
  profile: VehicleProfile;
  serialOk: boolean;
  /** Which connection is in progress, if any. */
  connecting: "serial" | "simulator" | null;
  onChangeCar: () => void;
  onConnect: () => void;
  onSimulator: () => void;
}) {
  return (
    <section className="first-run" aria-label="Getting started">
      <ol className="steps">
        <li>
          <span className="step-no">01</span>
          <h3>Choose your car</h3>
          <p>
            {vehicle ? (
              <strong>{vehicle}</strong>
            ) : (
              <>
                <strong>{profile.name}</strong>, for cars that aren&rsquo;t listed yet
              </>
            )}
          </p>
          <button className="link-button" onClick={onChangeCar}>
            Change car
          </button>
        </li>
        <li>
          <span className="step-no">02</span>
          <h3>Plug in the cable</h3>
          <p>{profile.hardware ?? "Standard KKL cable in the OBD socket under the dashboard."}</p>
          <a className="link-button" href={CABLE_URL}>
            Which cable?
          </a>
        </li>
        <li>
          <span className="step-no">03</span>
          <h3>Ignition on, then connect</h3>
          <p>The engine can be off or running. Openhood only reads: nothing in the car is changed.</p>
        </li>
      </ol>

      <div className="first-run-actions">
        {serialOk ? (
          <button className="big" onClick={onConnect} disabled={!!connecting}>
            {connecting === "serial" ? "Waking the car…" : "Connect cable"}
          </button>
        ) : (
          <p className="muted">
            This browser can&rsquo;t talk to a cable. Use Chrome or Edge on a computer, or Chrome on Android.
          </p>
        )}
        <button className="quiet big" onClick={onSimulator} disabled={!!connecting}>
          {connecting === "simulator" ? "Starting the simulator…" : "No car nearby? Try the simulator"}
        </button>
      </div>
    </section>
  );
}
