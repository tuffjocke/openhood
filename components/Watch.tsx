"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Values } from "@/core/profile";
import { profileIn, UNIT_NAMES, UNITS, valuesIn, type Units } from "@/core/units";
import { LANG_NAMES, LANGS, type Lang } from "@/core/i18n";
import { emptyWatchState, WATCH_EVENTS, type WatchEvent, type WatchState } from "@/core/watch";
import { getProfile } from "@/profiles";
import { dialLayout, DialRow, GROUP_NAMES } from "./Dials";
import { FaultPanel } from "./FaultPanel";
import { EngineLight } from "./landing/EngineLight";
import { LiveChart, type Point } from "./LiveChart";
import { labelsIn, useLang, useT } from "./useLang";
import { useUnits } from "./useUnits";

const HISTORY_MS = 35_000;
const LOG_LINES = 300;
const nearBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 24;

/** The top-right corner of the cluster, as on the dashboard. */
const LINK_LINES: Record<string, string> = { simulator: "Demo car", kkl: "KKL cable, KWP2000", elm327: "ELM327 adapter" };

/**
 * The live view: what an agent reads through Openhood's MCP server, as it reads it. Served by the
 * MCP server itself on this computer (cli/watch-server.ts), which streams core/watch.ts events.
 * Only shows: nothing here can talk to the car, so there is no connect, clear or read button.
 */
export function Watch() {
  const t = useT();
  const [lang, setLang] = useLang();
  const [units, setUnits] = useUnits();
  const [view, setView] = useState<WatchState>(emptyWatchState);
  /** "open" once the stream answers, "lost" when the MCP server went away (the browser retries),
   *  "unreachable" when it never answered: this page wasn't opened from an MCP server. */
  const [stream, setStream] = useState<"waiting" | "open" | "lost" | "unreachable">("waiting");
  const [now, setNow] = useState(0);
  const [allReadings, setAllReadings] = useState(false);
  const history = useRef<Record<string, Point[]>>({});
  const traffic = useRef<string[]>([]);
  const log = useRef<HTMLPreElement>(null);
  /** Keep the traffic log at its newest line, unless the person scrolled up to read. */
  const follow = useRef(true);

  useEffect(() => {
    const es = new EventSource(WATCH_EVENTS);
    es.onopen = () => setStream("open");
    es.onerror = () => setStream((s) => (s === "open" || s === "lost" ? "lost" : "unreachable"));
    es.onmessage = (m) => {
      const e = JSON.parse(m.data as string) as WatchEvent;
      if (e.type === "state") {
        // A new connection starts the charts over; the same one (page reconnecting) keeps them.
        setView((old) => {
          if (old.profileId !== e.state.profileId || e.state.status === "connecting") history.current = {};
          return e.state;
        });
        traffic.current = e.traffic.slice(-LOG_LINES);
      } else if (e.type === "values") {
        const at = performance.now();
        for (const [k, v] of Object.entries(e.values)) {
          const h = (history.current[k] ??= []);
          h.push({ t: at, v });
          while (h.length && at - h[0].t > HISTORY_MS) h.shift();
        }
        setView((old) => ({ ...old, values: { ...old.values, ...e.values } }));
      } else if (e.type === "faults") {
        setView((old) => ({ ...old, faults: e.faults, pending: e.pending, readiness: e.readiness }));
      } else {
        traffic.current.push(e.line);
        if (traffic.current.length > LOG_LINES) traffic.current.shift();
      }
    };
    return () => es.close();
  }, []);

  // Repaint at 10 Hz, so the charts move on and new traffic shows.
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (follow.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [now]);

  const profile = view.profileId ? getProfile(view.profileId) : undefined;
  const shown = useMemo(() => (profile ? labelsIn(profileIn(profile, units), t) : undefined), [profile, units, t]);
  const show = (v: Values) => (profile ? valuesIn(profile, v, units) : v);
  const unavailable = useMemo(() => new Set(view.unavailable), [view.unavailable]);
  const latest = show(view.values);

  const status = stream === "lost" ? "error" : view.status === "connected" ? "live" : view.status === "connecting" ? "connecting" : view.status === "failed" ? "error" : "idle";
  const statusText =
    stream === "lost"
      ? "Lost the agent"
      : { idle: profile ? "Not connected" : "Waiting for the agent", connecting: "Waking the car…", connected: "Connected", failed: "Stopped" }[view.status];

  // No header: the status sits in the cluster's corner, or on its own line before there is one.
  const statusLight = (
    <span className={`status status-${status}`}>
      <i />
      <span className="status-text">{t(statusText)}</span>
    </span>
  );
  const linkLine = view.adapter ? t(LINK_LINES[view.adapter] ?? view.adapter) : "";

  return (
    <main className="shell dense">
      {(!shown || shown.channels.length === 0) && (
        <p className="watch-status">
          {t("Live view")} {statusLight}
        </p>
      )}

      {stream === "lost" && (
        <p className="notice" role="alert">
          {t("Lost the agent. Is it still running? This page will pick it up again by itself.")}
        </p>
      )}
      {stream === "unreachable" && (
        <p className="notice">{t("This page shows what an AI agent reads with Openhood. Open it from the link the agent gives you.")}</p>
      )}
      {view.status === "failed" && view.error && (
        <p className="notice" role="alert">
          {t("The car didn’t answer the agent:")} {view.error}
        </p>
      )}

      {!profile || !shown ? (
        stream === "open" && <p className="muted">{t("The agent hasn’t connected to a car yet.")}</p>
      ) : (
        <div className="live-body">
          {shown.channels.length > 0 && (
            <Cluster
              profile={shown}
              latest={latest}
              unavailable={unavailable}
              corner={
                <>
                  {linkLine && <span>{linkLine}</span>}
                  {statusLight}
                </>
              }
              faultCount={view.faults?.length ?? 0}
              points={(key) => {
                const h = history.current[key] ?? [];
                return units === "metric" ? h : h.map((p) => ({ t: p.t, v: show({ [key]: p.v })[key] }));
              }}
              now={now}
              allReadings={allReadings}
              setAllReadings={setAllReadings}
            />
          )}

          <section className="lower">
            {view.faults === null && profile.faults ? (
              <div className="panel" id="faults">
                <p className="muted">{t("The agent hasn’t read the fault codes yet.")}</p>
              </div>
            ) : (
              <FaultPanel
                profile={shown}
                vehicle=""
                values={latest}
                live={false}
                busy={false}
                faults={view.faults}
                pending={view.pending}
                readiness={view.readiness}
                history={[]}
                confirming={false}
                setConfirming={() => {}}
                onClear={() => {}}
                onFreezeFrame={async () => null}
                onForgetHistory={() => {}}
              />
            )}
            {/* Open by default: watching the conversation is half the point here. Newest at the bottom. */}
            <details className="log" open>
              <summary>{t("Traffic with the car")}</summary>
              <pre ref={log} onScroll={(e) => (follow.current = nearBottom(e.currentTarget))}>{traffic.current.slice(-120).join("\n") || t("Nothing yet.")}</pre>
            </details>
            <p className="profile-info">
              {t("Reading as:")} {profile.name}, {profile.ecu}
            </p>
          </section>
        </div>
      )}

      <footer className="foot">
        <span>{t("Provided as is. Use at your own risk, car parked.")}</span>
        <span className="foot-links">
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
        </span>
      </footer>
    </main>
  );
}

