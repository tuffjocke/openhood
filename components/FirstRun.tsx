"use client";

import { useEffect, useState } from "react";
import type { Channel, VehicleProfile } from "@/core/profile";
import { PROFILES } from "@/profiles";
import { CarChooser } from "./CarChooser";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { Gauge } from "./Gauge";
import { CodeLookup } from "./landing/CodeLookup";
import { Decoder } from "./landing/Decoder";
import { SocketGuide } from "./landing/SocketGuide";
import type { Selection } from "./VehiclePicker";

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

/**
 * The first thing people see. One job at a time: say what Openhood does, ask which car,
 * then show exactly what to do next for that car.
 */
export function FirstRun({
  vehicle,
  selection,
  onSelect,
  profile,
  serialOk,
  connecting,
  onConnect,
  onSimulator,
}: {
  vehicle: string;
  selection: Selection;
  onSelect: (s: Selection) => void;
  profile: VehicleProfile;
  serialOk: boolean;
  /** Which connection is in progress, if any. */
  connecting: "serial" | "simulator" | null;
  onConnect: () => void;
  onSimulator: () => void;
}) {
  const readButton = (supported: boolean) =>
    serialOk ? (
      <div className="chooser-actions">
        <button className="primary big" onClick={onConnect} disabled={!!connecting}>
          {connecting === "serial" ? "Waking the car…" : supported ? "Read my car" : "Read the standard codes"}
        </button>
      </div>
    ) : (
      <p className="hero-note" role="note">
        <strong>This browser can&rsquo;t read a car.</strong> Open this page in Chrome or Edge on a computer, or Chrome
        on Android. You can still try the demo and look up codes here.
      </p>
    );

  return (
    <section className="first-run" aria-label="Getting started">
      <div className="hero">
        <div className="hero-text">
          <h1>Engine light on? Find out why.</h1>
          <p className="lede">
            Openhood reads the fault codes behind your engine light and tells you in plain words what&rsquo;s wrong and
            how urgent it is. A cheap USB cable and this browser is all it takes. Pick your car and see.
          </p>

          <div className="start" aria-labelledby="start-title">
            <h2 id="start-title">Your car</h2>
            <CarChooser profiles={PROFILES} selection={selection} onSelect={onSelect} actions={readButton} />
          </div>

          <p className="demo-line">
            Just curious?{" "}
            <button className="link-button" onClick={onSimulator} disabled={!!connecting}>
              {connecting === "simulator" ? "Starting the demo…" : "Try a demo car"}
            </button>{" "}
            first, no cable needed.
          </p>
          <p className="trust">
            Openhood only reads, so nothing in your car changes. The one exception is clearing fault codes, and only
            when you choose to. Nothing is sent anywhere unless you share it.
          </p>
        </div>
        <Decoder />
      </div>

      <SocketGuide />
      <CodeLookup />

      <section className="band" aria-labelledby="live-title">
        <div className="band-text">
          <h2 id="live-title">Live data too</h2>
          <p>
            Once connected, the dash comes alive: revs, temperatures, boost and air flow as you drive, and you can log a
            drive to a file. This is a demo car running right now.
          </p>
        </div>
        {!connecting && <LivePreview profile={profile} vehicle={vehicle} />}
      </section>
    </section>
  );
}
