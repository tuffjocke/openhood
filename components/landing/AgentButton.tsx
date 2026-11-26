"use client";

import { useEffect, useRef, useState } from "react";
import { explainProblemPrompt, readCarPrompt, type ReadProblem } from "@/core/add-car";
import { useT } from "../useLang";

const CLI_DOCS = "https://github.com/tuffjocke/openhood/blob/main/docs/cli.md";
const APP_KEY = "openhood.aiApp";
const DEMO_KEY = "openhood.demoFailed";
const DEMO_EVENT = "openhood:demo";

/**
 * The demo car (the simulator) failed in this browser, or started fine again (null). Kept for this
 * tab, so a later ask for the AI says so: then it's the browser or Openhood, not the car.
 */
export function noteDemo(failed: string | null) {
  try {
    if (failed) sessionStorage.setItem(DEMO_KEY, failed);
    else if (sessionStorage.getItem(DEMO_KEY) === null) return;
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {}
  window.dispatchEvent(new Event(DEMO_EVENT));
}

function demoFailure(): string | undefined {
  try {
    return sessionStorage.getItem(DEMO_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Desktop AI apps that run commands on this computer and open a new session with the message
 * typed in, waiting for Enter. Claude opens a Claude Code session (a chat can't run commands).
 * https://support.claude.com/en/articles/14729294, https://developers.openai.com/codex/app/commands,
 * https://cursor.com/docs/integrations/deeplinks
 */
const APPS = {
  claude: { name: "Claude", link: (q: string) => `claude://code/new?q=${encodeURIComponent(q)}`, get: "https://claude.com/download" },
  codex: { name: "Codex", link: (q: string) => `codex://threads/new?prompt=${encodeURIComponent(q)}`, get: "https://openai.com/codex" },
  cursor: { name: "Cursor", link: (q: string) => `cursor://anysphere.cursor-deeplink/prompt?text=${encodeURIComponent(q)}`, get: "https://cursor.com/download" },
};
type App = keyof typeof APPS;
const isApp = (v: string | null): v is App => !!v && v in APPS;

/**
 * Hand the car to the person's own AI. On a computer: pick the app once (remembered), and it
 * opens with the ready-made message typed in, or copy it for any other agent. The message is
 * copied as well, for when no app opens. On a phone, a problem goes to the share sheet, so any AI
 * app there can explain the traffic; with no problem there's nothing a phone AI can do, so the
 * message is copied for a computer.
 * With `problem`, the message asks the agent to find out why the website couldn't read the car.
 */
export function AgentButton({
  car,
  untried,
  problem,
  primary = true,
  onBefore,
}: {
  car: string;
  untried?: boolean;
  problem?: ReadProblem;
  primary?: boolean;
  /** Runs first: let go of the adapter, so the agent can open it. */
  onBefore?: () => void;
}) {
  const t = useT();
  const [demoFailed, setDemoFailed] = useState<string>();
  const text = readCarPrompt(car, untried, problem, demoFailed);
  const [desktop, setDesktop] = useState(true);
  const [app, setApp] = useState<App | null>(null);
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<"idle" | "tried" | "opened" | "copied" | "manual">("idle");
  const watching = useRef<() => void>(undefined);

  useEffect(() => {
    setDesktop(!/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent));
    const demo = () => setDemoFailed(demoFailure());
    demo();
    window.addEventListener(DEMO_EVENT, demo);
    try {
      const saved = localStorage.getItem(APP_KEY);
      if (isApp(saved)) setApp(saved);
    } catch {}
    return () => {
      window.removeEventListener(DEMO_EVENT, demo);
      watching.current?.();
    };
  }, []);

  async function copy(what = text) {
    try {
      await navigator.clipboard.writeText(what);
      setState("copied");
    } catch {
      setState("manual"); // clipboard blocked: show the message so it can be selected by hand
    }
  }

  /** The link does the opening. The page losing focus soon after means the app came up. */
  function open(which: App) {
    onBefore?.();
    void navigator.clipboard?.writeText(text).catch(() => {});
    setApp(which);
    setPicking(false);
    setState("tried");
    try {
      localStorage.setItem(APP_KEY, which);
    } catch {}
    watching.current?.();
    const opened = () => setState("opened");
    window.addEventListener("blur", opened, { once: true });
    const stop = setTimeout(() => window.removeEventListener("blur", opened), 20_000);
    watching.current = () => {
      clearTimeout(stop);
      window.removeEventListener("blur", opened);
    };
  }

  const main = primary ? "primary big" : "ghost big";

  if (!desktop) {
    // Any AI app on the phone, from the share sheet: it explains what went wrong.
    const explain = problem && explainProblemPrompt(car, problem, demoFailed);
    async function share() {
      onBefore?.();
      if (explain && navigator.share) {
        try {
          return await navigator.share({ text: explain });
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      await copy(explain || text);
    }
    return (
      <>
        <button className={main} onClick={share}>
          {t(problem ? "Ask your AI" : state === "copied" ? "Copied" : "Copy the message for your AI")}
        </button>
        {state !== "idle" && (
          <p className="actions-hint" aria-live="polite">
            {t(problem ? "Copied. Paste it into your AI app." : "Paste it into an AI app on a computer, with the adapter plugged into it.")}
          </p>
        )}
        {state === "manual" && <pre className="prompt-fallback">{explain || text}</pre>}
      </>
    );
  }

  const name = app ? APPS[app].name : "";
  const other = (
    <button className="link-button" onClick={() => (setPicking(true), setState("idle"))}>
      {t("pick another")}
    </button>
  );

  return (
    <>
      {picking || !app ? (
        picking ? (
          <span className="ai-apps">
            {(Object.keys(APPS) as App[]).map((id) => (
              <a key={id} className="button ghost big" href={APPS[id].link(text)} onClick={() => open(id)}>
                {APPS[id].name}
              </a>
            ))}
            <button className="ghost big" onClick={() => (onBefore?.(), void copy())}>
              {t("Another AI")}
            </button>
          </span>
        ) : (
          <button className={main} onClick={() => setPicking(true)}>
            {t(problem ? "Ask your AI to fix it" : "Ask your AI to read it")}
          </button>
        )
      ) : (
        <a className={`button ${main}`} href={APPS[app].link(text)} onClick={() => open(app)}>
          {t(problem ? "Ask {app} to fix it" : "Ask {app} to read it", { app: name })}
        </a>
      )}
      <p className="actions-hint" aria-live="polite">
        {state === "copied" ? (
          t("Copied. Paste it into an AI app on this computer that can run commands.")
        ) : state === "opened" ? (
          <>
            {t("Press Enter in {app} to start.", { app: name })} <a href={CLI_DOCS}>{t("How it works")}</a>
          </>
        ) : state === "tried" && app ? (
          <>
            {t("Nothing opened?")} <a href={APPS[app].get}>{t("Get {app}", { app: name })}</a> {t("or")} {other}.{" "}
            {t("The message is copied too.")}
          </>
        ) : picking ? (
          t("Which AI app do you use on this computer? It opens with the message typed in.")
        ) : !app ? null : (
          <>
            {t("Not {app}?", { app: name })} {other}
          </>
        )}
      </p>
      {state === "manual" && <pre className="prompt-fallback">{text}</pre>}
    </>
  );
}
