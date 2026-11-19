"use client";

import { useEffect, useState } from "react";
import type { Channel, VehicleProfile } from "@/core/profile";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { Gauge } from "./Gauge";

const CABLE_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/hardware.md";

/** A live reading from the selected profile's simulator, shown in the hero. Stops when unmounted. */
function LivePreview({ profile, vehicle }: { profile: VehicleProfile; vehicle: string }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const main = profile.channels[0];
  const side = profile.channels.slice(1, 3);

  useEffect(() => {
    let alive = true;
    const s = new Session(profile, new SimulatedTransport(profile));
    setValues({});
    const ids = [...new Set(profile.schedule)];
    (async () => {
      try {
        await s.connect();
        while (alive) {
          for (const id of ids) {
            if (!alive) break;
            if (!s.isActive(id)) continue;
            const v = await s.readGroup(id);
            if (!alive) break;
            setValues((prev) => ({ ...prev, ...v }));
          }
        }
      } catch {
        // Preview only: if the simulator stops, the hero just stays still.
      }
    })();
    return () => {
      alive = false;
      void s.disconnect();
    };
  }, [profile]);

  const show = (c: Channel) => (values[c.key] === undefined ? "" : values[c.key].toFixed(c.decimals));

  return (
    <figure className="preview cluster">
      {main && (
        <div className="preview-main">
          <span className="preview-value">{show(main)}</span>
          <span className="preview-unit">{main.unit}</span>
        </div>
      )}
      {main && (
        <Gauge
          value={values[main.key]}
          min={main.min}
          max={main.max}
          warnAbove={main.warnAbove}
          warnBelow={main.warnBelow}
          segments={32}
        />
      )}
      <dl className="preview-side">
        {side.map((c) => (
          <div key={c.key}>
            <dt>{c.label}</dt>
            <dd>
              {show(c)} <span>{c.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <figcaption>
        A simulated {vehicle || "car"}, live. {main ? `${main.label} in ${main.unit}.` : ""}
      </figcaption>
    </figure>
  );
}

/** The first thing people see: what Openhood does, a live example, and how to start. */
export function FirstRun({
  vehicle,
  chosen,
  profile,
  serialOk,
  connecting,
  onChangeCar,
  onConnect,
  onSimulator,
}: {
  vehicle: string;
  /** Has the person picked a car yet? */
  chosen: boolean;
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
      <div className="hero">
        <div className="hero-text">
          <h1>Talk to your engine.</h1>
          <p className="lede">
            Openhood plugs into the engine computer of cars from about 1996 to 2008. Live boost, temperatures, air flow
            and revs. Fault codes in plain words, cleared when you&rsquo;re done. A cheap USB cable and this browser: no
            dealer tool, nothing to install, free and open source.
          </p>
          <div className="hero-actions">
            {serialOk ? (
              <button className="primary big" onClick={onConnect} disabled={!!connecting}>
                {connecting === "serial" ? "Waking the car…" : "Connect cable"}
              </button>
            ) : (
              <p className="hero-note">
                This browser can&rsquo;t talk to a cable. Use Chrome or Edge on a computer, or Chrome on Android.
              </p>
            )}
            <button className="ghost big" onClick={onSimulator} disabled={!!connecting}>
              {connecting === "simulator" ? "Starting the simulator…" : "Try the simulator"}
            </button>
          </div>
        </div>
        {!connecting && <LivePreview profile={profile} vehicle={vehicle} />}
      </div>

      <ol className="steps" aria-label="How to connect">
        <li>
          <span className="step-no">1</span>
          <div>
            <h3>Choose your car</h3>
            <p>
              {!chosen
                ? "Make, model and year. Not listed? The generic option reads the standard values most cars from the 2000s report."
                : vehicle
                  ? `${vehicle}.`
                  : `${profile.name}, for cars that aren't listed yet.`}
            </p>
            <button className="text-button" onClick={onChangeCar}>
              {chosen ? "Change car" : "Choose your car"}
            </button>
          </div>
        </li>
        <li>
          <span className="step-no">2</span>
          <div>
            <h3>Plug in the cable</h3>
            <p>{profile.hardware ?? "A KKL cable in the OBD socket under the dashboard."}</p>
            <a className="text-button" href={CABLE_URL}>
              Which cable to buy
            </a>
          </div>
        </li>
        <li>
          <span className="step-no">3</span>
          <div>
            <h3>Ignition on, then connect</h3>
            <p>The engine can be off or running. Openhood only reads, so nothing in the car is changed.</p>
          </div>
        </li>
      </ol>
    </section>
  );
}
