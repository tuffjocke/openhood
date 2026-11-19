"use client";

import { useEffect, useState } from "react";
import type { Urgency } from "@/core/profile";
import { EXAMPLE_CODES, lookupCode } from "@/profiles";
import { EngineLight } from "./EngineLight";

const URGENCY: Record<Urgency, string> = { ok: "Fine to drive", soon: "Fix soon", now: "Fix now" };

type Phase = "dark" | "lit" | "code" | "words";

/**
 * The signature moment: the engine light comes on, a fault code appears, and Openhood
 * turns it into plain words. Cycles through a few common codes. Without motion (reduced
 * motion preference) it shows each code fully and simply swaps every few seconds.
 */
export function Decoder() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("dark");
  const [typed, setTyped] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const code = EXAMPLE_CODES[i % EXAMPLE_CODES.length];
  const found = lookupCode(code)!;
  const info = found.info!;

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    if (still) {
      setPhase("words");
      setTyped(code.length);
      at(6000, () => setI((n) => n + 1));
    } else {
      setPhase("dark");
      setTyped(0);
      at(350, () => setPhase("lit"));
      at(900, () => setPhase("code"));
      for (let c = 1; c <= code.length; c++) at(900 + c * 90, () => setTyped(c));
      at(1550, () => setPhase("words"));
      at(7600, () => setI((n) => n + 1));
    }
    return () => timers.forEach(clearTimeout);
  }, [i, still, code]);

  const showWords = phase === "words";

  return (
    <figure className="decoder cluster" aria-label="Example: a fault code explained in plain words">
      <div className="decoder-top">
        <EngineLight lit={phase !== "dark"} />
        <span className="decoder-code" aria-label={code}>
          {code.slice(0, typed)}
          <span className={`caret${phase === "code" ? " on" : ""}`} />
        </span>
      </div>
      <div className={`decoder-words${showWords ? " in" : ""}`} aria-live="polite">
        <p className="decoder-title">{info.title}</p>
        <p className="decoder-plain">{info.plain}</p>
        <p className="decoder-meta">
          <span className={`urgency urgency-${info.urgency}`}>{URGENCY[info.urgency]}</span>
          <span>Check first: {info.check}</span>
        </p>
      </div>
      <figcaption>
        <span>Your car says {code}.</span> <span>Openhood says what it means.</span>
      </figcaption>
    </figure>
  );
}
