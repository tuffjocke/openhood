"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ChannelGroup, Fault, Urgency, VehicleProfile } from "@/core/profile";
import { PROFILES } from "@/profiles";
import { useFirstPick } from "./AdapterPicks";
import { CarChooser } from "./CarChooser";
import { Session } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { dialLayout, DialRow, GROUP_NAMES } from "./Dials";
import { LiveChart, type Point } from "./LiveChart";
import { AgentButton, noteDemo } from "./landing/AgentButton";
import { CableArt, PlugInArt } from "./landing/Art";
import { EngineLight } from "./landing/EngineLight";
import type { ReadProblem } from "@/core/add-car";
import { GUIDE_URL } from "./CarChooser";
import { profileIn, valuesIn } from "@/core/units";
import { needsTest, reportsFor } from "@/profiles/car-reports";
import { useUnits } from "./useUnits";
import { labelsIn, useT } from "./useLang";
import { VEHICLE_NAMES } from "@/profiles/names";
import type { Selection } from "./VehiclePicker";
import type { ConnectVia } from "@/core/link/open";

/** The demo car, running in the page: live values, the last 30 s of each reading, and its most telling fault. */
function useDemoCar(profile: VehicleProfile, running: boolean) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<{ points: Record<string, Point[]>; now: number }>({ points: {}, now: 0 });
  const [fault, setFault] = useState<Fault | null>(null);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const s = new Session(profile, new SimulatedTransport(profile));
    setValues({});
    setHistory({ points: {}, now: 0 });
    setFault(null);
    const ids = [...new Set(profile.schedule)];
    (async () => {
      try {
        await s.connect();
        noteDemo(null);
        if (profile.faults) {
          const faults = await s.readFaults();
          // The most telling one: explained, and "fix soon" before the rest.
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
            const t = performance.now();
            setValues((prev) => ({ ...prev, ...v }));
            setHistory((prev) => {
              const points = { ...prev.points };
              for (const [k, val] of Object.entries(v)) points[k] = [...(points[k] ?? []).filter((p) => t - p.t < 31_000), { t, v: val }];
              return { points, now: t };
            });
          }
        }
      } catch (e) {
        // Only a demo: if the simulator stops, the page just stays still. Noted for the AI, though.
        if (alive) noteDemo(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      void s.disconnect();
    };
  }, [profile, running]);

  return { values, history, fault };
}

const ADAPTER_KEY = "openhood.hasAdapter";
const LINK_KEY = "openhood.adapterLink";
type AdapterLink = "usb" | "bluetooth";

const URGENCY: Record<Urgency, string> = { ok: "Fine to drive", soon: "Fix soon", now: "Fix now" };
const GROUP_COLOUR_WORDS: Record<ChannelGroup, string> = { air: "blue", engine: "yellow", fuel: "green" };
/** Makes to show under "Any car", kept to ones in the official names list. */
const EXAMPLE_MAKES = ["Volvo", "Volkswagen", "Ford", "Toyota", "BMW", "Land Rover", "Saab", "Renault"].filter((m) => m in VEHICLE_NAMES);

/** A name with a thin line above it, pointing up at the part it names. */
function Callout({ name, role }: { name: string; role?: string }) {
  return (
    <p className="callout">
      <strong>{name}</strong>
      {role && <span>{role}</span>}
    </p>
  );
}

