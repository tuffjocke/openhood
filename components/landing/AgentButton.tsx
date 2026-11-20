"use client";

import { useState } from "react";
import { readCarPrompt } from "@/core/add-car";

const CLI_DOCS = "https://github.com/tuffjocke/openhood/blob/main/docs/cli.md";

/**
 * The other way to read: copy a ready-made message for a coding agent (the Claude or Codex
 * desktop app on the computer that's plugged into the car). The agent sets Openhood up and reads
 * the car, so it works in any browser. Web versions of those agents can't reach an adapter.
 * A button on the steps page (the main one where the browser can't read a car itself).
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
        {state === "copied" ? "Copied" : "Copy the message"}
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
