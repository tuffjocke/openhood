"use client";

import { useState } from "react";
import type { Fault, FaultInfo, Readiness, Urgency, Values, VehicleProfile } from "@/core/profile";

const URGENCY: Record<Urgency, string> = {
  ok: "Fine to drive",
  soon: "Fix soon",
  now: "Fix now",
};

/** The question a person can paste into any AI chat about one fault. */
export function aiQuestion(vehicle: string, fault: Fault, profile: VehicleProfile, values: Values): string {
  const readings = profile.channels
    .filter((c) => values[c.key] !== undefined)
    .map((c) => `${c.label.toLowerCase()} ${values[c.key].toFixed(c.decimals)} ${c.unit}`)
    .join(", ");
  const what = fault.code ? `fault code ${fault.code} (${fault.name})` : `the fault "${fault.name}"`;
  return [
    `I have a ${vehicle}. The engine computer reports ${what}.`,
    readings ? `Current readings: ${readings}.` : "",
    "I'm not a mechanic. What does this mean, how urgent is it, what are the most likely causes, and what should I check first?",
  ]
    .filter(Boolean)
    .join(" ");
}

function FaultRow({
  fault,
  info,
  vehicle,
  question,
}: {
  fault: Fault;
  info?: FaultInfo;
  vehicle: string;
  question: string;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(question);
      setCopied("yes");
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  const search = `https://www.google.com/search?q=${encodeURIComponent(`${vehicle} ${fault.code ?? fault.name}`)}`;

  return (
    <li>
      <details className="fault">
        <summary>
          {info && <span className={`urgency urgency-${info.urgency}`}>{URGENCY[info.urgency]}</span>}
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
            </>
          ) : (
            <p className="muted">No plain-language explanation for this one yet. Ask an AI or search:</p>
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

export function FaultPanel({
  profile,
  vehicle,
  values,
  live,
  busy,
  faults,
  readiness,
  onRead,
  onClear,
}: {
  profile: VehicleProfile;
  vehicle: string;
  values: Values;
  live: boolean;
  busy: boolean;
  faults: Fault[] | null;
  readiness: Readiness | null;
  onRead: () => void;
  onClear: () => void;
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
              question={aiQuestion(vehicle, fault, profile, values)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
