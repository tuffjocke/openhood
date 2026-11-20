"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/core/history";
import type { Fault, FaultInfo, Readiness, Urgency, Values, VehicleProfile } from "@/core/profile";

const URGENCY: Record<Urgency, string> = {
  ok: "Fine to drive",
  soon: "Fix soon",
  now: "Fix now",
};

/** "rpm 2450 rpm, coolant 34 °C" for the values a profile knows about. */
function describeValues(profile: VehicleProfile, values: Values) {
  return profile.channels
    .filter((c) => values[c.key] !== undefined)
    .map((c) => `${c.label.toLowerCase()} ${values[c.key].toFixed(c.decimals)} ${c.unit}`)
    .join(", ");
}

/** The question a person can paste into any AI chat about one fault. */
export function aiQuestion(
  vehicle: string,
  fault: Fault,
  profile: VehicleProfile,
  values: Values,
  opts: { pending?: boolean; snapshot?: Values | null } = {},
): string {
  const readings = describeValues(profile, values);
  const snapshot = opts.snapshot ? describeValues(profile, opts.snapshot) : "";
  const what = fault.code ? `fault code ${fault.code} (${fault.name})` : `the fault "${fault.name}"`;
  return [
    vehicle ? `I have a ${vehicle}.` : "",
    `The engine computer reports ${what}${opts.pending ? " as pending (not confirmed yet)" : ""}.`,
    snapshot ? `When it was set: ${snapshot}.` : "",
    readings ? `Current readings: ${readings}.` : "",
    "I'm not a mechanic. What does this mean, how urgent is it, what are the most likely causes, and what should I check first?",
  ]
    .filter(Boolean)
    .join(" ");
}

type Snapshot = Values | null | "loading" | undefined;

const RANK: Record<Urgency, number> = { ok: 0, soon: 1, now: 2 };

/** Faults that share an explanation (same sensor, stored and active) shown as one row. */
export interface FaultGroup {
  key: string;
  faults: Fault[];
  info?: FaultInfo;
}

export function groupFaults(faults: Fault[], explanations?: Record<string, FaultInfo>): FaultGroup[] {
  const groups: FaultGroup[] = [];
  const byKey = new Map<string, FaultGroup>();
  for (const f of faults) {
    const info = explanations?.[f.id];
    const key = info ? `info:${info.title}` : `id:${f.id}`;
    const g = byKey.get(key);
    if (g) {
      g.faults.push(f);
      if (info && g.info && RANK[info.urgency] > RANK[g.info.urgency]) g.info = info;
    } else {
      const ng = { key, faults: [f], info };
      byKey.set(key, ng);
      groups.push(ng);
    }
  }
  // Most urgent first; faults without an explanation last. Equal ones keep the car's order.
  const rank = (g: FaultGroup) => (g.info ? RANK[g.info.urgency] : -1);
  return groups.sort((a, b) => rank(b) - rank(a));
}

/** One line that sums up the faults, and how serious the worst one is. Used as the panel's heading. */
export function faultSummary(
  faults: Fault[] | null,
  pending: Fault[] | null,
  readiness: Readiness | null,
  explanations?: Record<string, FaultInfo>,
): { text: string; level: "now" | "soon" | "ok" | "none" } {
  if (faults === null) return { text: "Faults", level: "none" };
  const groups = groupFaults(faults, explanations);
  const count = (u: Urgency) => groups.filter((g) => g.info?.urgency === u).length;
  const now = count("now");
  const soon = count("soon");
  const level = now || readiness?.milOn ? "now" : soon ? "soon" : groups.length ? "ok" : "none";
  const parts: string[] = [];
  if (!groups.length) parts.push("No faults");
  else {
    parts.push(`${groups.length} ${groups.length === 1 ? "fault" : "faults"}`);
    if (now) parts.push(`${now} to fix now`);
    else if (soon) parts.push(`${soon} to fix soon`);
    else parts.push("fine to drive");
  }
  if (pending?.length) parts.push(`${pending.length} pending`);
  return { text: `${parts.join(", ")}.`, level };
}

