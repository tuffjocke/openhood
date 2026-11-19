"use client";

import { useEffect, useRef, useState } from "react";
import { genericProfile, makes, matches, models, years } from "@/core/catalog";
import type { VehicleProfile } from "@/core/profile";

export interface Selection {
  profileId: string;
  make?: string;
  model?: string;
  year?: number;
  engine?: string;
  /** False until the person has picked a car themselves (first visit). */
  chosen?: boolean;
}

const OTHER = "__other";
const ADD_CAR_URL = "https://github.com/tuffjocke/openhood/blob/main/docs/adding-a-vehicle.md";

export function selectionLabel(sel: Selection, profile: VehicleProfile) {
  if (sel.make && sel.model && sel.year) return { title: `${sel.make} ${sel.model} ${sel.year}`, detail: sel.engine };
  return { title: profile.generic ? "Any car" : profile.name, detail: profile.generic ? "standard codes" : undefined };
}

/** Make → model → year (→ engine if several profiles fit) picker. */
export function VehiclePicker({
  profiles,
  selection,
  profile,
  disabled,
  onSelect,
  openRequest = 0,
}: {
  profiles: VehicleProfile[];
  selection: Selection;
  profile: VehicleProfile;
  disabled: boolean;
  onSelect: (s: Selection) => void;
  /** Increment to open the picker from elsewhere (the first-run guide). */
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  const [make, setMake] = useState(selection.make ?? "");
  const [model, setModel] = useState(selection.model ?? "");
  const [year, setYear] = useState(selection.year ? String(selection.year) : "");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openRequest > 0 && !disabled) {
      openPanel();
      root.current?.scrollIntoView({ block: "nearest" });
    }
  }, [openRequest]);

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPanel() {
    setMake(selection.make ?? (selection.profileId === genericProfile(profiles)?.id ? OTHER : ""));
    setModel(selection.model ?? "");
    setYear(selection.year ? String(selection.year) : "");
    setOpen(true);
  }

  function choose(s: Selection) {
    onSelect({ ...s, chosen: true });
    setOpen(false);
  }

  const modelList = make && make !== OTHER ? models(profiles, make) : [];
  const yearList = make && model ? years(profiles, make, model) : [];
  const found = make && model && year ? matches(profiles, make, model, Number(year)) : [];
  const generic = genericProfile(profiles);

  // A single match picks itself.
  useEffect(() => {
    if (!open || found.length !== 1) return;
    const m = found[0];
    if (m.profile.id === selection.profileId && Number(year) === selection.year && model === selection.model) return;
    choose({ profileId: m.profile.id, make, model, year: Number(year), engine: m.engine });
  }, [open, found.length, make, model, year]);

  const label = selectionLabel(selection, profile);

  return (
    <div className="vp" ref={root}>
      <button
        className={`vp-button${selection.chosen ? "" : " vp-unset"}`}
        onClick={() => (open ? setOpen(false) : openPanel())}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="vp-text">
          <span className="vp-label">{selection.chosen ? "Your car" : "Start here"}</span>
          <span className="vp-title">
            {selection.chosen ? label.title : "Choose your car"}
            {selection.chosen && label.detail && <span className="vp-detail">{label.detail}</span>}
          </span>
        </span>
        {!disabled && <span className="vp-chevron" aria-hidden />}
      </button>

      {open && (
        <div className="vp-panel" role="dialog" aria-label="Choose your car">
          <div className="vp-fields">
            <label>
              <span>Make</span>
              <select
                value={make}
                onChange={(e) => {
                  setMake(e.target.value);
                  setModel("");
                  setYear("");
                }}
                autoFocus
              >
                <option value="" disabled>
                  Choose
                </option>
                {makes(profiles).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
                {generic && <option value={OTHER}>My car isn’t listed</option>}
              </select>
            </label>

            {make !== OTHER && (
              <>
                <label>
                  <span>Model</span>
                  <select
                    value={model}
                    disabled={!make}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setYear("");
                    }}
                  >
                    <option value="" disabled>
                      {make ? "Choose" : ""}
                    </option>
                    {modelList.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select value={year} disabled={!model} onChange={(e) => setYear(e.target.value)}>
                    <option value="" disabled>
                      {model ? "Choose" : ""}
                    </option>
                    {yearList.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          {found.length > 1 && (
            <div className="vp-engines">
              <span>Which engine?</span>
              {found.map((m) => (
                <button
                  key={m.profile.id + m.engine}
                  className="quiet"
                  onClick={() => choose({ profileId: m.profile.id, make, model, year: Number(year), engine: m.engine })}
                >
                  {m.engine}
                </button>
              ))}
            </div>
          )}

          {make === OTHER && generic && (
            <div className="vp-other">
              <p>
                No problem. Openhood can still read the standard fault codes most cars share: in Europe petrol cars from
                about 2001 and diesels from about 2004, in the US from 1996.
              </p>
              <button onClick={() => choose({ profileId: generic.id })}>Use standard codes</button>
            </div>
          )}

          <p className="vp-foot">
            Car missing? <a href={ADD_CAR_URL}>Add it</a>, no coding needed.
          </p>
        </div>
      )}
    </div>
  );
}
