"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hex, NegativeResponse } from "@/core/kwp2000/frame";
import {
  buildExport,
  combineHistories,
  historyKey,
  mergeHistory,
  parseExport,
  type HistoryEntry,
} from "@/core/history";
import { carReportUrl, reportUrl, trafficLines } from "@/core/report";
import type { Channel, Fault, Readiness, Values } from "@/core/profile";
import { openLink, WrongAdapterError, type ConnectVia } from "@/core/link/open";
import { AdapterError } from "@/core/link/elm327";
import { Session, type TrafficEvent } from "@/core/session";
import { TimeoutError } from "@/core/transport/types";
import { BluetoothTransport } from "@/core/transport/bluetooth";
import { WebSerialTransport } from "@/core/transport/webserial";
import { getProfile, PROFILES } from "@/profiles";
import { dialLayout, DialRow } from "./Dials";
import { useUnits } from "./useUnits";
import { labelsIn, useLang, useT } from "./useLang";
import { LANG_NAMES, LANGS, type Lang } from "@/core/i18n";
import { profileIn, UNIT_NAMES, UNITS, valuesIn, type Units } from "@/core/units";
import { EngineLight } from "./landing/EngineLight";
import { LiveChart, type Point } from "./LiveChart";
import { HelpAddCar } from "./CarChooser";
import { FaultPanel, HistoryFile } from "./FaultPanel";
import { FirstRun } from "./FirstRun";
import { AgentButton } from "./landing/AgentButton";
import { selectionLabel, VehiclePicker, type Selection } from "./VehiclePicker";

type Status = "idle" | "connecting" | "live" | "error";
type Source = ConnectVia;

const HISTORY_MS = 35_000;
const LOG_LINES = 300;
const VEHICLE_KEY = "openhood.vehicle";

/** One line for the report and the traffic log: what we connected through. */
function describeAdapter(s: Session): string {
  const i = s.init;
  if (s.link.adapter === "simulator") return "simulator";
  if (i.kind === "adapter") return `ELM327 adapter, ${i.protocol || "unknown protocol"}`;
  return `KKL cable, ${i.kind === "fast" ? "fast init" : `5-baud init (${i.protocol})`}`;
}

/** The top-right corner of the cluster: how the car is connected, in a few words. */
function linkLine(s: Session): string {
  const i = s.init;
  if (s.link.adapter === "simulator") return "Demo car";
  if (i.kind === "adapter") return i.protocol || "ELM327 adapter";
  return i.kind === "fast" ? "KKL cable, KWP2000" : `KKL cable, ${i.protocol}`;
}

function explain(e: unknown): string | null {
  if (e instanceof DOMException && e.name === "NotFoundError") return null; // picker cancelled
  if (e instanceof WrongAdapterError || e instanceof AdapterError) return e.message;
  // The ELM327 link words its own timeouts; the K-line one is raw.
  if (e instanceof TimeoutError && !e.message.startsWith("K-line timeout")) return e.message;
  if (e instanceof TimeoutError)
    return "The car didn't answer. Check that the ignition is on and the plug is pushed all the way into the socket.";
  if (e instanceof NegativeResponse) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/** The save dialog of the File System Access API, where the browser has it. */
type SavePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;
};

