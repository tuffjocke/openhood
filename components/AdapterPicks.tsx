"use client";

import { useEffect, useState } from "react";
import { ADAPTER_PICKS, amazonLink, type AdapterPick } from "@/core/adapters";
import { CAR_REPORTS } from "@/profiles/car-reports";

/** How many working reads people have reported with this adapter. */
const readsWith = (p: AdapterPick) =>
  CAR_REPORTS.filter((r) => r.result === "worked" && r.adapterModel?.toLowerCase() === p.name.toLowerCase()).length;

/** The shop depends on where the person is; decided in the browser, after the static page loads. */
function useLocale() {
  const [locale, setLocale] = useState("en-US");
  useEffect(() => setLocale(navigator.language), []);
  return locale;
}

/** The one adapter we suggest for a kind, with where to buy it. For the buying step on the start page. */
export function useFirstPick(kind: AdapterPick["kind"]) {
  const locale = useLocale();
  const pick = ADAPTER_PICKS.find((p) => p.kind === kind);
  return pick ? { pick, link: amazonLink(pick, locale) } : null;
}

/** The adapters we name for one kind, each with a shop link. */
export function PickList({ kind }: { kind: AdapterPick["kind"] }) {
  const locale = useLocale();
  return (
    <ul className="picks">
      {ADAPTER_PICKS.filter((p) => p.kind === kind).map((p) => {
        const n = readsWith(p);
        const link = amazonLink(p, locale);
        return (
          <li key={p.name}>
            <div>
              <strong>{p.name}</strong> <span className="pick-how">{p.connects}</span>
              <p>
                {p.why} {n ? `Read ${n} ${n === 1 ? "car" : "cars"} with Openhood.` : "Not tested with Openhood yet."}
              </p>
            </div>
            <a href={link.url} target="_blank" rel="noreferrer">
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
