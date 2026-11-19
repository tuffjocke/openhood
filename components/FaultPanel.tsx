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

function FaultRow({
  fault,
  info,
  vehicle,
  profile,
  values,
  pending,
  live,
  onFreezeFrame,
}: {
  fault: Fault;
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
  const question = aiQuestion(vehicle, fault, profile, values, {
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
          <span className="fault-title">{info?.title ?? fault.name}</span>
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
              {fault.code && (
                <p className="muted small">
                  Official name: {fault.code} {fault.name}
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
  onRead,
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
  onRead: () => void;
  onClear: () => void;
  onFreezeFrame: (f: Fault) => Promise<Values | null>;
  onForgetHistory: () => void;
  onExportHistory: () => void;
  onImportHistory: (file: File) => Promise<string>;
}) {
  const [confirming, setConfirming] = useState(false);
  const f = profile.faults;
  const done = readiness?.monitors.filter((m) => m.complete).length ?? 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Fault memory</h2>
        <div>
          <button className="quiet" disabled={!live || busy} onClick={onRead}>
            Read
          </button>
          <button
            className="quiet"
            disabled={!live || busy || !faults?.length || !f?.clear}
            onClick={() => setConfirming(true)}
          >
            Clear
          </button>
        </div>
      </div>

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
          {faults.map((fault) => (
            <FaultRow
              key={fault.id}
              fault={fault}
              info={f.explanations?.[fault.id]}
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
          <p className="fault-label pending-label">Pending, not confirmed yet</p>
          <p className="muted small">
            The car has noticed these but hasn&rsquo;t turned the engine light on. They may go away, or become real
            faults if they happen again.
          </p>
          <ol className="faults">
            {pending.map((fault) => (
              <FaultRow
                key={fault.id}
                fault={fault}
                info={f?.explanations?.[fault.id]}
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
