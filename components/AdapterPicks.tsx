"use client";

import { useEffect, useState } from "react";
import { ADAPTER_PICKS, amazonSearch, type AdapterPick } from "@/core/adapters";
import { CAR_REPORTS } from "@/profiles/car-reports";

/** How many working reads people have reported with this adapter. */
const readsWith = (p: AdapterPick) =>
  CAR_REPORTS.filter((r) => r.result === "worked" && r.adapterModel?.toLowerCase() === p.name.toLowerCase()).length;

/** The adapters we name, each with a shop search and an honest "tested or not". */
export function AdapterPicks() {
  // The shop depends on where the person is; decided in the browser, after the static page loads.
  const [locale, setLocale] = useState("en-US");
  useEffect(() => setLocale(navigator.language), []);

  const group = (kind: AdapterPick["kind"]) => (
    <ul className="picks">
      {ADAPTER_PICKS.filter((p) => p.kind === kind).map((p) => {
        const n = readsWith(p);
        return (
          <li key={p.name}>
            <div>
              <strong>{p.name}</strong> <span className="pick-how">{p.connects}</span>
              <p>
                {p.why} {n ? `Read ${n} ${n === 1 ? "car" : "cars"} with Openhood.` : "Not tested with Openhood yet."}
              </p>
            </div>
            <a href={amazonSearch(p, locale)} target="_blank" rel="noreferrer">
              Search on Amazon
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <h2 id="picks">For most cars: an ELM327 adapter</h2>
      {group("elm327")}
      <h2>For cars with their own profile: a KKL cable</h2>
      {group("kkl")}
    </>
  );
}
