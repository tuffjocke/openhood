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
export function AdapterAdvice({ profile, year }: { profile: VehicleProfile; year: number }) {
  const adapters = profile.adapters ?? ["kkl"];
  if (adapters[0] === "kkl")
    return (
      <p className="advice">
        <strong>You need a KKL cable.</strong> A USB cable sold as KKL 409.1 with an FTDI chip, about €20.
        {!adapters.includes("elm327") && " Bluetooth ELM327 readers can\u2019t read this car\u2019s own codes."}{" "}
        <Link href="/adapters">Which one to buy</Link>
      </p>
    );
  return (
    <p className="advice">
      <strong>You need an ELM327-type adapter,</strong> USB or Bluetooth, about €20 to €40.
      {adapters.includes("kkl") && year < 2008 && " Already have a KKL cable? It works on this car too."}{" "}
      <Link href="/adapters">Which one to buy</Link>
    </p>
  );
}

/** The three things to do once the car is known. Shown where the read button is. */
export function ReadSteps() {
  return (
    <ol className="read-steps">
      <li>
        <span>
          Plug it into the socket under the dashboard. <a href="#socket">Where is it?</a>
        </span>
      </li>
      <li>
        <span>Turn the ignition on. The engine can stay off.</span>
      </li>
      <li>
        <span>Press the button below and choose your adapter in the list that pops up.</span>
      </li>
    </ol>
  );
}

function CopyPrompt({ car }: { car: CarDetails }) {
  const [copied, setCopied] = useState(false);
  const text = addCarPrompt(car);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // No clipboard access: open the message so it can be selected by hand.
      const d = document.getElementById("prompt-text") as HTMLDetailsElement | null;
      if (d) d.open = true;
    }
  }

  return (
    <>
      <div className="copy-row">
        <button className="quiet" onClick={copy}>
          {copied ? "Copied" : "Copy message"}
        </button>
        <span className="copy-hint" aria-live="polite">
          {copied ? "Now paste it into your AI chat." : "Then paste it into ChatGPT, Claude or another AI."}
        </span>
      </div>
      <details className="prompt" id="prompt-text">
        <summary>Read the message first</summary>
        <pre>{text}</pre>
      </details>
    </>
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
}: {
  profiles: VehicleProfile[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  /** The read buttons, given the profile that will be used. */
  actions: (profile: VehicleProfile, supported: boolean) => ReactNode;
  autoFocus?: boolean;
  /** Just the car and the verdict, no steps or ways to add it (the header picker). */
  brief?: boolean;
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

  return (
    <div className="chooser">
      <div className="car-fields">
        <label>
          <span>Make</span>
          {makeTyped ? (
            <input
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Type the make"
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
                Choose
              </option>
              {makeList.map((m) => (
                <option key={m}>{m}</option>
              ))}
              <option value={OTHER}>Another make</option>
            </select>
          )}
        </label>
        <label>
          <span>Model</span>
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
                Choose
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
              placeholder={make ? "Type the model" : ""}
              autoFocus={typeModel}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
            />
          )}
        </label>
        <label>
          <span>Year</span>
          <select value={year} disabled={!make.trim()} onChange={(e) => setYear(e.target.value)}>
            <option value="" disabled>
              Choose
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

      {car && supported && (
        <div className="car-result" aria-live="polite">
          <p className="verdict">
            <i className="tick" aria-hidden />
            Yes, Openhood knows the {carName(car)}.
          </p>
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
          {others && <p className="car-others">{others}</p>}
          <p className="car-sub">
            {found.length === 1 && `${found[0].engine}. `}
            {profile?.status === "experimental" &&
              "It\u2019s new and not tested on a real car yet. Read yours and tell us how it went: that\u2019s how it gets better."}
          </p>
          {(found.length === 1 || engineChosen) && profile && (
            <>
              <AdapterAdvice profile={profile} year={car.year} />
              {!brief && <ReadSteps />}
              {actions(profile, true)}
            </>
          )}
        </div>
      )}

      {car && !supported && (
        <div className="car-result" aria-live="polite">
          <p className="verdict">{car.year >= 2004 ? "Very likely" : car.year >= 2001 ? "Probably" : "Maybe"}, with the standard codes.</p>
          {others && <p className="car-others">{others}</p>}
          <p className="car-sub">Openhood doesn&rsquo;t know the {carName(car)} in detail yet, but you can read it today.</p>

          {brief ? (
            <>
              {generic && <AdapterAdvice profile={generic} year={car.year} />}
              {generic && actions(generic, false)}
            </>
          ) : (
            <div className="paths">
              <section className="path">
                <h3>Read the standard codes</h3>
                <p>
                  Cars share a set of standard fault codes: in Europe petrol cars from about 2001 and diesels from about
                  2004, in the US from 1996. Often that&rsquo;s enough to see why the light is on.
                </p>
                {car.year < 2001 && (
                  <p className="path-note">Your car may be a bit early for this. Trying can&rsquo;t hurt anything.</p>
                )}
                {generic && <AdapterAdvice profile={generic} year={car.year} />}
                <ReadSteps />
                {generic && actions(generic, false)}
              </section>

              <details className="path more">
                <summary>
                  <span>Want more than the standard codes?</span> Help teach Openhood this car
                </summary>
                <p>
                  With its own profile, Openhood can read the maker&rsquo;s own codes and live values for the{" "}
                  {carName(car)}. No coding needed: copy this message into an AI chat. It already says which car you
                  have, and the AI walks you through the rest, one small step at a time.
                </p>
                <CopyPrompt car={car} />
                <p className="path-foot">
                  Expect an evening, with your laptop in the car for the last step. Rather not?{" "}
                  <a href={requestCarUrl(car)}>Just tell us about your car</a> (needs a free GitHub account), or{" "}
                  <a href={GUIDE_URL}>read the guide</a>.
                </p>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
