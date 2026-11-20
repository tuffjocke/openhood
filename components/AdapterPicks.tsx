"use client";

import { useEffect, useState } from "react";
import { ADAPTER_PICKS, amazonLink, type AdapterPick } from "@/core/adapters";
import { CAR_REPORTS } from "@/profiles/car-reports";

/** How many working reads people have reported with this adapter. */
const readsWith = (p: AdapterPick) =>
  CAR_REPORTS.filter((r) => r.result === "worked" && r.adapterModel?.toLowerCase() === p.name.toLowerCase()).length;

/**
 * The adapters we name for one kind, each with a shop search. `compact` is for the buying step on
 * the start page: one line each, no testing status unless there's good news.
 */
export function PickList({ kind, limit, compact }: { kind: AdapterPick["kind"]; limit?: number; compact?: boolean }) {
  // The shop depends on where the person is; decided in the browser, after the static page loads.
  const [locale, setLocale] = useState("en-US");
  useEffect(() => setLocale(navigator.language), []);

  return (
    <ul className={compact ? "picks compact" : "picks"}>
      {ADAPTER_PICKS.filter((p) => p.kind === kind)
        .slice(0, limit)
        .map((p) => {
          const n = readsWith(p);
          const link = amazonLink(p, locale);
          const tested = n ? `Read ${n} ${n === 1 ? "car" : "cars"} with Openhood.` : compact ? "" : "Not tested with Openhood yet.";
          return (
            <li key={p.name}>
              <div>
                <strong>{p.name}</strong> <span className="pick-how">{p.connects}</span>
                <p>
                  {p.why} {tested}
                </p>
              </div>
              <a className={compact ? "button" : undefined} href={link.url} target="_blank" rel="noreferrer">
                {link.product ? "Buy on Amazon" : "Find on Amazon"}
              </a>
            </li>
          );
        })}
    </ul>
  );
}

/** Both kinds, for the adapters page. */
export function AdapterPicks() {
  return (
    <>
      <h2 id="picks">For most cars: an ELM327 adapter</h2>
      <PickList kind="elm327" />
      <h2>For cars with their own profile: a KKL cable</h2>
      <PickList kind="kkl" />
    </>
  );
}
