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
      <p className="agent-lede">
        Let an AI agent do it for you. It sets Openhood up, reads your car and explains what it finds. No coding, no
        terminal: you copy one message into a new chat.
      </p>
      <ol className="agent-steps">
        <li>
          <div>
            <h3>Open the Claude or Codex desktop app</h3>
            <p>
              On the computer you&rsquo;ll plug into the car, and start a new coding task. Get it from{" "}
              <a href="https://claude.com/download">Claude</a> or <a href="https://openai.com/codex">Codex</a>. The
              versions in a web browser can&rsquo;t reach the adapter, so use the app.
            </p>
          </div>
        </li>
        <li>
          <div>
            <h3>Plug in and turn the key</h3>
            <p>
              Adapter in the car and in your computer, ignition on. <a href="#socket">Where is the socket?</a>
            </p>
          </div>
        </li>
        <li>
          <div>
            <h3>Copy this into a new chat to start analysing your car</h3>
            <p>
              {car ? "Your car is already in it. " : "Pick your car in the other tab first and it\u2019s filled in, or tell the agent when it asks. "}
              Afterwards the agent offers to add your car to Openhood&rsquo;s shared list of what works, so the next person
              with the same car knows.
            </p>
            <Copyable text={readCarPrompt(car)} label="Message for your AI agent" collapsed />
          </div>
        </li>
      </ol>
      <p className="agent-foot">
        The agent asks before installing anything, and Openhood only reads: clearing codes needs your yes. Use it at
        your own risk, with the car parked. Comfortable
        with a terminal? Start Claude Code in a clone of the repo and it gets the openhood tools directly.{" "}
        <a href={CLI_DOCS}>How it works</a>
      </p>
    </div>
  );
}
