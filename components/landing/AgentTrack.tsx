"use client";

import { useState } from "react";
import { readCarPrompt } from "@/core/add-car";

const CLI_DOCS = "https://github.com/tuffjocke/openhood/blob/main/docs/cli.md";

/** A block of text with a copy button. Falls back to selecting the text if the clipboard is blocked. */
function Copyable({ text, label, collapsed }: { text: string; label: string; collapsed?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!collapsed);
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard blocked: show the text and select it, so it can be copied by hand.
      setOpen(true);
      const pre = e.currentTarget.closest(".copyable")?.querySelector("pre");
      if (pre) setTimeout(() => window.getSelection()?.selectAllChildren(pre), 0);
    }
  }
  return (
    <div className={`copyable${open ? "" : " folded"}`}>
      <div className="copyable-head">
        <button onClick={copy}>{copied ? "Copied" : "Copy message"}</button>
        {collapsed && (
          <button className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? "Hide it" : "Read it first"}
          </button>
        )}
      </div>
      <pre aria-label={label}>{text}</pre>
    </div>
  );
}

/**
 * The second way in: a coding agent in a desktop app (Claude or Codex) on the person's own computer
 * sets Openhood up and reads the car. One message to paste, no terminal. Web versions of these
 * agents run in the cloud and can't reach a USB or Bluetooth adapter, so we say so.
 */
export function AgentTrack({ car }: { car: string }) {
  return (
    <div className="agent">
      <ol className="agent-steps">
        <li>
          <div>
            <h3>
              Open the <a href="https://claude.com/download">Claude</a> or <a href="https://openai.com/codex">Codex</a>{" "}
              desktop app on your computer
            </h3>
            <p>Not the web version: it can&rsquo;t reach the adapter.</p>
          </div>
        </li>
        <li>
          <div>
            <h3>Plug in, ignition on</h3>
          </div>
        </li>
        <li>
          <div>
            <h3>Paste this into a new chat</h3>
            <Copyable text={readCarPrompt(car)} label="Message for your AI agent" collapsed />
          </div>
        </li>
      </ol>
      <p className="agent-foot">
        Only reads. Asks before installing anything. <a href={CLI_DOCS}>How it works</a>
      </p>
    </div>
  );
}
