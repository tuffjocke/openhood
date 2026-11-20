"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { hex, NegativeResponse } from "@/core/kwp2000/frame";
import {
  buildExport,
  combineHistories,
  historyKey,
  mergeHistory,
  parseExport,
  type HistoryEntry,
} from "@/core/history";
import { carReportUrl, reportUrl } from "@/core/report";
import type { Channel, Fault, Readiness, Values } from "@/core/profile";
import { openLink, WrongAdapterError, type ConnectVia } from "@/core/link/open";
import { AdapterError } from "@/core/link/elm327";
import { Session, type TrafficEvent } from "@/core/session";
import { TimeoutError } from "@/core/transport/types";
import { BluetoothTransport } from "@/core/transport/bluetooth";
import { WebSerialTransport } from "@/core/transport/webserial";
import { getProfile, PROFILES } from "@/profiles";
import { dialLayout, DialRow, GROUP_NAMES } from "./Dials";
import { EngineLight } from "./landing/EngineLight";
import { LiveChart, type Point } from "./LiveChart";
import { HelpAddCar } from "./CarChooser";
import { FaultPanel, HistoryFile } from "./FaultPanel";
import { FirstRun } from "./FirstRun";
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
        const v = latest.current;
        rows.current.push(
          [((t - recStart.current) / 1000).toFixed(1), ...profile.channels.map((c) => v[c.key]?.toFixed(c.decimals + 1) ?? "")].join(","),
        );
      }
    }, 100);
    return () => clearInterval(id);
  }, [recording, status, profile]);

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
      void refreshFaults(s);
      void s.poll(onValues, (e) => {
        setStatus("error");
        setError(explain(e) ?? "Lost the ECU.");
      });
    } catch (e) {
      const msg = explain(e);
      setStatus(msg ? "error" : "idle");
      setError(msg);
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

  /** Read stored faults, pending faults and self-tests, one after the other (half duplex). */
  async function refreshFaults(s: Session) {
    try {
      const stored = await s.readFaults();
      setFaults(stored);
      remember(stored, false);
      const pend = await s.readPending();
      setPending(pend);
      if (pend) remember(pend, true);
      setReadiness(await s.readReadiness());
    } catch {}
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
    const header = ["time_s", ...profile.channels.map((c) => `${c.key}_${c.unit.replace(/[^a-z%]/gi, "")}`)].join(",");
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
  const recSeconds = recording ? Math.floor((now - recStart.current) / 1000) : 0;

  // The profile picks its dials; the rest of its readings become charts, grouped by colour.
  const { charts: chartChannels, groups: chartGroups } = dialLayout(profile);

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
          Discard
        </button>
      )}
      <button className={recording ? "rec" : "quiet"} disabled={!live && !recording && !unsavedDrive} onClick={toggleRecording}>
        {recording ? "Stop and save" : unsavedDrive ? "Save the drive" : "Log a drive"}
      </button>
    </span>
  );

  return (
    <main className={`shell${showFirstRun ? " is-first-run" : ""}`}>
      <header className="top">
        <div className="mark">
          <button className="mark-name" onClick={goHome} disabled={status === "live" || status === "connecting"} title="Back to start">
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
              Demo<span className="demo-more">car, made-up faults</span>
            </span>
            <button onClick={disconnect} disabled={status === "connecting"}>
              Back to start
            </button>
            {logTools}
          </div>
        )}
        {!showFirstRun && !demo && (
          <div className="actions">
            <span className={`status status-${status}`}>
              <i />
              <span className="status-text">
                {status === "idle" && "Not connected"}
                {status === "connecting" && "Waking the car…"}
                {status === "live" && "Connected"}
                {status === "error" && "Stopped"}
              </span>
            </span>
            {status === "idle" || status === "error" ? (
              <span className="action-buttons">
                {bluetoothOk && (profile.adapters ?? ["kkl"]).includes("elm327") && (
                  <button className="quiet" onClick={() => connect("bluetooth")}>
                    Bluetooth
                  </button>
                )}
                <button onClick={() => connect("serial")} disabled={!serialOk} title={serialOk ? "" : "Not available in this browser"}>
                  Read my car
                </button>
              </span>
            ) : (
              <button onClick={disconnect} disabled={status === "connecting"}>
                Disconnect
              </button>
            )}
            {(live || recording || unsavedDrive) && logTools}
          </div>
        )}
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}{" "}
          {source && source !== "simulator" && (
            <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink}>
              Send us what happened
            </a>
          )}
          {source && source !== "simulator" && " (public, on GitHub)"}
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
        />
      ) : (
        <>
        </>
      )}

      {!showFirstRun && (
        <>
          <section className="binnacle" aria-label="Live data">
            <div className="binnacle-corners">
              <span className="binnacle-lamp">
                {!!faults?.length && (
                  <>
                    <EngineLight lit />
                    {faults.length} {faults.length === 1 ? "fault" : "faults"}
                  </>
                )}
              </span>
              <span className="binnacle-link">{session.current ? linkLine(session.current) : ""}</span>
            </div>
            <DialRow profile={profile} values={latest.current} unavailable={unavailable} />
            {chartChannels.length > 0 && (
              <>
                {chartGroups.length > 0 && (
                  <p className="chart-key">
                    {chartGroups.map((g) => (
                      <span key={g} className={`group-${g}`}>
                        <i />
                        {GROUP_NAMES[g]}
                      </span>
                    ))}
                  </p>
                )}
                <div className={`charts${allReadings ? " all" : ""}`}>
                  {chartChannels.map((c) => (
                    <LiveChart
                      key={c.key}
                      channel={c}
                      points={history.current[c.key] ?? []}
                      now={now}
                      value={latest.current[c.key]}
                      unavailable={unavailable.has(c.key)}
                    />
                  ))}
                </div>
                {chartChannels.length > 2 && (
                  <button className="quiet show-all" aria-expanded={allReadings} onClick={() => setAllReadings(!allReadings)}>
                    {allReadings ? "Show fewer" : "Show all"}
                  </button>
                )}
              </>
            )}
          </section>

      <section className="lower">
        <FaultPanel
          profile={profile}
          vehicle={vehicleText}
          values={latest.current}
          live={live}
          busy={busy}
          faults={faults}
          pending={pending}
          readiness={readiness}
          history={demo ? [] : faultHistory}
          confirming={confirmClear}
          setConfirming={setConfirmClear}
          onClear={() => faultAction(true)}
          onFreezeFrame={(f) => session.current?.readFreezeFrame(f) ?? Promise.resolve(null)}
          onForgetHistory={forgetHistory}
        />
      </section>

      {/* Asked once, right after a real read: the only moment the answer is known. */}
      {!demo && live && faults !== null && asked === null && selection.make && selection.model && selection.year && (
        <p className="ask">
          <span>Did this match your car?</span>
          <a className="button" href="#" target="_blank" rel="noreferrer" onClick={(e) => (fillCarReport(e), setAsked("yes"))}>
            Yes
          </a>
          <a className="button quiet" href="#" target="_blank" rel="noreferrer" onClick={(e) => (fillReportLink(e), setAsked("no"))}>
            No
          </a>
        </p>
      )}
      {asked && <p className="ask">Thanks. Post what opened on GitHub and it helps the next person.</p>}

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
              Clear all
            </button>
          )}
          <button className="quiet" disabled={!live || busy} onClick={() => faultAction(false)}>
            Read again
          </button>
        </span>
      <details className="more-data">
        <summary>More</summary>
      {!demo && <HistoryFile onExport={exportHistory} onImport={importHistory} />}
      <details className="log" onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Traffic with the car</summary>
        {logOpen && (
          <pre>
            {traffic.current
              .slice(-80)
              .map(
                (e) =>
                  `${(e.t / 1000).toFixed(3).padStart(9)}  ${e.dir === "tx" ? "→" : "←"}  ${e.text ?? hex(e.bytes)}${e.note ? `   ${e.note}` : ""}`,
              )
              .join("\n") || "Nothing yet."}
          </pre>
        )}
      </details>
        <p className="profile-info">
          Reading as: {profile.name}, {profile.ecu}
          {profile.status === "experimental" && <span className="tag">experimental</span>}{" "}
          <a href={`https://github.com/tuffjocke/openhood/tree/main/profiles/${profile.id}`}>How sure is this?</a>
        </p>
      </details>
      </div>
      </>
      )}

      <footer className="foot">
        <span>
          Provided as is. Use at your own risk, car parked. <Link href="/disclaimer">Disclaimer</Link>
        </span>
        <span className="foot-links">
          {!showFirstRun && !demo && (
            <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink} title="Opens a pre-filled GitHub issue">
              Send test report
            </a>
          )}
          {showFirstRun && (
            <button className="link-button" onClick={() => connect("simulator")}>
              Demo car
            </button>
          )}
          <a href="https://github.com/tuffjocke/openhood/blob/main/CONTRIBUTING.md">Contribute</a>
          <a href="https://github.com/tuffjocke/openhood">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
