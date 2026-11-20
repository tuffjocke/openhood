"use client";

import { useState } from "react";

const REPO = "https://github.com/tuffjocke/openhood";
const CLI_DOCS = `${REPO}/blob/main/docs/cli.md`;
const SETUP = "git clone https://github.com/tuffjocke/openhood\ncd openhood\nnpm install";

/** A block of text with a copy button. Falls back to selecting the text if the clipboard is blocked. */
function Copyable({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy(e: React.MouseEvent<HTMLButtonElement>) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      const pre = e.currentTarget.parentElement?.querySelector("pre");
      if (pre) window.getSelection()?.selectAllChildren(pre);
    }
  }
  return (
    <div className="copyable">
      <pre aria-label={label}>{text}</pre>
      <button className="quiet" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * The second way in: let a coding agent (Claude Code, Codex, Cursor) read the car through
 * Openhood's MCP server, from a clone of the repo on the person's own computer.
 */
export function AgentTrack({ car }: { car: string }) {
  const ask = `Use the openhood tools to read the fault codes on my car and explain them in plain words: what's wrong, how urgent it is and what to check first. ${
    car ? `My car is a ${car}.` : "Ask me which car it is."
  } Read only, don't clear anything without asking me.`;

  return (
    <div className="agent">
      <p className="agent-lede">
        Already use Claude Code, Codex or Cursor? Let it read your car and explain what it finds. It can also add your
        car to Openhood while it&rsquo;s at it.
      </p>
      <ol className="agent-steps">
        <li>
          <div>
            <h3>Get Openhood on your computer</h3>
            <p>
              In a terminal. You need <a href="https://nodejs.org">Node.js</a> and Git.
            </p>
            <Copyable text={SETUP} label="Setup commands" />
          </div>
        </li>
        <li>
          <div>
            <h3>Plug in and turn the key</h3>
            <p>
              Adapter or cable in the socket and in your computer, ignition on. <a href="#socket">Where is the socket?</a>
            </p>
          </div>
        </li>
        <li>
          <div>
            <h3>Start your agent in that folder</h3>
            <p>
              Type <code>claude</code> in the openhood folder and allow the &ldquo;openhood&rdquo; tools when asked. Codex,
              Cursor and others: <a href={CLI_DOCS}>add it in one line</a>.
            </p>
          </div>
        </li>
        <li>
          <div>
            <h3>Ask it</h3>
            <Copyable text={ask} label="Message for your agent" />
          </div>
        </li>
      </ol>
      <p className="agent-foot">
        The tools only read. Clearing codes needs your yes, and nothing that writes to the car is allowed.{" "}
        <a href={CLI_DOCS}>How it works</a>
      </p>
    </div>
  );
}
