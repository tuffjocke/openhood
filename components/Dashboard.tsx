"use client";

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
import { reportUrl } from "@/core/report";
import type { Channel, Fault, Readiness, Values } from "@/core/profile";
import { Session, type TrafficEvent } from "@/core/session";
import { SimulatedTransport } from "@/core/transport/simulated";
import { TimeoutError } from "@/core/transport/types";
import { WebSerialTransport } from "@/core/transport/webserial";
import { getProfile, PROFILES } from "@/profiles";
import { Sparkline, type Point } from "./Sparkline";
import { FaultPanel, FaultSummary } from "./FaultPanel";
import { FirstRun } from "./FirstRun";
import { selectionLabel, VehiclePicker, type Selection } from "./VehiclePicker";

type Status = "idle" | "connecting" | "live" | "error";
type Source = "serial" | "simulator";

const HISTORY_MS = 60_000;
const LOG_LINES = 300;
const VEHICLE_KEY = "openhood.vehicle";

/** toFixed without "-0.00". */
function fmt(v: number, decimals: number) {
  const s = v.toFixed(decimals);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

function isWarn(c: Channel, v: number | undefined) {
  if (v === undefined) return false;
  return (c.warnAbove !== undefined && v > c.warnAbove) || (c.warnBelow !== undefined && v < c.warnBelow);
}

function explain(e: unknown): string | null {
  if (e instanceof DOMException && e.name === "NotFoundError") return null; // picker cancelled
  if (e instanceof TimeoutError)
    return "No answer from the ECU. Check that the ignition is on and that the cable is a KKL type, not an ELM327.";
  if (e instanceof NegativeResponse) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export default function Dashboard() {
  const [selection, setSelection] = useState<Selection>({ profileId: PROFILES[0].id });
  const profile = getProfile(selection.profileId) ?? PROFILES[0];
  const [status, setStatus] = useState<Status>("idle");
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faults, setFaults] = useState<Fault[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [pending, setPending] = useState<Fault[] | null>(null);
  const [faultHistory, setFaultHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [serialOk, setSerialOk] = useState(true);
  const [now, setNow] = useState(0);
  const [night, setNight] = useState(false);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [everLive, setEverLive] = useState(false);
  const [pickerRequest, setPickerRequest] = useState(0);

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
      if (saved && getProfile(saved.profileId)) setSelection(saved);
    } catch {}
    setSerialOk(WebSerialTransport.supported());
    setNight(window.matchMedia("(prefers-color-scheme: dark)").matches);
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
    const transport =
      kind === "serial" ? new WebSerialTransport({ baudRate: profile.link.baudRate }) : new SimulatedTransport(profile);
    const s = new Session(profile, transport, onTraffic);
    session.current = s;
    try {
      await s.connect();
      setUnavailable(new Set(s.unavailableChannels));
      setStatus("live");
      setEverLive(true);
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
    setRecording(false);
    await session.current?.disconnect();
    session.current = null;
    setStatus("idle");
    setSource(null);
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
    if (!found.length) return;
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

  /** Fill in the GitHub issue link at click time, so it has the latest values and traffic. */
  function fillReportLink(e: React.MouseEvent<HTMLAnchorElement>) {
    e.currentTarget.href = reportUrl({
      vehicle: vehicleText,
      profile,
      source,
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

  function toggleRecording() {
    if (!recording) {
      rows.current = [];
      recStart.current = performance.now();
      setRecording(true);
      return;
    }
    setRecording(false);
    const header = ["time_s", ...profile.channels.map((c) => `${c.key}_${c.unit.replace(/[^a-z%]/gi, "")}`)].join(",");
    const blob = new Blob([header + "\n" + rows.current.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${profile.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function toggleNight() {
    document.documentElement.dataset.theme = night ? "day" : "night";
    setNight(!night);
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
  // The guide replaces the empty gauges until the first connection with this car.
  const showFirstRun = !everLive && status !== "live";
  const label = selectionLabel(selection, profile);
  // Empty for a generic profile: "I have a Generic OBD-II" would read oddly in the AI question.
  const vehicleText = selection.make ? [label.title, label.detail].filter(Boolean).join(" ") : "";
  const rate = reads.current.length / 2;
  const recSeconds = recording ? Math.floor((now - recStart.current) / 1000) : 0;

  return (
    <main className={`shell${showFirstRun ? " is-first-run" : ""}`}>
      <header className="top">
        <div className="mark">
          <span className="mark-name">Openhood</span>
          <VehiclePicker
            profiles={PROFILES}
            selection={selection}
            profile={profile}
            disabled={status === "live" || status === "connecting"}
            onSelect={pickVehicle}
            openRequest={pickerRequest}
          />
        </div>
        <button className="quiet night" onClick={toggleNight}>
          {night ? "Day" : "Night"}
        </button>
        {!showFirstRun && (
          <div className="actions">
            <span className={`status status-${status}`}>
              <i />
              <span className="status-text">
                {status === "idle" && "Not connected"}
                {status === "connecting" && "Waking ECU…"}
                {status === "live" && `${source === "simulator" ? "Simulator" : "Live"} · ${rate.toFixed(0)} reads/s`}
                {status === "error" && "Stopped"}
              </span>
            </span>
            {status === "idle" || status === "error" ? (
              <span className="action-buttons">
                <button className="quiet" onClick={() => connect("simulator")}>
                  Simulator
                </button>
                <button onClick={() => connect("serial")} disabled={!serialOk} title={serialOk ? "" : "Web Serial not available here"}>
                  Connect cable
                </button>
              </span>
            ) : (
              <button onClick={disconnect} disabled={status === "connecting"}>
                Disconnect
              </button>
            )}
          </div>
        )}
      </header>

      {error && (
        <p className="notice" role="alert">
          {error}{" "}
          {source === "serial" && (
            <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink}>
              Send a test report
            </a>
          )}
        </p>
      )}

      {showFirstRun ? (
        <FirstRun
          vehicle={vehicleText}
          profile={profile}
          serialOk={serialOk}
          connecting={status === "connecting" ? source : null}
          onChangeCar={() => setPickerRequest((n) => n + 1)}
          onConnect={() => connect("serial")}
          onSimulator={() => connect("simulator")}
        />
      ) : (
        <>
          <FaultSummary faults={faults} pending={pending} readiness={readiness} explanations={profile.faults?.explanations} />
          <section className="grid">
            {profile.channels.map((c) => {
              const v = latest.current[c.key];
              const warn = isWarn(c, v);
              return (
                <div className={`cell${warn ? " warn" : ""}`} key={c.key}>
                  <div className="cell-head">
                    <span>{c.label}</span>
                    <span>{c.unit}</span>
                  </div>
                  {unavailable.has(c.key) ? (
                    <div className="value na" title="This car doesn't report this value">
                      n/a
                    </div>
                  ) : (
                    <div className="value">{v === undefined ? "—" : fmt(v, c.decimals)}</div>
                  )}
                  <Sparkline
                    points={history.current[c.key] ?? []}
                    now={now}
                    min={c.min}
                    max={c.max}
                    warn={c.warnAbove ?? c.warnBelow}
                  />
                </div>
              );
            })}
          </section>
        </>
      )}

      {!showFirstRun && (
        <>
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
          history={faultHistory}
          onRead={() => faultAction(false)}
          onClear={() => faultAction(true)}
          onFreezeFrame={(f) => session.current?.readFreezeFrame(f) ?? Promise.resolve(null)}
          onForgetHistory={forgetHistory}
          onExportHistory={exportHistory}
          onImportHistory={importHistory}
        />

        <div className="panel">
          <div className="panel-head">
            <h2>Log a drive</h2>
            <button className={recording ? "rec" : "quiet"} disabled={!live && !recording} onClick={toggleRecording}>
              {recording ? "Stop and save CSV" : "Start"}
            </button>
          </div>
          <p className="muted">
            {recording
              ? `Recording ${Math.floor(recSeconds / 60)}:${String(recSeconds % 60).padStart(2, "0")} · ${rows.current.length} rows at 10 Hz`
              : "Every channel, ten times a second, saved as CSV when you stop."}
          </p>
        </div>
      </section>

      <details className="log" onToggle={(e) => setLogOpen((e.target as HTMLDetailsElement).open)}>
        <summary>K-line traffic</summary>
        {logOpen && (
          <pre>
            {traffic.current
              .slice(-80)
              .map(
                (e) =>
                  `${(e.t / 1000).toFixed(3).padStart(9)}  ${e.dir === "tx" ? "→" : "←"}  ${hex(e.bytes)}${e.note ? `   ${e.note}` : ""}`,
              )
              .join("\n") || "Nothing yet."}
          </pre>
        )}
      </details>
      </>
      )}

      <p className="profile-info">
        Profile: {profile.name} · {profile.ecu} · K-line {profile.link.baudRate} baud
        {profile.status === "experimental" && <span className="tag">experimental</span>}{" "}
        <a href={`https://github.com/tuffjocke/openhood/tree/main/profiles/${profile.id}`}>How sure is this?</a>
      </p>

      <footer className="foot">
        <a href="https://github.com/tuffjocke/openhood">Open source on GitHub</a>
        <span className="foot-links">
          <a href="#" target="_blank" rel="noreferrer" onClick={fillReportLink} title="Opens a pre-filled GitHub issue">
            Send test report
          </a>
          <a href="https://github.com/tuffjocke/openhood/blob/main/docs/adding-a-vehicle.md">Add your car</a>
        </span>
      </footer>
    </main>
  );
}