/** The start page ("home") or the steps for the chosen car ("read", at /read). */
export default function Dashboard({ page = "home" }: { page?: "home" | "read" }) {
  const [selection, setSelection] = useState<Selection>({ profileId: PROFILES[0].id });
  const profile = getProfile(selection.profileId) ?? PROFILES[0];
  const [status, setStatus] = useState<Status>("idle");
  /** The saved car has been read from the browser (the steps page waits for it). */
  const [loaded, setLoaded] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faults, setFaults] = useState<Fault[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [pending, setPending] = useState<Fault[] | null>(null);
  const [faultHistory, setFaultHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  /** Phones show the first four readings (and any past its limit) until asked for the rest. */
  const [allReadings, setAllReadings] = useState(false);
  const [recording, setRecording] = useState(false);
  /** A logged drive whose save was cancelled: kept until it is saved or discarded. */
  const [unsavedDrive, setUnsavedDrive] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [serialOk, setSerialOk] = useState(true);
  const [bluetoothOk, setBluetoothOk] = useState(false);
  const [now, setNow] = useState(0);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [everLive, setEverLive] = useState(false);
  const [adapter, setAdapter] = useState<string | undefined>(undefined);
  /** The "did this match your car?" answer for this connection. */
  const [asked, setAsked] = useState<"yes" | "no" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  /** What went wrong reading a real car: the AI on their computer is offered to find out why. */
  const [problem, setProblem] = useState<string | null>(null);

  // Readings are kept in metric, as the profile gives them, and converted only to show and log.
  const [units, setUnits] = useUnits();
  const [lang, setLang] = useLang();
  const t = useT();
  const shown = useMemo(() => labelsIn(profileIn(profile, units), t), [profile, units, t]);
  const show = useCallback((v: Values) => valuesIn(profile, v, units), [profile, units]);

  const session = useRef<Session | null>(null);
  const latest = useRef<Values>({});
  const history = useRef<Record<string, Point[]>>({});
  const traffic = useRef<TrafficEvent[]>([]);
  const reads = useRef<number[]>([]);
  const rows = useRef<string[]>([]);
  const recStart = useRef(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VEHICLE_KEY) ?? "null") as Selection | null;
      if (saved && getProfile(saved.profileId)) setSelection({ ...saved, chosen: true });
    } catch {}
    setLoaded(true);
    setSerialOk(WebSerialTransport.supported());
    setBluetoothOk(BluetoothTransport.supported());
  }, []);

  // Repaint at 10 Hz; also the recording clock.
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (recording && status === "live") {
        const v = show(latest.current);
        rows.current.push(
          [((t - recStart.current) / 1000).toFixed(1), ...profile.channels.map((c) => v[c.key]?.toFixed(c.decimals + 1) ?? "")].join(","),
        );
      }
    }, 100);
    return () => clearInterval(id);
  }, [recording, status, profile, show]);

  const onValues = useCallback((v: Values) => {
    const t = performance.now();
    Object.assign(latest.current, v);
    for (const [k, val] of Object.entries(v)) {
      const h = (history.current[k] ??= []);
      h.push({ t, v: val as number });
      while (h.length && t - h[0].t > HISTORY_MS) h.shift();
    }
    reads.current.push(t);
    while (reads.current.length && t - reads.current[0] > 2000) reads.current.shift();
  }, []);

  const onTraffic = useCallback((e: TrafficEvent) => {
    traffic.current.push(e);
    if (traffic.current.length > LOG_LINES) traffic.current.shift();
  }, []);

  async function connect(kind: Source) {
    setError(null);
    setFaults(null);
    setReadiness(null);
    setPending(null);
    setUnavailable(new Set());
    setSource(kind);
    setStatus("connecting");
    setProblem(null);
    setAdapter(undefined);
    // The demo can't go wrong in a way an AI could help with.
    const flag = (msg: string) => kind !== "simulator" && setProblem(msg);
    latest.current = {};
    history.current = {};
    traffic.current = [];
    try {
      const s = new Session(profile, await openLink(profile, kind, onTraffic), onTraffic);
      session.current = s;
      await s.connect();
      setAdapter(describeAdapter(s));
      setUnavailable(new Set(s.unavailableChannels));
      setStatus("live");
      setEverLive(true);
      setAsked(null);
      window.scrollTo(0, 0);
      void refreshFaults(s).then((ok) => ok || flag("Connected, but the fault codes couldn\u2019t be read."));
      void s.poll(onValues, (e) => {
        setStatus("error");
        setError(explain(e) ?? "Lost the ECU.");
        flag(explain(e) ?? "Lost the ECU.");
      });
      // Connected but nothing comes back: worth a closer look too.
      if (profile.channels.length)
        setTimeout(() => {
          if (session.current === s && !Object.keys(latest.current).length) flag("Connected, but no readings came back.");
        }, 10_000);
    } catch (e) {
      const msg = explain(e);
      setStatus(msg ? "error" : "idle");
      setError(msg);
      if (msg) flag(msg);
    }
  }

  async function disconnect() {
    const wasDemo = source === "simulator";
    setRecording(false);
    await session.current?.disconnect();
    session.current = null;
    setStatus("idle");
    setSource(null);
    if (wasDemo) goHome(); // the demo isn't their car: nothing to keep on screen
  }

  /** Let go of the adapter so the AI agent can open it, and stay on this screen. */
  async function release() {
    setRecording(false);
    const s = session.current;
    session.current = null;
    await s?.disconnect();
    setStatus((now) => (now === "live" ? "idle" : now));
  }

  /** Back to the start page. */
  function goHome() {
    setEverLive(false);
    setError(null);
    setFaults(null);
    setPending(null);
    setReadiness(null);
    window.scrollTo(0, 0);
  }

  const hKey = historyKey([selection.profileId, selection.make, selection.model, selection.year]);

  // Load this car's fault history when the car changes.
  useEffect(() => {
    try {
      setFaultHistory(JSON.parse(localStorage.getItem(hKey) ?? "[]") as HistoryEntry[]);
    } catch {
      setFaultHistory([]);
    }
  }, [hKey]);

  function remember(found: Fault[], isPending: boolean) {
    // The demo's made-up faults must never land in the real car's history.
    if (!found.length || session.current?.link.adapter === "simulator") return;
    setFaultHistory((prev) => {
      const next = mergeHistory(prev, found, Date.now(), isPending);
      try {
        localStorage.setItem(hKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function forgetHistory() {
    setFaultHistory([]);
    try {
      localStorage.removeItem(hKey);
    } catch {}
  }

  function exportHistory() {
    const cars: Record<string, HistoryEntry[]> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("openhood.history.")) cars[k] = JSON.parse(localStorage.getItem(k) ?? "[]");
      }
    } catch {}
    const blob = new Blob([JSON.stringify(buildExport(cars), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `openhood-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importHistory(file: File): Promise<string> {
    try {
      const data = parseExport(await file.text());
      const keys = Object.keys(data.cars);
      for (const k of keys) {
        const mine = JSON.parse(localStorage.getItem(k) ?? "[]") as HistoryEntry[];
        localStorage.setItem(k, JSON.stringify(combineHistories(mine, data.cars[k])));
      }
      setFaultHistory(JSON.parse(localStorage.getItem(hKey) ?? "[]") as HistoryEntry[]);
      return keys.length === 1 ? "Imported history for 1 car." : `Imported history for ${keys.length} cars.`;
    } catch (e) {
      return e instanceof Error ? e.message : "Couldn't import that file.";
    }
  }

  /** A car report for profiles/car-reports.json, filled in at click time. Nothing personal. */
  function fillCarReport(e: React.MouseEvent<HTMLAnchorElement>) {
    const s = session.current;
    if (!s || !selection.make || !selection.model || !selection.year) return;
    const i = s.init;
    e.currentTarget.href = carReportUrl({
      make: selection.make,
      model: selection.model,
      year: selection.year,
      ...(selection.engine ? { engine: selection.engine } : {}),
      profile: profile.id,
      adapter: s.link.adapter === "elm327" ? "elm327" : "kkl",
      protocol: i.kind === "adapter" ? i.protocol || "unknown" : i.kind === "fast" ? "KWP2000 fast init" : `5-baud init, ${i.protocol}`,
      result: faults ? "worked" : "partly",
      values: profile.channels.filter((c) => latest.current[c.key] !== undefined).length,
      date: new Date().toISOString().slice(0, 10),
    });
  }

  /** Fill in the GitHub issue link at click time, so it has the latest values and traffic. */
  function fillReportLink(e: React.MouseEvent<HTMLAnchorElement>) {
    e.currentTarget.href = reportUrl({
      vehicle: vehicleText,
      profile,
      source,
      adapter,
      status,
      error,
      readsPerSecond: reads.current.length / 2,
      values: latest.current,
      faults,
      traffic: traffic.current,
      userAgent: navigator.userAgent,
    });
  }

  /** Read stored faults, pending faults and self-tests, one after the other (half duplex). False if the stored ones failed. */
  async function refreshFaults(s: Session): Promise<boolean> {
    try {
      const stored = await s.readFaults();
      setFaults(stored);
      remember(stored, false);
    } catch {
      return false;
    }
    try {
      const pend = await s.readPending();
      setPending(pend);
      if (pend) remember(pend, true);
      setReadiness(await s.readReadiness());
    } catch {}
    return true;
  }

  async function faultAction(clear: boolean) {
    if (!session.current) return;
    setBusy(true);
    try {
      if (clear) await session.current.clearFaults();
      await refreshFaults(session.current);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }

  /** Ask where to put the file (Chrome and Edge on a computer). Elsewhere it goes to Downloads. */
  async function saveDrive(csv: string) {
    const name = `${profile.id}-${new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "")}.csv`;
    const w = window as SavePickerWindow;
    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({ suggestedName: name, types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }] });
        const file = await handle.createWritable();
        await file.write(csv);
        await file.close();
        setUnsavedDrive(null);
        return;
      } catch (e) {
        // Cancelled: keep the drive so it isn't lost, and offer to save it again.
        if (e instanceof DOMException && e.name === "AbortError") return setUnsavedDrive(csv);
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    setUnsavedDrive(null);
  }

  function toggleRecording() {
    if (unsavedDrive) return void saveDrive(unsavedDrive);
    if (!recording) {
      rows.current = [];
      recStart.current = performance.now();
      setRecording(true);
      return;
    }
    setRecording(false);
    const header = ["time_s", ...shown.channels.map((c) => `${c.key}_${c.unit.replace(/[^a-z%]/gi, "")}`)].join(",");
    void saveDrive(header + "\n" + rows.current.join("\n"));
  }

  function pickVehicle(sel: Selection) {
    setSelection(sel);
    setEverLive(false);
    setFaults(null);
    setReadiness(null);
    setPending(null);
    latest.current = {};
    history.current = {};
    try {
      localStorage.setItem(VEHICLE_KEY, JSON.stringify(sel));
    } catch {}
  }

  const live = status === "live";
  const demo = source === "simulator";
  // The guide replaces the empty gauges until the first connection with this car.
  const showFirstRun = !everLive && status !== "live";
  const label = selectionLabel(selection, profile);
  // Empty for a generic profile: "I have a Generic OBD-II" would read oddly in the AI question.
  const vehicleText = selection.make ? [label.title, label.detail].filter(Boolean).join(" ") : "";
  const rate = reads.current.length / 2;
  const readProblem = problem ? { message: problem, profile: profile.id, adapter, traffic: trafficLines(traffic.current.slice(-40)) } : null;
  const recSeconds = recording ? Math.floor((now - recStart.current) / 1000) : 0;

  // The profile picks its dials; the rest of its readings become charts, grouped by colour.
  const { charts: chartChannels } = dialLayout(shown);
  const shownLatest = show(latest.current);
  // A real car that is moving: whoever watches the screen shouldn't be the driver. Readings stay as they are.
  const speedKey = profile.channels.find((c) => c.unit === "km/h")?.key;
  const moving = !demo && status === "live" && speedKey !== undefined && (latest.current[speedKey] ?? 0) > 8;

  // The demo with live readings shows no header: its two buttons sit in the binnacle instead.
  const bare = !showFirstRun && demo && profile.channels.length > 0;

  // Logging a drive sits with the other header actions, after Back to start or Disconnect.
  const logTools = (
    <span className="log-tools">
      {recording && (
        <span className="rec-time">
          {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
        </span>
      )}
      {unsavedDrive && (
        <button className="link-button" onClick={() => setUnsavedDrive(null)}>
          {t("Discard")}
        </button>
      )}
      <button className={recording ? "rec" : "quiet"} disabled={!live && !recording && !unsavedDrive} onClick={toggleRecording}>
        {t(recording ? "Stop and save" : unsavedDrive ? "Save the drive" : "Log a drive")}
      </button>
    </span>
  );

  return (
    <main className={`shell${showFirstRun ? ` is-first-run${page === "read" ? " is-read" : ""}` : " dense"}`}>
      {/* The demo needs no header: Back to start and Log a drive sit in the binnacle's corners. */}
      {!bare && (
      <header className="top">
        <div className="mark">
          <button className="mark-name" onClick={goHome} disabled={status === "live" || status === "connecting"} title={t("Back to start")}>
            Openhood
          </button>
          {!showFirstRun && !demo && (
            <VehiclePicker
              profiles={PROFILES}
              selection={selection}
              profile={profile}
              disabled={status === "live" || status === "connecting"}
              onSelect={pickVehicle}
            />
          )}
        </div>
        {!showFirstRun && demo && (
          <div className="actions">
            <span className="demo-name">
              {t("Demo")}<span className="demo-more">{t("car, made-up faults")}</span>
            </span>
            <button onClick={disconnect} disabled={status === "connecting"}>
              {t("Back to start")}
            </button>
            {profile.channels.length > 0 && logTools}
          </div>
        )}
        {!showFirstRun && !demo && (
          <div className="actions">
            <span className={`status status-${status}`}>
              <i />
              <span className="status-text">
                {status === "idle" && t("Not connected")}
                {status === "connecting" && t("Waking the car…")}
                {status === "live" && t("Connected")}
                {status === "error" && t("Stopped")}
              </span>
            </span>
            {status === "idle" || status === "error" ? (
              <span className="action-buttons">
                {bluetoothOk && (profile.adapters ?? ["kkl"]).includes("elm327") && (
                  <button className="quiet" onClick={() => connect("bluetooth")}>
                    {t("Bluetooth")}
                  </button>
                )}
                <button onClick={() => connect("serial")} disabled={!serialOk} title={serialOk ? "" : t("Not available in this browser")}>
                  {t("Read my car")}
                </button>
              </span>
            ) : (
              <button onClick={disconnect} disabled={status === "connecting"}>
                {t("Disconnect")}
              </button>
            )}
            {/* Nothing to log for a profile without live readings. */}
            {(live || recording || unsavedDrive) && profile.channels.length > 0 && logTools}
          </div>
        )}
      </header>
      )}

      {/* A problem the AI can look into gets its own card instead (the steps page, or beside the faults). */}
      {error && error !== problem && (
        <p className="notice" role="alert">
          {t(error)}{" "}
          {source && source !== "simulator" && (
            <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink}>
              {t("Send us what happened")}
            </a>
          )}
          {source && source !== "simulator" && ` ${t("(public, on GitHub)")}`}
        </p>
      )}

      {showFirstRun ? (
        <FirstRun
          page={page}
          loaded={loaded}
          vehicle={vehicleText}
          selection={selection}
          onSelect={pickVehicle}
          profile={profile}
          serialOk={serialOk}
          connecting={status === "connecting" ? source : null}
          bluetoothOk={bluetoothOk}
          onConnect={() => connect("serial")}
          onBluetooth={() => connect("bluetooth")}
          onSimulator={() => connect("simulator")}
          problem={readProblem}
        />
      ) : (
        <>
        </>
      )}

      {!showFirstRun && (
        // Dense, as in the MCP live view: the binnacle on the left, faults and the rest beside it.
        <div className="live-body">
          {/* Profiles for parts like the airbag have faults but no live readings: no binnacle then. */}
          {profile.channels.length > 0 && (
          <section className="binnacle" aria-label={t("Live data")}>
            <div className="binnacle-corners">
              <span className="binnacle-start">
                {bare && (
                  <button className="link-button binnacle-back" onClick={disconnect} disabled={status === "connecting"}>
                    <span aria-hidden="true">‹</span> {t("Back")}
                  </button>
                )}
              </span>
              {faults?.length ? (
                <span className="binnacle-lamp" role="img" aria-label={`${faults.length} ${t(faults.length === 1 ? "fault" : "faults")}`}>
                  <EngineLight lit />
                </span>
              ) : (
                <span />
              )}
              <span className="binnacle-link">{bare ? logTools : session.current ? t(linkLine(session.current)) : ""}</span>
            </div>
            {moving && <p className="moving">{t("Moving. Let a passenger watch the screen.")}</p>}
            <DialRow profile={shown} values={shownLatest} unavailable={unavailable} />
            {chartChannels.length > 0 && (
              <>
                <div className={`charts${allReadings ? " all" : ""}`}>
                  {chartChannels.map((c) => (
                    <LiveChart
                      key={c.key}
                      channel={c}
                      points={units === "metric" ? (history.current[c.key] ?? []) : (history.current[c.key] ?? []).map((p) => ({ t: p.t, v: show({ [c.key]: p.v })[c.key] }))}
                      now={now}
                      value={shownLatest[c.key]}
                      unavailable={unavailable.has(c.key)}
                    />
                  ))}
                </div>
                {chartChannels.length > 2 && (
                  <button className="quiet show-all" aria-expanded={allReadings} onClick={() => setAllReadings(!allReadings)}>
                    {t(allReadings ? "Show fewer" : "Show all")}
                  </button>
                )}
              </>
            )}
          </section>
          )}

      <div className="live-side">
      {/* Something went wrong with a real car: the AI on their computer can see the traffic and find out why. */}
      {readProblem && !demo && (
        <section className="ai-help" aria-live="polite">
          <h2>{t("Not reading right?")}</h2>
          <p>{t(readProblem.message)} {t("An AI can find out why and tell you what to do.")}</p>
          <div className="chooser-actions">
            <AgentButton car={vehicleText} problem={readProblem} onBefore={() => void release()} />
          </div>
        </section>
      )}
      <section className="lower">
        <FaultPanel
          profile={shown}
          vehicle={vehicleText}
          values={shownLatest}
          live={live}
          busy={busy}
          faults={faults}
          pending={pending}
          readiness={readiness}
          history={demo ? [] : faultHistory}
          confirming={confirmClear}
          setConfirming={setConfirmClear}
          onClear={() => faultAction(true)}
          onFreezeFrame={async (f) => {
            const v = (await session.current?.readFreezeFrame(f)) ?? null;
            return v && show(v);
          }}
          onForgetHistory={forgetHistory}
        />
      </section>

      {/* Asked once, right after a real read: the only moment the answer is known. */}
      {!demo && live && faults !== null && asked === null && selection.make && selection.model && selection.year && (
        <p className="ask">
          <span>{t("Did this match your car?")}</span>
          <a className="button" href="#" target="_blank" rel="noreferrer" onClick={(e) => (fillCarReport(e), setAsked("yes"))}>
            {t("Yes")}
          </a>
          <a className="button quiet" href="#" target="_blank" rel="noreferrer" onClick={(e) => (fillReportLink(e), setAsked("no"))}>
            {t("No")}
          </a>
        </p>
      )}
      {asked && <p className="ask">{t("Thanks. Post what opened on GitHub and it helps the next person.")}</p>}

      {!demo && live && faults !== null && profile.generic && selection.make && selection.model && selection.year && (
        <HelpAddCar car={{ make: selection.make, model: selection.model, year: selection.year }} />
      )}

      <div className="tool-row">
        <span className="tool-buttons">
          {live && !!faults?.length && profile.faults?.clear && (
            <button
              className="quiet"
              disabled={busy || confirmClear}
              onClick={() => {
                setConfirmClear(true);
                document.getElementById("faults")?.scrollIntoView({ block: "nearest" });
              }}
            >
              {t("Clear all")}
            </button>
          )}
          <button className="quiet" disabled={!live || busy} onClick={() => faultAction(false)}>
            {t("Read again")}
          </button>
        </span>
      <details className="more-data">
        <summary>{t("More")}</summary>
      {!demo && <HistoryFile onExport={exportHistory} onImport={importHistory} />}
      <details className="log" onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{t("Traffic with the car")}</summary>
        {logOpen && (
          <pre>
            {traffic.current
              .slice(-80)
              .map(
                (e) =>
                  `${(e.t / 1000).toFixed(3).padStart(9)}  ${e.dir === "tx" ? "→" : "←"}  ${e.text ?? hex(e.bytes)}${e.note ? `   ${e.note}` : ""}`,
              )
              .join("\n") || t("Nothing yet.")}
          </pre>
        )}
      </details>
        <p className="profile-info">
          {t("Reading as:")} {profile.name}, {profile.ecu}
          {profile.status === "experimental" && <span className="tag">{t("experimental")}</span>}{" "}
          <a href={`https://github.com/tuffjocke/openhood/tree/main/profiles/${profile.id}`}>{t("How sure is this?")}</a>
        </p>
      </details>
      </div>
      </div>
      </div>
      )}

      <footer className="foot">
        <span>
          {t("Provided as is. Use at your own risk, car parked.")} <Link href="/disclaimer">{t("Disclaimer")}</Link>
        </span>
        <span className="foot-links">
          {!showFirstRun && !demo && (
            <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink} title={t("Opens a pre-filled GitHub issue")}>
              {t("Send test report")}
            </a>
          )}
          {showFirstRun && (
            <button className="link-button" onClick={() => connect("simulator")}>
              {t("Demo car")}
            </button>
          )}
          <select className="units" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("Language")}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
          <select className="units" value={units} onChange={(e) => setUnits(e.target.value as Units)} aria-label={t("Units")}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
            ))}
          </select>
          <a href="https://github.com/tuffjocke/openhood/blob/main/CONTRIBUTING.md">{t("Contribute")}</a>
          <a href="https://github.com/tuffjocke/openhood">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