function FaultRow({
  group,
  info,
  vehicle,
  profile,
  values,
  pending,
  live,
  onFreezeFrame,
}: {
  group: Fault[];
  info?: FaultInfo;
  vehicle: string;
  profile: VehicleProfile;
  values: Values;
  pending?: boolean;
  live: boolean;
  onFreezeFrame?: (f: Fault) => Promise<Values | null>;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(undefined);
  const fault = group[0];
  const states = [...new Set(group.map((f) => f.state).filter(Boolean))].join(" · ");
  const asked: Fault =
    group.length === 1 ? fault : { ...fault, name: group.map((f) => (f.code ? `${f.code} ${f.name}` : f.name)).join("; ") };
  const question = aiQuestion(vehicle, asked, profile, values, {
    pending,
    snapshot: snapshot === "loading" ? null : snapshot,
  });

  function onToggle(e: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!e.currentTarget.open || snapshot !== undefined || !onFreezeFrame || !live || pending) return;
    setSnapshot("loading");
    onFreezeFrame(fault).then(setSnapshot, () => setSnapshot(null));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(question);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  const search = `https://www.google.com/search?q=${encodeURIComponent(`${vehicle} ${fault.code ?? fault.name}`.trim())}`;

  return (
    <li>
      <details className="fault" onToggle={onToggle}>
        <summary>
          {pending ? (
            <span className="urgency">Pending</span>
          ) : (
            info && <span className={`urgency urgency-${info.urgency}`}>{URGENCY[info.urgency]}</span>
          )}
          {fault.code && <span className="fault-code">{fault.code}</span>}
          <span className="fault-title">
            {info?.title ?? fault.name}
            {states && <span className="fault-state">{states}</span>}
          </span>
        </summary>
        <div className="fault-body">
          {info ? (
            <>
              <p>{info.plain}</p>
              <p className="fault-label">Common causes</p>
              <ul>
                {info.causes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {info.check && (
                <p>
                  <span className="fault-label">Check first </span>
                  {info.check}
                </p>
              )}
              {(fault.code || group.length > 1) && (
                <p className="muted small">
                  Official {group.length > 1 ? "names" : "name"}:{" "}
                  {group.map((f) => [f.code, f.name].filter(Boolean).join(" ")).join("; ")}
                </p>
              )}
              <SnapshotView snapshot={snapshot} profile={profile} />
            </>
          ) : (
            <>
              <p className="muted">No plain-language explanation for this one yet. Ask an AI or search:</p>
              <SnapshotView snapshot={snapshot} profile={profile} />
            </>
          )}
          <div className="fault-actions">
            <button className="quiet" onClick={copy}>
              {copied === "yes" ? "Copied" : "Copy question for an AI"}
            </button>
            <a className="quiet-link" href={search} target="_blank" rel="noreferrer">
              Search the web
            </a>
          </div>
          {copied === "failed" && <pre className="copy-fallback">{question}</pre>}
        </div>
      </details>
    </li>
  );
}

function SnapshotView({ snapshot, profile }: { snapshot: Snapshot; profile: VehicleProfile }) {
  if (snapshot === undefined || snapshot === null) return null;
  if (snapshot === "loading") return <p className="muted small">Reading what the car stored when this was set…</p>;
  return (
    <div className="snapshot">
      <p className="fault-label">When it was set</p>
      <dl>
        {profile.channels
          .filter((c) => snapshot[c.key] !== undefined)
          .map((c) => (
            <div key={c.key}>
              <dt>{c.label}</dt>
              <dd>
                {snapshot[c.key].toFixed(c.decimals)} <span>{c.unit}</span>
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function HistoryView({
  history,
  explanations,
  onForget,
  onExport,
  onImport,
}: {
  history: HistoryEntry[];
  explanations?: Record<string, FaultInfo>;
  onForget: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<string>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <details className="readiness history">
      <summary>
        History ·{" "}
        {history.length ? (
          <>
            <strong>{history.length}</strong> {history.length === 1 ? "fault" : "faults"} seen on this car
          </>
        ) : (
          "nothing yet for this car"
        )}
      </summary>
      {history.length > 0 && (
        <ul>
          {history.map((e) => (
            <li key={e.id}>
              <span>
                {e.code && <span className="fault-code">{e.code} </span>}
                {explanations?.[e.id]?.title ?? e.name}
                {e.pendingOnly && <span className="muted"> · only pending</span>}
              </span>
              <span className="done">
                {e.daysSeen === 1 ? fmtDate(e.lastSeen) : `${e.daysSeen} days, last ${fmtDate(e.lastSeen)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        Kept in this browser only. Faults that keep coming back are worth fixing even if they clear themselves.
      </p>
      <div className="history-actions">
        <button className="link-button" onClick={onExport}>
          Export all cars
        </button>
        <label className="link-button">
          Import
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) setMessage(await onImport(file));
            }}
          />
        </label>
        {history.length > 0 && (
          <button className="link-button" onClick={onForget}>
            Forget this car
          </button>
        )}
      </div>
      {message && <p className="small">{message}</p>}
    </details>
  );
}

export function FaultPanel({
  profile,
  vehicle,
  values,
  live,
  busy,
  faults,
  pending,
  readiness,
  history,
  confirming,
  setConfirming,
  onClear,
  onFreezeFrame,
  onForgetHistory,
  onExportHistory,
  onImportHistory,
}: {
  profile: VehicleProfile;
  vehicle: string;
  values: Values;
  live: boolean;
  busy: boolean;
  faults: Fault[] | null;
  pending: Fault[] | null;
  readiness: Readiness | null;
  history: HistoryEntry[];
  /** The "really clear?" question is open. The button that opens it lives in the dashboard's tool row. */
  confirming: boolean;
  setConfirming: (open: boolean) => void;
  onClear: () => void;
  onFreezeFrame: (f: Fault) => Promise<Values | null>;
  onForgetHistory: () => void;
  onExportHistory: () => void;
  onImportHistory: (file: File) => Promise<string>;
}) {
  const f = profile.faults;
  const done = readiness?.monitors.filter((m) => m.complete).length ?? 0;

  return (
    <div className="panel" id="faults">
      <h2 className="section-title">Fault codes</h2>
      {confirming && (
        <div className="confirm" role="alertdialog" aria-label="Clear fault codes?">
          <p>
            Clearing only erases the codes, it doesn&rsquo;t fix anything. If a code comes back, the fault is still
            there.
          </p>
          {f?.clearResetsReadiness && (
            <p>
              It also resets the car&rsquo;s emissions self-tests. Until they have run again, which usually takes a few
              days of mixed driving, the car can fail an emissions inspection.
            </p>
          )}
          <div className="confirm-actions">
            <button
              onClick={() => {
                setConfirming(false);
                onClear();
              }}
            >
              Clear codes
            </button>
            <button className="quiet" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {readiness && (
        <details className="readiness">
          <summary>
            Engine light <strong className={readiness.milOn ? "on" : ""}>{readiness.milOn ? "on" : "off"}</strong>
            {readiness.monitors.length > 0 && (
              <>
                {" "}
                · Emissions self-tests{" "}
                <strong>
                  {done} of {readiness.monitors.length} done
                </strong>
              </>
            )}
          </summary>
          <ul>
            {readiness.monitors.map((m) => (
              <li key={m.name}>
                <span>{m.name}</span>
                <span className={m.complete ? "done" : "pending"}>{m.complete ? "done" : "not yet run"}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            Self-tests run by themselves during normal driving. All done means the car is ready for an emissions test.
          </p>
        </details>
      )}

      {!f ? (
        <p className="muted">This profile can&rsquo;t read faults yet.</p>
      ) : faults === null ? (
        <p className="muted">{live ? "Reading…" : "Connect to read stored faults."}</p>
      ) : faults.length === 0 ? (
        <p className="muted">No stored faults.</p>
      ) : (
        <ol className="faults">
          {groupFaults(faults, f.explanations).map((g) => (
            <FaultRow
              key={g.key}
              group={g.faults}
              info={g.info}
              vehicle={vehicle}
              profile={profile}
              values={values}
              live={live}
              onFreezeFrame={f.freezeFrame ? onFreezeFrame : undefined}
            />
          ))}
        </ol>
      )}

      {pending && pending.length > 0 && (
        <>
          <p className="fault-label pending-label" title="The car has noticed these but hasn't turned the engine light on. They may go away, or become real faults if they happen again.">
            Pending, not confirmed yet
          </p>
          <ol className="faults">
            {groupFaults(pending, f?.explanations).map((g) => (
              <FaultRow
                key={g.key}
                group={g.faults}
                info={g.info}
                vehicle={vehicle}
                profile={profile}
                values={values}
                live={live}
                pending
              />
            ))}
          </ol>
        </>
      )}

      {f && (
        <HistoryView
          history={history}
          explanations={f.explanations}
          onForget={onForgetHistory}
          onExport={onExportHistory}
          onImport={onImportHistory}
        />
      )}
    </div>
  );
}