/** The binnacle, laid out as on the dashboard: dials, then every other reading as a chart. */
function Cluster({
  profile,
  latest,
  unavailable,
  corner,
  faultCount,
  points,
  now,
  allReadings,
  setAllReadings,
}: {
  profile: NonNullable<ReturnType<typeof getProfile>>;
  latest: Values;
  unavailable: Set<string>;
  /** The top-right corner: how the car is connected, and the status. */
  corner: React.ReactNode;
  faultCount: number;
  points: (key: string) => Point[];
  now: number;
  allReadings: boolean;
  setAllReadings: (all: boolean) => void;
}) {
  const t = useT();
  const { charts, groups } = dialLayout(profile);
  return (
    <section className="binnacle" aria-label={t("Live data")}>
      <div className="binnacle-corners">
        <span className="binnacle-start" />
        {faultCount > 0 ? (
          <span className="binnacle-lamp" role="img" aria-label={`${faultCount} ${t(faultCount === 1 ? "fault" : "faults")}`}>
            <EngineLight lit />
          </span>
        ) : (
          <span />
        )}
        <span className="binnacle-link">{corner}</span>
      </div>
      <DialRow profile={profile} values={latest} unavailable={unavailable} />
      {charts.length > 0 && (
        <>
          {groups.length > 0 && (
            <p className="chart-key">
              {groups.map((g) => (
                <span key={g} className={`group-${g}`}>
                  <i />
                  {t(GROUP_NAMES[g])}
                </span>
              ))}
            </p>
          )}
          <div className={`charts${allReadings ? " all" : ""}`}>
            {charts.map((c) => (
              <LiveChart key={c.key} channel={c} points={points(c.key)} now={now} value={latest[c.key]} unavailable={unavailable.has(c.key)} />
            ))}
          </div>
          {charts.length > 2 && (
            <button className="quiet show-all" aria-expanded={allReadings} onClick={() => setAllReadings(!allReadings)}>
              {t(allReadings ? "Show fewer" : "Show all")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
