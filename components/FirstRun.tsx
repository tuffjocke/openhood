"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Channel, Fault, Urgency, VehicleProfile } from "@/core/profile";
import { PROFILES } from "@/profiles";
import { CarChooser } from "./CarChooser";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { Gauge } from "./Gauge";
import { CodeLookup } from "./landing/CodeLookup";
import { AgentTrack } from "./landing/AgentTrack";
import { EngineLight } from "./landing/EngineLight";
import { SocketGuide } from "./landing/SocketGuide";
import type { Selection } from "./VehiclePicker";
import type { ConnectVia } from "@/core/link/open";

/** A live reading from the selected profile's simulator, shown in the hero. Stops when unmounted. */
function LivePreview({ profile, vehicle }: { profile: VehicleProfile; vehicle: string }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [fault, setFault] = useState<Fault | null>(null);
  const main = profile.channels[0];
  const side = profile.channels.slice(1, 3);

  useEffect(() => {
    let alive = true;
    const s = new Session(profile, new SimulatedTransport(profile));
    setValues({});
    setFault(null);
    const ids = [...new Set(profile.schedule)];
    (async () => {
      try {
        await s.connect();
        if (profile.faults) {
          const faults = await s.readFaults();
          // Show the most telling one: explained, and the most urgent first.
          const rank = (f: Fault) => {
            const u = profile.faults?.explanations?.[f.id]?.urgency;
            return u === "soon" ? 0 : u === "now" ? 1 : u === "ok" ? 2 : 3;
          };
          if (alive) setFault([...faults].sort((a, b) => rank(a) - rank(b))[0] ?? null);
        }
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
      {fault && <PreviewFault fault={fault} profile={profile} />}
      <figcaption>
        A demo car with made-up readings, running live in your browser. {main ? `${main.label} in ${main.unit}.` : ""}
      </figcaption>
    </figure>
  );
}

const URGENCY: Record<Urgency, string> = { ok: "Fine to drive", soon: "Fix soon", now: "Fix now" };

/** One fault from the demo car, explained the way Openhood explains a real one. */
function PreviewFault({ fault, profile }: { fault: Fault; profile: VehicleProfile }) {
  const info = profile.faults?.explanations?.[fault.id];
  return (
    <div className="preview-fault">
      <EngineLight lit />
      <div>
        <p className="preview-fault-head">
          {fault.code && <span className="preview-fault-code">{fault.code}</span>}
          {info && <span className={`urgency urgency-${info.urgency}`}>{URGENCY[info.urgency]}</span>}
        </p>
        <p className="preview-fault-title">{info?.title ?? fault.name}</p>
        {info?.check && <p className="preview-fault-check">Check first: {info.check}</p>}
      </div>
    </div>
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
  bluetoothOk,
  connecting,
  onConnect,
  onBluetooth,
  onSimulator,
}: {
  vehicle: string;
  selection: Selection;
  onSelect: (s: Selection) => void;
  profile: VehicleProfile;
  serialOk: boolean;
  bluetoothOk: boolean;
  /** Which connection is in progress, if any. */
  connecting: ConnectVia | null;
  onConnect: () => void;
  onBluetooth: () => void;
  onSimulator: () => void;
}) {
  // Two ways in. #agent links straight to the second.
  const [track, setTrack] = useState<"browser" | "agent">("browser");
  useEffect(() => {
    if (location.hash === "#agent") setTrack("agent");
  }, []);
  function chooseTrack(t: "browser" | "agent") {
    setTrack(t);
    history.replaceState(null, "", t === "agent" ? "#agent" : location.pathname + location.search);
  }

  const readButton = (p: VehicleProfile, supported: boolean) => {
    const ble = bluetoothOk && (p.adapters ?? ["kkl"]).includes("elm327");
    return serialOk || ble ? (
      <div className="chooser-actions">
        {serialOk && (
          <button className="primary big" onClick={onConnect} disabled={!!connecting}>
            {connecting === "serial" ? "Waking the car…" : supported ? "Read my car" : "Read the standard codes"}
          </button>
        )}
        {ble && (
          <button className={serialOk ? "ghost big" : "primary big"} onClick={onBluetooth} disabled={!!connecting}>
            {connecting === "bluetooth" ? "Connecting…" : "Bluetooth adapter"}
          </button>
        )}
        {serialOk && ble && <p className="actions-hint">USB adapters and paired Bluetooth adapters use the first button.</p>}
        <p className="actions-hint">
          Free software, provided as is. Use it at your own risk, with the car parked.{" "}
          <Link href="/disclaimer">Disclaimer</Link>
        </p>
      </div>
    ) : null; // the browser warning is shown once, above the car fields
  };

  return (
    <section className="first-run" aria-label="Getting started">
      <div className="hero">
        <div className="hero-text">
          <h1>Engine light on? Find out why.</h1>
          <p className="lede">
            Openhood reads the fault codes behind your engine light and tells you in plain words what&rsquo;s wrong and
            how urgent it is. A cheap adapter and this browser are all it takes. Pick your car and see.
          </p>

          <div className="start">
            <div className="tracks" role="tablist" aria-label="How to read your car">
              <button
                role="tab"
                id="tab-browser"
                aria-selected={track === "browser"}
                aria-controls="panel-browser"
                onClick={() => chooseTrack("browser")}
              >
                In this browser
              </button>
              <button
                role="tab"
                id="tab-agent"
                aria-selected={track === "agent"}
                aria-controls="panel-agent"
                onClick={() => chooseTrack("agent")}
              >
                With an AI agent
              </button>
            </div>
            {track === "browser" ? (
              <div role="tabpanel" id="panel-browser" aria-labelledby="tab-browser">
                {!serialOk && !bluetoothOk && (
                  <p className="hero-note" role="note">
                    <strong>This browser can&rsquo;t read a car.</strong> Open this page in Chrome or Edge on a computer,
                    or Chrome on Android. Here you can still try the demo and look up codes.
                  </p>
                )}
                <CarChooser profiles={PROFILES} selection={selection} onSelect={onSelect} actions={readButton} />
              </div>
            ) : (
              <div role="tabpanel" id="panel-agent" aria-labelledby="tab-agent">
                <AgentTrack car={selection.make && selection.model && selection.year ? `${selection.year} ${selection.make} ${selection.model}` : ""} />
              </div>
            )}
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
        {!connecting && <LivePreview profile={profile} vehicle={vehicle} />}
      </div>

      <SocketGuide />
      <CodeLookup />
    </section>
  );
}
