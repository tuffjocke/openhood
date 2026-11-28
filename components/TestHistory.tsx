"use client";

import type { Finding } from "@/core/checks";
import { worstOf, type TestRun } from "@/core/test-history";
import { useT } from "./useLang";

export const runDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Earlier runs of Openhood's test on this car (core/test-history.ts), folded away: one line per run
 * with a dot per check, opened for what each check found. Saved on this computer only, which it says.
 * The live view gets the runs from the CLI's file; the website from an imported one, and can delete them.
 */
export function TestHistory({
  runs,
  saving,
  deleteHint,
  onExport,
  onDelete,
}: {
  runs: TestRun[];
  /** Off: the CLI was started with --no-history. */
  saving: boolean;
  /** How to delete them where the page can't: the CLI command. */
  deleteHint?: string;
  onExport?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  return (
    <details className="test-history">
      <summary>
        {t("Earlier tests")} · <strong>{runs.length}</strong>
      </summary>
      <p className="small">{t(saving ? "Saved on this computer only." : "Not saving new tests: started with --no-history.")}</p>
      <ul className="test-runs">
        {runs.map((r) => (
          <li key={r.id}>
            <details>
              <summary>
                <span>
                  {runDate(r.date)}
                  {r.car && ` · ${r.car}`}
                </span>
                <ol className="test-steps" aria-hidden>
                  {r.checks.map((c) => (
                    <li key={c.id} className={`step-${worstOf(c.findings)}`} />
                  ))}
                </ol>
              </summary>
              {r.checks.map((c) => (
                <div key={c.id} className="test-run-check">
                  <p className="test-run-title">{t(c.title)}</p>
                  <Findings findings={c.findings} />
                </div>
              ))}
            </details>
          </li>
        ))}
      </ul>
      {(onExport || onDelete || deleteHint) && (
        <p className="history-actions">
          {onExport && (
            <button className="link-button" onClick={onExport}>
              {t("Export")}
            </button>
          )}
          {onDelete && (
            <button className="link-button" onClick={onDelete}>
              {t("Delete all")}
            </button>
          )}
          {deleteHint && <span>{deleteHint}</span>}
        </p>
      )}
    </details>
  );
}

/** What a check found, one dot per finding in the fault cards' colours. */
export function Findings({ findings }: { findings: Finding[] }) {
  return (
    <ul className="check-findings">
      {findings.map((f) => (
        <li key={f.text} className={`verdict-${f.verdict}`}>
          {f.text}
        </li>
      ))}
    </ul>
  );
}
