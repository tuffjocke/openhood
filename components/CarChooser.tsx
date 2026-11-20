"use client";

import { useEffect, useState, type ReactNode } from "react";
import { addCarPrompt, carName, requestCarUrl, type CarDetails } from "@/core/add-car";
import Link from "next/link";
import { allMakes, allModels, genericProfile, matches, tidyName } from "@/core/catalog";
import type { VehicleProfile } from "@/core/profile";
import { reportsFor, summarise } from "@/profiles/car-reports";
import { VEHICLE_NAMES } from "@/profiles/names";
import type { Selection } from "./VehiclePicker";

const THIS_YEAR = new Date().getFullYear();
// Any year a person might own. Not a claim about what was sold: that's checked against the profiles.
const YEARS = Array.from({ length: THIS_YEAR - 1988 + 1 }, (_, i) => THIS_YEAR - i);
const OTHER = "__other";
const GUIDE_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/adding-a-vehicle.md";

/** What to buy for this car, decided by what its profile can run on. */
/** Which adapter, in a few words. The one link goes to what to buy. */
export function AdapterAdvice({ profile }: { profile: VehicleProfile }) {
  const kkl = (profile.adapters ?? ["kkl"])[0] === "kkl";
  return (
    <>
      Get {kkl ? "a KKL cable" : "an ELM327 adapter"}. <Link href="/adapters">What to buy</Link>
    </>
  );
}

function CopyPrompt({ car }: { car: CarDetails }) {
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);
  const text = addCarPrompt(car);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setShowText(true); // no clipboard access: show the message so it can be selected by hand
    }
  }

  return (
    <>
      <div className="copy-row">
        <button className="quiet" onClick={copy}>
          {copied ? "Copied" : "Copy message"}
        </button>
        <span className="copy-hint" aria-live="polite">
          {copied ? "Now paste it into an AI chat." : ""}
        </span>
      </div>
      {/* Only shown if copying failed, so the message can be selected by hand. */}
      {showText && <pre className="prompt-fallback">{text}</pre>}
    </>
  );
}

/**
 * "Help add this car": shown after someone has read a car Openhood only knows by its standard
 * codes. The one moment the request makes sense.
 */
export function HelpAddCar({ car }: { car: CarDetails }) {
  return (
    <details className="more">
      <summary>Want the maker&rsquo;s own codes too? Help add this car</summary>
      <p>No coding. Paste this into an AI chat and it walks you through it. Takes an evening.</p>
      <CopyPrompt car={car} />
      <p className="path-foot">
        Or <a href={requestCarUrl(car)}>just tell us about your car</a> (needs a GitHub account).{" "}
        <a href={GUIDE_URL}>Guide</a>
      </p>
    </details>
  );
}

/**
 * Make, model and year (any car: unknown makes and models are typed in), then what to do next:
 * read the car if Openhood knows it, otherwise read the standard codes, with a folded-away way
 * to help add the car.
 * `actions` renders the buttons for the read path (hero: read and demo; header picker: done).
 */
