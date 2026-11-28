"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CarCheck } from "@/core/checks";
import type { TestRun } from "@/core/test-history";
import type { Values } from "@/core/profile";
import { profileIn, UNIT_NAMES, UNITS, valuesIn, type Units } from "@/core/units";
import { LANG_NAMES, LANGS, type Lang } from "@/core/i18n";
import {
  emptyWatchState,
  TOKEN_HEADER,
  WATCH_COMMAND,
  WATCH_EVENTS,
  type WatchCheck,
  type WatchCommand,
  type WatchEvent,
  type WatchState,
  type WatchStep,
  type WatchTest,
} from "@/core/watch";
import { getProfile } from "@/profiles";
import { Dial } from "./Dial";
import { dialLayout, DialRow } from "./Dials";
import { FaultPanel } from "./FaultPanel";
import { EngineLight } from "./landing/EngineLight";
import { LiveChart, type Point } from "./LiveChart";
import { Findings, runDate, TestHistory } from "./TestHistory";
import { labelsIn, useLang, useT } from "./useLang";
import { useUnits } from "./useUnits";

const HISTORY_MS = 35_000;
const LOG_LINES = 300;
const nearBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 24;

/** The top-right corner of the cluster, as on the dashboard. */
const LINK_LINES: Record<string, string> = { simulator: "Demo car", kkl: "KKL cable, KWP2000", elm327: "ELM327 adapter" };

/** A running check with no reading for this long says so, and greys its instruments. */
const QUIET_MS = 3000;