/** One fault from the demo car, opened, the way Openhood explains a real one. */
function DemoFault({ fault, profile }: { fault: Fault; profile: VehicleProfile }) {
  const t = useT();
  const info = profile.faults?.explanations?.[fault.id];
  return (
    <article className="showcase-fault">
      <p className="showcase-fault-head">
        {info && <span className={`urgency urgency-${info.urgency}`}>{t(URGENCY[info.urgency])}</span>}
        {fault.code && <span className="fault-code">{fault.code}</span>}
      </p>
      <h3>{info?.title ?? fault.name}</h3>
      {info && (
        <>
          <p>{info.plain}</p>
          <p className="fault-label">{t("Common causes")}</p>
          <ul>
            {info.causes.slice(0, 3).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {info.check && (
            <p>
              <strong>{t("Check first")} </strong>
              {info.check}
            </p>
          )}
        </>
      )}
    </article>
  );
}

/**
 * The first thing people see. One job at a time: say what Openhood does, ask which car,
 * then show exactly what to do next for that car.
 */
export function FirstRun({
  page,
  loaded,
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
  problem,
}: {
  /** The start page, or the steps for the chosen car (/read). */
  page: "home" | "read";
  /** The saved car has been read from the browser. */
  loaded: boolean;
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
  /** The last read of a real car went wrong. */
  problem: ReadProblem | null;
}) {
  const t = useT();
  const carText = selection.make && selection.model && selection.year ? `${selection.year} ${selection.make} ${selection.model}` : "";
  // The demo runs on the start page while nothing else is connecting.
  // A profile without live readings (an airbag module) has nothing to show off: use standard OBD-II then.
  const showcase = profile.channels.length ? profile : (PROFILES.find((p) => p.generic) ?? profile);
  const demo = useDemoCar(showcase, page === "home" && !connecting);
  const [units] = useUnits();
  const shownCar = labelsIn(profileIn(showcase, units), t);
  const shownValues = valuesIn(showcase, demo.values, units);
  const shownPoints = (key: string) =>
    (demo.history.points[key] ?? []).map((p) => ({ t: p.t, v: valuesIn(showcase, { [key]: p.v }, units)[key] }));
  // The steps page needs a car: without one, go back to the start page to pick it.
  const router = useRouter();
  useEffect(() => {
    if (page === "read" && loaded && !carText) router.replace("/");
  }, [page, loaded, carText, router]);
  const layout = dialLayout(shownCar);
  // One chart from each group (air, engine, fuel), up to three.
  const showcaseCharts = layout.groups.map((g) => layout.charts.find((c) => c.group === g)!).slice(0, 3);
  if (showcaseCharts.length === 0) showcaseCharts.push(...layout.charts.slice(0, 3));

  // Has the person said they have the cable? Remembered, so step 1 stays done next time.
  const [hasAdapter, setHasAdapter] = useState(false);
  // "your phone" or "your computer": known only in the browser, after the static page loads.
  const [device, setDevice] = useState("computer");
  // No browser on an iPhone or iPad can reach an adapter (they all run Safari's engine).
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Android|iPhone|iPod|Mobile/i.test(ua)) setDevice("phone");
    else if (/iPad|Tablet/i.test(ua)) setDevice("tablet");
    setIos(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  }, []);
  useEffect(() => {
    try {
      setHasAdapter(localStorage.getItem(ADAPTER_KEY) === "1");
    } catch {}
  }, []);
  // How the adapter connects, asked in words people know: a cable or Bluetooth.
  const [via, setVia] = useState<AdapterLink | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(LINK_KEY);
      if (v === "usb" || v === "bluetooth") setVia(v);
    } catch {}
  }, []);
  /** "I have one" (with how it connects, for an ELM327), or "Change" to answer again. */
  function gotAdapter(yes: boolean, how?: AdapterLink) {
    setHasAdapter(yes);
    setVia(how ?? null);
    try {
      if (yes) localStorage.setItem(ADAPTER_KEY, "1");
      else localStorage.removeItem(ADAPTER_KEY);
      if (how) localStorage.setItem(LINK_KEY, how);
      else localStorage.removeItem(LINK_KEY);
    } catch {}
  }

  const buy = useFirstPick((profile.adapters ?? ["kkl"])[0]);
  const kinds = profile.adapters ?? ["kkl"];
  const thing = kinds[0] === "kkl" ? "KKL cable" : "ELM327 adapter";
  const deviceWord = t(device);
  const ble = bluetoothOk && kinds.includes("elm327");
  // KKL cables are always USB. An ELM327 can be either, so the first step asks which one they have.
  const elm = kinds.includes("elm327");
  const link: AdapterLink = elm && via === "bluetooth" ? "bluetooth" : "usb";
  const done = hasAdapter && (!elm || via !== null);
  // Bluetooth Low Energy adapters connect straight from the browser. Older ones are paired in the
  // computer's settings first and then read like a cable.
  const readBle = link === "bluetooth" && ble;
  const canStart = readBle || serialOk;
  const start = readBle ? onBluetooth : onConnect;
  const busy = connecting === (readBle ? "bluetooth" : "serial");
  // Openhood isn't proven on this car yet (no test run on one, or readings not verified): the AI is
  // asked to run Openhood's test with the person first.
  const untried = needsTest(profile, reportsFor(selection.make ?? "", selection.model ?? "", Number(selection.year)));
  const buyLink = buy && (
    <a className={`button big ${elm ? "quiet" : "ghost"}`} href={buy.link.url} target="_blank" rel="noreferrer">
      {t(buy.link.product ? "Buy on Amazon" : "Find on Amazon")}
    </a>
  );

  // One thing at a time, each with a drawing: get the cable, then plug in and start. If the read
  // goes wrong, the AI on their computer takes over.
  const cableStep = (
    <>
      <CableArt kind={kinds[0] === "kkl" ? "kkl" : "elm327"} />
      <h2 className="step-title">{t(thing === "KKL cable" ? "You need a KKL cable" : "You need an ELM327 adapter")}</h2>
      <p className="step-line">
        {/* Sure for a car Openhood knows; a good guess for any other car. */}
        {t(profile.generic ? "Most likely what connects your {make} to your {device}." : "It connects your {make} to your {device}.", {
          make: selection.make || t("car"),
          device: deviceWord,
        })}
      </p>
      <div className="chooser-actions">
        {elm ? (
          // How it connects decides how it is read: people know cable or Bluetooth.
          <>
            <button className="primary big" onClick={() => gotAdapter(true, "usb")}>
              {t("I have a USB one")}
            </button>
            <button className="primary big" onClick={() => gotAdapter(true, "bluetooth")}>
              {t("I have a Bluetooth one")}
            </button>
          </>
        ) : (
          <button className="primary big" onClick={() => gotAdapter(true)}>
            {t("I have one")}
          </button>
        )}
        {buyLink}
      </div>
      {buy && (
        <p className="step-foot">
          {t("Our pick:")} {buy.pick.name}, {t(buy.pick.connects)}.
        </p>
      )}
    </>
  );

  const got = elm ? t(link === "usb" ? "Got a USB ELM327" : "Got a Bluetooth ELM327") : t("Got the {thing}", { thing: t(thing) });
  const plugStep = (
    <>
      <PlugInArt />
      <h2 className="step-title">{t("Plug it in. Turn the key to II.")}</h2>
      <p className="step-line">{t("Don\u2019t start the engine. The socket is under the dashboard, near your knee.")}</p>
      {canStart ? (
        <>
          <div className="chooser-actions">
            <button className="primary big go" onClick={start} disabled={!!connecting}>
              {t(busy ? (readBle ? "Connecting…" : "Waking the car…") : "Start")}
            </button>
          </div>
          {link === "bluetooth" && (
            <p className="link-hint">
              {readBle && serialOk ? (
                <>
                  {t("Not found?")}{" "}
                  <button className="link-button" onClick={onConnect} disabled={!!connecting}>
                    {t("Pair it in your settings, then read it here")}
                  </button>
                </>
              ) : readBle ? (
                t("Turn the adapter on. No pairing needed.")
              ) : (
                t("Pair it in your {device}\u2019s Bluetooth settings first.", { device: deviceWord })
              )}
            </p>
          )}
        </>
      ) : (
        // This browser can't reach the adapter: the AI on the computer can.
        <>
          <p className="hero-note" role="note">
            <strong>{t("This browser can\u2019t read a car.")}</strong> {t("Let an AI on your computer read it, or use Chrome or Edge.")}
          </p>
          <div className="chooser-actions">
            <AgentButton car={carText} untried={untried} />
          </div>
        </>
      )}
      <p className="step-foot">
        {got}.{" "}
        <button className="link-button" onClick={() => gotAdapter(false)}>
          {t("Change")}
        </button>
      </p>
    </>
  );

  // The read went wrong: one way forward, the AI on their computer, which can see the traffic.
  const failStep = problem && (
    <>
      <p className="step-lamp">
        <EngineLight lit />
      </p>
      <h2 className="step-title">{t("Couldn\u2019t read the car")}</h2>
      <p className="step-line">{t(problem.message)}</p>
      <p className="step-line">{t("An AI can find out why and tell you what to do.")}</p>
      <div className="chooser-actions">
        <AgentButton car={carText} problem={problem} />
      </div>
      <p className="step-foot">
        <button className="link-button" onClick={start} disabled={!!connecting}>
          {t(busy ? "Waking the car…" : "Try again")}
        </button>
      </p>
    </>
  );

  if (page === "read")
    return (
      <section className="first-run read-page" aria-labelledby="read-title">
        <h1 id="read-title" className="sr-only">
          {t("Read your car")}
        </h1>
        {carText && (
          <div className="start">
            <div className="car-result read-card">
              <p className="car-chosen">
                <span>
                  <strong>
                    {selection.make} {selection.model}
                  </strong>{" "}
                  {selection.year}
                </span>
                <Link className="link-button" href="/">
                  {t("Change car")}
                </Link>
              </p>
              {failStep || (done ? plugStep : cableStep)}
            </div>
          </div>
        )}
      </section>
    );

  return (
    <section className="first-run" aria-label={t("Getting started")}>
      <div className="hero">
        <div className="hero-text">
          <h1>{t("Engine light on? Find out why.")}</h1>
          <p className="lede">
            {t("A free, open source fault code reader in your browser. Plug in a cheap adapter and see what’s wrong, in plain words, or let your AI read the car for you.")}
          </p>
        </div>
        {/* Said before they pick a car: nothing past the demo works in this browser. */}
        {!serialOk && !bluetoothOk && (
          <p className="hero-note" role="note">
            <strong>{t(ios ? "iPhones and iPads can\u2019t read a car." : "This browser can\u2019t read a car.")}</strong>{" "}
            {t(ios ? "Use Chrome or Edge on a computer, or Chrome on Android." : "Open Openhood in Chrome or Edge, or let an AI app on your computer read the car.")}
          </p>
        )}
        <div className="start home">
          <CarChooser
            profiles={PROFILES}
            selection={selection}
            onSelect={onSelect}
            keepOpen
            actions={() => (
              <Link className="button big continue" href="/read">
                {t("Continue")}
              </Link>
            )}
          />
        </div>
      </div>

      <div className="product">
        <DialRow profile={shownCar} values={shownValues} />
        <div className="callouts">
          {layout.dials.map(({ channel, big }) => (
            <Callout key={channel.key} name={big && layout.battery ? t("{reading} and battery", { reading: channel.label }) : channel.label} />
          ))}
        </div>
        <p className="showcase-line">{t("Your car’s own readings, live, the way a good dash shows them.")}</p>
        <p className="showcase-action">
          <button className="quiet big" onClick={onSimulator} disabled={!!connecting}>
            {t(connecting === "simulator" ? "Starting the demo…" : "Try a demo car")}
          </button>
        </p>
      </div>

      {showcaseCharts.length > 0 && (
        <section className="showcase light" aria-labelledby="trace-title">
          <h2 id="trace-title" className="giant long">
            {t("Last 30 seconds")}
          </h2>
          <div className="showcase-charts">
            {showcaseCharts.map((c) => (
              <LiveChart key={c.key} channel={c} points={shownPoints(c.key)} now={demo.history.now} value={shownValues[c.key]} />
            ))}
          </div>
          <div className="callouts">
            {showcaseCharts.map((c) =>
              c.group ? <Callout key={c.key} name={t(GROUP_NAMES[c.group])} role={t(GROUP_COLOUR_WORDS[c.group])} /> : <Callout key={c.key} name={c.label} />,
            )}
          </div>
          <p className="showcase-line">{t("Every other reading as a line, coloured by what it’s about.")}</p>
        </section>
      )}

      {demo.fault && (
        <section className="showcase dark" aria-labelledby="faults-title">
          <h2 id="faults-title" className="giant">
            {t("Faults")}
          </h2>
          <DemoFault fault={demo.fault} profile={showcase} />
          <p className="showcase-line">{t("Every code in plain words: what it means, what usually causes it, what to check first.")}</p>
        </section>
      )}

      <section className="showcase light" aria-labelledby="cars-title">
        <h2 id="cars-title" className="giant">
          {t("Any car")}
        </h2>
        <p className="showcase-chips">
          {EXAMPLE_MAKES.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </p>
        <p className="showcase-line">
          {t("Every petrol car from 2001 and diesel from 2004 speaks the standard. Cars with their own language get a profile, added by people like you.")}
        </p>
        <p className="showcase-action">
          <a href={GUIDE_URL}>{t("Add your car with an AI agent")}</a>
        </p>
      </section>
    </section>
  );
}