export function CarChooser({
  profiles,
  selection,
  onSelect,
  actions,
  autoFocus,
  brief,
  notice,
}: {
  profiles: VehicleProfile[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** What comes after the verdict, given the profile that will be used (the next step, or Done). */
  actions: (profile: VehicleProfile, supported: boolean) => ReactNode;
  autoFocus?: boolean;
  /** Just the car and the verdict, no steps or ways to add it (the header picker). */
  brief?: boolean;
  /** Shown between the fields and the answer (the "this browser can't" warning). */
  notice?: ReactNode;
}) {
  const [make, setMake] = useState(selection.make ?? "");
  const [model, setModel] = useState(selection.model ?? "");
  const [year, setYear] = useState(selection.year ? String(selection.year) : "");
  const [typeModel, setTypeModel] = useState(false);
  const [typeMake, setTypeMake] = useState(false);

  const makeList = allMakes(profiles, VEHICLE_NAMES);
  // A typed make or model that matches a known one gets its official spelling; otherwise it's tidied.
  const makeName = makeList.find((m) => m.toLowerCase() === make.trim().toLowerCase()) ?? tidyName(make);
  const makeTyped = typeMake || (!!make && !makeList.includes(make));
  const modelList = makeName ? allModels(profiles, VEHICLE_NAMES, makeName) : [];
  const typed = model.trim();
  const canonical = modelList.find((m) => m.toLowerCase() === typed.toLowerCase()) ?? tidyName(typed);
  // Follow the saved car once it has loaded. Not while the person is typing the same car:
  // that would eat spaces and change capitals under their cursor.
  useEffect(() => {
    if (!selection.make || !selection.model || !selection.year) return;
    if (selection.make === makeName && selection.model === canonical && String(selection.year) === year) return;
    setMake(selection.make);
    setModel(selection.model);
    setYear(String(selection.year));
  }, [selection.make, selection.model, selection.year]);

  const complete = !!makeName && !!typed && !!year;
  const car: CarDetails | null = complete ? { make: makeName, model: canonical, year: Number(year) } : null;
  const found = car ? matches(profiles, car.make, car.model, car.year) : [];
  const generic = genericProfile(profiles);
  const engineChosen = found.find((m) => m.engine === selection.engine && m.profile.id === selection.profileId);

  // Tell the dashboard as soon as the car is complete. Several engines wait for a choice.
  useEffect(() => {
    if (!car) return;
    const same = selection.make === car.make && selection.model === car.model && selection.year === car.year;
    if (found.length === 1) {
      if (same && selection.profileId === found[0].profile.id) return;
      onSelect({ ...car, profileId: found[0].profile.id, engine: found[0].engine, chosen: true });
    } else if (found.length === 0 && generic) {
      if (same && selection.profileId === generic.id) return;
      onSelect({ ...car, profileId: generic.id, chosen: true });
    }
  }, [car?.make, car?.model, car?.year, found.length]);

  const supported = found.length > 0;
  // What others with this car found, from profiles/car-reports.json.
  const others = car ? summarise(reportsFor(car.make, car.model, car.year)) : null;
  const profile = engineChosen?.profile ?? found[0]?.profile;
  // The profile a read would use: the car's own (once the engine is known), else standard codes.
  const goWith = supported ? (found.length === 1 || engineChosen ? profile : undefined) : generic;
  const sub = !car
    ? ""
    : supported
      ? `${found.length === 1 ? `${found[0].engine}. ` : ""}${profile?.status === "experimental" ? "Not tested on a real car yet." : ""}`
      : car.year < 2001
        ? "It\u2019s an older car, so it may not answer. Trying can\u2019t hurt."
        : "";

  return (
    <div className="chooser">
      <div className="car-fields">
        <label>
          <span className="sr-only">Make</span>
          {makeTyped ? (
            <input
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Make"
              autoFocus={typeMake}
              autoComplete="off"
              spellCheck={false}
              maxLength={30}
            />
          ) : (
            <select
              value={make}
              autoFocus={autoFocus}
              onChange={(e) => {
                const other = e.target.value === OTHER;
                setTypeMake(other);
                setMake(other ? "" : e.target.value);
                setModel("");
                setTypeModel(false);
              }}
            >
              <option value="" disabled>
                Make
              </option>
              {makeList.map((m) => (
                <option key={m}>{m}</option>
              ))}
              <option value={OTHER}>Another make</option>
            </select>
          )}
        </label>
        <label>
          <span className="sr-only">Model</span>
          {modelList.length > 0 && !typeModel ? (
            <select
              value={modelList.includes(model) ? model : ""}
              disabled={!make}
              onChange={(e) => {
                if (e.target.value === OTHER) {
                  setModel("");
                  setTypeModel(true);
                } else setModel(e.target.value);
              }}
            >
              <option value="" disabled>
                Model
              </option>
              {modelList.map((m) => (
                <option key={m}>{m}</option>
              ))}
              <option value={OTHER}>Another model</option>
            </select>
          ) : (
            <input
              value={model}
              disabled={!make.trim()}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model"
              autoFocus={typeModel}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
            />
          )}
        </label>
        <label>
          <span className="sr-only">Year</span>
          <select value={year} disabled={!make.trim()} onChange={(e) => setYear(e.target.value)}>
            <option value="" disabled>
              Year
            </option>
            {YEARS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      {makeTyped && (
        <p className="field-hint">
          <button
            className="link-button"
            onClick={() => {
              setTypeMake(false);
              setMake("");
              setModel("");
            }}
          >
            Back to the list of makes
          </button>
        </p>
      )}

      {notice}

      {car && (
        <div className="car-result">
          <div className="result-head">
            <div className="result-title" aria-live="polite">
              {car && (
                <p className="verdict">
                  {supported
                    ? "Yes, someone has already added this car to Openhood."
                    : `Nobody has added this car yet, but Openhood ${
                        car.year >= 2004 ? "can very likely" : car.year >= 2001 ? "can probably" : "may"
                      } still read its faults.`}
                  {supported && <i className="tick" role="img" aria-label="Added" />}
                </p>
              )}
              {car && (sub || others) && (
                <p className="car-sub">
                  {sub} {others}
                </p>
              )}
            </div>
          </div>

          {
            <>
                {found.length > 1 && (
                  <div className="engines">
                    <span>Which engine?</span>
                    {found.map((m) => (
                      <button
                        key={m.profile.id + m.engine}
                        className={engineChosen === m ? "" : "quiet"}
                        aria-pressed={engineChosen === m}
                        onClick={() => onSelect({ ...car, profileId: m.profile.id, engine: m.engine, chosen: true })}
                      >
                        {m.engine}
                      </button>
                    ))}
                  </div>
                )}
                {goWith &&
                  (brief ? (
                    <div className="result-go">
                      <p className="advice">
                        <AdapterAdvice profile={goWith} />
                      </p>
                      {actions(goWith, supported)}
                    </div>
                  ) : (
                    actions(goWith, supported)
                  ))}
              </>
          }
        </div>
      )}
    </div>
  );
}
