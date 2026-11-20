"use client";

import { useEffect, useState } from "react";
import type { Urgency } from "@/core/profile";
import { lookupCode, normaliseCode } from "@/profiles";

const URGENCY: Record<Urgency, string> = { ok: "Fine to drive", soon: "Fix soon", now: "Fix now" };

/** Type a code from a garage or a cheap reader and get it in plain words. No cable needed. */
export function CodeLookup() {
  const [input, setInput] = useState("");

  // Shareable links: openhood/#P0171 opens with that code filled in.
  useEffect(() => {
    let raw = "";
    try {
      raw = decodeURIComponent(location.hash.slice(1));
    } catch {
      return; // a mangled link: just start empty
    }
    const fromHash = normaliseCode(raw);
    if (lookupCode(fromHash)) {
      setInput(fromHash);
      document.getElementById("lookup")?.scrollIntoView();
    }
  }, []);

  const result = input ? lookupCode(input) : null;
  const typedEnough = normaliseCode(input).length >= 5;

  function onChange(v: string) {
    setInput(v);
    const r = lookupCode(v);
    history.replaceState(null, "", r ? `#${r.code}` : location.pathname + location.search);
  }

  return (
    <section className="band" id="lookup" aria-labelledby="lookup-title">
      <div className="band-text">
        <h2 id="lookup-title">Already have a code?</h2>
        <p>Type it. No adapter needed.</p>
      </div>
      <div className="panel">
        <label className="lookup-field">
          <span className="sr-only">Fault code</span>
          <input
            value={input}
            onChange={(e) => onChange(e.target.value)}
            placeholder="P0171"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={8}
          />
        </label>

        <div className="lookup-result" aria-live="polite">
          {!result && input && typedEnough && <p className="lookup-hint">Not a fault code. They look like P0420.</p>}
          {result?.info && (
            <div className="lookup-answer">
              <p className="lookup-code">
                {result.code}
                <span className={`urgency urgency-${result.info.urgency}`}>{URGENCY[result.info.urgency]}</span>
              </p>
              <h3>{result.info.title}</h3>
              <p>{result.info.plain}</p>
              <p className="fault-label">Common causes</p>
              <ul>
                {result.info.causes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {result.info.check && (
                <p>
                  <span className="fault-label">Check first </span>
                  {result.info.check}
                </p>
              )}
            </div>
          )}
          {result && !result.info && (
            <div className="lookup-answer">
              <p className="lookup-code">{result.code}</p>
              <h3>{result.title ?? "Not in our list yet"}</h3>
              <p>
                {result.code.charAt(1) === "1" || result.code.charAt(1) === "3"
                  ? "This is a manufacturer code: its meaning depends on the make. "
                  : "We haven't written a plain explanation for this one yet. "}
                Read your car with Openhood to see it in context, or search for your make and the code.
              </p>
              <a
                className="text-button"
                href={`https://www.google.com/search?q=${encodeURIComponent(result.code + " fault code")}`}
                target="_blank"
                rel="noreferrer"
              >
                Search the web for {result.code}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
