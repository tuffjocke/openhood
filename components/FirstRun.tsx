"use client";

import { useEffect, useState } from "react";
import type { Fault, Urgency, VehicleProfile } from "@/core/profile";
import { PROFILES } from "@/profiles";
import { useFirstPick } from "./AdapterPicks";
import { CarChooser } from "./CarChooser";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { dialLayout, DialRow } from "./Dials";
import { LiveChart, type Point } from "./LiveChart";
import { AgentButton } from "./landing/AgentButton";
import { EngineLight } from "./landing/EngineLight";
import type { Selection } from "./VehiclePicker";
import type { ConnectVia } from "@/core/link/open";

/** The live screen in small, driven by the selected profile's simulator: its dials and one fault. Stops when unmounted. */
function LivePreview({ profile, vehicle }: { profile: VehicleProfile; vehicle: string }) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [fault, setFault] = useState<Fault | null>(null);
  // One chart beside the dials: the profile's first chart reading, last 30 seconds.
  const chart = dialLayout(profile).charts[0];
  const [trace, setTrace] = useState<{ points: Point[]; now: number }>({ points: [], now: 0 });

  useEffect(() => {
    let alive = true;
    const s = new Session(profile, new SimulatedTransport(profile));
    setValues({});
    setFault(null);
    setTrace({ points: [], now: 0 });
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
            const t = performance.now();
            const key = dialLayout(profile).charts[0]?.key;
            setTrace((prev) => ({
              now: t,
              points: key && v[key] !== undefined ? [...prev.points.filter((p) => t - p.t < 31_000), { t, v: v[key] }] : prev.points,
            }));
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

  return (
    <figure className="preview">
      <DialRow profile={profile} values={values} />
      <div className="preview-side">
        {chart && <LiveChart channel={chart} points={trace.points} now={trace.now} value={values[chart.key]} />}
        {fault && <PreviewFault fault={fault} profile={profile} />}
      </div>
    </figure>
  );
}

const ADAPTER_KEY = "openhood.hasAdapter";

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
  const carText = selection.make && selection.model && selection.year ? `${selection.year} ${selection.make} ${selection.model}` : "";

  // One step on screen at a time. Step 1 is the car fields; these are steps 2 and 3.
  const [hasAdapter, setHasAdapter] = useState(false);
  // "your phone" or "your computer": known only in the browser, after the static page loads.
  const [device, setDevice] = useState("computer");
  useEffect(() => {
    if (/Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)) setDevice("phone");
    else if (/iPad|Tablet/i.test(navigator.userAgent)) setDevice("tablet");
  }, []);
  useEffect(() => {
    try {
      setHasAdapter(localStorage.getItem(ADAPTER_KEY) === "1");
    } catch {}
  }, []);
  function gotAdapter(yes: boolean) {
    setHasAdapter(yes);
    try {
      if (yes) localStorage.setItem(ADAPTER_KEY, "1");
      else localStorage.removeItem(ADAPTER_KEY);
    } catch {}
  }

  const buy = useFirstPick((profile.adapters ?? ["kkl"])[0]);
  const nextStep = (p: VehicleProfile, supported: boolean) => {
    const kinds = p.adapters ?? ["kkl"];
    const thing = kinds[0] === "kkl" ? "a KKL cable" : "an ELM327 adapter";
    if (!hasAdapter)
      return (
        <div className="step">
          <p className="step-ask">
            {/* Sure for a car Openhood knows; a good guess for any other car. */}
            {supported ? "You" : "We think you"} need {thing} to connect your {selection.make || "car"} to your {device}.
          </p>
          <div className="chooser-actions">
            <button className="primary big" onClick={() => gotAdapter(true)}>
              I have one
            </button>
            {buy && (
              <a className="button big ghost" href={buy.link.url} target="_blank" rel="noreferrer">
                {buy.link.product ? "Buy on Amazon" : "Find on Amazon"}
              </a>
            )}
          </div>
          {buy && (
            <p className="step-foot">
              Our pick: {buy.pick.name}, {buy.pick.connects}. {buy.pick.why}
            </p>
          )}
        </div>
      );
    const ble = bluetoothOk && kinds.includes("elm327");
    const canRead = serialOk || ble;
    return (
      <div className="step">
        <p className="step-ask">Plug it in under the dashboard, near your knee. Ignition on.</p>
        {!canRead && (
          <p className="hero-note" role="note">
            <strong>This browser can&rsquo;t read a car.</strong> Use Chrome or Edge on a computer, or Chrome on Android.
          </p>
        )}
        <div className="chooser-actions">
          {serialOk && (
            <button className="primary big" onClick={onConnect} disabled={!!connecting}>
              {connecting === "serial" ? "Waking the car…" : "Read my car"}
            </button>
          )}
          {ble && (
            <button className={serialOk ? "ghost big" : "primary big"} onClick={onBluetooth} disabled={!!connecting}>
              {connecting === "bluetooth" ? "Connecting…" : "Bluetooth adapter"}
            </button>
          )}
          <AgentButton car={carText} primary={!canRead} />
        </div>
        <p className="step-foot">
          Only reads. Nothing in your car changes.{" "}
          <button className="link-button" onClick={() => gotAdapter(false)}>
            No adapter yet?
          </button>
        </p>
      </div>
    );
  };

  return (
    <section className="first-run" aria-label="Getting started">
      <div className="hero">
        <div className="hero-text">
          <h1>Engine light on? Find out why.</h1>
          <p className="lede">
            A free, open source fault code reader in your browser. Plug in a cheap adapter and see what&rsquo;s wrong, in plain words.
          </p>
        </div>
        <div className="start">
          <CarChooser profiles={PROFILES} selection={selection} onSelect={onSelect} actions={nextStep} />
        </div>
      </div>

      {/* Always on a computer; on a phone it steps aside once a car is picked, to keep the next step close. */}
      <section className={`band band-wide${carText ? " after-pick" : ""}`} aria-labelledby="demo-title">
        <div className="band-head">
          <h2 id="demo-title">What you get</h2>
          <button className="quiet" onClick={onSimulator} disabled={!!connecting}>
            {connecting === "simulator" ? "Starting the demo…" : "Try a demo car"}
          </button>
        </div>
        {!connecting && <LivePreview profile={profile} vehicle={vehicle} />}
      </section>

    </section>
  );
}