/**
 * The live view: what an agent reads through Openhood's MCP server, as it reads it. Served by the
 * MCP server itself on this computer (cli/watch-server.ts), which streams core/watch.ts events.
 * Openhood's test runs from here too (issue #37): the steps, what to do, Start, Stop, Skip and
 * Reconnect, sent back as core/watch.ts commands. All read-only: no clear, no raw requests.
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
  /** When the running check started, on this page's clock. */
  const checkStart = useRef(0);
  const traffic = useRef<string[]>([]);
  /** The token commands need, from the stream: only this page can read it. */
  const token = useRef<string | null>(null);
  /** When the last reading came in, on this page's clock. */
  const lastValues = useRef(0);
  /** Why the page's own last command didn't go through. */
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /** The check running now, as last seen on the stream. */
  const following = useRef<string | null>(null);
  /** The test step picked on the page; by default the next one to do. */
  const [picked, setPicked] = useState<string | null>(null);
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
        // A check that just started, whoever started it: follow it, whatever step was picked.
        const c = e.state.check;
        const runningId = c && !c.findings ? c.id : null;
        if (runningId && runningId !== following.current) setPicked(null);
        following.current = runningId;
        // A new connection starts the charts over; the same one (page reconnecting) keeps them.
        setView((old) => {
          if (old.profileId !== e.state.profileId || e.state.status === "connecting") history.current = {};
          const c = e.state.check;
          if (c && !c.findings && (old.check?.id !== c.id || old.check.findings)) checkStart.current = performance.now() - c.elapsedMs;
          return e.state;
        });
        traffic.current = e.traffic.slice(-LOG_LINES);
      } else if (e.type === "control") {
        token.current = e.token;
      } else if (e.type === "values") {
        const at = performance.now();
        lastValues.current = at;
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

  const status = stream === "lost" ? "error" : view.status === "connected" ? "live" : view.status === "connecting" ? "connecting" : view.status === "failed" || view.status === "lost" ? "error" : "idle";
  const statusText =
    stream === "lost"
      ? "Lost the agent"
      : { idle: profile ? "Not connected" : "Waiting for the agent", connecting: "Waking the car…", connected: "Connected", failed: "Stopped", lost: "Lost the car" }[view.status];

  // No header: the status sits in the cluster's corner, or on its own line before there is one.
  const statusLight = (
    <span className={`status status-${status}`}>
      <i />
      <span className="status-text">{t(statusText)}</span>
    </span>
  );
  const linkLine = view.adapter ? t(LINK_LINES[view.adapter] ?? view.adapter) : "";
  const checkDef = view.check ? profile?.checks?.find((c) => c.id === view.check!.id) : undefined;
  const canSend = stream === "open" && token.current !== null;

  /** Send one test command to the server this page came from. */
  async function send(c: WatchCommand) {
    if (!token.current) return;
    setSending(true);
    try {
      const r = await fetch(WATCH_COMMAND, {
        method: "POST",
        headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token.current },
        body: JSON.stringify(c),
      });
      setSendError(r.ok ? null : (await r.text()).trim());
    } catch {
      setSendError("Openhood isn\u2019t answering. Is it still running?");
    } finally {
      setSending(false);
    }
  }

  const running = !!view.check && !view.check.findings;
  const quietFor = running && lastValues.current ? now - Math.max(lastValues.current, checkStart.current) : 0;
  const quiet = view.status === "connected" && quietFor > QUIET_MS;
  const problem = sendError ?? view.notice;
  // How the connection is, in one line, with the one thing to do about it.
  const banner = (
    <>
      {stream === "lost" && (
        <p className="notice" role="alert">
          {t("Lost the agent. Is it still running? This page will pick it up again by itself.")}
        </p>
      )}
      {(view.status === "lost" || view.status === "failed") && (
        <p className="notice conn-banner" role="alert">
          <span>{view.status === "lost" ? t("The car stopped answering.") : <>{t("The car didn\u2019t answer:")} {view.error}</>}</span>
          {canSend && view.test && (
            <button className="primary" onClick={() => send({ action: "reconnect" })} disabled={sending}>
              {t("Reconnect")}
            </button>
          )}
        </p>
      )}
      {view.status === "connecting" && view.test && <p className="notice conn-banner">{t("Connecting to the car…")}</p>}
      {quiet && (
        <p className="notice conn-banner" role="alert">
          {t("No answer from the car for {n} s.", { n: Math.floor(quietFor / 1000) })}
        </p>
      )}
      {problem && <p className="notice">{t(problem)}</p>}
    </>
  );

  // While a check runs, the page is only the check: what to do is the one thing on screen.
  if (view.check && !view.check.findings && profile && shown) {
    return (
      <main className="shell dense check-focus">
        {banner}
        <CheckFocus
          quiet={quiet}
          onStop={canSend ? () => send({ action: "stop" }) : undefined}
          check={view.check}
          def={checkDef}
          profile={shown}
          seconds={(now - checkStart.current) / 1000}
          latest={latest}
          toShown={(k, v) => show({ [k]: v })[k]}
          unavailable={unavailable}
          points={(key) => {
            const h = history.current[key] ?? [];
            return units === "metric" ? h : h.map((p) => ({ t: p.t, v: show({ [key]: p.v })[key] }));
          }}
          now={now}
        />
      </main>
    );
  }

  return (
    <main className="shell dense">
      {(!shown || shown.channels.length === 0) && (
        <p className="watch-status">
          {t("Live view")} {statusLight}
        </p>
      )}

      {stream === "unreachable" && (
        <p className="notice">{t("This page shows what an AI agent reads with Openhood. Open it from the link the agent gives you.")}</p>
      )}
      {banner}

      {view.test && profile ? (
        <TestPanel
          test={view.test}
          earlier={view.history?.runs ?? []}
          saving={!!view.history?.saving}
          check={view.check}
          picked={picked}
          onPick={setPicked}
          canSend={canSend && view.status === "connected"}
          sending={sending}
          send={send}
        />
      ) : (
        view.check && profile && <CheckCard check={view.check} />
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
            {!!view.history?.runs.length && (
              <TestHistory
                runs={view.history.runs}
                saving={view.history.saving}
                deleteHint={t("Delete them all with: {command}", { command: "npx -y openhood@latest history --delete" })}
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

/** A finished test check (core/checks.ts) over the binnacle: what it found, one dot per finding. */
function CheckCard({ check }: { check: WatchCheck }) {
  const t = useT();
  return (
    <section className="check" aria-live="polite">
      <p className="check-head">
        <span className="check-title">{t(check.title)}</span>
        <span className="check-time">{check.findings && t("Done")}</span>
      </p>
      {check.findings ? (
        <Findings findings={check.findings} />
      ) : (
        <p className="check-ask">{check.ask}</p>
      )}
    </section>
  );
}

/**
 * A running test check, as the whole page: what to do and the time left, then the check's readings
 * on the same instruments as the live screen (dials stay dials, charts stay charts). A check with
 * steps (the rev test, the pedals) shows the one thing to do now over the instruments, moved on by
 * the runtime as the car's readings show each step done, and a yellow mark on the dial where to take
 * it. A step to hold counts down on this page's clock from when the reading became right.
 */
function CheckFocus({
  quiet,
  onStop,
  check,
  def,
  profile,
  seconds,
  latest,
  toShown,
  unavailable,
  points,
  now,
}: {
  /** No reading for a while: the instruments are greyed. */
  quiet: boolean;
  /** Stop the check, when this page can send commands. */
  onStop?: () => void;
  check: WatchCheck;
  def?: CarCheck;
  /** In the person's units. */
  profile: NonNullable<ReturnType<typeof getProfile>>;
  seconds: number;
  latest: Values;
  /** A metric value in the person's units (the pacer's targets are metric, like the profile). */
  toShown: (key: string, v: number) => number;
  unavailable: Set<string>;
  points: (key: string) => Point[];
  now: number;
}) {
  const t = useT();
  const left = Math.max(0, Math.ceil(check.seconds - seconds));
  // The one thing to do now, moved on by the car's readings (core/checks.ts steps), not a clock.
  const step = check.step ?? null;
  const holding = step?.hold && step.since !== null ? Math.max(1, Math.ceil(step.hold - (seconds - step.since))) : null;
  const layout = dialLayout(profile);
  const watch = def?.watch ?? [];
  const dials = layout.dials.filter((d) => watch.includes(d.channel.key));
  // Everything else it watches as a chart, the battery too (on the live screen it's a bar in a dial).
  const charts = watch.flatMap((k) => (dials.some((d) => d.channel.key === k) ? [] : profile.channels.filter((c) => c.key === k)));
  return (
    <section className="check" aria-live="polite">
      <p className="check-head">
        <span className="check-title">{t(check.title)}</span>
        <span className="check-time">{check.seconds > 0 ? t("{n} s left", { n: left }) : ""}</span>
      </p>
      <p className="check-ask">{check.ask}</p>
      {(dials.length > 0 || charts.length > 0 || step) && (
        <div className={`binnacle check-instruments${quiet ? " quiet" : ""}`}>
          {step && (
            <p className={`check-cue${holding ? " holding" : ""}`}>
              {holding ? `${t("Hold it")} ${holding}` : t(step.say)}
              {step.rounds > 1 && <span className="check-round">{t("{n} of {total}", { n: step.round, total: step.rounds })}</span>}
            </p>
          )}
          {dials.length > 0 && (
            <div className="dials">
              {dials.map(({ channel }) => (
                <Dial
                  key={channel.key}
                  channel={channel}
                  big={channel.key === step?.channel || dials.length === 1}
                  value={latest[channel.key]}
                  unavailable={unavailable.has(channel.key)}
                  target={step?.target !== undefined && channel.key === step.channel ? toShown(channel.key, step.target) : undefined}
                />
              ))}
            </div>
          )}
          {charts.length > 0 && (
            <div className="charts all">
              {charts.map((c) => (
                <LiveChart key={c.key} channel={c} points={points(c.key)} now={now} value={latest[c.key]} unavailable={unavailable.has(c.key)} />
              ))}
            </div>
          )}
        </div>
      )}
      {onStop && (
        <div className="check-actions">
          <button className="stop big" onClick={onStop}>
            {t("Stop")}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Openhood's test on the live view: every step with how it went, and the step at hand with what to
 * do and one button. The person can run the whole test from here; the agent sees the same results.
 */
function TestPanel({
  test,
  earlier,
  saving,
  check,
  picked,
  onPick,
  canSend,
  sending,
  send,
}: {
  test: WatchTest;
  /** This car's earlier runs, newest first, to compare a check with the last time. */
  earlier: TestRun[];
  /** This run is being saved on this computer. */
  saving: boolean;
  /** The check running or last run. */
  check: WatchCheck | null;
  picked: string | null;
  onPick: (id: string | null) => void;
  /** Connected, and this page can send commands. */
  canSend: boolean;
  sending: boolean;
  send: (c: WatchCommand) => void;
}) {
  const t = useT();
  const next = test.steps.find((s) => s.result === null);
  // Just run: its findings stay up until the person moves on. Otherwise the picked step, or the next one.
  const shownId = picked ?? (check?.findings ? check.id : next?.id);
  const step = test.steps.find((s) => s.id === shownId);
  const justRun = !!step && check?.id === step.id && !!check.findings;
  // What's left: the next step not done after this one, else any left before it.
  const after = step && (test.steps.slice(test.steps.indexOf(step) + 1).find((s) => s.result === null) ?? test.steps.find((s) => s.result === null && s !== step));
  // The same check the last time it ran on this car, if it has.
  const lastRun = step && earlier.find((r) => r.checks.some((c) => c.id === step.id));
  const last = lastRun?.checks.find((c) => c.id === step?.id);

  return (
    <section className="check test" aria-live="polite">
      <ol className="test-steps" aria-label={t("Openhood's test")}>
        {test.steps.map((s) => (
          <li key={s.id} className={`step-${s.result ?? "todo"}${s.id === shownId ? " now" : ""}`}>
            <button className="link-button" onClick={() => onPick(s.id)} aria-current={s.id === shownId ? "step" : undefined}>
              {t(s.title)}
            </button>
          </li>
        ))}
      </ol>

      {!step ? (
        <>
          <p className="check-head">
            <span className="check-title">{t("All done")}</span>
          </p>
          {test.reportUrl && (
            <div className="check-actions">
              <a className="button primary" href={test.reportUrl} target="_blank" rel="noreferrer">
                {t("Send the test report")}
              </a>
            </div>
          )}
          <p className="check-note">{t("No fault codes go into the report. It opens as a public GitHub issue for you to check first.")}</p>
          {saving && <p className="check-note">{t("This test is saved on this computer only.")}</p>}
        </>
      ) : justRun && check?.findings ? (
        <>
          <p className="check-head">
            <span className="check-title">{t(step.title)}</span>
            <span className="check-time">{t("Done")}</span>
          </p>
          <Findings findings={check.findings} />
          {lastRun && last && (
            <details className="check-last">
              <summary>{t("Last time, {date}", { date: runDate(last.at) })}</summary>
              <Findings findings={last.findings} />
            </details>
          )}
          <div className="check-actions">
            {after ? (
              <button className="primary" onClick={() => onPick(after.id)}>
                {t("Next: {step}", { step: t(after.title) })}
              </button>
            ) : (
              <button className="primary" onClick={() => onPick("")}>
                {t("Finish")}
              </button>
            )}
            <button className="quiet" disabled={!canSend || sending} onClick={() => send({ action: "run", id: step.id })}>
              {t("Run again")}
            </button>
          </div>
        </>
      ) : (
        <StepToDo
          step={step}
          safety={step.engineRunning ? test.safety : null}
          canSend={canSend}
          sending={sending}
          send={send}
          onSkip={() => (send({ action: "skip", id: step.id }), onPick(after?.id ?? ""))}
        />
      )}
    </section>
  );
}

/** One step before it runs: what to do, the safety note for an engine step, and Start. */
function StepToDo({
  step,
  safety,
  canSend,
  sending,
  send,
  onSkip,
}: {
  step: WatchStep;
  safety: string | null;
  canSend: boolean;
  sending: boolean;
  send: (c: WatchCommand) => void;
  onSkip: () => void;
}) {
  const t = useT();
  return (
    <>
      <p className="check-head">
        <span className="check-title">{t(step.title)}</span>
        <span className="check-time">{step.seconds > 0 ? t("{n} s", { n: step.seconds }) : ""}</span>
      </p>
      <p className="check-ask">{step.ask}</p>
      {safety && <p className="check-safety">{safety}</p>}
      {step.engineRunning && <p className="check-note">{t("Start the engine first. Press Start once it\u2019s running.")}</p>}
      <div className="check-actions">
        <button className="primary" disabled={!canSend || sending} onClick={() => send({ action: "run", id: step.id })}>
          {t(step.result ? "Run again" : "Start")}
        </button>
        <button className="link-button" disabled={!canSend || sending} onClick={onSkip}>
          {t("Skip")}
        </button>
      </div>
    </>
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
  const { charts } = dialLayout(profile);
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
