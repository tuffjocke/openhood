"use client";

import { useEffect, useState } from "react";
import type { Channel, VehicleProfile } from "@/core/profile";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { Gauge } from "./Gauge";
import { CodeLookup } from "./landing/CodeLookup";
import { Decoder } from "./landing/Decoder";
import { SocketGuide } from "./landing/SocketGuide";

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

/** The first thing people see: the problem it solves, how to start, and a deeper layer for the curious. */
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
          <h1>Engine light on? Find out why.</h1>
          <p className="lede">
            Plug a cheap USB cable into your car and Openhood reads the fault codes, then tells you in plain words what
            they mean and how urgent they are. Right here in the browser. Free, nothing to install.
          </p>
          <div className="hero-actions">
            {serialOk ? (
              <button className="primary big" onClick={onConnect} disabled={!!connecting}>
                {connecting === "serial" ? "Waking the car…" : "Read my car"}
              </button>
            ) : (
              <p className="hero-note" role="note">
                <strong>This browser can&rsquo;t read a car.</strong> Open this page in Chrome or Edge on a computer, or
                Chrome on Android. You can still try the demo and look up codes here.
              </p>
            )}
            <button className="ghost big" onClick={onSimulator} disabled={!!connecting}>
              {connecting === "simulator" ? "Starting the demo…" : "Try a demo car"}
            </button>
          </div>
          <p className="trust">Openhood only reads. Nothing in your car is changed, and nothing leaves this browser.</p>
        </div>
        <Decoder />
      </div>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">Three steps, about five minutes</h2>
        <ol className="steps">
          <li>
            <span className="step-no">1</span>
            <div>
              <h3>Choose your car</h3>
              <p>
                {!chosen
                  ? "Make, model and year. Not on the list? Pick \u201cMy car isn\u2019t listed\u201d and Openhood reads the standard codes most cars share."
                  : vehicle
                    ? `${vehicle}.`
                    : "Your car isn\u2019t listed yet, so Openhood reads the standard codes most cars share."}
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
              <p>{profile.hardware ?? "Into the socket under the dashboard, then into your computer or phone."}</p>
            </div>
          </li>
          <li>
            <span className="step-no">3</span>
            <div>
              <h3>Turn the key and press read</h3>
              <p>Ignition on is enough; the engine can be off. You&rsquo;ll see each fault in plain words.</p>
            </div>
          </li>
        </ol>
      </section>

      <SocketGuide />
      <CodeLookup />

      <section className="curious" aria-labelledby="curious-title">
        <div className="curious-text">
          <h2 id="curious-title">Live data, for the curious</h2>
          <p>
            Once connected, the dash comes alive: revs, temperatures, boost and air flow as you drive, with logging to a
            file. This is a demo car running right now.
          </p>
        </div>
        {!connecting && <LivePreview profile={profile} vehicle={vehicle} />}
      </section>
    </section>
  );
}
