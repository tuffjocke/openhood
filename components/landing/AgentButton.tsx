"use client";

import { useState } from "react";
import { readCarPrompt } from "@/core/add-car";

const CLI_DOCS = "https://github.com/tuffjocke/openhood/blob/main/docs/cli.md";

/**
 * The second way to read: copy a ready-made message for a coding agent (the Claude or Codex
 * desktop app on the computer that's plugged into the car). The agent sets Openhood up and reads
 * the car, so it works in any browser. Web versions of those agents can't reach an adapter.
 */
export function AgentButton({ car, primary }: { car: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const text = readCarPrompt(car);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("manual"); // clipboard blocked: show the message so it can be selected by hand
    }
  }

  return (
    <>
      <button className={primary ? "primary big" : "ghost big"} onClick={copy}>
        {state === "copied" ? "Copied" : "Or let an AI agent read it"}
      </button>
      {state !== "idle" && (
        <p className="actions-hint" aria-live="polite">
          {state === "copied" ? "Paste it" : "Copy this"} into a new chat in the{" "}
          <a href="https://claude.com/download">Claude</a> or <a href="https://openai.com/codex">Codex</a> desktop app, on
          the computer you plugged in. Not the web version. <a href={CLI_DOCS}>How it works</a>
        </p>
      )}
      {state === "manual" && <pre className="prompt-fallback">{text}</pre>}
    </>
  );
}
